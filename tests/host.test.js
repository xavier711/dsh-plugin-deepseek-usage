/**
 * Host-half regression tests — no framework, run with `node tests/host.test.js`.
 *
 * Everything is asserted through the real route handlers with a mock context,
 * so a failure here means the shipped bundle would compute a wrong period or a
 * wrong cost. Covered:
 *
 *   1. pricing-era boundaries (2026-08-17 peak/off-peak start, 2026-08-23
 *      weekend rule, 2026-09-10 12:00 flash price cut), each ±1 minute;
 *   2. V4 Pro keeps its own peak/off-peak rates after the cancelled
 *      2026-09-14 retirement — it must NOT be billed at flash rates;
 *   3. statutory holidays and 调休上班的周末 billed at the off-peak rate all
 *      day, per the 2026-09-19 official note and the 2026 State Council
 *      holiday schedule, plus the configurable `holidayRanges` override;
 *   4. the `/dsh-usage/period` payload (period, range, nextAt, nextPeriod,
 *      holiday, offPeakDay);
 *   5. the dual session-persistence seam (`open()` vs `inspect()`), error
 *      rows, and the list() failure payload.
 *
 * Times are Beijing wall-clock: the helper `bj()` converts to epoch ms, so the
 * assertions read exactly like the official notices.
 */

import assert from "node:assert/strict";
import { apply } from "../lib/index.js";

/* ── harness ─────────────────────────────────────────────────────────────── */

/** Epoch ms of a Beijing wall-clock moment (UTC+8, no DST). */
function bj(year, month, day, hour = 0, minute = 0) {
  return Date.UTC(year, month - 1, day, hour - 8, minute, 0, 0);
}

/** 1M tokens on every axis, so cost === rates.input + rates.cacheHit + rates.output. */
const ONE_MILLION_EACH = { inputTokens: 1_000_000, cacheReadTokens: 1_000_000, outputTokens: 1_000_000 };

/** One `assistant/message` usage record attributed to `model` at `time`. */
function usageEvent(time, model, usage = ONE_MILLION_EACH) {
  return { type: "assistant/message", time, data: { usage, message: { source: { model } } } };
}

/** A persistence snapshot as current hosts list it (`{ header, revision }`). */
function snapshot(id, createdAt, events, cwd = "/tmp/project") {
  return { header: { id, createdAt, cwd }, revision: "r1", events };
}

/** JSON response recorder standing in for the webserver's `res`. */
function makeRes() {
  const res = {
    status: null,
    body: null,
    writeHead(status) { res.status = status; },
    end(text) { res.body = JSON.parse(text); }
  };
  return res;
}

/**
 * Apply the plugin to a mock context and return its registered routes.
 * @param options.persistence - fake `sessionPersistence` (defaults to none).
 * @param options.config - row config overriding DEFAULTS.
 */
function mount({ persistence, config } = {}) {
  const routes = new Map();
  const ctx = {
    credentials: { resolve: async () => undefined },
    sessionPersistence: persistence,
    webServer: {
      register(route) {
        routes.set(route.path, route.handler);
        return () => routes.delete(route.path);
      }
    },
    effect(fn) { const dispose = fn(); return () => dispose?.(); }
  };
  apply(ctx, config ?? {});
  return routes;
}

/** Run a route handler and return its JSON body. */
async function callRoute(routes, path) {
  const handler = routes.get(path);
  assert.ok(handler, `route ${path} should be registered`);
  const res = makeRes();
  await handler({ method: "GET" }, res);
  assert.equal(res.status, 200, `${path} should answer 200`);
  return res.body;
}

/** A persistence fake reading one session through `open(id, "read")`. */
function openPersistence(events, header = {}) {
  const id = header.id ?? "session-1";
  const createdAt = header.createdAt ?? events[0]?.time ?? bj(2026, 9, 23, 10);
  return {
    list: async () => [snapshot(id, createdAt, events, header.cwd)],
    open: async () => ({ read: async () => ({ events }), close: async () => {} })
  };
}

/** Cost of one priced call at `time`, through the real `/dsh-usage/local` route. */
async function costAt(time, model, { usage = ONE_MILLION_EACH, config } = {}) {
  const events = [usageEvent(time, model, usage)];
  const routes = mount({ persistence: openPersistence(events), config });
  globalThis.Date.now = () => time;
  try {
    const payload = await callRoute(routes, "/dsh-usage/local");
    assert.equal(payload.ok, true, "local payload should be ok");
    assert.equal(payload.errorSessions, 0, "no session should fail to read");
    assert.equal(payload.buckets.total.calls, 1);
    return payload.buckets.total.cost;
  } finally {
    globalThis.Date.now = realNow;
  }
}

/** The `/dsh-usage/period` payload as of `time`. */
async function periodAt(time, config) {
  const routes = mount({ persistence: openPersistence([]), config });
  globalThis.Date.now = () => time;
  try {
    return await callRoute(routes, "/dsh-usage/period");
  } finally {
    globalThis.Date.now = realNow;
  }
}

const realNow = Date.now;

/* ── expected costs (CNY per 1M on each axis) ────────────────────────────── */
// 2026-08-17 00:00 起峰谷定价，2026-09-10 12:00 起 flash 系列降价；
// V4 Pro 不参与 flash 降价，也不再有改走 flash 计费的 era。
const FLASH = {
  flat: 1 + 0.02 + 2,           // 3.02
  offPeak: 1.5 + 0.05 + 4.5,    // 6.05
  peak: 3 + 0.1 + 9,            // 12.1
  offPeakNew: 1 + 0.02 + 4,     // 5.02
  peakNew: 2 + 0.04 + 8         // 10.04
};
const V4_PRO = {
  flat: 3 + 0.025 + 6,          // 9.025
  offPeak: 4.5 + 0.15 + 13.5,   // 18.15
  peak: 9 + 0.3 + 27            // 36.3
};

/* ── tiny test runner ───────────────────────────────────────────────────── */
let passed = 0;
const failures = [];
async function test(name, fn) {
  try {
    await fn();
    passed += 1;
  } catch (error) {
    failures.push({ name, error });
  }
}
function near(actual, expected, message) {
  assert.ok(
    Math.abs(actual - expected) < 1e-9,
    `${message ?? "cost"}: expected ${expected}, got ${actual}`
  );
}

/* ── 1. era boundaries ───────────────────────────────────────────────────── */

await test("2026-08-17 00:00 前为 flat 价（8/16 23:59 仍是 flat）", async () => {
  near(await costAt(bj(2026, 8, 16, 23, 59), "deepseek-flash"), FLASH.flat);
});

await test("2026-08-17 00:00 起进入峰谷定价（凌晨为空闲）", async () => {
  near(await costAt(bj(2026, 8, 17, 0, 0), "deepseek-flash"), FLASH.offPeak);
});

await test("2026-08-17 09:00（高峰窗口）按高峰价", async () => {
  near(await costAt(bj(2026, 8, 17, 9, 0), "deepseek-flash"), FLASH.peak);
});

await test("2026-08-17 13:00（高峰窗口之外）按空闲价", async () => {
  near(await costAt(bj(2026, 8, 17, 13, 0), "deepseek-flash"), FLASH.offPeak);
});

await test("周末规则生效前，周六仍按 peakHours 区分峰谷（8/22 09:00 = 高峰）", async () => {
  near(await costAt(bj(2026, 8, 22, 9, 0), "deepseek-flash"), FLASH.peak);
});

await test("2026-08-23 00:00 起周末全天空闲（8/23 09:00 = 空闲）", async () => {
  near(await costAt(bj(2026, 8, 23, 9, 0), "deepseek-flash"), FLASH.offPeak);
});

await test("flash 降价前 1 分钟仍用旧高峰价（9/10 11:59）", async () => {
  near(await costAt(bj(2026, 9, 10, 11, 59), "deepseek-flash"), FLASH.peak);
});

await test("flash 降价在 9/10 12:00 生效：该时刻已出高峰窗口，旧空闲价不得再用", async () => {
  // 12:00 恰好是高峰窗口 [9,12) 的终点，因此这一刻既切换 era 又切换时段：
  // 新 era 的空闲价 5.02，而不是无 era 时的 6.05。
  near(await costAt(bj(2026, 9, 10, 12, 0), "deepseek-flash"), FLASH.offPeakNew);
});

await test("flash 降价后空闲时段用新空闲价（9/10 13:00）", async () => {
  near(await costAt(bj(2026, 9, 10, 13, 0), "deepseek-flash"), FLASH.offPeakNew);
});

/* ── 2. V4 Pro 不再走 flash 计费 ─────────────────────────────────────────── */

await test("V4 Pro 在（已取消的）下线时刻之后仍按自身高峰价，不等于 flash", async () => {
  const cost = await costAt(bj(2026, 9, 15, 9, 0), "deepseek-v4-pro");
  near(cost, V4_PRO.peak, "V4 Pro 高峰价");
  assert.notEqual(cost, FLASH.peakNew, "V4 Pro 不得按 flash 高峰价计费");
  assert.notEqual(cost, FLASH.offPeakNew, "V4 Pro 不得按 flash 空闲价计费");
});

await test("V4 Pro 空闲时段按自身空闲价（9/15 13:00）", async () => {
  const cost = await costAt(bj(2026, 9, 15, 13, 0), "deepseek-v4-pro");
  near(cost, V4_PRO.offPeak);
  assert.notEqual(cost, FLASH.offPeakNew);
});

await test("V4 Pro 在 2026-10-01（国庆）全天空闲价", async () => {
  near(await costAt(bj(2026, 10, 1, 10, 0), "deepseek-v4-pro"), V4_PRO.offPeak);
});

/* ── 3. 法定节假日与调休上班的周末 ───────────────────────────────────────── */

await test("中秋节 9/25（周五）10:00 全天空闲，不按高峰（对比 9/24 周五为高峰）", async () => {
  near(await costAt(bj(2026, 9, 25, 10, 0), "deepseek-flash"), FLASH.offPeakNew);
  near(await costAt(bj(2026, 9, 24, 10, 0), "deepseek-flash"), FLASH.peakNew);
});

await test("中秋假期后 9/28（周一）10:00 恢复高峰", async () => {
  near(await costAt(bj(2026, 9, 28, 10, 0), "deepseek-flash"), FLASH.peakNew);
});

await test("国庆 10/1（周四）与 10/7（周三）全天空闲", async () => {
  near(await costAt(bj(2026, 10, 1, 10, 0), "deepseek-flash"), FLASH.offPeakNew);
  near(await costAt(bj(2026, 10, 7, 15, 0), "deepseek-flash"), FLASH.offPeakNew);
});

await test("假期结束 10/8（周四）10:00 恢复高峰", async () => {
  near(await costAt(bj(2026, 10, 8, 10, 0), "deepseek-flash"), FLASH.peakNew);
});

await test("调休上班的周末仍按空闲：9/20（周日）与 10/10（周六）", async () => {
  near(await costAt(bj(2026, 9, 20, 10, 0), "deepseek-flash"), FLASH.offPeakNew);
  near(await costAt(bj(2026, 10, 10, 10, 0), "deepseek-flash"), FLASH.offPeakNew);
});

await test("春节等 8/17 之前的假期本就走 flat 价（2/16 周一 10:00）", async () => {
  near(await costAt(bj(2026, 2, 16, 10, 0), "deepseek-flash"), FLASH.flat);
});

await test("holidayOffPeakAt 生效前，节假日仍按 peakHours 区分（可配置的门槛）", async () => {
  const config = { holidayOffPeakAt: bj(2026, 9, 26) };
  near(await costAt(bj(2026, 9, 25, 10, 0), "deepseek-flash", { config }), FLASH.peakNew);
  near(await costAt(bj(2026, 9, 28, 10, 0), "deepseek-flash", { config }), FLASH.peakNew);
});

await test("holidayRanges 可整体覆盖（自定假期把 9/28 变成空闲日）", async () => {
  const config = { holidayRanges: [{ name: "自定义", start: "2026-09-28", end: "2026-09-28" }] };
  near(await costAt(bj(2026, 9, 28, 10, 0), "deepseek-flash", { config }), FLASH.offPeakNew);
});

await test("holidayRanges 支持省略 end 的单日区间", async () => {
  const config = { holidayRanges: [{ name: "单日", start: "2026-09-28" }] };
  near(await costAt(bj(2026, 9, 28, 10, 0), "deepseek-flash", { config }), FLASH.offPeakNew);
});

/* ── 4. /dsh-usage/period ────────────────────────────────────────────────── */

await test("/period：中秋当天全天空闲，nextAt 跨过假期指向 9/28 09:00 高峰", async () => {
  const body = await periodAt(bj(2026, 9, 25, 0, 0));
  assert.equal(body.period, "offPeak");
  assert.deepEqual(body.range, [0, 1440]);
  assert.equal(body.nextPeriod, "peak");
  assert.equal(body.nextAt, bj(2026, 9, 28, 9, 0));
  assert.equal(body.holiday, "中秋节");
  assert.equal(body.offPeakDay, true);
  assert.equal(body.offPeakReason, "holiday");
  assert.equal(body.holidayOffPeakAt, bj(2026, 9, 19, 0, 0));
});

await test("/period：周末全天低谷时报 offPeakReason=weekend，节假日报 holiday", async () => {
  const weekend = await periodAt(bj(2026, 9, 26, 10, 0)); // 周六（中秋假期内）
  assert.equal(weekend.offPeakDay, true);
  assert.equal(weekend.offPeakReason, "holiday", "落在假期区间内时以节假日为准");

  const plainWeekend = await periodAt(bj(2026, 9, 19, 10, 0)); // 普通周六
  assert.equal(plainWeekend.offPeakDay, true);
  assert.equal(plainWeekend.offPeakReason, "weekend");
  assert.equal(plainWeekend.holiday, null);

  const workday = await periodAt(bj(2026, 9, 23, 10, 0));
  assert.equal(workday.offPeakDay, false);
  assert.equal(workday.offPeakReason, null);
});

await test("/period：未命名的自定义假期仍报 holiday（不误标成周末）", async () => {
  const config = { holidayRanges: [{ start: "2026-09-23", end: "2026-09-23" }] };
  const body = await periodAt(bj(2026, 9, 23, 10, 0), config);
  assert.equal(body.offPeakReason, "holiday");
  assert.equal(body.holiday, null, "没有 name 时 holiday 为 null，由 offPeakReason 兜底");
});

await test("/period：假期前夜 9/24 18:30 已是空闲，下一次变化仍指向 9/28 09:00", async () => {
  const body = await periodAt(bj(2026, 9, 24, 18, 30));
  assert.equal(body.period, "offPeak");
  assert.equal(body.nextAt, bj(2026, 9, 28, 9, 0));
  assert.equal(body.holiday, null);
  assert.equal(body.offPeakDay, false);
});

await test("/period：国庆当天 nextAt 指向 10/8 09:00", async () => {
  const body = await periodAt(bj(2026, 10, 1, 0, 0));
  assert.equal(body.period, "offPeak");
  assert.equal(body.nextAt, bj(2026, 10, 8, 9, 0));
  assert.equal(body.holiday, "国庆节");
});

await test("/period：普通工作日高峰窗口内，nextAt 指向当日 12:00", async () => {
  const body = await periodAt(bj(2026, 9, 23, 10, 0));
  assert.equal(body.period, "peak");
  assert.deepEqual(body.range, [9 * 60, 12 * 60]);
  assert.equal(body.nextPeriod, "offPeak");
  assert.equal(body.nextAt, bj(2026, 9, 23, 12, 0));
  assert.equal(body.offPeakDay, false);
  assert.equal(body.holiday, null);
});

await test("/period：长假期也能报出下一次变化（不因跨度假期的步进上限而丢失）", async () => {
  const config = { holidayRanges: [{ name: "超长假期", start: "2026-11-01", end: "2026-11-20" }] };
  const body = await periodAt(bj(2026, 11, 1, 0, 0), config);
  assert.equal(body.period, "offPeak");
  assert.equal(body.nextPeriod, "peak");
  assert.equal(body.nextAt, bj(2026, 11, 23, 9, 0));
});

/* ── 5. 会话读取的两套 API 与错误路径 ────────────────────────────────────── */

await test("旧版 inspect() 形态与新版 open() 形态聚合结果一致", async () => {
  const events = [usageEvent(bj(2026, 9, 23, 10, 0), "deepseek-flash")];
  const id = "session-legacy";
  const createdAt = events[0].time;
  const routes = mount({
    persistence: {
      list: async () => [{ id, createdAt, cwd: "/tmp/project" }],
      inspect: async () => ({ events })
    }
  });
  globalThis.Date.now = () => events[0].time;
  try {
    const payload = await callRoute(routes, "/dsh-usage/local");
    assert.equal(payload.sessionCount, 1);
    assert.equal(payload.errorSessions, 0);
    near(payload.buckets.total.cost, FLASH.peakNew);
  } finally {
    globalThis.Date.now = realNow;
  }
});

await test("open() 抛错时该会话进入 errorSessions，不影响其它会话", async () => {
  const okEvents = [usageEvent(bj(2026, 9, 23, 10, 0), "deepseek-flash")];
  const routes = mount({
    persistence: {
      list: async () => [
        { header: { id: "broken", createdAt: okEvents[0].time, cwd: "/tmp/a" } },
        { header: { id: "fine", createdAt: okEvents[0].time, cwd: "/tmp/b" } }
      ],
      open: async (id) => {
        if (id === "broken") throw new Error("日志损坏");
        return { read: async () => ({ events: okEvents }), close: async () => {} };
      }
    }
  });
  globalThis.Date.now = () => okEvents[0].time;
  try {
    const payload = await callRoute(routes, "/dsh-usage/local");
    assert.equal(payload.sessionCount, 2);
    assert.equal(payload.errorSessions, 1);
    near(payload.buckets.total.cost, FLASH.peakNew);
  } finally {
    globalThis.Date.now = realNow;
  }
});

await test("list() 抛错时返回 PERSISTENCE_UNAVAILABLE", async () => {
  const routes = mount({ persistence: { list: async () => { throw new Error("no backend"); } } });
  const payload = await callRoute(routes, "/dsh-usage/local");
  assert.equal(payload.ok, false);
  assert.equal(payload.error, "PERSISTENCE_UNAVAILABLE");
});

await test("list() 中混入脏条目不会崩溃（缺 header / null）", async () => {
  const events = [usageEvent(bj(2026, 9, 23, 10, 0), "deepseek-flash")];
  const routes = mount({
    persistence: {
      list: async () => [null, {}, { header: {} }, { header: { id: "ok", createdAt: events[0].time, cwd: "/tmp/p" } }],
      open: async () => ({ read: async () => ({ events }), close: async () => {} })
    }
  });
  globalThis.Date.now = () => events[0].time;
  try {
    const payload = await callRoute(routes, "/dsh-usage/local");
    assert.equal(payload.sessionCount, 1);
    near(payload.buckets.total.cost, FLASH.peakNew);
  } finally {
    globalThis.Date.now = realNow;
  }
});

/* ── report ──────────────────────────────────────────────────────────────── */

if (failures.length > 0) {
  for (const { name, error } of failures) {
    console.error(`✗ ${name}\n    ${error.message.split("\n").join("\n    ")}`);
  }
  console.error(`\n${passed} passed, ${failures.length} failed`);
  process.exit(1);
}
console.log(`✓ all ${passed} host tests passed`);

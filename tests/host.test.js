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
import { readFileSync } from "node:fs";
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
 *
 * The remote holiday calendar is disabled by default so every test stays
 * hermetic; tests that exercise the fetch path opt back in with
 * `holidayCalendarUrl` and a stubbed `fetch`.
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
  apply(ctx, { holidayCalendarUrl: null, ...(config ?? {}) });
  return routes;
}

/** Replace global fetch for one test; returns the recorded call URLs. */
function stubFetch(handler) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    calls.push(String(url));
    return handler(String(url), options);
  };
  calls.restore = () => { globalThis.fetch = original; };
  return calls;
}

/** Minimal `Response` stand-in for the fetch stub. */
function jsonResponse(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
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

/** Call `/dsh-usage/period` as of `time` on an existing mount. */
async function periodWith(routes, time) {
  globalThis.Date.now = () => time;
  try {
    return await callRoute(routes, "/dsh-usage/period");
  } finally {
    globalThis.Date.now = realNow;
  }
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
  return periodWith(routes, time);
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

/* ── 6. 远端节假日日历（holidays.json） ─────────────────────────────────── */

const CALENDAR_URL = "https://example.test/holidays.json";

/** A remote calendar covering 2026 with one non-built-in holiday on 2026-09-29 (周二). */
function remoteCalendar() {
  return {
    version: 1,
    updatedAt: "2026-11-04",
    source: "测试用安排",
    workdays: [],
    years: { 2026: [{ name: "远程假期", start: "2026-09-29", end: "2026-09-29" }] }
  };
}

await test("远端日历可用时整体替换内置表（含新增假期，且替换而非合并）", async () => {
  const calls = stubFetch(() => jsonResponse(remoteCalendar()));
  try {
    // 9/29 周二 10:00：内置表下是高峰，远端表把它变成全天空闲。
    const body = await periodAt(bj(2026, 9, 29, 10, 0), { holidayCalendarUrl: CALENDAR_URL });
    assert.equal(body.period, "offPeak");
    assert.deepEqual(body.range, [0, 1440]);
    assert.equal(body.holiday, "远程假期");
    assert.equal(body.calendar.source, "remote");
    assert.equal(body.calendar.updatedAt, "2026-11-04");
    assert.equal(body.calendar.publisher, "测试用安排");
    assert.deepEqual(body.calendar.years, ["2026"]);
    assert.equal(body.calendar.coversCurrentYear, true);
    assert.equal(body.calendar.error, null);
    assert.equal(body.calendar.url, CALENDAR_URL);
    // 内置的中秋在远端表里不存在 → 必须回到高峰（证明是整体替换，不是合并）
    const mid = await periodAt(bj(2026, 9, 25, 10, 0), { holidayCalendarUrl: CALENDAR_URL });
    assert.equal(mid.period, "peak");
    assert.equal(mid.holiday, null);
  } finally {
    calls.restore();
  }
});

await test("远端日历同样作用于成本计算（9/29 空闲价 vs 内置表的高峰价）", async () => {
  const calls = stubFetch(() => jsonResponse(remoteCalendar()));
  try {
    const remote = await costAt(bj(2026, 9, 29, 10, 0), "deepseek-flash", { config: { holidayCalendarUrl: CALENDAR_URL } });
    near(remote, FLASH.offPeakNew, "远端日历下的空闲价");
    const builtin = await costAt(bj(2026, 9, 29, 10, 0), "deepseek-flash");
    near(builtin, FLASH.peakNew, "内置表下同一时刻为高峰价");
  } finally {
    calls.restore();
  }
});

await test("行配置 holidayRanges 优先于远端日历，且完全不发起请求", async () => {
  const calls = stubFetch(() => jsonResponse(remoteCalendar()));
  try {
    const config = {
      holidayCalendarUrl: CALENDAR_URL,
      holidayRanges: [{ name: "本地假期", start: "2026-09-30", end: "2026-09-30" }]
    };
    const body = await periodAt(bj(2026, 9, 30, 10, 0), config);
    assert.equal(body.holiday, "本地假期");
    assert.equal(body.calendar.source, "config");
    assert.deepEqual(body.calendar.years, ["2026"]);
    assert.equal(calls.length, 0, "行配置存在时不应请求远端");
  } finally {
    calls.restore();
  }
});

await test("holidayCalendarUrl 为 null 时不做任何网络请求（离线/关闭远端）", async () => {
  const calls = stubFetch(() => jsonResponse(remoteCalendar()));
  try {
    const body = await periodAt(bj(2026, 9, 25, 10, 0), { holidayCalendarUrl: null });
    assert.equal(body.calendar.source, "builtin");
    assert.equal(body.calendar.url, null);
    assert.equal(calls.length, 0);
  } finally {
    calls.restore();
  }
});

await test("远端日历非法时整份丢弃：保留内置表并记录 error", async () => {
  const bad = [
    { name: "非法日期", doc: { years: { 2026: [{ start: "2026-02-30" }] } } },
    { name: "start > end", doc: { years: { 2026: [{ start: "2026-05-05", end: "2026-05-01" }] } } },
    { name: "区间跨年", doc: { years: { 2026: [{ start: "2026-12-31", end: "2027-01-02" }] } } },
    { name: "空 years", doc: { years: {} } },
    { name: "years 缺失", doc: { version: 1 } },
    { name: "workdays 非法", doc: { years: { 2026: [{ start: "2026-01-01" }] }, workdays: ["2026-1-1"] } }
  ];
  for (const { name, doc } of bad) {
    const calls = stubFetch(() => jsonResponse(doc));
    try {
      const body = await periodAt(bj(2026, 9, 25, 10, 0), { holidayCalendarUrl: CALENDAR_URL });
      assert.equal(body.calendar.source, "builtin", `${name}：应保留内置表`);
      assert.ok(body.calendar.error, `${name}：应记录 error`);
      assert.equal(body.holiday, "中秋节", `${name}：内置中秋仍生效`);
      assert.equal(body.period, "offPeak");
    } finally {
      calls.restore();
    }
  }
});

await test("远端返回非 2xx / 抛错时保留原日历，不影响路由", async () => {
  for (const handler of [() => jsonResponse({}, 500), () => { throw new Error("boom"); }]) {
    const calls = stubFetch(handler);
    try {
      const body = await periodAt(bj(2026, 10, 1, 10, 0), { holidayCalendarUrl: CALENDAR_URL });
      assert.equal(body.calendar.source, "builtin");
      assert.ok(body.calendar.error);
      assert.equal(body.holiday, "国庆节", "内置国庆仍生效");
      assert.equal(body.period, "offPeak");
    } finally {
      calls.restore();
    }
  }
});

await test("日历按 TTL 缓存：TTL 内只请求一次，过期后重新请求", async () => {
  const calls = stubFetch(() => jsonResponse(remoteCalendar()));
  try {
    const routes = mount({ persistence: openPersistence([]), config: { holidayCalendarUrl: CALENDAR_URL, holidayCalendarTtlMs: 60_000 } });
    await periodWith(routes, bj(2026, 9, 29, 10, 0));
    assert.equal(calls.length, 1, "首次请求");
    await periodWith(routes, bj(2026, 9, 29, 10, 0, 30));
    assert.equal(calls.length, 1, "TTL 内不应重复请求");
    await periodWith(routes, bj(2026, 9, 29, 12, 0));
    assert.equal(calls.length, 2, "超过 TTL 后应重新请求");
  } finally {
    calls.restore();
  }
});

await test("覆盖年份判定：内置表覆盖 2026；仅覆盖次年的日历会报未覆盖", async () => {
  const inYear = await periodAt(bj(2026, 9, 23, 10, 0));
  assert.equal(inYear.calendar.coversCurrentYear, true);
  assert.equal(inYear.calendar.currentYear, "2026");

  const nextOnly = await periodAt(bj(2026, 9, 23, 10, 0), {
    holidayRanges: [{ name: "次年元旦", start: "2027-01-01", end: "2027-01-03" }]
  });
  assert.equal(nextOnly.calendar.coversCurrentYear, false);
  assert.equal(nextOnly.calendar.currentYear, "2026");
  assert.deepEqual(nextOnly.calendar.years, ["2027"]);
});

await test("workdays 能把某天从全天空闲改回按时段计费（未来的口径逃生口）", async () => {
  const config = { holidayWorkdays: ["2026-09-25"] };
  const body = await periodAt(bj(2026, 9, 25, 10, 0), config);
  assert.equal(body.offPeakDay, false, "被列入 workdays 后不再是全天低谷");
  assert.equal(body.holiday, "中秋节", "假期区间仍匹配，只是被 workdays 覆盖");
  assert.equal(body.period, "peak");
  near(await costAt(bj(2026, 9, 25, 10, 0), "deepseek-flash", { config }), FLASH.peakNew);
});

await test("workdays 不受远端刷新覆盖（行配置优先）", async () => {
  const calls = stubFetch(() => jsonResponse(remoteCalendar()));
  try {
    const body = await periodAt(bj(2026, 9, 29, 10, 0), {
      holidayCalendarUrl: CALENDAR_URL,
      holidayWorkdays: ["2026-09-29"]
    });
    assert.equal(body.calendar.source, "remote", "远端仍提供区间");
    assert.equal(body.period, "peak", "行配置的 workdays 依然生效");
    assert.equal(body.offPeakDay, false);
  } finally {
    calls.restore();
  }
});

await test("仓库里的 holidays.json 可被解析，且与内置 2026 表一致（发版前的一致性守卫）", async () => {
  const raw = JSON.parse(readFileSync(new URL("../holidays.json", import.meta.url), "utf8"));
  const calls = stubFetch(() => jsonResponse(raw));
  try {
    const body = await periodAt(bj(2026, 9, 25, 10, 0), { holidayCalendarUrl: CALENDAR_URL });
    assert.equal(body.calendar.source, "remote", "holidays.json 必须能通过校验");
    assert.equal(body.calendar.error, null);
    assert.deepEqual(body.calendar.years, ["2026"]);
    assert.equal(body.calendar.publisher, raw.source);
    // 与内置表逐日等价：中秋/国庆/调休周末 + 普通工作日
    near(await costAt(bj(2026, 9, 25, 10, 0), "deepseek-flash", { config: { holidayCalendarUrl: CALENDAR_URL } }), FLASH.offPeakNew);
    near(await costAt(bj(2026, 10, 1, 10, 0), "deepseek-flash", { config: { holidayCalendarUrl: CALENDAR_URL } }), FLASH.offPeakNew);
    near(await costAt(bj(2026, 10, 10, 10, 0), "deepseek-flash", { config: { holidayCalendarUrl: CALENDAR_URL } }), FLASH.offPeakNew);
    near(await costAt(bj(2026, 9, 29, 10, 0), "deepseek-flash", { config: { holidayCalendarUrl: CALENDAR_URL } }), FLASH.peakNew);
  } finally {
    calls.restore();
  }
});

/* ── 6. 图形化设置的 schema 契约 ──────────────────────────────────────────── */

await test("schemastery 占位值（未设置的键会以 {} 下发）不覆盖内置默认值", async () => {
  // 导出 Config schema 后，cordis 的 resolveConfig 只校验、不落默认值：
  // 未设置的键会变成 {}。若浅合并照单全收，maxSessions: {} 会让 slice(0, {})
  // 取到 0 个会话，面板统计直接归零。
  const events = [usageEvent(bj(2026, 9, 23, 10, 0), "deepseek-flash")];
  const placeholder = mount({ persistence: openPersistence(events), config: { maxSessions: {}, localTtlMs: {} } });
  const clean = mount({ persistence: openPersistence(events) });
  globalThis.Date.now = () => events[0].time;
  try {
    const withPlaceholders = await callRoute(placeholder, "/dsh-usage/local");
    const baseline = await callRoute(clean, "/dsh-usage/local");
    assert.equal(withPlaceholders.sessionCount, baseline.sessionCount, "占位值不得改变回放范围");
    assert.ok(baseline.sessionCount > 0);
    near(withPlaceholders.buckets.total.cost, baseline.buckets.total.cost);
  } finally {
    globalThis.Date.now = realNow;
  }
});

await test("Volatile 包装的用户取值必须生效（否则 schema 会让整份行配置失效）", async () => {
  // cordis 的 resolveConfig 返回的是「未解析」形态：每个已声明键都是一个只有
  // get 的持有者，其 JSON 恰好是 {}。把它当成「用户没设」会让所有已声明键全部
  // 回落到 DEFAULTS —— 用户的 YAML/设置页改动被静默忽略。这里用 3 个会话 +
  // 包装成 get()=1 的 maxSessions 断言回放范围真的被收窄。
  const events = [
    usageEvent(bj(2026, 9, 23, 10, 0), "deepseek-flash"),
    usageEvent(bj(2026, 9, 22, 10, 0), "deepseek-flash"),
    usageEvent(bj(2026, 9, 21, 10, 0), "deepseek-flash")
  ];
  const persistence = () => ({
    list: async () => events.map((event, index) => snapshot(`session-${index}`, event.time, [event])),
    open: async (id) => ({ read: async () => ({ events: [events[Number(id.split("-")[1])]] }), close: async () => {} })
  });
  globalThis.Date.now = () => events[0].time;
  try {
    const plain = await callRoute(mount({ persistence: persistence() }), "/dsh-usage/local");
    assert.equal(plain.sessionCount, 3, "默认 maxSessions=100 应回放全部 3 个会话");

    const holder = { get: () => 1 };
    const wrapped = await callRoute(mount({ persistence: persistence(), config: { maxSessions: holder } }), "/dsh-usage/local");
    assert.equal(wrapped.sessionCount, 1, "Volatile 里的 maxSessions=1 必须生效");

    // 同一个包装机制也应让节假日等结构化键生效（此处用假期把工作日变成全天空闲）
    const ranges = { get: () => [{ name: "包装假期", start: "2026-09-28", end: "2026-09-28" }] };
    const holiday = mount({ persistence: openPersistence([usageEvent(bj(2026, 9, 28, 10, 0), "deepseek-flash")]), config: { holidayRanges: ranges } });
    const payload = await callRoute(holiday, "/dsh-usage/local");
    near(payload.buckets.total.cost, FLASH.offPeakNew, "包装后的 holidayRanges 应让 9/28 全天低谷");
  } finally {
    globalThis.Date.now = realNow;
  }
});

await test("schema 键与客户端设置页的字段清单一一对应（防止两边漂移）", async () => {
  const host = readFileSync(new URL("../lib/index.js", import.meta.url), "utf8");
  const client = readFileSync(new URL("../lib/client.js", import.meta.url), "utf8");
  // 宿主 schema：Config.object({...}) 里每个 `<key>: Schema...volatile()` 的键
  const schemaBlock = host.slice(host.indexOf("Config = Schema.object({"), host.indexOf("} catch {", host.indexOf("Config = Schema.object({")));
  const schemaKeys = new Set([...schemaBlock.matchAll(/^\s{4}(\w+):/gm)].map(m => m[1]));
  // 客户端：CONFIG_FIELDS 的 key 字段
  const fieldsBlock = client.slice(client.indexOf("const CONFIG_FIELDS = ["), client.indexOf("];", client.indexOf("const CONFIG_FIELDS = [")));
  const clientKeys = new Set([...fieldsBlock.matchAll(/key: "(\w+)"/g)].map(m => m[1]));
  assert.ok(schemaKeys.size >= 10, `应解析到 schema 键，实际 ${schemaKeys.size}`);
  assert.deepEqual([...clientKeys].sort(), [...schemaKeys].sort(), "客户端字段清单必须与宿主 schema 完全一致");
});

await test("用户可见文案不得夹带开发/验证内部措辞", async () => {
  // 面板与设置页的字串是给用户看的：不要出现「实测」「热重载」「schema」
  // 「bundle」这类只有维护者需要知道的说法（这类内容属于 AGENTS.md / 提交说明）。
  const client = readFileSync(new URL("../lib/client.js", import.meta.url), "utf8");
  const banned = ["实测", "热重载", "hot-reload", "host half", "schema", "schemastery", "bundle", "DEFAULTS", "Volatile"];
  const offenders = [];
  for (const match of client.matchAll(/^\s{6}"([\w.]+)":\s*"((?:[^"\\]|\\.)*)"/gm)) {
    const [, key, text] = match;
    for (const term of banned) {
      if (text.includes(term)) offenders.push(`${key} 含「${term}」`);
    }
  }
  assert.deepEqual(offenders, [], "用户可见文案里出现了内部措辞");
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

/**
 * dsh-deepseek-usage — host half.
 *
 * A DSH Web plugin that shows your DeepSeek usage in the sidebar:
 *
 *  1. Account balance, fetched from the official DeepSeek API
 *     (`GET https://api.deepseek.com/user/balance`) using the API key
 *     resolved through `ctx.credentials` (DEEPSEEK_API_KEY).
 *  2. Local token statistics, aggregated by replaying every persisted
 *     session log through `ctx.sessionPersistence` and summing the
 *     `assistant/message` usage records (today / last 7 days / total),
 *     also grouped per workspace (the session's working directory) with
 *     each workspace's session records.
 *
 * Both faces are served as plain same-origin JSON routes on the harness
 * webserver (`/dsh-usage/balance`, `/dsh-usage/local`, `/dsh-usage/period`); the browser half
 * (`./client`) fetches them and renders the panel. `/dsh-usage/period` is a
 * cheap always-fresh classification of the current Beijing peak/off-peak
 * window, used by the sidebar badge and the panel header.
 *
 * @module dsh-deepseek-usage
 */

import { readFileSync } from "node:fs";
import { basename, normalize } from "node:path";

/** Cordis plugin name (also the row id used in cordis.patch.yml). */
const name = "deepseek-usage";

/** Host services this plugin needs: the credential seam, session replay, and the web route registry. */
const inject = ["credentials", "sessionPersistence", "webServer"];

/**
 * Epoch ms of the flash-series price cut announced for 2026-09-10 12:00
 * 北京时间 (UTC+8 → 04:00Z): 空闲时段 输入缓存未命中 ¥1 / 缓存命中 ¥0.02 输出 ¥4，
 * 高峰时段为空闲时段的 2 倍.
 */
const FLASH_PRICE_CUT_AT = Date.UTC(2026, 8, 10, 4, 0, 0);

/**
 * Rates in force from {@link FLASH_PRICE_CUT_AT} for every flash-series model.
 * Peak is exactly twice the off-peak rate.
 *
 * V4 Pro is deliberately NOT part of this era: the 2026-09-14 12:00 retirement
 * that would have routed it onto flash billing was cancelled by the official
 * 2026-09-11 notice, and the model keeps serving on its own peak/off-peak
 * rates. Do not reintroduce a V4 Pro era here (see `deepseek-v4-pro`).
 */
const FLASH_RATES_FROM_2026_09_10 = {
  peak: { input: 2, cacheHit: 0.04, output: 8 },
  offPeak: { input: 1, cacheHit: 0.02, output: 4 }
};

/**
 * Statutory-holiday leave ranges for 2026, Beijing calendar dates, inclusive.
 * Source: 《国务院办公厅关于 2026 年部分节假日安排的通知》(2025-11-04).
 *
 * DeepSeek bills 调休上班的周末 and 中国法定节假日全天 at the off-peak (空闲)
 * rate — the 2026-09-19 supplementary notice. Every 调休上班 day in the 2026
 * notice (1/4, 2/14, 2/28, 5/9, 9/20, 10/10) is itself a Saturday or Sunday, so
 * the weekend rule already covers it; only the leave ranges below are new.
 *
 * The notice is published late in the preceding year, so 2027 dates are not
 * known yet: override `holidayRanges` through the row config once they are.
 */
const HOLIDAYS_2026 = [
  { name: "元旦", start: "2026-01-01", end: "2026-01-03" },
  { name: "春节", start: "2026-02-15", end: "2026-02-23" },
  { name: "清明节", start: "2026-04-04", end: "2026-04-06" },
  { name: "劳动节", start: "2026-05-01", end: "2026-05-05" },
  { name: "端午节", start: "2026-06-19", end: "2026-06-21" },
  { name: "中秋节", start: "2026-09-25", end: "2026-09-27" },
  { name: "国庆节", start: "2026-10-01", end: "2026-10-07" }
];

/**
 * Where the maintained holiday calendar lives. Deliberately the repository
 * itself: updating `holidays.json` on `main` is the whole yearly maintenance
 * step — installed plugins pick it up through the normal TTL refresh, with no
 * release and no user action.
 */
const HOLIDAY_CALENDAR_URL = "https://raw.githubusercontent.com/xavier711/dsh-deepseek-usage/main/holidays.json";

/** Fallback defaults; every key can be overridden through the row's `config`. */
const DEFAULTS = {
  /** How long a fetched balance may be served from cache (ms). */
  balanceTtlMs: 60_000,
  /** How many most-recent sessions to replay for the local statistics. */
  maxSessions: 100,
  /** Parallel session-log inspections. */
  sessionConcurrency: 4,
  /** Timeout for the balance request (ms). */
  balanceTimeoutMs: 10_000,
  /**
   * How long a successful local-usage payload may be served from cache (ms).
   * The client refreshes the sidebar badge from event signals (session
   * activity, tab focus) instead of polling; this short TTL keeps those
   * refreshes cheap while replaying session logs at most once per window.
   */
  localTtlMs: 30_000,
  /**
   * Official DeepSeek pricing, CNY per 1M tokens, keyed by model id. Each
   * entry carries the flat rates in force until `newPricingAt`, the
   * peak/off-peak rates effective from then on, and any later `eras` — dated
   * `{ at, peak, offPeak }` replacements applied from `at` onward (the latest
   * era at or before the call's own time wins):
   *
   *   - 2026-08-17 起 DeepSeek V4 系列采用峰谷定价（IT之家 2026-08-13 报道）：
   *     v4-flash 高峰 输入 ¥3.0 / 缓存命中 ¥0.10 / 输出 ¥9.0（空闲时段减半）；
   *     v4-pro 高峰 输入 ¥9.0 / 缓存命中 ¥0.30 / 输出 ¥27.0（空闲时段减半）。
   *   - 2026-08-23 00:00（北京时间）起，周末（周六、周日）全天不再区分峰谷
   *     时段，统一按低谷（空闲）价计费（官方公告，见 `weekendOffPeakAt`）。
   *     2026-09-19 官方补充说明进一步明确：调休上班的周末、中国法定节假日全天
   *     同样按空闲时段计费（见 `holidayOffPeakAt` 与 `holidayRanges`）。
   *   - 2026-09-10 12:00（北京时间）起 flash 系列降价：空闲时段 输入缓存未命中
   *     ¥1 / 缓存命中 ¥0.02 / 输出 ¥4，高峰时段翻倍（¥2 / ¥0.04 / ¥8），
   *     见 `FLASH_PRICE_CUT_AT`。
   *   - V4 Pro 不设 era：2026-09-14 12:00 的下线已被官方 2026-09-11 公告取消，
   *     9 月 14 日后继续提供 API 服务、计费方式不变，故它一直沿用自身峰谷价
   *     （高峰 输入 ¥9 / 缓存命中 ¥0.30 / 输出 ¥27，空闲时段减半）。曾经存在
   *     的 `V4_PRO_SUNSET_AT` + flash era 已删除，**不要再加回来**。
   *   - 8/17 之前：v4-flash 输入 ¥1 / 缓存命中 ¥0.02 / 输出 ¥2；
   *     v4-pro 输入 ¥3 / 缓存命中 ¥0.025 / 输出 ¥6。
   *   - deepseek-flash（V4.1 Flash，2026-09-09 起为 harness 默认模型）与
   *     deepseek-v4-flash-vision-exp 同属 flash 系列，定价与 v4-flash 一致
   *     （视觉模型的图片按尺寸折算成 token 计费）。
   *   - 旧模型 deepseek-chat / deepseek-reasoner 沿用 2025 年公开价。
   * `default` 用于未列入的模型（按 flash 系列现价估算，标记 estimated）。
   */
  pricing: {
    "deepseek-flash": {
      input: 1,
      cacheHit: 0.02,
      output: 2,
      peak: { input: 3, cacheHit: 0.1, output: 9 },
      offPeak: { input: 1.5, cacheHit: 0.05, output: 4.5 },
      eras: [{ at: FLASH_PRICE_CUT_AT, ...FLASH_RATES_FROM_2026_09_10 }]
    },
    "deepseek-v4-flash": {
      input: 1,
      cacheHit: 0.02,
      output: 2,
      peak: { input: 3, cacheHit: 0.1, output: 9 },
      offPeak: { input: 1.5, cacheHit: 0.05, output: 4.5 },
      eras: [{ at: FLASH_PRICE_CUT_AT, ...FLASH_RATES_FROM_2026_09_10 }]
    },
    "deepseek-v4-flash-vision-exp": {
      input: 1,
      cacheHit: 0.02,
      output: 2,
      peak: { input: 3, cacheHit: 0.1, output: 9 },
      offPeak: { input: 1.5, cacheHit: 0.05, output: 4.5 },
      eras: [{ at: FLASH_PRICE_CUT_AT, ...FLASH_RATES_FROM_2026_09_10 }]
    },
    "deepseek-v4-pro": {
      input: 3,
      cacheHit: 0.025,
      output: 6,
      peak: { input: 9, cacheHit: 0.3, output: 27 },
      offPeak: { input: 4.5, cacheHit: 0.15, output: 13.5 }
      // 无 era：2026-09-14 的下线/改走 flash 计费已取消（官方 2026-09-11
      // 公告），9 月 14 日后仍按 V4 Pro 自身峰谷价计费。不要加回 era。
    },
    "deepseek-chat": { input: 2, cacheHit: 0.5, output: 8 },
    "deepseek-reasoner": { input: 4, cacheHit: 1, output: 16 },
    default: {
      input: 1,
      cacheHit: 0.02,
      output: 2,
      peak: { input: 3, cacheHit: 0.1, output: 9 },
      offPeak: { input: 1.5, cacheHit: 0.05, output: 4.5 },
      eras: [{ at: FLASH_PRICE_CUT_AT, ...FLASH_RATES_FROM_2026_09_10 }]
    }
  },
  /** Epoch ms when the peak/off-peak pricing takes effect (2026-08-17 00:00 北京时间). */
  newPricingAt: Date.UTC(2026, 7, 16, 16, 0, 0),
  /**
   * Epoch ms when the weekend rule takes effect (2026-08-23 00:00 北京时间):
   * 周末（周六、周日）全天不再区分峰谷时段，统一按低谷（空闲）价计费。
   * 在此之前周末仍按 `peakHours` 正常区分峰谷。
   */
  weekendOffPeakAt: Date.UTC(2026, 7, 22, 16, 0, 0),
  /**
   * 法定节假日放假区间（北京时间日期，含首尾），这些天全天按空闲（低谷）价
   * 计费，与周末同规则。默认值是 {@link HOLIDAYS_2026}（2026 年官方安排）；
   * 次年安排通常在前一年年底公布，届时用同样的结构整体覆盖本键即可：
   * `[{ name, start: "YYYY-MM-DD", end: "YYYY-MM-DD" }]`，`end` 省略时按单日计。
   */
  holidayRanges: HOLIDAYS_2026,
  /**
   * `holidays.json` on the repo's default branch (raw.githubusercontent CDN).
   * The calendar lives in the repository rather than in the code so a newly
   * published year reaches already-installed plugins without a release; the
   * built-in {@link HOLIDAYS_2026} stays as the offline fallback. Set to null
   * (or "") to disable the remote calendar entirely.
   */
  holidayCalendarUrl: HOLIDAY_CALENDAR_URL,
  /** How long a fetched holiday calendar may be reused (ms). */
  holidayCalendarTtlMs: 6 * 60 * 60 * 1000,
  /** Timeout for the holiday-calendar request (ms); failures keep the previous calendar. */
  holidayCalendarTimeoutMs: 5_000,
  /**
   * Days that are NOT all-day off-peak even though the weekend/holiday rules
   * would make them so — the escape hatch for a future arrangement that bills
   * a 调休上班 weekend as a working day. Empty under the current official rule
   * (调休上班的周末仍按空闲时段计费), and normally left empty.
   */
  holidayWorkdays: [],
  /**
   * Epoch ms when the statutory-holiday rule takes effect (2026-09-19 00:00
   * 北京时间 → 2026-09-18T16:00Z): DeepSeek 当日发布补充说明，明确调休上班的
   * 周末与中国法定节假日全天均按空闲时段计费。此前的节假日仍按 `peakHours`
   * 区分峰谷（2026-08-17 之前更是统一 flat 价，故只影响 9/25 起的假期）。
   */
  holidayOffPeakAt: Date.UTC(2026, 8, 18, 16, 0, 0),
  /** Peak windows, Beijing local hours [start, end). 其余时段为空闲时段. */
  peakHours: [[9, 12], [14, 18]],
  /** Beijing timezone offset for the peak-window determination. */
  timezoneOffsetMinutes: 480,
  /** Update-check endpoint: raw package.json on the repo's default branch
   *  (raw.githubusercontent CDN — no API rate limits). */
  updateCheckUrl: "https://raw.githubusercontent.com/xavier711/dsh-deepseek-usage/main/package.json",
  /** Releases page shown in the update banner. */
  updateReleasesUrl: "https://github.com/xavier711/dsh-deepseek-usage/releases",
  /** How long a successful update check may be cached (ms). */
  updateCheckTtlMs: 6 * 60 * 60 * 1000
};

/** Official DeepSeek account endpoint. */
const BALANCE_URL = "https://api.deepseek.com/user/balance";

/** Credential reference for the DeepSeek API key. */
const API_KEY_REF = "DEEPSEEK_API_KEY";

/** JSON response writer for the route handlers. */
function sendJson(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(body));
}

/** Resolve the DeepSeek API key: credential seam first, then the process environment. */
async function resolveApiKey(ctx) {
  try {
    const resolved = await ctx.credentials.resolve(API_KEY_REF);
    if (resolved && typeof resolved.value === "string" && resolved.value.length > 0) return resolved.value;
  } catch {
    /* fall through to the environment */
  }
  const fromEnv = process.env[API_KEY_REF];
  return typeof fromEnv === "string" && fromEnv.length > 0 ? fromEnv : undefined;
}

/** One empty token bucket. */
function emptyBucket() {
  return {
    calls: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    reasoningTokens: 0,
    cost: 0
  };
}

/**
 * True when `time` falls on a Beijing weekend (Saturday/Sunday) that is
 * subject to the weekend off-peak rule (i.e. at/after `weekendOffPeakAt`).
 * Before the rule takes effect, weekends still follow the normal peak
 * windows.
 * @param cfg - plugin config (weekendOffPeakAt, timezoneOffsetMinutes).
 * @param time - epoch ms of the moment to classify.
 */
function isBeijingWeekend(cfg, time) {
  const effectiveAt = cfg.weekendOffPeakAt;
  if (typeof effectiveAt !== "number" || typeof time !== "number" || time < effectiveAt) return false;
  const day = new Date(time + (cfg.timezoneOffsetMinutes ?? 480) * 60_000).getUTCDay();
  return day === 0 || day === 6; // Sunday or Saturday
}

/**
 * Beijing-local calendar day key (`YYYY-MM-DD`) for one timestamp.
 * @param cfg - plugin config (timezoneOffsetMinutes).
 * @param time - epoch ms of the moment to key.
 */
function beijingDayKey(cfg, time) {
  return new Date(time + (cfg.timezoneOffsetMinutes ?? 480) * 60_000).toISOString().slice(0, 10);
}

/**
 * The configured statutory-holiday range covering `time`, or null.
 *
 * Ranges are inclusive Beijing calendar days compared as `YYYY-MM-DD`
 * strings, whose lexicographic order is chronological. `end` may be omitted
 * for a single-day holiday. Before `holidayOffPeakAt` the rule does not apply,
 * so earlier holidays keep following `peakHours`.
 * @param cfg - plugin config (holidayRanges, holidayOffPeakAt, timezoneOffsetMinutes).
 * @param time - epoch ms of the moment to classify.
 */
function beijingHoliday(cfg, time) {
  const effectiveAt = cfg.holidayOffPeakAt;
  if (typeof effectiveAt !== "number" || typeof time !== "number" || time < effectiveAt) return null;
  const ranges = Array.isArray(cfg.holidayRanges) ? cfg.holidayRanges : [];
  if (ranges.length === 0) return null;
  const day = beijingDayKey(cfg, time);
  for (const range of ranges) {
    const start = range?.start;
    const end = range?.end ?? range?.start;
    if (typeof start !== "string" || typeof end !== "string") continue;
    if (day >= start && day <= end) return range;
  }
  return null;
}

/**
 * True when `time` falls on a day listed in `holidayWorkdays` — an explicit
 * escape hatch that cancels the all-day off-peak rule for that day (a future
 * arrangement billing a 调休上班 weekend as a working day). Empty by default,
 * because today's official rule keeps 调休上班的周末 off-peak.
 * @param cfg - plugin config (holidayWorkdays, holidayOffPeakAt, timezoneOffsetMinutes).
 * @param time - epoch ms of the moment to classify.
 */
function isBeijingWorkday(cfg, time) {
  const effectiveAt = cfg.holidayOffPeakAt;
  if (typeof effectiveAt !== "number" || typeof time !== "number" || time < effectiveAt) return false;
  const days = Array.isArray(cfg.holidayWorkdays) ? cfg.holidayWorkdays : [];
  return days.length > 0 && days.includes(beijingDayKey(cfg, time));
}

/**
 * True when the Beijing day of `time` bills at the off-peak rate for the whole
 * day: a Saturday/Sunday under the weekend rule, or a day inside a configured
 * statutory-holiday range under the holiday rule. 调休上班的周末 need no
 * separate handling — they are calendar weekends and stay off-peak — unless a
 * day is explicitly listed in `holidayWorkdays`.
 * @param cfg - plugin config (weekendOffPeakAt, holidayRanges, holidayWorkdays, holidayOffPeakAt, timezoneOffsetMinutes).
 * @param time - epoch ms of the moment to classify.
 */
function isBeijingOffPeakDay(cfg, time) {
  if (isBeijingWorkday(cfg, time)) return false;
  return isBeijingWeekend(cfg, time) || beijingHoliday(cfg, time) !== null;
}

/** True for a real `YYYY-MM-DD` calendar date (rejects 2026-02-30, 2026-13-01, …). */
function isIsoDay(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const probe = new Date(Date.UTC(year, month - 1, day));
  return probe.getUTCFullYear() === year && probe.getUTCMonth() === month - 1 && probe.getUTCDate() === day;
}

/** True for `YYYY-MM-DD` strings that are also in ascending order. */
function isOrderedDayRange(start, end) {
  return isIsoDay(start) && isIsoDay(end) && start <= end;
}

/** The distinct years a set of `{ start, end }` ranges covers, ascending. */
function coveredYears(ranges) {
  const years = new Set();
  for (const range of ranges ?? []) {
    if (typeof range?.start === "string") years.add(range.start.slice(0, 4));
    if (typeof range?.end === "string") years.add(range.end.slice(0, 4));
  }
  return [...years].sort();
}

/**
 * Validate a fetched `holidays.json`.
 *
 * All-or-nothing on purpose: a partially applied calendar would silently
 * mis-price real calls, which is worse than staying on the previous (or
 * built-in) table. Every member is checked — year keys, ISO dates that exist,
 * ascending ranges, and ranges nested under the year they belong to.
 *
 * @param raw - parsed JSON of the calendar document.
 * @returns `{ ranges, workdays, years, updatedAt, source }`.
 * @throws {Error} on any malformed member, so the caller keeps the old calendar.
 */
function parseHolidayCalendar(raw) {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error("日历不是对象");
  const years = raw.years;
  if (typeof years !== "object" || years === null || Array.isArray(years)) throw new Error("日历缺少 years 对象");
  const ranges = [];
  for (const [year, list] of Object.entries(years)) {
    if (!/^\d{4}$/.test(year)) throw new Error(`年份键不合法：${year}`);
    if (!Array.isArray(list)) throw new Error(`${year} 的值不是数组`);
    for (const entry of list) {
      if (typeof entry !== "object" || entry === null) throw new Error(`${year} 含非对象条目`);
      const start = entry.start;
      const end = entry.end ?? entry.start;
      if (!isOrderedDayRange(start, end)) throw new Error(`${year} 含非法日期区间：${start} → ${end}`);
      if (start.slice(0, 4) !== year || end.slice(0, 4) !== year) {
        throw new Error(`${year} 下的区间必须落在同一年：${start} → ${end}`);
      }
      ranges.push({ name: typeof entry.name === "string" ? entry.name : undefined, start, end });
    }
  }
  if (ranges.length === 0) throw new Error("日历不含任何假期区间");
  const workdays = raw.workdays ?? [];
  if (!Array.isArray(workdays) || workdays.some((day) => !isIsoDay(day))) throw new Error("workdays 必须是 YYYY-MM-DD 数组");
  return {
    ranges,
    workdays: [...workdays],
    years: Object.keys(years).sort(),
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : null,
    source: typeof raw.source === "string" ? raw.source : null
  };
}

/**
 * The segments of one Beijing day as `[startMin, endMin, period]` triples
 * covering `[0, 1440)`. On off-peak days (Beijing weekends, subject to the
 * rule from `weekendOffPeakAt`, or statutory holidays from `holidayOffPeakAt`)
 * the whole day is a single off-peak segment; otherwise the day alternates
 * off-peak/peak around `peakHours`.
 * @param cfg - plugin config (weekendOffPeakAt, holidayRanges, holidayOffPeakAt, peakHours, timezoneOffsetMinutes).
 * @param dayStart - epoch ms of the Beijing midnight starting the day.
 */
function daySegments(cfg, dayStart) {
  if (isBeijingOffPeakDay(cfg, dayStart + cfg.timezoneOffsetMinutes * 60_000)) {
    return [[0, 1440, "offPeak"]];
  }
  const windows = (cfg.peakHours ?? [])
    .filter((w) => Array.isArray(w) && w.length === 2 && w[1] > w[0])
    .map(([start, end]) => [start * 60, end * 60]);
  if (windows.length === 0) return [[0, 1440, "offPeak"]];
  const boundaries = [...new Set([0, 1440, ...windows.flat()])].sort((a, b) => a - b);
  const segments = [];
  for (let i = 0; i < boundaries.length - 1; i += 1) {
    const peak = windows.some((w) => w[0] === boundaries[i]);
    segments.push([boundaries[i], boundaries[i + 1], peak ? "peak" : "offPeak"]);
  }
  return segments;
}

/**
 * Beijing-local pricing period for one timestamp.
 *
 * Before `newPricingAt` the period is `flat` (single rates); afterwards it
 * alternates `peak`/`offPeak` around the configured `peakHours` windows.
 * From `weekendOffPeakAt` on, Beijing weekends (Sat/Sun) skip the peak
 * windows entirely: the whole day is one `offPeak` segment; statutory holidays
 * do the same from `holidayOffPeakAt`. `nextAt` is the
 * next moment where the period actually changes (e.g. Friday 18:30 → the
 * next Monday 09:00, skipping the weekend), not the next raw boundary.
 * @param cfg - plugin config (newPricingAt, weekendOffPeakAt, holidayRanges, holidayOffPeakAt, peakHours, timezoneOffsetMinutes).
 * @param time - epoch ms of the moment to classify.
 * @returns `{ period, range, nextAt, nextPeriod }` where `range` is the
 * current segment as Beijing minutes-of-day `[start, end)` (null when flat),
 * `nextAt` is the epoch ms of the next period change (the peak-pricing start
 * when flat) and `nextPeriod` is the period in force after `nextAt` (null
 * when there is no further change).
 */
function beijingPeriod(cfg, time) {
  const dayMs = 86_400_000;
  const offsetMs = cfg.timezoneOffsetMinutes * 60_000;
  if (typeof time !== "number" || time < cfg.newPricingAt) {
    return { period: "flat", range: null, nextAt: typeof time === "number" ? cfg.newPricingAt : null, nextPeriod: null };
  }
  const windows = (cfg.peakHours ?? [])
    .filter((w) => Array.isArray(w) && w.length === 2 && w[1] > w[0]);
  if (windows.length === 0) return { period: "flat", range: null, nextAt: null, nextPeriod: null };
  const dayStart = Math.floor((time + offsetMs) / dayMs) * dayMs - offsetMs;
  const minutes = (time + offsetMs) % dayMs / 60_000;
  let cursorDay = dayStart;
  let segments = daySegments(cfg, cursorDay);
  const current = segments.find(([start, end]) => minutes >= start && minutes < end) ?? segments[segments.length - 1];
  const period = current[2];
  const range = [current[0], current[1]];
  // Walk the current day's remaining segments, then following days, until the
  // period differs from the current one. The bound must exceed the longest
  // run of consecutive all-day off-peak days — 春节 plus its adjacent weekends
  // is ~11 days in 2026, and a configured holiday range may be longer still —
  // otherwise a long break would report "no further change".
  let startIndex = segments.indexOf(current) + 1;
  for (let guard = 0; guard < 40; guard += 1) {
    for (let i = startIndex; i < segments.length; i += 1) {
      const [start, , nextPeriod] = segments[i];
      if (nextPeriod !== period) {
        return { period, range, nextAt: cursorDay + start * 60_000, nextPeriod };
      }
    }
    cursorDay += dayMs;
    segments = daySegments(cfg, cursorDay);
    startIndex = 0;
  }
  return { period, range, nextAt: null, nextPeriod: null };
}

/**
 * The dated era in force at `time`, or `undefined` when the entry has no era
 * covering it. Eras are `{ at, peak, offPeak }` records; the latest `at` at or
 * before `time` wins, and an era only counts once it carries both rate sets.
 * @param entry - one pricing entry (may carry `eras`).
 * @param time - epoch ms of the call being priced.
 */
function eraRates(entry, time) {
  if (typeof time !== "number" || !Array.isArray(entry?.eras)) return undefined;
  let selected;
  for (const era of entry.eras) {
    if (typeof era?.at !== "number" || time < era.at) continue;
    if (selected === undefined || era.at >= selected.at) selected = era;
  }
  if (selected === undefined) return undefined;
  return isRates(selected.peak) && isRates(selected.offPeak) ? selected : undefined;
}

/** True when a value is a usable `{ input, cacheHit, output }` rate set. */
function isRates(value) {
  return typeof value === "object" && value !== null;
}

/**
 * Resolve the effective rates for one model call.
 * @param pricing - the configured per-model pricing table.
 * @param model - model id in force for the call.
 * @param time - epoch ms of the call (picks peak vs off-peak after `newPricingAt`,
 *   and the dated era in force at that moment).
 * @param cfg - plugin config (newPricingAt, weekendOffPeakAt, holidayRanges, holidayOffPeakAt, peakHours, timezoneOffsetMinutes).
 * @returns `{ input, cacheHit, output }` rates plus whether the model was estimated.
 */
function resolveRates(pricing, model, time, cfg) {
  const entry = pricing[model] ?? pricing.default;
  const known = entry !== void 0 && Object.hasOwn(pricing, model);
  const flat = {
    input: entry?.input ?? 1,
    cacheHit: entry?.cacheHit ?? 0.02,
    output: entry?.output ?? 2
  };
  const era = eraRates(entry, time);
  const peak = era?.peak ?? entry?.peak;
  const offPeak = era?.offPeak ?? entry?.offPeak;
  const info = beijingPeriod(cfg, time);
  if (info.period === "flat" || !isRates(peak) || !isRates(offPeak)) {
    return { ...flat, estimated: !known };
  }
  const rates = info.period === "peak" ? peak : offPeak;
  return {
    input: rates.input ?? flat.input,
    cacheHit: rates.cacheHit ?? flat.cacheHit,
    output: rates.output ?? flat.output,
    estimated: !known
  };
}

/** Merge one provider usage record into a bucket and add the estimated cost. */
function addUsage(bucket, usage, rates) {
  const input = usage.inputTokens ?? 0;
  const output = usage.outputTokens ?? 0;
  const cacheRead = usage.cacheReadTokens ?? 0;
  const cacheWrite = usage.cacheWriteTokens ?? 0;
  const reasoning = usage.reasoningTokens ?? 0;
  bucket.calls += 1;
  bucket.inputTokens += input;
  bucket.outputTokens += output;
  bucket.cacheReadTokens += cacheRead;
  bucket.cacheWriteTokens += cacheWrite;
  bucket.reasoningTokens += reasoning;
  // Billed input = uncached input + cache writes; cache reads bill at the hit rate.
  bucket.cost += ((input + cacheWrite) / 1e6) * rates.input + (cacheRead / 1e6) * rates.cacheHit + (output / 1e6) * rates.output;
}

/** Local day key (YYYY-MM-DD) for one timestamp. */
function dayKey(time) {
  const d = new Date(time);
  const month = `${d.getMonth() + 1}`.padStart(2, "0");
  const date = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${month}-${date}`;
}

/** Start-of-local-day timestamp for one timestamp. */
function startOfDay(time) {
  const d = new Date(time);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Run async work over an array with a bounded concurrency. */
async function mapConcurrent(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  async function run() {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => run()));
  return results;
}

/**
 * Read one persisted session's event log through whichever
 * `sessionPersistence` seam the running harness exposes.
 *
 * DSH reshaped that seam: older hosts read a whole log with the one-shot
 * `inspect(id)`, while current hosts hand out an explicit read handle
 * (`open(id, "read")` → `handle.read()` → `handle.close()`). A plugin that
 * only knows `inspect` therefore reads nothing at all on a newer host, which
 * is exactly how the panel lost its session history. Both shapes are
 * supported here, so one published bundle serves either harness.
 *
 * @param ctx - host context holding `sessionPersistence`.
 * @param id - the persisted session to read.
 * @returns the session's events, in seq order.
 */
async function readSessionEvents(ctx, id) {
  const persistence = ctx.sessionPersistence;
  if (typeof persistence?.open === "function") {
    const handle = await persistence.open(id, "read");
    try {
      const result = await handle.read();
      return Array.isArray(result?.events) ? result.events : [];
    } finally {
      // Close in every path, but never let a failed close mask the read's own
      // result or error (read handles hold no ownership to lose).
      try {
        await handle.close();
      } catch {
        /* ignore */
      }
    }
  }
  if (typeof persistence?.inspect === "function") {
    const inspection = await persistence.inspect(id);
    return Array.isArray(inspection?.events) ? inspection.events : [];
  }
  throw new Error("sessionPersistence 同时缺少 open() 与 inspect()，无法读取会话日志");
}

/**
 * Headers of every stored session. Current hosts list
 * `SessionPersistenceSnapshot` records (`{ header, revision, sizeBytes? }`);
 * older ones listed bare `SessionHeader`s, so both shapes are accepted and
 * only entries carrying a real header (with a string id) survive.
 * @param ctx - host context holding `sessionPersistence`.
 */
async function listSessionHeaders(ctx) {
  const entries = await ctx.sessionPersistence.list();
  const headers = [];
  for (const entry of entries ?? []) {
    const header = entry?.header ?? entry;
    if (typeof header?.id === "string" && header.id.length > 0) headers.push(header);
  }
  return headers;
}

/**
 * Replay one persisted session log and fold it into token buckets.
 * Usage is attributed to the model in force (the message's own provenance
 * when present, otherwise folded from the latest `request/header` /
 * `request/context` event) and priced per model.
 * @returns a per-session row, or an error row when the log cannot be read.
 */
async function foldSession(ctx, header, cfg, now) {
  const bucket = emptyBucket();
  const base = {
    id: header.id,
    title: undefined,
    createdAt: header.createdAt,
    lastActiveAt: header.createdAt,
    // Workspace = the absolute working directory the session was created in
    // (null when the session has no directory), normalized for grouping.
    workspace: typeof header.cwd === "string" && header.cwd.length > 0 ? normalize(header.cwd) : null,
    // Subagent sessions carry their own usage records; they belong to the
    // same workspace as their parent and must be folded in to avoid
    // under-counting that workspace's real usage.
    subagent: (header.delegationDepth ?? 0) > 0,
    ...bucket
  };
  const todayKey = dayKey(now);
  const weekFloor = startOfDay(now) - 6 * 86_400_000;
  const today = emptyBucket();
  const week = emptyBucket();
  const byDay = Object.create(null);
  const byModel = Object.create(null);
  let model;
  try {
    const events = await readSessionEvents(ctx, header.id);
    for (const event of events) {
      const time = event.time;
      if (typeof time === "number") {
        if (time > base.lastActiveAt) base.lastActiveAt = time;
        if (event.type === "session/title" && typeof event.data?.title === "string") base.title = event.data.title;
      }
      if (event.type === "request/header" && typeof event.data?.header?.config?.model === "string") {
        model = event.data.header.config.model;
        continue;
      }
      if (event.type === "request/context" && typeof event.data?.model === "string") {
        model = event.data.model;
        continue;
      }
      if (event.type !== "assistant/message" || typeof event.data?.usage !== "object" || event.data.usage === null) continue;
      // The message's own provenance names the model that produced it, which
      // stays right even when the request header events are missing (forked
      // prefixes, rotated logs) or when one session mixed several models.
      const sourceModel = event.data.message?.source?.model;
      if (typeof sourceModel === "string" && sourceModel.length > 0) model = sourceModel;
      const usage = event.data.usage;
      const rates = resolveRates(cfg.pricing, model ?? "unknown", time, cfg);
      const slot = byModel[model ?? "unknown"] ?? (byModel[model ?? "unknown"] = { model: model ?? "unknown", estimated: rates.estimated, ...emptyBucket() });
      addUsage(bucket, usage, rates);
      addUsage(slot, usage, rates);
      if (typeof time === "number") {
        const day = dayKey(time);
        if (day === todayKey) addUsage(today, usage, rates);
        if (time >= weekFloor) addUsage(week, usage, rates);
        const daySlot = byDay[day] ?? (byDay[day] = emptyBucket());
        addUsage(daySlot, usage, rates);
      }
    }
    return { ...base, ...bucket, today, week, byDay, byModel, error: null };
  } catch (error) {
    return { ...base, error: String(error?.message ?? error) };
  }
}

/** Replay the persisted session logs and produce the aggregate usage payload. */
async function computeLocalUsage(ctx, cfg) {
  const now = Date.now();
  let headers;
  try {
    headers = await listSessionHeaders(ctx);
  } catch (error) {
    return {
      ok: false,
      error: "PERSISTENCE_UNAVAILABLE",
      message: String(error?.message ?? error)
    };
  }
  const selected = [...headers]
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
    .slice(0, cfg.maxSessions);
  const rows = await mapConcurrent(selected, cfg.sessionConcurrency, (header) => foldSession(ctx, header, cfg, now));
  const total = emptyBucket();
  const today = emptyBucket();
  const week = emptyBucket();
  // Last-7-days frame, oldest first; today is the last entry.
  const days = [];
  const dayIndex = new Map();
  for (let offset = 6; offset >= 0; offset -= 1) {
    const date = dayKey(startOfDay(now) - offset * 86_400_000);
    dayIndex.set(date, days.length);
    days.push({ date, ...emptyBucket() });
  }
  // Rolling token-activity frame, mirroring Codex: 52 weeks (last 12 months),
  // Sunday-aligned, rows run Su..Sa; future days render blank in the client.
  const ACTIVITY_WEEKS = 52;
  const activityAnchor = startOfDay(now) - (ACTIVITY_WEEKS - 1) * 7 * 86_400_000;
  const activityStart = new Date(activityAnchor);
  activityStart.setDate(activityStart.getDate() - activityStart.getDay());
  const activity = [];
  const activityIndex = new Map();
  for (let i = 0; i < ACTIVITY_WEEKS * 7; i += 1) {
    const date = dayKey(activityStart.getTime() + i * 86_400_000);
    activityIndex.set(date, activity.length);
    activity.push({ date, ...emptyBucket() });
  }
  const byModel = Object.create(null);
  const byWorkspace = new Map(); // key: normalized cwd ("" for unassigned)
  const usedDays = new Set();
  let peakDailyTokens = 0;
  let errorSessions = 0;
  for (const row of rows) {
    if (row.error !== null) {
      errorSessions += 1;
      continue;
    }
    mergeBucket(total, row);
    mergeBucket(today, row.today);
    mergeBucket(week, row.week);
    const wsKey = row.workspace ?? "";
    let ws = byWorkspace.get(wsKey);
    if (ws === undefined) {
      ws = {
        path: row.workspace,
        name: row.workspace === null ? null : basename(row.workspace),
        sessionCount: 0,
        subagentSessionCount: 0,
        buckets: { today: emptyBucket(), week: emptyBucket(), total: emptyBucket() },
        sessions: []
      };
      byWorkspace.set(wsKey, ws);
    }
    ws.sessionCount += 1;
    if (row.subagent) ws.subagentSessionCount += 1;
    mergeBucket(ws.buckets.total, row);
    mergeBucket(ws.buckets.today, row.today);
    mergeBucket(ws.buckets.week, row.week);
    ws.sessions.push({
      id: row.id,
      title: row.title,
      createdAt: row.createdAt,
      lastActiveAt: row.lastActiveAt,
      subagent: row.subagent,
      calls: row.calls,
      inputTokens: row.inputTokens,
      outputTokens: row.outputTokens,
      cacheReadTokens: row.cacheReadTokens,
      cacheWriteTokens: row.cacheWriteTokens,
      reasoningTokens: row.reasoningTokens,
      cost: row.cost
    });
    for (const [date, bucket] of Object.entries(row.byDay ?? {})) {
      if (bucket.calls > 0) usedDays.add(date);
      const dayTokens = bucket.inputTokens + bucket.outputTokens + bucket.cacheReadTokens + bucket.cacheWriteTokens + bucket.reasoningTokens;
      if (dayTokens > peakDailyTokens) peakDailyTokens = dayTokens;
      const index = dayIndex.get(date);
      if (index !== void 0) mergeBucket(days[index], bucket);
      const act = activityIndex.get(date);
      if (act !== void 0) mergeBucket(activity[act], bucket);
    }
    for (const [modelId, bucket] of Object.entries(row.byModel ?? {})) {
      const target = byModel[modelId] ?? (byModel[modelId] = { model: modelId, estimated: false, ...emptyBucket() });
      mergeBucket(target, bucket);
      target.estimated ||= bucket.estimated === true;
    }
    delete row.today;
    delete row.week;
    delete row.byDay;
    delete row.byModel;
  }
  const models = Object.values(byModel).sort((a, b) => b.cost - a.cost);
  const workspaces = [...byWorkspace.values()].sort((a, b) => b.buckets.total.cost - a.buckets.total.cost);
  const streaks = computeStreaks(usedDays, now);
  return {
    ok: true,
    fetchedAt: now,
    sessionCount: rows.length,
    errorSessions,
    pricing: {
      currency: "CNY",
      note: "official",
      newPricingAt: cfg.newPricingAt,
      weekendOffPeakAt: cfg.weekendOffPeakAt,
      holidayOffPeakAt: cfg.holidayOffPeakAt,
      peakHours: cfg.peakHours
    },
    buckets: { today, week, total },
    days,
    activity: {
      weeks: ACTIVITY_WEEKS,
      start: dayKey(activityStart.getTime()),
      days: activity,
      summary: {
        lifetimeTokens: total.inputTokens + total.outputTokens + total.cacheReadTokens + total.cacheWriteTokens + total.reasoningTokens,
        peakDailyTokens,
        currentStreakDays: streaks.current,
        longestStreakDays: streaks.longest
      }
    },
    models,
    workspaces,
    sessions: rows
  };
}

/**
 * Current and longest consecutive-day streaks from the set of days that had
 * usage. Day keys are "YYYY-MM-DD"; runs are counted in local calendar days.
 */
function computeStreaks(usedDays, now) {
  let current = 0;
  let cursor = startOfDay(now);
  for (let i = 0; i < 3650; i += 1) {
    if (!usedDays.has(dayKey(cursor))) break;
    current += 1;
    cursor -= 86_400_000;
  }
  const keys = [...usedDays].sort();
  let longest = 0;
  let run = 0;
  let prev = null;
  for (const key of keys) {
    const ms = Date.parse(`${key}T00:00:00`);
    run = prev !== null && ms - prev === 86_400_000 ? run + 1 : 1;
    if (run > longest) longest = run;
    prev = ms;
  }
  return { current, longest };
}

/** Add one row's own bucket into an aggregate bucket. */
function mergeBucket(target, row) {
  target.calls += row.calls;
  target.inputTokens += row.inputTokens;
  target.outputTokens += row.outputTokens;
  target.cacheReadTokens += row.cacheReadTokens;
  target.cacheWriteTokens += row.cacheWriteTokens;
  target.reasoningTokens += row.reasoningTokens;
  target.cost += row.cost;
}

/** Fetch and normalize the DeepSeek account balance. */
async function fetchBalance(ctx, cfg) {
  const key = await resolveApiKey(ctx);
  if (!key) {
    return {
      ok: false,
      error: "NO_API_KEY",
      message: `未找到 ${API_KEY_REF}（可写入 ~/.dsh/.credentials.yaml 或环境变量）`
    };
  }
  let response;
  try {
    response = await fetch(BALANCE_URL, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(cfg.balanceTimeoutMs)
    });
  } catch (error) {
    return { ok: false, error: "NETWORK", message: String(error?.message ?? error) };
  }
  if (response.status === 401) {
    return { ok: false, error: "INVALID_API_KEY", message: "API Key 无效（401）" };
  }
  if (response.status === 402) {
    return { ok: false, error: "INSUFFICIENT_BALANCE", message: "余额不足（402）" };
  }
  if (!response.ok) {
    return { ok: false, error: `HTTP_${response.status}`, message: `余额接口返回 ${response.status}` };
  }
  let json;
  try {
    json = await response.json();
  } catch (error) {
    return { ok: false, error: "BAD_RESPONSE", message: "余额接口返回了无法解析的数据" };
  }
  const info = Array.isArray(json.balance_infos) ? json.balance_infos[0] : undefined;
  return {
    ok: true,
    fetchedAt: Date.now(),
    isAvailable: json.is_available === true,
    currency: info?.currency ?? null,
    totalBalance: info?.total_balance ?? null,
    grantedBalance: info?.granted_balance ?? null,
    toppedUpBalance: info?.topped_up_balance ?? null
  };
}

/**
 * Function plugin: registers the usage routes on the harness webserver.
 * @param ctx - host context with the injected services.
 * @param config - optional row config overriding {@link DEFAULTS}.
 */
function apply(ctx, config = {}) {
  const cfg = { ...DEFAULTS, ...(config ?? {}) };

  // Holiday calendar, resolved in priority order:
  //   1. `holidayRanges` in the row config — an explicit user override, which
  //      also disables the remote fetch entirely;
  //   2. the repo-hosted holidays.json (yearly maintenance = commit that file);
  //   3. the built-in HOLIDAYS_2026.
  // Steps 2 and 3 only ever replace the ranges wholesale after validation, so a
  // bad remote document can never produce a half-applied (mis-priced) calendar.
  const explicitRanges = Array.isArray(config?.holidayRanges) && config.holidayRanges.length > 0
    ? config.holidayRanges
    : null;
  // An explicit workday list is independent of the ranges: it must survive a
  // remote refresh (which would otherwise overwrite it with the file's own).
  const explicitWorkdays = Array.isArray(config?.holidayWorkdays) && config.holidayWorkdays.length > 0
    ? config.holidayWorkdays
    : null;
  const calendar = {
    source: explicitRanges === null ? "builtin" : "config",
    updatedAt: null,
    publisher: null,
    years: coveredYears(explicitRanges ?? cfg.holidayRanges),
    error: null
  };
  // `cfg` stays the single source the pure period functions read, so a fetched
  // calendar reaches the cost path by swapping these two arrays.
  if (explicitRanges !== null) {
    cfg.holidayRanges = explicitRanges;
    cfg.holidayWorkdays = explicitWorkdays ?? [];
  }
  let calendarAt = 0;
  let calendarInFlight = null;

  /**
   * Refresh the remote holiday calendar when due. Never throws: a failure is
   * recorded and the previous (or built-in) ranges stay in force.
   */
  async function ensureHolidayCalendar() {
    const url = cfg.holidayCalendarUrl;
    if (explicitRanges !== null || typeof url !== "string" || url.length === 0) return;
    if (Date.now() - calendarAt < cfg.holidayCalendarTtlMs) return;
    if (calendarInFlight !== null) return calendarInFlight;
    calendarInFlight = (async () => {
      try {
        const response = await fetch(url, {
          headers: { "User-Agent": "dsh-deepseek-usage" },
          signal: AbortSignal.timeout(cfg.holidayCalendarTimeoutMs)
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const parsed = parseHolidayCalendar(await response.json());
        cfg.holidayRanges = parsed.ranges;
        // A user-supplied workday list outranks the file's own.
        if (explicitWorkdays === null) cfg.holidayWorkdays = parsed.workdays;
        calendar.source = "remote";
        calendar.updatedAt = parsed.updatedAt;
        calendar.publisher = parsed.source;
        calendar.years = parsed.years;
        calendar.error = null;
      } catch (error) {
        // Keep whatever is already in force and let the panel say so.
        calendar.error = String(error?.message ?? error);
      } finally {
        calendarAt = Date.now();
        calendarInFlight = null;
      }
    })();
    return calendarInFlight;
  }

  /** Calendar provenance plus whether it actually covers the current Beijing year. */
  function calendarInfo(now) {
    const currentYear = beijingDayKey(cfg, now).slice(0, 4);
    const url = cfg.holidayCalendarUrl;
    return {
      source: calendar.source,
      updatedAt: calendar.updatedAt,
      publisher: calendar.publisher,
      years: calendar.years,
      currentYear,
      coversCurrentYear: calendar.years.includes(currentYear),
      url: typeof url === "string" && url.length > 0 ? url : null,
      error: calendar.error
    };
  }

  // Balance cache: positive results only, so a bad key stays loud on retry.
  let balanceCache = null; // { at, payload }

  async function getBalance() {
    if (balanceCache !== null && Date.now() - balanceCache.at < cfg.balanceTtlMs) return balanceCache.payload;
    const payload = await fetchBalance(ctx, cfg);
    if (payload.ok) balanceCache = { at: Date.now(), payload };
    return payload;
  }

  // Local-usage cache: same positive-only rule. The client refreshes the
  // sidebar badge on activity signals, so this short TTL is what keeps those
  // refreshes cheap instead of replaying session logs on every signal.
  let localCache = null; // { at, payload }

  async function getLocal() {
    if (localCache !== null && Date.now() - localCache.at < cfg.localTtlMs) return localCache.payload;
    const payload = await computeLocalUsage(ctx, cfg);
    if (payload.ok) localCache = { at: Date.now(), payload };
    return payload;
  }

  // Update check: the installed version (read from this package's manifest)
  // vs the latest GitHub release. Cached for updateCheckTtlMs; failures are
  // reported without crashing the panel.
  let updateCache = null; // { at, payload }

  async function getUpdate() {
    if (updateCache !== null && Date.now() - updateCache.at < cfg.updateCheckTtlMs) return updateCache.payload;
    let payload;
    try {
      let installed = "0.0.0";
      try {
        const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
        if (typeof manifest.version === "string" && manifest.version.length > 0) installed = manifest.version;
      } catch {
        /* keep the fallback */
      }
      const response = await fetch(cfg.updateCheckUrl, {
        headers: { "User-Agent": "dsh-deepseek-usage" },
        signal: AbortSignal.timeout(10_000)
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const json = await response.json();
      const latest = typeof json.version === "string" && json.version.length > 0 ? json.version : null;
      payload = {
        ok: true,
        checkedAt: Date.now(),
        installed,
        latest,
        updateAvailable: latest !== null && latest !== installed && semverGreater(latest, installed),
        url: cfg.updateReleasesUrl
      };
    } catch (error) {
      payload = { ok: false, error: String(error?.message ?? error) };
    }
    updateCache = { at: Date.now(), payload };
    return payload;
  }

  const disposers = [
    ctx.webServer.register({
      kind: "exact",
      path: "/dsh-usage/balance",
      handler: async (_req, res) => {
        try {
          sendJson(res, 200, await getBalance());
        } catch (error) {
          sendJson(res, 500, { ok: false, error: "INTERNAL", message: String(error?.message ?? error) });
        }
      }
    }),
    ctx.webServer.register({
      kind: "exact",
      path: "/dsh-usage/local",
      handler: async (_req, res) => {
        try {
          // Keep the calendar fresh on the hot path too: the badge refreshes
          // through here, so a newly published year lands without a restart.
          await ensureHolidayCalendar();
          sendJson(res, 200, await getLocal());
        } catch (error) {
          sendJson(res, 500, { ok: false, error: "INTERNAL", message: String(error?.message ?? error) });
        }
      }
    }),
    ctx.webServer.register({
      kind: "exact",
      path: "/dsh-usage/version",
      handler: async (_req, res) => {
        try {
          sendJson(res, 200, await getUpdate());
        } catch (error) {
          sendJson(res, 500, { ok: false, error: "INTERNAL", message: String(error?.message ?? error) });
        }
      }
    }),
    ctx.webServer.register({
      kind: "exact",
      path: "/dsh-usage/period",
      handler: async (_req, res) => {
        try {
          await ensureHolidayCalendar();
          const now = Date.now();
          const info = beijingPeriod(cfg, now);
          // Which rule makes today an all-day off-peak day, so the badge can
          // name it correctly (周末 vs 法定节假日) and anyone checking why a
          // given day priced the way it did can see the reason. `offPeakDay`
          // comes from the same predicate the pricing uses, so a `workdays`
          // override cannot leave the payload disagreeing with the rates.
          const holidayToday = beijingHoliday(cfg, now);
          const weekendToday = isBeijingWeekend(cfg, now);
          const offPeakDay = isBeijingOffPeakDay(cfg, now);
          sendJson(res, 200, {
            ok: true,
            now,
            period: info.period,
            range: info.range,
            nextAt: info.nextAt,
            nextPeriod: info.nextPeriod,
            newPricingAt: cfg.newPricingAt,
            weekendOffPeakAt: cfg.weekendOffPeakAt,
            holidayOffPeakAt: cfg.holidayOffPeakAt,
            offPeakDay,
            offPeakReason: !offPeakDay ? null : holidayToday !== null ? "holiday" : weekendToday ? "weekend" : null,
            holiday: holidayToday?.name ?? null,
            // Which holiday calendar is in force, and whether it covers the
            // current year — the panel warns when it does not, so a stale table
            // can never quietly over-estimate holidays.
            calendar: calendarInfo(now),
            peakHours: cfg.peakHours,
            timezoneOffsetMinutes: cfg.timezoneOffsetMinutes
          });
        } catch (error) {
          sendJson(res, 500, { ok: false, error: "INTERNAL", message: String(error?.message ?? error) });
        }
      }
    })
  ];

  // Cordis effects: the setup function runs immediately and must RETURN the
  // disposer, which the fiber runs on unload. Registering the routes is the
  // setup; unregistering them is the returned cleanup.
  ctx.effect(() => () => {
    for (const dispose of disposers) dispose();
  }, "deepseek-usage: routes");
}

/** Numeric three-part version compare (ignores prerelease suffixes). */
function semverGreater(a, b) {
  const pa = a.split(".").map((part) => parseInt(part, 10) || 0);
  const pb = b.split(".").map((part) => parseInt(part, 10) || 0);
  for (let i = 0; i < 3; i += 1) {
    if ((pa[i] ?? 0) > (pb[i] ?? 0)) return true;
    if ((pa[i] ?? 0) < (pb[i] ?? 0)) return false;
  }
  return false;
}

export { apply, inject, name };

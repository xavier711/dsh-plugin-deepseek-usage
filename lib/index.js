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
 *     `assistant/message` usage records (today / last 7 days / total).
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

/** Cordis plugin name (also the row id used in cordis.patch.yml). */
const name = "deepseek-usage";

/** Host services this plugin needs: the credential seam, session replay, and the web route registry. */
const inject = ["credentials", "sessionPersistence", "webServer"];

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
   * entry carries the flat rates in force until `newPricingAt`, plus the
   * peak/off-peak rates effective from then on:
   *
   *   - 2026-08-17 起 DeepSeek V4 系列采用峰谷定价（IT之家 2026-08-13 报道）：
   *     v4-flash 高峰 输入 ¥3.0 / 缓存命中 ¥0.10 / 输出 ¥9.0（空闲时段减半）；
   *     v4-pro 高峰 输入 ¥9.0 / 缓存命中 ¥0.30 / 输出 ¥27.0（空闲时段减半）。
   *   - 8/17 之前：v4-flash 输入 ¥1 / 缓存命中 ¥0.02 / 输出 ¥2；
   *     v4-pro 输入 ¥3 / 缓存命中 ¥0.025 / 输出 ¥6。
   *   - 旧模型 deepseek-chat / deepseek-reasoner 沿用 2025 年公开价。
   * `default` 用于未列入的模型（按 v4-flash 现价估算，标记 estimated）。
   */
  pricing: {
    "deepseek-v4-flash": {
      input: 1,
      cacheHit: 0.02,
      output: 2,
      peak: { input: 3, cacheHit: 0.1, output: 9 },
      offPeak: { input: 1.5, cacheHit: 0.05, output: 4.5 }
    },
    "deepseek-v4-pro": {
      input: 3,
      cacheHit: 0.025,
      output: 6,
      peak: { input: 9, cacheHit: 0.3, output: 27 },
      offPeak: { input: 4.5, cacheHit: 0.15, output: 13.5 }
    },
    "deepseek-chat": { input: 2, cacheHit: 0.5, output: 8 },
    "deepseek-reasoner": { input: 4, cacheHit: 1, output: 16 },
    default: { input: 1, cacheHit: 0.02, output: 2 }
  },
  /** Epoch ms when the peak/off-peak pricing takes effect (2026-08-17 00:00 北京时间). */
  newPricingAt: Date.UTC(2026, 7, 16, 16, 0, 0),
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
 * Beijing-local pricing period for one timestamp.
 *
 * Before `newPricingAt` the period is `flat` (single rates); afterwards it
 * alternates `peak`/`offPeak` around the configured `peakHours` windows.
 * @param cfg - plugin config (newPricingAt, peakHours, timezoneOffsetMinutes).
 * @param time - epoch ms of the moment to classify.
 * @returns `{ period, range, nextAt }` where `range` is the current segment
 * as Beijing minutes-of-day `[start, end)` (null when flat) and `nextAt` is
 * the epoch ms of the next boundary (the peak-pricing start when flat).
 */
function beijingPeriod(cfg, time) {
  const dayMs = 86_400_000;
  if (typeof time !== "number" || time < cfg.newPricingAt) {
    return { period: "flat", range: null, nextAt: typeof time === "number" ? cfg.newPricingAt : null };
  }
  const minutes = ((time + cfg.timezoneOffsetMinutes * 60_000) % dayMs) / 60_000;
  const windows = (cfg.peakHours ?? [])
    .filter((w) => Array.isArray(w) && w.length === 2 && w[1] > w[0])
    .map(([start, end]) => [start * 60, end * 60]);
  if (windows.length === 0) return { period: "flat", range: null, nextAt: null };
  const boundaries = [0, 1440];
  for (const [start, end] of windows) boundaries.push(start, end);
  boundaries.sort((a, b) => a - b);
  let range = null;
  for (let i = 0; i < boundaries.length - 1; i += 1) {
    if (minutes >= boundaries[i] && minutes < boundaries[i + 1]) {
      range = [boundaries[i], boundaries[i + 1]];
      break;
    }
  }
  if (range === null) range = [boundaries[boundaries.length - 1], 1440];
  const inWindow = windows.some(([start, end]) => minutes >= start && minutes < end);
  let next = null;
  for (const boundary of boundaries) {
    if (boundary > minutes && (next === null || boundary < next)) next = boundary;
  }
  if (next === null) next = boundaries[0] + 1440;
  return { period: inWindow ? "peak" : "offPeak", range, nextAt: time + (next - minutes) * 60_000 };
}

/**
 * Resolve the effective rates for one model call.
 * @param pricing - the configured per-model pricing table.
 * @param model - model id in force for the call.
 * @param time - epoch ms of the call (picks peak vs off-peak after `newPricingAt`).
 * @param cfg - plugin config (newPricingAt, peakHours, timezoneOffsetMinutes).
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
  const info = beijingPeriod(cfg, time);
  if (info.period === "flat" || typeof entry?.peak !== "object" || typeof entry?.offPeak !== "object") {
    return { ...flat, estimated: !known };
  }
  const rates = info.period === "peak" ? entry.peak : entry.offPeak;
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
 * Replay one persisted session log and fold it into token buckets.
 * Usage is attributed to the model in force (folded from the latest
 * `request/header` / `request/context` event) and priced per model.
 * @returns a per-session row, or an error row when the log cannot be read.
 */
async function foldSession(ctx, header, cfg, now) {
  const bucket = emptyBucket();
  const base = { id: header.id, title: undefined, createdAt: header.createdAt, lastActiveAt: header.createdAt, ...bucket };
  const todayKey = dayKey(now);
  const weekFloor = startOfDay(now) - 6 * 86_400_000;
  const today = emptyBucket();
  const week = emptyBucket();
  const byDay = Object.create(null);
  const byModel = Object.create(null);
  let model;
  try {
    const { events } = await ctx.sessionPersistence.inspect(header.id);
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
    headers = await ctx.sessionPersistence.list();
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
          const now = Date.now();
          const info = beijingPeriod(cfg, now);
          sendJson(res, 200, {
            ok: true,
            now,
            period: info.period,
            range: info.range,
            nextAt: info.nextAt,
            newPricingAt: cfg.newPricingAt,
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

#!/usr/bin/env node
/**
 * Generates screenshots/render-test.html — a self-contained page that loads
 * the REAL client bundle (lib/client.js), drives it with mocked services and
 * sample data, and renders the actual panel component. Screenshots taken
 * from this page are pixel-faithful to the plugin UI.
 *
 * Usage:
 *   node gen-render-test.js          # writes render-test.html
 *   # then headless-chrome screenshots (see AGENTS.md §3.6)
 */
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const client = readFileSync(join(root, 'lib/client.js'), 'utf8');

// ── extract the zh dictionary from the bundle for the t() mock ────────────
const zhMatch = client.match(/const zh = \{([\s\S]*?)\n    \};/);
if (!zhMatch) throw new Error('zh dictionary not found in bundle');
const zhSource = zhMatch[0].replace('const zh = ', 'window.__ZH = ');

// ── synthetic sample data for the fetch mock ──────────────────────────────
const pad = (x) => `${x}`.padStart(2, '0');
const now = new Date();
const todayKey = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 363);
start.setDate(start.getDate() - start.getDay()); // Sunday-aligned, 52 weeks

// daily token pattern: last 6 weeks active, deterministic
const levelToTokens = [0, 240_000, 520_000, 980_000, 1_900_000];
const activity = [];
for (let i = 0; i < 364; i += 1) {
  const d = new Date(start.getTime() + i * 864e5);
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const week = Math.floor(i / 7);
  const row = i % 7;
  let level = 0;
  if (week >= 46) {
    const pattern = [
      [1, 2, 0, 2, 1, 0, 0],
      [1, 2, 1, 3, 2, 1, 0],
      [2, 3, 2, 4, 3, 2, 1],
      [3, 4, 3, 4, 4, 3, 2],
      [2, 3, 4, 3, 4, 2, 1],
      [1, 2, 4, 1, 3, 4, 2]
    ];
    level = pattern[week - 46][row];
  }
  const tokens = levelToTokens[level];
  const calls = level > 0 ? 40 + level * 23 : 0;
  activity.push({
    date,
    calls,
    inputTokens: Math.round(tokens * 0.16),
    outputTokens: Math.round(tokens * 0.17),
    cacheReadTokens: Math.round(tokens * 0.65),
    cacheWriteTokens: 0,
    reasoningTokens: Math.round(tokens * 0.02),
    cost: tokens * 0.000001 + tokens * 0.02 * 0.00000002
  });
}
const usedDays = activity.filter((d) => d.calls > 0).length;
const lifetime = activity.reduce((s, d) => s + d.cacheReadTokens + d.inputTokens + d.outputTokens + d.reasoningTokens, 0);
const peak = Math.max(...activity.map((d) => d.cacheReadTokens + d.inputTokens + d.outputTokens + d.reasoningTokens));

const day = (offset) => {
  const d = new Date(now.getTime() - offset * 864e5);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const bucket = (date, tokens, calls) => ({
  date,
  calls,
  inputTokens: Math.round(tokens * 0.16),
  outputTokens: Math.round(tokens * 0.17),
  cacheReadTokens: Math.round(tokens * 0.65),
  cacheWriteTokens: 0,
  reasoningTokens: Math.round(tokens * 0.02),
  cost: tokens * 0.000001
});
const days7 = [6, 5, 4, 3, 2, 1, 0].map((off, i) => bucket(day(off), [1.2, 3.4, 2.1, 4.8, 6.2, 3.9, 2.4][i] * 1e6, 60 + i * 12));

// ── current Beijing pricing period (mirrors lib/index.js beijingPeriod) ────
const BEIJING_OFFSET = 480;
const periodNow = Date.now();
const periodMinutes = ((periodNow + BEIJING_OFFSET * 60_000) % 864e5) / 60_000;
const periodWindows = [[9 * 60, 12 * 60], [14 * 60, 18 * 60]];
const periodBoundaries = [0, 1440, ...periodWindows.flat()].sort((a, b) => a - b);
let periodRange = null;
for (let i = 0; i < periodBoundaries.length - 1; i += 1) {
  if (periodMinutes >= periodBoundaries[i] && periodMinutes < periodBoundaries[i + 1]) {
    periodRange = [periodBoundaries[i], periodBoundaries[i + 1]];
    break;
  }
}
if (periodRange === null) periodRange = [periodBoundaries[periodBoundaries.length - 1], 1440];
const periodIsPeak = periodWindows.some(([s, e]) => periodMinutes >= s && periodMinutes < e);
let periodNext = null;
for (const b of periodBoundaries) {
  if (b > periodMinutes && (periodNext === null || b < periodNext)) periodNext = b;
}
if (periodNext === null) periodNext = periodBoundaries[0] + 1440;
const periodPayload = {
  ok: true,
  now: periodNow,
  period: periodIsPeak ? 'peak' : 'offPeak',
  range: periodRange,
  nextAt: periodNow + (periodNext - periodMinutes) * 60_000,
  nextPeriod: periodIsPeak ? 'offPeak' : 'peak',
  newPricingAt: Date.UTC(2026, 7, 16, 16, 0, 0),
  weekendOffPeakAt: Date.UTC(2026, 7, 22, 16, 0, 0),
  holidayOffPeakAt: Date.UTC(2026, 8, 18, 16, 0, 0),
  offPeakDay: false,
  offPeakReason: null,
  holiday: null,
  // 假期表来源与覆盖年份：合成数据按「已覆盖」渲染，未覆盖告警条不出现。
  calendar: { source: 'builtin', updatedAt: null, publisher: null, years: ['2026'], currentYear: '2026', coversCurrentYear: true, url: null, error: null },
  peakHours: [[9, 12], [14, 18]],
  timezoneOffsetMinutes: BEIJING_OFFSET
};

const sample = {
  '/dsh-usage/balance': {
    ok: true,
    fetchedAt: Date.now(),
    isAvailable: true,
    currency: 'CNY',
    totalBalance: '128.45',
    grantedBalance: '0.00',
    toppedUpBalance: '128.45'
  },
  '/dsh-usage/local': {
    ok: true,
    fetchedAt: Date.now(),
    sessionCount: 3,
    errorSessions: 0,
    pricing: { currency: 'CNY', note: 'official', newPricingAt: Date.now(), weekendOffPeakAt: Date.UTC(2026, 7, 22, 16, 0, 0), holidayOffPeakAt: Date.UTC(2026, 8, 18, 16, 0, 0), peakHours: [[9, 12], [14, 18]] },
    buckets: {
      today: days7[6],
      week: bucket(day(0), 24e6, 512),
      total: bucket(day(0), 450e6, 1204)
    },
    days: days7,
    activity: {
      weeks: 52,
      start: activity[0].date,
      days: activity,
      summary: {
        lifetimeTokens: lifetime,
        peakDailyTokens: peak,
        currentStreakDays: 2,
        longestStreakDays: 12
      }
    },
    models: [
      { model: 'deepseek-v4-flash', estimated: false, calls: 1105, inputTokens: 3600000, outputTokens: 3900000, cacheReadTokens: 15200000, cacheWriteTokens: 0, reasoningTokens: 780000, cost: 33.24 },
      { model: 'deepseek-v4-pro', estimated: false, calls: 99, inputTokens: 220000, outputTokens: 260000, cacheReadTokens: 900000, cacheWriteTokens: 0, reasoningTokens: 41000, cost: 5.66 }
    ],
    sessions: [
      { id: 's1', title: '优化支付网关性能', workspace: '/Users/alice/dev/payment-gateway', subagent: false, createdAt: Date.now() - 864e5, lastActiveAt: Date.now() - 3600e3, calls: 618, inputTokens: 1900000, outputTokens: 2100000, cacheReadTokens: 8100000, cacheWriteTokens: 0, reasoningTokens: 420000, cost: 18.2, error: null },
      { id: 's2', title: '整理项目文档', workspace: '/Users/alice/docs', subagent: false, createdAt: Date.now() - 2 * 864e5, lastActiveAt: Date.now() - 2 * 864e5, calls: 402, inputTokens: 1300000, outputTokens: 1500000, cacheReadTokens: 5600000, cacheWriteTokens: 0, reasoningTokens: 300000, cost: 12.4, error: null },
      { id: 's3', title: '修复 CI 流水线', workspace: '/Users/alice/ci-infra', subagent: false, createdAt: Date.now() - 3 * 864e5, lastActiveAt: Date.now() - 3 * 864e5, calls: 184, inputTokens: 500000, outputTokens: 600000, cacheReadTokens: 2100000, cacheWriteTokens: 0, reasoningTokens: 120000, cost: 4.8, error: null },
      { id: 's4', title: '整理项目文档（子代理）', workspace: '/Users/alice/docs', subagent: true, createdAt: Date.now() - 2 * 864e5, lastActiveAt: Date.now() - 864e5, calls: 36, inputTokens: 90000, outputTokens: 110000, cacheReadTokens: 420000, cacheWriteTokens: 0, reasoningTokens: 21000, cost: 0.6, error: null },
      { id: 's5', title: '临时想法速记', workspace: null, subagent: false, createdAt: Date.now() - 4 * 864e5, lastActiveAt: Date.now() - 4 * 864e5, calls: 27, inputTokens: 60000, outputTokens: 80000, cacheReadTokens: 300000, cacheWriteTokens: 0, reasoningTokens: 9000, cost: 0.3, error: null }
    ],
    workspaces: [
      {
        path: '/Users/alice/dev/payment-gateway',
        name: 'payment-gateway',
        sessionCount: 1,
        subagentSessionCount: 0,
        buckets: { today: bucket(day(0), 2.4e6, 38), week: bucket(day(0), 11.2e6, 214), total: bucket(day(0), 76e6, 618) },
        sessions: [
          { id: 's1', title: '优化支付网关性能', subagent: false, createdAt: Date.now() - 864e5, lastActiveAt: Date.now() - 3600e3, calls: 618, inputTokens: 1900000, outputTokens: 2100000, cacheReadTokens: 8100000, cacheWriteTokens: 0, reasoningTokens: 420000, cost: 18.2 }
        ]
      },
      {
        path: '/Users/alice/docs',
        name: 'docs',
        sessionCount: 2,
        subagentSessionCount: 1,
        buckets: { today: bucket(day(0), 1.1e6, 22), week: bucket(day(0), 8.6e6, 160), total: bucket(day(0), 53e6, 438) },
        sessions: [
          { id: 's2', title: '整理项目文档', subagent: false, createdAt: Date.now() - 2 * 864e5, lastActiveAt: Date.now() - 2 * 864e5, calls: 402, inputTokens: 1300000, outputTokens: 1500000, cacheReadTokens: 5600000, cacheWriteTokens: 0, reasoningTokens: 300000, cost: 12.4 },
          { id: 's4', title: '整理项目文档（子代理）', subagent: true, createdAt: Date.now() - 2 * 864e5, lastActiveAt: Date.now() - 864e5, calls: 36, inputTokens: 90000, outputTokens: 110000, cacheReadTokens: 420000, cacheWriteTokens: 0, reasoningTokens: 21000, cost: 0.6 }
        ]
      },
      {
        path: '/Users/alice/ci-infra',
        name: 'ci-infra',
        sessionCount: 1,
        subagentSessionCount: 0,
        buckets: { today: bucket(day(0), 0.6e6, 9), week: bucket(day(0), 4.2e6, 71), total: bucket(day(0), 21e6, 184) },
        sessions: [
          { id: 's3', title: '修复 CI 流水线', subagent: false, createdAt: Date.now() - 3 * 864e5, lastActiveAt: Date.now() - 3 * 864e5, calls: 184, inputTokens: 500000, outputTokens: 600000, cacheReadTokens: 2100000, cacheWriteTokens: 0, reasoningTokens: 120000, cost: 4.8 }
        ]
      },
      {
        path: null,
        name: null,
        sessionCount: 1,
        subagentSessionCount: 0,
        buckets: { today: bucket(day(0), 0.1e6, 2), week: bucket(day(0), 0.5e6, 11), total: bucket(day(0), 1.4e6, 27) },
        sessions: [
          { id: 's5', title: '临时想法速记', subagent: false, createdAt: Date.now() - 4 * 864e5, lastActiveAt: Date.now() - 4 * 864e5, calls: 27, inputTokens: 60000, outputTokens: 80000, cacheReadTokens: 300000, cacheWriteTokens: 0, reasoningTokens: 9000, cost: 0.3 }
        ]
      }
    ]
  },
  '/dsh-usage/version': {
    ok: true,
    checkedAt: Date.now(),
    // 静态初值；页面里的 fetch stub 会按 upgraded 现算 installed / updateAvailable
    installed: '0.6.0',
    latest: '0.6.1',
    updateAvailable: true,
    url: 'https://github.com/xavier711/dsh-deepseek-usage/releases',
    installKind: 'git',
    spec: 'git+https://github.com/xavier711/dsh-deepseek-usage.git#v0.6.1',
    canInstall: true
  },
  '/dsh-usage/update': { ok: true, reason: 'installed', latest: '0.6.1', application: 'applied' },
  '/dsh-usage/period': periodPayload
};
const sampleJson = JSON.stringify(sample, null, 1).replaceAll('</', '<\\/');

// ── theme variables (approximation of the harness design tokens) ──────────
const themeCss = `
  :root, [data-theme="dark"] {
    color-scheme: dark;
    --dsw-alias-bg-base: #1b1d21;
    --dsw-alias-label-primary: #e9eaee;
    --dsw-alias-label-secondary: #c4c8d0;
    --dsw-alias-label-tertiary: #8b919d;
    --dsw-alias-label-caption: #6b7280;
    --dsw-alias-border-l1: #2a2d33;
    --dsw-alias-border-l2: #32353d;
    --dsw-alias-border-inverted: rgba(255,255,255,.06);
    --dsw-alias-fill-l2: #262a30;
    --dsw-alias-interactive-bg-hover: rgba(255,255,255,.06);
    --dsw-alias-interactive-bg-hover-solid: rgba(255,255,255,.09);
    --dsw-alias-state-business-primary: #4c8dff;
    --dsw-alias-state-business-tertiary: rgba(76,141,255,.12);
    --dsw-alias-state-success-primary: #3fb68b;
    --dsw-alias-state-success-tertiary: rgba(63,182,139,.16);
    --dsw-alias-state-warn-primary: #d9a13b;
    --dsw-alias-state-error-primary: #e5534b;
    --dsw-alias-scrollbar-bg-l2: rgba(255,255,255,.14);
    --dsw-alias-scrollbar-hover-l2: rgba(255,255,255,.24);
    --dsw-shadow-lv3: 0 16px 44px rgba(0,0,0,.5);
    --dsh-font-mono: ui-monospace, SFMono-Regular, Menlo, monospace;
  }
  [data-theme="light"] {
    color-scheme: light;
    --dsw-alias-bg-base: #ffffff;
    --dsw-alias-label-primary: #1f2328;
    --dsw-alias-label-secondary: #3d444d;
    --dsw-alias-label-tertiary: #6a737d;
    --dsw-alias-label-caption: #8b949e;
    --dsw-alias-border-l1: #d8dee4;
    --dsw-alias-border-l2: #e5e9ee;
    --dsw-alias-border-inverted: rgba(0,0,0,0);
    --dsw-alias-fill-l2: #f0f2f5;
    --dsw-alias-interactive-bg-hover: rgba(0,0,0,.05);
    --dsw-alias-interactive-bg-hover-solid: rgba(0,0,0,.08);
    --dsw-alias-state-business-primary: #0969da;
    --dsw-alias-state-business-tertiary: rgba(9,105,218,.1);
    --dsw-alias-state-success-primary: #1a7f37;
    --dsw-alias-state-success-tertiary: rgba(26,127,55,.12);
    --dsw-alias-state-warn-primary: #9a6700;
    --dsw-alias-state-error-primary: #cf222e;
    --dsw-alias-scrollbar-bg-l2: rgba(0,0,0,.14);
    --dsw-alias-scrollbar-hover-l2: rgba(0,0,0,.24);
    --dsw-shadow-lv3: 0 16px 44px rgba(31,35,40,.14);
  }
`;

// ── the page ───────────────────────────────────────────────────────────────
const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<title>dsh-deepseek-usage — real component render (synthetic data)</title>
<style>
  ${themeCss}
  body { margin: 0; padding: 24px; background: var(--dsw-alias-bg-base); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; }
  /* panel rendered statically at full height for capture;
     badge hidden once the panel is open (it is the footer trigger in the real UI) */
  #root .du-panel { position: static !important; max-height: none !important; bottom: auto !important; left: auto !important; }
  body.shot #root .du-badge { display: none !important; }
</style>
<script>
  /* The body does not exist yet here; the theme marker is set at DOMContentLoaded
     below, before the bundle renders. */
  if (location.hash.indexOf('light') >= 0) document.documentElement.setAttribute('data-theme', 'light');
</script>
<script src="vendor/react.production.min.js"></script>
<script src="vendor/react-dom.production.min.js"></script>
<script>
  // ── module loader stub: capture the bundle factory ──
  window.__ModuleLoader__ = { load: (handoff) => { window.__factory = handoff.factory; } };
  // ── primitives stub (visual approximations, theme-aware) ──
  const svg = (w, h, children, extra) => React.createElement('svg', Object.assign({ width: w, height: h, viewBox: '0 0 ' + w + ' ' + h, fill: 'currentColor', 'aria-hidden': true }, extra || {}), children);
  window.__prim = {
    IconDataOutlineRegular: ({ size = 16 }) => svg(size, size, [React.createElement('rect', { x: 2.2, y: 8, width: 3, height: 5.6, rx: 1.1 }), React.createElement('rect', { x: 6.5, y: 4.8, width: 3, height: 8.8, rx: 1.1 }), React.createElement('rect', { x: 10.8, y: 2.4, width: 3, height: 11.2, rx: 1.1 })]),
    IconRefreshOutlineRegular: ({ size = 16 }) => svg(size, size, [React.createElement('path', { d: 'M13.2 8a5.2 5.2 0 1 1-1.5-3.7', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' }), React.createElement('path', { d: 'M13.2 2.8v3h-3', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' })], { fill: 'none' }),
    IconCloseOutlineRegular: ({ size = 16 }) => svg(size, size, [React.createElement('path', { d: 'M4 4l8 8M12 4l-8 8', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' })], { fill: 'none' }),
    IconChevronUpOutlineRegular: ({ size = 14 }) => svg(size, size, [React.createElement('path', { d: 'M7 11V3M3.5 6.5 7 3l3.5 3.5', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' })], { fill: 'none' }),
    IconChevronRightOutlineRegular: ({ size = 14 }) => svg(size, size, [React.createElement('path', { d: 'M5 3.5 9.5 7 5 10.5', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' })], { fill: 'none' }),
    IconChevronDownOutlineRegular: ({ size = 14 }) => svg(size, size, [React.createElement('path', { d: 'M3.5 5 7 9.5 10.5 5', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' })], { fill: 'none' }),
    Tooltip: (props) => props.children
  };
</script>
<script>
${zhSource}
</script>
<script src="../lib/client.js"></script>
<script>
  // ── require for the bundle factory ──
  document.addEventListener('DOMContentLoaded', () => {
  /* Mirror the host: DSH marks dark mode with body[data-ds-dark-theme] (see
     packages/client/ui-theme), and that is what the plugin's dark colour ramp
     keys off. Without this the "dark" screenshot would silently render the light
     cells, so a dark-mode colour regression could never show up here. */
  if (location.hash.indexOf('light') >= 0) document.body.removeAttribute('data-ds-dark-theme');
  else document.body.setAttribute('data-ds-dark-theme', '');
  const req = (spec) => {
    if (spec === 'react') return React;
    if (spec === 'react/jsx-runtime') return { jsx: React.createElement, jsxs: React.createElement, Fragment: React.Fragment };
    if (spec === '@deepseek-ai/dsh-client-ui-primitives') return window.__prim;
    throw new Error('unexpected require: ' + spec);
  };
  const mod = window.__factory(req);

  // ── fetch mock with sample data ──
  const SAMPLE = ${sampleJson};
  // 走完「点更新 → 版本翻新」的流程用；必须声明在页面里，不是生成器里
  let upgraded = false;
  window.fetch = (url, options) => {
    if (String(url).includes('/dsh-usage/update') && options && options.method === 'POST') upgraded = true;
    const body = SAMPLE[String(url)];
    // version 的 installed 依赖 upgraded，所以每次现算一遍，不能直接用序列化好的常量
    if (String(url).includes('/dsh-usage/version')) {
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ ...body, installed: upgraded ? '0.6.1' : '0.6.0', updateAvailable: !upgraded }) });
    }
    return Promise.resolve({ ok: true, status: 200, json: async () => body || { ok: false, error: 'unknown', message: url } });
  };

  // ── fake services; capture the registered component per slot ──
  let component = null;
  const slotCallbacks = {};
  const ctx = {
    effect: () => () => {},
    locale: { register: () => () => {} },
    slots: {
      inject: (name, cb) => { slotCallbacks[name] = cb; },
      register: (opts, comp) => { if (opts.name === 'sidebar.footer.action') component = comp; return () => {}; }
    }
  };
  mod.apply(ctx);
  // 插件会向多个 slot 注册（侧边栏入口 + 「插件」页的配置页），这里只要面板那个。
  slotCallbacks['sidebar.footer.action']();

  // ── t(): zh dictionary lookup with {param} substitution ──
  const t = (key, params) => {
    let text = window.__ZH[key] ?? key;
    if (params) for (const [k, v] of Object.entries(params)) text = text.replaceAll('{' + k + '}', String(v));
    return text;
  };

  // ── render the real panel component, then open it ──
  window.__errs = [];
  window.addEventListener('error', (e) => window.__errs.push(String(e.message || e.error)));
  window.addEventListener('unhandledrejection', (e) => window.__errs.push('rej:' + String(e.reason)));
  const meta = document.createElement('div');
  meta.id = 'meta';
  meta.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;overflow:hidden;';
  meta.textContent = 'ready';
  document.body.appendChild(meta);
  const root = document.getElementById('root');
  ReactDOM.render(React.createElement(component, { wide: true, t }), root);
  setTimeout(() => {
    try {
      const badge = document.querySelector('.du-badge');
      if (badge) badge.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      document.body.classList.add('shot');
      meta.textContent = 'clicked';
    } catch (err) { meta.textContent = 'click-err:' + err.message; }
  }, 50);
  // Panel data loads asynchronously; expand the "docs" workspace (its session
  // records) once the local-usage sections are on screen.
  setTimeout(() => {
    try {
      const wsHeaders = document.querySelectorAll('.du-wsHeader');
      for (const h of wsHeaders) {
        if (h.textContent.includes('docs')) { h.dispatchEvent(new MouseEvent('click', { bubbles: true })); break; }
      }
      meta.textContent = 'expanded';
    } catch (err) { meta.textContent = 'expand-err:' + err.message; }
  }, 1200);
  setTimeout(() => {
    try {
      const panel = document.querySelector('.du-panel');
      const r = panel ? panel.getBoundingClientRect() : null;
      /* Heatmap probe: HEAT = cell count, LVL = how many cells landed in each
         level. A grid that rendered but came out all level 0 (or invisible
         against the panel) shows up here as LVL=365/0/0/0/0 instead of needing
         someone to eyeball a PNG. Also verifies the grid fits: gridW <= cardW. */
      const cells = [...document.querySelectorAll('.du-activityCell')];
      const lvl = [0, 0, 0, 0, 0];
      for (const cell of cells) lvl[Number(cell.dataset.level) || 0] += 1;
      const grid = document.querySelector('.du-activityGrid');
      const card = grid ? grid.closest('.du-card') : null;
      const gridW = grid ? Math.round(grid.getBoundingClientRect().width) : 0;
      const cardW = card ? Math.round(card.getBoundingClientRect().width) : 0;
      /* Width budget: the grid has to fit inside the card's content box next to
         the weekday labels. Compare the *content* box, not the border box — the
         grid is clipped silently by .du-body{overflow-x:hidden} otherwise. */
      let budget = 'n/a';
      if (grid && card) {
        const cs = getComputedStyle(card);
        const content = card.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
        const labels = document.querySelector('.du-activityLabels');
        const labelsW = labels ? labels.getBoundingClientRect().width : 0;
        const gap = parseFloat(getComputedStyle(grid.parentElement).columnGap) || 0;
        budget = Math.round(content) + ':' + Math.round(content - labelsW - gap) + ':' + (gridW <= content - labelsW - gap ? 'fit' : 'OVERFLOW');
      }
      const themed = document.body.hasAttribute('data-ds-dark-theme') ? 'dark' : 'light';
      /* Month labels are absolutely positioned: two of them can silently overlap
         each other (or the card edge) without changing any box measurement. */
      const monthEls = [...document.querySelectorAll('.du-activityMonth')].map((el) => el.getBoundingClientRect());
      let overlaps = 0;
      for (let i = 1; i < monthEls.length; i += 1) if (monthEls[i].left < monthEls[i - 1].right) overlaps += 1;
      /* Colours actually painted per level, against the card background: the
         "heatmap came out invisible" bug was a colour problem, and it is cheaper
         to assert the five fills differ from the card than to eyeball a PNG. */
      const fillOf = (level) => {
        const el = document.querySelector('.du-activityCell[data-level="' + level + '"]');
        return el ? getComputedStyle(el).backgroundColor : 'none';
      };
      /* [0-9] rather than \d on purpose: this block lives inside a template
         literal, where an unknown escape like \d silently collapses to "d" and
         the regex then matches nothing (the check would read as "0 distance"). */
      const rgb = (value) => {
        const parts = (value.match(/[0-9]+/g) || []).map(Number);
        /* 只认 rgb()/rgba()：color-mix()/oklab() 的计算值是别的语法，硬解析会得出
           134167 这种荒唐的距离，比报错更危险 —— 所以宁可返回 null。 */
        /* 用 startsWith 而不是正则：正则里的转义在这个模板字符串里会被吃掉
           （\\( 变成 (，正则直接语法错误；之前 \\d 变成 d 也是同一个坑）。 */
        const looksRgb = value.startsWith('rgb(') || value.startsWith('rgba(');
        return looksRgb && parts.length >= 3 ? parts.slice(0, 3) : null;
      };
      const distance = (a, b) => {
        const left = rgb(a), right = rgb(b);
        if (left === null || right === null || left.length !== right.length) return null;
        return Math.max(...left.map((v, i) => Math.abs(v - right[i])));
      };
      const cardBg = card ? getComputedStyle(card).backgroundColor : 'none';
      const fills = [0, 1, 2, 3, 4].map(fillOf);
      const visible = fills.map((fill, level) => level === 0 ? distance(fill, cardBg) >= 6 : true).every(Boolean);
      const gaps = fills.map((fill, level) => level === 0 ? 0 : distance(fill, cardBg));
      const spread = gaps.some((v) => v === null) ? "未知" : Math.max(...gaps);
      const gbox = grid ? grid.getBoundingClientRect() : null;

      /* 动画探针：图表入场动画是 css keyframes，光看盒子量不出来，所以直接问
         计算样式和 Web Animations API —— 减少动态效果下必须 none 且内容仍可见。 */
      const barRect = document.querySelector('.du-bars rect');
      const heatCell = document.querySelector('.du-activityCell');
      const animOf = (el) => el === null ? 'missing' : (getComputedStyle(el).animationName || 'none');
      const opacityOf = (el) => el === null ? 'missing' : getComputedStyle(el).opacity;
      const running = (el) => el === null ? 0 : el.getAnimations().filter((a) => a.playState === 'running').length;
      const cellCount = document.querySelectorAll('.du-activityCell').length;
      const barsCount = document.querySelectorAll('.du-bars rect').length;
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const anim = ' MODE=' + (reduced ? 'reduced-motion' : 'normal')
        + ' BARANIM=' + animOf(barRect) + ' HEATANIM=' + animOf(heatCell)
        + ' BAROPACITY=' + opacityOf(barRect) + ' HEATOPACITY=' + opacityOf(heatCell)
        + ' BARRECTS=' + barsCount + ' CELLS=' + cellCount
        + ' RUNNING=' + (running(barRect) + running(heatCell))
        + ' STABLE=' + ((barRect && heatCell && barRect.getAnimations().concat(heatCell.getAnimations()).every((a) => a.playState === 'finished')) ? 'yes' : 'no');
      meta.textContent = 'PH=' + (r ? Math.round(r.height) : 'none') + ' PW=' + (r ? Math.round(r.width) : 'none') + ' SW=' + document.body.scrollWidth + ' CW=' + document.body.clientWidth + ' BH=' + document.body.scrollHeight + ' THEME=' + themed + ' HEAT=' + cells.length + ' LVL=' + lvl.join('/') + ' MONTH=' + monthEls.length + ' MOVL=' + overlaps + ' BUDGET=' + budget + ' GBOX=' + (gbox ? [Math.round(gbox.left), Math.round(gbox.top), Math.round(gbox.width), Math.round(gbox.height)].join(',') : 'none') + ' L0=' + fills[0] + ' L4=' + fills[4] + ' CARDBG=' + cardBg + ' CELLVIS=' + (visible ? 'ok' : 'INVISIBLE') + ' SPREAD=' + spread + (location.hash.indexOf('anim=1') >= 0 ? anim : '') + ' ERRS=' + (window.__errs.length ? window.__errs.join('|') : 'none');
      document.title = meta.textContent;
    } catch (err) { meta.textContent = 'meas-err:' + err.message; }
  }, 1600);
  });
</script>
</head>
<body><div id="root"></div></body>
</html>
`;

mkdirSync(join(here, 'vendor'), { recursive: true });
// Vendor UMD builds are copied once and then kept in the repo; skip the copy
// when the destination already exists so regeneration works on machines where
// the profile node_modules path has moved (react UMD builds are stable).
const vendorPairs = [
  ['react', 'react.production.min.js'],
  ['react-dom', 'react-dom.production.min.js']
];
for (const [pkg, file] of vendorPairs) {
  const dest = join(here, 'vendor', file);
  if (existsSync(dest)) continue;
  copyFileSync(join(process.env.HOME, '.dsh', 'profiles', 'node_modules', pkg, 'umd', file), dest);
}
writeFileSync(join(here, 'render-test.html'), html);
console.log('render-test.html written (bundle inlined, vendor react copied)');

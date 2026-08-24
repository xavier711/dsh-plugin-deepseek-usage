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
    pricing: { currency: 'CNY', note: 'official', newPricingAt: Date.now(), weekendOffPeakAt: Date.UTC(2026, 7, 22, 16, 0, 0), peakHours: [[9, 12], [14, 18]] },
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
    installed: '0.1.0',
    latest: '0.4.0',
    updateAvailable: true,
    url: 'https://github.com/xavier711/dsh-deepseek-usage/releases'
  },
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
  if (location.hash === '#light') document.documentElement.setAttribute('data-theme', 'light');
</script>
<script src="vendor/react.production.min.js"></script>
<script src="vendor/react-dom.production.min.js"></script>
<script>
  // ── module loader stub: capture the bundle factory ──
  window.__ModuleLoader__ = { load: (handoff) => { window.__factory = handoff.factory; } };
  // ── primitives stub (visual approximations, theme-aware) ──
  const svg = (w, h, children, extra) => React.createElement('svg', Object.assign({ width: w, height: h, viewBox: '0 0 ' + w + ' ' + h, fill: 'currentColor', 'aria-hidden': true }, extra || {}), children);
  window.__prim = {
    IconDataOutline16: (p) => svg(16, 16, [React.createElement('rect', { x: 2.2, y: 8, width: 3, height: 5.6, rx: 1.1 }), React.createElement('rect', { x: 6.5, y: 4.8, width: 3, height: 8.8, rx: 1.1 }), React.createElement('rect', { x: 10.8, y: 2.4, width: 3, height: 11.2, rx: 1.1 })]),
    IconRefreshOutline16: (p) => svg(16, 16, [React.createElement('path', { d: 'M13.2 8a5.2 5.2 0 1 1-1.5-3.7', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' }), React.createElement('path', { d: 'M13.2 2.8v3h-3', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' })], { fill: 'none' }),
    IconCloseOutline16: (p) => svg(16, 16, [React.createElement('path', { d: 'M4 4l8 8M12 4l-8 8', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' })], { fill: 'none' }),
    IconChevronUpOutline14: (p) => svg(14, 14, [React.createElement('path', { d: 'M7 11V3M3.5 6.5 7 3l3.5 3.5', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' })], { fill: 'none' }),
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
  const req = (spec) => {
    if (spec === 'react') return React;
    if (spec === 'react/jsx-runtime') return { jsx: React.createElement, jsxs: React.createElement, Fragment: React.Fragment };
    if (spec === '@deepseek-ai/dsh-client-ui-primitives') return window.__prim;
    throw new Error('unexpected require: ' + spec);
  };
  const mod = window.__factory(req);

  // ── fetch mock with sample data ──
  const SAMPLE = ${sampleJson};
  window.fetch = (url) => Promise.resolve({ ok: true, status: 200, json: async () => SAMPLE[url] || { ok: false, error: 'unknown', message: url } });

  // ── fake services; capture the registered component ──
  let component = null;
  const ctx = {
    effect: () => () => {},
    locale: { register: () => () => {} },
    slots: {
      inject: (name, cb) => { window.__slot = cb; },
      register: (opts, comp) => { component = comp; return () => {}; }
    }
  };
  mod.apply(ctx);
  window.__slot();

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
  // records) and the global session list (per-session workspace tags) only
  // once the local-usage sections are on screen.
  setTimeout(() => {
    try {
      const wsRows = document.querySelectorAll('.du-modelRow');
      for (const row of wsRows) {
        if (row.textContent.includes('docs')) {
          const tg = row.querySelector('.du-sessionToggle');
          if (tg) tg.dispatchEvent(new MouseEvent('click', { bubbles: true }));
          break;
        }
      }
      // Workspace rows render their toggles before the global one, so the
      // global session toggle is the LAST .du-sessionToggle on the page.
      const toggles = document.querySelectorAll('.du-sessionToggle');
      const toggle = toggles[toggles.length - 1];
      if (toggle) toggle.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      meta.textContent = 'expanded';
    } catch (err) { meta.textContent = 'expand-err:' + err.message; }
  }, 1200);
  setTimeout(() => {
    try {
      const panel = document.querySelector('.du-panel');
      const r = panel ? panel.getBoundingClientRect() : null;
      meta.textContent = 'PH=' + (r ? Math.round(r.height) : 'none') + ' PW=' + (r ? Math.round(r.width) : 'none') + ' SW=' + document.body.scrollWidth + ' CW=' + document.body.clientWidth + ' BH=' + document.body.scrollHeight + ' ERRS=' + (window.__errs.length ? window.__errs.join('|') : 'none');
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

# dsh-deepseek-usage

[中文版](README.zh.md)

A DeepSeek usage panel plugin for the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Web GUI. It adds a **「Usage / 用量」** entry at the bottom of the left sidebar showing:

- **Account balance** — queried live from the official endpoint `GET /user/balance` (total, topped-up, granted).
- **Local usage** — replays your own session logs (which store the official per-request `usage` records) and shows: today / last 7 days / all time, a 7-day chart, today's token composition, per-session breakdown, and **per-model statistics**.
- **Cost estimate** — priced **per model** at official DeepSeek rates (CNY per 1M tokens), including the V4 peak/off-peak pricing effective 2026-08-17 (peak hours in Beijing time are applied automatically).

> Note: DeepSeek's API does not expose an account-level usage endpoint (all candidate paths return 404 in practice). The usage data therefore comes from your local session logs — which contain the exact `usage` values returned by the official API for every request.

## Screenshots

The panel opens from the **「用量」** entry at the sidebar foot. All figures below are **synthetic sample data** — no real balance, keys, tokens, or session content.

| Dark theme | Light theme |
|---|---|
| ![Usage panel, dark theme](screenshots/panel-dark.png) | ![Usage panel, light theme](screenshots/panel-light.png) |

## Install (pick one)

You need **Node.js** first (download from [nodejs.org](https://nodejs.org)).

### Option A: Install straight from GitHub (recommended, one command)

Paste this into a terminal:

```sh
dsh plugin --profile web add git+https://github.com/xavier711/dsh-deepseek-usage.git#v0.2.0
```

**Don't have `dsh` installed globally?** Use this instead (`npx` downloads it on first run):

```sh
npx --yes @deepseek-ai/dsh plugin --profile web add git+https://github.com/xavier711/dsh-deepseek-usage.git#v0.2.0
```

> Tip: if the installer complains that `pnpm` is missing, run `npm install -g pnpm` and retry.

### Option B: Clone + one-shot script

```sh
git clone https://github.com/xavier711/dsh-deepseek-usage.git
cd dsh-deepseek-usage
./install.sh     # auto-uses npx when dsh is not on PATH
```

### Option C: npm (once published)

```sh
dsh plugin --profile web add @xavier711/dsh-deepseek-usage
```

---

### After installing (any option)

1. **Restart the web server**: `Ctrl+C` in the terminal running `dsh web`, then run `dsh web` again (or `npx --yes @deepseek-ai/dsh web`).
2. **Refresh the browser page**: the **「用量」** entry appears at the sidebar foot, just above Settings.

> Because the package declares `dsh.bundle`, the plugin row is activated automatically — **no manual config editing**.

## Optional: configure an API key (for the balance card)

Add a line to `~/.dsh/.credentials.yaml` (replace `sk-xxxx` with your key):

```yaml
DEEPSEEK_API_KEY: sk-xxxx
```

Or set the `DEEPSEEK_API_KEY` environment variable. Without a key, local usage statistics still work; the balance card just shows a hint.

## Uninstall

```sh
dsh plugin --profile web remove @xavier711/dsh-deepseek-usage
```

Then restart `dsh web` and refresh the page.

## Privacy

The plugin **never embeds an API key** (no key material in the package). The key is resolved at runtime from the *recipient's own* machine — `~/.dsh/.credentials.yaml` or the environment — and only on the host (server) side; the browser bundle never sees it. Safe to share.

## Layout

```
lib/index.js       host half — /dsh-usage/balance + /dsh-usage/local routes
lib/client.js      browser half — sidebar action + panel (hand-built bundle, no build step)
cordis.patch.yml   the plugin's own patch layer (dsh.bundle — auto-activated on install)
install.sh         one-shot installer
```

## Configuration (optional, usually not needed)

Override row config by id in `~/.dsh/profiles/web/cordis.patch.yml`:

```yaml
- id: deepseek-usage
  config:
    balanceTtlMs: 60000        # balance cache TTL (ms)
    maxSessions: 100           # most-recent sessions to replay
    sessionConcurrency: 4      # parallel session-log reads
    balanceTimeoutMs: 10000    # balance request timeout
    newPricingAt: 1786924800000      # peak/off-peak pricing effective date (2026-08-17 00:00 Beijing)
    peakHours: [[9,12],[14,18]]      # Beijing peak windows
    # pricing: per-model rates (CNY per 1M tokens), see the source repo
```

## Updating

You installed a pinned snapshot, so updates are **not** automatic — but you
don't need to check for them: the plugin queries the GitHub releases feed
(hours-cached) whenever you open the usage panel and shows a **「New version
available」** banner with the exact update command. Simply run it, restart
`dsh web`, and refresh the page:

```sh
dsh plugin --profile web remove @xavier711/dsh-deepseek-usage
dsh plugin --profile web add git+https://github.com/xavier711/dsh-deepseek-usage.git#v0.2.0
```

## Troubleshooting

**I see `dsh: warning: ... declares no dsh.bundle — installed as a plain dependency`**

You installed an older snapshot of the repository (pnpm caches git
dependencies by commit, so an install that happened before this package
declared `dsh.bundle` keeps the old version). Fix it by reinstalling from
the pinned tag:

```sh
dsh plugin --profile web remove @xavier711/dsh-deepseek-usage
dsh plugin --profile web add git+https://github.com/xavier711/dsh-deepseek-usage.git#v0.2.0
```

Then restart `dsh web` and refresh the page.

**The 「用量」 entry does not appear after installing**

Make sure the web server was restarted after the install (`Ctrl+C` in the
`dsh web` terminal, then run it again) and that you hard-refresh the browser
page (Cmd/Ctrl+Shift+R).

## HTTP routes

- `GET /dsh-usage/balance` — `{ ok, isAvailable, currency, totalBalance, grantedBalance, toppedUpBalance, ... }`
- `GET /dsh-usage/local` — `{ ok, sessionCount, errorSessions, pricing, buckets: { today, week, total }, days: [...7], models: [...], sessions: [...] }`

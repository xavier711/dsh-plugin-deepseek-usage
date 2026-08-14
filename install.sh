#!/usr/bin/env bash
# One-shot installer for the dsh-deepseek-usage plugin.
#
# Usage:  ./install.sh
#
# What it does:
#   1. installs this plugin into the local DSH web profile
#      (via `dsh plugin --profile web add <this directory>`)
#   2. because the package declares `dsh.bundle`, the plugin row is
#      activated AUTOMATICALLY — no manual patch editing needed.
#
# Works whether `dsh` is installed globally or not: when it is missing,
# `npx --yes @deepseek-ai/dsh` is used instead (npx will download it on
# first run).
#
# After it finishes:
#   - restart the web server: Ctrl+C in the `dsh web` terminal, then run
#     `dsh web` again (or `npx --yes @deepseek-ai/dsh web`)
#   - open the GUI and refresh the page — a 「用量」 entry appears at the
#     bottom of the left sidebar.
#
# Optional: configure your own DeepSeek API key for the balance card:
#   echo "DEEPSEEK_API_KEY: sk-xxxx" >> ~/.dsh/.credentials.yaml
# (The plugin never embeds, stores, or transmits anyone's key.)
set -euo pipefail

PLUGIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "→ checking prerequisites..."
if ! command -v node >/dev/null 2>&1; then
  echo "✗ Node.js not found — install it from https://nodejs.org first." >&2
  exit 1
fi
if command -v dsh >/dev/null 2>&1; then
  DSH_CMD="dsh"
else
  echo "  'dsh' not found globally — will use 'npx --yes @deepseek-ai/dsh' (downloads on first run)."
  DSH_CMD="npx --yes @deepseek-ai/dsh"
fi
if ! command -v pnpm >/dev/null 2>&1; then
  echo "✗ 'pnpm' not found — the dsh plugin manager needs it. Install with:" >&2
  echo "    npm install -g pnpm" >&2
  exit 1
fi

echo "→ installing and activating the plugin..."
$DSH_CMD plugin --profile web add "$PLUGIN_DIR"

echo
echo "✓ done. Restart the web server, then refresh the GUI:"
echo "    1) Ctrl+C in the 'dsh web' terminal"
echo "    2) run: dsh web        (或 npx --yes @deepseek-ai/dsh web)"
echo "    3) refresh the browser page — the 「用量」 entry is at the sidebar foot"
echo
echo "  Optional — configure your own DeepSeek API key for the balance card:"
echo "    echo 'DEEPSEEK_API_KEY: sk-xxxx' >> ~/.dsh/.credentials.yaml"
echo "  Local token statistics work without a key."

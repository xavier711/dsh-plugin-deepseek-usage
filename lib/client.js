/* dsh-deepseek-usage — browser half.
 *
 * Hand-written client bundle in the DSH module-loader format
 * (window.__ModuleLoader__.load({ id, factory })); the node half of
 * dsh-client-modules serves this file at /plugins/dsh-deepseek-usage/client.js
 * and the shell kernel adopts it as a client plugin.
 *
 * It registers into the `sidebar.footer.action` slot (beside Settings at the
 * sidebar foot) and opens a panel with the DeepSeek account balance and the
 * local token statistics, fetched from the host routes this package's node
 * half registers. Charts are dependency-free inline SVG.
 */
window.__ModuleLoader__.load({
  id: "@xavier711/dsh-deepseek-usage",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    let react = require("react");
    let _p = require("@deepseek-ai/dsh-client-ui-primitives");

    // ---- styles -----------------------------------------------------------

    const css = `
.du-root{position:relative;display:inherit;}
.du-layer{flex:none;width:100%;display:flex}
.du-badge{box-sizing:border-box;cursor:pointer;width:calc(100% + 8px);height:34px;color:var(--dsw-alias-label-primary);background:0 0;border:none;border-radius:12px;flex:none;align-items:center;gap:8px;margin:4px -4px;padding:6px 10px;font-family:inherit;font-size:14px;line-height:22px;display:flex;overflow:hidden}
.du-badge:hover{background:var(--dsw-alias-interactive-bg-hover)}
.du-badge[data-active]{background:var(--dsw-alias-interactive-bg-hover)}
.du-badgeLabel{white-space:nowrap;text-overflow:ellipsis;min-width:0;overflow:hidden}
.du-badgeCount{color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums;flex:none;margin-left:auto;font-size:12px;line-height:16px}
.du-layer.du-rail .du-badge{border-radius:50%;justify-content:center;gap:0;width:36px;height:36px;margin:8px 0 10px;padding:0}
.du-panel{z-index:30;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base);width:440px;max-width:calc(100vw - 24px);max-height:75vh;box-shadow:var(--dsw-shadow-lv3);--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);--dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2);--du-input:var(--dsw-alias-label-tertiary);--du-output:var(--dsw-alias-state-business-primary);--du-cacheRead:var(--dsw-alias-state-success-primary);--du-cacheWrite:var(--dsw-alias-state-warn-primary);--du-reasoning:var(--dsw-alias-state-error-primary);border-radius:14px;flex-direction:column;display:flex;position:fixed;bottom:128px;left:12px;overflow:hidden}
.du-header{box-sizing:border-box;border-bottom:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base);flex:none;justify-content:space-between;align-items:center;min-height:46px;padding:10px 12px;display:flex}
.du-headerTitle{flex:none;align-items:center;gap:8px;display:flex}
.du-titleCol{flex:none;flex-direction:column;display:flex}
.du-headerIcon{color:var(--dsw-alias-state-business-primary);flex:none;display:inline-flex}
.du-headerActions{flex:none;align-items:center;gap:2px;display:flex}
.du-title{color:var(--dsw-alias-label-primary);font-size:13px;font-weight:600;line-height:20px}
.du-subtitle{color:var(--dsw-alias-label-caption);font-size:11px;line-height:16px}
.du-iconButton{width:28px;height:28px;color:var(--dsw-alias-label-tertiary);cursor:pointer;background:0 0;border:none;border-radius:999px;justify-content:center;align-items:center;padding:0;display:inline-flex}
.du-iconButton:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}
.du-iconButton:disabled{opacity:.4;cursor:default}
.du-body{flex:1;min-width:0;min-height:0;padding:10px 12px 14px;overflow-x:hidden;overflow-y:auto}
.du-group{color:var(--dsw-alias-label-caption);text-transform:uppercase;letter-spacing:.04em;margin:12px 0 6px;font-size:11px;font-weight:500;line-height:16px}
.du-card{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base);border-radius:12px;flex-direction:column;gap:8px;min-width:0;padding:12px;display:flex;margin: 10px auto}
.du-cardTitle{color:var(--dsw-alias-label-secondary);flex:none;align-items:center;gap:8px;font-size:12px;font-weight:500;line-height:18px;display:flex}
.du-cardRow{flex:none;align-items:center;justify-content:space-between;gap:8px;display:flex}
.du-cardRowLabel{color:var(--dsw-alias-label-tertiary);flex:none;font-size:12px;line-height:18px}
.du-cardRowValue{color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums;text-align:right;font-size:12px;line-height:18px}
.du-rowCol{flex-direction:column;display:flex}
.du-balanceTop{flex:none;align-items:flex-start;justify-content:space-between;gap:8px;display:flex}
.du-balanceLabel{color:var(--dsw-alias-label-caption);font-size:11px;line-height:16px}
.du-balanceBig{color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums;font-size:28px;font-weight:600;line-height:36px}
.du-currency{color:var(--dsw-alias-label-tertiary);margin-left:4px;font-size:13px;font-weight:400;line-height:20px}
.du-badgeOk{background:var(--dsw-alias-state-success-tertiary);color:var(--dsw-alias-state-success-primary);height:22px;border-radius:11px;flex:none;align-items:center;padding:0 8px;font-size:11px;font-weight:500;line-height:22px;display:inline-flex}
.du-badgeErr{background:var(--dsw-alias-interactive-bg-hover-danger);color:var(--dsw-alias-state-error-primary);height:22px;border-radius:11px;flex:none;align-items:center;padding:0 8px;font-size:11px;font-weight:500;line-height:22px;display:inline-flex}
.du-balanceBar{background:var(--dsw-alias-fill-l2);border-radius:999px;flex:none;height:6px;overflow:hidden}
.du-balanceBar>span{background:var(--dsw-alias-state-success-primary);border-radius:999px;height:100%;display:block;transition:width .3s}
.du-balanceRows{flex:none;align-items:center;justify-content:space-between;gap:12px;font-size:11px;line-height:16px;display:flex}
.du-balanceRows b{color:var(--dsw-alias-label-secondary);font-weight:500}
.du-statGrid{flex:none;gap:8px;display:grid;grid-template-columns:repeat(3,minmax(0,1fr))}
.du-statCard{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base);border-radius:12px;flex-direction:column;gap:2px;min-width:0;padding:10px;display:flex}
.du-statTitle{color:var(--dsw-alias-label-caption);font-size:11px;line-height:16px}
.du-statTokens{color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums;font-size:16px;font-weight:600;line-height:24px}
.du-statMeta{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px}
.du-statCost{color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;font-size:11px;line-height:16px}
.du-chart{width:100%;max-width:100%;height:auto;display:block}
.du-bars rect{transition:opacity .12s}
.du-bars .du-barGroup:hover rect{opacity:.75}
.du-bars .du-barGroup:active rect{opacity:.6}
.du-barLegend{flex:none;align-items:center;gap:12px;font-size:11px;line-height:16px;display:flex;flex-wrap:wrap}
.du-barLegendItem{flex:none;align-items:center;gap:5px;color:var(--dsw-alias-label-tertiary);display:inline-flex}
.du-barLegendDot{width:8px;height:8px;border-radius:2px;flex:none}
.du-compositionBar{background:var(--dsw-alias-fill-l2);border-radius:999px;flex:none;height:12px;overflow:hidden;display:flex}
.du-compositionSeg{height:100%;transition:opacity .12s}
.du-compositionSeg:hover{opacity:.8}
.du-legend{flex:none;flex-direction:column;gap:6px;margin:0;padding:0;list-style:none;display:flex}
.du-legendRow{flex:none;align-items:center;gap:8px;display:flex}
.du-legendDot{width:8px;height:8px;border-radius:2px;flex:none}
.du-legendLabel{min-width:0;color:var(--dsw-alias-label-tertiary);text-overflow:ellipsis;white-space:nowrap;flex:1;font-size:11px;line-height:16px;overflow:hidden}
.du-legendValue{color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;flex:none;font-size:11px;line-height:16px}
.du-legendPct{color:var(--dsw-alias-label-caption);font-variant-numeric:tabular-nums;flex:none;width:38px;text-align:right;font-size:10px;line-height:16px}
.du-modelRow{flex:none;flex-direction:column;gap:3px;display:flex}
.du-modelHead{flex:none;align-items:center;gap:8px;min-width:0;display:flex}
.du-modelName{min-width:0;color:var(--dsw-alias-label-primary);text-overflow:ellipsis;white-space:nowrap;flex:1;font-family:var(--dsh-font-mono,monospace);font-size:12px;font-weight:500;line-height:18px;overflow:hidden}
.du-estimatedBadge{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-tertiary);border-radius:8px;flex:none;padding:0 6px;font-size:10px;line-height:16px}
.du-modelMeta{color:var(--dsw-alias-label-tertiary);flex:none;font-size:11px;line-height:18px}
.du-modelBar{background:var(--dsw-alias-fill-l2);border-radius:999px;flex:none;height:4px;overflow:hidden}
.du-modelBar>span{background:var(--dsw-alias-state-business-primary);border-radius:999px;height:100%;display:block}
.du-sessionToggle{color:var(--dsw-alias-state-business-primary);cursor:pointer;background:0 0;border:none;align-self:flex-start;margin:2px;padding:2px 4px;font-size:12px;line-height:18px}
.du-sessionToggle:hover{text-decoration:underline}
.du-sessionList{flex-direction:column;gap:6px;margin:2px 0 0;padding:0;list-style:none;display:flex}
.du-sessionRow{flex:none;flex-direction:column;gap:3px;display:flex}
.du-sessionHead{flex:none;align-items:center;gap:8px;min-width:0;display:flex}
.du-sessionTitle{min-width:0;color:var(--dsw-alias-label-primary);text-overflow:ellipsis;white-space:nowrap;flex:1;font-size:12px;font-weight:500;line-height:18px;overflow:hidden}
.du-sessionMeta{color:var(--dsw-alias-label-tertiary);flex:none;font-size:11px;line-height:18px}
.du-sessionBar{background:var(--dsw-alias-fill-l2);border-radius:999px;flex:none;height:4px;overflow:hidden}
.du-sessionBar>span{background:var(--dsw-alias-state-business-primary);border-radius:999px;height:100%;display:block}
.du-loading{color:var(--dsw-alias-label-tertiary);margin:4px 0;font-size:12px;line-height:18px}
.du-error{color:var(--dsw-alias-state-error-primary);margin:4px 0;font-size:12px;line-height:18px}
.du-updateBanner{border:1px solid var(--dsw-alias-state-business-primary);background:var(--dsw-alias-state-business-tertiary,color-mix(in srgb,var(--dsw-alias-state-business-primary) 10%,transparent));border-radius:10px;flex-direction:column;gap:6px;padding:8px 10px;display:flex}
.du-updateTitle{flex:none;align-items:center;gap:6px;color:var(--dsw-alias-state-business-primary);font-size:12px;font-weight:600;line-height:18px;display:flex}
.du-updateCommand{box-sizing:border-box;word-break:break-all;white-space:pre-wrap;color:var(--dsw-alias-label-secondary);font-family:var(--dsh-font-mono,monospace);font-size:11px;line-height:16px}
.du-updateLink{color:var(--dsw-alias-state-business-primary);flex:none;font-size:11px;line-height:16px}
.du-note{color:var(--dsw-alias-label-caption);margin:10px 0 0;font-size:11px;line-height:16px}
.du-empty{color:var(--dsw-alias-label-caption);font-size:11px;line-height:16px}
`;
    const tagId = "@xavier711/dsh-deepseek-usage/panel-v3";
    if (typeof document !== "undefined") {
      // Drop any stale stylesheet from an earlier bundle revision (old and new
      // package ids), then inject the current one — a page that loaded a
      // previous client.js keeps its old <style> tag alive, and without this
      // the new classes stay unstyled (default-size SVGs then overflow the
      // panel body).
      for (const pluginId of ["dsh-deepseek-usage", "@xavier711/dsh-deepseek-usage"]) {
        document.querySelectorAll(`style[data-plugin="${pluginId}"]`).forEach((el) => el.remove());
      }
      if (document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
        const tag = document.createElement("style");
        tag.dataset.plugin = "@xavier711/dsh-deepseek-usage";
        tag.dataset.pluginCss = tagId;
        tag.textContent = css;
        document.head.appendChild(tag);
      }
    }
    const styles = {
      root: "du-root",
      layer: "du-layer",
      rail: "du-rail",
      badge: "du-badge",
      badgeLabel: "du-badgeLabel",
      badgeCount: "du-badgeCount",
      panel: "du-panel",
      header: "du-header",
      headerTitle: "du-headerTitle",
      titleCol: "du-titleCol",
      headerIcon: "du-headerIcon",
      headerActions: "du-headerActions",
      title: "du-title",
      subtitle: "du-subtitle",
      iconButton: "du-iconButton",
      body: "du-body",
      group: "du-group",
      card: "du-card",
      cardTitle: "du-cardTitle",
      cardRow: "du-cardRow",
      cardRowLabel: "du-cardRowLabel",
      cardRowValue: "du-cardRowValue",
      rowCol: "du-rowCol",
      balanceTop: "du-balanceTop",
      balanceLabel: "du-balanceLabel",
      balanceBig: "du-balanceBig",
      currency: "du-currency",
      badgeOk: "du-badgeOk",
      badgeErr: "du-badgeErr",
      balanceBar: "du-balanceBar",
      balanceRows: "du-balanceRows",
      statGrid: "du-statGrid",
      statCard: "du-statCard",
      statTitle: "du-statTitle",
      statTokens: "du-statTokens",
      statMeta: "du-statMeta",
      statCost: "du-statCost",
      chart: "du-chart",
      bars: "du-bars",
      barLegend: "du-barLegend",
      barLegendItem: "du-barLegendItem",
      barLegendDot: "du-barLegendDot",
      compositionBar: "du-compositionBar",
      compositionSeg: "du-compositionSeg",
      legend: "du-legend",
      legendRow: "du-legendRow",
      legendDot: "du-legendDot",
      legendLabel: "du-legendLabel",
      legendValue: "du-legendValue",
      legendPct: "du-legendPct",
      modelRow: "du-modelRow",
      modelHead: "du-modelHead",
      modelName: "du-modelName",
      estimatedBadge: "du-estimatedBadge",
      modelMeta: "du-modelMeta",
      modelBar: "du-modelBar",
      sessionToggle: "du-sessionToggle",
      sessionList: "du-sessionList",
      sessionRow: "du-sessionRow",
      sessionHead: "du-sessionHead",
      sessionTitle: "du-sessionTitle",
      sessionMeta: "du-sessionMeta",
      sessionBar: "du-sessionBar",
      loading: "du-loading",
      error: "du-error",
      updateBanner: "du-updateBanner",
      updateTitle: "du-updateTitle",
      updateCommand: "du-updateCommand",
      updateLink: "du-updateLink",
      note: "du-note",
      empty: "du-empty"
    };

    // ---- formatting helpers ------------------------------------------------

    /** Thousand-separated integer. */
    function fmtInt(n) {
      return new Intl.NumberFormat("zh-CN").format(Math.round(n));
    }

    /** Compact token count: 1.2M / 340K / 512. */
    function fmtCompact(n) {
      if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + "M";
      if (n >= 1e3) return (n / 1e3).toFixed(n >= 1e4 ? 0 : 1) + "K";
      return String(n);
    }

    /** CNY cost display; tiny positive amounts read as "<¥0.01". */
    function fmtCost(v) {
      if (typeof v !== "number" || !Number.isFinite(v)) return "—";
      if (v > 0 && v < 0.01) return "<¥0.01";
      return `¥${v.toFixed(2)}`;
    }

    /** Local date-time string for a session row. */
    function fmtDate(ms) {
      const d = new Date(ms);
      const pad = (x) => `${x}`.padStart(2, "0");
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }

    /** Single-character day label for a YYYY-MM-DD string ("今" for today). */
    function dayLabel(date) {
      const now = new Date();
      const pad = (x) => `${x}`.padStart(2, "0");
      const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
      if (date === today) return "今";
      const d = new Date(`${date}T00:00:00`);
      return "日一二三四五六"[d.getDay()];
    }

    /** Sum of every token category in one bucket. */
    function bucketTokens(bucket) {
      return (bucket.inputTokens ?? 0) + (bucket.outputTokens ?? 0) + (bucket.cacheReadTokens ?? 0) + (bucket.cacheWriteTokens ?? 0) + (bucket.reasoningTokens ?? 0);
    }

    // ---- data fetching -----------------------------------------------------

    /** Fetch one host route into a { state, data | error, message } shape. */
    async function fetchJson(path) {
      const response = await fetch(path, { headers: { Accept: "application/json" } });
      const json = await response.json().catch(() => null);
      if (!response.ok || json === null || json.ok !== true) {
        return { state: "error", error: json?.error, message: json?.message ?? `HTTP ${response.status}` };
      }
      return { state: "ok", data: json };
    }

    function fetchBalance() {
      return fetchJson("/dsh-usage/balance");
    }

    function fetchLocal() {
      return fetchJson("/dsh-usage/local");
    }

    function fetchVersion() {
      return fetchJson("/dsh-usage/version");
    }

    /** Update banner shown while a newer release exists. */
    function UpdateBanner({ update, t }) {
      if (update === null || update.state !== "ok" || update.data.updateAvailable !== true) return null;
      const latest = update.data.latest;
      return react.createElement("div", { className: styles.updateBanner },
        react.createElement("div", { className: styles.updateTitle },
          react.createElement(_p.IconChevronUpOutline14, {}),
          t("update.available", { version: latest })
        ),
        react.createElement("code", { className: styles.updateCommand },
          `dsh plugin --profile web add git+https://github.com/xavier711/dsh-deepseek-usage.git#v${latest}`
        ),
        update.data.url
          ? react.createElement("a", { className: styles.updateLink, href: update.data.url, target: "_blank", rel: "noreferrer" }, t("update.releases"))
          : null
      );
    }

    // ---- account balance card ---------------------------------------------

    function BalanceSection({ balance, t }) {
      if (balance === null || balance.state === "loading") {
        return react.createElement("div", { className: styles.loading }, t("loading"));
      }
      if (balance.state === "error") {
        return react.createElement("div", { className: styles.card },
          react.createElement("div", { className: styles.error }, balance.message),
          balance.error === "NO_API_KEY" ? react.createElement("div", { className: styles.note }, t("balance.noKeyHint")) : null
        );
      }
      const data = balance.data;
      const total = parseFloat(data.totalBalance) || 0;
      const granted = parseFloat(data.grantedBalance) || 0;
      const grantedPct = total > 0 ? Math.min(100, (granted / total) * 100) : 0;
      return react.createElement("div", { className: styles.card },
        react.createElement("div", { className: styles.balanceTop },
          react.createElement("div", { className: styles.rowCol },
            react.createElement("div", { className: styles.balanceLabel }, t("balance.total")),
            react.createElement("div", { className: styles.balanceBig },
              data.totalBalance ?? "—",
              data.currency ? react.createElement("span", { className: styles.currency }, data.currency) : null
            )
          ),
          data.isAvailable
            ? react.createElement("span", { className: styles.badgeOk }, t("balance.available"))
            : react.createElement("span", { className: styles.badgeErr }, t("balance.unavailable"))
        ),
        react.createElement("div", { className: styles.balanceBar },
          react.createElement("span", { style: { width: `${grantedPct}%` } })
        ),
        react.createElement("div", { className: styles.balanceRows },
          react.createElement("span", null, `${t("balance.toppedUp")} `, react.createElement("b", null, data.toppedUpBalance ?? "—")),
          react.createElement("span", null, `${t("balance.granted")} `, react.createElement("b", null, data.grantedBalance ?? "—"))
        )
      );
    }

    // ---- charts ------------------------------------------------------------

    /** Stacked 7-day bar chart (cacheRead / input / output / reasoning / cacheWrite). */
    function WeekBars({ days, t }) {
      const W = 380;
      const H = 150;
      const BASE = 118;
      const TOP = 22;
      const SLOT = W / 7;
      const BAR_W = 26;
      const max = Math.max(1, ...days.map((d) => bucketTokens(d)));
      const segments = [
        ["cacheReadTokens", "var(--du-cacheRead)", t("local.cacheRead")],
        ["inputTokens", "var(--du-input)", t("local.input")],
        ["outputTokens", "var(--du-output)", t("local.output")],
        ["reasoningTokens", "var(--du-reasoning)", t("local.reasoning")],
        ["cacheWriteTokens", "var(--du-cacheWrite)", t("local.cacheWrite")]
      ];
      const bars = days.map((day, i) => {
        const x = i * SLOT + (SLOT - BAR_W) / 2;
        let y = BASE;
        const rects = [];
        for (const [field, color] of segments) {
          const h = ((day[field] ?? 0) / max) * (BASE - TOP);
          if (h <= 0) continue;
          y -= h;
          rects.push(react.createElement("rect", { key: field, x, y, width: BAR_W, height: h, rx: 3, style: { fill: color } }));
        }
        const detail = segments
          .map(([field, , label]) => `${label} ${fmtInt(day[field] ?? 0)}`)
          .join(" · ");
        return react.createElement("g", { key: day.date, className: "du-barGroup" },
          react.createElement("title", null, `${day.date}（${fmtInt(bucketTokens(day))} tokens）\n${detail}`),
          rects,
          react.createElement("text", { x: x + BAR_W / 2, y: H - 8, textAnchor: "middle", style: { fill: "var(--dsw-alias-label-caption)", fontSize: 10 } }, dayLabel(day.date))
        );
      });
      return react.createElement("div", { className: styles.card },
        react.createElement("div", { className: styles.cardTitle }, t("local.weekBars")),
        react.createElement("svg", { viewBox: `0 0 ${W} ${H}`, className: `${styles.chart} ${styles.bars}`, role: "img", "aria-label": t("local.weekBars") },
          react.createElement("line", { x1: 0, y1: BASE, x2: W, y2: BASE, style: { stroke: "var(--dsw-alias-border-l2)", strokeWidth: 1 } }),
          bars
        ),
        react.createElement("div", { className: styles.barLegend },
          segments.map(([, color, label]) =>
            react.createElement("span", { className: styles.barLegendItem, key: label },
              react.createElement("span", { className: styles.barLegendDot, style: { background: color } }),
              label
            )
          )
        )
      );
    }

    /** Horizontal stacked bar of one bucket's token composition with a legend. */
    function CompositionBar({ bucket, t }) {
      const segments = [
        ["cacheRead", bucket.cacheReadTokens ?? 0, "var(--du-cacheRead)", t("local.cacheRead")],
        ["input", bucket.inputTokens ?? 0, "var(--du-input)", t("local.input")],
        ["output", bucket.outputTokens ?? 0, "var(--du-output)", t("local.output")],
        ["reasoning", bucket.reasoningTokens ?? 0, "var(--du-reasoning)", t("local.reasoning")],
        ["cacheWrite", bucket.cacheWriteTokens ?? 0, "var(--du-cacheWrite)", t("local.cacheWrite")]
      ];
      const total = segments.reduce((sum, [, value]) => sum + value, 0);
      const visible = segments.filter(([, value]) => value > 0);
      return react.createElement("div", { className: styles.card },
        react.createElement("div", { className: styles.cardTitle }, t("local.todayComposition")),
        react.createElement("div", { className: styles.compositionBar, role: "img", "aria-label": t("local.todayComposition") },
          visible.map(([key, value, color, label]) =>
            react.createElement("span", {
              key,
              className: styles.compositionSeg,
              style: { width: `${(value / Math.max(1, total)) * 100}%`, background: color },
              title: `${label} ${fmtInt(value)}`
            })
          )
        ),
        react.createElement("ul", { className: styles.legend },
          segments.map(([key, value, color, label]) =>
            react.createElement("li", { className: styles.legendRow, key: key },
              react.createElement("span", { className: styles.legendDot, style: { background: color } }),
              react.createElement("span", { className: styles.legendLabel }, label),
              react.createElement("span", { className: styles.legendValue }, fmtCompact(value)),
              react.createElement("span", { className: styles.legendPct }, total > 0 ? `${((value / total) * 100).toFixed(1)}%` : "0%")
            )
          )
        )
      );
    }

    /** Per-model usage rows, most expensive first, with a relative cost bar. */
    function ModelStats({ models, t }) {
      const maxCost = Math.max(1e-6, ...models.map((m) => m.cost));
      return react.createElement("div", { className: styles.card },
        react.createElement("div", { className: styles.cardTitle }, t("local.byModel")),
        models.map((m) =>
          react.createElement("div", { className: styles.modelRow, key: m.model },
            react.createElement("div", { className: styles.modelHead },
              react.createElement("span", { className: styles.modelName, title: m.model },
                m.model,
                m.estimated === true ? react.createElement("span", { className: styles.estimatedBadge }, t("local.estimated")) : null
              ),
              react.createElement("span", { className: styles.modelMeta },
                t("local.modelMeta", { tokens: fmtCompact(bucketTokens(m)), calls: m.calls, cost: fmtCost(m.cost) })
              )
            ),
            react.createElement("div", { className: styles.modelBar },
              react.createElement("span", { style: { width: `${(m.cost / maxCost) * 100}%` } })
            )
          )
        )
      );
    }

    // ---- local usage section ----------------------------------------------

    /** Compact period stat card (今日 / 近7天 / 累计). */
    function StatCard({ title, bucket, t }) {
      return react.createElement("div", { className: styles.statCard },
        react.createElement("div", { className: styles.statTitle }, title),
        react.createElement("div", { className: styles.statTokens, title: `${fmtInt(bucketTokens(bucket))} tokens` }, fmtCompact(bucketTokens(bucket))),
        react.createElement("div", { className: styles.statMeta }, t("local.callsShort", { count: bucket.calls })),
        react.createElement("div", { className: styles.statCost }, fmtCost(bucket.cost))
      );
    }

    /** Per-session rows, most recently active first, with a relative token bar. */
    function SessionList({ sessions, t }) {
      const sorted = [...sessions].sort((a, b) => (b.lastActiveAt ?? 0) - (a.lastActiveAt ?? 0));
      const max = Math.max(1, ...sorted.map((s) => bucketTokens(s)));
      return react.createElement("ul", { className: styles.sessionList },
        sorted.map((session) => {
          const tokens = bucketTokens(session);
          return react.createElement("li", { className: styles.sessionRow, key: session.id },
            react.createElement("div", { className: styles.sessionHead },
              react.createElement("span", { className: styles.sessionTitle, title: session.title || session.id }, session.title || session.id),
              react.createElement("span", { className: styles.sessionMeta }, t("local.sessionMeta", { tokens: fmtCompact(tokens), calls: session.calls ?? 0, date: fmtDate(session.lastActiveAt ?? session.createdAt) }))
            ),
            react.createElement("div", { className: styles.sessionBar },
              react.createElement("span", { style: { width: `${(tokens / max) * 100}%` } })
            )
          );
        })
      );
    }

    function LocalSection({ local, t }) {
      if (local === null || local.state === "loading") {
        return react.createElement("div", { className: styles.loading }, t("loading"));
      }
      if (local.state === "error") {
        return react.createElement("div", { className: styles.error }, local.message);
      }
      const data = local.data;
      const [showSessions, setShowSessions] = react.useState(false);
      return react.createElement(react.Fragment, null,
        react.createElement("div", { className: styles.group }, t("local.group")),
        react.createElement("div", { className: styles.statGrid },
          react.createElement(StatCard, { title: t("local.today"), bucket: data.buckets.today, t }),
          react.createElement(StatCard, { title: t("local.week"), bucket: data.buckets.week, t }),
          react.createElement(StatCard, { title: t("local.total"), bucket: data.buckets.total, t })
        ),
        react.createElement("div", { className: styles.card },
          react.createElement("div", { className: styles.cardRow },
            react.createElement("span", { className: styles.cardRowLabel }, t("local.sessions")),
            react.createElement("span", { className: styles.cardRowValue }, `${data.sessionCount} 个`)
          ),
          data.errorSessions > 0
            ? react.createElement("div", { className: styles.error }, t("local.failedSessions", { count: data.errorSessions }))
            : null
        ),
        Array.isArray(data.days) && data.days.length === 7
          ? react.createElement(WeekBars, { days: data.days, t })
          : null,
        react.createElement(CompositionBar, { bucket: data.buckets.today, t }),
        Array.isArray(data.models) && data.models.length > 0
          ? react.createElement(ModelStats, { models: data.models, t })
          : null,
        data.sessions.length > 0
          ? react.createElement("button", {
              type: "button",
              className: styles.sessionToggle,
              onClick: () => setShowSessions((v) => !v)
            }, showSessions ? t("local.sessionHide") : t("local.sessionToggle", { count: data.sessions.length }))
          : react.createElement("div", { className: styles.empty }, t("local.empty")),
        showSessions ? react.createElement(SessionList, { sessions: data.sessions, t }) : null
      );
    }

    // ---- main component ----------------------------------------------------

    /**
     * Sidebar footer action (beside Settings): opens the usage panel.
     * @param props - runtime slot currency ({ wide }) plus the namespace translator.
     */
    function UsagePanel({ wide, t }) {
      const [open, setOpen] = react.useState(false);
      const [balance, setBalance] = react.useState(null);
      const [local, setLocal] = react.useState(null);
      const [update, setUpdate] = react.useState(null);
      const rootRef = react.useRef(null);

      const refresh = react.useCallback(() => {
        setBalance((current) => current === null ? { state: "loading" } : current);
        setLocal((current) => current === null ? { state: "loading" } : current);
        fetchBalance().then(setBalance).catch((error) => setBalance({ state: "error", message: String(error) }));
        fetchLocal().then(setLocal).catch((error) => setLocal({ state: "error", message: String(error) }));
        fetchVersion().then(setUpdate).catch(() => setUpdate((current) => current ?? null));
      }, []);

      react.useEffect(() => {
        // Fetch on open only — no polling while the panel stays open, same as
        // the balance card. The host caches the version check for hours, so
        // repeated opens stay cheap.
        if (!open) return;
        refresh();
        const closeOutside = (event) => {
          if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false);
        };
        const onKeyDown = (event) => {
          if (event.key === "Escape") setOpen(false);
        };
        document.addEventListener("pointerdown", closeOutside);
        document.addEventListener("keydown", onKeyDown);
        return () => {
          document.removeEventListener("pointerdown", closeOutside);
          document.removeEventListener("keydown", onKeyDown);
        };
      }, [open, refresh]);

      const todayCost = local?.state === "ok" ? local.data.buckets.today.cost : null;
      const badge = react.createElement("button", {
        type: "button",
        className: styles.badge,
        "data-active": open || undefined,
        "aria-expanded": open,
        "aria-label": t("trigger.aria"),
        onClick: () => setOpen((v) => !v)
      },
        react.createElement(_p.IconDataOutline16, {}),
        wide ? react.createElement("span", { className: styles.badgeLabel }, t("trigger.label")) : null,
        wide && todayCost > 0 ? react.createElement("span", { className: styles.badgeCount }, fmtCost(todayCost)) : null
      );

      return react.createElement("div", { ref: rootRef, className: styles.root },
        react.createElement("div", { className: wide ? styles.layer : `${styles.layer} ${styles.rail}` },
          wide ? badge : react.createElement(_p.Tooltip, { label: t("trigger.aria"), delayMs: 500 }, badge)
        ),
        open ? react.createElement("div", { className: styles.panel, role: "dialog", "aria-label": t("panel.title") },
          react.createElement("div", { className: styles.header },
            react.createElement("div", { className: styles.headerTitle },
              react.createElement("span", { className: styles.headerIcon }, react.createElement(_p.IconDataOutline16, {})),
              react.createElement("div", { className: styles.titleCol },
                react.createElement("div", { className: styles.title }, t("panel.title")),
                react.createElement("div", { className: styles.subtitle }, t("panel.subtitle"))
              )
            ),
            react.createElement("div", { className: styles.headerActions },
              react.createElement("button", { type: "button", className: styles.iconButton, "aria-label": t("action.refresh"), onClick: refresh },
                react.createElement(_p.IconRefreshOutline16, {})
              ),
              react.createElement("button", { type: "button", className: styles.iconButton, "aria-label": t("action.close"), onClick: () => setOpen(false) },
                react.createElement(_p.IconCloseOutline16, {})
              )
            )
          ),
          react.createElement("div", { className: styles.body },
            react.createElement(UpdateBanner, { update, t }),
            react.createElement("div", { className: styles.group }, t("balance.group")),
            react.createElement(BalanceSection, { balance, t }),
            react.createElement(LocalSection, { local, t }),
            local?.state === "ok"
              ? react.createElement("p", { className: styles.note }, t("panel.note"))
              : null
          )
        ) : null
      );
    }

    // ---- plugin ------------------------------------------------------------

    /** Client services needed by the plugin body. */
    const inject = ["slots", "locale"];

    /**
     * Client plugin body: register the dictionaries and the sidebar action.
     * @param ctx - client root context.
     */
    function apply(ctx) {
      ctx.effect(() => ctx.locale.register("deepseek-usage", { zh, en }), "deepseek-usage: dictionaries");
      ctx.slots.inject("sidebar.footer.action", () => ctx.slots.register({
        name: "sidebar.footer.action",
        id: "deepseek-usage",
        order: 30,
        locale: "deepseek-usage"
      }, UsagePanel));
    }

    // ---- locales -----------------------------------------------------------

    /** Simplified Chinese dictionary (the key-set source of truth). */
    const zh = {
      "trigger.aria": "DeepSeek 用量",
      "trigger.label": "用量",
      "panel.title": "DeepSeek 用量",
      "panel.subtitle": "余额 · Token 统计",
      "action.refresh": "刷新",
      "action.close": "关闭",
      "loading": "读取中…",
      "balance.group": "账户余额",
      "balance.total": "总余额",
      "balance.granted": "赠送余额",
      "balance.toppedUp": "充值余额",
      "balance.status": "状态",
      "balance.available": "可用",
      "balance.unavailable": "不可用",
      "balance.noKeyHint": "未配置 DEEPSEEK_API_KEY，可在 ~/.dsh/.credentials.yaml 或环境变量中设置后刷新。",
      "local.group": "本地用量",
      "local.today": "今日",
      "local.week": "近 7 天",
      "local.total": "累计",
      "local.sessions": "统计会话",
      "local.failedSessions": "{count} 个会话读取失败",
      "local.calls": "调用次数",
      "local.callsShort": "{count} 次调用",
      "local.input": "输入",
      "local.output": "输出",
      "local.cacheRead": "缓存命中",
      "local.cacheWrite": "缓存写入",
      "local.reasoning": "思考",
      "local.cost": "费用估算",
      "local.tokens": "tokens",
      "local.weekBars": "近 7 天用量",
      "local.todayComposition": "今日构成",
      "local.byModel": "按模型统计",
      "local.estimated": "估算",
      "local.modelMeta": "{tokens} tok · {calls} 次 · {cost}",
      "local.sessionToggle": "查看 {count} 个会话",
      "local.sessionHide": "收起会话",
      "local.sessionMeta": "{tokens} tok · {calls} 次 · {date}",
      "local.empty": "暂无会话记录",
      "update.available": "发现新版本 v{version}",
      "update.releases": "查看发布页",
      "panel.note": "费用按 DeepSeek 官方定价分模型估算（8/17 起 V4 系列按北京时间峰谷计价）。"
    };

    /** English dictionary, key-identical to the Chinese source of truth. */
    const en = {
      "trigger.aria": "DeepSeek usage",
      "trigger.label": "Usage",
      "panel.title": "DeepSeek usage",
      "panel.subtitle": "Balance · Token stats",
      "action.refresh": "Refresh",
      "action.close": "Close",
      "loading": "Loading…",
      "balance.group": "Account balance",
      "balance.total": "Total balance",
      "balance.granted": "Granted balance",
      "balance.toppedUp": "Topped-up balance",
      "balance.status": "Status",
      "balance.available": "Available",
      "balance.unavailable": "Unavailable",
      "balance.noKeyHint": "DEEPSEEK_API_KEY is not configured; set it in ~/.dsh/.credentials.yaml or the environment, then refresh.",
      "local.group": "Local usage",
      "local.today": "Today",
      "local.week": "7 days",
      "local.total": "All time",
      "local.sessions": "Sessions",
      "local.failedSessions": "{count} sessions failed to read",
      "local.calls": "Calls",
      "local.callsShort": "{count} calls",
      "local.input": "Input",
      "local.output": "Output",
      "local.cacheRead": "Cache hit",
      "local.cacheWrite": "Cache write",
      "local.reasoning": "Reasoning",
      "local.cost": "Est. cost",
      "local.tokens": "tokens",
      "local.weekBars": "Last 7 days",
      "local.todayComposition": "Today's breakdown",
      "local.byModel": "By model",
      "local.estimated": "est.",
      "local.modelMeta": "{tokens} tok · {calls} calls · {cost}",
      "local.sessionToggle": "Show {count} sessions",
      "local.sessionHide": "Hide sessions",
      "local.sessionMeta": "{tokens} tok · {calls} calls · {date}",
      "local.empty": "No sessions yet",
      "update.available": "New version v{version} available",
      "update.releases": "Releases",
      "panel.note": "Cost is estimated per model at official DeepSeek rates (peak/off-peak pricing from 8/17, Beijing time)."
    };

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  }
});

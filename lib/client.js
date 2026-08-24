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
 * half registers. The sidebar trigger and the panel header both show the
 * current Beijing peak/off-peak period (from the `/dsh-usage/period` route);
 * weekends (Sat/Sun, since 2026-08-23) are all-day off-peak. The sidebar
 * cost badge refreshes from activity signals (session snapshot changes, tab
 * focus/visibility, panel open) — no polling. Charts are dependency-free
 * inline SVG.
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
.du-badge{box-sizing:border-box;cursor:pointer;width:calc(100% + 8px);height:34px;color:var(--dsw-alias-label-primary);background:0 0;border:none;border-radius:12px;flex:none;align-items:center;gap:8px;margin:4px -4px;padding:6px 10px;font-family:inherit;font-size:14px;line-height:22px;display:flex;overflow:hidden;position:relative}
.du-badge:hover{background:var(--dsw-alias-interactive-bg-hover)}
.du-badge[data-active]{background:var(--dsw-alias-interactive-bg-hover)}
.du-badgeLabel{white-space:nowrap;text-overflow:ellipsis;min-width:0;overflow:hidden}
.du-badgeCount{color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums;flex:none;margin-left:auto;font-size:12px;line-height:16px}
.du-periodTag{box-sizing:border-box;flex:none;align-items:center;gap:4px;height:18px;border-radius:8px;padding:0 6px;font-size:11px;line-height:18px;display:inline-flex}
.du-periodTag[data-period="peak"]{color:var(--dsw-alias-state-warn-primary);background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 14%,transparent)}
.du-periodTag[data-period="offPeak"]{color:var(--dsw-alias-state-success-primary);background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 14%,transparent)}
.du-periodTagDot{width:6px;height:6px;border-radius:50%;background:currentColor;flex:none}
.du-periodDotRail{position:absolute;top:7px;right:7px;width:7px;height:7px;border-radius:50%;flex:none}
.du-periodDotRail[data-period="peak"]{background:var(--dsw-alias-state-warn-primary)}
.du-periodDotRail[data-period="offPeak"]{background:var(--dsw-alias-state-success-primary)}
.du-periodStrip{flex:none;align-items:center;gap:6px;border-bottom:1px solid var(--dsw-alias-border-l2);padding:6px 12px;font-size:11px;line-height:16px;display:flex}
.du-periodStrip[data-period="peak"]{color:var(--dsw-alias-state-warn-primary)}
.du-periodStrip[data-period="offPeak"]{color:var(--dsw-alias-state-success-primary)}
.du-periodStrip[data-period="flat"]{color:var(--dsw-alias-label-tertiary)}
.du-periodStripDot{width:7px;height:7px;border-radius:50%;flex:none}
.du-periodStrip[data-period="peak"] .du-periodStripDot{background:var(--dsw-alias-state-warn-primary)}
.du-periodStrip[data-period="offPeak"] .du-periodStripDot{background:var(--dsw-alias-state-success-primary)}
.du-periodStrip[data-period="flat"] .du-periodStripDot{background:var(--dsw-alias-label-tertiary)}
.du-layer.du-rail .du-badge{border-radius:50%;justify-content:center;gap:0;width:36px;height:36px;margin:8px 0 10px;padding:0}
.du-panel{z-index:30;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base);width:440px;max-width:calc(100vw - 24px);max-height:75vh;box-shadow:var(--dsw-shadow-lv3);--du-input:var(--dsw-alias-label-tertiary);--du-output:var(--dsw-alias-state-business-primary);--du-cacheRead:var(--dsw-alias-state-success-primary);--du-cacheWrite:var(--dsw-alias-state-warn-primary);--du-reasoning:var(--dsw-alias-state-error-primary);border-radius:14px;flex-direction:column;display:flex;position:fixed;bottom:128px;left:12px;overflow:hidden}
.du-header{box-sizing:border-box;border-bottom:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base);flex:none;justify-content:space-between;align-items:center;min-height:46px;padding:10px 12px;display:flex}
.du-headerTitle{flex:none;align-items:center;gap:8px;display:flex}
.du-titleCol{flex:none;flex-direction:column;display:flex}
.du-headerIcon{color:var(--dsw-alias-state-business-primary);flex:none;display:inline-flex}
.du-headerActions{flex:none;align-items:center;gap:2px;display:flex}
.du-title{color:var(--dsw-alias-label-primary);font-size:13px;font-weight:600;line-height:20px}
.du-subtitle{color:var(--dsw-alias-label-caption);font-size:11px;line-height:16px}
.du-iconButton{width:28px;height:28px;color:var(--dsw-alias-label-tertiary);cursor:pointer;background:0 0;border:none;border-radius:999px;justify-content:center;align-items:center;padding:0;display:inline-flex}
.du-iconButton:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}
.du-root button:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}
.du-iconButton:disabled{opacity:.4;cursor:default}
.du-body{flex:1;min-width:0;min-height:0;padding:10px 12px 14px;overflow-x:hidden;overflow-y:auto}
.du-body{scrollbar-width:thin;scrollbar-color:transparent transparent}
.du-body::-webkit-scrollbar{width:8px;height:8px}
.du-body::-webkit-scrollbar-track{background:transparent}
.du-body::-webkit-scrollbar-thumb{background:transparent;border-radius:999px}
.du-body:hover,.du-body:active{scrollbar-color:var(--dsw-alias-scrollbar-bg-l2) transparent}
.du-body:hover::-webkit-scrollbar-thumb,.du-body:active::-webkit-scrollbar-thumb{background:var(--dsw-alias-scrollbar-bg-l2)}
.du-body:hover::-webkit-scrollbar-thumb:hover{background:var(--dsw-alias-scrollbar-hover-l2)}
.du-footer{border-top:1px solid var(--dsw-alias-border-l2);flex:none;color:var(--dsw-alias-label-caption);padding:8px 12px;font-size:11px;line-height:16px}
.du-card{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base);border-radius:12px;flex-direction:column;gap:8px;min-width:0;padding:12px;display:flex;margin: 10px auto}
.du-body > .du-card:first-child{margin-top:0}
.du-cardTitle{color:var(--dsw-alias-label-secondary);flex:none;align-items:center;gap:8px;font-size:12px;font-weight:500;line-height:18px;display:flex}
.du-cardHead{flex:none;align-items:center;justify-content:space-between;gap:8px;display:flex}
.du-seg{flex:none;align-items:center;gap:2px;background:var(--dsw-alias-fill-l2);border-radius:8px;padding:2px;display:flex}
.du-segBtn{box-sizing:border-box;height:22px;color:var(--dsw-alias-label-tertiary);cursor:pointer;background:0 0;border:none;border-radius:6px;padding:0 8px;font-family:inherit;font-size:11px;line-height:22px}
.du-segBtn:hover{color:var(--dsw-alias-label-primary)}
.du-segActive{box-sizing:border-box;height:22px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l2);border-radius:6px;padding:0 8px;font-family:inherit;font-size:11px;line-height:20px;box-shadow:var(--dsw-shadow-lv1,0 1px 2px rgba(0,0,0,.2))}
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
.du-estimatedBadge{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-tertiary);border-radius:8px;flex:none;padding:0 6px;font-size:11px;line-height:16px}
.du-modelMeta{color:var(--dsw-alias-label-tertiary);flex:none;font-size:11px;line-height:18px}
.du-modelBar{background:var(--dsw-alias-fill-l2);border-radius:999px;flex:none;height:4px;overflow:hidden}
.du-modelBar>span{background:var(--dsw-alias-state-business-primary);border-radius:999px;height:100%;display:block}
.du-sessionList{flex-direction:column;gap:2px;margin:2px 0 0;padding:0;list-style:none;display:flex}
.du-sessionRow{flex:none;flex-direction:column;gap:3px;border-radius:8px;margin:0 -6px;padding:3px 6px;transition:background .12s;display:flex}
.du-sessionRow:hover{background:var(--dsw-alias-interactive-bg-hover)}
.du-sessionHead{flex:none;align-items:center;gap:8px;min-width:0;display:flex}
.du-sessionTitle{min-width:0;color:var(--dsw-alias-label-primary);text-overflow:ellipsis;white-space:nowrap;flex:1;font-size:12px;font-weight:500;line-height:18px;overflow:hidden}
.du-sessionMeta{color:var(--dsw-alias-label-tertiary);flex:none;font-size:11px;line-height:18px}
.du-wsItem{flex:none;flex-direction:column;display:flex}
.du-wsHeader{box-sizing:border-box;flex:none;align-items:center;gap:6px;min-width:0;width:100%;color:var(--dsw-alias-label-primary);cursor:pointer;background:0 0;border:none;padding:0;font-family:inherit;font-size:12px;line-height:18px;text-align:left;display:flex}
.du-wsHeader:hover .du-wsName{color:var(--dsw-alias-state-business-primary)}
.du-wsChevron{color:var(--dsw-alias-label-tertiary);flex:none;display:inline-flex}
.du-wsName{min-width:0;text-overflow:ellipsis;white-space:nowrap;flex:1;font-size:12px;font-weight:500;line-height:18px;overflow:hidden}
.du-wsCount{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums;border-radius:8px;flex:none;padding:0 6px;font-size:11px;line-height:16px}
.du-wsCost{color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;flex:none;font-size:11px;line-height:18px}
.du-wsBody{border-top:1px solid var(--dsw-alias-border-l2);margin:4px 0 2px;padding:6px 0 0}
.du-loading{color:var(--dsw-alias-label-tertiary);margin:4px 0;font-size:12px;line-height:18px}
.du-skel{display:block}
.du-skelCard{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;flex-direction:column;gap:10px;min-width:0;padding:12px;display:flex;margin:10px auto}
.du-skelStat{border:1px solid var(--dsw-alias-border-l2);border-radius:12px;flex-direction:column;gap:8px;min-width:0;padding:10px;display:flex}
.du-skelRow{flex:none;align-items:center;justify-content:space-between;gap:12px;display:flex}
.du-skelCol{flex:1;min-width:0;flex-direction:column;gap:8px;display:flex}
.du-skelLine{background:var(--dsw-alias-fill-l2);border-radius:6px;height:14px;flex:none;position:relative;overflow:hidden}
.du-skelLine::after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,transparent,color-mix(in srgb,var(--dsw-alias-label-primary) 7%,transparent),transparent);transform:translateX(-100%);animation:du-shimmer 1.6s ease-in-out infinite}
.du-skelChart{background:var(--dsw-alias-fill-l2);border-radius:8px;height:130px;flex:none;position:relative;overflow:hidden}
.du-skelChart::after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,transparent,color-mix(in srgb,var(--dsw-alias-label-primary) 7%,transparent),transparent);transform:translateX(-100%);animation:du-shimmer 1.6s ease-in-out infinite}
@keyframes du-shimmer{100%{transform:translateX(100%)}}
.du-error{color:var(--dsw-alias-state-error-primary);margin:4px 0;font-size:12px;line-height:18px}
.du-updateBanner{border:1px solid var(--dsw-alias-state-business-primary);background:var(--dsw-alias-state-business-tertiary,color-mix(in srgb,var(--dsw-alias-state-business-primary) 10%,transparent));border-radius:10px;flex-direction:column;gap:6px;padding:8px 10px;display:flex}
.du-updateTitle{flex:none;align-items:center;gap:6px;color:var(--dsw-alias-state-business-primary);font-size:12px;font-weight:600;line-height:18px;display:flex}
.du-updateCommand{box-sizing:border-box;word-break:break-all;white-space:pre-wrap;color:var(--dsw-alias-label-secondary);font-family:var(--dsh-font-mono,monospace);font-size:11px;line-height:16px}
.du-updateLink{color:var(--dsw-alias-state-business-primary);flex:none;font-size:11px;line-height:16px}
.du-note{color:var(--dsw-alias-label-caption);margin:10px 0 0;font-size:11px;line-height:16px}
.du-tip{z-index:40;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2,var(--dsw-alias-bg-base));border-radius:8px;box-shadow:var(--dsw-shadow-lv2,0 8px 24px rgba(0,0,0,.35));flex-direction:column;gap:2px;padding:6px 9px;font-size:11px;line-height:16px;pointer-events:none;position:fixed;transform:translate(-50%,-100%);white-space:nowrap;display:flex}
.du-tipHeading{color:var(--dsw-alias-label-primary);font-weight:600;margin-bottom:2px}
.du-tipRow{flex:none;align-items:center;gap:6px;color:var(--dsw-alias-label-tertiary);display:flex}
.du-tipDot{width:8px;height:8px;border-radius:2px;flex:none}
.du-tipLabel{min-width:0;flex:1}
.du-tipRow b{color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;font-weight:500}
.du-activity{flex-direction:column;gap:4px;display:flex}
.du-activitySubtitle{color:var(--dsw-alias-label-caption);font-size:10px;font-weight:400;line-height:14px}
.du-summaryRow{flex:none;align-items:center;gap:6px;font-size:11px;line-height:16px;display:flex;flex-wrap:wrap}
.du-summaryLabel{color:var(--dsw-alias-label-caption);flex:none}
.du-summaryValue{color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;flex:none;font-weight:500}
.du-summarySep{color:var(--dsw-alias-label-caption);flex:none;opacity:.6}
.du-activityMonths{flex:none;position:relative;height:12px;margin-left:26px;display:block}
.du-activityMonth{position:absolute;top:0;color:var(--dsw-alias-label-caption);font-size:9px;line-height:12px}
.du-activityBody{flex:none;align-items:flex-start;gap:8px;display:flex}
.du-activityLabels{flex:none;flex-direction:column;gap:1px;width:26px;display:flex}
.du-activityLabels span{color:var(--dsw-alias-label-caption);height:6px;text-align:center;font-size:9px;line-height:6px;flex:none}
.du-activityGrid{flex:none;gap:1px;display:flex}
.du-activityWeek{flex:none;flex-direction:column;gap:1px;display:flex}
.du-activityCell{width:6px;height:6px;border-radius:1.5px;flex:none;position:relative;transition:opacity .1s}
.du-activityCell[data-dim]{opacity:.25}
.du-activityCaption{color:var(--dsw-alias-label-caption);font-size:10px;line-height:14px}
.du-calLegend{flex:none;align-items:center;gap:6px;color:var(--dsw-alias-label-caption);font-size:10px;line-height:14px;display:flex}
.du-calSwatch{width:12px;height:12px;border-radius:3px;flex:none}
`;
    const tagId = "@xavier711/dsh-deepseek-usage/panel-v4";
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
      periodTag: "du-periodTag",
      periodTagDot: "du-periodTagDot",
      periodDotRail: "du-periodDotRail",
      periodStrip: "du-periodStrip",
      periodStripDot: "du-periodStripDot",
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
      footer: "du-footer",
      card: "du-card",
      cardTitle: "du-cardTitle",
      cardHead: "du-cardHead",
      seg: "du-seg",
      segBtn: "du-segBtn",
      segActive: "du-segActive",
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
      wsItem: "du-wsItem",
      wsHeader: "du-wsHeader",
      wsChevron: "du-wsChevron",
      wsName: "du-wsName",
      wsCount: "du-wsCount",
      wsCost: "du-wsCost",
      wsBody: "du-wsBody",
      sessionList: "du-sessionList",
      sessionRow: "du-sessionRow",
      sessionHead: "du-sessionHead",
      sessionTitle: "du-sessionTitle",
      sessionMeta: "du-sessionMeta",
      loading: "du-loading",
      skel: "du-skel",
      skelCard: "du-skelCard",
      skelStat: "du-skelStat",
      skelRow: "du-skelRow",
      skelCol: "du-skelCol",
      skelLine: "du-skelLine",
      skelChart: "du-skelChart",
      error: "du-error",
      updateBanner: "du-updateBanner",
      updateTitle: "du-updateTitle",
      updateCommand: "du-updateCommand",
      updateLink: "du-updateLink",
      note: "du-note",
      tip: "du-tip",
      tipHeading: "du-tipHeading",
      tipRow: "du-tipRow",
      tipDot: "du-tipDot",
      tipLabel: "du-tipLabel",
      activity: "du-activity",
      activitySubtitle: "du-activitySubtitle",
      summaryRow: "du-summaryRow",
      summaryLabel: "du-summaryLabel",
      summaryValue: "du-summaryValue",
      summarySep: "du-summarySep",
      activityMonths: "du-activityMonths",
      activityMonth: "du-activityMonth",
      activityBody: "du-activityBody",
      activityLabels: "du-activityLabels",
      activityGrid: "du-activityGrid",
      activityWeek: "du-activityWeek",
      activityCell: "du-activityCell",
      activityCaption: "du-activityCaption",
      calLegend: "du-calLegend",
      calSwatch: "du-calSwatch"
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

    /** Short day label for a YYYY-MM-DD string (today marker for today). */
    function dayLabel(date, t) {
      const now = new Date();
      const pad = (x) => `${x}`.padStart(2, "0");
      const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
      if (date === today) return t("local.dayToday");
      return t(`local.wd${new Date(`${date}T00:00:00`).getDay()}`);
    }

    /** Sum of every token category in one bucket. */
    function bucketTokens(bucket) {
      return (bucket.inputTokens ?? 0) + (bucket.outputTokens ?? 0) + (bucket.cacheReadTokens ?? 0) + (bucket.cacheWriteTokens ?? 0) + (bucket.reasoningTokens ?? 0);
    }

    /** "HH:MM" for a minute-of-day value (0-1439). */
    function fmtClock(minutes) {
      const h = Math.floor(minutes / 60);
      const m = Math.round(minutes % 60);
      return `${`${h}`.padStart(2, "0")}:${`${m}`.padStart(2, "0")}`;
    }

    /** Beijing minutes-of-day (0-1439) for an epoch-ms value. */
    function beijingMinutes(ms, offsetMinutes) {
      return ((ms + offsetMinutes * 60_000) % 86_400_000) / 60_000;
    }

    /**
     * Human text for the current pricing period: "当前：高峰（09:00–12:00）·
     * 12:00 后转 空闲" (or the English equivalent). Weekends (all-day
     * off-peak since 2026-08-23) render "空闲（周末全天）" with the next
     * change pointing at the first peak start of the next weekday. Falls
     * back to a shorter form when the next boundary is missing or past.
     */
    function periodText(data, t) {
      const offset = typeof data.timezoneOffsetMinutes === "number" ? data.timezoneOffsetMinutes : 480;
      const name = t(data.period === "peak" ? "period.peak" : "period.offPeak");
      const range = Array.isArray(data.range) && data.range.length === 2
        ? `${fmtClock(data.range[0])}–${fmtClock(data.range[1])}`
        : null;
      const allDay = Array.isArray(data.range) && data.range.length === 2 && data.range[0] === 0 && data.range[1] === 1440;
      if (data.period === "flat") return `${t("period.label")}：${t("period.flat")}`;
      const now = Date.now();
      if (typeof data.nextAt === "number" && data.nextAt > now + 1000) {
        const nextName = t(data.nextPeriod === "peak" ? "period.peak" : "period.offPeak");
        const nextClock = fmtClock(beijingMinutes(data.nextAt, offset));
        const nextDay = Math.floor((data.nextAt + offset * 60_000) / 86_400_000);
        const nowDay = Math.floor((now + offset * 60_000) / 86_400_000);
        if (allDay) {
          // 周末全天低谷价：下一次切换是下一个工作日（周一至周五）的高峰开始。
          const weekdays = t("period.weekdays");
          const dayName = Array.isArray(weekdays)
            ? weekdays[new Date(data.nextAt + offset * 60_000).getUTCDay()] ?? ""
            : "";
          return `${t("period.label")}：${name}（${t("period.weekend")}） · ${t("period.next", { time: `${dayName} ${nextClock}`.trim(), period: nextName })}`;
        }
        const prefix = nextDay > nowDay ? `${t("period.tomorrow")} ` : "";
        return `${t("period.label")}：${name}${range ? `（${range}）` : ""} · ${t("period.next", { time: prefix + nextClock, period: nextName })}`;
      }
      return `${t("period.label")}：${name}${range ? `（${range}）` : ""}`;
    }

    // ---- hover tooltips ----------------------------------------------------

    /**
     * Shared hover-tooltip state for the charts: show(event, content) anchors
     * the tip above the hovered element (viewport coords — the panel is
     * position:fixed, and the tip itself is fixed, so it escapes scrolling).
     */
    function useChartTip() {
      const [tip, setTip] = react.useState(null);
      const show = react.useCallback((event, content) => {
        const rect = event.currentTarget.getBoundingClientRect();
        setTip({ left: rect.left + rect.width / 2, top: rect.top - 6, content });
      }, []);
      const hide = react.useCallback(() => setTip(null), []);
      return [tip, show, hide];
    }

    /** Fixed-position tooltip box rendered by charts that own a tip state. */
    function ChartTip({ tip }) {
      if (tip === null) return null;
      return react.createElement("div", { className: styles.tip, style: { left: tip.left, top: tip.top }, role: "tooltip" }, tip.content);
    }

    /** Label/value rows of one token bucket, localized. */
    function tipRows(bucket, t) {
      return [
        [t("local.calls"), `${fmtInt(bucket.calls)}`],
        [t("local.cacheRead"), `${fmtInt(bucket.cacheReadTokens)}`, "var(--du-cacheRead)"],
        [t("local.input"), `${fmtInt(bucket.inputTokens)}`, "var(--du-input)"],
        [t("local.output"), `${fmtInt(bucket.outputTokens)}`, "var(--du-output)"],
        [t("local.reasoning"), `${fmtInt(bucket.reasoningTokens)}`, "var(--du-reasoning)"],
        [t("local.cacheWrite"), `${fmtInt(bucket.cacheWriteTokens)}`, "var(--du-cacheWrite)"],
        [t("local.cost"), fmtCost(bucket.cost)]
      ];
    }

    /** Tooltip body: optional heading plus label/value rows (with chart colors). */
    function TipBody({ heading, rows }) {
      return react.createElement("div", null,
        heading ? react.createElement("div", { className: styles.tipHeading }, heading) : null,
        rows.map(([label, value, color]) =>
          react.createElement("div", { className: styles.tipRow, key: label },
            color ? react.createElement("span", { className: styles.tipDot, style: { background: color } }) : null,
            react.createElement("span", { className: styles.tipLabel }, label),
            react.createElement("b", null, value)
          )
        )
      );
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

    function fetchPeriod() {
      return fetchJson("/dsh-usage/period");
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

    /**
     * Codex-style token activity heatmap: weeks as columns (Monday-first),
     * weekdays as rows, cell intensity = daily tokens; hover shows the day's
     * full breakdown. Mirrors the GitHub contribution graph layout.
     */
    /** Sum several token buckets into one (numbers only). */
    function CompositionBar({ bucket, t }) {
      const [tip, show, hide] = useChartTip();
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
          visible.map(([key, value, color, label]) => {
            const pct = total > 0 ? ((value / total) * 100).toFixed(1) : "0.0";
            const content = react.createElement(TipBody, {
              rows: [
                [label, `${fmtCompact(value)} · ${pct}%`, color],
                [t("local.totalTokens"), fmtCompact(total)]
              ]
            });
            return react.createElement("span", {
              key,
              className: styles.compositionSeg,
              style: { width: `${(value / Math.max(1, total)) * 100}%`, background: color },
              onMouseEnter: (e) => show(e, content),
              onMouseLeave: hide
            });
          })
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
        ),
        react.createElement(ChartTip, { tip })
      );
    }

    /** Per-model usage rows, most expensive first, with a relative cost bar. */
    function ModelStats({ models, t }) {
      const [tip, show, hide] = useChartTip();
      const maxCost = Math.max(1e-6, ...models.map((m) => m.cost));
      return react.createElement("div", { className: styles.card },
        react.createElement("div", { className: styles.cardTitle }, t("local.byModel")),
        models.map((m) => {
          const content = react.createElement(TipBody, {
            heading: m.model,
            rows: tipRows(m, t)
          });
          return react.createElement("div", { className: styles.modelRow, key: m.model, onMouseEnter: (e) => show(e, content), onMouseLeave: hide },
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
          );
        }),
        react.createElement(ChartTip, { tip })
      );
    }

    /**
     * Per-workspace usage rows (workspace = the session's working directory)
     * as a collapsible panel, following the harness disclosure pattern:
     * header = chevron (right → down when open) + workspace name + session
     * count + estimated cost; the body lists the workspace's own session
     * records. Hovering the header shows the full token/cost breakdown
     * tooltip (heading = the full path).
     */
    function WorkspaceStats({ workspaces, t }) {
      const [tip, show, hide] = useChartTip();
      const [expanded, setExpanded] = react.useState(null);
      return react.createElement("div", { className: styles.card },
        react.createElement("div", { className: styles.cardTitle }, t("local.byWorkspace")),
        workspaces.map((w) => {
          const total = w.buckets.total;
          const name = w.name ?? t("local.workspaceUnassigned");
          const open = expanded === w.path;
          const content = react.createElement(TipBody, { heading: w.path ?? name, rows: tipRows(total, t) });
          return react.createElement("div", { className: styles.wsItem, key: w.path ?? "" },
            react.createElement("button", {
              type: "button",
              className: styles.wsHeader,
              "aria-expanded": open,
              onClick: () => setExpanded(open ? null : w.path),
              onMouseEnter: (e) => show(e, content),
              onMouseLeave: hide
            },
              react.createElement("span", { className: styles.wsChevron, "aria-hidden": true },
                open
                  ? react.createElement(_p.IconChevronDownOutline14, {})
                  : react.createElement(_p.IconChevronRightOutline14, {})
              ),
              react.createElement("span", { className: styles.wsName, title: w.path ?? undefined }, name),
              w.subagentSessionCount > 0
                ? react.createElement("span", { className: styles.estimatedBadge }, t("local.workspaceSubagents", { count: w.subagentSessionCount }))
                : null,
              react.createElement("span", { className: styles.wsCount }, t("local.wsSessions", { count: w.sessionCount })),
              react.createElement("span", { className: styles.wsCost }, fmtCost(total.cost))
            ),
            open ? react.createElement("div", { className: styles.wsBody },
              react.createElement(SessionList, { sessions: w.sessions, t })
            ) : null
          );
        }),
        react.createElement(ChartTip, { tip })
      );
    }

    /** Compact period stat card (今日 / 近7天 / 累计). */
    function StatCard({ title, bucket, t }) {
      return react.createElement("div", { className: styles.statCard },
        react.createElement("div", { className: styles.statTitle }, title),
        react.createElement("div", { className: styles.statTokens, title: `${fmtInt(bucketTokens(bucket))} ${t("local.tokens")}` }, fmtCompact(bucketTokens(bucket))),
        react.createElement("div", { className: styles.statMeta }, t("local.callsShort", { count: bucket.calls })),
        react.createElement("div", { className: styles.statCost }, fmtCost(bucket.cost))
      );
    }

    /**
     * Per-session rows, most recently active first. Each row is plain
     * title + meta text; hovering a row shows the full breakdown (tokens by
     * category + estimated cost). No bar: raw token composition is dominated
     * by cheap cache hits in real usage, so a bar would mislead.
     */
    function SessionList({ sessions, t }) {
      const [tip, show, hide] = useChartTip();
      const sorted = [...sessions].sort((a, b) => (b.lastActiveAt ?? 0) - (a.lastActiveAt ?? 0));
      return react.createElement("ul", { className: styles.sessionList },
        sorted.map((session) => {
          const tokens = bucketTokens(session);
          const content = react.createElement(TipBody, {
            heading: session.title || session.id,
            rows: tipRows(session, t)
          });
          return react.createElement("li", {
            className: styles.sessionRow,
            key: session.id,
            onMouseEnter: (e) => show(e, content),
            onMouseLeave: hide
          },
            react.createElement("div", { className: styles.sessionHead },
              react.createElement("span", { className: styles.sessionTitle, title: session.title || session.id }, session.title || session.id),
              session.subagent === true
                ? react.createElement("span", { className: styles.estimatedBadge, title: t("local.subagentHint") }, t("local.subagent"))
                : null,
              react.createElement("span", { className: styles.sessionMeta }, t("local.sessionMeta", { tokens: fmtCompact(tokens), calls: session.calls ?? 0, date: fmtDate(session.lastActiveAt ?? session.createdAt) }))
            )
          );
        }),
        react.createElement(ChartTip, { tip })
      );
    }

    /** Loading/error gate for the local-data tabs; body receives the ok data. */
/** Skeleton screen: shimmer placeholders matching the final card layout. */
    function SkeletonScreen({ t }) {
      const line = (width, height) => react.createElement("div", { className: styles.skelLine, style: { width, height } });
      const col = (...children) => react.createElement("div", { className: styles.skelCol }, ...children);
      const row = (...children) => react.createElement("div", { className: styles.skelRow }, ...children);
      return react.createElement("div", { className: styles.skel, role: "status", "aria-label": t("loading") },
        // balance card
        react.createElement("div", { className: styles.skelCard },
          row(
            col(line("40%", 10), line("55%", 26)),
            line("22%", 20)
          ),
          line("100%", 6),
          row(line("30%", 10), line("30%", 10))
        ),
        // stat grid
        react.createElement("div", { className: styles.statGrid },
          [0, 1, 2].map((i) =>
            react.createElement("div", { className: styles.skelStat, key: i },
              line("50%", 10),
              line("72%", 20),
              line("58%", 10),
              line("40%", 10)
            )
          )
        ),
        // today composition
        react.createElement("div", { className: styles.skelCard },
          line("30%", 12),
          line("100%", 12),
          [0, 1, 2, 3].map((i) => row(line("20%", 10), line("30%", 10)))
        ),
        // usage trend
        react.createElement("div", { className: styles.skelCard },
          row(line("25%", 12), line("35%", 20)),
          react.createElement("div", { className: styles.skelChart }),
          line("50%", 10)
        ),
        // per-model
        react.createElement("div", { className: styles.skelCard },
          line("25%", 12),
          [0, 1].map((i) =>
            react.createElement("div", { className: styles.skelCol, key: i },
              row(line("40%", 12), line("30%", 10)),
              line("100%", 4)
            )
          )
        ),
        // per-workspace
        react.createElement("div", { className: styles.skelCard },
          line("25%", 12),
          [0, 1].map((i) =>
            react.createElement("div", { className: styles.skelCol, key: i },
              row(line("40%", 12), line("35%", 10)),
              line("60%", 4)
            )
          )
        )
      );
    }

    /** Loading/error gate for the local-data sections. */
    function LocalContent({ local, t }) {
      if (local === null || local.state === "loading") {
        return react.createElement("div", { className: styles.loading }, t("loading"));
      }
      if (local.state === "error") {
        return react.createElement("div", { className: styles.error }, local.message);
      }
      const data = local.data;
      return react.createElement(react.Fragment, null,
        react.createElement("div", { className: styles.statGrid },
          react.createElement(StatCard, { title: t("local.today"), bucket: data.buckets.today, t }),
          react.createElement(StatCard, { title: t("local.week"), bucket: data.buckets.week, t }),
          react.createElement(StatCard, { title: t("local.total"), bucket: data.buckets.total, t })
        ),
        data.errorSessions > 0
          ? react.createElement("div", { className: styles.error }, t("local.failedSessions", { count: data.errorSessions }))
          : null,
        react.createElement(CompositionBar, { bucket: data.buckets.today, t }),
        react.createElement(TrendChart, { data, t }),
        Array.isArray(data.models) && data.models.length > 0
          ? react.createElement(ModelStats, { models: data.models, t })
          : null,
        Array.isArray(data.workspaces) && data.workspaces.length > 0
          ? react.createElement(WorkspaceStats, { workspaces: data.workspaces, t })
          : null
      );
    }

    /**
     * Usage trend: a fixed-height stacked bar chart over 近 7 天 / 近 30 天 /
     * 近 12 个月 (range switcher changes the data, never the layout, so the
     * panel does not jump), plus the Lifetime/Peak/Streak summary line.
     */
    function TrendChart({ data, t }) {
      const [tip, show, hide] = useChartTip();
      const [range, setRange] = react.useState("7d");
      const days = Array.isArray(data.days) ? data.days : [];
      const activity = data.activity !== null && typeof data.activity === "object" ? data.activity : null;
      const activityDays = Array.isArray(activity?.days) ? activity.days : [];
      const now = new Date();
      const pad = (x) => `${x}`.padStart(2, "0");
      const todayKey = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
      // 30-day frame: last 30 activity days (future days excluded).
      const past30 = activityDays.filter((d) => d.date <= todayKey).slice(-30);
      // 12-month frame: group activity days by calendar month.
      const monthMap = new Map();
      for (const day of activityDays) {
        if (day.date > todayKey) continue;
        const key = day.date.slice(0, 7);
        const slot = monthMap.get(key) ?? { date: key, calls: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0, cost: 0 };
        slot.calls += day.calls;
        slot.inputTokens += day.inputTokens;
        slot.outputTokens += day.outputTokens;
        slot.cacheReadTokens += day.cacheReadTokens;
        slot.cacheWriteTokens += day.cacheWriteTokens;
        slot.reasoningTokens += day.reasoningTokens;
        slot.cost += day.cost;
        monthMap.set(key, slot);
      }
      const months = [...monthMap.values()].sort((a, b) => (a.date < b.date ? -1 : 1)).slice(-12);
      const buckets = range === "7d" ? days : range === "30d" ? past30 : months;
      const heading = (bucket) => range === "12m"
        ? `${t(`local.month${parseInt(bucket.date.slice(5, 7), 10)}`)} ${bucket.date.slice(0, 4)}`
        : bucket.date;
      const xLabel = (bucket, index) => {
        if (range === "7d") return dayLabel(bucket.date, t);
        if (range === "12m") return t(`local.month${parseInt(bucket.date.slice(5, 7), 10)}`);
        return `${parseInt(bucket.date.slice(8), 10)}`;
      };
      const labelEvery = range === "30d" ? 5 : 1;
      const W = 380;
      const H = 150;
      const BASE = 118;
      const TOP = 22;
      const SLOT = buckets.length > 0 ? W / buckets.length : W;
      const BAR_W = Math.min(24, SLOT - 6);
      const max = Math.max(1, ...buckets.map((b) => bucketTokens(b)));
      const segments = [
        ["cacheReadTokens", "var(--du-cacheRead)", t("local.cacheRead")],
        ["inputTokens", "var(--du-input)", t("local.input")],
        ["outputTokens", "var(--du-output)", t("local.output")],
        ["reasoningTokens", "var(--du-reasoning)", t("local.reasoning")],
        ["cacheWriteTokens", "var(--du-cacheWrite)", t("local.cacheWrite")]
      ];
      const bars = buckets.map((bucket, i) => {
        const x = i * SLOT + (SLOT - BAR_W) / 2;
        let y = BASE;
        const rects = [];
        for (const [field, color] of segments) {
          const h = ((bucket[field] ?? 0) / max) * (BASE - TOP);
          if (h <= 0) continue;
          y -= h;
          rects.push(react.createElement("rect", { key: field, x, y, width: BAR_W, height: h, rx: 2, style: { fill: color } }));
        }
        const content = react.createElement(TipBody, {
          heading: heading(bucket),
          rows: tipRows(bucket, t)
        });
        return react.createElement("g", { key: bucket.date, className: "du-barGroup", onMouseEnter: (e) => show(e, content), onMouseLeave: hide },
          rects,
          i % labelEvery === 0
            ? react.createElement("text", { x: x + BAR_W / 2, y: H - 8, textAnchor: "middle", style: { fill: "var(--dsw-alias-label-caption)", fontSize: 9 } }, xLabel(bucket, i))
            : null
        );
      });
      const summary = activity?.summary;
      const summaryRows = [];
      if (summary !== null && typeof summary === "object") {
        if (typeof summary.lifetimeTokens === "number") summaryRows.push([t("local.summaryLifetime"), fmtCompact(summary.lifetimeTokens)]);
        if (typeof summary.peakDailyTokens === "number") summaryRows.push([t("local.summaryPeak"), fmtCompact(summary.peakDailyTokens)]);
        if (typeof summary.currentStreakDays === "number") {
          const streakText = summary.currentStreakDays === summary.longestStreakDays
            ? t("local.streakDays", { days: summary.currentStreakDays })
            : t("local.streakDaysBest", { days: summary.currentStreakDays, best: summary.longestStreakDays });
          summaryRows.push([t("local.summaryStreak"), streakText]);
        }
      }
      const ranges = [
        ["7d", t("local.range7d")],
        ["30d", t("local.range30d")],
        ["12m", t("local.range12m")]
      ];
      return react.createElement("div", { className: styles.card },
        react.createElement("div", { className: styles.cardHead },
          react.createElement("div", { className: styles.cardTitle }, t("local.trend")),
          react.createElement("div", { className: styles.seg, role: "tablist", "aria-label": t("local.trend") },
            ranges.map(([key, label]) =>
              react.createElement("button", {
                type: "button",
                key,
                role: "tab",
                "aria-selected": key === range,
                className: key === range ? styles.segActive : styles.segBtn,
                onClick: () => setRange(key)
              }, label)
            )
          )
        ),
        summaryRows.length > 0
          ? react.createElement("div", { className: styles.summaryRow },
              summaryRows.map(([label, value], i) =>
                react.createElement(react.Fragment, { key: label },
                  i > 0 ? react.createElement("span", { className: styles.summarySep }, "·") : null,
                  react.createElement("span", { className: styles.summaryLabel }, label),
                  react.createElement("b", { className: styles.summaryValue }, value)
                )
              )
            )
          : null,
        react.createElement("svg", { viewBox: `0 0 ${W} ${H}`, className: `${styles.chart} ${styles.bars}`, role: "img", "aria-label": t("local.trend") },
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
        ),
        react.createElement(ChartTip, { tip })
      );
    }

    // ---- main component ----------------------------------------------------

    /**
     * Sidebar footer action (beside Settings): opens the usage panel.
     * @param props - runtime slot currency ({ wide }) plus the namespace translator
     * and the standard useSessions snapshot hook (absent in the render test).
     */
    function UsagePanel({ wide, t, useSessions }) {
      const [open, setOpen] = react.useState(false);
      const [balance, setBalance] = react.useState(null);
      const [local, setLocal] = react.useState(null);
      const [update, setUpdate] = react.useState(null);
      const [period, setPeriod] = react.useState(null);
      const rootRef = react.useRef(null);

      const refresh = react.useCallback(() => {
        setBalance((current) => current === null ? { state: "loading" } : current);
        setLocal((current) => current === null ? { state: "loading" } : current);
        fetchBalance().then(setBalance).catch((error) => setBalance({ state: "error", message: String(error) }));
        fetchLocal().then(setLocal).catch((error) => setLocal({ state: "error", message: String(error) }));
        fetchVersion().then(setUpdate).catch(() => setUpdate((current) => current ?? null));
        fetchPeriod().then(setPeriod).catch(() => setPeriod((current) => current ?? null));
      }, []);

      // Signal-driven badge refresh (no polling). The sidebar cost only
      // changes when new usage lands, so we refresh on activity signals:
      // session-list snapshot changes, tab focus/visibility, and panel open.
      // A 500ms debounce coalesces bursts and a 5s cooldown bounds the fetch
      // rate; the host TTL-caches /dsh-usage/local so repeats stay cheap.
      const lastRefreshAt = react.useRef(0);
      const pendingRefresh = react.useRef(0);
      const scheduleRefresh = react.useCallback(() => {
        if (pendingRefresh.current !== 0) return;
        pendingRefresh.current = window.setTimeout(() => {
          pendingRefresh.current = 0;
          const now = Date.now();
          if (now - lastRefreshAt.current < 5_000) return;
          lastRefreshAt.current = now;
          refresh();
        }, 500);
      }, [refresh]);

      // Standard hook: re-renders whenever the session list snapshot changes.
      // A fallback keeps the render test (no useSessions prop) working while
      // keeping the hook call unconditional.
      const list = (typeof useSessions === "function" ? useSessions : () => null)((s) => s);
      const lastActivityAt = react.useRef(0);
      react.useEffect(() => {
        // Any session activity (new usage bumps the row's updatedAt) advances
        // the max-activity fingerprint; a change schedules a badge refresh.
        if (list === null || typeof list !== "object") return;
        let maxAt = 0;
        const ids = Array.isArray(list.ids) ? list.ids : [];
        const byId = list.byId ?? {};
        for (const id of ids) {
          const updatedAt = byId[id]?.updatedAt;
          if (typeof updatedAt === "number" && updatedAt > maxAt) maxAt = updatedAt;
        }
        if (maxAt !== lastActivityAt.current) {
          lastActivityAt.current = maxAt;
          scheduleRefresh();
        }
      }, [list, scheduleRefresh]);

      // Fallback signals: refresh when the tab becomes visible again or the
      // window regains focus (covers usage that happened while away).
      react.useEffect(() => {
        const onVisibility = () => {
          if (document.visibilityState === "visible") scheduleRefresh();
        };
        const onFocus = () => scheduleRefresh();
        document.addEventListener("visibilitychange", onVisibility);
        window.addEventListener("focus", onFocus);
        return () => {
          document.removeEventListener("visibilitychange", onVisibility);
          window.removeEventListener("focus", onFocus);
          if (pendingRefresh.current !== 0) window.clearTimeout(pendingRefresh.current);
        };
      }, [scheduleRefresh]);

      // Keep the current peak/off-peak period fresh: refetch exactly at the
      // next boundary (plus a small skew), or after a minute when the route
      // is unavailable.
      react.useEffect(() => {
        let timer = 0;
        let cancelled = false;
        const load = () => {
          fetchPeriod().then((result) => {
            if (cancelled) return;
            setPeriod(result);
            let delay = 60_000;
            if (result.state === "ok" && typeof result.data.nextAt === "number") {
              delay = Math.min(Math.max(result.data.nextAt - Date.now() + 250, 1_000), 6 * 60 * 60 * 1000);
            }
            timer = window.setTimeout(load, delay);
          }).catch(() => {
            if (cancelled) return;
            timer = window.setTimeout(load, 60_000);
          });
        };
        load();
        return () => {
          cancelled = true;
          if (timer !== 0) window.clearTimeout(timer);
        };
      }, []);

      react.useEffect(() => {
        // Panel open always refreshes immediately (direct call, not the
        // debounced signal path). Outside the panel the badge stays fresh via
        // the activity/focus signals above — no polling at all.
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
      const periodData = period?.state === "ok" ? period.data : null;
      const periodName = periodData !== null && periodData.period !== "flat"
        ? t(periodData.period === "peak" ? "period.peak" : "period.offPeak")
        : null;
      const badge = react.createElement("button", {
        type: "button",
        className: styles.badge,
        "data-active": open || undefined,
        "aria-expanded": open,
        "aria-label": periodName ? `${t("trigger.aria")} · ${periodName}` : t("trigger.aria"),
        onClick: () => setOpen((v) => !v)
      },
        react.createElement(_p.IconDataOutline16, {}),
        wide ? react.createElement("span", { className: styles.badgeLabel }, t("trigger.label")) : null,
        wide && todayCost > 0 ? react.createElement("span", { className: styles.badgeCount }, fmtCost(todayCost)) : null,
        periodName ? (wide
          ? react.createElement("span", { className: styles.periodTag, "data-period": periodData.period, style: todayCost > 0 ? undefined : { marginLeft: "auto" }, "aria-hidden": true },
              react.createElement("span", { className: styles.periodTagDot }),
              periodName
            )
          : react.createElement("span", { className: styles.periodDotRail, "data-period": periodData.period, "aria-hidden": true })
        ) : null
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
          periodData
            ? react.createElement("div", { className: styles.periodStrip, "data-period": periodData.period },
                react.createElement("span", { className: styles.periodStripDot }),
                react.createElement("span", null, periodText(periodData, t))
              )
            : null,
          react.createElement("div", { className: styles.body },
            react.createElement(UpdateBanner, { update, t }),
            balance === null || balance.state === "loading" || local === null || local.state === "loading"
              ? react.createElement(SkeletonScreen, { t })
              : react.createElement(react.Fragment, null,
                  react.createElement(BalanceSection, { balance, t }),
                  react.createElement(LocalContent, { local, t })
                )
          ),
          react.createElement("div", { className: styles.footer }, t("panel.note"))
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
      "period.label": "当前",
      "period.peak": "高峰",
      "period.offPeak": "空闲",
      "period.flat": "统一价",
      "period.next": "{time} 后转 {period}",
      "period.tomorrow": "次日",
      "period.weekend": "周末全天",
      "period.weekdays": ["周日", "周一", "周二", "周三", "周四", "周五", "周六"],
      "local.trend": "用量趋势",
      "local.range7d": "近 7 天",
      "local.range30d": "近 30 天",
      "local.range12m": "近 12 个月",
      "action.refresh": "刷新",
      "action.close": "关闭",
      "loading": "读取中…",
      "balance.total": "总余额",
      "balance.granted": "赠送余额",
      "balance.toppedUp": "充值余额",
      "balance.status": "状态",
      "balance.available": "可用",
      "balance.unavailable": "不可用",
      "balance.noKeyHint": "未配置 DEEPSEEK_API_KEY，可在 ~/.dsh/.credentials.yaml 或环境变量中设置后刷新。",
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
      "local.dayToday": "今",
      "local.wd0": "日",
      "local.wd1": "一",
      "local.wd2": "二",
      "local.wd3": "三",
      "local.wd4": "四",
      "local.wd5": "五",
      "local.wd6": "六",
      "local.month1": "1月",
      "local.month2": "2月",
      "local.month3": "3月",
      "local.month4": "4月",
      "local.month5": "5月",
      "local.month6": "6月",
      "local.month7": "7月",
      "local.month8": "8月",
      "local.month9": "9月",
      "local.month10": "10月",
      "local.month11": "11月",
      "local.month12": "12月",
      "local.tokens": "tokens",
      "local.totalTokens": "总 tokens",
      "local.activity": "Token 活动",
      "local.last12Months": "最近 12 个月",
      "local.viewDaily": "日",
      "local.viewWeekly": "周",
      "local.viewCumulative": "累计",
      "local.cumulative": "累计",
      "local.summaryLifetime": "累计总量",
      "local.summaryPeak": "单日峰值",
      "local.summaryStreak": "连续天数",
      "local.streakDays": "{days} 天",
      "local.streakDaysBest": "{days} 天 (最长 {best} 天)",
      "local.weeklyCaption": "每列 = 1 周 · 最高",
      "local.cumulativeCaption": "累计 · 顶部",
      "local.month": "本月用量",
      "local.less": "少",
      "local.more": "多",
      "local.todayComposition": "今日构成",
      "local.byModel": "按模型统计",
      "local.byWorkspace": "按工作区统计",
      "local.workspaceUnassigned": "未关联工作区",
      "local.wsSessions": "{count} 个会话",
      "local.workspaceSubagents": "{count} 个子代理",
      "local.estimated": "估算",
      "local.modelMeta": "{tokens} tok · {calls} 次 · {cost}",
      "local.sessionMeta": "{tokens} tok · {calls} 次 · {date}",
      "local.subagent": "子代理",
      "local.subagentHint": "由主任务派生的子代理会话",
      "update.available": "发现新版本 v{version}",
      "update.releases": "查看发布页",
      "panel.note": "费用按 DeepSeek 官方定价分模型估算。"
    };

    /** English dictionary, key-identical to the Chinese source of truth. */
    const en = {
      "trigger.aria": "DeepSeek usage",
      "trigger.label": "Usage",
      "panel.title": "DeepSeek usage",
      "panel.subtitle": "Balance · Token stats",
      "period.label": "Now",
      "period.peak": "Peak",
      "period.offPeak": "Off-peak",
      "period.flat": "Flat pricing",
      "period.next": "{period} at {time}",
      "period.tomorrow": "tomorrow",
      "period.weekend": "weekend all day",
      "period.weekdays": ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
      "local.trend": "Usage trend",
      "local.range7d": "7 days",
      "local.range30d": "30 days",
      "local.range12m": "12 months",
      "action.refresh": "Refresh",
      "action.close": "Close",
      "loading": "Loading…",
      "balance.total": "Total balance",
      "balance.granted": "Granted balance",
      "balance.toppedUp": "Topped-up balance",
      "balance.status": "Status",
      "balance.available": "Available",
      "balance.unavailable": "Unavailable",
      "balance.noKeyHint": "DEEPSEEK_API_KEY is not configured; set it in ~/.dsh/.credentials.yaml or the environment, then refresh.",
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
      "local.dayToday": "T",
      "local.wd0": "Sun",
      "local.wd1": "Mon",
      "local.wd2": "Tue",
      "local.wd3": "Wed",
      "local.wd4": "Thu",
      "local.wd5": "Fri",
      "local.wd6": "Sat",
      "local.month1": "Jan",
      "local.month2": "Feb",
      "local.month3": "Mar",
      "local.month4": "Apr",
      "local.month5": "May",
      "local.month6": "Jun",
      "local.month7": "Jul",
      "local.month8": "Aug",
      "local.month9": "Sep",
      "local.month10": "Oct",
      "local.month11": "Nov",
      "local.month12": "Dec",
      "local.tokens": "tokens",
      "local.totalTokens": "Total tokens",
      "local.activity": "Token activity",
      "local.last12Months": "last 12 months",
      "local.viewDaily": "Daily",
      "local.viewWeekly": "Weekly",
      "local.viewCumulative": "Cumulative",
      "local.cumulative": "Cumulative",
      "local.summaryLifetime": "Lifetime",
      "local.summaryPeak": "Peak",
      "local.summaryStreak": "Streak",
      "local.streakDays": "{days}d",
      "local.streakDaysBest": "{days}d (best {best}d)",
      "local.weeklyCaption": "Each column = 1 week · tallest",
      "local.cumulativeCaption": "Running total · top",
      "local.month": "This month",
      "local.less": "Less",
      "local.more": "More",
      "local.todayComposition": "Today's breakdown",
      "local.byModel": "By model",
      "local.byWorkspace": "By workspace",
      "local.workspaceUnassigned": "No workspace",
      "local.wsSessions": "{count} sessions",
      "local.workspaceSubagents": "{count} subagents",
      "local.estimated": "est.",
      "local.modelMeta": "{tokens} tok · {calls} calls · {cost}",
      "local.sessionMeta": "{tokens} tok · {calls} calls · {date}",
      "local.subagent": "sub",
      "local.subagentHint": "Delegated subagent session forked from a main task",
      "update.available": "New version v{version} available",
      "update.releases": "Releases",
      "panel.note": "Cost is estimated per model at official DeepSeek rates."
    };

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  }
});

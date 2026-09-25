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
 * weekends (Sat/Sun, since 2026-08-23) and Chinese statutory holidays (since
 * 2026-09-19, schedule configurable through `holidayRanges`) are all-day
 * off-peak. The sidebar
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
.du-badge{box-sizing:border-box;cursor:pointer;width:calc(100% + 4px);height:42px;color:var(--dsw-alias-label-primary);background:0 0;border:none;border-radius:12px;flex:none;align-items:center;gap:8px;margin:4px -2px;padding:0 10px 0 8px;font-family:inherit;font-size:14px;line-height:22px;display:flex;overflow:hidden;position:relative}
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
.du-calNotice{flex:none;align-items:center;gap:6px;border-bottom:1px solid var(--dsw-alias-border-l2);background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 10%,transparent);color:var(--dsw-alias-state-warn-primary);padding:6px 12px;font-size:11px;line-height:16px;display:flex}
.du-calNoticeDot{width:7px;height:7px;border-radius:50%;background:currentColor;flex:none}
.du-cfgRoot{flex-direction:column;gap:14px;display:flex}
.du-cfgGroup{flex-direction:column;gap:8px;display:flex}
.du-cfgGroupTitle{color:var(--dsw-alias-label-primary);margin:0;font-size:12px;font-weight:600;line-height:18px}
.du-cfgWarn{color:var(--dsw-alias-state-warn-primary);margin:0;font-size:11px;line-height:16px}
.du-cfgField{flex-direction:column;gap:4px;display:flex}
.du-cfgLabel{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}
.du-cfgInput,.du-cfgTextarea{box-sizing:border-box;width:100%;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:6px 8px;font-family:inherit;font-size:12px;line-height:18px}
.du-cfgTextarea{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;resize:vertical}
.du-cfgHint{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px}
.du-cfgError{color:var(--dsw-alias-state-error-primary);margin:0;font-size:11px;line-height:16px}
.du-cfgSaved{color:var(--dsw-alias-state-success-primary);margin:0;font-size:11px;line-height:16px}
.du-cfgActions{display:flex;gap:8px}
.du-cfgSave{cursor:pointer;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:6px 14px;font-family:inherit;font-size:12px;line-height:18px}
.du-cfgSave:disabled{cursor:default;opacity:.5}
.du-layer.du-rail .du-badge{border-radius:50%;justify-content:center;gap:0;width:36px;height:36px;margin:8px 0 10px;padding:0}
.du-panel{z-index:30;background:var(--dsw-alias-bg-base);width:440px;max-width:calc(100vw - 24px);max-height:75vh;border:1px solid var(--dsw-alias-border-inverted);box-shadow:var(--dsw-shadow-lv3);--du-input:var(--dsw-alias-label-tertiary);--du-output:var(--dsw-alias-state-business-primary);--du-cacheRead:var(--dsw-alias-state-success-primary);--du-cacheWrite:var(--dsw-alias-state-warn-primary);--du-reasoning:var(--dsw-alias-state-error-primary);border-radius:14px;flex-direction:column;display:flex;position:fixed;bottom:128px;left:12px;overflow:hidden}
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
.du-tip{z-index:40;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2,var(--dsw-alias-bg-base));border-radius:8px;box-shadow:var(--dsw-shadow-lv2,0 8px 24px rgba(0,0,0,.35));flex-direction:column;gap:2px;padding:6px 9px;font-size:11px;line-height:16px;pointer-events:none;position:fixed;transform:translate(-50%,-100%);white-space:nowrap;max-width:min(340px,calc(100vw - 24px));display:flex}
.du-tipHeading{color:var(--dsw-alias-label-primary);font-weight:600;margin-bottom:2px;white-space:normal;overflow-wrap:anywhere}
.du-tipRow{flex:none;align-items:center;gap:6px;color:var(--dsw-alias-label-tertiary);display:flex}
.du-tipDot{width:8px;height:8px;border-radius:2px;flex:none}
.du-tipLabel{min-width:0;flex:1}
.du-tipRow b{color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;font-weight:500}
.du-activity{flex-direction:column;gap:6px;display:flex}
.du-activitySubtitle{color:var(--dsw-alias-label-caption);font-size:10px;font-weight:400;line-height:14px}
.du-summaryRow{flex:none;align-items:center;gap:6px;font-size:11px;line-height:16px;display:flex;flex-wrap:wrap}
.du-summaryLabel{color:var(--dsw-alias-label-caption);flex:none}
.du-summaryValue{color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;flex:none;font-weight:500}
.du-summarySep{color:var(--dsw-alias-label-caption);flex:none;opacity:.6}
.du-barLegend{flex:none;align-items:center;gap:12px;font-size:11px;line-height:16px;display:flex;flex-wrap:wrap}
.du-barLegendItem{flex:none;align-items:center;gap:5px;color:var(--dsw-alias-label-tertiary);display:inline-flex}
.du-barLegendDot{width:8px;height:8px;border-radius:2px;flex:none}
.du-activityMonths{flex:none;position:relative;height:12px;margin-left:24px;display:block}
.du-activityMonth{position:absolute;top:0;color:var(--dsw-alias-label-caption);font-size:9px;line-height:12px}
.du-activityBody{flex:none;align-items:flex-start;gap:6px;display:flex}
.du-activityLabels{flex:none;flex-direction:column;gap:4px;width:18px;display:flex}
.du-activityLabels span{color:var(--dsw-alias-label-caption);height:10px;text-align:center;font-size:10px;line-height:10px;flex:none}
.du-activityGrid{flex:none;gap:4px;display:flex}
.du-activityWeek{flex:none;flex-direction:column;gap:4px;display:flex}
/* 格距是算出来的：面板固定 440px → 卡片内容 390px → 减去 18px 星期标签和 6px 间距，
   网格最多 366px。日视图只放最近 6 个月（26 列），10px 格子 + 4px 间距 = 每列 14px
   → 360px 放得下，格子也够大（参考实现是终端全宽，12 个月能有 14px 格子；侧边栏
   塞 12 个月只剩 5px，所以日视图缩到 6 个月，周/累计视图仍覆盖 12 个月）。
   格子再大一点就会超出，被 .du-body 的 overflow-x:hidden 悄悄裁掉最右边几列，
   所以改尺寸必须看探针的 BUDGET=...:fit|OVERFLOW。 */
.du-activityCell{width:10px;height:10px;border-radius:3px;flex:none;position:relative;transition:opacity .12s,box-shadow .12s}
.du-activityCell[data-dim]{opacity:.25}
/* 悬停整列 —— **只在周/累计视图生效**：这两个视图的单位是「一周」，鼠标停在哪一周就把那
   一列的 7 颗格子一起提亮（投影 + 同色柔光）；**其余列保持原样，不压暗、不变色**
   （用户原话：「当前列高亮的时候，其他列不需要改变颜色」）。日视图一天一格，单位是格子而
   不是列，所以不参与（用户原话：「每日的你怎么也列高亮了」）。
   三条红线：不给列垫底色、不常驻每格阴影、不压间距合并成一列。
   ⚠️ **柔光半径要明显小于间距的一半**：格子 10px、间距 4px，原来写 5~7px 会跟上下左右邻格
   糊成一片（用户原话「高光范围太大了，都互相叠加了」）。现在投影 1~2px、柔光 2px，靠
   高亮靠「有量的格子叠一层白色提亮蒙版 + 同色柔光」，而不是只加阴影（只加阴影时格子颜色没
   变化，用户会说「列高亮不明显」）；也别用 filter:brightness()，它会把绿色推向青色（G 通道先
   撞顶，剩下的通道继续涨），看起来是变薄荷色而不是变亮。
   注意这段 CSS 在模板字符串里，注释里不能出现反引号。 */
.du-activityGrid:not([data-view="daily"]) .du-activityWeek:hover .du-activityCell{opacity:1;box-shadow:0 1px 2px rgba(0,0,0,.35),0 0 2px rgba(34,197,94,.9)}
.du-activityGrid:not([data-view="daily"]) .du-activityWeek:hover .du-activityCell[data-level]:not([data-level="0"]){background-image:linear-gradient(rgba(0,0,0,.12),rgba(0,0,0,.12))}
body[data-ds-dark-theme] .du-activityGrid:not([data-view="daily"]) .du-activityWeek:hover .du-activityCell{box-shadow:0 1px 2px rgba(0,0,0,.55),0 0 2px rgba(34,197,94,1)}
body[data-ds-dark-theme] .du-activityGrid:not([data-view="daily"]) .du-activityWeek:hover .du-activityCell[data-level]:not([data-level="0"]){background-image:linear-gradient(rgba(255,255,255,.3),rgba(255,255,255,.3))}
.du-activityCaption{color:var(--dsw-alias-label-caption);font-size:10px;line-height:14px}
.du-calLegend{flex:none;align-items:center;gap:6px;color:var(--dsw-alias-label-caption);font-size:10px;line-height:14px;display:flex}
.du-calSwatch{width:12px;height:12px;border-radius:3px;flex:none}
/* 热力图配色照抄 Codex /usage 的暖色阶（实测取样自它的界面）：灰 → 棕 → 橙。
   深色面板上必须够亮才看得见；不要换回 --dsw-static-deepseek-900/800（在深色面板上
   只差几个百分点，整块网格会看起来是空的）。0 档优先用 DSH 的 fill-l2，取不到时用
   自带灰 —— 真实 DSH 里这个变量没定义，透明会让空格和面板背景连成一片。 */
/* 五档全部取自 DSH 自己的 DeepSeek 蓝（design-platform.css 的 --dsw-static-deepseek-*）：
   浅色 50/300/400/500/800，深色 900/800/600/450/400，逐档变亮（深色）/变深（浅色）。
   相邻两档的最大通道差都在 25 以上，实测肉眼可分辨；不要换回 --dsw-static-deepseek-900/800
   这种低对比组合去当"数据档"，实测整块网格会看起来是空的。 */
/* 五档取自 DSH 的官方绿（design-platform.css 的 --dsw-static-green-*：100/400/500/900），
   缺的中间档用 color-mix 在官方值之间插值（本文件别处已经在用 color-mix）。
   方向统一成「少 = 淡、多 = 浓」，两个主题一致：
   浅色 100/400 各半 → 400 → 500 → 与 900 混 45%（逐步变深；第一档不能用 green-100，
   它跟空格子几乎同色、看起来像没用量；末档也不能直接用 green-900，在白底上近黑、
   像洞而不像"更多"，参考 GitHub 浅色末档 #216e39 的做法）；深色 900 → 与 500 的混色 → 500（逐步变浓变亮，
   最深那档在深色面板上会看不见，所以用「越浓越亮」表达「越多」）。
   注意最深一档必须是高饱和的官方绿，不要用低饱和的浅色收尾 —— 之前蓝色版收在 #7aaaff
   这种发白的浅蓝上，看起来像「越少越深」，用户直接指出来了。
   中间档都是官方值之间按比例混出来的（浅色 #9ae6b6 = green-100/green-400 各半，
   深色 #237a42 / #22a753 = #22c55e 与 #233c2c 按 45% / 78%），直接写死成十六进制：
   color-mix 的计算值不是 rgb()，会把探针的颜色解析带偏。
   实测与背景的对比度：深色 1.17 → 1.41 → 3.16 → 5.40 → 7.41，
   浅色 1.12 → 1.46 → 1.95 → 2.28 → 5.34，两个主题都是逐档变强（脚本见 AGENTS.md 的验收清单）。 */
.du-activityCell[data-level="0"],.du-calSwatch[data-level="0"]{background:var(--dsw-alias-fill-l2,#eef0f1)}
.du-activityCell[data-level="1"],.du-calSwatch[data-level="1"]{background:#9ae6b6}
.du-activityCell[data-level="2"],.du-calSwatch[data-level="2"]{background:#4ed17e}
.du-activityCell[data-level="3"],.du-calSwatch[data-level="3"]{background:#22c55e}
.du-activityCell[data-level="4"],.du-calSwatch[data-level="4"]{background:#237a42}
body[data-ds-dark-theme] .du-activityCell[data-level="0"],body[data-ds-dark-theme] .du-calSwatch[data-level="0"]{background:var(--dsw-alias-fill-l2,#23272a)}
body[data-ds-dark-theme] .du-activityCell[data-level="1"],body[data-ds-dark-theme] .du-calSwatch[data-level="1"]{background:#233c2c}
body[data-ds-dark-theme] .du-activityCell[data-level="2"],body[data-ds-dark-theme] .du-calSwatch[data-level="2"]{background:#237a42}
body[data-ds-dark-theme] .du-activityCell[data-level="3"],body[data-ds-dark-theme] .du-calSwatch[data-level="3"]{background:#22a753}
body[data-ds-dark-theme] .du-activityCell[data-level="4"],body[data-ds-dark-theme] .du-calSwatch[data-level="4"]{background:#22c55e}

/* 图表入场动画：柱子从基线长出来、热力格子缩放出现。两者都用 both 填充，
   这样错峰延迟期间元素停在起始态而不是先闪一下。减少动态效果时整段关掉，
   注意要把 transform/opacity 复位，否则格子会停在 scale(.4) 的小方块上。 */
@keyframes du-bar-grow{from{transform:scaleY(0)}to{transform:scaleY(1)}}
@keyframes du-cell-fade{from{filter:opacity(0)}to{filter:opacity(1)}}
.du-bars rect{transform-box:fill-box;transform-origin:bottom;animation:du-bar-grow .5s cubic-bezier(.22,.8,.3,1) both}
.du-activityCell{animation:du-cell-fade .34s ease-out both}
@media (prefers-reduced-motion: reduce){
  .du-bars rect,.du-activityCell{animation:none;transform:none;filter:none}
}
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
      calNotice: "du-calNotice",
      calNoticeDot: "du-calNoticeDot",
      cfgRoot: "du-cfgRoot",
      cfgGroup: "du-cfgGroup",
      cfgGroupTitle: "du-cfgGroupTitle",
      cfgWarn: "du-cfgWarn",
      cfgField: "du-cfgField",
      cfgLabel: "du-cfgLabel",
      cfgInput: "du-cfgInput",
      cfgTextarea: "du-cfgTextarea",
      cfgHint: "du-cfgHint",
      cfgError: "du-cfgError",
      cfgSaved: "du-cfgSaved",
      cfgActions: "du-cfgActions",
      cfgSave: "du-cfgSave",
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
      activityCard: "du-activityCard",
      activitySubtitle: "du-activitySubtitle",
      summaryRow: "du-summaryRow",
      summaryLabel: "du-summaryLabel",
      summaryValue: "du-summaryValue",
      summarySep: "du-summarySep",
      barLegend: "du-barLegend",
      barLegendItem: "du-barLegendItem",
      barLegendDot: "du-barLegendDot",
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
     * 12:00 后转 空闲" (or the English equivalent). All-day off-peak days
     * render "空闲（周末全天）" for weekends and "空闲（中秋节）" for statutory
     * holidays (both since 2026-08-23 / 2026-09-19), with the next change
     * pointing at the first peak start of the next working day. Falls back to
     * a shorter form when the next boundary is missing or past.
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
          // 全天低谷价：周末或法定节假日。下一次切换是下一个工作日的高峰开始。
          const weekdays = t("period.weekdays");
          const dayName = Array.isArray(weekdays)
            ? weekdays[new Date(data.nextAt + offset * 60_000).getUTCDay()] ?? ""
            : "";
          // 节假日显示具体节日名（如「中秋节」），未命名的区间回退到通用说法。
          const offPeakLabel = data.offPeakReason === "holiday"
            ? (typeof data.holiday === "string" && data.holiday.length > 0 ? data.holiday : t("period.holiday"))
            : t("period.weekend");
          return `${t("period.label")}：${name}（${offPeakLabel}） · ${t("period.next", { time: `${dayName} ${nextClock}`.trim(), period: nextName })}`;
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
          react.createElement(_p.IconChevronUpOutlineRegular, { size: 14 }),
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
          // 本地部署（provider 不是 DeepSeek 官方，比如 qwen/ollama）与第三方 provider
          // 的调用只统计 token、不算钱 —— 拿 DeepSeek 价目表去估它们的费用纯属瞎编。
          const unbilled = m.billable === false;
          const content = react.createElement(TipBody, {
            heading: m.model,
            // 悬停明细里那行「费用估算」对不计费的模型写 ¥0.00 会被误读成免费，
            // 直接写「不计费」更准确。
            rows: unbilled
              ? tipRows(m, t).map((row) => (row[0] === t("local.cost") ? [t("local.cost"), t("local.notBilled")] : row))
              : tipRows(m, t)
          });
          return react.createElement("div", { className: styles.modelRow, key: m.model, onMouseEnter: (e) => show(e, content), onMouseLeave: hide },
            react.createElement("div", { className: styles.modelHead },
              react.createElement("span", { className: styles.modelName, title: m.model },
                m.model,
                unbilled
                  ? react.createElement("span", { className: styles.estimatedBadge }, t("local.thirdParty"))
                  : m.estimated === true ? react.createElement("span", { className: styles.estimatedBadge }, t("local.estimated")) : null
              ),
              react.createElement("span", { className: styles.modelMeta },
                unbilled
                  ? t("local.modelMetaUnbilled", { tokens: fmtCompact(bucketTokens(m)), calls: m.calls })
                  : t("local.modelMeta", { tokens: fmtCompact(bucketTokens(m)), calls: m.calls, cost: fmtCost(m.cost) })
              )
            ),
            react.createElement("div", { className: styles.modelBar },
              react.createElement("span", { style: { width: unbilled ? "0%" : `${(m.cost / maxCost) * 100}%` } })
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
                  ? react.createElement(_p.IconChevronDownOutlineRegular, { size: 14 })
                  : react.createElement(_p.IconChevronRightOutlineRegular, { size: 14 })
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
    function LocalContent({ local, t, anim }) {
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
        react.createElement(TrendChart, { data, t, anim }),
        react.createElement(TokenActivity, { data, t, anim }),
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
    function TrendChart({ data, t, anim }) {
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
          rects.push(react.createElement("rect", { key: field, x, y, width: BAR_W, height: h, rx: 2, style: { fill: color, animationDelay: `${i * 14}ms` } }));
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
        react.createElement("svg", { key: `bars-${anim}`, viewBox: `0 0 ${W} ${H}`, className: `${styles.chart} ${styles.bars}`, role: "img", "aria-label": t("local.trend") },
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

    /**
     * Token 活动：一张日历热力图（周一在最上、最近 26 周 = 6 个月），右上角切换每格代表
     * 什么 —— 每日 = 当天用量；每周 = 该周总量（整列同色）；累计 = 截至当天的累计用量
     * （从左到右越来越浓）。三个视图共用同一张网格，切视图不会跳布局。
     * 格子只画 6 个月：440px 的侧边栏塞 12 个月时格子只剩 5px，会糊成一片网（见 css 的
     * 格距说明）。汇总行（累计/峰值/连续天数）归「用量趋势」那张卡，这张不重复放。
     */
    function TokenActivity({ data, t, anim }) {
      const [tip, show, hide] = useChartTip();
      const [view, setView] = react.useState("daily");
      // 这张卡通常在折叠线以下：等它第一次进入视口再演，每次打开只演一次（played 记住
      // 演过没有），只有点刷新才重来 —— 之前每进一次视口就重放，来回滚会一直闪。
      const [play, setPlay] = react.useState(0);
      const cardRef = react.useRef(null);
      const played = react.useRef(false);
      react.useEffect(() => {
        played.current = false;
        if (anim > 0) setPlay((current) => current + 1);
      }, [anim]);
      react.useEffect(() => {
        const node = cardRef.current;
        if (node === null || typeof IntersectionObserver !== "function") return undefined;
        const observer = new IntersectionObserver((entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting || played.current) continue;
            played.current = true;
            setPlay((current) => current + 1);
          }
        }, { threshold: 0.25 });
        observer.observe(node);
        return () => observer.disconnect();
      }, []);

      const activity = data !== null && typeof data === "object" && data.activity !== null && typeof data.activity === "object" ? data.activity : null;
      const days = Array.isArray(activity?.days) ? activity.days : [];
      const now = new Date();
      const pad = (x) => `${x}`.padStart(2, "0");
      const todayKey = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
      if (days.length === 0) return null;
      const isPast = (day) => day !== null && day.date <= todayKey;

      // 周一为一周之始（第一行必须是周一）；不足一周的位置补空。只显示最近 26 周。
      const weekdayIndex = (date) => {
        const [year, month, day] = date.split("-").map(Number);
        return (new Date(year, month - 1, day).getDay() + 6) % 7;
      };
      const weeks = [];
      let current = null;
      for (const day of days) {
        const slot = weekdayIndex(day.date);
        if (current === null || slot === 0) {
          current = [];
          weeks.push(current);
        }
        while (current.length < slot) current.push(null);
        current.push(day);
      }
      while (weeks.length > 0 && weeks[weeks.length - 1].length < 7) weeks[weeks.length - 1].push(null);
      while (weeks.length > 0 && weeks[0].length < 7) weeks[0].unshift(null);
      const shown = weeks.slice(-26);

      // 每周两个数：该周总量（周视图用）与截至该周的累计量（累计视图用）。两个视图都是
      // 「一列一周、整列同色」—— 累计视图按天算会让列内深浅不一，看起来不像一列。
      // 累计按全量历史累加（只累加显示窗口会让左端恒为 0，语义也不对；分档是按显示范围内
      // 的排名切的，左浅右浓的观感一样）。
      const weekTotal = new Map();
      const weekCumulative = new Map();
      let running = 0;
      for (const week of weeks) {
        let total = 0;
        for (const day of week) {
          if (!isPast(day)) continue;
          const tokens = bucketTokens(day);
          running += tokens;
          total += tokens;
        }
        weekTotal.set(week, total);
        weekCumulative.set(week, running);
      }

      // 每格代表的量随视图变；分档按当前视图下、显示范围内的不同取值排名再摊到 1~4 档
      // （同值同色；用量差几个数量级也能铺满色阶）。
      const valueOf = (day, week) => {
        if (view === "weekly") return weekTotal.get(week) ?? 0;
        // 累计视图只给「这一周确实有量」的列上色：累计值涨上去就不会回 0，不加这个判断
        // 的话，之后每个没用过的周都会带着颜色（用户反馈「我没使用的话，不应该是空白吗」）。
        if (view === "cumulative") return (weekTotal.get(week) ?? 0) > 0 ? (weekCumulative.get(week) ?? 0) : 0;
        return bucketTokens(day);
      };
      const values = [];
      for (const week of shown) {
        for (const day of week) {
          if (!isPast(day)) continue;
          const value = valueOf(day, week);
          if (value > 0) values.push(value);
        }
      }
      const distinct = [...new Set(values)].sort((a, b) => a - b);
      const rankOf = new Map(distinct.map((value, index) => [value, index]));
      const levelOf = (value) => {
        if (value <= 0 || distinct.length === 0) return 0;
        const index = rankOf.has(value) ? rankOf.get(value) : distinct.findIndex((candidate) => candidate >= value);
        const position = index < 0 ? distinct.length - 1 : index;
        return Math.min(4, 1 + Math.floor((position * 4) / distinct.length));
      };

      // 每周的聚合桶：周视图的悬停明细用它。
      const weekBucketOf = new Map();
      for (const week of shown) {
        const bucket = { calls: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0, cost: 0 };
        for (const day of week) {
          if (!isPast(day)) continue;
          bucket.calls += day.calls ?? 0;
          bucket.inputTokens += day.inputTokens ?? 0;
          bucket.outputTokens += day.outputTokens ?? 0;
          bucket.cacheReadTokens += day.cacheReadTokens ?? 0;
          bucket.cacheWriteTokens += day.cacheWriteTokens ?? 0;
          bucket.reasoningTokens += day.reasoningTokens ?? 0;
          bucket.cost += day.cost ?? 0;
        }
        weekBucketOf.set(week, bucket);
      }

      // 月份标签：该周跨进新月份时打一个，挨太近就跳过（否则会叠在一起）。
      const months = [];
      let lastMonth = "";
      let lastColumn = -9;
      shown.forEach((week, index) => {
        const first = week.find((day) => day !== null);
        if (first === undefined) return;
        const month = first.date.slice(0, 7);
        if (month === lastMonth) return;
        lastMonth = month;
        if (index - lastColumn < 3) return;
        lastColumn = index;
        months.push({ key: month, index, label: t(`local.month${parseInt(month.slice(5, 7), 10)}`) });
      });

      // 逐列错峰淡入（每列 16ms，26 列共约 0.4s）；减少动态效果时 css 里整段关掉。
      // 周/累计视图里整列是同一份数据（一周），所以 tip 挂在**整列**上而不是每颗格子：
      // 鼠标在列内 7 格之间滑动不会触发 leave/enter，tip 就不会被反复销毁重建
      // （用户反馈「每个格子还在独立触发用量面板，统计频繁的销毁/显示」）。
      // 挂在列上还有个好处：tip 的坐标按列算，列内移动时不会跟着格子跳。
      const renderWeek = (week, weekIndex) => {
        const columnContent = view === "daily" ? null : react.createElement(TipBody, {
          heading: `${week.find((item) => item !== null).date} · ${t(view === "weekly" ? "local.viewWeekly" : "local.viewCumulative")}`,
          rows: view === "weekly"
            ? tipRows(weekBucketOf.get(week), t)
            : tipRows(weekBucketOf.get(week), t).concat([[t("local.cumulative"), fmtCompact(weekCumulative.get(week) ?? 0)]])
        });
        return react.createElement("div", {
          key: weekIndex,
          className: styles.activityWeek,
          onMouseEnter: columnContent === null ? undefined : (event) => show(event, columnContent),
          onMouseLeave: columnContent === null ? undefined : hide
        },
          week.map((day, row) => {
            const delay = { animationDelay: `${weekIndex * 16}ms` };
            if (!isPast(day)) {
              return react.createElement("span", { key: row, className: styles.activityCell, "data-level": "0", "data-dim": "", style: delay });
            }
            const value = valueOf(day, week);
            // 周/累计视图：整列取同一个值（这一周的量），但**当天没有用量的格子留空** ——
            // 一列代表一周，不代表这一周 7 天都用了（用户原话「某天没使用，就是空白的」）。
            const level = view === "daily" || bucketTokens(day) > 0 ? levelOf(value) : 0;
            if (columnContent !== null) {
              return react.createElement("span", { key: row, className: styles.activityCell, "data-level": `${level}`, style: delay });
            }
            // 日视图一天一格，tip 仍然挂在每颗格子上（内容各不相同）。
            const content = react.createElement(TipBody, {
              heading: `${day.date} · ${t(`local.wd${(weekdayIndex(day.date) + 1) % 7}`)}`,
              rows: tipRows(day, t)
            });
            return react.createElement("span", {
              key: row,
              className: styles.activityCell,
              "data-level": `${level}`,
              style: delay,
              onMouseEnter: (event) => show(event, content),
              onMouseLeave: hide
            });
          })
        );
      };

      const views = [
        ["daily", t("local.viewDaily")],
        ["weekly", t("local.viewWeekly")],
        ["cumulative", t("local.viewCumulative")]
      ];

      return react.createElement("div", { className: styles.card, ref: cardRef },
        react.createElement("div", { className: styles.cardHead },
          react.createElement("div", { className: styles.cardTitle },
            t("local.activity"),
            react.createElement("span", { className: styles.activitySubtitle }, t("local.last6Months"))
          ),
          react.createElement("div", { className: styles.seg, role: "tablist", "aria-label": t("local.activity") },
            views.map(([key, label]) =>
              react.createElement("button", {
                type: "button", key, role: "tab", "aria-selected": key === view,
                className: key === view ? styles.segActive : styles.segBtn,
                onClick: () => setView(key)
              }, label)
            )
          )
        ),
        react.createElement("div", { className: styles.activity },
          react.createElement("div", { className: styles.activityMonths },
            months.map((month) =>
              react.createElement("span", { key: month.key, className: styles.activityMonth, style: { left: `${month.index * 14}px` } }, month.label)
            )
          ),
          react.createElement("div", { className: styles.activityBody },
            react.createElement("div", { className: styles.activityLabels },
              [0, 1, 2, 3, 4, 5, 6].map((row) =>
                react.createElement("span", { key: row }, t(`local.wd${(row + 1) % 7}`))
              )
            ),
            react.createElement("div", { key: `heat-${view}-${anim}-${play}`, className: styles.activityGrid, "data-view": view, role: "img", "aria-label": t("local.activity") },
              shown.map(renderWeek)
            )
          ),
          react.createElement("div", { className: styles.calLegend },
            react.createElement("span", null, t("local.less")),
            [0, 1, 2, 3, 4].map((level) =>
              react.createElement("span", { key: level, className: styles.calSwatch, "data-level": `${level}` })
            ),
            react.createElement("span", null, t("local.more"))
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
      // 每次刷新自增：图表把它当 key 用，key 一变元素就重新挂载，CSS 入场动画
      // 于是重播一遍 —— 否则 React 复用同一个 <svg>/<div>，动画只在首次打开时演一次。
      const [animEpoch, setAnimEpoch] = react.useState(0);
      const rootRef = react.useRef(null);

      const refresh = react.useCallback(() => {
        setBalance((current) => current === null ? { state: "loading" } : current);
        setLocal((current) => current === null ? { state: "loading" } : current);
        fetchBalance().then(setBalance).catch((error) => setBalance({ state: "error", message: String(error) }));
        fetchLocal().then(setLocal).catch((error) => setLocal({ state: "error", message: String(error) }));
        fetchVersion().then(setUpdate).catch(() => setUpdate((current) => current ?? null));
        fetchPeriod().then(setPeriod).catch(() => setPeriod((current) => current ?? null));
        setAnimEpoch((current) => current + 1);
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
        react.createElement(_p.IconDataOutlineRegular, { size: 16 }),
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
              react.createElement("span", { className: styles.headerIcon }, react.createElement(_p.IconDataOutlineRegular, { size: 16 })),
              react.createElement("div", { className: styles.titleCol },
                react.createElement("div", { className: styles.title }, t("panel.title")),
                react.createElement("div", { className: styles.subtitle }, t("panel.subtitle"))
              )
            ),
            react.createElement("div", { className: styles.headerActions },
              react.createElement("button", { type: "button", className: styles.iconButton, "aria-label": t("action.refresh"), onClick: refresh },
                react.createElement(_p.IconRefreshOutlineRegular, { size: 16 })
              ),
              react.createElement("button", { type: "button", className: styles.iconButton, "aria-label": t("action.close"), onClick: () => setOpen(false) },
                react.createElement(_p.IconCloseOutlineRegular, { size: 16 })
              )
            )
          ),
          periodData
            ? react.createElement("div", { className: styles.periodStrip, "data-period": periodData.period },
                react.createElement("span", { className: styles.periodStripDot }),
                react.createElement("span", null, periodText(periodData, t))
              )
            : null,
          // 假期表没覆盖当前年份时，节假日可能被按高峰估算 —— 宁可说清楚，
          // 也不要让估算悄悄偏贵（次年安排公布后由远端日历自动补上）。
          periodData && periodData.calendar && periodData.calendar.coversCurrentYear === false
            ? react.createElement("div", { className: styles.calNotice, role: "status" },
                react.createElement("span", { className: styles.calNoticeDot }),
                react.createElement("span", null, t("calendar.uncovered", { year: periodData.calendar.currentYear }))
              )
            : null,
          react.createElement("div", { className: styles.body },
            react.createElement(UpdateBanner, { update, t }),
            balance === null || balance.state === "loading" || local === null || local.state === "loading"
              ? react.createElement(SkeletonScreen, { t })
              : react.createElement(react.Fragment, null,
                  react.createElement(BalanceSection, { balance, t }),
                  react.createElement(LocalContent, { local, t, anim: animEpoch })
                )
          ),
          react.createElement("div", { className: styles.footer },
            t("panel.note"),
            local !== null && Array.isArray(local.data?.models) && local.data.models.some((m) => m.billable === false)
              ? " " + t("panel.noteUnbilled")
              : null
          )
        ) : null
      );
    }

    // ---- settings page (插件 → 本行 → 配置) --------------------------------

    /**
     * 字段清单。键名必须与宿主端 `Config` schema 里标了 `.volatile()` 的键一致
     * —— 只有那些键会出现在宿主投影出的表单快照里（`form.state.value`）。
     * 校验、默认值、并发修订与持久化（写进 profile 的 cordis.patch.yml）全部由
     * 宿主 settings 负责；这里只负责渲染与暂存草稿。
     */
    const CONFIG_FIELDS = [
      { key: "maxSessions", kind: "number", group: "perf", min: 1 },
      { key: "sessionConcurrency", kind: "number", group: "perf", min: 1 },
      { key: "localTtlMs", kind: "number", group: "perf", min: 0 },
      { key: "balanceTtlMs", kind: "number", group: "perf", min: 0 },
      { key: "balanceTimeoutMs", kind: "number", group: "perf", min: 0 },
      { key: "holidayCalendarUrl", kind: "string", group: "holiday" },
      { key: "holidayCalendarTtlMs", kind: "number", group: "holiday", min: 0 },
      { key: "holidayRanges", kind: "json", group: "holiday" },
      { key: "holidayWorkdays", kind: "json", group: "holiday" },
      { key: "pricing", kind: "json", group: "pricing" },
      { key: "peakHours", kind: "json", group: "advanced" },
      { key: "timezoneOffsetMinutes", kind: "number", group: "advanced" }
    ];

    /** 草稿文本 → 写值；`undefined` 表示这份草稿不合法。 */
    function parseDraft(field, text) {
      const trimmed = text.trim();
      if (trimmed === "") return { unset: true };
      if (field.kind === "number") {
        const value = Number(trimmed);
        if (!Number.isFinite(value)) return undefined;
        if (field.min !== undefined && value < field.min) return undefined;
        return { value };
      }
      if (field.kind === "json") {
        try {
          return { value: JSON.parse(trimmed) };
        } catch {
          return undefined;
        }
      }
      return { value: text };
    }

    /** 已有值 → 草稿文本（JSON 用 2 空格美化，便于人工编辑）。 */
    function draftOf(field, value) {
      if (value === undefined || value === null) return "";
      if (field.kind === "json") {
        try {
          return JSON.stringify(value, null, 2);
        } catch {
          return "";
        }
      }
      return String(value);
    }

    /**
     * 本行的配置页：`view: 'summary'` 渲染卡片上的一行摘要，`view: 'page'`
     * 渲染字段表单。宿主把表单快照与写入口作为 props 传进来。
     */
    function RowConfigPage(props) {
      const { view, form, t } = props;
      const snapshot = form === undefined ? undefined : form.state;
      const groups = ["perf", "holiday", "pricing", "advanced"];
      const [drafts, setDrafts] = react.useState(null);
      const [error, setError] = react.useState(null);
      const [saved, setSaved] = react.useState(false);
      const [busy, setBusy] = react.useState(false);
      const value = snapshot !== undefined && snapshot.status === "ready" ? snapshot.value ?? {} : {};
      const revision = snapshot === undefined ? undefined : snapshot.revision;
      const writable = snapshot !== undefined && snapshot.writable === true;
      const signature = JSON.stringify(value);

      // 宿主状态变化（首次读取、写回、被拒后重读）时重置草稿。
      react.useEffect(() => {
        const next = {};
        for (const field of CONFIG_FIELDS) next[field.key] = draftOf(field, value[field.key]);
        setDrafts(next);
        setError(null);
      }, [signature]);

      if (view === "summary") return react.createElement("span", null, t("config.summary"));
      if (snapshot === undefined || snapshot.status === "loading") {
        // 停在 loading 几乎总是「宿主端还是旧的」：浏览器 bundle 会热更新，
        // 宿主端代码不会，于是界面是新的、schema 却还没提供。说清楚，别让人干等。
        return react.createElement("div", { className: styles.cfgRoot },
          react.createElement("p", { className: styles.cfgHint }, t("config.loading")),
          react.createElement("p", { className: styles.cfgHint }, t("config.loadingHint"))
        );
      }
      if (snapshot.status !== "ready") {
        return react.createElement("p", { className: styles.cfgHint }, t("config.unavailable"));
      }
      if (drafts === null) return null;

      const Field = _p.SettingsValueField;
      const edit = (key, text) => {
        setSaved(false);
        setDrafts((current) => ({ ...current, [key]: text }));
      };
      const save = async () => {
        const ops = [];
        let invalid = null;
        for (const field of CONFIG_FIELDS) {
          const text = drafts[field.key] ?? "";
          if (text === draftOf(field, value[field.key])) continue;
          const parsed = parseDraft(field, text);
          if (parsed === undefined) {
            invalid = field.key;
            break;
          }
          ops.push(parsed.unset ? { op: "unset", path: [field.key] } : { op: "set", path: [field.key], value: parsed.value });
        }
        if (invalid !== null) {
          setError(t("config.invalid", { field: t(`config.field.${invalid}`) }));
          return;
        }
        if (ops.length === 0) {
          setSaved(true);
          return;
        }
        setBusy(true);
        setError(null);
        try {
          const accepted = await form.mutate(ops, revision);
          if (accepted) {
            setSaved(true);
          } else {
            setError(t("config.refused"));
          }
        } catch (cause) {
          setError(t("config.refused"));
        } finally {
          setBusy(false);
        }
      };

      const renderField = (field) => {
        const label = t(`config.field.${field.key}`);
        const text = drafts[field.key] ?? "";
        const overridden = snapshot.user !== null && typeof snapshot.user === "object" && Object.hasOwn(snapshot.user, field.key);
        if (field.kind === "json") {
          return react.createElement("div", { className: styles.cfgField, key: field.key },
            react.createElement("label", { className: styles.cfgLabel, htmlFor: `du-cfg-${field.key}` }, label),
            react.createElement("textarea", {
              id: `du-cfg-${field.key}`,
              className: styles.cfgTextarea,
              rows: 4,
              spellCheck: false,
              value: text,
              disabled: !writable || busy,
              onChange: (event) => edit(field.key, event.target.value)
            }),
            react.createElement("div", { className: styles.cfgHint }, t(`config.hint.${field.key}`))
          );
        }
        // 旧 harness 的 primitives 可能没有 SettingsValueField：退回原生输入框，
        // 绝不让未定义的组件把整页渲染炸掉（React #130）。
        if (typeof Field !== "function") {
          return react.createElement("div", { className: styles.cfgField, key: field.key },
            react.createElement("label", { className: styles.cfgLabel, htmlFor: `du-cfg-${field.key}` }, label),
            react.createElement("input", {
              id: `du-cfg-${field.key}`,
              className: styles.cfgInput,
              type: "text",
              value: text,
              disabled: !writable || busy,
              onChange: (event) => edit(field.key, event.target.value)
            })
          );
        }
        return react.createElement("div", { className: styles.cfgField, key: field.key },
          react.createElement(Field, {
            id: `du-cfg-${field.key}`,
            label,
            text,
            hint: t(`config.hint.${field.key}`),
            overridden,
            invalid: false,
            overriddenLabel: t("config.overridden"),
            resetLabel: t("config.reset"),
            invalidLabel: t("config.invalidShort"),
            disabled: !writable || busy,
            numeric: field.kind === "number",
            onEdit: (next) => edit(field.key, next),
            onReset: () => edit(field.key, "")
          })
        );
      };

      return react.createElement("div", { className: styles.cfgRoot },
        groups.map((group) => {
          const fields = CONFIG_FIELDS.filter((field) => field.group === group);
          if (fields.length === 0) return null;
          return react.createElement("section", { className: styles.cfgGroup, key: group },
            react.createElement("h4", { className: styles.cfgGroupTitle }, t(`config.group.${group}`)),
            group === "pricing"
              ? react.createElement("p", { className: styles.cfgWarn }, t("config.pricingWarn"))
              : null,
            fields.map(renderField)
          );
        }),
        error !== null ? react.createElement("p", { className: styles.cfgError, role: "alert" }, error) : null,
        saved ? react.createElement("p", { className: styles.cfgSaved }, t("config.saved")) : null,
        react.createElement("div", { className: styles.cfgActions },
          react.createElement("button", {
            type: "button",
            className: styles.cfgSave,
            disabled: !writable || busy,
            onClick: save
          }, busy ? t("config.saving") : t("config.save"))
        ),
        react.createElement("p", { className: styles.cfgHint }, t("config.footer"))
      );
    }

    // ---- plugin ------------------------------------------------------------

    /** Client services needed by the plugin body. */
    const inject = ["slots", "locale"];

    /**
     * Client plugin body: register the dictionaries, the sidebar action, and
     * this row's configuration page on the harness's Plugins page.
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
      // 「插件」页按 `<包名>#<行 id>` 认领本行的配置页；注册后该行才可点开，
      // 页面里的表单由宿主 settings 提供（见 RowConfigPage）。
      ctx.slots.inject("plugins.row.config", () => ctx.slots.register({
        name: "plugins.row.config",
        key: "@xavier711/dsh-deepseek-usage#deepseek-usage",
        locale: "deepseek-usage"
      }, RowConfigPage));
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
      "period.holiday": "法定节假日",
      "calendar.uncovered": "{year} 年假期表未更新，节假日可能按高峰价估算",
      "config.summary": "余额 + 本地用量统计，按官方定价分模型估算",
      "config.loading": "正在读取宿主配置…",
      "config.loadingHint": "若一直停在这里：请在运行 dsh web 的终端按 Ctrl+C 重启服务，再刷新本页。",
      "config.unavailable": "宿主未向本页面暴露该配置（可能运行在旧版 DSH 上）。可直接编辑 ~/.dsh/profiles/web/cordis.patch.yml。",
      "config.save": "保存",
      "config.saving": "保存中…",
      "config.saved": "已写入 profile 配置；重启 dsh web 后生效。",
      "config.refused": "宿主拒绝了这次写入（配置可能已被其它窗口改动），请重试。",
      "config.invalid": "{field} 的取值不合法。",
      "config.invalidShort": "取值不合法",
      "config.overridden": "已覆盖",
      "config.reset": "恢复默认",
      "config.footer": "保存即写入 ~/.dsh/profiles/web/cordis.patch.yml 的 deepseek-usage 行；重启 dsh web 后生效。留空即恢复内置默认值，未列出的键仍可直接在 YAML 里配置。",
      "config.pricingWarn": "按模型单价（元/百万 tokens）覆盖官方价。填错会让费用估算失真，且不会影响官方实际计费。",
      "config.group.perf": "性能与刷新",
      "config.group.holiday": "节假日日历",
      "config.group.pricing": "定价覆盖（高级）",
      "config.group.advanced": "时段与区域（高级）",
      "config.field.maxSessions": "回放会话数上限",
      "config.field.sessionConcurrency": "并发读取会话数",
      "config.field.localTtlMs": "本地统计缓存（毫秒）",
      "config.field.balanceTtlMs": "余额缓存（毫秒）",
      "config.field.balanceTimeoutMs": "余额请求超时（毫秒）",
      "config.field.holidayCalendarUrl": "节假日日历地址",
      "config.field.holidayCalendarTtlMs": "日历缓存（毫秒）",
      "config.field.holidayRanges": "节假日区间（JSON）",
      "config.field.holidayWorkdays": "例外工作日（JSON）",
      "config.field.pricing": "按模型单价（JSON）",
      "config.field.peakHours": "高峰时段（JSON）",
      "config.field.timezoneOffsetMinutes": "时区偏移（分钟）",
      "config.hint.maxSessions": "越大越准，代价是回放更慢。",
      "config.hint.sessionConcurrency": "同时读取多少个会话日志。",
      "config.hint.localTtlMs": "面板与徽标刷新时复用统计结果的时长。",
      "config.hint.balanceTtlMs": "余额接口结果复用时长，避免频繁请求。",
      "config.hint.balanceTimeoutMs": "超时后余额卡片显示不可用，不影响本地统计。",
      "config.hint.holidayCalendarUrl": "留空即关闭远端，改用内置 2026 年表。",
      "config.hint.holidayCalendarTtlMs": "每年只变一次，默认 6 小时足够。",
      "config.hint.holidayRanges": "[{ name, start: \"YYYY-MM-DD\", end }]，留空用默认表。",
      "config.hint.holidayWorkdays": "即使落在周末/假期也按时段计费的日子；按现行口径留空。",
      "config.hint.pricing": "按模型覆盖单价，每项写 input / cacheHit / output（可再给 peak / offPeak / eras），例如 {\"deepseek-flash\":{\"peak\":{\"input\":2}}}。",
      "config.hint.peakHours": "北京时间高峰窗口，例如 [[9,12],[14,18]]。",
      "config.hint.timezoneOffsetMinutes": "默认 480（UTC+8）。",
      "period.weekdays": ["周日", "周一", "周二", "周三", "周四", "周五", "周六"],
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
      "local.last6Months": "最近 6 个月",
      "local.viewDaily": "日",
      "local.viewWeekly": "周",
      "local.viewCumulative": "累计",
      "local.cumulative": "累计",
      "local.summaryLifetime": "累计总量",
      "local.summaryPeak": "单日峰值",
      "local.summaryStreak": "连续天数",
      "local.trend": "用量趋势",
      "local.range7d": "近 7 天",
      "local.range30d": "近 30 天",
      "local.range12m": "近 12 个月",
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
      "local.modelMetaUnbilled": "{tokens} tok · {calls} 次 · 不计费",
      "local.thirdParty": "本地/第三方",
      "local.notBilled": "不计费",
      "local.sessionMeta": "{tokens} tok · {calls} 次 · {date}",
      "local.subagent": "子代理",
      "local.subagentHint": "由主任务派生的子代理会话",
      "update.available": "发现新版本 v{version}",
      "update.releases": "查看发布页",
      "panel.note": "费用按 DeepSeek 官方定价分模型估算。",
      "panel.noteUnbilled": "本地部署与第三方模型的调用只统计 token，不计费。"
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
      "period.holiday": "public holiday",
      "calendar.uncovered": "{year} holiday calendar not updated — holidays may be priced as peak",
      "config.summary": "Balance + local usage, priced per model at official rates",
      "config.loading": "Reading the host configuration…",
      "config.loadingHint": "Stuck here? Restart the dsh web service (Ctrl+C in its terminal), then refresh this page.",
      "config.unavailable": "The host exposes no configuration to this page (an older DSH, most likely). Edit ~/.dsh/profiles/web/cordis.patch.yml directly.",
      "config.save": "Save",
      "config.saving": "Saving…",
      "config.saved": "Written to the profile configuration — restart dsh web to apply.",
      "config.refused": "The host refused this write (the configuration may have changed elsewhere). Try again.",
      "config.invalid": "{field} is not a valid value.",
      "config.invalidShort": "invalid value",
      "config.overridden": "overridden",
      "config.reset": "reset",
      "config.footer": "Saving writes the deepseek-usage row in ~/.dsh/profiles/web/cordis.patch.yml; restart dsh web to apply. Clearing a field restores the built-in default, and keys not listed here stay configurable in YAML.",
      "config.pricingWarn": "Per-model rates (CNY per 1M tokens) override the official prices. A wrong value skews the estimate only — official billing is unaffected.",
      "config.group.perf": "Performance and refresh",
      "config.group.holiday": "Holiday calendar",
      "config.group.pricing": "Pricing overrides (advanced)",
      "config.group.advanced": "Windows and region (advanced)",
      "config.field.maxSessions": "Sessions replayed",
      "config.field.sessionConcurrency": "Parallel session reads",
      "config.field.localTtlMs": "Local-usage cache (ms)",
      "config.field.balanceTtlMs": "Balance cache (ms)",
      "config.field.balanceTimeoutMs": "Balance timeout (ms)",
      "config.field.holidayCalendarUrl": "Holiday calendar URL",
      "config.field.holidayCalendarTtlMs": "Calendar cache (ms)",
      "config.field.holidayRanges": "Holiday ranges (JSON)",
      "config.field.holidayWorkdays": "Working-day exceptions (JSON)",
      "config.field.pricing": "Per-model rates (JSON)",
      "config.field.peakHours": "Peak windows (JSON)",
      "config.field.timezoneOffsetMinutes": "Timezone offset (minutes)",
      "config.hint.maxSessions": "Higher is more accurate and slower to replay.",
      "config.hint.sessionConcurrency": "How many session logs are read at once.",
      "config.hint.localTtlMs": "How long a computed result is reused for badge and panel refreshes.",
      "config.hint.balanceTtlMs": "How long a fetched balance is reused.",
      "config.hint.balanceTimeoutMs": "On timeout the balance card reports unavailable; local usage is unaffected.",
      "config.hint.holidayCalendarUrl": "Clear it to disable the remote calendar and use the built-in 2026 table.",
      "config.hint.holidayCalendarTtlMs": "The calendar changes once a year; 6 hours is plenty.",
      "config.hint.holidayRanges": "[{ name, start: \"YYYY-MM-DD\", end }]; empty uses the built-in table.",
      "config.hint.holidayWorkdays": "Days billed by hour even on a weekend or holiday; empty under the current rule.",
      "config.hint.pricing": "Override rates per model with input / cacheHit / output (plus optional peak / offPeak / eras), e.g. {\"deepseek-flash\":{\"peak\":{\"input\":2}}}.",
      "config.hint.peakHours": "Beijing peak windows, e.g. [[9,12],[14,18]].",
      "config.hint.timezoneOffsetMinutes": "Defaults to 480 (UTC+8).",
      "period.weekdays": ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
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
      "local.last6Months": "last 6 months",
      "local.viewDaily": "Daily",
      "local.viewWeekly": "Weekly",
      "local.viewCumulative": "Cumulative",
      "local.cumulative": "Cumulative",
      "local.summaryLifetime": "Lifetime",
      "local.summaryPeak": "Peak",
      "local.summaryStreak": "Streak",
      "local.trend": "Usage trend",
      "local.range7d": "7 days",
      "local.range30d": "30 days",
      "local.range12m": "12 months",
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
      "local.modelMetaUnbilled": "{tokens} tok · {calls} calls · not billed",
      "local.thirdParty": "local/3rd-party",
      "local.notBilled": "not billed",
      "local.sessionMeta": "{tokens} tok · {calls} calls · {date}",
      "local.subagent": "sub",
      "local.subagentHint": "Delegated subagent session forked from a main task",
      "update.available": "New version v{version} available",
      "update.releases": "Releases",
      "panel.note": "Cost is estimated per model at official DeepSeek rates.",
      "panel.noteUnbilled": "Locally hosted and third-party models count tokens only — they are not priced."
    };

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  }
});

/** Plain exported CSS survives both tsc package builds and the panel's Vite bundle. */
// Composition follows the owner-approved Calm Coach prototype of donor/health
// (task 003, accepted 2026-07-24); colours, type and cards are HomeBrain --hb-* tokens.
export const healthStyles = `
.hl-root{display:flex;flex-direction:column;gap:14px;min-width:0;font-family:Inter,system-ui,sans-serif;color:var(--hb-t1);font-variant-numeric:tabular-nums;font-feature-settings:"tnum","cv11","ss03"}
.hl-root *{box-sizing:border-box}
.hl-root h1{margin:0;font-size:22px;font-weight:600;letter-spacing:-.02em}
.hl-root h3{margin:2px 0 0;font-size:17px;font-weight:600;letter-spacing:-.01em;line-height:1.3}
.hl-head{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;flex-wrap:wrap}
.hl-head-r{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.hl-sub{margin:0;font-size:13px;color:var(--hb-t2);line-height:1.45}
.hl-sub b{color:var(--hb-t1);font-weight:600}
.hl-pill{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border:1px solid transparent;border-radius:999px;background:var(--hb-fill,var(--hb-s2));font-size:13px;color:var(--hb-t2);white-space:nowrap}
.hl-pill svg{width:13px;height:13px}
.hl-pill[data-status='ok']{background:var(--hb-ok-s);border-color:transparent;color:var(--hb-ok)}
.hl-pill[data-status='partial'],.hl-pill[data-status='stale']{background:var(--hb-warn-s);border-color:transparent;color:var(--hb-warn)}
.hl-pill[data-status='unavailable'],.hl-pill[data-status='error']{background:var(--hb-crit-s);border-color:transparent;color:var(--hb-crit)}
.hl-tabs{display:flex;gap:4px;padding:4px;border:0;border-radius:var(--hb-radius-md,14px);background:var(--hb-fill,var(--hb-s1));box-shadow:inset 0 0 0 1px var(--hb-edge,var(--hb-b1));width:max-content;max-width:100%;overflow-x:auto}
.hl-tabs button{appearance:none;border:0;background:none;color:var(--hb-t2);font:inherit;font-size:14px;font-weight:500;padding:7px 16px;border-radius:var(--hb-radius-nested,10px);cursor:pointer;white-space:nowrap;transition:background-color var(--hb-dur-base,200ms) var(--hb-ease-out,ease-out),color var(--hb-dur-base,200ms) var(--hb-ease-out,ease-out)}
.hl-tabs button:hover{color:var(--hb-t1)}
.hl-tabs button[aria-selected='true']{background:var(--hb-s1);color:var(--hb-t1);font-weight:600;box-shadow:var(--hb-elev-1)}
.hl-root button:focus-visible{outline:2px solid var(--hb-ac);outline-offset:2px}
.hl-banner{margin:0;padding:10px 14px;border-radius:var(--hb-radius-md,14px);font-size:13px;line-height:1.45;background:var(--hb-warn-s);color:var(--hb-t1);border:1px solid color-mix(in srgb,var(--hb-warn) 35%,transparent)}
.hl-banner b{color:var(--hb-warn)}
.hl-banner[data-tone='crit']{background:var(--hb-crit-s);border-color:color-mix(in srgb,var(--hb-crit) 35%,transparent)}
.hl-banner[data-tone='crit'] b{color:var(--hb-crit)}
.hl-signals{display:flex;flex-wrap:wrap;gap:8px;margin:0;padding:0;list-style:none}
.hl-signals li{padding:7px 12px;border-radius:var(--hb-radius-nested,10px);font-size:13px;line-height:1.4;background:var(--hb-s1);border:1px solid color-mix(in srgb,var(--hb-warn) 40%,transparent);color:var(--hb-t2);max-width:100%}
.hl-signals li b{color:var(--hb-warn);font-weight:600}
.hl-signals li[data-severity='info']{border-color:var(--hb-b1)}
.hl-signals li[data-severity='info'] b{color:var(--hb-t1)}
.hl-grid{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:16px;align-items:stretch}
.hl-card{min-width:0;padding:18px 20px;border:1px solid var(--hb-edge,var(--hb-b1));border-radius:var(--hb-radius-card,16px);background:var(--hb-s1);box-shadow:var(--hb-card-shadow);display:flex;flex-direction:column;gap:8px}
.hl-ch{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}
.hl-lbl{font-size:var(--hb-type-caption,13px);font-weight:600;letter-spacing:-.005em;color:var(--hb-t2)}
.hl-note{margin:0;font-size:13px;color:var(--hb-t2);line-height:1.45;text-wrap:pretty}
.hl-note b{color:var(--hb-t1);font-weight:600}
.hl-muted{color:var(--hb-t3,var(--hb-t2))}
.hl-lead{margin:0;font-size:15px;color:var(--hb-t2);line-height:1.5;max-width:56ch}
.hl-big{font-size:34px;font-weight:600;letter-spacing:var(--hb-tracking-display,-.03em);line-height:1.15;white-space:nowrap}
.hl-big--md{font-size:24px;white-space:normal}
.hl-big small{font-size:16px;font-weight:500;color:var(--hb-t2);letter-spacing:0;margin-left:1px}
.hl-unknown{font-size:22px;font-weight:500;color:var(--hb-t2);line-height:1.2}
.hl-badge{display:inline-flex;align-items:center;gap:6px;padding:3px 10px;border-radius:999px;font-size:13px;font-weight:500;white-space:nowrap;background:var(--hb-fill-strong,var(--hb-s2));color:var(--hb-t2)}
.hl-badge[data-tone='ok']{background:var(--hb-ok-s);color:var(--hb-ok)}
.hl-badge[data-tone='warn']{background:var(--hb-warn-s);color:var(--hb-warn)}
.hl-badge[data-tone='crit']{background:var(--hb-crit-s);color:var(--hb-crit)}
.hl-dot{width:7px;height:7px;border-radius:50%;background:currentColor}
.hl-chip{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:var(--hb-radius-chip,8px);font-size:13px;background:var(--hb-fill,var(--hb-s2));color:var(--hb-t2);white-space:nowrap;align-self:flex-start}
.hl-chip b{color:var(--hb-t1);font-weight:600}
.hl-jump{appearance:none;font:inherit;font-size:13px;font-weight:600;color:var(--hb-ac);background:color-mix(in srgb,var(--hb-ac) 10%,transparent);border:0;border-radius:var(--hb-radius-pill,999px);padding:7px 14px;cursor:pointer;white-space:nowrap;transition:background-color var(--hb-dur-fast,120ms) var(--hb-ease-out,ease-out)}
.hl-jump:hover{background:color-mix(in srgb,var(--hb-ac) 18%,transparent)}
.hl-hero{grid-column:span 8;flex-direction:row;align-items:center;gap:24px;padding:22px 24px;background:linear-gradient(135deg,color-mix(in srgb,var(--hb-ac) 14%,var(--hb-s1)),var(--hb-s1) 62%);border-color:color-mix(in srgb,var(--hb-ac) 22%,var(--hb-edge,var(--hb-b1)))}
.hl-hero[data-kind='met']{background:linear-gradient(135deg,color-mix(in srgb,var(--hb-ok) 14%,var(--hb-s1)),var(--hb-s1) 62%);border-color:color-mix(in srgb,var(--hb-ok) 22%,var(--hb-edge,var(--hb-b1)))}
.hl-hero[data-kind='missed'],.hl-hero[data-kind='unknown'],.hl-hero[data-kind='unavailable'],.hl-hero[data-kind='empty']{background:var(--hb-s1);border-color:var(--hb-b1)}
.hl-hero-copy{flex:1;min-width:0;display:flex;flex-direction:column;align-items:flex-start;gap:10px}
.hl-hero h2{margin:0;font-size:42px;font-weight:650;letter-spacing:-.025em;line-height:1.15}
.hl-hero p{margin:0;font-size:15px;color:var(--hb-t2);line-height:1.5;max-width:52ch}
.hl-actions{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:4px}
.hl-ring{position:relative;flex:none;width:132px;height:132px}
.hl-ring svg{width:100%;height:100%;transform:rotate(-90deg)}
.hl-ring circle{fill:none;stroke-width:10}
.hl-ring-track{stroke:color-mix(in srgb,var(--hb-t2) 22%,transparent)}
.hl-ring-value{stroke:var(--hb-ac);stroke-linecap:round}
.hl-hero[data-kind='met'] .hl-ring-value{stroke:var(--hb-ok)}
.hl-ring-c{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px}
.hl-ring-c strong{font-size:28px;font-weight:650;letter-spacing:-.02em;line-height:1.15}
.hl-ring-c span{font-size:13px;color:var(--hb-t2)}
.hl-sleep{grid-column:span 4}
.hl-last{grid-column:span 4}
.hl-week{grid-column:span 8}
.hl-weight{grid-column:span 4}
.hl-reward,.hl-sync{grid-column:span 4}
.hl-wide{grid-column:span 8}
.hl-side{grid-column:span 4}
.hl-gap{grid-column:span 8}
.hl-sleep .hl-note:last-child,.hl-last .hl-note:last-child{margin-top:auto}
.hl-days{list-style:none;margin:4px 0 0;padding:0;display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px}
.hl-days li{display:flex;flex-direction:column;align-items:center;gap:2px;padding:8px 2px;border-radius:var(--hb-radius-nested,10px);border:1px solid transparent;background:var(--hb-fill,var(--hb-s2));font-size:13px;color:var(--hb-t2);min-width:0}
.hl-days li b{font-size:13px;color:var(--hb-t1);font-weight:600}
.hl-days li[data-state='trained']{background:color-mix(in srgb,var(--hb-ac) 16%,transparent);border-color:transparent;color:var(--hb-ac)}
.hl-week[data-met='true'] .hl-days li[data-state='trained']{background:var(--hb-ok-s);color:var(--hb-ok)}
.hl-days li[data-today='true']{border-color:transparent;box-shadow:inset 0 0 0 1.5px var(--hb-ac)}
.hl-days li[data-state='future']{background:transparent;box-shadow:inset 0 0 0 1px var(--hb-edge,var(--hb-b1))}
.hl-days li[data-state='unknown']{opacity:.75}
.hl-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:auto 0 0;padding-top:12px;border-top:1px solid var(--hb-edge,var(--hb-b1))}
.hl-stats div{min-width:0}
.hl-stats dt{font-size:13px;color:var(--hb-t2)}
.hl-stats dd{margin:2px 0 0;font-size:18px;font-weight:600;letter-spacing:-.01em;white-space:nowrap}
.hl-list{margin:0;display:flex;flex-direction:column}
.hl-list div{display:flex;justify-content:space-between;align-items:baseline;gap:12px;padding:8px 0;border-bottom:1px solid var(--hb-edge,var(--hb-b1));font-size:14px}
.hl-list div:last-child{border-bottom:0}
.hl-list dt{color:var(--hb-t2)}
.hl-list dd{margin:0;font-weight:600;text-align:right}
.hl-list dd[data-state]:not([data-state='ok']){color:var(--hb-t2);font-weight:500}
.hl-row{display:flex;justify-content:space-between;align-items:baseline;gap:12px;flex-wrap:wrap}
.hl-delta{font-size:13px;font-weight:600;color:var(--hb-t2)}
.hl-bar{height:8px;border-radius:4px;background:color-mix(in srgb,var(--hb-t2) 28%,transparent);overflow:hidden}
.hl-bar span{display:block;height:100%;background:var(--hb-ac);border-radius:4px}
.hl-spark{display:block;width:100%;height:56px;color:var(--hb-ac);margin-top:auto}
.hl-wide .hl-spark{height:140px}
.hl-axis{display:flex;justify-content:space-between;font-size:11px;color:var(--hb-t2)}
.hl-level h2{margin:0;font-size:28px;font-weight:650;letter-spacing:-.02em;line-height:1.2}
.hl-mlist{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
.hl-mlist li{display:flex;align-items:center;gap:10px;font-size:14px;color:var(--hb-t2)}
.hl-mlist li span:last-child{margin-left:auto;font-size:13px}
.hl-mlist li[data-state='on']{color:var(--hb-t1)}
.hl-mark{width:20px;height:20px;flex:none;border-radius:50%;border:1.5px solid color-mix(in srgb,var(--hb-t2) 60%,transparent);display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;line-height:1}
.hl-mlist li[data-next='true']{color:var(--hb-t1)}
.hl-mlist li[data-next='true'] .hl-mark{border-color:var(--hb-ac)}
.hl-mlist li[data-state='on'] .hl-mark{background:var(--hb-ok);border-color:var(--hb-ok);color:var(--hb-bg)}
.hl-foot{margin:0;font-size:13px;color:var(--hb-t2)}
.hl-empty{grid-column:1/-1;padding:28px 24px;gap:12px}
.hl-empty h2{margin:0;font-size:24px;font-weight:600;letter-spacing:-.02em}
.hl-empty ol{margin:0;padding-left:20px;font-size:14px;line-height:1.7;color:var(--hb-t2)}
.hl-empty code{font-size:13px;padding:1px 5px;border-radius:5px;background:var(--hb-b1);color:var(--hb-t1)}
@media (max-width:1100px){
.hl-hero,.hl-week,.hl-wide,.hl-gap{grid-column:1/-1}
.hl-sleep,.hl-last,.hl-side{grid-column:span 6}
.hl-weight,.hl-reward,.hl-sync{grid-column:span 4}
}
@media (max-width:700px){
.hl-grid{gap:10px}
.hl-grid>*{grid-column:1/-1!important}
.hl-tabs{width:100%}
.hl-tabs button{flex:1;min-height:44px;padding:8px 6px}
.hl-jump{min-height:44px}
.hl-hero{flex-direction:column;align-items:stretch;padding:18px}
.hl-ring{width:104px;height:104px;align-self:flex-start}
.hl-ring-c strong{font-size:22px}
.hl-hero h2{font-size:30px}
.hl-big{font-size:26px}
.hl-big--md{font-size:20px}
.hl-card{padding:14px 16px}
.hl-head{align-items:flex-start}
.hl-days{gap:4px}
.hl-days li{padding:7px 0;font-size:11px}
.hl-mlist li span:last-child{font-size:13px}
.hl-stats{gap:8px}
.hl-stats dd{font-size:16px;white-space:normal}
}
`;

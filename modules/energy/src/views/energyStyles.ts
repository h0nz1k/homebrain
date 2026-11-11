/** Plain exported CSS survives both tsc package builds and the panel's Vite bundle. */
export const energyStyles = `
.en-root{display:flex;flex-direction:column;gap:12px;min-width:0;font-family:Inter,system-ui,sans-serif;color:var(--hb-t1);font-variant-numeric:tabular-nums;font-feature-settings:"tnum","cv11","ss03"}
.en-root *{box-sizing:border-box}
.en-root h1{margin:0;font-size:22px;font-weight:600;letter-spacing:-.02em}
.en-head{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;flex-wrap:wrap}
.en-head-r{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.en-sub{margin:0;font-size:12px;color:var(--hb-t2);line-height:1.4}
.en-sub b{color:var(--hb-t1);font-weight:600}
.en-pill{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border:1px solid var(--hb-b1);border-radius:999px;font-size:12px;color:var(--hb-t2)}
.en-pill--ac{background:var(--hb-ac-s);border-color:transparent;color:var(--hb-ac)}
.en-notices{margin:0;padding:8px 12px;list-style:none;border-radius:8px;background:var(--hb-warn-s);color:var(--hb-warn);font-size:13px}
.en-signals{display:flex;flex-wrap:wrap;gap:8px;margin:0;padding:0;list-style:none}
.en-signals li{padding:6px 10px;border-radius:8px;font-size:13px;background:var(--hb-s1);border:1px solid var(--hb-b1);color:var(--hb-t2);max-width:100%}
.en-signals li b{color:var(--hb-t1);font-weight:600}
.en-signals li[data-tone='opportunity']{border-color:color-mix(in srgb,var(--hb-ok) 35%,transparent)}
.en-signals li[data-tone='opportunity'] b,.en-signal-v{color:var(--hb-ok)}
.en-signals li[data-tone='risk']{border-color:color-mix(in srgb,var(--hb-warn) 40%,transparent)}
.en-signals li[data-tone='risk'] b{color:var(--hb-warn)}
.en-signals li[data-tone='risk'] .en-signal-v{color:var(--hb-warn)}
.en-grid{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:12px;align-items:stretch}
.en-card{min-width:0;padding:14px 16px;border:1px solid var(--hb-b1);border-radius:12px;background:var(--hb-s1);box-shadow:var(--hb-card-shadow);display:flex;flex-direction:column;gap:8px}
.en-ct{margin:0;font-size:13px;font-weight:600;display:flex;gap:8px;align-items:baseline;flex-wrap:wrap}
.en-ct small{font-size:12px;font-weight:400;color:var(--hb-t2)}
.en-lbl{font-size:11px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:var(--hb-t2)}
.en-kpi{grid-column:span 3;gap:4px;padding:12px 14px 10px}
.en-kpi-v{font-size:22px;font-weight:600;letter-spacing:-.02em;line-height:1.2;white-space:nowrap}
.en-kpi-v small,.en-flow strong small{font-size:13px;font-weight:400;color:var(--hb-t2);letter-spacing:0}
.en-kpi .en-sub{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.en-spark{display:block;width:100%;height:26px;margin-top:auto}
.en-price{grid-column:span 8}
.en-now{grid-column:span 4}
.en-day{grid-column:span 6}
.en-week{grid-column:span 3}
.en-balance{grid-column:span 3}
.en-chips{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.en-chip{padding:3px 8px;border-radius:6px;font-size:12px;white-space:nowrap}
.en-chip--ok{background:var(--hb-ok-s);color:var(--hb-ok)}
.en-chip--warn{background:var(--hb-warn-s);color:var(--hb-warn)}
.en-chip-text{font-size:12px;color:var(--hb-t2)}
.en-chip-text b{color:var(--hb-t1)}
.en-hscroll{overflow-x:auto;overflow-y:hidden;min-width:0}
.en-hscroll-in{min-width:520px;padding:16px 4px 0 0}
.en-chart{position:relative;margin-left:22px}
.en-chart svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
.en-chart--price{height:168px}
.en-chart--line{height:132px;margin-top:6px;flex:1;min-height:110px}
.en-axis{position:absolute;font-size:11px;color:var(--hb-t3);line-height:1;white-space:nowrap}
.en-axis--y{right:100%;margin-right:6px;transform:translateY(-50%)}
.en-axis--tag{bottom:100%;margin-bottom:4px;transform:translateX(-50%);color:var(--hb-t2);font-weight:600}
.en-axis--tag-in{bottom:auto;top:4px;margin:0;transform:translateX(4px);color:var(--hb-t3)}
.en-unit{text-transform:none;letter-spacing:0}
.en-note{margin:8px 0 0;font-size:13px;line-height:1.35;color:var(--hb-t3)}
.en-xaxis{position:relative;height:16px;margin:4px 0 0 22px}
.en-xaxis span{position:absolute;top:0;font-size:11px;color:var(--hb-t3);transform:translateX(-50%);white-space:nowrap}
.en-xaxis span:last-child{transform:translateX(-100%)}
.en-legend{display:flex;flex-wrap:wrap;gap:4px 12px;font-size:12px;color:var(--hb-t2);align-items:center}
.en-legend i{display:inline-block;width:12px;height:3px;border-radius:2px;margin-right:5px;vertical-align:middle}
.en-legend i.en-dash{background:repeating-linear-gradient(90deg,var(--hb-t2) 0 2px,transparent 2px 4px)}
.en-legend b{color:var(--hb-t1);font-weight:600}
.en-legend-note{margin-left:auto;color:var(--hb-t3)}
.en-flows{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.en-flow{display:flex;flex-direction:column;gap:2px;padding:8px 10px;border-radius:9px;background:var(--hb-s2);border:1px solid var(--hb-b1);border-left:3px solid;min-width:0}
.en-flow strong{font-size:20px;font-weight:600;letter-spacing:-.02em;line-height:1.2}
.en-flow .en-sub{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.en-flow .hb-status{align-self:flex-start;font-size:11px}
.en-phases{display:flex;flex-direction:column;gap:6px;margin-top:auto}
.en-phase{display:grid;grid-template-columns:22px 1fr 72px;align-items:center;gap:8px;font-size:12px}
.en-phase-l{font-weight:600}
.en-phase-v{text-align:right;color:var(--hb-t2)}
.en-track{height:6px;border-radius:99px;background:var(--hb-s3);overflow:hidden}
.en-track span{display:block;height:100%;border-radius:99px;background:var(--hb-energy-home)}
.en-bars{flex:1;display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px;min-height:120px;align-items:stretch}
.en-bar-day{display:flex;flex-direction:column;align-items:center;gap:4px;min-width:0}
.en-bar-pair{flex:1;width:100%;display:flex;align-items:flex-end;justify-content:center;gap:2px}
.en-bar-pair span{width:38%;max-width:12px;border-radius:2px 2px 0 0;min-height:1px}
.en-axis-x{font-size:11px;color:var(--hb-t3)}
.en-stack{display:flex;gap:2px;height:22px;border-radius:6px;overflow:hidden;margin-bottom:2px}
.en-stack span{flex-basis:0;min-width:0}
.en-stack .en-stack-gap,.en-legend i.en-stack-gap{background:repeating-linear-gradient(135deg,color-mix(in srgb,var(--hb-t1) 40%,transparent) 0 2px,transparent 2px 6px);border:1px dashed var(--hb-t2)}
.en-balance .en-lbl{margin-top:2px}
.en-appl{grid-column:span 12}
.en-appl-list{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:0;padding:0;list-style:none}
.en-appl-item{display:flex;flex-direction:column;gap:6px;padding:10px 12px;border-radius:9px;background:var(--hb-s2);border:1px solid var(--hb-b1);min-width:0}
.en-appl-top{display:flex;justify-content:space-between;align-items:center;gap:8px;min-width:0}
.en-appl-name{font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.en-appl-v{font-size:22px;font-weight:600;letter-spacing:-.02em;line-height:1.2;white-space:nowrap}
.en-appl-v small{font-size:13px;font-weight:400;color:var(--hb-t2);letter-spacing:0}
.en-appl-stale{margin-left:8px;font-size:12px;font-weight:400;color:var(--hb-warn);letter-spacing:0}
.en-appl-today{display:flex;justify-content:space-between;gap:8px;font-size:12px;color:var(--hb-t2);flex-wrap:wrap}
.en-appl-today b{color:var(--hb-t1);font-weight:600}
.en-appl-note{font-size:12px;color:var(--hb-t3)}
.en-appl-mid{display:flex;flex-direction:column;gap:6px}
.en-appl-v--idle{color:var(--hb-t2)}
.en-appl .en-track span{background:var(--hb-energy-home)}
.en-signals li[data-tone='neutral'] .en-signal-v{color:var(--hb-t1)}
.en-chip--idle{background:var(--hb-s3);box-shadow:inset 0 0 0 1px var(--hb-b1);color:var(--hb-t2)}
.en-chip--off{background:transparent;box-shadow:inset 0 0 0 1px var(--hb-b1);color:var(--hb-t3)}
.en-chip--ac{background:var(--hb-ac-s);color:var(--hb-ac)}
.en-empty{flex:1;display:flex;align-items:center;justify-content:center;min-height:100px}
.en-dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--hb-t3)}
.en-pill--ok .en-dot{background:var(--hb-ok)}
.en-pill--warn .en-dot{background:var(--hb-warn)}
.en-pill--err{border-color:var(--hb-crit);color:var(--hb-crit)}
.en-pill--err .en-dot{background:var(--hb-crit)}
.en-cost{grid-column:1/-1;display:flex;flex-direction:column;gap:14px}
.en-cost-head{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px 16px}
.en-cost-head .en-ct{margin:0}
.en-cost-tools{display:flex;flex-wrap:wrap;align-items:center;gap:10px}
.en-cost-tools .hb-seg-wrap{margin:0}
.en-hdo{gap:6px}
.en-hdo[data-tariff='NT'] .en-dot{background:var(--hb-energy-grid)}
.en-hdo[data-tariff='VT'] .en-dot{background:var(--hb-warn)}
.en-hdo-next{color:var(--hb-t2)}
.en-cost-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.2fr);gap:28px;align-items:start}
.en-cost-col{display:flex;flex-direction:column;gap:4px;min-width:0}
.en-cost-col+.en-cost-col{padding-left:24px;border-left:1px solid color-mix(in srgb,var(--hb-t1) 10%,transparent)}
.en-cost-v{font-size:44px;font-weight:600;line-height:1.15;color:var(--hb-t1);font-variant-numeric:tabular-nums;letter-spacing:-.01em}
.en-cost-save{display:flex;flex-direction:column;gap:2px;margin-top:12px;padding:10px 14px;border-radius:var(--hb-radius-md,12px);background:color-mix(in srgb,var(--hb-ok) 12%,transparent);align-self:stretch}
.en-cost-save b{color:var(--hb-ok);font-size:15px;font-weight:600}
.en-cost-save span{color:var(--hb-t2);font-size:13px}
.en-cost-spot-line{margin:0;font-size:13px;line-height:1.45;color:var(--hb-t2)}
.en-cost-spot-line b{color:var(--hb-t1);font-weight:600}
.en-cost-spot{padding-top:0}
.en-cost-more{font-size:13px;color:var(--hb-t2);line-height:1.5}
.en-cost-more summary{cursor:pointer;color:var(--hb-t2);font-size:13px;width:max-content;list-style:none}
.en-cost-more summary::-webkit-details-marker{display:none}
.en-cost-more summary::after{content:'›';display:inline-block;margin-left:6px;transition:transform var(--hb-dur-1,.15s) ease}
.en-cost-more[open] summary::after{transform:rotate(90deg)}
.en-cost-more p{margin:6px 0 0;max-width:72ch}
@media (max-width:900px){
  .en-cost-grid{grid-template-columns:minmax(0,1fr);gap:14px}
  .en-cost-col+.en-cost-col{padding-left:0;border-left:0;padding-top:14px;border-top:1px solid color-mix(in srgb,var(--hb-t1) 10%,transparent)}
  .en-cost-v{font-size:38px}
}
@media (max-width:1180px){
  .en-kpi{grid-column:span 3}
  .en-price,.en-now,.en-day{grid-column:span 12}
  .en-week,.en-balance{grid-column:span 6}
  .en-appl-list{grid-template-columns:repeat(2,minmax(0,1fr))}
}
@media (max-width:760px){
  .en-grid{gap:10px}
  .en-card{padding:14px}
  .en-kpi{grid-column:span 6}
  .en-week,.en-balance{grid-column:span 12}
  .en-sub,.en-chip,.en-chip-text,.en-legend,.en-pill,.en-phase,.en-signals li{font-size:13px}
  .en-ct{font-size:15px}
  .en-ct small{font-size:13px}
  .en-kpi-v{font-size:20px}
  .en-legend-note{margin-left:0}
  .en-appl-list{grid-template-columns:minmax(0,1fr)}
  .en-appl-name,.en-appl-today,.en-appl-note{font-size:13px}
  .en-appl-v{font-size:20px}
  .en-appl-mid{flex-direction:row;justify-content:space-between;align-items:baseline;gap:12px}
  .en-appl-today{flex-wrap:nowrap;gap:10px}
}
.ef-hero{--ef-sun:var(--hb-energy-pv);--ef-hub:#9aa8ff;--ef-ok:#3fbf7f;--ef-warn:#f0a030;--ef-crit:#ef5a5f;--ef-cold:#5aa9f0;grid-column:1/-1;position:relative;gap:4px;padding:18px 22px 18px;border-radius:var(--hb-radius-lg,20px);border-color:var(--hb-edge,var(--hb-b1));box-shadow:var(--hb-elev-1,var(--hb-card-shadow));background:radial-gradient(60% 80% at 40% 0%,color-mix(in srgb,var(--ef-sun) 7%,transparent),transparent 62%),radial-gradient(60% 80% at 100% 100%,color-mix(in srgb,var(--hb-energy-home) 9%,transparent),transparent 65%),var(--hb-s1)}
[data-theme='light'] .ef-hero{--ef-sun:var(--hb-energy-pv);--ef-hub:#5b63d3;--ef-ok:#1f9d62;--ef-warn:#c27400;--ef-crit:#d63c42;--ef-cold:#2f7fd0}
.ef-hero[data-sunny='false']{background:radial-gradient(70% 90% at 0% 0%,color-mix(in srgb,var(--hb-energy-grid) 8%,transparent),transparent 62%),radial-gradient(60% 80% at 100% 100%,color-mix(in srgb,var(--hb-energy-battery) 7%,transparent),transparent 65%),var(--hb-s1)}
.ef-head{display:flex;justify-content:space-between;align-items:flex-start;gap:8px 16px;flex-wrap:wrap}
.ef-eyebrow{font-size:13px;font-weight:500;color:var(--hb-t2)}
.ef-title{margin:2px 0 0;font-size:20px;line-height:1.3;font-weight:600;letter-spacing:-.018em;text-wrap:balance}
.ef-own{display:inline-flex;gap:6px;align-items:baseline;padding:6px 12px;border-radius:999px;background:color-mix(in srgb,var(--hb-t1) 6%,transparent);font-size:13px;color:var(--hb-t2);white-space:nowrap}
.ef-own b{color:var(--hb-t1);font-weight:600}
.ef-stage{position:relative;container-type:inline-size;--ef-u:calc(100cqw / var(--ef-w));width:100%;max-width:1080px;margin:2px auto 0}
.ef-svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
.ef-wire{fill:none;stroke:currentColor;stroke-opacity:.16;stroke-linecap:round;stroke-linejoin:round;transition:stroke-width .6s var(--hb-ease)}
.ef-wire--on{stroke-opacity:.92}
[data-theme='light'] .ef-wire--on{stroke-opacity:1;stroke:color-mix(in srgb,currentColor 80%,#000)}
.ef-cwire--other{opacity:.55}
.ef-body{position:relative}
.ef-today{position:absolute;left:0;top:6px;z-index:1;display:grid;gap:3px;margin:0;min-width:170px}
.ef-today-h{margin-bottom:3px;font-size:13px;font-weight:600;color:var(--hb-t2)}
.ef-today div{display:flex;justify-content:space-between;align-items:baseline;gap:18px;padding-left:12px;position:relative;font-size:13px;line-height:1.4}
.ef-today div::before{content:'';position:absolute;left:0;top:.5em;width:6px;height:6px;border-radius:50%;background:var(--ef-c)}
.ef-today div[data-out]::before{background:none;box-shadow:inset 0 0 0 1.6px var(--ef-c)}
.ef-today dt{color:var(--hb-t2)}
.ef-today dd{margin:0;font-weight:600;color:var(--hb-t1);font-variant-numeric:tabular-nums}
.ef-today dd small{font-size:13px;font-weight:500;color:var(--hb-t2)}
.ef-edge{animation:ef-fade .5s ease both}
.ef-dots{fill:none;stroke:color-mix(in srgb,currentColor 35%,#fff);stroke-linecap:round;stroke-dasharray:7 63;animation:ef-flow 1s linear infinite}
.ef-dots--thin{stroke-dasharray:8 30;animation-name:ef-flow-thin}
.ef-chev{fill:none;stroke:currentColor;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round;opacity:.95}
.ef-bus{stroke-opacity:.22}
.ef-head-r{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
@keyframes ef-flow{to{stroke-dashoffset:-70}}
@keyframes ef-flow-thin{to{stroke-dashoffset:-38}}
.ef-soctrack{fill:none;stroke:var(--hb-energy-battery);stroke-opacity:.16;stroke-width:3.5}
.ef-cons--other{cursor:default}
.ef-cons--other .ef-cons-ic{color:var(--hb-t3)}
.ef-cons--other .ef-cons-disc{fill:color-mix(in srgb,var(--hb-t1) 5%,var(--hb-s1));stroke:color-mix(in srgb,var(--hb-t1) 16%,transparent)}
.ef-cons--other .ef-cons-v{color:var(--hb-t2)}
.ef-socring{fill:none;stroke:var(--hb-energy-battery);stroke-width:3.5;stroke-linecap:round}
.ef-disc-base{fill:var(--hb-s1)}
.ef-disc{stroke:currentColor;stroke-opacity:.3;stroke-width:1.5}
.ef-node:not(.is-active) .ef-pic{opacity:.5}
.ef-node:not(.is-active) .ef-disc{stroke-opacity:.16}
.ef-soc{fill:currentColor;opacity:.9}
.ef-label{position:absolute;z-index:1;display:flex;flex-direction:column;align-items:center;gap:0;margin:0;padding:2px 6px;border:0;border-radius:10px;background:none;color:inherit;font:inherit;text-align:center;white-space:nowrap;cursor:pointer;transform:translateX(-50%)}
.ef-label--start{transform:translateX(-6px);align-items:flex-start;text-align:left}
.ef-label--end{transform:translateX(calc(-100% + 6px));align-items:flex-end;text-align:right}
.ef-label:focus-visible,.ef-hit:focus-visible,.ef-cons:focus-visible{outline:2px solid var(--hb-ac);outline-offset:2px}
.ef-name{display:flex;gap:6px;align-items:baseline;font-size:13px;font-weight:500;color:var(--hb-t2);line-height:1.3}
.ef-extra{font-weight:600;color:color-mix(in srgb,var(--ef-c) 72%,var(--hb-t1))}
.ef-val{font-size:30px;font-weight:600;letter-spacing:-.03em;line-height:1.16;color:var(--hb-t1)}
.ef-val small{font-size:14px;font-weight:500;letter-spacing:0;color:var(--hb-t2)}
.ef-sub{font-size:13px;line-height:1.3;color:var(--hb-t2)}
.ef-sub[data-ml]{white-space:pre}
.ef-srcs{display:flex;flex-direction:column;gap:1px;margin-top:2px;font-size:13px;line-height:1.3;color:var(--hb-t2);font-variant-numeric:tabular-nums;white-space:nowrap}
.ef-src{display:inline-flex;align-items:center;gap:6px}
.ef-label--end .ef-src{justify-content:flex-end}
.ef-label--center .ef-src{justify-content:center}
.ef-src--inline{margin-left:8px}
.ef-src i{width:8px;height:8px;flex:none;border-radius:50%;background:var(--ef-c)}
.ef-hit{position:absolute;z-index:1;aspect-ratio:1;margin:0;padding:0;border:0;border-radius:50%;background:none;cursor:pointer}
.ef-cons{display:flex;align-items:center;gap:10px;margin:0;padding:0;border:0;background:none;color:inherit;font:inherit;text-align:left;cursor:pointer;animation:ef-in .34s var(--hb-ease-out,var(--hb-ease)) both}
.ef-cons-col .ef-cons{position:absolute;max-width:100%;z-index:1;transition:top .35s var(--hb-ease)}
.ef-cons.is-leaving{animation:ef-out .26s ease forwards;pointer-events:none}
.ef-cons-ic{flex:none;width:calc(var(--ef-u) * 48);height:calc(var(--ef-u) * 48);color:var(--hb-energy-home);overflow:visible}
.ef-cons-disc{fill:color-mix(in srgb,var(--hb-energy-home) 11%,var(--hb-s1));stroke:color-mix(in srgb,var(--hb-energy-home) 38%,transparent);stroke-width:1.3}
.ef-cons-t{display:flex;flex-direction:column;min-width:0}
.ef-cons-n{font-size:13px;color:var(--hb-t2);white-space:normal;overflow-wrap:anywhere}
.ef-cons-v{font-size:17px;font-weight:600;letter-spacing:-.02em;color:var(--hb-t1);line-height:1.25}
.ef-cons-v small{font-size:13px;font-weight:500;color:var(--hb-t2);letter-spacing:0}
.ef-cwire{animation:ef-fade .4s ease both}
.ef-cwire.is-leaving{opacity:0;transition:opacity .25s}
.ef-cons-col .ef-cons-none{position:absolute;max-width:calc(var(--ef-u) * 150);font-size:13px;line-height:1.35;color:var(--hb-t3)}
.ef-cons-col .ef-cons-more{position:absolute;font-size:13px;color:var(--hb-t2)}
@keyframes ef-in{from{opacity:0;transform:translateX(-10px) scale(.9)}}
@keyframes ef-out{to{opacity:0;transform:scale(.88)}}
@keyframes ef-fade{from{opacity:0}}
.ef-hero--compact{padding:16px 14px 14px}
.ef-hero--compact .ef-title{font-size:18px}
.ef-hero--compact .ef-val{font-size:24px}
.ef-cons-row{margin-top:8px;padding-top:12px;border-top:1px solid var(--hb-b1)}
.ef-cons-h{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:10px;font-size:13px;color:var(--hb-t2)}
.ef-cons-h b{color:var(--hb-t1);font-weight:600}
.ef-cons-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.ef-cons-row .ef-cons{gap:8px}
.ef-cons-row .ef-cons-ic{width:40px;height:40px}
.ef-cons-row .ef-cons-n{white-space:normal;line-height:1.25}
.ef-cons-col .ef-cons-other{position:absolute;font-size:13px;color:var(--hb-t3);white-space:nowrap}
.ef-cons-row .ef-cons-none{margin:0;font-size:13px;color:var(--hb-t3)}
.ef-cons-row .ef-cons-more{align-self:center;font-size:13px;color:var(--hb-t2)}
.ef-sheet-wrap{position:fixed;inset:0;z-index:60;display:flex;align-items:flex-end;justify-content:center}
.ef-scrim{position:absolute;inset:0;background:rgba(5,8,12,.45);backdrop-filter:blur(6px);animation:ef-fade .2s ease both}
.ef-sheet{position:relative;width:min(440px,100%);padding:18px 20px calc(20px + env(safe-area-inset-bottom));border-radius:22px 22px 0 0;background:var(--hb-s1);box-shadow:0 -12px 40px rgba(0,0,0,.28);animation:ef-up .3s var(--hb-ease-out,var(--hb-ease)) both}
@media (min-width:700px){.ef-sheet-wrap{align-items:center}.ef-sheet{border-radius:22px}}
@keyframes ef-up{from{opacity:0;transform:translateY(24px)}}
.ef-sheet-head{display:flex;align-items:center;gap:12px}
.ef-sheet-head h3{flex:1;margin:0;font-size:17px;font-weight:600;letter-spacing:-.01em}
.ef-sheet-ic{width:44px;height:44px;flex:none;border-radius:50%;background:color-mix(in srgb,currentColor 12%,var(--hb-s1))}
.ef-close{padding:7px 14px;border:0;border-radius:999px;background:color-mix(in srgb,var(--hb-t1) 8%,var(--hb-s1));color:var(--hb-t1);font:inherit;font-size:13px;cursor:pointer}
.ef-sheet-note{margin:12px 0 0;font-size:14px;line-height:1.45;color:var(--hb-t2)}
.ef-rows{margin:14px 0 0}
.ef-rows div{display:flex;justify-content:space-between;gap:12px;padding:10px 0;border-top:1px solid var(--hb-b1);font-size:14px}
.ef-rows dt{color:var(--hb-t2)}
.ef-rows dd{margin:0;font-weight:600;text-align:right}
.ef-ph{--st:var(--hb-ok);position:relative;isolation:isolate;display:grid;grid-template-columns:minmax(160px,200px) minmax(0,1fr) minmax(200px,280px);gap:32px;align-items:center;width:100%;margin:14px 0 0;padding:18px 4px 4px;border:0;border-radius:0;background:none;color:inherit;font:inherit;text-align:left;cursor:pointer}
.ef-ph::before{content:'';position:absolute;left:0;right:0;top:0;height:1px;background:linear-gradient(90deg,transparent,color-mix(in srgb,var(--hb-t1) 12%,transparent) 12%,color-mix(in srgb,var(--hb-t1) 12%,transparent) 88%,transparent)}
.ef-ph::after{content:'';position:absolute;inset:6px -10px -6px;z-index:-1;border-radius:16px;background:color-mix(in srgb,var(--hb-t1) 4%,transparent);opacity:0;transition:opacity var(--hb-dur-fast,.18s) ease}
.ef-ph:hover::after{opacity:1}
.ef-ph[data-state='notice']{--st:var(--hb-warn)}
.ef-ph[data-state='warn']{--st:color-mix(in srgb,var(--hb-crit) 60%,var(--hb-warn))}
.ef-ph:focus-visible{outline:2px solid var(--hb-ac);outline-offset:4px;border-radius:12px}
.ef-ph-head{display:grid;grid-template-columns:auto;justify-items:start;gap:6px;min-width:0}
.ef-ph-eyebrow{font-size:13px;font-weight:600;color:var(--hb-t1)}
.ef-ph-eyebrow span{font-weight:400;color:var(--hb-t2)}
.ef-ph-big{font-size:26px;font-weight:600;letter-spacing:-.03em;line-height:1.16;font-variant-numeric:tabular-nums;color:var(--hb-t1)}
.ef-ph-big small{font-size:13px;font-weight:500;letter-spacing:0;color:var(--hb-t2)}
.ef-ph-state{display:inline-flex;align-items:center;gap:7px;padding:3px 10px 3px 8px;border-radius:999px;background:color-mix(in srgb,var(--st) 13%,transparent);font-size:13px;font-weight:500;line-height:1.35;color:color-mix(in srgb,var(--st) 58%,var(--hb-t1))}
.ef-ph-state i{position:relative;width:7px;height:7px;border-radius:50%;background:var(--st)}
.ef-ph[data-state='warn'] .ef-ph-state i::after,.ef-phs-now[data-state='warn'] .ef-ph-state i::after{content:'';position:absolute;inset:-5px;border-radius:50%;background:var(--st);opacity:0;animation:ef-ph-ping 2.4s var(--hb-ease-out,ease-out) 3}
@keyframes ef-ph-ping{0%{opacity:.45;transform:scale(.4)}100%{opacity:0;transform:scale(1.5)}}
.ef-ph-bars{display:grid;gap:10px;min-width:0}
.ef-ph-row{display:grid;grid-template-columns:24px minmax(0,1fr) 112px;gap:14px;align-items:center}
.ef-ph-l{font-size:13px;font-weight:600;color:var(--hb-t2);font-variant-numeric:tabular-nums}
.ef-ph-track{position:relative;height:12px;border-radius:999px;background:color-mix(in srgb,var(--hb-t1) 6%,transparent)}
.ef-ph-bars[data-export] .ef-ph-track{background:linear-gradient(90deg,color-mix(in srgb,var(--ef-sun) 9%,transparent),color-mix(in srgb,var(--hb-t1) 5%,transparent) 50%,color-mix(in srgb,var(--hb-energy-grid) 9%,transparent))}
.ef-ph-track::before{content:'';position:absolute;left:calc(100% * var(--z));top:-4px;bottom:-4px;width:2px;margin-left:-1px;border-radius:1px;background:color-mix(in srgb,var(--hb-t1) 30%,transparent);transition:left .6s var(--hb-ease-out,ease)}
.ef-ph-limit{position:absolute;top:-3px;bottom:-3px;left:calc(100% * var(--z) + (100% - 100% * var(--z)) * .8);width:0;border-left:1.5px dotted color-mix(in srgb,var(--hb-crit) 45%,transparent);transition:left .6s var(--hb-ease-out,ease)}
.ef-ph-fill{position:absolute;top:0;bottom:0;left:calc(100% * var(--z));width:calc((100% - 100% * var(--z)) * var(--x));min-width:4px;border-radius:0 999px 999px 0;background:linear-gradient(90deg,color-mix(in srgb,var(--hb-energy-grid) 45%,transparent),var(--hb-energy-grid));box-shadow:0 0 10px color-mix(in srgb,var(--hb-energy-grid) 28%,transparent);transition:width .7s var(--hb-ease-out,ease),left .7s var(--hb-ease-out,ease);animation:ef-ph-grow .9s var(--hb-ease-out,ease) var(--d) both}
.ef-ph-row[data-dir='out'] .ef-ph-fill{left:calc(100% * var(--z) * (1 - var(--x)));width:calc(100% * var(--z) * var(--x));border-radius:999px 0 0 999px;background:linear-gradient(270deg,color-mix(in srgb,var(--hb-energy-grid-export) 45%,transparent),var(--hb-energy-grid-export));box-shadow:0 0 10px color-mix(in srgb,var(--hb-energy-grid-export) 30%,transparent);animation-name:ef-ph-grow-out}
.ef-ph-row[data-dir='idle'] .ef-ph-fill{opacity:0}
.ef-ph-row[data-hot] .ef-ph-fill{background:linear-gradient(90deg,var(--hb-energy-grid) 40%,var(--hb-crit));box-shadow:0 0 14px color-mix(in srgb,var(--hb-crit) 45%,transparent)}
@keyframes ef-ph-grow{from{width:0}}
@keyframes ef-ph-grow-out{from{width:0;left:calc(100% * var(--z))}}
.ef-ph-v{display:grid;grid-template-columns:40px 1fr;align-items:baseline;gap:8px;white-space:nowrap;font-variant-numeric:tabular-nums;text-align:right}
.ef-ph-v b{font-size:16px;font-weight:600;letter-spacing:-.01em;color:var(--hb-t1)}
.ef-ph-v b small{font-size:13px;font-weight:500;color:var(--hb-t2)}
.ef-ph-v em{font-size:13px;font-style:normal;font-weight:500;color:var(--hb-t2)}
.ef-ph-row[data-dir='in'] .ef-ph-v b{color:color-mix(in srgb,var(--hb-energy-grid) 45%,var(--hb-t1))}
.ef-ph-row[data-dir='out'] .ef-ph-v b{color:color-mix(in srgb,var(--hb-energy-grid-export) 55%,var(--hb-t1))}
.ef-ph-row[data-hot] .ef-ph-v b{color:color-mix(in srgb,var(--hb-crit) 70%,var(--hb-t1))}
.ef-ph-axis{position:relative;display:flex;justify-content:space-between;margin:0 126px -4px 38px;font-size:11px;font-weight:500}
.ef-ph-bars:not([data-export]) .ef-ph-axis-in{position:absolute;left:calc(100% * var(--z) + 6px)}
.ef-ph-axis-max{margin-left:auto;color:var(--hb-t3)}
.ef-ph-axis>span{white-space:nowrap}
/* Tablet / narrow desktop card: the hint moves under the bars (three columns squeezed the kW column
   under the saldo text at 820 px). */
.ef-hero{container:ef-card / inline-size}
@container ef-card (max-width:1000px){
.ef-hero--wide .ef-ph{grid-template-columns:minmax(150px,200px) minmax(0,1fr);row-gap:14px}
.ef-hero--wide .ef-ph-hint{grid-column:1 / -1}
}

.ef-ph-axis-out{color:color-mix(in srgb,var(--hb-energy-grid-export) 55%,var(--hb-t2))}
.ef-ph-axis-in{color:color-mix(in srgb,var(--hb-energy-grid) 60%,var(--hb-t2))}
.ef-ph-hint{font-size:14px;line-height:1.45;color:var(--hb-t2)}
.ef-ph-hint b{display:block;margin-bottom:2px;font-size:14px;font-weight:600;color:var(--hb-t1)}
.ef-hero--compact .ef-ph{grid-template-columns:minmax(0,1fr);gap:14px;margin-top:10px;padding:16px 0 4px}
.ef-hero--compact .ef-ph::after{inset:6px -8px -4px}
.ef-hero--compact .ef-ph-head{grid-template-columns:1fr auto;align-items:center;gap:2px 10px}
.ef-hero--compact .ef-ph-state{grid-row:1;grid-column:2}
.ef-hero--compact .ef-ph-big{grid-column:1 / -1;font-size:24px}
.ef-hero--compact .ef-ph-row{grid-template-columns:22px minmax(0,1fr) 104px;gap:10px}
.ef-hero--compact .ef-ph-axis{margin:0 114px -4px 32px}
.ef-hero--compact .ef-ph-v{grid-template-columns:36px 1fr;gap:6px}
.ef-dir{width:.56em;height:.56em;margin-right:6px;vertical-align:.06em;overflow:visible;fill:none;stroke:var(--hb-energy-grid);stroke-width:3;stroke-linecap:round;stroke-linejoin:round}
.ef-dir[data-dir='out']{transform:rotate(180deg);stroke:var(--hb-energy-grid-export)}
.ef-dir[data-dir='both']{stroke:color-mix(in srgb,var(--hb-energy-grid) 50%,var(--hb-energy-pv))}
.ef-sheet[data-wide]{width:min(580px,100%);max-height:92vh;overflow:auto}
.ef-phs-now{display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center;margin-top:14px;font-size:14px;color:var(--hb-t2)}
.ef-phs-now{--st:var(--hb-ok)}
.ef-phs-now[data-state='notice']{--st:var(--hb-warn)}
.ef-phs-now[data-state='warn']{--st:color-mix(in srgb,var(--hb-crit) 60%,var(--hb-warn))}
.ef-phs-now b{color:var(--hb-t1);font-weight:600}
.ef-phs-saldo{margin:10px 0 0;padding:10px 12px;border-radius:12px;background:linear-gradient(100deg,color-mix(in srgb,var(--hb-energy-grid) 10%,var(--hb-s1)),color-mix(in srgb,var(--ef-sun) 12%,var(--hb-s1)));font-size:14px;line-height:1.45;color:var(--hb-t1)}
.ef-phs-spark{display:grid;gap:4px;margin-top:14px}
.ef-phs-row{display:grid;grid-template-columns:24px minmax(0,1fr) 64px;gap:10px;align-items:center}
.ef-spark{display:block;width:100%;height:46px}
.ef-spark-zero{stroke:color-mix(in srgb,var(--hb-t1) 32%,transparent);stroke-width:1;vector-effect:non-scaling-stroke}
.ef-spark-line{fill:none;stroke:color-mix(in srgb,var(--hb-t1) 45%,var(--hb-energy-grid));stroke-width:1.5;stroke-linejoin:round;vector-effect:non-scaling-stroke}
.ef-phs-empty{font-size:13px;color:var(--hb-t3)}
.ef-phs-axis{position:relative;display:flex;justify-content:space-between;margin:0 74px 0 34px;font-size:11px;color:var(--hb-t3)}
.ef-phs-tick{position:absolute;top:0;transform:translateX(-50%)}
.ef-phs-h{margin:16px 0 0;font-size:13px;font-weight:600;color:var(--hb-t2)}
.ef-phs-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:8px 0 0}
.ef-phs-stats div{padding:10px 12px;border-radius:12px;background:color-mix(in srgb,var(--hb-t1) 6%,var(--hb-s1))}
.ef-phs-stats dt{font-size:13px;color:var(--hb-t2)}
.ef-phs-stats dd{margin:2px 0 0;font-size:17px;font-weight:600;letter-spacing:-.01em;font-variant-numeric:tabular-nums}
@media (max-width:560px){.ef-phs-stats{grid-template-columns:repeat(2,minmax(0,1fr))}}
.ef-phs-apps{margin:12px 0 0;padding:0;list-style:none}
.ef-phs-apps li{display:flex;justify-content:space-between;gap:12px;padding:9px 0;border-top:1px solid var(--hb-b1);font-size:14px}
.ef-phs-apps b{font-weight:600}
.ef-phs-foot{margin:12px 0 0;font-size:13px;line-height:1.45;color:var(--hb-t3)}
@media (prefers-reduced-motion:reduce){.ef-edge,.ef-dots,.ef-cons,.ef-cons.is-leaving,.ef-cwire,.ef-sheet,.ef-scrim,.ef-ph-fill,.ef-ph-state i::after{animation:none!important}.ef-ph-fill{transition:none!important}.ef-cons.is-leaving{opacity:0}}

.ef-bus-rail{fill:none;stroke:var(--hb-t1);stroke-opacity:.3;stroke-linecap:round}
/* Light theme: the idle conductor must stay readable (≥ 3:1 against the card, WCAG 1.4.11);
   an opaque mix instead of opacity keeps it one solid grey where rails overlap. */
[data-theme='light'] .ef-bus-rail{stroke:color-mix(in srgb,var(--hb-t1) 52%,var(--hb-s1));stroke-opacity:1}
[data-theme='light'] .ef-tjoint{stroke-opacity:.6;fill:color-mix(in srgb,var(--hb-t1) 14%,var(--hb-s1))}
.ef-node--hub .ef-disc{stroke-opacity:.42}
.ef-hubring{fill:none;stroke:var(--ef-tone,var(--hb-t3));stroke-width:2.5;stroke-opacity:.55}
.ef-node--hub[data-tone='ok']{--ef-tone:var(--ef-ok)}
.ef-node--hub[data-tone='warn']{--ef-tone:var(--ef-warn)}
.ef-node--hub[data-tone='err']{--ef-tone:var(--ef-crit)}
.ef-node--hub[data-tone='err'] .ef-hubring{stroke-opacity:.95;stroke-width:3;animation:ef-alert 2.4s ease-in-out infinite}
.ef-hubspin{fill:none;stroke:var(--ef-tone,var(--hb-t3));stroke-width:3.2;stroke-linecap:round;animation:ef-spin 9s linear infinite}
@keyframes ef-spin{to{transform:rotate(360deg)}}
@keyframes ef-alert{50%{opacity:.35}}
.ef-label--right{transform:translateY(-50%);align-items:flex-start;text-align:left}
/* Temperature chips are the catalog Pill (size sm); only the placement lives here. */
.ef-temp{margin-left:2px}
.ef-sub[data-tone]{display:inline-flex;align-items:center;gap:6px}
.ef-sub[data-tone] i{width:7px;height:7px;flex:none;border-radius:50%;background:var(--hb-t3)}
.ef-sub[data-tone='ok'] i{background:var(--ef-ok);box-shadow:0 0 0 3px color-mix(in srgb,var(--ef-ok) 22%,transparent)}
.ef-sub[data-tone='warn'] i{background:var(--ef-warn)}
.ef-sub[data-tone='err']{color:var(--ef-crit);font-weight:600}
.ef-sub[data-tone='err'] i{background:var(--ef-crit);box-shadow:0 0 0 3px color-mix(in srgb,var(--ef-crit) 25%,transparent)}
.ef-rows div[data-tone='warn'] dd,.ef-rows div[data-tone='notice'] dd{color:var(--ef-warn,#c27400)}
.ef-rows div[data-tone='crit'] dd{color:var(--ef-crit,#d63c42)}
.ef-rows div[data-tone='cold'] dd{color:var(--ef-cold,#2f7fd0)}
.ef-sheet{--ef-ok:#3fbf7f;--ef-warn:#f0a030;--ef-crit:#ef5a5f;--ef-cold:#5aa9f0;--ef-hub:#9aa8ff}
[data-theme='light'] .ef-sheet{--ef-ok:#1f9d62;--ef-warn:#c27400;--ef-crit:#d63c42;--ef-cold:#2f7fd0;--ef-hub:#5b63d3}
.ef-sec{margin-top:18px}
.ef-sec{padding-top:14px;border-top:1px solid color-mix(in srgb,var(--hb-t1) 8%,transparent)}
.ef-sec h4{margin:0;font-size:12px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--hb-t3)}
.ef-sec .ef-rows{margin-top:6px}
.ef-sec .ef-sheet-note{margin-top:8px;font-size:13px}
.ef-tspark{margin:16px 0 0;padding:12px 14px 10px;border-radius:14px;background:color-mix(in srgb,var(--hb-t1) 5%,var(--hb-s1))}
.ef-tspark figcaption{display:flex;justify-content:space-between;gap:10px;font-size:13px;color:var(--hb-t2)}
.ef-tspark figcaption b{font-weight:600;color:var(--hb-t1)}
.ef-tspark svg{display:block;width:100%;height:46px;margin-top:6px;overflow:visible}
.ef-tspark-line{fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;vector-effect:non-scaling-stroke}
.ef-tspark-area{fill:currentColor;opacity:.12}
@media (prefers-reduced-motion:reduce){.ef-hubspin,.ef-node--hub[data-tone='err'] .ef-hubring{animation:none!important}}
.ef-hubfault{fill:var(--ef-crit);fill-opacity:.13}
.ef-hubbadge circle{fill:var(--ef-crit);stroke:var(--hb-s1);stroke-width:2.5}
.ef-hubbadge path{fill:none;stroke:#fff;stroke-width:2.6;stroke-linecap:round}
.ef-node--hub[data-tone='err'] .ef-pic{opacity:.55}
.ef-sub2{color:var(--hb-t3)}
.ef-sub2[data-tone2='err']{color:var(--ef-crit);font-weight:500}
.ef-sub .ef-temp{margin-left:6px}
.ef-tjoint{fill:color-mix(in srgb,var(--hb-t1) 10%,var(--hb-s1));stroke:var(--hb-t1);stroke-opacity:.35;stroke-width:1.2}
.ef-node--hub[data-busy] .ef-hubring{animation:ef-breathe 3.2s ease-in-out infinite}
@keyframes ef-breathe{50%{stroke-opacity:.25}}
@media (prefers-reduced-motion:reduce){.ef-node--hub .ef-hubring{animation:none!important}}
.ef-hero[data-fault] .ef-socring{stroke:var(--hb-t3)}
.ef-hero[data-fault] .ef-node--pv,.ef-hero[data-fault] .ef-node--battery{opacity:.6}

/* Narrow phones (stage ≤ 270 px, i.e. 320 px screens; 360 px gives ~298 px): tighter label boxes and value type so
   labels, pills and temperature chips keep clear of each other and of the conductors. */
@container (max-width:270px){
.ef-val{font-size:24px}
.ef-val small{font-size:13px}
.ef-label{padding:1px 3px}
.ef-name{gap:4px}
.ef-sub .ef-temp{margin-left:4px}
}

/* Srovnání období */
.en-cmp{grid-column:1/-1;display:flex;flex-direction:column;gap:14px}
.en-cmp-tiles{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,1fr) minmax(0,1fr);gap:12px}
.en-cmp-tiles[data-period='ytd']{grid-template-columns:minmax(0,1.2fr) minmax(0,2fr)}
.en-cmp-tile{display:flex;flex-direction:column;gap:4px;min-width:0;padding:12px 14px;border-radius:var(--hb-radius-md,12px);background:color-mix(in srgb,var(--hb-t1) 5%,transparent)}
.en-cmp-tile--main{background:color-mix(in srgb,var(--hb-ac) 10%,transparent)}
.en-cmp-lbl{font-size:13px;color:var(--hb-t2);overflow-wrap:anywhere}
.en-cmp-v{font-size:26px;font-weight:600;line-height:1.2;color:var(--hb-t1);font-variant-numeric:tabular-nums;letter-spacing:-.01em}
.en-cmp-tile--main .en-cmp-v{font-size:34px}
.en-cmp-missing{font-size:15px;font-weight:500;line-height:1.6;color:var(--hb-t3)}
.en-cmp-sub{font-size:13px;color:var(--hb-t2)}
.en-cmp-delta{display:flex;flex-wrap:wrap;align-items:baseline;gap:2px 8px;font-size:13px;color:var(--hb-t2)}
.en-cmp-delta b{font-size:13px;font-weight:600;padding:2px 8px;border-radius:999px;background:color-mix(in srgb,var(--hb-t1) 8%,transparent);color:var(--hb-t1)}
.en-cmp-delta[data-tone='ok'] b{background:var(--hb-ok-s);color:var(--hb-ok)}
.en-cmp-delta[data-tone='warn'] b{background:var(--hb-warn-s);color:var(--hb-warn)}
.en-cmp-range{margin:0;font-size:13px;color:var(--hb-t2)}
.en-cmp-chart-wrap{display:flex;flex-direction:column;gap:8px}
.en-cmp-readout{margin:0;min-height:1.5em;font-size:13px;color:var(--hb-t2);font-variant-numeric:tabular-nums}
.en-cmp-inv-detail{display:flex;flex-direction:column;gap:4px;margin:0;padding:8px 10px;border-radius:var(--hb-radius-sm,10px);background:color-mix(in srgb,var(--hb-t1) 5%,transparent);font-size:13px;color:var(--hb-t2);font-variant-numeric:tabular-nums}
.en-cmp-inv-title{margin:0 0 2px;font-size:13px;font-weight:600;color:var(--hb-t1)}
.en-cmp-inv-line{display:flex;align-items:baseline;justify-content:space-between;gap:10px;min-width:0}
.en-cmp-inv-lbl{flex:0 0 auto;white-space:nowrap;color:var(--hb-t2)}
.en-cmp-inv-val{flex:0 1 auto;text-align:right;white-space:nowrap;font-weight:600;color:var(--hb-t1)}
.en-cmp-inv-line[data-tone='muted'] .en-cmp-inv-val{color:var(--hb-t2)}
.en-cmp-inv-line[data-tone='warn'] .en-cmp-inv-val{color:var(--hb-warn)}
.en-cmp-inv-line[data-tone='warn-strong'] .en-cmp-inv-val{color:var(--hb-warn);font-weight:700}
.en-cmp-inv-marker{position:absolute;top:-20px;left:50%;transform:translateX(-50%);display:flex;align-items:center;justify-content:center;height:18px;color:var(--hb-warn);line-height:0;pointer-events:none;z-index:2}
.en-cmp-inv-marker svg{display:block;width:16px;height:16px}
.en-cmp-legend-invoice{display:inline-flex;align-items:center;gap:6px}
.en-cmp-legend-receipt{display:inline-flex;align-items:center;justify-content:center;width:auto!important;height:auto!important;margin-right:0!important;border-radius:0!important;color:var(--hb-warn)}
.en-cmp-legend-receipt svg{display:block;width:16px;height:16px}
.en-cmp-plot{display:grid;grid-template-columns:auto minmax(0,1fr);gap:6px;height:196px}
.en-cmp-yaxis{position:relative;margin-top:22px;height:calc(100% - 42px);min-width:34px;font-size:11px;color:var(--hb-t3);font-variant-numeric:tabular-nums;text-align:right}
.en-cmp-tick{position:absolute;right:0;transform:translateY(50%);white-space:nowrap;line-height:1}
.en-cmp-unit{position:absolute;right:0;top:-20px;font-weight:600;color:var(--hb-t2)}
.en-cmp-chart{position:relative;display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:8px;height:100%;padding-top:22px;box-sizing:border-box}
.en-cmp-grid{position:absolute;left:0;right:0;top:22px;bottom:20px;pointer-events:none}
.en-cmp-grid i{position:absolute;left:0;right:0;height:0;border-top:1px solid color-mix(in srgb,var(--hb-t1) 14%,transparent)}
.en-cmp-col{position:relative;display:flex;flex-direction:column;align-items:stretch;gap:0;min-width:0;padding:0;border:0;border-radius:8px;background:transparent;font:inherit;color:inherit;cursor:pointer}
.en-cmp-col[data-current]{background:color-mix(in srgb,var(--hb-t1) 5%,transparent)}
.en-cmp-col[data-active] .en-cmp-body{box-shadow:inset 0 0 0 1.5px color-mix(in srgb,var(--hb-ac) 55%,transparent)}
.en-cmp-col:focus-visible{outline:2px solid var(--hb-ac);outline-offset:1px}
.en-cmp-col[data-current] .en-axis-x,.en-cmp-col[data-active] .en-axis-x{color:var(--hb-t1);font-weight:600}
.en-cmp-body{display:flex;flex:1;flex-direction:column;align-items:center;gap:4px;min-width:0;min-height:0;width:100%;border-radius:8px}
.en-cmp-pair{position:relative;flex:1;width:100%;display:flex;align-items:stretch;justify-content:center;gap:2px;min-height:0}
.en-cmp-slot{position:relative;width:40%;max-width:20px}
.en-cmp-slot>span{position:absolute;left:0;right:0;bottom:0}
.en-cmp-ghost,.en-cmp-legend-ghost{border-radius:4px 4px 1px 1px;box-shadow:inset 0 0 0 2px color-mix(in srgb,var(--hb-t1) 72%,transparent);background:transparent}
.en-cmp-scope{white-space:nowrap}
.en-cmp-context{font-size:13px;color:var(--hb-t2);font-variant-numeric:tabular-nums}
.en-cmp-tools .hb-seg{grid-auto-columns:auto}
.en-cmp-tools .hb-seg button,.en-cmp-tools .hb-seg:has(> button:nth-of-type(4)) button{padding-inline:12px}
.en-cmp-title{display:flex;flex-direction:column;gap:2px;min-width:0}
.en-cmp-headline{margin:0;font-size:17px;font-weight:600;color:var(--hb-t1)}
.en-cmp-headline[data-tone='ok']{color:var(--hb-ok)}
.en-cmp-headline[data-tone='warn']{color:var(--hb-warn)}
.en-cmp-sw{width:10px!important;height:10px!important;border-radius:3px!important}
.en-cmp-bar{border-radius:4px 4px 1px 1px;min-height:2px}
.en-cmp-bar--last{background:color-mix(in srgb,var(--hb-t1) 30%,transparent)}
.en-cmp-legend-last{background:color-mix(in srgb,var(--hb-t1) 30%,transparent)}
@media (max-width:760px){
.en-cmp-tiles,.en-cmp-tiles[data-period='ytd']{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.en-cmp-tiles[data-period='month'] .en-cmp-tile--main{grid-column:1/-1}
.en-cmp-tile:not(.en-cmp-tile--main) .en-cmp-v{font-size:20px}
.en-cmp-context{font-size:12px;color:var(--hb-t3)}
.en-cmp-tile{padding:10px 14px}
.en-cmp-v{font-size:22px}
.en-cmp-tile--main .en-cmp-v{font-size:30px}
.en-cmp-plot{height:168px}
.en-cmp-chart{gap:3px}
.en-cmp-tools .hb-seg{width:max-content;max-width:100%}
.en-cmp-tools .hb-seg button,.en-cmp-tools .hb-seg:has(> button:nth-of-type(4)) button{padding-inline:10px;font-size:13px}
.en-cmp-slot{width:44%}
.en-cmp-pair{gap:1px}
.en-cmp-tools{width:100%}
}

.en-invoices{grid-column:span 12;gap:12px}
.en-inv-muted{margin:2px 0 0;font-size:13px;color:var(--hb-t2)}
.en-inv-notice{margin:0;padding:10px 12px;border-radius:var(--hb-radius-sm,10px);background:color-mix(in srgb,var(--hb-info,#3b82f6) 10%,var(--hb-s1));font-size:14px}
.en-inv-list{display:flex;gap:8px;overflow-x:auto;padding-bottom:2px}
.en-inv-chip{flex:0 0 auto;display:flex;flex-direction:column;align-items:flex-start;gap:2px;padding:8px 12px;border-radius:var(--hb-radius-sm,10px);border:1px solid var(--hb-b1);background:transparent;color:inherit;font:inherit;font-size:13px;cursor:pointer;text-align:left}
.en-inv-chip[aria-selected='true']{border-color:var(--hb-energy-grid);background:color-mix(in srgb,var(--hb-energy-grid) 9%,var(--hb-s1))}
.en-inv-chip span{color:var(--hb-t2)}
.en-inv-draft{font-style:normal;color:var(--hb-warn)}
.en-inv-body{display:grid;grid-template-columns:minmax(0,3fr) minmax(0,2fr);gap:20px}
.en-inv-main,.en-inv-side{display:flex;flex-direction:column;gap:10px;min-width:0}
.en-inv-sum{margin:0;display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 12px}
.en-inv-sum b{font-size:26px;font-weight:600;letter-spacing:-.02em}
.en-inv-sum span{font-size:13px;color:var(--hb-t2)}
.en-inv-cmp{display:flex;flex-direction:column}
.en-inv-row{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr) minmax(0,1fr);gap:4px 12px;padding:8px 0;border-top:1px solid var(--hb-b1);font-size:14px;align-items:baseline}
.en-inv-row--head{border-top:0;padding-top:0;font-size:12px;color:var(--hb-t2)}
.en-inv-row-v{font-variant-numeric:tabular-nums;font-weight:600}
.en-inv-row-n{grid-column:1/-1;font-size:13px;color:var(--hb-t2)}
.en-inv-row[data-tone='ok'] .en-inv-row-n{color:var(--hb-ok)}
.en-inv-row[data-tone='warn'] .en-inv-row-n{color:var(--hb-warn)}
.en-inv-explain{margin:4px 0 0;font-size:13px;color:var(--hb-t2);line-height:1.45}
.en-inv-tariff{container-type:inline-size;display:flex;flex-direction:column;gap:6px;padding:12px;border-radius:var(--hb-radius-md,12px);background:color-mix(in srgb,var(--hb-t1) 4%,var(--hb-s1))}
.en-inv-tariff h3{margin:0 0 2px}
.en-inv-tariff > button{align-self:flex-start}
.en-inv-trow{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:4px 14px;font-size:13px;color:var(--hb-t2);padding:6px 0;border-top:1px solid var(--hb-b1)}
.en-inv-trow span:not(:first-child){white-space:nowrap;text-align:right}
.en-inv-trow b{color:var(--hb-t1);font-weight:600;font-variant-numeric:tabular-nums}
@container (max-width:360px){.en-inv-trow{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}.en-inv-trow span:first-child{grid-column:1/-1}.en-inv-trow span:not(:first-child){white-space:normal;text-align:left;min-width:0}.en-inv-trow b{display:block;white-space:normal;overflow-wrap:anywhere}}
.en-inv-trow[data-differs] span:last-child b{color:var(--hb-warn)}
.en-inv-actions{display:flex;gap:8px;flex-wrap:wrap}
.en-inv-note{margin:0 0 12px;font-size:14px;color:var(--hb-t2)}
.en-inv-form{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px 12px}
.en-inv-field{display:flex;flex-direction:column;gap:4px;font-size:13px;color:var(--hb-t2)}
.en-inv-field input{box-sizing:border-box;width:100%;min-height:38px;padding:6px 10px;border-radius:var(--hb-radius-sm,8px);border:1px solid var(--hb-b1);background:color-mix(in srgb,var(--hb-t1) 5%,var(--hb-s1));color:var(--hb-t1);font:inherit;font-size:15px}
.en-inv-field[data-missing] input{border-color:var(--hb-warn)}
.en-inv-field[data-missing] span::after{content:' · doplňte';color:var(--hb-warn)}
.en-inv-more{margin-top:14px}
.en-inv-more summary{cursor:pointer;font-size:14px;margin-bottom:10px}
@media (max-width:760px){
  .en-inv-body{grid-template-columns:minmax(0,1fr)}
  .en-inv-sum b{font-size:22px}
  .en-inv-form{grid-template-columns:repeat(2,minmax(0,1fr))}
  .en-inv-trow{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}
  .en-inv-trow span:first-child{grid-column:1/-1;color:var(--hb-t1)}
  .en-inv-trow span:not(:first-child){text-align:left}
  .en-inv-trow span:not(:first-child){white-space:normal;min-width:0}
  .en-inv-trow span:not(:first-child) b{display:block;white-space:nowrap}
}
/* Srovnání nabídek */
.en-offers{grid-column:1/-1;gap:14px}
.en-off-hero{display:flex;flex-direction:column;gap:4px;padding:16px 18px;border-radius:var(--hb-radius-lg,16px);background:radial-gradient(80% 140% at 0% 0%,color-mix(in srgb,var(--en-off-tone,var(--hb-energy-grid)) 16%,transparent),transparent 70%),color-mix(in srgb,var(--hb-t1) 3%,var(--hb-s1));box-shadow:var(--hb-elev-1,none)}
.en-off-hero[data-tone='ok']{--en-off-tone:var(--hb-ok)}
.en-off-hero[data-tone='warn']{--en-off-tone:var(--hb-warn)}
.en-off-big{margin:0;display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 14px}
.en-off-big b{font-size:40px;font-weight:650;letter-spacing:-.03em;line-height:1.15;font-variant-numeric:tabular-nums;color:var(--en-off-tone,var(--hb-t1))}
.en-off-facts{display:flex;flex-wrap:wrap;gap:2px 0;font-size:14px;color:var(--hb-t2);font-variant-numeric:tabular-nums}
.en-off-facts > span{white-space:nowrap}
.en-off-facts > span + span::before{content:'·';margin:0 8px;color:color-mix(in srgb,var(--hb-t2) 60%,transparent)}
.en-off-facts > span[data-tone='strong']{color:var(--en-off-tone,var(--hb-t1));font-weight:600}
.en-off-headline{margin:0;font-size:17px;font-weight:600;letter-spacing:-.01em;line-height:1.3;text-wrap:balance}
.en-off-body{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:20px;align-items:start}
.en-off-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
.en-off-item{position:relative;display:flex;align-items:stretch;gap:4px;border-radius:var(--hb-radius-md,12px);background:color-mix(in srgb,var(--hb-t1) 4%,var(--hb-s1));box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--hb-t1) 8%,transparent);transition:box-shadow var(--hb-dur-1,.15s) var(--hb-ease-out,ease)}
.en-off-item[data-chosen]{box-shadow:inset 0 0 0 2px var(--hb-energy-grid)}
.en-off-pick{flex:1;min-width:0;display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:4px 12px;align-items:center;padding:10px 12px;border:0;background:none;color:inherit;font:inherit;text-align:left;cursor:pointer;border-radius:inherit}
.en-off-pick:disabled{cursor:default;opacity:1}
.en-off-pick:focus-visible{outline:2px solid var(--hb-accent,var(--hb-energy-grid));outline-offset:2px}
.en-off-rank{display:grid;place-items:center;width:28px;height:28px;border-radius:50%;font-size:13px;font-weight:600;background:color-mix(in srgb,var(--hb-t1) 8%,transparent);font-variant-numeric:tabular-nums}
.en-off-item:first-child .en-off-rank{background:color-mix(in srgb,var(--hb-ok) 20%,transparent);color:var(--hb-t1)}
.en-off-name{display:flex;flex-direction:column;gap:2px;min-width:0}
.en-off-name b{font-size:15px;font-weight:600}
.en-off-name > span{font-size:13px;color:var(--hb-t2);display:flex;flex-wrap:wrap;gap:4px 6px;align-items:baseline}
.en-off-prices{display:flex;flex-direction:column;gap:1px;font-size:13px;color:var(--hb-t2);line-height:1.4}
.en-off-prow{display:flex;gap:0 6px;align-items:baseline;min-width:0}
.en-off-plabel{flex:0 0 auto;min-width:6.6em}
.en-off-pval{display:flex;flex-wrap:wrap;gap:0 12px;color:var(--hb-t1);font-variant-numeric:tabular-nums}
.en-off-part{white-space:nowrap}
.en-off-part abbr{text-decoration:underline dotted color-mix(in srgb,var(--hb-t2) 70%,transparent);text-underline-offset:2px;cursor:help}
.en-off-kind{font-style:normal;font-size:12px;font-weight:600;padding:1px 8px;border-radius:999px;background:color-mix(in srgb,var(--hb-t1) 8%,transparent);color:var(--hb-t1)}
.en-off-kind[data-kind='spot']{background:color-mix(in srgb,var(--hb-energy-grid) 18%,transparent)}
.en-off-warn{color:var(--hb-warn) !important}
.en-off-total{display:flex;flex-direction:column;align-items:flex-end;gap:2px;white-space:nowrap;min-width:10.5rem}
.en-off-total b{font-size:17px;font-weight:600;font-variant-numeric:tabular-nums}
.en-off-total span{font-size:13px;color:var(--hb-t2);font-variant-numeric:tabular-nums}
.en-off-total span[data-tone='ok']{color:var(--hb-ok)}
.en-off-total span[data-tone='warn']{color:var(--hb-warn)}
.en-off-edit,.en-off-edit-slot{align-self:center;margin-right:8px;flex:0 0 5.5rem}
.en-off-chart{display:flex;flex-direction:column;gap:8px;min-width:0;padding:12px 14px;border-radius:var(--hb-radius-md,12px);background:color-mix(in srgb,var(--hb-t1) 3%,var(--hb-s1))}
.en-off-chart-title{margin:0;font-size:13px;font-weight:600;color:var(--hb-t2)}
.en-off-legend{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:12px;color:var(--hb-t2)}
.en-off-legend span::before{content:'';display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:6px;vertical-align:-1px;background:var(--en-off-c)}
.en-off-chart [data-k='save']{--en-off-c:var(--hb-ok)}
.en-off-chart [data-k='extra']{--en-off-c:color-mix(in srgb,var(--hb-warn) 70%,var(--hb-s1))}
.en-off-readout{margin:0;display:flex;flex-wrap:wrap;gap:2px 12px;font-size:14px;font-variant-numeric:tabular-nums;min-height:2.8em;align-content:flex-start}
.en-off-readout span{color:var(--hb-t2)}
.en-off-readout span[data-tone='ok']{color:var(--hb-ok);font-weight:600}
.en-off-readout span[data-tone='warn']{color:var(--hb-warn);font-weight:600}
.en-off-bars{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));height:200px}
.en-off-month{display:grid;grid-template-rows:18px minmax(0,var(--en-off-up,1fr)) minmax(0,var(--en-off-down,.5fr)) 18px auto;min-width:0;padding:0 0 2px;border:0;border-radius:8px;background:none;color:inherit;font:inherit;cursor:pointer}
.en-off-up{grid-row:2}
.en-off-down{grid-row:3}
.en-off-mlabel{grid-row:5}
.en-off-up i,.en-off-down i{position:relative}
.en-off-val{font-style:normal;position:absolute;left:50%;transform:translateX(-50%);font-size:11px;line-height:16px;font-weight:600;white-space:nowrap;font-variant-numeric:tabular-nums;color:var(--hb-t2)}
.en-off-up .en-off-val{bottom:100%}
.en-off-down .en-off-val{top:100%}
.en-off-legend-unit{margin-left:auto}
.en-off-legend-unit::before{display:none !important}
.en-off-hint{margin:0;font-size:13px;color:var(--hb-t2);line-height:1.4}
.en-off-month[aria-pressed='true']{background:color-mix(in srgb,var(--hb-t1) 7%,transparent)}
.en-off-month:focus-visible{outline:2px solid var(--hb-energy-grid);outline-offset:1px}
.en-off-up,.en-off-down{display:flex;justify-content:center;padding:0 22%}
.en-off-up{align-items:flex-end;border-bottom:1.5px solid color-mix(in srgb,var(--hb-t1) 45%,transparent)}
.en-off-down{align-items:flex-start}
.en-off-up i,.en-off-down i{flex:1;max-width:18px;min-height:2px;background:var(--en-off-c);transition:height var(--hb-dur-2,.3s) var(--hb-ease-out,ease)}
.en-off-up i{border-radius:5px 5px 1px 1px}
.en-off-down i{border-radius:1px 1px 5px 5px;max-height:100%}
.en-off-down i[data-missing]{height:30%;background:repeating-linear-gradient(135deg,color-mix(in srgb,var(--hb-t1) 25%,transparent) 0 3px,transparent 3px 6px)}
.en-off-mlabel{font-size:11px;color:var(--hb-t2);text-align:center;padding-top:4px}
.en-off-month[data-partial] .en-off-mlabel::after{content:'*'}
.en-off-details summary{cursor:pointer;font-size:14px;font-weight:600}
.en-off-details ul{margin:10px 0;padding-left:18px;font-size:13px;color:var(--hb-t2);line-height:1.5;display:flex;flex-direction:column;gap:4px}
.en-off-reg{display:flex;flex-direction:column;gap:8px;padding:12px;border-radius:var(--hb-radius-md,12px);background:color-mix(in srgb,var(--hb-t1) 4%,var(--hb-s1))}
.en-off-reg .en-ct small{font-weight:400;color:var(--hb-t2);font-size:12px}
.en-off-reg dl{margin:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,330px));gap:0 28px}
.en-off-reg dl div{display:flex;justify-content:space-between;align-items:baseline;gap:12px;padding:5px 0;border-top:1px solid var(--hb-b1);font-size:13px}
.en-off-reg dt{color:var(--hb-t2)}
.en-off-reg dd small{display:block;font-size:12px;font-weight:400;color:var(--hb-t2);text-align:right}
.en-off-reg dd{text-align:right;margin:0;font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap}
.en-off-reg > button{align-self:flex-start}
.en-off-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.en-off-wide{grid-column:1/-1}
.en-off-form small{font-size:12px}
.en-off-error{margin:12px 0 0;color:var(--hb-crit,var(--hb-warn));font-size:14px}
@media (max-width:760px){
  .en-off-body{grid-template-columns:minmax(0,1fr)}
  .en-off-headline{font-size:17px}
  .en-off-pick{grid-template-columns:auto minmax(0,1fr);padding:10px}
  .en-off-total{grid-column:2;flex-direction:row;align-items:baseline;gap:10px;flex-wrap:wrap;min-width:0}
  .en-off-item{flex-wrap:wrap}
  .en-off-pick{flex:1 1 100%}
  .en-off-edit{margin:-6px 10px 8px auto;flex:0 0 auto}
  .en-off-edit-slot{display:none}
  .en-off-big b{font-size:32px}
  .en-off-chart{padding:10px}
  .en-off-bars{height:176px}
  .en-off-up,.en-off-down{padding:0 12%}
  .en-off-mlabel{font-size:11px}
  .en-off-form{grid-template-columns:minmax(0,1fr)}
}

.en-grid-split{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;flex:1}
.en-grid-half{display:flex;flex-direction:column;gap:4px;min-width:0}
.en-grid-half+.en-grid-half{border-left:1px solid var(--hb-b1);padding-left:8px}
.en-grid-half .en-kpi-v{font-size:20px}
.en-grid-half .en-kpi-v small{font-size:11px}
.en-self-gauge{margin-top:auto;padding-top:14px}
.en-self-gauge .en-track{height:9px}
.en-self-gauge .en-sub{display:flex;justify-content:space-between;margin-top:5px}
.en-spark-time{font-size:10px;color:var(--hb-t3)}
.en-price-now{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 16px;font-size:14px}
.en-price{grid-column:span 12}
@media(min-width:761px){.en-kpi .en-spark{height:38px}}
`;

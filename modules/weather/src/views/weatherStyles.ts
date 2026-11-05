/** Plain exported CSS (same approach as modules/today). Round-2 tokens from packages/ui. */
export const weatherStyles = `
.wx{--wx-best:#fbbf24;--wx-best-ink:#fbbf24;--wx-rain-ink:var(--hb-weather-rain);--wx-m-arome:#FB923C;--wx-m-icon-eu:#818CF8;--wx-m-ukmo:#94A3B8;--wx-m-aifs:#E879F9;font-family:Inter,system-ui,sans-serif;font-feature-settings:"tnum","cv11","ss03";font-variant-numeric:tabular-nums;color:var(--hb-t1);min-width:0}
.wx *{box-sizing:border-box}
[data-theme='light'] .wx,[data-theme='system'] .wx{--wx-best:#d97706;--wx-best-ink:#a35204;--wx-rain-ink:#0f6cb6;--wx-m-arome:#C2410C;--wx-m-icon-eu:#4F46E5;--wx-m-ukmo:#64748B;--wx-m-aifs:#C026D3}
.wx-radar{display:flex;flex-direction:column}
.wx-rv-hero{margin:0 0 12px}
.wx-rv-head{font-size:24px;line-height:1.15;font-weight:650;letter-spacing:-.022em;margin:0;text-wrap:balance}
.wx-rv-sub{font-size:13px;color:var(--hb-t2);margin:3px 0 0}
.wx-rv-chart{position:relative;height:108px;margin:14px 0 0;padding:0 54px 18px 0;touch-action:pan-y;cursor:crosshair;-webkit-user-select:none;user-select:none}
.wx-rv-chart svg{display:block;width:100%;height:100%;overflow:visible;-webkit-mask-image:linear-gradient(90deg,#000 88%,rgba(0,0,0,.2));mask-image:linear-gradient(90deg,#000 88%,rgba(0,0,0,.2))}
.wx-rv-guide{stroke:var(--hb-t3);stroke-width:1;stroke-dasharray:1 5;stroke-linecap:round;vector-effect:non-scaling-stroke;opacity:.35}

.wx-rv-base{stroke:var(--hb-t3);stroke-width:1;vector-effect:non-scaling-stroke;opacity:.3}
.wx-rv-area{opacity:1}
.wx-rv-glow{fill:none;stroke-width:6;opacity:.22;stroke-linecap:round;stroke-linejoin:round;vector-effect:non-scaling-stroke;filter:blur(4px)}
.wx-rv-scrub{position:absolute;top:0;bottom:18px;width:0;pointer-events:none;z-index:2}
.wx-rv-scrub::before{content:"";position:absolute;top:-2px;bottom:0;left:-.5px;width:1px;background:linear-gradient(var(--hb-t1),color-mix(in srgb,var(--hb-t1) 10%,transparent))}
.wx-rv-scrub i{position:absolute;left:-5px;width:10px;height:10px;margin-top:-5px;border-radius:50%;background:var(--hb-t1);box-shadow:0 0 0 3px color-mix(in srgb,var(--hb-s1) 85%,transparent),0 2px 8px rgba(0,0,0,.3)}
.wx-rv-scrub span{position:absolute;top:-30px;left:0;transform:translateX(-50%);white-space:nowrap;font-size:12px;font-weight:600;line-height:1;padding:5px 9px;border-radius:999px;background:var(--hb-t1);color:var(--hb-s1);box-shadow:0 4px 14px rgba(0,0,0,.25)}
.wx-rv-scrub span.start{transform:translateX(-12px)}.wx-rv-scrub span.end{transform:translateX(calc(-100% + 12px))}
.wx-rv-line{fill:none;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round;vector-effect:non-scaling-stroke}
.wx-rv-yl{position:absolute;right:0;width:46px;transform:translateY(-50%);font-size:12px;font-weight:500;color:var(--hb-t3);line-height:1;white-space:nowrap}
.wx-rv-yl--edge{transform:translateY(-110%)}
.wx-rv-dry{position:absolute;left:0;right:54px;bottom:30px;text-align:center;font-size:13px;color:var(--hb-t2)}
.wx-rv-xl{position:absolute;left:0;right:54px;bottom:0;height:12px;font-size:12px;color:var(--hb-t2);line-height:1}.wx-rv-xl span{position:absolute;transform:translateX(-50%);white-space:nowrap}.wx-rv-xl span:first-child{transform:none}.wx-rv-xl span:last-child{transform:translateX(-50%)}
.wx-rv-xl span:first-child{color:var(--hb-t1);font-weight:600}
.wx-rv-map{--rv-bg:color-mix(in srgb,var(--rv-land) 55%,var(--hb-bg));--rv-land:color-mix(in srgb,var(--hb-s2) 78%,var(--hb-bg));--rv-water:color-mix(in srgb,#6f95b3 52%,var(--rv-land));--rv-halo:color-mix(in srgb,var(--hb-bg) 88%,#000);--rv-ink:color-mix(in srgb,var(--hb-t1) 92%,transparent);--rv-ink2:var(--hb-t2);position:relative;aspect-ratio:4/3;width:auto;margin:0 -16px;border-radius:0;overflow:hidden;background:radial-gradient(130% 100% at 50% 40%,color-mix(in srgb,var(--rv-bg) 70%,var(--rv-land)),var(--rv-bg));box-shadow:inset 0 1px 0 var(--hb-b1),inset 0 -1px 0 var(--hb-b1);isolation:isolate;touch-action:pan-y}
[data-theme='light'] .wx-rv-map{--rv-bg:#e9e6e0;--rv-land:#f3f1ec;--rv-water:#c3d3df;--rv-halo:#f6f4f0;--rv-ink:#20242b;--rv-ink2:#4b5260}
@media (prefers-color-scheme:light){[data-theme='system'] .wx-rv-map{--rv-bg:#e9e6e0;--rv-land:#f3f1ec;--rv-water:#c3d3df;--rv-halo:#f6f4f0;--rv-ink:#20242b;--rv-ink2:#4b5260}}
.wx-rv-map svg{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
.wx-rv-lake{fill:var(--rv-water);stroke:none}
.wx-rv-orp{fill:none;stroke:var(--hb-t3);stroke-width:.5;opacity:.13;vector-effect:non-scaling-stroke;transition:opacity .4s}
.wx-rv-map--kraj .wx-rv-orp{opacity:0}.wx-rv-map--cesko .wx-rv-kraj{opacity:.22}.wx-rv-map--cesko .wx-rv-orp{opacity:0}
.wx-rv-cz{fill:var(--rv-land);stroke:none}
.wx-rv-urban{fill:color-mix(in srgb,var(--hb-t1) 7%,transparent);stroke:none}
[data-theme='light'] .wx-rv-urban{fill:rgba(120,98,70,.09)}
.wx-rv-road{fill:none;stroke:var(--hb-t3);stroke-width:.6;opacity:.22;vector-effect:non-scaling-stroke;stroke-linecap:round;stroke-linejoin:round}
.wx-rv-mway{fill:none;stroke:var(--hb-t2);stroke-width:1.1;opacity:.22;vector-effect:non-scaling-stroke;stroke-linecap:round;stroke-linejoin:round}
[data-theme='light'] .wx-rv-mway{stroke:#b8aa98;opacity:.55}[data-theme='light'] .wx-rv-road{opacity:.3}
.wx-rv-river2{fill:none;stroke:var(--rv-water);stroke-width:.8;vector-effect:non-scaling-stroke;stroke-linecap:round;opacity:.8}
.wx-rv-map--cesko .wx-rv-road,.wx-rv-map--cesko .wx-rv-river2{opacity:0}
.wx-rv-river{fill:none;stroke:var(--rv-water);stroke-width:1.3;vector-effect:non-scaling-stroke;stroke-linecap:round;stroke-linejoin:round}
.wx-rv-kraj{fill:none;stroke:var(--hb-t2);stroke-width:.7;opacity:.22;vector-effect:non-scaling-stroke;stroke-linejoin:round}
.wx-rv-border{fill:none;stroke:var(--hb-t1);stroke-width:1.3;opacity:.4;vector-effect:non-scaling-stroke;stroke-linejoin:round}
.wx-rv-radar{position:absolute}
.wx-rv-cv{position:absolute;inset:0;width:100%;height:100%;opacity:0;transition:opacity 0s linear .38s;image-rendering:auto}
.wx-rv-cv.on{opacity:1;z-index:1;transition:opacity .38s ease}
.wx-rv-top{z-index:2}
.wx-rv-place{position:absolute;z-index:3;display:flex;align-items:center;gap:4px;transform:translate(-2px,-50%);font-size:12px;font-weight:500;color:var(--rv-ink2);white-space:nowrap;line-height:1;letter-spacing:.005em;pointer-events:none;paint-order:stroke fill;-webkit-text-stroke:2px var(--rv-halo);transition:opacity .2s}
.wx-rv-place[data-hidden]{opacity:0;visibility:hidden}
.wx-rv-place--home{transform:translate(9px,-50%);font-weight:650;color:var(--rv-ink)}.wx-rv-place.wx-rv-place--home i{display:none}
.wx-rv-place i{display:none}
.wx-rv-place--0{font-size:13px;font-weight:650;color:var(--rv-ink);letter-spacing:-.005em}.wx-rv-place--0 i{display:block;width:5px;height:5px;border-radius:50%;background:var(--rv-ink);box-shadow:0 0 0 1.5px var(--rv-halo);flex:none}.wx-rv-place--2{font-weight:450}
.wx-rv-home{position:absolute;z-index:4;width:0;height:0}
.wx-rv-home i{position:absolute;left:-8px;top:-8px;width:16px;height:16px;border-radius:50%;background:#3b82f6;border:3px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.25),0 2px 8px rgba(0,0,0,.4)}
.wx-rv-home::before{content:"";position:absolute;left:-8px;top:-8px;width:16px;height:16px;border-radius:50%;background:#3b82f6;opacity:0;animation:wx-rv-pulse 2.4s cubic-bezier(.2,.6,.3,1) 4}
@keyframes wx-rv-pulse{0%{transform:scale(1);opacity:.55}100%{transform:scale(4.2);opacity:0}}
.wx-rv-seg{display:flex;width:100%;margin:0 0 8px;padding:2px;gap:2px;border-radius:999px;background:color-mix(in srgb,var(--hb-s1) 82%,transparent);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);border:1px solid var(--hb-b1)}
.wx-rv-seg button{flex:1;border:0;background:none;color:var(--hb-t2);font:inherit;font-size:12px;font-weight:500;padding:5px 11px;border-radius:999px;cursor:pointer;min-height:28px}
.wx-rv-seg button.on{background:color-mix(in srgb,var(--hb-t1) 13%,var(--hb-s1));color:var(--hb-t1);font-weight:600;box-shadow:0 1px 3px rgba(0,0,0,.16),inset 0 0 0 1px color-mix(in srgb,var(--hb-t1) 10%,transparent)}
.wx-rv-seg button:disabled{opacity:.4;cursor:default}
.wx-rv-seg button:focus-visible,.wx-rv-play:focus-visible{outline:2px solid var(--hb-weather-rain);outline-offset:1px}
.wx-rv-time{position:absolute;z-index:5;left:10px;top:10px;font-size:13px;padding:5px 11px;box-shadow:0 2px 10px rgba(0,0,0,.14);border-radius:999px;background:color-mix(in srgb,var(--hb-s1) 82%,transparent);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);color:var(--hb-t2);border:1px solid var(--hb-b1)}
.wx-rv-time b{color:var(--hb-t1);font-weight:600;margin-right:2px}
.wx-rv-time--fct{border-color:color-mix(in srgb,var(--hb-weather-rain) 55%,transparent)}
.wx-rv-scale{position:absolute;z-index:5;right:10px;bottom:10px;display:flex;flex-direction:column;align-items:flex-end;gap:3px;font-size:12px;font-weight:500;color:var(--rv-ink2);paint-order:stroke fill;-webkit-text-stroke:3px var(--rv-halo)}
.wx-rv-scale i{height:3px;border:1.5px solid var(--rv-ink2);border-top:0;border-radius:0 0 1px 1px;display:block;box-shadow:0 1px 0 var(--rv-halo)}
.wx-rv-tl{display:flex;align-items:flex-start;gap:12px;margin-top:14px}
.wx-rv-play{flex:none;width:32px;height:32px;border-radius:50%;border:0;background:var(--hb-t1);color:var(--hb-s1);display:grid;place-items:center;cursor:pointer;margin-top:7px;box-shadow:0 2px 10px rgba(0,0,0,.2);transition:transform .15s}.wx-rv-play:active{transform:scale(.94)}
.wx-rv-play svg{width:14px;height:14px;fill:currentColor}
.wx-rv-track{position:relative;flex:1;min-width:0;padding-top:20px}
.wx-rv-rail{position:relative;height:6px;border-radius:3px}
.wx-rv-past{position:absolute;left:0;top:0;bottom:0;border-radius:3px 0 0 3px;background:color-mix(in srgb,var(--hb-t1) 28%,transparent)}
.wx-rv-fct{position:absolute;right:0;top:0;bottom:0;border-radius:0 3px 3px 0;background:linear-gradient(90deg,color-mix(in srgb,var(--hb-weather-rain) 42%,transparent),color-mix(in srgb,var(--hb-weather-rain) 12%,transparent))}

.wx-rv-tick{position:absolute;top:-6px;width:1px;height:3px;margin-left:-.5px;background:var(--hb-t3);opacity:.45;border-radius:1px}
.wx-rv-tick--fct{opacity:.3}
.wx-rv-nowm{position:absolute;top:-5px;bottom:-5px;width:3px;margin-left:-1.5px;border-radius:2px;background:var(--hb-t1);box-shadow:0 0 0 2px var(--hb-s1)}
.wx-rv-track input{position:absolute;left:-12px;right:-12px;top:-1px;outline:none;width:calc(100% + 24px);height:44px;margin:0;background:none;-webkit-appearance:none;appearance:none;cursor:pointer;touch-action:pan-y}
.wx-rv-track input::-webkit-slider-runnable-track{background:none;height:44px}
.wx-rv-track input::-moz-range-track{background:none}
.wx-rv-track input::-webkit-slider-thumb{-webkit-appearance:none;width:24px;height:24px;margin-top:10px;border-radius:50%;background:#fff;border:0;box-shadow:0 0 0 1px rgba(0,0,0,.08),0 2px 8px rgba(0,0,0,.35),inset 0 0 0 7px #fff,inset 0 0 0 12px var(--hb-weather-rain);transition:transform .15s}
.wx-rv-track input:active::-webkit-slider-thumb{transform:scale(1.12)}
.wx-rv-track input::-moz-range-thumb{width:24px;height:24px;border-radius:50%;background:#fff;border:0;box-shadow:0 2px 8px rgba(0,0,0,.35),inset 0 0 0 7px #fff,inset 0 0 0 12px var(--hb-weather-rain)}
.wx-rv-track input:focus-visible::-webkit-slider-thumb{outline:2px solid var(--hb-weather-rain);outline-offset:2px}
.wx-rv-tx{position:relative;display:flex;justify-content:space-between;font-size:12px;color:var(--hb-t2);margin-top:14px;line-height:1}
.wx-rv-tnow{position:absolute;top:0;transform:translateX(-50%)}
.wx-rv-tnow{color:var(--hb-t1);font-weight:600}
.wx-rv-tf{position:absolute;right:0;top:-20px;font-size:11px;font-weight:500;letter-spacing:.02em;line-height:1;color:var(--hb-t2);white-space:nowrap}
.wx-rv-motion{position:absolute;z-index:4;width:0;height:0;transform:rotate(var(--rv-deg)) translateY(-30px) rotate(180deg)}
.wx-rv-motion svg{position:absolute;left:-9px;top:-9px;width:18px;height:18px;fill:none;stroke:var(--hb-t1);stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round;filter:drop-shadow(0 0 2px var(--hb-s1))}
.wx-rv-leg{position:relative;margin:2px 0 4px}
.wx-rv-legbar{height:6px;border-radius:3px}
.wx-rv-legx{position:relative;height:16px;margin-top:6px;font-size:12px;color:var(--hb-t2)}
.wx-rv-legx span{position:absolute;top:0;white-space:nowrap;line-height:1;transform:translateX(-50%)}

.wx-rv-legx em{font-style:normal;color:var(--hb-t3)}
.wx-rv-foot{position:relative;display:flex;align-items:center;gap:6px;margin:auto 0 0;padding-top:12px;font-size:12px;color:var(--hb-t3);line-height:1.3;white-space:nowrap}
.wx-rv-foot-l{overflow:hidden;text-overflow:ellipsis;min-width:0}
.wx-rv-credits summary{list-style:none;display:grid;place-items:center;width:28px;height:28px;margin:-6px 0;border-radius:50%;cursor:pointer;color:var(--hb-t2)}
.wx-rv-credits summary::-webkit-details-marker{display:none}
.wx-rv-credits summary:hover,.wx-rv-credits[open] summary{background:color-mix(in srgb,var(--hb-t1) 8%,transparent)}
.wx-rv-credits summary:focus-visible{outline:2px solid var(--hb-weather-rain);outline-offset:1px}
.wx-rv-credits svg{width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:1.4;stroke-linecap:round}
.wx-rv-pop{position:absolute;z-index:10;left:0;right:0;bottom:calc(100% + 4px);display:flex;flex-direction:column;gap:4px;padding:12px 14px;border-radius:12px;background:var(--hb-s1);border:1px solid var(--hb-b1);box-shadow:0 12px 32px rgba(0,0,0,.28);white-space:normal;font-size:12px;line-height:1.4;color:var(--hb-t2)}
.wx-rv-pop b{color:var(--hb-t1);font-weight:600;font-size:13px}
.wx-radar .wx-cs{color:var(--hb-t2)}
.wx-rv-foot a{color:inherit;text-decoration:none}.wx-rv-foot a:hover{text-decoration:underline}
@media (prefers-reduced-motion:reduce){.wx-rv-home::before{animation:none}.wx-rv-cv,.wx-rv-cv.on{transition:none}}
@media (max-width:600px){.wx-rv-head{font-size:24px}.wx-rv-seg button{padding:6px 12px;min-height:32px}.wx-rv-map{border-radius:0}}
@media (prefers-color-scheme:dark){[data-theme='system'] .wx{--wx-best:#fbbf24;--wx-best-ink:#fbbf24;--wx-rain-ink:var(--hb-weather-rain);--wx-m-arome:#FB923C;--wx-m-icon-eu:#818CF8;--wx-m-ukmo:#94A3B8;--wx-m-aifs:#E879F9}}
.wx-sr{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
.wx-h1{font-size:22px;font-weight:600;letter-spacing:-.02em;margin:0}
.wx-grid{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:16px;align-items:stretch}
.wx-card{background:var(--hb-s1);border:1px solid var(--hb-edge,var(--hb-b1));border-radius:var(--hb-radius-card,16px);box-shadow:var(--hb-card-shadow);padding:16px 18px;min-width:0;display:flex;flex-direction:column}
.wx-ch{display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:10px;flex-wrap:wrap}
.wx-ch-l{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;min-width:0}
.wx-ct{font-size:13px;font-weight:600;margin:0}
.wx-cs{font-size:13px;color:var(--hb-t2)}
.wx-t2{color:var(--hb-t2)}.wx-t3{color:var(--hb-t3)}.wx-ac{color:var(--hb-weather-rain)}.wx-rain{color:var(--wx-rain-ink)}.wx-warnc{color:var(--hb-warn)}
.wx-lbl{font-size:var(--hb-type-caption,13px);font-weight:600;letter-spacing:-.005em;color:var(--hb-t2)}
.wx-empty{color:var(--hb-t2);font-size:13px;margin:4px 0}
.wx-station{grid-column:1 / span 7;grid-row:1}.wx-radar{grid-column:8 / span 5;grid-row:1 / span 2}.wx-score{grid-column:1 / span 7;grid-row:2}
.wx-models{grid-column:span 12}.wx-mg-card{grid-column:span 12}
.wx-daily{grid-column:span 7}.wx-sources{grid-column:span 5}
.wx-cells{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));border:0;border-radius:var(--hb-radius-md,14px);overflow:hidden;background:transparent;gap:4px;margin-top:auto}
.wx-cell{background:var(--hb-fill,var(--hb-s2));border-radius:var(--hb-radius-xs,6px);padding:10px 12px;display:flex;flex-direction:column;gap:2px;min-width:0}
.wx-val{font-size:16px;font-weight:600;white-space:nowrap}
.wx-val small{font-size:12px;font-weight:500;color:var(--hb-t2)}
.wx-sub{font-size:13px;color:var(--hb-t2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wx-nc-h{font-size:28px;font-weight:600;letter-spacing:-.02em;line-height:1.2}
.wx-nc-s{font-size:13px;color:var(--hb-t2);margin:4px 0 12px}
.wx-bars{flex:1;min-height:96px;display:grid;grid-template-columns:repeat(8,1fr);gap:6px;align-items:end;border-bottom:1px solid var(--hb-t3);background:repeating-linear-gradient(to top,transparent 0 23px,var(--hb-b1) 23px 24px)}
.wx-bar-c{height:100%;display:flex;align-items:flex-end}
.wx-bar{width:100%;background:var(--hb-weather-rain);border-radius:4px 4px 0 0;opacity:.9}
.wx-bar--0{height:4px;width:60%;margin:0 auto 2px;background:var(--hb-t3);opacity:.55;border-radius:2px}
.wx-bars-x{position:relative;height:16px;font-size:12px;color:var(--hb-t2);margin-top:6px}
.wx-bars-x span{position:absolute;transform:translateX(-50%);white-space:nowrap}
.wx-bars-x span:first-child{transform:none}.wx-bars-x span:last-child{transform:translateX(-100%)}
.wx-seg{display:inline-flex;background:var(--hb-fill,var(--hb-s2));border:0;box-shadow:inset 0 0 0 1px var(--hb-edge,var(--hb-b1));border-radius:var(--hb-radius-nested,10px);padding:3px;gap:2px}
.wx-seg button{font:inherit;font-size:13px;color:var(--hb-t2);background:none;border:0;border-radius:var(--hb-radius-xs,6px);padding:4px 10px;cursor:pointer;transition:background-color var(--hb-dur-base,200ms) var(--hb-ease-out,ease-out)}
.wx-seg button.on{background:var(--hb-s1);color:var(--hb-t1);font-weight:600;box-shadow:var(--hb-elev-1)}
.wx-chart{position:relative;height:250px;margin:0 72px 0 46px}
.wx-chart svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
.wx-grid line,.wx-chart .wx-grid{stroke:var(--hb-b1);stroke-width:1;vector-effect:non-scaling-stroke}
.wx-grid--day{stroke:var(--hb-b2)}
.wx-handover{stroke:var(--hb-weather-measured);stroke-width:1.5;stroke-dasharray:2 3;vector-effect:non-scaling-stroke}
.wx-nowdot{position:absolute;width:9px;height:9px;margin:-4.5px 0 0 -4.5px;border-radius:50%;background:var(--hb-weather-measured);box-shadow:0 0 0 2px var(--hb-s1);pointer-events:none}
.wx-nowdot--blend{background:var(--hb-ac);width:7px;height:7px;margin:-3.5px 0 0 -3.5px}
.wx-now{stroke:var(--hb-t2);stroke-dasharray:3 3;stroke-width:1;opacity:.8;vector-effect:non-scaling-stroke}
.wx-ylab{position:absolute;left:-46px;transform:translateY(-50%);font-size:12px;color:var(--hb-t2);width:32px;text-align:right}
.wx-nowlab{position:absolute;top:-2px;transform:translateX(6px);font-size:12px;font-weight:600;color:var(--hb-t1)}
.wx-xlabs{position:relative;height:16px;margin:6px 72px 0 46px}
.wx-xlabs span{position:absolute;transform:translateX(-50%);font-size:12px;color:var(--hb-t2);white-space:nowrap}
.wx-foot{font-size:12px;color:var(--hb-t2);margin:10px 0 0}
.wx-info{margin:10px 0 0;padding:9px 11px;border-radius:var(--hb-radius-nested,10px);background:var(--hb-ac-s);font-size:13px;color:var(--hb-t2);line-height:1.4}
.wx-info b{color:var(--hb-t1)}
.wx-hscroll{overflow-x:auto;overflow-y:hidden;-webkit-overflow-scrolling:touch}
.wx-ic{width:20px;height:20px;flex:none;color:var(--hb-t2)}
.wx-ic-sun{color:var(--hb-weather-sun);stroke:var(--hb-weather-sun)}
.wx-ic-moon{stroke:var(--hb-t3)}
.wx-ic-rain{stroke:var(--hb-weather-rain)}
.wx-ic-bolt{stroke:var(--hb-warn)}
.wx-days{list-style:none;margin:0;padding:0}
.wx-day{display:grid;grid-template-columns:44px 44px 24px 44px 30px minmax(80px,1fr) 30px 56px 72px;gap:10px;align-items:center;padding:7px 0;border-top:1px solid var(--hb-b1);font-size:13px}
.wx-day:first-child{border-top:0}
.wx-day-d{white-space:nowrap}
@media (max-width:760px){.wx-hscroll{mask-image:linear-gradient(90deg,#000 calc(100% - 28px),transparent);-webkit-mask-image:linear-gradient(90deg,#000 calc(100% - 28px),transparent)}}
.wx-day-p,.wx-day-min,.wx-day-max,.wx-day-w{text-align:right;white-space:nowrap}
.wx-day-c{justify-self:end}
.wx-range{position:relative;height:6px;border-radius:3px;background:var(--hb-s3)}
.wx-range i{position:absolute;top:0;bottom:0;border-radius:3px}
.wx-range-s{background:var(--hb-t3);opacity:.35}
.wx-range-c{background:linear-gradient(90deg,var(--hb-weather-rain),var(--hb-weather-temp))}
.wx-src{list-style:none;margin:0;padding:0;font-size:13px}
.wx-src li{display:grid;grid-template-columns:10px auto 1fr auto;gap:8px;align-items:baseline;padding:6px 0;border-top:1px solid var(--hb-b1)}
.wx-src li:first-child{border-top:0}
.wx-src-d,.wx-src-s{font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.wx-src-s{text-align:right}
.wx-dot{width:8px;height:8px;border-radius:50%;display:inline-block;background:var(--hb-t3)}
.wx-dot--ok{background:var(--hb-ok)}.wx-dot--warn{background:var(--hb-warn)}.wx-dot--crit{background:var(--hb-crit)}
.wx-attr{margin:auto 0 0;padding-top:10px;font-size:12px;line-height:1.5;color:var(--hb-t2)}
.wx-attr a{color:inherit}
.wx-nc-conf{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:6px 0 2px;font-size:13px}
@media (max-width:1180px){
  .wx-station,.wx-radar{grid-column:span 6;grid-row:auto}.wx-models,.wx-daily,.wx-sources,.wx-score{grid-column:span 12;grid-row:auto}
}
@media (max-width:760px){
  .wx-grid{display:flex;flex-direction:column}
  .wx-radar{order:0}.wx-score{order:5}.wx-sources{order:6}
  .wx-ct{font-size:15px}.wx-cs,.wx-sub,.wx-nc-s,.wx-src-d,.wx-src-s,.wx-seg button,.wx-legend,.wx-info,.wx-val small,.wx-warn-t,.wx-warn-foot{font-size:13px !important}
  .wx-day,.wx-src{font-size:14px}
  .wx-hs{grid-template-columns:repeat(var(--wx-cols),minmax(52px,1fr));min-width:calc(var(--wx-cols) * 52px)}
  .wx-hs-dn,.wx-hs-h,.wx-hs-p,.wx-hs-w,.wx-rank-sub,.wx-rank-k,.wx-hs-key{font-size:13px}.wx-hs-key{gap:4px 12px}
  .wx-val{font-size:17px}
  .wx-cells{grid-template-columns:repeat(2,minmax(0,1fr))}
  .wx-chart{height:200px}
  .wx-day{grid-template-columns:40px 22px 44px 26px minmax(40px,1fr) 28px 64px;gap:8px}
  .wx-day-d,.wx-day-w{display:none}
  .wx-src li{grid-template-columns:10px 1fr auto}
  .wx-src-d{display:none}
}
/* ---- hero (#64 slice 2): sky gradient by condition × sun elevation, one warning panel ---- */
.wx-hero{--wx-ink:#fff;--wx-ink2:rgba(255,255,255,.9);--wx-ink3:rgba(255,255,255,.88);--wx-ink4:rgba(255,255,255,.76);--wx-line:rgba(255,255,255,.16);--wx-glass:rgba(6,12,24,.34);--wx-glass2:rgba(6,12,24,.4);--wx-glass-edge:rgba(255,255,255,.12);--wx-pill:rgba(255,255,255,.16);--wx-sun:#ffd56b;--wx-drop:#a8d4ff;--wx-moon:#e8eeff;--wx-pop:#d6ebff;position:relative;isolation:isolate;overflow:hidden;display:grid;grid-template-columns:minmax(0,1fr) minmax(300px,400px);gap:28px;align-items:stretch;margin:0 0 16px;padding:26px 30px 24px;border-radius:var(--hb-radius-card,20px);color:var(--wx-ink);background:linear-gradient(rgba(4,10,24,.3),rgba(4,10,24,.3)),linear-gradient(165deg,var(--sky-a),var(--sky-b));box-shadow:var(--hb-elev-1);animation:wx-in 600ms var(--hb-ease-out,ease-out) both}
.wx-sky{position:absolute;inset:0;z-index:-1;pointer-events:none;overflow:hidden}
.wx-sky::after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,rgba(4,10,24,.14),transparent 70%)}
@keyframes wx-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
.wx-hero-main{display:flex;flex-direction:column;min-width:0}
.wx-hero-k{margin:0;display:flex;align-items:center;gap:8px;font-size:14px;font-weight:550;color:var(--wx-ink)}
.wx-hero-now{display:flex;align-items:center;gap:16px;margin:4px 0 0}
.wx-hero-t{font-variant-numeric:tabular-nums;font-feature-settings:"tnum","cv11";font-size:96px;font-weight:650;letter-spacing:-.045em;line-height:1.15;white-space:nowrap}
.wx-hero-u{font-size:30px;font-weight:500;letter-spacing:-.01em;margin-left:4px;vertical-align:top;line-height:2.15;color:var(--wx-ink2)}
.wx-ic.wx-ic--hero{width:84px;height:84px;color:var(--wx-ink);--hb-icon-stroke:var(--hb-icon-stroke-lg,2.5px)}
.wx-hero .wx-ic-sun{color:var(--wx-sun);stroke:var(--wx-sun)}.wx-hero .wx-ic-rain{stroke:var(--wx-drop)}.wx-hero .wx-ic-moon{stroke:var(--wx-moon)}.wx-hero .wx-ic-bolt{stroke:var(--wx-sun)}
.wx-hero-s{margin:2px 0 0;font-size:21px;font-weight:500;line-height:1.35;letter-spacing:-.012em;max-width:46ch;text-wrap:pretty}
.wx-hero-meta{list-style:none;margin:12px 0 0;padding:0;display:flex;flex-wrap:wrap;gap:6px 20px;font-size:15px;color:var(--wx-ink2)}
.wx-hero-meta b{color:var(--wx-ink);font-weight:600}
.wx-hero-src{margin:auto 0 0;padding-top:16px;font-size:13px;color:var(--wx-ink3)}
.wx-hero .wx-dot--ok{background:#4ade80}.wx-hero .wx-dot--warn{background:#fbbf24}.wx-hero .wx-dot--crit{background:#f87171}
.wx-hw{align-self:start;display:flex;flex-direction:column;gap:10px;padding:16px 18px;border-radius:var(--hb-radius-lg,20px);background:var(--wx-glass);box-shadow:inset 0 0 0 1px var(--wx-glass-edge);color:var(--wx-ink);font-size:14px;min-width:0}
.wx-hw[data-level]{--wx-sev:245,165,36;background:linear-gradient(160deg,rgba(var(--wx-sev),.34),var(--wx-glass2) 62%);box-shadow:inset 0 0 0 1px rgba(var(--wx-sev),.5)}
.wx-hw[data-level='2']{--wx-sev:251,140,60}.wx-hw[data-level='3'],.wx-hw[data-level='4']{--wx-sev:242,85,90}
.wx-hw--ok{flex-direction:row;align-items:center;flex-wrap:wrap;gap:8px 10px;align-self:start;justify-self:end;padding:10px 14px;border-radius:999px}
.wx-hw .hb-pill[data-variant='soft']{background:var(--wx-pill);color:var(--wx-ink)}.wx-hw .hb-pill[data-tone='ok'] .hb-dot{background:#4ade80}
.wx-hw-item{display:flex;flex-direction:column;gap:3px;min-width:0}
.wx-hw-item + .wx-hw-item{padding-top:10px;border-top:1px solid var(--wx-line)}
.wx-hw-h{display:flex;align-items:center;gap:8px;margin-bottom:4px}
.wx-hw-sub{font-size:13px;color:var(--wx-ink3)}
.wx-hw-e{font-size:19px;font-weight:600;letter-spacing:-.012em;line-height:1.25}
.wx-hw-t{font-size:13px;color:var(--wx-ink2)}
.wx-hw-d{margin:6px 0 0;line-height:1.45;color:var(--wx-ink2);display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.wx-hw-more summary{cursor:pointer;font-size:13px;font-weight:600;color:var(--wx-ink);list-style:none;display:inline-flex;align-items:center;gap:8px;margin-top:4px;min-height:28px}
.wx-hw-more summary::-webkit-details-marker{display:none}
.wx-hw-more summary::after{content:"";width:6px;height:6px;border-right:1.75px solid currentColor;border-bottom:1.75px solid currentColor;transform:translateY(-2px) rotate(45deg);transition:transform var(--hb-dur-base,200ms) var(--hb-ease-out,ease-out)}
.wx-hw-more[open] summary::after{transform:translateY(1px) rotate(225deg)}
.wx-hw-more summary:focus-visible{outline:2px solid var(--wx-ink);outline-offset:2px;border-radius:4px}
.wx-hw-more p{margin:4px 0 0;line-height:1.45;color:var(--wx-ink2)}
.wx-hw-track{position:relative;height:6px;border-radius:3px;background:var(--wx-line)}
.wx-hw-seg{position:absolute;top:0;bottom:0;border-radius:3px;background:var(--hb-warn)}
.wx-hw-seg[data-level='2']{background:var(--hb-severe)}.wx-hw-seg[data-level='3'],.wx-hw-seg[data-level='4']{background:var(--hb-crit)}
.wx-hw-tlx{display:flex;justify-content:space-between;font-size:12px;color:var(--wx-ink3);margin-top:6px}
.wx-hw-foot{margin:0;font-size:12px;color:var(--wx-ink3)}.wx-hw-foot a{color:var(--wx-ink);white-space:nowrap}
/* ---- station sparkline ---- */
.wx-spark{position:relative;flex:1 0 auto;height:124px;max-height:168px;margin:4px 0 14px}
.wx-spark svg{position:absolute;left:0;right:0;top:0;width:100%;height:calc(100% - 18px);overflow:visible}
.wx-spark-l{fill:none;stroke:var(--hb-weather-measured);stroke-width:2.4;vector-effect:non-scaling-stroke;stroke-linecap:round}
.wx-spark-dot{position:absolute;width:10px;height:10px;margin:-5px 0 0 -5px;border-radius:50%;background:var(--hb-weather-measured);box-shadow:0 0 0 3px var(--hb-s1)}
.wx-spark-m{position:absolute;transform:translate(-50%,calc(-100% - 9px));font-size:13px;color:var(--hb-t2);white-space:nowrap;line-height:1}.wx-spark-m.down{transform:translate(-50%,8px)}.wx-spark-m b{color:var(--hb-t1);font-weight:600}
.wx-hours{list-style:none;display:flex;gap:4px;margin:20px 0 0;padding:12px 0 0;border-top:1px solid var(--wx-line);overflow-x:auto;scrollbar-width:none;-webkit-mask-image:linear-gradient(90deg,#000 calc(100% - 40px),transparent);mask-image:linear-gradient(90deg,#000 calc(100% - 40px),transparent)}
.wx-hours li{flex:1 0 50px;display:flex;flex-direction:column;align-items:center;gap:6px;font-size:13px;color:var(--wx-ink3)}
.wx-hours li:first-child{color:var(--wx-ink);font-weight:600}
.wx-hours .wx-ic{width:26px;height:26px;color:var(--wx-ink2)}
.wx-hours b{font-size:16px;font-weight:600;color:var(--wx-ink)}
.wx-hours-p{min-height:15px;font-size:12px;color:var(--wx-ink4);font-weight:500}.wx-hours-p.on{color:var(--wx-pop);font-weight:700}
.wx-spark-x{position:absolute;left:0;right:0;bottom:0;display:flex;justify-content:space-between;font-size:12px;color:var(--hb-t2);line-height:1}
/* ---- models chart: smooth curves, legend toggles, tooltip ---- */
.wx-chart{touch-action:pan-y;cursor:crosshair;-webkit-user-select:none;user-select:none}
.wx-future{fill:var(--hb-t1);opacity:.025}
.wx-band{fill:var(--hb-ac);opacity:.14}[data-theme='light'] .wx-band{opacity:.1}
.wx-line{fill:none;stroke-width:1.25;opacity:.24;vector-effect:non-scaling-stroke;stroke-linejoin:round;stroke-linecap:round}
.wx-line.is-hi{stroke-width:2.4;opacity:1}
.wx-line--blend{stroke:var(--hb-ac);stroke-width:3.6;opacity:1}
.wx-line--obs{stroke:var(--hb-weather-measured);stroke-width:2.4;opacity:1}
.wx-line--temp{stroke:var(--hb-weather-temp);stroke-width:2.2;opacity:1}
.wx-tip-guide{position:absolute;top:0;bottom:0;width:1px;margin-left:-.5px;background:linear-gradient(var(--hb-t2),color-mix(in srgb,var(--hb-t2) 10%,transparent));pointer-events:none}
.wx-tip-dot{position:absolute;width:9px;height:9px;margin:-4.5px 0 0 -4.5px;border-radius:50%;box-shadow:0 0 0 2px var(--hb-s1);pointer-events:none}
.wx-tip{position:absolute;top:6px;z-index:3;margin-left:14px;min-width:160px;padding:10px 12px;border-radius:12px;background:color-mix(in srgb,var(--hb-s1) 90%,transparent);-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);box-shadow:var(--hb-elev-2),inset 0 0 0 1px var(--hb-edge,var(--hb-b1));font-size:13px;display:flex;flex-direction:column;gap:4px;pointer-events:none;animation:wx-fade 140ms var(--hb-ease-out,ease-out) both}
.wx-tip--l{margin-left:0;transform:translateX(calc(-100% - 14px))}
@keyframes wx-fade{from{opacity:0}to{opacity:1}}
.wx-tip b{font-weight:600;margin-bottom:2px}
.wx-tip-r{display:flex;align-items:center;gap:8px;color:var(--hb-t2);white-space:nowrap}
.wx-tip-r i{width:8px;height:8px;border-radius:50%;flex:none}
.wx-tip-r em{margin-left:auto;padding-left:14px;font-style:normal;font-weight:600;color:var(--hb-t1)}
.wx-legend{display:flex;flex-direction:column;gap:12px;margin:16px 0 0;font-size:13px;color:var(--hb-t2)}
.wx-lg-key{display:flex;flex-wrap:wrap;gap:6px 18px;align-items:center}
.wx-lg-models{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.wx-lg{display:inline-flex;align-items:center;gap:8px;white-space:nowrap}
.wx-lg-btn,.wx-lg-all{font:inherit;font-size:13px;display:inline-flex;align-items:center;gap:6px;min-height:30px;padding:4px 11px;border:0;border-radius:999px;cursor:pointer;color:var(--hb-t2);background:transparent;box-shadow:inset 0 0 0 1px var(--hb-edge,var(--hb-b1));white-space:nowrap;transition:background-color var(--hb-dur-base,200ms) var(--hb-ease-out,ease-out),color var(--hb-dur-base,200ms) var(--hb-ease-out,ease-out)}
.wx-lg-btn i{width:8px;height:8px;border-radius:50%;box-shadow:inset 0 0 0 1.75px var(--c)}
.wx-lg-btn[aria-pressed='true']{color:var(--hb-t1);font-weight:500;background:var(--hb-fill,var(--hb-s2));box-shadow:none}
.wx-lg-btn[aria-pressed='true'].is-hi{background:color-mix(in srgb,var(--c) 16%,var(--hb-s1));box-shadow:inset 0 0 0 1.5px var(--c);font-weight:600}
.wx-lg-best{font-size:12px;font-weight:650;line-height:1;color:var(--wx-best-ink)}
.wx-lg-btn[aria-pressed='true'] i{background:var(--c);box-shadow:none}
.wx-lg-w{color:var(--hb-t2);font-size:12px;font-weight:500}
.wx-lg-all{color:var(--hb-ac);box-shadow:none;font-weight:600}
.wx-lg-btn:focus-visible,.wx-lg-all:focus-visible{outline:2px solid var(--hb-ac);outline-offset:1px}
.wx-sw{display:inline-block;width:14px;height:3px;border-radius:2px;background:currentColor}
.wx-sw--blend{background:var(--hb-ac);height:4px}.wx-sw--obs{background:var(--hb-weather-measured)}.wx-sw--band{background:color-mix(in srgb,var(--hb-ac) 28%,transparent);height:10px}
/* ---- r2: light theme gets a bright day sky + dark ink (twilight / night stay dark) ---- */
[data-theme='light'] .wx-hero[data-wx-bright]{--wx-ink:#0c1a2e;--wx-ink2:rgba(12,26,46,.84);--wx-ink3:rgba(12,26,46,.86);--wx-ink4:rgba(12,26,46,.76);--wx-line:rgba(12,26,46,.12);--wx-glass:rgba(255,255,255,.66);--wx-glass2:rgba(255,255,255,.72);--wx-glass-edge:rgba(12,26,46,.08);--wx-pill:rgba(255,255,255,.7);--wx-sun:#e39a0b;--wx-drop:#1f6fc4;--wx-moon:#44506a;--wx-pop:#0b4386;background:linear-gradient(rgba(255,255,255,.22),rgba(255,255,255,.22)),linear-gradient(165deg,var(--sky-la),var(--sky-lb));box-shadow:var(--hb-elev-1),inset 0 0 0 1px rgba(12,26,46,.06)}
[data-theme='light'] .wx-hero[data-wx-bright] .wx-sky::after{background:linear-gradient(90deg,rgba(255,255,255,.22),rgba(255,255,255,0) 70%)}
[data-theme='light'] .wx-hero[data-wx-bright] .wx-ic--hero{filter:none}
@media (prefers-color-scheme:light){
  [data-theme='system'] .wx-hero[data-wx-bright]{--wx-ink:#0c1a2e;--wx-ink2:rgba(12,26,46,.84);--wx-ink3:rgba(12,26,46,.86);--wx-ink4:rgba(12,26,46,.76);--wx-line:rgba(12,26,46,.12);--wx-glass:rgba(255,255,255,.66);--wx-glass2:rgba(255,255,255,.72);--wx-glass-edge:rgba(12,26,46,.08);--wx-pill:rgba(255,255,255,.7);--wx-sun:#e39a0b;--wx-drop:#1f6fc4;--wx-moon:#44506a;--wx-pop:#0b4386;background:linear-gradient(rgba(255,255,255,.22),rgba(255,255,255,.22)),linear-gradient(165deg,var(--sky-la),var(--sky-lb));box-shadow:var(--hb-elev-1),inset 0 0 0 1px rgba(12,26,46,.06)}
  [data-theme='system'] .wx-hero[data-wx-bright] .wx-sky::after{background:linear-gradient(90deg,rgba(255,255,255,.22),rgba(255,255,255,0) 70%)}
}
[data-theme='light'] .wx-hero[data-wx-bright] .wx-hw[data-level]{background:linear-gradient(160deg,rgba(var(--wx-sev),.3),rgba(255,255,255,.62) 62%);box-shadow:inset 0 0 0 1px rgba(var(--wx-sev),.5)}
@media (prefers-color-scheme:light){[data-theme='system'] .wx-hero[data-wx-bright] .wx-hw[data-level]{background:linear-gradient(160deg,rgba(var(--wx-sev),.3),rgba(255,255,255,.62) 62%);box-shadow:inset 0 0 0 1px rgba(var(--wx-sev),.5)}}
/* ---- r2: compact station curve with inline extremes + now ---- */
.wx-spark-m em{font-style:normal;color:var(--hb-t3);margin-left:2px}
.wx-spark-now{position:absolute;right:10px;transform:translateY(calc(-100% - 8px));font-size:15px;line-height:1;white-space:nowrap}
.wx-spark-now b{font-weight:650;color:var(--hb-t1)}
/* ---- r3: direct end labels on the models chart ---- */
.wx-endlab{position:absolute;left:100%;transform:translate(6px,-50%);font-size:12px;font-weight:650;line-height:1;white-space:nowrap;color:var(--hb-t1);display:inline-flex;align-items:center;gap:6px;pointer-events:none}
.wx-endlab::before{content:"";width:8px;height:3px;border-radius:2px;background:var(--c)}
.wx-endlab.is-blend::before{height:4px}
.wx-enddot{position:absolute;width:7px;height:7px;margin:-3.5px 0 0 -3.5px;border-radius:50%;box-shadow:0 0 0 2px var(--hb-s1);pointer-events:none}
/* ---- r2: model accuracy as a ranked list with soft bars ---- */
.wx-rank{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:2px}
.wx-rank-i{display:grid;grid-template-columns:24px auto minmax(0,1fr) auto;grid-template-areas:'n name sub val' 'n bar bar bar';column-gap:12px;row-gap:7px;align-items:center;padding:8px 10px;border-radius:var(--hb-radius-sm,12px)}
.wx-rank-i.is-blend{background:color-mix(in srgb,var(--hb-ac) 9%,transparent)}
.wx-rank-n{grid-area:n;width:24px;height:24px;border-radius:50%;display:grid;place-items:center;font-size:12px;font-weight:650;color:var(--hb-t2);background:color-mix(in srgb,var(--hb-t1) 7%,transparent)}
.is-blend .wx-rank-n{background:#2563eb;color:#fff}
.wx-rank-name{grid-area:name;display:flex;align-items:center;gap:8px;font-size:14px;font-weight:550;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wx-rank-name i{width:8px;height:8px;border-radius:50%;background:var(--c);flex:none}
.wx-rank-v{grid-area:val;font-size:16px;font-weight:650;letter-spacing:-.01em;text-align:right}
.wx-rank-bar{grid-area:bar;height:6px;border-radius:999px;background:color-mix(in srgb,var(--hb-t1) 7%,transparent);overflow:hidden}
.wx-rank-bar i{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,color-mix(in srgb,var(--c) 45%,transparent),var(--c));transform-origin:left;animation:wx-grow 700ms var(--hb-ease-out,ease-out) both}
@keyframes wx-grow{from{transform:scaleX(0)}to{transform:none}}
.wx-rank-sub{grid-area:sub;font-size:12px;color:var(--hb-t2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.wx-rank-k{margin:8px 0 0 10px;font-size:12px;color:var(--hb-t2)}
.wx-score .wx-info{margin-top:auto}.wx-score .wx-rank-k{margin-bottom:12px}
/* ---- r2: 48 h hourly strip ---- */
.wx-hs-key{display:flex;flex-wrap:wrap;gap:4px 16px;font-size:12px;color:var(--hb-t2)}
.wx-hs-key>span{display:inline-flex;align-items:center;gap:6px;white-space:nowrap}
.wx-sw--temp{background:var(--hb-weather-temp)}.wx-sw--rain{background:var(--hb-weather-rain);width:6px;height:10px;border-radius:2px}
.wx-hs{position:relative;display:grid;grid-template-columns:repeat(var(--wx-cols),minmax(46px,1fr));min-width:calc(var(--wx-cols) * 46px)}
.wx-hs>*{grid-row:1}
.wx-hs-day{align-self:stretch;box-shadow:inset 1px 0 0 color-mix(in srgb,var(--hb-t1) 12%,transparent)}
.wx-hs-now{align-self:stretch;margin:0 2px;border-radius:14px;background:color-mix(in srgb,var(--hb-ac) 9%,transparent)}
.wx-hs-col{position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;padding:8px 0 6px;min-width:0}
.wx-hs-h{height:20px;font-size:13px;font-weight:500;color:var(--hb-t2);white-space:nowrap;line-height:20px}
.wx-hs-h.is-day,.wx-hs-h.is-now{color:var(--hb-t1);font-weight:650}
.wx-hs-i{height:34px;display:grid;place-items:center}.wx-hs-i .wx-ic{width:24px;height:24px}
.wx-hs-tgap{height:88px;flex:none}
.wx-hs-rain{height:44px;width:100%;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:3px;box-shadow:inset 0 -1px 0 color-mix(in srgb,var(--hb-t1) 10%,transparent)}
.wx-hs-rain em{font-style:normal;font-size:12px;font-weight:650;color:var(--wx-rain-ink);line-height:1}
.wx-hs-rain i{display:block;width:18px;border-radius:6px 6px 2px 2px;background:linear-gradient(180deg,var(--hb-weather-rain),color-mix(in srgb,var(--hb-weather-rain) 45%,transparent))}
.wx-hs-p{height:20px;margin-top:4px;font-size:12px;font-weight:500;color:var(--hb-t3);white-space:nowrap;line-height:20px}.wx-hs-p.on{color:var(--wx-rain-ink);font-weight:650}
.wx-hs-w{height:20px;font-size:12px;color:var(--hb-t2);white-space:nowrap;line-height:20px}.wx-hs-w small{font-size:inherit;color:var(--hb-t3)}.wx-hs-w.wx-warnc,.wx-hs-w.wx-warnc small{color:var(--hb-warn);font-weight:650}
.wx-hs-temp{position:absolute;left:0;right:0;top:104px;height:88px;z-index:2;pointer-events:none}
.wx-hs-temp svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
.wx-hs-band{fill:var(--hb-weather-temp);opacity:.1}
.wx-hs-tv{height:24px;line-height:24px;font-size:15px;font-weight:600;white-space:nowrap}
.wx-hs-dn{align-self:flex-start;height:18px;padding-left:8px;font-size:12px;font-weight:650;line-height:18px;color:var(--hb-t1);white-space:nowrap;overflow:visible;width:0}
.wx-hs-pt{position:absolute;width:8px;height:8px;margin:-4px 0 0 -4px;border-radius:50%;background:var(--hb-s1);box-shadow:0 0 0 2.5px var(--hb-weather-temp)}
@media (prefers-reduced-motion:reduce){.wx-rank-bar i{animation:none}}
@media (max-width:760px){.wx-rank-i{grid-template-columns:24px minmax(0,1fr) auto;grid-template-areas:'n name val' 'n sub sub' 'n bar bar';row-gap:5px}}
@media (prefers-reduced-motion:reduce){.wx-hero,.wx-tip{animation:none}}
@media (max-width:1180px){.wx-hero{grid-template-columns:minmax(0,1fr) minmax(260px,340px)}}
@media (max-width:900px){.wx-hero{grid-template-columns:1fr;gap:18px}.wx-hw--ok{justify-self:start}}
@media (max-width:760px){
  .wx-hero{padding:20px 20px 18px;border-radius:var(--hb-radius-lg,20px)}
  .wx-hero-t{font-size:76px}.wx-hero-now{margin-top:0}.wx-hours li{flex:0 0 52px}.wx-hw-d{-webkit-line-clamp:2}.wx-hero-meta li:nth-child(3){display:none}.wx-hero-u{font-size:24px}.wx-ic.wx-ic--hero{width:54px;height:54px}
  .wx-hero-s{font-size:18px}.wx-hero-meta{font-size:14px;gap:4px 14px}
  .wx-chart{margin-right:76px}.wx-xlabs{margin-right:76px}
  .wx-models .wx-xl-noon{display:none}
  .wx-hours-p,.wx-hero-src,.wx-hw-foot,.wx-hw-tlx,.wx-spark-x,.wx-hs-w,.wx-hs-key,.wx-foot,.wx-rank-k,.wx-attr,.wx-xlabs span,.wx-ylab,.wx-lg-w{font-size:13px}
}
.hb-shell[data-narrow='true'] .wx,.hb-shell[data-layout-mobile='true'] .wx{padding-bottom:calc(var(--hb-tabbar-height,72px) + env(safe-area-inset-bottom,0px) + 24px)}
/* Sticky bottom tab bar: keep scrolled-to controls (radar scrubber + time labels) above it. */
.hb-shell[data-narrow='true'] .wx *,.hb-shell[data-layout-mobile='true'] .wx *{scroll-margin-bottom:calc(var(--hb-tabbar-height,72px) + env(safe-area-inset-bottom,0px) + 24px)}
`;

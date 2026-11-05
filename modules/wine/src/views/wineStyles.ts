import { addStyles } from './addStyles.js';

/**
 * Vinotéka styles – HomeBrain look (--hb-* tokens, HomeBrain accent, round-2 card style).
 * Composition follows the owner-approved donor design; only rating stars use gold (WIN-026).
 */
export const wineStyles =
  `
.wine-root{--wine-gold:#f5b731;--wine-red:#c84b63;--wine-white:#d8c46a;--wine-rose:#e58ea0;--wine-orange:#d98a3d;--wine-detail-w:360px;--wine-top:calc(var(--hb-topbar-height,56px) + var(--hb-sp-4));display:flex;flex-direction:column;gap:var(--hb-sp-4);color:var(--hb-t1);font-size:var(--hb-font-body);min-width:0}
[data-theme='light'] .wine-root{--wine-gold:#a15c00;--wine-red:#a3324a;--wine-white:#8f7a14;--wine-rose:#c0506a;--wine-orange:#a85a12}
.wine-root *{box-sizing:border-box}
.wine-root button,.wine-root input,.wine-root select,.wine-root textarea{font:inherit;color:inherit}
.wine-root :focus-visible{outline:2px solid var(--hb-ac);outline-offset:2px}
.wine-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.wine-h1{margin:0;font-size:var(--hb-font-xl);font-weight:var(--hb-font-display-weight,600)}
.wine-h2{margin:0;font-size:var(--hb-font-lg);font-weight:600;letter-spacing:-.01em;line-height:1.25}
.wine-h3{margin:var(--hb-sp-2) 0 0;font-size:var(--hb-font-body);font-weight:600}
.wine-sub{color:var(--hb-t2);font-size:var(--hb-font-sm);margin:0}
.wine-muted{color:var(--hb-t3);font-size:var(--hb-font-sm)}
.wine-fine{margin:0}
.wine-lbl{display:block;color:var(--hb-t3);font-size:max(12px,var(--hb-font-micro,11px));text-transform:var(--hb-font-micro-transform,uppercase);letter-spacing:var(--hb-font-micro-spacing,.06em);font-weight:var(--hb-font-micro-weight,600)}
.wine-ico{flex:none}
/* sub-nav */
.wine-subnav{display:flex;gap:4px;padding:4px;border:1px solid var(--hb-b1);border-radius:var(--hb-radius-pill,999px);background:var(--hb-s1);width:max-content;max-width:100%;overflow-x:auto;scrollbar-width:none}
.wine-subnav-i{flex:none;min-height:40px;padding:0 var(--hb-sp-4);border:0;border-radius:var(--hb-radius-pill,999px);background:none;color:var(--hb-t2);cursor:pointer;font-weight:500;font-size:var(--hb-font-sm);white-space:nowrap}
.wine-subnav-i:hover{color:var(--hb-t1);background:var(--hb-s2)}
.wine-subnav-i[aria-current=page]{background:var(--hb-ac-s);color:var(--hb-ac);font-weight:600}
/* layout */
.wine-layout{display:grid;grid-template-columns:minmax(0,1fr);gap:var(--hb-sp-4);align-items:start}
.wine-root[data-detail=open] .wine-layout{grid-template-columns:minmax(0,1fr) var(--wine-detail-w)}
.wine-maincol{display:flex;flex-direction:column;gap:var(--hb-sp-4);min-width:0;container-type:inline-size}
.wine-toolbar{display:flex;gap:var(--hb-sp-2);align-items:center}
.wine-search{flex:1 1 auto;min-width:0;position:relative;display:flex;align-items:center}
.wine-search .wine-ico{position:absolute;left:14px;color:var(--hb-t3);pointer-events:none}
.wine-search input{width:100%;min-height:44px;padding:0 var(--hb-sp-3) 0 44px;border-radius:var(--hb-radius-chip,10px);border:1px solid var(--hb-b1);background:var(--hb-s1)}
.wine-root select,.wine-field input,.wine-field textarea{min-height:40px;padding:0 var(--hb-sp-3);border-radius:var(--hb-radius-chip,10px);border:1px solid var(--hb-b2,var(--hb-b1));background:var(--hb-s2)}
.wine-field textarea{padding:var(--hb-sp-2) var(--hb-sp-3);font-family:var(--hb-font-mono,ui-monospace,monospace);font-size:var(--hb-font-sm);resize:vertical}
.wine-iconbtn{display:inline-grid;place-items:center;width:44px;height:44px;flex:none;border:0;border-radius:var(--hb-radius-chip,10px);background:none;color:var(--hb-t2);cursor:pointer;position:relative}
.wine-iconbtn:hover{color:var(--hb-t1);background:var(--hb-s2)}
.wine-iconbtn--box{border:1px solid var(--hb-b1);background:var(--hb-s1)}
.wine-iconbtn[aria-pressed=true],.wine-iconbtn[aria-expanded=true]{color:var(--hb-ac);border-color:var(--hb-ac)}
.wine-badge{position:absolute;top:-6px;right:-6px;min-width:20px;height:20px;padding:0 5px;border-radius:10px;background:var(--hb-ac);color:#fff;font-size:12px;font-weight:700;line-height:20px;text-align:center}
.wine-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;padding:0 var(--hb-sp-4);border-radius:var(--hb-radius-chip,10px);border:1px solid var(--hb-b2,var(--hb-b1));background:var(--hb-s2);cursor:pointer;font-weight:600;font-size:var(--hb-font-sm);white-space:nowrap}
.wine-btn:hover{border-color:var(--hb-t3)}
.wine-btn--primary{background:var(--hb-ac);border-color:var(--hb-ac);color:#fff!important}
.wine-btn--primary:hover{border-color:var(--hb-ac);filter:brightness(1.08)}
.wine-btn--ghost{background:none}
.wine-btn:disabled{opacity:.5;cursor:default}
.wine-link{border:0;background:none;color:var(--hb-ac);cursor:pointer;min-height:36px;padding:0 4px;font-weight:600;font-size:var(--hb-font-sm)}
/* overview */
.wine-overview{display:flex;flex-direction:column;gap:var(--hb-sp-3)}
.wine-ov-grid{display:flex;flex-direction:column;gap:var(--hb-sp-3)}
.wine-metrics{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(4,minmax(0,1fr)) minmax(0,1.3fr);gap:var(--hb-sp-3)}
.wine-metric{display:flex;align-items:center;gap:var(--hb-sp-3);min-height:88px;padding:var(--hb-sp-3) var(--hb-sp-4);border:1px solid var(--hb-b1);border-radius:var(--hb-radius-card);background:var(--hb-s1);box-shadow:var(--hb-card-shadow);min-width:0}
.wine-metric{--tone:var(--hb-ac)}
.wine-metric[data-tone=red]{--tone:var(--wine-red)}.wine-metric[data-tone=white]{--tone:var(--wine-white)}.wine-metric[data-tone=rose]{--tone:var(--wine-rose)}
.wine-metric-ico{display:grid;place-items:center;width:40px;height:40px;flex:none;border-radius:50%;color:var(--tone);background:color-mix(in srgb,var(--tone) 15%,transparent)}
.wine-metric-txt{display:flex;flex-direction:column;min-width:0}
.wine-metric-txt strong{font-size:26px;line-height:1.2;font-weight:600;font-variant-numeric:tabular-nums}
.wine-metric-txt span{color:var(--hb-t2);font-size:var(--hb-font-sm);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wine-metric-txt .wine-metric-sub{color:var(--hb-t2);font-size:13px;font-weight:500;white-space:nowrap}
.wine-metric--rating{flex-direction:column;align-items:flex-start;justify-content:center;gap:2px}
.wine-metric-lbl{color:var(--hb-t2);font-size:var(--hb-font-sm)}
.wine-metric-rv{display:flex;align-items:center;gap:var(--hb-sp-2)}
.wine-metric-rv strong{font-size:26px;line-height:1.2;font-weight:600;font-variant-numeric:tabular-nums}
.wine-metric-sub{color:var(--hb-t3);font-size:var(--hb-font-sm)}
.wine-starstrip{display:inline-flex;gap:1px;line-height:1}
.wine-starstrip-s{background:linear-gradient(90deg,var(--wine-gold) var(--fill),color-mix(in srgb,var(--hb-t3) 45%,transparent) var(--fill));-webkit-background-clip:text;background-clip:text;color:transparent}
.wine-cardstars{--star-fill:var(--wine-gold);--star-edge:var(--wine-gold);display:inline-flex;align-items:center;gap:3px;line-height:1}
[data-theme='light'] .wine-cardstars{--star-fill:#e9a516;--star-edge:#b77400}
.wine-cardstar{width:15px;height:15px;flex:none;overflow:visible}
.wine-cardstar-o{fill:none;stroke:color-mix(in srgb,var(--hb-t3) 85%,transparent);stroke-width:1.6;stroke-linejoin:round}
.wine-cardstar[data-kind=full] .wine-cardstar-o,.wine-cardstar[data-kind=half] .wine-cardstar-o{stroke:var(--star-edge)}
.wine-cardstar-f{fill:var(--star-fill);stroke:var(--star-edge);stroke-width:1.6;stroke-linejoin:round}
.wine-card-foot:has(.wine-cardstars){padding-top:10px}
.wine-card-body:has(.wine-cardstars) .wine-meta--prod{margin-bottom:6px}
.wine-stars{color:var(--wine-gold);font-variant-numeric:tabular-nums;font-weight:600;white-space:nowrap}
/* cooler */
.wine-cooler{display:grid;grid-template-columns:auto 1fr;gap:var(--hb-sp-2) var(--hb-sp-5);align-items:center;padding:var(--hb-sp-3) var(--hb-sp-4);border:1px solid var(--hb-b1);border-radius:var(--hb-radius-card);background:var(--hb-s1);box-shadow:var(--hb-card-shadow)}
.wine-cooler-head{display:flex;align-items:center;gap:var(--hb-sp-2);flex-wrap:wrap;color:var(--hb-t2)}
.wine-cooler-head strong{color:var(--hb-t1)}
.wine-cooler-state{display:inline-flex;align-items:center;gap:6px;font-size:var(--hb-font-sm);color:var(--hb-t2);--tone:var(--hb-t3)}
.wine-cooler-state[data-tone=ok]{--tone:var(--hb-ok);color:var(--hb-ok)}
.wine-cooler-state[data-tone=warn]{--tone:var(--hb-warn);color:var(--hb-warn)}
.wine-cooler-state[data-tone=crit]{--tone:var(--hb-crit);color:var(--hb-crit)}
.wine-dot{width:8px;height:8px;border-radius:50%;background:var(--tone)}
.wine-zones{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:var(--hb-sp-2) var(--hb-sp-5)}
.wine-zones li{display:grid;grid-template-columns:auto auto;gap:0 var(--hb-sp-2);align-items:baseline}
.wine-zones strong{font-size:20px;font-weight:600;font-variant-numeric:tabular-nums;grid-row:1}
.wine-zone-l{color:var(--hb-t2);font-size:var(--hb-font-sm);grid-row:1}
.wine-zone-m{grid-column:1/-1;color:var(--hb-t3);font-size:var(--hb-font-sm)}
.wine-zones li[data-tone=warn] strong{color:var(--hb-warn)}.wine-zones li[data-tone=crit] strong{color:var(--hb-crit)}
.wine-cooler-empty{display:flex;flex-direction:column;gap:2px;font-size:var(--hb-font-sm);color:var(--hb-t2)}
.wine-cooler-empty p{margin:0}
.wine-signals{grid-column:1/-1;list-style:none;margin:0;padding:var(--hb-sp-2) 0 0;border-top:1px solid var(--hb-b1);display:flex;flex-wrap:wrap;gap:var(--hb-sp-2)}
.wine-signals li{min-width:0;overflow:hidden;display:inline-flex;gap:6px;align-items:baseline;padding:4px 10px;border-radius:var(--hb-radius-pill,999px);background:color-mix(in srgb,var(--tone) 12%,transparent);font-size:var(--hb-font-sm);--tone:var(--hb-ac);max-width:100%}
.wine-signals li[data-tone=ok]{--tone:var(--hb-ok)}.wine-signals li[data-tone=warn]{--tone:var(--hb-warn)}.wine-signals li[data-tone=crit]{--tone:var(--hb-crit)}
.wine-signals li strong{color:var(--hb-t1);font-weight:600;white-space:nowrap}
.wine-signals li span{min-width:0;color:var(--hb-t2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:44ch}
/* catalog */
.wine-catalog{display:flex;flex-direction:column;gap:var(--hb-sp-3)}
.wine-cat-head{display:flex;align-items:baseline;gap:var(--hb-sp-3);flex-wrap:wrap}
.wine-count{margin:0;color:var(--hb-t3);font-size:var(--hb-font-sm)}
.wine-chiprow{display:flex;gap:var(--hb-sp-2);align-items:center;flex-wrap:wrap}
.wine-fchip{display:inline-flex;align-items:center;gap:6px;min-height:38px;padding:0 var(--hb-sp-3);border-radius:var(--hb-radius-chip,10px);border:1px solid var(--hb-b1);background:var(--hb-s1);color:var(--hb-t2);cursor:pointer;font-size:var(--hb-font-sm);white-space:nowrap}
.wine-fchip span{color:var(--hb-t3)}
.wine-fchip:hover{color:var(--hb-t1);border-color:var(--hb-b2)}
.wine-fchip[aria-pressed=true]{border-color:var(--hb-ac);color:var(--hb-ac);background:var(--hb-ac-s)}
.wine-sort{margin-left:auto;display:inline-flex;align-items:center;gap:var(--hb-sp-2);color:var(--hb-t3);font-size:var(--hb-font-sm)}
.wine-sort select{min-height:38px;background:var(--hb-s1);border-color:var(--hb-b1)}
.wine-grid{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(152px,1fr));gap:var(--hb-sp-3)}
.wine-root[data-section=catalog]:not([data-detail]) .wine-grid,.wine-root[data-section=mine]:not([data-detail]) .wine-grid,.wine-root[data-section=ratings]:not([data-detail]) .wine-grid{grid-template-columns:repeat(auto-fill,minmax(176px,1fr))}
.wine-cardwrap{position:relative;min-width:0;border-radius:var(--hb-radius-card)}
.wine-card{display:flex;flex-direction:column;width:100%;height:100%;text-align:left;padding:0;border-radius:var(--hb-radius-card);border:1px solid var(--hb-b1);background:var(--hb-s1);box-shadow:var(--hb-card-shadow);cursor:pointer;overflow:hidden;transition:border-color .15s}
.wine-card:hover{border-color:var(--hb-b2)}
.wine-cardwrap[aria-current=true] .wine-card{border-color:var(--hb-ac);box-shadow:0 0 0 1px var(--hb-ac),0 0 0 5px var(--hb-ac-s)}
/* Studio tile shared by vendor photos and the SVG fallback (same 3:4, contain); white in light theme, soft neutral in dark – the photo is multiplied onto it. */
.wine-root{--wine-tile:radial-gradient(90% 70% at 50% 42%,#c9c4bb,#aaa59c)}
[data-theme='light'] .wine-root{--wine-tile:#fff}
.wine-bottle-frame{display:block;flex:none;aspect-ratio:3/4;background:var(--wine-tile);isolation:isolate;overflow:hidden;border-radius:var(--hb-radius-nested,10px)}
.wine-bottle-frame>img,.wine-bottle-frame>svg{display:block;width:100%;height:100%;object-fit:contain}
.wine-bottle-frame>img{mix-blend-mode:multiply}
.wine-card-art{position:relative;display:grid;place-items:center;height:280px;padding:12px 0;background:var(--wine-tile)}
.wine-card-art{isolation:isolate}
/* one continuous tile per card: the inner frame is see-through, so the photo multiplies onto the card tile (no inner rectangle) */
.wine-card-art .wine-bottle-frame{height:256px!important;width:192px!important;border-radius:0;background:none;isolation:auto}
.wine-qty{position:absolute;left:10px;top:10px;font-size:13px;font-weight:700;font-variant-numeric:tabular-nums;padding:2px 8px;border-radius:var(--hb-radius-pill,999px);background:var(--hb-s2);border:1px solid var(--hb-b1);color:var(--hb-t1)}
.wine-cardwrap[data-empty] .wine-qty{color:var(--hb-crit);border-color:color-mix(in srgb,var(--hb-crit) 40%,transparent)}
.wine-cardwrap[data-empty] .wine-card-art{opacity:.55}
.wine-card-body{display:flex;flex-direction:column;gap:2px;padding:var(--hb-sp-2) var(--hb-sp-3) var(--hb-sp-3);min-width:0;flex:1}
.wine-name{font-size:15px;font-weight:600;line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;min-height:2.6em}
.wine-card-titles{display:flex;flex-direction:column;gap:1px;min-height:calc(15px * 1.3 * 2 + 13px * 1.3 + 1px);min-width:0}
.wine-card-titles .wine-name{min-height:0}
.wine-label{color:var(--hb-t2);font-size:13px;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wine-meta{color:var(--hb-t2);font-size:var(--hb-font-sm);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wine-meta--prod{color:var(--hb-t3)}
.wine-card-foot{display:flex;justify-content:space-between;align-items:center;gap:6px;margin-top:auto;padding-top:var(--hb-sp-2);border-top:1px solid var(--hb-b1);font-size:var(--hb-font-sm)}
.wine-card-foot .wine-muted{font-size:13px}
.wine-price{font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap}
.wine-heart{position:absolute;top:2px;right:2px;width:44px;height:44px;display:grid;place-items:center;border:0;background:none;border-radius:50%;color:#5b564e;cursor:pointer}
.wine-heart:hover{color:#26231f}
.wine-heart[aria-pressed=true]{color:var(--wine-red)}
.wine-heart[aria-pressed=true] path{fill:currentColor}
.wine-empty{display:flex;flex-direction:column;align-items:center;gap:var(--hb-sp-2);padding:var(--hb-sp-6,32px) var(--hb-sp-4);border:0;background:var(--hb-s1);border-radius:var(--hb-radius-card);text-align:center}
.wine-actions-row{display:flex;gap:var(--hb-sp-2);justify-content:flex-end;flex-wrap:wrap}
.wine-actions-row--center{justify-content:center}.wine-actions-row--start{justify-content:flex-start}
/* table */
.wine-table-wrap{overflow-x:auto;border:1px solid var(--hb-b1);border-radius:var(--hb-radius-card);background:var(--hb-s1)}
.wine-table{width:100%;border-collapse:collapse;font-size:var(--hb-font-sm)}
.wine-table th{text-align:left;color:var(--hb-t3);font-weight:600;padding:var(--hb-sp-2) var(--hb-sp-3);border-bottom:1px solid var(--hb-b1);white-space:nowrap}
.wine-table td{padding:6px var(--hb-sp-3);border-bottom:1px solid var(--hb-b1);white-space:nowrap}
.wine-table tr[aria-selected=true]{background:var(--hb-ac-s)}
.wine-pack-note{color:var(--hb-t3);font-size:var(--hb-font-xs,0.75rem)}
.wine-pack-note--warn{color:var(--hb-warn,#d98a00);font-weight:600}
.wine-table tr[data-error] td{color:var(--hb-crit)}
.wine-table .num{text-align:right;font-variant-numeric:tabular-nums;font-weight:700}
.wine-rowbtn{border:0;background:none;padding:4px 0;text-align:left;cursor:pointer;display:flex;flex-direction:column;min-height:40px}
.wine-swatch{display:inline-block;width:12px;height:12px;border-radius:50%;flex:none;vertical-align:middle}
.wine-swatch--white{background:#d8c46a}.wine-swatch--red{background:#8e2238}.wine-swatch--rose{background:#e58ea0}.wine-swatch--orange{background:#d98a3d}.wine-swatch--other{background:#8a8f98}
/* detail */
.wine-detail{position:sticky;top:var(--wine-top);max-height:calc(100dvh - var(--wine-top) - var(--hb-sp-4));display:flex;flex-direction:column;border:1px solid var(--hb-b1);border-radius:var(--hb-radius-card);background:var(--hb-s1);box-shadow:var(--hb-card-shadow);overflow:hidden;min-width:0}
.wine-detail-bar{display:none;align-items:center;gap:var(--hb-sp-2);padding:4px var(--hb-sp-2);border-bottom:1px solid var(--hb-b1)}
.wine-detail-bar-title{flex:1;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wine-root[data-section]:not([data-section=overview]) .wine-detail-bar{display:flex}
.wine-detail-scroll{overflow:auto;padding:var(--hb-sp-4);display:flex;flex-direction:column;gap:var(--hb-sp-4);flex:1;min-height:0}
.wine-detail-scroll>*,.wine-drawer-body>*,.wine-detail>*:not(.wine-detail-scroll),.wine-drawer>*:not(.wine-drawer-body){flex-shrink:0}
.wine-subnav-i,.wine-fchip,.wine-tab,.wine-tchip,.wine-btn,.wine-link,.wine-sort,.wine-sort select{font-size:14px}
[data-theme='light'] .wine-cooler-state[data-tone=warn],[data-theme='light'] .wine-zones li[data-tone=warn] strong{color:#985200}
[data-theme='light'] .wine-cooler-state[data-tone=crit],[data-theme='light'] .wine-zones li[data-tone=crit] strong{color:#b91c1c}
[data-theme='light'] .wine-cooler-state[data-tone=ok]{color:#047857}
.wine-hero{display:grid;grid-template-columns:128px minmax(0,1fr);grid-template-areas:"bottle text" "bottle meta";grid-template-rows:auto 1fr;gap:var(--hb-sp-2) var(--hb-sp-3);align-items:start}
.wine-hero-bottle{grid-area:bottle;width:128px;min-width:0;overflow:hidden}
.wine-hero-text{grid-area:text}
.wine-hero-meta{grid-area:meta;display:flex;flex-direction:column;gap:var(--hb-sp-2);min-width:0}
.wine-hero-bottle .wine-bottle-frame{width:120px!important;height:160px!important}
.wine-hero .wine-photo-find{line-height:1.25}
.wine-hero-bottle{display:flex;flex-direction:column;align-items:center;gap:var(--hb-sp-2);padding:var(--hb-sp-2) 0;border-radius:var(--hb-radius-nested,10px);background:radial-gradient(80% 60% at 50% 60%,color-mix(in srgb,var(--hb-t1) 8%,transparent),transparent 75%)}
.wine-hero-bottle .wine-bottle-frame{flex:none}
.wine-photo-find:not(:disabled){cursor:pointer;border-style:solid}
.wine-enrich-preview{display:flex;flex-direction:column;gap:var(--hb-sp-2);padding:var(--hb-sp-2) var(--hb-sp-3);border:1px solid var(--hb-b1);border-radius:var(--hb-radius-chip,10px)}
.wine-enrich-preview dl{display:grid;grid-template-columns:auto 1fr;gap:2px var(--hb-sp-2);margin:0;font-size:14px}
.wine-enrich-preview dt{color:var(--hb-t2)}
.wine-enrich-url{display:flex;flex-wrap:wrap;align-items:flex-end;gap:var(--hb-sp-2)}
.wine-enrich-url label{display:flex;flex-direction:column;gap:2px;flex:1 1 260px;min-width:0}
.wine-enrich-url input{min-height:40px;padding:0 var(--hb-sp-2);border:1px solid var(--hb-b1);border-radius:var(--hb-radius-sm,8px);background:var(--hb-s2);color:var(--hb-t1);font:inherit}
.wine-enrich-url p{flex-basis:100%;margin:0;font-size:13px}
.wine-check[data-ok]{color:var(--hb-ok,inherit)}
.wine-check:not([data-ok]){color:var(--hb-crit)}
.wine-desc{color:var(--hb-t2);font-size:14px;line-height:1.45;margin:0}
.wine-photo-find{flex:none;display:flex;flex-direction:row;flex-wrap:wrap;align-items:baseline;align-content:center;column-gap:6px;row-gap:0;width:100%;text-align:left;border:1px dashed var(--hb-b2);border-radius:var(--hb-radius-chip,10px);background:none;padding:4px 8px;font-size:13px;color:var(--hb-t2);cursor:not-allowed;min-height:44px;justify-content:flex-start}
.wine-photo-find{font-size:14px!important}
.wine-price-form{display:flex;flex-wrap:wrap;align-items:center;gap:var(--hb-sp-2)}
.wine-price-form input{width:9ch;min-height:40px;padding:0 var(--hb-sp-2);border:1px solid var(--hb-b1);border-radius:var(--hb-radius-sm,8px);background:var(--hb-s2);color:var(--hb-t1);font:inherit}
.wine-price-form [role=alert]{color:var(--hb-color-danger,#ef4444);font-size:14px}.wine-photo-find span{font-size:12px;color:var(--hb-t3)}
.wine-hero-text{display:flex;flex-direction:column;gap:var(--hb-sp-2);min-width:0}
.wine-hero-text h2{margin:0;font-size:22px;line-height:1.25;font-weight:600;letter-spacing:-.01em}
.wine-hero-titles{display:flex;flex-direction:column;gap:2px;min-width:0}
.wine-hero-label{margin:0;color:var(--hb-t2);font-size:15px;line-height:1.35;font-weight:450}
/* price history (detail only) */
.wine-pricecard{display:flex;flex-direction:column;gap:var(--hb-sp-2);padding:var(--hb-sp-3);border-radius:var(--hb-radius-nested,12px);background:linear-gradient(180deg,color-mix(in srgb,var(--hb-ac) 7%,var(--hb-s2)),var(--hb-s2));border:1px solid var(--hb-b1)}
.wine-pricecard-head{display:flex;flex-wrap:wrap;gap:var(--hb-sp-3) var(--hb-sp-4);justify-content:space-between;align-items:flex-start}
.wine-pricecard-kpi{display:flex;flex-direction:column;gap:2px;min-width:0}
.wine-pricecard-kpi--shop{text-align:right;align-items:flex-end}
.wine-pricecard-big{font-size:28px;line-height:1.15;font-weight:600;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.wine-pricecard-mid{display:inline-flex;align-items:center;gap:6px;font-size:18px;line-height:1.2;font-weight:600;font-variant-numeric:tabular-nums}
.wine-pricechip{font-size:12px;font-weight:600;padding:2px 7px;border-radius:999px;background:color-mix(in srgb,var(--hb-t1) 10%,transparent);color:var(--hb-t2)}
.wine-pricechip[data-trend=down]{background:color-mix(in srgb,#22c55e 18%,transparent);color:color-mix(in srgb,#22c55e 75%,var(--hb-t1))}
.wine-pricechip[data-trend=up]{background:color-mix(in srgb,#f97316 18%,transparent);color:color-mix(in srgb,#f97316 75%,var(--hb-t1))}
.wine-spark{position:relative;height:96px;margin:var(--hb-sp-2) 0 0;padding:0}
.wine-spark-plot{position:absolute;inset:22px 14px 4px 58px}
.wine-spark-grid{position:absolute;left:0;right:0;height:0;border-top:1px dashed color-mix(in srgb,var(--hb-t1) 12%,transparent)}
.wine-spark svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
.wine-spark-line{stroke:var(--hb-ac);stroke-width:2.25;stroke-linecap:round;stroke-linejoin:round}
.wine-spark-dot{position:absolute;width:10px;height:10px;margin:-5px 0 0 -5px;border-radius:50%;background:var(--hb-t1);box-shadow:0 0 0 3px var(--hb-s2),0 0 0 4px color-mix(in srgb,var(--hb-t1) 25%,transparent)}
.wine-spark-ax{position:absolute;left:0;width:50px;font-size:12px;color:var(--hb-t2);font-variant-numeric:tabular-nums;line-height:1;transform:translateY(-50%)}
.wine-spark-end{position:absolute;width:12px;height:12px;margin:-6px 0 0 -6px;border-radius:50%;background:var(--hb-ac);box-shadow:0 0 0 4px color-mix(in srgb,var(--hb-ac) 22%,transparent)}
.wine-spark-legend{position:absolute;top:0;right:0;display:flex;gap:12px;font-size:12px;color:var(--hb-t2);line-height:1}
.wine-spark-legend span{display:inline-flex;align-items:center;gap:4px}
.wine-spark-key{display:inline-block}
.wine-spark-key--line{width:14px;height:2px;border-radius:2px;background:var(--hb-ac)}
.wine-spark-key--dot{width:8px;height:8px;border-radius:50%;background:var(--hb-t1);box-shadow:0 0 0 2px color-mix(in srgb,var(--hb-t1) 25%,transparent)}
.wine-spark-dates{display:flex;justify-content:space-between;font-size:12px;color:var(--hb-t3);margin:4px 14px var(--hb-sp-2) 58px;letter-spacing:0;font-variant-numeric:tabular-nums}
.wine-lots{list-style:none;margin:0;padding:0;display:flex;flex-direction:column}
.wine-lots li{display:grid;grid-template-columns:minmax(0,1fr) auto auto auto;gap:var(--hb-sp-3);align-items:baseline;padding:8px 0;border-top:1px solid var(--hb-b1);font-size:14px}
.wine-lots li:first-child{border-top:0}
.wine-lots time{color:var(--hb-t2)}
.wine-lots strong{font-variant-numeric:tabular-nums;font-weight:600;text-align:right;min-width:7ch}
.wine-lots-qty{color:var(--hb-t2);font-variant-numeric:tabular-nums;text-align:right}
.wine-lots-ref{color:var(--hb-t3);font-size:13px}
.wine-hero-sub{margin:0;font-weight:500;color:var(--hb-t2)}
.wine-hero-prod{margin:0;color:var(--hb-t3);font-size:var(--hb-font-sm)}
.wine-scorebox,.wine-stockbox{display:flex;flex-direction:column;gap:2px;padding:var(--hb-sp-2) var(--hb-sp-3);border-radius:var(--hb-radius-nested,10px);background:var(--hb-s2)}
.wine-scorebox-v{display:flex;align-items:center;gap:var(--hb-sp-2)}
.wine-scorebox-v strong,.wine-stockbox strong{font-size:22px;font-weight:600;font-variant-numeric:tabular-nums}
.wine-stockbox[data-empty] strong{color:var(--hb-crit)}
.wine-myrating{display:flex;flex-direction:column;gap:var(--hb-sp-2)}
.wine-sec-title{font-weight:600;font-size:var(--hb-font-body)}
.wine-rate{display:flex;align-items:center;gap:2px;flex-wrap:wrap}
.wine-rate-star{width:44px;height:44px;border:0;border-radius:var(--hb-radius-chip,10px);background:none;cursor:pointer;font-size:28px;line-height:1;padding:0}
.wine-rate-star span{background:linear-gradient(90deg,var(--wine-gold) var(--fill),color-mix(in srgb,var(--hb-t3) 45%,transparent) var(--fill));-webkit-background-clip:text;background-clip:text;color:transparent}
.wine-rate-star:hover{background:var(--hb-s2)}
.wine-rate-clear{margin-left:var(--hb-sp-2)}
.wine-tabs{display:flex;gap:var(--hb-sp-4);border-bottom:1px solid var(--hb-b1);overflow-x:auto;scrollbar-width:none}
.wine-tab{flex:none;min-height:44px;border:0;background:none;padding:0 2px;color:var(--hb-t2);cursor:pointer;font-weight:500;font-size:var(--hb-font-sm);border-bottom:2px solid transparent;margin-bottom:-1px}
.wine-tab[aria-selected=true]{color:var(--hb-ac);border-bottom-color:var(--hb-ac);font-weight:600}
.wine-props{margin:0;display:flex;flex-direction:column}
.wine-props div{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.2fr);gap:var(--hb-sp-2);padding:7px 0;border-bottom:1px solid var(--hb-b1);font-size:var(--hb-font-sm)}
.wine-props div:last-child{border-bottom:0}
.wine-props dt{display:flex;align-items:center;gap:var(--hb-sp-2);color:var(--hb-t2)}
.wine-props dt .wine-ico{color:var(--hb-t3)}
.wine-props dd{margin:0;font-weight:600;text-align:right;overflow-wrap:anywhere}
.wine-about{display:flex;flex-direction:column;gap:var(--hb-sp-3)}
.wine-about>p{margin:0;color:var(--hb-t2);line-height:1.5}
.wine-tiles{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:1fr 1fr;gap:var(--hb-sp-2)}
.wine-tiles li{display:flex;gap:var(--hb-sp-2);align-items:flex-start;padding:var(--hb-sp-2) var(--hb-sp-3);border-radius:var(--hb-radius-nested,10px);background:var(--hb-s2);min-width:0}
.wine-tiles li .wine-ico{color:var(--hb-ac);margin-top:2px}
.wine-tiles strong{display:block;font-size:var(--hb-font-sm)}
.wine-history{display:flex;flex-direction:column;gap:var(--hb-sp-3)}
.wine-history ol{list-style:none;margin:0;padding:0}
.wine-history li{display:grid;grid-template-columns:auto auto 1fr;gap:2px var(--hb-sp-2);padding:6px 0;border-bottom:1px solid var(--hb-b1);font-size:var(--hb-font-sm);align-items:baseline}
.wine-history time{grid-column:1/-1;color:var(--hb-t3)}
.wine-ev-op{font-weight:600}.wine-ev-delta{font-variant-numeric:tabular-nums;font-weight:700}.wine-ev-reason{color:var(--hb-t2)}
.wine-correct{display:flex;flex-direction:column;gap:var(--hb-sp-2);padding:var(--hb-sp-3);border:1px dashed var(--hb-b2);border-radius:var(--hb-radius-nested,10px)}
.wine-field{display:flex;flex-direction:column;gap:6px;font-size:var(--hb-font-sm)}
.wine-actions{display:flex;flex-direction:column;gap:var(--hb-sp-2);padding:var(--hb-sp-3) var(--hb-sp-4);border-top:1px solid var(--hb-b1);background:var(--hb-s1)}
.wine-actions-main{display:flex;gap:var(--hb-sp-2)}
.wine-actions-main .wine-btn--primary{flex:1}
.wine-actions>.wine-btn{width:100%}
.wine-stepper{display:inline-flex;align-items:center;border:1px solid var(--hb-b1);border-radius:var(--hb-radius-chip,10px);background:var(--hb-s2)}
.wine-stepper button{width:40px;height:42px;border:0;background:none;font-size:20px;cursor:pointer}
.wine-stepper button:disabled{opacity:.35}
.wine-stepper output{min-width:20px;text-align:center;font-weight:700;font-variant-numeric:tabular-nums}
.wine-error{margin:0;padding:var(--hb-sp-2) var(--hb-sp-4);color:var(--hb-crit);font-size:var(--hb-font-sm)}
/* dialog */
.wine-dialog-backdrop{position:fixed;inset:0;z-index:90;display:grid;place-items:center;padding:var(--hb-sp-4);background:rgb(8 10 14 / 62%);backdrop-filter:blur(6px)}
.wine-dialog{width:min(420px,100%);padding:var(--hb-sp-5);border-radius:var(--hb-radius-card);background:var(--hb-s1);border:1px solid var(--hb-b2);box-shadow:0 20px 60px rgb(0 0 0 / 35%);text-align:center}
.wine-dialog-ico{display:inline-grid;place-items:center;width:96px;height:96px;border-radius:50%;background:var(--hb-ac-s);border:1px solid color-mix(in srgb,var(--hb-ac) 35%,transparent);margin-bottom:var(--hb-sp-3)}
.wine-dialog h3{margin:0 0 var(--hb-sp-2);font-size:var(--hb-font-lg)}
.wine-dialog p{margin:0 0 var(--hb-sp-4);color:var(--hb-t2)}
.wine-dialog .wine-actions-row{justify-content:center}
.wine-dialog .wine-btn{flex:1}
/* drawer / sheet */
.wine-drawer-backdrop{position:fixed;inset:0;z-index:80;background:rgb(8 10 14 / 45%);backdrop-filter:blur(2px)}
.wine-drawer{position:absolute;top:0;right:0;bottom:0;width:min(420px,100vw);display:flex;flex-direction:column;background:var(--hb-s1);border-left:1px solid var(--hb-b2);box-shadow:-20px 0 60px rgb(0 0 0 / 25%)}
.wine-grabber{display:none}
.wine-drawer-head{display:flex;align-items:center;gap:var(--hb-sp-2);padding:var(--hb-sp-3) var(--hb-sp-3) var(--hb-sp-3) var(--hb-sp-5);border-bottom:1px solid var(--hb-b1)}
.wine-drawer-head h2{margin:0;flex:1;font-size:var(--hb-font-lg);font-weight:600}
.wine-drawer-body{flex:1;overflow:auto;padding:var(--hb-sp-4) var(--hb-sp-5);display:flex;flex-direction:column;gap:var(--hb-sp-4);outline:0}
.wine-fgroup{border:0;margin:0;padding:0;min-width:0}
.wine-fgroup-l{padding:0;margin-bottom:var(--hb-sp-2);font-weight:600;font-size:var(--hb-font-sm);color:var(--hb-t1)}
.wine-fopts{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.wine-tchip{display:inline-flex;align-items:center;gap:6px;min-height:38px;padding:0 var(--hb-sp-3);border-radius:var(--hb-radius-pill,999px);border:1px solid var(--hb-b1);background:var(--hb-s2);cursor:pointer;font-size:var(--hb-font-sm);color:var(--hb-t2)}
.wine-tchip-n{min-width:20px;padding:1px 6px;border-radius:999px;background:color-mix(in srgb,currentColor 14%,transparent);font-size:13px;line-height:18px;text-align:center;font-variant-numeric:tabular-nums}
.wine-fsub{flex-basis:100%;display:flex;align-items:center;gap:8px;margin-top:2px;font-size:13px;font-weight:500;color:var(--hb-t2)}
.wine-fsub::after{content:'';flex:1;height:1px;background:var(--hb-b1)}
.wine-fhint{flex-basis:100%;margin:var(--hb-sp-1,4px) 0 0;font-size:13px;line-height:1.45;color:var(--hb-t2)}
.wine-tchip[aria-pressed=true]{border-color:var(--hb-ac);color:#fff;background:var(--hb-ac);font-weight:600}
.wine-empty-ico{display:grid;place-items:center;width:56px;height:56px;margin:0 auto;border-radius:50%;background:var(--hb-s2);color:var(--hb-t3)}
.wine-range{display:flex;gap:var(--hb-sp-2);align-items:center}.wine-range select{width:110px}
.wine-slider{display:flex;flex-direction:column;gap:6px;width:100%;font-size:var(--hb-font-sm);color:var(--hb-t2)}
.wine-slider input{width:100%;accent-color:var(--hb-ac);min-height:32px}
.wine-check{display:inline-flex;align-items:center;gap:8px;min-height:44px;font-size:var(--hb-font-sm);margin-left:var(--hb-sp-3)}
.wine-check input{width:20px;height:20px;accent-color:var(--hb-ac)}
.wine-drawer-foot{box-shadow:0 -10px 20px -12px rgb(0 0 0 / 35%);display:flex;gap:var(--hb-sp-2);padding:var(--hb-sp-3) var(--hb-sp-5) calc(var(--hb-sp-3) + env(safe-area-inset-bottom));border-top:1px solid var(--hb-b1)}
.wine-drawer-foot .wine-btn--primary{flex:1}
/* importer, placeholders */
.wine-import{display:flex;flex-direction:column;gap:var(--hb-sp-3);max-width:860px}
.wine-import-row{display:flex;gap:var(--hb-sp-3);align-items:flex-end;flex-wrap:wrap}
.wine-file input{position:absolute;width:1px;height:1px;opacity:0}
.wine-file{position:relative}
.wine-import-plan p{margin:0 0 var(--hb-sp-2)}
.wine-soon{display:flex;gap:var(--hb-sp-3);align-items:center;padding:var(--hb-sp-3) var(--hb-sp-4);border:1px dashed var(--hb-b2);border-radius:var(--hb-radius-card);background:var(--hb-s1)}
.wine-soon>.wine-ico{color:var(--hb-t3)}
.wine-soon>span:nth-child(2){display:flex;flex-direction:column;flex:1;min-width:0}
.wine-soon-tag{font-size:12px;font-weight:600;padding:2px 8px;border-radius:var(--hb-radius-pill,999px);background:var(--hb-s2);color:var(--hb-t2)}
.wine-placeholder{display:flex;flex-direction:column;gap:var(--hb-sp-3)}
@container (max-width:820px){
 .wine-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}
 .wine-metric--rating{grid-column:1/-1}
 .wine-cooler{grid-template-columns:1fr}
}
@media (prefers-reduced-motion:reduce){.wine-root *{transition:none!important;scroll-behavior:auto!important}}
@media (max-width:1180px){.wine-root{--wine-detail-w:330px}}
@media (max-width:900px){
 .wine-root[data-detail=open] .wine-layout{grid-template-columns:minmax(0,1fr)}
 .wine-detail{position:fixed;inset:0;z-index:70;max-height:none;border:0;border-radius:0;background:var(--hb-bg)}
 .wine-detail-bar,.wine-root[data-section] .wine-detail-bar{display:flex;padding-top:calc(4px + env(safe-area-inset-top))}
 .wine-detail-x{display:none}
 .wine-actions{flex-direction:row;padding-bottom:calc(var(--hb-sp-3) + env(safe-area-inset-bottom));box-shadow:0 -8px 24px rgb(0 0 0 / 18%)}
 .wine-actions{flex-wrap:wrap}
 .wine-actions-main{flex:1.4 1 auto}
 .wine-actions>.wine-btn{width:auto;flex:1 1 auto}
 .wine-drawer{top:auto;left:0;width:auto;max-height:88dvh;border-left:0;border-top:1px solid var(--hb-b2);border-radius:var(--hb-radius-card) var(--hb-radius-card) 0 0}
 .wine-grabber{display:block;width:40px;height:4px;border-radius:2px;background:var(--hb-b2);margin:8px auto 0}
}
@media (max-width:480px){
 .wine-hero{grid-template-columns:104px minmax(0,1fr);grid-template-areas:"bottle text" "meta meta";grid-template-rows:auto auto}
 .wine-hero-bottle{width:104px}
 .wine-hero-bottle .wine-bottle-frame{width:96px!important;height:128px!important}
 .wine-hero-meta{display:grid;grid-template-columns:auto minmax(0,1fr);align-items:stretch}
}
@media (max-width:600px){
 .wine-root{gap:var(--hb-sp-3);font-size:15px;padding-bottom:calc(var(--hb-tabbar-height,56px) + env(safe-area-inset-bottom) + 16px)}
 .wine-subnav{margin-inline:calc(-1 * var(--hb-sp-1))}
 .wine-subnav-i{font-size:15px;min-height:44px}
 .wine-overview>.wine-h2,.wine-metrics,.wine-signals,.wine-cooler-empty .wine-muted{display:none}
 .wine-cooler{padding:var(--hb-sp-2) var(--hb-sp-3);gap:4px}
 .wine-cooler-head{font-size:15px}
 .wine-zones{gap:2px var(--hb-sp-4)}
 .wine-zones strong{font-size:17px}
 .wine-zone-m{display:none}
 .wine-subnav,.wine-chiprow{-webkit-mask-image:linear-gradient(90deg,#000 88%,transparent);mask-image:linear-gradient(90deg,#000 88%,transparent)}
 .wine-chiprow{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none;margin-inline:calc(-1 * var(--hb-sp-1));padding-inline:var(--hb-sp-1)}
 .wine-fchip{font-size:15px;min-height:44px}
 .wine-sort{margin-left:0}
 .wine-sort span{display:none}
 .wine-grid,.wine-root[data-section] .wine-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--hb-sp-2)}
 .wine-card-art{height:212px;padding:12px 0}
 .wine-card-art .wine-bottle-frame{height:188px!important;width:141px!important}
 .wine-name{font-size:15px}
 .wine-meta,.wine-card-foot,.wine-card-foot .wine-muted{font-size:14px}
 .wine-props div,.wine-tab,.wine-btn,.wine-tchip{font-size:15px}
}
` + addStyles;

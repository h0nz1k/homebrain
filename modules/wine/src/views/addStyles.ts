/** „Přidat víno“ sheet, detail lookup diff and Vivino import (#81) – HomeBrain tokens only. */
export const addStyles = `
.wine-addbtn{flex:none;gap:6px;padding:0 var(--hb-sp-4) 0 var(--hb-sp-3);border-radius:var(--hb-radius-pill,999px);box-shadow:0 6px 18px -8px color-mix(in srgb,var(--hb-ac) 70%,transparent)}
.wine-addbtn-inline{margin-left:auto}
/* sheet shell: floating side sheet on desktop, bottom sheet on mobile */
.wine-sheet-backdrop{position:fixed;inset:0;z-index:85;background:rgb(8 10 14 / 42%);backdrop-filter:blur(8px) saturate(120%);-webkit-backdrop-filter:blur(8px) saturate(120%);animation:wine-fade .2s ease-out}
.wine-sheet{position:absolute;top:12px;right:12px;bottom:12px;width:min(520px,calc(100vw - 24px));display:flex;flex-direction:column;outline:0;border-radius:22px;background:var(--hb-s1);border:1px solid var(--hb-b1);box-shadow:0 30px 80px -20px rgb(0 0 0 / 45%),0 0 0 .5px rgb(255 255 255 / 4%) inset;overflow:hidden;animation:wine-sheet-side .32s cubic-bezier(.2,.8,.2,1);--wine-fill:color-mix(in srgb,var(--hb-t1) 7%,var(--hb-s1));--wine-line:color-mix(in srgb,var(--hb-t1) 13%,transparent)}
@keyframes wine-fade{from{opacity:0}}
@keyframes wine-sheet-side{from{transform:translateX(28px);opacity:0}}
@keyframes wine-sheet-up{from{transform:translateY(100%)}}
.wine-sheet-head{display:flex;align-items:center;gap:var(--hb-sp-2);padding:var(--hb-sp-3) var(--hb-sp-3) var(--hb-sp-2) var(--hb-sp-4);min-height:60px}
.wine-sheet-head h2{flex:1;margin:0;font-size:20px;line-height:1.25;font-weight:650;letter-spacing:-.015em}
.wine-sheet-badge{display:grid;place-items:center;width:34px;height:34px;flex:none;border-radius:11px;color:#fff;background:linear-gradient(145deg,color-mix(in srgb,var(--hb-ac) 80%,#fff),var(--hb-ac));box-shadow:0 6px 14px -6px var(--hb-ac)}
.wine-sheet-x{background:var(--wine-fill);color:var(--hb-t1);border-radius:50%;width:36px;height:36px;box-shadow:inset 0 0 0 1px var(--wine-line)}
.wine-sheet-x:hover{background:color-mix(in srgb,var(--hb-t1) 12%,var(--hb-s1))}
.wine-sheet-body{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;padding:var(--hb-sp-2) var(--hb-sp-4) var(--hb-sp-5);display:flex;flex-direction:column;gap:var(--hb-sp-4)}
.wine-sheet-body>*{flex-shrink:0}
.wine-sheet-foot{display:flex;flex-direction:column;gap:var(--hb-sp-2);padding:var(--hb-sp-3) var(--hb-sp-4) calc(var(--hb-sp-3) + env(safe-area-inset-bottom));border-top:1px solid var(--hb-b1);background:var(--hb-s1)}
.wine-sheet-foot .wine-error{padding:0}
.wine-btn--lg{min-height:52px;border-radius:14px;font-size:16px!important;width:100%}
/* start */
.wine-sheet-search{display:flex;gap:var(--hb-sp-2)}
.wine-search--xl input{min-height:52px;border-radius:14px;font-size:16px;background:var(--hb-s2);border-color:transparent}
.wine-search--xl input:focus{border-color:var(--hb-ac);background:var(--hb-s1)}
.wine-sheet-search .wine-btn{min-height:52px;border-radius:14px;padding:0 var(--hb-sp-5)}
.wine-tiles2{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:var(--hb-sp-2)}
.wine-tile{position:relative;display:flex;flex-direction:column;align-items:flex-start;gap:var(--hb-sp-3);min-height:132px;padding:var(--hb-sp-3);text-align:left;border-radius:18px;border:1px solid var(--hb-b1);background:linear-gradient(180deg,color-mix(in srgb,var(--hb-ac) 6%,var(--hb-s2)),var(--hb-s2));cursor:pointer;transition:transform .15s,border-color .15s,box-shadow .15s}
.wine-tile:hover{border-color:color-mix(in srgb,var(--hb-ac) 45%,var(--hb-b1));box-shadow:0 10px 24px -14px color-mix(in srgb,var(--hb-ac) 60%,transparent)}
.wine-tile:active{transform:scale(.98)}
.wine-tile[aria-disabled]{cursor:default;background:var(--hb-s2);box-shadow:none;border-style:dashed}
.wine-tile[aria-disabled] .wine-tile-ico{background:var(--hb-s1);color:var(--hb-t3);box-shadow:none}
.wine-tile[aria-disabled] .wine-tile-t strong{color:var(--hb-t2)}
.wine-tile-ico{display:grid;place-items:center;width:42px;height:42px;border-radius:13px;color:#fff;background:linear-gradient(145deg,color-mix(in srgb,var(--hb-ac) 75%,#fff),var(--hb-ac));box-shadow:0 8px 16px -8px var(--hb-ac)}
.wine-tile-t{display:flex;flex-direction:column;gap:2px;min-width:0}
.wine-tile-t strong{font-size:15px;line-height:1.25;font-weight:600}
.wine-tile-t span{font-size:13px;line-height:1.3;color:var(--hb-t2)}
.wine-tile-tag{position:absolute;top:10px;right:10px;font-size:12px;font-weight:600;padding:2px 8px;border-radius:999px;background:var(--hb-s1);color:var(--hb-t2);border:1px solid var(--hb-b1)}
.wine-tile.wine-file input{position:absolute;inset:0;opacity:0;width:100%;height:100%;cursor:pointer}
.wine-tile[aria-disabled].wine-file input{cursor:default}
.wine-sheet-hint{display:flex;gap:var(--hb-sp-3);align-items:flex-start;padding:var(--hb-sp-3);border-radius:16px;background:color-mix(in srgb,var(--hb-warn,#d98a00) 9%,var(--hb-s2));border:1px solid color-mix(in srgb,var(--hb-warn,#d98a00) 28%,transparent)}
.wine-sheet-hint>span:last-child{display:flex;flex-direction:column;gap:2px;font-size:14px;line-height:1.4;color:var(--hb-t2)}
.wine-sheet-hint strong{color:var(--hb-t1);font-weight:600}
.wine-sheet-hint-ico{display:grid;place-items:center;width:32px;height:32px;flex:none;border-radius:10px;background:color-mix(in srgb,var(--hb-warn,#d98a00) 18%,transparent);color:var(--hb-warn,#d98a00)}
[data-theme='light'] .wine-sheet-hint-ico{color:#985200}
.wine-sources{display:flex;flex-direction:column;gap:var(--hb-sp-2);padding-top:var(--hb-sp-1)}
.wine-sources ul,.wine-statuses{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:6px}
.wine-sources li,.wine-statuses li{display:inline-flex;align-items:center;gap:6px;min-height:30px;padding:0 10px;border-radius:999px;background:var(--wine-fill,var(--hb-s2));box-shadow:inset 0 0 0 1px var(--wine-line,var(--hb-b1));font-size:13px;color:var(--hb-t1);--tone:var(--hb-ok)}
.wine-sources li:not([data-available]){--tone:var(--hb-t3);color:var(--hb-t2);text-decoration:line-through;text-decoration-color:color-mix(in srgb,var(--hb-t3) 60%,transparent)}
.wine-statuses li[data-status=empty],.wine-statuses li[data-status=skipped]{--tone:var(--hb-t3)}
.wine-statuses li[data-status=error]{--tone:var(--hb-crit)}
.wine-statuses li[data-status=unavailable]{--tone:var(--hb-warn,#d98a00)}
.wine-sources p{margin:0}
/* scanner */
.wine-scan{display:flex;flex-direction:column;gap:var(--hb-sp-3)}
.wine-scan-view{position:relative;aspect-ratio:4/3;border-radius:20px;overflow:hidden;background:radial-gradient(120% 90% at 50% 30%,#2a2f38,#0d0f13);display:grid;place-items:center}
.wine-scan-view video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.wine-scan-view:not([data-live]) video{display:none}
.wine-scan-frame{position:absolute;left:12%;right:12%;top:30%;bottom:30%;border-radius:14px;box-shadow:0 0 0 999px rgb(0 0 0 / 38%);border:2px solid rgb(255 255 255 / 85%);overflow:hidden}
.wine-scan-line{position:absolute;left:6%;right:6%;top:50%;height:2px;border-radius:2px;background:var(--hb-ac);box-shadow:0 0 12px 2px color-mix(in srgb,var(--hb-ac) 70%,transparent);animation:wine-scan 2.2s ease-in-out infinite alternate}
@keyframes wine-scan{from{transform:translateY(-34px)}to{transform:translateY(34px)}}
.wine-scan-cap{position:absolute;left:0;right:0;bottom:14px;text-align:center;color:#fff;font-size:14px;font-weight:500;text-shadow:0 1px 6px rgb(0 0 0 / 60%)}
.wine-scan-off{display:flex;flex-direction:column;align-items:center;gap:var(--hb-sp-2);max-width:34ch;padding:var(--hb-sp-4);text-align:center;color:#e6e8ec;font-size:14px;line-height:1.45}
.wine-scan-still{align-self:flex-start}
.wine-inline{display:flex;gap:var(--hb-sp-2)}
.wine-inline input{flex:1;min-width:0}
/* results */
.wine-results{display:flex;flex-direction:column;gap:var(--hb-sp-3)}
.wine-results-q{margin:0;color:var(--hb-t2);font-size:14px}
.wine-results-q strong{color:var(--hb-t1);font-weight:600;overflow-wrap:anywhere}
.wine-props-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:var(--hb-sp-2)}
.wine-proposal{display:flex;align-items:center;gap:var(--hb-sp-3);width:100%;padding:10px var(--hb-sp-3) 10px 10px;text-align:left;border-radius:18px;border:1px solid var(--wine-line,var(--hb-b1));background:var(--hb-s2);box-shadow:0 1px 2px rgb(0 0 0 / 5%),0 8px 20px -14px rgb(0 0 0 / 30%);cursor:pointer;transition:border-color .15s,transform .15s}
.wine-proposal:hover{border-color:color-mix(in srgb,var(--hb-ac) 50%,var(--hb-b1))}
.wine-proposal:active{transform:scale(.99)}
.wine-proposal>.wine-ico{color:var(--hb-t2);flex:none}
.wine-proposal-img{flex:none;display:grid;place-items:center;border-radius:12px;overflow:hidden}
.wine-proposal-img .wine-bottle-frame{border-radius:12px}
.wine-proposal-t{display:flex;flex-direction:column;gap:3px;min-width:0;flex:1}
.wine-proposal-t strong{font-size:16px;line-height:1.3;font-weight:600}
.wine-proposal-lab{font-size:14px;color:var(--hb-t2)}
.wine-proposal-sub{font-size:13px;color:var(--hb-t2)}
.wine-chips{display:flex;flex-wrap:wrap;gap:4px;margin-top:2px}
.wine-chip{display:inline-flex;align-items:center;gap:3px;min-height:24px;padding:0 8px;border-radius:999px;background:color-mix(in srgb,var(--hb-t1) 9%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--hb-t1) 10%,transparent);color:var(--hb-t1);font-size:12px;font-weight:600;white-space:nowrap}
.wine-chip[data-tone=ok],.wine-chip[data-tone=soft],.wine-chip[data-tone=accent]{box-shadow:none}
.wine-chip[data-tone=ok]{background:color-mix(in srgb,var(--hb-ok) 16%,transparent);color:color-mix(in srgb,var(--hb-ok) 80%,var(--hb-t1))}
.wine-chip[data-tone=soft]{background:color-mix(in srgb,var(--hb-warn,#d98a00) 15%,transparent);color:color-mix(in srgb,var(--hb-warn,#d98a00) 75%,var(--hb-t1))}
.wine-chip[data-tone=accent]{background:var(--hb-ac-s);color:var(--hb-ac)}
.wine-proposal--skel{cursor:default}
.wine-skel{display:block;border-radius:8px;background:linear-gradient(90deg,var(--hb-s1),color-mix(in srgb,var(--hb-t1) 8%,var(--hb-s1)),var(--hb-s1));background-size:200% 100%;animation:wine-shimmer 1.3s linear infinite}
.wine-skel--img{width:69px;height:92px;border-radius:12px}
.wine-skel--l{height:16px;width:70%}.wine-skel--s{height:12px;width:45%}
@keyframes wine-shimmer{to{background-position:-200% 0}}
.wine-results-empty{display:flex;flex-direction:column;gap:4px;padding:var(--hb-sp-4);border-radius:16px;background:var(--hb-s2);text-align:center;font-size:14px;color:var(--hb-t2)}
.wine-results-empty strong{color:var(--hb-t1);font-size:16px}
.wine-results-manual{align-self:flex-start}
/* stock-in for an existing wine */
.wine-stockin{display:flex;flex-direction:column;gap:var(--hb-sp-4)}
.wine-stockin-card{display:flex;gap:var(--hb-sp-3);align-items:center;padding:var(--hb-sp-3);border-radius:18px;background:var(--hb-s2)}
.wine-stepper--lg button{width:48px;height:48px;font-size:22px}
.wine-stepper--lg output{min-width:36px;font-size:18px}
.wine-stepper--lg{align-self:flex-start;border-radius:14px}
/* form */
.wine-addform{display:flex;flex-direction:column;gap:var(--hb-sp-4)}
.wine-addform-hero{display:flex;gap:var(--hb-sp-4);align-items:center;padding:var(--hb-sp-3);border-radius:20px;background:linear-gradient(135deg,color-mix(in srgb,var(--hb-ac) 10%,var(--hb-s2)),var(--hb-s2) 60%);border:1px solid var(--hb-b1)}
.wine-addform-photo{flex:none;border-radius:14px;overflow:hidden;box-shadow:0 10px 24px -14px rgb(0 0 0 / 55%)}
.wine-addform-src{display:flex;flex-direction:column;gap:4px;min-width:0}
.wine-addform-src>strong{font-size:17px;line-height:1.3;font-weight:600}
.wine-addform-links{display:flex;gap:var(--hb-sp-3);margin-top:2px}
.wine-addform-links a,.wine-lookup-src a{display:inline-flex;align-items:center;gap:3px;color:var(--hb-ac);font-weight:600;font-size:14px;text-decoration:none}
.wine-addform-links a:hover{text-decoration:underline}
.wine-fs{border:0;margin:0;padding:0;min-width:0;display:flex;flex-direction:column;gap:var(--hb-sp-2)}
.wine-fs>legend{padding:0;margin-bottom:var(--hb-sp-2);font-size:13px;font-weight:650;letter-spacing:.04em;text-transform:uppercase;color:var(--hb-t3)}
.wine-fgrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--hb-sp-3) var(--hb-sp-3);padding:var(--hb-sp-3);border-radius:18px;background:var(--hb-s2)}
.wine-ff{display:flex;flex-direction:column;gap:6px;min-width:0;border:0;margin:0;padding:0}
.wine-ff[data-wide]{grid-column:1/-1}
.wine-ff-l{display:flex;align-items:center;gap:6px;padding:0;font-size:13px;font-weight:500;color:var(--hb-t2)}
.wine-ff-tag{font-size:11px;font-weight:650;padding:1px 6px;border-radius:999px;background:color-mix(in srgb,var(--hb-warn,#d98a00) 16%,transparent);color:color-mix(in srgb,var(--hb-warn,#d98a00) 75%,var(--hb-t1));text-transform:none;letter-spacing:0}
.wine-ff input,.wine-ff textarea{width:100%;min-height:46px;padding:0 var(--hb-sp-3);border-radius:12px;border:1px solid var(--hb-b1);background:var(--hb-s1);font-size:16px;color:var(--hb-t1);transition:border-color .15s,box-shadow .15s}
.wine-ff textarea{padding:var(--hb-sp-2) var(--hb-sp-3);resize:vertical;line-height:1.4}
.wine-ff input:focus,.wine-ff textarea:focus{outline:0;border-color:var(--hb-ac);box-shadow:0 0 0 3px var(--hb-ac-s)}
.wine-ff[data-error] input{border-color:var(--hb-crit)}
.wine-ff-err{font-size:13px;color:var(--hb-crit)}
.wine-seg{display:flex;gap:2px;padding:3px;border-radius:12px;background:var(--hb-s1);border:1px solid var(--hb-b1);overflow-x:auto;scrollbar-width:none}
.wine-seg button{flex:1 1 auto;min-height:38px;padding:0 10px;border:0;border-radius:9px;background:none;color:var(--hb-t2);cursor:pointer;font-size:14px;font-weight:500;white-space:nowrap}
.wine-seg button[aria-pressed=true]{background:var(--hb-s2);color:var(--hb-t1);font-weight:600;box-shadow:0 1px 2px rgb(0 0 0 / 18%),0 0 0 1px var(--hb-b1)}
[data-theme='light'] .wine-seg button[aria-pressed=true]{background:#fff}
.wine-seg--sm button{min-height:32px;font-size:13px}
.wine-photo-opts{display:flex;flex-wrap:wrap;gap:var(--hb-sp-2)}
.wine-photo-opts>button,.wine-photo-take{display:inline-flex;align-items:center;gap:6px;min-height:40px;padding:0 var(--hb-sp-3);border-radius:999px;border:1px solid var(--hb-b1);background:var(--hb-s2);color:var(--hb-t2);font-size:14px;font-weight:500;cursor:pointer}
.wine-photo-opts>button .wine-ico{display:none}
.wine-photo-opts>button[aria-checked=true]{border-color:var(--hb-ac);background:var(--hb-ac-s);color:var(--hb-ac);font-weight:600}
.wine-photo-opts>button[aria-checked=true] .wine-ico{display:block}
.wine-photo-take{position:relative;border-style:dashed}
.wine-photo-take input{position:absolute;inset:0;opacity:0;width:100%;cursor:pointer}
/* detail: Dohledat + Vivino */
.wine-hero-acts{display:flex;flex-direction:column;gap:6px;min-width:0}
.wine-lookup-btn{border-style:solid!important;border-color:color-mix(in srgb,var(--hb-ac) 55%,var(--hb-b1))!important;background:color-mix(in srgb,var(--hb-ac) 12%,var(--hb-s1))!important;color:var(--hb-ac)!important;font-weight:650;align-items:center!important;box-shadow:0 4px 12px -8px color-mix(in srgb,var(--hb-ac) 70%,transparent);transition:background .15s,box-shadow .15s}
.wine-lookup-btn:hover{background:color-mix(in srgb,var(--hb-ac) 18%,var(--hb-s1))!important}
.wine-lookup-btn[aria-expanded=true]{background:color-mix(in srgb,var(--hb-ac) 20%,var(--hb-s1))!important;box-shadow:inset 0 0 0 1px var(--hb-ac)}
.wine-lookup-btn .wine-ico{align-self:center}
.wine-lookup-btn span{color:color-mix(in srgb,var(--hb-ac) 55%,var(--hb-t1))!important;font-weight:500}
.wine-vivino{display:inline-flex;align-items:center;gap:6px;min-height:36px;padding:0 4px;font-size:14px;font-weight:600;color:var(--hb-t2);text-decoration:none;border-radius:8px}
.wine-vivino:hover{color:var(--hb-t1)}
.wine-vivino-mark{display:inline-grid;place-items:center;width:20px;height:20px;border-radius:6px;background:#a8123e;color:#fff;font-size:12px;font-weight:800;font-family:Georgia,serif;flex:none}
.wine-lookup{display:flex;flex-direction:column;gap:var(--hb-sp-3);padding:var(--hb-sp-3);border-radius:18px;border:1px solid color-mix(in srgb,var(--hb-ac) 30%,var(--hb-b1));background:linear-gradient(180deg,color-mix(in srgb,var(--hb-ac) 7%,var(--hb-s2)),var(--hb-s2))}
.wine-lookup-head{display:flex;align-items:center;gap:var(--hb-sp-2)}
.wine-lookup-head strong{flex:1;font-size:15px}
.wine-lookup-head .wine-iconbtn{width:36px;height:36px}
.wine-lookup-ico{display:grid;place-items:center;width:30px;height:30px;border-radius:9px;background:var(--hb-ac);color:#fff}
.wine-lookup-src{display:flex;flex-wrap:wrap;align-items:center;gap:var(--hb-sp-2);margin:0;font-size:14px;font-weight:600}
.wine-diff{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;border-radius:14px;background:var(--hb-s1);border:1px solid var(--hb-b1);overflow:hidden}
.wine-diff li+li{border-top:1px solid var(--hb-b1)}
.wine-diff label{display:grid;grid-template-columns:auto minmax(0,.8fr) minmax(0,1.4fr);gap:var(--hb-sp-2);align-items:start;padding:10px var(--hb-sp-3);cursor:pointer;font-size:14px}
.wine-diff input{width:20px;height:20px;margin:0;accent-color:var(--hb-ac)}
.wine-diff-k{display:flex;flex-wrap:wrap;align-items:center;gap:4px;color:var(--hb-t2)}
.wine-diff-v{display:flex;flex-direction:column;gap:2px;min-width:0;overflow-wrap:anywhere}
.wine-diff-new{font-weight:600}
.wine-diff-old{color:var(--hb-t3);font-size:13px}
.wine-diff-img{width:42px;height:56px;object-fit:contain;border-radius:6px;background:#fff}
li[data-fill] .wine-diff-new::before{content:'+ ';color:var(--hb-ok)}
.wine-detail-scroll:has(.wine-lookup){scroll-padding-block:var(--hb-sp-4) var(--hb-sp-6);padding-bottom:calc(var(--hb-sp-6) + var(--hb-sp-4))}
.wine-lookup .wine-enrich-url{padding-top:var(--hb-sp-3);border-top:1px solid color-mix(in srgb,var(--hb-ac) 18%,var(--hb-b1))}
.wine-lookup .wine-enrich-url input{background:var(--hb-s1);border-color:var(--hb-b2,var(--hb-b1))}
/* Vivino import */
.wine-h3--brand{display:flex;align-items:center;gap:var(--hb-sp-2)}
.wine-vivino-plan{display:flex;flex-direction:column;gap:var(--hb-sp-2)}
.wine-vivino-rows{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;border:1px solid var(--hb-b1);border-radius:14px;overflow:hidden;background:var(--hb-s1)}
.wine-vivino-rows li{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:var(--hb-sp-3);align-items:center;padding:10px var(--hb-sp-3)}
.wine-vivino-rows li+li{border-top:1px solid var(--hb-b1)}
.wine-vivino-rows li[data-match=fuzzy]{background:color-mix(in srgb,var(--hb-warn,#d98a00) 6%,transparent)}
.wine-vivino-main{display:flex;flex-direction:column;gap:2px;min-width:0}
.wine-vivino-main select{margin-top:4px;max-width:100%}
.wine-vivino-check input{width:20px;height:20px;accent-color:var(--hb-ac)}
@media (max-width:900px){
 .wine-sheet{top:auto;left:0;right:0;bottom:0;width:auto;max-height:calc(100dvh - 24px - env(safe-area-inset-top));border-radius:24px 24px 0 0;border-bottom:0;animation:wine-sheet-up .34s cubic-bezier(.2,.8,.2,1)}
 .wine-sheet .wine-grabber{display:block}
 .wine-sheet[data-step=form]{height:calc(100dvh - 24px - env(safe-area-inset-top))}
 .wine-sheet-body{flex:1 1 auto;padding-bottom:calc(var(--hb-sp-5) + env(safe-area-inset-bottom))}
 .wine-sheet:has(.wine-sheet-foot) .wine-sheet-body{padding-bottom:var(--hb-sp-5)}
}
@media (max-width:600px){
 .wine-addbtn{width:44px;height:44px;min-height:44px;padding:0;justify-content:center}
 .wine-addbtn span{display:none}
 .wine-tiles2{grid-template-columns:1fr}
 .wine-tile{flex-direction:row;align-items:center;min-height:72px;padding:var(--hb-sp-3)}
 .wine-tile-tag{position:static;margin-left:auto}
 .wine-sheet-search .wine-btn{padding:0 var(--hb-sp-4)}
 .wine-fgrid{grid-template-columns:minmax(0,1fr) minmax(0,1fr);padding:var(--hb-sp-3) var(--hb-sp-3)}
 .wine-diff label{grid-template-columns:auto minmax(0,1fr)}
 .wine-diff-v{grid-column:2}
 .wine-addbtn-inline{margin-left:0}
}
@media (prefers-reduced-motion:reduce){.wine-sheet,.wine-sheet-backdrop,.wine-scan-line,.wine-skel{animation:none!important}}
`;

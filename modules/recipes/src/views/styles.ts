/** Recepty styles – port of the approved mockups (approved recipes mockups), `rc-` prefixed. */
export const recipesStyles = String.raw`
.rc { --rc-ac:#ff9a4d; --rc-ac-ink:#ffb27a; --rc-on-ac:#2a1300; --rc-ac-s:rgb(255 154 77 / 15%); --rc-glass:rgb(22 26 33 / 72%); --rc-ok:var(--hb-ok);
  --rc-page:radial-gradient(90% 60% at 85% -10%, rgb(255 140 60 / 8%), transparent 60%), radial-gradient(80% 50% at 0% 0%, rgb(61 139 255 / 6%), transparent 60%);
  --rc-field:color-mix(in srgb, var(--hb-t1) 6%, var(--hb-s1));
  position:relative; min-height:100%; background:var(--rc-page), var(--hb-bg); color:var(--hb-t1); font-feature-settings:'cv11','ss03'; }
[data-theme='light'] .rc { --rc-ac:#c2410c; --rc-ac-ink:#b23c0a; --rc-on-ac:#fff; --rc-ac-s:rgb(194 65 12 / 9%); --rc-glass:rgb(255 255 255 / 80%); --rc-ok:#047857;
  --rc-page:radial-gradient(90% 60% at 85% -10%, rgb(255 150 80 / 10%), transparent 60%), radial-gradient(80% 50% at 0% 0%, rgb(37 99 235 / 5%), transparent 60%); }
@media (prefers-color-scheme: light) { [data-theme='system'] .rc { --rc-ac:#c2410c; --rc-ac-ink:#b23c0a; --rc-on-ac:#fff; --rc-ac-s:rgb(194 65 12 / 9%); --rc-glass:rgb(255 255 255 / 80%); --rc-ok:#047857; } }
.hb-shell main:has(.rc) { padding:0; }
.rc :where(button:not(.hb-btn)) { font:inherit; color:inherit; border:0; background:none; padding:0; cursor:pointer; }
.rc :where(input, textarea, select) { font:inherit; color:inherit; }
.rc svg.rc-i { width:22px; height:22px; fill:none; stroke:currentColor; stroke-width:1.9; stroke-linecap:round; stroke-linejoin:round; flex:none; }
.rc .num { font-variant-numeric:tabular-nums; }
.rc-btn { height:52px; padding:0 22px; border-radius:999px; display:inline-flex; align-items:center; justify-content:center; gap:10px; font-size:16px; font-weight:600; white-space:nowrap; }
.rc .rc-pri { background:var(--rc-ac); color:var(--rc-on-ac); box-shadow:inset 0 1px 0 rgb(255 255 255 / 18%), 0 1px 2px rgb(0 0 0 / 20%); }
.rc .rc-pri:disabled { opacity:.45; cursor:not-allowed; }
.rc-sec { background:var(--hb-fill-strong); }
.rc-ibtn { width:52px; height:52px; border-radius:50%; display:grid; place-items:center; background:var(--hb-fill); color:var(--hb-t2); flex:none; }
.rc :focus-visible { outline:3px solid var(--hb-ac); outline-offset:2px; }
/* list */
.rc-top { display:flex; align-items:center; gap:16px; padding:22px 32px 12px; flex-wrap:wrap; }
.rc-ttl h1 { margin:0; font-size:30px; font-weight:650; letter-spacing:-.025em; line-height:1.15; }
.rc-ttl p { margin:2px 0 0; font-size:14px; color:var(--hb-t2); }
.rc-search { flex:1; max-width:520px; margin-left:auto; height:52px; border-radius:999px; display:flex; align-items:center; gap:12px; padding:0 20px; background:var(--hb-s1); box-shadow:var(--hb-elev-1); color:var(--hb-t3); }
.rc-search input { height:48px; flex:1; min-width:0; border:0; background:none; outline:none; font-size:16px; color:var(--hb-t1); }
.rc-chips { display:flex; gap:10px; padding:6px 32px 18px; overflow-x:auto; scrollbar-width:none; }
.rc-chip { height:48px; padding:0 20px; border-radius:999px; display:inline-flex; align-items:center; gap:8px; font-size:15px; font-weight:550; color:var(--hb-t2); background:var(--hb-fill); white-space:nowrap; flex:none; }
.rc-chip[aria-pressed='true'] { background:var(--hb-t1); color:var(--hb-bg); }
.rc-chip .ct { font-size:13px; opacity:.7; font-weight:500; }
.rc-chip svg.rc-i { width:18px; height:18px; }
.rc-chip.fav svg.rc-i { color:#e5484d; fill:#e5484d; stroke:#e5484d; }
.rc-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(240px, 1fr)); gap:26px 22px; padding:0 32px 120px; }
.rc-card { position:relative; text-align:left; }
.rc-card > button.open { display:block; width:100%; text-align:left; }
.rc-ph { position:relative; aspect-ratio:3/2; border-radius:var(--hb-radius-lg); overflow:hidden; box-shadow:var(--hb-elev-1); background:var(--hb-fill); }
.rc-ph img { display:block; width:100%; height:100%; object-fit:cover; }
.rc-heart { position:absolute; top:12px; right:12px; width:48px; height:48px; border-radius:50%; display:grid; place-items:center; background:rgb(255 255 255 / 60%); backdrop-filter:blur(12px); color:rgb(40 28 20 / 75%); }
.rc-heart[aria-pressed='true'] svg.rc-i, .rc-glass[aria-pressed='true'] svg.rc-i { fill:#e5484d; stroke:#e5484d; }
.rc-badge { position:absolute; left:10px; bottom:10px; height:30px; padding:0 12px; border-radius:999px; display:inline-flex; align-items:center; gap:6px; font-size:13px; font-weight:600; background:rgb(20 14 10 / 58%); color:#fff; backdrop-filter:blur(10px); }
.rc-badge svg.rc-i { width:15px; height:15px; }
.rc-card h3 { margin:12px 2px 4px; font-size:18px; font-weight:620; letter-spacing:-.012em; line-height:1.25; }
.rc-meta { display:flex; align-items:center; gap:10px; margin:0 2px; font-size:15px; color:var(--hb-t2); flex-wrap:wrap; }
.rc-meta .dot { width:3px; height:3px; border-radius:50%; background:var(--hb-t3); }
.rc-empty { padding:60px 32px; text-align:center; color:var(--hb-t2); font-size:17px; }
/* detail */
.rc-detail { display:grid; grid-template-columns:minmax(280px, 1.05fr) minmax(280px, 1fr) minmax(280px, 1.05fr); gap:24px; padding:20px 28px 28px; height:calc(100dvh - 64px); min-height:600px; box-sizing:border-box; }
.rc-col { min-height:0; position:relative; display:flex; flex-direction:column; }
.rc-hero { position:relative; height:clamp(230px, 34vh, 330px); border-radius:var(--hb-radius-xl); overflow:hidden; box-shadow:var(--hb-elev-2); flex:none; background:var(--hb-fill); }
.rc-hero img { display:block; width:100%; height:100%; object-fit:cover; }
.rc-glass { width:52px; height:52px; border-radius:50%; display:grid; place-items:center; background:rgb(255 255 255 / 74%); color:#2a1d14; backdrop-filter:blur(14px); box-shadow:0 6px 18px -10px rgb(0 0 0 / 50%); }
.rc-hero .l { position:absolute; top:16px; left:16px; }
.rc-hero .r { position:absolute; top:16px; right:16px; display:flex; gap:10px; }
.rc-c1 h1 { margin:20px 0 6px; font-size:32px; font-weight:680; letter-spacing:-.028em; line-height:1.12; }
.rc-lead { margin:0 0 16px; font-size:15px; line-height:1.5; color:var(--hb-t2); }
.rc-stats { display:grid; grid-template-columns:repeat(3, 1fr); margin-bottom:18px; }
.rc-stats div { padding:0 14px; border-left:1px solid var(--hb-edge-strong); }
.rc-stats div:first-child { padding-left:0; border-left:0; }
.rc-stats b { display:block; font-size:22px; font-weight:600; letter-spacing:-.02em; font-variant-numeric:tabular-nums; }
.rc-stats span { font-size:13px; color:var(--hb-t2); }
.rc-c1 { overflow:auto; scrollbar-width:thin; }
.rc-cta { display:flex; gap:12px; margin-top:auto; padding-top:14px; position:sticky; bottom:0; background:var(--hb-bg); flex-shrink:0; }
.rc-cta .rc-pri { flex:1; height:64px; font-size:18px; }
.rc-panel { background:var(--hb-s1); border-radius:var(--hb-radius-xl); box-shadow:var(--hb-elev-1); padding:22px; overflow:auto; min-height:0; flex:1; }
.rc-sec-h { display:flex; align-items:center; justify-content:space-between; gap:12px; margin:0 0 12px; flex-wrap:wrap; }
.rc-sec-h h2 { margin:0; font-size:22px; font-weight:650; letter-spacing:-.018em; }
.rc-stepper { display:inline-flex; align-items:center; height:52px; border-radius:999px; background:var(--hb-fill-strong); padding:4px; }
.rc-stepper button { width:48px; height:48px; border-radius:50%; display:grid; place-items:center; background:var(--hb-s1); box-shadow:var(--hb-elev-1); }
.rc-stepper .v { min-width:92px; text-align:center; font-size:16px; font-weight:620; font-variant-numeric:tabular-nums; }
.rc-progress { display:flex; align-items:center; gap:12px; margin:0 0 6px; font-size:14px; color:var(--hb-t2); }
.rc-progress .tr { flex:1; height:6px; border-radius:3px; background:var(--hb-fill-strong); overflow:hidden; }
.rc-progress .tr i { display:block; height:100%; background:var(--rc-ok); border-radius:3px; transition:width var(--hb-dur-2, .2s); }
.rc-ing { list-style:none; margin:0; padding:0; }
.rc-ing .grp { padding:14px 0 4px; font-size:14px; font-weight:600; color:var(--hb-t3); }
.rc-ing button { display:flex; align-items:center; gap:14px; min-height:52px; width:100%; text-align:left; padding:4px 0; }
.rc-ck { width:30px; height:30px; border-radius:50%; flex:none; display:grid; place-items:center; box-shadow:inset 0 0 0 2px var(--hb-b2, var(--hb-edge-strong)); }
.rc-ing [aria-checked='true'] .rc-ck { background:var(--rc-ok); box-shadow:none; color:#fff; }
.rc-ck svg.rc-i { width:17px; height:17px; stroke-width:3; }
.rc-ing .n { flex:1; font-size:17px; line-height:1.3; font-weight:500; }
.rc-ing .n small { display:block; font-size:13px; color:var(--hb-t3); }
.rc-ing .q { flex:none; font-size:16px; color:var(--hb-t2); font-variant-numeric:tabular-nums; white-space:nowrap; }
.rc-ing .q.chg { color:var(--rc-ac-ink); font-weight:600; }
.rc-ing [aria-checked='true'] .n, .rc-ing [aria-checked='true'] .q { opacity:.45; }
.rc-video { width:100%; position:relative; height:170px; border-radius:var(--hb-radius-lg); overflow:hidden; margin-bottom:18px; background:#1b120c; flex:none; }
.rc-video img { width:100%; height:100%; object-fit:cover; display:block; opacity:.8; }
.rc-video .ov { background-color:rgb(8 5 3 / 65%); position:absolute; inset:0; display:flex; align-items:flex-end; gap:14px; padding:0 18px 20px; color:#fff; background:linear-gradient(0deg, rgb(8 5 3 / 90%), rgb(8 5 3 / 30%) 60%, transparent); text-align:left; }
.rc-play { width:52px; height:52px; border-radius:50%; display:grid; place-items:center; background:rgb(255 255 255 / 92%); color:#1b120c; flex:none; }
.rc-play svg.rc-i { fill:currentColor; stroke:none; margin-left:3px; }
.rc-video b { display:block; font-size:17px; font-weight:620; }
.rc-video span { font-size:14px; color:rgb(255 255 255 / 82%); }
.rc-steps { list-style:none; margin:0; padding:0; }
.rc-steps li { display:flex; gap:16px; padding:12px 0; }
.rc-steps .no { width:36px; height:36px; border-radius:50%; flex:none; display:grid; place-items:center; font-size:15px; font-weight:650; background:var(--hb-fill-strong); }
.rc-steps p { margin:5px 0 0; font-size:17px; line-height:1.5; }
.rc-steps .grp { font-size:13px; font-weight:600; color:var(--hb-t3); padding:10px 0 0; }
.rc-tm { display:inline-flex; align-items:center; gap:5px; height:30px; padding:0 11px 0 9px; border-radius:999px; font-weight:620; font-size:15px; color:var(--rc-ac-ink); background:var(--rc-ac-s); white-space:nowrap; vertical-align:1px; }
.rc-tm svg.rc-i { width:16px; height:16px; }
.rc-fry { display:inline-flex; align-items:center; gap:6px; height:30px; padding:0 11px; border-radius:999px; font-size:14px; font-weight:600; background:var(--hb-fill); color:var(--hb-t2); margin-left:6px; }
/* cooking mode */
.rc-cook { position:fixed; inset:0; z-index:40; display:flex; flex-direction:column; background:var(--rc-page), var(--hb-bg); touch-action:pan-y; }
.rc-ctop { display:flex; align-items:center; gap:18px; padding:18px 28px 10px; }
.rc-ctop .rt { font-size:16px; font-weight:600; color:var(--hb-t2); white-space:nowrap; max-width:28vw; overflow:hidden; text-overflow:ellipsis; }
.rc-segs { flex:1; display:flex; gap:6px; }
.rc-segs i { flex:1; height:6px; border-radius:3px; background:var(--hb-fill-strong); }
.rc-segs i.d { background:color-mix(in srgb, var(--rc-ac) 45%, transparent); }
.rc-segs i.c { background:var(--rc-ac); }
.rc-ctop .stp { font-size:16px; font-weight:620; font-variant-numeric:tabular-nums; white-space:nowrap; }
.rc-wake { display:inline-flex; align-items:center; gap:8px; height:40px; padding:0 14px; border-radius:999px; font-size:14px; font-weight:550; color:var(--rc-ok); background:color-mix(in srgb, var(--rc-ok) 12%, transparent); white-space:nowrap; }
.rc-wake svg.rc-i { width:18px; height:18px; }
.rc-cmain { flex:1; min-height:0; display:grid; grid-template-columns:1fr 380px; gap:36px; padding:8px 28px 112px; overflow:hidden; }
.rc-cstep { display:flex; justify-content:safe center; flex-direction:column; min-height:0; overflow:auto; padding:10px 0 2px; }
.rc-cstep .lbl { display:flex; align-items:center; gap:12px; font-size:20px; font-weight:600; color:var(--rc-ac-ink); margin:8px 0 4px; }
.rc-big { margin:10px 0 0; font-size:clamp(28px, 3.9vw, 50px); line-height:1.3; font-weight:500; letter-spacing:-.022em; text-wrap:pretty; }
.rc-big .rc-tm { min-height:48px; height:clamp(48px, 4.2vw, 54px); font-size:clamp(24px, 3vw, 38px); padding:0 20px 0 14px; gap:10px; vertical-align:4px; box-shadow:inset 0 0 0 2px color-mix(in srgb, var(--rc-ac) 45%, transparent); }
.rc-big .rc-tm svg.rc-i { width:30px; height:30px; stroke-width:2.2; }
.rc-big .rc-tm[data-state='run'] small { font-size:.58em; font-weight:600; opacity:.8; }
.rc-big .rc-tm[data-state='done'] { background:var(--rc-ok); color:#fff; box-shadow:none; }
.rc-lab4 { display:block; margin-top:12px; padding-top:24px; font-size:16px; color:var(--hb-t2); font-weight:550; }
.rc-ing4 { display:grid; grid-template-columns:repeat(auto-fit, minmax(140px, 1fr)); gap:12px; margin-top:10px; }
.rc-ing4 .u { display:flex; flex-direction:column; gap:2px; padding:14px 18px; border-radius:var(--hb-radius-md); background:var(--hb-fill); font-size:18px; color:var(--hb-t2); }
.rc-ing4 .u b { font-size:24px; font-weight:650; color:var(--hb-t1); font-variant-numeric:tabular-nums; }
.rc-tstrip { margin-top:22px; display:flex; gap:16px; flex-wrap:wrap; }
.rc-tcard { flex:1 1 220px; display:flex; align-items:center; gap:16px; padding:14px 18px 14px 14px; border-radius:var(--hb-radius-lg); background:var(--hb-s1); box-shadow:var(--hb-elev-1); min-width:0; }
.rc-tcard .ring { position:relative; flex:none; width:64px; height:64px; }
.rc-tcard .ring .hb-ring { --hb-ring-ink:var(--rc-ac); }
.rc-tcard b { display:block; font-size:40px; font-weight:550; letter-spacing:-.02em; line-height:1.15; font-variant-numeric:tabular-nums; }
.rc-tcard span { display:block; font-size:16px; color:var(--hb-t2); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.rc-tcard .tx { min-width:0; flex:1; }
.rc-tcard[data-soon='true'] { background:color-mix(in srgb, var(--rc-ac) 14%, var(--hb-s1)); }
.rc-tcard[data-soon='true'] b { color:var(--rc-ac-ink); }
.rc-tcard[data-status='ringing'] { background:var(--rc-ac); color:var(--rc-on-ac); box-shadow:0 0 0 6px var(--rc-ac-s); flex-grow:2.4; }
.rc-tcard[data-status='ringing'] b { font-size:26px; font-weight:650; white-space:nowrap; }
.rc-tcard[data-status='ringing'] span { color:inherit; opacity:.9; }
.rc-tcard .hb-btn { flex:none; }
.rc-tcard[data-status='ringing'] .hb-btn { color:inherit; background:rgb(0 0 0 / 18%); }
[data-theme='light'] .rc-tcard[data-status='ringing'] .hb-btn { background:rgb(255 255 255 / 22%); }
.rc-side { display:flex; flex-direction:column; gap:16px; min-height:0; overflow:hidden; }
.rc-pip { position:relative; flex:1; min-height:200px; border-radius:var(--hb-radius-lg); overflow:hidden; box-shadow:var(--hb-elev-2); background:#140d08; }
.rc-pip iframe, .rc-pip .yt-host, .rc-pip .yt-host > * { position:absolute; inset:0; width:100%; height:100%; border:0; }
.rc-pip .ov { position:absolute; inset:0; display:flex; flex-direction:column; justify-content:flex-end; padding:14px 16px; color:#fff; background:linear-gradient(transparent 20%, rgb(8 5 3 / 90%)); text-align:left; }
.rc-pip .ov .row { display:flex; align-items:center; gap:12px; padding:12px; border-radius:var(--hb-radius-md); background:rgb(8 5 3 / 85%); }
.rc .rc-play { color:#1b120c; }
.rc-pip .ov b { display:block; font-size:15px; font-weight:620; }
.rc-pip .ov span { font-size:13px; color:rgb(255 255 255 / 80%); }
.rc-pip .x { position:absolute; top:10px; right:10px; width:48px; height:48px; border-radius:50%; background:rgb(0 0 0 / 55%); color:#fff; display:grid; place-items:center; z-index:2; }
.rc-next { border-radius:var(--hb-radius-lg); background:var(--hb-s1); box-shadow:var(--hb-elev-1); padding:18px 20px; display:flex; flex-direction:column; text-align:left; flex:none; }
.rc-next .lab { font-size:16px; color:var(--hb-t2); font-weight:550; }
.rc-next p { margin:8px 0 0; font-size:22px; line-height:1.4; display:-webkit-box; -webkit-line-clamp:5; -webkit-box-orient:vertical; overflow:hidden; }
.rc-cnav { position:absolute; left:28px; right:28px; bottom:28px; display:grid; grid-template-columns:1fr auto 1fr; gap:18px; align-items:center; z-index:20; }
.rc-navbtn { justify-self:start; height:76px; min-width:140px; padding:0 28px; border-radius:26px; display:flex; align-items:center; justify-content:center; gap:12px; font-size:19px; font-weight:650; background:var(--hb-s1); box-shadow:var(--hb-elev-2); white-space:nowrap; }
.rc .rc-navbtn.go { justify-self:end; background:var(--rc-ac); color:var(--rc-on-ac); min-width:200px; }
.rc-navbtn:disabled { opacity:.4; }
.rc-navbtn svg.rc-i { width:26px; height:26px; stroke-width:2.2; }
.rc-mbar { margin:0 auto; height:76px; border-radius:999px; display:flex; align-items:center; gap:12px; padding:0 12px; background:var(--rc-glass); backdrop-filter:blur(28px) saturate(1.6); box-shadow:var(--hb-elev-2), inset 0 0 0 1px var(--hb-edge-strong); min-width:0; }
.rc-mbar .art { width:48px; height:48px; border-radius:50%; flex:none; display:grid; place-items:center; background:linear-gradient(135deg, #ff4e45, #b3122e); color:#fff; }
.rc-mbar .np { min-width:0; width:clamp(100px, 12vw, 200px); }
.rc-mbar .np b { display:block; font-size:16px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.rc-mbar .np span { display:block; font-size:13px; color:var(--hb-t2); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.rc-mbar button { width:48px; height:48px; border-radius:50%; display:grid; place-items:center; flex:none; }
.rc-mbar .pp { width:52px; height:52px; background:var(--hb-t1); color:var(--hb-bg); }
.rc-mbar .pp svg.rc-i { fill:currentColor; stroke:none; }
.rc-mbar[data-mode='ducked'] .np { width:auto; }
.rc-mbar[data-mode='ducked'] .np span { color:var(--rc-ac-ink); }
.rc-fryact { display:flex; align-items:center; gap:14px; margin-top:20px; padding:14px 16px; border-radius:var(--hb-radius-lg); background:var(--hb-s1); box-shadow:var(--hb-elev-1); flex-wrap:wrap; }
.rc-fryact .t { flex:1; min-width:200px; }
.rc-fryact .t b { display:block; font-size:18px; }
.rc-fryact .t span { font-size:15px; color:var(--hb-t2); }
/* dialog / sheet */
/* add */
.rc-add { display:grid; grid-template-columns:1fr 1fr; gap:28px; padding:6px 32px 32px; }
.rc-seg { display:inline-flex; padding:4px; border-radius:999px; background:var(--hb-fill-strong); }
.rc-seg button { height:44px; padding:0 20px; border-radius:999px; font-size:15px; font-weight:600; color:var(--hb-t2); }
.rc-seg button[aria-pressed='true'] { background:var(--hb-s1); color:var(--hb-t1); box-shadow:var(--hb-elev-1); }
.rc-box { background:var(--hb-s1); border-radius:var(--hb-radius-xl); box-shadow:var(--hb-elev-1); padding:24px; min-width:0; display:flex; flex-direction:column; }
.rc-box h2 { margin:0 0 6px; font-size:22px; font-weight:650; }
.rc-box .sub { margin:0 0 18px; font-size:15px; color:var(--hb-t2); line-height:1.45; }
.rc-field { display:flex; align-items:center; gap:12px; min-height:60px; padding:0 8px 0 18px; border-radius:18px; background:var(--rc-field); box-shadow:inset 0 0 0 1px color-mix(in srgb, var(--hb-t1) 12%, transparent); }
.rc-field input { flex:1; min-width:0; border:0; background:none; outline:none; font-size:16px; height:56px; }
.rc-field:focus-within { box-shadow:inset 0 0 0 1.5px var(--hb-ac); }
.rc-inp { width:100%; box-sizing:border-box; min-height:56px; border-radius:16px; border:0; padding:14px 18px; font-size:17px; background:var(--rc-field); box-shadow:inset 0 0 0 1px color-mix(in srgb, var(--hb-t1) 12%, transparent); }
textarea.rc-inp { min-height:140px; line-height:1.5; resize:vertical; }
.rc-lbl2 { display:block; font-size:14px; font-weight:560; color:var(--hb-t2); margin:14px 0 8px; }
.rc-row3 { display:grid; grid-template-columns:repeat(3, 1fr); gap:12px; }
.rc-err { margin:12px 0 0; color:var(--hb-crit, #e5484d); font-size:15px; }
.rc-howto { margin-top:22px; padding-top:18px; border-top:1px solid color-mix(in srgb, var(--hb-t1) 8%, transparent); font-size:15px; color:var(--hb-t2); line-height:1.5; }
.rc-prev .rc-ph { aspect-ratio:auto; height:190px; }
.rc-prev h3 { margin:14px 0 6px; font-size:26px; font-weight:670; }
.rc-tagrow { display:flex; flex-wrap:wrap; gap:8px; margin:10px 0 14px; }
.rc-tagrow span { height:34px; padding:0 14px; border-radius:999px; display:inline-flex; align-items:center; font-size:14px; background:var(--rc-ac-s); color:var(--rc-ac-ink); }
.rc-mini { list-style:none; margin:0 0 10px; padding:0; columns:2; column-gap:24px; font-size:15px; }
.rc-mini li { padding:5px 0; break-inside:avoid; }
.rc-mini li b { color:var(--hb-t2); font-weight:500; margin-left:4px; }
.rc-foot { margin-top:auto; padding-top:14px; display:flex; gap:12px; justify-content:flex-end; border-top:1px solid color-mix(in srgb, var(--hb-t1) 8%, transparent); }
/* Tablet readability, shared surface tokens and touch-friendly controls. */
.rc-volume { width:96px; display:flex; flex-direction:column; align-items:center; gap:0; flex:none; font-size:14px; color:var(--hb-t2); }
.rc-volume input { width:96px; height:48px; margin:-8px 0 -8px; accent-color:var(--rc-ac); cursor:pointer; }
.rc-step-editor { margin:20px 0 0; padding:16px; border:1px solid var(--hb-edge); border-radius:var(--hb-radius-lg); min-width:0; }
.rc-step-editor legend { font-weight:600; padding:0 8px; }
.rc-step-editor p { font-size:16px; line-height:1.5; margin:0; }
.rc-step-editor small { font-size:12px; color:var(--hb-t2); }
.rc-check-label { min-height:48px; display:flex; align-items:center; gap:10px; font-size:14px; }
.rc-check-label input { width:24px; height:24px; accent-color:var(--rc-ac); }
.rc-chip .ct, .rc-badge, .rc-stats span, .rc-ing .n small, .rc-pip .ov span, .rc-mbar .np span { font-size:14px; }
.rc-seg button { min-height:48px; }
.rc-stepper { height:56px; }
.rc-settings { margin-top:24px; color:var(--hb-t2); font-size:14px; }
.rc-settings summary { cursor:pointer; min-height:48px; display:flex; align-items:center; gap:10px; }
.rc-settings .rc-howto { margin-top:0; }
.rc-tnotify { border:0; margin:var(--hb-sp-3) 0 0; padding:0; }
.rc-tnotify .targets { display:flex; flex-wrap:wrap; gap:var(--hb-sp-2); margin-top:var(--hb-sp-2); }
.rc-add > .rc-box:first-child { align-self:start; }
.rc-remove { margin-top:24px; min-height:48px; color:var(--hb-t2); display:flex; gap:10px; align-items:center; }
/* phone */
@media (max-width: 900px) {
  .rc-top { padding:16px; }
  .rc-search { order:3; max-width:none; flex-basis:100%; }
  .rc-chips { padding:4px 16px 14px; }
  .rc-grid { grid-template-columns:repeat(2, 1fr); gap:18px 12px; padding:0 16px 110px; }
  .rc-card h3 { font-size:16px; }
  .rc-meta { font-size:14px; }
  .rc-detail { display:flex; flex-direction:column; height:auto; padding:0 0 120px; gap:18px; min-height:0; }
  .rc-col { display:block; }
  .rc-hero { height:300px; border-radius:0; }
  .rc-c1 { padding:0 16px; }
  .rc-c1 h1 { font-size:28px; }
  .rc-cta { position:fixed; left:16px; right:16px; bottom:calc(var(--hb-tabbar-height, 0px) + 16px + env(safe-area-inset-bottom)); z-index:30; }
  .rc-cta .rc-pri { height:56px; font-size:17px; box-shadow:var(--hb-elev-2); }
  .rc-panel { margin:0 16px; overflow:visible; }
  .rc-cmain { grid-template-columns:1fr; padding:8px 16px 180px; overflow:auto; }
  .rc-side { display:none; }
  .rc-ctop { padding:14px 16px 8px; gap:10px; }
  .rc-ctop .rt, .rc-wake span { display:none; }
  .rc-ing4 { grid-template-columns:repeat(2, 1fr); }
  .rc-cnav { left:12px; right:12px; bottom:12px; display:flex; flex-wrap:wrap; gap:10px; }
  .rc-cnav .rc-mbar { order:-1; flex-basis:100%; justify-content:center; height:64px; }
  .rc-mbar .np { width:80px; flex:1; }
  .rc-mbar .art { display:none; }
  .rc-mbar { gap:4px; padding:0 8px; }
  .rc-volume { width:64px; }
  .rc-volume input { width:64px; }
  .rc-navbtn { height:64px; min-width:0; flex:1; padding:0 18px; font-size:17px; }
  .rc .rc-navbtn.go { min-width:0; flex:2; }
  .rc-add { grid-template-columns:1fr; padding:6px 16px 40px; }
  .rc-tcard b { font-size:30px; }
}
@media (prefers-reduced-motion: reduce) { .rc *, .rc *::before, .rc *::after { transition:none !important; animation:none !important; } }
/* live airfryer card – state-driven hierarchy: countdown ring while cooking, the instruction is
   the hero when the fryer needs a hand (shake / drawer), solid red band on error, amber when paused.
   Desktop and phone share one type scale; desktop = 2 columns (ring | details + actions). */
.rc-fl { --rc-fl-tone:var(--rc-ac); --rc-fl-ink:var(--rc-ac-ink); --rc-fl-on:var(--rc-on-ac); position:relative; isolation:isolate; overflow:hidden; flex:none; box-sizing:border-box; min-height:264px; margin:4px 32px 20px; padding:30px 40px; border-radius:var(--hb-radius-xl); background:var(--hb-s1); box-shadow:var(--hb-elev-2, var(--hb-elev-1)); display:grid; grid-template-columns:184px minmax(0,1fr) 230px; grid-template-areas:'band band band' 'vis main art'; grid-template-rows:auto 1fr; column-gap:36px; align-items:center; }
.rc-fl::before { content:''; position:absolute; inset:0; z-index:-1; pointer-events:none; background:radial-gradient(260px 220px at calc(100% - 155px) 58%, color-mix(in srgb, var(--rc-fl-tone) 15%, transparent), transparent 75%), radial-gradient(220px 200px at 132px 50%, color-mix(in srgb, var(--rc-fl-tone) 7%, transparent), transparent 75%); }
.rc-fl[data-urgent] { box-shadow:var(--hb-elev-1), inset 0 0 0 1.5px color-mix(in srgb, var(--rc-fl-tone) 50%, transparent); }
.rc-fl[data-phase='action'], .rc-fl[data-phase='drawer'] { --rc-fl-tone:var(--hb-warn); --rc-fl-ink:var(--hb-warn); background:color-mix(in srgb, var(--hb-warn) 8%, var(--hb-s1)); box-shadow:var(--hb-elev-1), inset 0 0 0 2px color-mix(in srgb, var(--hb-warn) 70%, transparent); grid-template-columns:184px minmax(0,1fr); grid-template-areas:'vis main'; }
.rc-fl[data-instruction]::after { content:''; position:absolute; inset:0; border-radius:inherit; pointer-events:none; box-shadow:inset 0 0 0 4px var(--hb-warn); opacity:0; animation:rc-fl-glow 2.4s ease-in-out infinite; }
@keyframes rc-fl-glow { 0%, 100% { opacity:0; } 50% { opacity:.55; } }
.rc-fl[data-phase='error'] { --rc-fl-tone:var(--hb-crit); --rc-fl-ink:var(--hb-crit); grid-template-columns:minmax(0,1fr); grid-template-areas:'band' 'main'; padding-top:0; align-items:start; row-gap:18px; min-height:0; }
.rc-fl[data-phase='done'], .rc-fl[data-phase='warm'] { --rc-fl-tone:var(--hb-ok); --rc-fl-ink:var(--hb-ok); --rc-fl-on:var(--hb-on-ok); }
.rc-fl[data-phase='paused'] { --rc-fl-tone:var(--hb-warn); --rc-fl-ink:var(--hb-t1); --rc-fl-on:var(--hb-on-warn); }
.rc-fl-vis { grid-area:vis; display:grid; place-items:center; }
.rc-fl-main { grid-area:main; min-width:0; display:flex; flex-direction:column; align-items:flex-start; gap:20px; }
.rc-fl-head { display:flex; flex-direction:column; align-items:flex-start; gap:6px; min-width:0; max-width:100%; }
.rc-fl h2 { margin:0; font-size:30px; font-weight:650; letter-spacing:-.022em; line-height:1.15; color:var(--hb-t1); }
.rc-fl[data-instruction] h2 { color:var(--rc-fl-ink); font-size:28px; }
.rc-fl-pill { display:inline-flex; align-items:center; gap:8px; padding:5px 12px 5px 10px; border-radius:var(--hb-radius-pill); font-size:14px; font-weight:650; color:var(--hb-t1); background:var(--hb-fill-strong); }
.rc-fl-pill::before { content:''; width:8px; height:8px; border-radius:50%; background:var(--rc-fl-tone); box-shadow:0 0 0 3px color-mix(in srgb, var(--rc-fl-tone) 28%, transparent), 0 0 10px var(--rc-fl-tone); }
.rc-fl[data-phase='cooking'] .rc-fl-pill::before, .rc-fl[data-phase='preheat'] .rc-fl-pill::before { animation:rc-fl-live 2s ease-in-out infinite; }
@keyframes rc-fl-live { 0%, 100% { opacity:1; } 50% { opacity:.35; } }
.rc-fl-meta { margin:0; max-width:100%; font-size:15px; font-weight:500; color:var(--hb-t2); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.rc-fl-body { align-self:stretch; min-width:0; display:flex; flex-direction:column; align-items:flex-start; gap:16px; }
.rc-fl-hint { margin:0; font-size:16px; color:var(--hb-t2); line-height:1.45; max-width:60ch; }
.rc-fl[data-instruction] .rc-fl-hint, .rc-fl[data-phase='error'] .rc-fl-hint { color:var(--hb-t1); }
.rc-fl-ringwrap { position:relative; display:grid; place-items:center; }
.rc-fl .rc-fl-ring { --hb-ring-ink:var(--rc-ac); }
.rc-fl-ring .hb-ring-c small { margin-top:2px; font-size:14px; font-weight:500; color:var(--hb-t2); }
.rc-fl-time { font-size:46px; font-weight:500; letter-spacing:-.035em; line-height:1.15; color:var(--hb-t1); }
.rc-fl-ring svg.rc-i { width:60px; height:60px; stroke-width:2.2; color:var(--hb-ok); }
.rc-fl-badge { position:absolute; top:6px; right:6px; display:grid; place-items:center; width:38px; height:38px; border-radius:50%; background:var(--hb-warn); color:var(--hb-on-warn); box-shadow:0 0 0 4px var(--hb-s1); }
.rc-fl-badge svg.rc-i { width:18px; height:18px; }
.rc-fl-nw { white-space:nowrap; }
.rc-fl-facts { display:flex; flex-wrap:wrap; align-items:flex-start; gap:10px 44px; }
.rc-fl-fact { display:flex; flex-direction:column; gap:3px; font-variant-numeric:tabular-nums; font-size:22px; font-weight:500; color:var(--hb-t2); }
.rc-fl-fact small { font-size:13px; font-weight:500; color:var(--hb-t2); }
.rc-fl-fact b { color:var(--hb-t1); font-weight:650; }
.rc-fl-steps { align-self:stretch; }
.rc-fl .hb-steptrack { max-width:none; margin-top:0; }
.rc-fl .hb-steptrack-sum { display:none !important; }
.rc-fl .hb-stepper[data-compact] .hb-step .hb-step-t { display:block !important; }
.rc-fl .hb-stepper[data-compact] { display:flex; flex-wrap:wrap; gap:0; }
/* phases as a quiet text line (Ohřev → Pečení → Hotovo) – the ring is the only progress display */
.rc-fl .hb-stepper[data-compact] .hb-step { flex:none; flex-direction:row; align-items:center; gap:0; font-size:13px; font-weight:500; color:var(--hb-t2); }
.rc-fl .hb-stepper[data-compact] .hb-step-n { display:none; }
.rc-fl .hb-stepper[data-compact] .hb-step + .hb-step::before { content:'→'; margin:0 8px; color:var(--hb-t2); opacity:.6; font-weight:400; }
.rc-fl .hb-stepper[data-compact] .hb-step[data-state='active'] { color:var(--rc-fl-ink); font-weight:650; }
.rc-fl-band { grid-area:band; display:flex; align-items:center; gap:10px; margin:0 -40px; padding:16px 40px; background:color-mix(in srgb, var(--hb-crit) 80%, black); color:#fff; }
.rc-fl-band h2 { color:inherit; font-size:20px; }
.rc-fl-band svg.rc-i { width:22px; height:22px; flex:none; }
.rc-fl-code { margin-left:auto; font-size:14px; font-weight:500; opacity:.85; white-space:nowrap; }
.rc-fl .hb-btn svg.rc-i path { fill:currentColor; stroke:none; }
.rc-fl-badge svg.rc-i path { fill:currentColor; stroke:none; }
.rc-fl-actions { --hb-ac:var(--rc-fl-tone); --hb-on-ac:var(--rc-fl-on); align-self:stretch; display:flex; flex-wrap:wrap; align-items:center; gap:10px 12px; }
.rc-fl-guide { margin:0; flex:1 1 220px; display:flex; align-items:center; gap:8px; font-size:15px; font-weight:550; color:var(--hb-t1); }
.rc-fl-guide svg.rc-i { width:18px; height:18px; flex:none; color:var(--rc-fl-ink); }
.rc-fl[data-phase='paused'] .rc-fl-guide svg.rc-i { color:var(--hb-warn); }
.rc-fl .hb-btn { min-width:132px; }
.rc-fl .hb-btn.rc-fl-stop[data-tone='danger'] { color:var(--hb-crit); }
/* Fryer illustration (FryerArt): theme-neutral shell, tone glow while heating */
.rc-fa { display:block; overflow:visible; }
.rc-fl-side-art { grid-area:art; justify-self:center; width:190px; height:auto; }
.rc-fl-hero-art { width:176px; height:auto; }
.rc-fa-top { stop-color:color-mix(in srgb, var(--hb-t1) 22%, var(--hb-s1)); }
.rc-fa-bot { stop-color:color-mix(in srgb, var(--hb-t1) 11%, var(--hb-s1)); }
.rc-fa-body { stroke:color-mix(in srgb, var(--hb-t1) 16%, transparent); stroke-width:1; }
.rc-fa-panel { fill:color-mix(in srgb, var(--hb-t1) 6%, #0b0d10 70%); }
.rc-fa-led { fill:var(--rc-fl-tone); }
.rc-fa-panel-bar { fill:color-mix(in srgb, white 30%, transparent); }
.rc-fa-cavity { fill:#07090c; opacity:0; }
.rc-fa-front { fill:color-mix(in srgb, var(--hb-t1) 15%, var(--hb-s1)); stroke:color-mix(in srgb, var(--hb-t1) 18%, transparent); stroke-width:1; }
.rc-fa-handle { fill:color-mix(in srgb, var(--hb-t1) 24%, var(--hb-s1)); }
.rc-fa-shadow { fill:color-mix(in srgb, black 34%, transparent); filter:blur(2px); }
.rc-fa-sheen { fill:white; opacity:.06; }
.rc-fa-slit { fill:var(--rc-fl-tone); opacity:0; }
.rc-fa[data-phase='cooking'] .rc-fa-slit, .rc-fa[data-phase='preheat'] .rc-fa-slit { opacity:.85; }
.rc-fa-rim { fill:none; stroke:white; stroke-opacity:.14; stroke-width:1.2; stroke-linecap:round; }
.rc-fa-foot { fill:color-mix(in srgb, var(--hb-t1) 30%, var(--hb-s1)); }
.rc-fa-glow0 { stop-color:var(--rc-fl-tone); stop-opacity:.34; }
.rc-fa-glow1 { stop-color:var(--rc-fl-tone); stop-opacity:0; }
.rc-fa-heat { opacity:0; transition:opacity var(--hb-dur-slow, .4s); }
.rc-fa[data-phase='cooking'] .rc-fa-heat, .rc-fa[data-phase='preheat'] .rc-fa-heat { opacity:1; animation:rc-fa-breathe 5s ease-in-out infinite; }
.rc-fa[data-phase='done'] .rc-fa-heat, .rc-fa[data-phase='warm'] .rc-fa-heat { opacity:.6; }
@keyframes rc-fa-breathe { 0%, 100% { opacity:.7; } 50% { opacity:1; } }
.rc-fa[data-out] .rc-fa-cavity { opacity:1; }
.rc-fa[data-out] .rc-fa-drawer { transform:translateY(9px) scale(1.06); transform-origin:70px 133px; }
.rc-fa-bits rect { fill:color-mix(in srgb, #e9b04a 85%, var(--hb-t1)); }
.rc-fa[data-phase='action'] .rc-fa-bits { animation:rc-fa-hop 1.6s var(--hb-ease-out, ease-out) infinite; transform-origin:70px 66px; }
@keyframes rc-fa-hop { 0%, 100% { transform:translateY(4px); } 35% { transform:translateY(-7px); } 60% { transform:translateY(0); } }
/* Owner's product photo (HA /local/homebrain/airfryer/) – replaces the SVG fryer when a manifest exists */
.rc-fp { --rc-fp-h:212px; position:relative; display:grid; place-items:center; }
/* soft backdrop so the black appliance separates from dark cards (faint grey disc on light) */
.rc-fp::before { content:''; position:absolute; left:50%; top:54%; width:120%; aspect-ratio:1; translate:-50% -50%; border-radius:50%; pointer-events:none; background:radial-gradient(closest-side, color-mix(in srgb, var(--hb-t1) 11%, transparent), color-mix(in srgb, var(--hb-t1) 4%, transparent) 62%, transparent); }
.rc-fp-frame { z-index:0; }
/* with a photo the neutral backdrop above replaces the tone glow behind the illustration */
.rc-fl:has(> .rc-fp.rc-fl-side-art)::before { background:radial-gradient(220px 200px at 132px 50%, color-mix(in srgb, var(--rc-fl-tone) 7%, transparent), transparent 75%); }
.rc-fp.rc-fl-side-art, .rc-fp.rc-fl-hero-art { width:auto; }
.rc-fp.rc-fl-hero-art { --rc-fp-h:200px; }
.rc-fp-frame { position:relative; display:inline-block; line-height:0; }
.rc-fp-img { display:block; height:var(--rc-fp-h); width:auto; max-width:none; filter:drop-shadow(0 0 .6px color-mix(in srgb, var(--hb-t1) 40%, transparent)) drop-shadow(0 12px 20px rgb(0 0 0 / .22)); transition:filter var(--hb-dur-slow, .4s), opacity var(--hb-dur-slow, .4s); }
.rc-fp-heat, .rc-fp-tint, .rc-fp-display { position:absolute; pointer-events:none; opacity:0; transition:opacity var(--hb-dur-slow, .4s); }
/* warm light leaking at the drawer seam and onto the counter while heating – no flames */
.rc-fp-heat { filter:blur(3px); background:radial-gradient(56% 16% at 50% 1%, rgb(255 140 60 / .8), transparent 72%); mix-blend-mode:screen; }
.rc-fp-tint { inset:0; mask-size:100% 100%; mask-repeat:no-repeat; -webkit-mask-size:100% 100%; -webkit-mask-repeat:no-repeat; background:var(--rc-fl-tone); mix-blend-mode:screen; }
/* the photo's display shows a fixed demo value – cover the glass and light only the ring in the card tone */
.rc-fp { --rc-fp-glass:#0b0d10; }
/* white appliance: light glass display, darker hairline + counter shadow so it never melts into a white card */
.rc-fp[data-finish='light'] { --rc-fp-glass:#dcdddf; }
.rc-fp[data-finish='light']::before { background:radial-gradient(closest-side, color-mix(in srgb, var(--hb-t1) 10%, transparent) 0 52%, color-mix(in srgb, var(--hb-t1) 5%, transparent) 74%, transparent); }
.rc-fp[data-finish='light'] .rc-fp-img { filter:drop-shadow(0 0 1px color-mix(in srgb, var(--hb-t1) 30%, transparent)) drop-shadow(0 10px 16px rgb(0 0 0 / .26)); }
.rc-fp[data-finish='light'] .rc-fp-heat { mix-blend-mode:multiply; background:radial-gradient(56% 14% at 50% 1%, rgb(255 132 48 / .6), transparent 72%); }
.rc-fp-display { border-radius:50%; background:radial-gradient(circle at 36% 30%, rgb(255 255 255 / .1), transparent 26%), radial-gradient(closest-side, var(--rc-fp-glass) 0 60%, color-mix(in srgb, var(--rc-fl-tone) 75%, transparent) 70%, transparent 86%); opacity:.92; }
.rc-fp[data-phase='cooking'] .rc-fp-heat, .rc-fp[data-phase='preheat'] .rc-fp-heat { opacity:.9; animation:rc-fp-breathe 6s ease-in-out infinite; }
@keyframes rc-fp-breathe { 0%, 100% { opacity:.55; } 50% { opacity:.95; } }
.rc-fp[data-phase='warm'] .rc-fp-heat { opacity:.35; }
.rc-fp[data-phase='paused'] .rc-fp-img { filter:brightness(.7) saturate(.7) drop-shadow(0 0 .6px color-mix(in srgb, var(--hb-t1) 40%, transparent)); }
.rc-fp[data-out] .rc-fp-tint { opacity:.1; }
/* error: a clean red outline + red glow around the silhouette – the photo itself is never tinted (reads brown) */
.rc-fp[data-phase='error'] .rc-fp-img, .rc-fp[data-finish][data-phase='error'] .rc-fp-img { filter:drop-shadow(0 0 1.2px var(--hb-crit)) drop-shadow(0 0 1.2px var(--hb-crit)) drop-shadow(0 0 10px color-mix(in srgb, var(--hb-crit) 55%, transparent)); }
.rc-fp[data-phase='error'] .rc-fp-tint, .rc-fp[data-phase='error'] .rc-fp-heat { opacity:0; }
.rc-fp[data-phase='off'] .rc-fp-img, .rc-fp[data-phase='idle'] .rc-fp-img { filter:grayscale(1); opacity:.6; }
.rc-fp[data-phase='off'] .rc-fp-display, .rc-fp[data-phase='idle'] .rc-fp-display { background:radial-gradient(closest-side, var(--rc-fp-glass) 0 66%, transparent 80%); }
.rc-fp[data-nudge] .rc-fp-frame { animation:rc-fp-nudge 2.4s ease-in-out infinite; }
@keyframes rc-fp-nudge { 0%, 60%, 100% { transform:translateY(0); } 30% { transform:translateY(4px); } }
/* desktop: content column hugs its content and the photo sits right next to it (no dead band between buttons and photo) */
@media (min-width: 1101px) {
  .rc-fl:has(> .rc-fp.rc-fl-side-art):not([data-phase='error']) { grid-template-columns:184px minmax(0,max-content) 250px; justify-content:center; column-gap:48px; }
  .rc-fl[data-phase='error']:has(> .rc-fp.rc-fl-side-art) { grid-template-columns:minmax(0,max-content) minmax(250px,1fr); }
  .rc-fl[data-phase='error'] > .rc-fp.rc-fl-side-art { justify-self:center; }
  .rc-fl:has(> .rc-fp.rc-fl-side-art)::before { background:none; }
}
.rc-fp.rc-fl-side-art { --rc-fp-h:232px; }
.rc-fl[data-phase='error']:has(> .rc-fl-side-art) { grid-template-columns:minmax(0,1fr) 250px; grid-template-areas:'band band' 'main art'; }
@media (max-width: 1100px) and (min-width: 641px) { .rc-fl { grid-template-columns:184px minmax(0,1fr); grid-template-areas:'band band' 'vis main'; } .rc-fl-side-art { display:none; } .rc-fl[data-phase='error']:has(> .rc-fl-side-art) { grid-template-columns:minmax(0,1fr); grid-template-areas:'band' 'main'; } }
@media (max-width: 640px) {
  .rc-fl { min-height:0; margin:4px 16px 14px; padding:18px; grid-template-columns:104px minmax(0,1fr); grid-template-areas:none; grid-template-rows:none; column-gap:20px; row-gap:16px; }
  .rc-fl::before { background:radial-gradient(160px 140px at calc(100% - 44px) 46px, color-mix(in srgb, var(--rc-fl-tone) 16%, transparent), transparent 75%); }
  .rc-fl-head { padding-right:78px; }
  .rc-fl .hb-btn { min-width:0; }
  .rc-fl[data-phase='action'], .rc-fl[data-phase='drawer'] { grid-template-columns:104px minmax(0,1fr); grid-template-areas:none; }
  .rc-fl[data-phase='error'] { grid-template-columns:minmax(0,1fr); padding-top:0; }
  .rc-fl-band { grid-area:auto; grid-column:1 / -1; margin:0 -18px; padding:12px 18px; }
  /* phone: head on top, ring | stats, steps + actions full width */
  .rc-fl-main, .rc-fl-body { display:contents; }
  .rc-fl-head, .rc-fl-actions, .rc-fl-main > .rc-fl-meta, .rc-fl-steps, .rc-fl-hint { grid-column:1 / -1; }
  .rc-fl-vis { grid-area:auto; grid-column:1; grid-row:2; align-self:center; }
  .rc-fl-facts { grid-column:2; grid-row:2; align-self:center; flex-direction:column; gap:12px; }
  .rc-fl[data-instruction] .rc-fl-hint { grid-column:2; grid-row:2; align-self:center; }
  .rc-fl[data-instruction] .rc-fl-facts { grid-column:1 / -1; grid-row:auto; flex-direction:row; }
  .rc-fl[data-phase='error'] .rc-fl-hint { grid-row:auto; }
  .rc-fl-steps { max-width:none; }
  .rc-fl h2 { font-size:25px; }
  .rc-fl[data-instruction] h2 { font-size:23px; }
  .rc-fl-band h2 { font-size:19px; }
  .rc-fl .rc-fl-ring { --hb-ring-size:104px !important; }
  .rc-fl-time { font-size:28px; }
  .rc-fl-fact { font-size:18px; }
  .rc-fl-ring svg.rc-i { width:40px; height:40px; }
  .rc-fl-badge { top:0; right:0; width:30px; height:30px; box-shadow:0 0 0 3px var(--hb-s1); }
  .rc-fl-badge svg.rc-i { width:14px; height:14px; }
  .rc-fl-hero-art { width:104px; }
  .rc-fl-side-art { display:block; grid-area:auto; position:absolute; top:12px; right:14px; width:70px; }
  .rc-fp.rc-fl-side-art { --rc-fp-h:88px; width:auto; top:14px; right:16px; }
  .rc-fp.rc-fl-hero-art { --rc-fp-h:124px; }
  .rc-fl:has(> .rc-fp.rc-fl-side-art)::before { background:none; }
  .rc-fl:has(> .rc-fp.rc-fl-side-art) .rc-fl-head { padding-right:96px; }
  .rc-fl[data-phase='error']:has(> .rc-fl-side-art) { grid-template-columns:minmax(0,1fr); grid-template-areas:none; }
  .rc-fl[data-phase='error'] > .rc-fl-side-art { top:62px; --rc-fp-h:80px; }
  .rc-fl[data-phase='error']:has(> .rc-fp.rc-fl-side-art) :is(.rc-fl-meta, .rc-fl-hint) { padding-right:88px; box-sizing:border-box; white-space:normal; }
  .rc-fl-actions > .hb-btn { flex:1 1 0; }
}
@media (prefers-reduced-motion: reduce) { .rc-fl .hb-ring-arc { transition:none !important; } .rc-fa *, .rc-fp, .rc-fp *, .rc-fl-pill::before, .rc-fl::after { animation:none !important; transition:none !important; } }
`;

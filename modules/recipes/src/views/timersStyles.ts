export const kitchenTimersLinkStyles = `
.kt-link-n { min-width:22px; height:22px; padding:0 6px; margin-left:2px; border-radius:999px; display:inline-grid; place-items:center; font-size:13px; font-weight:700; color:var(--rc-on-ac); background:var(--rc-ac); box-sizing:border-box; }
`;

/** Minutky + Vajíčka (scoped `kt-` classes, HomeBrain tokens; shared controls from @homebrain/ui). */
export const kitchenTimersStyles = `
.kt { padding-bottom:32px; }
.kt-top { gap:12px; }
.kt-grid { display:grid; grid-template-columns:repeat(3, minmax(0,1fr)); grid-template-areas:'run run run' 'eggs eggs quick'; gap:20px; padding:4px 32px 0; align-items:start; }
.kt-run { grid-area:run; min-width:0; }
.kt-eggs { grid-area:eggs; }
.kt-quick { grid-area:quick; }
.kt-strip { margin-top:0; display:grid; grid-template-columns:repeat(3, minmax(0,1fr)); gap:20px; }
.kt .rc-tcard { gap:12px; }
.kt .rc-tcard b { font-size:34px; }
.kt .rc-tcard .tx { min-width:0; }
.kt .rc-tcard .tx span { display:block; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.kt .rc-tcard .hb-btn[data-size='sm'] { padding-inline:12px; }
.kt-eggs { display:grid; grid-template-columns:minmax(0,1.1fr) minmax(0,1fr); grid-template-areas:'head head' 'form result' 'form why' 'form cta'; grid-template-rows:auto 1fr auto auto; gap:14px 28px; align-content:start; }
.kt-eggs-head { grid-area:head; }
.kt-eggs-form { grid-area:form; }
.kt-eggs .kt-result { grid-area:result; flex-direction:column; align-items:flex-start; justify-content:center; gap:2px; align-self:stretch; padding:18px 22px; border-radius:var(--hb-radius-lg); background:color-mix(in srgb, var(--rc-ac) 8%, var(--hb-s1)); box-shadow:inset 0 0 0 1px color-mix(in srgb, var(--rc-ac) 16%, transparent); }
.kt-why { grid-area:why; }
.kt-eggs > .hb-btn { grid-area:cta; align-self:end; }
.kt-empty { margin:0; padding:18px 20px; border-radius:var(--hb-radius-lg); color:var(--hb-t2); font-size:15px; background:color-mix(in srgb, var(--hb-t1) 5%, var(--hb-s1)); }
.kt-card { min-width:0; display:flex; flex-direction:column; gap:16px; padding:22px; border-radius:var(--hb-radius-xl, 22px); background:var(--hb-s1); box-shadow:var(--hb-elev-1); box-sizing:border-box; }
.kt-card h2 { margin:0; font-size:20px; font-weight:650; letter-spacing:-.01em; }
.kt-eggs-head { display:flex; align-items:center; gap:10px; }
.kt-badge { display:inline-flex; align-items:center; height:24px; padding:0 10px; border-radius:999px; font-size:13px; font-weight:600; color:var(--hb-warn); background:color-mix(in srgb, var(--hb-warn) 14%, transparent); }
.kt-eggs-form { display:flex; flex-direction:column; gap:14px; }
.kt-eggs-form .hb-seg-wrap { min-width:0; }
.kt-row { display:flex; align-items:center; justify-content:space-between; gap:12px 20px; flex-wrap:wrap; }
.kt-switch { display:inline-flex; align-items:center; gap:10px; font-size:15px; font-weight:550; }
.kt-count { display:inline-flex; align-items:center; gap:10px; }
.kt-count output { min-width:52px; text-align:center; font-size:17px; font-weight:620; font-variant-numeric:tabular-nums; }
.kt-result { display:flex; align-items:baseline; gap:14px; flex-wrap:wrap; padding:6px 2px 0; }
.kt-time { font-size:64px; font-weight:560; letter-spacing:-.03em; line-height:1.15; font-variant-numeric:tabular-nums; color:var(--rc-ac-ink); }
.kt-result span { font-size:16px; color:var(--hb-t2); }
.kt-why { font-size:14px; color:var(--hb-t2); }
.kt-why summary { cursor:pointer; font-weight:600; color:var(--hb-t1); width:max-content; }
.kt-why ul { margin:8px 0 0; padding-left:18px; display:flex; flex-direction:column; gap:4px; line-height:1.45; }
.kt-presets { display:grid; grid-template-columns:repeat(4, minmax(0,1fr)); gap:8px; }
.kt-field { display:flex; flex-direction:column; gap:6px; min-width:0; flex:1; }
.kt-field span { font-size:13px; font-weight:600; color:var(--hb-t2); }
.kt-field input { height:44px; padding:0 14px; border-radius:var(--hb-radius-md, 12px); border:0; font:inherit; font-size:16px; color:var(--hb-t1); background:var(--rc-field); box-shadow:inset 0 0 0 1px color-mix(in srgb, var(--hb-t1) 12%, transparent); box-sizing:border-box; width:100%; }
.kt-field input:focus-visible { outline:2px solid var(--rc-ac); outline-offset:1px; }
.kt-custom { display:flex; align-items:flex-end; gap:10px; }
.kt-custom .hb-btn { flex:none; }
.kt-presets .hb-btn { width:100%; background:var(--rc-field); box-shadow:inset 0 0 0 1px color-mix(in srgb, var(--hb-t1) 12%, transparent); font-variant-numeric:tabular-nums; }
.kt-switch small { display:block; font-size:13px; font-weight:500; color:var(--hb-t2); }
.kt-count { padding:4px; border-radius:999px; background:var(--rc-field); }
@media (max-width: 1100px) and (min-width: 761px) {
  .kt-grid { grid-template-columns:minmax(0,1fr); grid-template-areas:'run' 'eggs' 'quick'; }
  .kt-strip { grid-template-columns:repeat(2, minmax(0,1fr)); }
}
@media (max-width: 760px) {
  .kt-grid { grid-template-columns:minmax(0,1fr); grid-template-areas:'run' 'eggs' 'quick'; padding:4px 16px 0; gap:16px; }
  .kt-strip { grid-template-columns:minmax(0,1fr); gap:12px; }
  .kt .rc-tcard { flex-wrap:wrap; row-gap:8px; }
  .kt .rc-tcard .tx { flex:1 1 calc(100% - 80px); }
  .kt .rc-tcard .tx + * { margin-left:auto; }
  .kt-eggs { grid-template-columns:minmax(0,1fr); grid-template-areas:'head' 'form' 'result' 'why' 'cta'; }
  .kt-card { padding:18px 16px; }
  .kt-time { font-size:52px; }
  .kt-eggs-form .hb-seg button { padding-inline:6px; }
}
`;

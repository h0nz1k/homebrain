export const serverStyles = `
.srv {
  color: var(--hb-t1);
  max-width: 1440px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: var(--hb-sp-4, 16px);
}
.srv * { box-sizing: border-box; }
.srv :where(h2, h3, p, ul) { margin: 0; }
.srv :where(p, small, li) { text-wrap: pretty; }
.srv ul { list-style: none; padding: 0; }
.srv-loading { display: flex; flex-direction: column; gap: 16px; }

.srv-hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px 32px;
  flex-wrap: wrap;
  padding: 28px 32px;
}
.srv-hero-copy { display: flex; flex-direction: column; align-items: flex-start; gap: 8px; min-width: 0; flex: 1 1 320px; }
.srv-hero h2 { font-size: var(--hb-type-display, 34px); line-height: 1.15; letter-spacing: -0.02em; font-weight: 650; }
.srv-hero p { color: var(--hb-t2); font-size: 15px; }
.srv-hero .srv-more { color: var(--hb-t1); }
.srv-meta { display: flex; flex-wrap: wrap; column-gap: 0.35em; }
.srv-meta > span { white-space: nowrap; }
.srv-rings { display: flex; gap: 20px; flex-wrap: wrap; }
.srv-ring { display: flex; flex-direction: column; align-items: center; gap: 6px; }
.srv-ring b { font-size: 16px; font-weight: 650; font-variant-numeric: tabular-nums; }
.srv-ring > span { font-size: 13px; color: var(--hb-t2); }

.srv-tiles { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; }
.srv-tile { display: flex; flex-direction: column; gap: 6px; padding: 20px; min-width: 0; }
.srv-tile h3, .srv-panel h3 { font-size: 14px; font-weight: 600; color: var(--hb-t2); letter-spacing: 0; }
.srv-value { font-size: 34px; line-height: 1.15; font-weight: 650; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; white-space: nowrap; }
.srv-value span { color: var(--hb-t2); font-weight: 500; margin-right: 4px; }
.srv-tile[data-tone='warn'] .srv-value { color: var(--hb-warn); }
.srv-tile[data-tone='crit'] .srv-value { color: var(--hb-crit); }
.srv-sub { color: var(--hb-t2); font-size: 14px; font-variant-numeric: tabular-nums; }
.srv-trend { display: flex; flex-direction: column; gap: 4px; margin-top: auto; padding-top: 10px; color: var(--hb-ac); min-height: 70px; }
.srv-tile[data-tone='warn'] .srv-trend { color: var(--hb-warn); }
.srv-tile[data-tone='crit'] .srv-trend { color: var(--hb-crit); }
.srv-trend svg { width: 100%; height: 44px; display: block; }
.srv-trend small { display: flex; justify-content: space-between; color: var(--hb-t2); font-size: 12px; }
.srv-trend[data-empty] { justify-content: flex-end; }

.srv-bar { display: block; height: 8px; border-radius: 99px; background: color-mix(in srgb, var(--hb-t1) 11%, transparent); overflow: hidden; }
.srv-bar i { display: block; height: 100%; border-radius: inherit; background: var(--hb-ac); transition: width var(--hb-dur-2, 240ms) var(--hb-ease-out, ease-out); }
.srv-bar[data-tone='ok'] i { background: var(--hb-ac); }
.srv-bar[data-tone='warn'] i { background: var(--hb-warn); }
.srv-bar[data-tone='crit'] i { background: var(--hb-crit); }
.srv-bar[data-tone='neutral'] i { background: var(--hb-ac); }

.srv-columns { display: grid; grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); gap: 16px; align-items: stretch; }
.srv-panel { display: flex; flex-direction: column; gap: 14px; padding: 20px 24px; min-width: 0; }
.srv-panel-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.srv-list { display: flex; flex-direction: column; gap: 16px; }
.srv-list > li { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.srv-list small { color: var(--hb-t2); font-size: 13px; font-variant-numeric: tabular-nums; }
.srv-row-head { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
.srv-row-head b { font-weight: 600; font-size: 15px; }
.srv-row-val { margin-left: auto; font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; font-size: 14px; }
.srv-micro { color: var(--hb-t2); font-size: 12px; white-space: nowrap; }
.srv-note { color: var(--hb-t2); font-size: 14px; line-height: 1.45; }
.srv-vms > li { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr) minmax(0, 1fr); align-items: center; gap: 8px 20px; padding-top: 14px; border-top: 1px solid var(--hb-edge, color-mix(in srgb, var(--hb-t1) 10%, transparent)); }
.srv-vms > li:first-child { border-top: 0; padding-top: 0; }
.srv-vm-name { display: flex; flex-direction: column; min-width: 0; }
.srv-vm-name b { font-weight: 600; font-size: 15px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.srv-vm-metric { display: grid; grid-template-columns: 34px minmax(0, 1fr) 72px; align-items: center; gap: 8px; }
.srv-vm-metric .srv-row-val { text-align: right; }

@media (max-width: 1100px) {
  .srv-tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .srv-columns { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 560px) {
  .srv-hero { padding: 22px 20px; gap: 20px; }
  .srv-hero h2 { font-size: 26px; }
  .srv-rings { width: 100%; justify-content: space-between; gap: 4px; flex-wrap: nowrap; }
  .srv-ring b { font-size: 14px; }
  .srv-tiles { gap: 12px; }
  .srv-tile { padding: 16px 14px; }
  .srv-value { font-size: 26px; }
  .srv-sub { font-size: 13px; }
  .srv-cores { display: none; }
  .srv-panel { padding: 18px 16px; }
  .srv-vms > li { grid-template-columns: minmax(0, 1fr); gap: 8px; }
}
@media (prefers-reduced-motion: reduce) {
  .srv-bar i { transition: none !important; }
}
`;

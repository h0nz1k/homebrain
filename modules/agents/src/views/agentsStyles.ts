export const agentsStyles = `
.agt {
  color: var(--hb-t1);
  max-width: 1440px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: var(--hb-sp-4, 16px);
}
.agt * { box-sizing: border-box; }
.agt :where(h2, h3, p, ul, dl) { margin: 0; }
.agt :where(p, small, li) { text-wrap: pretty; }
.agt ul { list-style: none; padding: 0; }
.agt-loading { display: flex; flex-direction: column; gap: 16px; }

.agt-hero { display: flex; flex-direction: column; gap: 8px; padding: 28px 32px; }
.agt-hero-copy { display: flex; flex-direction: column; align-items: flex-start; gap: 8px; min-width: 0; }
.agt-hero h2 { font-size: var(--hb-type-display, 34px); line-height: 1.15; letter-spacing: -0.02em; font-weight: 650; overflow-wrap: anywhere; }
.agt-hero p { color: var(--hb-t2); font-size: 15px; }
.agt-meta { display: flex; flex-wrap: wrap; column-gap: 0.35em; }
.agt-meta > span { white-space: nowrap; }
.agt-more { display: flex; flex-direction: column; gap: 2px; font-size: 15px; }
.agt-more li { padding-left: 14px; position: relative; overflow-wrap: anywhere; }
.agt-more li::before { content: ''; position: absolute; left: 2px; top: 0.6em; width: 5px; height: 5px; border-radius: 50%; background: var(--hb-t2); }
.agt-hero .hb-btn { margin-top: 4px; }
.agt-hero-fix[data-tone='crit'] { background: var(--hb-crit); color: var(--hb-on-crit); --agt-fix-tone: var(--hb-crit); }
.agt-hero-fix[data-tone='warn'] { background: var(--hb-warn); color: var(--hb-on-warn); --agt-fix-tone: var(--hb-warn); }
.agt-hero-fix[data-tone]:hover:not(:disabled) { background: color-mix(in srgb, var(--agt-fix-tone) 88%, var(--hb-t1)); }
.agt-hero-fix[data-tone]:focus-visible { outline: 3px solid var(--agt-fix-tone); outline-offset: 3px; }

.agt-panel { display: flex; flex-direction: column; gap: 14px; padding: 20px 24px; min-width: 0; }
.agt-panel h3 { font-size: 14px; font-weight: 600; color: var(--hb-t2); letter-spacing: 0; }
.agt-panel-head { display: flex; align-items: baseline; justify-content: space-between; flex-wrap: wrap; gap: 4px 12px; }
.agt-panel[tabindex='-1']:focus-visible { outline: 2px solid var(--hb-ac); outline-offset: 2px; }
.agt-panel[tabindex='-1']:focus:not(:focus-visible) { outline: none; }
.agt-micro { color: var(--hb-t2); font-size: 13px; font-variant-numeric: tabular-nums; }
.agt-forecast { color: var(--hb-warn); font-weight: 600; }
.agt-note { color: var(--hb-t2); font-size: 14px; line-height: 1.45; }

/* 3 columns on wide (6 quotas → 2×3, no orphan), 2 on mid, 1 on narrow. */
.agt-quotas { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.agt-quota { display: flex; flex-direction: column; gap: 8px; padding: 16px; min-width: 0; border-radius: var(--hb-radius-md, 14px); background: color-mix(in srgb, var(--hb-t1) 4%, transparent); border: 1px solid var(--hb-edge, color-mix(in srgb, var(--hb-t1) 10%, transparent)); }
.agt-quota[data-tone='warn'] { box-shadow: inset 4px 0 0 var(--hb-warn); }
.agt-quota[data-tone='crit'] { box-shadow: inset 4px 0 0 var(--hb-crit); background: color-mix(in srgb, var(--hb-crit) 8%, transparent); }
.agt-q-head { display: flex; align-items: center; gap: 8px; min-width: 0; }
.agt-q-head b { font-weight: 600; font-size: 15px; overflow-wrap: anywhere; min-width: 0; }
.agt-q-window { margin-left: auto; flex: none; }
.agt-q-value { display: flex; align-items: baseline; gap: 6px; }
.agt-q-value strong { font-size: 28px; line-height: 1.15; font-weight: 650; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
.agt-q-value span { color: var(--hb-t2); font-size: 14px; }
.agt-quota[data-tone='warn'] .agt-q-value strong { color: var(--hb-warn); }
.agt-quota[data-tone='crit'] .agt-q-value strong { color: var(--hb-crit); }
.agt-quota small { color: var(--hb-t2); font-size: 13px; font-variant-numeric: tabular-nums; }
.agt-q-tags { display: flex; flex-wrap: wrap; gap: 6px; }

.agt-bar { display: block; height: 8px; border-radius: 99px; background: color-mix(in srgb, var(--hb-t1) 11%, transparent); overflow: hidden; }
.agt-bar i[style*='width: 0%'] { display: none; }
.agt-bar i { display: block; height: 100%; border-radius: inherit; background: var(--hb-ac); transition: width var(--hb-dur-2, 240ms) var(--hb-ease-out, ease-out); }
.agt-bar[data-tone='warn'] i { background: var(--hb-warn); }
.agt-bar[data-tone='crit'] i { background: var(--hb-crit); }

.agt-columns { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 16px; align-items: start; }
.agt-rows { display: flex; flex-direction: column; }
.agt-rows > li { display: flex; align-items: center; gap: 12px; min-height: 52px; padding: 8px 0; border-top: 1px solid var(--hb-edge, color-mix(in srgb, var(--hb-t1) 10%, transparent)); min-width: 0; }
.agt-rows > li:first-child { border-top: 0; }
.agt-row-name { display: flex; flex-direction: column; min-width: 0; flex: 1 1 auto; }
.agt-row-name b { font-weight: 600; font-size: 15px; overflow-wrap: anywhere; }
.agt-row-name small { color: var(--hb-t2); font-size: 13px; }
.agt-rows > li[data-state='stopped'] .agt-row-name b { font-weight: 500; color: var(--hb-t2); }
.agt-rows > li[data-tone='crit'] .agt-row-name small { color: var(--hb-crit); font-weight: 600; }
.agt-rows > li[data-tone='warn'] .agt-row-name small { color: var(--hb-warn); font-weight: 600; }
.agt-sla { font-weight: 600; font-size: 14px; font-variant-numeric: tabular-nums; white-space: nowrap; }
.agt-sla[data-tone='warn'] { color: var(--hb-warn); }
.agt-sla[data-tone='crit'] { color: var(--hb-crit); }
.agt-led { flex: none; width: 12px; height: 12px; border-radius: 50%; background: var(--hb-t2); }
.agt-led[data-tone='ok'] { background: var(--hb-ok, var(--hb-ac)); }
.agt-led[data-tone='warn'] { background: var(--hb-warn); }
.agt-led[data-tone='crit'] { background: var(--hb-crit); }

.agt-queue { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
.agt-queue > div { display: flex; flex-direction: column; gap: 2px; padding: 14px 16px; border-radius: var(--hb-radius-md, 14px); background: color-mix(in srgb, var(--hb-t1) 4%, transparent); min-width: 0; }
.agt-queue dt { color: var(--hb-t2); font-size: 13px; }
.agt-queue dd { margin: 0; font-size: 30px; line-height: 1.15; font-weight: 650; font-variant-numeric: tabular-nums; }
.agt-queue [data-tone='warn'] dd { color: var(--hb-warn); }

.agt-footer { flex-direction: row; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px 24px; }
.agt-footer-copy { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.agt-footer-copy p:first-child { font-weight: 600; font-size: 15px; }
.agt-footer[data-current='false'] .agt-footer-copy p:first-child { color: var(--hb-warn); }
.agt-monitor-link { text-decoration: none; }
.agt-monitor-link span { font-size: 16px; }

@media (max-width: 900px) {
  .agt-columns { grid-template-columns: minmax(0, 1fr); }
  .agt-quotas { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 560px) {
  .agt-hero { padding: 22px 20px; }
  .agt-hero h2 { font-size: 26px; }
  .agt-panel { padding: 18px 16px; }
  .agt-quotas { grid-template-columns: minmax(0, 1fr); }
  .agt-queue { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
  .agt-queue dd { font-size: 26px; }
  .agt-footer { flex-direction: column; align-items: stretch; }
  .agt-monitor-link { width: 100%; }
}
@media (prefers-reduced-motion: reduce) {
  .agt-bar i { transition: none !important; }
}
`;

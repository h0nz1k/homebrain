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
.srv-bar i[style*='width: 0%'] { display: none; }
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

.srv-proxmox { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
.srv-proxmox-side { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
.srv-panel[tabindex='-1']:focus-visible { outline: 2px solid var(--hb-ac); outline-offset: 2px; }
.srv-panel[tabindex='-1']:focus:not(:focus-visible) { outline: none; }
.srv-hero .hb-btn { margin-top: 4px; }
/* „Co s tím“: primary action in the verdict's severity colour. */
.srv-hero-fix[data-tone='crit'] { background: var(--hb-crit); color: var(--hb-on-crit); }
.srv-hero-fix[data-tone='warn'] { background: var(--hb-warn); color: var(--hb-on-warn); }
.srv-hero-fix[data-tone]:hover:not(:disabled) { background: color-mix(in srgb, var(--srv-fix-tone) 88%, var(--hb-t1)); }
.srv-hero-fix[data-tone='crit'] { --srv-fix-tone: var(--hb-crit); }
.srv-hero-fix[data-tone='warn'] { --srv-fix-tone: var(--hb-warn); }
.srv-hero-fix[data-tone]:focus-visible { outline: 3px solid var(--srv-fix-tone); outline-offset: 3px; }
.srv-node-state { margin-left: 6px; align-self: center; }
.srv-sub [data-tone='warn'] { color: var(--hb-warn); font-weight: 600; }

/* Host card: Proxmox facts under the Glances verdict (same machine, one card). */
.srv-host { flex: 1 1 100%; display: flex; flex-direction: column; gap: 14px; padding-top: 18px; border-top: 1px solid var(--hb-edge, color-mix(in srgb, var(--hb-t1) 10%, transparent)); min-width: 0; }
.srv-host-facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 200px), 1fr)); gap: 12px 24px; margin: 0; }
.srv-host-facts > div { min-width: 0; }
.srv-host-facts dt { color: var(--hb-t2); font-size: 13px; }
.srv-host-facts dd { margin: 2px 0 0; display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 8px; font-weight: 600; font-size: 15px; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.srv-host-facts dd small { color: var(--hb-t2); font-weight: 400; font-size: 13px; }
.srv-host-facts [data-tone='warn'] dd { color: var(--hb-warn); }
.srv-host-facts [data-tone='crit'] dd { color: var(--hb-crit); }
.srv-link { appearance: none; background: none; border: 0; padding: 0; margin: 0; min-height: 24px; font: inherit; color: inherit; cursor: pointer; text-align: left; text-decoration: underline dotted; text-underline-offset: 3px; }
.srv-link:focus-visible { outline: 2px solid var(--hb-ac); outline-offset: 2px; border-radius: 4px; }
.srv-consumers { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 14px; font-size: 14px; color: var(--hb-t1); font-variant-numeric: tabular-nums; }
.srv-consumers .srv-micro { flex-basis: 100%; }
.srv-consumer b { font-weight: 600; }
.srv-consumers .srv-consumers-hint { flex-basis: 100%; margin-top: -2px; color: var(--hb-t2); font-size: 12px; }
.srv-host-facts dd.srv-io { flex-direction: column; align-items: flex-start; gap: 0; }
.srv-io > span { white-space: nowrap; }
.srv-consumers:focus-visible, .srv-host-storages:focus-visible, .srv-hero[tabindex='-1']:focus-visible { outline: 2px solid var(--hb-ac); outline-offset: 2px; border-radius: 8px; }
.srv-consumers:focus:not(:focus-visible), .srv-host-storages:focus:not(:focus-visible), .srv-hero[tabindex='-1']:focus:not(:focus-visible) { outline: none; }
.srv-host-storages { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr)); gap: 12px 32px; }
.srv-host-storages > li { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.srv-host-storages small { color: var(--hb-t2); font-size: 13px; font-variant-numeric: tabular-nums; }
.srv-host-storages[data-tone='warn'], .srv-host-storages[data-tone='crit'] { padding-left: 12px; box-shadow: inset 3px 0 0 var(--srv-st-tone); }
.srv-host-storages[data-tone='warn'] { --srv-st-tone: var(--hb-warn); }
.srv-host-storages[data-tone='crit'] { --srv-st-tone: var(--hb-crit); }
.srv-host-storages li[data-tone='warn'] .srv-row-val { color: var(--hb-warn); }
.srv-host-storages li[data-tone='crit'] .srv-row-val { color: var(--hb-crit); }

/* Guests: one tappable row each, stopped ones compact and dimmed at the end. */
.srv-guests { gap: 0; }
.srv-guests > li + li { padding-top: 0; }
.srv-guest { appearance: none; background: none; border: 0; margin: 0 -10px; padding: 12px 10px; width: calc(100% + 20px); min-height: 44px; display: flex; flex-direction: column; gap: 10px; text-align: left; font: inherit; color: inherit; border-radius: 12px; cursor: pointer; min-width: 0; }
.srv-guest:hover { background: color-mix(in srgb, var(--hb-t1) 5%, transparent); }
.srv-guest:focus-visible { outline: 2px solid var(--hb-ac); outline-offset: -2px; }
.srv-guest-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 10px; min-width: 0; }
.srv-guest-head b { font-weight: 600; font-size: 15px; overflow-wrap: anywhere; }
.srv-guest-head small, .srv-guest-alloc { color: var(--hb-t2); font-size: 13px; font-variant-numeric: tabular-nums; }
.srv-guest-head .srv-guest-state { margin-left: auto; align-self: center; }
.srv-guest-metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px 20px; }
.srv-gm { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.srv-gm > small { color: var(--hb-t2); font-size: 12px; }
.srv-gm-val { font-size: 14px; font-weight: 500; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.srv-gm[data-tone='warn'] .srv-gm-val { color: var(--hb-warn); font-weight: 650; }
.srv-gm[data-tone='crit'] .srv-gm-val { color: var(--hb-crit); font-weight: 650; }
.srv-gm > small { display: flex; align-items: center; gap: 6px; }
.srv-gm-flag { display: inline-flex; align-items: center; gap: 3px; font-weight: 650; }
.srv-gm[data-tone='warn'] .srv-gm-flag { color: var(--hb-warn); }
.srv-gm[data-tone='crit'] .srv-gm-flag { color: var(--hb-crit); }
.srv-guest:focus { scroll-margin: 96px; }
.srv-guests [data-stopped] .srv-guest { padding-block: 8px; opacity: 0.72; }
.srv-guests [data-stopped] .srv-guest-head b { font-weight: 500; }

.srv-guest-dl { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 200px), 1fr)); gap: 14px 24px; margin: 0 0 20px; }
.srv-guest-dl > div { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.srv-guest-dl dt { color: var(--hb-t2); font-size: 13px; }
.srv-guest-dl dd { margin: 0; display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 8px; font-weight: 600; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.srv-guest-dl small { color: var(--hb-t2); font-weight: 400; font-size: 13px; }
.srv-guest-dl [data-tone='warn'] dd { color: var(--hb-warn); }
.srv-guest-dl [data-tone='crit'] dd { color: var(--hb-crit); }
.srv-guest-charts { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr)); gap: 16px 24px; }
.srv-guest-charts section { display: flex; flex-direction: column; min-width: 0; }
.srv-guest-charts h3 { margin: 0; font-size: 14px; font-weight: 600; color: var(--hb-t2); }
.srv-guest-state { flex: none; }
/* Guest charts: fixed 0–100 % scale, gridlines at 50/100 %, dot at the live value. */
.srv-pct-trend { min-height: 96px; }
.srv-pct-trend[data-tone='warn'] { color: var(--hb-warn); }
.srv-pct-trend[data-tone='crit'] { color: var(--hb-crit); }
.srv-pct-plot { position: relative; display: block; height: 64px; margin: 0 5px 0 26px; }
.srv-pct-trend svg { width: 100%; height: 64px; display: block; overflow: visible; }
.srv-grid { stroke: var(--hb-t2); stroke-opacity: 0.28; stroke-width: 1; stroke-dasharray: 3 3; vector-effect: non-scaling-stroke; }
.srv-pct-dot { position: absolute; right: -5px; width: 10px; height: 10px; border-radius: 50%; background: currentColor; transform: translateY(-50%); box-shadow: 0 0 0 2px var(--hb-s2); }
.srv-trend small.srv-pct-axis { display: block; position: absolute; inset: 0 auto 0 -26px; width: 22px; pointer-events: none; font-size: 10px; }
.srv-pct-axis > span { position: absolute; right: 0; line-height: 1; transform: translateY(-50%); }
.srv-pct-axis > span:first-child { top: 0; }
.srv-pct-axis > span:last-child { top: 50%; }
.srv-pct-trend b { color: currentColor; font-weight: 650; }
.srv-pct-trend:not([data-tone]) b { color: var(--hb-t1); }
.srv-proxmox-row-head, .srv-proxmox-details { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 12px; overflow-wrap: anywhere; }
.srv-proxmox-details:empty { display: none; }
.srv-proxmox-rows > li + li { border-top: 1px solid var(--hb-edge, color-mix(in srgb, var(--hb-t1) 10%, transparent)); padding-top: 12px; }
.srv-proxmox-rows [data-stopped] { color: var(--hb-t2); }
.srv-proxmox-rows [data-stopped] > .srv-proxmox-row-head b { font-weight: 500; color: var(--hb-t2); }
.srv-backup { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 160px), 1fr)); gap: 12px 24px; margin: 0; }
.srv-backup > div { min-width: 0; }
.srv-backup dt { color: var(--hb-t2); font-size: 13px; }
.srv-backup dd { margin: 2px 0 0; display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 8px; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.srv-backup-age { font-weight: 600; }
.srv-backup time { color: var(--hb-t2); font-size: 14px; }
.srv-backup dd[data-ok='true'] { font-weight: 500; }
.srv-backup dd[data-ok='false'] { color: var(--hb-crit); font-weight: 600; }
.srv-panel[data-tone='warn'] [data-testid='server-backup-title'] { color: var(--hb-warn); }
.srv-panel[data-tone='crit'] [data-testid='server-backup-title'] { color: var(--hb-crit); }
.srv-panel[data-tone='warn'] { box-shadow: inset 4px 0 0 var(--hb-warn); }
.srv-panel[data-tone='crit'] { box-shadow: inset 4px 0 0 var(--hb-crit); }
.srv-panel[data-tone='warn'] .srv-backup-age { color: var(--hb-warn); }
.srv-panel[data-tone='crit'] .srv-backup-age { color: var(--hb-crit); }

@media (min-width: 1100px) {
  /* Guests (wide) beside the backup card. */
  .srv-proxmox { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); align-items: start; }
}
@media (max-width: 1100px) {
  .srv-tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .srv-columns { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 480px) {
  .srv-meta-procs { display: none; }
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
  .srv-guest-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px 16px; }
}
@media (prefers-reduced-motion: reduce) {
  .srv-bar i { transition: none !important; }
}
`;

export const networkStyles = `
.net {
  color: var(--hb-t1);
  max-width: 1440px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: var(--hb-sp-4, 16px);
}
.net * { box-sizing: border-box; }
.net h1, .net h2, .net h3, .net h4, .net p { margin: 0; }
.net :where(button) { color: inherit; }
.net :where(p, h2, h4, small, li, .hb-status-row-copy) { text-wrap: pretty; }
.net-head {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 16px;
}
.net-head h1 { font-size: var(--hb-type-headline, 28px); letter-spacing: var(--hb-tracking-title, -0.01em); }
.net-updated { color: var(--hb-t2); font-size: 13px; margin-left: auto; }
.net-hero-copy .hb-button { margin-top: 2px; }
.net-tabs { flex: 0 1 auto; }
.net-hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr);
  gap: 20px 28px;
  align-items: center;
  padding: 24px 28px;
}
.net-hero-copy { display: flex; flex-direction: column; align-items: flex-start; gap: 10px; min-width: 0; }
.net-hero h2 { font-size: var(--hb-type-display, 30px); line-height: 1.15; letter-spacing: var(--hb-tracking-display, -0.02em); }
.net-hero p { color: var(--hb-t2); line-height: var(--hb-leading-body, 1.45); }
.net-summary-grid { display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr); gap: 16px; align-items: stretch; }
.net-summary-grid .net-hero { grid-template-columns: minmax(0, 1fr); align-content: center; }
.net-summary-grid .net-guest { max-width: none; }
.net-stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
.net-stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 12px 14px;
  border-radius: var(--hb-radius-md, 14px);
  background: color-mix(in srgb, var(--hb-s1) 82%, transparent);
  box-shadow: inset 0 0 0 1px var(--hb-edge);
  min-width: 0;
}
.net-stat strong { font-size: 24px; font-variant-numeric: tabular-nums; }
.net-stat small { color: var(--hb-t2); font-size: 13px; overflow-wrap: anywhere; }
.net-stat-label { font-size: 13px; color: var(--hb-t2); font-weight: 600; }
.net-stat[data-tone='warn'] strong { color: var(--hb-warn); }
.net-stat[data-tone='crit'] strong { color: var(--hb-crit); }
.net-stat[data-detail-tone='warn'] small { color: var(--hb-warn); font-weight: 600; }
.net-grid { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); gap: 16px; align-items: start; }
.net-col { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
.net-card { display: flex; flex-direction: column; gap: 12px; padding: 18px 20px; }
.net-card-head, .net-section-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.net-card-head h3, .net-section-head h3 { font-size: var(--hb-type-title, 17px); }
.net-card-head span, .net-section-head span { color: var(--hb-t2); font-size: 13px; text-align: right; }
.net-floors { display: flex; flex-direction: column; gap: 8px; }
.net-floor {
  display: grid;
  grid-template-columns: 92px minmax(0, 1fr);
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border-radius: var(--hb-radius-md, 14px);
  background: var(--hb-fill);
}
.net-floor[data-outdoor] { background: none; box-shadow: inset 0 0 0 1px var(--hb-edge-strong); }
.net-floor-name { font-size: 13px; font-weight: 600; color: var(--hb-t2); }
.net-floor-aps { display: flex; flex-wrap: wrap; gap: 8px 18px; }
.net-ap { display: inline-flex; align-items: center; gap: 7px; font-size: 14px; }
.net-ap-dot {
  width: 12px; height: 12px; border-radius: 50%;
  background: var(--hb-ac);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--hb-ac) 18%, transparent);
}
.net-ap[data-problem='warning'] .net-ap-dot { background: var(--hb-warn); box-shadow: 0 0 0 4px color-mix(in srgb, var(--hb-warn) 25%, transparent); }
.net-ap[data-problem='critical'] .net-ap-dot { background: var(--hb-crit); box-shadow: 0 0 0 4px color-mix(in srgb, var(--hb-crit) 25%, transparent); }
.net-ap-n { color: var(--hb-t2); font-variant-numeric: tabular-nums; }
.net-ap-n::before { content: '· '; }
.net-ap-dot.net-sw-glyph { border-radius: 3px; background: var(--hb-t3); box-shadow: 0 0 0 4px color-mix(in srgb, var(--hb-t3) 18%, transparent); }
.net-load { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
.net-load li { display: grid; grid-template-columns: 88px minmax(0, 1fr) 28px; grid-template-areas: 'n b c' '. s s'; gap: 2px 10px; align-items: center; }
.net-load-name { grid-area: n; font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.net-load-bar { grid-area: b; height: 8px; border-radius: 99px; background: var(--hb-fill-strong); overflow: hidden; }
.net-load-bar span { display: block; height: 100%; border-radius: inherit; background: var(--hb-ac); }
.net-load li[data-problem] .net-load-bar span { background: var(--hb-warn); }
.net-load strong { grid-area: c; text-align: right; font-variant-numeric: tabular-nums; }
.net-load small { grid-area: s; color: var(--hb-t2); font-size: 13px; }
.net-note { color: var(--hb-t2); font-size: 14px; line-height: 1.45; }
/* Severity hierarchy: problem (red) > warning (amber) > tip (neutral, no accent). */
.net-problem { position: relative; overflow: hidden; display: flex; flex-direction: column; gap: 8px; padding: 18px 20px 18px 24px; scroll-margin: 96px; }
.net-problem::before { content: ''; position: absolute; inset: 0 auto 0 0; width: 4px; background: var(--hb-signal-tone); }
.net-problem[data-severity='critical'] { background: color-mix(in srgb, var(--hb-crit) 7%, var(--hb-s1)); }
.net-problem:focus-visible { outline: 2px solid var(--hb-signal-tone); outline-offset: 2px; }
.net-problem:focus:not(:focus-visible) { outline: none; }
.net-problem-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.net-problem-head small { color: var(--hb-t2); font-size: 13px; }
.net-problem h4 { font-size: 18px; line-height: 1.25; }
.net-problem > p { color: var(--hb-t2); line-height: 1.45; }
.net-tips .hb-status-row-copy small { color: var(--hb-t2); font-size: var(--hb-font-body, 14px); line-height: 1.45; }
.net-tips .hb-status-row:last-child { border-bottom: 0; }
.net-fix {
  margin-top: 4px;
  padding: 12px 14px;
  border-radius: var(--hb-radius-sm, 10px);
  background: color-mix(in srgb, var(--hb-t1) 6%, var(--hb-s1));
}
.net-fix span { display: block; font-size: 12px; font-weight: 700; color: var(--hb-ok); margin-bottom: 2px; }
.net-fix p { line-height: 1.45; }
.net-calm p { color: var(--hb-t2); }
.net-ok-strip {
  padding: 10px 16px;
  border-radius: var(--hb-radius-pill, 999px);
  background: var(--hb-fill);
  color: var(--hb-t2);
  font-size: 14px;
}
.net-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.net-devices { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.net-devices li { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-top: 1px solid var(--hb-edge); }
.net-devices li:first-child { border-top: 0; }
.net-dev-dot { width: 9px; height: 9px; border-radius: 50%; background: var(--hb-ok); flex: none; }
.net-dev-dot[data-online='false'] { background: var(--hb-t3); }
.net-dev-copy { display: flex; flex-direction: column; min-width: 0; flex: 1; }
.net-dev-copy strong { font-size: 15px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.net-dev-copy small { color: var(--hb-t2); font-size: 13px; }
.net-select, .net-form input {
  font: inherit;
  font-size: 14px;
  color: var(--hb-t1);
  background: var(--hb-s1);
  border: 1px solid var(--hb-edge-strong);
  border-radius: var(--hb-radius-sm, 10px);
  padding: 6px 10px;
  min-height: 36px;
}
.net-switches { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 360px), 1fr)); gap: 16px; }
.net-budget { display: flex; flex-direction: column; gap: 6px; }
.net-budget-head { display: flex; justify-content: space-between; font-size: 14px; color: var(--hb-t2); }
.net-budget-head strong { color: var(--hb-t1); }
.net-budget-bar { position: relative; height: 10px; border-radius: 99px; background: var(--hb-fill-strong); overflow: hidden; }
.net-budget-bar span { display: block; height: 100%; border-radius: inherit; background: var(--hb-ok); }
.net-budget[data-level='warn'] .net-budget-bar span { background: var(--hb-warn); }
.net-budget[data-level='crit'] .net-budget-bar span { background: var(--hb-crit); }
.net-budget-bar i { position: absolute; top: 0; bottom: 0; width: 2px; background: var(--hb-t2); opacity: 0.55; }
.net-ports { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(62px, 1fr)); gap: 6px; }
.net-ports li {
  display: flex; flex-direction: column; align-items: center; gap: 1px;
  padding: 8px 4px;
  border-radius: var(--hb-radius-sm, 10px);
  background: var(--hb-fill);
  font-variant-numeric: tabular-nums;
}
.net-ports li span { font-size: 12px; color: var(--hb-t2); }
.net-ports li strong { font-size: 14px; }
.net-ports li small { font-size: 12px; color: var(--hb-t2); min-height: 1.2em; }
.net-ports li[data-slow] { background: color-mix(in srgb, var(--hb-warn) 18%, var(--hb-s1)); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--hb-warn) 45%, transparent); }
.net-ports li[data-slow] strong { color: var(--hb-warn); }
.net-guest { max-width: 640px; }
.net-guest-body { display: flex; align-items: center; gap: 24px; flex-wrap: wrap; }
.net-guest-copy { display: flex; flex-direction: column; gap: 4px; }
.net-guest-copy strong { font-size: 22px; }
.net-guest-copy small { color: var(--hb-t2); font-size: 14px; }
.net-guest .hb-qr { border-radius: var(--hb-radius-md, 14px); box-shadow: var(--hb-elev-1); max-width: 100%; height: auto; }
.net-form { display: flex; flex-direction: column; gap: 12px; }
.net-form label { display: flex; flex-direction: column; gap: 4px; font-size: 13px; color: var(--hb-t2); }
.net-form-actions { display: flex; gap: 8px; }
@media (max-width: 1100px) {
  .net-hero { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 900px) {
  .net-grid, .net-summary-grid { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 600px) {
  .net-hero { padding: 20px 18px; }
  .net-hero h2 { font-size: 26px; }
  .net-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .net-updated { margin-left: 0; order: 3; width: 100%; }
  .net-tabs { width: 100%; }
  .net-card { padding: 16px; }
  .net-problem { padding: 16px 16px 16px 20px; }
  .net-floor { grid-template-columns: minmax(0, 1fr); gap: 8px; }
}

/* ---------- Mapa (topologie) ---------- */
.net-topo { --topo-line: color-mix(in srgb, var(--hb-t1) 30%, transparent); --topo-soft: color-mix(in srgb, var(--hb-t1) 22%, transparent); }
.net-topo-scroll { overflow-x: auto; padding: 6px 2px 10px; }
.net-topo-canvas { position: relative; }
.net-topo-svg { position: absolute; inset: 0; overflow: visible; }
.net-topo-trunk, .net-topo-line { fill: none; stroke: var(--topo-line); stroke-width: 1.5; stroke-linejoin: round; }
.net-topo-trunk[data-assumed], .net-topo-line[data-assumed] { stroke: var(--topo-soft); stroke-dasharray: 5 4; }
.net-topo-line[data-type='mesh'] { stroke: color-mix(in srgb, var(--hb-ac) 70%, transparent); stroke-width: 2; stroke-dasharray: 1 5; stroke-linecap: round; }
.net-topo-trunk[data-type='wireless'], .net-topo-line[data-type='wireless'] { stroke: var(--topo-soft); stroke-width: 1.25; stroke-dasharray: 1 4; stroke-linecap: round; }
.net-topo-line[data-tone='slow'] { stroke: var(--hb-crit); stroke-width: 2.5; }
.net-topo-line[data-tone='weak'] { stroke: var(--hb-warn); }
.net-topo-line[data-tone='fast'] { stroke: var(--hb-ac); stroke-width: 2.5; }
.net-topo-chip {
  position: absolute; transform: translate(-50%, -50%); white-space: nowrap;
  font-size: 11px; font-weight: 600; line-height: 18px; padding: 0 7px; border-radius: var(--hb-radius-pill, 999px);
  color: var(--hb-t2); background: var(--hb-s1); box-shadow: inset 0 0 0 1px var(--hb-edge);
  font-variant-numeric: tabular-nums;
}
.net-topo-chip[data-mesh] { transform: translate(0, -50%); color: var(--hb-ac); }
.net-topo-chip[data-assumed] { color: var(--hb-t3); font-weight: 500; font-style: italic; }
.net-topo-chip[data-tone='slow'] { color: var(--hb-crit); background: color-mix(in srgb, var(--hb-crit) 10%, var(--hb-s1)); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--hb-crit) 35%, transparent); }
.net-topo-chip[data-tone='weak'] { color: var(--hb-warn); }
.net-topo-chip[data-tone='fast'] { color: var(--hb-ac); }
.net-topo-node {
  position: absolute; display: flex; align-items: center; gap: 10px; margin: 0; border: 0;
  padding: 8px 12px 8px 8px; border-radius: var(--hb-radius-md, 14px); text-align: left; font: inherit;
  background: var(--hb-s1); box-shadow: var(--hb-elev-1), inset 0 0 0 1px var(--hb-edge); cursor: pointer;
  transition: box-shadow var(--hb-dur-1, 120ms) var(--hb-ease-out, ease-out);
}
.net-topo-node:not(:disabled):hover { box-shadow: var(--hb-elev-1), inset 0 0 0 1.5px color-mix(in srgb, var(--hb-ac) 55%, transparent); }
.net-topo-node:focus-visible { outline: 2px solid var(--hb-ac); outline-offset: 2px; }
.net-topo-node:disabled { cursor: default; }
.net-topo-node[data-kind='client'], .net-topo-node[data-kind='more'] { padding: 4px 12px 4px 4px; border-radius: var(--hb-radius-pill, 999px); gap: 8px; }
.net-topo-node[data-kind='more'] { background: transparent; box-shadow: inset 0 0 0 1px var(--hb-edge); color: var(--hb-t2); }
.net-topo-tile {
  position: relative; flex: none; width: 40px; height: 40px; display: grid; place-items: center;
  border-radius: var(--hb-radius-sm, 10px); background: var(--hb-fill); color: var(--hb-t1);
}
.net-topo-node[data-kind='client'] .net-topo-tile, .net-topo-node[data-kind='more'] .net-topo-tile { width: 28px; height: 28px; border-radius: 50%; }
.net-topo-node[data-kind='more'] .net-topo-tile { background: none; }
.net-topo-ico { width: 22px; height: 22px; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
.net-topo-node[data-kind='client'] .net-topo-ico { width: 16px; height: 16px; }
.net-topo-dot { position: absolute; left: -3px; bottom: -3px; width: 10px; height: 10px; border-radius: 50%; background: var(--hb-ok); box-shadow: 0 0 0 2px var(--hb-s1); }
.net-topo-node[data-kind='client'] .net-topo-dot { width: 8px; height: 8px; left: -1px; bottom: -1px; }
.net-topo-node[data-status='offline'] .net-topo-dot, .net-topo-node[data-status='unknown'] .net-topo-dot { background: var(--hb-t3); }
.net-topo-node[data-status='offline'] .net-topo-copy { opacity: 0.7; }
.net-topo-node[data-severity='critical'] { box-shadow: var(--hb-elev-1), inset 0 0 0 1.5px var(--hb-crit); }
.net-topo-node[data-severity='critical'] .net-topo-tile { background: color-mix(in srgb, var(--hb-crit) 14%, var(--hb-s1)); color: var(--hb-crit); }
.net-topo-node[data-severity='warning'] { box-shadow: var(--hb-elev-1), inset 0 0 0 1.5px var(--hb-warn); }
.net-topo-node[data-severity='warning'] .net-topo-tile { background: color-mix(in srgb, var(--hb-warn) 16%, var(--hb-s1)); color: var(--hb-warn); }
.net-topo-node[data-severity='critical'] .net-topo-dot { background: var(--hb-crit); }
.net-topo-node[data-severity='warning'] .net-topo-dot { background: var(--hb-warn); }
.net-topo-copy { display: flex; flex-direction: column; min-width: 0; flex: 1; }
.net-topo-copy strong { font-size: 14px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.net-topo-node[data-kind='client'] .net-topo-copy strong, .net-topo-node[data-kind='more'] .net-topo-copy strong { font-size: 13px; font-weight: 500; }
.net-topo-copy small { font-size: 12px; color: var(--hb-t2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.net-topo-node[data-kind='client'] .net-topo-copy small { display: none; }
.net-topo-node[data-status='offline'] .net-topo-copy small { display: block; }
.net-topo-badge { flex: none; min-width: 26px; height: 26px; padding: 0 7px; border-radius: 13px; display: grid; place-items: center; font-size: 12px; font-weight: 600; background: var(--hb-fill); color: var(--hb-t2); font-variant-numeric: tabular-nums; }
.net-topo-legend { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 18px; font-size: 12px; color: var(--hb-t2); padding-top: 12px; border-top: 1px solid var(--hb-edge); }
.net-topo-legend span { display: inline-flex; align-items: center; gap: 6px; }
.net-topo-legend span::before { content: ''; width: 22px; border-top: 2px solid var(--topo-line); }
.net-topo-legend span[data-tone='slow']::before { border-top-color: var(--hb-crit); }
.net-topo-legend span[data-type='mesh']::before { border-top: 2px dotted var(--hb-ac); }
.net-topo-legend span[data-type='wireless']::before { border-top: 2px dotted var(--topo-soft); }
.net-topo-legend span[data-assumed]::before { border-top: 2px dashed var(--topo-soft); }
.net-topo-legend small { flex-basis: 100%; font-size: 12px; color: var(--hb-t3); }
/* Phone: vertical tree, APs collapsible. */
.net-tree { list-style: none; margin: 0; padding: 0; }
.net-tree .net-tree { margin-left: 21px; }
.net-tree .net-tree > li { position: relative; padding-left: 12px; }
.net-tree .net-tree > li::before { content: ''; position: absolute; left: 0; top: 0; width: 11px; height: 30px; border-left: 1.5px solid var(--topo-line); border-bottom: 1.5px solid var(--topo-line); border-bottom-left-radius: 8px; }
.net-tree .net-tree > li[data-leaf]::before { height: 24px; }
.net-tree .net-tree > li::after { content: ''; position: absolute; left: 0; top: 0; bottom: 0; border-left: 1.5px solid var(--topo-line); }
.net-tree .net-tree > li:last-child::after { display: none; }
.net-tree .net-tree > li[data-assumed]::before { border-style: dashed; border-color: var(--topo-soft); }
.net-tree .net-tree > li[data-type='mesh']::before { border-style: dotted; border-color: var(--hb-ac); border-width: 2px; }
.net-tree .net-tree > li[data-type='wireless']::before { border-style: dotted; border-color: var(--topo-soft); }
.net-tree .net-tree > li[data-tone='slow']::before { border-color: var(--hb-crit); border-width: 2px; }
.net-tree-root > li + li { position: relative; padding-top: 12px; }
.net-tree-root > li + li::before { content: ''; position: absolute; left: 22px; top: -2px; height: 18px; border-left: 1.5px solid var(--topo-line); }
.net-tree-row { display: flex; align-items: center; gap: 6px; padding: 4px 0; min-width: 0; }
.net-tree .net-topo-node { position: relative; flex: 1 1 auto; min-width: 0; padding: 6px 10px 6px 6px; gap: 8px; }
.net-tree .net-topo-tile { width: 32px; height: 32px; }
.net-tree .net-topo-copy strong { white-space: normal; overflow-wrap: anywhere; line-height: 1.25; }
.net-tree .net-topo-badge { min-width: 24px; height: 24px; }
.net-tree .net-topo-node[data-kind='client'], .net-tree .net-topo-node[data-kind='more'] { flex: 0 1 auto; padding: 3px 12px 3px 3px; }
.net-tree .net-topo-node[data-kind='client'] .net-topo-tile, .net-tree .net-topo-node[data-kind='more'] .net-topo-tile { width: 26px; height: 26px; }
.net-topo-inline[data-tone='slow'] { color: var(--hb-crit); font-weight: 600; }
.net-topo-inline[data-assumed] { font-style: italic; }
.net-topo-inline[data-tone='fast'], .net-topo-inline[data-type='mesh'] { color: var(--hb-ac); }
.net-tree-toggle { flex: none; width: 36px; height: 36px; border: 0; border-radius: 50%; background: var(--hb-fill); display: grid; place-items: center; cursor: pointer; }
.net-tree-toggle svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; transition: transform var(--hb-dur-1, 120ms); }
.net-tree-toggle[aria-expanded='true'] svg { transform: rotate(180deg); }
@media (prefers-reduced-motion: reduce) { .net-topo-node, .net-tree-toggle svg { transition: none !important; } }
`;

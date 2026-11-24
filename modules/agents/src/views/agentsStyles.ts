export const agentsStyles = `
.agt {
  color: var(--hb-t1);
  max-width: 880px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.agt * { box-sizing: border-box; }
.agt :where(h2, h3, p, ul, dl) { margin: 0; }
.agt :where(p, small, li) { text-wrap: pretty; }
.agt ul { list-style: none; padding: 0; }
.agt-loading { display: flex; flex-direction: column; gap: 16px; }

.agt-hero { padding: 14px 16px; }
.agt-state { display: flex; gap: 12px; align-items: flex-start; }
.agt-dot {
  width: 12px; height: 12px; border-radius: 50%; flex: none; margin-top: 0.4em;
  background: var(--hb-t2);
}
.agt-dot[data-tone='ok'] { background: var(--hb-ok); }
.agt-dot[data-tone='warn'] { background: var(--hb-warn); }
.agt-dot[data-tone='crit'] { background: var(--hb-crit); }
.agt-hero-copy { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.agt-hero h2 {
  font-size: 20px; line-height: 1.2; font-weight: 700; letter-spacing: -0.01em;
  overflow-wrap: anywhere;
}
.agt-subline {
  color: var(--hb-t2); font-size: 12px; line-height: 1.4;
  font-variant-numeric: tabular-nums;
}
.agt-subline[data-stale='true'] { color: var(--hb-warn); }

.agt-panel { display: flex; flex-direction: column; gap: 8px; padding: 12px 14px; min-width: 0; }
.agt-panel h3 { font-size: 14px; font-weight: 600; color: var(--hb-t1); letter-spacing: 0; }
.agt-panel-head { display: flex; align-items: baseline; justify-content: space-between; flex-wrap: wrap; gap: 4px 12px; }
.agt-micro { color: var(--hb-t2); font-size: 12px; font-variant-numeric: tabular-nums; }
.agt-note { color: var(--hb-t2); font-size: 14px; line-height: 1.45; }

/* K řešení */
.agt-todos { display: flex; flex-direction: column; }
.agt-todos > li {
  /* Fixed tag column → titles start on one vertical line regardless of tag length. */
  display: grid; grid-template-columns: 148px minmax(0, 1fr); gap: 8px; align-items: start;
  padding: 7px 0; border-top: 1px solid var(--hb-edge, color-mix(in srgb, var(--hb-t1) 10%, transparent));
  min-width: 0;
}
.agt-todos > li:first-child { border-top: 0; padding-top: 0; }
.agt-todos > li > .hb-pill { justify-self: stretch; justify-content: center; white-space: nowrap; }
.agt-todo-body { flex: 1; min-width: 0; }
.agt-todo-title { font-weight: 600; font-size: 13px; overflow-wrap: anywhere; }
.agt-todo-detail { font-size: 12px; color: var(--hb-t2); margin-top: 1px; overflow-wrap: anywhere; }

/* Kvóty – jeden řádek na poskytovatele */
.agt-q-rows { display: flex; flex-direction: column; }
.agt-q-row {
  display: grid;
  grid-template-columns: minmax(100px, 120px) 1fr 1fr;
  gap: 4px 12px;
  align-items: center;
  padding: 7px 0;
  border-top: 1px solid var(--hb-edge, color-mix(in srgb, var(--hb-t1) 10%, transparent));
  min-width: 0;
}
.agt-q-row:first-child { border-top: 0; }
.agt-q-name { min-width: 0; }
.agt-q-name b { font-weight: 600; font-size: 14px; overflow-wrap: anywhere; }
.agt-q-name small { display: block; font-weight: 400; font-size: 11px; color: var(--hb-t2); overflow-wrap: anywhere; }
.agt-q-slot { min-width: 0; font-size: 12px; color: var(--hb-t2); }
.agt-q-slot-line { display: flex; justify-content: space-between; gap: 8px; align-items: baseline; }
.agt-q-slot-label { overflow-wrap: anywhere; min-width: 0; }
.agt-q-slot-line b { color: var(--hb-t1); font-variant-numeric: tabular-nums; white-space: nowrap; }
.agt-q-slot-line b[data-tone='warn'] { color: var(--hb-warn); }
.agt-q-slot-line b[data-tone='crit'] { color: var(--hb-crit); }
.agt-q-slot small { display: block; margin-top: 2px; font-variant-numeric: tabular-nums; }
.agt-q-empty { color: var(--hb-t2); }

.agt-bar {
  display: block; height: 6px; border-radius: 9px; margin-top: 4px;
  background: color-mix(in srgb, var(--hb-t1) 11%, transparent); overflow: hidden;
}
.agt-bar i[style*='width: 0%'] { display: none; }
.agt-bar i {
  display: block; height: 100%; border-radius: inherit;
  background: #8a93a3;
  transition: width var(--hb-dur-2, 240ms) var(--hb-ease-out, ease-out);
}
.agt-bar[data-tone='warn'] i { background: var(--hb-warn); }
.agt-bar[data-tone='crit'] i { background: var(--hb-crit); }
.agt-bar[data-tone='ok'] i,
.agt-bar[data-tone='neutral'] i { background: #8a93a3; }

/* Agenti + Služby – stejná výška karet na desktopu */
.agt-columns { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12px; align-items: stretch; }
.agt-columns > .hb-card { height: 100%; }
.agt-rows { display: flex; flex-direction: column; }
.agt-rows > li {
  display: flex; justify-content: space-between; align-items: baseline; gap: 12px;
  padding: 6px 0; font-size: 14px; min-width: 0;
  border-top: 1px solid var(--hb-edge, color-mix(in srgb, var(--hb-t1) 8%, transparent));
}
.agt-rows > li:first-child { border-top: 0; }
.agt-row-name { display: flex; flex-direction: column; min-width: 0; flex: 1 1 auto; }
.agt-row-name b { font-weight: 500; overflow-wrap: anywhere; }
.agt-row-meta { color: var(--hb-t2); font-size: 12px; white-space: nowrap; }
.agt-rows > li[data-state='stopped'] .agt-row-name b { color: var(--hb-t2); }
.agt-sla { font-weight: 600; font-size: 13px; font-variant-numeric: tabular-nums; white-space: nowrap; color: var(--hb-t2); }
.agt-sla[data-tone='warn'] { color: var(--hb-warn); }
.agt-sla[data-tone='crit'] { color: var(--hb-crit); }

.agt-more { margin-top: 2px; }
.agt-more > summary {
  cursor: pointer; list-style: none; font-size: 13px; color: var(--hb-t2);
  min-height: 28px; display: inline-flex; align-items: center;
}
.agt-more > summary::-webkit-details-marker { display: none; }
.agt-more > summary:focus-visible { outline: 2px solid var(--hb-ac); outline-offset: 2px; border-radius: 4px; }

/* Fronta – inline; na úzkém displeji se celé položky zalomí (nic se neořízne); „blokováno“ oranžově */
.agt-queue-line {
  display: flex; flex-wrap: wrap; gap: 2px 4px; font-size: 14px;
  font-variant-numeric: tabular-nums; min-width: 0;
}
.agt-queue-line > span { white-space: nowrap; }
.agt-queue-line b { font-size: 18px; font-weight: 700; margin-right: 4px; }
.agt-queue-line > span[data-tone='warn'],
.agt-queue-line > span[data-tone='warn'] b { color: var(--hb-warn); }

.agt-footer {
  flex-direction: row; align-items: center; justify-content: space-between;
  flex-wrap: wrap; gap: 12px 24px;
  font-size: 12px; color: var(--hb-t2);
}
.agt-footer[data-current='false'] p { color: var(--hb-warn); }
.agt-monitor-link { text-decoration: none; }
.agt-monitor-link span { font-size: 14px; margin-left: 4px; }

@media (max-width: 700px) {
  .agt-columns { grid-template-columns: minmax(0, 1fr); }
  .agt-q-row { grid-template-columns: 1fr 1fr; }
  .agt-q-name { grid-column: 1 / -1; }
  .agt-hero h2 { font-size: 19px; }
}
@media (max-width: 560px) {
  .agt { gap: 8px; }
  .agt-hero { padding: 12px 12px; }
  .agt-hero h2 { font-size: 18px; }
  .agt-panel { padding: 12px 12px; }
  .agt-footer { flex-direction: column; align-items: stretch; }
  .agt-monitor-link { width: 100%; justify-content: center; }
  /* Narrow: tag above the title so the title gets the full width. */
  .agt-todos > li { grid-template-columns: minmax(0, 1fr); gap: 4px; }
  .agt-todos > li > .hb-pill { justify-self: start; }
}
@media (prefers-reduced-motion: reduce) {
  .agt-bar i { transition: none !important; }
}
`;

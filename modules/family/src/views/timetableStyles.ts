/** Školní rozvrh: person detail card and the settings editors (44 px targets, 360 px wide). */
export const timetableStyles = `
.fam-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.fam .fam-tt { display: grid; gap: 10px; }
.fam-tt-head {
  display: flex; align-items: center; justify-content: space-between; gap: 10px; min-height: 44px; width: 100%;
  padding: 0; border: 0; background: none; color: inherit; font: inherit; text-align: start; cursor: pointer;
}
.fam-tt-head > span:first-child { display: grid; gap: 2px; min-width: 0; }
.fam-tt-head strong { font-size: 17px; }
.fam-tt-head small, .fam-tt > small, .fam-tt-week > small { color: var(--hb-t2); font-size: 13px; }
.fam-tt-toggle { flex: none; color: var(--hb-t2); font-size: 14px; font-weight: 600; text-decoration: underline; text-underline-offset: 3px; }
.fam-tt-lessons { display: flex; flex-wrap: wrap; gap: 6px; margin: 0; padding: 0; list-style: none; }
.fam-tt-lessons li {
  display: grid; grid-template-columns: auto auto; column-gap: 4px; align-items: baseline; min-width: 52px;
  padding: 5px 9px; border-radius: 10px; background: color-mix(in srgb, var(--hb-t1) 8%, var(--fam-person-surface));
}
.fam-tt-lessons li > span { color: var(--hb-t2); font-size: 12px; }
.fam-tt-lessons li > strong { font-size: 15px; }
.fam-tt-lessons li > time { grid-column: 1 / -1; color: var(--hb-t2); font-size: 12px; font-variant-numeric: tabular-nums; }
.fam-tt-lessons li[data-done] { opacity: .55; }
.fam-tt-lessons li[data-current] {
  background: color-mix(in srgb, var(--person-color, var(--hb-ok)) 30%, var(--fam-person-surface));
  box-shadow: inset 0 0 0 2px var(--person-color, var(--hb-ok));
}
.fam-tt-bring { margin: 0; font-size: 14px; }
.fam-tt-week { display: grid; gap: 6px; overflow-x: auto; }
.fam-tt-week table, .fam-tt-grid { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 14px; }
.fam-tt-week th, .fam-tt-week td { padding: 6px 2px; text-align: center; border-top: 1px solid color-mix(in srgb, var(--hb-t1) 12%, transparent); }
.fam-tt-week thead th { border-top: 0; color: var(--hb-t2); font-weight: 600; }
.fam-tt-week th[scope='row'], .fam-tt-grid th[scope='row'] { width: 44px; color: var(--hb-t2); font-weight: 600; }
.fam-tt-week th[scope='row'] small { display: block; font-size: 11px; font-weight: 400; }
.fam-tt-week td[data-double] { background: color-mix(in srgb, var(--hb-t1) 6%, transparent); }
.fam-tt-week td > span { color: var(--hb-t2); }
.fam-tt-editor { display: grid; gap: 14px; }
.fam .fam-tt-editor fieldset { display: grid; gap: 10px; }
.fam .fam-tt-grid-wrap { padding: 8px; }
.fam-tt-grid thead th { padding: 4px 0; color: var(--hb-t2); font-weight: 600; }
.fam-tt-grid td { padding: 2px; }
.fam-tt-grid td button {
  width: 100%; min-height: 44px; padding: 0 2px; border: 1px solid color-mix(in srgb, var(--hb-t1) 16%, transparent);
  border-radius: 8px; background: color-mix(in srgb, var(--hb-t1) 5%, var(--fam-person-surface)); color: var(--hb-t1);
  font: inherit; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: pointer;
}
.fam-tt-grid td button span { color: var(--hb-t2); font-weight: 400; }
.fam-tt-grid td button[aria-pressed='true'] { border-color: var(--hb-t1); box-shadow: inset 0 0 0 2px var(--hb-t1); }
.fam .fam-tt-chips { position: sticky; bottom: 8px; z-index: 1; display: grid; gap: 8px; box-shadow: 0 6px 24px rgb(0 0 0 / .18); }
.fam-tt-chips p { margin: 0; font-weight: 600; color: var(--hb-t1); }
.fam-tt-chips > div { display: flex; flex-wrap: wrap; gap: 6px; }
.fam-tt-chip {
  min-width: 44px; min-height: 44px; padding: 0 10px; border-radius: 99px; font: inherit; font-weight: 600; cursor: pointer;
  border: 1px solid color-mix(in srgb, var(--hb-t1) 20%, transparent); background: var(--fam-person-surface); color: var(--hb-t1);
}
.fam-tt-chip[aria-pressed='true'] { background: var(--hb-t1); color: var(--fam-person-surface); }
.fam-tt-chips form { display: flex; align-items: end; gap: 8px; }
.fam-tt-chips form label { flex: 1; }
.fam-tt-days > div { display: flex; flex-wrap: wrap; gap: 6px; }
.fam-person-settings .fam-tt-check { display: inline-flex; align-items: center; gap: 8px; min-height: 44px; min-width: 44px; font-weight: 600; }
.fam-tt-check input { width: 22px; height: 22px; }
.fam-tt-range { display: grid; grid-template-columns: minmax(84px, auto) 1fr 1fr auto; align-items: center; gap: 8px; }
.fam-tt-range > span { font-weight: 600; }
.fam-tt-range input, .fam-tt-afternoon select, .fam-tt-free input, .fam-tt-item input { min-height: 44px; }
.fam-tt-afternoon { display: grid; grid-template-columns: 64px 1fr; gap: 8px; align-items: center; }
.fam-tt-afternoon .fam-tt-range { grid-template-columns: 1fr 1fr auto; }
.fam-tt-afternoon .fam-tt-range > span { display: none; }
.fam-tt-free-row { display: grid; grid-template-columns: 1fr 1fr auto; gap: 8px; align-items: end; padding-bottom: 8px; border-bottom: 1px solid color-mix(in srgb, var(--hb-t1) 10%, transparent); }
.fam-tt-free-row > label:first-child { grid-column: 1 / -1; }
.fam-tt-item { display: grid; grid-template-columns: 72px 1fr auto; gap: 8px; align-items: center; }
.fam-tt-remove {
  width: 44px; height: 44px; border: 0; border-radius: 50%; background: color-mix(in srgb, var(--hb-t1) 8%, transparent);
  color: var(--hb-t1); font-size: 20px; cursor: pointer;
}
.fam-tt-open { display: flex; align-items: center; justify-content: space-between; gap: 10px; grid-column: 1 / -1; }
.fam-tt-open > span { display: grid; font-weight: 600; }
.fam-tt-open small { font-weight: 400; }
.fam-person-presence[data-school] { background: color-mix(in srgb, var(--fam-school-ink, var(--hb-t2)) 20%, var(--fam-person-surface)); }
.fam-person-presence[data-school] > span { background: var(--fam-school-ink, var(--hb-t2)); }
.fam-person-presence[data-school] small { color: var(--hb-t2); font-size: 12px; font-weight: 400; }
@media (max-width: 420px) {
  .fam-tt-range { grid-template-columns: 1fr 1fr auto; }
  .fam-tt-range > span { grid-column: 1 / -1; }
  .fam-tt-grid { font-size: 13px; }
  .fam-tt-grid th[scope='row'] { width: 28px; }
}
`;

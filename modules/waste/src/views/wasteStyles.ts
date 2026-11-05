export const wasteStyles = `
.hb-waste.wb-panel {
  display: block;
  padding: 0;
  background: none;
  border: 0;
  box-shadow: none;
  color: var(--hb-t1);
  --hb-waste-bulky: #c8bda7;
  max-width: 1440px;
  margin: 0 auto;
}
.wb-panel * {
  box-sizing: border-box;
}
.wb-panel h1,
.wb-panel h2,
.wb-panel p {
  margin: 0;
}
.wb-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}
.wb-header h1 {
  font-size: 28px;
  font-weight: 600;
  letter-spacing: -0.035em;
}
.wb-eyebrow {
  color: var(--hb-t2);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}
.wb-header .wb-eyebrow {
  margin-bottom: 6px;
}
.wb-surface {
  background: var(--hb-s1);
  border: 1px solid var(--hb-b1);
  border-radius: 22px;
  box-shadow: 0 12px 34px #0000000a;
}
.wb-local {
  font-size: 12px;
  color: var(--hb-t2);
  line-height: 1.5;
}
.wb-reminders {
  background: var(--hb-s1);
  border: 1px solid var(--hb-b1);
  border-radius: 22px;
  padding: 18px 20px 16px;
}
.wb-reminders h3, .wb-history h3 {
  font-size: 15px;
  font-weight: 600;
  letter-spacing: -0.01em;
  margin: 0 0 6px;
}
.wb-reminders label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 14px;
  padding: 12px 0;
  border-bottom: 1px solid var(--hb-b1);
  cursor: pointer;
}
.wb-reminders input {
  appearance: none;
  flex-shrink: 0;
  width: 34px;
  height: 21px;
  border-radius: 20px;
  background: var(--hb-b2);
  position: relative;
  cursor: pointer;
}
.wb-reminders input:after {
  content: "";
  position: absolute;
  left: 3px;
  top: 3px;
  width: 15px;
  height: 15px;
  border-radius: 100%;
  background: #fff;
  transition: transform 0.25s cubic-bezier(.3, 1.4, .5, 1), background .2s;
}
.wb-reminders input:checked {
  background: var(--hb-t1);
}
.wb-reminders input:checked:after {
  background: var(--hb-s1);
}
.wb-reminders input:checked:after {
  transform: translateX(13px);
}
.wb-reminders .wb-local {
  margin-top: 12px;
}
.wb-reminders input:focus-visible {
  outline: 2px solid var(--hb-ac);
  outline-offset: 3px;
}
.wb-section {
  margin-top: 32px;
}
.wb-section-title {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14px;
}
.wb-section-title h2 {
  font-size: 19px;
  font-weight: 600;
  letter-spacing: -0.022em;
}
.wb-section-title span {
  font-size: 13px;
  color: var(--hb-t2);
}
.wb-warning {
  color: var(--hb-warn);
}
.wb-notices {
  font-size: 13px;
  color: var(--hb-t2);
  line-height: 1.7;
  margin: 12px 0;
}
.wb-summary {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  font-size: 13px;
  color: var(--hb-t2);
  margin-top: 0;
}
.wb-summary a { color: inherit; text-decoration: none; display: inline-flex; align-items: center; gap: 6px; transition: background .2s; }
.wb-summary a::after { content: "›"; font-size: 15px; line-height: 1; opacity: .7; }
.wb-summary a:hover { background: color-mix(in srgb, var(--hb-ac) 18%, transparent); }
.wb-summary a:focus-visible { outline: 2px solid var(--hb-ac); outline-offset: 3px; }
.wb-summary p {
  margin: 0;
}
.wb-summary > * {
  padding: 6px 12px;
  border-radius: 999px;
  background: var(--hb-ac-s);
  font-size: 13px;
  color: var(--hb-t1);
}
.wb-cancelled {
  margin-top: 20px;
}
.wb-cancelled .wb-bin {
  margin: 0;
}
.wb-cancelled h2 {
  font-size: 15px;
}
.wb-cancelled ul {
  list-style: none;
  padding: 0;
}
.wb-cancelled li {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 13px;
  color: var(--hb-t2);
}
.wb-month-bar { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 4px 6px 10px; }
.wb-month { padding: 8px 14px 14px; touch-action: pan-y; user-select: none; -webkit-user-select: none; overflow: hidden; }
.wb-month-head, .wb-month-grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); }
.wb-month-head { padding: 10px 0 8px; border-bottom: 1px solid var(--hb-b1); margin-bottom: 6px; }
.wb-month-head span { text-align: center; font-size: 12px; font-weight: 600; color: var(--hb-t2); }
.wb-month-head span::first-letter { text-transform: uppercase; }
.wb-month-head span:nth-child(n + 6) { opacity: .7; }
.wb-month-grid { gap: 4px; grid-auto-rows: 1fr; transition: transform .3s cubic-bezier(.2, .8, .2, 1); will-change: transform; }
.wb-day {
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  height: 80px;
  padding: 8px 0 6px;
  border-radius: 14px;
  position: relative;
  transition: background .2s;
}
.wb-day time {
  font-size: 13px;
  font-weight: 500;
  color: var(--hb-t1);
  width: 26px;
  height: 26px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  font-variant-numeric: tabular-nums;
  letter-spacing: -.01em;
}
.wb-day[aria-current] time { background: var(--hb-t1); color: var(--hb-s1); font-weight: 700; }

.wb-day:nth-child(7n + 6):not(.is-past) time, .wb-day:nth-child(7n):not(.is-past) time { color: var(--hb-t2); }
.wb-day.has-pickup:hover { background: color-mix(in srgb, var(--hb-t1) 4%, transparent); }
.wb-day.is-past time { color: var(--hb-t2); }
.wb-day.is-outside time { opacity: .4; }
.wb-day.is-outside .wb-mini-stack { opacity: .35; }
.wb-done .wb-mini-glyph { opacity: .78; }
.wb-check { position: absolute; z-index: 3; right: -4px; bottom: -2px; width: 12px; height: 12px; overflow: visible; }
.wb-check circle { fill: var(--hb-color-success, #34c759); stroke: var(--hb-s1); stroke-width: 1.5; }
.wb-check path { fill: none; stroke: #fff; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
.wb-month-foot { display: flex; align-items: center; justify-content: space-between; gap: 8px 16px; flex-wrap: wrap; padding: 12px 4px 0; margin-top: 8px; border-top: 1px solid var(--hb-b1); }
.wb-legend { display: flex; flex-wrap: wrap; gap: 6px 14px; list-style: none; margin: 0; padding: 0; }
.wb-legend li { display: flex; align-items: flex-start; gap: 6px; min-width: 0; font-size: 12px; line-height: 16px; color: var(--hb-t2); }
.wb-legend li span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wb-legend i { width: 8px; height: 8px; flex: 0 0 8px; margin-top: 4px; border-radius: 50%; background: var(--event-color); }
.wb-month-summary { display: inline-flex; align-items: center; gap: 10px; font-size: 12px; color: var(--hb-t2); font-variant-numeric: tabular-nums; margin-left: auto; white-space: nowrap; }
.wb-month-dots { display: inline-flex; gap: 4px; }
.wb-month-dots i { width: 7px; height: 7px; border-radius: 50%; box-shadow: inset 0 0 0 1.5px var(--event-color); }
.wb-month-dots i.is-done { background: var(--event-color); }
.wb-calendar .wb-section-title { gap: 12px; flex-wrap: wrap; }
.wb-month-nav { display: flex; align-items: center; gap: 6px; margin-left: auto; }
.wb-month-label { font-size: 20px; font-weight: 650; letter-spacing: -.02em; color: var(--hb-t1); font-variant-numeric: tabular-nums; }
.wb-month-label::first-letter { text-transform: uppercase; }
.wb-month-step, .wb-month-today { appearance: none; border: 1px solid var(--hb-b1); background: var(--hb-s1); color: var(--hb-t1); font: inherit; cursor: pointer; transition: background .2s, border-color .2s, opacity .2s, transform .15s; }
.wb-month-step { width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center; padding: 0; }
.wb-month-step:active:not(:disabled), .wb-month-today:active { transform: scale(.94); }
.wb-month-step svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
.wb-month-today { height: 34px; padding: 0 14px; border-radius: 17px; font-size: 13px; font-weight: 600; margin-right: 6px; background: var(--hb-ac-s); color: var(--hb-ac); border-color: transparent; animation: wb-fade-in .25s ease both; }
.wb-month-step:hover:not(:disabled), .wb-month-today:hover { border-color: var(--hb-b2); }
.wb-month-step:disabled { opacity: .35; cursor: default; }
.wb-month-step:focus-visible, .wb-month-today:focus-visible { outline: 2px solid var(--hb-ac); outline-offset: 2px; }
.wb-slide-next { animation: wb-slide-next .36s cubic-bezier(.2, .8, .2, 1) both; }
.wb-slide-prev { animation: wb-slide-prev .36s cubic-bezier(.2, .8, .2, 1) both; }
@keyframes wb-slide-next { from { opacity: 0; transform: translateX(32px); } to { opacity: 1; transform: none; } }
@keyframes wb-slide-prev { from { opacity: 0; transform: translateX(-32px); } to { opacity: 1; transform: none; } }
@keyframes wb-fade-in { from { opacity: 0; transform: scale(.9); } to { opacity: 1; transform: none; } }
.wb-mini-stack {
  display: flex;
  flex-wrap: nowrap;
  align-items: flex-end;
  justify-content: center;
  gap: 2px;
  height: 34px;
  width: 100%;
}
.wb-mini-stack .wb-bin { margin: 0; }
.wb-more {
  font-size: 11px;
  font-weight: 600;
  align-self: center;
  color: var(--hb-t2);
}
.wb-status {
  margin: 12px 0;
  font-size: 14px;
  color: var(--hb-t2);
}
.wb-hero {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  align-items: center;
  gap: 28px;
  padding: 28px;
  --event-color: var(--hb-waste-mixed);
}
.wb-hero-copy, .wb-card-copy { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.wb-type { display: flex; align-items: center; gap: 7px; text-transform: uppercase; font-size: 11px; font-weight: 650; letter-spacing: .08em; color: var(--hb-t2); }
.wb-type i { width: 7px; height: 7px; border-radius: 50%; background: var(--event-color); flex: 0 0 7px; }
.wb-countdown { display: flex; align-items: baseline; gap: .14em; font-size: clamp(44px, 5vw, 66px); font-weight: 650; line-height: 1.12; letter-spacing: -.045em; font-variant-numeric: tabular-nums; white-space: nowrap; }

.wb-unit { font-size: .38em; font-weight: 500; letter-spacing: -.02em; color: var(--hb-t2); }
.wb-date, .wb-card-copy time { font-size: 13px; color: var(--hb-t2); }
.wb-cycle { width: 100%; max-width: none; height: 4px; border-radius: 3px; background: var(--hb-b2); overflow: hidden; margin-top: 4px; }
.wb-cycle > span { display: block; width: 100%; height: 100%; transform-origin: left; background: var(--event-color); border-radius: inherit; }
.wb-action { color: var(--hb-t2); font-size: 12px; line-height: 1.5; }
.is-today .wb-action, .is-tomorrow .wb-action { color: var(--hb-t1); font-weight: 550; }
.wb-surface.is-today, .wb-surface.is-tomorrow, .wb-fleet > .is-today, .wb-fleet > .is-tomorrow {
  border-color: color-mix(in srgb, var(--event-color) 65%, var(--hb-b1));
  background: linear-gradient(color-mix(in srgb, var(--event-color) 9%, transparent), color-mix(in srgb, var(--event-color) 4%, transparent)), var(--hb-s1);
}
.wb-fleet { display: flex; gap: 12px; overflow-x: auto; scrollbar-width: none; padding: 2px 2px 4px; list-style: none; margin: 0; scroll-snap-type: x mandatory; scroll-padding: 2px; }
.wb-fleet > li { display: grid; grid-template-columns: 96px minmax(0, 1fr); align-items: center; gap: 4px; flex: 0 0 280px; padding: 18px 14px; border: 1px solid var(--hb-b1); border-radius: 18px; background: var(--hb-s1); scroll-snap-align: start; }
.wb-card-copy { display: grid; grid-template-rows: minmax(14px, auto) 40px 15px 32px 4px minmax(17px, auto); gap: 8px; align-content: start; }
.wb-card-copy .wb-last { grid-row: 4; }
.wb-card-copy .wb-cycle { grid-row: 5; margin: 0; }
.wb-card-copy .wb-action { grid-row: 6; }
.wb-card-copy .wb-countdown { font-size: 34px; }
.wb-card-copy .wb-type { font-size: 10px; }
.wb-card-copy time { font-size: 12px; }
.wb-card-copy .wb-action { font-size: 12px; }
.wb-last { display: flex; align-items: center; gap: 5px; font-size: 13px; line-height: 1.25; color: var(--hb-t2); white-space: nowrap; min-height: 1em; }
.wb-last svg { width: 12px; height: 12px; flex: 0 0 12px; fill: none; stroke: currentColor; stroke-width: 1.4; stroke-linecap: round; stroke-linejoin: round; opacity: .8; }
.wb-last-date { color: var(--hb-t2); }
.wb-last-value { white-space: nowrap; }
.wb-pill { align-self: flex-start; display: inline-flex; align-items: center; gap: 8px; padding: 7px 14px 7px 12px; border-radius: 999px; font-size: 13px !important; background: color-mix(in srgb, var(--event-color) 20%, transparent); color: var(--hb-t1) !important; font-weight: 600; }
.wb-pill i { width: 8px; height: 8px; border-radius: 50%; background: var(--event-color); box-shadow: 0 0 0 0 color-mix(in srgb, var(--event-color) 60%, transparent); animation: wb-pulse 2.4s ease-out infinite; }
.wb-pill.is-done { background: color-mix(in srgb, var(--hb-color-success, #34c759) 16%, transparent); }
.wb-pill.is-done i { background: var(--hb-color-success, #34c759); animation: none; width: 14px; height: 14px; mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 14 14'%3E%3Cpath d='M3.5 7.3 6 9.6l4.6-5' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") center / contain no-repeat; }
@keyframes wb-pulse { 0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--event-color) 55%, transparent); } 70%, 100% { box-shadow: 0 0 0 8px transparent; } }
.wb-last time { color: var(--hb-t1); font-weight: 500; }
/* Karta: popisek „Naposledy“ nad hodnotou (stejný formát jako hero), v úzkém sloupci nic neořízne. */
.wb-card-copy .wb-last { font-size: 12px; flex-direction: column; align-items: flex-start; gap: 1px; }
.wb-card-copy .wb-last svg { display: none; }
.wb-card-copy .wb-last-value { font-size: 13px; }
/* Dlouhý název typu: na kartách max. 2 řádky (celý v title), tečka zůstává u prvního řádku. */
.wb-card-copy .wb-type { align-items: baseline; }
.wb-card-name { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; }
/* Krátký název + upřesnění obce menším písmem (max. 2 řádky, celý text v title). */
.wb-type { align-items: baseline; }
.wb-type-label { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.wb-type-detail { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; text-transform: none; letter-spacing: 0; font-size: 12px; font-weight: 400; line-height: 1.3; color: var(--hb-t3, var(--hb-t2)); }
.wb-card-copy .wb-type-detail { font-size: 11px; }
.wb-card-copy .wb-last time { font-size: inherit; color: var(--hb-t1); }
.wb-badge { padding: 4px 9px; border: 1px solid var(--hb-b2); border-radius: 20px; font-size: 11px; color: var(--hb-t2); }

.wb-bin { position: relative; width: 96px; margin: 0 auto; --bin-color: var(--hb-waste-mixed); isolation: isolate; }
.wb-bin--hero { width: 220px; }
.wb-bin--regular { width: 82px; } /* 85% of the card's 96px artwork slot, with equal headroom. */
.wb-art { position: relative; }
.wb-art::before { content: ""; position: absolute; left: 14%; width: 65%; height: 7%; bottom: 5%; background: #171b2466; border-radius: 50%; filter: blur(5px); }
.wb-sprites { position: relative; transform-origin: 75% 90%; }
.wb-sprite { display: block; width: 100%; height: auto; }
.wb-sprite--open { position: absolute; inset: 0; }
.wb-state-today .wb-sprite--closed { opacity: 0; }
[data-theme='dark'] .wb-sprites { filter: drop-shadow(0 0 .6px #e4edff99) drop-shadow(0 0 8px #c6dcff0a); }
[data-theme='dark'] .wb-art::before { background: #000; height: 8%; bottom: 4%; filter: blur(4px); }
@media (prefers-color-scheme: dark) {
  [data-theme='system'] .wb-sprites { filter: drop-shadow(0 0 .6px #e4edff99) drop-shadow(0 0 8px #c6dcff0a); }
  [data-theme='system'] .wb-art::before { background: #000; height: 8%; bottom: 4%; filter: blur(4px); }
}
.wb-bin--mini { width: 24px; flex: 0 0 24px; min-width: 24px; }
.wb-mini-glyph { display: block; width: 100%; height: auto; }
.wb-bin--mini .wb-art::before { display: none; }
.wb-muted .wb-art { opacity: .35; }
.wb-strike { position: absolute; z-index: 3; right: -3px; top: -2px; width: 15px; height: 15px; display: grid; place-items: center; border-radius: 50%; background: var(--hb-s1); color: var(--hb-t1); border: 1px solid var(--hb-t2); font: 700 11px/1 sans-serif; }
.wb-animate-evening .wb-sprites { animation: wb-tilt 5s ease-in-out infinite; }
.wb-animate-today .wb-sprite--closed { animation: wb-close-out .8s ease both; }
.wb-animate-today .wb-sprite--open { animation: wb-open-in .8s ease both; }
.wb-animate-today .wb-sprites { animation: wb-settle 1s ease both; }
.wb-animate-empty .wb-sprites { animation: wb-return 1s ease both; }
@keyframes wb-tilt { 0%, 60%, 100% { transform: rotate(0); } 25%, 35% { transform: rotate(4deg); } }
@keyframes wb-close-out { from { opacity: 1; } to { opacity: 0; } }
@keyframes wb-open-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes wb-settle { 0%, 100% { transform: translateY(0); } 65% { transform: translateY(-2px); } 82% { transform: translateY(1px); } }
@keyframes wb-return { from { opacity: .5; transform: translateY(-1px); } to { opacity: 1; transform: translateY(0); } }
.wb-history { padding: 18px 20px 8px; }
.wb-history h3 { margin-bottom: 4px; }
.wb-history ul { list-style: none; margin: 0; padding: 0; }
.wb-history li { display: grid; grid-template-columns: 22px minmax(0, 1fr) auto; align-items: center; gap: 12px; padding: 9px 0; border-bottom: 1px solid var(--hb-b1); font-size: 14px; }
.wb-history li:last-child { border-bottom: 0; }
.wb-history .wb-bin--mini { margin: 0; }
.wb-history-name { font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.wb-history-when { display: flex; align-items: baseline; gap: 8px; color: var(--hb-t1); font-size: 13px; font-variant-numeric: tabular-nums; white-space: nowrap; }
.wb-history-when { display: grid !important; grid-template-columns: 84px 44px; gap: 8px !important; text-align: right; }
.wb-history-when time { color: var(--hb-t2); font-size: 13px; text-align: right; }
.wb-done-chip { display: inline-flex; align-items: center; gap: 8px; background: color-mix(in srgb, var(--hb-color-success, #34c759) 16%, transparent) !important; font-weight: 600; }
.wb-done-chip i { width: 14px; height: 14px; background: var(--hb-color-success, #34c759); mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 14 14'%3E%3Cpath d='M3.5 7.3 6 9.6l4.6-5' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") center / contain no-repeat; }
.wb-cycle.is-empty { background: repeating-linear-gradient(90deg, var(--hb-b2) 0 6px, transparent 6px 10px); opacity: .7; }
/* Panel: mobil = jeden sloupec v pořadí DOM; desktop = kalendář vlevo, historie + připomínky vpravo. */
.hb-waste.wb-panel { display: flex; flex-direction: column; gap: 28px; }
.wb-panel > .wb-header { margin-bottom: -8px; }
.wb-panel > .wb-section, .wb-panel > .wb-cancelled { margin-top: 0; }
.wb-week-strip { display: none; }
.wb-side { display: contents; }
@media (min-width: 1100px) {
  .hb-waste.wb-panel { display: grid; grid-template-columns: minmax(0, 1fr) 360px; gap: 32px 20px; align-items: start; }
  .wb-panel > * { grid-column: 1 / -1; }
  .wb-panel > .wb-calendar:has(+ .wb-side > *) { grid-column: 1; align-self: stretch; display: flex; flex-direction: column; }
  .wb-calendar .wb-month { flex: 1; display: flex; flex-direction: column; }
  .wb-calendar .wb-month-grid { flex: 1; grid-auto-rows: minmax(70px, 1fr); }
  .wb-calendar .wb-day { height: auto; }
  .wb-panel > .wb-side { grid-column: 2; display: flex; flex-direction: column; gap: 16px; margin-top: 48px; }
  .wb-panel > .wb-side:empty { display: none; }
  .wb-hero { grid-template-columns: 220px minmax(280px, 340px) minmax(0, 1fr); gap: 40px; }
  .wb-hero .wb-cycle { max-width: 440px; }
  .wb-week-strip { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 6px; list-style: none; margin: 0; padding: 12px; border-radius: 20px; background: color-mix(in srgb, var(--hb-s1) 72%, transparent); border: 1px solid var(--hb-b1); align-self: center; }
  .wb-week-strip li { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 14px 0 12px; border-radius: 14px; transition: background .2s; }
  .wb-week-strip li[aria-current] { background: color-mix(in srgb, var(--event-color) 16%, transparent); }
  .wb-strip-day { font-size: 13px; font-weight: 600; color: var(--hb-t2); text-transform: capitalize; }
  li[aria-current] .wb-strip-day { color: var(--hb-t1); }
  .wb-strip-bins { height: 48px; display: flex; align-items: flex-end; justify-content: center; gap: 2px; }
  .wb-strip-bins .wb-bin--mini { width: 36px; flex-basis: 36px; min-width: 36px; }
  .wb-strip-bins .wb-bin--mini + .wb-bin--mini { width: 30px; flex-basis: 30px; min-width: 30px; }
  .wb-strip-bins > i { width: 4px; height: 4px; border-radius: 50%; background: var(--hb-b2); margin-bottom: 20px; }
  .wb-strip-date { font-size: 12px; color: var(--hb-t2); font-variant-numeric: tabular-nums; }
  .wb-day { height: 70px; }
  .wb-fleet { padding-bottom: 2px; }
}
@media (min-width: 1100px) {
  .wb-fleet { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); overflow: visible; align-items: stretch; grid-auto-rows: 1fr; }
  .wb-fleet > li { align-items: start; }
  .wb-fleet > li > .wb-bin { align-self: center; }
}
@media (max-width: 1279px) {
}
@media (max-width: 760px) {
  .wb-hero { grid-template-columns: 108px minmax(0, 1fr); gap: 14px; padding: 18px 16px 18px 10px; }
  .wb-legend { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); width: 100%; }
  .wb-month-summary { margin-left: 0; }
  .hb-waste.wb-panel { gap: 24px; }
  .wb-hero .wb-bin--hero { width: 100%; max-width: 180px; }
  .wb-hero-copy { gap: 8px; }
  .wb-countdown { font-size: clamp(36px, 11vw, 46px); }
  .wb-type { font-size: 11px; }
  .wb-date { font-size: 13px; }
  /* Telefon: „Další svozy“ jako svislý seznam kompaktních řádků (bez karuselu a scroll-snap). */
  .wb-fleet { display: flex; flex-direction: column; gap: 10px; overflow: visible; scroll-snap-type: none; padding: 0; }
  .wb-fleet > li { flex: none; scroll-snap-align: none; grid-template-columns: 64px minmax(0, 1fr); gap: 14px; padding: 14px 16px 14px 10px; border-radius: 18px; }
  .wb-fleet .wb-bin--regular { width: 60px; }
  .wb-fleet .wb-card-copy { grid-template-columns: minmax(0, 1fr) auto; grid-template-rows: none; grid-template-areas: "type count" "date count" "last last" "cycle cycle" "action action"; gap: 4px 12px; }
  .wb-fleet .wb-card-copy > .wb-type { grid-area: type; align-self: end; }
  .wb-fleet .wb-card-count { grid-area: count; align-self: start; }
  .wb-fleet .wb-card-copy .wb-countdown { font-size: 28px; line-height: 1.15; }
  .wb-fleet .wb-card-date { grid-area: date; align-self: start; font-size: 13px; }
  .wb-fleet .wb-card-copy .wb-last { grid-area: last; flex-direction: row; align-items: center; gap: 5px; min-height: 0; margin-top: 4px; }
  .wb-fleet .wb-card-copy .wb-last svg { display: block; }
  .wb-fleet .wb-card-copy .wb-last:empty { display: none; }
  .wb-fleet .wb-card-copy .wb-last-value { font-size: 12px; }
  .wb-fleet .wb-card-copy .wb-cycle { grid-area: cycle; margin-top: 6px; }
  .wb-fleet .wb-card-copy .wb-action { grid-area: action; }
  /* Kompaktní řádky: akce jen u dnešních/zítřejších svozů, prázdná stopa cyklu se neukazuje. */
  .wb-fleet > li:not(.is-today):not(.is-tomorrow) .wb-action, .wb-fleet .wb-cycle.is-empty { display: none; }
  .wb-month { padding: 8px 10px 12px; border-radius: 20px; }
  .wb-month-grid { gap: 2px; }
  .wb-day { height: 64px; gap: 3px; padding: 5px 0 3px; border-radius: 12px; }
  .wb-day time { font-size: 13px; width: 26px; height: 26px; }

  .wb-month-label { font-size: 18px; }
  .wb-month-bar { padding: 8px 0 4px 4px; }
  .wb-day.is-quiet .wb-mini-stack { display: none; }
  .wb-hero .wb-last { flex-direction: column; align-items: flex-start; gap: 1px; font-size: 12px; }
  .wb-hero .wb-last svg { display: none; }
  .wb-hero .wb-last-value { flex-basis: auto; padding-left: 0; font-size: 14px; }
  .wb-mini-stack { height: 28px; gap: 1px; }
  .wb-mini-stack .wb-bin--mini { width: 19px; flex-basis: 19px; min-width: 19px; }
  .wb-month-foot { padding: 12px 4px 0; }
  .wb-section-title span { font-size: 12px; }
  .wb-summary { gap: 8px; }
}
@media (prefers-reduced-motion: reduce) {
  .wb-panel *, .wb-bin * { animation: none !important; transition: none !important; }
}
`;

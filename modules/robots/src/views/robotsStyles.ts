export const robotsStyles = `
.rb {
  --rb-cleaning: var(--hb-ac);
  --rb-returning: #5eb1ff;
  --rb-charging: var(--hb-ok);
  --rb-docked: var(--hb-ok);
  --rb-emptying: #a78bfa;
  --rb-washing: #22d3ee;
  --rb-paused: var(--hb-warn);
  --rb-error: var(--hb-crit);
  --rb-offline: var(--hb-t3);
  --rb-idle: var(--hb-t2);
  --rb-body-hi: #4a5361;
  --rb-body: #262c35;
  --rb-body-lo: #12161c;
  --rb-turret-hi: #3a414c;
  --rb-turret: #0d1015;
  --rb-bumper: rgb(255 255 255 / 9%);
  --rb-rim: rgb(255 255 255 / 12%);
  --rb-seam: rgb(255 255 255 / 10%);
  --rb-brush: #c9d1dc;
  --rb-window: rgb(120 170 255 / 30%);
  --rb-thumb: color-mix(in srgb, var(--hb-t1) 16%, var(--hb-s1));
  --rb-fill: color-mix(in srgb, var(--hb-t1) 6%, var(--hb-s1));
  display: block;
  max-width: 1440px;
  margin: 0 auto;
  color: var(--hb-t1);
}
[data-theme='light'] .rb {
  --rb-body-hi: #ffffff;
  --rb-body: #eceff3;
  --rb-body-lo: #c9d0da;
  --rb-turret-hi: #f6f7f9;
  --rb-turret: #b7bfca;
  --rb-bumper: rgb(16 24 40 / 10%);
  --rb-rim: rgb(16 24 40 / 12%);
  --rb-seam: rgb(16 24 40 / 10%);
  --rb-brush: #6b7686;
  --rb-window: rgb(40 60 90 / 22%);
  --rb-thumb: var(--hb-s1);
}
.rb * { box-sizing: border-box; }
:where(.rb) :where(h1, h2, h3, p, ul, ol) { margin: 0; }
:where(.rb) :where(ul, ol) { padding: 0; list-style: none; }
.rb :where(button) { font: inherit; color: inherit; }
.rb [data-rb-tone='cleaning'], .rb[data-rb-tone='cleaning'] { --rb-tone: var(--rb-cleaning); }
.rb [data-rb-tone='returning'] { --rb-tone: var(--rb-returning); }
.rb [data-rb-tone='charging'] { --rb-tone: var(--rb-charging); }
.rb [data-rb-tone='docked'] { --rb-tone: var(--rb-docked); }
.rb [data-rb-tone='emptying'] { --rb-tone: var(--rb-emptying); }
.rb [data-rb-tone='washing'] { --rb-tone: var(--rb-washing); }
.rb [data-rb-tone='paused'] { --rb-tone: var(--rb-paused); }
.rb [data-rb-tone='error'] { --rb-tone: var(--rb-error); }
.rb [data-rb-tone='offline'] { --rb-tone: var(--rb-offline); }
.rb [data-rb-tone='idle'] { --rb-tone: var(--rb-idle); }

.rb-summary { margin: 0 0 14px; }
.rb-sub { color: var(--hb-t2); font-size: 15px; margin-top: 4px; }
.rb-eyebrow { color: var(--hb-t2); font-size: 14px; font-weight: 500; }
.rb-micro { color: var(--hb-t2); font-size: 13px; }
.rb-note { color: var(--hb-t2); font-size: 14px; }

/* Floor switcher: soft segmented pills, the active one lifts. */
.rb-floors {
  display: grid; grid-auto-flow: column; grid-auto-columns: minmax(168px, 1fr); gap: 6px; padding: 5px; margin-bottom: 20px; width: 100%;
  overflow-x: auto; scrollbar-width: none; border-radius: 18px; background: var(--hb-fill);
}
.rb-floor {
  display: flex; flex-direction: column; align-items: flex-start; gap: 2px; min-width: 168px;
  padding: 10px 16px; border: 0; border-radius: 14px; background: transparent; cursor: pointer; text-align: left;
  transition: background var(--hb-dur-base) var(--hb-ease-out), box-shadow var(--hb-dur-base) var(--hb-ease-out), transform var(--hb-dur-fast) var(--hb-ease-out);
}
.rb-floor:hover { background: var(--hb-fill); }
.rb-floor:active { transform: scale(0.98); }
.rb-floor[aria-selected='true'] { background: var(--rb-thumb); box-shadow: var(--hb-elev-1); }
.rb-floor[aria-selected='true'] .rb-floor-name { color: var(--hb-t1); }
.rb-floor-name { color: var(--hb-t2); }
.rb-floor-name { font-size: 16px; font-weight: 600; letter-spacing: -0.01em; }
.rb-floor-meta { display: flex; align-items: center; gap: 7px; color: var(--hb-t2); font-size: 13px; white-space: nowrap; }
.rb-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--rb-tone, var(--hb-t3)); flex: none; }
.rb-dot[data-rb-att='crit'] { background: var(--hb-crit); box-shadow: 0 0 0 3px color-mix(in srgb, var(--hb-crit) 22%, transparent); }

/* Layout */
.rb-grid {
  display: grid; gap: 18px;
  grid-template-columns: minmax(0, 5fr) minmax(0, 7fr);
  /* Both columns end on the same line: the last card of the shorter column absorbs the rest. */
  align-items: stretch;
  animation: rb-in var(--hb-dur-slow) var(--hb-ease-out) both;
}
.rb-col { display: flex; flex-direction: column; gap: 18px; min-width: 0; }
.rb-col > .rb-care, .rb-col > .rb-clean { flex: 1 1 auto; }
.rb-care, .rb-clean { display: flex; flex-direction: column; }
.rb-clean > .rb-map-row { flex: 1 1 auto; display: flex; flex-direction: column; }
.rb-clean .rb-clean-side { flex: 1 1 auto; display: flex; flex-direction: column; }
.rb-clean .rb-clean-actions { margin-top: auto; }
.rb-card { min-width: 0; }
@keyframes rb-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }

.rb-card { position: relative; padding: 22px; overflow: hidden; }
.rb-card-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
.rb-card-head-side { display: flex; align-items: center; gap: 10px; }
.rb-card-head h3 { font-size: 18px; font-weight: 600; letter-spacing: -0.01em; }

/* Hero */
.rb-hero {
  display: grid; grid-template-columns: 172px minmax(0, 1fr); gap: 22px; align-items: center; padding: 26px;
  background:
    radial-gradient(90% 120% at 0% 0%, color-mix(in srgb, var(--rb-tone) 20%, transparent), transparent 62%),
    radial-gradient(70% 90% at 100% 100%, color-mix(in srgb, var(--rb-tone) 7%, transparent), transparent 70%),
    var(--hb-s1);
  transition: background var(--hb-dur-slow) var(--hb-ease-out);
}
.rb-hero-art { position: relative; aspect-ratio: 1; }
.rb-hero-art::before {
  content: ''; position: absolute; inset: 4%; border-radius: 50%;
  background: radial-gradient(closest-side, color-mix(in srgb, var(--rb-tone) 30%, transparent), transparent);
  filter: blur(14px); opacity: 0.75;
}
.rb-art { position: relative; width: 100%; height: 100%; }
.rb-art svg { width: 100%; height: 100%; display: block; overflow: visible; }
.rb-art-photo img { width: 100%; height: 100%; object-fit: contain; filter: drop-shadow(0 14px 22px rgb(0 0 0 / 28%)); }
.rb-art-brush > g { transform-box: fill-box; transform-origin: center; }
.rb-art[data-rb-art-tone='cleaning'] .rb-art-brush > g { animation: rb-spin 1.6s linear infinite; }
.rb-art[data-rb-art-tone='cleaning'] svg { animation: rb-drift 7s var(--hb-ease-amb, ease-in-out) infinite; }
.rb-art-led { transform-box: fill-box; transform-origin: center; }
.rb-art[data-rb-art-tone='charging'] .rb-art-led, .rb-art[data-rb-art-tone='error'] .rb-art-led { animation: rb-pulse 2.4s ease-in-out infinite; }
@keyframes rb-spin { to { transform: rotate(360deg); } }
@keyframes rb-drift { 0%, 100% { transform: translate(0, 0) rotate(0deg); } 50% { transform: translate(3px, -2px) rotate(4deg); } }
@keyframes rb-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
.rb-hero-body { min-width: 0; }
.rb-state { font-size: 34px; font-weight: 600; letter-spacing: -0.025em; line-height: 1.15; margin-top: 2px; color: var(--hb-t1); }
.rb-room { color: var(--hb-t2); font-size: 15px; margin-top: 6px; }
.rb-room b { color: var(--hb-t1); font-weight: 600; }
.rb-progress { position: relative; height: 6px; border-radius: 6px; background: var(--hb-fill-strong); margin: 16px 0 28px; }
.rb-progress span { position: absolute; inset: 0 auto 0 0; border-radius: inherit; background: linear-gradient(90deg, color-mix(in srgb, var(--rb-tone) 55%, transparent), var(--rb-tone)); transition: width var(--hb-dur-slow) var(--hb-ease-out); }
.rb-progress em { position: absolute; top: 12px; left: 0; font-style: normal; font-size: 13px; color: var(--hb-t2); }
.rb-hero-foot { display: flex; align-items: center; justify-content: space-between; gap: 14px; flex-wrap: wrap; margin-top: 18px; }
.rb-hero-actions { display: flex; gap: 8px; flex-wrap: wrap; }

.rb-battery { display: flex; align-items: center; gap: 10px; }
.rb-battery svg { width: 44px; height: 22px; }
.rb-batt-shell { fill: none; stroke: color-mix(in srgb, var(--hb-t1) 35%, transparent); stroke-width: 1.5; }
.rb-batt-cap { fill: color-mix(in srgb, var(--hb-t1) 35%, transparent); }
.rb-batt-fill { fill: var(--hb-ok); transition: width var(--hb-dur-slow) var(--hb-ease-out); }
[data-rb-batt='warn'] .rb-batt-fill { fill: var(--hb-warn); }
[data-rb-batt='crit'] .rb-batt-fill { fill: var(--hb-crit); }
.rb-battery span { display: flex; flex-direction: column; line-height: 1.2; }
.rb-battery b { font-size: 20px; font-weight: 600; font-variant-numeric: tabular-nums; }
.rb-battery em { font-style: normal; font-size: 13px; color: var(--hb-t2); }

/* Buttons */




.rb-ico { width: 20px; height: 20px; fill: currentColor; flex-shrink: 0; }
.rb-ico-opt { width: 22px; height: 22px; flex-shrink: 0; color: inherit; }
.rb-opt-chip:not([aria-pressed='true']) .rb-ico-opt,
.rb .hb-seg button:not([aria-checked='true']) .rb-ico-opt {
  color: var(--hb-t1);
}
.rb-opt-chip[aria-pressed='true'] .rb-ico-opt,
.rb .hb-seg-wrap[data-tone='accent'] .hb-seg button[aria-checked='true'] .rb-ico-opt {
  color: var(--hb-sel-ink);
}
.rb-seg-stack {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  min-width: 0;
  width: 100%;
  padding: 4px 0;
}
.rb-seg-opt-label {
  font-size: 13px;
  font-weight: inherit;
  line-height: 1.1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}
.rb .hb-seg button:has(.rb-seg-stack) {
  min-height: 44px;
  padding-inline: 4px;
}
.rb-opt-tile.hb-chip {
  flex-direction: row;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  min-width: 68px;
}
.rb-opt-tile .rb-opt-label {
  font-size: 13px;
  line-height: 1.15;
  text-align: center;
  font-weight: 600;
}
.rb-problem details summary {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.rb-start .rb-ico { margin-right: 2px; vertical-align: -2px; }






.rb-link { border: 0; background: none; color: var(--hb-ac); cursor: pointer; padding: 0; font-weight: 550; }
.rb button:focus-visible { outline: 2px solid var(--hb-ac); outline-offset: 2px; }

/* Problem card */
.rb-problem {
  background:
    radial-gradient(100% 120% at 0% 0%, color-mix(in srgb, var(--hb-crit) 16%, transparent), transparent 65%),
    var(--hb-s1);
}
.rb-problem .rb-eyebrow { color: var(--hb-crit); font-weight: 600; }
.rb-problem h3 { font-size: 22px; font-weight: 600; letter-spacing: -0.015em; margin: 4px 0 14px; }
.rb-problem-cta { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 14px; margin-top: 18px; }
.rb-problem-cta span { font-size: 13px; color: var(--hb-t2); }
.rb-problem-more { margin-top: 14px; font-size: 14px; color: var(--hb-t2); }
.rb-problem details { margin-top: 14px; color: var(--hb-t3); font-size: 13px; }
.rb-problem summary { cursor: pointer; }

/* Rooms + map */
.rb-map {
  position: relative; border-radius: 14px; overflow: hidden; margin-bottom: 16px; aspect-ratio: 350 / 274; display: grid; place-items: center;
  background: radial-gradient(120% 100% at 50% 0%, color-mix(in srgb, var(--hb-ac) 8%, transparent), transparent 70%), var(--rb-fill);
}
.rb-map img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; padding: 12px; }
.rb-map-empty { color: var(--hb-t2); font-size: 14px; padding: 24px; text-align: center; max-width: 340px; }
.rb-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.rb-chip-ico { width: 19px; height: 19px; flex-shrink: 0; color: inherit; opacity: 0.92; }
.rb-chip .rb-chip-ico { margin-right: -2px; }
/* „Základní / Pokročilé“: a small switch above the controls; advanced rows fade in. */
.rb-controls .rb-level { justify-content: space-between; flex-wrap: nowrap; }
.rb-controls .rb-level .hb-seg-label { width: auto; flex: 1 1 auto; color: var(--hb-t1); font-size: 15px; font-weight: 600; }
.rb-controls .rb-level .hb-seg { flex: 0 1 220px; width: auto; }
.rb-controls .rb-adv { animation: rb-in var(--hb-dur-base, 200ms) var(--hb-ease-out, ease-out); }




@keyframes rb-pop { from { transform: scale(0.4); opacity: 0; } to { transform: none; opacity: 1; } }
.rb-hint { color: var(--hb-t2); font-size: 14px; margin: 16px 0 14px; }
.rb-controls { display: grid; gap: 14px; margin-bottom: 22px; }
.rb-controls .hb-seg button { min-height: 44px; }
.rb-opt-wrap { display: grid; gap: 8px; }
.rb-opt-grid {
  display: flex; flex-wrap: wrap; gap: 8px; width: 100%; min-width: 0;
}
.rb-opt-chip.hb-chip {
  min-height: 44px; padding: 10px 14px; font-size: 14px; font-weight: 600;
  flex: 1 1 calc(50% - 4px); max-width: 100%; justify-content: center; box-sizing: border-box;
}
@media (min-width: 520px) {
  .rb-opt-chip.hb-chip { flex: 0 1 auto; min-width: 0; }
}
.rb-problem-refill { margin: 12px 0 0; font-size: 14px; color: var(--hb-t2); line-height: 1.45; }
.rb-problem-step { margin: 8px 0 0; font-size: 15px; line-height: 1.45; }
.rb-maint-head .rb-dock-ack-chip { margin: 0; flex: 0 1 auto; max-width: 100%; }






/* Maintenance */
/* Maintenance guide sheet */
.rbg { display: grid; gap: 18px; }
.rbg-sub { margin: -6px 0 0; color: var(--hb-t2); font-size: 14px; }
.rbg-photo { position: relative; margin: 0; border-radius: var(--hb-radius-md, 14px); overflow: hidden; background: var(--rb-fill, var(--hb-fill)); aspect-ratio: 4 / 3; }
.rbg-photo img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; }
.rbg-photo[data-rbg-spot]::after { content: ''; position: absolute; inset: 0; pointer-events: none; background: radial-gradient(circle at var(--rbg-x) var(--rbg-y), transparent calc(var(--rbg-r) * 0.75), rgba(4, 8, 16, 0.5) calc(var(--rbg-r) * 0.75 + 6%)); }
.rbg-ring { position: absolute; left: var(--rbg-x); top: var(--rbg-y); width: calc(var(--rbg-r) * 1.5); aspect-ratio: 1; transform: translate(-50%, -50%); border-radius: 50%; box-shadow: 0 0 0 2px var(--hb-ac), 0 0 0 6px color-mix(in srgb, var(--hb-ac) 28%, transparent); z-index: 1; }
.rbg-video { margin: 0; display: grid; gap: 6px; align-content: start; }
.rbg-interval { justify-self: start; margin-top: -8px; white-space: normal; }
.rbg-hero { display: grid; gap: 14px; grid-template-columns: minmax(0, 1fr); }
.rbg-hero:has(.rbg-video):has(.rbg-photo) .rbg-photo { aspect-ratio: 16 / 10; }
@media (min-width: 760px) {
  .rbg-hero:has(.rbg-video):has(.rbg-photo) { grid-template-columns: minmax(0, 1fr) minmax(0, 1.25fr); align-items: start; }
  .rbg-hero:has(.rbg-video):has(.rbg-photo) .rbg-photo { aspect-ratio: 16 / 11; }
  .rbg .hb-stepper[data-variant='instructions'] .hb-step:has(.hb-step-media) { grid-template-columns: 26px minmax(0, 1fr) minmax(0, 300px); }
  .rbg .hb-stepper[data-variant='instructions'] .hb-step-media { grid-column: 3; grid-row: 1; }
}
.rbg-video video { width: 100%; aspect-ratio: 16 / 9; border-radius: var(--hb-radius-md, 14px); background: #000; }
.rbg-video figcaption, .rbg-source, .rbg-note { color: var(--hb-t2); font-size: 13px; margin: 0; }
.rbg-source a { color: var(--hb-ac); }
.rbg-note code { font-size: 12px; overflow-wrap: anywhere; }
.rbg-foot { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 10px; width: 100%; }

/* Dock */

/* Údržba: one tile per item (counters, tanks, guide-only parts), grouped Robot / Dok. */
.rb-maint-summary { font-weight: 600; }
.rb-care[data-rb-maint='ok'] .rb-maint-summary { color: var(--hb-ok); }
.rb-care[data-rb-maint='warn'] .rb-maint-summary { color: var(--hb-warn); }
.rb-care[data-rb-maint='crit'] .rb-maint-summary, .rb-maint-note { color: var(--hb-crit); }
[data-theme='light'] .rb-care[data-rb-maint='warn'] .rb-maint-summary { color: #a35d00; }
[data-theme='light'] .rb-care[data-rb-maint='crit'] .rb-maint-summary, [data-theme='light'] .rb-maint-note { color: #c4262c; }
.rb-maint-group + .rb-maint-group { margin-top: 16px; }
.rb-maint-head { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 4px 10px; margin-bottom: 8px; }
.rb-maint-head h4 { margin: 0; font-size: 13px; font-weight: 600; color: var(--hb-t2); }
.rb-maint-note { font-size: 13px; font-weight: 600; min-width: 0; overflow-wrap: anywhere; }
.rb-maint-grid { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.rb-maint-grid li { display: grid; min-width: 0; }
/* Odd count: the last tile spans the row instead of leaving an empty cell. */
.rb-maint-grid > li:last-child:nth-child(odd) { grid-column: 1 / -1; }
.rb .rb-maint-tile { width: 100%; box-sizing: border-box; min-height: 104px; -webkit-tap-highlight-color: transparent; }
.rb .rb-maint-tile .hb-tile-icon { width: 40px; height: 40px; border-radius: 50%; margin-bottom: 6px; }
.rb .rb-maint-tile .hb-tile-icon:has(.hb-ring) { background: none; }
.rb .rb-maint-tile .hb-tile-label { font-size: 14px; line-height: 1.3; }
.rb-maint-pct { font-style: normal; font-size: 12px; font-weight: 600; font-variant-numeric: tabular-nums; color: var(--hb-t1); }
.rb-maint-tile .rb-tank { width: 20px; height: 26px; }
.rb-maint-glyph { width: 18px; height: 18px; fill: currentColor; }
.rb-maint-foot { margin: 12px 0 0; }
.rb-maint-pct::after { content: '%'; font-size: 9px; font-weight: 500; margin-left: 1px; opacity: 0.7; }
/* Overdue (0 %): empty neutral track (never a full ring – that reads as 100 %), red „0 %“ inside. */
.rb .rb-maint-tile[data-tone='crit'] .rb-maint-pct { color: var(--hb-crit); }
[data-theme='light'] .rb .rb-maint-tile[data-tone='crit'] .rb-maint-pct { color: #c4262c; }
[data-theme='light'] .rb .rb-maint-tile[data-tone='warn'] .hb-tile-status { color: #a35d00; }
[data-theme='light'] .rb .rb-maint-tile[data-tone='crit'] .hb-tile-status { color: #c4262c; }
/* Wide tiles (desktop column): icon beside the text, shorter rows; phones keep the stacked tile. */
.rb-maint-grid li { container-type: inline-size; }
@container (min-width: 200px) {
  .rb .rb-maint-tile { display: grid; grid-template-columns: 40px minmax(0, 1fr); grid-template-rows: auto auto; column-gap: 12px; align-content: center; min-height: 72px; }
  .rb .rb-maint-tile .hb-tile-icon { grid-row: 1 / 3; margin: 0; align-self: center; }
}
.rb-tank { width: 24px; height: 32px; flex: none; }
.rb-tank-shell { fill: none; stroke: color-mix(in srgb, var(--hb-t1) 30%, transparent); stroke-width: 1.5; }
.rb-tank-fill { fill: #4cb8ff; opacity: 0.85; }
.rb-tank[data-rb-tank='dirty_water'] .rb-tank-fill { fill: #9a8f80; }
.rb-tank[data-rb-tank='cleaning_fluid'] .rb-tank-fill { fill: #a78bfa; }
[data-rb-ok='false'] .rb-tank-fill { fill: var(--hb-warn); }

/* Confirm sheet + toast */
.rb-scrim {
  position: fixed; inset: 0; z-index: 40; display: grid; place-items: center; padding: 16px;
  background: rgb(5 8 14 / 46%); backdrop-filter: blur(6px); animation: rb-fade var(--hb-dur-base) var(--hb-ease-out);
}
.rb-sheet {
  width: min(440px, 100%); padding: 24px; border-radius: 22px; background: var(--hb-s1); box-shadow: var(--hb-elev-2);
  animation: rb-rise var(--hb-dur-slow) var(--hb-ease-out);
}
.rb-sheet h3 { font-size: 21px; font-weight: 600; letter-spacing: -0.015em; }
.rb-sheet ul { display: grid; gap: 8px; margin: 16px 0; }
.rb-sheet li { padding: 12px 14px; border-radius: 12px; background: var(--rb-fill); font-size: 15px; line-height: 1.4; }
.rb-sheet-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 18px; }
@keyframes rb-fade { from { opacity: 0; } }
@keyframes rb-rise { from { opacity: 0; transform: translateY(14px) scale(0.98); } }



.rb-empty { padding: 32px 0; }
.rb-empty p { color: var(--hb-t2); max-width: 560px; margin-top: 8px; font-size: 15px; line-height: 1.5; }

/* Tablet portrait / small desktop */
@media (max-width: 1080px) {
  .rb-grid { display: flex; flex-direction: column; align-items: stretch; }
  .rb-col { display: contents; }
  .rb-hero { order: 1; }
  .rb-problem { order: 2; }
  .rb-clean { order: 3; }
  .rb-care { order: 4; }
}
@media (max-width: 600px) {
    .rb-floors { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); width: auto; }
  .rb-floor { min-width: 0; padding: 9px 10px; }
  .rb-floor-meta { max-width: 100%; overflow: hidden; text-overflow: ellipsis; }
  .rb-floor-help, .rb-floor-robot { display: none; }
  .rb-card { padding: 18px; }
  .rb-hero { grid-template-columns: 104px minmax(0, 1fr); gap: 14px; padding: 18px; }
  .rb-state { font-size: 26px; }
  .rb-hero-foot { margin-top: 14px; }
  .rb-hero-actions { width: 100%; }
  
  
  
  
  .rb-sheet { align-self: end; border-radius: 22px 22px 16px 16px; }
}
@media (prefers-reduced-motion: reduce) {
  .rb *, .rb *::before, .rb *::after, .rb { animation: none !important; transition: none !important; }
}

/* Phase B: vector floor plan */
.rb-map[data-map-kind='vector'] { aspect-ratio: auto; display: block; padding: 8px; background: var(--rb-fill); }
.rb-map-loading { position: absolute; inset: 18%; border-radius: 18px; background: color-mix(in srgb, var(--hb-t1) 5%, transparent); animation: rv-breathe 1.6s ease-in-out infinite alternate; }
@keyframes rv-breathe { from { opacity: .45; } to { opacity: 1; } }
/* Rooms are low-chroma tonal tiles (one hue per room, --rv-hue); selection is the accent. */
.rv {
  --rv-room-l: 30%; --rv-room-dl: 1.6%; --rv-room-c: 0.024;
  --rv-sel-l: 40%; --rv-sel-c: 0.095;
  --rv-sel-mix: 30%;
  --rv-grain: rgb(255 255 255 / 2.4%);
  --rv-light: rgb(255 255 255 / 5%);
  --rv-shade: rgb(0 0 0 / 55%);
  --rv-lift: rgb(0 0 0 / 45%);
  --rv-dock: color-mix(in srgb, var(--hb-t1) 78%, var(--rb-fill));
  --rv-dock-plate: color-mix(in srgb, var(--hb-t1) 14%, transparent);
  --rv-sel-base: var(--rb-fill);
  --rv-outline: color-mix(in srgb, var(--hb-t1) 30%, transparent);
  --rv-room-top: color-mix(in srgb, var(--hb-t1) 15%, var(--hb-s1));
  --rv-room-bottom: color-mix(in srgb, var(--hb-t1) 10%, var(--hb-s1));
  --rv-sel-a: color-mix(in oklch, var(--hb-ac) 80%, var(--hb-s1));
  --rv-sel-b: color-mix(in oklch, var(--hb-ac) 22%, var(--hb-s1));
  --rv-trail: var(--hb-ac);
  --rv-cover: color-mix(in srgb, var(--hb-ac) 34%, transparent);
  --rv-nogo: #ff6b6b;
  --rv-bot-edge: #d3d9e3;
  --rv-label: color-mix(in srgb, var(--hb-t1) 82%, transparent);
  --rv-label-sel: var(--hb-sel-ink);
  --rv-wall-line: color-mix(in srgb, var(--hb-t1) 34%, var(--rb-fill));
  --rv-seam: color-mix(in srgb, var(--hb-t1) 14%, var(--rb-fill));
  --rv-divider: color-mix(in srgb, var(--hb-t1) 14%, transparent);
  position: relative; margin: 0 auto;
}
[data-theme='light'] .rv {
  --rv-room-l: 94%; --rv-room-dl: -1.6%; --rv-room-c: 0.045;
  --rv-sel-l: 88%; --rv-sel-c: 0.075;
  --rv-sel-mix: 13%;
  --rv-grain: rgb(16 24 40 / 8%);
  --rv-light: rgb(255 255 255 / 70%);
  --rv-shade: rgb(16 24 40 / 34%);
  --rv-lift: rgb(16 24 40 / 26%);
  --rv-cast: rgb(16 24 40 / 42%);
  --rv-dock: #4a5568;
  --rv-dock-plate: rgb(16 24 40 / 9%);
  --rv-sel-base: #ffffff;
  --rv-outline: #8994a6;
  --rv-room-top: #ffffff;
  --rv-room-bottom: #f6f8fb;
  --rv-sel-a: color-mix(in oklch, var(--hb-ac) 82%, white);
  --rv-sel-b: color-mix(in oklch, var(--hb-ac) 17%, white);
  --rv-nogo: #e5484d;
  --rv-bot-edge: #dfe4ec;
  --rv-label: #2b3340;
  --rv-label-sel: var(--hb-sel-ink);
  --rv-wall-line: #6f7a8c;
  --rv-seam: #aab3c0;
  --rv-divider: rgb(16 24 40 / 12%);
}
.rv svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
.rv-floor { fill: color-mix(in srgb, var(--rv-room-bottom) 55%, transparent); stroke: none; }
.rv[data-walls] .rv-floor { display: none; }
.rv-walls { fill: var(--rv-outline); stroke: var(--rv-outline); stroke-linejoin: round; pointer-events: none; }
[data-theme='light'] .rv-walls { filter: drop-shadow(0 8px 18px rgb(16 24 40 / 12%)); }
.rv-room-pad { fill: var(--rv-room-bottom); stroke: var(--rv-room-bottom); stroke-linejoin: round; pointer-events: none; }
.rv-room, .rv-room-under, .rv[data-walls] .rv-label {
  --rv-tile: oklch(calc(var(--rv-room-l) + var(--rv-step, 0) * var(--rv-room-dl)) var(--rv-room-c) var(--rv-hue, 250));
  fill: url(#rv-room); stroke: none; cursor: pointer;
  transition: fill var(--hb-dur-base, 200ms) var(--hb-ease-out, ease-out), stroke var(--hb-dur-base, 200ms) var(--hb-ease-out, ease-out), opacity var(--hb-dur-base, 200ms);
}
.rv-room:hover { opacity: .9; }
.rv-room[data-selected] { fill: url(#rv-sel); }
/* With real walls each room also strokes itself in its own colour: fills meet under the walls. */
.rv[data-walls] .rv-room { fill: var(--rv-tile); stroke: var(--rv-tile); stroke-linejoin: round; }
.rv-room-under { fill: var(--rv-tile); stroke: var(--rv-tile); stroke-linejoin: round; pointer-events: none; }
.rv[data-walls] .rv-room[data-selected], .rv-room-under[data-selected], .rv-label[data-selected] {
  /* Selected = the shared selection tint (same alpha as chips/segments) over a neutral tile:
     every selected room looks the same, no per-room hue. */
  --rv-tile: color-mix(in srgb, var(--hb-ac) var(--hb-sel-a, 16%), oklch(var(--rv-room-l) 0.006 250));
}
.rv[data-has-selection] .rv-room:not([data-selected]), .rv[data-has-selection] .rv-room-under:not([data-selected]) {
  /* With a selection the other rooms step back: almost no chroma and a little dimmer. */
  --rv-tile: oklch(calc(var(--rv-room-l) + var(--rv-step, 0) * var(--rv-room-dl) + var(--rv-dim-dl)) calc(var(--rv-room-c) * var(--rv-dim-c, 0.3)) var(--rv-hue, 250));
}
.rv { --rv-dim-dl: -3%; }
[data-theme='light'] .rv { --rv-dim-dl: 1.2%; --rv-dim-c: 0.55; }
.rv[data-has-selection] .rv-label:not([data-selected]) { opacity: .62; }
.rv-lift { fill: var(--rv-lift); stroke: none; pointer-events: none; }
.rv-depth { pointer-events: none; }
.rv-texture, .rv-light { stroke: none; pointer-events: none; }
.rv-grain { fill: none; stroke: var(--rv-grain); }
.rv-wall-shadow { fill: none; stroke: var(--rv-shade); stroke-linecap: round; stroke-linejoin: round; }
.rv[data-walls] .rv-room-pad { fill: var(--rv-seam); stroke: var(--rv-seam); }
.rv-sel { pointer-events: none; }
.rv-sel-line { fill: none; stroke: var(--hb-ac); stroke-linejoin: round; stroke-linecap: round; pointer-events: none; animation: rv-fade-in 260ms var(--hb-ease-out, ease-out); }
.rv-wall-cast { fill: none; stroke: var(--rv-cast, transparent); stroke-linecap: round; stroke-linejoin: round; pointer-events: none; }
/* Route order markers: the shared selection badge, small, on the leg's straight stretch. */
.rv-step {
  position: absolute; transform: translate(-50%, -50%); display: grid; place-items: center; width: 17px; height: 17px; border-radius: 50%;
  background: var(--hb-ac); color: var(--hb-on-ac, #fff); box-shadow: 0 0 0 2px var(--rb-fill), 0 1px 3px rgb(16 24 40 / 25%);
  font-size: 10.5px; font-weight: 750; font-variant-numeric: tabular-nums; line-height: 1; pointer-events: none;
  animation: rv-fade-in 260ms var(--hb-ease-out, ease-out);
}
/* Planned route to the selected rooms: dashed accent line through the doors. */
.rv-route-layer { pointer-events: none; animation: rv-fade-in 260ms var(--hb-ease-out, ease-out); }
.rv-route-casing { fill: none; stroke: color-mix(in srgb, var(--rb-fill) 70%, transparent); stroke-width: 6px; stroke-linecap: round; stroke-linejoin: round; vector-effect: non-scaling-stroke; }
.rv-route { fill: none; stroke: var(--hb-ac); stroke-width: 2.5px; stroke-linecap: round; stroke-linejoin: round; vector-effect: non-scaling-stroke; pointer-events: none; }
.rv-route-arrow { fill: none; stroke-width: 2px; stroke: var(--hb-ac); stroke-width: 2.25px; stroke-linecap: round; stroke-linejoin: round; vector-effect: non-scaling-stroke; paint-order: stroke; }
.rv-route-stop { fill: var(--rb-fill); stroke: var(--hb-ac); stroke-width: 2px; vector-effect: non-scaling-stroke; }
.rv-sel-ring { fill: none; stroke: var(--hb-ac); stroke-linejoin: round; stroke-linecap: round; pointer-events: none; animation: rv-fade-in 260ms var(--hb-ease-out, ease-out); }
@keyframes rv-fade-in { from { opacity: 0; } }
/* Walls: one outline shell; seams between rooms are thinner and quieter (same shared arcs). */
.rv-wall-line { fill: none; stroke: var(--rv-wall-line); stroke-linecap: round; stroke-linejoin: round; pointer-events: none; }
.rv .rv-wall-line.rv-seam { stroke: var(--rv-seam); }
/* Route history is context, not content: only the recent stretch unless "Trasa" is on. */
/* Trail chip ON: the whole run as a calm line over the swept area (OFF draws only the tail). */
.rv-trail.rv-trail-line { stroke-opacity: .7; stroke-width: 1.5px; }
.rv-trail.rv-trail-tail { stroke-opacity: 1; stroke-width: 3px; }
.rv-divider { fill: none; stroke: var(--rv-divider); stroke-width: 1px; vector-effect: non-scaling-stroke; stroke-linecap: round; pointer-events: none; }
.rv-callout {
  position: absolute; z-index: 2; max-width: min(240px, 70%); padding: 8px 11px; border-radius: 12px;
  transform: translate(var(--rv-cx, -50%), calc(-100% - 22px));
  background: var(--hb-s1); color: var(--hb-t1); font-size: 13px; line-height: 1.3;
  box-shadow: 0 6px 20px -6px rgb(0 0 0 / 35%), inset 0 0 0 1px color-mix(in srgb, var(--hb-crit) 45%, transparent);
  display: grid; gap: 2px; pointer-events: none; animation: rv-callout-in 260ms var(--hb-ease-out, ease-out);
}
.rv-callout b { color: var(--hb-crit); font-weight: 650; }
.rv-callout span { color: var(--hb-t2); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.rv-callout::after {
  content: ''; position: absolute; left: calc(-1 * var(--rv-cx, -50%)); bottom: -6px; width: 12px; height: 12px; margin-left: -6px;
  background: var(--hb-s1); transform: rotate(45deg); box-shadow: inset -1px -1px 0 color-mix(in srgb, var(--hb-crit) 45%, transparent);
}
.rv-callout[data-below] { transform: translate(var(--rv-cx, -50%), 22px); }
.rv-callout[data-below]::after { bottom: auto; top: -6px; box-shadow: inset 1px 1px 0 color-mix(in srgb, var(--hb-crit) 45%, transparent); }
.rv-callout[data-align='start'] { --rv-cx: -14%; }
.rv-callout[data-align='end'] { --rv-cx: -86%; }
@keyframes rv-callout-in { from { opacity: 0; } }
.rv-nogo { pointer-events: none; }
.rv-nogo path { fill: color-mix(in srgb, var(--rv-nogo) 18%, transparent); stroke: var(--rv-nogo); stroke-opacity: .7; stroke-width: 1.5px; stroke-dasharray: 5 4; vector-effect: non-scaling-stroke; }
.rv-nogo circle, .rv-nogo line { fill: none; stroke: var(--rv-nogo); stroke-width: 1.8px; vector-effect: non-scaling-stroke; stroke-linecap: round; }
/* App virtual wall (no-go line): dashed, so it never reads as a real wall or a strikethrough. */
.rv-wall { stroke: var(--rv-nogo); stroke-width: 2.5px; stroke-dasharray: 2 5; stroke-linecap: round; vector-effect: non-scaling-stroke; }
.rv-cover { fill: none; stroke: var(--rv-cover); opacity: .5; stroke-linecap: round; stroke-linejoin: round; pointer-events: none; }
.rv-trail { fill: none; stroke: var(--rv-trail); stroke-opacity: .5; stroke-width: 2px; stroke-linecap: round; stroke-linejoin: round; vector-effect: non-scaling-stroke; pointer-events: none; }
.rv-trail-recent { stroke-opacity: .95; stroke-width: 2.5px; }
.rv-trail-reveal { stroke-dasharray: 1 1; stroke-dashoffset: 1; }
.rv-bot[data-docked] .rv-bot-cone, .rv-bot[data-docked] .rv-bot-pulse { display: none; }
.rv-bot[data-docked] .rv-bot-halo { display: none; }
/* Raster mode: the bitmap is the floor plan, rooms are transparent hit areas on top. */
.rv-base { pointer-events: none; }
.rv[data-base] .rv-room { fill: transparent; stroke: none; }
.rv[data-base] .rv-room:hover { fill: color-mix(in srgb, var(--hb-ac) 12%, transparent); opacity: 1; }
.rv[data-base] .rv-room[data-current] { fill: color-mix(in srgb, var(--hb-t1) 5%, transparent); }
.rv[data-base] .rv-room[data-selected] { fill: color-mix(in srgb, var(--hb-ac) 26%, transparent); }
.rv[data-base] { --rv-halo: rgb(44 50 61 / 85%); }
[data-theme='light'] .rv[data-base] { --rv-halo: rgb(255 255 255 / 90%); }
.rv[data-base] .rv-label { text-shadow: 0 0 2px var(--rv-halo), 0 0 6px var(--rv-halo); }
.rv[data-base] .rv-cover { opacity: .24; }
.rv-dock { pointer-events: none; }
.rv-dock-plate { fill: var(--rv-dock-plate); stroke: none; }
.rv-dock-body { fill: var(--rv-dock); stroke: rgb(16 24 40 / 25%); stroke-width: 1px; vector-effect: non-scaling-stroke; filter: drop-shadow(0 1px 2px rgb(0 0 0 / 30%)); }
.rv-dock-bolt { fill: var(--hb-ok, #30a46c); }
.rv-bot { pointer-events: none; }
.rv-bot-body { fill: url(#rv-bot); stroke: rgb(16 24 40 / 30%); stroke-width: 1px; vector-effect: non-scaling-stroke; filter: drop-shadow(0 2px 3px rgb(0 0 0 / 35%)); }
.rv-bot-bumper { fill: none; stroke: rgb(16 24 40 / 22%); stroke-linecap: round; }
.rv-bot-lidar { fill: #e9edf3; stroke: rgb(16 24 40 / 28%); stroke-width: 1px; vector-effect: non-scaling-stroke; }
.rv-bot-heading { fill: var(--hb-ac); }
.rv-bot-cone { fill: url(#rv-cone); opacity: .5; }
.rv-bot[data-tone='error'] .rv-bot-cone, .rv-bot[data-tone='idle'] .rv-bot-cone { display: none; }
.rv-bot-halo { fill: none; stroke: color-mix(in srgb, var(--hb-ac) 70%, transparent); stroke-width: 2px; vector-effect: non-scaling-stroke; }
.rv-bot-pulse { fill: none; stroke: var(--hb-ac); stroke-width: 2px; vector-effect: non-scaling-stroke; transform-box: fill-box; transform-origin: center; animation: rv-pulse 2.4s var(--hb-ease-out, ease-out) infinite; }
.rv-bot[data-tone='error'] .rv-bot-halo { stroke: var(--hb-crit); }
.rv-bot[data-tone='error'] .rv-bot-heading { fill: var(--hb-crit); }
.rv-bot[data-tone='returning'] .rv-bot-halo { stroke: var(--rb-returning); }
@keyframes rv-pulse { from { transform: scale(.62); opacity: .6; } to { transform: scale(1.25); opacity: 0; } }
.rv-labels { position: absolute; inset: 0; pointer-events: none; }
.rv-bot-spot { position: absolute; transform: translate(-50%, -50%); pointer-events: none; }
.rv-label {
  position: absolute; transform: translate(calc(-50% + var(--rv-nudge-x, 0px)), calc(-50% + var(--rv-nudge, 0px))); display: inline-flex; align-items: center; gap: 6px;
  font-size: 13px; font-weight: 550; letter-spacing: -.005em; color: var(--rv-label); white-space: nowrap;
  transition: opacity 180ms, color 180ms;
}
.rv-label[data-selected] { color: var(--rv-label-sel); font-weight: 650; }
/* Knock-out halo in the room's own tone: the route/lanes never run through the letters. */
.rv[data-walls] .rv-label-text { text-shadow: 0 0 3px var(--rv-tile); }
.rv-label[data-outside] { pointer-events: auto; cursor: pointer; transform: translate(calc(-50% + var(--rv-nudge-x, 0px)), calc(-50% + var(--rv-nudge, 0px))) !important; background: var(--hb-s1); border-radius: 4px; padding: 2px 4px; }
.rv-label[data-outside] .rv-label-text { max-width: 140px; white-space: normal; text-align: center; line-height: 1.15; }
.rv-leader { position: absolute; height: 1px; background: var(--rv-label); transform-origin: left center; opacity: .6; }
.rv-label[data-fit] { flex-direction: column; gap: 3px; }
/* Selected: the order badge sits exactly on the room anchor (route waypoint), the name beside
   it – or on the other side (data-flip) when the route runs there. */
.rv-label[data-selected]:not([data-fit]) { transform: translate(-11px, -50%); }
.rv-label[data-selected][data-flip]:not([data-fit]) { flex-direction: row-reverse; transform: translate(calc(-100% + 11px), -50%); }
.rv-label[data-selected][data-fit='compact'] { transform: translate(-50%, -11px); }
/* Narrow rooms: the name wraps (same size everywhere) instead of shrinking. */
.rv-label[data-fit='compact'] .rv-label-text { white-space: normal; max-width: var(--rv-maxw, 90px); text-align: center; line-height: 1.15; }

.rv-badge {
  display: inline-grid; place-items: center; min-width: 22px; height: 22px; padding: 0 6px; border-radius: 999px;
  background: var(--hb-ac); color: #fff; font-size: 12.5px; font-weight: 700; font-variant-numeric: tabular-nums;
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--hb-s1) 70%, transparent), 0 2px 6px -2px rgb(0 0 0 / 40%);
  animation: rv-badge 340ms cubic-bezier(.34, 1.56, .64, 1);
}
@keyframes rv-badge { from { transform: scale(.4); opacity: 0; } to { transform: scale(1); opacity: 1; } }
@media (max-width: 640px) {
  .rb-map[data-map-kind='vector'] { padding: 4px; margin-inline: -6px; }
  .rv-label { gap: 4px; }
}
/* Card head: title + floor/room count, the route toggle as an icon chip. */
.rb-clean-head { align-items: center; }
.rb-clean-title .rb-micro { margin-top: 3px; }
.rb-trail-toggle .rb-ico { flex: none; margin-left: -2px; }
.rb-hint b { color: var(--hb-t1); font-weight: 600; }
.rb-live { color: var(--hb-ac); font-weight: 600; }
.rb-live::before { content: ''; display: inline-block; width: 7px; height: 7px; margin: 0 6px 1px 0; border-radius: 50%; background: currentColor; animation: rb-pulse 2.4s ease-in-out infinite; }
.rb-start { font-weight: 600; }
.rb-start .rb-est { font-weight: 500; opacity: .82; white-space: nowrap; }
/* Running clean: „Pozastavit“ beside the main CTA. */
.rb-clean-actions { display: flex; flex-wrap: wrap; gap: 10px; align-items: stretch; }
.rb-clean-actions .rb-start { flex: 1 1 230px; min-width: 0; order: 1; }
/* Phones: the main CTA keeps the full width, „Pozastavit“ wraps below it. */
.rb-clean-actions > :not(.rb-start) { flex: 1 0 auto; order: 2; }
@container (min-width: 520px) { .rb-clean-actions > :not(.rb-start) { flex: 0 0 auto; order: 0; } }
/* Room picker: equal tiles in a responsive grid under (or beside) the map. */
.rb-room-grid {
  display: grid; gap: 8px; width: 100%; min-width: 0; align-content: start;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
@media (min-width: 481px) {
  .rb-room-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
@media (min-width: 900px) {
  .rb-room-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
}
.rb-room-grid .rb-room-tile.hb-chip[data-toggle] {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 6px; width: 100%; min-width: 0; min-height: 72px; padding: 12px 8px 10px;
  border-radius: var(--hb-radius-md, 12px); box-sizing: border-box;
}
.rb-room-grid .rb-room-tile.hb-chip[data-toggle][aria-pressed='true']:has(.hb-chip-badge) {
  padding-left: 8px;
}
.rb-room-grid .rb-room-tile .hb-chip-badge {
  position: absolute; top: 5px; right: 5px; left: auto; width: 20px; height: 20px; font-size: 11px;
}
.rb-room-tile-ico { width: 28px; height: 28px; flex-shrink: 0; color: inherit; opacity: 0.92; }
.rb-room-tile-name {
  font-size: 13px; font-weight: 600; line-height: 1.2; text-align: center; max-width: 100%;
  overflow-wrap: break-word; hyphens: auto;
}
.rb-clean-side .rb-room-grid + .rb-hint { margin-top: 12px; }
.rb-clean { container-type: inline-size; }
@container (min-width: 600px) {
  .rb-map-row[data-rb-portrait] { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(240px, 1fr); gap: 20px; align-items: stretch; }
  .rb-map-row[data-rb-portrait] .rb-map { margin-bottom: 0; }
  .rb-map-row[data-rb-portrait] .rb-clean-side { display: flex; flex-direction: column; gap: 14px; }
  .rb-map-row[data-rb-portrait] .rb-clean-side > * { margin: 0; }
  .rb-map-row[data-rb-portrait] .rb-controls { display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; }
  .rb-map-row[data-rb-portrait] .rb-clean-side > button, .rb-map-row[data-rb-portrait] .rb-clean-actions { width: 100%; margin-top: auto; }
  .rb-map-row[data-rb-portrait] .rb-room-grid { grid-template-columns: minmax(0, 1fr); }
}
@media (prefers-reduced-motion: reduce) {
  .rv *, .rb-map-loading { animation: none !important; transition: none !important; }
}

/* Photo card (owner's photo set, 2.5D): dock photo at rest, animated bottom view while cleaning. */
.rb-hero[data-rb-photo] { grid-template-columns: minmax(0, 1fr); gap: 16px; padding: 12px 12px 22px; align-items: stretch; }
.rb-hero[data-rb-photo] .rb-hero-art { aspect-ratio: 4 / 3.1; max-height: 420px; width: 100%; }
.rb-hero[data-rb-photo] .rb-hero-art::before { display: none; }
.rb-hero[data-rb-photo] .rb-hero-body { padding: 0 12px; }
.rb-progress { background: color-mix(in srgb, var(--hb-t1) 14%, transparent); }
.rbp {
  --rbp-stage: radial-gradient(75% 65% at 50% 42%, #4d5868 0%, #2e3642 48%, #191e26 100%);
  --rbp-floor: rgb(0 0 0 / 60%);
  --rbp-glow: radial-gradient(closest-side, rgb(205 218 236 / 34%), rgb(190 205 225 / 12%) 62%, transparent);
  --rbp-rim: drop-shadow(0 0 1.2px rgb(236 241 250 / 85%)) drop-shadow(0 0 3px rgb(220 230 245 / 25%)) drop-shadow(0 0 22px rgb(175 195 222 / 30%));
  --rbp-ink: #0e1116d1;
  position: relative; width: 100%; height: 100%; border-radius: var(--hb-radius-lg, 16px);
  background: var(--rbp-stage); overflow: hidden; isolation: isolate; container-type: inline-size;
}
[data-theme='light'] .rbp {
  --rbp-stage: radial-gradient(120% 90% at 50% 30%, #ffffff 0%, #eceef2 70%);
  --rbp-floor: rgb(20 28 40 / 28%);
  --rbp-glow: radial-gradient(closest-side, rgb(16 24 40 / 7%), rgb(16 24 40 / 2%) 62%, transparent);
  --rbp-rim: drop-shadow(0 18px 18px rgb(0 0 0 / 18%));
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--hb-t1) 7%, transparent);
}
.rbp-layer { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; transition: opacity 0.5s var(--hb-ease-out), transform 0.9s var(--hb-ease-out); }
.rbp-layer[data-on='false'] { opacity: 0; pointer-events: none; }
.rbp-dock[data-on='false'] { transform: translateY(-6%) scale(0.97); }
.rbp-bottom[data-on='false'] { transform: translateY(22%); }
.rbp-bottom[data-on='false'] * { animation: none !important; }
.rbp-dock-wrap { position: relative; height: 76%; margin-top: 4%; }
.rbp-dock-wrap::before { content: ''; position: absolute; inset: -6% -22% 4%; background: var(--rbp-glow); z-index: -1; }
.rbp-dock-wrap > img { height: 100%; width: auto; display: block; filter: var(--rbp-rim); }
.rbp-shadow { position: absolute; left: 8%; right: 8%; bottom: -3%; height: 9%; border-radius: 50%; background: radial-gradient(closest-side, var(--rbp-floor), transparent); z-index: -1; filter: blur(2px); }
.rbp-wrap { position: relative; height: 72%; aspect-ratio: 1; margin-top: 3%; }
.rbp-wrap::before { content: ''; position: absolute; inset: -14%; background: var(--rbp-glow); z-index: -1; }
.rbp-wrap::after { content: ''; position: absolute; left: 6%; right: 6%; bottom: -5%; height: 12%; border-radius: 50%; background: radial-gradient(closest-side, var(--rbp-floor), transparent); z-index: -1; filter: blur(3px); }
.rbp-disc { position: absolute; inset: 0; }
.rbp[data-rbp-view='cleaning'] .rbp-disc { animation: rbp-drift 7s ease-in-out infinite alternate; }
.rbp-base { width: 100%; height: 100%; display: block; filter: drop-shadow(0 16px 22px rgb(0 0 0 / 28%)); }
.rbp-part { position: absolute; pointer-events: none; }
.rbp-crop { overflow: hidden; }
.rbp-crop > img { position: absolute; display: block; max-width: none; }
.rbp-brush { transform-origin: 50% 50%; }
.rbp-brush > img { position: absolute; inset: 0; width: 100%; height: 100%; }
.rbp-mop { border-radius: 50%; -webkit-mask: radial-gradient(closest-side, #000 88%, transparent 100%); mask: radial-gradient(closest-side, #000 88%, transparent 100%); }
.rbp-tread { overflow: hidden; mix-blend-mode: soft-light; opacity: 0; transition: opacity 0.4s; border-radius: 3px; }
.rbp-tread[data-rbp-part='roller'] { border-radius: 6px / 30%; }
.rbp-tread::before { content: ''; position: absolute; left: 0; right: 0; top: calc(-1 * var(--rbp-p)); bottom: calc(-1 * var(--rbp-p)); background: repeating-linear-gradient(180deg, rgb(255 255 255 / 90%) 0, rgb(255 255 255 / 0%) calc(var(--rbp-p) * 0.45), rgb(0 0 0 / 85%) calc(var(--rbp-p) * 0.6), rgb(0 0 0 / 0%) var(--rbp-p)); }
.rbp-plate-wrap { position: absolute; overflow: hidden; border-radius: 0 0 50% 50% / 0 0 100% 100%; }
.rbp-plate-wrap > .rbp-crop { inset: 0; }
.rbp-sheen { position: absolute; inset: 0; mix-blend-mode: soft-light; opacity: 0; background: linear-gradient(100deg, transparent 35%, rgb(255 255 255 / 75%) 50%, transparent 65%); transform: translateX(-70%); }
.rbp[data-rbp-view='cleaning'] .rbp-brush { animation: rbp-spin 1.1s linear infinite; }
.rbp[data-rbp-view='cleaning'] .rbp-brush[data-rbp-dir='-1'] { animation-direction: reverse; }
.rbp[data-rbp-view='cleaning'] .rbp-mop { animation: rbp-spin 1.6s linear infinite; }
.rbp[data-rbp-view='cleaning'] .rbp-mop.rbp-ccw { animation-direction: reverse; }
.rbp[data-rbp-view='cleaning'] .rbp-tread { opacity: 0.55; }
.rbp[data-rbp-view='cleaning'] .rbp-tread::before { animation: rbp-roll var(--rbp-t, 0.5s) linear infinite; }
.rbp[data-rbp-view='cleaning'] .rbp-plate > img { animation: rbp-buzz 0.07s steps(2, jump-none) infinite alternate; }
.rbp[data-rbp-view='cleaning'] .rbp-sheen { opacity: 0.5; animation: rbp-sweep 2.6s ease-in-out infinite; }
@keyframes rbp-spin { to { transform: rotate(360deg); } }
@keyframes rbp-roll { from { transform: translateY(0); } to { transform: translateY(var(--rbp-p)); } }
@keyframes rbp-buzz { from { transform: translate(-0.35px, 0.15px); } to { transform: translate(0.35px, -0.15px); } }
@keyframes rbp-sweep { from { transform: translateX(-70%); } to { transform: translateX(70%); } }
@keyframes rbp-drift { from { transform: translateY(-1.2%); } to { transform: translateY(1.2%); } }
.rbp-hs { position: absolute; transform: translate(-50%, -50%); z-index: 3; animation: rbp-in 0.4s var(--hb-ease-out) 0.35s both; }
@keyframes rbp-in { from { opacity: 0; } to { opacity: 1; } }
.rbp-bang { width: 30px; height: 30px; border-radius: 50%; background: var(--hb-crit); color: #fff; font-weight: 800; font-size: 18px; display: grid; place-items: center; position: relative; margin: 0 auto;
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--hb-crit) 30%, transparent), 0 6px 14px -4px rgb(0 0 0 / 50%); }
.rbp-bang::after { content: ''; position: absolute; inset: -3px; border-radius: 50%; border: 2px solid var(--hb-crit); animation: rbp-pulse 1.6s var(--hb-ease-out) infinite; }
@keyframes rbp-pulse { from { transform: scale(1); opacity: 0.9; } to { transform: scale(2.3); opacity: 0; } }
.rbp-callout { position: absolute; left: 50%; top: calc(100% + 10px); transform: translateX(-50%); white-space: nowrap; background: var(--rbp-ink); color: #fff; -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px); padding: 6px 10px; border-radius: 10px; font-size: 13px; font-weight: 600; }
.rbp-hs-err[data-edge='start'] .rbp-callout { left: -10px; transform: none; }
.rbp-hs-err[data-edge='end'] .rbp-callout { left: auto; right: -10px; transform: none; }
.rbp-dot { display: flex; align-items: center; gap: 6px; padding: 3px 8px 3px 4px; border-radius: 999px; background: var(--rbp-ink); color: #fff; -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px); font-size: 12px; font-weight: 650; font-variant-numeric: tabular-nums; white-space: nowrap; }
.rbp-dot i { width: 10px; height: 10px; border-radius: 50%; background: var(--hb-ok); box-shadow: 0 0 0 2px rgb(255 255 255 / 85%); }
.rbp-dot[data-low='true'] i { background: var(--hb-warn); }
.rbp-dot small { font-weight: 500; opacity: 0.8; font-size: 12px; }
.rbp-badges { position: absolute; inset: 10px 10px auto; display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; z-index: 4; }
.rbp-badges .hb-pill { -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px); background: color-mix(in srgb, var(--hb-tone) 22%, var(--hb-s1)); }
.rbp-badges .hb-chip[data-toggle] { min-height: 34px; padding: 0 14px; -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px); }
.rbp-badges .hb-chip[data-toggle]:not([data-tone]):not([aria-pressed='true']) { background: color-mix(in srgb, var(--hb-s1) 72%, transparent); color: var(--hb-t2); }
@container (max-width: 430px) {
  .rbp-dot { padding: 3px 7px 3px 4px; }
  .rbp-dot-label { display: none; }
  .rbp-callout { font-size: 12px; padding: 5px 8px; }
}

/* Předvolby: one-tap preset chips under the clean card header (scroll sideways on phones). */
.rb-presets { margin: 2px 0 12px; min-width: 0; }
.rb-presets .rb-chips { flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; padding: 2px 0; }
.rb-presets .rb-chips::-webkit-scrollbar { display: none; }
.rb-presets .rb-chips > * { flex: none; }
.rb-preset .rb-ico { width: 12px; height: 12px; color: var(--hb-ac); }
.rb-chip-sub { color: var(--hb-t2); font-weight: 500; font-size: 13px; margin-left: 4px; }
.rb-editor { display: grid; gap: 16px; margin-top: 4px; min-width: 0; }
.rb-field { display: grid; gap: 6px; }
.rb-field input {
  box-sizing: border-box; width: 100%; font: inherit; font-size: 16px; color: var(--hb-t1);
  padding: 10px 12px; border-radius: var(--hb-radius-sm); border: 0;
  background: color-mix(in srgb, var(--hb-t1) 7%, var(--hb-s1));
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--hb-t1) 13%, transparent);
}
.rb-field input:focus-visible { outline: 2px solid var(--hb-ac); outline-offset: 1px; }
.rb-editor-rooms { display: grid; gap: 8px; }
.rb-chips.rb-chips-wrap { flex-wrap: wrap; }
.rb-form-error { color: var(--hb-crit); margin: 0; font-size: 14px; }

/* Sticky sheet footer: keep the last room chip scrollable above it (footer height inset). */
.hb-sheet[data-sticky-foot] .rb-editor { padding-bottom: 12px; }
@media (max-width: 600px) {
  .hb-sheet[data-sticky-foot] .rb-editor { padding-bottom: calc(76px + env(safe-area-inset-bottom)); }
}

/* Plány úklidu */
.rb-sched { margin-top: 16px; }
.rb-sched .rb-card-head { align-items: center; flex-wrap: wrap; }
.rb-sched-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }
.rb-sched-item {
  display: flex; align-items: center; gap: 12px; min-width: 0;
  padding: 10px 0; border-top: 1px solid color-mix(in srgb, var(--hb-t1) 9%, transparent);
}
.rb-sched-item:first-child { border-top: 0; }
.rb-sched-item:not([data-enabled]) .rb-sched-main { opacity: .55; }
.rb-sched-main {
  all: unset; box-sizing: border-box; cursor: pointer; flex: 1; min-width: 0;
  display: flex; align-items: center; gap: 14px; border-radius: var(--hb-radius-sm);
}
.rb-sched-main:focus-visible { outline: 2px solid var(--hb-ac); outline-offset: 2px; }
.rb-sched-time {
  font-size: 22px; font-weight: 600; font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em; color: var(--hb-t1); min-width: 62px;
}
.rb-sched-text { display: grid; gap: 2px; min-width: 0; }
.rb-sched-name { color: var(--hb-t1); font-weight: 600; font-size: 15px; overflow-wrap: anywhere; }
.rb-sched-meta { color: var(--hb-t2); font-size: 13px; overflow-wrap: anywhere; }
.rb-sched-side { display: flex; align-items: center; gap: 10px; flex: none; }
.rb-sched-empty { margin: 0 0 6px; }
.rb-sched-paused {
  margin: 0 0 10px; padding: 8px 12px; border-radius: var(--hb-radius-sm); font-size: 14px;
  color: var(--hb-t1); background: color-mix(in srgb, var(--hb-warn) 14%, var(--hb-s1));
}
.rb-sched-foot { margin: 12px 0 0; color: var(--hb-t2); }
.rb-sched-days { flex-wrap: wrap; }
.rb-sched-days > * { min-width: 44px; justify-content: center; }
.rb-sched-row { display: flex; gap: 16px; flex-wrap: wrap; align-items: end; }
.rb-sched-row > .rb-field { flex: 1 1 120px; }
.rb-sched-enabled { flex: 0 0 auto !important; justify-items: start; }
@media (max-width: 600px) {
  .rb-sched-item { flex-wrap: wrap; }
  .rb-sched-side { width: 100%; justify-content: flex-start; padding-left: 76px; }
  .rb-sched-side > .hb-switch { margin-left: auto; }
}
.rb-hint { margin: -6px 0 0; color: var(--hb-warn-ink, var(--hb-t2)); }
`;

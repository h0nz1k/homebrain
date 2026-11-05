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
.rb-micro { color: var(--hb-t3); font-size: 13px; }
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
  align-items: start;
  animation: rb-in var(--hb-dur-slow) var(--hb-ease-out) both;
}
.rb-col { display: flex; flex-direction: column; gap: 18px; min-width: 0; }
.rb-card { min-width: 0; }
@keyframes rb-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }

.rb-card {
  position: relative; border-radius: var(--hb-r-lg, 18px); padding: 22px;
  background: var(--hb-s1); box-shadow: var(--hb-elev-1); overflow: hidden;
}
.rb-card-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
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
.rb-btn, .rb-primary {
  min-height: 44px; padding: 0 18px; border: 0; border-radius: 999px; cursor: pointer; font-size: 15px; font-weight: 550;
  transition: background var(--hb-dur-fast) var(--hb-ease-out), transform var(--hb-dur-fast) var(--hb-ease-out), opacity var(--hb-dur-fast);
}
.rb-btn { display: inline-flex; align-items: center; gap: 8px; background: var(--hb-fill-strong); }
.rb-btn-strong { background: var(--hb-t1); color: var(--hb-s1) !important; }
.rb-btn-strong:hover:not(:disabled) { background: color-mix(in srgb, var(--hb-t1) 88%, transparent) !important; }
.rb-ico { width: 16px; height: 16px; fill: currentColor; }
.rb-btn:hover:not(:disabled) { background: color-mix(in srgb, var(--hb-t1) 13%, transparent); }
.rb-primary {
  background: linear-gradient(180deg, color-mix(in srgb, var(--hb-ac) 88%, white), var(--hb-ac));
  color: #fff; font-weight: 600; box-shadow: inset 0 1px 0 rgb(255 255 255 / 18%);
}
.rb-primary:hover:not(:disabled) { filter: brightness(1.06); }
.rb-btn:active:not(:disabled), .rb-primary:active:not(:disabled), .rb-chip:active { transform: scale(0.97); }
.rb-btn:disabled { opacity: 0.5; cursor: default; }
.rb-primary:disabled { background: var(--hb-fill-strong); color: var(--hb-t2); cursor: default; box-shadow: none; }
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
.rb-problem ol { counter-reset: step; display: grid; gap: 10px; }
.rb-problem li { counter-increment: step; display: grid; grid-template-columns: 26px 1fr; gap: 10px; font-size: 15px; line-height: 1.45; }
.rb-problem li::before {
  content: counter(step); display: grid; place-items: center; width: 26px; height: 26px; border-radius: 50%;
  background: var(--hb-crit); color: #fff; font-size: 13px; font-weight: 700;
}
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
.rb-chip {
  position: relative; display: inline-flex; align-items: center; gap: 8px; min-height: 40px; padding: 0 16px; border: 0;
  border-radius: 999px; background: var(--hb-fill-strong); cursor: pointer; font-size: 15px; font-weight: 500;
  transition: background var(--hb-dur-base) var(--hb-ease-out), color var(--hb-dur-base), padding var(--hb-dur-base) var(--hb-ease-out), transform var(--hb-dur-fast);
}
.rb-chip:hover { background: color-mix(in srgb, var(--hb-t1) 13%, transparent); }
.rb-chip[aria-pressed='true'] { background: var(--hb-ac); color: #fff; padding-left: 6px; }
.rb-badge {
  display: grid; place-items: center; width: 28px; height: 28px; border-radius: 50%; background: rgb(255 255 255 / 92%); color: var(--hb-ac);
  font-size: 14px; font-weight: 700; font-variant-numeric: tabular-nums; animation: rb-pop var(--hb-dur-base) var(--hb-ease-out);
}
@keyframes rb-pop { from { transform: scale(0.4); opacity: 0; } to { transform: none; opacity: 1; } }
.rb-hint { color: var(--hb-t2); font-size: 14px; margin: 16px 0 20px; }
.rb-controls { display: grid; gap: 14px; margin-bottom: 22px; }
.rb-seg-wrap { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
.rb-seg-label { width: 64px; color: var(--hb-t2); font-size: 14px; }
.rb-seg { display: flex; flex: 1; gap: 3px; padding: 3px; border-radius: 12px; background: var(--hb-fill); }
.rb-seg button { flex: 1; }
.rb-seg button {
  min-height: 38px; padding: 0 14px; border: 0; border-radius: 9px; background: transparent; cursor: pointer; font-size: 14px; font-weight: 500; color: var(--hb-t2);
  transition: background var(--hb-dur-base) var(--hb-ease-out), color var(--hb-dur-base), box-shadow var(--hb-dur-base);
}
.rb-seg button[aria-checked='true'] { background: var(--rb-thumb); color: var(--hb-t1); font-weight: 600; box-shadow: var(--hb-elev-1); }
[data-theme='light'] .rb-seg button[aria-checked='true'] { box-shadow: 0 1px 2px rgb(16 24 40 / 10%), 0 2px 8px -2px rgb(16 24 40 / 12%); }
.rb-clean .rb-primary { width: 100%; min-height: 52px; font-size: 16px; }

/* Maintenance */
.rb-parts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px 18px; }
.rb-parts li { display: grid; grid-template-columns: 54px minmax(0, 1fr); align-items: center; gap: 12px; }
.rb-ring-wrap { position: relative; width: 54px; height: 54px; }
.rb-ring-wrap em::after { content: '%'; font-size: 10px; font-weight: 500; margin-left: 1px; opacity: 0.7; }
.rb-ring-wrap em { line-height: 1; }
.rb-ring-wrap em { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-style: normal; font-size: 13px; font-weight: 600; font-variant-numeric: tabular-nums; }
.rb-ring { width: 54px; height: 54px; }
.rb-ring-track { fill: none; stroke: color-mix(in srgb, var(--hb-t1) 11%, transparent); stroke-width: 3.5; }
.rb-ring-fill { fill: none; stroke: var(--hb-ok); stroke-width: 3.5; stroke-linecap: round; transition: stroke-dasharray var(--hb-dur-slow) var(--hb-ease-out); }
.rb-parts [data-rb-tone='warn'] .rb-ring-fill { stroke: var(--hb-warn); }
.rb-parts [data-rb-tone='crit'] .rb-ring-fill { stroke: var(--hb-crit); }
.rb-part-text { display: flex; flex-direction: column; min-width: 0; line-height: 1.3; }
.rb-part-text b { font-size: 15px; font-weight: 600; }
.rb-part-text span { font-size: 13px; color: var(--hb-t2); }
.rb-parts [data-rb-tone='warn'] .rb-part-text span { color: var(--hb-warn); }
.rb-parts [data-rb-tone='crit'] .rb-part-text span { color: var(--hb-crit); font-weight: 600; }
[data-theme='light'] .rb-parts [data-rb-tone='warn'] .rb-part-text span { color: #a35d00; }
[data-theme='light'] .rb-parts [data-rb-tone='crit'] .rb-part-text span { color: #c4262c; }

/* Dock */
.rb-dock[data-rb-dock-warn='true'] .rb-card-head .rb-micro { color: var(--hb-warn); font-weight: 600; }
[data-theme='light'] .rb-dock[data-rb-dock-warn='true'] .rb-card-head .rb-micro { color: #a35d00; }
.rb-tanks { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.rb-tanks li { display: flex; align-items: center; gap: 12px; padding: 12px; border-radius: 14px; background: var(--hb-fill); }
.rb-tanks li > span { display: flex; flex-direction: column; line-height: 1.3; min-width: 0; }
.rb-tanks b { font-size: 14px; font-weight: 600; }
.rb-tanks li > span > span { font-size: 13px; color: var(--hb-t2); }
.rb-tanks [data-rb-ok='false'] { background: color-mix(in srgb, var(--hb-warn) 13%, transparent); }
.rb-tanks [data-rb-ok='false'] li > span > span, .rb-tanks [data-rb-ok='false'] > span > span { color: var(--hb-warn); font-weight: 600; }
[data-theme='light'] .rb-tanks [data-rb-ok='false'] > span > span { color: #a35d00; }
.rb-tank { width: 24px; height: 32px; flex: none; }
.rb-tank-shell { fill: none; stroke: color-mix(in srgb, var(--hb-t1) 30%, transparent); stroke-width: 1.5; }
.rb-tank-fill { fill: #4cb8ff; opacity: 0.85; }
.rb-tanks [data-rb-tank='dirty_water'] .rb-tank-fill { fill: #9a8f80; }
.rb-tanks [data-rb-tank='cleaning_fluid'] .rb-tank-fill { fill: #a78bfa; }
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
.rb-toast {
  position: fixed; z-index: 45; left: 50%; bottom: calc(var(--hb-tabbar-height, 0px) + env(safe-area-inset-bottom) + 24px);
  transform: translateX(-50%); max-width: min(560px, calc(100vw - 32px)); padding: 12px 18px; border-radius: 999px;
  background: color-mix(in srgb, var(--hb-ok) 88%, black); color: #04140d; font-size: 14px; font-weight: 600;
  box-shadow: var(--hb-elev-2); animation: rb-rise var(--hb-dur-slow) var(--hb-ease-out);
}
.rb-toast[data-kind='error'] { background: var(--hb-crit); color: #fff; }

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
  .rb-dock { order: 5; }
}
@media (max-width: 600px) {
    .rb-floors { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); width: auto; }
  .rb-floor { min-width: 0; padding: 9px 10px; }
  .rb-problem-cta .rb-btn { flex: 1 1 100%; justify-content: center; }
  .rb-floor-meta { max-width: 100%; overflow: hidden; text-overflow: ellipsis; }
  .rb-floor-help, .rb-floor-robot { display: none; }
  .rb-card { padding: 18px; }
  .rb-hero { grid-template-columns: 104px minmax(0, 1fr); gap: 14px; padding: 18px; }
  .rb-state { font-size: 26px; }
  .rb-hero-foot { margin-top: 14px; }
  .rb-hero-actions { width: 100%; }
  .rb-hero-actions .rb-btn { flex: 1; }
  .rb-parts { grid-template-columns: minmax(0, 1fr); }
  .rb-seg-wrap { gap: 8px; }
  .rb-seg-label { width: 100%; }
  .rb-seg { width: 100%; flex-wrap: wrap; }
  .rb-seg button { flex: 1 0 22%; padding: 0 6px; }
  .rb-sheet { align-self: end; border-radius: 22px 22px 16px 16px; }
}
@media (prefers-reduced-motion: reduce) {
  .rb *, .rb *::before, .rb *::after, .rb { animation: none !important; transition: none !important; }
}
`;

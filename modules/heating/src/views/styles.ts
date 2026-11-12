/** Module styles (scoped under `.ht`). Motion respects prefers-reduced-motion. */
export const heatingStyles = `
.ht {
  --ht-c-tank: oklch(0.72 0.15 50);
  --ht-c-top: oklch(0.7 0.15 20);
  --ht-c-dhw: oklch(0.7 0.16 355);
  --ht-c-supply: oklch(0.74 0.12 80);
  --ht-c-out: oklch(0.74 0.09 230);
  --ht-c-home: var(--hb-t1);
  --ht-heat: oklch(0.72 0.17 45);
  --ht-particle: #fff;
  --ht-soil-a: color-mix(in srgb, var(--hb-t1) 5%, transparent);
  --ht-soil-b: transparent;
  --ht-steel: color-mix(in srgb, var(--hb-t1) 5%, var(--hb-s1));
  --ht-steel-edge: color-mix(in srgb, var(--hb-t1) 18%, transparent);
  color: var(--hb-t1);
  max-width: 1440px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: var(--hb-sp-4, 16px);
}
[data-theme='light'] .ht {
  --ht-particle: #fff;
  --ht-soil-a: color-mix(in srgb, var(--hb-t1) 5%, transparent);
  --ht-soil-b: transparent;
  --ht-c-out: oklch(0.6 0.11 235);
  --ht-c-supply: oklch(0.66 0.13 75);
}
[data-theme='light'] .ht .ht-xlabs span,
[data-theme='light'] .ht .ht-ylab,
[data-theme='light'] .ht .ht-runs-lbl,
[data-theme='light'] .ht .ht-sbars-grid em,
[data-theme='light'] .ht .ht-sched-axis b,
[data-theme='light'] .ht .ht-curve-unit {
  color: var(--hb-t1);
}
.ht * { box-sizing: border-box; }
.ht :where(h2, h3, p, ul, dl, dd) { margin: 0; }
.ht :where(p, small, li) { text-wrap: pretty; }
.ht ul { list-style: none; padding: 0; }
.ht :where(button) { color: inherit; }
.ht-loading { display: flex; flex-direction: column; gap: 16px; }
.ht-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px 16px; }
.ht-live { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; color: var(--hb-t2); white-space: nowrap; }
.ht-live i { width: 8px; height: 8px; border-radius: 50%; background: var(--hb-ok); box-shadow: 0 0 0 4px color-mix(in srgb, var(--hb-ok) 18%, transparent); }
.ht-live[data-stale] i { background: var(--hb-warn); box-shadow: 0 0 0 4px color-mix(in srgb, var(--hb-warn) 18%, transparent); }
.ht-k { font-size: 13px; color: var(--hb-t2); }
.ht-muted { color: var(--hb-t2); font-size: 13px; }
.ht-link { background: none; border: 0; padding: 0; font: inherit; color: var(--hb-t2); text-decoration: underline; text-underline-offset: 3px; text-decoration-color: color-mix(in srgb, var(--hb-t2) 40%, transparent); cursor: pointer; text-align: left; }
.ht-link:hover { color: var(--hb-t1); }
.ht-card { padding: 20px 22px; display: flex; flex-direction: column; gap: 14px; min-width: 0; }
.ht-ch { display: flex; align-items: baseline; justify-content: space-between; gap: 8px 16px; flex-wrap: wrap; }
.ht-ch h3 { font-size: 15px; font-weight: 650; letter-spacing: -0.01em; }
.ht-ch-wrap { align-items: center; }
.ht-row { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr); gap: 16px; }
.ht-insight { font-size: 14px; color: var(--hb-t1); padding: 12px 14px; border-radius: var(--hb-radius-md, 12px); background: color-mix(in srgb, var(--hb-ac) 9%, transparent); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--hb-ac) 20%, transparent); }
.ht-note { padding: 14px 16px; display: flex; flex-direction: column; gap: 4px; }
.ht-note p { color: var(--hb-t2); font-size: 14px; }

/* Hero */
.ht-hero { padding: 26px 28px; display: grid; grid-template-columns: minmax(280px, 0.9fr) minmax(0, 1fr); gap: 20px 28px; align-items: center; overflow: hidden; position: relative;
  background: radial-gradient(120% 90% at 0% 0%, color-mix(in srgb, var(--ht-heat) 12%, transparent), transparent 60%), var(--hb-s1); }
.ht-hero[data-state='idle'], .ht-hero[data-state='house'] { background: radial-gradient(120% 90% at 0% 0%, color-mix(in srgb, var(--hb-ok) 9%, transparent), transparent 60%), var(--hb-s1); }
.ht-hero[data-state='fault'] { background: radial-gradient(120% 90% at 0% 0%, color-mix(in srgb, var(--hb-crit) 14%, transparent), transparent 60%), var(--hb-s1); }
.ht-hero-copy { display: flex; flex-direction: column; align-items: flex-start; gap: 8px; min-width: 0; }
.ht-pills { display: flex; flex-wrap: wrap; gap: 6px; }
.ht-big { font-size: clamp(40px, 5vw, 56px); font-weight: 300; letter-spacing: -0.035em; line-height: 1.15; font-variant-numeric: tabular-nums; margin-top: 4px; }
.ht-big small { font-size: 0.42em; font-weight: 400; letter-spacing: 0; margin-left: 4px; vertical-align: 0.95em; color: var(--hb-t2); }
.ht-hero-sub { color: var(--hb-t2); font-size: 13px; }
.ht-hero h2 { font-size: clamp(24px, 2.2vw, 30px); line-height: 1.3; font-weight: 450; letter-spacing: -0.015em; margin-top: 0; }
.ht-hero h2 b { font-weight: 600; }
.ht-hero-copy > .ht-hero-detail { margin-bottom: 12px; }
.ht-hero-detail { color: var(--hb-t2); font-size: 14px; line-height: 1.5; max-width: 52ch; }
.ht-ok { grid-template-columns: 1fr; }

/* Stats */
.ht-stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; }
.ht-stat { padding: 16px 18px; display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.ht-v { font-size: 26px; font-weight: 300; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; line-height: 1.2; }
.ht-v small { font-size: 14px; color: var(--hb-t2); font-weight: 400; letter-spacing: 0; }
.ht-stat[data-tone='ok'] .ht-v { color: var(--hb-ok); font-weight: 550; font-size: 20px; }
.ht-stat[data-tone='crit'] .ht-v { color: var(--hb-crit); font-weight: 600; font-size: 20px; }
.ht-sub { font-size: 13px; color: var(--hb-t2); }
.ht-meter { display: block; height: 4px; border-radius: 4px; background: var(--hb-fill, rgba(127,127,127,.18)); overflow: hidden; margin-top: 6px; }
.ht-meter { position: relative; overflow: visible; }
.ht-meter i { display: block; height: 100%; background: var(--ht-c-dhw); transform-origin: left; border-radius: 4px; }
.ht-meter em { position: absolute; top: -3px; bottom: -3px; width: 2px; margin-left: -1px; background: var(--hb-t1); border-radius: 1px; }
.ht-extras-compact { padding: 14px 16px; gap: 8px; }
.ht-extras-compact .ht-ch h3 { font-size: 14px; }
.ht-extras-lines { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; font-size: 13px; }
.ht-extras-lines li { display: grid; grid-template-columns: minmax(0, 1.2fr) auto minmax(0, 1fr); gap: 8px 12px; align-items: baseline; }
.ht-extras-lines span { color: var(--hb-t2); }
.ht-extras-lines b { font-variant-numeric: tabular-nums; font-weight: 600; }
.ht-extras-lines em { color: var(--hb-t2); font-size: 12px; text-align: right; font-style: normal; }
.ht-side-circuit .ht-side-sub { display: block; font-size: 12px; margin-top: 2px; line-height: 1.35; }
.ht-land-panel.ht-side-circuit { gap: 10px; }
.ht-land-panel.ht-side-circuit .ht-ch { margin-bottom: 4px; align-items: flex-start; }
.ht-land-panel.ht-side-circuit .ht-side-hero { margin-top: 2px; }
.ht-side-hero { display: flex; align-items: baseline; flex-wrap: wrap; gap: 4px 6px; line-height: 1.15; }
.ht-side-temp { font-size: 28px; font-weight: 600; font-variant-numeric: tabular-nums; line-height: 1.05; }
.ht-side-hold { font-size: 13px; margin: 8px 0 0; line-height: 1.35; }
.ht-side-warn { font-size: 12px; color: var(--hb-warn); margin: 0; }
.ht-fish-band { position: relative; height: 8px; border-radius: 4px; background: var(--hb-fill, rgba(127,127,127,.16)); margin-top: 6px; }
.ht-fish-band-zone { position: absolute; top: 0; bottom: 0; border-radius: 4px; background: color-mix(in srgb, var(--hb-ok) 35%, transparent); }
.ht-fish-band-cursor { position: absolute; top: -3px; bottom: -3px; width: 3px; margin-left: -1.5px; border-radius: 2px; background: var(--hb-t1); }

/* Charts */
.ht-legend { display: inline-flex; flex-wrap: wrap; gap: 4px 14px; font-size: 12px; color: var(--hb-t2); align-items: center; }
.ht-legend span { display: inline-flex; align-items: center; gap: 6px; }
.ht-legend i { width: 14px; height: 3px; border-radius: 2px; display: inline-block; }
.ht-legend i.ht-legend-run { height: 8px; width: 10px; background: var(--hb-ac); }
.ht-chart-wrap { display: flex; flex-direction: column; gap: 6px; padding-left: 34px; }
.ht-chart { position: relative; touch-action: pan-y; user-select: none; }
.ht-chart > svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
.ht-grid { stroke: color-mix(in srgb, var(--hb-t1) 8%, transparent); stroke-width: 1; vector-effect: non-scaling-stroke; }
.ht-line { fill: none; stroke-width: 2; vector-effect: non-scaling-stroke; stroke-linejoin: round; }
.ht-ylab { position: absolute; left: -34px; transform: translateY(-50%); font-size: 12px; color: var(--hb-t3, var(--hb-t2)); font-variant-numeric: tabular-nums; }
.ht-xlabs { position: relative; height: 16px; }
.ht-xlabs span { position: absolute; transform: translateX(-50%); font-size: 12px; color: var(--hb-t3, var(--hb-t2)); white-space: nowrap; }
.ht-chart-empty { padding: 40px 0; text-align: center; color: var(--hb-t2); font-size: 14px; }
.ht-cross { position: absolute; top: 0; bottom: 0; width: 1px; background: color-mix(in srgb, var(--hb-t1) 35%, transparent); pointer-events: none; }
.ht-tip { position: absolute; top: 4px; margin-left: 10px; padding: 8px 10px; border-radius: 10px; background: var(--hb-s2); box-shadow: var(--hb-elev-2, 0 6px 20px rgba(0,0,0,.25)); display: flex; flex-direction: column; gap: 2px; font-size: 12px; pointer-events: none; white-space: nowrap; z-index: 2; }
.ht-tip[data-side='l'] { transform: translateX(calc(-100% - 20px)); }
.ht-tip i { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; }
.ht-zoomsel { position: absolute; top: 0; bottom: 0; background: color-mix(in srgb, var(--hb-ac) 18%, transparent); box-shadow: inset 0 0 0 1px var(--hb-ac); pointer-events: none; }
.ht-runs { position: relative; height: 12px; margin-top: 12px; border-radius: 4px; background: var(--hb-fill, rgba(127,127,127,.12)); }
.ht-runs i { position: absolute; top: 0; bottom: 0; background: var(--hb-ac); opacity: .85; border-radius: 2px; min-width: 2px; }
.ht-runs-tick { position: absolute; top: -3px; bottom: -3px; width: 1px; background: color-mix(in srgb, var(--hb-t1) 14%, transparent); }
.ht-runs-lbl { position: absolute; left: -34px; top: 50%; transform: translateY(-50%); font-size: 11px; font-weight: 600; color: var(--hb-t3, var(--hb-t2)); }
.ht-runs-note { margin-left: 34px; }
.ht-legend span[data-group] { font-variant-numeric: tabular-nums; }
.ht-chips { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.ht-chip-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; }
.ht-dot { position: absolute; width: 6px; height: 6px; margin: -3px 0 0 -3px; border-radius: 50%; background: var(--ht-c-out); opacity: .55; }
.ht { --ht-g-before: color-mix(in srgb, var(--hb-t1) 55%, transparent); --ht-g-after: var(--ht-c-out); --ht-g-current: var(--ht-c-supply); }
.ht-dot[data-group='before'], .ht-dot-l[data-group='before'] { background: transparent; box-shadow: inset 0 0 0 1.5px var(--ht-g-before); opacity: .8; }
.ht-dot[data-group='after'], .ht-dot-l[data-group='after'] { background: var(--ht-g-after); opacity: .45; }
.ht-dot[data-group='current'], .ht-dot-l[data-group='current'] { background: var(--ht-g-current); opacity: 1; width: 7px; height: 7px; margin: -3.5px 0 0 -3.5px; box-shadow: 0 0 0 1.5px var(--hb-s1); z-index: 1; }
.ht-dot-l[data-group='after'] { opacity: .8; }
.ht-chart > svg.ht-fits { z-index: 2; pointer-events: none; }
.ht-fit { stroke-width: 2.5px; vector-effect: non-scaling-stroke; stroke-linecap: round; }
.ht-fit[data-group='before'] { stroke: var(--ht-g-before); stroke-dasharray: 6 5; }
.ht-fit[data-group='after'] { stroke: var(--ht-g-after); }
.ht-fit[data-group='current'] { stroke: var(--ht-g-current); filter: drop-shadow(0 0 1.5px var(--hb-s1)); }
.ht-dot-l { width: 8px !important; height: 8px !important; border-radius: 50% !important; }
.ht-curve-line { stroke: var(--ht-c-tank); stroke-width: 2.5; }
.ht-curve-pt { background: var(--ht-c-tank); opacity: 1; width: 8px; height: 8px; margin: -4px 0 0 -4px; }
.ht-now-line { stroke: color-mix(in srgb, var(--hb-t1) 35%, transparent); stroke-dasharray: 3 4; vector-effect: non-scaling-stroke; }
.ht-curve-now { position: absolute; display: flex; flex-direction: column-reverse; align-items: flex-start; gap: 8px; transform: translate(-7px, calc(-100% + 7px)); pointer-events: none; }
.ht-curve-now i { width: 14px; height: 14px; border-radius: 50%; background: var(--hb-s1); box-shadow: 0 0 0 4px var(--ht-c-tank); flex: none; }
.ht-curve-now b { font-size: 13px; padding: 3px 8px; border-radius: 999px; background: var(--hb-s2); white-space: nowrap; }

/* Seasons */
.ht-sbars { position: relative; display: grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); gap: 8px; height: 240px; padding-left: 44px; }
.ht-sbars-grid { position: absolute; left: 44px; right: 0; height: 0; border-top: 1px solid color-mix(in srgb, var(--hb-t1) 8%, transparent); }
.ht-sbars-grid em { position: absolute; left: -44px; transform: translateY(-50%); font-size: 11px; font-style: normal; color: var(--hb-t3, var(--hb-t2)); }
.ht-sbar { position: relative; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; gap: 4px; min-width: 0; }
.ht-sbar i { display: block; width: min(100%, 44px); border-radius: 6px 6px 2px 2px; background: color-mix(in srgb, var(--ht-c-tank) 85%, transparent); }
.ht-sbar[data-partial] i { background: repeating-linear-gradient(135deg, color-mix(in srgb, var(--ht-c-tank) 70%, transparent) 0 6px, color-mix(in srgb, var(--ht-c-tank) 40%, transparent) 6px 12px); }
.ht-sbar b { font-size: 12px; font-weight: 600; font-variant-numeric: tabular-nums; }
.ht-sbar > span { font-size: 11px; color: var(--hb-t2); height: 20px; line-height: 20px; white-space: nowrap; }
.ht-sbar[data-note]::before { content: ''; position: absolute; left: -5px; top: 0; bottom: 28px; border-left: 2px dashed color-mix(in srgb, var(--hb-ac) 70%, transparent); }
.ht-sbar-note { position: absolute; top: 0; left: 2px; font-size: 12px; font-weight: 600; color: var(--hb-ac); }
.ht-seasons { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; }
@media (max-width: 1280px) { .ht-seasons { grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); } }
.ht-season { padding: 16px 18px; display: flex; flex-direction: column; gap: 8px; }
.ht-season[data-partial] { box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--hb-ac) 60%, transparent); }
.ht-season header { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.ht-share { display: block; height: 4px; border-radius: 4px; background: var(--hb-fill, rgba(127,127,127,.15)); overflow: hidden; }
.ht-share i { display: block; height: 100%; background: var(--ht-c-tank); transform-origin: left; }
.ht-season dl { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 4px 12px; font-size: 13px; }
.ht-season dt { color: var(--hb-t2); overflow-wrap: anywhere; }
.ht-season dd { text-align: right; font-variant-numeric: tabular-nums; }
.ht-season dd em { font-style: normal; font-size: 12px; color: var(--hb-t2); }
.ht-season dd em[data-tone='down'] { color: var(--hb-ok); }
.ht-season dd em[data-tone='up'] { color: var(--hb-warn); }
.ht-season-note { font-size: 13px; color: var(--hb-ac); }

/* Rooms */
.ht-bind-help { display: flex; flex-direction: column; gap: 12px; padding-left: 28px; border-left: 1px solid var(--hb-edge); font-size: 14px; line-height: 1.6; }
.ht-bind-help h3 { font-size: 17px; font-weight: 600; }
.ht-bind-help p { color: var(--hb-t2); }
.ht-bind-help ol { margin: 0; padding-left: 20px; display: grid; gap: 10px; }

.ht-ref { padding: 24px 26px; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr); gap: 20px 32px; align-items: start; }
.ht-ref > div:first-child { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; }
.ht-ref-notes { display: flex; flex-direction: column; gap: 12px; }
.ht-rooms { display: flex; flex-direction: column; gap: 8px; }
.ht-rooms li { display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(0, 1.4fr) 64px 72px; gap: 12px 18px; align-items: center; padding: 12px 14px; border-radius: var(--hb-radius-md, 12px); background: color-mix(in srgb, var(--hb-t1) 4%, transparent); }
.ht-rooms li[data-coldest] { box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--ht-c-out) 70%, transparent); }
.ht-room-name { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; min-width: 0; }
.ht-room-temp { display: grid; grid-template-columns: auto 1fr; gap: 2px 10px; align-items: baseline; }
.ht-room-temp b { font-size: 17px; font-weight: 500; font-variant-numeric: tabular-nums; }
.ht-track { grid-column: 1 / -1; position: relative; height: 6px; border-radius: 3px; margin-top: 6px; background: linear-gradient(90deg, color-mix(in srgb, var(--ht-c-out) 45%, transparent), color-mix(in srgb, var(--hb-t1) 10%, transparent) 50%, color-mix(in srgb, var(--ht-c-tank) 45%, transparent)); }
.ht-track::after { content: ''; position: absolute; left: 50%; top: -3px; bottom: -3px; width: 2px; background: var(--hb-t2); border-radius: 1px; }
.ht-track i { position: absolute; top: 50%; width: 12px; height: 12px; margin: -6px 0 0 -6px; border-radius: 50%; background: var(--hb-t1); box-shadow: 0 0 0 3px var(--hb-s1); }
.ht-track i[data-cold] { background: var(--ht-c-out); }
.ht-room-valve { display: flex; justify-content: center; }
.ht-room-valve small { font-size: 12px; font-weight: 600; }
.ht-room-hum { display: flex; flex-direction: column; align-items: flex-end; }
.ht-mini { display: flex; flex-direction: column; gap: 6px; }
.ht-mini li { display: grid; grid-template-columns: 1fr auto 3.2em; gap: 10px; align-items: baseline; padding: 10px 12px; border-radius: var(--hb-radius-md, 12px); background: color-mix(in srgb, var(--hb-t1) 4%, transparent); }
.ht-mini em { font-style: normal; text-align: right; color: var(--hb-t2); font-variant-numeric: tabular-nums; }
.ht-mini em[data-cold] { color: var(--ht-c-out); font-weight: 600; }
.ht-kv { display: flex; flex-direction: column; }
.ht-kv li { display: flex; justify-content: space-between; gap: 16px; padding: 10px 0; border-bottom: 1px solid color-mix(in srgb, var(--hb-t1) 7%, transparent); font-size: 14px; }
.ht-kv li:last-child { border-bottom: 0; }
.ht-kv span { color: var(--hb-t2); }
.ht-kv b { font-weight: 550; text-align: right; }
.ht-kv b[data-on] { color: var(--hb-t1); }
.ht-lock { font-size: 14px; color: var(--hb-t2); padding: 10px 14px; border-radius: var(--hb-radius-md, 12px); background: color-mix(in srgb, var(--hb-t1) 5%, transparent); display: flex; align-items: center; gap: 10px; }
.ht-lock svg { flex: none; }
.ht-sched { display: flex; flex-direction: column; gap: 10px; }
.ht-sched li { display: grid; grid-template-columns: 150px minmax(0, 1fr) 160px; gap: 14px; align-items: center; font-size: 14px; }
.ht-sched-bar { position: relative; height: 12px; border-radius: 6px; background: color-mix(in srgb, var(--hb-t1) 7%, transparent); }
.ht-sched-bar i { position: absolute; top: 0; bottom: 0; border-radius: 6px; background: color-mix(in srgb, var(--hb-ac) 70%, transparent); }
.ht-sched-bar em { position: absolute; top: -4px; bottom: -4px; width: 2px; margin-left: -1px; background: var(--hb-t1); border-radius: 1px; }
.ht-sched-slots { color: var(--hb-t2); font-size: 13px; font-variant-numeric: tabular-nums; }
.ht-sched-axis .ht-sched-bar { background: none; height: 14px; }
.ht-sched-axis b { position: absolute; transform: translateX(-50%); font-size: 11px; font-weight: 400; color: var(--hb-t3, var(--hb-t2)); }
.ht-faults { display: flex; flex-direction: column; gap: 12px; }
.ht-fault { padding: 22px 24px; display: flex; flex-direction: column; align-items: flex-start; gap: 8px; }
.ht-fault h2 { font-size: 22px; font-weight: 600; letter-spacing: -0.015em; }
.ht-fault p { font-size: 14px; line-height: 1.5; max-width: 70ch; }

@media (max-width: 1100px) {
  .ht-hero { grid-template-columns: 1fr; }
  .ht-row { grid-template-columns: 1fr; }
  .ht-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .ht-ref { grid-template-columns: 1fr; }
  .ht-bind-help { padding-left: 0; padding-top: 20px; border-left: 0; border-top: 1px solid var(--hb-edge); }
}
@media (max-width: 600px) {
  .ht-tabs .hb-seg, .ht-tabs .hb-seg:has(> button:nth-of-type(4)) { display: grid; grid-auto-flow: column; grid-template-columns: none; grid-auto-columns: max-content; overflow-x: auto; scrollbar-width: none; mask-image: linear-gradient(90deg, #000 85%, transparent); }
  .ht-tabs .hb-seg button, .ht-tabs .hb-seg:has(> button:nth-of-type(4)) button { font-size: 14px; padding-inline: 14px; }
  .ht-hero, .ht-ref { padding: 20px 16px; }
  .ht-card { padding: 16px; }
  .ht-stat { padding: 14px; }
  .ht-v { font-size: 22px; }
  .ht-stats { gap: 10px; }
  .ht-rooms li { grid-template-columns: minmax(0, 1fr) 52px; }
  .ht-room-temp { grid-column: 1 / -1; grid-row: 2; }
  .ht-room-valve { grid-column: 2; grid-row: 1; }
  .ht-room-hum { display: none; }
  .ht-sched li { grid-template-columns: 1fr; gap: 6px; }
  .ht-sched-axis span:empty { display: none; }
  .ht-sbars { gap: 3px; padding-left: 36px; }
  .ht-sbars-grid { left: 36px; }
  .ht-sbars-grid em { left: -36px; }
  .ht-sbar b { font-size: 11px; }
  .ht-sbar > span { font-size: 11px; writing-mode: vertical-rl; transform: rotate(180deg); height: 42px; line-height: 1; }
  .ht-sbar[data-note]::before { bottom: 48px; }
  .ht-sbars { height: 260px; }
  .ht-sbar-note { width: 7em; }
  .ht-range { width: 100%; }
}
@media (prefers-reduced-motion: reduce) {
  .ht *, .ht *::before, .ht *::after { animation: none !important; transition: none !important; }
}

/* C3: one scene scales intact from portrait to desktop. */
.ht-run-meta { display:flex; justify-content:space-between; flex-wrap:wrap; gap:16px; width:100%; color:var(--hb-t2); font-size:13px; }
.ht-run-meta b { color:var(--hb-t1); font-weight:500; white-space:nowrap; }
.ht-c3-chips { grid-column:1/-1; display:flex; flex-wrap:wrap; gap:8px; border-top:1px solid var(--hb-edge); padding-top:12px; }
.ht-c3 {
  --ht-c3-hot:#e5484d; --ht-c3-cold:#3b82f6; --ht-c3-ground:#2f9e8f;
  --ht-c3-room:#1b2026; --ht-c3-wall:#7d8895; --ht-c3-inactive:#828890;
  --ht-c3-jacket:#4a4f57; --ht-c3-jacket-light:#636a73; --ht-c3-jacket-end:#444a52; --ht-c3-soil:#302e29; --ht-c3-topsoil:#403a30;
  width:100%; max-width:344px; margin:0 auto; min-width:0;
}
[data-theme='light'] .ht-c3 { --ht-c3-hot:#d93d42; --ht-c3-cold:#2f6fdb; --ht-c3-ground:#23877a; --ht-c3-wall:#77838f; --ht-c3-inactive:#606770; --ht-c3-jacket:#8a9099; --ht-c3-jacket-light:#a0a6ad; --ht-c3-jacket-end:#7e858e; --ht-c3-room:#eef1f4; --ht-c3-soil:#c7beac; --ht-c3-topsoil:#d6c8af; }
.ht-c3 > svg { width:100%; height:auto; display:block; overflow:visible; }
.ht-c3-interior { fill:var(--ht-c3-room); }
.ht-c3-depth { fill:#38424c; }
[data-theme='light'] .ht-c3-depth { fill:#d3d9de; }
.ht-c3-envelope { fill:none; stroke:var(--ht-c3-wall); stroke-width:2.5; stroke-linejoin:round; }
.ht-c3-floor { stroke:var(--ht-c3-wall); opacity:.35; }
.ht-c3-soil { fill:var(--ht-c3-soil); stroke:var(--ht-c3-wall); stroke-width:.7; }
.ht-c3-topsoil { stroke:var(--ht-c3-topsoil); stroke-width:25; }
.ht-c3-soil-layer { stroke:var(--ht-c3-wall); opacity:.25; }
.ht-c3-grass { stroke:#718468; stroke-width:8; }
.ht-c3-blade { fill:#718468; }
.ht-c3-route > path { fill:none; stroke:var(--ht-c3-inactive); stroke-width:5; stroke-linecap:round; stroke-linejoin:round; }
.ht-c3-route[data-active].ht-c3-hot > path { stroke:var(--ht-c3-hot); }
.ht-c3-route[data-active].ht-c3-cold > path { stroke:var(--ht-c3-cold); }
.ht-c3-route.ht-c3-ground > path { stroke-width:4; }
.ht-c3-route[data-active].ht-c3-ground > path { stroke:var(--ht-c3-ground); }
.ht-c3-route.ht-c3-bypass > path { stroke-width:2.5; }
.ht-c3-particle { fill:#fff; opacity:0; }
.ht-c3-shell, .ht-c3-rim { stroke:#939ca8; stroke-width:1.5; }
.ht-c3-window { stroke:#171c22; stroke-width:2; filter:drop-shadow(0 0 1px #a0a9ae); }
[data-theme='light'] .ht-c3-window { stroke:#535d68; }
.ht-c3-vessel { stroke:#fafcfe; stroke-width:2; fill:#c57c84; }
.ht-c3-value-bg { fill:rgba(24,32,43,.68); }
.ht-c3-label { fill:var(--hb-t2); font-size:13px; font-family:var(--hb-font, inherit); }
.ht-c3-label[data-label='dhw'], .ht-c3-label[data-label='tank'] { fill:#fff; }
.ht-c3-label[data-label='dhw'] { font-size:12px; letter-spacing:-1px; }
[data-theme='light'] .ht-c3-value-bg { fill:rgba(255,255,255,.68); }
[data-theme='light'] .ht-c3-label:is([data-label='dhw'],[data-label='tank']) { fill:#202735; }
[data-theme='light'] .ht-c3-vessel { stroke:#35434e; }
.ht-c3-dhw-value { font-size:15px; font-weight:500; }
.ht-c3-unit { font-size:13px; }
.ht-c3-dhw-unit { font-size:12px; }
.ht-c3-tank-value { font-size:24px; font-weight:500; }
.ht-c3-label.ht-c3-muted, .ht-c3-muted { fill:#929ba6; font-weight:400; }
.ht-c3-label:is([data-label='hp-out'],[data-label='hp-in'],[data-label='supply'],[data-label='mixing']):not(.ht-c3-muted) tspan { fill:var(--hb-t1); font-weight:500; }
[data-theme='light'] .ht-c3-label { fill:#48525d; }
[data-theme='light'] .ht-c3-label:is([data-label='collector'],[data-label='cold-water']) { fill:#343d46; }
[data-theme='light'] .ht-c3-label.ht-c3-muted, [data-theme='light'] .ht-c3-muted { fill:#606b77; }
.ht-run-meta b.ht-muted { color:var(--hb-t2); }
.ht-c3-cabinet { fill:color-mix(in srgb, var(--hb-s2) 70%, #7b858f); stroke:#78828c; }
.ht-c3-cutaway { fill:#202a30; stroke:#77828c; }
.ht-c3-compressor { fill:#74808b; stroke:#a2abb3; }
.ht-c3-led { fill:#879099; }
.ht-c3-led-on { fill:#6aefac; filter:drop-shadow(0 0 2px #6aefac); }
@keyframes ht-c3-comp-led { 0%,100%{opacity:1} 50%{opacity:.42} }
.ht-c3-comp-led-on { fill:var(--hb-ok); filter:drop-shadow(0 0 3px color-mix(in srgb,var(--hb-ok) 55%,transparent)); }
.ht-c3-comp-led-on[data-pulse] { animation:ht-c3-comp-led 2s ease-in-out infinite; }
@media (prefers-reduced-motion:reduce){.ht-c3-comp-led-on[data-pulse]{animation:none}}
.ht-c3-comp-led-off, .ht-c3-comp-led-unknown { fill:#879099; }
.ht-c3-plates { stroke:#b7aa82; stroke-width:4; }
.ht-c3-metal { fill:#89979d; stroke:#b4bec3; stroke-width:1; }
.ht-c3-motor { fill:#586775; stroke:#a8b4be; }
.ht-c3-metal-pipe { fill:none; stroke:#94a3ab; stroke-width:5; }
.ht-c3-indicator { fill:none; stroke:var(--ht-c3-hot); stroke-width:3; stroke-linecap:round; }
.ht-c3-servo-mark { stroke:#b8d4ca; stroke-width:1.5; }
.ht-c3-leader { fill:none; stroke:var(--hb-t2); stroke-width:.7; }
.ht-c3-cold-inlet { fill:none; stroke:var(--ht-c3-cold); stroke-width:1.5; opacity:.7; }
.ht-c3-main-label-bg { fill:var(--ht-c3-room); }
.ht-c3-tank-top-bg { fill:color-mix(in srgb, var(--ht-c3-room) 92%, #000); opacity:.92; }
.ht-c3-hp-metrics-bg { fill:color-mix(in srgb, var(--ht-c3-room) 90%, var(--hb-s1)); opacity:.95; }
.ht-c3-label[data-label='tank-top'] { font-size:12px; font-weight:550; }
.ht-c3-label[data-label='hp-delta'] { font-size:12px; font-weight:500; }
.ht-c3-water-valve { fill:none; stroke:var(--ht-c3-cold); stroke-width:1; }
.ht-c3-draw { fill:none; stroke:var(--ht-c3-hot); stroke-width:3; opacity:.5; }
[data-theme='light'] .ht-c3-draw { stroke:#ab3037; opacity:1; }
.ht-c3-ceramic { fill:#d0d1c8; stroke:#858f8c; }
.ht-c3-fin { fill:#bdc2b7; stroke:#8f9d92; stroke-width:.6; }
.ht-c3-rad-feet, .ht-c3-pump-foot { fill:none; stroke:#858f8c; stroke-width:3; }
.ht-c3-tap { stroke:#6f808b; stroke-width:1; stroke-linejoin:round; }
@media(max-width:600px) {
  .ht-hero { padding:16px 10px 10px; gap:4px; }
  .ht-hero-copy { padding:0 6px; gap:6px; }
  .ht-hero-copy > .ht-hero-detail { margin-bottom:4px; }
  .ht-hero h2 { font-size:24px; }
  .ht-c3 { max-width:344px; }
  .ht-c3-chips { margin-top:8px; }
}
@media(min-width:900px) {
  .ht-hero:has(.ht-c3) { align-items:start; padding:20px 24px; gap:12px 24px; }
  .ht-hero-copy { padding-top:8px; }
  .ht-run-meta { justify-content:flex-start; }
  .ht-c3 { max-width:310px; }
}
@media(prefers-reduced-motion:reduce) {
  .ht-c3 *, .ht-c3 *::before, .ht-c3 *::after { animation:none!important; transition:none!important; }
  .ht-c3-particle { display:none; }
}

/* Landscape dashboard – portrait first; enriched layout when wide enough. */
.ht-land-only { display: none; }
.ht-c3-land-only { display: none; }
.ht-land-dash { display: none; }
.ht-land-pump-chips { display: none; }
.ht-land-rooms-only { display: none; }
.ht-land-panel { display: flex; flex-direction: column; padding: 12px 14px; gap: 8px; flex: none; min-width: 0; }
.ht-land-panel .ht-ch h3 { font-size: 13px; }
.ht-land-panel .ht-kv { font-size: 13px; }
.ht-land-panel .ht-kv li { padding: 6px 0; }
.ht-land-panel .ht-muted,
.ht-land-panel .ht-side-sub,
.ht-land-panel .ht-side-hold { font-size: 13px; color: var(--hb-t2); }
.ht-land-dash-inner {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 10px 12px;
  align-content: start;
  min-width: 0;
  width: 100%;
}
.ht-chart-compact { padding-left: 28px; padding-right: 12px; }
.ht-chart-compact .ht-chart-wrap { gap: 2px; }
.ht-chart-compact .ht-ylab { font-size: 11px; left: -28px; }
.ht-chart-compact .ht-xlabs { height: 14px; }
.ht-chart-compact .ht-xlabs span { font-size: 11px; }
.ht-curve-now-dot { fill: var(--ht-c-tank); stroke: var(--hb-s1); stroke-width: 2; vector-effect: non-scaling-stroke; }
.ht-extras-land { display: flex; flex-direction: column; gap: 10px; }
.ht-extras-land-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 4px 10px; align-items: baseline; }
.ht-extras-land-row .ht-chips { grid-column: 1 / -1; }
.ht-extras-land-k { font-size: 12px; color: var(--hb-t2); }
.ht-land-day .ht-legend { display: flex; flex-wrap: wrap; margin-bottom: 6px; font-size: 11px; gap: 4px 12px; }
.ht-land-day .ht-chart-wrap { margin-top: 2px; }
.ht-land-day .ht-ylab { font-size: 11px; }
.ht-curve-target { stroke: var(--ht-c-top); stroke-width: 2; stroke-dasharray: 5 4; vector-effect: non-scaling-stroke; opacity: .85; }
.ht-tank-gauge { display: grid; grid-template-columns: 36px minmax(0, 1fr); gap: 12px; align-items: stretch; }
.ht-tank-gauge-bar { position: relative; width: 100%; min-height: 120px; border-radius: var(--hb-radius-md, 12px); overflow: hidden; background: var(--hb-fill, rgba(127,127,127,.15)); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--hb-t1) 10%, transparent); }
.ht-tank-gauge-fill { position: absolute; inset: 0; background: linear-gradient(0deg, #4e88b9 0%, #9a9da3 52%, #ba6970 100%); opacity: .9; }
.ht-tank-gauge-band { position: absolute; left: 0; right: 0; background: color-mix(in srgb, var(--hb-ac) 28%, transparent); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--hb-ac) 45%, transparent); pointer-events: none; }
.ht-tank-gauge-mark { position: absolute; left: -2px; right: -2px; height: 2px; background: #fff; box-shadow: 0 0 0 1px rgba(0,0,0,.35); pointer-events: none; }
.ht-tank-gauge-mark.ht-tank-gauge-top { background: #e8a0a4; }
.ht-tank-gauge-kv { flex: 1; }
.ht-tank-gauge-hint { font-size: 12px; grid-column: 1 / -1; margin: 0; }
.ht-land-curve { margin-top: 4px; }
.ht-curve-unit { font-size: 11px; color: var(--hb-t2); align-self: end; }
.ht-land-rooms-link { margin-top: 4px; }
.ht-now-schematic { display: flex; flex-direction: column; align-items: center; gap: 6px; min-width: 0; }
.ht-now-hero-grid { display: contents; }
.ht-hero-now { align-items: stretch; }
.ht-land-strip {
  display: none;
  align-items: center;
  gap: 8px 14px;
  grid-template-columns: auto minmax(0, 1fr) auto;
  grid-template-rows: auto auto;
  min-width: 0;
  padding-bottom: 2px;
  border-bottom: 1px solid color-mix(in srgb, var(--hb-t1) 8%, transparent);
}
.ht-land-strip > .ht-land-pump-chips {
  grid-column: 1 / -1;
  justify-content: flex-start;
  flex-wrap: wrap;
  gap: 6px;
}
.ht-land-strip-head {
  min-width: 0;
  font-size: 15px;
  font-weight: 550;
  line-height: 1.25;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin: 0;
}
.ht-land-strip-meta {
  display: inline-flex;
  align-items: baseline;
  gap: 8px;
  margin: 0;
  font-size: 13px;
  color: var(--hb-t2);
  white-space: nowrap;
  justify-self: end;
}
.ht-land-strip-meta b { color: var(--hb-t1); font-weight: 500; }
.ht-land-strip-sep { color: var(--hb-t2); opacity: .75; }

@media (orientation: landscape) and (min-width: 560px) and (min-height: 340px) {
  .ht-c3-cold-portrait, .ht-c3-cold-portrait-bg { display: none; }
  .ht-land-only, .ht-c3-land-only { display: block; }
  .ht-land-strip.ht-land-only { display: grid; }
  .ht-portrait-hero-copy, .ht-portrait-only { display: none !important; }
  .ht-land-strip .ht-land-pump-chips { display: flex; }
  .ht-land-rooms-only { display: grid; grid-template-columns: 1fr; }
  .ht-hero.ht-hero-now {
    display: flex; flex-direction: column; gap: 12px; padding: 14px 16px;
    max-width: none; overflow: visible;
  }
  .ht-now-hero-grid {
    --ht-scene-w: min(40vw, 344px);
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    grid-template-rows: auto auto;
    grid-template-areas: 'strip strip' 'schem panels';
    gap: 12px 16px; align-items: stretch; width: 100%;
  }
  .ht-land-strip { grid-area: strip; }
  .ht-now-schematic {
    grid-area: schem; align-self: start; justify-content: flex-start;
    width: var(--ht-scene-w); max-width: none;
  }
  .ht-now-schematic .ht-c3 {
    width: 100%; max-width: none; margin: 0; height: auto; overflow: visible;
  }
  .ht-now-schematic .ht-c3 > svg { width: 100%; height: auto; max-height: none; }
  .ht-land-dash { display: block; grid-area: panels; min-width: 0; overflow: visible; }
  .ht-c3-chips { display: none; }
  .ht { max-width: min(100%, 1920px); width: 100%; }
  .ht-c3-owner-logo { x: 11px; width: 60px; }
  .ht-land-panel .hb-chip { align-self: start; justify-self: start; width: fit-content; }
}

@media (orientation: landscape) and (min-width: 560px) and (min-height: 340px) and (max-height: 599px) {
  .ht-now-hero-grid { --ht-scene-w: 48vw; }
  .ht-land-strip { grid-template-columns: auto minmax(0, 1fr); }
  .ht-land-strip-meta { grid-column: 1 / -1; justify-self: start; }
  .ht-land-strip-head { white-space: normal; }
  .hb-shell main:has(.ht-hero-now) { overflow: visible; }
  .ht-now-schematic { position: sticky; top: calc(var(--hb-topbar-height, 56px) + 4px); }
  .ht-land-panel { padding: 10px 12px; }
  .ht-land-dash-inner { grid-template-columns: minmax(0, 1fr); }
}

@media (orientation: landscape) and (min-width: 1000px) and (min-height: 600px) {
  .ht-now-hero-grid { --ht-scene-w: calc((100dvh - 220px) * 344 / 542); }
  .ht-land-dash { height: calc(100dvh - 220px); }
  .ht-land-dash-inner {
    height: 100%; gap: 10px 14px;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    grid-template-rows: minmax(0, 1fr) minmax(0, 1fr) auto;
    grid-template-areas:
      "fish house outdoor store"
      "extras compressor outdoor status"
      "day day day day";
    align-content: stretch;
  }
  .ht-land-dash-inner:not(:has([data-land-area="fish"])) {
    grid-template-areas: "house outdoor store extras" "house outdoor compressor status" "day day day day";
  }
  .ht-land-dash-inner:not(:has([data-land-area="extras"])) {
    grid-template-areas: "fish house outdoor store" "fish compressor outdoor status" "day day day day";
  }
  .ht-land-dash-inner:not(:has([data-land-area="fish"], [data-land-area="extras"])) {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    grid-template-areas: "house outdoor store" "compressor outdoor status" "day day day";
  }
  .ht-land-dash-inner > [data-land-area="fish"] { grid-area: fish; }
  .ht-land-dash-inner > [data-land-area="extras"] { grid-area: extras; }
  .ht-land-dash-inner > [data-land-area="house"] { grid-area: house; }
  .ht-land-dash-inner > [data-land-area="outdoor"] { grid-area: outdoor; }
  .ht-land-dash-inner > [data-land-area="store"] { grid-area: store; }
  .ht-land-dash-inner > [data-land-area="compressor"] { grid-area: compressor; }
  .ht-land-dash-inner > [data-land-area="status"] { grid-area: status; }
  .ht-land-dash-inner > [data-land-area="day"] { grid-area: day; }
  .ht-land-dash-inner > [data-land-area] { min-width: 0; }
  .ht-land-curve { flex: 1; display: flex; min-height: 100px; }
  .ht-land-curve > .ht-chart-wrap { flex: 1; }
  .ht-land-curve .ht-chart { flex: 1; height: auto !important; min-height: 100px; }
}

@media (orientation: landscape) and (min-width: 1000px) and (min-height: 600px) and (max-height: 950px) {
  .ht-land-panel { padding: 10px 12px; gap: 6px; }
  .ht-land-panel .ht-kv li { padding: 2px 0; font-size: 12px; gap: 6px; }
  .ht-land-panel .ht-ch h3 { font-size: 12px; }
  .ht-tank-gauge { grid-template-columns: 16px minmax(0, 1fr); gap: 8px; }
  .ht-tank-gauge-hint { display: none; }
  .ht-land-day { display: grid; grid-template-columns: auto 1fr; gap: 6px 12px; }
  .ht-land-day > .ht-chart-wrap { grid-column: 1 / -1; }
  .ht-land-day .ht-chart { height: 80px !important; }
  .ht-land-day .ht-legend { margin-bottom: 0; }
  .ht-side-temp { font-size: 24px; }
  .ht-land-panel.ht-side-circuit { gap: 6px; }
  .ht-land-panel.ht-side-circuit .ht-ch { margin-bottom: 0; }
  .ht-extras-land { gap: 6px; }
  .ht-extras-land-row { row-gap: 3px; }
  .ht-tank-gauge-bar { min-height: 96px; }
}
`;

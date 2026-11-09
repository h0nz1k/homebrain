/** Module styles (scoped under `.ht`). Motion: transform/opacity only; none for reduced motion. */
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
.ht-hero { padding: 26px 28px; display: grid; grid-template-columns: minmax(280px, 0.72fr) minmax(0, 1.75fr); gap: 20px 28px; align-items: center; overflow: hidden; position: relative;
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

/* Schematic */
.ht-sch { position: relative; width: 100%; min-width: 0; container-type: inline-size; }
.ht-sch > svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
.ht-soil { stroke: none; }
.ht-grass { stroke: color-mix(in srgb, var(--hb-t1) 12%, transparent); stroke-width: 1.5; stroke-linecap: round; fill: none; }
.ht-pipe-case { fill: none; stroke: color-mix(in srgb, var(--hb-t1) 4%, transparent); stroke-width: 8; stroke-linejoin: round; stroke-linecap: round; }
.ht-pipe-core { fill: none; stroke-width: 3; stroke-linejoin: round; stroke-linecap: round; opacity: 0.32; transition: opacity var(--hb-dur-slow, 400ms) ease; }
.ht-pipe[data-active] .ht-pipe-core { opacity: 0.65; }
.ht-p { opacity: 0.65; }
.ht-pump-body { fill: var(--hb-s1); stroke: var(--ht-steel-edge); stroke-width: 2; }
.ht-pump[data-on] .ht-pump-body { stroke: var(--ht-heat); }
.ht-impeller { fill: color-mix(in srgb, var(--hb-t1) 45%, transparent); transform-box: fill-box; transform-origin: center; }
.ht-pump[data-on] .ht-impeller { fill: var(--ht-heat); animation: ht-spin 3.6s linear infinite; }
.ht-valve-body { fill: var(--hb-s1); stroke: var(--ht-steel-edge); stroke-width: 2; }
.ht-valve-flag { transition: transform 700ms var(--hb-ease-out, ease); transform-box: view-box; transform-origin: 0 0; }
.ht-valve-flag path { fill: none; stroke: var(--hb-t1); stroke-width: 2.4; stroke-linecap: round; stroke-linejoin: round; }
.ht-hp-body { fill: var(--ht-steel); stroke: var(--ht-steel-edge); stroke-width: 1.5; }
.ht-comp-shell { fill: color-mix(in srgb, var(--hb-t1) 10%, var(--hb-s1)); stroke: var(--ht-steel-edge); stroke-width: 1.5; }
.ht-comp[data-on] .ht-comp-shell { stroke: var(--ht-heat); }
.ht-comp-scroll { fill: none; stroke: color-mix(in srgb, var(--hb-t1) 40%, transparent); stroke-width: 2; stroke-linecap: round; }
.ht-comp[data-on] .ht-comp-scroll { stroke: var(--ht-heat); }
.ht-comp[data-on] { animation: ht-breathe 4s ease-in-out infinite; }
.ht-comp-glow { animation: ht-glow 6s ease-in-out infinite alternate; }
.ht-rad-pipe { fill: none; stroke: color-mix(in srgb, var(--hb-t1) 22%, transparent); stroke-width: 4; stroke-linecap: round; }
.ht-rad[data-on] .ht-rad-pipe { stroke: color-mix(in srgb, var(--ht-c-supply) 70%, transparent); }
.ht-tank-glass { fill: none; stroke: color-mix(in srgb, var(--hb-t1) 30%, transparent); stroke-width: 1.5; }
.ht-backup path { fill: none; stroke: color-mix(in srgb, var(--hb-crit) 60%, var(--hb-t2)); stroke-width: 3; stroke-linejoin: round; }
.ht-backup[data-on] path { stroke: var(--hb-crit); }
.ht-house-outline { fill: color-mix(in srgb, var(--hb-t1) 4%, transparent); stroke: color-mix(in srgb, var(--hb-t1) 15%, transparent); stroke-width: 1.5; stroke-linejoin: round; }
.ht-rad rect { fill: color-mix(in srgb, var(--hb-t1) 8%, var(--hb-s1)); stroke: color-mix(in srgb, var(--hb-t1) 28%, transparent); stroke-width: 1.5; }
.ht-rad path:not(.ht-rad-pipe) { stroke: color-mix(in srgb, var(--hb-t1) 24%, transparent); stroke-width: 2; stroke-linecap: round; }
.ht-rad[data-on] rect { fill: color-mix(in srgb, var(--ht-c-supply) 12%, var(--hb-s1)); stroke: color-mix(in srgb, var(--ht-c-supply) 55%, var(--ht-steel-edge)); }
.ht-tap path { fill: none; stroke: color-mix(in srgb, var(--hb-t1) 55%, transparent); stroke-width: 3; stroke-linecap: round; }
.ht-tap .ht-drop { fill: var(--ht-c-dhw); stroke: none; }
.ht-lbl { position: absolute; display: flex; flex-direction: column; gap: 1px; pointer-events: none; white-space: nowrap; font-size: 12px; line-height: 1.3; }
.ht-lbl[data-align='c'] { transform: translateX(-50%); align-items: center; text-align: center; }
.ht-lbl[data-align='r'] { transform: translateX(-100%); align-items: flex-end; text-align: right; }
.ht-lbl { text-shadow: 0 1px 6px var(--hb-s1), 0 0 2px var(--hb-s1); }
.ht-lbl b { font-size: 14px; font-weight: 600; font-variant-numeric: tabular-nums; }
.ht-lbl-k { color: var(--hb-t2); font-size: 13px; }
.ht-lbl-warn { font-size: 12px; font-weight: 600; color: var(--hb-on-crit, #fff); background: var(--hb-crit); padding: 2px 8px; border-radius: 999px; }
.ht-hdo { margin-top: 4px; font-size: 12px; font-weight: 600; padding: 2px 8px; border-radius: 999px; background: color-mix(in srgb, var(--hb-ok) 16%, transparent); color: var(--hb-t1); align-self: flex-start; }
.ht-lbl[data-align='r'] .ht-hdo { align-self: flex-end; }
.ht-hdo[data-hdo='high'] { background: color-mix(in srgb, var(--hb-warn) 18%, transparent); }

@keyframes ht-spin { to { transform: rotate(360deg); } }
@keyframes ht-breathe { 0%, 100% { opacity: 0.65; } 50% { opacity: 1; } }
@keyframes ht-glow { from { opacity: 0.45; } to { opacity: 1; } }

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
.ht-extras { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font-size: 13px; color: var(--hb-t2); }

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
.ht-runs { position: relative; height: 12px; margin-top: 8px; border-radius: 4px; background: var(--hb-fill, rgba(127,127,127,.12)); }
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
  .ht-particles { display: none; }
}
`;

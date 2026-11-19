/**
 * Full schematic styles (scoped under `.ht-fs`), palette of the approved round p3i plus the
 * p3i review fixes: light fault amber (distinct from the light TUV orange), warmer compressor
 * glow (distinct from both fault colours and from the plates). Motion: flow sheen + compressor
 * breathing, off with prefers-reduced-motion or a `.calm` / `[data-motion='calm']` ancestor.
 */
export const FS_PALETTE = {
  dark: {
    heat_supply: '#ff5260',
    heat_return: '#628bff',
    solar: '#ecf27c',
    coll: '#22dc96',
    dhw: '#ebadcc',
    cold_water: '#f0f2f4',
    pool: '#42dfff',
    cool: '#c95eed',
    warn: '#ff9500',
    glow: '#ffbcae',
  },
  light: {
    heat_supply: '#ad143f',
    heat_return: '#28388e',
    solar: '#765f00',
    coll: '#007a4f',
    dhw: '#ad4e00',
    cold_water: '#6c6b79',
    pool: '#006e7f',
    cool: '#a100d6',
    warn: '#ffbf00',
    glow: '#ffbcae',
  },
} as const;

const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
/** WCAG relative luminance of a `#rrggbb` colour. */
export const luminance = (hex: string) => {
  const [r, g, b] = rgb(hex).map(lin) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
/**
 * "Standing water" tone (r3): the circuit colour half-way to the grey of the same luminance –
 * visibly calmer than flowing water, but its contrast to the room stays the same (≥ 3:1).
 */
export function stillOf(hex: string): string {
  const L = luminance(hex);
  const g = L <= 0.0031308 ? 12.92 * L : 1.055 * L ** (1 / 2.4) - 0.055;
  return `#${rgb(hex)
    .map((v) =>
      Math.round((v + (g - v) * 0.55) * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

const vars = (p: Record<string, string>) =>
  Object.entries(p)
    .map(([k, v]) => `--fs-${k}:${v};`)
    .join('');

const DARK = {
  bg: '#111418',
  room: '#1b2026',
  tech: '#20262d',
  wallc: '#46505c',
  wall: '#8793a0',
  slab: '#38424c',
  soil: '#3a3126',
  soil2: '#393126',
  hatch: '#716052',
  grass: '#7c9a73',
  t1: '#e8ebf0',
  t2: '#c0c8d2',
  t3: '#b6c0cc',
  muted: '#b3bdc8',
  inactive: '#8e9692',
  'off-fill': '#262c33',
  plate: '#2a3139',
  'card-edge': '#5a6573',
  'warn-s': '#8b281e',
  'warn-ink': '#ffffff',
  'warn-key': '#1a2027',
  'idle-op': '.76',
  'off-op': '.72',
  'badge-edge': '#b6c0cc',
  badge: '#5b6472',
  dot: '#e8ebf0',
  jacket: '#4a4f57',
  window: '#171c22',
  vessel: '#fafcfe',
  cabinet: '#343a41',
  cut: '#202a30',
  'solar-fill': '#2a2318',
  'solar-edge': '#d4a017',
  'solar-fin': '#e6b422',
  concrete: '#3b434c',
  concrete2: '#333a41',
  screed: '#47403a',
  card: '#18202b',
  'card-ink': '#f4f6f8',
  heat: '#d9895b',
  leader: '#b6bec9',
  'pool-alpha': '.24',
  encl: '#9aaec1',
  ceramic: '#56636c',
  fin: '#75838c',
  'cool-idle': '#a593b3',
  'coll-idle': '#7fae98',
  'idle-op2': '.9',
  neutral: '#9aa4ae',
  'glow-core': '#ffbcae',
  'glow-mid': '#df9a87',
  'glow-edge': '#8d8a8e',
  'glow-halo': '#ff9e7a',
  'hp-led-off': '#879099',
  pill: '#2d3742',
  'pill-edge': '#6b7a8a',
  'pill-ink': '#ffffff',
  run: '#3fd98a',
  'run-fill': '#174a33',
  'run-motor': '#2b8a5c',
  'run-ink': '#d9ffe9',
  ...FS_PALETTE.dark,
};
const LIGHT = {
  bg: '#ffffff',
  room: '#edf1f4',
  tech: '#e1e7ed',
  wallc: '#9da9b4',
  wall: '#657483',
  slab: '#c6cdd5',
  soil: '#e4d9c6',
  soil2: '#dbceb8',
  hatch: '#a08c6f',
  grass: '#52654e',
  t1: '#0e1116',
  t2: '#323d49',
  t3: '#353c46',
  muted: '#3b424b',
  inactive: '#59636e',
  'off-fill': '#f3f5f7',
  plate: '#ffffff',
  'card-edge': '#9aa5b1',
  'warn-s': '#fff3cc',
  'warn-ink': '#3a2900',
  'warn-key': '#3a2900',
  'idle-op': '.80',
  'off-op': '.78',
  'badge-edge': '#5f6875',
  badge: '#5f6875',
  dot: '#0e1116',
  jacket: '#8a9099',
  window: '#535d68',
  vessel: '#35434e',
  cabinet: '#cfd3d7',
  cut: '#202a30',
  'solar-fill': '#1c1912',
  'solar-edge': '#7d6100',
  'solar-fin': '#ffe15e',
  concrete: '#aab4bf',
  concrete2: '#d3d8de',
  screed: '#d5c6b7',
  card: '#fff7f2',
  'card-ink': '#202735',
  heat: '#4c0039',
  leader: '#5f6875',
  'pool-alpha': '.40',
  encl: '#4b6070',
  ceramic: '#9aa5ad',
  fin: '#bcc5cb',
  'cool-idle': '#6e5c7d',
  'coll-idle': '#476b5b',
  'idle-op2': '.9',
  neutral: '#59636e',
  'glow-core': '#ffbcae',
  'glow-mid': '#e3a08c',
  'glow-edge': '#8d8a8e',
  'glow-halo': '#ff8a5c',
  'hp-led-off': '#6d7680',
  pill: '#ffffff',
  'pill-edge': '#7d8a97',
  'pill-ink': '#0e1116',
  run: '#137a46',
  'run-fill': '#d6f2e2',
  'run-motor': '#2f9e66',
  'run-ink': '#0b4a2a',
  ...FS_PALETTE.light,
};

/** Theme variables (exported for the contrast test). */
export const FS_THEME = { dark: DARK, light: LIGHT } as const;

for (const theme of ['dark', 'light'] as const) {
  const t = theme === 'dark' ? DARK : LIGHT;
  for (const [k, v] of Object.entries(FS_PALETTE[theme])) {
    (t as Record<string, string>)[`still-${k}`] = stillOf(v);
  }
}

const COLOURS = [
  'heat_supply',
  'heat_return',
  'solar',
  'coll',
  'dhw',
  'cold_water',
  'pool',
  'cool',
];
const MOTION_OFF = `:is(.calm, [data-motion='calm']) .ht-fs`;

export const fullSchematicStyles = `
.ht-fs { ${vars(DARK)} }
[data-theme='light'] .ht-fs, .ht-fs[data-theme='light'] { ${vars(LIGHT)} }
.ht-fs .fs-svg { display:block; overflow:visible; font-family:var(--hb-font-family, Inter, system-ui, sans-serif); }
.ht-fs .fs-t { font-feature-settings:'tnum','cv11','ss03'; paint-order:stroke fill; stroke-linejoin:round; }
.ht-fs .fs-bg { fill:var(--fs-bg); }
.ht-fs .fs-pipe { fill:none; stroke-width:5; stroke-linecap:round; stroke-linejoin:round; }
${COLOURS.map((c) => `.ht-fs .fs-c-${c}{stroke:var(--fs-${c})} .ht-fs .fs-f-${c}{fill:var(--fs-${c})} .ht-fs .fs-c-${c}.fs-s-still{stroke:var(--fs-still-${c})}`).join('\n')}
/* One encoding per state (legend "Stavy potrubí"): flow = colour + chevrons, still = calmer
   colour, idle = colour dashed (the only dash), unknown = hollow line (colour edges, room core),
   closed = grey, off = grey dots. Every stroke stays ≥ 3:1 against the room (contrast test). */
.ht-fs .fs-pipe-core { fill:none; stroke:var(--fs-tech); stroke-width:1.8; stroke-linecap:butt; pointer-events:none; }
.ht-fs .fs-svg[data-lod='overview'] .fs-pipe { stroke-width:7; }
.ht-fs .fs-svg[data-lod='overview'] .fs-pipe-core { stroke-width:2.6; }
.ht-fs .fs-s-idle { stroke-dasharray:12 8; stroke-linecap:butt; }
.ht-fs .fs-s-closed { stroke:var(--fs-neutral) !important; stroke-opacity:1; }
.ht-fs .fs-s-off { stroke:var(--fs-inactive) !important; stroke-dasharray:.5 9; stroke-linecap:round; stroke-width:5.5; }
.ht-fs .fs-bridge-arc { stroke-dasharray:none; stroke-linecap:butt; }
.ht-fs .fs-coil { stroke-width:4; }
.ht-fs .fs-swatch { stroke-width:7; }
.ht-fs .fs-neutral-pipe { stroke:var(--fs-neutral); }
.ht-fs .fs-halo { fill:none; stroke-width:10; stroke-linecap:butt; }
.ht-fs .fs-flow-anim { fill:none; stroke:#fff; stroke-opacity:.32; stroke-width:2.2; stroke-linecap:round; stroke-dasharray:1.5 34; animation:fs-flow 2.4s linear infinite; pointer-events:none; }
[data-theme='light'] .ht-fs .fs-flow-anim, .ht-fs[data-theme='light'] .fs-flow-anim { stroke-opacity:.55; }
@keyframes fs-flow { to { stroke-dashoffset:-35.5; } }
.ht-fs .fs-chev { fill:none; stroke:#fff; stroke-width:2.8; stroke-linecap:round; stroke-linejoin:round; }
.ht-fs .fs-chev-keyline { stroke:#0d1520; stroke-width:5.6; }
.ht-fs .fs-dot { fill:var(--fs-dot); stroke-width:2; }
.ht-fs .fs-sleeve-bar { fill:none; stroke:var(--fs-wall); stroke-width:3; stroke-linecap:round; }
.ht-fs .fs-sleeve-key { fill:none; stroke:var(--fs-bg); stroke-width:6; stroke-linecap:round; }
.ht-fs .fs-sleeve, .ht-fs .fs-metal, .ht-fs .fs-fitting { fill:#89979d; stroke:#b4bec3; stroke-width:1; }
.ht-fs .fs-port-collar { stroke:#0f1519; stroke-width:1.4; }
.ht-fs .fs-port-core { fill:var(--fs-tech); }
.ht-fs .fs-motor { fill:#586775; stroke:#a8b4be; stroke-width:1; }
.ht-fs .fs-flange { stroke:#94a3ab; stroke-width:7; stroke-linecap:butt; }
.ht-fs .fs-flange-closed { stroke:#6c757e; stroke-dasharray:2.5 2; }
.ht-fs .fs-stem { stroke:#94a3ab; stroke-width:4; }
.ht-fs .fs-servo { stroke:#b8d4ca; stroke-width:1.6; stroke-linecap:round; }
.ht-fs .fs-posbar { stroke:#f4f6f8; stroke-width:3; stroke-linecap:round; }
.ht-fs .fs-tri { fill:#f4f6f8; }
.ht-fs .fs-pump-on .fs-ring { fill:var(--fs-run-fill); stroke:var(--fs-run); stroke-width:3.4; }
.ht-fs .fs-pump-on .fs-motor { fill:var(--fs-run-motor); stroke:var(--fs-run); }
.ht-fs .fs-pump-off .fs-tri { fill:#9aa4ae; }
.ht-fs .fs-pump-unknown .fs-ring { stroke:var(--fs-neutral); stroke-width:1.6; }
.ht-fs .fs-pump-unknown .fs-tri { fill:none; stroke:#c3cad1; stroke-width:1.4; }
.ht-fs .fs-sensor-ring { fill:var(--fs-tech); stroke:var(--fs-t1); stroke-width:2; }
.ht-fs .fs-sensor-core { fill:var(--fs-t1); }
.ht-fs .fs-cabinet { fill:var(--fs-cabinet); stroke:#78828c; stroke-width:1.2; }
.ht-fs .fs-fan-ring { fill:var(--fs-cut); stroke:#8d99a3; stroke-width:1.4; }
.ht-fs .fs-blade { fill:#89979d; stroke:#b4bec3; stroke-width:.8; }
.ht-fs .fs-hub { fill:#d5dbe0; }
.ht-fs .fs-hx-body { fill:#586775; stroke:#a8b4be; stroke-width:1.2; }
.ht-fs .fs-hx-plates { stroke:#b4bec3; stroke-width:1.3; opacity:.85; fill:none; }
.ht-fs .fs-glass { fill:var(--fs-off-fill); stroke:var(--fs-inactive); stroke-width:2.5; stroke-dasharray:.5 7; stroke-linecap:round; }
.ht-fs .fs-aq-water { fill:var(--fs-inactive); opacity:.35; }
.ht-fs .fs-off-mark { fill:none; stroke:var(--fs-inactive); stroke-width:3; stroke-linecap:round; }
.ht-fs .fs-ceramic { fill:var(--fs-ceramic); stroke:var(--fs-fin); stroke-width:1; }
.ht-fs .fs-fin { fill:var(--fs-fin); }
.ht-fs .fs-solar-panel { fill:var(--fs-solar-fill); stroke:var(--fs-solar-edge); stroke-width:1.6; }
.ht-fs .fs-solar-fin { stroke:var(--fs-solar-fin); stroke-width:1.1; opacity:.9; fill:none; }
.ht-fs .fs-leg { stroke:#8f9aa5; stroke-width:4; fill:none; }
.ht-fs .fs-foot { fill:#8f9aa5; }
.ht-fs .fs-tank-leg { stroke:#8f9aa5; stroke-width:7; fill:none; }
.ht-fs .fs-filter-shell { fill:#4e606e; stroke:#a0aab4; stroke-width:1.2; }
.ht-fs .fs-band { stroke:#a0aab4; stroke-width:1.6; stroke-linecap:round; }
.ht-fs .fs-cell { fill:#3e6f7c; stroke:#9fc3cc; stroke-width:1.2; }
.ht-fs .fs-electrode { stroke:#cfe3e8; stroke-width:1.8; stroke-linecap:round; }
.ht-fs .fs-device-led { fill:#8ca5b0; }
.ht-fs .fs-tank-coil-keyline { fill:none; stroke:var(--fs-card); stroke-width:7; stroke-linecap:round; stroke-linejoin:round; }
.ht-fs .fs-ek-rod { fill:none; stroke:var(--fs-heat); stroke-width:4; stroke-linecap:round; }
.ht-fs .fs-ek-flange { fill:var(--fs-jacket); stroke:var(--fs-heat); stroke-width:1.4; }
.ht-fs .fs-shell { fill:var(--fs-jacket); stroke:#939ca8; stroke-width:1.5; }
.ht-fs .fs-window { stroke:var(--fs-window); stroke-width:2; }
.ht-fs .fs-vessel { fill:#c57c84; stroke:var(--fs-vessel); stroke-width:2; }
.ht-fs .fs-solar-coil { fill:none; stroke:var(--fs-solar); stroke-width:3.5; stroke-linecap:round; stroke-linejoin:round; }
.ht-fs .fs-solar-coil.fs-s-unknown, .ht-fs .fs-solar-coil.fs-s-still { stroke-opacity:.7; stroke-dasharray:none; }
.ht-fs .fs-term { stroke:none; }
.ht-fs .fs-room { fill:var(--fs-room); }
.ht-fs .fs-techroom { fill:var(--fs-tech); }
.ht-fs .fs-wallband { fill:none; stroke:var(--fs-wallc); stroke-width:7; stroke-linecap:square; }
.ht-fs .fs-slabline { fill:none; stroke:var(--fs-wallc); stroke-width:7; stroke-linecap:butt; }
.ht-fs .fs-slab { fill:var(--fs-slab); }
.ht-fs .fs-soil { fill:var(--fs-soil); }
.ht-fs .fs-hatch { stroke:var(--fs-hatch); stroke-width:1.5; fill:none; }
.ht-fs .fs-concrete { fill:var(--fs-concrete); }
.ht-fs .fs-concrete2 { fill:var(--fs-concrete2); }
.ht-fs .fs-concrete-grain { stroke:var(--fs-wall); stroke-width:1.2; opacity:.74; }
.ht-fs .fs-grass { stroke:var(--fs-grass); stroke-width:4; fill:none; stroke-linecap:round; }
.ht-fs .fs-duct-soil, .ht-fs .fs-duct-wall, .ht-fs .fs-duct-air, .ht-fs .fs-duct-fill, .ht-fs .fs-duct-hatch { fill:none; stroke-linejoin:round; }
.ht-fs .fs-duct-soil { stroke:var(--fs-soil); stroke-width:75; }
.ht-fs .fs-duct-wall { stroke:var(--fs-wall); stroke-width:58; }
.ht-fs .fs-duct-fill { stroke:var(--fs-concrete); stroke-width:54; }
.ht-fs .fs-duct-hatch { stroke:url(#fs-concretehatch); stroke-width:54; }
.ht-fs .fs-duct-air { stroke:var(--fs-concrete2); stroke-width:44; }
.ht-fs .fs-pitwall { fill:var(--fs-concrete2); stroke:url(#fs-concretehatch); stroke-width:8; }
.ht-fs .fs-lid { fill:var(--fs-concrete); stroke:var(--fs-wall); stroke-width:1.2; }
.ht-fs .fs-grating { stroke:var(--fs-wall); stroke-width:2; fill:none; }
.ht-fs .fs-basin { fill:none; stroke:var(--fs-concrete); stroke-width:12; }
.ht-fs .fs-screed { fill:var(--fs-screed); }
.ht-fs .fs-surface { fill:none; stroke:var(--fs-pool); stroke-width:2; opacity:.9; }
.ht-fs .fs-encl { fill:none; stroke:var(--fs-encl); stroke-width:2.3; stroke-linecap:round; }
.ht-fs .fs-encl-rail { stroke:var(--fs-encl); stroke-width:3; }
.ht-fs .fs-encl-fill { fill:var(--fs-encl); opacity:.07; }
.ht-fs .fs-encl-rib { stroke:var(--fs-encl); stroke-width:1.4; opacity:.73; fill:none; }
.ht-fs .fs-legend-panel { fill:var(--fs-room); stroke:var(--fs-wall); stroke-width:1.5; }
.ht-fs .fs-partition-seam { stroke:var(--fs-wallc); stroke-width:1.6; opacity:.65; }
.ht-fs .fs-badge { fill:var(--fs-badge); stroke:var(--fs-badge-edge); stroke-width:1.5; }
.ht-fs .fs-badge-derived { fill:var(--fs-room); stroke:var(--fs-t3); stroke-width:1.5; }
.ht-fs .fs-leader { stroke:var(--fs-leader); stroke-width:1.5; fill:none; stroke-linecap:round; }
.ht-fs .fs-leader-fault { stroke:var(--fs-warn); stroke-width:2; }
.ht-fs .fs-pill { fill:var(--fs-warn-s); stroke:var(--fs-warn); stroke-width:2.2; }
.ht-fs .fs-fault-icon { fill:var(--fs-warn); stroke:var(--fs-warn-key); stroke-width:.8; }
.ht-fs .fs-fault-mark { fill:none; stroke:var(--fs-warn-key); stroke-width:2; stroke-linecap:round; }
.ht-fs .fs-valve-fault-key { fill:none; stroke:var(--fs-warn-key); stroke-width:7.5; }
.ht-fs .fs-valve-fault { fill:none; stroke:var(--fs-warn); stroke-width:3.4; }
.ht-fs .fs-open-channel-key { fill:none; stroke:#1a2027; stroke-width:7.5; stroke-linecap:round; stroke-linejoin:round; }
.ht-fs .fs-open-channel { fill:none; stroke:#fff8dc; stroke-width:3.6; stroke-linecap:round; stroke-linejoin:round; }
.ht-fs .fs-open-tick { fill:#fff8dc; stroke:#1a2027; stroke-width:.8; }
.ht-fs .fs-closed-bar { stroke:#cfd6dc; stroke-width:3.4; stroke-linecap:round; }
.ht-fs .fs-closed-bar-key { stroke:#1a2027; stroke-width:6; stroke-linecap:round; }
.ht-fs .fs-port-mark { fill:none; stroke:var(--fs-t1); stroke-width:5; stroke-linecap:round; }
.ht-fs .fs-phe-frame { fill:#aab6be; stroke:#43545f; stroke-width:1.6; }
.ht-fs .fs-phe-pack { fill:#475762; stroke:#dae3e9; stroke-width:1; }
.ht-fs .fs-phe-plates { fill:none; stroke:#e0e7eb; stroke-width:1.8; stroke-linejoin:round; }
.ht-fs .fs-idle-glyph { opacity:calc(var(--fs-idle-op) + .1); }
.ht-fs .fs-idle-glyph-soft { opacity:.92; }
.ht-fs .fs-offline-glyph { opacity:var(--fs-off-op); filter:grayscale(1); }
.ht-fs .fs-card { fill:var(--fs-card); stroke:var(--fs-card-edge); stroke-width:1.2; }
.ht-fs .fs-zone-plate { fill:var(--fs-plate); stroke:var(--fs-wallc); stroke-width:1.5; }
.ht-fs .fs-t-zone { fill:var(--fs-t1); font-weight:700; letter-spacing:.04em; }
/* Heat pump: production .ht-c3-hp colours (styles.ts), scaled into the p3i box. */
.ht-fs .fs-hp-cabinet { fill:color-mix(in srgb, var(--hb-s2, #252b33) 70%, #7b858f); stroke:#78828c; stroke-width:2.2; }
.ht-fs .fs-hp-foot { fill:none; stroke:#5d6873; stroke-linecap:butt; }
.ht-fs .fs-hp-cutaway { fill:#202a30; stroke:#77828c; stroke-width:1.8; }
.ht-fs .fs-hp-plates { stroke:#b7aa82; stroke-linecap:round; }
.ht-fs .fs-comp-body { fill:#74808b; stroke:#a2abb3; stroke-width:1.6; }
.ht-fs .fs-comp-shine { fill:none; stroke:#fff; stroke-opacity:.22; stroke-width:1.8; stroke-linecap:round; }
.ht-fs .fs-comp-on .fs-comp-body { fill:url(#fs-comp-hot); stroke:#ffd2bf; stroke-width:1.8; filter:drop-shadow(0 0 3px var(--fs-glow-halo)); }
.ht-fs .fs-comp-on .fs-comp-shine { stroke-opacity:.42; }
.ht-fs .fs-comp-off .fs-comp-body { fill:#6f7b86; stroke:#9aa3ab; }
.ht-fs .fs-comp-unknown .fs-comp-body { fill:#3a454e; stroke:#a2abb3; stroke-dasharray:5 4; }
.ht-fs .fs-hp-led-on { fill:var(--hb-ok, #3ecf8e); filter:drop-shadow(0 0 4px color-mix(in srgb, var(--hb-ok, #3ecf8e) 55%, transparent)); }
.ht-fs .fs-hp-led-off { fill:var(--fs-hp-led-off); }
.ht-fs .fs-hp-led-unknown { fill:none; stroke:var(--fs-hp-led-off); stroke-width:2; stroke-dasharray:3 3; }
.ht-fs .fs-hp-run { fill:var(--fs-t1); font-weight:500; }
@keyframes fs-breathe { 0%,100% { opacity:1; } 50% { opacity:.6; } }
@keyframes fs-led { 0%,100% { opacity:1; } 50% { opacity:.5; } }
.ht-fs .fs-comp-halo { animation:fs-breathe 3.6s ease-in-out infinite; }
.ht-fs .fs-hp-led-on[data-pulse] { animation:fs-led 2s ease-in-out infinite; }
/* Text */
.ht-fs .fs-t-p { fill:var(--fs-t1); font-weight:500; }
.ht-fs .fs-t-s { fill:var(--fs-t2); font-weight:400; }
.ht-fs .fs-t-m { fill:var(--fs-muted); font-weight:500; }
.ht-fs .fs-t-k { fill:var(--fs-t3); font-weight:500; }
.ht-fs .fs-t-c, .ht-fs .fs-t-h { fill:var(--fs-t3); font-weight:600; }
.ht-fs .fs-t-T { fill:var(--fs-t1); font-weight:600; }
.ht-fs .fs-t-w, .ht-fs .fs-tank-detail { fill:var(--fs-card-ink); font-weight:500; }
.ht-fs .fs-t-pill { fill:var(--fs-warn-ink); font-weight:600; }
.ht-fs .fs-t-badge { fill:#fff; font-weight:700; stroke:none; }
.ht-fs .fs-t-derived { fill:var(--fs-t1); font-weight:600; }
.ht-fs .fs-t-code { fill:var(--fs-t3); font-weight:500; font-family:ui-monospace, SFMono-Regular, Menlo, monospace; }
.ht-fs .fs-t-offline { fill:var(--fs-muted); font-weight:500; }
.ht-fs .fs-val { fill:var(--fs-t1); font-weight:600; }
/* r3 value pills: one value style everywhere */
.ht-fs .fs-vpill { fill:var(--fs-pill); stroke:var(--fs-pill-edge); stroke-width:1.3; }
.ht-fs .fs-pv { fill:var(--fs-pill-ink); font-weight:700; }
.ht-fs .fs-pill-none .fs-vpill { fill:none; stroke:var(--fs-pill-edge); stroke-dasharray:4 3; }
.ht-fs .fs-pv-none { fill:var(--fs-muted); font-weight:600; font-style:italic; }
.ht-fs .fs-pill-run .fs-vpill { fill:var(--fs-run-fill); stroke:var(--fs-run); }
.ht-fs .fs-pill-run .fs-pv { fill:var(--fs-run-ink); }
.ht-fs .fs-ov-card { fill:var(--fs-room); stroke:var(--fs-card-edge); stroke-width:2; }
.ht-fs .fs-t-end { fill:var(--fs-t1); font-weight:600; }
.ht-fs .fs-end-bracket { fill:none; stroke:var(--fs-t2); stroke-width:2.5; stroke-linecap:round; stroke-dasharray:1 5; }
.ht-fs .fs-tank-detail .fs-val, .ht-fs .fs-val-card { fill:var(--fs-card-ink); font-weight:600; }
.ht-fs .fs-nodata, .ht-fs .fs-nodata-card { fill:var(--fs-muted); font-style:italic; font-weight:500; }
.ht-fs .fs-tank-detail .fs-nodata, .ht-fs .fs-nodata-card { fill:var(--fs-card-ink); }
@media (prefers-reduced-motion: reduce) {
  .ht-fs .fs-flow-anim { display:none; }
  .ht-fs .fs-comp-halo, .ht-fs .fs-hp-led-on[data-pulse] { animation:none; }
}
${MOTION_OFF} .fs-flow-anim, .ht-fs.calm .fs-flow-anim, .ht-fs[data-motion='calm'] .fs-flow-anim { display:none; }
${MOTION_OFF} :is(.fs-comp-halo, .fs-hp-led-on), .ht-fs.calm :is(.fs-comp-halo, .fs-hp-led-on), .ht-fs[data-motion='calm'] :is(.fs-comp-halo, .fs-hp-led-on) { animation:none; }
`;

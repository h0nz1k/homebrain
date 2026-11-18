#!/usr/bin/env node
/**
 * Freezes the approved full heating schematic (static round p3i: `layout.json` + `topology.json`)
 * into `src/full/geometry.gen.ts`. The p3i files live outside the repo (they sit next to private
 * owner assets), so they are passed as arguments:
 *
 *   node modules/heating/tools/build-full-schematic.mjs <p3i>/layout.json <p3i>/topology.json
 *
 * What is copied: canvas, rooms, walls, pipe routes (with p3i stubs, rounded corners and bridge
 * hops), flow chevrons, junctions, fittings, glyph anchors, labels, '?' badges and the legend.
 * What is NOT copied (public repo): PLC register codes (service labels come from the live
 * backend map instead), the heat-pump model name and every embedded logo. Hydraulics are
 * unchanged; label moves that fix the p3i review are listed in LABEL_FIXES below.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const [layoutPath, topologyPath] = process.argv.slice(2);
if (!layoutPath || !topologyPath) {
  console.error('usage: build-full-schematic.mjs <layout.json> <topology.json>');
  process.exit(2);
}
const L = JSON.parse(readFileSync(layoutPath, 'utf8')).layouts.wide;
const T = JSON.parse(readFileSync(topologyPath, 'utf8'));
const OUT = join(dirname(fileURLToPath(import.meta.url)), '../src/full/geometry.gen.ts');

const r1 = (v) => Math.round(v * 10) / 10;
const B = L.boxes;
const P = L.ports;
const A = L.arch;
const R = L.regions;
const GRADE = A.grade;

// p3g: the cooling water side keeps the heating-return topology but is drawn in its own hue.
const DRAWING_COLOUR = {};
for (const ch of T.p3g_changes ?? []) {
  if (ch.op === 'drawing_pipe_colour') for (const e of ch.edges) DRAWING_COLOUR[e] = ch.colour;
}

const inside = (r, x, y) => r[0] <= x && x <= r[0] + r[2] && r[1] <= y && y <= r[1] + r[3];
/** Text halo = the surface the text sits on (p3i `halo_for`). */
function haloFor(x, y) {
  if (inside(B.hp, x, y)) return 'none';
  if (inside(R.channel, x, y) || inside(R.pit, x, y)) return 'concrete2';
  if (inside(R.tech, x, y)) return 'tech';
  if (['attic', 'storey1', 'rybarna'].some((k) => inside(R[k], x, y))) return 'room';
  if (inside(B.ground, x, y)) return 'soil2';
  if (inside(B.pool, x, y)) return 'bg';
  if (GRADE < y && y < R.channel[1] + R.channel[3] + 18) return 'soil';
  return 'bg';
}

const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const g = (v) => String(Math.round(v * 100) / 100);
/** Polyline → path with rounded corners; hops = [x, y, r] arcs on the segment (p3i `pdata`). */
function pdata(pts, r = 8, hops = []) {
  const n = pts.length;
  const rad = (i) => {
    if (i === 0 || i === n - 1) return 0;
    return Math.min(r, dist(pts[i - 1], pts[i]) / 2, dist(pts[i], pts[i + 1]) / 2);
  };
  let d = `M${g(pts[0][0])} ${g(pts[0][1])}`;
  for (let i = 1; i < n; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const len = dist(a, b);
    const ux = (b[0] - a[0]) / len;
    const uy = (b[1] - a[1]) / len;
    const hs = hops
      .filter(
        ([hx, hy]) =>
          Math.abs((hx - a[0]) * uy - (hy - a[1]) * ux) < 0.01 &&
          (hx - a[0]) * ux + (hy - a[1]) * uy > 0 &&
          (hx - a[0]) * ux + (hy - a[1]) * uy < len,
      )
      .map(([hx, hy, hr]) => [dist(a, [hx, hy]), hr])
      .sort((p, q) => p[0] - q[0]);
    for (const [t, hr] of hs) {
      const sweep = ux > 0 || uy > 0 ? 1 : 0;
      d += `L${g(a[0] + ux * (t - hr))} ${g(a[1] + uy * (t - hr))}A${hr} ${hr} 0 0 ${sweep} ${g(a[0] + ux * (t + hr))} ${g(a[1] + uy * (t + hr))}`;
    }
    const e = rad(i);
    d += `L${g(b[0] - ux * e)} ${g(b[1] - uy * e)}`;
    if (e) {
      const c = pts[i + 1];
      const l2 = dist(b, c);
      d += `Q${g(b[0])} ${g(b[1])} ${g(b[0] + ((c[0] - b[0]) / l2) * e)} ${g(b[1] + ((c[1] - b[1]) / l2) * e)}`;
    }
  }
  return d;
}

// ---------------------------------------------------------------- pipes
const hops = {};
for (const br of L.bridges) (hops[br.over] ??= []).push([br.at[0], br.at[1], br.r]);
const extensions = {};
for (const mk of L.tank_fittings) {
  const port = P[mk.port];
  if (
    mk.orient === 'v' &&
    (mk.at[0] !== port[0] || mk.at[1] !== port[1]) &&
    !L.internal_ports[mk.port]
  ) {
    extensions[mk.port] = [port, mk.at];
  }
}
for (const st of L.stubs) extensions[st.port] = st.pts;

const pipes = T.connections.map((c) => {
  const pts = L.routes[c.id];
  const start = extensions[c.from] ?? [];
  const end = extensions[c.to] ?? [];
  const full = [...start.slice(1).reverse(), ...pts, ...end.slice(1)];
  const corner = c.circuit === 'pool' ? 4 : 6;
  return {
    id: c.id,
    circuit: c.circuit,
    colour: DRAWING_COLOUR[c.id] ?? c.circuit,
    from: c.from,
    to: c.to,
    certainty: c.certainty,
    d: pdata(full, corner, hops[c.id] ?? []),
  };
});

const segs = (p) => p.slice(1).map((b, i) => [p[i], b]);
const bridges = L.bridges.map((br) => {
  const [hx, hy] = br.at;
  const [[ax, ay], [bx, by]] = segs(L.routes[br.over]).find(
    ([a, b]) =>
      (a[1] === b[1] && b[1] === hy && Math.min(a[0], b[0]) < hx && hx < Math.max(a[0], b[0])) ||
      (a[0] === b[0] && b[0] === hx && Math.min(a[1], b[1]) < hy && hy < Math.max(a[1], b[1])),
  );
  const dx = Math.sign(bx - ax);
  const dy = Math.sign(by - ay);
  const r = br.r;
  return {
    over: br.over,
    under: br.under,
    at: br.at,
    r,
    arc: `M${hx - dx * r} ${hy - dy * r}A${r} ${r} 0 0 ${dx > 0 || dy > 0 ? 1 : 0} ${hx + dx * r} ${hy + dy * r}`,
    halo: haloFor(hx, hy),
  };
});

const chevrons = L.chevrons.map((cv) => ({
  route: cv.route,
  x: cv.at[0],
  y: cv.at[1],
  angle: Math.round((Math.atan2(cv.dir[1], cv.dir[0]) * 180) / Math.PI),
  scale: cv.scale,
}));

const junctions = Object.entries(B)
  .filter(([, r]) => !r[2])
  .map(([id, r]) => ({ id, x: r[0], y: r[1], halo: haloFor(r[0], r[1]) }));

// ---------------------------------------------------------------- glyph anchors (p3i `spec`)
const X = (k) => P[k][0];
const Y = (k) => P[k][1];
const centre = (id) => [B[id][0] + B[id][2] / 2, B[id][1] + B[id][3] / 2];
const glyphs = {
  pumps: {
    pump_ryb: { c: [X('pump_ryb.in') - 51, Y('pump_ryb.in')], dir: 'l' },
    pump_ut: { c: centre('pump_ut'), dir: 'r' },
    pump_chlad: {
      c: [X('pump_chlad.in'), (Y('pump_chlad.in') + Y('pump_chlad.out')) / 2],
      dir: 'u',
    },
    pump_coll: { c: [X('pump_coll.in'), (Y('pump_coll.in') + Y('pump_coll.out')) / 2], dir: 'u' },
    pump_sek: { c: [(X('pump_sek.in') + X('pump_sek.out')) / 2, Y('pump_sek.in')], dir: 'l' },
    pump_solar: {
      c: [X('pump_solar.in'), (Y('pump_solar.in') + Y('pump_solar.out')) / 2],
      dir: 'u',
    },
    pump_pool: { c: [(X('pump_pool.in') + X('pump_pool.out')) / 2, Y('pump_pool.in')], dir: 'r' },
    pump_filt: { c: [X('pump_filt.in'), Y('pump_filt.out')], dir: 'r' },
  },
  valves: {
    valve_ryb_heat: {
      c: [B.valve_ryb_heat[0] + 36, Y('valve_ryb_heat.in')],
      ports: ['l', 'r'],
      act: 'u',
    },
    valve_ryb_water: {
      c: [B.valve_ryb_water[0] + 60, Y('valve_ryb_water.in')],
      ports: ['l', 'r'],
      act: 'u',
    },
    valve_dhw: { c: [B.valve_dhw[0] + 38, Y('valve_dhw.in')], ports: ['l', 'u', 'd'], act: 'r' },
    valve_cool: {
      c: [X('valve_cool.in'), Y('valve_cool.out_b')],
      ports: ['u', 'd', 'l'],
      act: 'r',
    },
  },
  valveMix: { c: [X('valve_mix.in_cold'), Y('valve_mix.out')] },
  sensors: { t_ut: centre('t_ut'), pool_return_temp: centre('pool_return_temp') },
  fans: Object.fromEntries(
    ['ryb_fan_lower', 'ryb_fan_upper'].map((k) => {
      const [x, y, w, h] = B[k];
      return [k, [x + 6, y + h / 2 - 22, w - 12, 44]];
    }),
  ),
  aquarium: [B.ryb_water[0] + 6, B.ryb_water[1] + 12, B.ryb_water[2] - 12, B.ryb_water[3] - 24],
  radiators: {
    box: B.radiators,
    ys: [Y('radiators.in'), Y('radiators.in') + 106],
    slab: A.attic_floor,
  },
  hx: B.hx_cool,
  hp: B.hp,
  ek: { x0: B.ek[0], y0: B.ek[1] + B.ek[3] / 2 + 6, x1: B.ek[0] + B.ek[2] - 14 },
  tank: B.tank,
  tankDhw: L.internal_boxes.find((i) => i.id === 'tank_dhw').box,
  tankCoil: L.internal_boxes.find((i) => i.id === 'tank_solar_coil').box,
  tap: B.tap,
  cold: B.cold,
  solar: { box: B.solar, legsTo: A.plant_top },
  filter: B.filter_pool,
  ph: B.ph_probe,
  salinator: B.salinator,
  acid: B.acid_dosing,
  dehumidifier: B.dehumidifier,
  pool: B.pool,
  floorPool: B.floor_pool,
  ground: B.ground,
};

// ---------------------------------------------------------------- labels
/** Labels the app renders itself (live state) or drops (public repo / sheet title). */
const DROP = new Set(['hp', 'hp_state', 'status_valve_mix', 'caption', 'valve_cool']);
/**
 * p3i review fixes (LANA 2026-11-18 18:59): port letters at the port ends, labels attached to
 * their glyph. Values are [dx, dy] relative to the glyph centre, box = text box at font 14.
 */
const mix = glyphs.valveMix.c;
const cool = glyphs.valves.valve_cool.c;
const LABEL_FIXES = {
  // Y67: AB above the outlet (left) flange end, A below the tank (right) leg, B left of the B leg.
  port_valve_mix_AB: { x: mix[0] - 24, y: mix[1] - 26, anchor: 'end' },
  port_valve_mix_A: { x: mix[0] + 24, y: mix[1] + 10, anchor: 'start' },
  port_valve_mix_B: { x: mix[0] - 12, y: mix[1] + 22, anchor: 'end' },
  // Cooling valve: each letter beside the end of its own leg (AB top, B left, A bottom).
  port_valve_cool_AB: { x: cool[0] + 10, y: cool[1] - 34, anchor: 'start' },
  port_valve_cool_B: { x: cool[0] - 18, y: cool[1] - 24, anchor: 'end' },
  port_valve_cool_A: { x: cool[0] + 10, y: cool[1] + 14, anchor: 'start' },
};
const BASE_LH = L.lh;
const labels = {};
for (const [key, l] of Object.entries(L.labels)) {
  if (DROP.has(key) || key.startsWith('tag_')) continue;
  const fix = LABEL_FIXES[key];
  let lines = [...l.lines];
  let reading = null;
  if (l.reading) {
    const at = lines[0].lastIndexOf(l.reading);
    lines[0] = lines[0].slice(0, at).trimEnd();
    reading = true;
  } else if (lines[0].endsWith(' — °C')) {
    lines[0] = lines[0].slice(0, -' — °C'.length);
    reading = true;
  }
  const font = l.size ?? l.font;
  const lh = l.lh ?? BASE_LH;
  const box = [...l.box];
  let x = l.x;
  let anchor = l.anchor;
  if (fix) {
    const w = box[2];
    x = fix.x;
    anchor = fix.anchor;
    box[0] = anchor === 'start' ? x : anchor === 'middle' ? x - w / 2 : x - w;
    box[1] = fix.y;
  }
  const offset = Math.round((lh <= font * 1.3 ? font * 0.94 : (lh + font * 0.72) / 2) * 10) / 10;
  labels[key] = {
    x,
    y: r1(box[1] + offset),
    lines,
    styles: l.styles,
    anchor,
    font,
    lh,
    box: box.map(r1),
    halo:
      l.card || l.styles.includes('w') ? 'none' : haloFor(box[0] + box[2] / 2, box[1] + box[3] / 2),
    ...(l.of ? { of: l.of } : {}),
    ...(l.card ? { card: true } : {}),
    ...(l.ink === 'tank' ? { ink: 'tank' } : {}),
    ...(l.sensor ? { sensor: true } : {}),
    ...(l.pipe_sensor ? { pipeSensor: l.pipe_sensor } : {}),
    ...(l.compressor_dependent ? { compressorDependent: true } : {}),
    ...(reading ? { reading: true } : {}),
  };
}

// No PLC register code may leave this tool (they belong to the owner's private map).
const PLC = /\b[XYR]\d{1,4}(\.\d+)?\b/;
for (const [key, l] of Object.entries(labels)) {
  if (l.lines.some((t) => PLC.test(t))) throw new Error(`PLC code in label ${key}: ${l.lines}`);
}

const badges = L.badges.map((b) => ({ of: b.of, text: b.text, x: b.at[0], y: b.at[1], r: b.r }));
const leaders = L.leaders
  .filter((ld) => ld.of !== 'valve_mix')
  .map((ld) => ({ of: ld.of, pts: ld.pts }));

const legendItems = L.legend.items
  .filter((it) => it.style !== 'text')
  .map((it) => ({ circuit: it.circuit, style: it.style, sample: it.sample }));
const questions = T.open_questions.map((q) => ({ id: q.id, text: q.text }));

const arch = {
  roof: A.roof,
  atticFloor: A.attic_floor,
  plantTop: A.plant_top,
  blockR: A.block_r,
  houseL: A.house[0],
  houseR: A.house[1],
  floor: A.floor,
  foundation: A.foundation,
  stand: A.stand,
  grade: GRADE,
  grating: A.grating,
  shaftX: A.shaft_x,
};

const ROUND_STATUS = {
  'běžně neaktivní': 'normally_idle',
  'mimo provoz': 'out_of_service',
};
const staticStatus = Object.fromEntries(
  T.connections.filter((c) => c.status).map((c) => [c.id, ROUND_STATUS[c.status] ?? c.status]),
);

const coil = L.coils.floor_pool;
const out = {
  version: L.version,
  canvas: L.canvas,
  arch,
  regions: R,
  regionEdges: L.region_edges.map(([a, z, k]) => [a[0], a[1], z[0], z[1], k]),
  boxes: Object.fromEntries(Object.entries(B).filter(([, r]) => r[2])),
  pipes,
  staticStatus,
  bridges,
  chevrons,
  junctions,
  marks: L.drawn_marks.map((m) => ({ x: m.at[0], y: m.at[1], orient: m.orient })),
  fittings: [...L.tank_fittings, ...L.hp_fittings].map((m) => ({
    port: m.port,
    x: m.at[0],
    y: m.at[1],
    orient: m.orient,
  })),
  coils: {
    ground: pdata(L.coils.ground, 6),
    poolFeed: pdata(coil.slice(0, 2), 6),
    poolMeander: pdata(coil.slice(1), 6),
    meanderX: [coil[1][0], coil[0][0]],
  },
  glyphs,
  labels,
  badges,
  leaders,
  legend: { box: L.legend.box, seams: L.legend.seams, items: legendItems },
  questions,
};
const json = JSON.stringify(out);
if (/data:image/i.test(json)) throw new Error('embedded image in geometry');
const term = new RegExp(['sol', 'ank'].join('') + '|' + ['br', 'ine'].join(''), 'i');
if (term.test(json)) throw new Error('owner rule: collector naming');
writeFileSync(
  OUT,
  `// GENERATED by tools/build-full-schematic.mjs from the approved static round ${L.version}.\n` +
    '// Do not edit by hand; hydraulic topology is frozen (46 parts, 55 pipes).\n' +
    "import type { FullGeometry } from './types.js';\n\n" +
    `export const FULL_GEOMETRY: FullGeometry = ${JSON.stringify(out)};\n`,
);
console.log(`wrote ${OUT}: ${pipes.length} pipes, ${Object.keys(labels).length} labels`);

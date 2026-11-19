import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FULL_GEOMETRY as G } from './geometry.gen.js';
import { FS_PALETTE } from './styles.js';

const MODULE = join(import.meta.dirname, '../..');
const BACKEND = join(MODULE, '../../custom_components/homebrain/heating');
// Built from parts so this file does not contain the words it forbids.
const TERM = new RegExp(`${'sol'}${'ank'}|${'br'}${'ine'}`, 'i');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (name === 'node_modules' || name === 'dist' || name === '__pycache__') return [];
    const p = join(dir, name);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

describe('owner rules', () => {
  it('modules/heating never names the collector fluid (UI, ids, classes, comments, tests)', () => {
    const hits = files(MODULE).filter((f) => TERM.test(readFileSync(f, 'utf8')) || TERM.test(f));
    expect(hits).toEqual([]);
  });

  it('the backend names it only in the alias/migration table (exactly two lines)', () => {
    const alias = (dir: 'in' | 'out') =>
      `    "heat_pump.${'br'}${'ine'}_${dir}": "heat_pump.collector_${dir}",`;
    const allowed = new Set([`legacy.py:${alias('in')}`, `legacy.py:${alias('out')}`]);
    const hits = files(BACKEND).flatMap((f) => {
      const name = f.slice(BACKEND.length + 1);
      if (TERM.test(name)) return [name];
      return readFileSync(f, 'utf8')
        .split('\n')
        .filter((line) => TERM.test(line))
        .map((line) => `${name}:${line}`);
    });
    expect(hits.filter((h) => !allowed.has(h))).toEqual([]);
    expect(hits.sort()).toEqual([...allowed].sort());
  });

  it('frozen geometry carries no PLC register codes (public repo)', () => {
    const text = JSON.stringify(G);
    expect(text).not.toMatch(/\b[XYR]\d{1,4}(\.\d+)?\b/u);
    expect(text).not.toMatch(/data:image/iu);
  });

  it('keeps the p3i hydraulics: 55 pipes, 2 declared bridges, the on-site questions', () => {
    expect(G.pipes).toHaveLength(55);
    expect(G.bridges.map((b) => b.over).sort()).toEqual(['jbr_to_ground', 'jbyp_to_mix']);
    expect(G.questions.map((q) => q.id)).toEqual(['?1', '?2', '?3', '?4']);
    // one badge per question: ?2 on the cooling valve, ?4 between both cooling branches
    expect(G.badges.map((b) => b.text).sort()).toEqual(['?1', '?2', '?3', '?4']);
    expect(G.badges.find((b) => b.text === '?2')?.of).toBe('valve_cool');
    expect(G.leaders.map((l) => l.of).filter((o) => /chlad|hx_to_jbr/u.test(o))).toEqual([
      'jbs_to_chlad',
      'hx_to_jbr',
    ]);
    // the mixer B leg meets the cooling valve B leg and the exchanger at ONE junction (tee) …
    const jbyp = G.junctions.find((j) => j.id === 'j_byp')!;
    const atJbyp = G.pipes.filter((p) => [p.from, p.to].some((e) => e.startsWith('j_byp.')));
    expect(atJbyp.map((p) => p.id).sort()).toEqual(['hx_to_jbyp', 'jbyp_to_mix', 'vcool_to_jbyp']);
    expect(jbyp).toBeDefined();
    // … and crosses the house return only as a bridge (no connection).
    expect(G.bridges.find((b) => b.over === 'jbyp_to_mix')?.under).toBe('pump_to_jmix');
    // no pool exchanger: tank → pump → floor meander → tank
    expect(G.pipes.find((p) => p.id === 'ppool_to_bottom')?.to).toBe('floor_pool.in');
  });

  it('readout labels outside the cabinet, each next to its own pipe', () => {
    const [x, y, w, h] = G.glyphs.hp as [number, number, number, number];
    for (const k of ['hp_t_out', 'hp_t_in', 'hp_coll_in', 'hp_coll_out']) {
      const [bx, by, bw, bh] = G.labels[k]!.box as [number, number, number, number];
      const inside = bx >= x && bx + bw <= x + w && by >= y && by + bh <= y + h;
      expect(inside, k).toBe(false);
      expect(G.labels[k]!.pipeSensor, k).toBeDefined();
    }
    expect(G.labels.hp_t_out!.lines[0]).toBe('Výstup do topení');
    expect(G.labels.hp_t_in!.lines[0]).toBe('Zpátečka do TČ');
    expect(G.labels.hp_coll_in!.lines[0]).toBe('Z kolektoru');
    expect(G.labels.hp_coll_out!.lines[0]).toBe('Do kolektoru');
  });
});

// CIEDE2000 (sRGB → Lab D65)
function lab(hex: string): [number, number, number] {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = c.map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)) as [
    number,
    number,
    number,
  ];
  const X = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const Y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (v: number) => (v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}
function de2000(hexA: string, hexB: string): number {
  const [L1, a1, b1] = lab(hexA);
  const [L2, a2, b2] = lab(hexB);
  const rad = Math.PI / 180;
  const Cb = (Math.hypot(a1, b1) + Math.hypot(a2, b2)) / 2;
  const G7 = 0.5 * (1 - Math.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7)));
  const a1p = (1 + G7) * a1;
  const a2p = (1 + G7) * a2;
  const C1 = Math.hypot(a1p, b1);
  const C2 = Math.hypot(a2p, b2);
  const h1 = (Math.atan2(b1, a1p) / rad + 360) % 360;
  const h2 = (Math.atan2(b2, a2p) / rad + 360) % 360;
  let dh = h2 - h1;
  if (C1 * C2 === 0) dh = 0;
  else if (dh > 180) dh -= 360;
  else if (dh < -180) dh += 360;
  const dH = 2 * Math.sqrt(C1 * C2) * Math.sin((dh / 2) * rad);
  const Lb = (L1 + L2) / 2;
  const Cbp = (C1 + C2) / 2;
  const hb = Math.abs(h1 - h2) <= 180 ? (h1 + h2) / 2 : (h1 + h2 + 360) / 2;
  const T =
    1 -
    0.17 * Math.cos((hb - 30) * rad) +
    0.24 * Math.cos(2 * hb * rad) +
    0.32 * Math.cos((3 * hb + 6) * rad) -
    0.2 * Math.cos((4 * hb - 63) * rad);
  const dth = 30 * Math.exp(-(((hb - 275) / 25) ** 2));
  const RC = 2 * Math.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7));
  const SL = 1 + (0.015 * (Lb - 50) ** 2) / Math.sqrt(20 + (Lb - 50) ** 2);
  const SC = 1 + 0.045 * Cbp;
  const SH = 1 + 0.015 * Cbp * T;
  const RT = -Math.sin(2 * dth * rad) * RC;
  const dL = (L2 - L1) / SL;
  const dC = (C2 - C1) / SC;
  const dHs = dH / SH;
  return Math.sqrt(dL ** 2 + dC ** 2 + dHs ** 2 + RT * dC * dHs);
}

describe('palette (both themes)', () => {
  for (const theme of ['dark', 'light'] as const) {
    const p = FS_PALETTE[theme];
    it(`${theme}: TUV distinct from heating supply and from the fault colour`, () => {
      expect(de2000(p.dhw, p.heat_supply)).toBeGreaterThanOrEqual(24);
      expect(de2000(p.dhw, p.warn)).toBeGreaterThanOrEqual(25);
    });
    it(`${theme}: compressor glow is not a fault colour and stands out from the plates`, () => {
      expect(de2000(p.glow, p.warn)).toBeGreaterThanOrEqual(24);
      expect(de2000(p.glow, '#b7aa82')).toBeGreaterThanOrEqual(20);
    });
    it(`${theme}: fault colour distinct from solar`, () => {
      // Dark keeps the p3i amber (ΔE ≈ 17 to the solar yellow): the fault is a ring + dark red
      // pill on the valve, never a pipe, so form carries the difference there.
      expect(de2000(p.warn, p.solar)).toBeGreaterThanOrEqual(theme === 'dark' ? 15 : 20);
    });
  }
  it('pool heating uses the heating colours, no extra pool-heating hue', () => {
    expect(G.pipes.find((p) => p.id === 'ppool_to_bottom')?.colour).toBe('heat_supply');
    expect(G.pipes.find((p) => p.id === 'bottom_to_tank')?.colour).toBe('heat_return');
  });
});

/** Polyline vertices of a frozen route (`M`/`L`/`Q`/`A` end points, in drawing order). */
function vertices(d: string): Array<[number, number]> {
  const tok = d.match(/[MLQA]|-?\d+(?:\.\d+)?/gu)!;
  const n: Record<string, number> = { M: 2, L: 2, Q: 4, A: 7 };
  const out: Array<[number, number]> = [];
  let cmd = 'M';
  for (let i = 0; i < tok.length;) {
    if (/[MLQA]/u.test(tok[i]!)) cmd = tok[i++]!;
    const a = tok.slice(i, i + n[cmd]!).map(Number);
    i += n[cmd]!;
    out.push([a.at(-2)!, a.at(-1)!]);
  }
  return out;
}
const ANGLE: Record<string, number> = { r: 0, d: 90, l: 180, u: -90 };
const angle = (a: [number, number], b: [number, number]) =>
  Math.round((Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI);
const ARROW: Record<string, number> = { '→': 0, '↓': 90, '←': 180, '↑': -90 };

describe('flow direction', () => {
  // every route is drawn from → to in the real flow direction (p3i topology)
  it('every chevron points along its own pipe, in the from → to direction', () => {
    const wrong = G.chevrons.flatMap((c) => {
      const v = vertices(G.pipes.find((p) => p.id === c.route)!.d);
      const seg = v.slice(1).findIndex((b, i) => {
        const a = v[i]!;
        const straight = a[0] === b[0] || a[1] === b[1];
        const on =
          c.x >= Math.min(a[0], b[0]) - 1 &&
          c.x <= Math.max(a[0], b[0]) + 1 &&
          c.y >= Math.min(a[1], b[1]) - 1 &&
          c.y <= Math.max(a[1], b[1]) + 1;
        return straight && on;
      });
      if (seg < 0) return [`${c.route}@${c.x},${c.y}: not on its pipe`];
      const dir = angle(v[seg]!, v[seg + 1]!);
      return (((dir - c.angle) % 360) + 360) % 360 === 0 ? [] : [`${c.route}@${c.x},${c.y}`];
    });
    expect(wrong).toEqual([]);
  });

  it('every pump glyph points the way its outlet pipe leaves', () => {
    for (const [k, p] of Object.entries(G.glyphs.pumps)) {
      const out = G.pipes.find((q) => q.from.startsWith(`${k}.`))!;
      const v = vertices(out.d);
      expect(angle(v[0]!, v[1]!), k).toBe(ANGLE[p.dir]);
    }
  });

  it('a label arrow (if any) matches the chevrons of the pipe it names', () => {
    for (const [k, l] of Object.entries(G.labels)) {
      const arrows = [...l.lines.join(' ')].filter((ch) => ch in ARROW);
      if (!arrows.length) continue;
      const route = G.pipes.find((p) => p.id === l.of);
      expect(route, `${k} names a pipe`).toBeDefined();
      const chev = G.chevrons.filter((c) => c.route === route!.id).map((c) => c.angle);
      for (const a of arrows) expect(chev, k).toContain(ARROW[a]);
    }
    // the r2 drawing carries the direction in chevrons only; stub labels are plain words
    const stubs = Object.entries(G.labels).filter(([, l]) => l.stub);
    expect(stubs.length).toBe(3);
    for (const [k, l] of stubs) expect(/[←→↑↓]/u.test(l.lines.join('')), k).toBe(false);
  });

  it('every pipe stub at the tank is named (label, coil card, terminal or adjacent glyph)', () => {
    const named = new Set(
      Object.values(G.labels).flatMap((l) => (l.stub ? l.stub.split(' ') : [])),
    );
    // ports whose pipe reaches a labelled glyph inside every preset that shows the tank
    const byNeighbour: Record<string, string> = {
      'tank.tuv_in': 'valve_dhw',
      'tank.akn_in': 'valve_dhw',
      'tank.ret_mid_out': 'pump_sek',
      'tank.ret_bottom_out': 'pump_sek',
      'tank.solar_in': 'tank_solar_coil',
      'tank.solar_out': 'tank_solar_coil',
      'tank.dhw_out': 'tap',
      'tank.cold_in': 'cold',
    };
    const ports = G.fittings.filter((f) => f.port.startsWith('tank.')).map((f) => f.port);
    expect(ports).toHaveLength(12);
    for (const port of ports) {
      const ok = named.has(port) || (byNeighbour[port] && G.labels[byNeighbour[port]!]);
      expect(ok, port).toBeTruthy();
    }
  });
});

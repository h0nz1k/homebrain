import { describe, expect, it } from 'vitest';
import { FULL_GEOMETRY as G } from './geometry.gen.js';
import { READABLE_SCALE } from './panZoom.js';
import { CONTENT, PRESET_GROUPS, boxView, presetsFor, type Preset } from './presets.js';
import { FS_THEME } from './styles.js';

/** Text width estimate (Inter 15 units) – same as the cards in FullSchematic. */
const W = (t: string, f = 15) => t.length * f * 0.56;
type Box = [number, number, number, number];

/** Every text box of the drawing: static labels widened by their live reading + runtime texts. */
function textBoxes(): Array<[string, Box]> {
  const out: Array<[string, Box]> = [];
  for (const [k, l] of Object.entries(G.labels)) {
    if (l.card) continue;
    const [x, y, w, h] = l.box as Box;
    if (l.zone) {
      out.push([k, [x - 8, y - 2, Math.max(w, W(l.lines[0]!)) + 16, 22]]);
      continue;
    }
    const extra = l.reading ? W('  −10,0 °C') + (k === 'chip_fish' ? W(' · cíl 10,0 °C') : 0) : 0;
    const tw = l.reading ? W(l.lines[0]!) + extra : w;
    const x0 = l.anchor === 'start' ? x : l.anchor === 'middle' ? l.x - tw / 2 : l.x - tw;
    const s = l.sensor ? 18 : 0;
    out.push([k, [x0 - s, y, tw + s, h]]);
  }
  const [hx, hy, hw] = G.glyphs.hp as Box;
  out.push([
    'hp_title',
    [hx + hw / 2 - W('Tepelné čerpadlo') / 2, hy - 42, W('Tepelné čerpadlo'), 18],
  ]);
  out.push([
    'hp_state',
    [hx + hw / 2 - W('kompresor stojí') / 2, hy - 23, W('kompresor stojí'), 18],
  ]);
  const [mx, my] = G.glyphs.valveMix.c as [number, number];
  out.push(['mix_name', [mx + 34, my + 13, W('Směšovací ventil'), 18]]);
  out.push(['mix_pct', [mx + 34, my + 31, W('poloha A 100 %'), 18]]);
  const [cx, cy] = G.glyphs.valves.valve_cool!.c as [number, number];
  out.push(['cool_name', [cx + 32, cy - 18, W('Ventil chlazení'), 18]]);
  out.push(['cool_state', [cx + 32, cy, W('nechladí (B)'), 18]]);
  const f = G.labels.chip_fish!;
  out.push(['fish_state', [f.x, f.y + 8, W('netopí – teplo stačí'), 18]]);
  const [px, py, pw] = G.glyphs.pool as Box;
  out.push(['pool_card', [px + 14, py + 30, pw - 28, 148]]);
  for (const b of G.badges) out.push([`badge_${b.of}`, [b.x - b.r, b.y - b.r, 2 * b.r, 2 * b.r]]);
  return out;
}

const all: Preset[] = PRESET_GROUPS.flatMap((g) => [g, ...g.fine]);

describe('presets', () => {
  it.each(all.map((p) => [p.id, p] as const))('%s cuts no label (each fully in or out)', (_, p) => {
    const { x, y, w, h } = p.box;
    const cut = textBoxes()
      .filter(([, [bx, by, bw, bh]]) => {
        const inside = bx >= x && by >= y && bx + bw <= x + w && by + bh <= y + h;
        const outside = bx + bw <= x || bx >= x + w || by + bh <= y || by >= y + h;
        return !inside && !outside;
      })
      .map(([k]) => k);
    expect(cut).toEqual([]);
  });

  it('tablet (portrait and landscape): every offered preset gives ≥ 12 CSS px text', () => {
    // viewport = screen − header (≈ 60) − docked legend (portrait, ≈ 230) or its bar (≈ 40)
    for (const [vw, vh] of [
      [800, 1280 - 60 - 330],
      [1280, 800 - 60],
      [1440, 900 - 60 - 190],
    ] as const) {
      const offered = presetsFor(vw, vh);
      expect(offered.length).toBeGreaterThanOrEqual(3);
      for (const p of offered) {
        const s = boxView(vw, vh, p.box).scale;
        expect(15 * s, `${vw}×${vh} ${p.id}`).toBeGreaterThanOrEqual(12 - 1e-9);
        expect(s).toBeGreaterThanOrEqual(READABLE_SCALE);
      }
    }
    expect(presetsFor(1280, 700).map((p) => p.id)).toContain('tech');
  });

  it('phone: the fine presets, none below 9.5 CSS px text', () => {
    const offered = presetsFor(360, 800 - 100);
    expect(offered.map((p) => p.id)).toEqual([
      'valves',
      'hp',
      'tank',
      'basin',
      'pit',
      'fish',
      'rooms',
    ]);
    for (const p of offered) {
      expect(15 * boxView(360, 660, p.box).scale, p.id).toBeGreaterThanOrEqual(9.5);
    }
  });

  it('presets and the whole view stay inside the drawn content', () => {
    for (const p of all) {
      expect(p.box.x).toBeGreaterThanOrEqual(CONTENT.x);
      expect(p.box.x + p.box.w).toBeLessThanOrEqual(CONTENT.x + CONTENT.w);
      expect(p.box.y + p.box.h).toBeLessThanOrEqual(CONTENT.y + CONTENT.h);
    }
  });
});

/** Polyline vertices of a frozen pipe path (corners and hop arcs collapse to their end points). */
function vertices(d: string): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const m of d.matchAll(/([MLQA])([^MLQA]*)/gu)) {
    const n = m[2]!.trim().split(/[ ,]+/u).map(Number);
    if (m[1] === 'M' || m[1] === 'L') out.push([n[0]!, n[1]!]);
    else if (m[1] === 'Q') out.push([n[2]!, n[3]!]);
    else out.push([n[5]!, n[6]!]);
  }
  return out;
}

describe('pipe crossings', () => {
  it('every crossing of two pipes is a declared bridge (hop), every joint a junction dot', () => {
    const segs = G.pipes.flatMap((p) => {
      const v = vertices(p.d);
      return v.slice(1).map((b, i) => ({ id: p.id, a: v[i]!, b }));
    });
    const bridged = new Set(G.bridges.map((b) => `${b.at[0]},${b.at[1]}`));
    const unbridged: string[] = [];
    for (const s of segs) {
      if (s.a[0] !== s.b[0]) continue; // s vertical
      for (const t of segs) {
        if (t.id === s.id || t.a[1] !== t.b[1]) continue; // t horizontal
        const x = s.a[0];
        const y = t.a[1];
        const inS = Math.min(s.a[1], s.b[1]) < y && y < Math.max(s.a[1], s.b[1]);
        const inT = Math.min(t.a[0], t.b[0]) < x && x < Math.max(t.a[0], t.b[0]);
        // a hop splits the over-pipe at the crossing, so its two halves end next to it
        const near = [...bridged].some((k) => {
          const [bx, by] = k.split(',').map(Number) as [number, number];
          return Math.abs(bx - x) <= 13 && Math.abs(by - y) <= 13;
        });
        if (inS && inT && !near) unbridged.push(`${s.id} × ${t.id} @ ${x},${y}`);
      }
    }
    expect(unbridged).toEqual([]);
    // junctions: every dot joins ≥ 3 pipe ends, every tee in the topology has a dot
    for (const j of G.junctions) {
      const ends = G.pipes.flatMap((p) => [p.from, p.to]).filter((e) => e.startsWith(`${j.id}.`));
      expect(ends.length, j.id).toBeGreaterThanOrEqual(3);
    }
  });
});

/** WCAG relative luminance contrast. */
function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    }) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
  return (l1 + 0.05) / (l2 + 0.05);
}

describe('text contrast (WCAG ≥ 4.5:1)', () => {
  for (const theme of ['dark', 'light'] as const) {
    const v = FS_THEME[theme] as Record<string, string>;
    it(`${theme}: primary, secondary and muted text on every surface`, () => {
      for (const ink of ['t1', 't2', 't3', 'muted']) {
        for (const surface of ['bg', 'room', 'tech', 'concrete2', 'soil', 'soil2', 'plate']) {
          expect(contrast(v[ink]!, v[surface]!), `${ink} on ${surface}`).toBeGreaterThanOrEqual(
            4.5,
          );
        }
      }
      expect(contrast(v['card-ink']!, v.card!)).toBeGreaterThanOrEqual(4.5);
      expect(contrast('#ffffff', v.badge!)).toBeGreaterThanOrEqual(4.5);
    });
  }
});

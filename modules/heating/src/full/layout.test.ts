import { describe, expect, it } from 'vitest';
import { buildMockSnapshot } from '../mock.js';
import { endLabels, farEnd } from './endLabels.js';
import { END_AVOID } from './FullSchematic.js';
import { fullState } from './fullState.js';
import { FULL_GEOMETRY as G } from './geometry.gen.js';
import { OVERVIEW_BELOW, OV_FONT, OV_VALUE, overviewBounds } from './overview.js';
import { READABLE_SCALE, fitView } from './panZoom.js';
import { LABEL_FONT, VALUE_FONT } from './pill.js';
import { CONTENT, PRESET_GROUPS, boxView, presetsFor, type Preset } from './presets.js';
import { FS_PALETTE, FS_THEME, stillOf } from './styles.js';

const all: Preset[] = PRESET_GROUPS.flatMap((g) => (g.alwaysFine ? g.fine : [g, ...g.fine]));

// Whether a preset cuts a label is checked in the browser on the real text boxes
// (tests/e2e/heating-full.spec.ts) – estimates here would only drift from the rendering.
describe('presets', () => {
  it('tablet (portrait and landscape) and desktop: every offered preset ≥ 12 CSS px text', () => {
    // viewport = screen − header (≈ 60); the legend is a drawer over the drawing (r3)
    for (const [vw, vh] of [
      [800, 1280 - 60],
      [1280, 800 - 60],
      [1440, 900 - 60],
      [1920, 1080 - 60],
    ] as const) {
      const offered = presetsFor(vw, vh);
      expect(offered.length).toBeGreaterThanOrEqual(3);
      for (const p of offered) {
        const s = boxView(vw, vh, p.box).scale;
        expect(LABEL_FONT * s, `${vw}×${vh} ${p.id}`).toBeGreaterThanOrEqual(12 - 1e-9);
        expect(s).toBeGreaterThanOrEqual(READABLE_SCALE);
      }
    }
    expect(presetsFor(1920, 1020).map((p) => p.id)).toContain('tech');
  });

  it('phone: the fine presets, labels ≥ 11 CSS px and values ≥ 12 CSS px', () => {
    // 360 × 800 minus the two-row header (≈ 130 px)
    const offered = presetsFor(360, 800 - 130);
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
      const s = boxView(360, 670, p.box).scale;
      expect(LABEL_FONT * s, p.id).toBeGreaterThanOrEqual(11);
      expect(VALUE_FONT * s, p.id).toBeGreaterThanOrEqual(12);
    }
  });

  it('presets and the whole view stay inside the drawn content', () => {
    for (const p of all) {
      expect(p.box.x).toBeGreaterThanOrEqual(CONTENT.x);
      expect(p.box.x + p.box.w).toBeLessThanOrEqual(G.canvas[0]! + 1);
      expect(p.box.y + p.box.h).toBeLessThanOrEqual(CONTENT.y + CONTENT.h);
    }
  });
});

describe('overview (whole drawing on a desktop)', () => {
  it.each([
    [1440, 900],
    [1920, 1080],
  ])('%i × %i: labels ≥ 13 CSS px, values ≥ 14 CSS px', (vw, vh) => {
    const st = fullState(buildMockSnapshot('heating', 0, Date.parse('2026-01-12T10:00:00Z')));
    const b = overviewBounds(st);
    const s = fitView(vw, vh - 60, b, 12).scale;
    expect(s).toBeLessThan(OVERVIEW_BELOW);
    expect(OV_FONT * s).toBeGreaterThanOrEqual(13);
    expect(OV_VALUE * s).toBeGreaterThanOrEqual(14);
    // the overview fills the box: no more than a quarter of its height left empty
    expect((b.h * s) / (vh - 60 - 24)).toBeGreaterThanOrEqual(0.75);
  });
});

describe('end labels', () => {
  it('every pipe leaving a preset frame has an end label naming equipment outside it', () => {
    for (const p of all) {
      const labels = endLabels(G.pipes, p.box, END_AVOID, G.boxes);
      const named = new Set(labels.flatMap((l) => l.pipe.split(' ')));
      const leaving = G.pipes.filter(
        (q) =>
          q.pts.some(
            (pt) =>
              !(
                pt[0]! > p.box.x &&
                pt[0]! < p.box.x + p.box.w &&
                pt[1]! > p.box.y &&
                pt[1]! < p.box.y + p.box.h
              ),
          ) &&
          q.pts.some(
            (pt) =>
              pt[0]! > p.box.x &&
              pt[0]! < p.box.x + p.box.w &&
              pt[1]! > p.box.y &&
              pt[1]! < p.box.y + p.box.h,
          ),
      );
      for (const q of leaving) expect(named.has(q.id), `${p.id}: ${q.id}`).toBe(true);
      for (const l of labels) expect(l.text).not.toContain('…');
    }
  });
  it('far end follows the circuit past pumps and tees', () => {
    expect(farEnd(G.pipes, 'tank_to_ppool', 'pump_pool')).toBe('bazén');
    expect(farEnd(G.pipes, 'hp_to_jbr', 'j_coll_r')).toBe('zemní kolektor');
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

describe('pipe contrast (WCAG ≥ 3:1 for graphics)', () => {
  for (const theme of ['dark', 'light'] as const) {
    const v = FS_THEME[theme] as Record<string, string>;
    it(`${theme}: every circuit colour, its standing tone and the grey states on every surface`, () => {
      const p = FS_PALETTE[theme] as Record<string, string>;
      const strokes = Object.entries(p)
        .filter(([k]) => !['warn', 'glow'].includes(k))
        .flatMap(([k, c]) => [
          [k, c],
          [`${k} (stojí)`, stillOf(c)],
        ]);
      strokes.push(['closed', v.neutral!], ['off', v.inactive!]);
      for (const [k, c] of strokes) {
        for (const surface of ['bg', 'room', 'tech', 'concrete2', 'soil', 'soil2']) {
          expect(contrast(c!, v[surface]!), `${k} on ${surface}`).toBeGreaterThanOrEqual(3);
        }
      }
    });
  }
});

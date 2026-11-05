import { describe, expect, it } from 'vitest';
import {
  allocateFlows,
  DIR_GAP,
  FLOW_PAIRS,
  laneDir,
  laneOffsets,
  linkLanes,
  type FlowInput,
  type FlowPairId,
} from '../flow.js';
import { boxCircleGap, boxesHit, type Box } from '../flowLabels.js';
import {
  COMPACT,
  laneBox,
  laneChevrons,
  labelObstacles,
  laneSegments,
  pairRoute,
  routeSamples,
  WIDE,
} from './EnergyFlowHero.js';

/*
 * Review 003 model: no value on a wire. Node text blocks (conservative LABEL_PX boxes) must stay
 * clear of every drawn lane and arrowhead at the real stage sizes of 320 / 390 px phones
 * (compact) and 768 / 1280 px screens (wide).
 */
const STAGES = [
  { L: COMPACT, vw: 320, px: 258 },
  { L: COMPACT, vw: 390, px: 328 },
  { L: WIDE, vw: 768, px: 690 },
  { L: WIDE, vw: 1280, px: 1080 },
];

const SCENES: Record<string, FlowInput> = {
  noon: { pv: 5.7, battery: -1.4, house: 3.62, gridImport: 0, gridExport: 0.68 },
  evening: { pv: 0.08, battery: 1.86, house: 1.94, gridImport: 0, gridExport: 0 },
  nightcharge: { pv: 0, battery: -2.5, house: 0.48, gridImport: 2.98, gridExport: 0 },
  mixed: { pv: 4.2, battery: -0.6, house: 2.3, gridImport: 0.8, gridExport: 2.1 },
  dischargeExport: { pv: 0, battery: 3, house: 1, gridImport: 0, gridExport: 2 },
  chargeBoth: { pv: 1, battery: -2, house: 0.5, gridImport: 1.5, gridExport: 0 },
  morning: { pv: 0.6, battery: 0, house: 3.2, gridImport: 2.7, gridExport: 0.1 },
};

function scene(name: string) {
  const alloc = allocateFlows(SCENES[name]!)!;
  const pairs = FLOW_PAIRS.map((id) => alloc.pairs[id]).filter((p) => p.active);
  return { pairs, lanes: linkLanes(pairs.map((p) => p.id)) };
}

describe('flow lanes: one line per source and direction', () => {
  it('the sun has ONE line to the inverter, whatever it feeds', () => {
    for (const name of ['noon', 'mixed']) {
      const { lanes } = scene(name);
      expect(lanes['pv-hub']).toEqual(['pv']);
    }
  });

  it('battery: charging lanes by source, discharge on the other side with a wider gap', () => {
    const { lanes } = scene('chargeBoth');
    expect(lanes['battery-hub']).toEqual(['pv-battery', 'grid-battery']);
    const off = laneOffsets(lanes, 'battery-hub');
    expect(off['grid-battery']! - off['pv-battery']!).toBeCloseTo(1);
    const both = linkLanes(['pv-battery', 'battery-house'] as FlowPairId[]);
    const o2 = laneOffsets(both, 'battery-hub');
    expect(laneDir('battery-hub', 'pv-battery')).toBe(-1);
    expect(laneDir('battery-hub', 'battery')).toBe(1);
    expect(o2.battery! - o2['pv-battery']!).toBeCloseTo(DIR_GAP);
  });

  it('grid: export and import are separate lanes, import merged until the board', () => {
    const { lanes } = scene('mixed');
    expect(lanes['grid-ac']).toEqual(['pv-grid', 'grid']);
    expect(laneDir('grid-ac', 'pv-grid')).toBe(-1);
    expect(laneDir('grid-ac', 'grid')).toBe(1);
    expect(scene('nightcharge').lanes['grid-ac']).toEqual(['grid']);
  });

  it('inverter lanes leave the board at one height on both sides (no step)', () => {
    for (const name of ['noon', 'mixed', 'morning', 'dischargeExport']) {
      const { lanes } = scene(name);
      const g = laneOffsets(lanes, 'grid-ac');
      const h = laneOffsets(lanes, 'ac-house');
      const gInv = lanes['grid-ac'].filter((k) => k !== 'grid');
      const hInv = lanes['ac-house'].filter((k) => k !== 'grid-house');
      if (gInv.length && hInv.length) expect(g[gInv[0]!], name).toBeCloseTo(h[hInv[0]!]!);
      // Export and import keep the wider direction gap.
      if (gInv.length && g.grid !== undefined)
        expect(g.grid - g[gInv[gInv.length - 1]!]!, name).toBeCloseTo(DIR_GAP);
    }
  });

  it('grid → house runs straight through the board', () => {
    for (const name of Object.keys(SCENES)) {
      const { lanes } = scene(name);
      if (!lanes['ac-house'].includes('grid-house')) continue;
      for (const L of [COMPACT, WIDE]) {
        const pts = pairRoute(L, 'grid-house', lanes).pts;
        expect(new Set(pts.map((p) => p.y)).size, `${name} ${L.name}`).toBe(1);
      }
    }
  });
});

describe('labels never sit on a line (320 / 390 / 768 / 1280 px)', () => {
  for (const name of Object.keys(SCENES))
    it(name, () => {
      const { pairs, lanes } = scene(name);
      const issues: string[] = [];
      for (const { L, vw, px } of STAGES) {
        const k = px / L.w;
        const obs = labelObstacles(L, k);
        const pad = 2 / k;
        const segs = laneSegments(L, pairs, lanes);
        const chevs = laneChevrons(L, pairs, lanes);
        const curves = pairs.map((p) => ({
          id: p.id,
          pts: routeSamples(L, pairRoute(L, p.id, lanes).pts),
        }));
        const ids = ['pv', 'grid', 'battery', 'house', 'hub'] as const;
        obs.boxes.forEach((b: Box, i) => {
          for (const s of segs)
            if (boxesHit(b, laneBox(s, pad))) issues.push(`${vw}: ${ids[i]} label × ${s.id}`);
          for (const c of curves)
            if (c.pts.some((p) => p.x > b.x0 && p.x < b.x1 && p.y > b.y0 && p.y < b.y1))
              issues.push(`${vw}: ${ids[i]} label × curve ${c.id}`);
          for (const c of chevs)
            if (boxesHit(b, { x0: c.x - c.s, y0: c.y - c.s, x1: c.x + c.s, y1: c.y + c.s }, pad))
              issues.push(`${vw}: ${ids[i]} label × arrow ${c.link}/${c.key}`);
        });
        for (const c of chevs)
          for (const d of obs.circles)
            if (boxCircleGap({ x0: c.x - c.s, y0: c.y - c.s, x1: c.x + c.s, y1: c.y + c.s }, d) < 0)
              issues.push(`${vw}: arrow ${c.link}/${c.key} in a disc`);
      }
      expect([...new Set(issues)].join('\n')).toBe('');
    });

  it('arrowheads on every drawn flow; lanes on one link never overlap', () => {
    for (const name of Object.keys(SCENES)) {
      const { pairs, lanes } = scene(name);
      for (const L of [COMPACT, WIDE]) {
        const chevs = laneChevrons(L, pairs, lanes);
        expect(chevs.length, name).toBeGreaterThanOrEqual(
          Object.values(lanes).filter((l) => l.length).length,
        );
        for (const link of Object.keys(lanes) as (keyof typeof lanes)[]) {
          const off = Object.values(laneOffsets(lanes, link)).sort((a, b) => a! - b!) as number[];
          for (let i = 1; i < off.length; i++)
            expect(off[i]! - off[i - 1]!).toBeGreaterThanOrEqual(1 - 1e-9);
        }
      }
    }
  });
});

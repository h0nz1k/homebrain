import { describe, expect, it } from 'vitest';
import {
  allocateFlows,
  FLOW_PAIRS,
  linkLanes,
  PAIR_LINKS,
  type FlowAllocation,
  type FlowPairId,
} from '../flow.js';
import {
  COMPACT,
  WIDE,
  boardConductors,
  boardHalf,
  junctionAt,
  laneEndR,
  pairRoute,
  routeSamples,
  stringTexts,
} from './EnergyFlowHero.js';

const BOARD_LINKS = ['hub-ac', 'grid-ac', 'ac-house'] as const;
const through = (id: FlowPairId) =>
  PAIR_LINKS[id].filter((l) => (BOARD_LINKS as readonly string[]).includes(l)).length >= 2;

describe('AC board (rozvaděč) wiring', () => {
  const sets: FlowPairId[][] = [
    ['pv-house', 'grid-house'], // owner's 14:06 case
    ['grid-house', 'grid-battery'], // night grid charging
    ['pv-house', 'pv-grid', 'grid-house'],
    ['pv-house', 'pv-battery', 'pv-grid', 'grid-house', 'grid-battery'],
    ['pv-house', 'pv-grid', 'grid-house', 'battery-house', 'battery-grid'],
    ...FLOW_PAIRS.map((id) => [id]),
  ];

  it('every flow crossing the board passes over the board plate', () => {
    for (const L of [COMPACT, WIDE])
      for (const ids of sets) {
        const lanes = linkLanes(ids);
        const J = junctionAt(L);
        for (const id of ids) {
          const pts = routeSamples(L, pairRoute(L, id, lanes).pts, 1);
          const inPlate = pts.some(
            (p) =>
              Math.abs(p.x - J.x) <= boardHalf(L, boardConductors(lanes)) &&
              Math.abs(p.y - J.y) <= boardHalf(L, boardConductors(lanes)),
          );
          expect(inPlate, `${L.name} ${ids.join(',')} → ${id}`).toBe(through(id));
        }
      }
  });

  it('board corners (incl. their rounded arc) stay inside the plate – no kink outside it', () => {
    // 360 px phone: a 6-unit fillet on the ±5 conductor reached 1 unit past the 10-unit plate,
    // so the active conductor bent visibly before/after the rozvaděč.
    for (const L of [COMPACT, WIDE])
      for (const ids of sets) {
        const lanes = linkLanes(ids);
        const J = junctionAt(L);
        const half = boardHalf(L, boardConductors(lanes));
        for (const id of ids)
          for (const p of pairRoute(L, id, lanes).pts) {
            const onBoard = Math.abs(p.x - J.x) <= half && Math.abs(p.y - J.y) <= half;
            if (!onBoard || !p.r) continue;
            const reach = Math.max(Math.abs(p.x - J.x), Math.abs(p.y - J.y)) + p.r;
            expect(reach, `${L.name} ${ids.join(',')} → ${id}`).toBeLessThanOrEqual(half + 0.01);
          }
      }
  });

  it('inverter flows turn at the board: the vertical AC leg ends inside the plate', () => {
    for (const L of [COMPACT, WIDE]) {
      const J = junctionAt(L);
      for (const id of ['pv-house', 'grid-battery', 'pv-grid', 'battery-house'] as const) {
        const { pts } = pairRoute(L, id, linkLanes([id]));
        const corner = pts.find(
          (p) => Math.abs(p.y - J.y) <= L.gap && Math.abs(p.x - J.x) <= L.gap,
        );
        expect(corner, `${L.name} ${id}`).toBeDefined();
      }
    }
  });

  it('parallel conductors keep their spacing and never cross (outside the node discs)', () => {
    for (const L of [COMPACT, WIDE]) {
      const discs = (['pv', 'grid', 'battery', 'house', 'hub'] as const).map((n) => ({
        c: L.nodes[n],
        r: n === 'hub' ? L.hubR + 6 : n === 'battery' ? L.r + 7 : L.r + 1,
      }));
      const free = (p: { x: number; y: number }) =>
        discs.every((d) => Math.hypot(p.x - d.c.x, p.y - d.c.y) > d.r);
      for (const ids of sets) {
        const lanes = linkLanes(ids);
        const routes = ids.map((id) => ({
          id,
          pts: routeSamples(L, pairRoute(L, id, lanes).pts, 1).filter(free),
        }));
        for (let i = 0; i < routes.length; i++)
          for (let j = i + 1; j < routes.length; j++) {
            let min = Infinity;
            for (const p of routes[i]!.pts)
              for (const q of routes[j]!.pts) min = Math.min(min, Math.hypot(p.x - q.x, p.y - q.y));
            expect(min, `${L.name} ${routes[i]!.id} × ${routes[j]!.id}`).toBeGreaterThan(
              L.gap - 0.8,
            );
          }
      }
    }
  });

  it('the inverter flow into the house runs above the grid flow, parallel to the house', () => {
    for (const L of [COMPACT, WIDE]) {
      const lanes = linkLanes(['pv-house', 'grid-house']);
      const pv = pairRoute(L, 'pv-house', lanes).pts;
      const grid = pairRoute(L, 'grid-house', lanes).pts;
      expect(pv.at(-1)!.y).toBeLessThan(grid.at(-1)!.y);
      expect(pv.at(-1)!.x).toBeCloseTo(grid.at(-1)!.x, 0);
    }
  });

  it('wire ends touch the node edge (disc, SoC ring, inverter ring) – no gap', () => {
    for (const L of [COMPACT, WIDE])
      for (const ids of sets) {
        const lanes = linkLanes(ids);
        for (const id of ids) {
          const { pts } = pairRoute(L, id, lanes);
          const [from, to] = id.split('-') as [
            'pv' | 'grid' | 'battery',
            'house' | 'grid' | 'battery',
          ];
          for (const [node, p] of [
            [from, pts[0]!],
            [to, pts.at(-1)!],
          ] as const) {
            const c = L.nodes[node];
            const R = node === 'battery' ? L.r + 6 : L.r;
            const d = Math.hypot(p.x - c.x, p.y - c.y);
            expect(d, `${L.name} ${id} @${node}`).toBeLessThanOrEqual(R);
            expect(d, `${L.name} ${id} @${node}`).toBeGreaterThanOrEqual(R - 1.5);
          }
        }
      }
    expect(laneEndR(COMPACT, 'grid')).toBe(COMPACT.r - 1);
    expect(laneEndR(COMPACT, 'battery')).toBe(COMPACT.r + 5);
  });
});

const sum = (a: FlowAllocation, ids: FlowPairId[]) =>
  Math.round(ids.reduce((t, id) => t + a.pairs[id].displayKw, 0) * 10) / 10;

describe('displayed values add up', () => {
  it("owner's 14:06 case: grid node = its line into the house, house = sun + grid", () => {
    // Net meter 0.78 kW (label used to say 0,8), phase sum 0.73 kW feeds the lines (0,7).
    const a = allocateFlows({ pv: 0.27, gridImport: 0.73, gridExport: 0, battery: 0, house: 1.0 })!;
    expect(a.display).not.toBeNull();
    expect(a.display!.gridImport).toBe(a.pairs['grid-house'].displayKw);
    expect(a.display!.pv).toBe(a.pairs['pv-house'].displayKw);
    expect(a.display!.house).toBe(1);
    expect(a.display!.pv + a.display!.gridImport).toBeCloseTo(a.display!.house, 9);
    expect(stringTexts([0.14, 0.13], a.display!.pv)).toEqual(['0,2', '0,1']);
  });

  it('PV strings fall back to their own rounding when they disagree with the total', () => {
    expect(stringTexts([1.0, 1.0], 3.1)).toEqual(['1,0', '1,0']);
    expect(stringTexts([null, 0.4], 0.4)).toEqual(['–', '0,4']);
  });

  it('matrix: every node total = sum of its displayed lines, within 0.1 kW of the reading', () => {
    const vals = [0, 0.04, 0.13, 0.27, 0.35, 0.76, 1.05, 2.449, 3.62, 7.95];
    let checked = 0;
    for (const pv of vals)
      for (const bat of [-2.45, -0.27, 0, 0.14, 1.86])
        for (const [imp, exp] of [
          [0, 0],
          [0.73, 0],
          [2.65, 0],
          [0, 0.76],
          [0.8, 2.05],
        ] as const)
          for (const noise of [0, 0.03, -0.04]) {
            const house = pv + imp + Math.max(0, bat) - exp - Math.max(0, -bat) + noise;
            if (house < 0) continue;
            const a = allocateFlows({ pv, battery: bat, gridImport: imp, gridExport: exp, house })!;
            const d = a.display;
            if (!d) continue;
            checked++;
            const tag = JSON.stringify({ pv, bat, imp, exp, house });
            expect(d.pv, tag).toBe(sum(a, ['pv-house', 'pv-battery', 'pv-grid']));
            expect(d.gridImport, tag).toBe(sum(a, ['grid-house', 'grid-battery']));
            expect(d.gridExport, tag).toBe(sum(a, ['pv-grid', 'battery-grid']));
            expect(d.house, tag).toBe(sum(a, ['pv-house', 'grid-house', 'battery-house']));
            expect(Math.abs(d.pv - pv), tag).toBeLessThanOrEqual(0.1 + 1e-6);
            expect(Math.abs(d.gridImport - imp), tag).toBeLessThanOrEqual(0.1 + 1e-6);
            expect(Math.abs(d.house - house), tag).toBeLessThanOrEqual(0.1 + 1e-6);
            // Inactive pairs never take a display unit.
            for (const id of FLOW_PAIRS)
              if (!a.pairs[id].active) expect(a.pairs[id].displayKw, `${tag} ${id}`).toBe(0);
          }
    expect(checked).toBeGreaterThan(400);
  });
});

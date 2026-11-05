import { describe, expect, it } from 'vitest';
import { allocateFlows, FLOW_PAIRS, linkLanes, PAIR_LINKS, type FlowPairId } from '../flow.js';
import { boxCircleGap, boxesHit, type Box } from '../flowLabels.js';
import {
  COMPACT,
  flowLabelLayout,
  flowMarkBoxes,
  laneBox,
  laneSegments,
  pairRoute,
  routeSamples,
  WIDE,
  type FlowMark,
} from './EnergyFlowHero.js';

type P = { id: FlowPairId; kw: number; displayKw: number };

/** Stage widths (CSS px) per viewport: phones 320/360/390/430 (compact) and desktop (wide). */
const STAGES = [
  { L: COMPACT, px: [258, 298, 328, 368] },
  { L: WIDE, px: [640, 900, 1080] },
];
const src = (id: FlowPairId) => id.split('-')[0]!;

function layouts(pairs: P[]) {
  const lanes = linkLanes(pairs.map((p) => p.id));
  return STAGES.flatMap(({ L, px }) =>
    px.map((w) => {
      const k = w / L.w;
      return {
        L,
        k,
        lanes,
        marks: flowLabelLayout(L, pairs, lanes, k),
        segs: laneSegments(L, pairs, lanes),
        tag: `${L.name}@${w}px [${pairs.map((p) => `${p.id}=${p.displayKw}`).join(' ')}]`,
      };
    }),
  );
}

/** Collisions: pill × pill / arrowhead / any drawn lane, arrowhead × arrowhead, discs ≥ 8 px. */
function collisions(pairs: P[]) {
  const issues: string[] = [];
  for (const { L, k, lanes, marks, tag } of layouts(pairs)) {
    const discs = (['pv', 'grid', 'battery', 'house', 'hub'] as const).map((id) => ({
      id,
      cx: L.nodes[id].x,
      cy: L.nodes[id].y,
      r: id === 'hub' ? L.hubR + 5 : id === 'battery' ? L.r + 7 : L.r,
    }));
    const routes = pairs.map((p) => ({
      p,
      pts: routeSamples(L, pairRoute(L, p.id, lanes).pts),
      hw: (2.4 + Math.min(5, p.kw) * 0.72) * (L.r / 38) * 0.5,
    }));
    const boxes = pairs.map((p) => ({ id: p.id, m: marks[p.id] as FlowMark | undefined }));
    for (const [i, { id, m }] of boxes.entries()) {
      if (!m) {
        issues.push(`${tag}: ${id} has no pill`);
        continue;
      }
      if (m.collides) issues.push(`${tag}: ${id} collides`);
      if (m.font < 11) issues.push(`${tag}: ${id} font ${m.font}`);
      if (!m.chev) issues.push(`${tag}: ${id} has no arrowhead`);
      const a = flowMarkBoxes(m);
      if (a.pill.x0 < 0 || a.pill.y0 < 0 || a.pill.x1 > L.w || a.pill.y1 > L.h)
        issues.push(`${tag}: ${id} pill leaves the stage`);
      for (const d of discs) {
        const gapPx = boxCircleGap(a.pill, d) * k;
        if (gapPx < 8) issues.push(`${tag}: ${id} pill ${gapPx.toFixed(1)} px from ${d.id}`);
        if (a.chev && boxCircleGap(a.chev, d) < 0)
          issues.push(`${tag}: ${id} arrowhead in ${d.id}`);
      }
      if (a.chev && boxesHit(a.pill, a.chev))
        issues.push(`${tag}: ${id} pill covers its arrowhead`);
      // Lanes: a pill on its line covers only its own straight piece; otherwise no lane at all.
      for (const r of routes)
        for (const p of r.pts) {
          if (r.p.id === id && m.side === 'on') continue;
          const inside =
            p.x > a.pill.x0 - r.hw &&
            p.x < a.pill.x1 + r.hw &&
            p.y > a.pill.y0 - r.hw &&
            p.y < a.pill.y1 + r.hw;
          if (inside) {
            issues.push(`${tag}: ${id} pill on the lane of ${r.p.id}`);
            break;
          }
        }
      for (const { id: o, m: n } of boxes.slice(i + 1)) {
        if (!n) continue;
        const b = flowMarkBoxes(n);
        const hits =
          boxesHit(a.pill, b.pill) ||
          (a.chev && (boxesHit(a.chev, b.pill) || (b.chev && boxesHit(a.chev, b.chev)))) ||
          (b.chev && boxesHit(a.pill, b.chev));
        if (hits) issues.push(`${tag}: ${id} × ${o}`);
      }
    }
  }
  return issues;
}

/**
 * Attribution: one pill per flow in its own colour, on one of its own legs; inverter flows above
 * the AC bus, grid flows below it; beside a bundle the closest lane of the pill's colour is the
 * flow's own; the arrowhead sits on the flow's own lane and points along it.
 */
function attribution(pairs: P[]) {
  const issues: string[] = [];
  for (const { L, marks, segs, tag } of layouts(pairs)) {
    for (const p of pairs) {
      const m = marks[p.id];
      if (!m) continue;
      if (!PAIR_LINKS[p.id].includes(m.link)) issues.push(`${tag}: ${p.id} on foreign ${m.link}`);
      const seg = segs.find((s) => s.id === p.id && s.link === m.link);
      if (!seg) {
        issues.push(`${tag}: ${p.id} pill on a hidden leg`);
        continue;
      }
      const bus = m.link === 'ac-house' || m.link === 'grid-ac';
      if (bus && m.side !== 'on' && m.side !== (src(p.id) === 'grid' ? 'below' : 'above'))
        issues.push(`${tag}: ${p.id} ${m.side} the bus`);
      if (m.side === 'on' && segs.filter((s) => s.link === m.link).length > 1)
        issues.push(`${tag}: ${p.id} on a shared line`);
      // Pill along the visible span of its own lane (centre within the lane's extent).
      const along = seg.horiz ? m.x : m.y;
      if (along < seg.lo - 0.5 || along > seg.hi + 0.5)
        issues.push(`${tag}: ${p.id} pill past its lane`);
      const { pill, chev } = flowMarkBoxes(m);
      const dist = (s: (typeof segs)[number]) => {
        const b = laneBox(s);
        const dx = Math.max(0, b.x0 - pill.x1, pill.x0 - b.x1);
        const dy = Math.max(0, b.y0 - pill.y1, pill.y0 - b.y1);
        return Math.hypot(dx, dy);
      };
      // The closest line of the pill's colour belongs to the flow itself (any of its legs).
      const others = segs.filter((s) => s.id !== p.id && src(s.id) === src(p.id));
      const ownNearest = Math.min(...segs.filter((s) => s.id === p.id).map(dist));
      if (ownNearest > Math.min(Infinity, ...others.map(dist)) + 0.5)
        issues.push(`${tag}: ${p.id} pill nearer another ${src(p.id)} lane than its own`);
      // Beside the line: next to its lane (≤ arrowhead + 3 px + the other lanes of the bundle).
      if (m.side !== 'on' && dist(seg) > L.gap * 4 + 24)
        issues.push(`${tag}: ${p.id} pill far off`);
      if (m.chev) {
        const [ca, cc] = seg.horiz ? [m.chev.x, m.chev.y] : [m.chev.y, m.chev.x];
        if (Math.abs(cc - seg.c) > 0.01 || ca < seg.lo || ca > seg.hi)
          issues.push(`${tag}: ${p.id} arrowhead off its own lane`);
        if (Math.abs(m.chev.deg - seg.deg) > 0.01) issues.push(`${tag}: ${p.id} arrowhead turned`);
        void chev;
      }
    }
  }
  return issues;
}

const check = (pairs: P[]) => [...collisions(pairs), ...attribution(pairs)];

const fromAlloc = (input: Parameters<typeof allocateFlows>[0], digits?: number): P[] => {
  const a = allocateFlows(input);
  if (!a) return [];
  return FLOW_PAIRS.map((id) => a.pairs[id])
    .filter((p) => p.active)
    .map((p) => ({ id: p.id, kw: p.kw, displayKw: digits ?? p.displayKw }));
};

describe('flow value pills', () => {
  it('prod rc.13 case: Slunce 0,6 · střídač 0,6 · síť 2,7/0,1 · dům 3,2 (střídač → dům 0,5)', () => {
    const prod: P[] = [
      { id: 'pv-house', kw: 0.5, displayKw: 0.5 },
      { id: 'pv-grid', kw: 0.1, displayKw: 0.1 },
      { id: 'grid-house', kw: 2.7, displayKw: 2.7 },
    ];
    for (const { marks, tag, L, k } of layouts(prod)) {
      // Shared bus into the house: inverter flow above the line, grid flow below it.
      expect(marks['pv-house'].link, tag).toBe('ac-house');
      expect(marks['pv-house'].side, tag).toBe('above');
      expect(marks['grid-house'].link, tag).toBe('ac-house');
      expect(marks['grid-house'].side, tag).toBe('below');
      expect(marks['pv-grid'].link, tag).toBe('grid-ac');
      expect(marks['pv-grid'].side, tag).toBe('above');
      // Horizontally on the free part between the junction and the house disc.
      for (const id of ['pv-house', 'grid-house'] as const) {
        expect(marks[id].x, tag).toBeGreaterThan(L.nodes.hub.x);
        expect(marks[id].x + marks[id].w / 2, tag).toBeLessThan(L.nodes.house.x - L.r - 8 / k);
      }
      // Full size from 360 px phones up.
      if (L.name === 'wide' || k * L.w >= 298)
        expect(
          Object.values(marks).every((m) => m.font === 13),
          tag,
        ).toBe(true);
    }
    expect(check(prod)).toEqual([]);
    expect(
      check(fromAlloc({ pv: 0.6, battery: 0, gridImport: 2.7, gridExport: 0.1, house: 3.2 })),
    ).toEqual([]);
  });

  it('single flow on its own leg: pill on the line, arrowhead next to it', () => {
    for (const { marks, tag } of layouts([{ id: 'grid-house', kw: 2.6, displayKw: 2.6 }])) {
      expect(marks['grid-house'].side, tag).toBe('on');
      expect(marks['grid-house'].chev, tag).not.toBeNull();
    }
  });

  it('matrix of physical flow combinations × widths, short and long values (12,4 kW)', () => {
    const issues: string[] = [];
    let cases = 0;
    for (const pv of [0, 0.6, 3.1, 12.4])
      for (const battery of [-12.4, -1.4, 0, 0.6, 12.4])
        for (const [imp, exp] of [
          [0, 0],
          [2.6, 0],
          [12.4, 0],
          [0, 2.1],
          [0, 12.4],
          [2.7, 0.1],
          [0.8, 2.1],
        ] as const) {
          const house = pv + imp + Math.max(0, battery) - exp - Math.max(0, -battery);
          if (house < 0) continue;
          for (const digits of [undefined, 12.4]) {
            const pairs = fromAlloc(
              { pv, battery, gridImport: imp, gridExport: exp, house },
              digits,
            );
            if (!pairs.length) continue;
            cases++;
            issues.push(...check(pairs));
          }
        }
    expect(cases).toBeGreaterThan(100);
    expect(issues.slice(0, 20)).toEqual([]);
  });

  it('worst physical sets (5 flows, all 12,4 kW) fit every width', () => {
    // Charging and discharging exclude each other: these are the most crowded sets.
    const sets: FlowPairId[][] = [
      ['pv-house', 'pv-battery', 'pv-grid', 'grid-house', 'grid-battery'],
      ['pv-house', 'pv-grid', 'grid-house', 'battery-house', 'battery-grid'],
    ];
    for (const ids of sets)
      expect(check(ids.map((id) => ({ id, kw: 12.4, displayKw: 12.4 })))).toEqual([]);
  });

  it('boxes helpers', () => {
    const a: Box = { x0: 0, y0: 0, x1: 10, y1: 10 };
    expect(boxesHit(a, { x0: 11, y0: 0, x1: 12, y1: 1 })).toBe(false);
    expect(boxesHit(a, { x0: 11, y0: 0, x1: 12, y1: 1 }, 2)).toBe(true);
    expect(boxCircleGap(a, { cx: 15, cy: 5, r: 3 })).toBeCloseTo(2);
  });
});

import type { Rect } from './panZoom.js';
import type { GeoPipe } from './types.js';

/**
 * End labels of a preset frame (pure, r3): every pipe that leaves the visible box gets a short
 * "where it goes" label at the frame edge instead of being cut silently. The far end is the
 * nearest named piece of equipment along the circuit (pumps, sensors and tees are passed through).
 */
const TERMINAL: Record<string, string> = {
  tank: 'AKN',
  hp: 'TČ',
  ground: 'zemní kolektor',
  radiators: 'radiátory',
  solar: 'solární kolektor',
  pool: 'bazén',
  floor_pool: 'bazén',
  hx_cool: 'výměník chlazení',
  valve_mix: 'směšovač',
  valve_cool: 'ventil chlazení',
  valve_dhw: 'přepínání TUV',
  tap: 'TUV',
  cold: 'SV',
};
/** Far ends named after the circuit rather than the first tee behind the frame. */
const VIA: Record<string, string> = {
  j_ret: 'dům',
  j_sup: 'patra',
  j_coll_r: 'zemní kolektor',
  j_coll_s: 'zemní kolektor',
  j_mix: 'zpátečka z domu',
};
const GROUP: Array<[RegExp, string]> = [
  [/^(ryb_|valve_ryb|pump_ryb|j_ryb)/u, 'rybárna'],
  [/^(pump_filt|filter_pool|ph_probe|salinator|acid_dosing)$/u, 'jímka'],
];

const partOf = (port: string) => port.split('.')[0]!;
const nameOf = (part: string) =>
  TERMINAL[part] ?? VIA[part] ?? GROUP.find(([re]) => re.test(part))?.[1] ?? null;

/** Nearest named equipment reachable from `start` without using `via` (BFS by pipe count). */
export function farEnd(
  pipes: readonly GeoPipe[],
  via: string,
  start: string,
  inFrame: (part: string) => boolean = () => false,
): string {
  const own = nameOf(start);
  if (own && !inFrame(start)) return own;
  const seen = new Set([start]);
  let front = [start];
  const used = new Set([via]);
  while (front.length) {
    const found = new Set<string>();
    const next: string[] = [];
    for (const part of front) {
      for (const p of pipes) {
        if (used.has(p.id)) continue;
        const a = partOf(p.from);
        const b = partOf(p.to);
        if (a !== part && b !== part) continue;
        used.add(p.id);
        const other = a === part ? b : a;
        if (seen.has(other)) continue;
        seen.add(other);
        const n = nameOf(other);
        // named equipment inside the frame is a dead end (the label points out of the frame)
        if (n) {
          if (!inFrame(other)) found.add(n);
        } else next.push(other);
      }
    }
    if (found.size) return [...found].join(', ');
    front = next;
  }
  return '…';
}

export type Edge = 'l' | 'r' | 't' | 'b';
export interface EndLabel {
  pipe: string;
  /** Thin leader from the exit to a label that had to move away from its pipe. */
  bracket?: [number, number, number, number];
  edge: Edge;
  /** Crossing point on the frame edge. */
  at: [number, number];
  text: string;
  x: number;
  y: number;
  anchor: 'start' | 'end';
}

const ARROW: Record<Edge, string> = { l: '←', r: '→', t: '↑', b: '↓' };
const FONT = 15;

/** Crossings of the polyline with the frame edge, with the side that lies outside. */
function exits(pts: number[][], f: Rect) {
  const inside = (p: number[]) =>
    p[0]! > f.x && p[0]! < f.x + f.w && p[1]! > f.y && p[1]! < f.y + f.h;
  const out: Array<{ at: [number, number]; edge: Edge; outer: 'from' | 'to' }> = [];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const ia = inside(a);
    const ib = inside(b);
    if (!ia && !ib) {
      // a straight run through the whole frame: it enters on one edge and leaves on the other
      if (a[1] === b[1] && a[1]! > f.y && a[1]! < f.y + f.h) {
        const [lo, hi] = [Math.min(a[0]!, b[0]!), Math.max(a[0]!, b[0]!)];
        if (lo < f.x && hi > f.x + f.w) {
          const aLeft = a[0]! < b[0]!;
          out.push({ at: [f.x, a[1]!], edge: 'l', outer: aLeft ? 'from' : 'to' });
          out.push({ at: [f.x + f.w, a[1]!], edge: 'r', outer: aLeft ? 'to' : 'from' });
        }
      } else if (a[0] === b[0] && a[0]! > f.x && a[0]! < f.x + f.w) {
        const [lo, hi] = [Math.min(a[1]!, b[1]!), Math.max(a[1]!, b[1]!)];
        if (lo < f.y && hi > f.y + f.h) {
          const aTop = a[1]! < b[1]!;
          out.push({ at: [a[0]!, f.y], edge: 't', outer: aTop ? 'from' : 'to' });
          out.push({ at: [a[0]!, f.y + f.h], edge: 'b', outer: aTop ? 'to' : 'from' });
        }
      }
      continue;
    }
    if (ia === ib) continue;
    const [p, q] = ia ? [a, b] : [b, a];
    let at: [number, number];
    let edge: Edge;
    if (p[1] === q[1]) {
      edge = q[0]! < p[0]! ? 'l' : 'r';
      at = [edge === 'l' ? f.x : f.x + f.w, p[1]!];
    } else {
      edge = q[1]! < p[1]! ? 't' : 'b';
      at = [p[0]!, edge === 't' ? f.y : f.y + f.h];
    }
    // the outside part of the route runs towards the end that lies beyond this crossing
    out.push({ at, edge, outer: ia ? 'to' : 'from' });
  }
  return out;
}

export type Box4 = [number, number, number, number];
const overlaps = (a: Box4, b: Box4) =>
  a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3];

/** Does the segment (x1, y1) → (x2, y2) pass through the box (sampled)? */
function crosses([x1, y1, x2, y2]: [number, number, number, number], b: Box4): boolean {
  for (let t = 0.04; t < 0.97; t += 0.04) {
    const x = x1 + (x2 - x1) * t;
    const y = y1 + (y2 - y1) * t;
    if (x > b[0] && x < b[0] + b[2] && y > b[1] && y < b[1] + b[3]) return true;
  }
  return false;
}

/** Thin boxes around every pipe segment (obstacles for labels). */
export function pipeBoxes(pipes: readonly GeoPipe[], half = 4): Box4[] {
  return pipes.flatMap((p) =>
    p.pts.slice(1).map((b, i) => {
      const a = p.pts[i]!;
      const x = Math.min(a[0]!, b[0]!) - half;
      const y = Math.min(a[1]!, b[1]!) - half;
      return [x, y, Math.abs(a[0]! - b[0]!) + 2 * half, Math.abs(a[1]! - b[1]!) + 2 * half] as Box4;
    }),
  );
}

/**
 * End labels for `frame`; parallel exits to the same place share one label. A label never
 * overlaps another end label or anything in `avoid` (pipes, glyphs, labels): it tries a few spots
 * next to its pipe. Exits without a free spot on one edge share one bracket along that edge with
 * a single label in the nearest free place.
 */
export function endLabels(
  pipes: readonly GeoPipe[],
  frame: Rect,
  avoid: readonly Box4[] = [],
  partBoxes: Record<string, number[]> = {},
): EndLabel[] {
  const inFrame = (part: string) => {
    const b = partBoxes[part];
    if (!b) return false;
    const cx = b[0]! + (b[2] ?? 0) / 2;
    const cy = b[1]! + (b[3] ?? 0) / 2;
    return cx > frame.x && cx < frame.x + frame.w && cy > frame.y && cy < frame.y + frame.h;
  };
  const raw = pipes.flatMap((p) =>
    exits(p.pts, frame).map((e) => ({
      pipe: p.id,
      ...e,
      name: farEnd(pipes, p.id, partOf(e.outer === 'to' ? p.to : p.from), inFrame),
    })),
  );
  const near = avoid.filter((b) =>
    overlaps(b, [frame.x - 2, frame.y - 2, frame.w + 4, frame.h + 4]),
  );
  const side = (e: Edge) => e === 'l' || e === 'r';
  const along = (v: { at: [number, number]; edge: Edge }) => (side(v.edge) ? v.at[1] : v.at[0]);
  raw.sort((a, b) => (a.edge === b.edge ? along(a) - along(b) : a.edge.localeCompare(b.edge)));
  const groups: Array<typeof raw> = [];
  for (const e of raw) {
    const g = groups.find(
      (gr) =>
        gr[0]!.edge === e.edge &&
        gr[0]!.name === e.name &&
        Math.abs(along(gr.at(-1)!) - along(e)) <= (side(e.edge) ? 90 : 160),
    );
    if (g) g.push(e);
    else groups.push([e]);
  }
  const placed: Box4[] = [];
  const out: EndLabel[] = [];
  type Cand = { x: number; y: number; anchor: 'start' | 'end' };
  const boxOf = (c: Cand, w: number): Box4 => [
    c.anchor === 'start' ? c.x : c.x - w,
    c.y - FONT + 1,
    w,
    FONT + 3,
  ];
  const free = (box: Box4) =>
    box[0] >= frame.x + 2 &&
    box[0] + box[2] <= frame.x + frame.w - 2 &&
    box[1] >= frame.y + 2 &&
    box[1] + box[3] <= frame.y + frame.h - 2 &&
    ![...placed, ...near].some((b) => overlaps(box, b));
  const width = (text: string) => text.length * FONT * 0.6;
  const leftover: Record<Edge, typeof raw> = { l: [], r: [], t: [], b: [] };
  const glyphs = near.filter((b) => b[2] > 12 && b[3] > 12);
  const textOf = (edge: Edge, name: string) =>
    edge === 'r' ? `${name} ${ARROW.r}` : `${ARROW[edge]} ${name}`;
  for (const g of groups) {
    const first = g[0]!;
    const { edge } = first;
    const text = textOf(edge, first.name);
    const w = width(text);
    const cands: Cand[] = [];
    if (side(edge)) {
      const anchor = edge === 'l' ? ('start' as const) : ('end' as const);
      const top = Math.min(...g.map((e) => e.at[1]));
      const bottom = Math.max(...g.map((e) => e.at[1]));
      for (const dx of [6, 30, 60])
        for (const y of [top - 9, bottom + 21, top - 29, bottom + 41])
          cands.push({ x: edge === 'l' ? frame.x + dx : frame.x + frame.w - dx, y, anchor });
    } else {
      const xs = g.map((e) => e.at[0]);
      for (let k = 0; k < 5; k++) {
        const y = edge === 't' ? frame.y + FONT + 6 + 20 * k : frame.y + frame.h - 8 - 20 * k;
        cands.push({ x: Math.max(...xs) + 9, y, anchor: 'start' });
        cands.push({ x: Math.min(...xs) - 9, y, anchor: 'end' });
      }
    }
    let pick = cands.find((c) => free(boxOf(c, w)));
    let leader: [number, number, number, number] | undefined;
    if (!pick) {
      // nearest free spot whose leader crosses no glyph
      const [ax, ay] = first.at;
      const inx = edge === 'l' ? 6 : edge === 'r' ? -6 : 0;
      const iny = edge === 't' ? 6 : edge === 'b' ? -6 : 0;
      const spots: Array<Cand & { d: number }> = [];
      for (let gx = frame.x + 4; gx < frame.x + frame.w - 20; gx += 8) {
        for (let gy = frame.y + FONT + 4; gy < frame.y + frame.h - 4; gy += 6) {
          const d = Math.hypot(gx - ax, gy - ay);
          if (d < 160) spots.push({ x: gx, y: gy, anchor: 'start', d });
        }
      }
      spots.sort((a, b) => a.d - b.d);
      for (const c of spots) {
        const b = boxOf(c, w);
        if (!free(b)) continue;
        const tx = Math.min(Math.max(ax, b[0]), b[0] + b[2]);
        const ty = Math.min(Math.max(ay, b[1]), b[1] + b[3]);
        const seg: [number, number, number, number] = [ax + inx, ay + iny, tx, ty];
        if (glyphs.some((gb) => crosses(seg, gb))) continue;
        pick = c;
        leader = seg;
        break;
      }
    }
    if (!pick) {
      leftover[edge].push(...g);
      continue;
    }
    placed.push(boxOf(pick, w));
    out.push({
      pipe: g.map((e) => e.pipe).join(' '),
      edge,
      at: first.at,
      text,
      ...pick,
      ...(leader ? { bracket: leader } : {}),
    });
  }
  // Exits still without a label (blocked by a big glyph at the edge): one bracket line along the
  // edge over all of them and one label where the bracket ends in free space.
  for (const edge of ['l', 'r', 't', 'b'] as const) {
    const g = leftover[edge];
    if (!g.length) continue;
    const text = textOf(edge, [...new Set(g.map((e) => e.name))].join(', '));
    const w = width(text);
    const vals = g.map(along);
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    const fixed = side(edge)
      ? edge === 'l'
        ? frame.x + 5
        : frame.x + frame.w - 5
      : edge === 't'
        ? frame.y + 5
        : frame.y + frame.h - 5;
    const extent = side(edge) ? [frame.y, frame.y + frame.h] : [frame.x, frame.x + frame.w];
    let best: { c: Cand; end: number } | null = null;
    for (let d = 10; !best && d < extent[1]! - extent[0]!; d += 6) {
      for (const end of [hi + d, lo - d]) {
        if (end < extent[0]! + 4 || end > extent[1]! - 4) continue;
        const c: Cand = side(edge)
          ? {
              x: edge === 'l' ? frame.x + 12 : frame.x + frame.w - 12,
              y: end + 5,
              anchor: edge === 'l' ? 'start' : 'end',
            }
          : {
              x: end + 6,
              y: edge === 't' ? frame.y + FONT + 8 : frame.y + frame.h - 10,
              anchor: 'start',
            };
        if (free(boxOf(c, w))) {
          best = { c, end };
          break;
        }
      }
    }
    if (!best) continue;
    placed.push(boxOf(best.c, w));
    const a = Math.min(lo, best.end);
    const b = Math.max(hi, best.end);
    out.push({
      pipe: g.map((e) => e.pipe).join(' '),
      edge,
      at: g[0]!.at,
      text,
      ...best.c,
      bracket: side(edge) ? [fixed, a, fixed, b] : [a, fixed, b, fixed],
    });
  }
  return out;
}

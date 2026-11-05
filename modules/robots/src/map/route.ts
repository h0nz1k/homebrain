/**
 * Planned route preview: robot → selected rooms in cleaning order, through the doors.
 * A coarse grid A* over the floor (cells keep a clearance from every wall, so the line runs
 * through the middle of a doorway), then string-pulled into a few straight legs.
 */
import { pointToPolygonDist, segmentsCross, type Ring } from './geometry.js';

export type Pt = [number, number];

function distToSeg2(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len)) : 0;
  const x = a[0] + dx * t - p[0];
  const y = a[1] + dy * t - p[1];
  return x * x + y * y;
}

export interface RouteOptions {
  /** Grid cell size (view units). */
  cell: number;
  /** Minimal distance of the route from any wall line. */
  clearance: number;
}

/**
 * Legs of the route from `start` through `targets` (in order). Each leg is a polyline;
 * an unreachable target yields an empty leg (the caller skips it, the next leg starts there).
 */
export function planRoute(
  rooms: Ring[][],
  walls: Ring[],
  start: Pt,
  targets: Pt[],
  { cell, clearance }: RouteOptions,
): Pt[][] {
  if (!rooms.length || !targets.length || cell <= 0) return [];
  const segs: [Pt, Pt][] = [];
  for (const wall of walls)
    for (let i = 1; i < wall.length; i++) segs.push([wall[i - 1]!, wall[i]!]);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const rings of rooms)
    for (const [x, y] of rings[0] ?? []) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  const cols = Math.ceil((maxX - minX) / cell) + 1;
  const rows = Math.ceil((maxY - minY) / cell) + 1;
  if (cols * rows > 40_000) return [];
  const c2 = clearance * clearance;
  const free = (p: Pt) =>
    rooms.some((rings) => pointToPolygonDist(p[0], p[1], rings) > -clearance * 0.25) &&
    !segs.some(([a, b]) => distToSeg2(p, a, b) < c2);
  const crosses = (a: Pt, b: Pt) => segs.some((w) => segmentsCross([a, b], w));
  /** Straight segment that stays free (sampled) and crosses no wall. */
  const sight = (a: Pt, b: Pt) => {
    if (crosses(a, b)) return false;
    const steps = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / (cell * 0.5));
    for (let k = 1; k < steps; k++) {
      const t = k / steps;
      if (!free([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])) return false;
    }
    return true;
  };
  const at = (i: number): Pt => [minX + (i % cols) * cell, minY + Math.floor(i / cols) * cell];
  const ok = new Uint8Array(cols * rows);
  for (let i = 0; i < ok.length; i++) ok[i] = free(at(i)) ? 1 : 0;
  /** Nearest free cell to a point that it can see (start/target may sit near a wall). */
  const snap = (p: Pt): number => {
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < ok.length; i++) {
      if (!ok[i]) continue;
      const q = at(i);
      const d = (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2;
      if (d < bestD && !crosses(p, q)) [best, bestD] = [i, d];
    }
    return best;
  };
  const search = (from: number, to: number): number[] | null => {
    const g = new Float64Array(ok.length).fill(Infinity);
    const prev = new Int32Array(ok.length).fill(-1);
    const open = new Set<number>([from]);
    const goal = at(to);
    const h = (i: number) => Math.hypot(at(i)[0] - goal[0], at(i)[1] - goal[1]);
    g[from] = 0;
    while (open.size) {
      let cur = -1;
      let best = Infinity;
      for (const i of open) {
        const f = g[i]! + h(i);
        if (f < best) [cur, best] = [i, f];
      }
      if (cur === to) break;
      open.delete(cur);
      const cx = cur % cols;
      const cy = Math.floor(cur / cols);
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
          const n = ny * cols + nx;
          if (!ok[n] || crosses(at(cur), at(n))) continue;
          const cost = g[cur]! + (dx && dy ? Math.SQRT2 : 1) * cell;
          if (cost < g[n]!) {
            g[n] = cost;
            prev[n] = cur;
            open.add(n);
          }
        }
    }
    if (from !== to && prev[to] === -1) return null;
    const out = [to];
    while (out[0] !== from) out.unshift(prev[out[0]!]!);
    return out;
  };
  /** Keep only the points where the line of sight breaks (string pulling). */
  const pull = (pts: Pt[]): Pt[] => {
    const out: Pt[] = [pts[0]!];
    let i = 0;
    while (i < pts.length - 1) {
      let j = pts.length - 1;
      while (j > i + 1 && !sight(pts[i]!, pts[j]!)) j--;
      out.push(pts[j]!);
      i = j;
    }
    return out;
  };
  const legs: Pt[][] = [];
  let from = start;
  for (const target of targets) {
    const a = snap(from);
    const b = snap(target);
    const cells = a >= 0 && b >= 0 ? search(a, b) : null;
    if (!cells) {
      legs.push([]);
      continue;
    }
    legs.push(pull([from, ...cells.map(at), target]));
    from = target;
  }
  return legs;
}

/** Cut `len` off the start (`fromStart`) and/or end of a polyline. */
export function trimLine(pts: Pt[], fromStart: number, fromEnd: number): Pt[] {
  const cut = (line: Pt[], len: number): Pt[] => {
    let left = len;
    for (let i = 1; i < line.length; i++) {
      const [a, b] = [line[i - 1]!, line[i]!];
      const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (d > left) {
        const k = left / d;
        return [[a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k], ...line.slice(i)];
      }
      left -= d;
    }
    return [];
  };
  const head = fromStart > 0 ? cut(pts, fromStart) : pts;
  return fromEnd > 0 ? cut([...head].reverse(), fromEnd).reverse() : head;
}

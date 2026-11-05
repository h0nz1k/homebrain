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

/** A doorway: the gap between two wall ends (or a wall end and the side of another wall). */
export interface Door {
  a: Pt;
  b: Pt;
  /** Centre of the opening – every route passes exactly here. */
  c: Pt;
  /** Unit normal of the opening (points from `rooms[0]` into `rooms[1]`). */
  n: Pt;
  width: number;
  /** Room indices on both sides. */
  rooms: [number, number];
}

export interface DoorOptions {
  /** Narrowest / widest opening that counts as a door (view units = map mm). */
  minWidth: number;
  maxWidth: number;
  /** Wall ends closer than this to another wall are joints, not door jambs. */
  joint: number;
}

const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]];
const len = (v: Pt) => Math.hypot(v[0], v[1]);

/** Distance along the ray `o + t·d` (unit d) to the nearest point of segment ab, or null. */
function rayHit(o: Pt, d: Pt, a: Pt, b: Pt, eps: number): number | null {
  const e: Pt = sub(b, a);
  const den = d[0] * e[1] - d[1] * e[0];
  const w = sub(a, o);
  if (Math.abs(den) < 1e-9 * len(e)) {
    // Parallel: only a collinear piece ahead of the ray counts (the next wall piece).
    if (Math.abs(w[0] * d[1] - w[1] * d[0]) > eps) return null;
    const ta = w[0] * d[0] + w[1] * d[1];
    const tb = (b[0] - o[0]) * d[0] + (b[1] - o[1]) * d[1];
    const t = Math.min(ta, tb);
    return t > eps ? t : null;
  }
  const t = (w[0] * e[1] - w[1] * e[0]) / den;
  const u = (w[0] * d[1] - w[1] * d[0]) / den;
  return t > eps && u >= -1e-6 && u <= 1 + 1e-6 ? t : null;
}

/**
 * Doors from the wall layer: a free wall end (not touching another wall) whose ray along the
 * wall hits the next wall after a door-sized gap. Rooms on both sides come from probing the
 * rooms just in front of / behind the opening. Openings that do not join two rooms are dropped.
 */
export function findDoors(rooms: Ring[][], walls: Ring[], opts: DoorOptions): Door[] {
  const segs: [Pt, Pt, number][] = [];
  walls.forEach((wall, w) => {
    for (let i = 1; i < wall.length; i++) segs.push([wall[i - 1]!, wall[i]!, w]);
  });
  const j2 = opts.joint * opts.joint;
  const doors: Door[] = [];
  const roomOf = (p: Pt): number => {
    let best = -1;
    let bestD = -opts.maxWidth * 0.5;
    rooms.forEach((rings, i) => {
      const d = pointToPolygonDist(p[0], p[1], rings);
      if (d > bestD) [best, bestD] = [i, d];
    });
    return best;
  };
  walls.forEach((wall) => {
    if (wall.length < 2) return;
    const closed = len(sub(wall[0]!, wall[wall.length - 1]!)) < opts.joint;
    if (closed) return;
    const ends: [Pt, Pt][] = [
      [wall[0]!, wall[1]!],
      [wall[wall.length - 1]!, wall[wall.length - 2]!],
    ];
    for (const [end, inner] of ends) {
      // A joint: the end lies on another wall piece (its own end segment excluded).
      const touching = segs.some(([a, b]) => a !== end && b !== end && distToSeg2(end, a, b) < j2);
      if (touching) continue;
      const v = sub(end, inner);
      const l = len(v);
      if (!l) continue;
      const d: Pt = [v[0] / l, v[1] / l];
      let t = Infinity;
      for (const [a, b] of segs) {
        if (a === end || b === end) continue;
        const hit = rayHit(end, d, a, b, opts.joint * 0.5);
        if (hit !== null && hit < t) t = hit;
      }
      if (!(t >= opts.minWidth && t <= opts.maxWidth)) continue;
      const far: Pt = [end[0] + d[0] * t, end[1] + d[1] * t];
      const c: Pt = [(end[0] + far[0]) / 2, (end[1] + far[1]) / 2];
      if (doors.some((door) => len(sub(door.c, c)) < opts.minWidth * 0.5)) continue;
      const n: Pt = [-d[1], d[0]];
      const probe = Math.max(opts.joint * 2, t * 0.45);
      const r0 = roomOf([c[0] - n[0] * probe, c[1] - n[1] * probe]);
      const r1 = roomOf([c[0] + n[0] * probe, c[1] + n[1] * probe]);
      if (r0 < 0 || r1 < 0 || r0 === r1) continue;
      doors.push({ a: end, b: far, c, n, width: t, rooms: [r0, r1] });
    }
  });
  return doors;
}

export interface DoorRouteOptions {
  /** Distance kept from every wall by connectors inside a room. */
  clearance: number;
  /** How far the route runs straight before/after a door (perpendicular to the opening). */
  approach: number;
  /** How far into a target room the leg ends (it stops earlier near `avoid` points). */
  depth: number;
  /** Points the leg end must keep `avoidRadius` from (order badges / room labels). */
  avoid?: Pt[];
  avoidRadius?: number;
}

/**
 * Orthogonal route over the door graph: robot → each target room in order, every room change
 * through a door centre (perpendicular to the opening), inside rooms only axis-parallel
 * connectors that keep `clearance` from the walls. Returns null when the door graph cannot
 * connect a target (open-plan seams without doors) – the caller falls back to `planRoute`.
 */
export function planDoorRoute(
  rooms: Ring[][],
  walls: Ring[],
  doors: Door[],
  start: Pt,
  targets: number[],
  opts: DoorRouteOptions,
): Pt[][] | null {
  if (!rooms.length || !targets.length) return null;
  const segs: [Pt, Pt][] = [];
  for (const wall of walls)
    for (let i = 1; i < wall.length; i++) segs.push([wall[i - 1]!, wall[i]!]);
  const clr2 = opts.clearance * opts.clearance;
  const roomAtPt = (p: Pt): number => {
    let best = -1;
    let bestD = -Infinity;
    rooms.forEach((rings, i) => {
      const d = pointToPolygonDist(p[0], p[1], rings);
      if (d > bestD) [best, bestD] = [i, d];
    });
    return best;
  };
  /** Segment inside room `r`, crossing no wall and keeping the clearance (sampled). */
  const clear = (a: Pt, b: Pt, r: number, strict: boolean) => {
    if (segs.some((w) => segmentsCross([a, b], w))) return false;
    const steps = Math.max(2, Math.ceil(len(sub(b, a)) / (opts.clearance * 0.5)));
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      const p: Pt = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      if (pointToPolygonDist(p[0], p[1], rooms[r]!) < -opts.clearance * 0.25) return false;
      // Interior samples keep the clearance; the ends may sit near a wall (dock, door approach).
      if (strict && k > 0 && k < steps && segs.some(([u, v]) => distToSeg2(p, u, v) < clr2))
        return false;
    }
    return true;
  };
  const tol = 1;
  /** Axis-parallel connector from a to b inside room r (L, then Z shapes); null if none. */
  const connect = (a: Pt, b: Pt, r: number, arrive: 'x' | 'y'): Pt[] | null => {
    if (Math.abs(a[0] - b[0]) < tol || Math.abs(a[1] - b[1]) < tol)
      return clear(a, b, r, true) ? [a, b] : null;
    const cands: Pt[][] = [];
    const hFirst: Pt[] = [a, [b[0], a[1]], b];
    const vFirst: Pt[] = [a, [a[0], b[1]], b];
    // Prefer arriving along the door normal (last segment in the `arrive` axis).
    if (arrive === 'x') cands.push(vFirst, hFirst);
    else cands.push(hFirst, vFirst);
    for (const f of [0.5, 0.3, 0.7, 0.15, 0.85]) {
      const mx = a[0] + (b[0] - a[0]) * f;
      const my = a[1] + (b[1] - a[1]) * f;
      cands.push([a, [mx, a[1]], [mx, b[1]], b], [a, [a[0], my], [b[0], my], b]);
    }
    for (const strict of [true, false])
      for (const c of cands) if (c.every((p, i) => !i || clear(c[i - 1]!, p, r, strict))) return c;
    return null;
  };
  // Door graph: Dijkstra over (door, side we arrive on).
  const route = (
    from: Pt,
    fromRoom: number,
    to: number,
  ): { door: number; into: number }[] | null => {
    if (fromRoom === to) return [];
    type St = { door: number; into: number };
    const key = (s: St) => s.door * 2 + (doors[s.door]!.rooms[1] === s.into ? 1 : 0);
    const dist = new Map<number, number>();
    const prev = new Map<number, number>();
    const states = new Map<number, St>();
    const open: St[] = [];
    const man = (p: Pt, q: Pt) => Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]);
    doors.forEach((door, i) => {
      const side = door.rooms.indexOf(fromRoom);
      if (side < 0) return;
      const s = { door: i, into: door.rooms[1 - side]! };
      dist.set(key(s), man(from, door.c));
      states.set(key(s), s);
      open.push(s);
    });
    while (open.length) {
      open.sort((x, y) => dist.get(key(x))! - dist.get(key(y))!);
      const cur = open.shift()!;
      if (cur.into === to) {
        const out: St[] = [cur];
        let k = key(cur);
        while (prev.has(k)) {
          k = prev.get(k)!;
          out.unshift(states.get(k)!);
        }
        return out;
      }
      const here = doors[cur.door]!.c;
      doors.forEach((door, i) => {
        if (i === cur.door) return;
        const side = door.rooms.indexOf(cur.into);
        if (side < 0) return;
        const s = { door: i, into: door.rooms[1 - side]! };
        const d = dist.get(key(cur))! + man(here, door.c);
        if (d < (dist.get(key(s)) ?? Infinity)) {
          dist.set(key(s), d);
          prev.set(key(s), key(cur));
          states.set(key(s), s);
          if (!open.some((o) => key(o) === key(s))) open.push(s);
        }
      });
    }
    return null;
  };
  const legs: Pt[][] = [];
  let from = start;
  let room = roomAtPt(start);
  for (const target of targets) {
    const hops = route(from, room, target);
    if (!hops) return null;
    const pts: Pt[] = [from];
    let cur = from;
    let curRoom = room;
    for (const hop of hops) {
      const door = doors[hop.door]!;
      const s = door.rooms[1] === hop.into ? 1 : -1;
      const n: Pt = [door.n[0] * s, door.n[1] * s];
      const k = Math.min(opts.approach, door.width * 1.2);
      const before: Pt = [door.c[0] - n[0] * k, door.c[1] - n[1] * k];
      const after: Pt = [door.c[0] + n[0] * k, door.c[1] + n[1] * k];
      const axis = Math.abs(n[0]) > Math.abs(n[1]) ? 'x' : 'y';
      // Arrive along the door normal: the last connector leg runs in the normal's axis.
      const leg = connect(cur, before, curRoom, axis);
      if (!leg) return null;
      pts.push(...leg.slice(1), door.c, after);
      cur = after;
      curRoom = hop.into;
    }
    // Into the target room: straight on along the last normal, stopping short of the label.
    if (hops.length) {
      const last = sub(pts[pts.length - 1]!, pts[pts.length - 2]!);
      const l = len(last) || 1;
      const dir: Pt = [last[0] / l, last[1] / l];
      let depth = opts.depth;
      const r = opts.avoidRadius ?? 0;
      for (const q of opts.avoid ?? []) {
        // Projection of the avoid point onto the run; stop `r` before it if it is in the way.
        const w = sub(q, cur);
        const along = w[0] * dir[0] + w[1] * dir[1];
        const off = Math.abs(w[0] * dir[1] - w[1] * dir[0]);
        if (off < r && along > 0) depth = Math.min(depth, Math.max(0, along - r));
      }
      // Keep clear of the far wall too.
      while (
        depth > 0 &&
        !clear(cur, [cur[0] + dir[0] * depth, cur[1] + dir[1] * depth], curRoom, true)
      )
        depth *= 0.7;
      if (depth > opts.clearance * 0.3)
        pts.push([cur[0] + dir[0] * depth, cur[1] + dir[1] * depth]);
    }
    legs.push(mergeCollinear(pts));
    from = legs[legs.length - 1]![legs[legs.length - 1]!.length - 1]!;
    room = target;
  }
  return legs;
}

/** Drops repeated and collinear interior points of an axis-parallel polyline. */
export function mergeCollinear(pts: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (last && Math.hypot(p[0] - last[0], p[1] - last[1]) < 1e-6) continue;
    const prev = out[out.length - 2];
    if (prev && last) {
      const cross = (last[0] - prev[0]) * (p[1] - last[1]) - (last[1] - prev[1]) * (p[0] - last[0]);
      const dot = (last[0] - prev[0]) * (p[0] - last[0]) + (last[1] - prev[1]) * (p[1] - last[1]);
      if (
        Math.abs(cross) < 1e-6 * Math.max(1, Math.hypot(p[0] - prev[0], p[1] - prev[1]) ** 2) &&
        dot > 0
      ) {
        out[out.length - 1] = p;
        continue;
      }
    }
    out.push(p);
  }
  return out;
}

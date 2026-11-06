/**
 * Vector floor plan geometry (pure, no DOM): payload validation, map→view transform,
 * rounded room outlines and label placement at the polygon's visual centre (polylabel).
 */

export type Ring = [number, number][];

export interface VectorRoom {
  id: number;
  /** Outer ring first, then holes / extra fragments, flat [x0, y0, x1, y1 …] in map units. */
  polygons: number[][];
  /** Unstraightened fill outline (matches the raster base layer); hit areas in raster mode. */
  outline?: number[][];
  area_m2: number;
}
/** Theme-styled bitmap of the floor plan (backend PNG) placed at `bounds` (map units). */
export interface RasterBase {
  bounds: [number, number, number, number];
  /** Authenticated HA path with a `{theme}` placeholder (`light` | `dark`). */
  path: string;
  /**
   * `integration` = recoloured map image of the Roborock integration (`image.*`),
   * `map_data` = rendered from the raw map data (fallback when the image does not match).
   */
  source?: 'integration' | 'map_data';
}
export interface Pose {
  x: number;
  y: number;
  a: number | null;
}
export interface VectorMap {
  digest: string;
  bounds: [number, number, number, number];
  rooms: VectorRoom[];
  floor: number[][];
  /** Wall centre lines from the raw wall layer (open or closed polylines, flat). */
  walls: number[][];
  /** Shared borders between two rooms without a wall pixel (doorways, open plan). */
  dividers: number[][];
  robot: Pose | null;
  dock: Pose | null;
  path: number[];
  no_go: number[][];
  no_mop: number[][];
  virtual_walls: number[][];
  raster?: RasterBase | null;
}
export type VectorMapResult =
  { available: true; map: VectorMap } | { available: false; reason: string };

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const numList = (v: unknown, min = 0): v is number[] =>
  Array.isArray(v) && v.length >= min && v.every(isNum);
const pose = (v: unknown): Pose | null => {
  if (!v || typeof v !== 'object') return null;
  const { x, y, a } = v as Record<string, unknown>;
  return isNum(x) && isNum(y) ? { x, y, a: isNum(a) ? a : null } : null;
};

/** Validate the `homebrain/robots/map` answer; anything odd becomes a fallback reason. */
export function parseVectorMap(value: unknown): VectorMapResult {
  if (!value || typeof value !== 'object') return { available: false, reason: 'invalid' };
  const raw = value as Record<string, unknown>;
  if (raw.available !== true)
    return {
      available: false,
      reason: typeof raw.reason === 'string' ? raw.reason : 'unavailable',
    };
  const map = raw.map as Record<string, unknown> | undefined;
  if (!map || !numList(map.bounds, 4) || !Array.isArray(map.rooms))
    return { available: false, reason: 'invalid' };
  const rooms: VectorRoom[] = [];
  for (const room of map.rooms as unknown[]) {
    const r = room as Record<string, unknown>;
    if (!isNum(r?.id) || !Array.isArray(r.polygons)) continue;
    const polygons = (r.polygons as unknown[]).filter(
      (p): p is number[] => numList(p, 6) && p.length % 2 === 0,
    );
    const outline = Array.isArray(r.outline)
      ? (r.outline as unknown[]).filter((p): p is number[] => numList(p, 6) && p.length % 2 === 0)
      : [];
    if (polygons.length)
      rooms.push({
        id: r.id,
        polygons,
        ...(outline.length ? { outline } : {}),
        area_m2: isNum(r.area_m2) ? r.area_m2 : 0,
      });
  }
  if (!rooms.length) return { available: false, reason: 'no_rooms' };
  const lists = (v: unknown, min: number) =>
    Array.isArray(v) ? v.filter((p): p is number[] => numList(p, min)) : [];
  return {
    available: true,
    map: {
      digest: typeof map.digest === 'string' ? map.digest : '',
      bounds: (map.bounds as number[]).slice(0, 4) as VectorMap['bounds'],
      rooms,
      floor: lists(map.floor, 6),
      walls: lists(map.walls, 4).filter((p) => p.length % 2 === 0),
      dividers: lists(map.dividers, 4).filter((p) => p.length % 2 === 0),
      robot: pose(map.robot),
      dock: pose(map.dock),
      path: numList(map.path) ? (map.path as number[]) : [],
      no_go: lists(map.no_go, 8),
      no_mop: lists(map.no_mop, 8),
      virtual_walls: lists(map.virtual_walls, 4),
      raster: rasterBase(map.raster),
    },
  };
}

function rasterBase(value: unknown): RasterBase | null {
  if (!value || typeof value !== 'object') return null;
  const { bounds, path } = value as Record<string, unknown>;
  if (!numList(bounds, 4) || typeof path !== 'string' || !path.includes('{theme}')) return null;
  const [x0, y0, x1, y1] = bounds as number[];
  if (!(x1! > x0! && y1! > y0!)) return null;
  return { bounds: [x0!, y0!, x1!, y1!], path };
}

/** Rectangle of the raster base layer in UNROTATED view coordinates (y flipped like everything
 * else); draw it inside `<g transform={rotationTransform(frame)}>`. */
export function rasterRect(f: Frame, base: RasterBase) {
  const [x0, y0, x1, y1] = base.bounds;
  return { x: x0 - f.minX, y: f.maxY - y1, width: x1 - x0, height: y1 - y0 };
}

export function toRing(flat: number[]): Ring {
  const ring: Ring = [];
  for (let i = 0; i + 1 < flat.length; i += 2) ring.push([flat[i]!, flat[i + 1]!]);
  return ring;
}

/** Map rotation (clockwise, degrees) set per robot: the vendor app rotation is not in the map data. */
export type MapRotation = 0 | 90 | 180 | 270;
export function normRotation(value: unknown): MapRotation {
  const n = Number(value);
  return n === 90 || n === 180 || n === 270 ? n : 0;
}

/**
 * View frame: crop to the drawn floor (+padding), flip y (map y grows up, SVG y down), then
 * rotate clockwise by `rot`. `width`/`height` are the ROTATED view size (swapped for 90/270),
 * `w0`/`h0` the unrotated one (raster base rectangle space).
 */
export interface Frame {
  minX: number;
  maxY: number;
  width: number;
  height: number;
  w0: number;
  h0: number;
  rot: MapRotation;
}
export function frameFor(map: VectorMap, pad = 120, rotation: MapRotation = 0): Frame {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const take = (flat: number[]) => {
    for (let i = 0; i + 1 < flat.length; i += 2) {
      minX = Math.min(minX, flat[i]!);
      maxX = Math.max(maxX, flat[i]!);
      minY = Math.min(minY, flat[i + 1]!);
      maxY = Math.max(maxY, flat[i + 1]!);
    }
  };
  (map.floor.length ? map.floor : map.rooms.flatMap((r) => r.polygons)).forEach(take);
  for (const p of [map.dock, map.robot]) if (p) take([p.x, p.y]);
  if (!Number.isFinite(minX)) [minX, minY, maxX, maxY] = map.bounds;
  const w0 = maxX - minX + 2 * pad;
  const h0 = maxY - minY + 2 * pad;
  const swap = rotation === 90 || rotation === 270;
  return {
    minX: minX - pad,
    maxY: maxY + pad,
    width: swap ? h0 : w0,
    height: swap ? w0 : h0,
    w0,
    h0,
    rot: rotation,
  };
}
/** Unrotated view point → rotated view point (clockwise quarter turns). */
export function rotatePoint(f: Frame, ux: number, uy: number): [number, number] {
  switch (f.rot) {
    case 90:
      return [f.h0 - uy, ux];
    case 180:
      return [f.w0 - ux, f.h0 - uy];
    case 270:
      return [uy, f.w0 - ux];
    default:
      return [ux, uy];
  }
}
/** SVG transform that maps the unrotated view space onto the rotated one (raster base). */
export function rotationTransform(f: Frame): string | undefined {
  if (f.rot === 90) return `translate(${f.h0} 0) rotate(90)`;
  if (f.rot === 180) return `translate(${f.w0} ${f.h0}) rotate(180)`;
  if (f.rot === 270) return `translate(0 ${f.w0}) rotate(270)`;
  return undefined;
}
export const toView = (f: Frame, x: number, y: number): [number, number] =>
  rotatePoint(f, x - f.minX, f.maxY - y);
export const viewRing = (f: Frame, flat: number[]): Ring =>
  toRing(flat).map(([x, y]) => toView(f, x, y));

/**
 * Closed SVG path with rounded corners: each vertex is replaced by a quadratic curve whose
 * tangent length is `radius`, clamped to 45 % of both adjacent edges (short edges stay sane).
 */
export function roundedPath(ring: Ring, radius: number): string {
  const n = ring.length;
  if (n < 3) return '';
  const parts: string[] = [];
  const fmt = (v: number) => Math.round(v * 10) / 10;
  for (let i = 0; i < n; i++) {
    const prev = ring[(i - 1 + n) % n]!;
    const cur = ring[i]!;
    const next = ring[(i + 1) % n]!;
    const l1 = Math.hypot(cur[0] - prev[0], cur[1] - prev[1]);
    const l2 = Math.hypot(next[0] - cur[0], next[1] - cur[1]);
    const t = Math.min(radius, l1 * 0.45, l2 * 0.45);
    const a: [number, number] = l1
      ? [cur[0] + ((prev[0] - cur[0]) * t) / l1, cur[1] + ((prev[1] - cur[1]) * t) / l1]
      : cur;
    const b: [number, number] = l2
      ? [cur[0] + ((next[0] - cur[0]) * t) / l2, cur[1] + ((next[1] - cur[1]) * t) / l2]
      : cur;
    parts.push(
      `${i ? 'L' : 'M'}${fmt(a[0])} ${fmt(a[1])}Q${fmt(cur[0])} ${fmt(cur[1])} ${fmt(b[0])} ${fmt(b[1])}`,
    );
  }
  return `${parts.join('')}Z`;
}

function pointToSegmentDist2(px: number, py: number, a: [number, number], b: [number, number]) {
  let [x, y] = a;
  let dx = b[0] - x;
  let dy = b[1] - y;
  if (dx || dy) {
    const t = ((px - x) * dx + (py - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) [x, y] = b;
    else if (t > 0) {
      x += dx * t;
      y += dy * t;
    }
  }
  dx = px - x;
  dy = py - y;
  return dx * dx + dy * dy;
}

/** Signed distance from a point to the polygon outline (positive inside, even-odd rings). */
export function pointToPolygonDist(x: number, y: number, rings: Ring[]): number {
  let inside = false;
  let min = Infinity;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i]!;
      const b = ring[j]!;
      if (a[1] > y !== b[1] > y && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0])
        inside = !inside;
      min = Math.min(min, pointToSegmentDist2(x, y, a, b));
    }
  }
  return (inside ? 1 : -1) * Math.sqrt(min);
}

/**
 * Pole of inaccessibility (Mapbox "polylabel"): the interior point farthest from the
 * outline – where a label reads as centred even in L-shaped rooms. Returns [x, y, distance].
 */
export function polylabel(rings: Ring[], precision = 1): [number, number, number] {
  const outer = rings[0] ?? [];
  if (!outer.length) return [0, 0, 0];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of outer) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  const width = maxX - minX;
  const height = maxY - minY;
  const size = Math.min(width, height);
  if (size === 0) return [minX, minY, 0];
  type Cell = { x: number; y: number; h: number; d: number; max: number };
  const cell = (x: number, y: number, h: number): Cell => {
    const d = pointToPolygonDist(x, y, rings);
    return { x, y, h, d, max: d + h * Math.SQRT2 };
  };
  const queue: Cell[] = [];
  const h = size / 2;
  for (let x = minX; x < maxX; x += size)
    for (let y = minY; y < maxY; y += size) queue.push(cell(x + h, y + h, h));
  // Centroid of the outer ring as the first guess.
  let area = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0, j = outer.length - 1; i < outer.length; j = i++) {
    const a = outer[i]!;
    const b = outer[j]!;
    const f = a[0] * b[1] - b[0] * a[1];
    cx += (a[0] + b[0]) * f;
    cy += (a[1] + b[1]) * f;
    area += f * 3;
  }
  let best = area ? cell(cx / area, cy / area, 0) : cell(minX + width / 2, minY + height / 2, 0);
  const box = cell(minX + width / 2, minY + height / 2, 0);
  if (box.d > best.d) best = box;
  let guard = 0;
  while (queue.length && guard++ < 4000) {
    queue.sort((p, q) => p.max - q.max);
    const c = queue.pop()!;
    if (c.d > best.d) best = c;
    if (c.max - best.d <= precision) continue;
    const k = c.h / 2;
    queue.push(cell(c.x - k, c.y - k, k), cell(c.x + k, c.y - k, k));
    queue.push(cell(c.x - k, c.y + k, k), cell(c.x + k, c.y + k, k));
  }
  return [best.x, best.y, best.d];
}

/** Outer rings + holes for even-odd fill: holes are the rings inside the first one. */
export function roomRings(f: Frame, room: VectorRoom): Ring[] {
  return room.polygons.map((flat) => viewRing(f, flat));
}

export function ringBox(ring: Ring): { x: number; y: number; w: number; h: number } {
  const xs = ring.map((p) => p[0]);
  const ys = ring.map((p) => p[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/** Is a view point inside any room ring (even-odd)? Used to keep labels off the robot. */
export function containsPoint(rings: Ring[], x: number, y: number): boolean {
  return pointToPolygonDist(x, y, rings) > 0;
}

/** Open SVG polyline with rounded joins (same fillet rule as `roundedPath`). */
export function roundedLine(line: Ring, radius: number): string {
  const n = line.length;
  if (n < 2) return '';
  const fmt = (v: number) => Math.round(v * 10) / 10;
  const closed = n > 3 && line[0]![0] === line[n - 1]![0] && line[0]![1] === line[n - 1]![1];
  if (closed) return roundedPath(line.slice(0, -1), radius);
  let d = `M${fmt(line[0]![0])} ${fmt(line[0]![1])}`;
  for (let i = 1; i < n - 1; i++) {
    const prev = line[i - 1]!;
    const cur = line[i]!;
    const next = line[i + 1]!;
    const l1 = Math.hypot(cur[0] - prev[0], cur[1] - prev[1]);
    const l2 = Math.hypot(next[0] - cur[0], next[1] - cur[1]);
    const t = Math.min(radius, l1 * 0.45, l2 * 0.45);
    if (!l1 || !l2) continue;
    const a = [cur[0] + ((prev[0] - cur[0]) * t) / l1, cur[1] + ((prev[1] - cur[1]) * t) / l1];
    const b = [cur[0] + ((next[0] - cur[0]) * t) / l2, cur[1] + ((next[1] - cur[1]) * t) / l2];
    d += `L${fmt(a[0]!)} ${fmt(a[1]!)}Q${fmt(cur[0])} ${fmt(cur[1])} ${fmt(b[0]!)} ${fmt(b[1]!)}`;
  }
  return `${d}L${fmt(line[n - 1]![0])} ${fmt(line[n - 1]![1])}`;
}

type Seg = [[number, number], [number, number]];
const cross = (o: [number, number], a: [number, number], b: [number, number]) =>
  (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
/** Proper intersection of two segments (touching end points do not count). */
export function segmentsCross([p, q]: Seg, [r, s]: Seg): boolean {
  const d1 = cross(r, s, p);
  const d2 = cross(r, s, q);
  const d3 = cross(p, q, r);
  const d4 = cross(p, q, s);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

/**
 * Predicate "may the robot trail run straight from a to b?": both ends and the samples in
 * between stay inside the rooms (+ `buffer`) and the segment crosses no wall line.
 */
export function segmentGuard(
  rooms: Ring[][],
  walls: Ring[],
  buffer: number,
): {
  inside: (x: number, y: number) => boolean;
  ok: (a: [number, number], b: [number, number]) => boolean;
} {
  const wallSegs: Seg[] = [];
  for (const wall of walls)
    for (let i = 1; i < wall.length; i++) wallSegs.push([wall[i - 1]!, wall[i]!]);
  const inside = (x: number, y: number) =>
    !rooms.length || rooms.some((rings) => pointToPolygonDist(x, y, rings) > -buffer);
  const ok = (a: [number, number], b: [number, number]) => {
    if (!inside(a[0], a[1]) || !inside(b[0], b[1])) return false;
    const steps = Math.max(
      1,
      Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / Math.max(buffer, 1)),
    );
    for (let k = 1; k < steps; k++) {
      const t = k / steps;
      if (!inside(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)) return false;
    }
    return !wallSegs.some((w) => segmentsCross([a, b], w));
  };
  return { inside, ok };
}

/**
 * Split the robot trail into runs that stay inside the rooms (+ `buffer`) and never cross a
 * wall line. Older/simplified path points can cut corners through walls or wander outside the
 * plan; such segments are dropped instead of drawn across the wall.
 */
export function clipTrail(
  points: [number, number][],
  rooms: Ring[][],
  walls: Ring[],
  buffer: number,
): [number, number][][] {
  const guard = segmentGuard(rooms, walls, buffer);
  const runs: [number, number][][] = [];
  let run: [number, number][] = [];
  const flush = () => {
    if (run.length > 1) runs.push(run);
    run = [];
  };
  for (const pt of points) {
    if (!guard.inside(pt[0], pt[1])) {
      flush();
      continue;
    }
    const last = run[run.length - 1];
    if (last && !guard.ok(last, pt)) flush();
    run.push(pt);
  }
  flush();
  return runs;
}

/** Room under a map point (e.g. the robot pose), or `null` outside every room. */
export function roomAt(map: VectorMap, x: number, y: number): number | null {
  const f = frameFor(map);
  const [vx, vy] = toView(f, x, y);
  return map.rooms.find((room) => containsPoint(roomRings(f, room), vx, vy))?.id ?? null;
}

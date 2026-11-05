/**
 * Robot marker motion between map refreshes (~30 s in HA): instead of jumping, the marker
 * glides along the freshly reported path from where it was drawn to the new position.
 */
export type Pt = [number, number];

const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Path points (flat, map units) as tuples. */
export function pathPoints(flat: number[]): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i + 1 < flat.length; i += 2) out.push([flat[i]!, flat[i + 1]!]);
  return out;
}

/**
 * Track the marker should follow: from the previously displayed point to the new pose,
 * through the path points recorded in between. Falls back to a straight hop when the old
 * point is not near the recorded path (new map, robot carried), or `[to]` without history.
 */
export type GlideOptions = {
  maxBack?: number;
  snap?: number;
  /** Segments the marker must not tween along (e.g. crossing a wall): it jumps instead. */
  blocked?: (a: Pt, b: Pt) => boolean;
  /** Longer hops between consecutive points are jumps too (gaps in the recorded path). */
  maxGap?: number;
};

export function trackBetween(
  from: Pt | null,
  to: Pt,
  path: Pt[],
  options: GlideOptions = {},
): Pt[] {
  return planGlide(from, to, path, options).track;
}

/**
 * `track` to animate + `travelled` = how many leading path points are already behind the
 * marker (drawn as the static trail; the rest is revealed while the marker glides).
 *
 * The marker only tweens along recorded points: if a hop of the track is `blocked` (crosses
 * a wall) or longer than `maxGap`, everything up to that hop is skipped and the marker jumps
 * to the point after it; with no clean hop left it jumps straight to `to`.
 */
export function planGlide(
  from: Pt | null,
  to: Pt,
  path: Pt[],
  options: GlideOptions = {},
): { track: Pt[]; travelled: number } {
  let track = glideTrack(from, to, path, options);
  const { blocked, maxGap = Infinity } = options;
  let cut = 0;
  for (let i = 1; i < track.length; i++) {
    const a = track[i - 1]!;
    const b = track[i]!;
    if (dist(a, b) > maxGap || blocked?.(a, b)) cut = i;
  }
  if (cut > 0) track = track.length - cut > 1 ? track.slice(cut) : [to];
  const middle = Math.max(0, track.length - 2);
  return {
    track,
    travelled: track.length > 1 ? Math.max(0, path.length - middle - 1) : path.length,
  };
}

function glideTrack(
  from: Pt | null,
  to: Pt,
  path: Pt[],
  { maxBack = 600, snap = 900 }: GlideOptions,
): Pt[] {
  if (!from) return [to];
  if (dist(from, to) < 1) return [to];
  // The path normally ends at the robot; find the last point near the new pose.
  let end = path.length - 1;
  while (end >= 0 && dist(path[end]!, to) > snap) end--;
  if (end < 0) return [from, to];
  let best = -1;
  let bestD = snap;
  for (let i = end; i >= Math.max(0, end - maxBack); i--) {
    const d = dist(path[i]!, from);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  if (best < 0) return [from, to];
  const middle = path.slice(best + 1, end + 1);
  const track: Pt[] = [from, ...middle, to];
  // Drop zero-length steps so the heading stays defined.
  return track.filter((p, i) => i === 0 || dist(p, track[i - 1]!) > 0.5);
}

export function trackLength(track: Pt[]): number {
  let total = 0;
  for (let i = 1; i < track.length; i++) total += dist(track[i - 1]!, track[i]!);
  return total;
}

/** Constant speed with short soft starts/stops (robots accelerate briefly). */
export function easeTravel(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  const e = 0.12;
  // Trapezoid velocity profile normalised to cover distance 1.
  const v = 1 / (1 - e);
  if (x < e) return (v * x * x) / (2 * e);
  if (x > 1 - e) return 1 - (v * (1 - x) * (1 - x)) / (2 * e);
  return v * (x - e / 2);
}

/** Position + heading (degrees, 0 = +x, counter-clockwise in map space) at fraction t. */
export function pointAt(track: Pt[], t: number): { x: number; y: number; heading: number | null } {
  if (!track.length) return { x: 0, y: 0, heading: null };
  if (track.length === 1) return { x: track[0]![0], y: track[0]![1], heading: null };
  const total = trackLength(track);
  let left = Math.min(1, Math.max(0, t)) * total;
  for (let i = 1; i < track.length; i++) {
    const a = track[i - 1]!;
    const b = track[i]!;
    const seg = dist(a, b);
    if (left <= seg || i === track.length - 1) {
      const k = seg ? Math.min(1, left / seg) : 1;
      return {
        x: a[0] + (b[0] - a[0]) * k,
        y: a[1] + (b[1] - a[1]) * k,
        heading: (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI,
      };
    }
    left -= seg;
  }
  const last = track[track.length - 1]!;
  return { x: last[0], y: last[1], heading: null };
}

/** How long to glide: a bit shorter than the gap between updates, within sane limits. */
export function glideDuration(intervalMs: number | null): number {
  if (intervalMs === null || !Number.isFinite(intervalMs)) return 1200;
  return Math.min(30_000, Math.max(600, intervalMs * 0.92));
}

/**
 * Smooth open SVG path through `pts` (uniform Catmull-Rom → cubic Béziers). Consecutive
 * duplicates are dropped; fewer than 2 distinct points give an empty string.
 */
export function smoothPath(pts: Pt[], tension = 0.5): string {
  const p: Pt[] = [];
  for (const q of pts) {
    const last = p[p.length - 1];
    if (!last || Math.hypot(q[0] - last[0], q[1] - last[1]) > 1e-6) p.push(q);
  }
  if (p.length < 2) return '';
  const f = (v: number) => v.toFixed(1);
  const len = (u: Pt, v: Pt) => Math.hypot(v[0] - u[0], v[1] - u[1]);
  // Tangent at p[i], capped to 45 % of the shorter adjacent edge: sharp lane U-turns stay
  // inside the room instead of overshooting into the wall.
  const tangent = (i: number): Pt => {
    const a = p[i - 1] ?? p[i]!;
    const c = p[i + 1] ?? p[i]!;
    let tx = ((c[0] - a[0]) * tension) / 3;
    let ty = ((c[1] - a[1]) * tension) / 3;
    const edges = [p[i - 1], p[i + 1]].filter((q): q is Pt => !!q).map((q) => len(q, p[i]!));
    const cap = 0.45 * Math.min(...edges);
    const m = Math.hypot(tx, ty);
    if (m > cap && m > 0) [tx, ty] = [(tx * cap) / m, (ty * cap) / m];
    return [tx, ty];
  };
  let d = `M${f(p[0]![0])} ${f(p[0]![1])}`;
  for (let i = 0; i < p.length - 1; i++) {
    const b = p[i]!;
    const c = p[i + 1]!;
    const tb = tangent(i);
    const tc = tangent(i + 1);
    d +=
      `C${f(b[0] + tb[0])} ${f(b[1] + tb[1])}` +
      ` ${f(c[0] - tc[0])} ${f(c[1] - tc[1])}` +
      ` ${f(c[0])} ${f(c[1])}`;
  }
  return d;
}

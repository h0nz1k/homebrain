/**
 * Smooth chart curves (#64): monotone cubic interpolation (Fritsch–Carlson) as an SVG path.
 * Monotone = no overshoot between samples, so a smoothed temperature never invents a peak.
 */
export type Pt = [number, number];

function tangents(pts: Pt[]): number[] {
  const n = pts.length;
  const d: number[] = [];
  for (let i = 0; i + 1 < n; i++) {
    const dx = pts[i + 1]![0] - pts[i]![0];
    d.push(dx === 0 ? 0 : (pts[i + 1]![1] - pts[i]![1]) / dx);
  }
  const m: number[] = [d[0] ?? 0];
  for (let i = 1; i + 1 < n; i++) {
    const a = d[i - 1]!;
    const b = d[i]!;
    m.push(a * b <= 0 ? 0 : (a + b) / 2);
  }
  if (n > 1) m.push(d[n - 2]!);
  // Fritsch–Carlson limiter
  for (let i = 0; i + 1 < n; i++) {
    const s = d[i]!;
    if (s === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i]! / s;
    const b = m[i + 1]! / s;
    const h = a * a + b * b;
    if (h > 9) {
      const t = 3 / Math.sqrt(h);
      m[i] = t * a * s;
      m[i + 1] = t * b * s;
    }
  }
  return m;
}

const f = (n: number) => (Math.round(n * 10) / 10).toString();

/** Path segments (without the leading move) through `pts`, sorted by x. */
export function curveSegments(pts: Pt[]): string {
  if (pts.length < 2) return '';
  const m = tangents(pts);
  let out = '';
  for (let i = 0; i + 1 < pts.length; i++) {
    const [x0, y0] = pts[i]!;
    const [x1, y1] = pts[i + 1]!;
    const dx = (x1 - x0) / 3;
    out += `C${f(x0 + dx)},${f(y0 + m[i]! * dx)} ${f(x1 - dx)},${f(y1 - m[i + 1]! * dx)} ${f(x1)},${f(y1)}`;
  }
  return out;
}

/** Full smooth SVG path; empty string for no points. */
export function smoothPath(pts: Pt[]): string {
  if (pts.length === 0) return '';
  const [x, y] = pts[0]!;
  return `M${f(x)},${f(y)}${curveSegments(pts)}`;
}

/** Closed band between an upper and a lower curve (same x samples). */
export function bandPath(upper: Pt[], lower: Pt[]): string {
  if (upper.length < 2 || lower.length < 2) return '';
  const rev = [...lower].reverse();
  const [lx, ly] = rev[0]!;
  return `${smoothPath(upper)}L${f(lx)},${f(ly)}${curveSegments(rev)}Z`;
}

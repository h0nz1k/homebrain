/**
 * Pure radar helpers: ČHMÚ palette -> dBZ, perceptual colour ramp, smooth upsampling and
 * the "next hour" minute series. No DOM here, so everything is unit-testable.
 */

/** ČHMÚ reflectivity legend (RGB -> lower bound of the 4 dBZ class), same as radar.py. */
export const CHMI_PALETTE: [number, number, number, number][] = [
  [56, 0, 112, 4],
  [48, 0, 168, 8],
  [0, 0, 252, 12],
  [0, 108, 192, 16],
  [0, 160, 0, 20],
  [0, 188, 0, 24],
  [52, 216, 0, 28],
  [156, 220, 0, 32],
  [224, 220, 0, 36],
  [252, 176, 0, 40],
  [252, 132, 0, 44],
  [252, 88, 0, 48],
  [252, 0, 0, 52],
  [160, 0, 0, 56],
  [252, 252, 252, 60],
];

/** Decoded RGBA (from a ČHMÚ-coloured frame) -> dBZ per pixel; transparent = 0. */
export function decodeDbz(rgba: ArrayLike<number>, w: number, h: number): Float32Array {
  const out = new Float32Array(w * h);
  const memo = new Map<number, number>();
  for (let i = 0; i < w * h; i++) {
    const a = rgba[i * 4 + 3]!;
    if (a < 60) continue;
    const r = rgba[i * 4]!;
    const g = rgba[i * 4 + 1]!;
    const b = rgba[i * 4 + 2]!;
    const key = ((r >> 2) << 12) | ((g >> 2) << 6) | (b >> 2);
    let dbz = memo.get(key);
    if (dbz === undefined) {
      let best = Infinity;
      dbz = 0;
      for (const [pr, pg, pb, pd] of CHMI_PALETTE) {
        const d = (pr - r) ** 2 + (pg - g) ** 2 + (pb - b) ** 2;
        if (d < best) {
          best = d;
          dbz = pd;
        }
      }
      memo.set(key, dbz);
    }
    // Class lower bound -> class centre, so smoothing does not bias the field low.
    out[i] = dbz + 2;
  }
  return out;
}

// ---------- colour ramp (interpolated in OKLab) ----------
type Rgb = [number, number, number];
const toLin = (c: number) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const toSrgb = (v: number) => {
  const c = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.max(v, 0) ** (1 / 2.4) - 0.055;
  return Math.round(Math.min(1, Math.max(0, c)) * 255);
};
export function rgbToOklab([r, g, b]: Rgb): Rgb {
  const [lr, lg, lb] = [toLin(r), toLin(g), toLin(b)];
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}
function oklabToRgb([L, A, B]: Rgb): Rgb {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [
    toSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    toSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    toSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}
const hex = (h: string): Rgb => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];

/**
 * Perceptual, colour-blind-safe ramp: hue walks blue -> violet -> magenta -> orange ->
 * yellow while OKLab lightness rises monotonically, so intensity reads even without hue
 * (deuteranopia/protanopia, greyscale). Light rain is mostly transparent.
 */
export const RAMP_STOPS: { dbz: number; color: string; alpha: number }[] = [
  { dbz: 8, color: '#3b82f6', alpha: 0 },
  { dbz: 14, color: '#3b82f6', alpha: 0.34 },
  { dbz: 22, color: '#7c8cf8', alpha: 0.6 },
  { dbz: 30, color: '#b07cf7', alpha: 0.8 },
  { dbz: 38, color: '#e879c9', alpha: 0.88 },
  { dbz: 46, color: '#fb923c', alpha: 0.94 },
  { dbz: 54, color: '#fcd34d', alpha: 0.97 },
  { dbz: 62, color: '#fff3c4', alpha: 1 },
];

export type RampLut = Uint8ClampedArray; // 0..64 dBZ x RGBA

const FADE_START = 8;
const FADE_END = 14; // = RAMP_STOPS[1].dbz
const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** 65-entry RGBA lookup (index = dBZ). `light` boosts low-end alpha on light basemaps. */
export function buildRamp(light = false): RampLut {
  const lut = new Uint8ClampedArray(65 * 4);
  const labs = RAMP_STOPS.map((s) => rgbToOklab(hex(s.color)));
  for (let d = 0; d <= 64; d++) {
    let i = RAMP_STOPS.findIndex((s) => s.dbz > d);
    if (i === -1) i = RAMP_STOPS.length - 1;
    const lo = Math.max(0, i - 1);
    const a = RAMP_STOPS[lo]!;
    const b = RAMP_STOPS[i]!;
    const t = b.dbz === a.dbz ? 1 : Math.min(1, Math.max(0, (d - a.dbz) / (b.dbz - a.dbz)));
    const la = labs[lo]!;
    const lb = labs[i]!;
    const lab = [0, 1, 2].map((k) => la[k]! + (lb[k]! - la[k]!) * t) as Rgb;
    // Light basemap: same hues, uniformly darker + more opaque (order of lightness kept).
    if (light) lab[0] -= 0.13;
    const rgb = oklabToRgb(lab);
    let alpha = d < RAMP_STOPS[0]!.dbz ? 0 : a.alpha + (b.alpha - a.alpha) * t;
    // Soft fade-in of drizzle: smoothstep instead of a linear knee, so cell edges have no rim.
    if (d < FADE_END) alpha = RAMP_STOPS[1]!.alpha * smoothstep(FADE_START, FADE_END, d);
    if (light) alpha = Math.min(1, alpha * 1.08);
    lut.set([rgb[0], rgb[1], rgb[2], Math.round(alpha * 255)], d * 4);
  }
  return lut;
}

/** CSS linear-gradient for the legend/chart (same stops as the canvas ramp). */
export function rampGradient(direction = '90deg', from = 10, to = 60): string {
  const stops = RAMP_STOPS.filter((s) => s.dbz >= from - 4 && s.dbz <= to + 4).map((s) => {
    const pos = ((s.dbz - from) / (to - from)) * 100;
    const a = Math.max(s.alpha, 0.8);
    const [r, g, b] = hex(s.color);
    return `rgba(${r},${g},${b},${a.toFixed(2)}) ${pos.toFixed(0)}%`;
  });
  return `linear-gradient(${direction},${stops.join(',')})`;
}

/** dBZ for an intensity (inverse Marshall-Palmer). */
export const mmhToDbz = (mmh: number) => 10 * Math.log10(200 * mmh ** 1.6);

/**
 * Legend gradient with one equal-width segment per category (slabý | mírný | silný |
 * přívalový), so the words sit under their colours although the dBZ scale is uneven.
 */
export function legendGradient(): string {
  const edges = [...RAIN_LEVELS.map((l) => mmhToDbz(l.mmh)), 62];
  const at = (dbz: number) => {
    const i = Math.max(0, edges.findIndex((e, k) => k > 0 && dbz <= e) - 1);
    const lo = edges[i]!;
    const hi = edges[i + 1] ?? lo + 1;
    return Math.min(100, Math.max(0, ((i + (dbz - lo) / (hi - lo)) / RAIN_LEVELS.length) * 100));
  };
  const stops = RAMP_STOPS.slice(1).map((s) => {
    const [r, g, b] = hex(s.color);
    return `rgba(${r},${g},${b},${Math.max(s.alpha, 0.8).toFixed(2)}) ${at(s.dbz).toFixed(1)}%`;
  });
  return `linear-gradient(90deg,${stops.join(',')})`;
}

// ---------- smoothing ----------
/** Bilinear upsample by an integer factor (pixel centres aligned). */
export function upsample(src: Float32Array, w: number, h: number, f: number): Float32Array {
  const W = w * f;
  const H = h * f;
  const out = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    const sy = Math.min(h - 1, Math.max(0, (y + 0.5) / f - 0.5));
    const y0 = Math.floor(sy);
    const y1 = Math.min(h - 1, y0 + 1);
    const ty = sy - y0;
    for (let x = 0; x < W; x++) {
      const sx = Math.min(w - 1, Math.max(0, (x + 0.5) / f - 0.5));
      const x0 = Math.floor(sx);
      const x1 = Math.min(w - 1, x0 + 1);
      const tx = sx - x0;
      const a = src[y0 * w + x0]! * (1 - tx) + src[y0 * w + x1]! * tx;
      const b = src[y1 * w + x0]! * (1 - tx) + src[y1 * w + x1]! * tx;
      out[y * W + x] = a * (1 - ty) + b * ty;
    }
  }
  return out;
}

function boxPass(
  src: Float32Array,
  dst: Float32Array,
  w: number,
  h: number,
  r: number,
  horiz: boolean,
) {
  const n = horiz ? w : h;
  const lines = horiz ? h : w;
  const step = horiz ? 1 : w;
  const norm = 1 / (2 * r + 1);
  for (let l = 0; l < lines; l++) {
    const base = horiz ? l * w : l;
    let acc = 0;
    for (let k = -r; k <= r; k++) acc += src[base + Math.min(n - 1, Math.max(0, k)) * step]!;
    for (let i = 0; i < n; i++) {
      dst[base + i * step] = acc * norm;
      const add = Math.min(n - 1, i + r + 1);
      const sub = Math.max(0, i - r);
      acc += src[base + add * step]! - src[base + sub * step]!;
    }
  }
}

/** ~Gaussian blur (3 box passes per axis); returns a new array. */
export function blur(src: Float32Array, w: number, h: number, r: number): Float32Array {
  if (r < 1) return src.slice();
  const a = src.slice();
  const b = new Float32Array(src.length);
  for (let p = 0; p < 3; p++) {
    boxPass(a, b, w, h, r, true);
    boxPass(b, a, w, h, r, false);
  }
  return a;
}

/** Normalised 1-D Gaussian kernel (radius 3 sigma). */
export function gaussianKernel(sigma: number): Float32Array {
  const r = Math.max(1, Math.ceil(sigma * 3));
  const k = new Float32Array(2 * r + 1);
  let sum = 0;
  for (let i = -r; i <= r; i++) sum += k[i + r] = Math.exp(-(i * i) / (2 * sigma * sigma));
  for (let i = 0; i < k.length; i++) k[i]! /= sum;
  return k;
}

/** True separable Gaussian blur (edge-clamped); returns a new array. */
export function gaussianBlur(src: Float32Array, w: number, h: number, sigma: number): Float32Array {
  if (sigma <= 0) return src.slice();
  const k = gaussianKernel(sigma);
  const r = (k.length - 1) / 2;
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let i = -r; i <= r; i++)
        acc += src[row + Math.min(w - 1, Math.max(0, x + i))]! * k[i + r]!;
      tmp[row + x] = acc;
    }
  }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let i = -r; i <= r; i++)
        acc += tmp[Math.min(h - 1, Math.max(0, y + i)) * w + x]! * k[i + r]!;
      out[y * w + x] = acc;
    }
  return out;
}

/** Interleaved gradient noise in [0, 1): cheap blue-ish noise for dithering (no banding). */
export const ditherNoise = (x: number, y: number) => {
  const v = 52.9829189 * ((0.06711056 * x + 0.00583715 * y) % 1);
  return v - Math.floor(v);
};

/** Source-pixel sigma of the radar smoothing (ČHMÚ ~1 km pixels -> soft, continuous field). */
export const RADAR_SIGMA_SRC = 0.9;

/**
 * dBZ field -> continuous RGBA: bilinear upsample x f, separable Gaussian (sigma in source px),
 * fractional ramp lookup (no 1-dBZ steps) and +-0.5/255 dithering against banding.
 */
export function renderField(
  dbz: Float32Array,
  w: number,
  h: number,
  f: number,
  lut: RampLut,
  sigmaSrc = RADAR_SIGMA_SRC,
): { data: Uint8ClampedArray; width: number; height: number } {
  const W = w * f;
  const H = h * f;
  const field = gaussianBlur(upsample(dbz, w, h, f), W, H, sigmaSrc * f);
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const d = Math.min(64, Math.max(0, field[i]!));
      if (d < FADE_START) continue;
      const d0 = Math.min(63, Math.floor(d));
      const t = d - d0;
      const n = ditherNoise(x, y) - 0.5;
      for (let c = 0; c < 4; c++) {
        const v = lut[d0 * 4 + c]! * (1 - t) + lut[(d0 + 1) * 4 + c]! * t;
        data[i * 4 + c] = v + n;
      }
    }
  return { data, width: W, height: H };
}

// ---------- smooth chart curve ----------
/**
 * Monotone cubic (Fritsch-Carlson) tangents: the interpolant never overshoots its knots, so a
 * rain curve never dips below 0 mm/h or above its peak between samples.
 */
export function monotoneTangents(xs: number[], ys: number[]): number[] {
  const n = xs.length;
  const m = new Array<number>(n).fill(0);
  if (n < 2) return m;
  const d = xs.slice(1).map((x, i) => (ys[i + 1]! - ys[i]!) / Math.max(1e-9, x - xs[i]!));
  m[0] = d[0]!;
  m[n - 1] = d[n - 2]!;
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1]! * d[i]! <= 0 ? 0 : (d[i - 1]! + d[i]!) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i]! / d[i]!;
    const b = m[i + 1]! / d[i]!;
    const s = a * a + b * b;
    if (s > 9) {
      const tau = 3 / Math.sqrt(s);
      m[i] = tau * a * d[i]!;
      m[i + 1] = tau * b * d[i]!;
    }
  }
  return m;
}

/** Evaluate the monotone cubic through (xs, ys) at x. */
export function monotoneAt(xs: number[], ys: number[], x: number, m = monotoneTangents(xs, ys)) {
  const n = xs.length;
  if (x <= xs[0]!) return ys[0]!;
  if (x >= xs[n - 1]!) return ys[n - 1]!;
  let i = 0;
  while (i < n - 2 && x > xs[i + 1]!) i++;
  const h = xs[i + 1]! - xs[i]! || 1e-9;
  const t = (x - xs[i]!) / h;
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    (2 * t3 - 3 * t2 + 1) * ys[i]! +
    (t3 - 2 * t2 + t) * h * m[i]! +
    (-2 * t3 + 3 * t2) * ys[i + 1]! +
    (t3 - t2) * h * m[i + 1]!
  );
}

/** SVG path (cubic Béziers) of the monotone curve through the points. */
export function monotonePath(pts: readonly (readonly [number, number])[]): string {
  if (!pts.length) return '';
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const m = monotoneTangents(xs, ys);
  const f = (v: number) => String(Math.round(v * 100) / 100);
  let d = `M${f(xs[0]!)} ${f(ys[0]!)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const h = (xs[i + 1]! - xs[i]!) / 3;
    d += `C${f(xs[i]! + h)} ${f(ys[i]! + m[i]! * h)} ${f(xs[i + 1]! - h)} ${f(ys[i + 1]! - m[i + 1]! * h)} ${f(xs[i + 1]!)} ${f(ys[i + 1]!)}`;
  }
  return d;
}

// ---------- minute precipitation ----------
/** Marshall-Palmer Z = 200 R^1.6 (same as radar.py dbz_to_mmh). */
export const dbzToMmh = (dbz: number) => (dbz <= 0 ? 0 : (10 ** (dbz / 10) / 200) ** (1 / 1.6));

export type RainWord = 'žádný' | 'slabý' | 'mírný' | 'silný' | 'přívalový';
/** Thresholds (mm/h) shared by the chart guides, the legend and the headline. */
export const RAIN_LEVELS: { mmh: number; word: RainWord }[] = [
  { mmh: 0.1, word: 'slabý' },
  { mmh: 2.5, word: 'mírný' },
  { mmh: 10, word: 'silný' },
  { mmh: 50, word: 'přívalový' },
];
export function rainWord(mmh: number | null | undefined): RainWord {
  if (mmh == null || mmh < RAIN_LEVELS[0]!.mmh) return 'žádný';
  let w: RainWord = 'slabý';
  for (const l of RAIN_LEVELS) if (mmh >= l.mmh) w = l.word;
  return w;
}

/** Chart y (0..1) for an intensity: log-like so drizzle is visible and storms fit. */
export const mmhToY = (mmh: number) => Math.min(1, Math.log1p(Math.max(0, mmh)) / Math.log1p(25));

/**
 * Chart ceiling (mm/h) for the next-hour sparkline. Weak rain gets a lower ceiling so the line
 * uses the chart height, but never below the 'mírný' threshold: the top band edge always is a
 * real intensity threshold, so the band labels stay honest.
 */
export function chartTopMmh(peak: number): number {
  const moderate = RAIN_LEVELS[1]!.mmh;
  const heavy = RAIN_LEVELS[2]!.mmh;
  if (peak < moderate) return moderate;
  if (peak < heavy) return heavy;
  return CHART_MAX_MMH;
}
/** Chart y (0..1) for an intensity under a given ceiling. */
export const chartY = (mmh: number, top: number) => Math.min(1, mmhToY(mmh) / mmhToY(top));

/** Chart ceiling for heavy rain (the curve clips above, 'přívalový' is beyond the chart). */
export const CHART_MAX_MMH = 25;
/** Chart bands [word, from, to] derived from RAIN_LEVELS, so headline word == chart band. */
export const BANDS: [RainWord, number, number][] = RAIN_LEVELS.slice(0, 3).map((l, i) => [
  l.word,
  l.mmh,
  Math.min(CHART_MAX_MMH, RAIN_LEVELS[i + 1]!.mmh),
]);
/** Guide lines (mm/h) drawn in the chart: every band start above the lowest one. */
export const CHART_GUIDES = BANDS.slice(1).map(([, lo]) => lo);
/** Chart band word for an intensity: the same classifier the headline uses. */
export function chartBandAt(mmh: number): RainWord {
  const b = BANDS.filter(([, lo]) => mmh >= lo).pop();
  return b ? (mmh >= RAIN_LEVELS[3]!.mmh ? RAIN_LEVELS[3]!.word : b[0]) : 'žádný';
}
/**
 * Band labels for a chart ceiling: bands below the ceiling sit mid-band; the band that starts
 * exactly at the ceiling is pinned to the top edge (`edge`), marking the threshold line.
 */
export function chartBands(top: number): { word: RainWord; y: number; edge: boolean }[] {
  return BANDS.filter(([, lo]) => lo <= top).map(([word, lo, hi]) =>
    lo >= top
      ? { word, y: 1, edge: true }
      : { word, y: (chartY(lo, top) + chartY(Math.min(hi, top), top)) / 2, edge: false },
  );
}

export interface MinutePoint {
  min: number;
  mmh: number;
}
/**
 * Next-60-minute intensity at home, one point per minute, linearly interpolated from the
 * radar nowcast profile (5-min leads) or, without radar, from the 15-min model slots.
 */
export function minuteSeries(
  profile: { lead_min: number; dbz: number }[] | undefined,
  slots: { t: string; mmh: number | null }[],
  nowMs: number,
): MinutePoint[] | null {
  let pts: { min: number; mmh: number }[] = [];
  if (profile && profile.length >= 2) {
    pts = profile.map((p) => ({ min: p.lead_min, mmh: dbzToMmh(p.dbz) }));
  } else {
    pts = slots
      .filter((s) => s.mmh != null)
      .map((s) => ({ min: (Date.parse(s.t) - nowMs) / 60000, mmh: s.mmh! }))
      .filter((p) => p.min > -15 && p.min <= 75);
  }
  if (pts.length < 2) return null;
  pts.sort((a, b) => a.min - b.min);
  // Smooth between the 5-min leads, but never overshooting (no fake dips or peaks).
  const xs = pts.map((p) => p.min);
  const ys = pts.map((p) => p.mmh);
  const tang = monotoneTangents(xs, ys);
  const out: MinutePoint[] = [];
  for (let m = 0; m <= 60; m++) {
    const j = pts.findIndex((p) => p.min >= m);
    let v: number;
    if (j <= 0) v = j === 0 ? pts[0]!.mmh : pts[pts.length - 1]!.mmh;
    else {
      const a = pts[j - 1]!;
      const b = pts[j]!;
      // Dry -> wet: rain starts at the first wet lead (matches the nowcast ETA), no early ramp.
      v =
        a.mmh < RAIN_LEVELS[0]!.mmh && b.mmh >= RAIN_LEVELS[0]!.mmh && m < b.min
          ? 0
          : monotoneAt(xs, ys, m, tang);
    }
    out.push({ min: m, mmh: Math.max(0, Math.round(v * 100) / 100) });
  }
  return out;
}

const RAINING: Record<RainWord, string> = {
  žádný: 'Slabě prší',
  slabý: 'Slabě prší',
  mírný: 'Prší',
  silný: 'Silně prší',
  přívalový: 'Přívalový déšť',
};

/** Peak intensity the headline describes (same wet points the chart draws). */
export function headlinePeak(series: MinutePoint[] | null): number {
  return (series ?? [])
    .filter((p) => p.mmh >= RAIN_LEVELS[0]!.mmh)
    .reduce((m, p) => Math.max(m, p.mmh), 0);
}

/** Headline for the hero chart, e.g. „Déšť za ~35 min, slabý“. */
export function minuteHeadline(
  series: MinutePoint[] | null,
  status: string,
  etaMin: number | null | undefined,
  endMin: number | null | undefined,
  approx = '~',
): string {
  if (status === 'unknown' && !series) return 'Krátkodobá předpověď srážek není k dispozici';
  const wet = series?.filter((p) => p.mmh >= RAIN_LEVELS[0]!.mmh) ?? [];
  const word = rainWord(headlinePeak(series));
  if (status === 'raining' || status === 'stopping' || (series && series[0]!.mmh >= 0.1)) {
    const end = endMin ?? series?.find((p) => p.min > 0 && p.mmh < 0.1)?.min ?? null;
    const now = rainWord(series?.[0]?.mmh ?? headlinePeak(series));
    const raining = RAINING[now === 'žádný' ? word : now];
    return end != null && end <= 60
      ? `${raining}, přestane za ${approx}${end} min`
      : `${raining} celou příští hodinu`;
  }
  const eta = etaMin ?? wet[0]?.min ?? null;
  if (eta != null && eta <= 60 && wet.length) return `Déšť za ${approx}${eta} min, ${word}`;
  return 'V příští hodině bez srážek';
}

/** Bounding box [x0, y0, x1, y1] of an SVG path made of M/L commands with absolute coords. */
export function pathBBox(d: string): [number, number, number, number] {
  const n = d.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (let i = 0; i + 1 < n.length; i += 2) {
    x0 = Math.min(x0, n[i]!);
    x1 = Math.max(x1, n[i]!);
    y0 = Math.min(y0, n[i + 1]!);
    y1 = Math.max(y1, n[i + 1]!);
  }
  return [x0, y0, x1, y1];
}

/**
 * View box that shows the whole country: bbox padded by `pad` (fraction) on each side, plus
 * `bottom` extra (fraction of height) for the scale bar, widened/heightened to `aspect`.
 */
export function fitBox(
  bb: [number, number, number, number],
  aspect: number,
  pad = 0.04,
  bottom = 0.08,
): [number, number, number, number] {
  const [x0, y0, x1, y1] = bb;
  const bw = (x1 - x0) * (1 + 2 * pad);
  const bh = (y1 - y0) * (1 + 2 * pad + bottom);
  const w = Math.max(bw, bh * aspect);
  const h = w / aspect;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2 + ((y1 - y0) * bottom) / 2;
  return [cx - w / 2, cy - h / 2, w, h];
}

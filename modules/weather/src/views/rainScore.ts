/** Wording and statistics of the precipitation scores in „Kdo se trefuje“ (pure). */
import type { CategoricalScore, PrecipVerificationRow } from '../contract.js';

/** Same gates as the integration (const.py PRECIP_MIN_PAIRS / PRECIP_MIN_WET). */
export const PRECIP_MIN_PAIRS = 240;
export const PRECIP_MIN_WET = 12;
/** Below this many distinct wet hours at the best source the whole ranking is only indicative. */
export const RAIN_FEW_WET_HOURS = 40;
/** Grade bands of hourly ETS (≥ 0,2 mm/h). */
export const ETS_GOOD = 0.4;
export const ETS_MID = 0.2;
/** Two-sided 95 % normal quantile for the noise threshold of a score difference. */
const Z95 = 1.96;

/**
 * Verbal ETS grade (hourly rain ≥ 0,2 mm/h), neuter to agree with „skóre“. Hourly ETS of NWP vs. one gauge rarely exceeds
 * 0,5, so ≥ 0,4 is already good; below 0,2 the model is barely better than chance.
 */
export function etsGrade(raw: number | null): { word: string; tone: 'good' | 'mid' | 'weak' } {
  // graded on the shown (2-decimal) score, so „0,40“ is never „průměrné“
  const ets = raw == null ? null : Math.round(raw * 100) / 100;
  if (ets != null && ets >= ETS_GOOD) return { word: 'dobré', tone: 'good' };
  if (ets != null && ets >= ETS_MID) return { word: 'průměrné', tone: 'mid' };
  return { word: 'slabé', tone: 'weak' };
}

type Table = Pick<CategoricalScore, 'a' | 'b' | 'c' | 'd'>;

/** ETS (Gilbert skill score) of a 2×2 table; null when undefined (no event, no forecast). */
export function etsOf({ a, b, c, d }: Table): number | null {
  const n = a + b + c + d;
  if (n <= 0) return null;
  const ar = ((a + b) * (a + c)) / n;
  const den = a + b + c - ar;
  return den > 0 ? (a - ar) / den : null;
}

/**
 * Standard error of ETS by the delta method on the multinomial cell proportions p = (a,b,c,d)/n.
 * ETS is homogeneous of degree 0 in the counts, so Σ gᵢpᵢ = 0 (Euler) and
 * Var = Σ gᵢ² pᵢ / n with g = ∂ETS/∂p (central differences). Cheap enough for every render;
 * `etsBootstrapSe` (tests) confirms it against resampled tables.
 */
export function etsSe(t: Table): number | null {
  const n = t.a + t.b + t.c + t.d;
  if (n <= 0 || etsOf(t) == null) return null;
  const p = [t.a / n, t.b / n, t.c / n, t.d / n];
  const f = (q: number[]) => etsOf({ a: q[0]!, b: q[1]!, c: q[2]!, d: q[3]! }) ?? 0;
  const h = 1e-6;
  let v = 0;
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) continue;
    const up = [...p];
    const dn = [...p];
    up[i]! += h;
    dn[i]! -= h;
    const g = (f(up) - f(dn)) / (2 * h);
    v += g * g * p[i]!;
  }
  return Math.sqrt(v / n);
}

/** Seeded multinomial bootstrap of the ETS standard error (reference for tests, O(reps·n)). */
export function etsBootstrapSe(t: Table, reps = 2000, seed = 1): number {
  const n = t.a + t.b + t.c + t.d;
  let s = seed >>> 0 || 1;
  const rnd = () => {
    // xorshift32
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
  const cut = [t.a / n, (t.a + t.b) / n, (t.a + t.b + t.c) / n];
  const xs: number[] = [];
  for (let r = 0; r < reps; r++) {
    const k = { a: 0, b: 0, c: 0, d: 0 };
    for (let i = 0; i < n; i++) {
      const u = rnd();
      if (u < cut[0]!) k.a++;
      else if (u < cut[1]!) k.b++;
      else if (u < cut[2]!) k.c++;
      else k.d++;
    }
    const e = etsOf(k);
    if (e != null) xs.push(e);
  }
  const m = xs.reduce((x, y) => x + y, 0) / xs.length;
  return Math.sqrt(xs.reduce((x, y) => x + (y - m) ** 2, 0) / (xs.length - 1));
}

/**
 * Smallest ETS difference between two sources that is not noise (95 %). The two samples are
 * treated as independent, which overstates the noise of a paired comparison (the sources are
 * scored on largely the same hours) – conservative: a tie is shown rather than a false winner.
 */
export function noiseThreshold(x: Table, y: Table): number | null {
  const a = etsSe(x);
  const b = etsSe(y);
  return a == null || b == null ? null : Z95 * Math.sqrt(a * a + b * b);
}

/** Scores and the noise threshold are compared as shown on the card (2 decimals). */
export const round2 = (v: number) => Math.round(v * 100) / 100;

export interface RankedRow {
  row: PrecipVerificationRow;
  ets: number | null;
  /** Plain rank by the shown score (1, 2, 3 …); only equal shown scores share one. */
  rank: number;
  /** Shown score difference to the row above (2 decimals); null for the first row. */
  diffPrev: number | null;
  /** The row above is closer than the noise threshold: „≈“ between the two, order not reliable. */
  nearPrev: boolean;
}

export interface PrecipRanking {
  rows: RankedRow[];
  /** The one noise threshold of the whole ranking (2 decimals), null with < 2 scored sources. */
  noise: number | null;
}

/**
 * Ranking by hourly ETS ≥ 0,2 mm/h. No shared ranks or tie groups: every source gets its plain
 * rank and „≈“ marks each pair of neighbours whose shown scores differ by less than the noise
 * threshold – a rule a reader can check on any adjacent pair from the numbers on the card.
 * One threshold for the whole table – the largest pairwise `noiseThreshold` among the ranked
 * sources (conservative: „≈“ rather than a false winner). Scores and threshold are rounded to
 * 2 decimals first, exactly as the card shows them.
 */
export function rankPrecip(rows: PrecipVerificationRow[]): PrecipRanking {
  const sorted = rows
    .map((row) => ({ row, ets: row.hourly['0.2']?.ets ?? null }))
    .sort((p, q) => (q.ets ?? -1) - (p.ets ?? -1));
  let max: number | null = null;
  for (let i = 0; i < sorted.length; i++)
    for (let j = i + 1; j < sorted.length; j++) {
      const x = sorted[i]!.row.hourly['0.2'];
      const y = sorted[j]!.row.hourly['0.2'];
      const t = x && y ? noiseThreshold(x, y) : null;
      if (t != null && (max == null || t > max)) max = t;
    }
  const noise = max == null ? null : round2(max);
  const shown = (v: number | null) => (v == null ? null : round2(v));
  const out = sorted.map((s, i): RankedRow => {
    const prev = i > 0 ? sorted[i - 1]! : null;
    const a = shown(prev?.ets ?? null);
    const b = shown(s.ets);
    const diffPrev = a != null && b != null ? round2(a - b) : null;
    return {
      ...s,
      rank: 1 + sorted.filter((o) => (shown(o.ets) ?? -1) > (b ?? -1)).length,
      diffPrev,
      nearPrev: diffPrev != null && noise != null && diffPrev < noise,
    };
  });
  return { rows: out, noise };
}

export const wetHours = (r: PrecipVerificationRow) => r.wet_hours ?? r.n_wet;
export const sampleDays = (r: PrecipVerificationRow) => r.days ?? r.n_days;

/** Most common (wet hours, days) among the rows – stated once in the header. */
export function commonSample(rows: PrecipVerificationRow[]): { wet: number; days: number } | null {
  const count = new Map<string, number>();
  for (const r of rows) {
    const k = `${wetHours(r)}|${sampleDays(r)}`;
    count.set(k, (count.get(k) ?? 0) + 1);
  }
  let best: string | null = null;
  for (const [k, c] of count) if (best == null || c > count.get(best)!) best = k;
  if (best == null) return null;
  const [wet, days] = best.split('|').map(Number);
  return { wet: wet!, days: days! };
}

/** "x z 10": a rate as a count out of ten (lay reading of POD / FAR). */
export const outOfTen = (v: number | null | undefined) => (v == null ? null : Math.round(v * 10));

/**
 * What still blocks a score, with numbers – only the gates that are actually unmet
 * (pairs = forecast–measurement comparisons, wet = comparisons with rain).
 */
export function fewBlocker(r: Pick<PrecipVerificationRow, 'n' | 'n_wet'>): string {
  const parts: string[] = [];
  if (r.n < PRECIP_MIN_PAIRS) parts.push(`${r.n} z ${PRECIP_MIN_PAIRS} potřebných porovnání`);
  if (r.n_wet < PRECIP_MIN_WET)
    parts.push(`${r.n_wet} z ${PRECIP_MIN_WET} potřebných porovnání s deštěm`);
  return parts.length ? `zatím málo dat: ${parts.join(' a ')}` : 'zatím málo dat';
}

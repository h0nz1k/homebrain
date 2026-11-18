import type { HistoryDay, WeatherSnapshot } from '../contract.js';

/** Same rule as the integration (const DRY_DAY_MM): a day below this is dry. */
export const DRY_DAY_MM = 0.2;
/** A "rain day" in window summaries (climatological convention ≥ 1 mm). */
export const RAIN_DAY_MM = 1;
/** Gusts from this speed are highlighted (warning colour) – ČHMÚ "silný vítr" starts at 15 m/s. */
export const GUST_STRONG_MS = 15;

export type DeltaKey = 't' | 'rain' | 'gust' | 'msl';
/**
 * "Včera a dnes" delta column: a change smaller than this counts as no change (≈), so
 * sensor noise and rounding never read as a trend. °C / mm / m/s / hPa.
 */
export const DELTA_NEUTRAL: Record<DeltaKey, number> = { t: 0.5, rain: 0.2, gust: 1, msl: 1 };

export type Delta =
  { kind: 'missing' } | { kind: 'same'; v: number } | { kind: 'up' | 'down'; v: number };

/** Today vs. yesterday; |Δ| below DELTA_NEUTRAL[key] is "same". */
export function delta(today: number | null, yesterday: number | null, key: DeltaKey): Delta {
  if (today == null || yesterday == null) return { kind: 'missing' };
  const v = Math.round((today - yesterday) * 10) / 10;
  if (Math.abs(v) < DELTA_NEUTRAL[key]) return { kind: 'same', v };
  return { kind: v > 0 ? 'up' : 'down', v: Math.abs(v) };
}

const NICE = [1, 2, 2.5, 5, 10];
/** Smallest "nice" number (1, 2, 2.5, 5 × 10^k) that is ≥ v. */
export function niceCeil(v: number): number {
  if (!(v > 0)) return 1;
  const mag = 10 ** Math.floor(Math.log10(v));
  return (NICE.find((m) => m * mag >= v - 1e-9) ?? 10) * mag;
}

/**
 * Axis ticks for a temperature range: 2–3 round values inside [lo, hi] (step 1/2/5/10/20 °C),
 * always including 0 °C when the range crosses it.
 */
export function tempTicks(lo: number, hi: number): number[] {
  for (const step of [1, 2, 5, 10, 20, 50]) {
    const first = Math.ceil(lo / step) * step + 0; // + 0 turns −0 into 0
    const ticks: number[] = [];
    for (let v = first; v <= hi + 1e-9; v += step) ticks.push(v);
    if (ticks.length <= 3) {
      if (ticks.length === 0) return [Math.round((lo + hi) / 2)];
      return ticks;
    }
  }
  return [lo, hi];
}

const complete = (d: HistoryDay) => !d.partial;
const rainKnown = (d: HistoryDay) => d.rain != null && !d.gaps.includes('rain');

export interface DryStreak {
  /** Consecutive dry days ending yesterday. */
  days: number;
  /** false = the count stopped at a data gap or the start of the data ("at least"). */
  exact: boolean;
  /** Date of the last day with rain (if within the data). */
  lastWet: string | null;
  /** Today's rain so far already breaks the streak. */
  todayWet: boolean;
}

/** Dry days counted back from yesterday; a gap stops the count, it never counts as dry. */
export function dryStreak(days: HistoryDay[], todayRain: number | null): DryStreak {
  const past = days.filter(complete);
  let n = 0;
  let exact = false;
  let lastWet: string | null = null;
  for (let i = past.length - 1; i >= 0; i--) {
    const d = past[i]!;
    if (d.rain != null && d.rain >= DRY_DAY_MM) {
      // even a partial sum above the threshold proves a wet day
      exact = true;
      lastWet = d.date;
      break;
    }
    if (!rainKnown(d)) break;
    n++;
  }
  return { days: n, exact, lastWet, todayWet: todayRain != null && todayRain >= DRY_DAY_MM };
}

export interface DaySummary {
  t_min: number | null;
  t_max: number | null;
  t_mean: number | null;
  rain: number | null;
  gust_max: number | null;
  msl_mean: number | null;
  gaps: string[];
  partial: boolean;
}

const pick = (d: HistoryDay | undefined): DaySummary | null =>
  d
    ? {
        t_min: d.t_min,
        t_max: d.t_max,
        t_mean: d.t_mean,
        rain: d.rain,
        gust_max: d.gust_max,
        msl_mean: d.msl_mean,
        gaps: d.gaps,
        partial: d.partial,
      }
    : null;

const minOf = (...v: (number | null | undefined)[]) => {
  const xs = v.filter((x): x is number => x != null);
  return xs.length ? Math.min(...xs) : null;
};
const maxOf = (...v: (number | null | undefined)[]) => {
  const xs = v.filter((x): x is number => x != null);
  return xs.length ? Math.max(...xs) : null;
};

/**
 * Yesterday as recorded + today so far. Today's statistics lag (last compiled hour), so the
 * live station (today's extremes since start, daily rain counter) refines them.
 */
export function yesterdayToday(
  days: HistoryDay[],
  d: WeatherSnapshot | null,
  today: string,
): { yesterday: DaySummary | null; today: DaySummary | null; yesterdayDate: string | null } {
  const idx = days.findIndex((x) => x.date === today);
  const todayRow = idx >= 0 ? days[idx] : undefined;
  const prev = (idx >= 0 ? days.slice(0, idx) : days).filter(complete);
  const yRow = prev[prev.length - 1];
  const t = pick(todayRow);
  const live = d?.station.derived;
  const liveRain = d?.station.values.rain_today?.v;
  const merged: DaySummary | null =
    t || live
      ? {
          t_min: minOf(t?.t_min, live?.today_min?.v),
          t_max: maxOf(t?.t_max, live?.today_max?.v),
          t_mean: t?.t_mean ?? null,
          rain: typeof liveRain === 'number' ? liveRain : (t?.rain ?? null),
          gust_max: t?.gust_max ?? null,
          msl_mean: t?.msl_mean ?? null,
          gaps: t?.gaps ?? [],
          partial: true,
        }
      : null;
  return { yesterday: pick(yRow), today: merged, yesterdayDate: yRow?.date ?? null };
}

export interface WindowStats {
  days: number;
  /** Days whose rain total is known (denominator of rainDays). */
  rainKnownDays: number;
  /** Days with at least one bound variable missing hours. */
  gapDays: number;
  rain: number | null;
  rainDays: number;
  t_mean: number | null;
  t_min: { v: number; date: string } | null;
  t_max: { v: number; date: string } | null;
}

/** Summary of the last `n` days (today included as partial). Gaps are counted, not filled. */
export function windowStats(days: HistoryDay[], n: number): WindowStats {
  const w = days.slice(-n);
  const known = w.filter((d) => d.rain != null);
  const means = w.map((d) => d.t_mean).filter((v): v is number => v != null);
  let tMin: WindowStats['t_min'] = null;
  let tMax: WindowStats['t_max'] = null;
  for (const d of w) {
    if (d.t_min != null && (!tMin || d.t_min < tMin.v)) tMin = { v: d.t_min, date: d.date };
    if (d.t_max != null && (!tMax || d.t_max > tMax.v)) tMax = { v: d.t_max, date: d.date };
  }
  return {
    days: w.length,
    rainKnownDays: known.length,
    gapDays: w.filter((d) => !d.partial && d.gaps.length > 0).length,
    rain: known.length ? Math.round(known.reduce((s, d) => s + d.rain!, 0) * 10) / 10 : null,
    rainDays: w.filter((d) => (d.rain ?? 0) >= RAIN_DAY_MM).length,
    t_mean: means.length
      ? Math.round((means.reduce((s, v) => s + v, 0) / means.length) * 10) / 10
      : null,
    t_min: tMin,
    t_max: tMax,
  };
}

export type RecordKey = 't_max' | 't_min' | 'rain' | 'gust_max';
export interface Records {
  days: number;
  values: Record<RecordKey, { v: number; date: string } | null>;
}

/** Highest / lowest values in the days whose date starts with `prefix` ("2026-10" / "2026"). */
export function records(days: HistoryDay[], prefix: string): Records {
  return recordsOf(days.filter((d) => d.date.startsWith(prefix)));
}

/** Highest / lowest values in exactly these days (e.g. the selected window). */
export function recordsOf(scope: HistoryDay[]): Records {
  const best = (key: RecordKey, lowest = false) => {
    let out: { v: number; date: string } | null = null;
    for (const d of scope) {
      const v = d[key];
      if (v == null) continue;
      if (!out || (lowest ? v < out.v : v > out.v)) out = { v, date: d.date };
    }
    return out;
  };
  return {
    days: scope.length,
    values: {
      t_max: best('t_max'),
      t_min: best('t_min', true),
      rain: best('rain'),
      gust_max: best('gust_max'),
    },
  };
}

/**
 * Period comparison (Energie „Srovnání“): this month and year-to-date vs last year and the
 * previous month. The integration aggregates hourly recorder statistics server-side
 * (`homebrain/energy/compare`); this file only types the reply and formats it.
 */
import type { ConnectionLike } from '@homebrain/ha-client';

export type CompareSeriesKey = 'house' | 'pv' | 'import' | 'export' | 'cost';
export type ComparePeriod = 'month' | 'ytd';

export interface CompareSeries {
  month: { current: number | null; last_year: number | null; previous: number | null };
  ytd: { current: number | null; last_year: number | null };
  /** 12 values per year (January first); null = no data for that month. */
  monthly: { this_year: Array<number | null>; last_year: Array<number | null> };
  /** First recorded hour (ISO, local offset) or null. */
  first: string | null;
}

export interface ComparePartial {
  day: number;
  hour: number;
  days_in_month: number;
}

export interface ComparisonResult {
  status: 'ok';
  time_zone: string;
  now: string;
  year: number;
  month: number;
  partial: ComparePartial;
  windows: Record<ComparePeriod, Record<string, [string, string]>>;
  series: Partial<Record<CompareSeriesKey, CompareSeries>>;
  cost_basis: { vt: number; nt: number | null; fixed_monthly: number | null; hdo: boolean } | null;
}

export type Comparison =
  ComparisonResult | { status: 'unconfigured' | 'unsupported' | 'error' | 'loading' };

export const COMPARE_SERIES: ReadonlyArray<{
  key: CompareSeriesKey;
  label: string;
  short: string;
  /** Which direction is good for the household. */
  better: 'lower' | 'higher';
  color: string;
}> = [
  {
    key: 'house',
    label: 'Spotřeba domu',
    short: 'Spotřeba',
    better: 'lower',
    color: 'var(--hb-energy-home)',
  },
  {
    key: 'cost',
    label: 'Náklady na elektřinu',
    short: 'Náklady',
    better: 'lower',
    color: 'var(--hb-warn)',
  },
  {
    key: 'pv',
    label: 'Výroba FVE',
    short: 'Výroba',
    better: 'higher',
    color: 'var(--hb-energy-pv)',
  },
  {
    key: 'import',
    label: 'Nákup ze sítě',
    short: 'Nákup',
    better: 'lower',
    color: 'var(--hb-energy-grid)',
  },
  {
    key: 'export',
    label: 'Prodej do sítě',
    short: 'Prodej',
    better: 'higher',
    color: 'var(--hb-ok)',
  },
];

const MONTHS = [
  'leden',
  'únor',
  'březen',
  'duben',
  'květen',
  'červen',
  'červenec',
  'srpen',
  'září',
  'říjen',
  'listopad',
  'prosinec',
];
const MONTHS_SHORT = [
  'led',
  'úno',
  'bře',
  'dub',
  'kvě',
  'čvn',
  'čvc',
  'srp',
  'zář',
  'říj',
  'lis',
  'pro',
];
const NBSP = '\u00a0';

/** Czech month name for 1–12. */
export function monthName(month: number, form: 'long' | 'short' = 'long'): string {
  return (form === 'short' ? MONTHS_SHORT : MONTHS)[(month - 1 + 12) % 12]!;
}

export interface CompareDelta {
  diff: number;
  /** Percent change vs the baseline (1 decimal); null when the baseline is 0. */
  pct: number | null;
}

/** Change of `current` against `base`; null when either side has no data. */
export function compareDelta(current: number | null, base: number | null): CompareDelta | null {
  if (current === null || base === null) return null;
  const diff = Math.round((current - base) * 10) / 10;
  if (base === 0) return { diff, pct: null };
  return { diff, pct: Math.round(((current - base) / base) * 1000) / 10 };
}

/** '+14 %', '−8 %', '±0 %' (rounded to whole percent); '' without a percentage. */
export function formatDelta(delta: CompareDelta | null): string {
  if (!delta || delta.pct === null) return '';
  const whole = Math.round(delta.pct);
  if (whole === 0) return `±0${NBSP}%`;
  return `${whole > 0 ? '+' : '\u2212'}${Math.abs(whole)}${NBSP}%`;
}

/** ok = good for the household, warn = worse, flat = within ±1 %. */
export function deltaTone(
  key: CompareSeriesKey,
  delta: CompareDelta | null,
): 'ok' | 'warn' | 'flat' {
  if (!delta || delta.pct === null || Math.abs(delta.pct) < 1) return 'flat';
  const better = COMPARE_SERIES.find((s) => s.key === key)?.better ?? 'lower';
  return delta.pct < 0 === (better === 'lower') ? 'ok' : 'warn';
}

const group = (value: number, digits: number) =>
  new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: digits, minimumFractionDigits: digits })
    .format(value)
    .replace(/\s/g, NBSP);

/** '259,9 kWh', '11 872 kWh', '880 Kč'; '–' without data. */
export function formatCompareValue(value: number | null, key: CompareSeriesKey): string {
  if (value === null) return '–';
  if (key === 'cost') return `${group(Math.round(value), 0)}${NBSP}Kč`;
  return `${group(value, Math.abs(value) >= 1000 ? 0 : 1)}${NBSP}kWh`;
}

/** Last complete day of the compared range (hour 0 = the previous day is the last one). */
const lastDayOf = ({ day, hour }: ComparePartial) => (hour === 0 ? day - 1 : day);
const withHour = (range: string, hour: number) => (hour === 0 ? range : `${range} do ${hour}:00`);
const withYear = (date: string, year?: number) => (year === undefined ? date : `${date} ${year}`);

/**
 * The compared range of a running month: '1.–7. 11. do 16:00' ('1.–7. 11. 2025 do 16:00' with a
 * year). At a full hour 0 the range ends with the previous day ('1.–6. 11.'); null when nothing
 * of the month has elapsed yet.
 */
export function partialRangeLabel(
  partial: ComparePartial,
  month: number,
  year?: number,
): string | null {
  const lastDay = lastDayOf(partial);
  if (lastDay < 1) return null;
  const range = lastDay === 1 ? `1.${NBSP}${month}.` : `1.–${lastDay}.${NBSP}${month}.`;
  return withHour(withYear(range, year), partial.hour);
}

/** Year-to-date range: '1. 1.–7. 11. do 16:00'; null before the first complete hour. */
export function ytdRangeLabel(
  partial: ComparePartial,
  month: number,
  year?: number,
): string | null {
  const lastDay = lastDayOf(partial);
  if (lastDay < 1 && month === 1) return null;
  const end = lastDay < 1 ? `konce ${month - 1}.` : `${lastDay}.${NBSP}${month}.`;
  return withHour(withYear(`1.${NBSP}1.–${end}`, year), partial.hour);
}

/** Days-only scope for headlines: '1.–7. 11.' (month) or '1. 1.–7. 11.' (year to date). */
export function scopeLabel(
  partial: ComparePartial,
  month: number,
  period: ComparePeriod,
): string | null {
  const days = { ...partial, hour: 0, day: lastDayOf(partial) + 1 };
  return period === 'month' ? partialRangeLabel(days, month) : ytdRangeLabel(days, month);
}

/** 'Spotřeba o 8 % nižší než loni za 1.–7. 11.'; null without a percentage. */
export function compareHeadline(
  short: string,
  delta: CompareDelta | null,
  scope: string | null,
): string | null {
  if (!delta || delta.pct === null) return null;
  const whole = Math.round(delta.pct);
  const text =
    whole === 0
      ? `${short} stejně jako loni`
      : `${short} o ${Math.abs(whole)}${NBSP}% ${whole < 0 ? 'nižší' : 'vyšší'} než loni`;
  return scope ? `${text} za ${scope}` : text;
}

/** Round axis ticks from 0 covering `max` (steps 1/2/2,5/5 × 10ⁿ, 3–5 gridlines). */
export function niceTicks(max: number): number[] {
  if (!(max > 0)) return [0, 1];
  const raw = max / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw)!;
  const ticks = [0];
  while (ticks[ticks.length - 1]! < max) ticks.push(Math.round(ticks.length * step * 1000) / 1000);
  return ticks;
}

/** Common bar scale (max) of both years; 1 when there is no data at all. */
export function barScale(years: Array<Array<number | null>>): number {
  const values = years.flat().filter((v): v is number => v !== null);
  return values.length ? Math.max(...values) : 1;
}

/** Ask the integration (read-only, aggregated from recorder statistics). */
export async function fetchComparison(connection: ConnectionLike | null): Promise<Comparison> {
  if (!connection) return { status: 'unsupported' };
  try {
    return await connection.sendMessagePromise<Comparison>({ type: 'homebrain/energy/compare' });
  } catch {
    return { status: 'error' };
  }
}

import { localParts } from '../../adapter.js';
import type { StatPoint } from '../../contract.js';

export const HOUR = 3_600_000;

export function fmt(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '–';
  return new Intl.NumberFormat('cs-CZ', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}
export const hourOf = (ms: number, tz: string) => localParts(ms, tz).hour;
export const weekday = (ms: number, tz: string) =>
  new Intl.DateTimeFormat('cs-CZ', { weekday: 'short', timeZone: tz }).format(new Date(ms));

export const values = (points: StatPoint[] | undefined) => (points ?? []).map((p) => p.value);
export const total = (points: StatPoint[]) => points.reduce((s, p) => s + p.value, 0);

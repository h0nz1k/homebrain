import { SEVERITY_RANK } from './types.js';
import type { Signal } from './types.js';
export function isCalm(ranked: readonly Signal[]): boolean {
  return ranked.every((signal) => SEVERITY_RANK[signal.severity] <= SEVERITY_RANK.info);
}
export function buildCalmSummary({
  now,
  tempC,
  sky,
  ranked,
  timeZone = 'Europe/Prague',
}: {
  now: Date;
  /** IANA zone used for the morning/evening mood; default is the household locale. */
  timeZone?: string;
  tempC?: number;
  sky?: string;
  ranked: readonly Signal[];
}): string {
  // Explicit zone keeps this pure and independent of the host's timezone.
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone }).format(now),
  );
  const critical = ranked.find((signal) => signal.severity === 'critical');
  const warning = ranked.find((signal) => signal.severity === 'warning');
  const mood =
    critical?.title ??
    (warning
      ? hour < 12
        ? 'Rušné ráno'
        : 'Pozor: ' + warning.title
      : hour < 18
        ? 'Klidný den'
        : 'Klidný večer');
  const temperature =
    tempC !== undefined && Number.isFinite(tempC)
      ? `${Math.round(tempC).toLocaleString('cs-CZ')} °C`
      : '';
  const weather = [temperature, sky?.trim()].filter(Boolean).join(', ');
  return [mood, weather, ranked.find((signal) => signal.severity === 'info')?.title]
    .filter(Boolean)
    .join(' · ');
}

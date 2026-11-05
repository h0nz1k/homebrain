import { DEFAULT_NIGHT_HOURS, isWithinNight, type NightHours } from './kiosk.js';
import { TIME_ZONE } from './types.js';

export function parseInstant(iso: string): Date {
  return new Date(iso);
}

/** Local hour as fractional number (e.g. 10.67 for 10:40) in Europe/Prague. */
export function localHourFraction(iso: string, timeZone: string = TIME_ZONE): number {
  const date = parseInstant(iso);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return hour + minute / 60;
}

export function localHour(iso: string, timeZone: string = TIME_ZONE): number {
  return localHourFraction(iso, timeZone);
}

export function isNightDimHour(
  iso: string,
  timeZone: string = TIME_ZONE,
  night: NightHours = DEFAULT_NIGHT_HOURS,
): boolean {
  return isWithinNight(localHourFraction(iso, timeZone), night);
}

/** True when `data.sun` holds real instants (live data may lack `sun.sun`). */
export function hasSunTimes(sun: { sunrise: string; sunset: string }): boolean {
  return Number.isFinite(Date.parse(sun.sunrise)) && Number.isFinite(Date.parse(sun.sunset));
}

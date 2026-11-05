import type { TodayData, WeatherIcon } from './types.js';
import { TIME_ZONE } from './types.js';
import { hasSunTimes, localHourFraction } from './time.js';

export type DayRibbonItem =
  | {
      type: 'band';
      id: string;
      kind: TodayData['ribbon'][number]['kind'];
      startHour: number;
      endHour: number;
      label: string;
      signalId?: string;
    }
  | { type: 'marker'; id: string; hour: number; label: string; kind: 'sunset' | 'event' | 'waste' }
  | { type: 'now'; hour: number };

export type DayRibbonProps = {
  startHour: number;
  endHour: number;
  nowHour: number;
  sunriseHour: number;
  sunsetHour: number;
  items: DayRibbonItem[];
  hourly: Array<{ hour: number; tempC: number; icon: WeatherIcon }>;
};

function isoToHour(iso: string): number {
  return localHourFraction(iso, TIME_ZONE);
}

function roundHour(h: number): number {
  return Math.round(h * 1000) / 1000;
}

export function buildDayRibbonModel(data: TodayData): DayRibbonProps {
  const startHour = 6;
  const sunKnown = hasSunTimes(data.sun);
  const nowHour = isoToHour(data.now);
  let sunriseHour = sunKnown ? isoToHour(data.sun.sunrise) : startHour;
  let sunsetHour = sunKnown ? isoToHour(data.sun.sunset) : 19;

  let endHour = sunsetHour + 2;
  for (const band of data.ribbon) {
    endHour = Math.max(endHour, isoToHour(band.from) + 1);
    if (band.to) endHour = Math.max(endHour, isoToHour(band.to) + 1);
  }
  for (const slot of data.hourly) {
    endHour = Math.max(endHour, isoToHour(slot.time) + 1);
  }
  endHour = Math.min(24, Math.ceil(endHour / 3) * 3);

  const items: DayRibbonItem[] = [];

  for (const entry of data.ribbon) {
    const start = isoToHour(entry.from);
    const end = entry.to ? isoToHour(entry.to) : start + 0.25;
    items.push({
      type: 'band',
      id: entry.id,
      kind: entry.kind,
      startHour: roundHour(start),
      endHour: roundHour(end),
      label: entry.label,
      ...(entry.signalId ? { signalId: entry.signalId } : {}),
    });
  }

  if (sunKnown)
    items.push({
      type: 'marker',
      id: 'sunset',
      hour: roundHour(sunsetHour),
      label: '',
      kind: 'sunset',
    });
  // Without sun times the ribbon gradient stays neutral (no invented dusk).
  else [sunriseHour, sunsetHour] = [startHour, endHour];

  items.push({ type: 'now', hour: roundHour(nowHour) });

  const hourly: DayRibbonProps['hourly'] = [];
  for (let h = startHour; h <= endHour; h += 3) {
    const slot = data.hourly.find((row) => Math.abs(isoToHour(row.time) - h) < 1.5);
    if (slot) {
      hourly.push({ hour: h, tempC: slot.tempC, icon: slot.icon });
    }
  }

  return {
    startHour,
    endHour,
    nowHour: roundHour(nowHour),
    sunriseHour: roundHour(sunriseHour),
    sunsetHour: roundHour(sunsetHour),
    items,
    hourly,
  };
}

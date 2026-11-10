import { fmtNum, fmtT } from './model.js';
import type { HeatingSnapshot } from './types.js';

export type CircuitTone = 'ok' | 'warn' | 'neutral';

export interface FishHeatChip {
  label: string;
  tone: CircuitTone;
  belowTarget: boolean;
}

/** Rybárna state chip from regulation signals (pure). */
export function fishHeatChip(
  fish: NonNullable<HeatingSnapshot['extras']['fish']>,
): FishHeatChip {
  const { temp, target, hysteresis, heating_on, valve_open } = fish;
  const below =
    temp !== null &&
    target !== null &&
    hysteresis !== null &&
    temp < target - hysteresis - 1;
  const warn = below ? 'warn' : 'ok';

  if (heating_on === false) {
    return { label: 'vytápění vypnuto', tone: below ? 'warn' : 'neutral', belowTarget: below };
  }
  if (
    valve_open !== true &&
    temp !== null &&
    target !== null &&
    hysteresis !== null &&
    Math.abs(temp - target) <= hysteresis
  ) {
    return { label: 'v toleranci', tone: 'ok', belowTarget: below };
  }
  if (valve_open === true) {
    return { label: 'topí', tone: warn, belowTarget: below };
  }
  if (
    heating_on === true &&
    valve_open === false &&
    temp !== null &&
    target !== null &&
    temp >= target
  ) {
    return { label: 'netopí – teplo stačí', tone: warn, belowTarget: below };
  }
  if (heating_on === true && valve_open === false) {
    return { label: 'čeká na žádanou', tone: below ? 'warn' : 'neutral', belowTarget: below };
  }
  return { label: '—', tone: 'neutral', belowTarget: below };
}

export function fishPanelVisible(fish: HeatingSnapshot['extras']['fish']): fish is NonNullable<
  typeof fish
> & { temp: number } {
  return fish !== null && fish !== undefined && fish.temp !== null;
}

export function solarPanelVisible(
  solar: HeatingSnapshot['extras']['solar'],
): solar is NonNullable<typeof solar> & { temp: number } {
  return solar !== null && solar !== undefined && solar.temp !== null;
}

export function poolPanelVisible(pool: HeatingSnapshot['extras']['pool']): boolean {
  if (!pool) return false;
  return (
    pool.temp !== null ||
    pool.heating_pump !== null ||
    pool.filter_pump !== null
  );
}

/** 0…1 position on a small target band (for the horizontal scale). */
export function fishBandPos(
  temp: number,
  target: number,
  hysteresis: number,
  span = 4,
): number {
  const lo = target - Math.max(hysteresis, 0.1) - span / 2;
  const hi = target + Math.max(hysteresis, 0.1) + span / 2;
  return Math.max(0, Math.min(1, (temp - lo) / (hi - lo)));
}

export function fishHoldLine(
  target: number | null,
  hysteresis: number | null,
): string | null {
  if (target === null) return null;
  const band =
    hysteresis !== null ? ` ± ${fmtNum(hysteresis)}\u00a0°C` : '';
  return `drží ${fmtT(target)}${band}`;
}

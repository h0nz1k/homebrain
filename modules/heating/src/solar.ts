import type { HeatingSnapshot, SolarThermalState } from './types.js';

export type { SolarThermalState };

export interface SolarSample {
  ts: number;
  collector: number | null;
  tankBottom: number | null;
  pump: boolean | null;
}

const MS_30 = 30 * 60_000;
const HEATING_DELTA = 5;
const NO_GAIN_DELTA = 20;
const TANK_RISE_EPS = 0.3;
const STAGNATION_C = 110;

/** Mirrors backend ``derive_solar_state`` for mock/dev and unit tests. */
export function deriveSolarState(
  collector: number | null,
  tankBottom: number | null,
  pump: boolean | null,
  samples: readonly SolarSample[],
  nowMs: number,
): SolarThermalState {
  const windowStart = nowMs - MS_30;
  const recent = samples.filter((s) => s.ts >= windowStart && s.ts <= nowMs);
  if (
    pump === true &&
    collector !== null &&
    tankBottom !== null &&
    collector >= tankBottom + NO_GAIN_DELTA &&
    recent.length > 0 &&
    nowMs - recent[0]!.ts >= MS_30 &&
    recent.every((s) => s.pump === true)
  ) {
    const bottoms = recent.map((s) => s.tankBottom).filter((t): t is number => t !== null);
    if (bottoms.length && tankBottom - Math.min(...bottoms) <= TANK_RISE_EPS) {
      return 'no_gain';
    }
  }
  if (
    pump === true &&
    collector !== null &&
    tankBottom !== null &&
    collector >= tankBottom + HEATING_DELTA
  ) {
    return 'heating';
  }
  if (pump === false && collector !== null && collector >= STAGNATION_C) {
    return 'stagnation';
  }
  return 'idle';
}

export function solarConfigured(snap: HeatingSnapshot): boolean {
  return snap.extras.solar != null && snap.extras.solar !== undefined;
}

export function solarStateOf(snap: HeatingSnapshot): SolarThermalState | null {
  const solar = snap.extras.solar;
  if (!solar) return null;
  return solar.state ?? null;
}

export const SOLAR_WARN_COPY: Readonly<Record<'no_gain' | 'stagnation', string>> = {
  no_gain:
    'Solár čerpá, ale nádrž se neohřívá – zkontrolujte tlak a odvzdušnění solárního okruhu.',
  stagnation: 'Kolektor je přehřátý a čerpadlo stojí (stagnace).',
};
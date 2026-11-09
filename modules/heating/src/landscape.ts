import type { HeatingSnapshot } from './types.js';
import { fmtNum } from './model.js';

const NBSP = '\u00a0';

/** Average compressor run length (minutes); null when starts or runtime missing. */
export function avgRunLengthMin(runtimeTodayH: number | null, startsToday: number | null): number | null {
  if (
    runtimeTodayH === null ||
    startsToday === null ||
    !Number.isFinite(runtimeTodayH) ||
    !Number.isFinite(startsToday) ||
    startsToday <= 0
  )
    return null;
  return (runtimeTodayH * 60) / startsToday;
}

/** Motohours with NBSP thousands, suffix `` h``. */
export function fmtMotohours(hours: number | null | undefined): string {
  if (hours === null || hours === undefined || !Number.isFinite(hours)) return '–';
  return `${fmtNum(hours, 0)}${NBSP}h`;
}

export interface TankGaugeModel {
  top: number | null;
  bottom: number | null;
  target: number | null;
  hyst: number | null;
  /** 0…1 fill positions along the stratification bar (cold = bottom). */
  topFrac: number | null;
  bottomFrac: number | null;
  bandTopFrac: number | null;
  bandBottomFrac: number | null;
}

const GAUGE_MIN = 24;
const GAUGE_MAX = 55;

function gaugeFrac(temp: number): number {
  return Math.max(0, Math.min(1, (temp - GAUGE_MIN) / (GAUGE_MAX - GAUGE_MIN)));
}

/** Stratification bar geometry from tank snapshot fields (pure). */
export function tankGaugeModel(snap: Pick<HeatingSnapshot, 'tank'>): TankGaugeModel | null {
  const { top, bottom, target, hysteresis } = snap.tank;
  if (top === null && bottom === null) return null;
  const hyst = hysteresis ?? 0;
  return {
    top,
    bottom,
    target,
    hyst: target !== null ? hyst : null,
    topFrac: top !== null ? gaugeFrac(top) : null,
    bottomFrac: bottom !== null ? gaugeFrac(bottom) : null,
    bandTopFrac: target !== null ? gaugeFrac(target + hyst) : null,
    bandBottomFrac: target !== null ? gaugeFrac(target) : null,
  };
}

/** ΔT across heat pump (out − in) when both temps exist. */
export function heatPumpDeltaT(snap: Pick<HeatingSnapshot, 'heat_pump'>): number | null {
  const { condenser_out, return_temp } = snap.heat_pump;
  if (condenser_out === null || return_temp === null) return null;
  return condenser_out - return_temp;
}

export function showAtticTemp(v: number | null): v is number {
  return v !== null && Number.isFinite(v);
}

export function showDhwReheatHint(
  dhw: HeatingSnapshot['dhw'],
): dhw is HeatingSnapshot['dhw'] & { reheat_below: number; target: number } {
  return dhw.reheat_below !== null && dhw.target !== null;
}

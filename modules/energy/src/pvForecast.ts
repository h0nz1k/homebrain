import type { ConnectionLike } from '@homebrain/ha-client';
import { localParts } from './adapter.js';

const MIN = 60_000;
const HOUR = 60 * MIN;

/* ------------------------------------------------------------------ PV forecast */

export interface PvPoint {
  start: number;
  end: number;
  /** Mean expected PV power over the interval (kW). */
  kw: number;
}
export type PvForecastSource = 'ha_energy' | 'open_meteo';
export interface PvForecast {
  /** ok/stale = usable; unconfigured = fallback without panel parameters; empty = all zero. */
  status: 'ok' | 'stale' | 'unconfigured' | 'empty' | 'error' | 'unsupported';
  source: PvForecastSource | null;
  points: PvPoint[];
  /** kWh per local day (YYYY-MM-DD). */
  days: Record<string, number>;
  array?: { kwp: number; tilt: number; azimuth: number; assumed?: string[] } | null;
  system?: PvSystem;
}

export const PV_FORECAST_NONE: PvForecast = {
  status: 'unsupported',
  source: null,
  points: [],
  days: {},
};

const usable = (pv: PvForecast | null | undefined): boolean =>
  !!pv && (pv.status === 'ok' || pv.status === 'stale') && pv.points.length > 0;
export const pvUsable = (pv: PvForecast | null | undefined): pv is PvForecast => usable(pv);

function sumDays(points: PvPoint[], timeZone: string): Record<string, number> {
  const days: Record<string, number> = {};
  for (const p of points) {
    const key = localParts(p.start, timeZone).day;
    days[key] = (days[key] ?? 0) + (p.kw * (p.end - p.start)) / HOUR;
  }
  return days;
}

/**
 * HA core `energy/solar_forecast` (whatever forecast integration is linked in the Energy
 * dashboard, e.g. Forecast.Solar or Solcast): `{entry_id: {wh_hours: {iso: Wh}}}`, summed over
 * entries. Keys are period starts; irregular sunrise/sunset keys end at the next key or the
 * next full hour. An all-zero forecast is treated as `empty` (misconfigured integration).
 */
export function parseHaSolarForecast(raw: unknown, timeZone: string): PvForecast {
  const totals = new Map<number, number>();
  if (raw && typeof raw === 'object')
    for (const entry of Object.values(raw as Record<string, { wh_hours?: unknown }>)) {
      const hours = entry?.wh_hours;
      if (!hours || typeof hours !== 'object') continue;
      for (const [key, wh] of Object.entries(hours as Record<string, unknown>)) {
        const t = Date.parse(key);
        if (Number.isFinite(t) && typeof wh === 'number' && Number.isFinite(wh))
          totals.set(t, (totals.get(t) ?? 0) + Math.max(0, wh));
      }
    }
  const starts = [...totals.keys()].sort((a, b) => a - b);
  const points = starts.map((start, i) => {
    const end = Math.min(starts[i + 1] ?? Infinity, Math.floor(start / HOUR) * HOUR + HOUR);
    return { start, end, kw: totals.get(start)! / 1000 / ((end - start) / HOUR) };
  });
  const total = points.reduce((s, p) => s + p.kw, 0);
  if (!points.length) return { ...PV_FORECAST_NONE };
  return {
    status: total > 0 ? 'ok' : 'empty',
    source: 'ha_energy',
    points: total > 0 ? points : [],
    days: total > 0 ? sumDays(points, timeZone) : {},
  };
}

interface ServerPvForecast {
  status?: string;
  points?: { start: string; end: string; kw: number }[];
  days?: Record<string, number>;
  array?: PvForecast['array'];
  system?: Record<string, number | null>;
}

export function parseServerPvForecast(raw: ServerPvForecast | null | undefined): PvForecast {
  const status = raw?.status;
  const points = (raw?.points ?? [])
    .map((p) => ({ start: Date.parse(p.start), end: Date.parse(p.end), kw: Number(p.kw) }))
    .filter((p) => Number.isFinite(p.start) && Number.isFinite(p.end) && Number.isFinite(p.kw));
  const known = ['ok', 'stale', 'unconfigured', 'error'] as const;
  return {
    status: (known as readonly string[]).includes(status ?? '')
      ? (status as PvForecast['status'])
      : 'error',
    source: 'open_meteo',
    points,
    days: raw?.days ?? {},
    array: raw?.array ?? null,
    system: {
      acLimitKw: raw?.system?.inverter_ac_limit_kw ?? null,
      batteryCapacityKwh: raw?.system?.battery_capacity_kwh ?? null,
      exportLimitKw: raw?.system?.export_limit_kw ?? null,
    },
  };
}

/**
 * PV forecast, read-only: the HA Energy dashboard forecast first, the HomeBrain Open-Meteo
 * fallback (integration options: kWp, tilt, azimuth) second. Never invents a profile.
 */
export async function fetchPvForecast(
  connection: ConnectionLike | undefined,
  timeZone = 'Europe/Prague',
): Promise<PvForecast> {
  if (!connection) return { ...PV_FORECAST_NONE };
  let ha: PvForecast = { ...PV_FORECAST_NONE };
  try {
    ha = parseHaSolarForecast(
      await connection.sendMessagePromise<unknown>({ type: 'energy/solar_forecast' }),
      timeZone,
    );
  } catch {
    /* energy integration not loaded – try the fallback */
  }
  try {
    const fallback = parseServerPvForecast(
      await connection.sendMessagePromise<ServerPvForecast>({
        type: 'homebrain/energy/pv_forecast',
      }),
    );
    // System parameters (limits, battery) always come from the integration options.
    if (usable(ha)) return { ...ha, system: fallback.system };
    // A misconfigured HA forecast (all zeros) is worth mentioning when there is no fallback.
    return fallback.status === 'unconfigured' && ha.status === 'empty'
      ? { ...fallback, status: 'empty', source: 'ha_energy' }
      : fallback;
  } catch {
    return usable(ha) || ha.status === 'empty' ? ha : { ...PV_FORECAST_NONE, status: 'error' };
  }
}

export interface PvSystem {
  acLimitKw: number | null;
  batteryCapacityKwh: number | null;
  exportLimitKw: number | null;
}
export const PV_SYSTEM_UNKNOWN: PvSystem = {
  acLimitKw: null,
  batteryCapacityKwh: null,
  exportLimitKw: null,
};

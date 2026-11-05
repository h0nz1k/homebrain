import type { DataQuality } from '@homebrain/contracts';
import { deriveQuality, type ConnectionLike, type EntityStateLike } from '@homebrain/ha-client';
import { plausibleTemp } from './thermal.js';
import {
  ENERGY_BINDING_KEYS,
  ENERGY_STATISTIC_KEYS,
  type EnergyBindingKey,
  type EnergyHistory,
  type EnergyModel,
  type EnergySeries,
  type GridFlow,
  type PriceLevel,
  type PricePoint,
  type PriceWindow,
  type InverterChip,
  type InverterDetail,
  type Reading,
  type StatPoint,
} from './contract.js';

const MIN = 60_000;
const HOUR = 60 * MIN;
/*
 * HA bumps last_updated only when the value changes, so constant readings (PV 0 W at night,
 * SoC parked at the reserve) look old. Limits are therefore generous per kind.
 */
const MAX_AGE = { power: 2 * HOUR, energy: 12 * HOUR, soc: 12 * HOUR, price: 3 * HOUR };

export const POWER_UNITS: Record<string, number> = { W: 0.001, kW: 1, MW: 1000 };
export const CURRENT_UNITS: Record<string, number> = { A: 1, mA: 0.001 };
export const VOLTAGE_UNITS: Record<string, number> = { V: 1, kV: 1000, mV: 0.001 };
export const TEMP_UNITS: Record<string, number> = { '°C': 1, '℃': 1 };
export const ENERGY_UNITS: Record<string, number> = { Wh: 0.001, kWh: 1, MWh: 1000 };
const PRICE_UNITS: Record<string, number> = {
  'Kč/kWh': 1,
  'CZK/kWh': 1,
  'Kč/MWh': 0.001,
  'CZK/MWh': 0.001,
};

export function selectEnergyEntityIds(bindings: Record<string, string>): string[] {
  return [
    ...new Set(
      ENERGY_BINDING_KEYS.map((key) => bindings[key]?.trim()).filter((id): id is string => !!id),
    ),
  ];
}

function unbound(): Reading {
  return { value: null, quality: 'unavailable', updatedAt: null, bound: false };
}

export function readNumber(
  state: EntityStateLike | undefined,
  units: Record<string, number> | null,
  maxAgeMs: number,
  now: number,
): Reading {
  const quality = deriveQuality(state, { now, maxAgeMs });
  const updatedAt = state?.last_updated ?? null;
  if (!state || quality === 'unavailable') return { value: null, quality, updatedAt, bound: true };
  const raw = Number(state.state);
  if (state.state.trim() === '' || !Number.isFinite(raw))
    return { value: null, quality: 'unavailable', updatedAt, bound: true };
  if (units) {
    const unit = state.attributes.unit_of_measurement;
    const factor = typeof unit === 'string' ? units[unit] : undefined;
    if (factor === undefined)
      return { value: null, quality: 'invalid_unit', updatedAt, bound: true };
    return { value: raw * factor, quality, updatedAt, bound: true };
  }
  return { value: raw, quality, updatedAt, bound: true };
}

function toTime(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value))
    return value < 1e11 ? value * 1000 : value;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    const t = Date.parse(value);
    return Number.isFinite(t) ? t : null;
  }
  return null;
}
function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  // `[order, price]` pairs (hour-order sensors) – price is the last element.
  if (Array.isArray(value) && value.length) return toNumber(value[value.length - 1]);
  return null;
}

/**
 * Price series from sensor attributes. Supported shapes:
 * ISO-timestamp keys → price (or `[order, price]`), and arrays of `{start, value|price}` under
 * `today`, `tomorrow`, `raw_today`, `raw_tomorrow`, `prices` or `data`.
 */
export function parsePriceSeries(state: EntityStateLike | undefined): PricePoint[] {
  if (!state) return [];
  const unit = state.attributes.unit_of_measurement;
  const factor = typeof unit === 'string' ? (PRICE_UNITS[unit] ?? null) : 1;
  if (factor === null) return [];
  const points = new Map<number, number>();
  for (const [key, value] of Object.entries(state.attributes)) {
    if (/^\d{4}-\d{2}-\d{2}T/.test(key)) {
      const start = toTime(key);
      const price = toNumber(value);
      if (start !== null && price !== null) points.set(start, price * factor);
    } else if (
      ['today', 'tomorrow', 'raw_today', 'raw_tomorrow', 'prices', 'data'].includes(key) &&
      Array.isArray(value)
    ) {
      for (const item of value as unknown[]) {
        if (!item || typeof item !== 'object') continue;
        const record = item as Record<string, unknown>;
        const start = toTime(record.start ?? record.start_time ?? record.time);
        const price = toNumber(record.value ?? record.price);
        if (start !== null && price !== null) points.set(start, price * factor);
      }
    }
  }
  const starts = [...points.keys()].sort((a, b) => a - b);
  // Each point lasts until the next one (≤ 1 h), so a mixed series (hourly today, 15-min
  // tomorrow after the OTE switch) stays contiguous. The last point reuses the previous step.
  return starts.map((start, i) => {
    const next = starts[i + 1];
    const prevStep = i > 0 ? start - starts[i - 1]! : HOUR;
    const end =
      next !== undefined && next - start <= HOUR ? next : start + Math.min(HOUR, prevStep);
    return { start, end, price: points.get(start)! };
  });
}

/** Local calendar day key (YYYY-MM-DD) and hour in the given time zone. */
export function localParts(ms: number, timeZone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(ms))
      .map((part) => [part.type, part.value]),
  );
  return {
    day: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}
/** Offset of the zone from UTC at instant `ms` (local wall clock minus UTC), in ms. */
function zoneOffset(ms: number, timeZone: string): number {
  const p = localParts(ms, timeZone);
  const [y, m, d] = p.day.split('-').map(Number) as [number, number, number];
  const wall = Date.UTC(y, m - 1, d, p.hour, p.minute, p.second);
  return wall - (ms - (((ms % 1000) + 1000) % 1000));
}

/**
 * Instant of local midnight of the calendar day containing `ms`. Resolves the zone offset at
 * midnight itself (not at `ms`), so DST transition days (23 h / 25 h) are handled correctly.
 */
export function startOfLocalDay(ms: number, timeZone: string): number {
  const [y, m, d] = localParts(ms, timeZone).day.split('-').map(Number) as [number, number, number];
  const wallMidnight = Date.UTC(y, m - 1, d);
  let guess = wallMidnight - zoneOffset(ms, timeZone);
  guess = wallMidnight - zoneOffset(guess, timeZone);
  return guess;
}

function mean(values: number[]): number | null {
  return values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : null;
}

/**
 * Cheapest contiguous window of `hours` length (ENE-007). Ties keep the earliest window.
 * Points must be sorted and contiguous; gaps split candidate windows.
 */
export function cheapestWindow(
  points: PricePoint[],
  hours = 2,
  from = Number.NEGATIVE_INFINITY,
): PriceWindow | null {
  let best: PriceWindow | null = null;
  const span = hours * HOUR;
  for (let i = 0; i < points.length; i++) {
    const first = points[i]!;
    if (first.end <= from) continue;
    const slice: PricePoint[] = [];
    for (let j = i; j < points.length && points[j]!.start < first.start + span; j++) {
      if (j > i && points[j]!.start !== points[j - 1]!.end) break;
      slice.push(points[j]!);
    }
    const last = slice[slice.length - 1]!;
    if (last.end - first.start < span) continue;
    const avg = mean(slice.map((p) => p.price))!;
    if (!best || avg < best.mean - 1e-9) best = { start: first.start, end: last.end, mean: avg };
  }
  return best;
}

/** Relative price level by quantile of the given day (thresholds independent of tariff). */
export function priceLevels(points: PricePoint[]): (price: number) => PriceLevel {
  const sorted = points.map((p) => p.price).sort((a, b) => a - b);
  const q = (f: number) => sorted[Math.min(sorted.length - 1, Math.floor(f * sorted.length))] ?? 0;
  const cheap = q(0.25);
  const expensive = q(0.75);
  const peak = q(0.92);
  return (price) =>
    sorted.length < 4
      ? 'normal'
      : price <= cheap
        ? 'cheap'
        : price >= peak
          ? 'peak'
          : price >= expensive
            ? 'expensive'
            : 'normal';
}

export function worst(qualities: DataQuality[]): DataQuality {
  const order: DataQuality[] = [
    'unavailable',
    'invalid_unit',
    'unverified_polarity',
    'stale',
    'ok',
  ];
  for (const quality of order) if (qualities.includes(quality)) return quality;
  return 'ok';
}

/**
 * Per-phase grid powers → independent import/export (kW). The sum must match the net grid power
 * (± max(0.2 kW, 10 %)); a meter with the opposite sign convention (GoodWe: import −) is flipped.
 * Null when a phase is missing, 'mismatch' when the phases contradict the net power.
 */
export function splitGridPhases(
  phases: (number | null)[],
  netKw: number | null,
):
  | { importKw: number; exportKw: number; phasesKw: [number, number, number]; meterSign: 1 | -1 }
  | 'mismatch'
  | null {
  if (phases.length !== 3 || phases.some((v) => v === null || !Number.isFinite(v))) return null;
  const v = phases as number[];
  const sum = v.reduce((a, b) => a + b, 0);
  let sign: 1 | -1 = 1;
  if (netKw !== null) {
    const tol = Math.max(0.2, Math.abs(netKw) * 0.1);
    if (Math.abs(sum - netKw) <= tol) sign = 1;
    else if (Math.abs(-sum - netKw) <= tol) sign = -1;
    else return 'mismatch';
  }
  const r3 = (x: number) => Math.round(x * 1000) / 1000;
  return {
    importKw: r3(v.reduce((a, p) => a + Math.max(0, sign * p), 0)),
    exportKw: r3(v.reduce((a, p) => a + Math.max(0, -sign * p), 0)),
    phasesKw: v.map((p) => r3(sign * p)) as [number, number, number],
    meterSign: sign,
  };
}

export interface AdaptEnergyInput {
  bindings: Record<string, string>;
  getState: (entityId: string) => EntityStateLike | undefined;
  now: number;
  timeZone?: string;
  /** Length of the cheap window in hours. */
  cheapWindowHours?: number;
}

export function adaptEnergyEntities(input: AdaptEnergyInput): EnergyModel {
  const { bindings, getState, now, timeZone = 'Europe/Prague', cheapWindowHours = 2 } = input;
  const state = (key: EnergyBindingKey) =>
    bindings[key]?.trim() ? getState(bindings[key].trim()) : undefined;
  const isBound = (key: EnergyBindingKey) => !!bindings[key]?.trim();
  const read = (key: EnergyBindingKey, units: Record<string, number> | null, maxAge: number) =>
    isBound(key) ? readNumber(state(key), units, maxAge, now) : unbound();
  const notices: string[] = [];

  const pv = read('energy_pv_power', POWER_UNITS, MAX_AGE.power);
  const pvStrings: [Reading, Reading] = [
    read('energy_pv1_power', POWER_UNITS, MAX_AGE.power),
    read('energy_pv2_power', POWER_UNITS, MAX_AGE.power),
  ];
  const gridImport = read('energy_grid_import_power', POWER_UNITS, MAX_AGE.power);
  const gridExport = read('energy_grid_export_power', POWER_UNITS, MAX_AGE.power);
  let grid = read('energy_grid_power', POWER_UNITS, MAX_AGE.power);
  // Separate non-negative channels define the sign unambiguously (ENE-004).
  if (gridImport.value !== null && gridExport.value !== null) {
    grid = {
      value: Math.abs(gridImport.value) - Math.abs(gridExport.value),
      quality: worst([gridImport.quality, gridExport.quality]),
      updatedAt: gridImport.updatedAt,
      bound: true,
    };
  }
  // Import/export split for the flow diagram. Per-phase grid meter powers win (one phase may
  // import while another exports), then separate import/export sensors, else the signed net.
  const gridPhases = (
    ['energy_grid_l1_power', 'energy_grid_l2_power', 'energy_grid_l3_power'] as const
  ).map((key) => read(key, POWER_UNITS, MAX_AGE.power)) as [Reading, Reading, Reading];
  let gridFlow: GridFlow = {
    mode: 'net',
    importKw: grid.value === null ? null : Math.max(0, grid.value),
    exportKw: grid.value === null ? null : Math.max(0, -grid.value),
  };
  const split = splitGridPhases(
    gridPhases.map((r) => (r.quality === 'ok' || r.quality === 'stale' ? r.value : null)),
    grid.value,
  );
  if (split === 'mismatch') notices.push('Součet fází sítě nesedí s výkonem sítě');
  else if (split) {
    gridFlow = { mode: 'phases', ...split };
    if (grid.value === null)
      grid = {
        value: split.importKw - split.exportKw,
        quality: worst(gridPhases.map((r) => r.quality)),
        updatedAt: gridPhases[0].updatedAt,
        bound: true,
      };
  } else if (gridImport.value !== null && gridExport.value !== null)
    gridFlow = {
      mode: 'separate',
      importKw: Math.abs(gridImport.value),
      exportKw: Math.abs(gridExport.value),
    };
  const gridCurrents = (
    ['energy_grid_l1_current', 'energy_grid_l2_current', 'energy_grid_l3_current'] as const
  ).map((key) => read(key, CURRENT_UNITS, MAX_AGE.power)) as [Reading, Reading, Reading];
  const breaker = read('energy_main_breaker', null, Number.POSITIVE_INFINITY);
  let battery = read('energy_battery_power', POWER_UNITS, MAX_AGE.power);
  let house = read('energy_house_power', POWER_UNITS, MAX_AGE.power);
  let houseDerived = false;
  if (!house.bound && pv.value !== null && grid.value !== null) {
    house = {
      value: Math.max(0, pv.value + grid.value + (battery.value ?? 0)),
      quality: worst([pv.quality, grid.quality, battery.bound ? battery.quality : 'ok']),
      updatedAt: pv.updatedAt,
      bound: false,
    };
    houseDerived = true;
  }
  // Polarity check: PV + grid + battery must balance the house load.
  if (!houseDerived && [pv, grid, battery, house].every((r) => r.value !== null)) {
    const balance = (g: number, b: number) =>
      Math.abs(pv.value! + g + b - house.value!) <= Math.max(0.3, house.value! * 0.15);
    if (!balance(grid.value!, battery.value!)) {
      const flipGrid = balance(-grid.value!, battery.value!);
      const flipBattery = balance(grid.value!, -battery.value!);
      if (flipGrid && grid.quality === 'ok') grid = { ...grid, quality: 'unverified_polarity' };
      if (flipBattery && battery.quality === 'ok')
        battery = { ...battery, quality: 'unverified_polarity' };
      if (flipGrid || flipBattery)
        notices.push('Znaménko výkonu sítě nebo baterie nesedí s bilancí');
    }
  }
  const phases = (
    ['energy_phase_l1_power', 'energy_phase_l2_power', 'energy_phase_l3_power'] as const
  ).map((key) => read(key, POWER_UNITS, MAX_AGE.power)) as [Reading, Reading, Reading];
  const phaseValues = phases.map((p) => (p.quality === 'ok' ? p.value : null));
  const phaseSpreadKw = phaseValues.every((v) => v !== null)
    ? Math.max(...(phaseValues as number[])) - Math.min(...(phaseValues as number[]))
    : null;

  const batterySoc = read('energy_battery_soc', { '%': 1 }, MAX_AGE.soc);
  const today = {
    pv: read('energy_pv_energy_today', ENERGY_UNITS, MAX_AGE.energy),
    gridImport: read('energy_grid_import_energy_today', ENERGY_UNITS, MAX_AGE.energy),
    gridExport: read('energy_grid_export_energy_today', ENERGY_UNITS, MAX_AGE.energy),
    house: read('energy_house_energy_today', ENERGY_UNITS, MAX_AGE.energy),
    batteryCharge: read('energy_battery_charge_energy_today', ENERGY_UNITS, MAX_AGE.energy),
    batteryDischarge: read('energy_battery_discharge_energy_today', ENERGY_UNITS, MAX_AGE.energy),
  };
  const forecast = {
    today: read('energy_pv_forecast_today', ENERGY_UNITS, 2 * MAX_AGE.energy),
    tomorrow: read('energy_pv_forecast_tomorrow', ENERGY_UNITS, 2 * MAX_AGE.energy),
  };

  const priceNow = read('energy_spot_price_electricity', PRICE_UNITS, MAX_AGE.price);
  const merged = new Map<number, PricePoint>();
  for (const point of [
    ...parsePriceSeries(state('energy_spot_price_electricity')),
    ...parsePriceSeries(state('energy_spot_prices_electricity_tomorrow')),
  ])
    if (!merged.has(point.start)) merged.set(point.start, point);
  const series = [...merged.values()].sort((a, b) => a.start - b.start);
  const todayKey = localParts(now, timeZone).day;
  const tomorrowKey = localParts(startOfLocalDay(now, timeZone) + 26 * HOUR, timeZone).day;
  const todayPoints = series.filter((p) => localParts(p.start, timeZone).day === todayKey);
  const tomorrowPoints = series.filter((p) => localParts(p.start, timeZone).day === tomorrowKey);
  const current = series.find((p) => p.start <= now && now < p.end) ?? null;
  if (priceNow.value === null && current && priceNow.bound && priceNow.quality !== 'invalid_unit')
    Object.assign(priceNow, { value: current.price });
  const upcoming = series.filter((p) => p.end > now && p.start < now + 24 * HOUR);
  // "Next" cheap window for the Dnes screen: the rest of today first (including the slot that
  // contains `now`, so an active window is reported as "teď"); only when no full window fits
  // into the rest of today fall back to the rolling 24 h horizon (tomorrow's prices).
  const restOfToday = todayPoints.filter((p) => p.end > now);
  const cheapestNext =
    cheapestWindow(restOfToday, cheapWindowHours, now) ??
    cheapestWindow(upcoming, cheapWindowHours, now);
  const peakToday = todayPoints.reduce<PricePoint | null>(
    (best, p) => (!best || p.price > best.price ? p : best),
    null,
  );
  if (isBound('energy_spot_price_electricity') && !series.length)
    notices.push('Chybí průběh spotových cen');

  const houseToday = today.house.value;
  const importToday = today.gridImport.value;
  // ENE-009: guard against division by zero.
  const selfSufficiencyPercent =
    houseToday !== null && importToday !== null && houseToday > 0
      ? Math.min(100, Math.max(0, ((houseToday - importToday) / houseToday) * 100))
      : null;

  const inverterRaw = state('energy_inverter_status');
  const inverter =
    inverterRaw && !['unknown', 'unavailable', ''].includes(inverterRaw.state)
      ? inverterStatusChip(inverterRaw.state)
      : null;
  const inverterStatus = inverter?.label ?? null;
  const errRaw = state('energy_inverter_error')?.state?.trim() ?? '';
  const inverterDetail: InverterDetail = {
    acPower: read('energy_inverter_power', POWER_UNITS, MAX_AGE.power),
    acPhases: (
      ['energy_inverter_l1_power', 'energy_inverter_l2_power', 'energy_inverter_l3_power'] as const
    ).map((key) => read(key, POWER_UNITS, MAX_AGE.power)) as [Reading, Reading, Reading],
    error: inverterErrorLabel(errRaw),
    tempRadiator: read('energy_inverter_temp_radiator', TEMP_UNITS, MAX_AGE.power),
    tempAir: read('energy_inverter_temp_air', TEMP_UNITS, MAX_AGE.power),
    pvVoltages: [
      read('energy_pv1_voltage', VOLTAGE_UNITS, MAX_AGE.power),
      read('energy_pv2_voltage', VOLTAGE_UNITS, MAX_AGE.power),
    ],
    batteryVoltage: read('energy_battery_voltage', VOLTAGE_UNITS, MAX_AGE.power),
    batteryCurrent: read('energy_battery_current', CURRENT_UNITS, MAX_AGE.power),
    batteryTemp: read('energy_battery_temp', TEMP_UNITS, MAX_AGE.soc),
    cellTempMax: read('energy_battery_cell_temp_max', TEMP_UNITS, MAX_AGE.soc),
    cellTempMin: read('energy_battery_cell_temp_min', TEMP_UNITS, MAX_AGE.soc),
    cellVoltageMax: read('energy_battery_cell_voltage_max', VOLTAGE_UNITS, MAX_AGE.soc),
    cellVoltageMin: read('energy_battery_cell_voltage_min', VOLTAGE_UNITS, MAX_AGE.soc),
    soh: read('energy_battery_soh', { '%': 1 }, 7 * 24 * HOUR),
  };
  // Plausibility: a broken temperature sensor (constant 0 °C module sensor, −40, 200 …) is
  // hidden instead of shown as a real reading.
  for (const k of [
    'tempRadiator',
    'tempAir',
    'batteryTemp',
    'cellTempMax',
    'cellTempMin',
  ] as const) {
    const r = inverterDetail[k];
    if (r.value !== null && !plausibleTemp(r.value))
      inverterDetail[k] = { ...r, value: null, quality: 'unavailable' };
  }

  const required = [pv, grid, batterySoc, priceNow];
  const boundRequired = required.filter((r) => r.bound);
  const quality = boundRequired.length ? worst(boundRequired.map((r) => r.quality)) : 'unavailable';
  if (!boundRequired.length) notices.push('Nejsou nastaveny vazby modulu Energie');

  return {
    now,
    timeZone,
    quality,
    power: {
      pv,
      pvStrings,
      grid,
      gridImport,
      gridExport,
      battery,
      house,
      houseDerived,
      phases,
      phaseSpreadKw,
      gridPhases,
      gridFlow,
      gridCurrents,
      breaker,
    },
    batterySoc,
    today,
    forecast,
    price: {
      now: priceNow,
      series,
      intervalMinutes: series.length ? Math.round((series[0]!.end - series[0]!.start) / MIN) : null,
      averageToday: mean(todayPoints.map((p) => p.price)),
      averageTomorrow: mean(tomorrowPoints.map((p) => p.price)),
      cheapestToday: cheapestWindow(todayPoints, cheapWindowHours),
      cheapestTomorrow: cheapestWindow(tomorrowPoints, cheapWindowHours),
      cheapestNext,
      peakToday,
      next: series.find((p) => p.start >= (current?.end ?? now)) ?? null,
    },
    selfSufficiencyPercent,
    inverterStatus,
    inverter,
    inverterDetail,
    notices,
  };
}

/**
 * Czech label + tone for common inverter work-mode states (GoodWe `work_mode`, generic
 * on/off/fault words). Unknown strings are shown verbatim with a neutral tone.
 */
export function inverterStatusChip(raw: string): InverterChip {
  const s = raw.trim().toLowerCase();
  const map: [RegExp, string, InverterChip['tone']][] = [
    [/fault|error|chyba|porucha/, 'Porucha', 'err'],
    [/off-?grid|backup|ostrov/, 'Offgrid', 'warn'],
    [/on-?grid|normal|running|producing|provoz/, 'Normální', 'ok'],
    [/wait|standby|idle|sleep|čeká/, 'Standby', 'idle'],
    [/flash|update|firmware/, 'Aktualizace firmwaru', 'warn'],
    [/check|self.?test|kontrola/, 'Kontrola', 'warn'],
    [/^off$|shutdown|vypnut/, 'Vypnuto', 'idle'],
  ];
  for (const [re, label, tone] of map) if (re.test(s)) return { raw, label, tone };
  return { raw, label: raw, tone: 'idle' };
}

const INVERTER_ERRORS: [RegExp, string][] = [
  [/utility loss|grid loss|no grid|grid fail/, 'výpadek sítě'],
  [/isolation|insulation|\biso\b/, 'porucha izolace FV'],
  [/gfci|ground|leak|residual/, 'unikající proud (zemní spojení)'],
  [/pv.*over.?voltage|over.?voltage.*pv|pv.*voltage high/, 'přepětí na FV'],
  [/(ac|grid|vac).*(voltage|volt)|voltage.*(out of range|fault)/, 'napětí sítě mimo rozsah'],
  [/freq|fac/, 'frekvence sítě mimo rozsah'],
  [/over.?temp|temperature/, 'přehřátí střídače'],
  [/fan/, 'porucha ventilátoru'],
  [/battery|bms/, 'chyba baterie'],
  [/relay/, 'porucha relé'],
  [/\bdci\b|dc injection/, 'stejnosměrná složka v síti'],
  [/eeprom|spi|comm|can\b/, 'chyba vnitřní komunikace'],
  [/bus/, 'napětí DC sběrnice mimo rozsah'],
];

/**
 * Czech label of an inverter error (GoodWe `errors` text, comma separated, or a numeric
 * `error_codes` bit mask). Empty / "0" / unknown states mean no error (null).
 */
export function inverterErrorLabel(raw: string): { raw: string; label: string } | null {
  const s = raw.trim();
  if (!s || /^(0|0\.0|none|ok|unknown|unavailable|no error)$/i.test(s)) return null;
  if (/^\d+(\.0)?$/.test(s)) return { raw: s, label: `kód chyby ${Number(s)}` };
  const parts = s.split(/[,;]\s*/).filter(Boolean);
  const labels = parts.map((part) => {
    const hit = INVERTER_ERRORS.find(([re]) => re.test(part.toLowerCase()));
    return hit ? hit[1] : part;
  });
  return { raw: s, label: [...new Set(labels)].join(', ') };
}

interface StatisticRow {
  start: number | string;
  change?: number | null;
  sum?: number | null;
}

function parseStatRows(rows: unknown, factor: number): StatPoint[] {
  if (!Array.isArray(rows)) return [];
  return (rows as StatisticRow[])
    .map((row) => ({ start: toTime(row.start), value: toNumber(row.change) }))
    .filter((p): p is StatPoint => p.start !== null && p.value !== null)
    .map((p) => ({ start: p.start, value: Math.max(0, p.value * factor) }));
}

/**
 * Recorder statistics for the energy counters (WS `recorder/statistics_during_period`,
 * read-only): hourly change over the last 24 h and daily change over the last 7 days.
 */
export async function fetchEnergyHistory(
  connection: ConnectionLike,
  bindings: Record<string, string>,
  now: number,
  timeZone = 'Europe/Prague',
): Promise<EnergyHistory> {
  const ids = Object.fromEntries(
    ENERGY_STATISTIC_KEYS.map((key) => [key, bindings[key]?.trim()]).filter(([, id]) => !!id),
  ) as Partial<Record<(typeof ENERGY_STATISTIC_KEYS)[number], string>>;
  const statisticIds = [...new Set(Object.values(ids))] as string[];
  if (!statisticIds.length) return { hourly: {}, daily: {}, status: 'unsupported' };
  const query = (start: number, period: 'hour' | 'day') =>
    connection.sendMessagePromise<Record<string, unknown>>({
      type: 'recorder/statistics_during_period',
      start_time: new Date(start).toISOString(),
      end_time: new Date(now).toISOString(),
      statistic_ids: statisticIds,
      period,
      types: ['change'],
      units: { energy: 'kWh' },
    } as { type: string });
  const dayStart = startOfLocalDay(now, timeZone);
  const [hourlyRaw, dailyRaw] = await Promise.all([
    query(Math.floor(now / HOUR) * HOUR - 23 * HOUR, 'hour'),
    query(startOfLocalDay(dayStart - 6 * 24 * HOUR + 2 * HOUR, timeZone), 'day'),
  ]);
  const pick = (raw: Record<string, unknown> | null | undefined): EnergySeries =>
    Object.fromEntries(
      Object.entries(ids).map(([key, id]) => [key, parseStatRows(raw?.[id!], 1)]),
    ) as EnergySeries;
  return { hourly: pick(hourlyRaw), daily: pick(dailyRaw), status: 'ready' };
}

/** 24 h of 5-minute mean power per phase (kW, raw sensor sign) for the 'Fáze' detail. */
export interface PhaseHistory {
  status: 'idle' | 'ready' | 'unsupported' | 'error';
  /** Which binding set the samples come from (grid meter preferred, else house load). */
  source: 'grid' | 'house' | null;
  t: number[];
  kw: [number[], number[], number[]];
}
export const PHASE_HISTORY_NONE: PhaseHistory = {
  status: 'idle',
  source: null,
  t: [],
  kw: [[], [], []],
};

export async function fetchPhaseHistory(
  connection: ConnectionLike,
  bindings: Record<string, string>,
  now: number,
): Promise<PhaseHistory> {
  const pick = (prefix: string) =>
    [1, 2, 3]
      .map((i) => bindings[`${prefix}${i}_power`]?.trim())
      .filter((id): id is string => !!id);
  const grid = pick('energy_grid_l');
  const house = pick('energy_phase_l');
  const [source, ids] =
    grid.length === 3
      ? (['grid', grid] as const)
      : house.length === 3
        ? (['house', house] as const)
        : ([null, [] as string[]] as const);
  if (!source) return { ...PHASE_HISTORY_NONE, status: 'unsupported' };
  const raw = await connection.sendMessagePromise<Record<string, unknown>>({
    type: 'recorder/statistics_during_period',
    start_time: new Date(now - 24 * HOUR).toISOString(),
    end_time: new Date(now).toISOString(),
    statistic_ids: [...ids],
    period: '5minute',
    types: ['mean'],
    units: { power: 'kW' },
  } as { type: string });
  const series = ids.map((id) => {
    const m = new Map<number, number>();
    for (const row of Array.isArray(raw?.[id]) ? (raw[id] as unknown[]) : []) {
      const r = row as { start?: unknown; mean?: unknown };
      const t = toTime(r.start);
      const v = toNumber(r.mean);
      if (t !== null && v !== null) m.set(t, v);
    }
    return m;
  });
  const t = [...series[0]!.keys()]
    .filter((k) => series.every((m) => m.has(k)))
    .sort((a, b) => a - b);
  return {
    status: t.length ? 'ready' : 'unsupported',
    source,
    t,
    kw: [0, 1, 2].map((i) => t.map((k) => series[i]!.get(k)!)) as [number[], number[], number[]],
  };
}

/** 24 h of hourly mean temperatures (°C) for the inverter / battery detail sparklines. */
export interface ThermalHistory {
  status: 'idle' | 'ready' | 'unsupported' | 'error';
  t: number[];
  /** Keyed by binding key; samples aligned with `t` (NaN = gap). */
  series: Partial<Record<ThermalKey, number[]>>;
}
export type ThermalKey =
  | 'energy_inverter_temp_radiator'
  | 'energy_inverter_temp_air'
  | 'energy_battery_temp'
  | 'energy_battery_cell_temp_max';
export const THERMAL_KEYS: readonly ThermalKey[] = [
  'energy_inverter_temp_radiator',
  'energy_inverter_temp_air',
  'energy_battery_temp',
  'energy_battery_cell_temp_max',
];
export const THERMAL_HISTORY_NONE: ThermalHistory = { status: 'idle', t: [], series: {} };

export async function fetchThermalHistory(
  connection: ConnectionLike,
  bindings: Record<string, string>,
  now: number,
): Promise<ThermalHistory> {
  const keys = THERMAL_KEYS.filter((k) => bindings[k]?.trim());
  if (!keys.length) return { ...THERMAL_HISTORY_NONE, status: 'unsupported' };
  const ids = keys.map((k) => bindings[k]!.trim());
  const raw = await connection.sendMessagePromise<Record<string, unknown>>({
    type: 'recorder/statistics_during_period',
    start_time: new Date(now - 24 * HOUR).toISOString(),
    end_time: new Date(now).toISOString(),
    statistic_ids: ids,
    period: 'hour',
    types: ['mean'],
    units: { temperature: '°C' },
  } as { type: string });
  const maps = ids.map((id) => {
    const m = new Map<number, number>();
    for (const row of Array.isArray(raw?.[id]) ? (raw[id] as unknown[]) : []) {
      const r = row as { start?: unknown; mean?: unknown };
      const t = toTime(r.start);
      const v = toNumber(r.mean);
      if (t !== null && v !== null && plausibleTemp(v)) m.set(t, v);
    }
    return m;
  });
  const t = [...new Set(maps.flatMap((m) => [...m.keys()]))].sort((a, b) => a - b);
  const series: ThermalHistory['series'] = {};
  keys.forEach((k, i) => {
    if (maps[i]!.size >= 2) series[k] = t.map((x) => maps[i]!.get(x) ?? Number.NaN);
  });
  return { status: Object.keys(series).length ? 'ready' : 'unsupported', t, series };
}

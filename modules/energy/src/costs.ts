/**
 * Electricity cost model (pure, no HA access): real cost of grid import priced by the household's
 * own VT/NT tariff + prorated fixed monthly fees, savings from PV + battery, and a spot comparison
 * (informative only – never advice). Inputs are hourly recorder statistics, so the numbers survive
 * restarts and can be recomputed for any period.
 *
 * Method (validated against invoices in a real household within ~1 %):
 * - cost = Σ hours import kWh × correction × (VT or NT price of that hour) + fixed fees × elapsed
 *   share of each calendar month (time-proportional, so DST days count 23/25 h);
 * - savings = Σ hours (house − import) kWh × tariff price of that hour (what the grid would have
 *   cost for energy covered by PV and battery; export income not included);
 * - spot = Σ hours import × ((spot + markup) × VAT + distribution VT/NT) + spot fixed fees.
 */
import type { ConnectionLike } from '@homebrain/ha-client';
import { localParts, startOfLocalDay } from './adapter.js';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** NT intervals as [fromMinute, toMinute) of the local day (0–1440). */
export type HdoSchedule = Array<[number, number]>;

export interface TariffSettings {
  /** Kč/kWh incl. VAT; null = not configured (costs are not computed). */
  priceVt: number | null;
  priceNt: number | null;
  /** Fixed monthly fees (Kč/month incl. VAT). */
  fixedMonthly: number | null;
  /** Billing meter / inverter meter ratio (1 = no correction). */
  correction: number;
  /** Spot comparison: distribution + system services + tax per kWh incl. VAT, VT/NT. */
  spotDistVt: number | null;
  spotDistNt: number | null;
  /** Supplier markup on spot (Kč/kWh excl. VAT). */
  spotMarkup: number;
  /** Fixed monthly fees of a spot product (Kč/month incl. VAT). */
  spotFixedMonthly: number | null;
  /** VAT multiplier applied to raw spot + markup. */
  vat: number;
}

export const TARIFF_BINDINGS = {
  priceVt: 'energy_tariff_price_vt',
  priceNt: 'energy_tariff_price_nt',
  fixedMonthly: 'energy_tariff_fixed_monthly',
  correction: 'energy_meter_correction',
  spotDistVt: 'energy_spot_distribution_vt',
  spotDistNt: 'energy_spot_distribution_nt',
  spotMarkup: 'energy_spot_markup',
  spotFixedMonthly: 'energy_spot_fixed_monthly',
} as const;

const CZ_VAT = 1.21;

function num(state: { state?: string } | undefined): number | null {
  if (!state || typeof state.state !== 'string') return null;
  const v = Number(state.state.replace(',', '.'));
  return Number.isFinite(v) ? v : null;
}

export function readTariffSettings(
  bindings: Record<string, string | undefined>,
  getState: (id: string) => { state?: string } | undefined,
): TariffSettings {
  const read = (key: string) => {
    const id = bindings[key]?.trim();
    return id ? num(getState(id)) : null;
  };
  const fixedMonthly = read(TARIFF_BINDINGS.fixedMonthly);
  const correction = read(TARIFF_BINDINGS.correction);
  return {
    priceVt: read(TARIFF_BINDINGS.priceVt),
    priceNt: read(TARIFF_BINDINGS.priceNt),
    fixedMonthly,
    correction: correction !== null && correction > 0.5 && correction < 2 ? correction : 1,
    spotDistVt: read(TARIFF_BINDINGS.spotDistVt),
    spotDistNt: read(TARIFF_BINDINGS.spotDistNt),
    spotMarkup: read(TARIFF_BINDINGS.spotMarkup) ?? 0,
    spotFixedMonthly: read(TARIFF_BINDINGS.spotFixedMonthly) ?? fixedMonthly,
    vat: CZ_VAT,
  };
}

const minutes = (hhmm: unknown): number | null => {
  if (typeof hhmm !== 'string') return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm);
  if (!m) return null;
  const v = Number(m[1]) * 60 + Number(m[2]);
  // HDO integrations write the end of day as 23:59.
  return v >= 1439 ? 1440 : v;
};

/**
 * NT intervals from HDO attributes (`hdo_cas_od`/`hdo_cas_do` or `hdo_times_today_raw`); intervals
 * crossing midnight are split. Null when the entity has no schedule.
 */
export function parseHdoSchedule(attrs: Record<string, unknown> | undefined): HdoSchedule | null {
  if (!attrs) return null;
  let pairs: Array<[unknown, unknown]> = [];
  const od = attrs.hdo_cas_od;
  const doo = attrs.hdo_cas_do;
  if (Array.isArray(od) && Array.isArray(doo) && od.length === doo.length)
    pairs = od.map((v, i) => [v, doo[i]]);
  else if (Array.isArray(attrs.hdo_times_today_raw))
    pairs = (attrs.hdo_times_today_raw as Array<Record<string, unknown>>).map((r) => [r.od, r.do]);
  const out: HdoSchedule = [];
  for (const [a, b] of pairs) {
    const from = minutes(a);
    const to = minutes(b);
    if (from === null || to === null || from === to) continue;
    if (to > from) out.push([from, to]);
    else out.push([from, 1440], [0, to]);
  }
  return out.length ? out : null;
}

function ntOverlap(from: number, to: number, schedule: HdoSchedule): number {
  let sum = 0;
  for (const [a, b] of schedule) sum += Math.max(0, Math.min(to, b) - Math.max(from, a));
  return sum;
}

/** Share (0–1) of the hour starting at `start` that falls into NT, by local wall time. */
export function ntShareOfHour(start: number, timeZone: string, schedule: HdoSchedule | null) {
  if (!schedule) return 0;
  const p = localParts(start, timeZone);
  const m0 = p.hour * 60 + p.minute;
  const inDay = ntOverlap(m0, Math.min(m0 + 60, 1440), schedule);
  const wrapped = m0 + 60 > 1440 ? ntOverlap(0, m0 + 60 - 1440, schedule) : 0;
  return (inDay + wrapped) / 60;
}

export interface HdoState {
  tariff: 'VT' | 'NT';
  nextChange: number | null;
  source: 'hdo';
}

/** Current tariff from the HDO binary sensor (on = NT) and the next change. */
export function hdoStatus(
  state: { state?: string; attributes?: Record<string, unknown> } | undefined,
  now: number,
  timeZone: string,
  nextChangeState: { state?: string } | undefined | null,
): HdoState | null {
  if (!state || (state.state !== 'on' && state.state !== 'off')) return null;
  const tariff = state.state === 'on' ? 'NT' : 'VT';
  const attrNext = state.attributes?.next_change;
  const parsed = [attrNext, nextChangeState?.state]
    .map((v) => (typeof v === 'string' ? Date.parse(v) : NaN))
    .find((v) => Number.isFinite(v) && v > now);
  let nextChange = parsed ?? null;
  if (nextChange === null) {
    const schedule = parseHdoSchedule(state.attributes);
    if (schedule) {
      // Walk forward in 15-minute steps until the tariff flips (max 2 days).
      const isNt = (t: number) => {
        const p = localParts(t, timeZone);
        const m = p.hour * 60 + p.minute;
        return schedule.some(([a, b]) => m >= a && m < b);
      };
      const step = 15 * 60_000;
      for (let t = Math.ceil((now + 1) / step) * step; t < now + 2 * DAY; t += step)
        if (isNt(t) !== (tariff === 'NT')) {
          nextChange = t;
          break;
        }
    }
  }
  return { tariff, nextChange, source: 'hdo' };
}

/** Local midnight of the 1st of the month containing `ms`. */
export function monthStart(ms: number, timeZone: string): number {
  const [y, m] = localParts(ms, timeZone).day.split('-').map(Number) as [number, number];
  return startOfLocalDay(Date.UTC(y, m - 1, 1, 12), timeZone);
}
export function nextMonthStart(ms: number, timeZone: string): number {
  const [y, m] = localParts(ms, timeZone).day.split('-').map(Number) as [number, number];
  return startOfLocalDay(Date.UTC(y, m, 1, 12), timeZone);
}
export function yearStart(ms: number, timeZone: string): number {
  const y = Number(localParts(ms, timeZone).day.slice(0, 4));
  return startOfLocalDay(Date.UTC(y, 0, 1, 12), timeZone);
}

/** Fixed monthly fee accrued over [from, to): each month contributes its elapsed time share. */
export function fixedShare(monthly: number, from: number, to: number, timeZone: string): number {
  let sum = 0;
  let t = from;
  while (t < to) {
    const ms = monthStart(t, timeZone);
    const me = nextMonthStart(t, timeZone);
    const end = Math.min(to, me);
    sum += (monthly * (end - t)) / (me - ms);
    t = end;
  }
  return sum;
}

export interface CostHour {
  start: number;
  /** Grid import in the hour (kWh, inverter meter); null = missing. */
  importKwh: number | null;
  /** House consumption in the hour (kWh); null = missing. */
  houseKwh: number | null;
  /** Raw spot price (Kč/kWh excl. VAT), hourly mean; null = missing. */
  spot: number | null;
}

export interface SpotComparison {
  energyCost: number;
  fixedCost: number;
  total: number;
  /** Same hours priced by the current tariff (energy + fixed) – the fair counterpart. */
  tariffTotal: number;
  /** Share of import kWh that had a spot price (0–1). */
  coverage: number;
}

export interface PeriodCost {
  /** Start of the accounted interval (period start or first measured hour, whichever is later). */
  from: number;
  to: number;
  importKwh: number;
  vtKwh: number;
  ntKwh: number;
  energyCost: number;
  fixedCost: number;
  total: number;
  coveredKwh: number;
  savings: number | null;
  spot: SpotComparison | null;
}
export type CostPeriod = 'day' | 'month' | 'year';
export type Costs = Record<CostPeriod, PeriodCost>;

export interface CostInput {
  hours: CostHour[];
  settings: TariffSettings;
  schedule: HdoSchedule | null;
  now: number;
  timeZone: string;
  /** Today's import counter (kWh) – the part not yet in hourly statistics is added at `now`. */
  liveTodayImportKwh?: number | null;
  liveSpot?: number | null;
}

export function computeCosts(input: CostInput): Costs | null {
  const { settings: s, schedule, now, timeZone } = input;
  if (s.priceVt === null || s.priceNt === null || s.fixedMonthly === null) return null;
  const priceVt = s.priceVt;
  const priceNt = s.priceNt;
  const fixedMonthly = s.fixedMonthly;
  const spotReady = s.spotDistVt !== null && s.spotDistNt !== null && s.spotFixedMonthly !== null;
  const dayStart = startOfLocalDay(now, timeZone);
  const hours = input.hours.filter((h) => h.start < now).sort((a, b) => a.start - b.start);
  const live = input.liveTodayImportKwh;
  if (live !== null && live !== undefined) {
    const counted = hours
      .filter((h) => h.start >= dayStart)
      .reduce((sum, h) => sum + (h.importKwh ?? 0), 0);
    if (live - counted > 0.0005)
      hours.push({
        start: Math.floor(now / HOUR) * HOUR,
        importKwh: live - counted,
        houseKwh: null,
        spot: input.liveSpot ?? null,
      });
  }
  const firstData = hours.find((h) => h.importKwh !== null)?.start ?? now;
  const period = (start: number): PeriodCost => {
    const from = Math.max(start, Math.min(firstData, now));
    let importKwh = 0;
    let vtKwh = 0;
    let ntKwh = 0;
    let energyCost = 0;
    let coveredKwh = 0;
    let savings = 0;
    let anyHouse = false;
    let spotEnergy = 0;
    let spotKwh = 0;
    let tariffOnSpotHours = 0;
    for (const h of hours) {
      if (h.start < start) continue;
      const nt = ntShareOfHour(h.start, timeZone, schedule);
      const price = nt * priceNt + (1 - nt) * priceVt;
      if (h.importKwh !== null) {
        const kwh = Math.max(0, h.importKwh) * s.correction;
        importKwh += kwh;
        ntKwh += kwh * nt;
        vtKwh += kwh * (1 - nt);
        energyCost += kwh * price;
        if (spotReady && h.spot !== null) {
          const dist = nt * s.spotDistNt! + (1 - nt) * s.spotDistVt!;
          spotEnergy += kwh * ((h.spot + s.spotMarkup) * s.vat + dist);
          spotKwh += kwh;
          tariffOnSpotHours += kwh * price;
        }
      }
      if (h.houseKwh !== null && h.importKwh !== null) {
        anyHouse = true;
        const covered = Math.max(0, h.houseKwh - h.importKwh);
        coveredKwh += covered;
        savings += covered * price;
      }
    }
    const fixedCost = fixedShare(fixedMonthly, from, now, timeZone);
    let spot: SpotComparison | null = null;
    if (spotReady) {
      const spotFixed = fixedShare(s.spotFixedMonthly!, from, now, timeZone);
      spot = {
        energyCost: spotEnergy,
        fixedCost: spotFixed,
        total: spotEnergy + spotFixed,
        tariffTotal: tariffOnSpotHours + fixedCost,
        coverage: importKwh > 0 ? spotKwh / importKwh : 1,
      };
    }
    return {
      from,
      to: now,
      importKwh,
      vtKwh,
      ntKwh,
      energyCost,
      fixedCost,
      total: energyCost + fixedCost,
      coveredKwh,
      savings: anyHouse ? savings : null,
      spot,
    };
  };
  return {
    day: period(dayStart),
    month: period(monthStart(now, timeZone)),
    year: period(yearStart(now, timeZone)),
  };
}

const toMs = (v: unknown): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return v < 1e11 ? v * 1000 : v;
  if (typeof v === 'string') {
    const t = Date.parse(v);
    return Number.isFinite(t) ? t : null;
  }
  return null;
};
const toNum = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

/**
 * Hourly recorder statistics since 1 January (read-only WS `recorder/statistics_during_period`):
 * grid import and house energy (`change`, kWh) and the spot price (`mean`, Kč/kWh).
 */
export async function fetchCostHours(
  connection: ConnectionLike,
  bindings: Record<string, string>,
  now: number,
  timeZone = 'Europe/Prague',
): Promise<CostHour[] | null> {
  const importId = bindings.energy_grid_import_energy_today?.trim();
  const houseId = bindings.energy_house_energy_today?.trim();
  const spotId = bindings.energy_spot_price_electricity?.trim();
  if (!importId) return null;
  const start = new Date(yearStart(now, timeZone)).toISOString();
  const end = new Date(now).toISOString();
  const query = (ids: string[], types: string[]) =>
    connection.sendMessagePromise<Record<string, Array<Record<string, unknown>>>>({
      type: 'recorder/statistics_during_period',
      start_time: start,
      end_time: end,
      statistic_ids: ids,
      period: 'hour',
      types,
      units: { energy: 'kWh' },
    } as { type: string });
  const [energy, spot] = await Promise.all([
    query([importId, ...(houseId ? [houseId] : [])], ['change']),
    spotId ? query([spotId], ['mean']).catch(() => ({})) : Promise.resolve({}),
  ]);
  const byStart = new Map<number, CostHour>();
  const row = (t: number) => {
    let h = byStart.get(t);
    if (!h) byStart.set(t, (h = { start: t, importKwh: null, houseKwh: null, spot: null }));
    return h;
  };
  const each = (rows: unknown, fn: (h: CostHour, r: Record<string, unknown>) => void) => {
    if (!Array.isArray(rows)) return;
    for (const r of rows as Array<Record<string, unknown>>) {
      const t = toMs(r.start);
      if (t !== null) fn(row(t), r);
    }
  };
  each(energy?.[importId], (h, r) => (h.importKwh = toNum(r.change)));
  if (houseId) each(energy?.[houseId], (h, r) => (h.houseKwh = toNum(r.change)));
  if (spotId) each((spot as Record<string, unknown>)[spotId], (h, r) => (h.spot = toNum(r.mean)));
  return [...byStart.values()].sort((a, b) => a.start - b.start);
}

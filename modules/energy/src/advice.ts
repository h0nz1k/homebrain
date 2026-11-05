import type { ConnectionLike, EntityStateLike } from '@homebrain/ha-client';
import type { Signal } from '@homebrain/signals';
import { adaptEnergyEntities, fetchEnergyHistory, localParts, startOfLocalDay } from './adapter.js';
import type { EnergyModel, PricePoint } from './contract.js';
import { houseBaselineKw } from './signals.js';

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

/* ------------------------------------------------------------------ advice */

export type AdviceApplianceId = 'dishwasher' | 'dehumidifier' | 'heat_pump';
export interface AdviceApplianceConfig {
  id: AdviceApplianceId;
  label: string;
  /** Typical run length (h). */
  durationH: number;
  /** Mean power while running (kW) – used for the PV-coverage estimate. */
  avgKw: number;
  /** Local hours the window must not touch, e.g. {from: 22, to: 6}; null = any time. */
  quiet: { from: number; to: number } | null;
  /** Informational only (the appliance has its own controller). */
  infoOnly?: boolean;
}

export const ADVICE_APPLIANCES: readonly AdviceApplianceConfig[] = [
  { id: 'dishwasher', label: 'Myčka', durationH: 2.5, avgKw: 0.7, quiet: { from: 22, to: 6 } },
  { id: 'dehumidifier', label: 'Odvlhčovač', durationH: 3, avgKw: 0.35, quiet: null },
  {
    id: 'heat_pump',
    label: 'Tepelné čerpadlo',
    durationH: 2,
    avgKw: 2,
    quiet: null,
    infoOnly: true,
  },
];

/** Generic PV system parameters (integration options, all optional). */
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

/**
 * The buy price incl. distribution fees is unknown (only the spot price is bound), so PV
 * energy that would otherwise be sold or stored is valued at this share of the spot price:
 * self-consumption wins over export, but a cheap grid hour can still beat it.
 */
export const SELF_CONSUMPTION_WEIGHT = 0.6;
/** Battery reserve assumed for the SoC trajectory (share of capacity). */
const BATTERY_RESERVE = 0.1;

export interface FlowStep {
  start: number;
  pvKw: number;
  loadKw: number;
  chargeKw: number;
  exportKw: number;
  /** Surplus that can go neither to the battery nor to the grid (curtailed). */
  lostKw: number;
  /** Free AC headroom of the inverter for an extra load (kW), Infinity without a limit. */
  acHeadKw: number;
  importKw: number;
  socPercent: number | null;
}

export interface AdviceOutlook {
  steps: FlowStep[];
  /** First moment the simulated battery reaches ≥ 99 %. */
  batteryFullAt: number | null;
  /** Curtailed PV energy expected in the horizon (kWh); null when not predictable. */
  lostKwh: number | null;
  firstLossAt: number | null;
  /** Curtailment expected right now (kW). */
  lostNowKw: number;
  /** Transparent assumptions/limitations (Czech). */
  assumptions: string[];
}

export interface AdviceWindow {
  start: number;
  end: number;
  /** Expected cost of the run (Kč, opportunity cost of PV energy included); null without prices. */
  costKc: number | null;
  /** PV energy covering the run (kWh), of which `lostKwh` would otherwise be curtailed. */
  pvKwh: number;
  lostKwh: number;
  gridKwh: number;
  /** Mean spot price over the window (Kč/kWh). */
  avgPrice: number | null;
  /** Mean expected PV surplus over the window (kW); null without forecast. */
  avgSurplusKw: number | null;
}

export type AdviceBasis = 'price+pv' | 'price' | 'pv';
export interface Advice {
  id: AdviceApplianceId;
  label: string;
  durationH: number;
  infoOnly: boolean;
  status: 'ok' | 'insufficient';
  basis: AdviceBasis | null;
  best: AdviceWindow | null;
  /** Same run started right now (comparison), null when not computable. */
  startNow: AdviceWindow | null;
  /** Running now absorbs surplus that would otherwise be curtailed. */
  urgent: boolean;
  /** Mean spot price over the 24 h horizon. */
  averagePrice: number | null;
  /** Human-readable WHY lines (Czech). */
  reasons: string[];
  /** What is missing for a recommendation (Czech nouns). */
  missing: string[];
}
export interface AdviceResult {
  items: Advice[];
  outlook: AdviceOutlook;
}

export interface AdviceInput {
  now: number;
  timeZone: string;
  prices: PricePoint[];
  pv: PvForecast | null;
  /** Typical house load (kW) that PV must cover before there is a surplus. */
  baselineKw: number | null;
  system?: PvSystem;
  socPercent?: number | null;
  horizonH?: number;
  stepMin?: number;
  appliances?: readonly AdviceApplianceConfig[];
}

const num = (value: number, digits = 1) =>
  new Intl.NumberFormat('cs-CZ', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);

export function hhmm(ms: number, timeZone: string): string {
  const p = localParts(ms, timeZone);
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}

function lookup<T extends { start: number; end: number }>(points: T[], t: number): T | null {
  // Points are sorted; linear scan is fine for ≤ 200 points.
  for (const p of points) if (p.start <= t && t < p.end) return p;
  return null;
}

function inQuiet(t: number, quiet: AdviceApplianceConfig['quiet'], timeZone: string): boolean {
  if (!quiet) return false;
  const h = localParts(t, timeZone).hour;
  return quiet.from > quiet.to ? h >= quiet.from || h < quiet.to : h >= quiet.from && h < quiet.to;
}

/**
 * Baseline energy flow without the appliance: PV − house load charges the battery (until
 * full), then goes to the grid up to the export limit and the inverter AC limit; the rest is
 * curtailed. Deficits discharge the battery down to a 10 % reserve, then import.
 * Battery charge power is not limited (unknown) – a stated simplification.
 */
export function simulateFlow(
  first: number,
  end: number,
  step: number,
  pvAt: (t: number) => number | null,
  loadKw: number,
  system: PvSystem,
  socPercent: number | null,
): FlowStep[] {
  const cap = system.batteryCapacityKwh;
  // Without capacity a (nearly) full battery is still known to absorb nothing.
  let soc = cap !== null && socPercent !== null ? (cap * socPercent) / 100 : null;
  const fullUnknownCap = cap === null && socPercent !== null && socPercent >= 98;
  const dtH = step / HOUR;
  const steps: FlowStep[] = [];
  for (let t = first; t < end; t += step) {
    const pv = pvAt(t);
    if (pv === null) break;
    const surplus = pv - loadKw;
    let chargeKw = 0;
    let exportKw = 0;
    let lostKw = 0;
    let importKw = 0;
    let acHeadKw = Infinity;
    if (surplus >= 0) {
      const headroomKw =
        soc !== null && cap !== null ? Math.max(0, cap - soc) / dtH : fullUnknownCap ? 0 : null;
      chargeKw = headroomKw === null ? surplus : Math.min(surplus, headroomKw);
      const rest = surplus - chargeKw;
      const acCap = system.acLimitKw !== null ? Math.max(0, system.acLimitKw - loadKw) : Infinity;
      const exportCap = Math.min(system.exportLimitKw ?? Infinity, acCap);
      exportKw = Math.min(rest, exportCap);
      // Curtailment is only predictable with a known export limit and battery state.
      lostKw = headroomKw === null || exportCap === Infinity ? 0 : rest - exportKw;
      if (system.acLimitKw !== null) acHeadKw = Math.max(0, system.acLimitKw - loadKw - exportKw);
      if (soc !== null) soc += chargeKw * dtH;
    } else {
      const need = -surplus;
      const avail =
        soc !== null && cap !== null ? Math.max(0, soc - cap * BATTERY_RESERVE) / dtH : 0;
      const discharge = Math.min(need, avail);
      importKw = need - discharge;
      if (soc !== null) soc -= discharge * dtH;
    }
    steps.push({
      start: t,
      pvKw: pv,
      loadKw,
      chargeKw,
      exportKw,
      lostKw,
      acHeadKw,
      importKw,
      socPercent: soc !== null && cap ? (soc / cap) * 100 : fullUnknownCap ? socPercent : null,
    });
  }
  return steps;
}

/**
 * Best start for each appliance within the next `horizonH` hours (default 24).
 *
 * Transparent score = expected cost of the run. Each 15-min step of the run takes energy in
 * this order: (1) surplus that would be curtailed (free), (2) surplus that would be exported
 * (valued at spot × SELF_CONSUMPTION_WEIGHT), (3) energy that would charge the battery
 * (horizon average × weight), (4) grid import at spot. Lowest cost wins (ties: earliest).
 * Without prices the window with the least grid energy wins; without prices and forecast the
 * result is `insufficient`. Windows need data for every step and must respect quiet hours.
 * Read-only – HomeBrain never switches anything.
 */
export function computeAdvice(input: AdviceInput): AdviceResult {
  const {
    now,
    timeZone,
    prices,
    pv,
    baselineKw,
    system = pv?.system ?? PV_SYSTEM_UNKNOWN,
    socPercent = null,
    horizonH = 24,
    stepMin = 15,
    appliances = ADVICE_APPLIANCES,
  } = input;
  const step = stepMin * MIN;
  const dtH = step / HOUR;
  const horizonEnd = now + horizonH * HOUR;
  const first = Math.ceil(now / step) * step;
  const horizonPrices = prices.filter((p) => p.end > now && p.start < horizonEnd);
  const averagePrice = horizonPrices.length
    ? horizonPrices.reduce((s, p) => s + p.price, 0) / horizonPrices.length
    : null;
  const pvPoints = pvUsable(pv) ? pv.points : [];
  const pvFrom = pvPoints[0]?.start ?? Infinity;
  const pvTo = pvPoints[pvPoints.length - 1]?.end ?? -Infinity;
  const pvAt = (t: number): number | null => {
    if (t < pvFrom || t >= pvTo) return null;
    // Inside the covered span, missing night slots are 0 (HA forecasts omit the night).
    return lookup(pvPoints, t)?.kw ?? 0;
  };
  const hasPv = pvPoints.length > 0 && baselineKw !== null && pvTo > now;
  const steps = hasPv
    ? simulateFlow(
        Math.max(first, pvFrom),
        Math.min(horizonEnd, pvTo),
        step,
        pvAt,
        baselineKw!,
        system,
        socPercent,
      )
    : [];
  const flowAt = new Map(steps.map((f) => [f.start, f]));
  const predictableLoss =
    hasPv &&
    system.exportLimitKw !== null &&
    (system.batteryCapacityKwh !== null || (socPercent !== null && socPercent >= 98)) &&
    socPercent !== null;
  const lost = steps.filter((f) => f.lostKw > 0.05);
  const assumptions: string[] = [];
  if (pv?.array?.assumed?.includes('tilt'))
    assumptions.push(`sklon panelů ${num(pv.array.tilt, 0)}° (odhad)`);
  if (pv?.array?.assumed?.includes('azimuth')) assumptions.push('orientace na jih (odhad)');
  if (hasPv && system.batteryCapacityKwh === null)
    assumptions.push('bez kapacity baterie nelze předpovědět její naplnění');
  if (hasPv && system.exportLimitKw === null)
    assumptions.push('bez limitu přetoku nelze předpovědět zahazování přebytku');
  if (hasPv && socPercent === null) assumptions.push('stav baterie neznámý');
  const outlook: AdviceOutlook = {
    steps,
    batteryFullAt: steps.find((f) => f.socPercent !== null && f.socPercent >= 99)?.start ?? null,
    lostKwh: predictableLoss ? lost.reduce((s, f) => s + f.lostKw * dtH, 0) : null,
    firstLossAt: predictableLoss ? (lost[0]?.start ?? null) : null,
    lostNowKw: predictableLoss ? (flowAt.get(first)?.lostKw ?? 0) : 0,
    assumptions,
  };

  const items = appliances.map((cfg): Advice => {
    const duration = Math.round(cfg.durationH * HOUR);
    const hasPrices = horizonPrices.length > 0;
    const basis: AdviceBasis | null =
      hasPrices && hasPv ? 'price+pv' : hasPrices ? 'price' : hasPv ? 'pv' : null;
    const missing: string[] = [];
    if (!hasPrices) missing.push('spotové ceny');
    if (!pvPoints.length) missing.push('předpověď FVE');
    else if (baselineKw === null) missing.push('běžná spotřeba domu');
    const base = {
      id: cfg.id,
      label: cfg.label,
      durationH: cfg.durationH,
      infoOnly: !!cfg.infoOnly,
      averagePrice,
      urgent: false,
    };
    if (!basis)
      return {
        ...base,
        status: 'insufficient',
        basis,
        best: null,
        startNow: null,
        reasons: [],
        missing,
      };

    const evaluate = (start: number, checkQuiet: boolean): AdviceWindow | null => {
      let cost = 0;
      let pvKwh = 0;
      let lostKwh = 0;
      let priceSum = 0;
      let surplusSum = 0;
      let n = 0;
      for (let t = start; t < start + duration; t += step) {
        if (checkQuiet && inQuiet(t, cfg.quiet, timeZone)) return null;
        let price: number | null = null;
        if (basis !== 'pv') {
          const point = lookup(horizonPrices, t);
          if (!point) return null; // price gap
          price = point.price;
        }
        const f = basis === 'price' ? null : flowAt.get(t);
        if (basis === 'pv' && !f) return null;
        const unit = price ?? 1;
        let need = cfg.avgKw;
        const take = (avail: number, kwhPrice: number, isLost = false) => {
          const used = Math.max(0, Math.min(need, avail));
          need -= used;
          cost += used * dtH * kwhPrice;
          if (isLost) lostKwh += used * dtH;
          if (avail !== Infinity) pvKwh += used * dtH;
          return used;
        };
        if (f) {
          take(Math.min(f.lostKw, f.acHeadKw), 0, true);
          take(f.exportKw, Math.max(0, unit) * SELF_CONSUMPTION_WEIGHT);
          take(f.chargeKw, Math.max(0, averagePrice ?? unit) * SELF_CONSUMPTION_WEIGHT);
          surplusSum += Math.max(0, f.pvKw - f.loadKw);
        }
        take(Infinity, unit); // grid import
        priceSum += price ?? 0;
        n++;
      }
      const totalKwh = cfg.avgKw * (duration / HOUR);
      return {
        start,
        end: start + duration,
        costKc: basis === 'pv' ? null : cost,
        pvKwh,
        lostKwh,
        gridKwh: Math.max(0, totalKwh - pvKwh),
        avgPrice: basis === 'pv' ? null : priceSum / n,
        avgSurplusKw: basis === 'price' ? null : surplusSum / n,
      };
    };
    const score = (w: AdviceWindow) => (basis === 'pv' ? w.gridKwh - w.lostKwh * 0.01 : w.costKc!);
    let best: AdviceWindow | null = null;
    for (let start = first; start + duration <= horizonEnd; start += step) {
      const w = evaluate(start, true);
      if (w && (!best || score(w) < score(best) - 1e-9)) best = w;
    }
    const startNow = evaluate(first, false);
    if (!best)
      return {
        ...base,
        status: 'insufficient',
        basis,
        best: null,
        startNow,
        reasons: [],
        missing: missing.length ? missing : ['souvislá data na celou dobu běhu'],
      };

    const urgent =
      outlook.lostNowKw >= 0.3 && best.start === first && best.lostKwh >= 0.1 && !cfg.infoOnly;
    const reasons: string[] = [];
    const totalKwh = cfg.avgKw * cfg.durationH;
    if (best.lostKwh >= 0.05) {
      reasons.push(
        `jinak se přebytek zahodí (${
          outlook.batteryFullAt !== null && outlook.batteryFullAt <= best.start
            ? 'baterie plná, '
            : ''
        }limit přetoku ${num(system.exportLimitKw ?? 0)}\u00a0kW)`,
      );
    }
    if (best.avgSurplusKw !== null && best.pvKwh >= 0.05) {
      reasons.push(
        `přebytek FVE ~${num(best.avgSurplusKw)}\u00a0kW (pokryje ~${num(
          Math.min(100, (best.pvKwh / totalKwh) * 100),
          0,
        )}\u00a0%)`,
      );
    } else if (best.avgSurplusKw !== null) {
      reasons.push('bez přebytku FVE');
    }
    if (best.avgPrice !== null && averagePrice !== null && averagePrice > 0) {
      const diff = Math.round((1 - best.avgPrice / averagePrice) * 100);
      reasons.push(
        `proud ${num(best.avgPrice, 2)} Kč/kWh${
          diff >= 3
            ? `, o ${diff}\u00a0% levnější než průměr`
            : diff <= -3
              ? `, o ${-diff}\u00a0% dražší než průměr`
              : ', kolem průměru'
        }`,
      );
    }
    if (best.pvKwh - best.lostKwh >= 0.05 && basis === 'price+pv')
      reasons.push(
        'vlastní spotřeba má přednost před prodejem (cena nákupu s\u00a0poplatky neznámá)',
      );
    if (
      best.costKc !== null &&
      startNow?.costKc != null &&
      startNow.costKc - best.costKc >= 0.5 &&
      best.start > first
    )
      reasons.push(
        `odhad ${num(best.costKc, best.costKc < 10 ? 1 : 0)} Kč místo ${num(
          startNow.costKc,
          startNow.costKc < 10 ? 1 : 0,
        )} Kč při spuštění teď`,
      );
    return { ...base, status: 'ok', basis, best, startNow, urgent, reasons, missing };
  });
  return { items, outlook };
}

/** Local relative day label: '' (today), 'zítra ', 'pozítří '. */
export function dayLabel(ms: number, now: number, timeZone: string): string {
  const diff = Math.round(
    (startOfLocalDay(ms, timeZone) - startOfLocalDay(now, timeZone)) / (24 * HOUR),
  );
  return diff <= 0 ? '' : diff === 1 ? 'zítra ' : 'pozítří ';
}

const VERB: Record<AdviceApplianceId, string> = {
  dishwasher: 'Myčku pusťte',
  dehumidifier: 'Odvlhčovač zapněte',
  heat_pump: 'Ohřev TČ',
};

/**
 * Dnes signals for appliance windows. Only when the recommendation is worth it (≥ 15 %
 * cheaper than starting now, or PV covers ≥ half of the run) and starts within 12 h.
 * Info-only appliances (heat pump) never produce a Dnes signal.
 */
export function adviceSignals(advice: Advice[], now: number, timeZone = 'Europe/Prague'): Signal[] {
  const signals: Signal[] = [];
  for (const a of advice) {
    const w = a.best;
    if (a.infoOnly || a.status !== 'ok' || !w || w.start - now > 12 * HOUR) continue;
    const total = w.pvKwh + w.gridKwh || 1;
    const pvShare = w.pvKwh / total;
    const nowCost = a.startNow?.costKc ?? null;
    const cheaper =
      w.costKc !== null && nowCost !== null && nowCost > 0 ? 1 - w.costKc / nowCost : 0;
    if (cheaper < 0.15 && pvShare < 0.5 && !a.urgent) continue;
    const active = w.start <= now + 15 * MIN;
    signals.push({
      id: `energy.advice.${a.id}.${Math.round(w.start / (15 * MIN))}`,
      module: 'energy',
      group: 'energy.advice',
      kind: 'window',
      severity: active || w.start - now <= HOUR ? 'notice' : 'info',
      tone: 'opportunity',
      // Curtailed surplus is lost for good – the strongest reason to act now.
      relevance: a.urgent ? 0.75 : 0.5,
      valid_from: new Date(now).toISOString(),
      valid_to: new Date(w.start + 30 * MIN).toISOString(),
      title: a.urgent
        ? `${VERB[a.id]} teď – jinak se přebytek zahodí`
        : active
          ? `${a.label}: teď je výhodná chvíle`
          : `${VERB[a.id]} ${dayLabel(w.start, now, timeZone)}${hhmm(w.start, timeZone)}–${hhmm(
              w.end,
              timeZone,
            )}`,
      context: `${a.reasons.join(' · ')}. Doporučení – HomeBrain nic nezapíná.`,
      value:
        w.avgPrice !== null
          ? { v: num(w.avgPrice, 2), unit: 'Kč/kWh' }
          : { v: num(w.avgSurplusKw ?? 0), unit: 'kW', label: 'přebytek' },
      action: { type: 'navigate', label: 'Energie', href: '/energy' },
      source: {
        name: a.basis === 'price' ? 'Spotová cena' : 'Předpověď FVE · spot',
        updated_at: new Date(now).toISOString(),
        stale_after_s: 3600,
      },
    });
  }
  return signals;
}

/** Baseline house load: 7-day average from statistics, else the current reading. */
export function adviceBaseline(
  model: EnergyModel,
  history?: Parameters<typeof houseBaselineKw>[0],
): { kw: number | null; source: 'history' | 'now' | null } {
  const fromHistory = houseBaselineKw(history);
  if (fromHistory !== null) return { kw: fromHistory, source: 'history' };
  const house = model.power.house;
  if (house.quality === 'ok' && house.value !== null) return { kw: house.value, source: 'now' };
  return { kw: null, source: null };
}

/** Structurally matches TodaySignalFeed in @homebrain/module-today (no import cycle). */
export interface AdviceSignalFeed {
  subscribe: (cb: (signals: Signal[]) => void) => () => void;
}

/**
 * Dnes feed for appliance recommendations. Reads bindings, states, statistics and the PV
 * forecast over WS every 15 minutes; on any error emits [] (no fixture substitution).
 */
export function energyAdviceTodaySignalSource(
  context?: { connection?: ConnectionLike },
  options: { pollMs?: number; clock?: () => number; timeZone?: string } = {},
): AdviceSignalFeed | null {
  const connection = context?.connection;
  if (!connection) return null;
  const { pollMs = 15 * MIN, clock = Date.now, timeZone = 'Europe/Prague' } = options;
  return {
    subscribe: (cb) => {
      let active = true;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const tick = async () => {
        try {
          const all = await connection.sendMessagePromise<Record<string, Record<string, string>>>({
            type: 'homebrain/bindings/get',
          });
          const bindings = all?.energy ?? {};
          const priceId = bindings.energy_spot_price_electricity?.trim();
          const states = priceId
            ? await connection.sendMessagePromise<EntityStateLike[]>({ type: 'get_states' })
            : [];
          const byId = new Map((states ?? []).map((st: EntityStateLike) => [st.entity_id, st]));
          const now = clock();
          const model = adaptEnergyEntities({
            bindings,
            getState: (id) => byId.get(id),
            now,
            timeZone,
          });
          const [pv, history] = await Promise.all([
            fetchPvForecast(connection, timeZone),
            fetchEnergyHistory(connection, bindings, now, timeZone).catch(() => undefined),
          ]);
          const baseline = adviceBaseline(model, history);
          const advice = computeAdvice({
            now,
            timeZone,
            prices: model.price.series,
            pv,
            baselineKw: baseline.kw,
            socPercent: model.batterySoc.quality === 'ok' ? model.batterySoc.value : null,
          });
          if (active) cb(adviceSignals(advice.items, now, timeZone));
        } catch {
          if (active) cb([]);
        }
        if (active && pollMs > 0) timer = setTimeout(() => void tick(), pollMs);
      };
      void tick();
      return () => {
        active = false;
        if (timer) clearTimeout(timer);
      };
    },
  };
}

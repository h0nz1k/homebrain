import type { Signal, SignalSource } from '@homebrain/signals';
import { localParts } from './adapter.js';
import type { EnergyHistory, EnergyModel } from './contract.js';

export interface EnergySignalOptions {
  /** A window counts as cheap when its mean is at most this share of the daily average. */
  cheapRatio?: number;
  batteryLowPercent?: number;
  batteryCriticalPercent?: number;
  exportPeakKw?: number;
  /** Absolute floor and multiple of the 7-day hourly baseline for a consumption anomaly. */
  anomalyMinKw?: number;
  anomalyFactor?: number;
}

const num = (value: number, digits = 1) =>
  new Intl.NumberFormat('cs-CZ', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
const iso = (ms: number) => new Date(ms).toISOString();

function hourRange(start: number, end: number, timeZone: string) {
  const endParts = localParts(end, timeZone);
  const endHour = endParts.hour === 0 && endParts.minute === 0 ? 24 : endParts.hour;
  return `${localParts(start, timeZone).hour}–${endHour} h`;
}

function latest(model: EnergyModel): string {
  const times = [model.power.pv, model.power.grid, model.batterySoc, model.price.now]
    .map((r) => r.updatedAt)
    .filter((t): t is string => !!t && Number.isFinite(Date.parse(t)))
    .sort();
  return times[times.length - 1] ?? iso(model.now);
}

/** Average house load per hour over the last 7 days (kW), from daily recorder statistics. */
export function houseBaselineKw(history: EnergyHistory | undefined): number | null {
  const days = history?.daily.energy_house_energy_today ?? [];
  const full = days.slice(0, -1).filter((d) => d.value > 0);
  return full.length ? full.reduce((s, d) => s + d.value, 0) / full.length / 24 : null;
}

/**
 * Energy signals for the Dnes screen (packages/signals format, read-only, no service actions).
 * Signals are only produced from `ok` data – stale or unverified inputs stay silent.
 */
export function energySignals(
  model: EnergyModel,
  history?: EnergyHistory,
  options: EnergySignalOptions = {},
): Signal[] {
  const {
    cheapRatio = 0.8,
    batteryLowPercent = 20,
    batteryCriticalPercent = 10,
    exportPeakKw = 3,
    anomalyMinKw = 2.5,
    anomalyFactor = 3,
  } = options;
  const { now, timeZone } = model;
  const signals: Signal[] = [];
  const source = (name: string, staleAfter: number): SignalSource => ({
    name,
    updated_at: latest(model),
    stale_after_s: staleAfter,
  });
  const navigate = { type: 'navigate' as const, label: 'Energie', href: '/energy' };

  const window = model.price.cheapestNext;
  const average = model.price.averageToday;
  if (window && average && average > 0 && window.mean <= average * cheapRatio) {
    const active = window.start <= now && now < window.end;
    const startsSoon = window.start - now <= 2 * 3_600_000;
    const saving = Math.round((1 - window.mean / average) * 100);
    signals.push({
      id: `energy.cheap.${localParts(window.start, timeZone).day}.${localParts(window.start, timeZone).hour}`,
      module: 'energy',
      group: 'energy.opportunity',
      kind: 'window',
      severity: active || startsSoon ? 'notice' : 'info',
      tone: 'opportunity',
      relevance: 0.6,
      valid_from: iso(window.start),
      valid_to: iso(window.end),
      title: active
        ? 'Levný proud teď'
        : `Levný proud ${
            localParts(window.start, timeZone).day === localParts(now, timeZone).day ? '' : 'zítra '
          }${hourRange(window.start, window.end, timeZone)}`,
      context: `O ${saving} % levnější než dnešní průměr. Vhodné pro pračku nebo myčku.`,
      value: { v: num(window.mean, 2), unit: 'Kč/kWh' },
      action: navigate,
      source: source('Spotová cena', 2 * 3600),
    });
  }

  const soc = model.batterySoc;
  const batteryKw = model.power.battery.quality === 'ok' ? model.power.battery.value : null;
  if (soc.quality === 'ok' && soc.value !== null && soc.value <= batteryLowPercent) {
    const discharging = batteryKw !== null && batteryKw > 0.05;
    const critical = soc.value <= batteryCriticalPercent && discharging;
    signals.push({
      id: 'energy.battery.low',
      module: 'energy',
      kind: 'state',
      severity: critical ? 'warning' : 'notice',
      tone: 'risk',
      relevance: critical ? 0.8 : 0.5,
      valid_from: soc.updatedAt ?? iso(now),
      valid_to: iso(now + 3_600_000),
      title: `Baterie ${num(soc.value, 0)} %`,
      context: discharging
        ? `Vybíjí ${num(batteryKw!)} kW, brzy dojde na rezervu.`
        : 'Baterie je na rezervě, dům odebírá ze sítě.',
      value: { v: num(soc.value, 0), unit: '%' },
      action: navigate,
      source: source('Baterie', 1800),
    });
  }

  const exportKw =
    model.power.grid.quality === 'ok' && model.power.grid.value !== null
      ? -model.power.grid.value
      : null;
  if (exportKw !== null && exportKw >= exportPeakKw) {
    signals.push({
      id: 'energy.export.peak',
      module: 'energy',
      group: 'energy.opportunity',
      kind: 'state',
      severity: 'info',
      tone: 'opportunity',
      relevance: 0.45,
      valid_from: model.power.grid.updatedAt ?? iso(now),
      valid_to: iso(now + 30 * 60_000),
      title: `Přetok do sítě ${num(exportKw)} kW`,
      context:
        soc.value !== null && soc.value >= 95
          ? 'Baterie je plná – teď je vhodná chvíle pro spotřebiče.'
          : 'Přebytek FVE odchází do sítě – vhodné pro spotřebiče.',
      value: { v: num(exportKw), unit: 'kW' },
      action: navigate,
      source: source('FVE · elektroměr', 600),
    });
  }

  const house = model.power.house;
  const baseline = houseBaselineKw(history);
  if (house.quality === 'ok' && house.value !== null && baseline !== null && baseline > 0) {
    const ratio = house.value / baseline;
    if (house.value >= anomalyMinKw && ratio >= anomalyFactor) {
      signals.push({
        id: 'energy.consumption.high',
        module: 'energy',
        kind: 'state',
        severity: 'notice',
        tone: 'risk',
        relevance: 0.55,
        valid_from: house.updatedAt ?? iso(now),
        valid_to: iso(now + 30 * 60_000),
        title: `Vysoká spotřeba ${num(house.value)} kW`,
        context: `${num(ratio)}× víc než průměr posledních 7 dní (${num(baseline, 2)} kW).`,
        value: { v: num(house.value), unit: 'kW' },
        action: navigate,
        source: source('Spotřeba domu', 600),
      });
    }
  }
  return signals;
}

import type { Signal } from '@homebrain/signals';
import { czPlural } from '@homebrain/ui';
import type { WineRecord } from './domain/index.js';

export interface CellarReading {
  value: number | null;
  updatedAt: string | null;
}
export interface WineSignalInput {
  wines: readonly WineRecord[];
  temperature?: CellarReading;
  humidity?: CellarReading;
  now: Date;
}
export const CELLAR_TEMP = { ideal: [10, 15], hard: [7, 18] } as const;
export const CELLAR_HUMIDITY = { ideal: [50, 80] } as const;

const cs1 = new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 1 });

export type Range = 'ok' | 'soft' | 'hard';
export function temperatureRange(t: number): Range {
  if (t < CELLAR_TEMP.hard[0] || t > CELLAR_TEMP.hard[1]) return 'hard';
  if (t < CELLAR_TEMP.ideal[0] || t > CELLAR_TEMP.ideal[1]) return 'soft';
  return 'ok';
}
export function humidityRange(h: number): Range {
  return h < CELLAR_HUMIDITY.ideal[0] || h > CELLAR_HUMIDITY.ideal[1] ? 'soft' : 'ok';
}

/** Dnes signals for the wine module (packages/signals format). */
export function deriveWineSignals({
  wines,
  temperature,
  humidity,
  now,
}: WineSignalInput): Signal[] {
  const signals: Signal[] = [];
  const iso = now.toISOString();
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 0);
  const action = { type: 'navigate' as const, label: 'Otevřít vinotéku', href: '/wine' };
  const sensor = (r: CellarReading) => ({
    name: 'Vinotéka – čidlo',
    updated_at: r.updatedAt ?? iso,
    stale_after_s: 3600,
  });
  if (temperature?.value != null && Number.isFinite(temperature.value)) {
    const range = temperatureRange(temperature.value);
    if (range !== 'ok') {
      const high = temperature.value > CELLAR_TEMP.ideal[1];
      signals.push({
        id: 'wine.cellar.temperature',
        module: 'wine',
        group: 'wine.cellar',
        severity: range === 'hard' ? 'warning' : 'notice',
        tone: 'risk',
        kind: 'state',
        relevance: range === 'hard' ? 0.8 : 0.5,
        valid_from: iso,
        valid_to: new Date(now.getTime() + 3600_000).toISOString(),
        title: high ? 'Ve vinotéce je příliš teplo' : 'Ve vinotéce je příliš chladno',
        context: `Doporučeno ${CELLAR_TEMP.ideal[0]}–${CELLAR_TEMP.ideal[1]} °C`,
        value: { v: cs1.format(temperature.value), unit: '°C', label: 'teplota' },
        action,
        source: sensor(temperature),
      });
    }
  }
  if (
    humidity?.value != null &&
    Number.isFinite(humidity.value) &&
    humidityRange(humidity.value) !== 'ok'
  ) {
    signals.push({
      id: 'wine.cellar.humidity',
      module: 'wine',
      group: 'wine.cellar',
      severity: 'notice',
      tone: 'risk',
      kind: 'state',
      relevance: 0.4,
      valid_from: iso,
      valid_to: new Date(now.getTime() + 3600_000).toISOString(),
      title:
        humidity.value < CELLAR_HUMIDITY.ideal[0] ? 'Ve vinotéce je sucho' : 'Ve vinotéce je vlhko',
      context: `Doporučeno ${CELLAR_HUMIDITY.ideal[0]}–${CELLAR_HUMIDITY.ideal[1]} %`,
      value: { v: cs1.format(humidity.value), unit: '%', label: 'vlhkost' },
      action,
      source: sensor(humidity),
    });
  }
  const year = now.getFullYear();
  const stocked = wines.filter((w) => w.quantity > 0 && w.drinkWindow);
  const groups: Array<{
    id: string;
    list: WineRecord[];
    title: (n: number) => string;
    context: string;
    severity: Signal['severity'];
    relevance: number;
  }> = [
    {
      id: 'wine.window.closing',
      list: stocked.filter((w) => w.drinkWindow!.to !== null && w.drinkWindow!.to < year),
      title: (n) => `${n} ${czPlural(n, 'víno je', 'vína jsou', 'vín je')} po okně pití`,
      context: 'Doporučujeme vypít co nejdřív',
      severity: 'notice',
      relevance: 0.45,
    },
    {
      id: 'wine.window.last-year',
      list: stocked.filter((w) => w.drinkWindow!.to === year),
      title: (n) => `${n} ${czPlural(n, 'víno', 'vína', 'vín')} vypít letos`,
      context: 'Poslední rok ideálního okna pití',
      severity: 'notice',
      relevance: 0.35,
    },
    {
      id: 'wine.window.open',
      list: stocked.filter((w) => w.drinkWindow!.from === year),
      title: (n) => `${n} ${czPlural(n, 'víno dozrálo', 'vína dozrála', 'vín dozrálo')} k pití`,
      context: 'Letos začíná okno pití',
      severity: 'info',
      relevance: 0.25,
    },
  ];
  for (const g of groups) {
    if (!g.list.length) continue;
    const bottles = g.list.reduce((sum, w) => sum + w.quantity, 0);
    signals.push({
      id: g.id,
      module: 'wine',
      group: 'wine.window',
      severity: g.severity,
      tone: g.severity === 'info' ? 'opportunity' : 'neutral',
      kind: 'window',
      relevance: g.relevance,
      valid_from: iso,
      valid_to: endOfDay.toISOString(),
      title: g.title(g.list.length),
      context: `${g.context} · ${bottles} ${czPlural(bottles, 'lahev', 'lahve', 'lahví')}`,
      action,
      source: { name: 'Vinotéka', updated_at: iso, stale_after_s: 86400 },
      related: g.list.map((w) => w.id),
    });
  }
  return signals;
}

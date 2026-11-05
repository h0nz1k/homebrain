import { describe, expect, it } from 'vitest';
import type { EntityStateLike } from '@homebrain/ha-client';
import {
  adaptEnergyEntities,
  cheapestWindow,
  fetchEnergyHistory,
  parsePriceSeries,
  priceLevels,
  startOfLocalDay,
} from './adapter';
import { createEnergyDemo, DEMO_ENERGY_BINDINGS, DEMO_PRICES_TODAY } from './fixtures';
import type { PricePoint } from './contract';

const NOW = Date.parse('2026-10-31T10:40:00+01:00');
const HOUR = 3_600_000;
const W = { unit_of_measurement: 'W' };
const s = (
  entity_id: string,
  state: string | number,
  attributes: Record<string, unknown> = W,
  age = 5_000,
): EntityStateLike => ({
  entity_id,
  state: String(state),
  attributes,
  last_updated: new Date(NOW - age).toISOString(),
});
function adapt(states: EntityStateLike[], bindings: Record<string, string>) {
  const map = new Map(states.map((x) => [x.entity_id, x]));
  return adaptEnergyEntities({ bindings, getState: (id) => map.get(id), now: NOW });
}
const series = (prices: number[], start = startOfLocalDay(NOW, 'Europe/Prague')): PricePoint[] =>
  prices.map((price, i) => ({ start: start + i * HOUR, end: start + (i + 1) * HOUR, price }));

describe('adaptEnergyEntities', () => {
  it('converts W to kW and keeps documented polarity (import +, discharge +)', () => {
    const m = adapt(
      [
        s('sensor.pv', 2400),
        s('sensor.grid', -500),
        s('sensor.bat', -1100),
        s('sensor.house', 800),
      ],
      {
        energy_pv_power: 'sensor.pv',
        energy_grid_power: 'sensor.grid',
        energy_battery_power: 'sensor.bat',
        energy_house_power: 'sensor.house',
      },
    );
    expect(m.power.pv.value).toBeCloseTo(2.4);
    expect(m.power.grid.value).toBeCloseTo(-0.5);
    expect(m.power.battery.value).toBeCloseTo(-1.1);
    expect(m.power.grid.quality).toBe('ok');
    expect(m.power.battery.quality).toBe('ok');
  });

  it('flags unverified polarity when the balance only works with a flipped grid sign', () => {
    // Raw meter convention (negative = import) bound as energy_grid_power.
    const m = adapt(
      [s('sensor.pv', 0), s('sensor.grid', -853), s('sensor.bat', -10), s('sensor.house', 851)],
      {
        energy_pv_power: 'sensor.pv',
        energy_grid_power: 'sensor.grid',
        energy_battery_power: 'sensor.bat',
        energy_house_power: 'sensor.house',
      },
    );
    expect(m.power.grid.quality).toBe('unverified_polarity');
    expect(m.notices.join()).toMatch(/Znaménko/);
  });

  it('prefers non-negative import/export channels and derives house load', () => {
    const m = adapt(
      [s('sensor.pv', 3000), s('sensor.imp', 0), s('sensor.exp', 1200), s('sensor.bat', 0)],
      {
        energy_pv_power: 'sensor.pv',
        energy_grid_import_power: 'sensor.imp',
        energy_grid_export_power: 'sensor.exp',
        energy_battery_power: 'sensor.bat',
      },
    );
    expect(m.power.grid.value).toBeCloseTo(-1.2);
    expect(m.power.houseDerived).toBe(true);
    expect(m.power.house.value).toBeCloseTo(1.8);
  });

  it('marks invalid units instead of a silent zero (ENE-003)', () => {
    const m = adapt([s('sensor.pv', 5, { unit_of_measurement: 'A' })], {
      energy_pv_power: 'sensor.pv',
    });
    expect(m.power.pv).toMatchObject({ value: null, quality: 'invalid_unit' });
    expect(m.quality).toBe('invalid_unit');
  });

  it('does not mix daily energy and power units (ENE-005)', () => {
    const m = adapt([s('sensor.e', 12, { unit_of_measurement: 'kW' })], {
      energy_pv_energy_today: 'sensor.e',
    });
    expect(m.today.pv.quality).toBe('invalid_unit');
  });

  it('returns unknown self-sufficiency for zero house energy (ENE-009)', () => {
    const kWh = { unit_of_measurement: 'kWh' };
    const m = adapt([s('sensor.h', 0, kWh), s('sensor.i', 0, kWh)], {
      energy_house_energy_today: 'sensor.h',
      energy_grid_import_energy_today: 'sensor.i',
    });
    expect(m.selfSufficiencyPercent).toBeNull();
    const ok = adapt([s('sensor.h', 10, kWh), s('sensor.i', 4, kWh)], {
      energy_house_energy_today: 'sensor.h',
      energy_grid_import_energy_today: 'sensor.i',
    });
    expect(ok.selfSufficiencyPercent).toBeCloseTo(60);
  });

  it('computes phase spread only with all three phases ok (ENE-002)', () => {
    const b = {
      energy_phase_l1_power: 'sensor.l1',
      energy_phase_l2_power: 'sensor.l2',
      energy_phase_l3_power: 'sensor.l3',
    };
    expect(
      adapt([s('sensor.l1', 370), s('sensor.l2', 210), s('sensor.l3', 230)], b).power.phaseSpreadKw,
    ).toBeCloseTo(0.16);
    expect(
      adapt([s('sensor.l1', 370), s('sensor.l2', 'unavailable')], b).power.phaseSpreadKw,
    ).toBeNull();
  });

  it('reports unavailable without bindings', () => {
    const m = adapt([], {});
    expect(m.quality).toBe('unavailable');
    expect(m.notices).toContain('Nejsou nastaveny vazby modulu Energie');
  });

  it('builds the demo model with today + tomorrow prices and windows', () => {
    const demo = createEnergyDemo(NOW);
    const m = adaptEnergyEntities({
      bindings: demo.bindings,
      getState: (id) => demo.states[id],
      now: NOW,
    });
    expect(m.quality).toBe('ok');
    expect(m.price.series).toHaveLength(48);
    expect(m.price.now.value).toBe(DEMO_PRICES_TODAY[10]);
    expect(m.price.cheapestToday).toMatchObject({ mean: 0.9 });
    expect(new Date(m.price.cheapestToday!.start).toISOString()).toBe('2026-10-31T12:00:00.000Z');
    expect(m.price.cheapestTomorrow!.mean).toBeCloseTo(0.785);
    expect(m.price.next!.price).toBe(DEMO_PRICES_TODAY[11]);
    expect(m.power.grid.quality).toBe('ok');
  });
});

describe('prices', () => {
  it('parses ISO-key attributes, [order, price] pairs and MWh units', () => {
    const iso = (h: number) =>
      new Date(Date.parse('2026-11-01T00:00:00+01:00') + h * HOUR).toISOString();
    const pairs = parsePriceSeries(
      s('sensor.o', 'unknown', { [iso(0)]: [3, 2.5], [iso(1)]: [1, 1.5], friendly_name: 'x' }),
    );
    expect(pairs.map((p) => p.price)).toEqual([2.5, 1.5]);
    const mwh = parsePriceSeries(
      s('sensor.p', 1, { unit_of_measurement: 'Kč/MWh', today: [{ start: iso(0), value: 2100 }] }),
    );
    expect(mwh[0]!.price).toBeCloseTo(2.1);
    expect(mwh[0]!.end - mwh[0]!.start).toBe(HOUR);
    expect(
      parsePriceSeries(s('sensor.e', 1, { unit_of_measurement: 'EUR/MWh', [iso(0)]: 90 })),
    ).toEqual([]);
  });

  it('finds the cheapest contiguous window (ENE-007)', () => {
    const pts = series([5, 4, 1, 2, 1, 1, 6]);
    expect(cheapestWindow(pts, 2)).toMatchObject({ start: pts[4]!.start, mean: 1 });
    expect(cheapestWindow(pts, 3)!.start).toBe(pts[2]!.start);
    // `from` skips windows whose first slot already ended; pts[5..6] is the only one left.
    expect(cheapestWindow(pts, 2, pts[4]!.end)).toMatchObject({ start: pts[5]!.start, mean: 3.5 });
    expect(cheapestWindow(pts, 2, pts[5]!.end)).toBeNull();
    expect(cheapestWindow(pts.slice(0, 1), 2)).toBeNull();
  });

  it('handles 15-minute intervals and gaps', () => {
    const start = startOfLocalDay(NOW, 'Europe/Prague');
    const q = [3, 3, 1, 1, 1, 1, 3, 3].map((price, i) => ({
      start: start + i * 900_000,
      end: start + (i + 1) * 900_000,
      price,
    }));
    expect(cheapestWindow(q, 1)).toMatchObject({ start: q[2]!.start, end: q[5]!.end, mean: 1 });
    const gap = [...series([1]), ...series([1], startOfLocalDay(NOW, 'Europe/Prague') + 5 * HOUR)];
    expect(cheapestWindow(gap, 2)).toBeNull();
  });

  it('computes local midnight across DST transitions (no fixed 24 h arithmetic)', () => {
    const tz = 'Europe/Prague';
    // 2026-10-25: CEST -> CET, 25 h day; midnight is still +02:00.
    expect(startOfLocalDay(Date.parse('2026-10-25T02:30:00+01:00'), tz)).toBe(
      Date.parse('2026-10-25T00:00:00+02:00'),
    );
    expect(startOfLocalDay(Date.parse('2026-10-25T23:59:00+01:00'), tz)).toBe(
      Date.parse('2026-10-25T00:00:00+02:00'),
    );
    expect(startOfLocalDay(Date.parse('2026-10-26T00:00:00+01:00'), tz)).toBe(
      Date.parse('2026-10-26T00:00:00+01:00'),
    );
    // 2026-03-29: CET -> CEST, 23 h day; midnight is +01:00.
    expect(startOfLocalDay(Date.parse('2026-03-29T12:00:00+02:00'), tz)).toBe(
      Date.parse('2026-03-29T00:00:00+01:00'),
    );
    expect(startOfLocalDay(Date.parse('2026-10-31T10:40:12.345+01:00'), tz)).toBe(
      Date.parse('2026-10-31T00:00:00+01:00'),
    );
  });

  it('assigns relative levels by quartile', () => {
    const level = priceLevels(series(DEMO_PRICES_TODAY));
    expect(level(0.9)).toBe('cheap');
    expect(level(4.92)).toBe('peak');
    expect(level(3.4)).toBe('expensive');
    expect(level(2.4)).toBe('normal');
  });
});

describe('fetchEnergyHistory', () => {
  it('queries recorder statistics hourly and daily for bound counters only', async () => {
    const demo = createEnergyDemo(NOW);
    const messages: Array<Record<string, unknown>> = [];
    const connection = {
      async sendMessagePromise<T>(message: { type: string }) {
        messages.push(message as Record<string, unknown>);
        return demo.statistics(message as never) as T;
      },
    };
    const history = await fetchEnergyHistory(connection, DEMO_ENERGY_BINDINGS, NOW);
    expect(history.status).toBe('ready');
    expect(messages.map((m) => [m.type, m.period])).toEqual([
      ['recorder/statistics_during_period', 'hour'],
      ['recorder/statistics_during_period', 'day'],
    ]);
    expect(messages[0]!.statistic_ids).toEqual([
      DEMO_ENERGY_BINDINGS.energy_pv_energy_today,
      DEMO_ENERGY_BINDINGS.energy_house_energy_today,
      DEMO_ENERGY_BINDINGS.energy_grid_import_energy_today,
      DEMO_ENERGY_BINDINGS.energy_grid_export_energy_today,
    ]);
    expect(messages[0]!.types).toEqual(['change']);
    expect(history.hourly.energy_pv_energy_today).toHaveLength(24);
    expect(history.daily.energy_house_energy_today).toHaveLength(7);
    expect(new Date(String(messages[1]!.start_time)).toISOString()).toBe(
      '2026-10-24T22:00:00.000Z',
    );
  });

  it('is unsupported without statistic bindings and parses ISO starts', async () => {
    const never = { sendMessagePromise: () => Promise.reject(new Error('no')) };
    expect((await fetchEnergyHistory(never, {}, NOW)).status).toBe('unsupported');
    const iso = {
      sendMessagePromise: async <T>() =>
        ({
          'sensor.pv': [
            { start: '2026-10-31T09:00:00+01:00', change: 1.25 },
            { start: 'bad', change: 1 },
          ],
        }) as T,
    };
    const h = await fetchEnergyHistory(iso, { energy_pv_energy_today: 'sensor.pv' }, NOW);
    expect(h.hourly.energy_pv_energy_today).toEqual([
      { start: Date.parse('2026-10-31T09:00:00+01:00'), value: 1.25 },
    ]);
  });
});

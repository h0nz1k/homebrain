import { describe, expect, it } from 'vitest';
import { parsePriceSeries } from './adapter.js';
import {
  adviceSignals,
  computeAdvice,
  fetchPvForecast,
  hhmm,
  parseHaSolarForecast,
  type PvForecast,
} from './advice.js';
import type { PricePoint } from './contract.js';

const TZ = 'Europe/Prague';
const MIN = 60_000;
const HOUR = 60 * MIN;
const points = (start: number, stepMin: number, prices: number[]): PricePoint[] =>
  prices.map((price, i) => ({
    start: start + i * stepMin * MIN,
    end: start + (i + 1) * stepMin * MIN,
    price,
  }));
const pvConst = (from: number, to: number, kw: number): PvForecast => ({
  status: 'ok',
  source: 'open_meteo',
  points: Array.from({ length: (to - from) / HOUR }, (_, i) => ({
    start: from + i * HOUR,
    end: from + (i + 1) * HOUR,
    kw,
  })),
  days: {},
});
const only = (id: string) => (r: ReturnType<typeof computeAdvice>) =>
  r.items.find((a) => a.id === id)!;

describe('computeAdvice – prices', () => {
  it('picks a 15-min aligned window from 15-min prices and explains why', () => {
    const now = Date.parse('2026-11-02T08:00:00+01:00');
    const prices = Array.from({ length: 96 }, (_, i) => (i >= 21 && i < 31 ? 1.2 : 2.2));
    const r = computeAdvice({
      now,
      timeZone: TZ,
      prices: points(now, 15, prices),
      pv: null,
      baselineKw: null,
    });
    const dw = only('dishwasher')(r);
    expect(dw.status).toBe('ok');
    expect(dw.basis).toBe('price');
    expect(hhmm(dw.best!.start, TZ)).toBe('13:15');
    expect(hhmm(dw.best!.end, TZ)).toBe('15:45');
    expect(dw.reasons.join(' ')).toMatch(/proud 1,20 Kč\/kWh, o \d+\u00a0% levnější než průměr/);
    expect(dw.missing).toContain('předpověď FVE');
  });

  it('handles the 25 h DST day and respects quiet hours', () => {
    // 2026-10-25: 02:00–03:00 happens twice (CEST, then CET).
    const now = Date.parse('2026-10-24T22:00:00Z'); // local midnight
    const attrs: Record<string, unknown> = { unit_of_measurement: 'Kč/kWh' };
    for (let i = 0; i < 25; i++) {
      const t = now + i * HOUR;
      attrs[new Date(t).toISOString()] = i >= 2 && i <= 4 ? 0.5 : 3;
    }
    const series = parsePriceSeries({
      entity_id: 'sensor.x',
      state: '3',
      last_updated: '',
      attributes: attrs,
    } as never);
    expect(series).toHaveLength(25);
    const r = computeAdvice({ now, timeZone: TZ, prices: series, pv: null, baselineKw: null });
    const dh = only('dehumidifier')(r);
    // second 02:00 (CET) .. 04:00 local
    expect(new Date(dh.best!.start).toISOString()).toBe('2026-10-25T00:00:00.000Z');
    expect(hhmm(dh.best!.start, TZ)).toBe('02:00');
    expect(hhmm(dh.best!.end, TZ)).toBe('04:00');
    const dw = only('dishwasher')(r);
    expect(Number(hhmm(dw.best!.start, TZ).slice(0, 2))).toBeGreaterThanOrEqual(6);
    expect(Number(hhmm(dw.best!.end - 1, TZ).slice(0, 2))).toBeLessThan(22);
  });

  it('keeps mixed hourly + 15-min series contiguous', () => {
    const attrs: Record<string, unknown> = { unit_of_measurement: 'Kč/kWh' };
    const day = Date.parse('2026-11-01T23:00:00Z');
    for (let i = 0; i < 24; i++) attrs[new Date(day - 24 * HOUR + i * HOUR).toISOString()] = 2;
    for (let i = 0; i < 96; i++) attrs[new Date(day + i * 15 * MIN).toISOString()] = 1;
    const s = parsePriceSeries({ attributes: attrs, state: '2' } as never);
    expect(s).toHaveLength(120);
    expect(s[0]!.end - s[0]!.start).toBe(HOUR);
    expect(s[119]!.end - s[119]!.start).toBe(15 * MIN);
    expect(s.every((p, i) => i === 0 || s[i - 1]!.end === p.start)).toBe(true);
  });
});

describe('computeAdvice – missing data', () => {
  it('is honest without prices and forecast', () => {
    const r = computeAdvice({
      now: Date.now(),
      timeZone: TZ,
      prices: [],
      pv: null,
      baselineKw: 0.5,
    });
    for (const a of r.items) {
      expect(a.status).toBe('insufficient');
      expect(a.missing).toEqual(['spotové ceny', 'předpověď FVE']);
    }
    expect(adviceSignals(r.items, Date.now(), TZ)).toEqual([]);
  });

  it('never spans a price gap', () => {
    const now = Date.parse('2026-11-02T08:00:00+01:00');
    const a = points(now, 60, [3, 3, 3, 3]);
    const b = points(now + 5 * HOUR, 60, [0.5, 0.5, 3, 3, 3]); // gap 12:00–13:00
    const r = computeAdvice({
      now,
      timeZone: TZ,
      prices: [...a, ...b],
      pv: null,
      baselineKw: null,
    });
    const dw = only('dishwasher')(r);
    expect(dw.best!.start).toBeGreaterThanOrEqual(now + 5 * HOUR);
  });

  it('needs a baseline to use the PV forecast', () => {
    const now = Date.parse('2026-06-02T09:00:00+02:00');
    const r = computeAdvice({
      now,
      timeZone: TZ,
      prices: [],
      pv: pvConst(now, now + 8 * HOUR, 4),
      baselineKw: null,
    });
    expect(only('dishwasher')(r).missing).toEqual(['spotové ceny', 'běžná spotřeba domu']);
  });
});

describe('computeAdvice – PV, battery and curtailment', () => {
  const now = Date.parse('2026-06-02T10:00:00+02:00');
  const prices = points(now - 10 * HOUR, 60, Array(40).fill(2));
  it('flags curtailed surplus as urgent "teď"', () => {
    const r = computeAdvice({
      now,
      timeZone: TZ,
      prices,
      pv: pvConst(now - 3 * HOUR, now + 5 * HOUR, 6),
      baselineKw: 0.5,
      socPercent: 97,
      system: { acLimitKw: 8, batteryCapacityKwh: 10, exportLimitKw: 3 },
    });
    expect(r.outlook.batteryFullAt).toBe(now);
    expect(r.outlook.lostNowKw).toBeCloseTo(2.5 - 0.3 * 4, 0); // 6 − 0.5 − charge − 3
    expect(r.outlook.lostKwh).toBeGreaterThan(5);
    const dw = only('dishwasher')(r);
    expect(dw.urgent).toBe(true);
    expect(dw.best!.start).toBe(now);
    expect(dw.reasons[0]).toContain('jinak se přebytek zahodí');
    const signals = adviceSignals(r.items, now, TZ);
    const s = signals.find((x) => x.id.startsWith('energy.advice.dishwasher'))!;
    expect(s.title).toBe('Myčku pusťte teď – jinak se přebytek zahodí');
    expect(s.relevance).toBe(0.75);
    expect(signals.some((x) => x.id.includes('heat_pump'))).toBe(false); // info only
  });

  it('prefers self-consumption over export when the buy price is unknown', () => {
    // Flat price; PV surplus only 12:00–15:00, below the export limit (no curtailment).
    const r = computeAdvice({
      now,
      timeZone: TZ,
      prices,
      pv: pvConst(now + 2 * HOUR, now + 5 * HOUR, 2),
      baselineKw: 0.5,
      socPercent: 100,
      system: { acLimitKw: null, batteryCapacityKwh: 10, exportLimitKw: 5 },
    });
    const dw = only('dishwasher')(r);
    expect(hhmm(dw.best!.start, TZ)).toBe('12:00');
    expect(dw.urgent).toBe(false);
    expect(dw.reasons.join(' ')).toContain('vlastní spotřeba má přednost');
    expect(r.outlook.lostKwh).toBe(0);
  });

  it('states what it cannot predict without system options', () => {
    const r = computeAdvice({
      now,
      timeZone: TZ,
      prices,
      pv: pvConst(now, now + 5 * HOUR, 6),
      baselineKw: 0.5,
      socPercent: 50,
    });
    expect(r.outlook.lostKwh).toBeNull();
    expect(r.outlook.assumptions).toContain(
      'bez limitu přetoku nelze předpovědět zahazování přebytku',
    );
  });
});

describe('PV forecast sources', () => {
  it('parses HA energy/solar_forecast and detects an all-zero forecast', () => {
    const ok = parseHaSolarForecast(
      {
        a: { wh_hours: { '2026-06-02T03:43:49+00:00': 100, '2026-06-02T04:00:00+00:00': 1500 } },
        b: { wh_hours: { '2026-06-02T04:00:00+00:00': 500 } },
      },
      TZ,
    );
    expect(ok.status).toBe('ok');
    expect(ok.points[1]!.kw).toBe(2);
    expect(ok.points[0]!.end).toBe(Date.parse('2026-06-02T04:00:00Z'));
    expect(
      parseHaSolarForecast({ a: { wh_hours: { '2026-06-02T04:00:00Z': 0 } } }, TZ).status,
    ).toBe('empty');
  });

  it('falls back to the HomeBrain Open-Meteo forecast and keeps system options', async () => {
    const calls: string[] = [];
    const connection = {
      sendMessagePromise: async (m: { type: string }) => {
        calls.push(m.type);
        if (m.type === 'energy/solar_forecast')
          return { a: { wh_hours: { '2026-06-02T04:00:00Z': 0 } } };
        return {
          status: 'ok',
          points: [{ start: '2026-06-02T10:00:00Z', end: '2026-06-02T11:00:00Z', kw: 3.4 }],
          days: { '2026-06-02': 3.4 },
          array: { kwp: 5, tilt: 35, azimuth: 0, assumed: ['tilt'] },
          system: { export_limit_kw: 4, battery_capacity_kwh: null, inverter_ac_limit_kw: 6 },
        };
      },
    };
    const pv = await fetchPvForecast(connection as never, TZ);
    expect(calls).toEqual(['energy/solar_forecast', 'homebrain/energy/pv_forecast']);
    expect(pv.source).toBe('open_meteo');
    expect(pv.system).toEqual({ acLimitKw: 6, batteryCapacityKwh: null, exportLimitKw: 4 });
    const unconfigured = await fetchPvForecast(
      {
        sendMessagePromise: async (m: { type: string }) =>
          m.type === 'energy/solar_forecast' ? {} : { status: 'unconfigured', points: [] },
      } as never,
      TZ,
    );
    expect(unconfigured.status).toBe('unconfigured');
  });
});

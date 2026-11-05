import { describe, expect, it } from 'vitest';
import { fetchPvForecast, parseHaSolarForecast } from './pvForecast.js';

const TZ = 'Europe/Prague';

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

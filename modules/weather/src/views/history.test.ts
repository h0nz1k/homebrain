import { describe, expect, it } from 'vitest';
import type { HistoryDay } from '../contract.js';
import { buildMockHistory, buildMockSnapshot } from '../fixtures.js';
import { dryStreak, records, windowStats, yesterdayToday } from './history.js';

const day = (date: string, rain: number | null, extra: Partial<HistoryDay> = {}): HistoryDay => ({
  date,
  partial: false,
  t_min: 1,
  t_max: 6,
  t_mean: 3,
  rain,
  rain_rate_max: null,
  gust_max: 8,
  rh_mean: 80,
  msl_mean: 1012,
  solar_kwh_m2: null,
  hours: { t2m: 24, rain: 24 },
  expected_hours: 24,
  gaps: [],
  ...extra,
});

describe('dryStreak', () => {
  it('počítá suché dny od včerejška po poslední déšť', () => {
    const days = [
      day('2026-11-10', 3.1),
      day('2026-11-11', 0),
      day('2026-11-12', 0.1), // below 0.2 mm = dry
      day('2026-11-13', 0, { partial: true }),
    ];
    expect(dryStreak(days, 0)).toEqual({
      days: 2,
      exact: true,
      lastWet: '2026-11-10',
      todayWet: false,
    });
    expect(dryStreak(days, 0.6).todayWet).toBe(true);
  });

  it('mezera v datech počítání zastaví – nikdy se nepočítá jako sucho', () => {
    const days = [
      day('2026-11-10', 0),
      day('2026-11-11', null, { gaps: ['rain'] }),
      day('2026-11-12', 0),
    ];
    expect(dryStreak(days, null)).toMatchObject({ days: 1, exact: false, lastWet: null });
    // a partial day already above the threshold still proves rain
    const wet = [day('2026-11-11', 0.8, { gaps: ['rain'] }), day('2026-11-12', 0)];
    expect(dryStreak(wet, null)).toMatchObject({ days: 1, exact: true, lastWet: '2026-11-11' });
  });
});

describe('yesterdayToday', () => {
  it('dnešek doplní živými extrémy a denním srážkoměrem stanice', () => {
    const snap = buildMockSnapshot('default');
    const days = [
      day('2026-10-30', 4.2, { t_max: 9.4 }),
      day('2026-10-31', 0.2, { partial: true, t_min: 3.0, t_max: 6.5 }),
    ];
    const r = yesterdayToday(days, snap, '2026-10-31');
    expect(r.yesterdayDate).toBe('2026-10-30');
    expect(r.yesterday?.rain).toBe(4.2);
    expect(r.today?.t_max).toBe(7.9); // live max beats the compiled hours
    expect(r.today?.t_min).toBe(2.4);
    expect(r.today?.rain).toBe(0.4); // live daily counter
  });

  it('bez dnešního řádku vezme poslední úplný den jako včerejšek', () => {
    const r = yesterdayToday([day('2026-10-29', 1), day('2026-10-30', 2)], null, '2026-10-31');
    expect(r.yesterday?.rain).toBe(2);
    expect(r.today).toBeNull();
  });
});

describe('windowStats a records', () => {
  it('sečte jen známé dny a mezery spočítá zvlášť', () => {
    const days = [
      day('2026-10-28', 2.5, { t_max: 11 }),
      day('2026-10-29', null, { t_min: null, t_max: null, t_mean: null, gaps: ['t2m', 'rain'] }),
      day('2026-10-30', 0.4, { t_min: -2 }),
    ];
    const s = windowStats(days, 7);
    expect(s).toMatchObject({ days: 3, gapDays: 1, rain: 2.9, rainDays: 1, t_mean: 3 });
    expect(s.t_min).toEqual({ v: -2, date: '2026-10-30' });
    expect(s.t_max).toEqual({ v: 11, date: '2026-10-28' });
    const rec = records([...days, day('2026-09-30', 30, { gust_max: 25 })], '2026-10');
    expect(rec.days).toBe(3);
    expect(rec.values.rain).toEqual({ v: 2.5, date: '2026-10-28' });
    expect(records(days, '2025').values.t_max).toBeNull();
  });

  it('mock historie: 2 dny bez deště, jeden den mezera, dnešek částečný', () => {
    const h = buildMockHistory('default', 30);
    expect(h.days).toHaveLength(30);
    expect(h.days.at(-1)?.partial).toBe(true);
    expect(h.days.filter((d) => d.gaps.length > 0)).toHaveLength(1);
    expect(dryStreak(h.days, 0.4)).toMatchObject({ days: 2, exact: true, todayWet: true });
    expect(buildMockHistory('unavailable').status).toBe('unconfigured');
  });
});

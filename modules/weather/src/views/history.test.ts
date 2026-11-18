import { describe, expect, it } from 'vitest';
import type { HistoryDay } from '../contract.js';
import { buildMockHistory, buildMockSnapshot } from '../fixtures.js';
import {
  DELTA_NEUTRAL,
  delta,
  dryStreak,
  longestDry,
  niceCeil,
  streakCallout,
  alertCallout,
  hasRainBar,
  records,
  recordsOf,
  tempTicks,
  windowStats,
  yesterdayToday,
} from './history.js';

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
    expect(rec.values.rain).toEqual({ v: 2.5, date: '2026-10-28', partial: false });
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

describe('rozdíl, osy', () => {
  it('delta: pod prahem je „stejně“, chybějící hodnota je missing', () => {
    expect(delta(7.9, 7.8, 't')).toEqual({ kind: 'same', v: 0.1 });
    expect(delta(9.4, 7.8, 't')).toEqual({ kind: 'up', v: 1.6 });
    expect(delta(0, 0.4, 'rain')).toEqual({ kind: 'down', v: 0.4 });
    expect(delta(0.1, 0, 'rain').kind).toBe('same'); // < 0,2 mm
    expect(delta(null, 3, 'gust')).toEqual({ kind: 'missing' });
    expect(DELTA_NEUTRAL.t).toBe(0.5);
  });

  it('niceCeil pokryje maximum kulatým číslem', () => {
    expect(niceCeil(18.1)).toBe(20);
    expect(niceCeil(4.2)).toBe(5);
    expect(niceCeil(2.1)).toBe(2.5);
    expect(niceCeil(10)).toBe(10);
    expect(niceCeil(0)).toBe(1);
  });

  it('tempTicks: 2–3 kulaté hodnoty, 0 °C při přechodu přes nulu', () => {
    expect(tempTicks(1.4, 18)).toEqual([5, 10, 15]);
    expect(tempTicks(-7.4, 25.2)).toEqual([0, 10, 20]);
    expect(tempTicks(2.4, 4.1)).toEqual([3, 4]);
    for (const [lo, hi] of [
      [-12, 3],
      [0.2, 0.6],
      [-30, 38],
    ] as const) {
      const t = tempTicks(lo, hi);
      expect(t.length).toBeGreaterThanOrEqual(1);
      expect(t.length).toBeLessThanOrEqual(3);
      if (lo < 0 && hi > 0) expect(t).toContain(0);
    }
  });
});

describe('streakCallout – jen nová informace', () => {
  const fmt = (d: string) => `[${d}]`;
  const st = (days: number, todayWet: boolean, exact = true, lastWet: string | null = null) => ({
    days,
    exact,
    lastWet,
    todayWet,
  });
  it('déšť po suchu', () => {
    expect(streakCallout(st(2, true), 0.4, 0, fmt)).toBe(
      'Po 2\u00a0dnech bez deště dnes zatím 0,4\u00a0mm',
    );
    expect(streakCallout(st(1, true, false), 1.2, 0, fmt)).toBe(
      'Po nejméně 1\u00a0dni bez deště dnes zatím 1,2\u00a0mm',
    );
  });
  it('sucho pokračuje, s posledním deštěm', () => {
    expect(streakCallout(st(5, false, true, '2026-10-25'), 0, 0, fmt)).toBe(
      'Bez deště už 5\u00a0dní, dnes zatím také\u00a0· naposledy pršelo [2026-10-25]',
    );
  });
  it('druhý deštivý den; jinak nic, co už je v tabulce', () => {
    expect(streakCallout(st(0, true), 2, 3, fmt)).toBe('Prší druhý den po sobě');
    expect(streakCallout(st(0, false), 0, 3, fmt)).toBeNull(); // včera pršelo, dnes ne
    expect(streakCallout(st(3, false), null, 0, fmt)).toBeNull(); // dnešek chybí
  });
});

describe('longestDry', () => {
  it('nejdelší řada suchých dní; mezera a dnešek řadu přeruší', () => {
    const days = [
      day('2026-10-01', 0),
      day('2026-10-02', 0),
      day('2026-10-03', null, { gaps: ['rain'] }),
      day('2026-10-04', 0),
      day('2026-10-05', 0.1),
      day('2026-10-06', 0),
      day('2026-10-07', 3),
      day('2026-10-08', 0, { partial: true }),
    ];
    expect(longestDry(days)).toEqual({ days: 3, end: '2026-10-06' });
    expect(longestDry([day('2026-10-01', null, { gaps: ['rain'] })])).toBeNull();
    expect(longestDry([day('2026-10-01', 4)])).toEqual({ days: 0, end: '' });
  });
});

describe('alertCallout – ⚠ má přednost před deštěm', () => {
  it('změna průměrného tlaku, pak náraz (dnešní, jinak včerejší)', () => {
    // one sentence per fact, each with its day
    expect(alertCallout({ kind: 'down', v: 26 }, 16.2, 9)).toBe(
      '⚠ Průměrný tlak je dnes zatím o 26\u00a0hPa nižší než včera. Nárazy větru zatím až 16,2\u00a0m/s.',
    );
    expect(alertCallout({ kind: 'up', v: 10 }, null, null)).toBe(
      '⚠ Průměrný tlak je dnes zatím o 10\u00a0hPa vyšší než včera.',
    );
    expect(alertCallout({ kind: 'same', v: 0.4 }, 16.4, null)).toBe(
      '⚠ Nárazy větru dnes zatím až 16,4\u00a0m/s.',
    );
    expect(alertCallout({ kind: 'same', v: 0.4 }, 8, 15.2)).toBe(
      '⚠ Včera nárazy větru až 15,2\u00a0m/s.',
    );
    expect(alertCallout({ kind: 'down', v: 12 }, 8, 15.2)).toBe(
      '⚠ Průměrný tlak je dnes zatím o 12\u00a0hPa nižší než včera. Včera nárazy větru až 15,2\u00a0m/s.',
    );
  });
  it('pod prahy nic', () => {
    expect(alertCallout({ kind: 'down', v: 9.9 }, 14.9, null)).toBeNull();
    expect(alertCallout({ kind: 'missing' }, null, null)).toBeNull();
  });
});

describe('sloupec srážek: nula = žádný sloupec', () => {
  it('„0,0 mm“ nemá sloupec, od 0,05 mm (zobrazeno 0,1) ano', () => {
    expect(hasRainBar(0)).toBe(false);
    expect(hasRainBar(0.04)).toBe(false); // shown as 0,0 mm
    expect(hasRainBar(null)).toBe(false);
    expect(hasRainBar(0.05)).toBe(true);
    expect(hasRainBar(0.4)).toBe(true);
  });
});

describe('rekordy: okno a dnešní neúplný den', () => {
  it('okno 30 dní = dnes + 29 předchozích dní; rekord okna je maximum právě z nich', () => {
    const all = buildMockHistory('default', 400).days;
    const w = all.slice(-30);
    expect(w).toHaveLength(30);
    expect(w.at(-1)!.partial).toBe(true);
    // MOCK_NOW = 31. 10.: the window starts 2. 10., so 1. 10. is outside it
    expect(w[0]!.date).toBe('2026-10-02');
    const max = Math.max(...w.map((d) => d.rain ?? 0));
    expect(recordsOf(w).values.rain!.v).toBe(max);
    const year = records(all, '2026').values.rain!;
    if (year.v > max) expect(year.date < w[0]!.date).toBe(true);
    // rain days are counted out of days with a known total (the gap day 12 days ago is not)
    expect(windowStats(all, 30).rainKnownDays).toBe(29);
  });

  it('rekord z dnešního neúplného dne je označený jako zatímní', () => {
    const days = [
      day('2026-10-29', 1, { t_min: 3 }),
      day('2026-10-30', 0, { t_min: 2 }),
      day('2026-10-31', 0.4, { t_min: -1, partial: true }),
    ];
    const rec = recordsOf(days).values;
    expect(rec.t_min).toEqual({ v: -1, date: '2026-10-31', partial: true });
    expect(rec.rain).toEqual({ v: 1, date: '2026-10-29', partial: false });
  });
});

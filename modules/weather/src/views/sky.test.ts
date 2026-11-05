import { describe, expect, it } from 'vitest';
import { buildMockSnapshot } from '../fixtures.js';
import { bandPath, smoothPath } from './curve.js';
import {
  conditionSentence,
  dailyWithToday,
  dayRange,
  hourlyDayRanges,
  pragueDate,
  skyGroup,
  skyPhase,
  skyScene,
  sunElevationDeg,
} from './sky.js';

describe('sunElevationDeg', () => {
  it('matches the solar geometry of central Czechia', () => {
    // Summer solstice, solar noon ≈ 11:00 UTC at 15.5° E: 90 − 49.8 + 23.44 ≈ 63.6°
    expect(sunElevationDeg(new Date('2026-06-21T11:00:00Z'))).toBeCloseTo(63.6, 0);
    // Winter solstice noon ≈ 16.8°
    expect(sunElevationDeg(new Date('2026-12-21T11:00:00Z'))).toBeCloseTo(16.8, 0);
    // Midnight is always below the horizon
    expect(sunElevationDeg(new Date('2026-06-21T23:00:00Z'))).toBeLessThan(-10);
  });
});

describe('skyScene', () => {
  it('picks phase by sun elevation and palette by condition', () => {
    expect(skyPhase(-12)).toBe('night');
    expect(skyPhase(0)).toBe('twilight');
    expect(skyPhase(10)).toBe('low');
    expect(skyPhase(40)).toBe('day');
    expect(skyGroup('heavy_rain')).toBe('rain');
    expect(skyGroup('overcast')).toBe('grey');
    const noon = skyScene('clear', new Date('2026-06-21T11:00:00Z'));
    expect(noon).toMatchObject({ phase: 'day', group: 'clear', night: false });
    const night = skyScene('rain', new Date('2026-06-21T23:00:00Z'));
    expect(night).toMatchObject({ phase: 'night', group: 'rain', night: true });
    expect(night.top).not.toBe(noon.top);
  });
});

describe('conditionSentence', () => {
  it('reads condition, gusts, nowcast and the rest of the day in Czech', () => {
    const d = buildMockSnapshot('default');
    const s = conditionSentence(d, false);
    expect(s).toMatch(/^Oblačno/);
    expect(s).toContain('Slabý déšť za\u00a0~35\u00a0min');
    expect(s).not.toMatch(/light|moderate|heavy/);
    expect(s.endsWith('.')).toBe(true);
    expect(s).not.toContain('..');
  });
  it('says “Jasná noc” for a clear night', () => {
    const d = buildMockSnapshot('calm');
    d.current = { ...d.current, condition: 'clear', gust: 2, wind: 1 };
    expect(conditionSentence(d, true)).toMatch(/^Jasná noc/);
  });
});

describe('smoothPath', () => {
  it('draws cubic Béziers through every sample without overshoot', () => {
    const pts: [number, number][] = [
      [0, 10],
      [10, 10],
      [20, 0],
      [30, 0],
    ];
    const p = smoothPath(pts);
    expect(p.startsWith('M0,10')).toBe(true);
    expect(p.match(/C/g)).toHaveLength(3);
    // monotone: control points of a flat segment stay flat
    expect(p).toContain('C3.3,10 6.7,10 10,10');
    expect(smoothPath([])).toBe('');
    expect(bandPath(pts, pts).endsWith('Z')).toBe(true);
  });
});

describe('today min/max – hero and 10-day row share one source', () => {
  it('reproduces the 2–10° vs 4–11° mismatch and fixes it', () => {
    const d = buildMockSnapshot('default');
    const r = dayRange(d);
    const raw = d.daily.find((x) => x.date === '2026-10-31')!;
    // the bug: raw Open-Meteo daily model mean ≠ station + blend used by the hero
    expect([Math.round(raw.tmin!), Math.round(raw.tmax!)]).not.toEqual([
      Math.round(r.min!),
      Math.round(r.max!),
    ]);
    const today = dailyWithToday(d).find((x) => x.date === '2026-10-31')!;
    expect(today.tmin).toBe(r.min);
    expect(today.tmax).toBe(r.max);
    // spread band still contains the shown values
    expect(today.tmin_lo!).toBeLessThanOrEqual(today.tmin!);
    expect(today.tmax_hi!).toBeGreaterThanOrEqual(today.tmax!);
  });
  it('later days covered by the hourly mix use its min/max, the rest keep the daily model', () => {
    const d = buildMockSnapshot('default');
    const ranges = hourlyDayRanges(d);
    const out = dailyWithToday(d);
    for (const [i, x] of d.daily.entries()) {
      const o = out[i]!;
      if (x.date === '2026-10-31') continue;
      const h = ranges.get(x.date);
      if (h) {
        const temps = d.hourly
          .filter((p) => pragueDate(Date.parse(p.t)) === x.date && p.t2m != null)
          .map((p) => p.t2m!);
        expect(o.tmin).toBe(Math.min(...temps));
        expect(o.tmax).toBe(Math.max(...temps));
        expect(o.tmin_lo!).toBeLessThanOrEqual(o.tmin!);
        expect(o.tmin_hi!).toBeGreaterThanOrEqual(o.tmin!);
        expect(o.tmax_lo!).toBeLessThanOrEqual(o.tmax!);
        expect(o.tmax_hi!).toBeGreaterThanOrEqual(o.tmax!);
      } else {
        expect(o).toEqual(x);
      }
    }
    // the 49 h mock covers at least one full later day, and the 10-day tail stays on the model
    expect(ranges.size).toBeGreaterThanOrEqual(1);
    expect(out[out.length - 1]).toEqual(d.daily[d.daily.length - 1]);
  });
  it('only a COMPLETE Prague day counts as covered (partial and DST days)', () => {
    const d = buildMockSnapshot('default');
    const base = d.hourly[0]!;
    const hours = (fromIso: string, n: number, t2m: (i: number) => number) =>
      Array.from({ length: n }, (_, i) => ({
        ...base,
        t: new Date(Date.parse(fromIso) + i * 3600000).toISOString(),
        t2m: t2m(i),
      }));
    // 2026-11-02 Prague = 2026-11-01T23:00Z … 2026-11-02T22:00Z (24 h), then half of 11-03
    d.hourly = hours('2026-11-01T23:00:00Z', 36, (i) => (i < 24 ? i - 5 : 40));
    const r = hourlyDayRanges(d);
    expect(r.get('2026-11-02')).toEqual({ min: -5, max: 18 });
    expect(r.has('2026-11-03')).toBe(false); // ends 10:00 Prague → partial, keep model
    // 2026-10-25 has 25 h in Prague (CEST → CET): 2026-10-24T22:00Z … 2026-10-25T22:00Z
    d.hourly = hours('2026-10-24T22:00:00Z', 25, (i) => i);
    expect(hourlyDayRanges(d).get('2026-10-25')).toEqual({ min: 0, max: 24 });
    // missing the first hour → not covered
    d.hourly = hours('2026-10-24T23:00:00Z', 24, (i) => i);
    expect(hourlyDayRanges(d).has('2026-10-25')).toBe(false);
  });
  it('cuts the day at Prague midnight, not UTC/browser midnight', () => {
    expect(pragueDate(Date.parse('2026-10-31T22:59:00Z'))).toBe('2026-10-31');
    expect(pragueDate(Date.parse('2026-10-31T23:30:00Z'))).toBe('2026-11-01'); // 00:30 CET
    expect(pragueDate(Date.parse('2026-07-01T22:30:00Z'))).toBe('2026-07-02'); // 00:30 CEST
    const d = buildMockSnapshot('default');
    d.station.derived.today_min = null;
    d.station.derived.today_max = null;
    d.current = { ...d.current, t2m: 5 };
    d.hourly = [
      { ...d.hourly[0]!, t: '2026-10-31T22:30:00Z', t2m: 3 }, // 23:30 Prague – today
      { ...d.hourly[0]!, t: '2026-10-31T23:30:00Z', t2m: -9 }, // 00:30 Prague – tomorrow
    ];
    expect(dayRange(d)).toMatchObject({ min: 3, max: 5 });
  });
});

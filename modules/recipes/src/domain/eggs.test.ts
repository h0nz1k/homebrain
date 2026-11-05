import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  EGG_MODEL,
  boilingPointC,
  computeEggTime,
  eggTimerLabel,
  formatEggTime,
  williamsMinutes,
  type EggDoneness,
  type EggInput,
  type EggSize,
} from './eggs.js';

interface Observation {
  kind: 'chicken' | 'quail';
  size: EggSize | null;
  chilled: boolean;
  count: number;
  doneness: EggDoneness | null;
  seconds: number;
}
const fixture = JSON.parse(
  readFileSync(
    join(import.meta.dirname, '../../../../tests/fixtures/egg-timer/observations.json'),
    'utf8',
  ),
) as { observations: Observation[] };

const base: EggInput = { kind: 'chicken', size: 'M', chilled: true, count: 1, doneness: 'namekko' };

describe('Williams egg formula', () => {
  it('matches the published example (57 g from a 4 °C fridge, soft ≈ 4.5 min at 100 °C)', () => {
    expect(williamsMinutes(57, 4, 100, 63)).toBeCloseTo(4.5, 1);
  });

  it('gives the textbook M-from-fridge times at 99 °C (63/67/77 °C ≈ 4.6/5.4/8.0 min)', () => {
    expect(williamsMinutes(58, 5, 99, 63)).toBeCloseTo(4.63, 1);
    expect(williamsMinutes(58, 5, 99, 67)).toBeCloseTo(5.43, 1);
    expect(williamsMinutes(58, 5, 99, 77)).toBeCloseTo(7.96, 1);
  });

  it('is 0 for an egg that is already done and grows with mass', () => {
    expect(williamsMinutes(58, 70, 99, 66)).toBe(0);
    expect(williamsMinutes(68, 5, 99, 66)).toBeGreaterThan(williamsMinutes(58, 5, 99, 66));
  });
});

describe('boiling point', () => {
  it('is 100 °C at sea level and ≈ 100 − h/300 for homes', () => {
    expect(boilingPointC(0)).toBeCloseTo(100, 1);
    expect(boilingPointC(300)).toBeCloseTo(99, 0);
    expect(boilingPointC(1500)).toBeCloseTo(95, 0);
  });
});

describe('computeEggTime vs reference app times', () => {
  const chicken = fixture.observations.filter((o) => o.kind === 'chicken');
  it.each(chicken)('$size $doneness chilled=$chilled → $seconds s (±5 s)', (o) => {
    const r = computeEggTime({
      kind: 'chicken',
      size: o.size ?? 'M',
      chilled: o.chilled,
      count: o.count,
      doneness: o.doneness ?? 'namekko',
    });
    expect(Math.abs(r.seconds - o.seconds)).toBeLessThanOrEqual(5);
    expect(r.calibrated).toBe(true);
  });

  it('quail from the fridge uses the fixed reference time (3 eggs)', () => {
    const q = fixture.observations.find((o) => o.kind === 'quail')!;
    const quail = { ...base, kind: 'quail' as const, count: q.count };
    expect(computeEggTime({ ...quail, chilled: true }).seconds).toBe(q.seconds);
    expect(computeEggTime({ ...quail, chilled: true }).calibrated).toBe(true);
    expect(computeEggTime({ ...quail, chilled: false }).calibrated).toBe(false);
    expect(computeEggTime({ ...quail, chilled: true, count: 6 }).calibrated).toBe(false);
  });

  it('predicts the uncalibrated cells from the same model', () => {
    const hard = { ...base, count: 3, doneness: 'natvrdo' as const };
    expect(Math.abs(computeEggTime({ ...hard, chilled: false }).seconds - 550)).toBeLessThanOrEqual(
      5,
    );
    expect(Math.abs(computeEggTime({ ...hard, size: 'L' }).seconds - 703)).toBeLessThanOrEqual(5);
    expect(computeEggTime({ ...hard, size: 'L' }).calibrated).toBe(true);
    expect(computeEggTime({ ...base, size: 'S' }).calibrated).toBe(false);
    expect(computeEggTime({ ...base, size: 'XL' }).calibrated).toBe(false);
  });

  it('adds 20 s per extra egg (configurable)', () => {
    const one = computeEggTime({ ...base, count: 1 });
    expect(computeEggTime({ ...base, count: 4 }).seconds).toBe(one.seconds + 60);
    expect(computeEggTime({ ...base, count: 4 }).countExtraS).toBe(60);
    const m = { ...EGG_MODEL, perExtraEggS: 0 };
    expect(computeEggTime({ ...base, count: 4 }, m).seconds).toBe(one.seconds);
  });

  it('cooks longer at altitude, never hotter than the 99 °C cap', () => {
    expect(computeEggTime({ ...base, elevationM: 0 }).waterC).toBe(99);
    const high = computeEggTime({ ...base, elevationM: 1200 });
    expect(high.waterC).toBeLessThan(97);
    expect(high.seconds).toBeGreaterThan(computeEggTime(base).seconds);
    expect(high.explanation.join(' ')).toContain('1200 m n. m.');
  });
});

describe('labels', () => {
  it('names the timer like the app', () => {
    expect(eggTimerLabel({ ...base, count: 2, doneness: 'natvrdo' })).toBe(
      'Vejce M natvrdo (2 ks)',
    );
    expect(eggTimerLabel({ ...base, kind: 'quail', count: 12 })).toBe('Křepelčí vejce (12 ks)');
    expect(formatEggTime(320)).toBe('5:20');
    expect(formatEggTime(65)).toBe('1:05');
  });
});

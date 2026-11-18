import { describe, expect, it } from 'vitest';
import type { PrecipVerificationRow } from '../contract.js';
import { mockPrecipVerification } from '../fixtures.js';
import {
  commonSample,
  etsBootstrapSe,
  etsOf,
  etsSe,
  fewBlocker,
  headlineNoise,
  noiseThreshold,
  outOfTen,
  rankPrecip,
} from './rainScore.js';

const table = (a: number, b: number, c: number, d: number) => ({ a, b, c, d });
const row = (source: string, t: ReturnType<typeof table>): PrecipVerificationRow => {
  const ets = etsOf(t);
  return {
    ...mockPrecipVerification()[0]!,
    source,
    hourly: {
      '0.2': { ...t, pod: null, far: null, csi: null, ets, freq_bias: null },
    },
  };
};

describe('ETS a jeho nejistota', () => {
  it('ETS z ručně spočtené tabulky', () => {
    // a=50 b=30 c=20 d=900 → ar = 80·70/1000 = 5,6; ETS = 44,4 / 94,4
    expect(etsOf(table(50, 30, 20, 900))).toBeCloseTo(44.4 / 94.4, 10);
    expect(etsOf(table(0, 0, 0, 10))).toBeNull(); // no event, no forecast
    expect(etsOf(table(0, 0, 0, 0))).toBeNull();
  });

  it('směrodatná chyba (delta metoda) odpovídá bootstrapu', () => {
    for (const t of [table(61, 30, 25, 844), table(20, 15, 10, 300), table(9, 6, 5, 80)]) {
      const se = etsSe(t)!;
      const boot = etsBootstrapSe(t, 2000, 7);
      expect(Math.abs(se - boot) / boot).toBeLessThan(0.1);
    }
  });

  it('chyba klesá s odmocninou velikosti vzorku', () => {
    const se1 = etsSe(table(60, 30, 25, 845))!;
    const se4 = etsSe(table(240, 120, 100, 3380))!;
    expect(se1 / se4).toBeCloseTo(2, 5);
  });

  it('práh šumu = 1,96 · √(se₁² + se₂²)', () => {
    const x = table(61, 30, 25, 844);
    const y = table(58, 34, 28, 840);
    expect(noiseThreshold(x, y)).toBeCloseTo(1.96 * Math.hypot(etsSe(x)!, etsSe(y)!), 10);
  });
});

describe('pořadí se shodami', () => {
  it('modely v šumu od vedoucího sdílí pořadí (mock: Mix, ICON-D2, ALADIN)', () => {
    const ranked = rankPrecip(mockPrecipVerification().filter((r) => r.enough));
    expect(ranked.map((r) => [r.row.source, r.rank])).toEqual([
      ['blend', 1],
      ['icon_d2', 1],
      ['chmi_aladin_cz_1km', 1],
      ['ecmwf_ifs', 4],
      ['gfs_seamless', 5],
    ]);
    expect(ranked[0]!.tied).toBe(true);
    expect(ranked[3]!.tied).toBe(false);
    expect(headlineNoise(ranked)).toBeGreaterThan(0.1);
    expect(headlineNoise(ranked)).toBeLessThan(0.16);
  });

  it('jasný rozdíl na velkém vzorku = různé pořadí', () => {
    const ranked = rankPrecip([
      row('weak', table(400, 400, 400, 8800)),
      row('strong', table(800, 200, 200, 8800)),
    ]);
    expect(ranked.map((r) => [r.row.source, r.rank, r.tied])).toEqual([
      ['strong', 1, false],
      ['weak', 2, false],
    ]);
  });

  it('skupina se nezřetězí: porovnává se s vedoucím, ne se sousedem', () => {
    // each neighbour within noise, but the last clearly worse than the leader
    const ranked = rankPrecip([
      row('a', table(300, 100, 100, 4500)),
      row('b', table(270, 130, 130, 4470)),
      row('c', table(240, 160, 160, 4440)),
      row('d', table(210, 190, 190, 4410)),
    ]);
    const thr = noiseThreshold(ranked[0]!.row.hourly['0.2']!, ranked[3]!.row.hourly['0.2']!)!;
    expect(ranked[0]!.ets! - ranked[3]!.ets!).toBeGreaterThan(thr);
    expect(ranked[3]!.rank).toBeGreaterThan(1);
  });
});

describe('texty', () => {
  it('málo dat uvádí jen skutečnou překážku s čísly', () => {
    expect(fewBlocker({ n: 96, n_wet: 30 })).toBe('zatím málo dat: 96 z 240 potřebných porovnání');
    expect(fewBlocker({ n: 300, n_wet: 5 })).toBe(
      'zatím málo dat: 5 z 12 potřebných porovnání s deštěm',
    );
    expect(fewBlocker({ n: 100, n_wet: 3 })).toBe(
      'zatím málo dat: 100 z 240 potřebných porovnání a 3 z 12 potřebných porovnání s deštěm',
    );
  });

  it('podíl jako „x z 10“', () => {
    expect(outOfTen(0.71)).toBe(7);
    expect(outOfTen(0.33)).toBe(3);
    expect(outOfTen(null)).toBeNull();
  });

  it('společný vzorek = nejčastější dvojice hodin a dní', () => {
    const rows = mockPrecipVerification().filter((r) => r.enough);
    expect(commonSample(rows)).toEqual({ wet: 86, days: 40 });
    expect(commonSample([])).toBeNull();
  });
});

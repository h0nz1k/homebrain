import { describe, expect, it } from 'vitest';
import type { PrecipVerificationRow } from '../contract.js';
import { mockPrecipVerification } from '../fixtures.js';
import {
  commonSample,
  etsBootstrapSe,
  etsOf,
  etsSe,
  fewBlocker,
  noiseThreshold,
  outOfTen,
  rankPrecip,
  rankText,
  round2,
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
  it('jeden práh pro celou tabulku, skupiny 1.–3. a 4.–5. (přesně mock z karty)', () => {
    const { rows: ranked, noise } = rankPrecip(mockPrecipVerification().filter((r) => r.enough));
    // shown scores: 0,49 · 0,45 · 0,37 · 0,30 · 0,19; threshold 0,13 (largest pairwise)
    expect(ranked.map((r) => round2(r.ets!))).toEqual([0.49, 0.45, 0.37, 0.3, 0.19]);
    expect(noise).toBe(0.13);
    expect(ranked.map((r) => [r.row.source, rankText(r), r.tiedWith])).toEqual([
      ['blend', '1.–3.', null],
      ['icon_d2', '1.–3.', 'blend'],
      ['chmi_aladin_cz_1km', '1.–3.', 'blend'], // 0,49 − 0,37 = 0,12 < 0,13
      ['ecmwf_ifs', '4.–5.', null], // 0,49 − 0,30 = 0,19 ≥ 0,13 → new group
      ['gfs_seamless', '4.–5.', 'ecmwf_ifs'], // 0,30 − 0,19 = 0,11 < 0,13 → ≈ srovnatelné
    ]);
    expect(ranked.every((r) => r.tied)).toBe(true);
  });

  it('každý zobrazený rozdíl odpovídá pravidlu na kartě (rozdíl od vedoucího < práh)', () => {
    const { rows: ranked, noise } = rankPrecip(mockPrecipVerification().filter((r) => r.enough));
    for (const r of ranked) {
      const leader = ranked.find((o) => o.rank === r.rank)!;
      const diff = round2(round2(leader.ets!) - round2(r.ets!));
      expect(diff < noise!).toBe(true);
    }
    for (let i = 1; i < ranked.length; i++)
      if (ranked[i]!.rank !== ranked[i - 1]!.rank) {
        const leader = ranked.find((o) => o.rank === ranked[i - 1]!.rank)!;
        expect(round2(leader.ets! - ranked[i]!.ets!)).toBeGreaterThanOrEqual(noise!);
      }
  });

  it('jasný rozdíl na velkém vzorku = různé pořadí', () => {
    const { rows: ranked } = rankPrecip([
      row('weak', table(400, 400, 400, 8800)),
      row('strong', table(800, 200, 200, 8800)),
    ]);
    expect(ranked.map((r) => [r.row.source, rankText(r), r.tied])).toEqual([
      ['strong', '1.', false],
      ['weak', '2.', false],
    ]);
  });

  it('skupina se nezřetězí: porovnává se s vedoucím, ne se sousedem', () => {
    // each neighbour within noise, but the last clearly worse than the leader
    const { rows: ranked, noise } = rankPrecip([
      row('a', table(60, 20, 20, 900)),
      row('b', table(54, 26, 26, 894)),
      row('c', table(48, 32, 32, 888)),
      row('d', table(42, 38, 38, 882)),
    ]);
    for (let i = 1; i < 4; i++)
      expect(round2(ranked[i - 1]!.ets! - ranked[i]!.ets!)).toBeLessThan(noise!);
    expect(round2(ranked[0]!.ets! - ranked[3]!.ets!)).toBeGreaterThanOrEqual(noise!);
    expect(ranked.map(rankText)).toEqual(['1.–2.', '1.–2.', '3.–4.', '3.–4.']);
    // the threshold is the largest pairwise one
    const pairs = ranked.flatMap((x, i) =>
      ranked.slice(i + 1).map((y) => noiseThreshold(x.row.hourly['0.2']!, y.row.hourly['0.2']!)!),
    );
    expect(noise).toBe(round2(Math.max(...pairs)));
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

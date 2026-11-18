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

describe('pořadí a „≈“ mezi sousedy', () => {
  it('přesně mock z karty: ALADIN 0,37 a ECMWF 0,30 (rozdíl 0,07 < 0,13) mají „≈“', () => {
    const { rows: ranked, noise } = rankPrecip(mockPrecipVerification().filter((r) => r.enough));
    // shown scores: 0,49 · 0,45 · 0,37 · 0,30 · 0,19; threshold 0,13 (largest pairwise)
    expect(ranked.map((r) => round2(r.ets!))).toEqual([0.49, 0.45, 0.37, 0.3, 0.19]);
    expect(noise).toBe(0.13);
    expect(ranked.map((r) => [r.row.source, r.rank, r.diffPrev, r.nearPrev])).toEqual([
      ['blend', 1, null, false],
      ['icon_d2', 2, 0.04, true],
      ['chmi_aladin_cz_1km', 3, 0.08, true],
      ['ecmwf_ifs', 4, 0.07, true], // the r5 bug: was „4.–5.“ next to ALADIN „1.–3.“
      ['gfs_seamless', 5, 0.11, true],
    ]);
  });

  it('pravidlo platí pro každou dvojici sousedů: „≈“ ⇔ zobrazený rozdíl < práh', () => {
    const cases = [
      mockPrecipVerification().filter((r) => r.enough),
      [
        row('a', table(60, 20, 20, 900)),
        row('b', table(54, 26, 26, 894)),
        row('c', table(30, 50, 50, 870)),
        row('d', table(28, 52, 52, 868)),
      ],
    ];
    for (const rows of cases) {
      const { rows: ranked, noise } = rankPrecip(rows);
      expect(ranked[0]!.nearPrev).toBe(false);
      for (let i = 1; i < ranked.length; i++) {
        const diff = round2(round2(ranked[i - 1]!.ets!) - round2(ranked[i]!.ets!));
        expect(ranked[i]!.diffPrev).toBe(diff);
        expect(ranked[i]!.nearPrev).toBe(diff < noise!);
      }
    }
  });

  it('jasný rozdíl na velkém vzorku = bez „≈“', () => {
    const { rows: ranked } = rankPrecip([
      row('weak', table(400, 400, 400, 8800)),
      row('strong', table(800, 200, 200, 8800)),
    ]);
    expect(ranked.map((r) => [r.row.source, r.rank, r.nearPrev])).toEqual([
      ['strong', 1, false],
      ['weak', 2, false],
    ]);
  });

  it('žádné sdílené pořadí, jen stejné zobrazené skóre má stejné číslo', () => {
    const { rows: ranked, noise } = rankPrecip([
      row('a', table(60, 20, 20, 900)),
      row('b', table(54, 26, 26, 894)),
      row('c', table(48, 32, 32, 888)),
      row('b2', table(54, 26, 26, 894)),
    ]);
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 2, 4]);
    expect(ranked[2]!.diffPrev).toBe(0);
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

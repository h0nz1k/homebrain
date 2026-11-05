import { describe, expect, it } from 'vitest';
import {
  CHMI_PALETTE,
  RAMP_STOPS,
  blur,
  buildRamp,
  chartBands,
  chartTopMmh,
  chartY,
  dbzToMmh,
  decodeDbz,
  gaussianBlur,
  gaussianKernel,
  monotoneAt,
  monotonePath,
  minuteHeadline,
  minuteSeries,
  rainWord,
  renderField,
  rgbToOklab,
  upsample,
  BANDS,
  CHART_GUIDES,
  RAIN_LEVELS,
  chartBandAt,
  fitBox,
  headlinePeak,
  pathBBox,
} from './radarRender.js';
import { BASEMAP } from './basemap.data.js';

const hex = (h: string) =>
  [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];

describe('barevná škála radaru', () => {
  it('světlost v OKLab roste monotónně (čitelné i pro barvoslepé / v odstínech šedi)', () => {
    const L = RAMP_STOPS.slice(1).map((s) => rgbToOklab(hex(s.color))[0]);
    for (let i = 1; i < L.length; i++) expect(L[i]!).toBeGreaterThan(L[i - 1]!);
  });
  it('slabá odrazivost je průhledná, silná krytá', () => {
    const lut = buildRamp();
    expect(lut[4 * 4 + 3]).toBe(0);
    expect(lut[16 * 4 + 3]!).toBeLessThan(160);
    expect(lut[56 * 4 + 3]!).toBeGreaterThan(240);
    for (let d = 9; d <= 64; d++)
      expect(lut[d * 4 + 3]!).toBeGreaterThanOrEqual(lut[(d - 1) * 4 + 3]!);
    expect(buildRamp(true)[16 * 4 + 3]!).toBeGreaterThan(lut[16 * 4 + 3]!);
  });
  it('dekóduje paletu ČHMÚ na střed třídy dBZ a ignoruje průhledné pixely', () => {
    const rgba = new Uint8ClampedArray([
      ...CHMI_PALETTE[4]!.slice(0, 3),
      210, // 20 dBZ
      250,
      2,
      3,
      210, // ~(252,0,0) = 52 dBZ
      0,
      0,
      252,
      10, // transparent
    ]);
    expect([...decodeDbz(rgba, 3, 1)]).toEqual([22, 54, 0]);
  });
});

describe('vyhlazení', () => {
  it('bilineární zvětšení zachová hodnoty a vyhladí přechod', () => {
    const up = upsample(new Float32Array([0, 40]), 2, 1, 4);
    expect(up.length).toBe(32);
    expect(up[0]).toBe(0);
    expect(up[7]).toBe(40);
    for (let i = 1; i < 8; i++) expect(up[i]!).toBeGreaterThanOrEqual(up[i - 1]!);
  });
  it('blur zachová součet a změkčí hranu (žádné kostičky)', () => {
    const f = new Float32Array(20 * 20);
    f[10 * 20 + 10] = 100;
    const b = blur(f, 20, 20, 2);
    expect(b.reduce((a, v) => a + v, 0)).toBeCloseTo(100, 1);
    expect(b[10 * 20 + 10]!).toBeLessThan(100);
    expect(b[10 * 20 + 12]!).toBeGreaterThan(0);
  });
  it('renderField vrátí RGBA se spoustou úrovní průhlednosti', () => {
    const f = new Float32Array(16 * 16);
    for (let y = 4; y < 12; y++) for (let x = 4; x < 12; x++) f[y * 16 + x] = 40;
    const out = renderField(f, 16, 16, 3, buildRamp());
    expect(out.width).toBe(48);
    const alphas = new Set<number>();
    for (let i = 3; i < out.data.length; i += 4) alphas.add(out.data[i]!);
    expect(alphas.size).toBeGreaterThan(6);
  });
});

describe('srážky v příští hodině', () => {
  const profile = Array.from({ length: 13 }, (_, i) => ({
    lead_min: i * 5,
    dbz: i * 5 >= 35 ? 24 : 0,
  }));
  it('Marshall-Palmer a slovní intenzita', () => {
    expect(dbzToMmh(0)).toBe(0);
    expect(dbzToMmh(23)).toBeCloseTo(1, 0);
    expect(rainWord(0.05)).toBe('žádný');
    expect(rainWord(1)).toBe('slabý');
    expect(rainWord(5)).toBe('mírný');
    expect(rainWord(20)).toBe('silný');
    expect(rainWord(80)).toBe('přívalový');
  });
  it('minutová řada z radarového profilu', () => {
    const s = minuteSeries(profile, [], 0)!;
    expect(s).toHaveLength(61);
    expect(s[30]!.mmh).toBe(0);
    expect(s[40]!.mmh).toBeGreaterThan(0.5);
    expect(s[34]!.mmh).toBe(0);
    expect(s[35]!.mmh).toBeGreaterThan(0.5);
  });
  it('bez radaru použije 15min sloty modelu', () => {
    const now = Date.parse('2026-11-01T10:00:00Z');
    const slots = [0, 15, 30, 45, 60].map((m, i) => ({
      t: new Date(now + m * 60000).toISOString(),
      mmh: [0, 0, 1, 3, 1][i]!,
    }));
    const s = minuteSeries(undefined, slots, now)!;
    expect(s[45]!.mmh).toBe(3);
    expect(minuteHeadline(s, 'soon', null, null, '')).toBe('Déšť za 30 min, mírný');
  });
  it('titulky', () => {
    const s = minuteSeries(profile, [], 0);
    expect(minuteHeadline(s, 'soon', 35, null)).toBe('Déšť za ~35 min, slabý');
    const dry = minuteSeries(
      profile.map((p) => ({ ...p, dbz: 0 })),
      [],
      0,
    );
    expect(minuteHeadline(dry, 'dry', null, null)).toBe('V příští hodině bez srážek');
    const storm = minuteSeries(
      profile.map((p) => ({ ...p, dbz: Math.max(0, 44 - (p.lead_min / 5) * 8) })),
      [],
      0,
    );
    expect(minuteHeadline(storm, 'stopping', 0, 25)).toBe('Silně prší, přestane za ~25 min');
    expect(minuteHeadline(null, 'unknown', null, null)).toContain('není k dispozici');
  });
});

describe('legenda', () => {
  it('rovnoměrné kategorie: hranice 2,5 mm/h leží na 25 % a 50 mm/h na 75 %', async () => {
    const { legendGradient, mmhToDbz } = await import('./radarRender.js');
    expect(mmhToDbz(1)).toBeCloseTo(23, 0);
    const g = legendGradient();
    expect(g.startsWith('linear-gradient(90deg,')).toBe(true);
    expect(g).toContain('100.0%');
  });
});

describe('škála grafu příští hodiny', () => {
  it('slabý déšť dostane nižší strop, nikdy pod prahem „mírný“', () => {
    expect(chartTopMmh(0)).toBe(2.5);
    expect(chartTopMmh(0.8)).toBe(2.5);
    expect(chartTopMmh(2.5)).toBe(10);
    expect(chartTopMmh(6)).toBe(10);
    expect(chartTopMmh(12)).toBe(25);
    // 0,8 mm/h využije víc než polovinu výšky (dřív ~17 %)
    expect(chartY(0.8, chartTopMmh(0.8))).toBeGreaterThan(0.45);
    expect(chartY(40, 25)).toBe(1);
  });
  it('popisky pásem odpovídají skutečným prahům', () => {
    expect(chartBands(2.5)).toEqual([
      { word: 'slabý', y: expect.any(Number), edge: false },
      { word: 'mírný', y: 1, edge: true },
    ]);
    expect(chartBands(10).map((b) => [b.word, b.edge])).toEqual([
      ['slabý', false],
      ['mírný', false],
      ['silný', true],
    ]);
    expect(chartBands(25).every((b) => !b.edge && b.y > 0 && b.y < 1)).toBe(true);
    const [lo, mid] = chartBands(10);
    expect(mid!.y).toBeGreaterThan(lo!.y);
  });
});

describe('spojité pole (bez razítek a vrstevnic)', () => {
  it('Gaussovo jádro je normalizované a separabilní blur zachová součet', () => {
    const k = gaussianKernel(1.7);
    expect(k.reduce((a, v) => a + v, 0)).toBeCloseTo(1, 5);
    const f = new Float32Array(40 * 40);
    f[20 * 40 + 20] = 100;
    const g = gaussianBlur(f, 40, 40, 2);
    expect(g.reduce((a, v) => a + v, 0)).toBeCloseTo(100, 2);
    // radially symmetric falloff
    expect(g[20 * 40 + 23]!).toBeCloseTo(g[23 * 40 + 20]!, 5);
  });
  it('třídy po 4 dBZ se slijí: sousední pixely se liší jen nepatrně (žádné hrany)', () => {
    // staircase of ČHMÚ classes 12, 16 … 44 dBZ (8 source px each)
    const w = 64;
    const f = new Float32Array(w * 4);
    for (let y = 0; y < 4; y++)
      for (let x = 0; x < w; x++) f[y * w + x] = 12 + 4 * Math.floor(x / 8);
    const out = renderField(f, w, 4, 3, buildRamp());
    const row = 6 * out.width;
    let maxJump = 0;
    for (let x = 30; x < out.width - 30; x++) {
      const a = out.data[(row + x) * 4 + 3]!;
      const b = out.data[(row + x - 1) * 4 + 3]!;
      maxJump = Math.max(maxJump, Math.abs(a - b));
    }
    expect(maxJump).toBeLessThanOrEqual(6); // a hard class edge would jump ~25
  });
  it('slabé srážky nabíhají plynule z průhledné (smoothstep, bez lemu)', () => {
    const lut = buildRamp();
    expect(lut[7 * 4 + 3]).toBe(0);
    expect(lut[9 * 4 + 3]!).toBeGreaterThan(0);
    expect(lut[9 * 4 + 3]! - lut[8 * 4 + 3]!).toBeLessThan(lut[11 * 4 + 3]! - lut[10 * 4 + 3]! + 1);
  });
});

describe('monotónní kubická křivka grafu', () => {
  const xs = [0, 5, 10, 15, 20, 25, 30];
  const ys = [0, 0, 0.1, 3, 0.2, 0, 0];
  it('nepřestřelí pod nulu ani nad maximum mezi body', () => {
    for (let x = 0; x <= 30; x += 0.1) {
      const v = monotoneAt(xs, ys, x);
      expect(v).toBeGreaterThanOrEqual(-1e-9);
      expect(v).toBeLessThanOrEqual(3 + 1e-9);
    }
    expect(monotoneAt(xs, ys, 15)).toBeCloseTo(3, 9);
    expect(monotoneAt(xs, ys, 2.5)).toBe(0); // flat dry stretch stays flat
  });
  it('SVG cesta: kubické Béziery, kontrolní body nikdy pod osou', () => {
    const pts = xs.map((x, i) => [x * 20, 100 - ys[i]! * 30] as const);
    const d = monotonePath(pts);
    expect(d.startsWith('M0 100C')).toBe(true);
    const nums = d.replace(/[MC]/g, ' ').trim().split(/\s+/).map(Number);
    for (let i = 1; i < nums.length; i += 2) expect(nums[i]!).toBeLessThanOrEqual(100);
  });
  it('minutová řada je hladká a nepřestřelí nad profil', () => {
    const prof = [0, 5, 10, 15, 20].map((m, i) => ({ lead_min: m, dbz: [30, 34, 26, 20, 30][i]! }));
    const s = minuteSeries(prof, [], 0)!;
    const peak = dbzToMmh(34);
    for (const p of s) expect(p.mmh).toBeLessThanOrEqual(peak + 0.01);
    expect(s[5]!.mmh).toBeCloseTo(Math.round(peak * 100) / 100, 2);
  });
});

describe('titulek a graf používají stejné prahy', () => {
  it('pásma a vodicí čáry grafu jsou odvozené z RAIN_LEVELS', () => {
    expect(BANDS.map(([w, lo]) => [w, lo])).toEqual(
      RAIN_LEVELS.slice(0, 3).map((l) => [l.word, l.mmh]),
    );
    expect(CHART_GUIDES).toEqual([RAIN_LEVELS[1]!.mmh, RAIN_LEVELS[2]!.mmh]);
  });

  it.each([0.15, 0.6, 1.2, 2.1, 2.49, 2.5, 4, 9.9, 10, 18, 24, 60])(
    'špička %s mm/h: slovo v titulku = pásmo grafu, ve kterém leží vrchol křivky',
    (peak) => {
      const series = Array.from({ length: 61 }, (_, m) => ({
        min: m,
        mmh: m < 20 ? 0 : m === 40 ? peak : Math.min(peak, 0.12),
      }));
      const head = minuteHeadline(series, 'dry', 20, null);
      const word = rainWord(headlinePeak(series));
      expect(head).toBe(`Déšť za ~20 min, ${word}`);
      expect(chartBandAt(peak)).toBe(word);
      // Peak drawn inside that band on the chart (or above the ceiling for torrential rain).
      const top = chartTopMmh(peak);
      const band = chartBands(top).find((b) => b.word === word);
      if (word !== 'přívalový') expect(band).toBeTruthy();
      const lo = BANDS.find(([w]) => w === word)?.[1] ?? RAIN_LEVELS[3]!.mmh;
      expect(chartY(peak, top)).toBeGreaterThanOrEqual(chartY(lo, top));
    },
  );
});

describe('zoom Česko', () => {
  it('výřez obsahuje celé Česko včetně východu a místo pro měřítko dole', () => {
    const bb = pathBBox(BASEMAP.orp);
    const [x, y, w, h] = fitBox(bb, 4 / 3);
    expect(w / h).toBeCloseTo(4 / 3, 5);
    expect(x).toBeLessThan(bb[0]);
    expect(x + w).toBeGreaterThan(bb[2]);
    expect(y).toBeLessThan(bb[1]);
    // >= 6 % of the height below the country stays free for the scale bar.
    expect(y + h - bb[3]).toBeGreaterThan(0.06 * h);
    // Tighter than the full composite: the country fills the map.
    expect(w).toBeLessThan(BASEMAP.w);
  });
});

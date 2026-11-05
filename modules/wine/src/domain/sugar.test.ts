import { describe, expect, it } from 'vitest';
import {
  categoryFromText,
  predicateKey,
  sparklingFromGrams,
  stillFromGrams,
  sugarInfo,
  sugarLabel,
} from './index.js';
import type { WineType } from './index.js';

const w = (
  sweetness: string | null,
  residualSugarGl: number | null = null,
  wineType: WineType = 'still',
  acidsGl: number | null = null,
) => ({ sweetness, residualSugarGl, wineType, acidsGl });

describe('EU 2019/33 Annex III part B (still wine)', () => {
  it.each([
    [0, null, 'suche'],
    [4, null, 'suche'],
    [4.1, null, 'polosuche'],
    [12, null, 'polosuche'],
    [12.1, null, 'polosladke'],
    [45, null, 'polosladke'],
    [45.1, null, 'sladke'],
    // ≤ 9 g/l is still dry when acidity is at most 2 g/l below the sugar …
    [9, 7, 'suche'],
    [9, 6.9, 'polosuche'],
    [9.1, 8, 'polosuche'],
    // … and ≤ 18 g/l medium dry when acidity is at most 10 g/l below.
    [18, 8, 'polosuche'],
    [18, 7.9, 'polosladke'],
    [18.1, 9, 'polosladke'],
  ] as const)('%s g/l, acidity %s → %s', (sugar, acids, cat) => {
    expect(stillFromGrams(sugar, acids)).toBe(cat);
  });
});

describe('EU 2019/33 Annex III part A (sparkling wine)', () => {
  it.each([
    [2, 'extra_brut'], // brut nature needs "no sugar added" – label only
    [6, 'extra_brut'],
    [11.9, 'brut'],
    [12, 'extra_dry'],
    [17, 'extra_dry'],
    [24, 'sec'],
    [32, 'sec'],
    [40, 'demi_sec'],
    [50.5, 'doux'],
  ] as const)('%s g/l → %s', (sugar, cat) => expect(sparklingFromGrams(sugar)).toBe(cat));
});

describe('label terms', () => {
  it.each([
    ['suché', 'still', 'suche'],
    ['Polosuché', 'still', 'polosuche'],
    ['polosladké / pozdní sběr', 'still', 'polosladke'],
    ['sladké', 'semi_sparkling', 'sladke'], // perlivé víno uses part B
    ['Halbtrocken', 'still', 'polosuche'],
    ['Brut', 'sparkling', 'brut'],
    ['Brut Nature', 'sparkling', 'brut_nature'],
    ['Extra Dry', 'sparkling', 'extra_dry'],
    ['demi sec', 'sparkling', 'demi_sec'],
    ['suché', 'sparkling', 'sec'], // Czech "suché" on a sekt = sec (17–32 g/l)
    ['polosladké', 'sparkling', 'demi_sec'],
    ['Brut', 'still', 'brut'], // sparkling-only term wins over a mistyped wine type
    ['Dry', 'still', 'suche'],
    ['ovocné', 'still', null],
    [null, 'still', null],
  ] as const)('%s (%s) → %s', (text, type, cat) => {
    expect(categoryFromText(text, type)).toBe(cat);
  });
});

describe('sugarInfo / sugarLabel', () => {
  it('label term wins over grams (acidity may legally allow 7 g/l "suché")', () => {
    expect(sugarInfo(w('suché', 7))).toEqual({ category: 'suche', grams: 7, basis: 'label' });
  });
  it('derives from g/l when the label term is missing, incl. acidity', () => {
    expect(sugarInfo(w(null, 8, 'still', 6.5)).category).toBe('suche');
    expect(sugarInfo(w(null, 8)).category).toBe('polosuche');
    expect(sugarInfo(w(null, 9, 'sparkling')).category).toBe('brut');
  });
  it('reads "2,1 g/l" typed into the sweetness field', () => {
    expect(sugarInfo(w('2,1 g/l'))).toEqual({ category: 'suche', grams: 2.1, basis: 'grams' });
  });
  it('unknown → Neuvedeno', () => {
    expect(sugarInfo(w(null)).category).toBe('unknown');
    expect(sugarLabel(w(null))).toBe('Neuvedeno');
    expect(sugarLabel(w('ovocné'))).toBe('ovocné');
  });
  it('detail label "Suché · 2,1 g/l"', () => {
    expect(sugarLabel(w('suché', 2.1))).toBe('Suché · 2,1 g/l');
    expect(sugarLabel(w('Brut', null, 'sparkling'))).toBe('Brut');
    expect(sugarLabel(w(null, 62))).toBe('Sladké · 62 g/l');
  });
});

describe('přívlastek is not sweetness (zákon 321/2004 Sb. § 19)', () => {
  it.each([
    ['kabinetní víno', 'kabinetni'],
    ['Pozdní sběr', 'pozdni_sber'],
    ['výběr z hroznů', 'vyber_z_hroznu'],
    ['VÝBĚR Z BOBULÍ', 'vyber_z_bobuli'],
    ['výběr z cibéb', 'vyber_z_cibeb'],
    ['ledové víno', 'ledove'],
    ['slámové víno', 'slamove'],
    ['VOC Znojmo', 'none'],
    ['moravské zemské víno', 'none'],
    [null, 'none'],
  ] as const)('%s → %s', (text, key) => expect(predicateKey(text)).toBe(key));

  it('a dry výběr z hroznů stays "suché"', () => {
    const wine = { ...w('suché', 3.4), predicate: 'výběr z hroznů' };
    expect(predicateKey(wine.predicate)).toBe('vyber_z_hroznu');
    expect(sugarInfo(wine).category).toBe('suche');
  });
});

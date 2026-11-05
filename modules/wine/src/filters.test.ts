import { expect, it } from 'vitest';
import { EMPTY_FILTERS, activeFilterCount, facets, filterWines, fold, toggle } from './filters.js';
import { createSyntheticWines } from './mock.js';
import { predicateKey, sugarCategory } from './domain/index.js';

const wines = createSyntheticWines(2026);
it('50 syntetických vín, hledání „synthetic“ < 300 ms (WIN-001)', () => {
  expect(wines).toHaveLength(50);
  const t = performance.now();
  const result = filterWines(wines, { ...EMPTY_FILTERS, query: 'synthetic' });
  expect(performance.now() - t).toBeLessThan(300);
  expect(result).toHaveLength(50);
});
it('hledání ignoruje diakritiku a kombinuje slova', () => {
  expect(fold('Pálava ŽLUTÁ')).toBe('palava zluta');
  const r = filterWines(wines, { ...EMPTY_FILTERS, query: 'palava vinarstvi' });
  expect(r.length).toBeGreaterThan(0);
  expect(r.every((w) => w.name.startsWith('Pálava'))).toBe(true);
  expect(filterWines(wines, { ...EMPTY_FILTERS, query: 'palava neexistuje' })).toEqual([]);
});
it('filtry se skládají a výsledek je deterministický (WIN-002)', () => {
  const f = {
    ...EMPTY_FILTERS,
    colors: ['red' as const],
    zones: ['Zóna B'],
    ratingMin: 4,
    inStockOnly: true,
  };
  const a = filterWines(wines, f);
  const b = filterWines([...wines].reverse(), f);
  expect(a.map((w) => w.id)).toEqual(b.map((w) => w.id));
  expect(
    a.every(
      (w) =>
        w.color === 'red' &&
        w.location?.zone === 'Zóna B' &&
        (w.personalRating ?? 0) >= 4 &&
        w.quantity > 0,
    ),
  ).toBe(true);
  expect(activeFilterCount(f)).toBe(4);
  const v = filterWines(wines, {
    ...EMPTY_FILTERS,
    vintageFrom: 2022,
    vintageTo: 2023,
    varieties: ['frankovka'],
    wineTypes: ['still'],
  });
  expect(
    v.every(
      (w) => w.vintage! >= 2022 && w.vintage! <= 2023 && w.grapeVarieties.includes('Frankovka'),
    ),
  ).toBe(true);
  const names = filterWines(wines, EMPTY_FILTERS).map((w) => w.name);
  expect(names).toEqual([...names].sort((x, y) => x.localeCompare(y, 'cs')));
});
it('facety a toggle', () => {
  const f = facets(wines);
  expect(f.zones).toEqual(['Zóna A', 'Zóna B', 'Zóna C']);
  expect(f.vintages[0]).toBeGreaterThan(f.vintages.at(-1)!);
  expect(toggle(['a'], 'a')).toEqual([]);
  expect(toggle(['a'], 'b')).toEqual(['a', 'b']);
});

it('obsah cukru a přívlastek jsou dva nezávislé filtry', () => {
  const f = { ...EMPTY_FILTERS, sugar: ['suche' as const], predicates: ['pozdni_sber' as const] };
  const r = filterWines(wines, f);
  expect(r.length).toBeGreaterThan(0);
  expect(
    r.every((w) => sugarCategory(w) === 'suche' && predicateKey(w.predicate) === 'pozdni_sber'),
  ).toBe(true);
  expect(activeFilterCount(f)).toBe(2);
  const fx = facets(wines);
  const total = [...fx.sugar.values()].reduce((a, b) => a + b, 0);
  expect(total).toBe(wines.length);
  expect(fx.sugar.get('unknown')).toBeGreaterThan(0);
  expect(fx.sugar.get('brut')).toBeGreaterThan(0);
  // Šumivé "suché" nikdy nespadne do tiché kategorie suché.
  expect(
    filterWines(wines, { ...EMPTY_FILTERS, sugar: ['suche'] }).every(
      (w) => w.wineType !== 'sparkling',
    ),
  ).toBe(true);
});

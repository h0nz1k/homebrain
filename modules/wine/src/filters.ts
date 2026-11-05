import type { WineColorCode, WineListQuery, WineRecord, WineType } from './domain/index.js';
import { predicateKey, sortWines, sugarCategory } from './domain/index.js';
import type { PredicateKey, SugarCategory } from './domain/index.js';

export type WineSort = NonNullable<WineListQuery['sort']>;
export interface WineFilters {
  query: string;
  wineTypes: WineType[];
  colors: WineColorCode[];
  /** Legal sugar-content term (EU 2019/33 Annex III) – „Obsah cukru“. */
  sugar: SugarCategory[];
  /** Přívlastek (zákon 321/2004 Sb. § 19) – must sugar at harvest, not sweetness. */
  predicates: PredicateKey[];
  varieties: string[];
  zones: string[];
  countries: string[];
  regions: string[];
  priceMax: number | null;
  vintageFrom: number | null;
  vintageTo: number | null;
  ratingMin: number | null;
  inStockOnly: boolean;
  sort: WineSort;
}
export const EMPTY_FILTERS: WineFilters = {
  query: '',
  wineTypes: [],
  colors: [],
  sugar: [],
  predicates: [],
  varieties: [],
  zones: [],
  countries: [],
  regions: [],
  priceMax: null,
  vintageFrom: null,
  vintageTo: null,
  ratingMin: null,
  inStockOnly: false,
  sort: 'name',
};

/** Case- and diacritics-insensitive key (mirrors server `fold`). */
export function fold(text: string | null | undefined): string {
  return (text ?? '').toLocaleLowerCase('cs').normalize('NFD').replace(/\p{M}/gu, '');
}

export function matchesQuery(wine: WineRecord, query: string): boolean {
  const q = fold(query.trim());
  if (!q) return true;
  const haystack = fold(`${wine.name} ${wine.labelName ?? ''} ${wine.producer}`);
  return q.split(/\s+/).every((part) => haystack.includes(part));
}

/** Composable filters; output order is deterministic per wine-domain sort rules. */
export function filterWines(wines: readonly WineRecord[], f: WineFilters): WineRecord[] {
  const varieties = new Set(f.varieties.map(fold));
  const result = wines.filter(
    (w) =>
      matchesQuery(w, f.query) &&
      (!f.wineTypes.length || f.wineTypes.includes(w.wineType)) &&
      (!f.colors.length || f.colors.includes(w.color)) &&
      (!f.sugar.length || f.sugar.includes(sugarCategory(w))) &&
      (!f.predicates.length || f.predicates.includes(predicateKey(w.predicate))) &&
      (!varieties.size || w.grapeVarieties.some((g) => varieties.has(fold(g)))) &&
      (!f.zones.length || (w.location !== null && f.zones.includes(w.location.zone))) &&
      (!f.countries.length || (w.country !== null && f.countries.includes(w.country))) &&
      (!f.regions.length || (w.region !== null && f.regions.includes(w.region))) &&
      (f.priceMax === null || (w.purchasePrice !== null && w.purchasePrice <= f.priceMax)) &&
      (f.vintageFrom === null || (w.vintage !== null && w.vintage >= f.vintageFrom)) &&
      (f.vintageTo === null || (w.vintage !== null && w.vintage <= f.vintageTo)) &&
      (f.ratingMin === null || (w.personalRating ?? 0) >= f.ratingMin) &&
      (!f.inStockOnly || w.quantity > 0),
  );
  return sortWines(result, f.sort);
}

export function activeFilterCount(f: WineFilters): number {
  return (
    f.wineTypes.length +
    f.colors.length +
    f.sugar.length +
    f.predicates.length +
    f.varieties.length +
    f.zones.length +
    f.countries.length +
    f.regions.length +
    (f.priceMax !== null ? 1 : 0) +
    (f.vintageFrom !== null ? 1 : 0) +
    (f.vintageTo !== null ? 1 : 0) +
    (f.ratingMin !== null ? 1 : 0) +
    (f.inStockOnly ? 1 : 0)
  );
}

export function facets(wines: readonly WineRecord[]) {
  const varieties = new Set<string>();
  const zones = new Set<string>();
  const vintages = new Set<number>();
  const countries = new Set<string>();
  const regions = new Set<string>();
  const sugar = new Map<SugarCategory, number>();
  const predicates = new Map<PredicateKey, number>();
  let priceMax = 0;
  for (const w of wines) {
    const s = sugarCategory(w);
    sugar.set(s, (sugar.get(s) ?? 0) + 1);
    const p = predicateKey(w.predicate);
    predicates.set(p, (predicates.get(p) ?? 0) + 1);
    if (w.country) countries.add(w.country);
    if (w.region) regions.add(w.region);
    if (w.purchasePrice !== null) priceMax = Math.max(priceMax, w.purchasePrice);
    w.grapeVarieties.forEach((g) => varieties.add(g));
    if (w.location) zones.add(w.location.zone);
    if (w.vintage !== null) vintages.add(w.vintage);
  }
  const cs = (a: string, b: string) => a.localeCompare(b, 'cs');
  return {
    varieties: [...varieties].sort(cs),
    zones: [...zones].sort(cs),
    vintages: [...vintages].sort((a, b) => b - a),
    countries: [...countries].sort(cs),
    regions: [...regions].sort(cs),
    /** Wines per sugar category / přívlastek (for chips + counts). */
    sugar,
    predicates,
    priceMax: Math.ceil(priceMax / 50) * 50,
  };
}

export function toggle<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

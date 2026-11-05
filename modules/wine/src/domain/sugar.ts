import type { WineRecord, WineType } from './types.js';

/**
 * Legal sugar-content terms ("obsah cukru") – what Czech winemakers print on the label.
 *
 * Still, semi-sparkling and other non-sparkling wines: Regulation (EU) 2019/33, Annex III,
 * Part B (suché / polosuché / polosladké / sladké, with the total-acidity tolerance for
 * suché and polosuché). Sparkling wines: the same Annex, Part A (brut nature … doux).
 * The přívlastek (kabinetní víno … slámové víno, zákon č. 321/2004 Sb., § 19) is about the
 * must sugar at harvest (°NM), NOT about the sweetness of the finished wine – see
 * `predicate.ts`.
 */
export const STILL_SUGAR = ['suche', 'polosuche', 'polosladke', 'sladke'] as const;
export const SPARKLING_SUGAR = [
  'brut_nature',
  'extra_brut',
  'brut',
  'extra_dry',
  'sec',
  'demi_sec',
  'doux',
] as const;
export type StillSugar = (typeof STILL_SUGAR)[number];
export type SparklingSugar = (typeof SPARKLING_SUGAR)[number];
export type SugarCategory = StillSugar | SparklingSugar | 'unknown';
export const SUGAR_CATEGORIES: readonly SugarCategory[] = [
  ...STILL_SUGAR,
  ...SPARKLING_SUGAR,
  'unknown',
];

export const SUGAR_CS: Record<SugarCategory, string> = {
  suche: 'Suché',
  polosuche: 'Polosuché',
  polosladke: 'Polosladké',
  sladke: 'Sladké',
  brut_nature: 'Brut nature',
  extra_brut: 'Extra brut',
  brut: 'Brut',
  extra_dry: 'Extra dry',
  sec: 'Sec',
  demi_sec: 'Demi-sec',
  doux: 'Doux',
  unknown: 'Neuvedeno',
};

/** Only sparkling wine uses the Part A scale; perlivé víno (semi-sparkling) uses Part B. */
export function sugarScale(wineType: WineType): 'still' | 'sparkling' {
  return wineType === 'sparkling' ? 'sparkling' : 'still';
}

/** Annex III Part B from residual sugar (g/l) and, when known, total acidity (g/l tartaric). */
export function stillFromGrams(sugar: number, acids: number | null = null): StillSugar {
  const gap = acids === null ? Infinity : sugar - acids;
  if (sugar <= 4 || (sugar <= 9 && gap <= 2)) return 'suche';
  if (sugar <= 12 || (sugar <= 18 && gap <= 10)) return 'polosuche';
  if (sugar <= 45) return 'polosladke';
  return 'sladke';
}

/**
 * Annex III Part A from sugar (g/l). Brut nature needs "no sugar added after the secondary
 * fermentation", which the number alone cannot prove – so the gram scale stops at extra brut;
 * brut nature only comes from the label.
 */
export function sparklingFromGrams(sugar: number): SparklingSugar {
  if (sugar <= 6) return 'extra_brut';
  if (sugar < 12) return 'brut';
  if (sugar <= 17) return 'extra_dry';
  if (sugar <= 32) return 'sec';
  if (sugar <= 50) return 'demi_sec';
  return 'doux';
}

function key(text: string | null | undefined): string {
  const folded = (text ?? '')
    .toLocaleLowerCase('cs')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  return ` ${folded} `;
}

// Ordered: multi-word / "polo-" terms before their single-word substrings.
const STILL_TERMS: Array<[string, StillSugar]> = [
  ['polosladke', 'polosladke'],
  ['medium sweet', 'polosladke'],
  ['lieblich', 'polosladke'],
  ['amabile', 'polosladke'],
  ['moelleux', 'polosladke'],
  ['polosuche', 'polosuche'],
  ['medium dry', 'polosuche'],
  ['halbtrocken', 'polosuche'],
  ['feinherb', 'polosuche'],
  ['demi sec', 'polosuche'],
  ['abboccato', 'polosuche'],
  ['suche', 'suche'],
  ['dry', 'suche'],
  ['trocken', 'suche'],
  ['secco', 'suche'],
  ['seco', 'suche'],
  ['sec', 'suche'],
  ['sladke', 'sladke'],
  ['sweet', 'sladke'],
  ['suss', 'sladke'],
  ['doux', 'sladke'],
  ['dolce', 'sladke'],
  ['dulce', 'sladke'],
];
const SPARKLING_TERMS: Array<[string, SparklingSugar]> = [
  ['brut nature', 'brut_nature'],
  ['pas dose', 'brut_nature'],
  ['dosage zero', 'brut_nature'],
  ['prirodne tvrde', 'brut_nature'],
  ['extra brut', 'extra_brut'],
  ['zvlaste tvrde', 'extra_brut'],
  ['extra dry', 'extra_dry'],
  ['extra sec', 'extra_dry'],
  ['extra suche', 'extra_dry'],
  ['zvlaste suche', 'extra_dry'],
  ['demi sec', 'demi_sec'],
  ['polosuche', 'demi_sec'],
  ['polosladke', 'demi_sec'],
  ['medium dry', 'demi_sec'],
  ['brut', 'brut'],
  ['tvrde', 'brut'],
  ['sec', 'sec'],
  ['dry', 'sec'],
  ['suche', 'sec'],
  ['secco', 'sec'],
  ['doux', 'doux'],
  ['sladke', 'doux'],
  ['dolce', 'doux'],
  ['sweet', 'doux'],
];
/** Terms that only exist on the sparkling scale (a mistyped still wine labelled "Brut"). */
const SPARKLING_ONLY = new Set<SparklingSugar>(['brut_nature', 'extra_brut', 'brut', 'extra_dry']);

function match<T>(k: string, terms: Array<[string, T]>): T | null {
  for (const [term, value] of terms) if (k.includes(` ${term} `)) return value;
  return null;
}

/** Legal category from the label text ("suché", "Brut", "polosuché / pozdní sběr"). */
export function categoryFromText(
  text: string | null | undefined,
  wineType: WineType,
): Exclude<SugarCategory, 'unknown'> | null {
  const k = key(text);
  if (sugarScale(wineType) === 'sparkling') return match(k, SPARKLING_TERMS);
  const sparkling = match(k, SPARKLING_TERMS);
  if (sparkling && SPARKLING_ONLY.has(sparkling)) return sparkling;
  return match(k, STILL_TERMS);
}

/** "2,1 g/l" written into the sweetness field by a CSV import. */
export function gramsFromText(text: string | null | undefined): number | null {
  const m = /(\d+(?:[.,]\d+)?)\s*g\s*\/\s*l/i.exec(text ?? '');
  return m ? Number(m[1]!.replace(',', '.')) : null;
}

export interface SugarInfo {
  category: SugarCategory;
  /** Residual sugar in g/l when known (shown next to the category). */
  grams: number | null;
  /** Where the category came from: label term (wins – it is the declared legal term). */
  basis: 'label' | 'grams' | 'none';
}

type SugarFields = Pick<WineRecord, 'wineType' | 'sweetness'> &
  Partial<Pick<WineRecord, 'residualSugarGl' | 'acidsGl'>>;

export function sugarInfo(wine: SugarFields): SugarInfo {
  const grams = wine.residualSugarGl ?? gramsFromText(wine.sweetness);
  const label = categoryFromText(wine.sweetness, wine.wineType);
  if (label) return { category: label, grams, basis: 'label' };
  if (grams !== null && Number.isFinite(grams) && grams >= 0) {
    const category =
      sugarScale(wine.wineType) === 'sparkling'
        ? sparklingFromGrams(grams)
        : stillFromGrams(grams, wine.acidsGl ?? null);
    return { category, grams, basis: 'grams' };
  }
  return { category: 'unknown', grams: null, basis: 'none' };
}

export function sugarCategory(wine: SugarFields): SugarCategory {
  return sugarInfo(wine).category;
}

const gl = new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 1 });

/** Detail label: "Suché · 2,1 g/l", "Brut", "Neuvedeno". */
export function sugarLabel(wine: SugarFields): string {
  const { category, grams } = sugarInfo(wine);
  const name = SUGAR_CS[category];
  if (category === 'unknown') return wine.sweetness?.trim() || name;
  return grams === null ? name : `${name} · ${gl.format(grams)} g/l`;
}

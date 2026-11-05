import type { InventoryEvent, WineColorCode, WineRecord, WineType } from '../domain/index.js';
import type { WineErrorCode } from '../api.js';

export const COLOR_CS: Record<WineColorCode, string> = {
  white: 'Bílé',
  red: 'Červené',
  rose: 'Růžové',
  orange: 'Oranžové',
  other: 'Jiné',
};
export const TYPE_CS: Record<WineType, string> = {
  still: 'Tiché',
  sparkling: 'Šumivé',
  semi_sparkling: 'Perlivé',
  other: 'Jiné',
};
export const OPERATION_CS: Record<InventoryEvent['operation'], string> = {
  stock_in: 'Naskladnění',
  consume: 'Odepsáno',
  correction: 'Oprava stavu',
  reserve: 'Rezervace',
  release: 'Uvolnění',
};
export const ERROR_CS: Record<WineErrorCode, string> = {
  INVALID_QUANTITY: 'Neplatné množství lahví.',
  ZERO_STOCK: 'Toto víno už není skladem.',
  CONFIRMATION_REQUIRED: 'Odepsání je potřeba potvrdit.',
  TARGET_NOT_FOUND: 'Víno nebylo nalezeno.',
  TARGET_AMBIGUOUS: 'Více shodných vín – upřesněte výběr.',
  RATING_OUT_OF_RANGE: 'Hodnocení musí být v rozsahu 0–5.',
  IDEMPOTENT_REPLAY: 'Operace už byla zpracována s jinými údaji.',
  NO_CHANGE: 'Množství se nezměnilo.',
  INVALID_FIELD: 'Některý údaj je neplatný.',
  UNKNOWN: 'Operaci se nepodařilo provést.',
};
export function bottles(n: number): string {
  return `${n} ${n === 1 ? 'lahev' : n >= 2 && n <= 4 ? 'lahve' : 'lahví'}`;
}
export const num1 = new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 1 });
export const czk = new Intl.NumberFormat('cs-CZ', {
  style: 'currency',
  currency: 'CZK',
  maximumFractionDigits: 0,
});
export const dateTime = new Intl.DateTimeFormat('cs-CZ', {
  day: 'numeric',
  month: 'numeric',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});
export const dateOnly = new Intl.DateTimeFormat('cs-CZ', {
  day: 'numeric',
  month: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

/** 'ročník · predikát' (colour when the predicate is unknown). */
export function metaLine(
  wine: Pick<WineRecord, 'vintage' | 'predicate' | 'color'>,
  noVintage = 'NV',
): string {
  return `${wine.vintage ?? noVintage} · ${wine.predicate || COLOR_CS[wine.color]}`;
}

/** Lookup / photo / Vivino error copy (codes from the integration, #81). */
export const LOOKUP_ERROR_CS: Record<string, string> = {
  LOOKUP_EMPTY: 'Zadejte název, EAN nebo přidejte fotku etikety.',
  LOOKUP_EAN_INVALID: 'EAN nemá platnou kontrolní číslici – zkontrolujte číslo pod čárovým kódem.',
  LOOKUP_URL_NOT_ALLOWED: 'Povolené jsou jen veřejné stránky přes https.',
  LOOKUP_FETCH_FAILED: 'Zdroj teď neodpovídá, zkuste to později.',
  LOOKUP_NOT_FOUND: 'Stránka se nenašla.',
  LOOKUP_TIMEOUT: 'Dohledání trvalo příliš dlouho.',
  LOOKUP_PHOTO_INVALID: 'Fotku se nepodařilo načíst – zkuste JPEG nebo PNG.',
  LOOKUP_PHOTO_TOO_LARGE: 'Fotka je příliš velká.',
  LOOKUP_AI_UNAVAILABLE: 'AI v Home Assistantu není nastavená.',
  LOOKUP_AI_NO_ATTACHMENTS: 'Nastavená AI neumí číst fotky.',
  LOOKUP_AI_TIMEOUT: 'AI neodpověděla včas, zkuste to znovu.',
  LOOKUP_AI_FAILED: 'AI fotku nerozpoznala.',
  IMPORT_VIVINO_UNRECOGNISED: 'Soubor nevypadá jako export z Vivina (CSV se seznamem vín).',
  IMPORT_TOO_MANY_ROWS: 'Soubor má příliš mnoho řádků (max. 2000).',
  IMAGE_MISSING: 'Chybí fotka.',
};
export const AI_HINT_CS =
  'Pro rozpoznání fotky přidej v HA AI integraci, např. Google Gemini, a nastav ji pro AI úlohy.';
export const AI_NO_PHOTO_CS =
  'Nastavená AI integrace neumí číst obrázky. V HA vyber pro AI úlohy model s podporou příloh (např. Google Gemini).';
export function lookupErrorText(err: unknown, fallback: string): string {
  const code = (err as { code?: string } | null)?.code ?? '';
  return LOOKUP_ERROR_CS[code] ?? fallback;
}

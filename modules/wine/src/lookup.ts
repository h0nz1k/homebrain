/**
 * Universal wine lookup (#81): types of the `homebrain/wine/lookup*` WS commands plus the
 * pure helpers the add/enrich UI shares (GTIN check, Vivino link, proposal → form, diff).
 */
import type { Confidence, WineColorCode, WineRecord, WineType } from './domain/index.js';

export type LookupProviderId = 'local' | 'znovin' | 'openfoodfacts' | 'web' | 'ai_task';
export type LookupInputKind = 'text' | 'ean' | 'url' | 'photo';

export interface LookupProviderInfo {
  id: LookupProviderId | string;
  label: string;
  inputs: LookupInputKind[];
  available: boolean;
  /** ai_task_missing | no_ai_entity | no_attachments | null */
  hint: string | null;
  /** AI only: the configured entity accepts image attachments. */
  photo?: boolean;
}

/** Field subset a provider may propose (camelCase like WineRecord). */
export type LookupFields = Partial<
  Pick<
    WineRecord,
    | 'name'
    | 'labelName'
    | 'predicate'
    | 'producer'
    | 'vintage'
    | 'wineType'
    | 'color'
    | 'grapeVarieties'
    | 'country'
    | 'region'
    | 'sweetness'
    | 'residualSugarGl'
    | 'acidsGl'
    | 'volumeMl'
    | 'alcoholPct'
    | 'description'
    | 'productLine'
    | 'drinkWindow'
    | 'ean'
  >
> & { purchasePrice?: number | null };

export interface LookupProposal {
  provider: LookupProviderId | string;
  providerLabel: string;
  confidence: Confidence;
  fields: LookupFields;
  /** Fields guessed from text heuristics (shown as „odhad“). */
  inferred: string[];
  imageUrl: string | null;
  imageLicense: 'review' | 'approved' | null;
  sourceUrl: string | null;
  externalProductId: string | null;
  /** Local cellar hit: the wine already exists (adding = stock-in). */
  existing: {
    wineId: string;
    name: string;
    producer: string;
    vintage: number | null;
    quantity: number;
  } | null;
  note: string | null;
  vivinoUrl?: string;
}

export interface LookupProviderStatus {
  id: string;
  label: string;
  status: 'ok' | 'empty' | 'error' | 'skipped' | 'unavailable';
  code?: string;
  count?: number;
}

export interface LookupResult {
  proposals: LookupProposal[];
  providers: LookupProviderStatus[];
  query?: { text: string | null; ean: string | null; url: string | null; photo: boolean };
}

export interface LookupInput {
  query?: string;
  ean?: string;
  url?: string;
  /** Downscaled label photo as a data URL. */
  photo?: string;
  /** Re-lookup of an existing wine (Dohledat in the detail). */
  wineId?: string;
  providers?: string[];
}

export interface VivinoCandidate {
  wineId: string;
  name: string;
  labelName?: string | null;
  producer: string;
  vintage: number | null;
  score: number;
}
export type VivinoMatch = 'exact' | 'fuzzy' | 'none' | 'exact_unchanged' | 'fuzzy_unchanged';
export interface VivinoPlanItem {
  row: number;
  producer: string | null;
  name: string;
  vintage: number | null;
  rating: number | null;
  note: string | null;
  match: VivinoMatch;
  wineId: string | null;
  candidates: VivinoCandidate[];
  changes: Partial<Pick<WineRecord, 'personalRating' | 'personalNote'>>;
  conflict: boolean;
  selected: boolean;
}
export interface VivinoImportResult {
  dryRun: boolean;
  rows: number;
  summary: Partial<Record<VivinoMatch, number>>;
  plan?: VivinoPlanItem[];
  applied?: number;
}

/** New wine for `homebrain/wine/create` (quantity = bottles stocked in). */
export type NewWine = Pick<WineRecord, 'name' | 'producer' | 'color' | 'wineType'> &
  Partial<
    Pick<
      WineRecord,
      | 'vintage'
      | 'grapeVarieties'
      | 'country'
      | 'region'
      | 'sweetness'
      | 'residualSugarGl'
      | 'acidsGl'
      | 'volumeMl'
      | 'alcoholPct'
      | 'location'
      | 'acquiredOn'
      | 'purchasePrice'
      | 'labelName'
      | 'predicate'
      | 'description'
      | 'productLine'
      | 'ean'
      | 'confidence'
      | 'personalNote'
    >
  > & {
    quantity: number;
    source?: Partial<WineRecord['source']>;
  };

/* ------------------------------------------------------------------ helpers */

/** EAN-8 / UPC-A / EAN-13 / GTIN-14 mod-10 check (same rule as the integration). */
export function gtinValid(code: string): boolean {
  if (!/^\d+$/.test(code) || ![8, 12, 13, 14].includes(code.length)) return false;
  const digits = [...code].map(Number);
  const check = digits.pop()!;
  const total = digits.reverse().reduce((sum, d, n) => sum + d * (n % 2 === 0 ? 3 : 1), 0);
  return (10 - (total % 10)) % 10 === check;
}
export function normalizeEan(value: string): string | null {
  const code = value.replace(/[\s-]/g, '');
  return gtinValid(code) ? code : null;
}

export const VIVINO_SEARCH = 'https://www.vivino.com/search/wines?q=';
/** Community ratings live on Vivino (no API, no scraping) – we only link its search. */
export function vivinoSearchUrl(w: {
  producer?: string | null;
  name?: string | null;
  vintage?: number | null;
}) {
  const q = [w.producer, w.name, w.vintage].filter(Boolean).join(' ').slice(0, 120);
  return VIVINO_SEARCH + encodeURIComponent(q);
}

/** Editable form state of the add sheet (strings so inputs stay controlled). */
export interface WineDraft {
  name: string;
  labelName: string;
  producer: string;
  vintage: string;
  color: WineColorCode;
  wineType: WineType;
  grapes: string;
  country: string;
  region: string;
  sweetness: string;
  /** Residual sugar g/l („Zbytkový cukr“ on the label/e-shop). */
  residualSugar: string;
  volumeMl: string;
  alcoholPct: string;
  ean: string;
  quantity: number;
  price: string;
  acquiredOn: string;
  zone: string;
  note: string;
}

export function emptyDraft(today: string): WineDraft {
  return {
    name: '',
    labelName: '',
    producer: '',
    vintage: '',
    color: 'white',
    wineType: 'still',
    grapes: '',
    country: '',
    region: '',
    sweetness: '',
    residualSugar: '',
    volumeMl: '750',
    alcoholPct: '',
    ean: '',
    quantity: 1,
    price: '',
    acquiredOn: today,
    zone: '',
    note: '',
  };
}

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v));
export function draftFromProposal(p: LookupProposal, base: WineDraft): WineDraft {
  const f = p.fields;
  return {
    ...base,
    name: str(f.name) || base.name,
    labelName: str(f.labelName) || base.labelName,
    producer: str(f.producer) || base.producer,
    vintage: str(f.vintage) || base.vintage,
    color: f.color ?? base.color,
    wineType: f.wineType ?? base.wineType,
    grapes: f.grapeVarieties?.join(', ') || base.grapes,
    country: str(f.country) || base.country,
    region: str(f.region) || base.region,
    sweetness: str(f.sweetness) || base.sweetness,
    residualSugar: str(f.residualSugarGl).replace('.', ',') || base.residualSugar,
    volumeMl: str(f.volumeMl) || base.volumeMl,
    alcoholPct: str(f.alcoholPct) || base.alcoholPct,
    ean: str(f.ean) || base.ean,
    price: str(f.purchasePrice) || base.price,
  };
}

export type DraftErrors = Partial<Record<keyof WineDraft, string>>;
const numOrNull = (v: string) => (v.trim() === '' ? null : Number(v.trim().replace(',', '.')));

/** Validate the draft and build the create payload (Czech messages per field). */
export function draftToWine(
  d: WineDraft,
  proposal: LookupProposal | null,
): { wine: NewWine | null; errors: DraftErrors } {
  const errors: DraftErrors = {};
  if (!d.name.trim()) errors.name = 'Vyplňte název vína.';
  if (!d.producer.trim()) errors.producer = 'Vyplňte vinařství.';
  const vintage = numOrNull(d.vintage);
  if (vintage !== null && !(Number.isInteger(vintage) && vintage >= 1800 && vintage <= 2200))
    errors.vintage = 'Ročník 1800–2200, nebo nechte prázdné.';
  const volume = numOrNull(d.volumeMl);
  if (volume === null || !Number.isInteger(volume) || volume < 1 || volume > 30000)
    errors.volumeMl = 'Objem v ml, např. 750.';
  const alcohol = numOrNull(d.alcoholPct);
  if (alcohol !== null && !(alcohol >= 0 && alcohol <= 100)) errors.alcoholPct = 'Alkohol 0–100 %.';
  const sugar = numOrNull(d.residualSugar);
  if (sugar !== null && !(sugar >= 0 && sugar <= 1000))
    errors.residualSugar = 'Zbytkový cukr v g/l, např. 2,1.';
  const price = numOrNull(d.price);
  if (price !== null && !(Number.isFinite(price) && price >= 0)) errors.price = 'Neplatná cena.';
  const ean = d.ean.trim() ? normalizeEan(d.ean) : null;
  if (d.ean.trim() && !ean) errors.ean = 'EAN nemá platnou kontrolní číslici.';
  if (!Number.isInteger(d.quantity) || d.quantity < 0 || d.quantity > 999)
    errors.quantity = 'Počet lahví 0–999.';
  if (d.acquiredOn && !/^\d{4}-\d{2}-\d{2}$/.test(d.acquiredOn))
    errors.acquiredOn = 'Datum ve tvaru RRRR-MM-DD.';
  if (Object.keys(errors).length) return { wine: null, errors };
  const text = (v: string) => v.trim() || null;
  const wine: NewWine = {
    name: d.name.trim(),
    producer: d.producer.trim(),
    color: d.color,
    wineType: d.wineType,
    vintage,
    grapeVarieties: d.grapes
      .split(',')
      .map((g) => g.trim())
      .filter(Boolean),
    country: text(d.country),
    region: text(d.region),
    sweetness: text(d.sweetness),
    residualSugarGl: sugar,
    volumeMl: volume!,
    alcoholPct: alcohol,
    labelName: text(d.labelName),
    personalNote: text(d.note),
    ean,
    quantity: d.quantity,
    purchasePrice: price,
    acquiredOn: d.acquiredOn || null,
    location: d.zone.trim() ? { zone: d.zone.trim() } : null,
    confidence: proposal ? (proposal.inferred.length ? 'inferred' : 'matched') : 'manual',
    source: proposal
      ? {
          provider: 'catalog-provider',
          catalog: proposal.provider,
          externalProductId: proposal.externalProductId,
          sourceUrl: proposal.sourceUrl,
        }
      : { provider: 'local' },
  };
  if (proposal?.fields.description) wine.description = proposal.fields.description;
  if (proposal?.fields.predicate) wine.predicate = proposal.fields.predicate;
  if (typeof proposal?.fields.acidsGl === 'number') wine.acidsGl = proposal.fields.acidsGl;
  return { wine, errors };
}

/** Fields compared in the detail „Dohledat“ diff (only editable, display-worthy ones). */
export const DIFF_FIELDS = [
  'name',
  'labelName',
  'producer',
  'vintage',
  'color',
  'wineType',
  'grapeVarieties',
  'country',
  'region',
  'sweetness',
  'residualSugarGl',
  'alcoholPct',
  'volumeMl',
  'predicate',
  'description',
  'ean',
] as const;
export type DiffField = (typeof DIFF_FIELDS)[number];
export interface FieldDiff {
  field: DiffField;
  current: unknown;
  proposed: unknown;
  /** Current value empty → safe to fill (pre-selected); otherwise a replacement. */
  fill: boolean;
}

const isEmpty = (v: unknown) =>
  v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);
const same = (a: unknown, b: unknown) =>
  JSON.stringify(a ?? null).toLowerCase() === JSON.stringify(b ?? null).toLowerCase();

export function diffProposal(wine: WineRecord, p: LookupProposal): FieldDiff[] {
  const out: FieldDiff[] = [];
  for (const field of DIFF_FIELDS) {
    const proposed = (p.fields as Record<string, unknown>)[field];
    if (isEmpty(proposed)) continue;
    const current = (wine as unknown as Record<string, unknown>)[field];
    if (same(current, proposed)) continue;
    out.push({ field, current: current ?? null, proposed, fill: isEmpty(current) });
  }
  return out;
}

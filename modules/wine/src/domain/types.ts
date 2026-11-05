/** Domain error/result codes — no UI copy, no HA identifiers. */
export type DomainErrorCode =
  | 'INVALID_QUANTITY'
  | 'ZERO_STOCK'
  | 'CONFIRMATION_REQUIRED'
  | 'TARGET_NOT_FOUND'
  | 'TARGET_AMBIGUOUS'
  | 'RATING_OUT_OF_RANGE'
  | 'IDEMPOTENT_REPLAY';

export type WineStatus = 'in_stock' | 'reserved' | 'consumed' | 'archived';
export type WineType = 'still' | 'sparkling' | 'semi_sparkling' | 'other';
export type WineColorCode = 'white' | 'red' | 'rose' | 'orange' | 'other';
export type Confidence = 'verified' | 'matched' | 'inferred' | 'manual';
export type InventoryOperation = 'stock_in' | 'consume' | 'correction' | 'reserve' | 'release';

export interface WineLocation {
  zone: string;
  shelf?: string | null;
  position?: string | null;
}

export interface WineSource {
  provider: 'local' | 'order-import' | 'catalog-provider';
  externalProductId: string | null;
  batch: string | null;
  sourceUrl: string | null;
  fetchedAt: string | null;
  /** Lookup provider that proposed the record (znovin, openfoodfacts, web, ai_task…). */
  catalog?: string | null;
}

export interface WineImage {
  localPath: string;
  sourceUrl: string | null;
  licenseStatus: 'placeholder' | 'approved' | 'review';
  /** Short-lived signed URL of the local photo (added by the integration on reads). */
  url?: string | null;
}

/** Canonical inventory record aligned with docs/data-contract.md. */
export interface WineRecord {
  id: string;
  name: string;
  producer: string;
  vintage: number | null;
  wineType: WineType;
  color: WineColorCode;
  grapeVarieties: string[];
  country: string | null;
  region: string | null;
  sweetness: string | null;
  volumeMl: number;
  alcoholPct: number | null;
  quantity: number;
  location: WineLocation | null;
  acquiredOn: string | null;
  purchasePrice: number | null;
  personalRating: number | null;
  personalNote: string | null;
  status: WineStatus;
  image: WineImage | null;
  source: WineSource;
  confidence: Confidence;
  createdAt: string;
  updatedAt: string;
  /** HomeBrain extension (schema v2): recommended drinking window in years. */
  drinkWindow?: { from: number | null; to: number | null } | null;
  /** Schema v3: vendor product line (e.g. Znovín series) and product description. */
  productLine?: string | null;
  description?: string | null;
  /** Schema v4: Znovín product/label name shown under the H1 title (`name`). */
  labelName?: string | null;
  /** Schema v4: predicate (pozdní sběr, VOC Znojmo, moravské zemské víno, …). */
  predicate?: string | null;
  /** Schema v5 (#81): EAN/GTIN of the bottle – lookup key, optional. */
  ean?: string | null;
  /** Schema v7: residual sugar in g/l (label/e-shop „Zbytkový cukr“) – derives the legal
   *  sugar category when the label term is missing (see domain/sugar.ts). */
  residualSugarGl?: number | null;
  /** Schema v7: total acidity in g/l tartaric acid (EU 2019/33 Annex III B tolerance). */
  acidsGl?: number | null;
}

/** One purchase lot from an import (price per bottle; the order only as a short hash). */
export interface PurchaseLot {
  date: string;
  unitPrice: number;
  quantity: number | null;
  orderRef: string | null;
}

/** E-shop price snapshot (on enrichment + weekly refresh). */
export interface ShopPricePoint {
  date: string;
  unitPrice: number;
  regularPrice?: number | null;
}

export interface PriceHistory {
  purchases: PurchaseLot[];
  shop: ShopPricePoint[];
}

export interface InventoryEvent {
  eventId: string;
  wineId: string;
  operation: InventoryOperation;
  quantityDelta: number;
  reason: string;
  sourceOperationId: string;
  occurredAt: string;
  actor?: { type: 'user' | 'assist' | 'import'; id?: string };
}

export interface ConsumeRequest {
  wineId: string;
  quantity: number;
  confirmed: boolean;
  sourceOperationId: string;
  reason?: string;
}

export interface DomainSuccess<T> {
  ok: true;
  value: T;
}

export interface DomainFailure {
  ok: false;
  code: DomainErrorCode;
}

export type DomainResult<T> = DomainSuccess<T> | DomainFailure;

export interface ConsumeSuccessValue {
  wine: WineRecord;
  event: InventoryEvent;
  replayed: boolean;
}

export interface RateSuccessValue {
  wine: WineRecord;
}

export interface WineListQuery {
  search?: string;
  sort?: 'name' | 'rating' | 'vintage' | 'id';
}

export const RATING_MIN = 0;
export const RATING_MAX = 5;

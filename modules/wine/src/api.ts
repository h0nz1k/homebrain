import type { ConnectionLike, ModuleViewProps } from '@homebrain/ha-client';
import type { DomainErrorCode, InventoryEvent, PriceHistory, WineRecord } from './domain/index.js';
import { evaluateConsume, isNonNegativeInteger } from './domain/index.js';
import type {
  LookupInput,
  LookupProposal,
  LookupProviderInfo,
  LookupResult,
  NewWine,
  VivinoImportResult,
  VivinoPlanItem,
} from './lookup.js';
import { normalizeEan, vivinoSearchUrl } from './lookup.js';

export type WineErrorCode =
  | DomainErrorCode
  | 'NO_CHANGE'
  | 'INVALID_FIELD'
  | 'UNKNOWN'
  | `ENRICH_${string}`
  | `IMPORT_${string}`
  | `LOOKUP_${string}`
  | `IMAGE_${string}`;
export class WineApiError extends Error {
  constructor(readonly code: WineErrorCode) {
    super(code);
    this.name = 'WineApiError';
  }
}
export interface WriteResult {
  wine: WineRecord;
  event: InventoryEvent;
  replayed: boolean;
}
export interface ConsumeInput {
  wineId: string;
  quantity: number;
  confirmed: boolean;
  sourceOperationId: string;
  reason?: string;
}
export interface CorrectInput {
  wineId: string;
  quantity: number;
  reason: string;
  sourceOperationId: string;
}
export interface ImportPlanItem {
  row: number;
  action: 'create' | 'stock_in' | 'skip' | 'already_imported';
  name: string;
  vintage: number | null;
  quantity: number;
  /** Units as printed on the order (cartons for multipacks); quantity = bottles. */
  orderUnits?: number | null;
  packSize?: number;
  packLabel?: string | null;
  issues?: string[];
  wineId: string | null;
  catalogueCode?: string;
  unitPrice?: number | null;
  lineTotal?: number | null;
}
export interface OrderCheck {
  ok: boolean;
  itemsTotal: number;
  discounts: number;
  fees: number;
  orderTotal: number | null;
  expectedTotal: number;
}
/** Parsed order (PDF/text) – product lines only, never personal data. */
export interface OrderPreview {
  recognized: boolean;
  vendor: string | null;
  itemCount: number;
  bottles: number;
  check: OrderCheck;
  issues: string[];
  alreadyImported?: boolean;
}
export interface EnrichResult {
  wineId: string;
  facts: Record<string, string | number | null>;
  changes: Partial<WineRecord>;
  photo: boolean;
  applied: boolean;
  wine?: WineRecord;
}
export interface EnrichBatchResult {
  confirm: boolean;
  items: Array<{ wineId: string; ok: boolean; name?: string; url?: string; code?: string }>;
}
/** Background enrichment after an order import (`homebrain/wine/enrich_status`). */
export interface AutoEnrichStatus {
  running: boolean;
  total: number;
  done: number;
  ok: number;
  failed: number;
  items: Array<{
    wineId: string;
    ok: boolean;
    name?: string;
    photo?: boolean;
    skipped?: string;
    code?: string;
  }>;
  startedAt?: string;
  finishedAt?: string;
}
export interface ImportResult {
  dryRun: boolean;
  rows: number;
  summary: Partial<Record<ImportPlanItem['action'], number>>;
  plan: ImportPlanItem[];
  errors: Array<{ row: number; code: string; field?: string | null }>;
  order?: OrderPreview;
  /** Set after a confirmed order import: photos/facts are filled in the background. */
  autoEnrich?: AutoEnrichStatus;
}
export interface ImportInput {
  /** pdf = base64 / data URL, text = pasted order confirmation. */
  format: 'csv' | 'json' | 'pdf' | 'text';
  content: string;
  dryRun: boolean;
}
export interface WineDetailData {
  wine: WineRecord;
  events: InventoryEvent[];
  /** Purchase lots + e-shop snapshots (integration ≥ rc.7; absent on older servers). */
  priceHistory?: PriceHistory;
}
export interface WineApi {
  list(): Promise<WineRecord[]>;
  get(wineId: string): Promise<WineDetailData>;
  consume(input: ConsumeInput): Promise<WriteResult>;
  correct(input: CorrectInput): Promise<WriteResult>;
  update(wineId: string, changes: Partial<WineRecord>): Promise<WineRecord>;
  /** WS `homebrain/wine/import`; dryRun=true returns the plan without writing. */
  importFile(input: ImportInput): Promise<ImportResult>;
  /** WS `homebrain/wine/enrich`: confirm=false is a preview; true stores photo + fields. */
  enrich(input: {
    wineId: string;
    code?: string;
    url?: string;
    confirm: boolean;
  }): Promise<EnrichResult>;
  enrichBatch(wineIds: string[], confirm: boolean): Promise<EnrichBatchResult>;
  /** Progress of the automatic post-import enrichment. */
  enrichStatus(): Promise<AutoEnrichStatus>;
  /** WS `homebrain/wine/create` (idempotent by sourceOperationId). */
  create(wine: NewWine, sourceOperationId: string): Promise<WriteResult>;
  /** Which lookup providers can run (AI needs an HA ai_task entity). */
  lookupProviders(): Promise<LookupProviderInfo[]>;
  /** „Dohledat“: name / EAN / URL / photo → proposals; never writes. */
  lookup(input: LookupInput): Promise<LookupResult>;
  /** Store the confirmed bottle photo (own label photo or a proposal image URL). */
  setImage(wineId: string, image: { photo: string } | { imageUrl: string }): Promise<WineRecord>;
  /** Vivino GDPR export → personal rating/note (dry run first, then confirmed rows). */
  importVivino(input: {
    content: string;
    dryRun: boolean;
    accept?: Array<{ row: number; wineId: string }>;
  }): Promise<VivinoImportResult>;
}

/**
 * Merge a write result into the cached record. The signed photo URL is only added on
 * reads by older integrations, so keep the previous one while it points at the same file.
 */
export function mergeWineRecord(prev: WineRecord | undefined, next: WineRecord): WineRecord {
  const url = prev?.image?.url;
  if (!url || !next.image || next.image.url || next.image.localPath !== prev.image?.localPath)
    return next;
  return { ...next, image: { ...next.image, url } };
}

export function newOperationId(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `op-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const KNOWN = new Set<string>([
  'INVALID_QUANTITY',
  'ZERO_STOCK',
  'CONFIRMATION_REQUIRED',
  'TARGET_NOT_FOUND',
  'TARGET_AMBIGUOUS',
  'RATING_OUT_OF_RANGE',
  'IDEMPOTENT_REPLAY',
  'NO_CHANGE',
  'INVALID_FIELD',
]);
function toError(error: unknown): WineApiError {
  const code = (error as { code?: unknown } | null)?.code;
  return new WineApiError(
    typeof code === 'string' &&
      (KNOWN.has(code) || /^(ENRICH|IMPORT|LOOKUP|IMAGE)_[A-Z_]{2,40}$/.test(code))
      ? (code as WineErrorCode)
      : 'UNKNOWN',
  );
}

/** Talks to the integration over the host's authenticated HA connection. */
export function createWsWineApi(connection: ConnectionLike): WineApi {
  async function send<T>(type: string, payload: Record<string, unknown> = {}): Promise<T> {
    const message = { type, ...payload };
    try {
      return await connection.sendMessagePromise<T>(message);
    } catch (error) {
      throw toError(error);
    }
  }
  return {
    list: async () => (await send<{ wines: WineRecord[] }>('homebrain/wine/list')).wines,
    get: (wineId) => send('homebrain/wine/get', { wine_id: wineId }),
    consume: (i) =>
      send('homebrain/wine/consume', {
        wine_id: i.wineId,
        quantity: i.quantity,
        confirmed: i.confirmed,
        source_operation_id: i.sourceOperationId,
        ...(i.reason ? { reason: i.reason } : {}),
      }),
    correct: (i) =>
      send('homebrain/wine/correct', {
        wine_id: i.wineId,
        quantity: i.quantity,
        reason: i.reason,
        source_operation_id: i.sourceOperationId,
      }),
    update: async (wineId, changes) =>
      (await send<{ wine: WineRecord }>('homebrain/wine/update', { wine_id: wineId, changes }))
        .wine,
    importFile: async (i) =>
      send<ImportResult>('homebrain/wine/import', {
        format: i.format,
        content: i.content,
        dry_run: i.dryRun,
      }),
    enrich: (i) =>
      send<EnrichResult>('homebrain/wine/enrich', {
        wine_id: i.wineId,
        ...(i.code ? { code: i.code } : {}),
        ...(i.url ? { url: i.url } : {}),
        confirm: i.confirm,
      }),
    enrichBatch: (wineIds, confirm) =>
      send<EnrichBatchResult>('homebrain/wine/enrich_batch', { wine_ids: wineIds, confirm }),
    enrichStatus: () => send<AutoEnrichStatus>('homebrain/wine/enrich_status', {}),
    create: (wine, sourceOperationId) =>
      send<WriteResult>('homebrain/wine/create', {
        wine,
        source_operation_id: sourceOperationId,
      }),
    lookupProviders: async () =>
      (await send<{ providers: LookupProviderInfo[] }>('homebrain/wine/lookup_providers'))
        .providers,
    lookup: (i) =>
      send<LookupResult>('homebrain/wine/lookup', {
        ...(i.query ? { query: i.query } : {}),
        ...(i.ean ? { ean: i.ean } : {}),
        ...(i.url ? { url: i.url } : {}),
        ...(i.photo ? { photo: i.photo } : {}),
        ...(i.wineId ? { wine_id: i.wineId } : {}),
        ...(i.providers ? { providers: i.providers } : {}),
      }),
    setImage: async (wineId, image) =>
      (
        await send<{ wine: WineRecord }>('homebrain/wine/set_image', {
          wine_id: wineId,
          ...('photo' in image ? { photo: image.photo } : { image_url: image.imageUrl }),
        })
      ).wine,
    importVivino: (i) =>
      send<VivinoImportResult>('homebrain/wine/import_vivino', {
        content: i.content,
        dry_run: i.dryRun,
        ...(i.accept ? { accept: i.accept.map((a) => ({ row: a.row, wine_id: a.wineId })) } : {}),
      }),
  };
}

export interface MockWineOptions {
  /** Pretend HA has an ai_task entity with image support (production has none yet). */
  ai?: boolean;
  /** Artificial latency of lookups (ms) so loading states are visible in dev. */
  latencyMs?: number;
}

/** In-memory twin of the integration store (dev mocks + tests); same gates and audit. */
export function createMockWineApi(
  seed: readonly WineRecord[],
  now: () => Date = () => new Date(),
  options: MockWineOptions = {},
) {
  const wines = new Map(seed.map((w) => [w.id, structuredClone(w)]));
  const events: InventoryEvent[] = [];
  const replays = new Map<string, { fingerprint: string; result: WriteResult }>();
  let seq = 0;
  let auto: AutoEnrichStatus = { running: false, total: 0, done: 0, ok: 0, failed: 0, items: [] };
  let autoQueue: string[] = [];
  for (const w of seed) {
    events.push({
      eventId: `seed-${w.id}`,
      wineId: w.id,
      operation: 'stock_in',
      quantityDelta: w.quantity,
      reason: 'Naskladnění',
      sourceOperationId: `seed-${w.id}`,
      occurredAt: w.createdAt,
      actor: { type: 'import' },
    });
  }
  function apply(
    opId: string,
    fingerprint: string,
    wineId: string,
    operation: InventoryEvent['operation'],
    delta: number,
    reason: string,
  ): WriteResult {
    const wine = wines.get(wineId)!;
    const at = now().toISOString();
    const quantity = wine.quantity + delta;
    let status = wine.status;
    if (quantity === 0 && status === 'in_stock') status = 'consumed';
    if (quantity > 0 && status === 'consumed') status = 'in_stock';
    const next = { ...wine, quantity, status, updatedAt: at };
    wines.set(wineId, next);
    const event: InventoryEvent = {
      eventId: `mock-${++seq}`,
      wineId,
      operation,
      quantityDelta: delta,
      reason,
      sourceOperationId: opId,
      occurredAt: at,
      actor: { type: 'user' },
    };
    events.push(event);
    const result = { wine: structuredClone(next), event, replayed: false };
    replays.set(opId, { fingerprint, result });
    return result;
  }
  function replay(opId: string, fingerprint: string): WriteResult | null {
    const hit = replays.get(opId);
    if (!hit) return null;
    if (hit.fingerprint !== fingerprint) throw new WineApiError('IDEMPOTENT_REPLAY');
    return { ...hit.result, replayed: true };
  }
  const api: WineApi & { events(): InventoryEvent[] } = {
    events: () => [...events],
    list: async () => [...wines.values()].map((w) => structuredClone(w)),
    get: async (wineId) => {
      const wine = wines.get(wineId);
      if (!wine) throw new WineApiError('TARGET_NOT_FOUND');
      return {
        wine: structuredClone(wine),
        events: events.filter((e) => e.wineId === wineId).reverse(),
        priceHistory: mockPriceHistory(wine),
      };
    },
    consume: async (i) => {
      const fp = JSON.stringify(['consume', i.wineId, i.quantity]);
      const hit = replay(i.sourceOperationId, fp);
      if (hit) return hit;
      const wine = wines.get(i.wineId);
      const gate = evaluateConsume({
        matchCount: wine ? 1 : 0,
        stockQuantity: wine?.quantity ?? 0,
        quantity: i.quantity,
        confirmed: i.confirmed,
      });
      if (!gate.ok) throw new WineApiError(gate.code);
      return apply(i.sourceOperationId, fp, i.wineId, 'consume', -i.quantity, i.reason ?? 'Vypito');
    },
    correct: async (i) => {
      const fp = JSON.stringify(['correction', i.wineId, i.quantity]);
      const hit = replay(i.sourceOperationId, fp);
      if (hit) return hit;
      if (!isNonNegativeInteger(i.quantity)) throw new WineApiError('INVALID_QUANTITY');
      if (!i.reason.trim()) throw new WineApiError('INVALID_FIELD');
      const wine = wines.get(i.wineId);
      if (!wine) throw new WineApiError('TARGET_NOT_FOUND');
      if (wine.quantity === i.quantity) throw new WineApiError('NO_CHANGE');
      return apply(
        i.sourceOperationId,
        fp,
        i.wineId,
        'correction',
        i.quantity - wine.quantity,
        i.reason.trim(),
      );
    },
    update: async (wineId, changes) => {
      const wine = wines.get(wineId);
      if (!wine) throw new WineApiError('TARGET_NOT_FOUND');
      if ('quantity' in changes) throw new WineApiError('INVALID_FIELD');
      const r = changes.personalRating;
      if (r !== undefined && r !== null && (r < 0 || r > 5))
        throw new WineApiError('RATING_OUT_OF_RANGE');
      const next = { ...wine, ...changes, updatedAt: now().toISOString() };
      wines.set(wineId, next);
      return structuredClone(next);
    },
    importFile: async (i) => {
      if (i.format !== 'pdf' && i.format !== 'text') return mockImport(i, [...wines.values()]);
      const result = mockOrderImport(i, [...wines.values()]);
      if (!i.dryRun && result.order?.check.ok) {
        auto = { running: true, total: 0, done: 0, ok: 0, failed: 0, items: [] };
        autoQueue = [];
        for (const p of result.plan) {
          const id =
            p.wineId ?? `order-${(p.catalogueCode ?? '').replace(/\W/g, '')}-${p.vintage ?? 'nv'}`;
          const prev = wines.get(id);
          const now = new Date().toISOString();
          wines.set(id, {
            ...(prev ?? structuredClone(wines.values().next().value as WineRecord)),
            ...(prev
              ? { quantity: prev.quantity + p.quantity }
              : {
                  id,
                  name: p.name,
                  producer: 'Znovín Znojmo',
                  vintage: p.vintage,
                  quantity: p.quantity,
                  purchasePrice: p.unitPrice ?? null,
                  personalRating: null,
                  personalNote: null,
                  image: null,
                  status: 'in_stock',
                  location: null,
                  source: {
                    provider: 'order-import',
                    externalProductId: p.catalogueCode ?? null,
                    batch: null,
                    sourceUrl: null,
                    fetchedAt: null,
                  },
                  createdAt: now,
                }),
            updatedAt: now,
          });
          p.wineId = id;
          autoQueue.push(id);
        }
        auto.total = autoQueue.length;
        result.autoEnrich = structuredClone(auto);
      }
      return result;
    },
    enrich: async (i) => {
      const wine = wines.get(i.wineId);
      if (!wine) throw new WineApiError('TARGET_NOT_FOUND');
      if (i.url && !ESHOP_URL.test(i.url)) throw new WineApiError('ENRICH_URL_NOT_ALLOWED');
      const changes: Partial<WineRecord> = {
        description: 'Syntetický popis z ukázkové stránky e-shopu.',
        alcoholPct: wine.alcoholPct ?? 12,
        region: wine.region ?? 'Ukázková podoblast',
      };
      const result: EnrichResult = {
        wineId: wine.id,
        facts: { catalogueCode: wine.source.externalProductId ?? 'Z 9101', alcoholPct: 12 },
        changes,
        photo: true,
        applied: i.confirm,
      };
      if (i.confirm) {
        const next: WineRecord = {
          ...wine,
          ...changes,
          image: {
            localPath: MOCK_PHOTO,
            sourceUrl: null,
            licenseStatus: 'approved',
            url: MOCK_PHOTO,
          },
          updatedAt: now().toISOString(),
        };
        wines.set(wine.id, next);
        result.wine = structuredClone(next);
      }
      return result;
    },
    enrichBatch: async (wineIds, confirm) => {
      const items: EnrichBatchResult['items'] = [];
      for (const id of wineIds) {
        const w = wines.get(id);
        if (!w) items.push({ wineId: id, ok: false, code: 'TARGET_NOT_FOUND' });
        else {
          if (confirm) await api.enrich({ wineId: id, confirm: true });
          items.push({ wineId: id, ok: true, name: w.name });
        }
      }
      return { confirm, items };
    },
    /** Mock worker: one queued wine per status poll (deterministic for tests). */
    enrichStatus: async () => {
      const id = autoQueue.shift();
      if (id !== undefined) {
        const w = wines.get(id);
        const item: AutoEnrichStatus['items'][number] = { wineId: id, ok: true, name: w?.name };
        if (w?.image) item.skipped = 'has_image';
        else await api.enrich({ wineId: id, confirm: true }).then(() => (item.photo = true));
        auto.items.push(item);
        auto.done += 1;
        auto.ok += 1;
      }
      if (!autoQueue.length) auto.running = false;
      return structuredClone(auto);
    },
    create: async (input, opId) => {
      const fp = JSON.stringify(['create', input]);
      const hit = replay(opId, fp);
      if (hit) return hit;
      if (!input.name?.trim() || !input.producer?.trim()) throw new WineApiError('INVALID_FIELD');
      if (!isNonNegativeInteger(input.quantity)) throw new WineApiError('INVALID_QUANTITY');
      if (input.ean && !normalizeEan(input.ean)) throw new WineApiError('INVALID_FIELD');
      const at = now().toISOString();
      const { quantity, source, ...fields } = input;
      const id = `new-${(++seq).toString(36)}-${opId.slice(0, 6)}`;
      const record: WineRecord = {
        id,
        vintage: null,
        grapeVarieties: [],
        country: null,
        region: null,
        sweetness: null,
        volumeMl: 750,
        alcoholPct: null,
        location: null,
        acquiredOn: null,
        purchasePrice: null,
        personalRating: null,
        personalNote: null,
        image: null,
        confidence: 'manual',
        ...fields,
        quantity: 0,
        status: 'in_stock',
        source: {
          provider: 'local',
          externalProductId: null,
          batch: null,
          sourceUrl: null,
          fetchedAt: null,
          ...source,
        },
        createdAt: at,
        updatedAt: at,
      };
      wines.set(id, record);
      const result = apply(opId, fp, id, 'stock_in', quantity, 'Naskladnění');
      if (quantity === 0) {
        const w = { ...wines.get(id)!, status: 'consumed' as const };
        wines.set(id, w);
        result.wine = structuredClone(w);
      }
      return result;
    },
    lookupProviders: async () => mockProviders(options.ai ?? false),
    lookup: async (i) => {
      if (options.latencyMs) await new Promise((r) => setTimeout(r, options.latencyMs));
      return mockLookup(i, [...wines.values()], options.ai ?? false);
    },
    setImage: async (wineId, image) => {
      const wine = wines.get(wineId);
      if (!wine) throw new WineApiError('TARGET_NOT_FOUND');
      const url = 'photo' in image ? image.photo : image.imageUrl;
      const next: WineRecord = {
        ...wine,
        image: {
          localPath: `homebrain/wine_images/${wineId}.webp`,
          sourceUrl: 'photo' in image ? null : image.imageUrl,
          licenseStatus: 'approved',
          url,
        },
        updatedAt: now().toISOString(),
      };
      wines.set(wineId, next);
      return structuredClone(next);
    },
    importVivino: async (i) => {
      const items = mockVivinoPlan(i.content, [...wines.values()]);
      const summary: VivinoImportResult['summary'] = {};
      for (const it of items) summary[it.match] = (summary[it.match] ?? 0) + 1;
      if (i.dryRun) return { dryRun: true, rows: items.length, summary, plan: items };
      let applied = 0;
      for (const a of i.accept ?? []) {
        const item = items.find((it) => it.row === a.row);
        const wine = wines.get(a.wineId);
        if (!item || !wine) continue;
        if (a.wineId !== item.wineId && !item.candidates.some((c) => c.wineId === a.wineId))
          continue;
        const changes: Partial<WineRecord> = {};
        if (item.rating !== null) changes.personalRating = item.rating;
        if (item.note) changes.personalNote = item.note;
        wines.set(a.wineId, { ...wine, ...changes, updatedAt: now().toISOString() });
        applied += 1;
      }
      return { dryRun: false, rows: items.length, summary, applied };
    },
  };
  return api;
}

/** Deterministic synthetic price history (purchase lots + weekly e-shop snapshots). */
export function mockPriceHistory(wine: WineRecord): PriceHistory {
  const base = wine.purchasePrice;
  if (base === null) return { purchases: [], shop: [] };
  const seed = [...wine.id].reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  const start = Date.parse(`${wine.acquiredOn ?? wine.createdAt.slice(0, 10)}T00:00:00Z`);
  const day = (offset: number) => new Date(start + offset * 86_400_000).toISOString().slice(0, 10);
  const purchases: PriceHistory['purchases'] = [
    { date: day(0), unitPrice: base, quantity: Math.max(1, wine.quantity), orderRef: 'a3f09c1e' },
  ];
  if (seed % 2 === 0)
    purchases.push({ date: day(70), unitPrice: base - 20, quantity: 2, orderRef: '5be21d07' });
  const shop = Array.from({ length: 8 }, (_, n) => {
    const wave = [0, 0, 10, 10, -20, -20, 0, 5][(n + seed) % 8]!;
    const point: PriceHistory['shop'][number] = { date: day(n * 14), unitPrice: base + wave };
    if (wave < 0) point.regularPrice = base;
    return point;
  });
  return { purchases, shop };
}

const ESHOP_URL = /^https:\/\/(www\.)?znovin\.cz\/e-shop\/[a-z0-9-]+$/;

/** Synthetic packshot for dev/test mocks (own drawing; real photos only live in HA). */
const MOCK_PHOTO =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 400"><rect width="300" height="400" fill="#fff"/>' +
      '<path d="M134 30h32v100c0 30 46 30 46 70v172c0 6-4 8-9 8h-106c-5 0-9-2-9-8V200c0-40 46-40 46-70Z" fill="#6c6a45"/>' +
      '<rect x="134" y="24" width="32" height="80" fill="#f2f0ec"/><rect x="104" y="220" width="92" height="120" fill="#eee9e1"/></svg>',
  );

const ORDER_ANCHOR = /Obj\.?\s*č(?:íslo|\.)\s*:?\s*([A-Z])\s*(\d{3,6})/;
const czk = (v: string) => Number(v.replace(/[\s\u00a0]/g, '').replace(',', '.'));
/** Mock twin of the integration's Znovín parser (simplified; the Python one is canonical). */
function mockOrderImport(i: ImportInput, existing: WineRecord[]): ImportResult {
  const text = i.format === 'pdf' ? '' : i.content;
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const anchors = lines.flatMap((l, n) => (ORDER_ANCHOR.test(l) ? [n] : []));
  const empty: OrderCheck = {
    ok: false,
    itemsTotal: 0,
    discounts: 0,
    fees: 0,
    orderTotal: null,
    expectedTotal: 0,
  };
  if (!anchors.length)
    return {
      dryRun: i.dryRun,
      rows: 0,
      summary: {},
      plan: [],
      errors: [{ row: 0, code: 'IMPORT_UNRECOGNISED' }],
      order: {
        recognized: false,
        vendor: null,
        itemCount: 0,
        bottles: 0,
        check: empty,
        issues: ['unrecognised'],
      },
    };
  const qty = lines.flatMap((l) => {
    const m = /^(\d+)\s*ks\s+([\d\s\u00a0]+)\s*Kč$/.exec(l);
    return m ? [{ q: Number(m[1]), total: czk(m[2] ?? '0') }] : [];
  });
  const plan: ImportPlanItem[] = anchors.map((a, n) => {
    const m = ORDER_ANCHOR.exec(lines[a] ?? '');
    const code = `${m?.[1]} ${m?.[2]}`;
    const detail = lines[a - 1] ?? '';
    const vintage = Number(/(\d{4})\s*\//.exec(detail)?.[1]) || null;
    const name = (lines[a - 2] && !/ks\s/.test(lines[a - 2] ?? '') ? lines[a - 2] : code) ?? code;
    const q = qty[n];
    const known = existing.find(
      (w) => w.source.externalProductId === code && w.vintage === vintage,
    );
    return {
      row: n + 1,
      action: known ? 'stock_in' : 'create',
      name,
      vintage,
      quantity: q?.q ?? 0,
      wineId: known?.id ?? null,
      catalogueCode: code,
      unitPrice: q ? q.total / q.q : null,
      lineTotal: q?.total ?? null,
    };
  });
  const itemsTotal = qty.reduce((sum, q) => sum + q.total, 0);
  const discounts = lines
    .filter((l) => /^-\s*[\d\s]+Kč$/.test(l))
    .reduce((sum, l) => sum + czk(l.replace(/[-Kč]/g, '')), 0);
  const totalM = /Cena celkem:?\s*([\d\s\u00a0]+)\s*Kč/.exec(text);
  const orderTotal = totalM ? czk(totalM[1] ?? '') : null;
  const ok =
    qty.length === anchors.length && orderTotal !== null && itemsTotal - discounts === orderTotal;
  const summary: ImportResult['summary'] = {};
  for (const p of plan) summary[p.action] = (summary[p.action] ?? 0) + 1;
  return {
    dryRun: i.dryRun,
    rows: plan.length,
    summary,
    plan,
    errors: [],
    order: {
      recognized: true,
      vendor: 'znovin',
      itemCount: plan.length,
      bottles: plan.reduce((sum, p) => sum + p.quantity, 0),
      check: {
        ok,
        itemsTotal,
        discounts,
        fees: 0,
        orderTotal,
        expectedTotal: itemsTotal - discounts,
      },
      issues: ok ? [] : ['arithmetic_mismatch'],
    },
  };
}

/** Dry-run planner for the mock API (no writes): mirrors server identity name+producer+vintage. */
function mockImport(i: ImportInput, existing: WineRecord[]): ImportResult {
  let rows: Array<Record<string, unknown>> = [];
  const errors: ImportResult['errors'] = [];
  try {
    if (i.format === 'json') {
      const parsed: unknown = JSON.parse(i.content);
      rows = Array.isArray(parsed) ? (parsed as Array<Record<string, unknown>>) : [];
    } else {
      const [head, ...lines] = i.content.trim().split(/\r?\n/);
      const keys = (head ?? '').split(/[;,]/).map((k) => k.trim());
      rows = lines.map((line) => {
        const cells = line.split(/[;,]/);
        return Object.fromEntries(keys.map((k, n) => [k, cells[n]?.trim() ?? '']));
      });
    }
  } catch {
    return {
      dryRun: true,
      rows: 0,
      summary: {},
      plan: [],
      errors: [{ row: 0, code: 'INVALID_FIELD' }],
    };
  }
  const key = (name: unknown, producer: unknown, vintage: unknown) =>
    `${String(name ?? '').toLowerCase()}|${String(producer ?? '').toLowerCase()}|${vintage ?? ''}`;
  const known = new Map(existing.map((w) => [key(w.name, w.producer, w.vintage), w.id]));
  const plan: ImportPlanItem[] = [];
  rows.forEach((raw, n) => {
    const name = String(raw.name ?? '').trim();
    const quantity = Number(raw.quantity ?? 0);
    const vintage = raw.vintage === '' || raw.vintage == null ? null : Number(raw.vintage);
    if (!name) return errors.push({ row: n + 1, code: 'INVALID_FIELD', field: 'name' });
    if (!Number.isInteger(quantity) || quantity < 0)
      return errors.push({ row: n + 1, code: 'INVALID_QUANTITY', field: 'quantity' });
    const wineId = known.get(key(name, raw.producer, vintage)) ?? null;
    plan.push({
      row: n + 1,
      action: wineId ? (quantity > 0 ? 'stock_in' : 'skip') : 'create',
      name,
      vintage,
      quantity,
      wineId,
    });
  });
  const summary: ImportResult['summary'] = {};
  for (const p of plan) summary[p.action] = (summary[p.action] ?? 0) + 1;
  // Mock never persists imports; it only echoes the requested mode.
  return { dryRun: i.dryRun, rows: rows.length, summary, plan, errors };
}

/* ---------------------------------------------------------------- lookup mock */

export const MIONETTO_EAN = '8006220001669';
/** Synthetic packshot of a green prosecco bottle (own drawing, no third-party photo). */
export const MOCK_PROSECCO_PHOTO =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 400"><rect width="300" height="400" fill="#fff"/>' +
      '<path d="M136 22h28v96c0 34 44 34 44 78v178c0 6-4 8-9 8h-98c-5 0-9-2-9-8V196c0-44 44-44 44-78Z" fill="#3f5b2c"/>' +
      '<path d="M134 18h32v78h-32Z" fill="#d9c27a"/><rect x="100" y="226" width="100" height="92" rx="4" fill="#f4efe2"/>' +
      '<rect x="114" y="248" width="72" height="8" fill="#1f2a44"/><rect x="122" y="266" width="56" height="5" fill="#9a8a5a"/>' +
      '<rect x="118" y="284" width="64" height="4" fill="#9a8a5a"/></svg>',
  );

function mockProviders(ai: boolean): LookupProviderInfo[] {
  return [
    { id: 'local', label: 'Vaše vinotéka', inputs: ['text', 'ean'], available: true, hint: null },
    { id: 'znovin', label: 'Znovín e-shop', inputs: ['text', 'url'], available: true, hint: null },
    {
      id: 'openfoodfacts',
      label: 'Open Food Facts',
      inputs: ['ean'],
      available: true,
      hint: null,
    },
    {
      id: 'web',
      label: 'Stránka výrobce / distributora',
      inputs: ['url'],
      available: true,
      hint: null,
    },
    {
      id: 'ai_task',
      label: 'AI v Home Assistantu',
      inputs: ['photo', 'text'],
      available: ai,
      hint: ai ? null : 'no_ai_entity',
      photo: ai,
    },
  ];
}

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

function localProposal(w: WineRecord, confidence: 'matched' | 'inferred'): LookupProposal {
  return {
    provider: 'local',
    providerLabel: 'Vaše vinotéka',
    confidence,
    fields: {
      name: w.name,
      labelName: w.labelName ?? null,
      producer: w.producer,
      vintage: w.vintage,
      color: w.color,
      wineType: w.wineType,
      grapeVarieties: w.grapeVarieties,
      region: w.region,
      country: w.country,
      ean: w.ean ?? null,
    },
    inferred: [],
    imageUrl: null,
    imageLicense: null,
    sourceUrl: null,
    externalProductId: w.source.externalProductId,
    existing: {
      wineId: w.id,
      name: w.name,
      producer: w.producer,
      vintage: w.vintage,
      quantity: w.quantity,
    },
    note: null,
  };
}

/** Mock twin of `run_lookup` (local first; EAN 8006220001669 = OFF Mionetto fixture). */
function mockLookup(i: LookupInput, wines: WineRecord[], ai: boolean): LookupResult {
  const target = i.wineId ? wines.find((w) => w.id === i.wineId) : undefined;
  if (i.wineId && !target) throw new WineApiError('TARGET_NOT_FOUND');
  let text = i.query?.trim() || null;
  let ean = i.ean?.trim() ? normalizeEan(i.ean) : null;
  if (i.ean?.trim() && !ean) throw new WineApiError('LOOKUP_EAN_INVALID');
  if (!ean && text && normalizeEan(text)) [ean, text] = [normalizeEan(text), null];
  if (target && !text && !ean && !i.url && !i.photo) {
    ean = target.ean ?? null;
    if (!ean) text = [target.producer, target.name, target.vintage].filter(Boolean).join(' ');
  }
  if (!text && !ean && !i.url && !i.photo) throw new WineApiError('LOOKUP_EMPTY');
  const providers: LookupResult['providers'] = [];
  const proposals: LookupProposal[] = [];
  const others = wines.filter((w) => w.id !== target?.id);
  const local = ean
    ? others.filter((w) => w.ean === ean).map((w) => localProposal(w, 'matched'))
    : text
      ? others
          .filter((w) =>
            fold(text!)
              .split(/\s+/)
              .filter((t) => t.length >= 3)
              .every((t) =>
                fold(`${w.name} ${w.labelName ?? ''} ${w.producer} ${w.vintage ?? ''}`).includes(t),
              ),
          )
          .slice(0, 3)
          .map((w) => localProposal(w, 'inferred'))
      : [];
  if (text || ean) {
    providers.push({ id: 'local', label: 'Vaše vinotéka', status: local.length ? 'ok' : 'empty' });
    proposals.push(...local);
  }
  if (ean && local.length && !i.photo) {
    providers.push({ id: 'openfoodfacts', label: 'Open Food Facts', status: 'skipped' });
    return withVivino({ proposals, providers });
  }
  if (ean) {
    const hit = ean === MIONETTO_EAN;
    providers.push({
      id: 'openfoodfacts',
      label: 'Open Food Facts',
      status: hit ? 'ok' : 'empty',
    });
    if (hit)
      proposals.push({
        provider: 'openfoodfacts',
        providerLabel: 'Open Food Facts',
        confidence: 'matched',
        fields: {
          name: 'Prosecco DOC Treviso',
          producer: 'Mionetto',
          ean,
          volumeMl: 750,
          country: 'Itálie',
          wineType: 'sparkling',
          region: 'Veneto',
          grapeVarieties: ['Glera'],
          color: 'white',
          sweetness: 'Brut',
          alcoholPct: 11,
        },
        inferred: ['region', 'grapeVarieties', 'color', 'sweetness'],
        imageUrl: MOCK_PROSECCO_PHOTO,
        imageLicense: 'review',
        sourceUrl: `https://world.openfoodfacts.org/product/${ean}`,
        externalProductId: ean,
        existing: null,
        note: null,
      });
  }
  if (text) {
    const zn =
      Boolean(target) || /zn|ryzlink|veltl|pálav|palav|sauvignon|rulandsk|frankovk/i.test(text);
    providers.push({ id: 'znovin', label: 'Znovín e-shop', status: zn ? 'ok' : 'empty' });
    if (zn && !target)
      proposals.push({
        provider: 'znovin',
        providerLabel: 'Znovín e-shop',
        confidence: 'matched',
        fields: {
          name: 'Ryzlink rýnský 2023',
          labelName: 'Ukázková trať',
          predicate: 'pozdní sběr',
          producer: 'Znovín Znojmo',
          vintage: 2023,
          color: 'white',
          wineType: 'still',
          grapeVarieties: ['Ryzlink rýnský'],
          country: 'Česko',
          region: 'Znojemská',
          sweetness: 'polosuché',
          alcoholPct: 12.5,
          purchasePrice: 239,
        },
        inferred: [],
        imageUrl: MOCK_PHOTO,
        imageLicense: 'review',
        sourceUrl: 'https://www.znovin.cz/e-shop/ukazkove-vino',
        externalProductId: 'Z 9101',
        existing: null,
        note: null,
      });
    if (zn && target)
      proposals.push({
        provider: 'znovin',
        providerLabel: 'Znovín e-shop',
        confidence: 'matched',
        fields: {
          name: target.name,
          producer: target.producer,
          region: target.region ?? 'Znojemská',
          alcoholPct: target.alcoholPct ?? 12,
          sweetness: target.sweetness ?? 'suché',
          description: 'Syntetický popis z ukázkové stránky e-shopu.',
          grapeVarieties: target.grapeVarieties,
        },
        inferred: [],
        imageUrl: target.image ? null : MOCK_PHOTO,
        imageLicense: target.image ? null : 'review',
        sourceUrl: 'https://www.znovin.cz/e-shop/ukazkove-vino',
        externalProductId: target.source.externalProductId ?? 'Z 9101',
        existing: null,
        note: null,
      });
  }
  if (i.url) {
    providers.push({ id: 'web', label: 'Stránka výrobce / distributora', status: 'empty' });
  }
  if (i.photo && ai) {
    providers.push({ id: 'ai_task', label: 'AI v Home Assistantu', status: 'ok', count: 1 });
    proposals.push({
      provider: 'ai_task',
      providerLabel: 'AI v Home Assistantu',
      confidence: 'inferred',
      fields: {
        name: 'Prosecco DOC Treviso',
        producer: 'Mionetto',
        wineType: 'sparkling',
        color: 'white',
        sweetness: 'Brut',
        alcoholPct: 11,
        volumeMl: 750,
        country: 'Itálie',
      },
      inferred: [
        'name',
        'producer',
        'wineType',
        'color',
        'sweetness',
        'alcoholPct',
        'volumeMl',
        'country',
      ],
      imageUrl: null,
      imageLicense: null,
      sourceUrl: null,
      externalProductId: null,
      existing: null,
      note: 'Přečteno z fotky etikety – zkontrolujte údaje.',
    });
  } else {
    providers.push({
      id: 'ai_task',
      label: 'AI v Home Assistantu',
      status: ai ? 'skipped' : 'unavailable',
    });
  }
  const rank = { matched: 0, verified: 0, inferred: 1, manual: 2 } as const;
  proposals.sort(
    (a, b) =>
      Number(a.existing === null) - Number(b.existing === null) ||
      rank[a.confidence] - rank[b.confidence],
  );
  return withVivino({ proposals, providers });
}
function withVivino(r: LookupResult): LookupResult {
  for (const p of r.proposals) p.vivinoUrl = vivinoSearchUrl(p.fields);
  return structuredClone(r);
}

/** Simplified twin of the Vivino export planner (exact = name+vintage, fuzzy = name only). */
function mockVivinoPlan(content: string, wines: WineRecord[]): VivinoPlanItem[] {
  const [head, ...lines] = content
    .replace(/^\ufeff/, '')
    .trim()
    .split(/\r?\n/);
  const cols = (head ?? '').split(',').map((h) => fold(h.trim()));
  const at = (cells: string[], ...names: string[]) => {
    const idx = cols.findIndex((c) => names.includes(c));
    return idx >= 0 ? (cells[idx] ?? '').trim() : '';
  };
  if (!cols.some((c) => c === 'wine name' || c === 'wine' || c === 'name'))
    throw new WineApiError('IMPORT_VIVINO_UNRECOGNISED');
  return lines.map((line, n) => {
    const cells = line.split(',');
    const name = at(cells, 'wine name', 'wine', 'name');
    const producer = at(cells, 'winery', 'producer') || null;
    const vintage = Number(at(cells, 'vintage')) || null;
    const rating = Number(at(cells, 'your rating', 'rating')) || null;
    const note = at(cells, 'your review', 'review', 'personal note', 'note') || null;
    const key = fold(name);
    const exact = wines.filter((w) => fold(w.name) === key && w.vintage === vintage);
    const fuzzy = wines.filter(
      (w) => !exact.includes(w) && key.length > 3 && fold(w.name).includes(key.split(' ')[0]!),
    );
    const cands = [...exact, ...fuzzy].slice(0, 3).map((w) => ({
      wineId: w.id,
      name: w.name,
      labelName: w.labelName ?? null,
      producer: w.producer,
      vintage: w.vintage,
      score: exact.includes(w) ? 1 : 0.7,
    }));
    const match: VivinoPlanItem['match'] =
      exact.length === 1 ? 'exact' : cands.length ? 'fuzzy' : 'none';
    const changes: VivinoPlanItem['changes'] = {};
    if (match !== 'none') {
      if (rating !== null) changes.personalRating = rating;
      if (note) changes.personalNote = note;
    }
    return {
      row: n + 1,
      producer,
      name,
      vintage,
      rating,
      note,
      match,
      wineId: match === 'none' ? null : cands[0]!.wineId,
      candidates: cands,
      changes,
      conflict: false,
      selected: match === 'exact',
    };
  });
}

export type WineApiFactory = (context: Partial<ModuleViewProps>) => WineApi | null;
const defaultFactory: WineApiFactory = (context) =>
  context.connection ? createWsWineApi(context.connection) : null;
let factory: WineApiFactory = defaultFactory;
export function setWineApiFactory(next: WineApiFactory | null): void {
  factory = next ?? defaultFactory;
}
export function getWineApi(context: Partial<ModuleViewProps>): WineApi | null {
  return factory(context);
}

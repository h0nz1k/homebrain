import {
  WasteCollectionEvent,
  WasteDashboardDataset,
  WasteType,
  type WasteSchedule,
} from './contract.js';

export const WASTE_TYPE_LABELS_CS: Readonly<Record<WasteType, string>> = Object.freeze({
  plastic: 'Plasty',
  paper: 'Papír',
  glass: 'Sklo',
  mixed: 'Směsný odpad',
  bio: 'Bioodpad',
  electro: 'Elektroodpad',
  hazardous: 'Nebezpečný odpad',
  bulky: 'Objemný odpad',
  other: 'Ostatní',
});

/** Oddělovač „Objemný odpad – mimořádný svoz …“: krátký název před pomlčkou, zbytek je detail. */
const NAME_SEPARATOR = /\s+[–—-]\s+/;
/** Delší krátký název už se na mobilní kartě láme do mnoha řádků verzálkami. */
export const WASTE_SHORT_LABEL_MAX = 28;

export interface WasteLabel {
  /** Krátký název pro karty, legendu a přehledy. */
  short: string;
  /** Upřesnění od obce (menší druhý řádek), `null` když není co dodat. */
  detail: string | null;
  /** Celý název od zdroje (title / aria). */
  full: string;
}

/**
 * Krátký popisek typu svozu. Obce posílají i názvy typu
 * „Objemný odpad – mimořádný svoz rozměrného vybavení domácností…“; ty se dělí na text
 * před ` – `/` - ` a detail. Dlouhé názvy bez oddělovače dostanou kanonický název typu
 * a celý text jako detail.
 */
export function wasteLabel(event: { waste_type: WasteType; display_name: string }): WasteLabel {
  const full = event.display_name.trim();
  const match = NAME_SEPARATOR.exec(full);
  if (match && match.index > 0) {
    const short = full.slice(0, match.index).trim();
    const detail = full.slice(match.index + match[0].length).trim();
    if (short.length <= WASTE_SHORT_LABEL_MAX) return { short, detail: detail || null, full };
  }
  if (full.length > WASTE_SHORT_LABEL_MAX && event.waste_type !== 'other') {
    return { short: WASTE_TYPE_LABELS_CS[event.waste_type], detail: full, full };
  }
  return { short: full, detail: null, full };
}

export interface NormalizedDataset {
  ok: boolean;
  dataset: WasteDashboardDataset;
  rejectedCount: number;
  errors: string[];
}

export function unavailableDataset(
  notice = 'Data svozu nejsou momentálně dostupná',
): WasteDashboardDataset {
  return {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    source_status: 'unavailable',
    source_updated_at: null,
    events: [],
    notices: [notice],
  };
}

export function isValidCollectionDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function toLocalDateKey(date: Date, timeZone = 'Europe/Prague'): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function nextDateKey(value: string): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function isRecord(raw: unknown): raw is Record<string, unknown> {
  return raw !== null && typeof raw === 'object' && !Array.isArray(raw);
}

/** Tolerantní hranice: opravy legacy polí a odmítání jednotlivých vadných událostí. */
export function normalizeDataset(raw: unknown): NormalizedDataset {
  const header = isRecord(raw) ? WasteDashboardDataset.safeParse({ ...raw, events: [] }) : null;
  if (!header?.success || !isRecord(raw) || !Array.isArray(raw.events)) {
    return {
      ok: false,
      dataset: unavailableDataset(),
      rejectedCount: 0,
      errors: ['Neplatný formát dat svozu'],
    };
  }

  const errors: string[] = [];
  const events = new Map<string, WasteCollectionEvent>();
  for (const item of raw.events) {
    if (!isRecord(item)) {
      errors.push('Neplatný záznam svozu');
      continue;
    }
    const wasteType = WasteType.safeParse(item.waste_type).data ?? 'other';
    const parsed = WasteCollectionEvent.safeParse({
      id: item.id,
      waste_type: wasteType,
      display_name:
        typeof item.display_name === 'string' && item.display_name.trim()
          ? item.display_name.trim()
          : wasteType === 'other'
            ? 'Ostatní odpad'
            : WASTE_TYPE_LABELS_CS[wasteType],
      collection_date: item.collection_date,
      availability: item.availability,
      ...(typeof item.last_collection_date === 'string' &&
      isValidCollectionDate(item.last_collection_date) &&
      item.last_collection_date < String(item.collection_date)
        ? { last_collection_date: item.last_collection_date }
        : {}),
      visual_token: `waste.${wasteType}`,
      source_updated_at: typeof item.source_updated_at === 'string' ? item.source_updated_at : null,
    });
    if (!parsed.success || !isValidCollectionDate(parsed.data.collection_date)) {
      errors.push('Neplatný záznam svozu');
      continue;
    }
    const event = parsed.data;
    const key = `${event.waste_type}|${event.collection_date}|${event.id}`;
    const previous = events.get(key);
    if (!previous) {
      events.set(key, event);
      continue;
    }
    const previousTime = Date.parse(previous.source_updated_at ?? '');
    const candidateTime = Date.parse(event.source_updated_at ?? '');
    const winner =
      Number.isFinite(candidateTime) &&
      (!Number.isFinite(previousTime) || candidateTime > previousTime)
        ? event
        : previous;
    events.set(key, {
      ...winner,
      availability:
        previous.availability === 'cancelled' || event.availability === 'cancelled'
          ? 'cancelled'
          : winner.availability,
    });
  }
  return {
    ok: errors.length === 0,
    dataset: {
      ...header.data,
      events: [...events.values()].sort(compareEvents),
      notices: header.data.notices.filter((notice) => notice.trim()),
    },
    rejectedCount: errors.length,
    errors,
  };
}

function compareEvents(a: WasteCollectionEvent, b: WasteCollectionEvent): number {
  return (
    a.collection_date.localeCompare(b.collection_date) ||
    a.waste_type.localeCompare(b.waste_type) ||
    a.id.localeCompare(b.id)
  );
}

/**
 * Doplní `last_collection_date` z pozorovaných termínů stejného typu (historie i plán), pokud ho
 * zdroj neposlal: poslední platný svoz před datem události.
 */
function withLastCollection(events: WasteCollectionEvent[]): WasteCollectionEvent[] {
  const datesByType = new Map<WasteType, string[]>();
  for (const event of events) {
    if (event.availability === 'cancelled' || event.availability === 'unavailable') continue;
    const dates = datesByType.get(event.waste_type) ?? [];
    dates.push(event.collection_date);
    datesByType.set(event.waste_type, dates);
  }
  return events.map((event) => {
    if (event.last_collection_date) return event;
    const previous = (datesByType.get(event.waste_type) ?? [])
      .filter((date) => date < event.collection_date)
      .sort()
      .pop();
    return previous ? { ...event, last_collection_date: previous } : event;
  });
}

/** Přijímá i výsledek normalizace, aby se zachoval počet odmítnutých záznamů. */
export function buildSchedule(
  input: WasteDashboardDataset | NormalizedDataset,
  referenceDate: string,
): WasteSchedule {
  if (!isValidCollectionDate(referenceDate)) throw new RangeError('Neplatné referenční datum');
  const dataset = 'dataset' in input ? input.dataset : input;
  const all = withLastCollection(dataset.events);
  const future = all.filter((event) => event.collection_date >= referenceDate).sort(compareEvents);
  const upcoming = future.filter(
    (event) => event.availability !== 'cancelled' && event.availability !== 'unavailable',
  );
  const past = all
    .filter(
      (event) =>
        event.collection_date < referenceDate &&
        event.availability !== 'cancelled' &&
        event.availability !== 'unavailable',
    )
    .sort(compareEvents);
  const tomorrow = nextDateKey(referenceDate);
  return {
    referenceDate,
    quality:
      dataset.source_status === 'available'
        ? 'ok'
        : dataset.source_status === 'stale'
          ? 'stale'
          : 'unavailable',
    sourceStatus: dataset.source_status,
    sourceUpdatedAt: dataset.source_updated_at,
    upcoming,
    past,
    today: upcoming.filter((event) => event.collection_date === referenceDate),
    tomorrow: upcoming.filter((event) => event.collection_date === tomorrow),
    next: upcoming[0] ?? null,
    cancelled: future.filter((event) => event.availability === 'cancelled'),
    rejectedCount: 'dataset' in input ? input.rejectedCount : 0,
    notices: [...dataset.notices],
  };
}

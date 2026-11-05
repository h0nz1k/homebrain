import { deriveQuality, type EntityStateLike } from '@homebrain/ha-client';
import {
  WasteType,
  type WasteCollectionEvent,
  type WasteDashboardDataset,
  type WasteSchedule,
} from './contract.js';
import {
  buildSchedule,
  isValidCollectionDate,
  normalizeDataset,
  toLocalDateKey,
  unavailableDataset,
  WASTE_TYPE_LABELS_CS,
} from './normalize.js';

/**
 * Podporovány jsou také logické klíče waste_next_<přípona>. `waste_history` (senzor minulých svozů)
 * čte backend integrace a frontend ho dostává hotový přes WS `homebrain/waste/history`.
 */
export const WASTE_BINDING_KEYS = ['waste_dataset', 'waste_next', 'waste_calendar'] as const;
const DEFAULT_MAX_AGE_MS = 36 * 60 * 60 * 1000;

function wasteBindings(bindings: Record<string, string>): [string, string][] {
  return Object.entries(bindings)
    .filter(
      ([key, id]) =>
        id.trim() &&
        (key === 'waste_dataset' ||
          key === 'waste_next' ||
          key === 'waste_calendar' ||
          /^waste_next_.+$/.test(key)),
    )
    .sort(([a], [b]) => a.localeCompare(b));
}

export function selectWasteEntityIds(bindings: Record<string, string>): string[] {
  return [...new Set(wasteBindings(bindings).map(([, id]) => id))];
}

/**
 * Událost z WS `calendar/event/subscribe` nebo `calendar.get_events`. HA 2026.10 vrací v obou
 * `start` jako řetězec (`YYYY-MM-DD` / ISO datetime); objekt `{date|dateTime}` (REST API) je tolerován.
 */
export interface CalendarEventLike {
  start: string | { date?: string; dateTime?: string };
  summary?: string;
  uid?: string | null;
}

/** Pozorovaný minulý svoz z WS `homebrain/waste/history` (štítek, jak ho zveřejnil zdroj). */
export interface WasteHistoryEventLike {
  date: string;
  label: string;
}

/**
 * Formáty senzoru `waste_next*`:
 * - `date-state`: stav = datum svozu, typ v atributu `waste_type`,
 * - `type-state`: stav = typ (např. „Plasty“), termíny jako klíče atributů `YYYY-MM-DD` → typ
 *   (waste_collection_schedule). Detekce podle stavu, ne podle konfigurace.
 */
export type WasteSensorFormat = 'date-state' | 'type-state' | 'invalid';

function normalizeLabel(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase();
}

const TYPE_BY_LABEL = new Map<string, WasteType>([
  ...WasteType.options.flatMap((type): [string, WasteType][] => [
    [type, type],
    [normalizeLabel(WASTE_TYPE_LABELS_CS[type]), type],
  ]),
  ['plast', 'plastic'],
  ['bio', 'bio'],
  ['smesny', 'mixed'],
  ['smes', 'mixed'],
  ['elektro', 'electro'],
  ['nebezpecny', 'hazardous'],
  ['objemny', 'bulky'],
  ['komunalni odpad', 'mixed'],
  ['smesny komunalni odpad', 'mixed'],
  ['biologicky odpad', 'bio'],
  ['barevne sklo', 'glass'],
  ['bile sklo', 'glass'],
  ['cire sklo', 'glass'],
  ['sklo barevne', 'glass'],
  ['sklo bile', 'glass'],
]);
/**
 * Záchyt pro varianty, které obce píší po svém („Plasty a nápojové kartony“, „Sběr papíru“).
 * Pořadí rozhoduje: „bioodpad“ dřív než „odpad“, „nebezpečný“ dřív než obecné typy.
 */
const TYPE_BY_STEM: readonly [RegExp, WasteType][] = [
  [/nebezp/u, 'hazardous'],
  [/elektro/u, 'electro'],
  [/objem/u, 'bulky'],
  [/sklo|skla/u, 'glass'],
  [/plast/u, 'plastic'],
  [/papir|lepenk/u, 'paper'],
  [/\bbio|zelen|kompost/u, 'bio'],
  [/komunal|smes|zbytk/u, 'mixed'],
];

/** Typ odpadu podle štítku zdroje; neznámý štítek je „other“. */
export function wasteTypeFromLabel(label: string): WasteType {
  const key = normalizeLabel(label);
  const exact = TYPE_BY_LABEL.get(key);
  if (exact) return exact;
  return TYPE_BY_STEM.find(([pattern]) => pattern.test(key))?.[1] ?? 'other';
}

/** Český název pro zobrazení; u skla a komunálního odpadu zachová variantu obce. */
export function wasteDisplayName(type: WasteType, label: string): string {
  const key = normalizeLabel(label);
  if (type === 'glass') {
    if (/barev/u.test(key)) return 'Barevné sklo';
    if (/\b(bil|cir)/u.test(key)) return 'Bílé sklo';
  }
  if (type === 'mixed' && /komunal/u.test(key)) return 'Komunální odpad';
  return type === 'other' && label.trim() ? label.trim() : WASTE_TYPE_LABELS_CS[type];
}

function sensorDate(value: string, timeZone: string): string | null {
  if (isValidCollectionDate(value)) return value;
  // Datum bez času se nesmí normalizací Date posunout na jiný den.
  if (!/^\d{4}-\d{2}-\d{2}T/.test(value) || !isValidCollectionDate(value.slice(0, 10))) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? toLocalDateKey(date, timeZone) : null;
}

function attributeDates(state: EntityStateLike): [string, string][] {
  return Object.entries(state.attributes)
    .filter(
      (entry): entry is [string, string] =>
        isValidCollectionDate(entry[0]) && typeof entry[1] === 'string' && !!entry[1].trim(),
    )
    .sort(([a], [b]) => a.localeCompare(b));
}

export function detectWasteSensorFormat(
  state: EntityStateLike,
  timeZone = 'Europe/Prague',
): WasteSensorFormat {
  if (sensorDate(state.state, timeZone)) return 'date-state';
  return attributeDates(state).length ? 'type-state' : 'invalid';
}

/** Jeden štítek může nést více typů: „Plasty, Papír“. */
function labelTypes(label: string): { type: WasteType; label: string }[] {
  const whole = TYPE_BY_LABEL.get(normalizeLabel(label));
  if (whole) return [{ type: whole, label: label.trim() }];
  return label
    .split(/[,;+]/u)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => ({ type: wasteTypeFromLabel(part), label: part }));
}

function sensorEvent(
  id: string,
  type: WasteType,
  displayName: string,
  date: string,
  updatedAt: string | null,
): WasteCollectionEvent {
  return {
    id,
    waste_type: type,
    display_name: wasteDisplayName(type, displayName),
    collection_date: date,
    availability: 'confirmed',
    visual_token: `waste.${type}`,
    source_updated_at: updatedAt,
  };
}

function calendarDate(start: CalendarEventLike['start'], timeZone: string): string | null {
  const value = typeof start === 'string' ? start : (start?.date ?? start?.dateTime);
  return typeof value === 'string' ? sensorDate(value, timeZone) : null;
}

function parseAttribute(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function worstQuality(
  a: WasteSchedule['quality'],
  b: WasteSchedule['quality'],
): WasteSchedule['quality'] {
  if (a === 'unavailable' || b === 'unavailable') return 'unavailable';
  return a === 'stale' || b === 'stale' ? 'stale' : 'ok';
}

export function adaptWasteEntities(input: {
  bindings: Record<string, string>;
  getState: (entityId: string) => EntityStateLike | undefined;
  now: number;
  timeZone?: string;
  maxAgeMs?: number;
  /** Události z `waste_calendar`; `undefined` = zatím nenačteno, `'error'` = načtení selhalo. */
  calendarEvents?: CalendarEventLike[] | 'error';
  /** Minulé svozy z WS `homebrain/waste/history`; chyba (starší backend) se jen ignoruje. */
  history?: WasteHistoryEventLike[] | 'error';
}): WasteSchedule {
  const {
    bindings,
    getState,
    now,
    timeZone = 'Europe/Prague',
    maxAgeMs = DEFAULT_MAX_AGE_MS,
    calendarEvents,
    history,
  } = input;
  const referenceDate = toLocalDateKey(new Date(now), timeZone);
  const entries = wasteBindings(bindings);
  if (!entries.length) {
    return buildSchedule(
      unavailableDataset('Není nastavena vazba na entitu odpadů'),
      referenceDate,
    );
  }

  let dataset: WasteDashboardDataset = {
    schema_version: 1,
    generated_at: new Date(now).toISOString(),
    source_status: 'available',
    source_updated_at: null,
    events: [],
    notices: [],
  };
  let quality: WasteSchedule['quality'] = 'ok';
  let rejectedCount = 0;
  const sensorEvents: WasteCollectionEvent[] = [];
  const calendarCollected: WasteCollectionEvent[] = [];
  const notices: string[] = [];
  for (const [key, entityId] of entries) {
    const state = getState(entityId);
    // Stav kalendáře (on/off) se mění jen při začátku/konci události – stáří se nehodnotí.
    const entityQuality = deriveQuality(state, {
      now,
      maxAgeMs: key === 'waste_calendar' ? Number.POSITIVE_INFINITY : maxAgeMs,
    });
    quality = worstQuality(
      quality,
      entityQuality === 'stale' ? 'stale' : entityQuality === 'ok' ? 'ok' : 'unavailable',
    );
    if (!state || state.state === 'unavailable' || state.state === 'unknown') {
      notices.push('Data svozu nejsou momentálně dostupná');
      if (key === 'waste_dataset') dataset = unavailableDataset();
      continue;
    }
    if (key === 'waste_dataset') {
      const normalized = normalizeDataset(parseAttribute(state.attributes.waste_dashboard));
      dataset = normalized.dataset;
      rejectedCount += normalized.rejectedCount;
      if (normalized.rejectedCount) notices.push('Některé neplatné záznamy svozu byly vynechány');
      continue;
    }
    if (key === 'waste_calendar') {
      if (calendarEvents === 'error') {
        notices.push('Kalendář svozů není dostupný');
        continue;
      }
      for (const event of calendarEvents ?? []) {
        const date = calendarDate(event.start, timeZone);
        if (!date || typeof event.summary !== 'string' || !event.summary.trim()) {
          rejectedCount += 1;
          continue;
        }
        for (const part of labelTypes(event.summary))
          calendarCollected.push(
            sensorEvent(
              // Bez uid stačí datum: typ+datum se níže deduplikuje, ID je stabilní.
              `${entityId}|${event.uid ?? date}|${part.type}`,
              part.type,
              part.label,
              date,
              null,
            ),
          );
      }
      continue;
    }
    const format = detectWasteSensorFormat(state, timeZone);
    if (format === 'invalid') {
      quality = 'unavailable';
      notices.push('Neplatné datum svozu');
      continue;
    }
    if (format === 'type-state') {
      for (const [date, label] of attributeDates(state))
        for (const part of labelTypes(label))
          sensorEvents.push(
            sensorEvent(
              `${entityId}|${date}|${part.type}`,
              part.type,
              part.label,
              date,
              state.last_updated,
            ),
          );
      continue;
    }
    const date = sensorDate(state.state, timeZone)!;
    const label: unknown = state.attributes.waste_type;
    const friendlyName: unknown = state.attributes.friendly_name;
    const parts = typeof label === 'string' ? labelTypes(label) : [];
    for (const part of parts.length ? parts : [{ type: 'other' as const, label: '' }])
      sensorEvents.push(
        sensorEvent(
          parts.length > 1 ? `${entityId}|${part.type}` : entityId,
          part.type,
          part.type === 'other' && typeof friendlyName === 'string' ? friendlyName : part.label,
          date,
          state.last_updated,
        ),
      );
  }
  const historyEvents: WasteCollectionEvent[] = [];
  for (const item of Array.isArray(history) ? history : []) {
    if (!item || !isValidCollectionDate(item.date) || typeof item.label !== 'string') continue;
    for (const part of labelTypes(item.label))
      historyEvents.push(
        sensorEvent(`history|${item.date}|${part.type}`, part.type, part.label, item.date, null),
      );
  }
  // Dataset má při shodě typu a data přednost, včetně zrušených termínů; historie je poslední.
  const events = [...dataset.events];
  const seen = new Set(events.map((event) => `${event.waste_type}|${event.collection_date}`));
  for (const event of [...sensorEvents, ...calendarCollected, ...historyEvents]) {
    const key = `${event.waste_type}|${event.collection_date}`;
    if (!seen.has(key)) {
      events.push(event);
      seen.add(key);
    }
  }
  const schedule = buildSchedule(
    {
      ...dataset,
      events,
      notices: [...new Set([...dataset.notices, ...notices])],
    },
    referenceDate,
  );
  return { ...schedule, quality: worstQuality(schedule.quality, quality), rejectedCount };
}

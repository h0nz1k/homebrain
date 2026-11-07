import type { WasteCollectionEvent, WasteType } from './contract.js';
import { isValidCollectionDate } from './normalize.js';

/** Datový horizont svozového kalendáře z `homebrain/waste/history` (jen pro admina). */
export interface WasteHorizon {
  status: 'empty' | 'ok' | 'ending' | 'ended';
  last_date: string | null;
  days_left: number | null;
  warn_days: number;
  warning: boolean;
  types: { label: string; last_date: string; days_left: number }[];
}

/** Výchozí práh upozornění (dní před posledním známým svozem); backend má stejný default. */
export const WASTE_HORIZON_WARN_DAYS = 30;

const STATUSES = new Set(['empty', 'ok', 'ending', 'ended']);

/** Tolerantní čtení `horizon` z odpovědi; starší backend nebo vadná data = `null`. */
export function parseWasteHorizon(value: unknown): WasteHorizon | null {
  const horizon = (value as { horizon?: unknown } | null)?.horizon as WasteHorizon | undefined;
  if (!horizon || typeof horizon !== 'object' || !STATUSES.has(horizon.status)) return null;
  if (horizon.last_date !== null && !isValidCollectionDate(horizon.last_date)) return null;
  if (horizon.days_left !== null && typeof horizon.days_left !== 'number') return null;
  if (!Array.isArray(horizon.types)) return null;
  return horizon;
}

export interface HorizonNotice {
  title: string;
  /** Kroky „Co s tím“ pro admina. */
  help: string[];
}

/** Klidné upozornění, když svozová data brzy končí nebo skončila; jinak `null`. */
export function horizonNotice(horizon: WasteHorizon | null | undefined): HorizonNotice | null {
  if (!horizon?.warning || !horizon.last_date) return null;
  if (horizon.status !== 'ending' && horizon.status !== 'ended') return null;
  const [year, month, day] = horizon.last_date.split('-').map(Number) as [number, number, number];
  // Rozpis obvykle platí na kalendářní rok: konec v prosinci = chybí příští rok.
  const next = month === 12 ? year + 1 : year;
  const verb = horizon.status === 'ended' ? 'skončil' : 'končí';
  return {
    title: `Svozový kalendář ${verb} ${day}. ${month}. – doplňte rozpis na ${next}`,
    help: [
      `Ověřte na webu obce nebo svozové firmy, že už je rozpis svozů na ${next} zveřejněný.`,
      'Obnovte zdroj kalendáře v Home Assistantu (akce waste_collection_schedule.fetch_data nebo vlastní obnova dat) – panel se pak aktualizuje sám.',
      'Upozornění zmizí samo, jakmile budou známé pozdější termíny.',
    ],
  };
}

/** Typy, které už se vyvážely, ale žádný další (nezrušený) termín zatím neznáme. */
export function typesWithoutNext(
  past: readonly WasteCollectionEvent[],
  upcoming: readonly WasteCollectionEvent[],
): Set<WasteType> {
  const planned = new Set(
    upcoming.filter((event) => event.availability !== 'cancelled').map((e) => e.waste_type),
  );
  return new Set(past.map((event) => event.waste_type).filter((type) => !planned.has(type)));
}

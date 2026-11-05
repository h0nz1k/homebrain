import { useEffect, useState } from 'react';
import type { ConnectionLike } from '@homebrain/ha-client';
import type { WasteHistoryEventLike } from './adapter.js';
import { isValidCollectionDate } from './normalize.js';

export interface WasteHistoryResponse {
  events?: unknown;
  since?: unknown;
}

/** Tolerantní čtení odpovědi `homebrain/waste/history` (vadné položky vynechá). */
export function parseWasteHistory(value: unknown): WasteHistoryEventLike[] {
  const events = (value as WasteHistoryResponse | null)?.events;
  if (!Array.isArray(events)) return [];
  return events.filter(
    (item): item is WasteHistoryEventLike =>
      !!item &&
      typeof item === 'object' &&
      typeof (item as WasteHistoryEventLike).date === 'string' &&
      isValidCollectionDate((item as WasteHistoryEventLike).date) &&
      typeof (item as WasteHistoryEventLike).label === 'string' &&
      !!(item as WasteHistoryEventLike).label.trim(),
  );
}

/**
 * Minulé svozy, které si pamatuje integrace HomeBrain (zdroje samy zveřejňují jen budoucnost).
 * Načte se při otevření panelu, po změně dne a po znovupřipojení. Starší backend bez příkazu
 * vrátí `'error'` – panel pak funguje jako dřív, jen bez „Naposledy“.
 */
export function useWasteHistory(
  connection: ConnectionLike | undefined,
  dayKey: string,
): WasteHistoryEventLike[] | 'error' | undefined {
  const [loaded, setLoaded] = useState<{
    key: string;
    events: WasteHistoryEventLike[] | 'error';
  }>();
  useEffect(() => {
    if (!connection) return;
    let active = true;
    const load = () => {
      connection.sendMessagePromise<WasteHistoryResponse>({ type: 'homebrain/waste/history' }).then(
        (result) => {
          if (active) setLoaded({ key: dayKey, events: parseWasteHistory(result) });
        },
        () => {
          if (active) setLoaded((previous) => previous ?? { key: dayKey, events: 'error' });
        },
      );
    };
    load();
    connection.addEventListener?.('ready', load);
    return () => {
      active = false;
      connection.removeEventListener?.('ready', load);
    };
  }, [connection, dayKey]);
  if (!connection) return undefined;
  return loaded?.events;
}

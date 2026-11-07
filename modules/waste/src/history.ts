import { useEffect, useState } from 'react';
import type { ConnectionLike } from '@homebrain/ha-client';
import type { WasteHistoryEventLike } from './adapter.js';
import { parseWasteHorizon, type WasteHorizon } from './horizon.js';
import { isValidCollectionDate } from './normalize.js';

export interface WasteHistoryResponse {
  events?: unknown;
  since?: unknown;
  horizon?: unknown;
}

export interface WasteHistoryData {
  events: WasteHistoryEventLike[];
  /** Datový horizont (poslední známý svoz); `null` u staršího backendu. */
  horizon: WasteHorizon | null;
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
 * Minulé svozy, které si pamatuje integrace HomeBrain (zdroje samy zveřejňují jen budoucnost),
 * a datový horizont kalendáře. Načte se při otevření panelu, po změně dne a po znovupřipojení.
 * Starší backend bez příkazu (nebo ne-admin) vrátí `'error'` – panel pak funguje jako dřív, jen
 * bez „Naposledy“ a bez upozornění na konec dat.
 */
export function useWasteHistoryData(
  connection: ConnectionLike | undefined,
  dayKey: string,
): WasteHistoryData | 'error' | undefined {
  const [loaded, setLoaded] = useState<{
    key: string;
    data: WasteHistoryData | 'error';
  }>();
  useEffect(() => {
    if (!connection) return;
    let active = true;
    const load = () => {
      connection.sendMessagePromise<WasteHistoryResponse>({ type: 'homebrain/waste/history' }).then(
        (result) => {
          if (active)
            setLoaded({
              key: dayKey,
              data: { events: parseWasteHistory(result), horizon: parseWasteHorizon(result) },
            });
        },
        () => {
          if (active) setLoaded((previous) => previous ?? { key: dayKey, data: 'error' });
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
  return loaded?.data;
}

/** Jen minulé svozy (viz `useWasteHistoryData`). */
export function useWasteHistory(
  connection: ConnectionLike | undefined,
  dayKey: string,
): WasteHistoryEventLike[] | 'error' | undefined {
  const data = useWasteHistoryData(connection, dayKey);
  return data === 'error' || data === undefined ? data : data.events;
}

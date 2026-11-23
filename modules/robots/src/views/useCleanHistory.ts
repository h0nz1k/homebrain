import { useEffect, useState } from 'react';
import type { ModuleViewProps } from '@homebrain/ha-client';
import { fetchHistory, subscribeHistory, type HistoryBySlot } from '../history.js';

/**
 * Cleaning history of all robots: loaded on open, reloaded when the integration pushes a
 * finished run and whenever a robot stops being busy (fallback for older backends).
 * `null` = not loaded (or the backend has no history yet) → the card stays hidden.
 */
export function useCleanHistory(
  connection: ModuleViewProps['connection'],
  busyKey: string,
): HistoryBySlot | null {
  const [history, setHistory] = useState<HistoryBySlot | null>(null);
  const [pushes, setPushes] = useState(0);
  useEffect(() => {
    if (!connection) return;
    let stop: (() => void) | null = null;
    let cancelled = false;
    subscribeHistory(connection, () => setPushes((n) => n + 1))
      .then((unsub) => (cancelled ? unsub() : (stop = unsub)))
      .catch(() => undefined);
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [connection]);
  useEffect(() => {
    if (!connection) return;
    let cancelled = false;
    fetchHistory(connection)
      .then((value) => !cancelled && setHistory(value))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [connection, busyKey, pushes]);
  return history;
}

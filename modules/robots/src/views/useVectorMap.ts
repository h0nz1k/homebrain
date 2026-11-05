import { useEffect, useState } from 'react';
import type { ModuleViewProps } from '@homebrain/ha-client';
import { parseVectorMap, type VectorMapResult } from '../map/geometry.js';
import { useNow } from './VectorMap.js';

export const MAP_POLL_MS = 30_000;

/** Poll period while the robot moves; dev/e2e may shorten it with `?mapapoll=<ms>`. */
export function mapPollMs(): number {
  const raw = Number(new URLSearchParams(globalThis.location?.search ?? '').get('mapapoll'));
  return Number.isFinite(raw) && raw >= 1000 ? Math.min(raw, 120_000) : MAP_POLL_MS;
}

export async function fetchVectorMap(
  connection: NonNullable<ModuleViewProps['connection']>,
  slot: number,
): Promise<VectorMapResult> {
  const message = { type: 'homebrain/robots/map', slot };
  const response = await connection.sendMessagePromise<unknown>(message);
  return parseVectorMap(response);
}

/**
 * Vector map of one robot: loaded on open, whenever the map image entity changes (HA
 * refreshes it every ~30 s while cleaning) and polled while the robot moves.
 * `null` = still loading; the last good map is kept if a refresh fails.
 */
export function useVectorMap(
  connection: ModuleViewProps['connection'],
  slot: number,
  stamp: string | null,
  moving: boolean,
  enabled: boolean,
): VectorMapResult | null {
  const [result, setResult] = useState<VectorMapResult | null>(null);
  const tick = useNow(mapPollMs(), moving && enabled);
  useEffect(() => {
    if (!connection || !enabled) return;
    let cancelled = false;
    fetchVectorMap(connection, slot)
      .then((next) => {
        if (cancelled) return;
        setResult((prev) => (!next.available && prev?.available ? prev : next));
      })
      .catch(() => {
        if (!cancelled)
          setResult((prev) => (prev?.available ? prev : { available: false, reason: 'ws_error' }));
      });
    return () => {
      cancelled = true;
    };
  }, [connection, slot, stamp, tick, enabled]);
  return connection && enabled ? result : { available: false, reason: 'disabled' };
}

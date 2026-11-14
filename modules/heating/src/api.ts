import type { ConnectionLike } from '@homebrain/ha-client';
import {
  COUNTER_KEYS,
  type HeatingHistory,
  type HeatingChangeEntry,
  type HeatingSeason,
  type HeatingSnapshot,
  type HistoryKey,
  type HistoryPoint,
  type HistoryRange,
  type WireHeatingHistory,
} from './types.js';

export interface HeatingApi {
  get(): Promise<HeatingSnapshot>;
  history(range: HistoryRange, keys: HistoryKey[]): Promise<HeatingHistory>;
  seasons(): Promise<HeatingSeason[]>;
  changes?(): Promise<HeatingChangeEntry[]>;
  /** Push of the `get` payload on change; returns unsubscribe. */
  subscribe?(onSnapshot: (snap: HeatingSnapshot) => void): () => void;
}

/**
 * Wire history → chart points. Measurement buckets without a mean are gaps (dropped);
 * counter series (`[ts, change, null, null]`) keep the change as the value with min = max = value.
 * Unknown keys are dropped, so a newer backend cannot break the charts.
 */
export function normalizeHistory(raw: WireHeatingHistory, wanted: HistoryKey[]): HeatingHistory {
  const keys = new Set<string>(wanted);
  return {
    range: raw.range,
    resolution: raw.resolution,
    series: (raw.series ?? [])
      .filter((s) => keys.has(s.key))
      .map((s) => {
        const counter = COUNTER_KEYS.has(s.key);
        const points: HistoryPoint[] = [];
        for (const [ts, v, lo, hi] of s.points ?? []) {
          if (v === null || !Number.isFinite(v)) continue;
          points.push(counter ? [ts, Math.max(0, v), v, v] : [ts, v, lo ?? v, hi ?? v]);
        }
        return { key: s.key as HistoryKey, unit: s.unit, points };
      }),
    runs: raw.runs ?? [],
    annotations: raw.annotations ?? [],
  };
}

export function createWsHeatingApi(connection: ConnectionLike): HeatingApi {
  const call = <R>(type: string, extra: Record<string, unknown> = {}) =>
    connection.sendMessagePromise<R>({ type, ...extra } as { type: string });
  const api: HeatingApi = {
    get: () => call<HeatingSnapshot>('homebrain/heating/get'),
    history: (range, keys) =>
      call<WireHeatingHistory>('homebrain/heating/history', { range, keys }).then((h) =>
        normalizeHistory(h, keys),
      ),
    seasons: () => call<HeatingSeason[]>('homebrain/heating/seasons'),
    changes: () => call<HeatingChangeEntry[]>('homebrain/heating/changes'),
  };
  if (connection.subscribeMessage) {
    const subscribeMessage = connection.subscribeMessage.bind(connection);
    api.subscribe = (onSnapshot) => {
      let unsub: (() => Promise<void> | void) | null = null;
      let closed = false;
      subscribeMessage<HeatingSnapshot>(onSnapshot, { type: 'homebrain/heating/subscribe' }).then(
        (u) => {
          if (closed) void u();
          else unsub = u;
        },
        () => {
          /* not allowed (kiosk) or old backend: polling `get` still works */
        },
      );
      return () => {
        closed = true;
        void unsub?.();
      };
    };
  }
  return api;
}

export type HeatingApiFactory = (connection: ConnectionLike | undefined) => HeatingApi | null;
let factory: HeatingApiFactory = (connection) =>
  connection ? createWsHeatingApi(connection) : null;

/** Dev/tests replace the WS client with the synthetic heat pump (`createMockHeatingApi`). */
export function setHeatingApiFactory(next: HeatingApiFactory): void {
  factory = next;
}

export function getHeatingApi(connection: ConnectionLike | undefined): HeatingApi | null {
  return factory(connection);
}

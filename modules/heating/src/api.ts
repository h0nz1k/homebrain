import type { ConnectionLike } from '@homebrain/ha-client';
import type {
  HeatingHistory,
  HeatingSeason,
  HeatingSnapshot,
  HistoryKey,
  HistoryRange,
} from './types.js';

export interface HeatingApi {
  get(): Promise<HeatingSnapshot>;
  history(range: HistoryRange, keys: HistoryKey[]): Promise<HeatingHistory>;
  seasons(): Promise<HeatingSeason[]>;
  /** Push of the `get` payload on change; returns unsubscribe. */
  subscribe?(onSnapshot: (snap: HeatingSnapshot) => void): () => void;
}

export function createWsHeatingApi(connection: ConnectionLike): HeatingApi {
  const call = <R>(type: string, extra: Record<string, unknown> = {}) =>
    connection.sendMessagePromise<R>({ type, ...extra } as { type: string });
  return {
    get: () => call<HeatingSnapshot>('homebrain/heating/get'),
    history: (range, keys) => call<HeatingHistory>('homebrain/heating/history', { range, keys }),
    seasons: () => call<HeatingSeason[]>('homebrain/heating/seasons'),
  };
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

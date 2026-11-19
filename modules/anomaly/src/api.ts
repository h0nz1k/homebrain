import type { ConnectionLike } from '@homebrain/ha-client';
import type { AnomalySnapshot } from './types.js';

export type AckKind = 'resolved' | 'ok';

/** Read API plus the owner actions; the actions only change HomeBrain's own state. */
export interface AnomalyApi {
  list(): Promise<AnomalySnapshot>;
  summary(): Promise<AnomalySnapshot>;
  ack(key: string, kind: AckKind): Promise<void>;
  mute(key: string, days?: number): Promise<void>;
  unmute(key: string): Promise<void>;
}

export function createWsAnomalyApi(connection: ConnectionLike): AnomalyApi {
  const call = <T>(type: string, extra: Record<string, unknown> = {}) =>
    connection.sendMessagePromise<T>({ type, ...extra } as { type: string });
  return {
    list: () => call<AnomalySnapshot>('homebrain/anomaly/list'),
    summary: () => call<AnomalySnapshot>('homebrain/anomaly/summary'),
    ack: async (key, kind) => {
      await call('homebrain/anomaly/ack', { key, kind });
    },
    mute: async (key, days = 7) => {
      await call('homebrain/anomaly/mute', { key, days });
    },
    unmute: async (key) => {
      await call('homebrain/anomaly/unmute', { key });
    },
  };
}

export type AnomalyApiFactory = (connection: ConnectionLike | undefined) => AnomalyApi | null;
let factory: AnomalyApiFactory = (connection) =>
  connection ? createWsAnomalyApi(connection) : null;

/** Dev/tests replace the WS client with the synthetic house (`createMockAnomalyApi`). */
export function setAnomalyApiFactory(next: AnomalyApiFactory): void {
  factory = next;
}

export function getAnomalyApi(connection: ConnectionLike | undefined): AnomalyApi | null {
  return factory(connection);
}

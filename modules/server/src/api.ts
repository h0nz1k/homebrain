import type { ConnectionLike } from '@homebrain/ha-client';
import type { ServerHistory, ServerSnapshot } from './types.js';

/** One Proxmox guest (history of its own CPU % and RAM %). */
export interface GuestRef {
  vmid: number;
  kind: 'vm' | 'ct';
}

export interface ServerApi {
  get(): Promise<ServerSnapshot>;
  history(hours?: number, guest?: GuestRef): Promise<ServerHistory>;
}

export function createWsServerApi(connection: ConnectionLike): ServerApi {
  const call = <T>(type: string, extra: Record<string, unknown> = {}) =>
    connection.sendMessagePromise<T>({ type, ...extra } as { type: string });
  return {
    get: () => call<ServerSnapshot>('homebrain/server/get'),
    history: (hours = 24, guest?: GuestRef) =>
      call<ServerHistory>('homebrain/server/history', guest ? { hours, guest } : { hours }),
  };
}

export type ServerApiFactory = (connection: ConnectionLike | undefined) => ServerApi | null;
let factory: ServerApiFactory = (connection) => (connection ? createWsServerApi(connection) : null);

/** Dev/tests replace the WS client with the synthetic server (`createMockServerApi`). */
export function setServerApiFactory(next: ServerApiFactory): void {
  factory = next;
}

export function getServerApi(connection: ConnectionLike | undefined): ServerApi | null {
  return factory(connection);
}

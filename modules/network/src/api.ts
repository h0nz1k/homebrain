import { getSession, type ConnectionLike } from '@homebrain/ha-client';
import type { GuestQr, NetRole, NetSettings, NetSnapshot, NetSummary } from './types.js';

export interface NetworkApi {
  role(): Promise<NetRole>;
  get(): Promise<NetSnapshot>;
  summary(): Promise<NetSummary>;
  guestQr(): Promise<GuestQr>;
  settings(): Promise<NetSettings>;
  saveSettings(patch: Partial<NetSettings>): Promise<NetSettings>;
}

export function createWsNetworkApi(connection: ConnectionLike): NetworkApi {
  const call = <T>(type: string, extra: Record<string, unknown> = {}) =>
    connection.sendMessagePromise<T>({ type, ...extra } as { type: string });
  return {
    role: async () => {
      const session = await getSession(connection);
      // Without a session answer keep the restrictive default (summary only).
      return session ? (session.isAdmin ? 'owner' : session.role) : 'guest';
    },
    get: () => call<NetSnapshot>('homebrain/network/get'),
    summary: () => call<NetSummary>('homebrain/network/summary'),
    guestQr: () => call<GuestQr>('homebrain/network/guest_qr'),
    settings: () => call<NetSettings>('homebrain/network/settings/get'),
    saveSettings: (patch) => call<NetSettings>('homebrain/network/settings/set', patch),
  };
}

export type NetworkApiFactory = (connection: ConnectionLike | undefined) => NetworkApi | null;
let factory: NetworkApiFactory = (connection) =>
  connection ? createWsNetworkApi(connection) : null;

/** Dev/tests replace the WS client with the synthetic network (`createMockNetworkApi`). */
export function setNetworkApiFactory(next: NetworkApiFactory): void {
  factory = next;
}

export function getNetworkApi(connection: ConnectionLike | undefined): NetworkApi | null {
  return factory(connection);
}

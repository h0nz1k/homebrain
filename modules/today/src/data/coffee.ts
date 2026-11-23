import type { ConnectionLike } from '@homebrain/ha-client';

export type CoffeeBlock = 'not_configured' | 'script_missing' | 'tv_off' | 'cooldown';
export type CoffeeResult =
  { ok: true; reason: null } | { ok: false; reason: CoffeeBlock | 'send_failed' };

export interface CoffeeApi {
  subscribe(onStatus: (reason: CoffeeBlock | null) => void): () => void;
  invite(): Promise<CoffeeResult>;
}

type CoffeeApiFactory = (connection: ConnectionLike | undefined) => CoffeeApi | null;

let factory: CoffeeApiFactory = (connection) => {
  if (!connection?.subscribeMessage) return null;
  const subscribeMessage = connection.subscribeMessage.bind(connection);
  return {
    subscribe(onStatus) {
      let stopped = false;
      const subscription = subscribeMessage<{ reason: CoffeeBlock | null }>(
        ({ reason }) => {
          if (!stopped) onStatus(reason);
        },
        { type: 'homebrain/today/coffee/subscribe' },
      ).catch(() => undefined);
      return () => {
        stopped = true;
        void subscription.then((unsubscribe) => unsubscribe?.()).catch(() => undefined);
      };
    },
    invite: () =>
      connection.connected === false
        ? Promise.resolve({ ok: false, reason: 'send_failed' })
        : connection.sendMessagePromise({ type: 'homebrain/today/coffee/invite' }),
  };
};

export function getCoffeeApi(connection: ConnectionLike | undefined): CoffeeApi | null {
  return factory(connection);
}

export function setCoffeeApiFactory(next: CoffeeApiFactory): void {
  factory = next;
}

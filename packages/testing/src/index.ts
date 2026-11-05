import type { EntityStateLike, HassLike } from '@homebrain/ha-client';

export function createMockConnection(
  responses: Record<string, unknown> = {
    'homebrain/bindings/get': {
      waste: {
        waste_dataset: 'sensor.demo_waste_dataset',
        waste_next: 'sensor.demo_waste_next',
      },
      wine: {
        wine_cellar_temperature: 'sensor.demo_wine_cellar_temperature',
        wine_cellar_humidity: 'sensor.demo_wine_cellar_humidity',
        wine_zone_1_temperature: 'sensor.demo_wine_zone_1_temperature',
        wine_zone_1_target: 'sensor.demo_wine_zone_1_target',
        wine_zone_2_temperature: 'sensor.demo_wine_zone_2_temperature',
        wine_zone_2_target: 'sensor.demo_wine_zone_2_target',
      },
    },
  },
) {
  const serviceCalls: Array<{ domain: string; service: string; data?: Record<string, unknown> }> =
    [];
  const listeners = new Map<string, Set<() => void>>();
  return {
    connected: true,
    serviceCalls,
    async sendMessagePromise<T>(message: { type: string }): Promise<T> {
      if (!(message.type in responses)) throw new Error('Neznámý testovací příkaz.');
      const response = responses[message.type];
      return (typeof response === 'function' ? response(message) : response) as T;
    },
    async subscribeMessage<T>(callback: (message: T) => void, message: { type: string }) {
      if (!(message.type in responses)) throw new Error('Neznámý testovací příkaz.');
      callback(responses[message.type] as T);
      return () => {};
    },
    async subscribeEvents(callback?: (event: unknown) => void, eventType?: string) {
      void callback;
      void eventType;
      return () => {};
    },
    async callService(domain: string, service: string, data?: Record<string, unknown>) {
      serviceCalls.push({ domain, service, data });
    },
    addEventListener(event: string, listener: () => void) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(listener);
    },
    removeEventListener(event: string, listener: () => void) {
      listeners.get(event)?.delete(listener);
    },
    emit(event: 'ready' | 'disconnected') {
      this.connected = event === 'ready';
      for (const listener of listeners.get(event) ?? []) listener();
    },
  };
}
export function createFakeHass(states: Record<string, EntityStateLike> = {}): HassLike {
  return {
    connection: createMockConnection(),
    states,
    user: { id: 'demo', name: 'Ukázkový uživatel', is_admin: true },
    language: 'cs',
  };
}

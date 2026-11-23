import { setCoffeeApiFactory, type CoffeeApi, type CoffeeBlock } from './coffee.js';

export function installCoffeeFixtures(search: string): void {
  const scenario = new URLSearchParams(search).get('coffee');
  if (!scenario) return;

  let reason: CoffeeBlock | null =
    scenario === 'off'
      ? 'tv_off'
      : scenario === 'missing'
        ? 'script_missing'
        : scenario === 'hidden'
          ? 'not_configured'
          : null;
  const listeners = new Set<(reason: CoffeeBlock | null) => void>();
  const publish = (next: CoffeeBlock | null) => {
    reason = next;
    listeners.forEach((listener) => listener(reason));
  };
  const mock: CoffeeApi = {
    subscribe(onStatus) {
      listeners.add(onStatus);
      onStatus(reason);
      return () => listeners.delete(onStatus);
    },
    async invite() {
      if (reason) return { ok: false, reason };
      publish('cooldown');
      setTimeout(() => publish(null), 30_000);
      return scenario === 'error'
        ? { ok: false, reason: 'send_failed' }
        : { ok: true, reason: null };
    },
  };
  setCoffeeApiFactory(() => mock);
}

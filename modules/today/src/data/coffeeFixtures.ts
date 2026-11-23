import { setCoffeeApiFactory, type CoffeeApi, type CoffeeStatus } from './coffee.js';

export function installCoffeeFixtures(search: string): void {
  const scenario = new URLSearchParams(search).get('coffee');
  if (!scenario) return;

  let status: CoffeeStatus = {
    reason:
      scenario === 'off'
        ? 'tv_off'
        : scenario === 'missing'
          ? 'script_missing'
          : scenario === 'hidden'
            ? 'not_configured'
            : null,
  };
  const listeners = new Set<(status: CoffeeStatus) => void>();
  const publish = (next: CoffeeStatus) => {
    status = next;
    listeners.forEach((listener) => listener(status));
  };
  function startCooldown() {
    publish({ reason: 'cooldown', cooldown_until: new Date(Date.now() + 30_000).toISOString() });
    return setTimeout(() => publish({ reason: null, cooldown_until: null }), 30_000);
  }
  if (scenario === 'cooldown') startCooldown();

  const mock: CoffeeApi = {
    subscribe(onStatus) {
      listeners.add(onStatus);
      onStatus(status);
      return () => listeners.delete(onStatus);
    },
    async invite() {
      if (status.reason) return { ok: false, reason: status.reason };
      const timer = startCooldown();
      if (scenario === 'error') {
        clearTimeout(timer);
        publish({ reason: null, cooldown_until: null });
        return { ok: false, reason: 'send_failed' };
      }
      return { ok: true, reason: null };
    },
  };
  setCoffeeApiFactory(() => mock);
}

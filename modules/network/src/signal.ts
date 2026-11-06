import type { ConnectionLike } from '@homebrain/ha-client';
import type { Signal } from '@homebrain/signals';
import { getNetworkApi } from './api.js';
import type { NetSummary } from './types.js';

export const NETWORK_PATH = '/homebrain-sit';
const POLL_MS = 60_000;

/** Dnes card for a network problem (adults, kiosk): headline only, no device list. [] when OK. */
export function networkSignals(summary: NetSummary | null, now: number): Signal[] {
  if (!summary || summary.status !== 'problem') return [];
  const critical = summary.severity === 'critical';
  const more = summary.problems_count > 1 ? ` (+${summary.problems_count - 1} další)` : '';
  return [
    {
      id: 'network.status',
      module: 'network',
      kind: 'state',
      severity: critical ? 'warning' : 'notice',
      tone: 'risk',
      relevance: critical ? 0.8 : 0.45,
      valid_from: new Date(now - 60_000).toISOString(),
      valid_to: new Date(now + 15 * 60_000).toISOString(),
      title: `Síť · ${summary.headline}${more}`,
      context: summary.internet_online === false ? 'Internet nejde.' : 'Detail v modulu Síť.',
      action: { type: 'navigate', label: 'Síť', href: NETWORK_PATH },
      source: { name: 'Síť', updated_at: new Date(now).toISOString(), stale_after_s: 600 },
    },
  ];
}

export interface NetworkSignalFeed {
  subscribe: (cb: (signals: Signal[]) => void) => () => void;
}

/** Dnes signal source: polls `homebrain/network/summary` (allowed for adults and the kiosk). */
export function networkTodaySignalSource(context: {
  connection?: ConnectionLike;
}): NetworkSignalFeed | null {
  const api = getNetworkApi(context.connection);
  if (!api) return null;
  return {
    subscribe(cb) {
      let alive = true;
      const tick = () =>
        api.summary().then(
          (s) => alive && cb(networkSignals(s, Date.now())),
          () => alive && cb([]),
        );
      void tick();
      const timer = setInterval(() => void tick(), POLL_MS);
      return () => {
        alive = false;
        clearInterval(timer);
      };
    },
  };
}

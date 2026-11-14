import type { ConnectionLike } from '@homebrain/ha-client';
import type { Signal } from '@homebrain/signals';
import { getHeatingApi } from './api.js';
import type { HeatingAlert, HeatingSnapshot } from './types.js';

export const HEATING_PATH = '/homebrain-topeni';
const POLL_MS = 60_000;

const SEV: Record<HeatingAlert['severity'], number> = { critical: 0, warning: 1, info: 2 };

/** Highest-severity active alert → one Dnes signal (nothing for info-only / no alerts). */
export function heatingSignals(snap: HeatingSnapshot | null, now: number): Signal[] {
  const alerts = snap?.alerts ?? [];
  const top = [...alerts].sort((a, b) => SEV[a.severity] - SEV[b.severity])[0];
  if (!top || top.severity === 'info') return [];
  return [
    {
      id: `heating.${top.id}`,
      module: 'heating',
      kind: 'state',
      severity: top.severity === 'critical' ? 'warning' : 'notice',
      tone: 'risk',
      relevance: top.severity === 'critical' ? 0.85 : 0.5,
      valid_from: new Date(now - 60_000).toISOString(),
      valid_to: new Date(now + 30 * 60_000).toISOString(),
      title: `Topení · ${top.title}`,
      context: top.body,
      action: { type: 'navigate', label: 'Topení', href: HEATING_PATH },
      source: {
        name: 'Topení',
        updated_at: snap?.updated_at ?? new Date(now).toISOString(),
        stale_after_s: 600,
      },
    },
  ];
}

export interface HeatingSignalFeed {
  subscribe: (cb: (signals: Signal[]) => void) => () => void;
}

export function heatingTodaySignalSource(
  context: { connection?: ConnectionLike } = {},
): HeatingSignalFeed | null {
  const api = getHeatingApi(context.connection);
  if (!api) return null;
  return {
    subscribe(cb) {
      let alive = true;
      const tick = () =>
        api.get().then(
          (s) => alive && cb(heatingSignals(s, Date.now())),
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
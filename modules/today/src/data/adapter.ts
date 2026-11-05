import type { Signal } from '@homebrain/signals';
import type { StateKey, TodayData } from './types.js';
import { FIXTURES, fixtureFor } from './fixtures.js';

export type TodayAdapter = {
  subscribe: (cb: (data: TodayData) => void) => () => void;
  get: () => TodayData;
};

export type MockAdapterOptions = {
  /** Extra waste (or other) signals merged by id (later wins). */
  wasteSignals?: Signal[];
  /** Dev/e2e only: pretend the last HA update is this many seconds old (stale indicator). */
  haAgeS?: number;
};

const STATE_KEYS: StateKey[] = ['a', 'a-night', 'b', 'c', 'd'];

export function stateFromUrl(search: string): StateKey {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const raw = params.get('state') ?? 'a';
  if ((STATE_KEYS as string[]).includes(raw)) return raw as StateKey;
  return 'a';
}

export function mergeSignals(base: Signal[], extra?: Signal[]): Signal[] {
  if (!extra?.length) return base;
  const byId = new Map<string, Signal>();
  for (const signal of base) byId.set(signal.id, signal);
  for (const signal of extra) byId.set(signal.id, signal);
  return [...byId.values()];
}

export function createMockAdapter(state: StateKey, opts: MockAdapterOptions = {}): TodayAdapter {
  let current = fixtureFor(state);
  current = {
    ...current,
    signals: mergeSignals(current.signals, opts.wasteSignals),
  };
  if (opts.haAgeS !== undefined && Number.isFinite(opts.haAgeS))
    current.ha = {
      ...current.ha,
      updatedAt: new Date(Date.parse(current.now) - opts.haAgeS * 1000).toISOString(),
    };
  const listeners = new Set<(data: TodayData) => void>();

  return {
    get: () => current,
    subscribe: (cb) => {
      listeners.add(cb);
      cb(current);
      return () => listeners.delete(cb);
    },
  };
}

export function listFixtureStates(): StateKey[] {
  return [...STATE_KEYS];
}

export { FIXTURES };

import type { ModuleViewProps } from '@homebrain/ha-client';
import type { Signal } from '@homebrain/signals';
import type { TodayAdapter } from './adapter.js';
import { mergeSignals } from './adapter.js';
import type { TodayData } from './types.js';

/** Live stream of Dnes signals produced by another module (e.g. weather). */
export interface TodaySignalFeed {
  subscribe: (cb: (signals: Signal[]) => void) => () => void;
}

/**
 * Factory registered by the panel. Returns null when the module has no data
 * source in this context (e.g. no HA connection) – never fixture data.
 */
export type TodaySignalSource = (context?: Partial<ModuleViewProps>) => TodaySignalFeed | null;

const sources = new Map<string, TodaySignalSource>();

/** Register a signal source; `module` is the Signal.module value the source owns. */
export function registerTodaySignalSource(module: string, source: TodaySignalSource): void {
  sources.set(module, source);
}

export function clearTodaySignalSources(): void {
  sources.clear();
}

export function resolveTodaySignalFeeds(
  context?: Partial<ModuleViewProps>,
): Map<string, TodaySignalFeed> {
  const feeds = new Map<string, TodaySignalFeed>();
  for (const [module, source] of sources) {
    const feed = source(context);
    if (feed) feeds.set(module, feed);
  }
  return feeds;
}

/**
 * Merge live module feeds into a base adapter. Once a feed has emitted, it owns
 * its module: base signals with the same `module` are dropped (no duplicates
 * between fixture/placeholder and live data).
 */
export function withSignalFeeds(
  base: TodayAdapter,
  feeds: Map<string, TodaySignalFeed>,
): TodayAdapter {
  if (feeds.size === 0) return base;
  const live = new Map<string, Signal[]>();
  const combine = (data: TodayData): TodayData => {
    if (live.size === 0) return data;
    const kept = data.signals.filter((s) => !live.has(s.module));
    return { ...data, signals: mergeSignals(kept, [...live.values()].flat()) };
  };
  return {
    get: () => combine(base.get()),
    subscribe: (cb) => {
      let latest = base.get();
      const unsubBase = base.subscribe((data) => {
        latest = data;
        cb(combine(data));
      });
      const unsubs = [...feeds].map(([module, feed]) =>
        feed.subscribe((signals) => {
          live.set(module, signals);
          cb(combine(latest));
        }),
      );
      return () => {
        unsubBase();
        unsubs.forEach((u) => u());
      };
    },
  };
}

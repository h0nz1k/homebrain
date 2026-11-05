import { afterEach, describe, expect, it } from 'vitest';
import type { Signal } from '@homebrain/signals';
import { createMockAdapter } from './adapter.js';
import {
  clearTodaySignalSources,
  registerTodaySignalSource,
  resolveTodaySignalFeeds,
  withSignalFeeds,
  type TodaySignalFeed,
} from './signalSources.js';
import type { TodayData } from './types.js';

const live: Signal = {
  id: 'weather.frost',
  module: 'weather',
  kind: 'event',
  severity: 'warning',
  relevance: 0.6,
  valid_from: '2026-10-31T22:00:00+01:00',
  valid_to: '2026-11-01T02:00:00+01:00',
  title: 'Mráz v noci (živá data)',
  context: '',
  source: {
    name: 'Počasí · HomeBrain',
    updated_at: '2026-10-31T10:00:00+01:00',
    stale_after_s: 900,
  },
};

function manualFeed() {
  let emit: (s: Signal[]) => void = () => {};
  const feed: TodaySignalFeed = {
    subscribe: (cb) => {
      emit = cb;
      return () => {
        emit = () => {};
      };
    },
  };
  return { feed, emit: (s: Signal[]) => emit(s) };
}

afterEach(() => clearTodaySignalSources());

describe('withSignalFeeds', () => {
  it('returns base adapter untouched when no feeds', () => {
    const base = createMockAdapter('a');
    expect(withSignalFeeds(base, new Map())).toBe(base);
  });

  it('keeps base signals until a feed emits, then the feed owns its module', () => {
    const base = createMockAdapter('a');
    const { feed, emit } = manualFeed();
    const adapter = withSignalFeeds(base, new Map([['weather', feed]]));
    const seen: TodayData[] = [];
    const unsub = adapter.subscribe((d) => seen.push(d));
    expect(seen[0]!.signals).toEqual(base.get().signals);
    emit([live]);
    const last = seen.at(-1)!;
    const weather = last.signals.filter((s) => s.module === 'weather');
    expect(weather).toEqual([live]);
    expect(last.signals.filter((s) => s.module !== 'weather')).toEqual(
      base.get().signals.filter((s) => s.module !== 'weather'),
    );
    expect(adapter.get().signals).toContainEqual(live);
    emit([]);
    expect(seen.at(-1)!.signals.some((s) => s.module === 'weather')).toBe(false);
    unsub();
  });
});

describe('registry', () => {
  it('skips sources that return null and passes the context', () => {
    const contexts: unknown[] = [];
    registerTodaySignalSource('weather', (ctx) => {
      contexts.push(ctx);
      return manualFeed().feed;
    });
    registerTodaySignalSource('energy', () => null);
    const feeds = resolveTodaySignalFeeds({ bindings: {} });
    expect([...feeds.keys()]).toEqual(['weather']);
    expect(contexts).toEqual([{ bindings: {} }]);
  });
});

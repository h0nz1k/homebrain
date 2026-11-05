import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Signal } from '@homebrain/signals';
import { createMockWeatherAdapter, setWeatherAdapterFactory, createWsAdapter } from './adapter.js';
import { createWeatherSignalFeed, weatherTodaySignalSource } from './signalFeed.js';

afterEach(() => {
  setWeatherAdapterFactory((c) => (c ? createWsAdapter(c) : null));
  vi.useRealTimers();
});

describe('createWeatherSignalFeed', () => {
  it('emits weather signals from the adapter snapshot', async () => {
    const seen: Signal[][] = [];
    const unsub = createWeatherSignalFeed(createMockWeatherAdapter('default')).subscribe((s) =>
      seen.push(s),
    );
    await vi.waitFor(() => expect(seen.length).toBe(1));
    expect(seen[0]!.length).toBeGreaterThan(0);
    expect(seen[0]!.every((s) => s.module === 'weather')).toBe(true);
    unsub();
  });

  it('emits [] on fetch error and polls with pollMs', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn().mockRejectedValue(new Error('down'));
    const seen: Signal[][] = [];
    const unsub = createWeatherSignalFeed({ fetch, pollMs: 1000 }).subscribe((s) => seen.push(s));
    await vi.advanceTimersByTimeAsync(0);
    expect(seen).toEqual([[]]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetch).toHaveBeenCalledTimes(2);
    unsub();
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

describe('weatherTodaySignalSource', () => {
  it('returns null without a connection in production mode', () => {
    expect(weatherTodaySignalSource()).toBeNull();
  });
  it('uses the integration WS when a connection is supplied', () => {
    const connection = { sendMessagePromise: vi.fn(), callService: vi.fn() };
    expect(weatherTodaySignalSource({ connection: connection as never })).not.toBeNull();
  });
});

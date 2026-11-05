import type { ConnectionLike } from '@homebrain/ha-client';
import type { Signal } from '@homebrain/signals';
import { getWeatherAdapter, type WeatherAdapter } from './adapter.js';
import { weatherSignals } from './signals.js';

/** Structurally matches TodaySignalFeed in @homebrain/module-today (no import cycle). */
export interface WeatherSignalFeed {
  subscribe: (cb: (signals: Signal[]) => void) => () => void;
}

/**
 * Polls the weather adapter and emits Dnes signals. On error emits [] (no
 * stale/fixture substitution); ranking marks missing data via source freshness.
 */
export function createWeatherSignalFeed(adapter: WeatherAdapter): WeatherSignalFeed {
  return {
    subscribe: (cb) => {
      let active = true;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const tick = async () => {
        try {
          const snapshot = await adapter.fetch();
          if (active) cb(weatherSignals(snapshot, Date.now()));
        } catch {
          if (active) cb([]);
        }
        if (active && adapter.pollMs > 0) timer = setTimeout(() => void tick(), adapter.pollMs);
      };
      void tick();
      return () => {
        active = false;
        if (timer) clearTimeout(timer);
      };
    },
  };
}

/** Dnes signal source: registered by the panel via registerTodaySignalSource('weather', …). */
export function weatherTodaySignalSource(context?: {
  connection?: ConnectionLike;
}): WeatherSignalFeed | null {
  const adapter = getWeatherAdapter(context?.connection);
  return adapter ? createWeatherSignalFeed(adapter) : null;
}

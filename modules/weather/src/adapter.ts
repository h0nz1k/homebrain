import type { ConnectionLike } from '@homebrain/ha-client';
import { isWeatherSnapshot, type WeatherSnapshot } from './contract.js';
import { buildMockSnapshot, mockRadarImage, type WeatherScenario } from './fixtures.js';

export type WeatherState =
  | { kind: 'loading' }
  | { kind: 'ready'; data: WeatherSnapshot; receivedAt: number }
  | { kind: 'error'; message: string };

export interface WeatherAdapter {
  fetch: () => Promise<WeatherSnapshot>;
  /** Refresh period in ms (backend caches; this only re-reads the snapshot). */
  pollMs: number;
  /** Resolve a radar frame path to an <img> URL (signed HA path; data URL in mocks). */
  radarImage?: (path: string) => Promise<string>;
}

export function createWsAdapter(connection: ConnectionLike): WeatherAdapter {
  return {
    pollMs: 60_000,
    fetch: async () => {
      const result = await connection.sendMessagePromise<unknown>({
        type: 'homebrain/weather/get',
      });
      if (!isWeatherSnapshot(result)) throw new Error('Neplatná odpověď integrace');
      return result;
    },
    // <img> cannot send the bearer token: ask HA for a short-lived signed path.
    radarImage: async (path) => {
      const message = { type: 'auth/sign_path', path, expires: 600 };
      const signed = await connection.sendMessagePromise<{ path: string }>(message);
      return signed.path;
    },
  };
}

export function createMockWeatherAdapter(scenario: WeatherScenario = 'default'): WeatherAdapter {
  return {
    pollMs: 0,
    fetch: () => Promise.resolve(buildMockSnapshot(scenario)),
    radarImage: (path) => Promise.resolve(mockRadarImage(path)),
  };
}

export function scenarioFromUrl(search: string): WeatherScenario {
  const raw = new URLSearchParams(search).get('weather');
  return raw === 'stale' || raw === 'calm' || raw === 'unavailable' || raw === 'storm'
    ? raw
    : 'default';
}

export type WeatherAdapterFactory = (connection?: ConnectionLike) => WeatherAdapter | null;
/** Production default: only the integration WS; never substitute fixture data. */
let factory: WeatherAdapterFactory = (connection) =>
  connection ? createWsAdapter(connection) : null;
export function setWeatherAdapterFactory(next: WeatherAdapterFactory): void {
  factory = next;
}
export function getWeatherAdapter(connection?: ConnectionLike): WeatherAdapter | null {
  return factory(connection);
}

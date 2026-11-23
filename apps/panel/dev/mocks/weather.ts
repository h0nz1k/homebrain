import {
  buildMockSnapshot,
  createMockWeatherAdapter,
  scenarioFromUrl,
  setWeatherAdapterFactory,
} from '@homebrain/module-weather';
import type { WsHandlers } from './shared.js';

/** Dev server only: synthetic weather snapshot (production uses the integration WS). */
export function registerWeatherMocks(): void {
  setWeatherAdapterFactory(() => createMockWeatherAdapter(scenarioFromUrl(location.search)));
}

export function weatherHandlers(): WsHandlers {
  return {
    // Live Dnes reads the integration snapshot over WS (synthetic, fixed MOCK_NOW day).
    'homebrain/weather/get': () => buildMockSnapshot(scenarioFromUrl(location.search)),
  };
}

import { createMockWineApi, createSyntheticWines, setWineApiFactory } from '@homebrain/module-wine';
import type { DevHass } from './shared.js';

export function registerWineMocks(): void {
  // `?wineai=1`: pretend HA has an ai_task entity (production has none yet → unavailable hint).
  const wineApi = createMockWineApi(createSyntheticWines(), undefined, {
    ai: new URLSearchParams(location.search).get('wineai') === '1',
    latencyMs: 350,
  });
  setWineApiFactory(() => wineApi);
}

/** Cellar sensors and fridge zones; `?cellar=<°C>` overrides the cellar temperature. */
export function addWineStates({ hass, now }: DevHass) {
  const cellarTemp = new URLSearchParams(location.search).get('cellar') ?? '16.4';
  hass.states['sensor.demo_wine_cellar_temperature'] = {
    entity_id: 'sensor.demo_wine_cellar_temperature',
    state: cellarTemp,
    last_updated: now.toISOString(),
    attributes: { unit_of_measurement: '°C' },
  };
  hass.states['sensor.demo_wine_cellar_humidity'] = {
    entity_id: 'sensor.demo_wine_cellar_humidity',
    state: '68',
    last_updated: now.toISOString(),
    attributes: { unit_of_measurement: '%' },
  };
  // Syntetické zóny chladničky (Haier není v HA – v produkci bez bindingu „nenakonfigurováno“).
  for (const [id, value] of [
    ['zone_1_temperature', '11.8'],
    ['zone_1_target', '12'],
    ['zone_2_temperature', '15.6'],
    ['zone_2_target', '16'],
  ] as const) {
    hass.states[`sensor.demo_wine_${id}`] = {
      entity_id: `sensor.demo_wine_${id}`,
      state: value,
      last_updated: now.toISOString(),
      attributes: { unit_of_measurement: '°C' },
    };
  }
  return {
    bindings: {
      wine_cellar_temperature: 'sensor.demo_wine_cellar_temperature',
      wine_cellar_humidity: 'sensor.demo_wine_cellar_humidity',
      wine_zone_1_temperature: 'sensor.demo_wine_zone_1_temperature',
      wine_zone_1_target: 'sensor.demo_wine_zone_1_target',
      wine_zone_2_temperature: 'sensor.demo_wine_zone_2_temperature',
      wine_zone_2_target: 'sensor.demo_wine_zone_2_target',
    },
  };
}

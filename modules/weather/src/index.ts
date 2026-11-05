export const moduleManifest = {
  id: 'weather',
  titleCs: 'Počasí',
  icon: 'mdi:weather-partly-cloudy',
  phase: 1,
} as const;

export const loadView = () => import('./views/WeatherView.js');

export * from './contract.js';
export * from './adapter.js';
export * from './fixtures.js';
export * from './signals.js';
export * from './signalFeed.js';

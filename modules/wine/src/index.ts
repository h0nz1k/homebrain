export const moduleManifest = {
  id: 'wine',
  titleCs: 'Vinotéka',
  icon: 'mdi:glass-wine',
  phase: 3,
} as const;

export const loadView = () => import('./views/WineView.js');
export * from './domain/index.js';
export * from './filters.js';
export { createMockWineApi, createWsWineApi, setWineApiFactory, WineApiError } from './api.js';
export type { MockWineOptions, WineApi, WineApiFactory, WriteResult } from './api.js';
export * from './lookup.js';
export { createSyntheticWines } from './mock.js';
export { deriveWineSignals, temperatureRange, humidityRange } from './signals.js';

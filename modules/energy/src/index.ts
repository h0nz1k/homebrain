export const moduleManifest = {
  id: 'energy',
  titleCs: 'Energie',
  icon: 'mdi:lightning-bolt',
  phase: 2,
} as const;

export const loadView = () => import('./views/EnergyView.js');

export * from './contract.js';
export * from './adapter.js';
export * from './signals.js';
export * from './appliances.js';
export * from './pvForecast.js';
export * from './costs.js';
export * from './fixtures.js';
export * from './flow.js';
export * from './phases.js';
export * from './compare.js';

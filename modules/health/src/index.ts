export const moduleManifest = {
  id: 'health',
  titleCs: 'Zdraví',
  icon: 'mdi:heart-pulse',
  phase: 3,
} as const;

export const loadView = () => import('./views/HealthView.js');

export * from './contract.js';
export * from './adapter.js';
export * from './signals.js';
export * from './fixtures.js';

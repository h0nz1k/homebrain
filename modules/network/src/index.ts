export const moduleManifest = {
  id: 'network',
  titleCs: 'Síť',
  icon: 'mdi:wifi',
  phase: 1,
} as const;

export const loadView = () => import('./views/NetworkView.js');

export * from './types.js';
export * from './api.js';
export * from './format.js';
export * from './mock.js';
export * from './topoLayout.js';
export * from './signal.js';

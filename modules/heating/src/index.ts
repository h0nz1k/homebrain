export const moduleManifest = {
  id: 'heating',
  titleCs: 'Topení',
  icon: 'mdi:heat-pump',
  phase: 1,
} as const;

export const loadView = () => import('./views/HeatingView.js');

export * from './types.js';
export * from './api.js';
export * from './model.js';
export * from './mock.js';
export * from './signal.js';

export const moduleManifest = {
  id: 'agents',
  titleCs: 'Agenti',
  icon: 'mdi:robot-outline',
  phase: 1,
} as const;

export const loadView = () => import('./views/AgentsView.js');

export * from './types.js';
export * from './api.js';
export * from './format.js';
export * from './mock.js';

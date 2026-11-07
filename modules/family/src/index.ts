export const moduleManifest = {
  id: 'family',
  titleCs: 'Rodina',
  icon: 'mdi:account-group',
  phase: 4,
} as const;

export const loadView = () => import('./views/FamilyView.js');

export * from './types.js';
export * from './api.js';
export * from './format.js';
export * from './mock.js';

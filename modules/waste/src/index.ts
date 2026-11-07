export const moduleManifest = {
  id: 'waste',
  titleCs: 'Odpady',
  icon: 'mdi:trash-can',
  phase: 1,
} as const;

export const loadView = () => import('./views/WasteView.js');

export * from './contract.js';
export * from './normalize.js';
export * from './adapter.js';
export * from './calendar.js';
export * from './history.js';
export * from './horizon.js';

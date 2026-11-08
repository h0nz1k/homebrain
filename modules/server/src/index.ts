export const moduleManifest = {
  id: 'server',
  titleCs: 'Server',
  icon: 'mdi:server',
  phase: 1,
} as const;

export const loadView = () => import('./views/ServerView.js');

export * from './types.js';
export * from './api.js';
export * from './format.js';
export * from './mock.js';

export const moduleManifest = {
  id: 'anomaly',
  titleCs: 'Hlídání domu',
  icon: 'mdi:shield-home',
  phase: 1,
} as const;

export const loadView = () => import('./views/AnomalyView.js');

export * from './types.js';
export * from './api.js';
export * from './copy.js';
export * from './mock.js';
export {
  AnomalyWatchCard,
  ANOMALY_PATH,
  type WatchCardProps,
  type WatchLevel,
} from './views/WatchCard.js';

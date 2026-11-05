export const moduleManifest = {
  id: 'today',
  titleCs: 'Dnes',
  icon: 'mdi:view-dashboard',
  phase: 1,
} as const;

export const loadView = () => import('./views/TodayView.js');

export {
  setTodayAdapterFactory,
  getTodayAdapterFactory,
  createTodayAdapter,
  isKioskRoute,
} from './views/runtime.js';
export type { TodayAdapter } from './data/adapter.js';
export type { TodayData, RibbonKind, WeatherIcon } from './data/types.js';
export type { TodayAdapterFactory } from './views/runtime.js';
export { createMockAdapter, stateFromUrl } from './data/adapter.js';
export {
  registerTodaySignalSource,
  clearTodaySignalSources,
  withSignalFeeds,
} from './data/signalSources.js';
export type { TodaySignalFeed, TodaySignalSource } from './data/signalSources.js';

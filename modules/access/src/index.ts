export const moduleManifest = {
  id: 'access',
  titleCs: 'Přístup',
  icon: 'mdi:fingerprint',
  phase: 3,
} as const;

export const loadView = () => import('./views/AccessView.js');
export * from './types.js';
export * from './domain.js';
export * from './progress.js';
export { ENTITY_DEFAULTS as ENTITY_DEFAULTS_ACCESS } from './entities.js';
export {
  createMockAccessApi,
  createWsAccessApi,
  getAccessApi,
  setAccessApiFactory,
  AccessApiError,
  createSyntheticUsers,
} from './api.js';
export type { AccessApi, AccessApiFactory, MockAccessApi, MockAccessOptions } from './api.js';

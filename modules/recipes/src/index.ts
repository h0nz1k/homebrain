export const moduleManifest = {
  id: 'recipes',
  titleCs: 'Recepty',
  icon: 'mdi:chef-hat',
  phase: 3,
} as const;

export const loadView = () => import('./views/RecipesView.js');
export * from './types.js';
export * from './domain/scale.js';
export * from './domain/timers.js';
export * from './domain/music.js';
export * from './domain/airfryer.js';
export * from './domain/fryerLive.js';
export * from './fryerSignal.js';
export * from './domain/eggs.js';
export { recipesTimersTodaySignalSource, timerSignals, TIMERS_PATH } from './timersSignal.js';
export {
  createMockRecipesApi,
  createWsRecipesApi,
  getRecipesApi,
  setRecipesApiFactory,
  RecipesApiError,
} from './api.js';
export type { RecipesApi, RecipesApiFactory, MockRecipesOptions } from './api.js';
export { createSyntheticRecipes, fryerDemoStates, plateArt } from './mock.js';
export type { FryerDemoScenario } from './mock.js';

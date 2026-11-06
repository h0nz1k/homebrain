export const moduleManifest = {
  id: 'robots',
  titleCs: 'Roboti',
  icon: 'mdi:robot-vacuum',
  phase: 1,
} as const;

export const loadView = () => import('./views/RobotsView.js');

export * from './errors.js';
export * from './status.js';
export * from './consumables.js';
export * from './rooms.js';
export * from './commands.js';
export * from './model.js';
export * from './demo.js';
export * from './map/geometry.js';
export * from './map/motion.js';
export { demoVectorMap, type DemoScene } from './map/demo.js';

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
export * from './presets.js';
export * from './schedules.js';
export * from './model.js';
export * from './demo.js';
export * from './map/geometry.js';
export * from './map/motion.js';
export { demoVectorMap, narrowRoomMap, type DemoScene } from './map/demo.js';
export { createRobotsUiMemoryDemo, ROBOTS_UI_STORAGE_KEY } from './uiMemory.js';
export { roomIconKind, type RoomIconKind } from './roomIcons.js';

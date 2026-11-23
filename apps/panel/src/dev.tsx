// Dev server entry (index.html → /src/dev.tsx). The production bundle starts at src/index.ts and
// never imports this file or ../dev/mocks. Each module's synthetic data lives in
// ../dev/mocks/<module>.ts; this file only wires them up in a fixed order.
import { createFakeHass, createMockConnection } from '@homebrain/testing';
import { installHaRouter } from '../dev/haRouter.js';
import { addAccessDemo } from '../dev/mocks/access.js';
import { registerAnomalyMocks } from '../dev/mocks/anomaly.js';
import { addEnergyDemo } from '../dev/mocks/energy.js';
import { registerFamilyMocks } from '../dev/mocks/family.js';
import { addHealthDemo } from '../dev/mocks/health.js';
import { registerHeatingMocks } from '../dev/mocks/heating.js';
import { registerNetworkMocks } from '../dev/mocks/network.js';
import { registerPeopleMocks } from '../dev/mocks/people.js';
import { addRecipesStates, registerRecipesMocks } from '../dev/mocks/recipes.js';
import { addRobotsDemo } from '../dev/mocks/robots.js';
import { registerServerMocks } from '../dev/mocks/server.js';
import { devQuery, type DevHass } from '../dev/mocks/shared.js';
import { communicationHandlers, devSessionHandlers } from '../dev/mocks/shell.js';
import { addTodayStates, registerTodayMocks } from '../dev/mocks/today.js';
import { addWasteDemo } from '../dev/mocks/waste.js';
import { registerWeatherMocks, weatherHandlers } from '../dev/mocks/weather.js';
import { addWineStates, registerWineMocks } from '../dev/mocks/wine.js';
import { defineHomebrainPanel, HomebrainPanel } from './host';
import { kitchenMock } from './kitchen/mock';

// 1) API factories of the modules (before the panel exists). Dnes first: it clears the Dnes
//    signal sources, Recepty then registers the airfryer signal and the kitchen timers.
registerTodayMocks();
registerWineMocks();
registerPeopleMocks();
registerRecipesMocks();
registerNetworkMocks();
registerServerMocks();
registerAnomalyMocks();
registerHeatingMocks();
registerFamilyMocks();
registerWeatherMocks();

defineHomebrainPanel();
const panel = document.createElement('homebrain-panel') as HomebrainPanel;
const router = installHaRouter(panel);

// 2) Fake `hass`: entity states (insertion order = module order below) and the WS connection.
const demoHass = createFakeHass();
const dev: DevHass = {
  hass: demoHass,
  now: new Date(),
  refresh: () => {
    panel.hass = { ...demoHass, states: { ...demoHass.states } };
  },
};
const waste = addWasteDemo(dev);
const health = addHealthDemo(dev);
addRecipesStates(dev);
const wine = addWineStates(dev);
const energy = addEnergyDemo(dev);
const robots = addRobotsDemo(dev);
addTodayStates(dev);
demoHass.connection = createMockConnection({
  ...communicationHandlers(),
  ...kitchenMock(devQuery),
  ...devSessionHandlers(),
  ...weatherHandlers(),
  ...robots.handlers,
  ...energy.handlers,
  call_service: (message: unknown) => {
    energy.onCallService(message);
    robots.onCallService(message);
    return { context: { id: 'demo' } };
  },
  'homebrain/bindings/get': {
    waste: waste.bindings,
    energy: energy.bindings,
    health: health.bindings,
    robots: robots.bindings,
    wine: wine.bindings,
  },
  // Energie i Zdraví čtou recorder/history: rozdělit podle ID entit.
  'recorder/statistics_during_period': (message: Parameters<typeof energy.demo.statistics>[0]) =>
    health.owns(message.statistic_ids)
      ? health.demo.statistics(message as Parameters<typeof health.demo.statistics>[0])
      : energy.demo.statistics(message),
  'recorder/statistic_during_period': (message: Parameters<typeof energy.demo.statistic>[0]) =>
    energy.demo.statistic(message),
  'history/history_during_period': (message: Parameters<typeof energy.demo.history>[0]) =>
    health.owns(message.entity_ids)
      ? health.demo.history(message as Parameters<typeof health.demo.history>[0])
      : energy.demo.history(message),
});
const wasteSources = waste.sourceScenario();
if (wasteSources)
  demoHass.connection = createMockConnection({ ...kitchenMock(devQuery), ...wasteSources });
addAccessDemo(dev);

// 3) Theme, narrow layout, mount.
const theme = new URLSearchParams(location.search).get('theme');
demoHass.themes = { darkMode: theme !== 'light' };
panel.hass = demoHass;
const media = window.matchMedia('(max-width: 600px)');
const resize = () => {
  panel.narrow = media.matches;
};
media.addEventListener('change', resize);
resize();
router.mount();

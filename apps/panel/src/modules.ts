import { lazy } from 'react';
import * as today from '@homebrain/module-today';
import * as weather from '@homebrain/module-weather';
import * as energy from '@homebrain/module-energy';
import * as waste from '@homebrain/module-waste';
import * as health from '@homebrain/module-health';
import * as wine from '@homebrain/module-wine';
import * as family from '@homebrain/module-family';
import * as robots from '@homebrain/module-robots';
import * as recipes from '@homebrain/module-recipes';
import * as access from '@homebrain/module-access';
import * as network from '@homebrain/module-network';
import * as server from '@homebrain/module-server';
import * as heating from '@homebrain/module-heating';
import { createLiveTodayAdapter } from './today/liveAdapter';
// Dnes: live HA data (connection state, station, sun, hourly blend, day ribbon). dev.tsx may
// replace it with fixtures; production never does.
today.setTodayAdapterFactory((context) => createLiveTodayAdapter(context));
// Dnes: live weather signals (integration WS; null without HA connection).
today.registerTodaySignalSource('weather', weather.weatherTodaySignalSource);
// Dnes: appliance notices („Myčka dokončila“). Registered under its own key so the feed does
// not take over other energy signals (withSignalFeeds drops base signals of the feed's key).
today.registerTodaySignalSource('energy.appliances', energy.energyAppliancesTodaySignalSource);
// Dnes: live airfryer (entity store; hidden while the fryer is off).
today.registerTodaySignalSource('recipes', recipes.recipesFryerTodaySignalSource);
// Dnes: running kitchen timers (Minutky), own key so other recipes signals stay untouched.
today.registerTodaySignalSource('recipes.timers', recipes.recipesTimersTodaySignalSource);
// Dnes: network problem headline (adults + kitchen kiosk get only this summary).
today.registerTodaySignalSource('network', network.networkTodaySignalSource);
today.registerTodaySignalSource('heating', heating.heatingTodaySignalSource);
const standardModules = [
  today,
  weather,
  energy,
  heating,
  waste,
  robots,
  health,
  wine,
  recipes,
  family,
  access,
  network,
  server,
].map((module) => ({
  ...module.moduleManifest,
  View: lazy(module.loadView),
}));

export const modules = [
  ...standardModules,
  {
    id: 'kitchen',
    titleCs: 'Kuchyň',
    icon: 'mdi:countertop',
    phase: 3,
    View: lazy(() => import('./kitchen/KitchenView')),
  },
];

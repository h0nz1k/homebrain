import { registerTodaySignalSource } from '@homebrain/module-today';
import {
  createMockRecipesApi,
  fryerDemoStates,
  recipesFryerTodaySignalSource,
  setRecipesApiFactory,
  type FryerDemoScenario,
} from '@homebrain/module-recipes';
import { installDevKitchenTimers } from '../../src/devTimers';
import { devQuery, type DemoState, type DevHass } from './shared.js';

const fryerPage = () => devQuery.get('friteza') || location.pathname.includes('homebrain-kuchyn');
// `?fryerlive=<scenario>`: live airfryer card in Recepty + Dnes signal (synthetic entities).
const fryerLive = () =>
  (devQuery.get('fryerlive') ??
    (devQuery.get('cooking') === 'active' ? 'cooking' : null)) as FryerDemoScenario | null;

/**
 * Recepty: synthetic recipes; `?music=1` / `?fryer=1` pretend the kitchen tablet + airfryer are
 * configured (device calls are only logged by the mock, nothing is sent anywhere).
 * Also the Dnes airfryer signal and the kitchen timers (after registerTodayMocks cleared Dnes).
 */
export function registerRecipesMocks(): void {
  const recipesApi = createMockRecipesApi(undefined, {
    music: devQuery.get('music') === '1',
    airfryer: devQuery.get('fryer') === '1',
    // `?friteza=1`: Fritéza page (manual start, favourites); `&role=child|kiosk` = status only.
    fryer: fryerPage()
      ? {
          canControl: !['child', 'kiosk'].includes(
            devQuery.get('session') ?? devQuery.get('role') ?? '',
          ),
          favourites:
            devQuery.get('friteza') === 'prazdne'
              ? []
              : [
                  {
                    id: 'demo-fries',
                    name: 'Hranolky',
                    temperature: 200,
                    minutes: 18,
                    air_speed: 2,
                    probe_temperature: null,
                  },
                  {
                    id: 'demo-chicken',
                    name: 'Kuřecí stehna',
                    temperature: 180,
                    minutes: 25,
                    air_speed: 2,
                    probe_temperature: 75,
                  },
                ],
        }
      : undefined,
    // Mock "server" timers shared across tabs (two tabs = two devices).
    timerStorage: localStorage,
    log: ((window as unknown as { __hbRecipesLog?: unknown[] }).__hbRecipesLog = []) as Array<{
      kind: string;
      payload: unknown;
    }>,
  });
  setRecipesApiFactory(() => recipesApi);
  if (fryerLive()) registerTodaySignalSource('recipes', recipesFryerTodaySignalSource);
  // `?timers=1|demo`: kitchen timers on Dnes (demo = three synthetic running timers).
  if (devQuery.get('cooking') === 'active') {
    devQuery.set('timers', '1');
  }
  installDevKitchenTimers(recipesApi, devQuery);
}

/** Tablet media session (Companion sensor) + airfryer drawer/remaining. */
export function addRecipesStates({ hass }: DevHass): void {
  hass.states['sensor.demo_tablet_media_session'] = {
    entity_id: 'sensor.demo_tablet_media_session',
    state: 'Playing',
    attributes: {
      title: 'Kitchen Jazz Mix',
      artist: 'Syntetický playlist',
      playback_state: 'Playing',
    },
    last_changed: new Date().toISOString(),
    last_updated: new Date().toISOString(),
    context: { id: 'demo', parent_id: null, user_id: null },
  } as DemoState;
  hass.states['binary_sensor.demo_fryer_drawer'] = {
    ...hass.states['sensor.demo_tablet_media_session']!,
    entity_id: 'binary_sensor.demo_fryer_drawer',
    state: devQuery.get('drawer') ?? 'off',
    attributes: { device_class: 'door' },
  };
  const live = fryerLive();
  if (live) Object.assign(hass.states, fryerDemoStates(live, new Date()));
  else if (fryerPage()) {
    Object.assign(hass.states, fryerDemoStates('off', new Date()));
    hass.states['binary_sensor.demo_fryer_drawer']!.state = devQuery.get('drawer') ?? 'off';
  }
}

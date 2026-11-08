import { createHealthDemo, type HealthScenario } from '@homebrain/module-health';
import {
  createMockNetworkApi,
  setNetworkApiFactory,
  type NetRole,
  type NetworkScenario,
} from '@homebrain/module-network';
import {
  createMockServerApi,
  setServerApiFactory,
  type ServerScenario,
} from '@homebrain/module-server';
import {
  createMockFamilyApi,
  setFamilyApiFactory,
  type FamilyRole,
} from '@homebrain/module-family';
import {
  clearTodaySignalSources,
  registerTodaySignalSource,
  createMockAdapter,
  createMockHomeApi,
  createMockCookingSource,
  setCookingSourceFactory,
  type CookingScenario,
  setTodayAdapterFactory,
  setTodayHomeApiFactory,
  type HomeRole,
  stateFromUrl,
} from '@homebrain/module-today';
import {
  buildMockSnapshot,
  createMockWeatherAdapter,
  scenarioFromUrl,
  setWeatherAdapterFactory,
} from '@homebrain/module-weather';
import {
  applyFlowScenario,
  FLOW_SCENARIOS,
  type FlowScenario,
  createCompareDemo,
  createInvoicesDemo,
  createOffersDemo,
  createEnergyDemo,
  type CompareScenario,
  createPvForecastDemo,
  type DishwasherScenario,
  type EnergyScenario,
  type PvForecastScenario,
} from '@homebrain/module-energy';
import {
  KIOSK_PANEL_PATH,
  LEGACY_PANEL_PATH,
  PANEL_PATHS_BY_MODULE,
  SETTINGS_PANEL_PATH,
  setPeopleSourceFactory,
  type PersonPresence,
} from '@homebrain/ha-client';
import { createFakeHass, createMockConnection } from '@homebrain/testing';
import {
  buildRobot,
  createPresetsDemo,
  createSchedulesDemo,
  createRobotsDemo,
  demoVectorMap,
  type DemoScene,
  type RobotsScenario,
} from '@homebrain/module-robots';
import { createMockWineApi, createSyntheticWines, setWineApiFactory } from '@homebrain/module-wine';
import {
  createMockRecipesApi,
  fryerDemoStates,
  recipesFryerTodaySignalSource,
  setRecipesApiFactory,
  type FryerDemoScenario,
} from '@homebrain/module-recipes';
import {
  createMockAccessApi,
  setAccessApiFactory,
  ENTITY_DEFAULTS_ACCESS,
} from '@homebrain/module-access';
import { defineHomebrainPanel, HomebrainPanel } from './host';
import { installDevKitchenTimers } from './devTimers';
const agoIsoDev = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
const haAge = new URLSearchParams(location.search).get('ha_age');
// `?live=1`: keep the production live Dnes adapter (modules.ts) on top of the fake HA connection
// below, instead of the Dnes fixtures.
const live = new URLSearchParams(location.search).get('live') === '1';
if (!live)
  setTodayAdapterFactory(() =>
    createMockAdapter(stateFromUrl(location.search), {
      haAgeS: haAge === null ? undefined : Number(haAge),
    }),
  );
// `?wineai=1`: pretend HA has an ai_task entity (production has none yet → unavailable hint).
const wineApi = createMockWineApi(createSyntheticWines(), undefined, {
  ai: new URLSearchParams(location.search).get('wineai') === '1',
  latencyMs: 350,
});
setWineApiFactory(() => wineApi);
// Recepty: synthetic recipes; `?music=1` / `?fryer=1` pretend the kitchen tablet + airfryer are
// configured (device calls are only logged by the mock, nothing is sent anywhere).
const recipesQuery = new URLSearchParams(location.search);
// Kdo je doma: synthetic household (dev mock only). `?lide=none|home` (default mixed);
// `window.__hbPeople.set(id, status)` flips one person live (e2e: push without reload).
const lide = recipesQuery.get('lide');
const peopleNow: PersonPresence[] =
  lide === 'none'
    ? []
    : (
        [
          ['jan', 'Jan', 'blue', 'home'],
          ['maminka', 'Mamínka', 'pink', 'home'],
          ['adamek', 'Adámek', 'teal', 'away'],
          ['valinka', 'Valinka', 'purple', 'home'],
          ['babi', 'Babi', 'amber', 'away'],
          ['deda', 'Děda', 'indigo', 'unknown'],
        ] as const
      ).map(([id, name, color, status]) => ({
        id: `person.${id}`,
        name,
        color,
        status: lide === 'home' ? 'home' : status,
      }));
const peopleListeners = new Set<(people: PersonPresence[]) => void>();
let peopleState = peopleNow;
(window as unknown as { __hbPeople?: unknown }).__hbPeople = {
  set(id: string, status: PersonPresence['status']) {
    peopleState = peopleState.map((p) => (p.id === id ? { ...p, status } : p));
    peopleListeners.forEach((fn) => fn(peopleState));
  },
};
setPeopleSourceFactory(() => ({
  subscribe(onPeople) {
    peopleListeners.add(onPeople);
    onPeople(peopleState);
    return () => peopleListeners.delete(onPeople);
  },
}));
const recipesApi = createMockRecipesApi(undefined, {
  music: recipesQuery.get('music') === '1',
  airfryer: recipesQuery.get('fryer') === '1',
  // Mock "server" timers shared across tabs (two tabs = two devices).
  timerStorage: localStorage,
  log: ((window as unknown as { __hbRecipesLog?: unknown[] }).__hbRecipesLog = []) as Array<{
    kind: string;
    payload: unknown;
  }>,
});
setRecipesApiFactory(() => recipesApi);
// Síť: synthetic house (7 APs, 3 switches). `?sit=problems|ok|down|empty`, `?role=adult|kiosk`
// (summary only), `?hoste=0` = guest Wi-Fi not set up yet.
const networkApi = createMockNetworkApi({
  scenario: (recipesQuery.get('sit') as NetworkScenario | null) ?? 'problems',
  role: (recipesQuery.get('role') as NetRole | null) ?? 'owner',
  guest: recipesQuery.get('hoste') !== '0',
  // `?unifi=1` = V2: own read-only UniFi account configured (ports, signal, channels).
  unifi: recipesQuery.get('unifi') === '1',
});
setNetworkApiFactory(() => networkApi);
// Server: synthetic Proxmox host with 4 VMs. `?server=ok|warn|crit|down|unconfigured|noapi|apidown`.
const serverApi = createMockServerApi({
  scenario: (recipesQuery.get('server') as ServerScenario | null) ?? 'ok',
});
setServerApiFactory(() => serverApi);
// Rodina: synthetic household („Dcera“, „Syn“). `?role=adult|child|kiosk`, `?rodina=empty`.
const familyApi = createMockFamilyApi({
  role: (recipesQuery.get('role') as FamilyRole | null) ?? 'owner',
  scenario: recipesQuery.get('rodina') === 'empty' ? 'empty' : 'full',
});
(window as unknown as { __hbFamilyLog?: unknown[] }).__hbFamilyLog = familyApi.log;
setFamilyApiFactory(() => familyApi);
// Dnes „Co se dnes vaří“ + kids' chores: `?jidlo=empty` = nothing planned, no kids;
// `?jidlo=none` = Mealie not installed (no meals tile at all).
const jidlo = recipesQuery.get('jidlo');
// Dnes „Maso v troubě“ (MEATER): `?maso=1|2|4` active probes (2 = one „Sundat z tepla“).
const maso = recipesQuery.get('maso');
setCookingSourceFactory(() =>
  createMockCookingSource(
    maso === '1' || maso === '2' || maso === '4' ? (maso as CookingScenario) : 'none',
  ),
);
const homeApi = createMockHomeApi(
  jidlo === 'empty' || jidlo === 'none' ? jidlo : 'full',
  (recipesQuery.get('role') as HomeRole | null) ?? 'owner',
);
setTodayHomeApiFactory(() => homeApi);
// Dnes fixtures stay deterministic; `?weather=<scenario>` overlays the weather feed.
if (!live && !new URLSearchParams(location.search).has('weather')) clearTodaySignalSources();
// `?fryerlive=<scenario>`: live airfryer card in Recepty + Dnes signal (synthetic entities).
const fryerLive = recipesQuery.get('fryerlive') as FryerDemoScenario | null;
if (fryerLive) registerTodaySignalSource('recipes', recipesFryerTodaySignalSource);
// `?timers=1|demo`: kitchen timers on Dnes (demo = three synthetic running timers).
installDevKitchenTimers(recipesApi, recipesQuery);
// Dev server only: synthetic weather snapshot (production uses the integration WS).
setWeatherAdapterFactory(() => createMockWeatherAdapter(scenarioFromUrl(location.search)));
defineHomebrainPanel();
const panel = document.createElement('homebrain-panel') as HomebrainPanel;
// Mimic HA's router: only the panels the integration registers exist (real url paths from
// panels.json, e.g. /homebrain-pristup/test). The panel config selects the module and
// route.path contains only its sub-route. Any other top-level path (also a module id such as
// /access/test) is unknown to HA, which replaces it with the default dashboard; the harness
// shows a visible marker there so e2e catches links that leave HomeBrain.
const moduleByPanel = new Map(
  Object.entries(PANEL_PATHS_BY_MODULE).map(([id, path]) => [path, id]),
);
const haHome = document.createElement('main');
haHome.dataset.testid = 'ha-default-dashboard';
haHome.innerHTML =
  '<h1>Home Assistant – výchozí přehled</h1><p>Dev harness: neznámá adresa panelu, HA by přesměroval sem.</p><ul>' +
  [...moduleByPanel.keys(), SETTINGS_PANEL_PATH, KIOSK_PANEL_PATH]
    .map((path) => `<li><a href="/${path}">/${path}</a></li>`)
    .join('') +
  '</ul>';
let panelMounted = false;
function updatePanelRoute() {
  const [prefix = '', ...rest] = location.pathname.split('/').filter(Boolean);
  const module = prefix === SETTINGS_PANEL_PATH ? 'settings' : moduleByPanel.get(prefix);
  if (prefix === KIOSK_PANEL_PATH) {
    panel.panel = { config: { kiosk: true } };
  } else if (prefix === LEGACY_PANEL_PATH) {
    panel.panel = { config: { legacy: true } };
  } else if (module) {
    panel.panel = { config: { module } };
  } else {
    if (prefix !== 'lovelace') history.replaceState(null, '', '/lovelace');
    panel.remove();
    if (!haHome.isConnected) document.body.append(haHome);
    return;
  }
  haHome.remove();
  panel.route = { path: rest.length ? '/' + rest.join('/') : '' };
  if (panelMounted && !panel.isConnected) document.body.append(panel);
}
window.top?.addEventListener('location-changed', updatePanelRoute);
window.top?.addEventListener('popstate', updatePanelRoute);
updatePanelRoute();
const now = new Date();
const pageLoadedAt = Date.now();
const routeStartRaw = new URLSearchParams(location.search).get('drahaod');
const routeStart =
  routeStartRaw !== null && Number(routeStartRaw) >= 0 && Number(routeStartRaw) < 1
    ? Number(routeStartRaw)
    : null;
const scenario = new URLSearchParams(location.search).get('waste');
const wasteDayOffset = scenario === 'bins-evening' ? 1 : scenario === 'bins-collected' ? 7 : 0;
const updatedAt = new Date(now.getTime() - (scenario === 'stale' ? 3 * 86400000 : 0)).toISOString();
function dateAfter(days: number) {
  const date = new Date(now);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
const events = [
  { waste_type: 'paper', display_name: 'Papír', days: 0 },
  { waste_type: 'plastic', display_name: 'Plasty', days: 1 },
  { waste_type: 'glass', display_name: 'Sklo', days: 1 },
  { waste_type: 'bio', display_name: 'Bioodpad', days: 3 },
  { waste_type: 'mixed', display_name: 'Směsný odpad', days: 9, availability: 'tentative' },
  { waste_type: 'electro', display_name: 'Elektroodpad', days: 12, availability: 'cancelled' },
  {
    waste_type: 'bulky',
    display_name:
      'Objemný odpad – mimořádný svoz rozměrného vybavení domácností a starého zahradního nábytku',
    days: 20,
  },
  ...(scenario === 'bins-review'
    ? [
        { waste_type: 'hazardous', display_name: 'Nebezpečný odpad', days: 24 },
        { waste_type: 'paper', display_name: 'Papír', days: 8, availability: 'cancelled' },
      ]
    : []),
]
  .flatMap((event) => {
    if (scenario === 'bins-empty-weeks') return event.days < 7 ? [event] : [];
    // Explicit synthetic source events: the view never extrapolates real pickups.
    const recurring =
      event.availability !== 'cancelled' &&
      ['paper', 'plastic', 'glass', 'bio', 'mixed'].includes(event.waste_type);
    return recurring
      ? [0, 14]
          .filter((offset) => event.days + offset + wasteDayOffset < 28)
          .map((offset) => ({ ...event, days: event.days + offset }))
      : [event];
  })
  .map(({ days, ...event }, index) => ({
    ...event,
    id: `demo-${index}`,
    collection_date: dateAfter(days + wasteDayOffset),
    last_collection_date: dateAfter(scenario === 'bins-collected' ? 0 : days + wasteDayOffset - 14),
    availability:
      scenario === 'bins-review' && event.waste_type === 'electro'
        ? 'confirmed'
        : (event.availability ?? 'confirmed'),
    visual_token: `waste.${event.waste_type}`,
    source_updated_at: updatedAt,
  }));
const demoHass = createFakeHass({
  'sensor.demo_waste_dataset': {
    entity_id: 'sensor.demo_waste_dataset',
    state: scenario === 'unavailable' ? 'unavailable' : 'ready',
    last_updated: updatedAt,
    attributes: {
      waste_dashboard: {
        schema_version: 1,
        generated_at: now.toISOString(),
        source_status: scenario === 'stale' ? 'stale' : 'available',
        source_updated_at: updatedAt,
        events,
        notices: [],
      },
    },
  },
  'sensor.demo_waste_next': {
    entity_id: 'sensor.demo_waste_next',
    state: dateAfter(wasteDayOffset),
    last_updated: now.toISOString(),
    attributes: { friendly_name: 'Ukázkový svoz', waste_type: 'Papír' },
  },
});
const healthDemo = createHealthDemo(
  now.getTime(),
  (new URLSearchParams(location.search).get('health') as HealthScenario | null) ?? 'week',
);
Object.assign(demoHass.states, healthDemo.states);
const cellarTemp = new URLSearchParams(location.search).get('cellar') ?? '16.4';
// Recepty demo: tablet media session (Companion sensor) + airfryer drawer/remaining.
demoHass.states['sensor.demo_tablet_media_session'] = {
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
} as (typeof demoHass.states)[string];
demoHass.states['binary_sensor.demo_fryer_drawer'] = {
  ...demoHass.states['sensor.demo_tablet_media_session']!,
  entity_id: 'binary_sensor.demo_fryer_drawer',
  state: recipesQuery.get('drawer') ?? 'off',
  attributes: { device_class: 'door' },
};
if (fryerLive) Object.assign(demoHass.states, fryerDemoStates(fryerLive, new Date()));
demoHass.states['sensor.demo_wine_cellar_temperature'] = {
  entity_id: 'sensor.demo_wine_cellar_temperature',
  state: cellarTemp,
  last_updated: now.toISOString(),
  attributes: { unit_of_measurement: '°C' },
};
demoHass.states['sensor.demo_wine_cellar_humidity'] = {
  entity_id: 'sensor.demo_wine_cellar_humidity',
  state: '68',
  last_updated: now.toISOString(),
  attributes: { unit_of_measurement: '%' },
};
// Syntetické zóny chladničky (Haier není v HA – v produkci bez bindingu „nenakonfigurováno“).
for (const [id, value] of [
  ['zone_1_temperature', '11.8'],
  ['zone_1_target', '12'],
  ['zone_2_temperature', '15.6'],
  ['zone_2_target', '16'],
] as const) {
  demoHass.states[`sensor.demo_wine_${id}`] = {
    entity_id: `sensor.demo_wine_${id}`,
    state: value,
    last_updated: now.toISOString(),
    attributes: { unit_of_measurement: '°C' },
  };
}
const energyDemo = createEnergyDemo(
  now.getTime(),
  (new URLSearchParams(location.search).get('energy') as EnergyScenario | null) ?? 'day',
  'Europe/Prague',
  (new URLSearchParams(location.search).get('dishwasher') as DishwasherScenario | null) ??
    'running',
);
const flowScenario = new URLSearchParams(location.search).get('flow') as FlowScenario | null;
if (flowScenario && flowScenario in FLOW_SCENARIOS)
  energyDemo.states = Object.fromEntries(
    applyFlowScenario(Object.values(energyDemo.states), flowScenario).map((s) => [s.entity_id, s]),
  );
Object.assign(demoHass.states, energyDemo.states);
const robotsDemo = createRobotsDemo(
  now.getTime(),
  (new URLSearchParams(location.search).get('robots') as RobotsScenario | null) ?? 'default',
);
Object.assign(demoHass.states, robotsDemo.states);
// Dev only: service calls from the Roboti panel are recorded, never sent anywhere.
const robotCalls: unknown[] = [];
(window as unknown as { __hbRobotCalls: unknown[] }).__hbRobotCalls = robotCalls;
// Presets/defaults backend mock: a start records the service calls the integration would send.
const presetsDemo = createPresetsDemo(
  (slot) => {
    const meta = robotsGet().robots.find((robot) => robot.slot === slot);
    return meta
      ? buildRobot(slot, robotsDemo.bindings, (id) => (id ? demoHass.states[id] : undefined), meta)
      : null;
  },
  (message) => robotCalls.push(message),
);
// `?presets=demo`: two saved presets + a remembered default on robot 1 (screenshots).
if (new URLSearchParams(location.search).get('presets') === 'demo') {
  const save = presetsDemo.handlers['homebrain/robots/presets/save'];
  save({
    slot: 1,
    preset: {
      name: 'Rychlé vysátí',
      mode: 'vacuum',
      fan: 'turbo',
      water: null,
      route: null,
      passes: 1,
      rooms: [],
    },
  });
  save({
    slot: 1,
    preset: {
      name: 'Důkladné vytření 2×',
      mode: 'mop',
      fan: null,
      water: 'intense',
      route: 'deep',
      passes: 2,
      rooms: [3, 2],
    },
  });
  presetsDemo.handlers['homebrain/robots/defaults/set']({
    slot: 1,
    defaults: { mode: 'both', fan: 'balanced', water: null, route: null, passes: 1 },
  });
}
// Schedules backend mock (no robot ever starts); `?schedules=demo` seeds two plans + results.
const schedulesDemo = createSchedulesDemo();
if (new URLSearchParams(location.search).get('schedules') === 'demo') {
  const quick = presetsDemo.data['1']?.presets[0]?.id ?? null;
  const save = schedulesDemo.handlers['homebrain/robots/schedules/save'];
  const daily = save({
    schedule: {
      name: 'Chodba potichu',
      slot: 1,
      preset_id: null,
      settings: { mode: 'vacuum', fan: 'quiet', water: null, route: null, passes: 1 },
      rooms: [2],
      days: [0, 1, 2, 3, 4, 5, 6],
      time: '09:30',
      enabled: true,
    },
  }).schedule;
  const wednesday = save({
    schedule: {
      name: 'Středeční vytírání',
      slot: 1,
      preset_id: presetsDemo.data['1']?.presets[1]?.id ?? quick,
      settings: null,
      rooms: [],
      days: [2],
      time: '13:00',
      enabled: true,
    },
  }).schedule;
  save({
    schedule: {
      name: 'Víkendový úklid',
      slot: 1,
      preset_id: quick,
      settings: null,
      rooms: [],
      days: [5, 6],
      time: '08:00',
      enabled: false,
    },
  });
  const day = new Date(Date.now() - 86_400_000).toISOString();
  schedulesDemo.addRun({
    schedule_id: daily.id,
    name: daily.name,
    slot: 1,
    at: day,
    result: 'ok',
    reason: null,
    attempts: 1,
    manual: false,
  });
  schedulesDemo.addRun({
    schedule_id: wednesday.id,
    name: wednesday.name,
    slot: 1,
    at: day,
    result: 'gave_up',
    reason: 'battery',
    attempts: 3,
    manual: false,
  });
}
const healthDemoIds = new Set(Object.values(healthDemo.bindings));
const isHealthDemo = (ids: string[] | undefined) => (ids ?? []).some((id) => healthDemoIds.has(id));
const pvDemo = createPvForecastDemo(
  now.getTime(),
  (new URLSearchParams(location.search).get('pv') as PvForecastScenario | null) ?? 'fallback',
);
// Synthetic `sun.sun` (built-in HA entity): next rising/setting around fixed local times.
function nextAt(hour: number, minute: number) {
  const at = new Date(now);
  at.setHours(hour, minute, 0, 0);
  if (at.getTime() <= now.getTime()) at.setDate(at.getDate() + 1);
  return at.toISOString();
}
demoHass.states['sun.sun'] = {
  entity_id: 'sun.sun',
  state: 'above_horizon',
  last_updated: now.toISOString(),
  attributes: { next_rising: nextAt(6, 56), next_setting: nextAt(16, 47) },
};
function robotsGet(): { robots: (typeof robotsDemo.ws.robots)[number][] } {
  const rooms = (globalThis as { __HB_ROBOT_ROOMS__?: { id: number; name: string }[] })
    .__HB_ROBOT_ROOMS__;
  // `?photos=a,b,c`: robot N uses the photo set `/local/homebrain/robots/<name N>/` (dev server
  // serves a local folder via HB_ROBOT_PHOTOS_DIR; e2e routes synthetic images).
  const photos = new URLSearchParams(location.search).get('photos')?.split(',') ?? [];
  if (photos.length && !rooms)
    return {
      robots: robotsDemo.ws.robots.map((r, i) =>
        photos[i] ? { ...r, image: `/local/homebrain/robots/${photos[i]}/` } : r,
      ),
    };
  if (!rooms) return robotsDemo.ws;
  return {
    robots: robotsDemo.ws.robots.map((r, i) =>
      i === 0 ? { ...r, maps: r.maps.map((m) => ({ ...m, rooms })) } : r,
    ),
  };
}
// Energie „Faktury“: `?faktury=none` (empty list), `?role=adult` (read-only), `?role=kiosk` (hidden).
const invoiceRole = recipesQuery.get('role') ?? 'owner';
const invoicesDemo = createInvoicesDemo(
  Date.now(),
  recipesQuery.get('faktury') === 'none' ? 'none' : 'one',
);
demoHass.fetchWithAuth = async (path: string, init?: RequestInit) => {
  await new Promise((r) => setTimeout(r, 300));
  if (path === '/api/homebrain/energy/invoices' && init?.method === 'POST') {
    if (invoiceRole !== 'owner') return new Response('{"message":"admin only"}', { status: 403 });
    return new Response(JSON.stringify(invoicesDemo.upload()), { status: 201 });
  }
  return new Response('{}', { status: 404 });
};
// Energie „Srovnání nabídek“: `?nabidky=empty|loading`, roles as for invoices.
const offersDemo = createOffersDemo(
  Date.now(),
  (['empty', 'loading'] as const).find((s) => s === recipesQuery.get('nabidky')) ?? 'full',
);
const invoiceGate = () => {
  if (invoiceRole !== 'owner' && invoiceRole !== 'adult') throw new Error('unauthorized');
};
// `?session=adult|child|kiosk|guest`: answer `homebrain/session/get` like the integration does for
// a non-admin HA user with that role (guest = unmapped -> „Nemáte přístup“). Absent = no session.
const DEV_VISIBLE: Record<string, string[]> = {
  adult: ['energy', 'family', 'network', 'recipes', 'today', 'waste', 'weather'],
  child: ['family', 'recipes', 'today', 'waste', 'weather'],
  kiosk: ['energy', 'family', 'recipes', 'today', 'waste', 'weather'],
  guest: ['about'],
};
const devSessionRole = new URLSearchParams(location.search).get('session');
const devSession =
  devSessionRole && DEV_VISIBLE[devSessionRole]
    ? {
        'homebrain/session/get': {
          role: devSessionRole,
          visible_modules: DEV_VISIBLE[devSessionRole],
          unavailable_modules: [],
          disabled_modules: [],
          is_admin: false,
          kiosk: devSessionRole === 'kiosk',
        },
      }
    : {};
demoHass.connection = createMockConnection({
  ...devSession,
  // Live Dnes reads the integration snapshot over WS (synthetic, fixed MOCK_NOW day).
  'homebrain/weather/get': () => buildMockSnapshot(scenarioFromUrl(location.search)),
  'energy/solar_forecast': pvDemo.ha,
  // `window.__HB_ROBOT_ROOMS__` (local shot script): placeholder room names for robot 1.
  // `?otoceni=90|180|270`: robot 1 map rotated like the per-robot option.
  'homebrain/robots/get': () => {
    const rot = Number(new URLSearchParams(location.search).get('otoceni')) || 0;
    const ws = robotsGet();
    return rot ? { robots: ws.robots.map((r, i) => (i === 0 ? { ...r, rotation: rot } : r)) } : ws;
  },
  // Invented vector plans; robot 1 advances one step per `?mapapoll` tick, robot 3 = PNG fallback.
  // `window.__HB_ROBOT_MAP__` (set by a local shot script) renders a locally parsed plan.
  'homebrain/robots/map': (message: unknown) =>
    new URLSearchParams(location.search).get('vektor') === 'chyba'
      ? { available: false, reason: 'parse_failed' }
      : (globalThis as { __HB_ROBOT_MAP__?: unknown }).__HB_ROBOT_MAP__
        ? { available: true, map: (globalThis as { __HB_ROBOT_MAP__?: unknown }).__HB_ROBOT_MAP__ }
        : demoVectorMap(
            Number((message as { slot?: number }).slot),
            // `?drahaod=<0–1>`: start there at page load (wrap-free e2e, #38), else wall clock.
            routeStart === null ? Date.now() : Date.now() - pageLoadedAt,
            Number(new URLSearchParams(location.search).get('mapapoll')) || 30_000,
            // `?scena=kuchyne|chodba|dok`: fixed robot pose (deterministic shots and e2e).
            new URLSearchParams(location.search).get('scena') as DemoScene | null,
            routeStart,
          ),
  // Raster base layers of the demo plans (scripts/build_robot_demo_rasters.py); a local shot
  // script may inject its own via `window.__HB_ROBOT_RASTER__ = { light, dark }` (data URLs).
  'auth/sign_path': (message: unknown) => {
    const path = String((message as { path?: string }).path ?? '');
    const hit =
      /^\/api\/homebrain\/robots\/map\/(\d)\/[^/]+\/((?:light|dark)(?:-walls)?)\.png$/.exec(path);
    if (!hit) return { path };
    const injected = (globalThis as { __HB_ROBOT_RASTER__?: Record<string, string> })
      .__HB_ROBOT_RASTER__;
    return {
      path:
        injected?.[hit[2]!] ??
        new URL(`./dev-assets/robots/demo-${hit[1]}-${hit[2]}.png`, import.meta.url).href,
    };
  },
  ...presetsDemo.handlers,
  ...schedulesDemo.handlers,
  'homebrain/energy/invoices/list': () => {
    invoiceGate();
    return invoicesDemo.list(invoiceRole === 'owner');
  },
  'homebrain/energy/invoices/compare': (m: { invoice_id: string }) => {
    invoiceGate();
    return invoicesDemo.compare(m.invoice_id);
  },
  'homebrain/energy/invoices/save': (m: { invoice_id: string; fields: never }) =>
    invoicesDemo.save(m.invoice_id, m.fields),
  'homebrain/energy/invoices/delete': (m: { invoice_id: string }) =>
    invoicesDemo.remove(m.invoice_id),
  'homebrain/energy/offers/get': (m: { type: string }) => {
    invoiceGate();
    return offersDemo.handle(m, invoiceRole === 'owner');
  },
  'homebrain/energy/offers/compare': (m: { type: string }) => {
    invoiceGate();
    return offersDemo.handle(m, invoiceRole === 'owner');
  },
  'homebrain/energy/offers/save': (m: { type: string }) =>
    offersDemo.handle(m, invoiceRole === 'owner'),
  'homebrain/energy/offers/delete': (m: { type: string }) =>
    offersDemo.handle(m, invoiceRole === 'owner'),
  call_service: (message: unknown) => {
    const call = message as {
      domain?: string;
      service_data?: { value?: number };
      target?: { entity_id?: string };
    };
    if (call.domain === 'input_number' && call.target?.entity_id)
      invoicesDemo.setTariff(call.target.entity_id, Number(call.service_data?.value));
    robotCalls.push(message);
    return { context: { id: 'demo' } };
  },
  'homebrain/energy/pv_forecast': pvDemo.server,
  // `?srovnani=full|nodata|unconfigured`: Energie period comparison (synthetic).
  'homebrain/energy/compare': () => {
    const s = (new URLSearchParams(location.search).get('srovnani') ?? 'full') as CompareScenario;
    return s === 'unconfigured' ? { status: 'unconfigured' } : createCompareDemo(s, Date.now());
  },
  'homebrain/bindings/get': {
    waste: {
      waste_dataset: 'sensor.demo_waste_dataset',
      waste_next: 'sensor.demo_waste_next',
    },
    energy: energyDemo.bindings,
    health: healthDemo.bindings,
    robots: robotsDemo.bindings,
    wine: {
      wine_cellar_temperature: 'sensor.demo_wine_cellar_temperature',
      wine_cellar_humidity: 'sensor.demo_wine_cellar_humidity',
      wine_zone_1_temperature: 'sensor.demo_wine_zone_1_temperature',
      wine_zone_1_target: 'sensor.demo_wine_zone_1_target',
      wine_zone_2_temperature: 'sensor.demo_wine_zone_2_temperature',
      wine_zone_2_target: 'sensor.demo_wine_zone_2_target',
    },
  },
  // Energie i Zdraví čtou recorder/history: rozdělit podle ID entit.
  'recorder/statistics_during_period': (message: Parameters<typeof energyDemo.statistics>[0]) =>
    isHealthDemo(message.statistic_ids)
      ? healthDemo.statistics(message as Parameters<typeof healthDemo.statistics>[0])
      : energyDemo.statistics(message),
  'recorder/statistic_during_period': (message: Parameters<typeof energyDemo.statistic>[0]) =>
    energyDemo.statistic(message),
  'history/history_during_period': (message: Parameters<typeof energyDemo.history>[0]) =>
    isHealthDemo(message.entity_ids)
      ? healthDemo.history(message as Parameters<typeof healthDemo.history>[0])
      : energyDemo.history(message),
});
// Alternativní zdroje (Refs #41): senzor ve formátu WCS a kalendář.
if (scenario === 'wcs') {
  demoHass.connection = createMockConnection({
    'homebrain/bindings/get': { waste: { waste_next: 'sensor.demo_waste_wcs' } },
  });
  demoHass.states['sensor.demo_waste_wcs'] = {
    entity_id: 'sensor.demo_waste_wcs',
    state: 'Papír',
    last_updated: now.toISOString(),
    attributes: {
      friendly_name: 'Ukázkový svoz WCS',
      [dateAfter(0)]: 'Papír',
      [dateAfter(1)]: 'Plasty, Sklo',
      [dateAfter(3)]: 'Bioodpad',
    },
  };
}
if (scenario === 'calendar') {
  demoHass.connection = createMockConnection({
    'homebrain/bindings/get': { waste: { waste_calendar: 'calendar.demo_waste' } },
    'calendar/event/subscribe': {
      events: [
        { start: { date: dateAfter(0) }, summary: 'Papír', uid: 'demo-1' },
        { start: { date: dateAfter(1) }, summary: 'Plasty', uid: 'demo-2' },
        { start: { date: dateAfter(1) }, summary: 'Sklo', uid: 'demo-3' },
        { start: { date: dateAfter(3) }, summary: 'Bioodpad', uid: 'demo-4' },
      ],
    },
  });
  demoHass.states['calendar.demo_waste'] = {
    entity_id: 'calendar.demo_waste',
    state: 'off',
    last_updated: new Date(now.getTime() - 10 * 86400000).toISOString(),
    attributes: { friendly_name: 'Ukázkový kalendář svozů' },
  };
}
// Produkční tvar (WCS senzor od zítřka + kalendář s dnešním svozem + historie z integrace):
// dnes Plasty, sklo jako „Barevne sklo“, minulé svozy přes WS homebrain/waste/history.
// `?waste=horizon` = totéž, ale zveřejněný rozpis končí za 16 dní (upozornění „data končí“).
if (scenario === 'history' || scenario === 'horizon') {
  const published: [number, string][] = [
    [1, 'Papir'],
    [2, 'Komunalni odpad'],
    [10, 'Barevne sklo'],
    [14, 'Plasty'],
    [15, 'Papir'],
    [16, 'Komunalni odpad'],
    [28, 'Plasty'],
    [29, 'Papir'],
    [30, 'Komunalni odpad'],
    [38, 'Barevne sklo'],
    [42, 'Plasty'],
    [44, 'Komunalni odpad'],
    [46, 'Elektro odpad'],
  ];
  const future = scenario === 'horizon' ? published.filter(([days]) => days <= 16) : published;
  const lastDays = Math.max(...future.map(([days]) => days));
  const past: [number, string][] = [
    [-84, 'Plasty'],
    [-83, 'Papir'],
    [-82, 'Komunalni odpad'],
    [-81, 'Barevne sklo'],
    [-73, 'Elektro odpad'],
    [-70, 'Plasty'],
    [-69, 'Papir'],
    [-68, 'Komunalni odpad'],
    [-56, 'Plasty'],
    [-55, 'Papir'],
    [-54, 'Komunalni odpad'],
    [-53, 'Barevne sklo'],
    [-42, 'Plasty'],
    [-41, 'Papir'],
    [-40, 'Komunalni odpad'],
    [-28, 'Plasty'],
    [-27, 'Papir'],
    [-26, 'Komunalni odpad'],
    [-25, 'Barevne sklo'],
    [-17, 'Elektro odpad'],
    [-14, 'Plasty'],
    [-13, 'Papir'],
    [-12, 'Komunalni odpad'],
    [-11, 'Nebezpecny odpad'],
    [0, 'Plasty'],
  ];
  demoHass.connection = createMockConnection({
    'homebrain/bindings/get': {
      waste: { waste_next: 'sensor.demo_waste_wcs', waste_calendar: 'calendar.demo_waste' },
    },
    'calendar/event/subscribe': {
      events: [[0, 'Plasty'] as [number, string], ...future].map(([days, summary]) => ({
        start: dateAfter(days),
        summary,
        uid: `${dateAfter(days)}-${summary}`,
      })),
    },
    'homebrain/waste/history': {
      events: past.map(([days, label]) => ({ date: dateAfter(days), label })),
      since: dateAfter(past[0]![0]),
      horizon: {
        status: lastDays < 30 ? 'ending' : 'ok',
        last_date: dateAfter(lastDays),
        days_left: lastDays,
        warn_days: 30,
        warning: lastDays < 30,
        types: [],
      },
    },
  });
  demoHass.states['sensor.demo_waste_wcs'] = {
    entity_id: 'sensor.demo_waste_wcs',
    state: 'Papir',
    last_updated: now.toISOString(),
    attributes: {
      friendly_name: 'Odpady svoz',
      ...Object.fromEntries(future.map(([days, label]) => [dateAfter(days), label])),
    },
  };
  demoHass.states['calendar.demo_waste'] = {
    entity_id: 'calendar.demo_waste',
    state: 'on',
    last_updated: now.toISOString(),
    attributes: { friendly_name: 'Svoz odpadu' },
  };
}
// Přístup (BioLock): synthetic people Jan/Petra/Tomáš, fake device entities; nothing is sent
// anywhere. `?biolock=off` = device offline, `?service=1` = service mode on. e2e drives events
// through `window.__hbAccess.emit(...)`.
{
  const q = new URLSearchParams(location.search);
  const set = (entity_id: string, state: string, attributes: Record<string, unknown> = {}) => {
    demoHass.states[entity_id] = {
      entity_id,
      state,
      last_changed: new Date().toISOString(),
      last_updated: new Date().toISOString(),
      attributes,
    } as (typeof demoHass.states)[string];
  };
  const E = ENTITY_DEFAULTS_ACCESS;
  if (q.get('biolock') !== 'off') {
    set(E.biometric, 'on');
    set(E.service, q.get('service') === '1' ? 'on' : 'off');
    set(E.action, 'Odemknout', { options: ['Odemknout', 'Otevřít západku'] });
    set(E.sensorState, 'idle');
    set(E.sensorOnline, 'on');
    set(E.wifi, '-61');
    set(E.connected, 'on');
    set(E.nukiConnected, 'on');
    set(E.nukiPaired, 'on');
    set(E.nukiBattery, '82');
    set(E.lock, 'locked');
    set(E.lockout, 'off');
    set(E.lockBattery, '76');
    set(E.lockBatteryCritical, 'off');
    set(E.lastError, 'no_reply');
    if (q.get('enroll_progress') === '1') {
      set(E.enrollProgress, 'idle');
      set(E.enrollHint, 'Nic neprobíhá');
      set(E.enrollRemaining, '0');
    }
    set(E.lockAction, agoIsoDev(14 - 2 / 60), {
      event_type: 'unlock',
      trigger: 0,
      auth_id: 7,
      code_id: 0,
    });
  }
  const refresh = () => {
    panel.hass = { ...demoHass, states: { ...demoHass.states } };
  };
  const log: Array<{ action: string; data: unknown }> = [];
  const agoIso = agoIsoDev;
  const sec = (min: number) => (Date.now() - min * 60_000) / 1000;
  // Synthetic HA logbook of the lock + BioLock entities (last 3 days) and Nuki lock actions.
  const logbook = [
    { when: sec(14 - 0.05), entity_id: E.lock, state: 'unlocked' },
    { when: sec(12), entity_id: E.lock, state: 'locked' },
    {
      when: sec(180),
      entity_id: E.lock,
      state: 'unlocked',
      context_event_type: 'call_service',
      context_domain: 'lock',
    },
    { when: sec(178), entity_id: E.lock, state: 'locked' },
    { when: sec(26 * 60 + 2), entity_id: E.lockout, state: 'on' },
    { when: sec(26 * 60 - 3), entity_id: E.lockout, state: 'off' },
    { when: sec(27 * 60 - 0.05), entity_id: E.lock, state: 'open' },
    { when: sec(27 * 60 - 2), entity_id: E.lock, state: 'locked' },
    { when: sec(30 * 60), entity_id: E.lock, state: 'jammed' },
    { when: sec(31 * 60), entity_id: E.lockBatteryCritical, state: 'on' },
    { when: sec(32 * 60), entity_id: E.connected, state: 'off' },
    { when: sec(32 * 60 - 4), entity_id: E.connected, state: 'on' },
    { when: sec(50 * 60), entity_id: E.lastError, state: 'verify: unknown_result' },
    { when: sec(51 * 60), entity_id: E.service, state: 'on' },
    { when: sec(51 * 60 - 9), entity_id: E.service, state: 'off' },
    {
      when: sec(52 * 60),
      entity_id: E.lastUser,
      name: 'BioLock',
      message: 'Odemkl(a) Petra (dlaň)',
    },
    { when: sec(52 * 60 - 0.1), entity_id: E.lock, state: 'unlocked' },
  ];
  const lockActions = [
    { time: agoIso(12 + 1 / 60), action: 'lock', trigger: 6, auth_id: 0, code_id: 0 },
    { time: agoIso(178 + 1 / 60), action: 'lock', trigger: 2, auth_id: 0, code_id: 0 },
    { time: agoIso(180 + 1 / 60), action: 'unlock', trigger: 172, auth_id: 0, code_id: 0 },
    { time: agoIso(27 * 60 - 2 + 1 / 60), action: 'lock', trigger: 0, auth_id: 0, code_id: 3 },
  ];
  const accessApi = createMockAccessApi({
    latencyMs: 80,
    enrollMs: Number(q.get('enroll_ms') ?? 1500),
    // e2e/dev: ?enroll_progress=1 = firmware with live enrolment progress (biolock-firmware#9)
    progress: q.get('enroll_progress') === '1',
    // e2e/dev: ?access_fail=face_instead_of_palm,timeout fails the next enrolments with these codes
    failNext: q.get('access_fail')?.split(',').filter(Boolean),
    // dev: recent passages incl. the reason a door stayed shut (synthetic names only)
    history: [
      {
        kind: 'recognized',
        time: agoIso(14),
        name: 'Jan',
        type: 'face',
        user_id: 1,
        decision: 'granted',
      },
      {
        kind: 'recognized',
        time: agoIso(95),
        name: 'Tomáš',
        type: 'face',
        user_id: 3,
        decision: 'denied',
        reason: 'not_allowed',
      },
      { kind: 'rejected', time: agoIso(26 * 60), type: 'face', reason: 'not_recognized' },
      { kind: 'lockout', time: agoIso(26 * 60 + 2), action: 'lockout' },
      {
        kind: 'enrolled',
        time: agoIso(40 * 60),
        ok: true,
        user_id: 1003,
        type: 'palm',
        type_requested: 'palm',
        name: 'Petra',
        attempts: 2,
      },
      {
        kind: 'enrolled',
        time: agoIso(40 * 60 + 1),
        ok: false,
        type_requested: 'palm',
        name: 'Petra',
        reason: 'face_instead_of_palm',
      },
      {
        kind: 'recognized',
        time: agoIso(27 * 60),
        name: 'Petra',
        type: 'palm',
        user_id: 1003,
        decision: 'granted',
      },
    ],
    log,
    logbook: q.get('access_log') === 'empty' ? [] : logbook,
    lockActions,
    serviceMode: () => demoHass.states[E.service]?.state === 'on',
    onEntity: (action, data) => {
      if (action === 'service_mode' || action === 'biometric')
        set(action === 'service_mode' ? E.service : E.biometric, data.on ? 'on' : 'off');
      if (action === 'recognition_action')
        set(E.action, String(data.option), { options: ['Odemknout', 'Otevřít západku'] });
      if (action === 'reset_lockout') set(E.lockout, 'off');
      refresh();
    },
  });
  if (q.get('enroll_progress') === '1')
    // the firmware mirrors every progress event into its three entities
    void accessApi.subscribe((e) => {
      if (e.event !== 'enroll_progress') return;
      set(E.enrollProgress, e.data.state ?? 'idle');
      set(E.enrollHint, e.data.text ?? '');
      set(E.enrollRemaining, String(e.data.remaining_s ?? 0));
      refresh();
    });
  Object.assign(window, { __hbAccess: accessApi, __hbAccessLog: log });
  setAccessApiFactory(() => accessApi);
}
const theme = new URLSearchParams(location.search).get('theme');
demoHass.themes = { darkMode: theme !== 'light' };
panel.hass = demoHass;
const media = window.matchMedia('(max-width: 600px)');
const resize = () => {
  panel.narrow = media.matches;
};
media.addEventListener('change', resize);
resize();
panelMounted = true;
if (!haHome.isConnected) document.body.append(panel);

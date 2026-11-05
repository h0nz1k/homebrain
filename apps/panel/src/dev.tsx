import { createHealthDemo, type HealthScenario } from '@homebrain/module-health';
import {
  clearTodaySignalSources,
  createMockAdapter,
  setTodayAdapterFactory,
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
  createEnergyDemo,
  createPvForecastDemo,
  type DishwasherScenario,
  type EnergyScenario,
  type PvForecastScenario,
} from '@homebrain/module-energy';
import { MODULE_PANEL_PATHS } from '@homebrain/ha-client';
import { createFakeHass, createMockConnection } from '@homebrain/testing';
import { createMockWineApi, createSyntheticWines, setWineApiFactory } from '@homebrain/module-wine';
import { createMockRecipesApi, setRecipesApiFactory } from '@homebrain/module-recipes';
import {
  createMockAccessApi,
  setAccessApiFactory,
  ENTITY_DEFAULTS_ACCESS,
} from '@homebrain/module-access';
import { defineHomebrainPanel, HomebrainPanel } from './host';
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
// Dnes fixtures stay deterministic; `?weather=<scenario>` overlays the weather feed.
if (!live && !new URLSearchParams(location.search).has('weather')) clearTodaySignalSources();
// Dev server only: synthetic weather snapshot (production uses the integration WS).
setWeatherAdapterFactory(() => createMockWeatherAdapter(scenarioFromUrl(location.search)));
defineHomebrainPanel();
const panel = document.createElement('homebrain-panel') as HomebrainPanel;
// Mimic HA: the panel config selects the module; route.path contains only its sub-route.
function updatePanelRoute() {
  const [prefix = '', ...rest] = location.pathname.split('/').filter(Boolean);
  if (prefix === 'homebrain-kiosk') {
    panel.panel = { config: { kiosk: true } };
  } else if (prefix === 'homebrain') {
    panel.panel = { config: { legacy: true } };
  } else {
    const module =
      Object.entries(MODULE_PANEL_PATHS).find(([, path]) => path === prefix)?.[0] ??
      (prefix || 'today');
    panel.panel = { config: { module } };
  }
  panel.route = { path: rest.length ? '/' + rest.join('/') : '' };
}
window.top?.addEventListener('location-changed', updatePanelRoute);
window.top?.addEventListener('popstate', updatePanelRoute);
updatePanelRoute();
const now = new Date();
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
demoHass.connection = createMockConnection({
  // Live Dnes reads the integration snapshot over WS (synthetic, fixed MOCK_NOW day).
  'homebrain/weather/get': () => buildMockSnapshot(scenarioFromUrl(location.search)),
  'energy/solar_forecast': pvDemo.ha,
  'homebrain/energy/pv_forecast': pvDemo.server,
  'homebrain/bindings/get': {
    waste: {
      waste_dataset: 'sensor.demo_waste_dataset',
      waste_next: 'sensor.demo_waste_next',
    },
    energy: energyDemo.bindings,
    health: healthDemo.bindings,
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
if (scenario === 'history') {
  const future: [number, string][] = [
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
  }
  const refresh = () => {
    panel.hass = { ...demoHass, states: { ...demoHass.states } };
  };
  const log: Array<{ action: string; data: unknown }> = [];
  const agoIso = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
  const accessApi = createMockAccessApi({
    latencyMs: 80,
    enrollMs: Number(q.get('enroll_ms') ?? 1500),
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
document.body.append(panel);

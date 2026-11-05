/**
 * Dev/e2e harness that mimics HA's `embed_iframe` custom panel: this (parent) document owns the
 * fake `hass` and WS connection, the panel runs in an iframe from the production entry
 * (src/index.ts – no dev.tsx fixtures, so Dnes uses the live adapter from modules.ts) and gets
 * `hass` assigned across realms, exactly like `ha-panel-custom` does.
 *
 * `window.__hbHarness.disconnect()` / `.reconnect()` simulate a WS drop and HA's reconnect.
 * All data are synthetic (fixed day of MOCK_NOW, 2026-10-31 Europe/Prague).
 */
import type { EntityStateLike, HassLike } from '@homebrain/ha-client';
import { createMockConnection } from '@homebrain/testing';
import { buildMockSnapshot, MOCK_NOW, scenarioFromUrl } from '@homebrain/module-weather';

const HOUR = 3_600_000;
const params = new URLSearchParams(location.search);
const now = Date.parse(MOCK_NOW);
const at = (local: string) => `2026-10-31T${local}:00+01:00`;

function entity(entity_id: string, state: string, attributes: Record<string, unknown> = {}) {
  return { entity_id, state, attributes, last_updated: new Date(now - 5_000).toISOString() };
}
function spotPrices(): EntityStateLike {
  const attrs: Record<string, unknown> = { unit_of_measurement: 'Kč/kWh' };
  const midnight = Date.parse('2026-10-30T23:00:00Z');
  for (let h = 0; h < 24; h++)
    attrs[new Date(midnight + h * HOUR).toISOString()] =
      h >= 12 && h < 15 ? 0.6 + (h - 12) * 0.2 : 3 + h * 0.08;
  return entity('sensor.harness_spot_price', '2.9', attrs);
}
const states: Record<string, EntityStateLike> = {
  'sun.sun': entity('sun.sun', 'above_horizon', {
    next_rising: '2026-11-01T05:58:00.000Z',
    next_setting: '2026-10-31T15:47:00.000Z',
  }),
  'sensor.harness_spot_price': spotPrices(),
  'sensor.harness_waste_next': entity('sensor.harness_waste_next', '2026-11-01', {
    waste_type: 'Papír',
  }),
  'calendar.harness_family': entity('calendar.harness_family', 'off'),
  'calendar.harness_school': entity('calendar.harness_school', 'off'),
};
const calendars: Record<string, unknown[]> = {
  'calendar.harness_family': [
    { start: at('18:00'), end: at('20:00'), summary: 'Večeře u babičky', uid: 'h-1' },
    { start: at('07:30'), end: at('08:00'), summary: 'Snídaně', uid: 'h-2' },
  ],
  'calendar.harness_school': [
    { start: at('15:30'), end: at('16:30'), summary: 'Kroužek keramiky', uid: 'h-3' },
  ],
};

const connection = createMockConnection({
  'homebrain/session/get': {
    role: 'owner',
    visible_modules: ['today', 'weather', 'energy', 'waste', 'family'],
    is_admin: true,
  },
  'homebrain/bindings/get': {
    energy: { energy_spot_price_electricity: 'sensor.harness_spot_price' },
    waste: { waste_next: 'sensor.harness_waste_next' },
    family: {
      family_calendar_family: 'calendar.harness_family',
      family_calendar_school: 'calendar.harness_school',
    },
  },
  'homebrain/weather/get': () => buildMockSnapshot(scenarioFromUrl(location.search)),
});
connection.subscribeMessage = async <T>(
  callback: (message: T) => void,
  message: { type: string; entity_id?: string },
) => {
  if (message.type !== 'calendar/event/subscribe') throw new Error('Neznámý testovací odběr.');
  callback({ events: calendars[message.entity_id ?? ''] ?? [] } as T);
  return () => {};
};

let hass: HassLike & { connected: boolean } = {
  connection,
  states,
  user: { id: 'harness', name: 'Harness', is_admin: true },
  language: 'cs',
  themes: { darkMode: params.get('theme') !== 'light' },
  connected: true,
};
type PanelElement = HTMLElement & {
  hass: HassLike;
  narrow: boolean;
  route: { path: string };
  panel: { config: { module: string } };
};
let panel: PanelElement | undefined;
const push = (next: Partial<typeof hass>) => {
  hass = { ...hass, ...next };
  if (panel) panel.hass = hass;
};

const iframe = document.createElement('iframe');
iframe.title = 'HomeBrain';
iframe.src = './ha-iframe-panel.html';
iframe.addEventListener('load', async () => {
  const child = iframe.contentWindow!;
  await child.customElements.whenDefined('homebrain-panel');
  // Created in the iframe realm, `hass` comes from this (parent) realm – as in HA.
  panel = child.document.createElement('homebrain-panel') as PanelElement;
  panel.panel = { config: { module: 'today' } };
  panel.route = { path: '' };
  panel.narrow = window.matchMedia('(max-width: 600px)').matches;
  panel.hass = hass;
  child.document.body.append(panel);
  document.documentElement.dataset.ready = 'true';
});
document.body.append(iframe);

// HA pushes a new `hass` on every entity change; keep the store fresh while connected.
setInterval(() => {
  if (hass.connected) push({ states: { ...hass.states } });
}, 5_000);

declare global {
  interface Window {
    __hbHarness?: { disconnect: () => void; reconnect: () => void };
  }
}
window.__hbHarness = {
  disconnect: () => {
    connection.emit('disconnected');
    push({ connected: false });
  },
  reconnect: () => {
    connection.emit('ready');
    push({ connected: true, states: { ...hass.states } });
  },
};

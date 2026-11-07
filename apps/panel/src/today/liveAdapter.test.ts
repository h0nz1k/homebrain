import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEntityStore, type EntityStateLike } from '@homebrain/ha-client';
import { createMockConnection } from '@homebrain/testing';
import { buildMockSnapshot, MOCK_NOW, type WeatherSnapshot } from '@homebrain/module-weather';
import type { TodayData } from '@homebrain/module-today';
import {
  createLiveTodayAdapter,
  eventsRibbon,
  NO_WEATHER,
  rainRibbon,
  sunToday,
  WEATHER_POLL_MS,
  wasteRibbon,
} from './liveAdapter';

const NOW = Date.parse(MOCK_NOW); // 2026-10-31 10:40 Europe/Prague
const HOUR = 3_600_000;

function state(
  entity_id: string,
  value: string,
  attributes: Record<string, unknown> = {},
): EntityStateLike {
  return { entity_id, state: value, attributes, last_updated: new Date(NOW - 5_000).toISOString() };
}
const SUN = state('sun.sun', 'above_horizon', {
  // Sun already rose today → next_rising is tomorrow (07:58 CET), next_setting is today.
  next_rising: '2026-11-01T05:58:00.000Z',
  next_setting: '2026-10-31T15:47:00.000Z',
});
function priceState(): EntityStateLike {
  const attrs: Record<string, unknown> = { unit_of_measurement: 'Kč/kWh' };
  const dayStart = Date.parse('2026-10-30T23:00:00Z'); // local midnight
  for (let h = 0; h < 24; h++)
    attrs[new Date(dayStart + h * HOUR).toISOString()] = h >= 13 && h < 15 ? 0.5 : 3 + h * 0.1;
  return state('sensor.synthetic_price', '3.1', attrs);
}
const WASTE = state('sensor.synthetic_waste_next', '2026-11-01', { waste_type: 'Papír' });

type Responses = Record<string, unknown>;
function setup(
  opts: { responses?: Responses; states?: EntityStateLike[]; connected?: boolean } = {},
) {
  const connection = createMockConnection({
    'homebrain/session/get': { role: 'owner', visible_modules: ['today'], is_admin: true },
    'homebrain/bindings/get': {
      energy: { energy_spot_price_electricity: 'sensor.synthetic_price' },
      waste: { waste_next: 'sensor.synthetic_waste_next' },
      weather: { weather_temperature: 'sensor.synthetic_outdoor_temp' },
    },
    'homebrain/weather/get': buildMockSnapshot('default'),
    ...opts.responses,
  });
  if (opts.connected === false) connection.connected = false;
  const store = createEntityStore();
  const states = opts.states ?? [SUN, priceState(), WASTE];
  store.update(Object.fromEntries(states.map((s) => [s.entity_id, s])));
  const calls: string[] = [];
  const send = connection.sendMessagePromise.bind(connection);
  connection.sendMessagePromise = <T>(message: { type: string }) => {
    calls.push(message.type);
    return send<T>(message);
  };
  const adapter = createLiveTodayAdapter(
    { store, bindings: {}, connection },
    { clock: () => NOW, weatherPollMs: WEATHER_POLL_MS },
  );
  const seen: TodayData[] = [];
  const unsubscribe = adapter.subscribe((data) => seen.push(data));
  return { connection, store, adapter, seen, unsubscribe, calls };
}
const settle = () => vi.advanceTimersByTimeAsync(0);

afterEach(() => {
  vi.useRealTimers();
});

describe('createLiveTodayAdapter', () => {
  it('reports HA connected while the connection is up (never „odpojeno“)', async () => {
    vi.useFakeTimers({ now: NOW });
    const { adapter, connection, seen } = setup();
    await settle();
    expect(adapter.get().ha.connected).toBe(true);
    expect(Date.parse(adapter.get().ha.updatedAt)).toBeGreaterThan(0);
    connection.emit('disconnected');
    expect(seen.at(-1)!.ha.connected).toBe(false);
    connection.emit('ready');
    expect(seen.at(-1)!.ha.connected).toBe(true);
  });

  it('uses the time of the last entity store update as ha.updatedAt', async () => {
    vi.useFakeTimers({ now: NOW - 30_000 });
    const { adapter, store } = setup();
    vi.setSystemTime(NOW - 2_000);
    store.update({ 'sun.sun': SUN });
    expect(adapter.get().ha.updatedAt).toBe(new Date(NOW - 2_000).toISOString());
  });

  it('reads the measured station temperature and condition from homebrain/weather/get', async () => {
    vi.useFakeTimers({ now: NOW });
    const { adapter } = setup();
    await settle();
    const data = adapter.get();
    const snapshot = buildMockSnapshot('default');
    expect(data.station.tempC).toBe(snapshot.station.values.t2m!.v);
    expect(data.station.updatedAt).toBe(snapshot.station.updated_at);
    expect(data.station.condition).not.toBe(NO_WEATHER);
  });

  it('falls back to the bound temperature entity when the weather WS is unauthorized', async () => {
    vi.useFakeTimers({ now: NOW });
    const unauthorized = () => {
      throw new Error('Unauthorized');
    };
    const { adapter } = setup({
      responses: { 'homebrain/weather/get': unauthorized },
      states: [SUN, state('sensor.synthetic_outdoor_temp', '4.5', { unit_of_measurement: '°C' })],
    });
    await settle();
    const data = adapter.get();
    expect(data.station.tempC).toBe(4.5);
    expect(data.hourly).toEqual([]);
    expect(data.ribbon.filter((r) => r.kind === 'rain')).toEqual([]);
  });

  it('shows an honest empty state without weather data', async () => {
    vi.useFakeTimers({ now: NOW });
    const { adapter } = setup({
      responses: { 'homebrain/weather/get': () => Promise.reject(new Error('down')) },
      states: [],
    });
    await settle();
    const data = adapter.get();
    expect(Number.isNaN(data.station.tempC)).toBe(true);
    expect(data.station.condition).toBe(NO_WEATHER);
    expect(data.sun).toEqual({ sunrise: '', sunset: '' });
    expect(data.ribbon).toEqual([]);
    expect(data.ha.connected).toBe(true);
  });

  it("computes today's sunrise/sunset from sun.sun next_rising/next_setting", () => {
    const sun = sunToday(SUN, NOW);
    expect(sun.sunset).toBe('2026-10-31T15:47:00.000Z');
    expect(sun.sunrise).toBe('2026-10-31T05:58:00.000Z');
    expect(sunToday(undefined, NOW)).toEqual({ sunrise: '', sunset: '' });
  });

  it('builds hourly blend points for today 6–21 h only', async () => {
    vi.useFakeTimers({ now: NOW });
    const { adapter } = setup();
    await settle();
    const hours = adapter.get().hourly.map((h) =>
      Number(
        new Intl.DateTimeFormat('en-GB', {
          timeZone: 'Europe/Prague',
          hour: '2-digit',
          hourCycle: 'h23',
        }).format(Date.parse(h.time)),
      ),
    );
    expect(hours.length).toBeGreaterThan(0);
    expect(Math.min(...hours)).toBeGreaterThanOrEqual(6);
    expect(Math.max(...hours)).toBeLessThanOrEqual(21);
    expect(adapter.get().hourly.every((h) => h.time.startsWith('2026-10-31'))).toBe(true);
  });

  it('puts cheap power, rain and waste on the ribbon', async () => {
    vi.useFakeTimers({ now: NOW });
    const { adapter } = setup();
    await settle();
    const ribbon = adapter.get().ribbon;
    const cheap = ribbon.find((r) => r.kind === 'cheap');
    expect(cheap).toMatchObject({
      from: '2026-10-31T12:00:00.000Z',
      to: '2026-10-31T14:00:00.000Z',
    });
    expect(cheap!.label).toContain('Levný proud');
    expect(ribbon.find((r) => r.kind === 'rain')?.signalId).toBe('weather.nowcast.rain');
    expect(ribbon.find((r) => r.kind === 'waste')?.label).toBe('Zítra svoz: papír');
    expect(adapter.get().tomorrow).toBe('Zítra svoz: papír');
  });

  it('refreshes the weather every 5 minutes and stops on unsubscribe', async () => {
    vi.useFakeTimers({ now: NOW });
    let temp = 7.8;
    const snapshot = (): WeatherSnapshot => {
      const s = buildMockSnapshot('default');
      s.station.values.t2m = { ...s.station.values.t2m!, v: temp };
      return s;
    };
    const { adapter, calls, unsubscribe } = setup({
      responses: { 'homebrain/weather/get': snapshot },
    });
    await settle();
    expect(adapter.get().station.tempC).toBe(7.8);
    temp = 9.1;
    await vi.advanceTimersByTimeAsync(WEATHER_POLL_MS);
    expect(adapter.get().station.tempC).toBe(9.1);
    unsubscribe();
    const before = calls.filter((c) => c === 'homebrain/weather/get').length;
    await vi.advanceTimersByTimeAsync(3 * WEATHER_POLL_MS);
    expect(calls.filter((c) => c === 'homebrain/weather/get').length).toBe(before);
  });

  it('kiosk role calls only KIOSK_WS_COMMANDS (no waste calendar)', async () => {
    vi.useFakeTimers({ now: NOW });
    const KIOSK = new Set([
      'homebrain/session/get',
      'homebrain/bindings/get',
      'homebrain/weather/get',
      'homebrain/weather/alerts',
      'homebrain/energy/pv_forecast',
    ]);
    const { calls, connection, adapter } = setup({
      responses: {
        'homebrain/session/get': { role: 'kiosk', visible_modules: ['today'], kiosk: true },
        'homebrain/bindings/get': {
          waste: { waste_calendar: 'calendar.synthetic_waste' },
          energy: { energy_spot_price_electricity: 'sensor.synthetic_price' },
        },
        'calendar/event/subscribe': { events: [] },
      },
    });
    const subscribed = vi.spyOn(connection, 'subscribeMessage');
    await settle();
    connection.emit('ready');
    await settle();
    expect(calls.every((type) => KIOSK.has(type))).toBe(true);
    expect(subscribed).not.toHaveBeenCalled();
    expect(adapter.get().ribbon.some((r) => r.kind === 'cheap')).toBe(true);
  });

  it('non-kiosk roles read the bound waste calendar', async () => {
    vi.useFakeTimers({ now: NOW });
    const { connection, adapter } = setup({
      responses: {
        'homebrain/bindings/get': { waste: { waste_calendar: 'calendar.synthetic_waste' } },
        'calendar/event/subscribe': {
          events: [{ start: '2026-10-31', summary: 'Plasty', uid: 'synthetic-1' }],
        },
      },
      states: [SUN, state('calendar.synthetic_waste', 'off')],
    });
    void connection;
    await settle();
    await settle();
    expect(adapter.get().ribbon.find((r) => r.kind === 'waste')?.label).toBe('Dnes svoz: plasty');
  });

  it("puts today's family and school events on the ribbon (title + time only)", async () => {
    vi.useFakeTimers({ now: NOW });
    const subscribed: string[] = [];
    const { connection, adapter } = setup({
      responses: {
        'homebrain/session/get': { role: 'adult', visible_modules: ['today', 'family'] },
        'homebrain/bindings/get': {
          family: {
            family_calendar_family: 'calendar.synthetic_family',
            family_calendar_school: 'calendar.synthetic_school',
          },
        },
      },
    });
    connection.subscribeMessage = async <T>(
      callback: (message: T) => void,
      message: { type: string; entity_id?: string },
    ) => {
      subscribed.push(message.entity_id ?? '');
      const events =
        message.entity_id === 'calendar.synthetic_family'
          ? [
              {
                start: '2026-10-31T18:00:00+01:00',
                end: '2026-10-31T20:00:00+01:00',
                summary: 'Večeře u babičky',
                description: 'soukromá poznámka',
                location: 'adresa',
              },
              {
                start: '2026-10-31T08:00:00+01:00',
                end: '2026-10-31T09:00:00+01:00',
                summary: 'Ráno',
              },
              {
                start: '2026-11-01T09:00:00+01:00',
                end: '2026-11-01T10:00:00+01:00',
                summary: 'Zítra',
              },
            ]
          : [{ start: '2026-10-30', end: '2026-11-02', summary: 'Podzimní prázdniny' }];
      callback({ events } as T);
      return () => {};
    };
    await settle();
    await settle();
    expect(subscribed.sort()).toEqual(['calendar.synthetic_family', 'calendar.synthetic_school']);
    const events = adapter.get().ribbon.filter((r) => r.kind === 'event');
    expect(events.map((e) => e.label)).toEqual(['Podzimní prázdniny', '18:00 Večeře u babičky']);
    expect(events[1]).toMatchObject({ from: '2026-10-31T17:00:00.000Z' });
    expect(JSON.stringify(adapter.get().ribbon)).not.toMatch(/soukrom|adresa/);
  });

  it('skips family calendars when the role does not see Rodina, and for the kiosk', async () => {
    vi.useFakeTimers({ now: NOW });
    for (const session of [
      { role: 'owner', visible_modules: ['today', 'weather'], is_admin: true },
      { role: 'kiosk', visible_modules: ['today', 'family'], kiosk: true },
    ]) {
      const { connection, unsubscribe } = setup({
        responses: {
          'homebrain/session/get': session,
          'homebrain/bindings/get': {
            family: { family_calendar_family: 'calendar.synthetic_family' },
          },
          'calendar/event/subscribe': { events: [] },
        },
      });
      const subscribed = vi.spyOn(connection, 'subscribeMessage');
      await settle();
      await settle();
      expect(subscribed).not.toHaveBeenCalled();
      unsubscribe();
    }
  });

  it('marks HA disconnected on a WS drop and recovers (fresh weather) after reconnect', async () => {
    vi.useFakeTimers({ now: NOW });
    const { connection, adapter, seen, calls } = setup();
    await settle();
    expect(seen.at(-1)!.ha.connected).toBe(true);
    connection.emit('disconnected');
    expect(seen.at(-1)!.ha.connected).toBe(false);
    expect(adapter.get().ha.connected).toBe(false);
    const before = calls.filter((c) => c === 'homebrain/weather/get').length;
    connection.emit('ready');
    await settle();
    expect(seen.at(-1)!.ha.connected).toBe(true);
    expect(calls.filter((c) => c === 'homebrain/weather/get').length).toBe(before + 1);
  });

  it('eventsRibbon caps the list and ignores invalid or finished events', () => {
    const at = (h: number, m = 0) =>
      `2026-10-31T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+01:00`;
    const feed = [
      { start: at(9), end: at(10), summary: 'Hotovo' },
      { start: 'nesmysl', summary: 'Chyba' },
      ...[11, 12, 13, 14, 15].map((h) => ({ start: at(h), end: at(h, 30), summary: `Bod ${h}` })),
      { start: at(11), end: at(11, 30), summary: 'bod 11' },
    ];
    const items = eventsRibbon([feed, 'error', undefined], NOW, 'Europe/Prague');
    expect(items.map((i) => i.label)).toEqual([
      '11:00 Bod 11',
      '12:00 Bod 12',
      '13:00 Bod 13',
      '14:00 Bod 14',
    ]);
    const long = eventsRibbon(
      [[{ start: at(19), summary: 'Velmi dlouhý název rodinné události, který se nevejde' }]],
      NOW,
    );
    expect(long[0]!.label.length).toBeLessThanOrEqual(34 + 6);
    expect(long[0]!.label.endsWith('…')).toBe(true);
  });

  it('without a HA context it reports disconnected and nothing measured', () => {
    const data = createLiveTodayAdapter(undefined).get();
    expect(data.ha.connected).toBe(false);
    expect(Number.isNaN(data.station.tempC)).toBe(true);
  });

  it('merges blend rain adjacent to the radar window into one band', () => {
    const snapshot = buildMockSnapshot('default');
    snapshot.nowcast = {
      ...snapshot.nowcast,
      status: 'raining',
      eta_min: 0,
      end_min: 60,
      slots: [],
    };
    snapshot.hourly = [0, 1, 2, 3].map((i) => ({
      ...snapshot.hourly[0]!,
      t: new Date(Date.parse('2026-10-31T10:00:00Z') + i * HOUR).toISOString(),
      precip: i < 2 ? 1 : 0,
      pop: i < 2 ? 0.9 : 0.1,
    }));
    const items = rainRibbon(snapshot, NOW);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ to: '2026-10-31T12:00:00.000Z', label: 'Prší do 13:00' });
  });
});

describe('wasteRibbon after the published schedule ends', () => {
  it('shows no next pickup when only past dates are known (no invented date)', () => {
    // WCS type-state sensor whose last published pickup was yesterday (data horizon passed).
    const ended = state('sensor.synthetic_waste_wcs', 'Plasty', {
      '2026-10-28': 'Plasty',
      '2026-10-30': 'Papir',
    });
    const result = wasteRibbon(
      { waste_next: 'sensor.synthetic_waste_wcs' },
      (id) => (id === ended.entity_id ? ended : undefined),
      NOW,
      undefined,
    );
    expect(result.items).toEqual([]);
    expect(result.tomorrow).toBeUndefined();
  });
});

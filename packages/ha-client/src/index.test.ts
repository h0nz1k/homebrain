import { expect, it, vi } from 'vitest';
import {
  getBindings,
  navigatePanel,
  createEntityStore,
  deriveQuality,
  createServiceClient,
  ServiceNotAllowedError,
  type EntityStateLike,
} from './index';
const state = (overrides: Partial<EntityStateLike> = {}): EntityStateLike => ({
  entity_id: 'sensor.demo_a',
  state: '5',
  last_updated: '2026-10-31T10:00:00Z',
  attributes: { unit_of_measurement: 'W' },
  ...overrides,
});
it('notifies exactly one of 1000 entity listeners', () => {
  const store = createEntityStore();
  const states = Object.fromEntries(
    Array.from({ length: 1000 }, (_, i) => [
      `sensor.demo_${i}`,
      state({ entity_id: `sensor.demo_${i}` }),
    ]),
  );
  store.update(states);
  const listener = vi.fn();
  for (const id of Object.keys(states)) store.subscribe(id, listener);
  store.update({ ...states, 'sensor.demo_42': state({ entity_id: 'sensor.demo_42', state: '6' }) });
  expect(listener).toHaveBeenCalledTimes(1);
});
it('handles removal, stable references and unsubscribe', () => {
  const store = createEntityStore();
  const listener = vi.fn();
  const value = state();
  store.update({ [value.entity_id]: value });
  const unsubscribe = store.subscribe(value.entity_id, listener);
  store.update({ [value.entity_id]: value });
  expect(listener).not.toHaveBeenCalled();
  store.update({});
  expect(listener).toHaveBeenCalledOnce();
  expect(store.getSnapshot(value.entity_id)).toBeUndefined();
  unsubscribe();
  store.update({ [value.entity_id]: value });
  expect(listener).toHaveBeenCalledOnce();
});
it.each([
  [undefined, 'unavailable'],
  [state({ state: 'unknown' }), 'unavailable'],
  [state({ state: 'unavailable' }), 'unavailable'],
  [state({ last_updated: '2026-10-30T10:00:00Z' }), 'stale'],
  [state({ last_updated: 'invalid' }), 'stale'],
  [state({ attributes: { unit_of_measurement: 'kW' } }), 'invalid_unit'],
  [state(), 'ok'],
])('derives quality %#', (value, expected) => {
  expect(
    deriveQuality(value, {
      maxAgeMs: 1000,
      expectedUnit: 'W',
      now: Date.parse('2026-10-31T10:00:00Z'),
    }),
  ).toBe(expected);
});
it('rejects by default and forwards only allowed services', async () => {
  const connection = { callService: vi.fn().mockResolvedValue(undefined) };
  expect(() => createServiceClient(connection).callService('demo', 'run')).toThrow(
    ServiceNotAllowedError,
  );
  const client = createServiceClient(connection, ['demo.run']);
  expect(() => client.callService('demo', 'other')).toThrow(ServiceNotAllowedError);
  expect(connection.callService).not.toHaveBeenCalled();
  await client.callService('demo', 'run', { value: 1 });
  expect(connection.callService).toHaveBeenCalledWith('demo', 'run', { value: 1 });
});

it.each([null, [], 'invalid', 42])('ignores an invalid bindings response %j', async (response) => {
  expect(await getBindings({ sendMessagePromise: vi.fn().mockResolvedValue(response) })).toEqual(
    {},
  );
});
it('keeps valid module bindings and ignores malformed modules and values', async () => {
  const connection = {
    sendMessagePromise: vi.fn().mockResolvedValue({
      waste: { waste_next: 'sensor.demo_waste_next', invalid: null, nested: {} },
      energy: { power: 'sensor.demo_energy_power' },
      invalid: null,
      array: ['sensor.demo_waste_next'],
      flat: 'sensor.demo_waste_next',
    }),
  };
  expect(await getBindings(connection)).toEqual({
    waste: { waste_next: 'sensor.demo_waste_next' },
    energy: { power: 'sensor.demo_energy_power' },
  });
  expect(connection.sendMessagePromise).toHaveBeenCalledWith({ type: 'homebrain/bindings/get' });
});

it('entity store notifies global listeners and records the last update time', () => {
  vi.useFakeTimers({ now: Date.parse('2026-01-01T10:00:00Z') });
  try {
    const store = createEntityStore();
    expect(store.lastUpdatedAt()).toBeNull();
    const listener = vi.fn();
    const stop = store.subscribeAll(listener);
    store.update({});
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.lastUpdatedAt()).toBe(Date.parse('2026-01-01T10:00:00Z'));
    stop();
    store.update({});
    expect(listener).toHaveBeenCalledTimes(1);
  } finally {
    vi.useRealTimers();
  }
});

it('navigates the top window when history access fails', () => {
  const location = { href: '' };
  const assign = vi.fn();
  vi.stubGlobal('window', {
    top: {
      history: {
        pushState: () => {
          throw new Error('Unavailable history');
        },
      },
      location,
    },
    location: { assign },
  });
  try {
    navigatePanel('/waste');
    expect(location.href).toBe('/homebrain-odpady');
    expect(assign).not.toHaveBeenCalled();
  } finally {
    vi.unstubAllGlobals();
  }
});
it('falls back to the current window if top navigation is blocked', () => {
  const assign = vi.fn();
  vi.stubGlobal('window', {
    get top() {
      throw new Error('Blocked top');
    },
    location: { assign },
  });
  try {
    navigatePanel('/waste');
    expect(assign).toHaveBeenCalledWith('/homebrain-odpady');
  } finally {
    vi.unstubAllGlobals();
  }
});

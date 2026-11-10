// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from 'vitest';
import { createRobotsDemo } from './demo.js';
import { buildRobot } from './model.js';
import {
  createRobotsUiMemoryDemo,
  mergeSlotMemory,
  parseRobotsUiStore,
  readLocalRobotsUi,
  validateSlotMemory,
  writeLocalRobotsUi,
  EMPTY_UI_STORE,
  type SlotUiMemory,
} from './uiMemory.js';
import { robotCapabilities } from './presets.js';

const demo = createRobotsDemo(Date.UTC(2026, 10, 6, 9));
const robot = buildRobot(
  1,
  demo.bindings,
  (id) => (id ? demo.states[id] : undefined),
  demo.ws.robots[0],
);
const caps = robotCapabilities(robot);

beforeEach(() => {
  localStorage.clear();
});

describe('robots UI memory', () => {
  it('validates against current robot options and drops unknown values', () => {
    const raw: SlotUiMemory = {
      advanced: true,
      mode: 'both',
      fan: 'jet',
      water: 'off',
      route: 'custom',
      passes: 9,
      presetId: 'missing',
    };
    expect(validateSlotMemory(raw, caps, ['p1'])).toEqual({
      advanced: true,
      mode: 'both',
      passes: 3,
    });
  });

  it('merges per-slot patches and round-trips through localStorage', () => {
    let store = mergeSlotMemory(EMPTY_UI_STORE, 1, { advanced: true, passes: 2 });
    store = mergeSlotMemory(store, 2, { mode: 'vacuum' });
    writeLocalRobotsUi(store);
    expect(readLocalRobotsUi()).toEqual(store);
  });

  it('parses only versioned store shapes', () => {
    expect(parseRobotsUiStore({ v: 2, slots: {} })).toEqual(EMPTY_UI_STORE);
    expect(parseRobotsUiStore({ v: 1, slots: { '1': { advanced: true } } }).slots['1']).toEqual({
      advanced: true,
    });
  });

  it('dev HA user-data mock shares state between get and set', () => {
    const mock = createRobotsUiMemoryDemo();
    mock.handlers['frontend/set_user_data']({
      key: 'homebrain_robots_v1',
      value: { v: 1, slots: { '1': { advanced: true, fan: 'quiet' } } },
    });
    const res = mock.handlers['frontend/get_user_data']({ key: 'homebrain_robots_v1' }) as {
      value: { slots: Record<string, SlotUiMemory> };
    };
    expect(res.value.slots['1']).toMatchObject({ advanced: true, fan: 'quiet' });
  });
});

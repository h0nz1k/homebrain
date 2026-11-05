import { describe, expect, it } from 'vitest';
import { adaptEnergyEntities } from './adapter.js';
import type { ApplianceReading, ApplianceSlot } from './appliances.js';
import {
  applyFlowScenario,
  createEnergyDemo,
  FLOW_SCENARIOS,
  flowScenarioGridKw,
} from './fixtures.js';
import {
  CONSUMER_RULES,
  createConsumerTracker,
  flowEdges,
  flowPeriodS,
  MAX_VISIBLE_CONSUMERS,
  stepConsumers,
  type ConsumerTracks,
} from './flow.js';

const LABELS: Record<ApplianceSlot, string> = {
  heat_pump: 'Tepelné čerpadlo',
  dishwasher: 'Myčka',
  coffee_maker: 'Kávovar',
  dehumidifier: 'Odvlhčovač',
};
function reading(slot: ApplianceSlot, watts: number | null, switchOn: boolean | null = null) {
  return {
    slot,
    label: LABELS[slot],
    runningW: 10,
    power: {
      value: watts,
      quality: watts === null ? 'unavailable' : 'ok',
      updatedAt: null,
      bound: true,
    },
    switchOn,
    state: 'running',
    todayKwh: null,
    sharePercent: null,
    cycle: null,
  } as ApplianceReading;
}
const T = Date.UTC(2026, 5, 2, 11, 0, 0);

describe('stepConsumers – visibility threshold', () => {
  it('shows only appliances above the on-threshold on the first data (no debounce)', () => {
    const r = stepConsumers(
      {},
      [reading('coffee_maker', 2.1), reading('dishwasher', 31), reading('dehumidifier', 29)],
      T,
      true,
    );
    expect(r.visible.map((c) => c.slot)).toEqual(['dishwasher']);
  });
  it('heat pump idling at tens of watts stays hidden', () => {
    const r = stepConsumers({}, [reading('heat_pump', 60)], T, true);
    expect(r.visible).toEqual([]);
  });
  it('unknown power or a switched-off plug hides the item at once', () => {
    const shown = stepConsumers({}, [reading('dishwasher', 900)], T, true).tracks;
    expect(stepConsumers(shown, [reading('dishwasher', null)], T + 1000).visible).toEqual([]);
    expect(stepConsumers(shown, [reading('dishwasher', 900, false)], T + 1000).visible).toEqual([]);
  });
});

describe('stepConsumers – debounce + hysteresis', () => {
  it('needs onDelay above the threshold before appearing', () => {
    const delay = CONSUMER_RULES.dehumidifier.onDelayMs;
    let tracks: ConsumerTracks = {};
    let r = stepConsumers(tracks, [reading('dehumidifier', 250)], T);
    expect(r.visible).toEqual([]);
    expect(r.nextCheckAt).toBe(T + delay);
    tracks = r.tracks;
    r = stepConsumers(tracks, [reading('dehumidifier', 250)], T + delay - 1);
    expect(r.visible).toEqual([]);
    r = stepConsumers(r.tracks, [reading('dehumidifier', 250)], T + delay);
    expect(r.visible.map((c) => c.slot)).toEqual(['dehumidifier']);
  });
  it('a short spike resets the pending appearance', () => {
    let r = stepConsumers({}, [reading('dehumidifier', 250)], T);
    r = stepConsumers(r.tracks, [reading('dehumidifier', 3)], T + 5000);
    r = stepConsumers(r.tracks, [reading('dehumidifier', 250)], T + 25_000);
    expect(r.visible).toEqual([]);
    expect(r.nextCheckAt).toBe(T + 25_000 + CONSUMER_RULES.dehumidifier.onDelayMs);
  });
  it('stays visible inside the hysteresis band and through short dips', () => {
    const rule = CONSUMER_RULES.dishwasher;
    let r = stepConsumers({}, [reading('dishwasher', 2000)], T, true);
    // Between offW and onW: still running (heating pause at ~20 W).
    r = stepConsumers(r.tracks, [reading('dishwasher', rule.offW + 5)], T + 60_000);
    expect(r.visible).toHaveLength(1);
    // Below offW, but shorter than offDelay → still shown.
    r = stepConsumers(r.tracks, [reading('dishwasher', 2)], T + 120_000);
    r = stepConsumers(r.tracks, [reading('dishwasher', 2)], T + 120_000 + rule.offDelayMs - 1);
    expect(r.visible).toHaveLength(1);
    r = stepConsumers(r.tracks, [reading('dishwasher', 2)], T + 120_000 + rule.offDelayMs);
    expect(r.visible).toEqual([]);
  });
  it('a dip that recovers above offW cancels the pending hide', () => {
    let r = stepConsumers({}, [reading('coffee_maker', 1300)], T, true);
    r = stepConsumers(r.tracks, [reading('coffee_maker', 3)], T + 1000);
    r = stepConsumers(r.tracks, [reading('coffee_maker', 1300)], T + 20_000);
    r = stepConsumers(r.tracks, [reading('coffee_maker', 3)], T + 40_000);
    r = stepConsumers(r.tracks, [reading('coffee_maker', 3)], T + 40_000 + 44_000);
    expect(r.visible).toHaveLength(1);
  });
});

describe('stepConsumers – sorting and limit', () => {
  it('sorts by power and keeps max 4 with an overflow count', () => {
    const rules = { ...CONSUMER_RULES };
    const many = [
      reading('coffee_maker', 1350),
      reading('heat_pump', 1180),
      reading('dishwasher', 1860),
      reading('dehumidifier', 240),
    ];
    const r = stepConsumers({}, many, T, true, rules);
    expect(r.visible.map((c) => c.slot)).toEqual([
      'dishwasher',
      'coffee_maker',
      'heat_pump',
      'dehumidifier',
    ]);
    expect(MAX_VISIBLE_CONSUMERS).toBe(4);
    expect(r.overflow).toBe(0);
  });
});

describe('createConsumerTracker', () => {
  it('keeps a stopped item briefly as leaving, then removes it', async () => {
    const tracker = createConsumerTracker(5);
    tracker.update([reading('coffee_maker', 1300)], T);
    expect(tracker.getSnapshot().items.map((c) => c.leaving)).toEqual([false]);
    tracker.update([reading('coffee_maker', null)], T + 1000);
    expect(tracker.getSnapshot().items.map((c) => c.leaving)).toEqual([true]);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(tracker.getSnapshot().items).toEqual([]);
    tracker.dispose();
  });
});

describe('flowEdges + scenarios', () => {
  it('period gets shorter with power and is clamped', () => {
    expect(flowPeriodS(0.1)).toBeGreaterThan(flowPeriodS(1));
    expect(flowPeriodS(1)).toBeGreaterThan(flowPeriodS(6));
    expect(flowPeriodS(100)).toBe(0.57);
    expect(flowPeriodS(0.001)).toBe(2.8);
  });
  it.each(Object.keys(FLOW_SCENARIOS) as Array<keyof typeof FLOW_SCENARIOS>)(
    'scenario %s balances sources and sinks',
    (name) => {
      const v = FLOW_SCENARIOS[name];
      const grid = flowScenarioGridKw(v);
      expect(v.pv1Kw + v.pv2Kw + grid + v.batteryKw).toBeCloseTo(v.houseKw, 6);
    },
  );
  it('noon: PV to hub, battery charging, export, house fed', () => {
    const now = Date.parse('2026-06-02T13:00:00+02:00');
    const demo = createEnergyDemo(now);
    const states = applyFlowScenario(Object.values(demo.states), 'noon');
    const model = adaptEnergyEntities({
      bindings: demo.bindings,
      getState: (id) => states.find((s) => s.entity_id === id),
      now,
    });
    const e = flowEdges(model);
    expect(e.pv.direction).toBe('toHub');
    expect(e.battery.direction).toBe('fromHub');
    expect(e.grid.direction).toBe('fromHub');
    expect(e.house.direction).toBe('fromHub');
    expect(model.power.pvStrings.map((r) => r.value)).toEqual([3.12, 2.58]);
  });
  it('night: only the grid feeds the house', () => {
    const now = Date.parse('2026-06-02T02:00:00+02:00');
    const demo = createEnergyDemo(now);
    const states = applyFlowScenario(Object.values(demo.states), 'night');
    const model = adaptEnergyEntities({
      bindings: demo.bindings,
      getState: (id) => states.find((s) => s.entity_id === id),
      now,
    });
    const e = flowEdges(model);
    expect([e.pv.direction, e.battery.direction, e.grid.direction]).toEqual([
      'idle',
      'idle',
      'toHub',
    ]);
  });
});

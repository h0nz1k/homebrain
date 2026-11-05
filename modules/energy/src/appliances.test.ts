import { describe, expect, it, vi } from 'vitest';
import { rank } from '@homebrain/signals';
import {
  adaptAppliances,
  applianceSignals,
  detectCycleFinish,
  energyAppliancesTodaySignalSource,
  fetchApplianceCycles,
  fetchApplianceToday,
  parsePowerHistory,
  type PowerPoint,
} from './appliances';
import { createEnergyDemo } from './fixtures';

const NOW = Date.parse('2026-10-31T10:40:00+01:00');
const MIN = 60_000;
const at = (minutesAgo: number, w: number | null): PowerPoint => ({ t: NOW - minutesAgo * MIN, w });

describe('adaptAppliances', () => {
  it('derives running/standby/off per slot threshold and hides unbound slots', () => {
    const demo = createEnergyDemo(NOW, 'day');
    const items = adaptAppliances({
      bindings: demo.bindings,
      getState: (id) => demo.states[id],
      now: NOW,
      houseTodayKwh: 10,
      extras: { todayKwh: { heat_pump: 3.8, coffee_maker: null } },
    });
    expect(items.map((a) => [a.slot, a.state])).toEqual([
      ['heat_pump', 'running'],
      ['dishwasher', 'running'],
      ['coffee_maker', 'standby'],
      ['dehumidifier', 'running'],
    ]);
    expect(items[0]!.power.value).toBeGreaterThan(100);
    expect(items[0]!.sharePercent).toBeCloseTo(38);
    // Unknown today's energy stays null (no silent zero).
    expect(items[2]!.todayKwh).toBeNull();
    expect(items[2]!.sharePercent).toBeNull();
    const onlyHeatPump = adaptAppliances({
      bindings: {
        energy_appliance_heat_pump_power: demo.bindings.energy_appliance_heat_pump_power!,
      },
      getState: (id) => demo.states[id],
      now: NOW,
      houseTodayKwh: null,
    });
    expect(onlyHeatPump.map((a) => a.slot)).toEqual(['heat_pump']);
    expect(
      adaptAppliances({ bindings: {}, getState: () => undefined, now: NOW, houseTodayKwh: 5 }),
    ).toEqual([]);
  });

  it('reads a switched-off plug as off and unavailable power as unknown', () => {
    const demo = createEnergyDemo(NOW, 'night');
    const items = adaptAppliances({
      bindings: demo.bindings,
      getState: (id) => demo.states[id],
      now: NOW,
      houseTodayKwh: 5,
    });
    expect(items.find((a) => a.slot === 'coffee_maker')!.state).toBe('off');
    expect(items.find((a) => a.slot === 'coffee_maker')!.switchOn).toBe(false);
    const dead = createEnergyDemo(NOW, 'unavailable');
    const unknown = adaptAppliances({
      bindings: dead.bindings,
      getState: (id) => dead.states[id],
      now: NOW,
      houseTodayKwh: null,
    });
    expect(unknown.every((a) => a.power.value === null)).toBe(true);
    expect(unknown.find((a) => a.slot === 'heat_pump')!.state).toBe('unknown');
  });

  it('accepts kW sensors and rejects unknown units', () => {
    const items = adaptAppliances({
      bindings: { energy_appliance_heat_pump_power: 'sensor.hp' },
      getState: () => ({
        entity_id: 'sensor.hp',
        state: '1.2',
        attributes: { unit_of_measurement: 'kW' },
        last_updated: new Date(NOW).toISOString(),
      }),
      now: NOW,
      houseTodayKwh: null,
    });
    expect(items[0]!.power.value).toBeCloseTo(1200);
    const bad = adaptAppliances({
      bindings: { energy_appliance_heat_pump_power: 'sensor.hp' },
      getState: () => ({
        entity_id: 'sensor.hp',
        state: '1.2',
        attributes: { unit_of_measurement: 'A' },
        last_updated: new Date(NOW).toISOString(),
      }),
      now: NOW,
      houseTodayKwh: null,
    });
    expect(bad[0]!.power.quality).toBe('invalid_unit');
    expect(bad[0]!.state).toBe('unknown');
  });
});

describe('detectCycleFinish', () => {
  const opts = { thresholdW: 10 };
  it('reports a program finished after 5 min below the threshold', () => {
    const cycle = detectCycleFinish(
      [at(200, 0.5), at(130, 2100), at(110, 40), at(60, 2000), at(45, 30), at(22, 0.6)],
      NOW,
      opts,
    )!;
    expect(cycle.endedAt).toBe(NOW - 22 * MIN);
    expect(cycle.startedAt).toBe(NOW - 130 * MIN);
    expect(cycle.finishedAt).toBe(NOW - 17 * MIN);
    expect(cycle.expiresAt).toBe(NOW - 22 * MIN + 120 * MIN);
    expect(cycle.energyKwh).toBeCloseTo(2.1 / 3 + 0.04 * (50 / 60) + 2.0 / 4 + 0.03 * (23 / 60), 3);
  });
  it('waits the quiet period and merges short pauses into one cycle', () => {
    expect(detectCycleFinish([at(60, 2000), at(3, 0.5)], NOW, opts)).toBeNull();
    const merged = detectCycleFinish([at(90, 2000), at(70, 1), at(67, 50), at(20, 1)], NOW, opts)!;
    expect(merged.startedAt).toBe(NOW - 90 * MIN);
  });
  it('ignores spikes, running programs, unknown values and expired notices', () => {
    expect(detectCycleFinish([at(40, 1500), at(37, 1)], NOW, opts)).toBeNull();
    expect(detectCycleFinish([at(60, 1), at(30, 2000)], NOW, opts)).toBeNull();
    expect(detectCycleFinish([at(90, 2000), at(30, null)], NOW, opts)).toBeNull();
    expect(detectCycleFinish([at(260, 2000), at(125, 1)], NOW, opts)).toBeNull();
    expect(detectCycleFinish([], NOW, opts)).toBeNull();
  });
});

it('parses compressed history with unit conversion', () => {
  const points = parsePowerHistory([
    { s: '1.5', a: { unit_of_measurement: 'kW' }, lu: NOW / 1000 - 60 },
    { s: 'unavailable', lu: NOW / 1000 - 30 },
    { s: '0.01', lc: NOW / 1000 },
  ]);
  expect(points.map((p) => p.w)).toEqual([1500, null, 10]);
  expect(parsePowerHistory(null)).toEqual([]);
});

describe('WS reads', () => {
  it('asks the recorder for the change since local midnight (read-only)', async () => {
    const demo = createEnergyDemo(NOW, 'day');
    const sent: Array<Record<string, unknown>> = [];
    const connection = {
      sendMessagePromise: vi.fn(async (message: { type: string }) => {
        sent.push(message);
        return demo.statistic(message as never);
      }) as never,
    };
    const today = await fetchApplianceToday(connection, demo.bindings, NOW);
    expect(Object.keys(today)).toEqual(['heat_pump', 'dishwasher', 'coffee_maker', 'dehumidifier']);
    expect(today.heat_pump).toBeGreaterThan(0);
    expect(sent[0]).toMatchObject({
      type: 'recorder/statistic_during_period',
      statistic_id: demo.bindings.energy_appliance_heat_pump_energy,
      fixed_period: {
        start_time: '2026-10-30T23:00:00.000Z',
        end_time: new Date(NOW).toISOString(),
      },
      types: ['change'],
    });
    expect(sent.every((m) => !String(m.type).startsWith('call_service'))).toBe(true);
    const failing = {
      sendMessagePromise: vi.fn(async () => Promise.reject(new Error('x'))) as never,
    };
    expect((await fetchApplianceToday(failing, demo.bindings, NOW)).heat_pump).toBeNull();
  });

  it('detects the finished dishwasher from the demo history', async () => {
    const demo = createEnergyDemo(NOW, 'day', 'Europe/Prague', 'finished');
    const connection = {
      sendMessagePromise: vi.fn(async (m: { type: string }) => demo.history(m as never)) as never,
    };
    const cycles = await fetchApplianceCycles(connection, demo.bindings, NOW);
    expect(cycles.dishwasher?.endedAt).toBe(NOW - 25 * MIN);
    const running = createEnergyDemo(NOW, 'day', 'Europe/Prague', 'running');
    const c2 = {
      sendMessagePromise: vi.fn(async (m: { type: string }) =>
        running.history(m as never),
      ) as never,
    };
    expect((await fetchApplianceCycles(c2, running.bindings, NOW)).dishwasher).toBeNull();
  });
});

describe('Dnes signal „Myčka dokončila“', () => {
  const cycle = {
    startedAt: NOW - 133 * MIN,
    endedAt: NOW - 25 * MIN,
    finishedAt: NOW - 20 * MIN,
    expiresAt: NOW + 95 * MIN,
    energyKwh: 1.24,
  };
  it('is a read-only notice valid for 2 h after the program ended', () => {
    const [signal] = applianceSignals({ dishwasher: cycle }, NOW);
    expect(signal).toMatchObject({
      module: 'energy',
      kind: 'event',
      severity: 'notice',
      title: 'Myčka dokončila',
      valid_to: new Date(NOW + 95 * MIN).toISOString(),
      value: { v: '1,2', unit: 'kWh' },
      action: { type: 'navigate', href: '/energy' },
    });
    expect(signal!.context).toContain('10:15');
    expect(signal!.context).toContain('1 h 48 min');
    expect(applianceSignals({ dishwasher: cycle }, NOW + 96 * MIN)).toEqual([]);
    expect(applianceSignals({ dishwasher: null }, NOW)).toEqual([]);
  });
  it('is shown on the kiosk and desktop Dnes layouts', () => {
    const signals = applianceSignals({ dishwasher: cycle }, NOW);
    for (const layout of ['kiosk', 'desktop', 'mobile'] as const) {
      const ranked = rank(signals, new Date(NOW), { layout, haConnected: true });
      expect(ranked.hero?.title).toBe('Myčka dokončila');
    }
  });
  it('feed reads bindings + history over WS and emits [] on errors', async () => {
    const demo = createEnergyDemo(NOW, 'day', 'Europe/Prague', 'finished');
    const connection = {
      sendMessagePromise: vi.fn(async (m: { type: string }) =>
        m.type === 'homebrain/bindings/get' ? { energy: demo.bindings } : demo.history(m as never),
      ) as never,
    };
    expect(energyAppliancesTodaySignalSource({})).toBeNull();
    const feed = energyAppliancesTodaySignalSource(
      { connection },
      { pollMs: 0, clock: () => NOW },
    )!;
    const got = await new Promise<string[]>((resolve) =>
      feed.subscribe((s) => resolve(s.map((x) => x.title))),
    );
    expect(got).toEqual(['Myčka dokončila']);
    const broken = energyAppliancesTodaySignalSource(
      {
        connection: {
          sendMessagePromise: vi.fn(async () => Promise.reject(new Error('x'))) as never,
        },
      },
      { pollMs: 0 },
    )!;
    expect(await new Promise((resolve) => broken.subscribe(resolve))).toEqual([]);
  });
});

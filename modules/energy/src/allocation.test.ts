import { describe, expect, it } from 'vitest';
import { adaptEnergyEntities, splitGridPhases } from './adapter.js';
import {
  applyFlowScenario,
  createEnergyDemo,
  FLOW_SCENARIOS,
  type FlowScenario,
} from './fixtures.js';
import {
  allocateFlows,
  FLOW_PAIRS,
  flowAllocation,
  roundParts,
  type FlowAllocation,
  type FlowPairId,
} from './flow.js';

const kw = (a: FlowAllocation, id: FlowPairId) => a.pairs[id].kw;
const active = (a: FlowAllocation) => FLOW_PAIRS.filter((id) => a.pairs[id].active);
const sum = (a: FlowAllocation, pred: (id: FlowPairId) => boolean) =>
  FLOW_PAIRS.filter(pred).reduce((s, id) => s + a.pairs[id].kw, 0);

/** Every node: allocated flows match its measurement within 10 W per pair (rounding). */
function expectConserved(
  input: { pv: number; grid: number; battery: number; house: number },
  a: FlowAllocation,
) {
  const tol = 0.03;
  const pv = Math.max(0, input.pv);
  expect(sum(a, (id) => id.startsWith('pv-'))).toBeCloseTo(pv, 1);
  expect(Math.abs(sum(a, (id) => id.endsWith('-house')) - input.house)).toBeLessThan(tol);
  expect(Math.abs(sum(a, (id) => id.startsWith('grid-')) - Math.max(0, input.grid))).toBeLessThan(
    tol,
  );
  expect(Math.abs(sum(a, (id) => id.endsWith('-grid')) - Math.max(0, -input.grid))).toBeLessThan(
    tol,
  );
  expect(
    Math.abs(sum(a, (id) => id.startsWith('battery-')) - Math.max(0, input.battery)),
  ).toBeLessThan(tol);
  expect(
    Math.abs(sum(a, (id) => id.endsWith('-battery')) - Math.max(0, -input.battery)),
  ).toBeLessThan(tol);
  expect(a.unallocatedKw).toBeLessThan(tol);
  expect(a.uncoveredKw).toBeLessThan(tol);
}

/** Balanced input: house = pv + grid + battery (signs: + import, + discharge). */
const balanced = (pv: number, grid: number, battery: number) => ({
  pv,
  grid,
  battery,
  house: Math.round((pv + grid + battery) * 1000) / 1000,
});

describe('allocateFlows – standard energy distribution', () => {
  it('noon: solar to the house first, then the battery, the rest exported', () => {
    const input = balanced(5.7, -0.68, -1.4);
    const a = allocateFlows(input)!;
    expect(kw(a, 'pv-house')).toBeCloseTo(3.62, 2);
    expect(kw(a, 'pv-battery')).toBeCloseTo(1.4, 2);
    expect(kw(a, 'pv-grid')).toBeCloseTo(0.68, 2);
    expect(active(a)).toEqual(['pv-house', 'pv-battery', 'pv-grid']);
    expectConserved(input, a);
  });

  it('weak sun: solar covers part of the house, grid the rest', () => {
    const input = balanced(0.8, 1.6, 0);
    const a = allocateFlows(input)!;
    expect(active(a)).toEqual(['pv-house', 'grid-house']);
    expect(kw(a, 'grid-house')).toBeCloseTo(1.6, 2);
    expectConserved(input, a);
  });

  it('evening: battery to the house first, surplus discharge to the grid', () => {
    const input = balanced(0, -0.9, 2.5);
    const a = allocateFlows(input)!;
    expect(kw(a, 'battery-house')).toBeCloseTo(1.6, 2);
    expect(kw(a, 'battery-grid')).toBeCloseTo(0.9, 2);
    expect(active(a)).toEqual(['battery-house', 'battery-grid']);
    expectConserved(input, a);
  });

  it('cheap night tariff: grid feeds the house, then charges the battery', () => {
    const input = balanced(0, 2.98, -2.5);
    const a = allocateFlows(input)!;
    expect(kw(a, 'grid-house')).toBeCloseTo(0.48, 2);
    expect(kw(a, 'grid-battery')).toBeCloseTo(2.5, 2);
    expect(active(a)).toEqual(['grid-house', 'grid-battery']);
    expectConserved(input, a);
  });

  it('sun + forced grid charge: PV surplus first, the rest of the charge from the grid', () => {
    const input = balanced(2, 1.5, -3);
    const a = allocateFlows(input)!;
    expect(kw(a, 'pv-house')).toBeCloseTo(0.5, 2);
    expect(kw(a, 'pv-battery')).toBeCloseTo(1.5, 2);
    expect(kw(a, 'grid-battery')).toBeCloseTo(1.5, 2);
    expect(kw(a, 'grid-house')).toBe(0);
    expectConserved(input, a);
  });

  it('sun + battery discharge + import together', () => {
    const input = balanced(1, 0.5, 1.2);
    const a = allocateFlows(input)!;
    expect(active(a)).toEqual(['pv-house', 'grid-house', 'battery-house']);
    expectConserved(input, a);
  });

  it('every sign combination conserves energy on every node', () => {
    const values = [-3.2, -0.7, -0.04, 0, 0.03, 0.9, 4.1];
    for (const pv of [0, 0.02, 1.3, 6.4])
      for (const grid of values)
        for (const battery of values) {
          const input = balanced(pv, grid, battery);
          if (input.house < 0) continue; // a house cannot produce power
          const a = allocateFlows(input)!;
          expectConserved(input, a);
          for (const id of FLOW_PAIRS) expect(a.pairs[id].kw).toBeGreaterThanOrEqual(0);
          // Grid never imports and exports at once, the battery never charges and discharges.
          expect(kw(a, 'pv-grid') * kw(a, 'grid-house')).toBe(0);
          expect(kw(a, 'battery-house') * kw(a, 'pv-battery')).toBe(0);
          expect(kw(a, 'grid-battery') * kw(a, 'battery-grid')).toBe(0);
        }
  });

  it('tiny flows are hidden and do not take a rounding unit', () => {
    const input = balanced(0.03, 0.4, 0);
    const a = allocateFlows(input)!;
    expect(a.pairs['pv-house'].active).toBe(false);
    expect(a.pairs['pv-house'].displayKw).toBe(0);
    expect(a.pairs['grid-house'].periodS).not.toBeNull();
    expect(a.pairs['pv-house'].periodS).toBeNull();
  });

  it('rounds the displayed pairs so one source adds up to its displayed total', () => {
    // 1.84 + 1.83 + 1.83 = 5.5 (plain rounding gives 1.8 × 3 = 5.4)
    const input = { pv: 5.5, grid: -1.83, battery: -1.83, house: 1.84 };
    const a = allocateFlows(input)!;
    const shown = (['pv-house', 'pv-battery', 'pv-grid'] as const).map(
      (id) => a.pairs[id].displayKw,
    );
    expect(Math.round(shown.reduce((s, v) => s + v, 0) * 10) / 10).toBe(5.5);
    expect(roundParts([1.84, 1.83, 1.83])).toEqual([1.9, 1.8, 1.8]);
    expect(roundParts([0.25, 0.25])).toEqual([0.3, 0.2]);
  });

  it('measurement mismatch is reported instead of invented flows', () => {
    const a = allocateFlows({ pv: 3, grid: 0, battery: 0, house: 2 })!;
    expect(kw(a, 'pv-house')).toBe(2);
    expect(a.unallocatedKw).toBeCloseTo(1, 2);
    const b = allocateFlows({ pv: 0, grid: 1, battery: 0, house: 1.5 })!;
    expect(b.uncoveredKw).toBeCloseTo(0.5, 2);
  });

  it('missing grid → null; missing house → derived from the balance', () => {
    expect(allocateFlows({ pv: 1, grid: null, battery: 0, house: 1 })).toBeNull();
    const a = allocateFlows({ pv: 2, grid: -0.5, battery: null, house: null })!;
    expect(kw(a, 'pv-house')).toBeCloseTo(1.5, 2);
    expect(kw(a, 'pv-grid')).toBeCloseTo(0.5, 2);
    // Negative PV (inverter standby draw) counts as no production.
    expect(
      allocateFlows({ pv: -0.02, grid: 0.4, battery: 0, house: 0.4 })!.pairs['pv-house'].kw,
    ).toBe(0);
  });
});

describe('flowAllocation on the dev scenarios', () => {
  const expected: Record<FlowScenario, FlowPairId[]> = {
    noon: ['pv-house', 'pv-battery', 'pv-grid'],
    evening: ['pv-house', 'battery-house'],
    night: ['grid-house'],
    nightcharge: ['grid-house', 'grid-battery'],
    morning: ['pv-house', 'pv-grid', 'grid-house'],
    mixed: ['pv-house', 'pv-battery', 'pv-grid', 'grid-house'],
    balanced: ['grid-house'],
    asym: ['pv-house', 'grid-house'],
    cloudy: ['pv-house', 'grid-house'],
    fault: ['grid-house'],
  };
  for (const sc of Object.keys(FLOW_SCENARIOS) as FlowScenario[])
    it(`${sc}: active pairs`, () => {
      const now = Date.parse('2026-06-02T13:00:00+02:00');
      const demo = createEnergyDemo(now);
      const states = applyFlowScenario(Object.values(demo.states), sc);
      const model = adaptEnergyEntities({
        bindings: demo.bindings,
        getState: (id) => states.find((s) => s.entity_id === id),
        now,
      });
      const a = flowAllocation(model)!;
      expect(active(a)).toEqual(expected[sc]);
      expect(a.balanced).toBe(true);
      expect(a.simultaneous).toBe(sc === 'mixed' || sc === 'morning');
      expect(model.power.gridFlow.mode).toBe('phases');
    });
});

describe('allocateFlows – simultaneous grid import and export', () => {
  it('one phase imports while the others export: two grid lines with their own values', () => {
    const a = allocateFlows({
      pv: 4.2,
      gridImport: 0.8,
      gridExport: 2.1,
      battery: -0.6,
      house: 2.3,
    })!;
    expect(active(a)).toEqual(['pv-house', 'pv-battery', 'pv-grid', 'grid-house']);
    expect(kw(a, 'grid-house')).toBeCloseTo(0.8, 2);
    expect(kw(a, 'pv-house')).toBeCloseTo(1.5, 2);
    expect(kw(a, 'pv-battery')).toBeCloseTo(0.6, 2);
    expect(kw(a, 'pv-grid')).toBeCloseTo(2.1, 2);
    expect(a.simultaneous).toBe(true);
    expect(a.balanced).toBe(true);
    expect(a.balanceKw).toBeCloseTo(0, 2);
    expect(a.unallocatedKw).toBe(0);
    expect(a.uncoveredKw).toBe(0);
    // Conservation: pv + discharge + import = house + charge + export, per node.
    expect(sum(a, (id) => id.startsWith('grid-'))).toBeCloseTo(0.8, 2);
    expect(sum(a, (id) => id.endsWith('-grid'))).toBeCloseTo(2.1, 2);
    expect(sum(a, (id) => id.endsWith('-house'))).toBeCloseTo(2.3, 2);
  });

  it('battery discharging into the grid while one phase imports', () => {
    const a = allocateFlows({ pv: 0, gridImport: 0.3, gridExport: 0.5, battery: 1.5, house: 1.3 })!;
    expect(kw(a, 'battery-house')).toBeCloseTo(1.0, 2);
    expect(kw(a, 'battery-grid')).toBeCloseTo(0.5, 2);
    expect(kw(a, 'grid-house')).toBeCloseTo(0.3, 2);
    expect(a.simultaneous).toBe(true);
    expect(a.unallocatedKw).toBe(0);
  });

  it('import charging the battery while solar exports', () => {
    const a = allocateFlows({ pv: 3, gridImport: 0.5, gridExport: 1, battery: -2, house: 0.5 })!;
    expect(kw(a, 'grid-battery') + kw(a, 'grid-house')).toBeCloseTo(0.5, 2);
    expect(kw(a, 'pv-grid')).toBeCloseTo(1, 2);
    expect(sum(a, (id) => id.endsWith('-battery'))).toBeCloseTo(2, 2);
    expect(a.unallocatedKw).toBe(0);
  });

  it('flags a broken balance (measurements disagree beyond the tolerance)', () => {
    const a = allocateFlows({ pv: 4, gridImport: 0.8, gridExport: 0.2, battery: 0, house: 2 })!;
    expect(a.balanceKw).toBeCloseTo(2.6, 2);
    expect(a.balanced).toBe(false);
    expect(
      allocateFlows({ pv: 1, gridImport: 0.5, gridExport: null, battery: 0, house: 1 }),
    ).toBeNull();
  });

  it('net-only fallback: a signed grid power never yields two grid lines', () => {
    for (const grid of [-2.1, -0.4, 0, 0.3, 1.7]) {
      const a = allocateFlows({ pv: 1.5, grid, battery: 0, house: Math.max(0, 1.5 + grid) })!;
      expect(a.simultaneous).toBe(false);
      expect(kw(a, 'grid-house') > 0 && kw(a, 'pv-grid') > 0).toBe(false);
    }
  });
});

describe('splitGridPhases – per-phase grid meter', () => {
  it('import = positive phases, export = negative phases', () => {
    expect(splitGridPhases([0.8, -1.05, -1.05], -1.3)).toEqual({
      importKw: 0.8,
      exportKw: 2.1,
      phasesKw: [0.8, -1.05, -1.05],
      meterSign: 1,
    });
  });
  it('flips a meter with the opposite convention (GoodWe: import −) using the net power', () => {
    expect(splitGridPhases([-0.8, 1.05, 1.05], -1.3)).toEqual({
      importKw: 0.8,
      exportKw: 2.1,
      phasesKw: [0.8, -1.05, -1.05],
      meterSign: -1,
    });
  });
  it('without a net power the phases define it; a contradiction or a missing phase is rejected', () => {
    expect(splitGridPhases([0.2, 0.3, 0.1], null)).toMatchObject({ importKw: 0.6, exportKw: 0 });
    expect(splitGridPhases([0.2, 0.3, 0.1], 2.5)).toBe('mismatch');
    expect(splitGridPhases([0.2, null, 0.1], 0.3)).toBeNull();
  });
});

describe('adapter grid modes', () => {
  const now = Date.parse('2026-06-02T13:00:00+02:00');
  const st = (entity_id: string, state: number) => ({
    entity_id,
    state: String(state),
    attributes: { unit_of_measurement: 'W' },
    last_updated: new Date(now - 5_000).toISOString(),
    last_changed: new Date(now - 5_000).toISOString(),
  });
  const run = (bindings: Record<string, string>, states: ReturnType<typeof st>[]) =>
    adaptEnergyEntities({
      bindings,
      getState: (id) => states.find((s) => s.entity_id === id),
      now,
    });
  const base = { energy_pv_power: 'sensor.pv', energy_house_power: 'sensor.house' };
  const baseStates = [st('sensor.pv', 4200), st('sensor.house', 2300), st('sensor.bat', -600)];

  it('per-phase meter → mode phases, import and export at the same time', () => {
    const m = run(
      {
        ...base,
        energy_battery_power: 'sensor.bat',
        energy_grid_power: 'sensor.net',
        energy_grid_l1_power: 'sensor.g1',
        energy_grid_l2_power: 'sensor.g2',
        energy_grid_l3_power: 'sensor.g3',
      },
      [
        ...baseStates,
        st('sensor.net', -1300),
        st('sensor.g1', 800),
        st('sensor.g2', -1050),
        st('sensor.g3', -1050),
      ],
    );
    expect(m.power.gridFlow).toMatchObject({ mode: 'phases', importKw: 0.8, exportKw: 2.1 });
    expect(flowAllocation(m)!.simultaneous).toBe(true);
  });

  it('separate import/export sensors → mode separate', () => {
    const m = run(
      {
        ...base,
        energy_battery_power: 'sensor.bat',
        energy_grid_import_power: 'sensor.imp',
        energy_grid_export_power: 'sensor.exp',
      },
      [...baseStates, st('sensor.imp', 800), st('sensor.exp', 2100)],
    );
    expect(m.power.gridFlow).toMatchObject({ mode: 'separate', importKw: 0.8, exportKw: 2.1 });
    expect(m.power.grid.value).toBeCloseTo(-1.3, 3);
    expect(flowAllocation(m)!.simultaneous).toBe(true);
  });

  it('net only (or phases that contradict the net) → one grid line', () => {
    const bindings = {
      ...base,
      energy_battery_power: 'sensor.bat',
      energy_grid_power: 'sensor.net',
      energy_grid_l1_power: 'sensor.g1',
      energy_grid_l2_power: 'sensor.g2',
      energy_grid_l3_power: 'sensor.g3',
    };
    // House load per phase bound by mistake as grid phases: the sum does not match the net.
    const m = run(bindings, [
      ...baseStates,
      st('sensor.net', -1300),
      st('sensor.g1', 900),
      st('sensor.g2', 700),
      st('sensor.g3', 700),
    ]);
    expect(m.power.gridFlow).toMatchObject({ mode: 'net', importKw: 0, exportKw: 1.3 });
    expect(m.notices).toContain('Součet fází sítě nesedí s výkonem sítě');
    const a = flowAllocation(m)!;
    expect(a.simultaneous).toBe(false);
    expect(active(a)).toEqual(['pv-house', 'pv-battery', 'pv-grid']);
  });
});

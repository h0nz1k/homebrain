import { describe, expect, it } from 'vitest';
import { adaptEnergyEntities, inverterErrorLabel, inverterStatusChip } from './adapter.js';
import {
  batteryTempState,
  cellTempSpread,
  cellVoltageSpread,
  inverterTempState,
} from './thermal.js';
import { applyFlowScenario, createEnergyDemo, type FlowScenario } from './fixtures.js';
import {
  allocateFlows,
  FLOW_LINKS,
  FLOW_PAIRS,
  flowAllocation,
  inverterAcKw,
  LANE_ORDER,
  laneKey,
  linkFlows,
  linkLanes,
  PAIR_LINKS,
  viaInverter,
  type FlowPairId,
} from './flow.js';

const scenarioModel = (sc: FlowScenario) => {
  const now = Date.parse('2026-06-02T13:00:00+02:00');
  const demo = createEnergyDemo(now);
  const states = applyFlowScenario(Object.values(demo.states), sc);
  return adaptEnergyEntities({
    bindings: demo.bindings,
    getState: (id) => states.find((s) => s.entity_id === id),
    now,
  });
};

describe('inverter hub topology', () => {
  it('every pair except grid → house passes the inverter', () => {
    expect(FLOW_PAIRS.filter((id) => !viaInverter(id))).toEqual(['grid-house']);
    // grid → battery: board → inverter AC side → DC → battery
    expect(PAIR_LINKS['grid-battery']).toEqual(['grid-ac', 'hub-ac', 'battery-hub']);
    expect(PAIR_LINKS['grid-house']).toEqual(['grid-ac', 'ac-house']);
  });

  it('routes are connected chains from the source to the target node', () => {
    const ends = (l: string) => l.split('-') as [string, string];
    for (const id of FLOW_PAIRS) {
      const [from, to] = id.split('-') as [string, string];
      let at = from;
      for (const link of PAIR_LINKS[id]) {
        const [a, b] = ends(link);
        expect([a, b]).toContain(at);
        at = a === at ? b : a;
      }
      expect(at).toBe(to);
    }
  });

  it('lane order lists exactly the pairs that use each link', () => {
    for (const link of FLOW_LINKS)
      expect([...LANE_ORDER[link]].sort()).toEqual(
        [
          ...new Set(
            FLOW_PAIRS.filter((id) => PAIR_LINKS[id].includes(link)).map((id) => laneKey(link, id)),
          ),
        ].sort(),
      );
    // One line per source on its own first link (the sun never shows three lines).
    expect(LANE_ORDER['pv-hub']).toEqual(['pv']);
    // grid import is the bottom lane on both bus halves → no jog under the board.
    expect(LANE_ORDER['grid-ac'].at(-1)).toBe('grid');
    expect(LANE_ORDER['ac-house'].at(-1)).toBe('grid-house');
  });

  it('lanes keep only active pairs in order', () => {
    const lanes = linkLanes(['grid-house', 'pv-grid', 'pv-house'] as FlowPairId[]);
    expect(lanes['grid-ac']).toEqual(['pv-grid', 'grid']);
    expect(lanes['ac-house']).toEqual(['pv-house', 'grid-house']);
    expect(lanes['hub-ac']).toEqual(['pv-grid', 'pv-house']);
    expect(lanes['battery-hub']).toEqual([]);
  });

  it('link powers: day surplus – PV feeds the hub, the inverter outputs house + export', () => {
    const a = allocateFlows({ pv: 5.7, grid: -0.68, battery: -1.4, house: 3.62 })!;
    const l = linkFlows(a);
    expect(l['pv-hub']).toBeCloseTo(5.7, 2);
    expect(l['battery-hub']).toBeCloseTo(-1.4, 2);
    expect(l['hub-ac']).toBeCloseTo(4.3, 2);
    expect(l['grid-ac']).toBeCloseTo(-0.68, 2);
    expect(l['ac-house']).toBeCloseTo(3.62, 2);
  });

  it('night grid charging: the inverter AC output is negative', () => {
    const a = allocateFlows({ pv: 0, grid: 2.98, battery: -2.5, house: 0.48 })!;
    const l = linkFlows(a);
    expect(l['hub-ac']).toBeCloseTo(-2.5, 2);
    expect(l['grid-ac']).toBeCloseTo(2.98, 2);
    expect(inverterAcKw(null, a)).toEqual({ kw: -2.5, derived: true });
    expect(inverterAcKw(-2.61, a)).toEqual({ kw: -2.61, derived: false });
    expect(inverterAcKw(null, null)).toEqual({ kw: null, derived: true });
  });

  it('evening discharge: battery → hub → board → house', () => {
    const a = allocateFlows({ pv: 0, grid: 0.08, battery: 1.86, house: 1.94 })!;
    const l = linkFlows(a);
    expect(l['battery-hub']).toBeCloseTo(1.86, 2);
    expect(l['hub-ac']).toBeCloseTo(1.86, 2);
    expect(l['ac-house']).toBeCloseTo(1.94, 2);
  });

  it('conservation at the hub and the board on every scenario', () => {
    for (const sc of ['noon', 'evening', 'nightcharge', 'mixed', 'fault'] as FlowScenario[]) {
      const l = linkFlows(flowAllocation(scenarioModel(sc))!);
      expect(l['pv-hub'] + l['battery-hub']).toBeCloseTo(l['hub-ac'], 2);
      expect(l['hub-ac'] + l['grid-ac']).toBeCloseTo(l['ac-house'], 2);
    }
  });
});

describe('inverter detail in the model', () => {
  it('reads AC output, phases, DC side and the work mode', () => {
    const m = scenarioModel('noon');
    expect(m.inverter).toMatchObject({ label: 'Normální', tone: 'ok' });
    expect(m.inverterDetail.acPower.value).toBeCloseTo(4.3, 2);
    expect(m.inverterDetail.acPhases.map((r) => r.value !== null)).toEqual([true, true, true]);
    expect(m.inverterDetail.pvVoltages[0].value).toBeGreaterThan(300);
    expect(m.inverterDetail.batteryCurrent.value).toBeLessThan(0);
    expect(m.inverterDetail.error).toBeNull();
    expect(m.inverterDetail.tempRadiator.value).toBeGreaterThan(30);
    expect(m.inverterDetail.soh.value).toBe(96);
    expect(m.inverterDetail.cellVoltageMax.value).toBeGreaterThan(3.3);
  });

  it('fault: Porucha + Czech error', () => {
    const m = scenarioModel('fault');
    expect(m.inverter).toMatchObject({ label: 'Porucha', tone: 'err' });
    expect(m.inverterDetail.error?.label).toBe('porucha izolace FV');
    expect(m.inverterDetail.acPower.value).toBe(0);
  });

  it('work modes map to Normální / Offgrid / Porucha / Standby', () => {
    expect(inverterStatusChip('Normal (On-Grid)').label).toBe('Normální');
    expect(inverterStatusChip('Normal (Off-Grid)')).toMatchObject({
      label: 'Offgrid',
      tone: 'warn',
    });
    expect(inverterStatusChip('Fault Mode')).toMatchObject({ label: 'Porucha', tone: 'err' });
    expect(inverterStatusChip('Wait Mode')).toMatchObject({ label: 'Standby', tone: 'idle' });
  });

  it('error labels: empty/0 = none, numeric code, comma list translated', () => {
    expect(inverterErrorLabel('')).toBeNull();
    expect(inverterErrorLabel('0')).toBeNull();
    expect(inverterErrorLabel('2048')?.label).toBe('kód chyby 2048');
    expect(inverterErrorLabel('Utility Loss, Over Temperature')?.label).toBe(
      'výpadek sítě, přehřátí střídače',
    );
    expect(inverterErrorLabel('Something new')?.label).toBe('Something new');
  });
});

describe('thermal thresholds (orientational, documented in thermal.ts)', () => {
  it('battery LFP: slow below 10 °C, stop at 0 °C, warn above 40 °C', () => {
    expect(batteryTempState(21).tone).toBe('ok');
    expect(batteryTempState(6).tone).toBe('cold');
    expect(batteryTempState(0).tone).toBe('crit');
    expect(batteryTempState(43).tone).toBe('warn');
    expect(batteryTempState(51).tone).toBe('crit');
  });
  it('inverter radiator: notice ≥ 60 °C, warn ≥ 70 °C', () => {
    expect(inverterTempState(52).tone).toBe('ok');
    expect(inverterTempState(62).tone).toBe('notice');
    expect(inverterTempState(72).tone).toBe('warn');
  });
  it('cell spreads: mV from max/min cell voltage, °C for temperatures', () => {
    expect(cellVoltageSpread(3.495, 3.472)).toMatchObject({ spread: 23, tone: 'ok' });
    expect(cellVoltageSpread(3.62, 3.41)?.tone).toBe('notice');
    expect(cellVoltageSpread(null, 3.4)).toBeNull();
    expect(cellTempSpread(21.0, 17.4)).toMatchObject({ spread: 3.6, tone: 'ok' });
    expect(cellTempSpread(0, 0)).toMatchObject({ spread: 0 });
  });
});

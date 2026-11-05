import { describe, expect, it } from 'vitest';
import { adaptEnergyEntities } from '../adapter';
import { applyFlowScenario, createEnergyDemo, type FlowScenario } from '../fixtures';
import { flowHeadline } from './EnergyFlowHero';

const NOW = Date.parse('2026-06-02T13:00:00+02:00');
function headline(scenario: FlowScenario) {
  const demo = createEnergyDemo(NOW, 'day');
  const states = Object.fromEntries(
    applyFlowScenario(Object.values(demo.states), scenario).map((s) => [s.entity_id, s]),
  );
  return flowHeadline(
    adaptEnergyEntities({ bindings: demo.bindings, getState: (id) => states[id], now: NOW }),
  );
}

describe('flowHeadline – own sources', () => {
  it('grid charging the battery while the sun covers the house is not 100 % own', () => {
    // Sun 4.7 kW, house 1.6 kW, battery charges 9.4 kW = sun 3.1 + grid 6.3.
    const head = headline('suncharge');
    expect(head.title).toBe('Slunce pokrývá dům, baterie se nabíjí i ze sítě');
    // Rule: own share of ALL consumption (house + battery charging) = 1 − 6.3 / 11.0.
    expect(head.ownPercent).toBe(43);
  });
  it('never claims 100 % while anything is imported', () => {
    for (const scenario of ['suncharge', 'nightcharge', 'noon', 'evening', 'night'] as const) {
      const head = headline(scenario);
      const demo = createEnergyDemo(NOW, 'day');
      const states = Object.fromEntries(
        applyFlowScenario(Object.values(demo.states), scenario).map((s) => [s.entity_id, s]),
      );
      const m = adaptEnergyEntities({
        bindings: demo.bindings,
        getState: (id) => states[id],
        now: NOW,
      });
      const imports = (m.power.gridFlow.importKw ?? Math.max(0, m.power.grid.value ?? 0)) > 0.05;
      if (imports) expect(head.ownPercent, scenario).toBeLessThan(100);
    }
  });
  it('sun covering house and battery without import stays 100 %', () => {
    const head = headline('noon');
    expect(head.title).toBe('Slunce pokrývá dům, nabíjí baterii a přebytek posílá do sítě');
    expect(head.ownPercent).toBe(100);
  });
});

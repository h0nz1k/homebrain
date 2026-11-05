import { describe, expect, it } from 'vitest';
import { rank } from '@homebrain/signals';
import { adaptEnergyEntities } from './adapter';
import { createEnergyDemo, type EnergyScenario } from './fixtures';
import { energySignals } from './signals';
import type { EnergyHistory } from './contract';

const NOW = Date.parse('2026-10-31T10:40:00+01:00');
function model(now = NOW, scenario: EnergyScenario = 'day') {
  const demo = createEnergyDemo(now, scenario);
  const m = adaptEnergyEntities({
    bindings: demo.bindings,
    getState: (id) => demo.states[id],
    now,
  });
  const history: EnergyHistory = {
    hourly: {},
    daily: {
      energy_house_energy_today: [14, 15, 13, 16, 14, 15, 9].map((value, i) => ({
        start: i,
        value,
      })),
    },
    status: 'ready',
  };
  return { m, history };
}

describe('energySignals', () => {
  it('reports a low battery at night without service actions', () => {
    const now = Date.parse('2026-10-31T22:10:00+01:00');
    const { m } = model(now, 'night');
    const low = energySignals(m).find((s) => s.id === 'energy.battery.low')!;
    expect(low).toMatchObject({ severity: 'warning', tone: 'risk', title: 'Baterie 9 %' });
    expect(energySignals(m).every((s) => s.action?.type !== 'service')).toBe(true);
  });

  it('detects export peaks and consumption anomalies', () => {
    const noon = Date.parse('2026-10-31T12:00:00+01:00');
    const demo = createEnergyDemo(noon);
    demo.states[demo.bindings.energy_grid_power!]!.state = '-3600';
    demo.states[demo.bindings.energy_grid_import_power!]!.state = '0';
    demo.states[demo.bindings.energy_grid_export_power!]!.state = '3600';
    const m = adaptEnergyEntities({
      bindings: demo.bindings,
      getState: (id) => demo.states[id],
      now: noon,
    });
    expect(energySignals(m).map((s) => s.id)).toContain('energy.export.peak');

    const { m: anomaly, history } = model(NOW, 'anomaly');
    const high = energySignals(anomaly, history).find((s) => s.id === 'energy.consumption.high')!;
    expect(high.title).toBe('Vysoká spotřeba 6,4 kW');
    expect(energySignals(anomaly).some((s) => s.id === 'energy.consumption.high')).toBe(false);
  });

  it('stays silent on unavailable data and ranks with packages/signals', () => {
    const { m: dead } = model(NOW, 'unavailable');
    expect(energySignals(dead)).toEqual([]);
    const { m, history } = model(NOW, 'anomaly');
    const ranked = rank(energySignals(m, history), new Date(NOW));
    expect(ranked.all.length).toBeGreaterThan(0);
  });
});

it('never suggests when to run appliances (no cheap-power windows)', () => {
  const { m, history } = model();
  expect(energySignals(m, history).filter((s) => s.kind === 'window')).toEqual([]);
});

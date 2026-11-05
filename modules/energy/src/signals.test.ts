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
  it('announces the upcoming cheap window with saving and Czech hour range', () => {
    const { m, history } = model();
    const cheap = energySignals(m, history).find((s) => s.kind === 'window')!;
    expect(cheap).toMatchObject({
      module: 'energy',
      group: 'energy.opportunity',
      tone: 'opportunity',
      severity: 'info',
      title: 'Levný proud 13–15 h',
      value: { v: '0,90', unit: 'Kč/kWh' },
    });
    expect(cheap.context).toMatch(/^O \d+ % levnější/);
    expect(cheap.action).toEqual({ type: 'navigate', label: 'Energie', href: '/energy' });
  });

  it('says "teď" inside the window', () => {
    const now = Date.parse('2026-10-31T13:20:00+01:00');
    const { m } = model(now);
    const cheap = energySignals(m).find((s) => s.kind === 'window')!;
    // Rest of today wins over a slightly cheaper window tomorrow; the active window is "teď".
    expect(cheap).toMatchObject({ title: 'Levný proud teď', severity: 'notice' });
    expect(cheap.valid_from).toBe('2026-10-31T12:00:00.000Z');
    expect(m.price.cheapestNext!.end).toBe(Date.parse('2026-10-31T15:00:00+01:00'));
  });

  it('falls back to tomorrow late in the evening and says "zítra"', () => {
    const now = Date.parse('2026-10-31T23:10:00+01:00');
    const { m } = model(now);
    const cheap = energySignals(m).find((s) => s.kind === 'window')!;
    expect(cheap.title).toBe('Levný proud zítra 13–15 h');
  });

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
    expect(energySignals(dead).filter((s) => s.kind !== 'window')).toEqual([]);
    const { m, history } = model();
    const ranked = rank(energySignals(m, history), new Date(NOW));
    expect(ranked.all.length).toBeGreaterThan(0);
  });
});

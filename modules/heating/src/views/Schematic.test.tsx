import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { buildMockSnapshot, type HeatingScenario } from '../mock.js';
import { heroScene } from '../model.js';
import { HeatingSchematic } from './Schematic.js';

afterEach(cleanup);
const active: Record<string, string[]> = {
  heating: ['compressor-outlet', 'tank-inlet', 'tank-return', 'collector'],
  dhw: ['compressor-outlet', 'dhw-inlet', 'tank-return', 'collector'],
  house: ['mixing-hot', 'radiator-supply', 'radiator-return', 'house-tank-return', 'mixing-bypass'],
  idle: [],
};
describe('C3 measured state and routes', () => {
  for (const [scenario, pipes] of Object.entries(active)) {
    it(`${scenario}: only the approved pipes carry heat`, () => {
      const snap = buildMockSnapshot(scenario as HeatingScenario, 0);
      render(<HeatingSchematic snap={snap} />);
      expect(heroScene(snap).activePipes).toEqual(pipes);
      expect(
        Array.from(document.querySelectorAll('[data-active]'), (el) =>
          el.getAttribute('data-pipe-id'),
        ),
      ).toEqual(expect.arrayContaining(pipes));
      expect(document.querySelectorAll('[data-active]')).toHaveLength(pipes.length);
      expect(document.querySelector('[data-pipe-id="dhw-draw"] circle')).toBeNull();
      expect(document.querySelectorAll('[data-pump]')).toHaveLength(2);
      const legend = screen.getByRole('list', { name: 'Legenda schématu' });
      expect(legend.querySelectorAll('li')).toHaveLength(6);
      expect(
        Array.from(document.querySelectorAll('[data-marker]'), (el) => el.textContent),
      ).toEqual(['1', '2', '3', '4', '5', '6']);
      expect(document.querySelector('[data-label-leader]')).toBeNull();
      expect(legend.textContent).not.toContain('℃');
    });
  }
  it('null values stay unknown, including the diverter output', () => {
    const snap = buildMockSnapshot('heating', 0);
    snap.heat_pump.compressor_on = null;
    snap.heat_pump.condenser_out = null;
    snap.heat_pump.return_temp = null;
    snap.house.supply_temp = null;
    snap.house.mixing_valve_pct = null;
    snap.dhw.valve_to_dhw = null;
    snap.dhw.temp = null;
    snap.dhw.target = null;
    snap.tank.bottom = null;
    render(<HeatingSchematic snap={snap} />);
    for (const id of ['hp-out', 'hp-in', 'dhw', 'tank']) {
      expect(screen.getByTestId(`heating-sch-${id}`).textContent).not.toContain('—');
      expect(screen.getByTestId(`heating-sch-${id}`).classList.contains('ht-c3-muted')).toBe(true);
    }
    expect(document.querySelector('[data-valve]')?.getAttribute('data-valve')).toBe('unknown');
    expect(heroScene(snap).activePipes).not.toContain('collector');
  });
  it('stopped compressor and heating pump mute last measurements and hide mixing percentage', () => {
    const snap = buildMockSnapshot('idle', 0);
    render(<HeatingSchematic snap={snap} />);
    for (const id of ['hp-out', 'hp-in', 'supply'])
      expect(screen.getByTestId(`heating-sch-${id}`).classList.contains('ht-c3-muted')).toBe(true);
    expect(screen.getByTestId('heating-sch-mixing').textContent).toBe('směšovací ventil');
    expect(screen.getByTestId('heating-sch-supply').textContent).toBe('do topení');
    expect(screen.getByTestId('heating-sch-hp-in').textContent).toContain('29,7');
  });
  it('mixing percentage requires a running pump and a mapped value; 100 closes bypass', () => {
    const snap = buildMockSnapshot('house', 0);
    const { rerender } = render(<HeatingSchematic snap={snap} />);
    expect(screen.getByTestId('heating-sch-mixing').textContent).toContain('72 %');
    snap.house.mixing_valve_pct = 100;
    rerender(<HeatingSchematic snap={snap} />);
    expect(screen.getByTestId('heating-sch-mixing').textContent).toContain('100 %');
    expect(heroScene(snap).activePipes).not.toContain('mixing-bypass');
    snap.house.mixing_valve_pct = null;
    rerender(<HeatingSchematic snap={snap} />);
    expect(screen.getByTestId('heating-sch-mixing').textContent).toBe('směšovací ventil');
    expect(screen.getByTestId('heating-sch-supply').textContent).toContain('37,8');
  });
  it('diverter follows the output even when it disagrees with activity', () => {
    const snap = buildMockSnapshot('dhw', 0);
    snap.dhw.valve_to_dhw = false;
    const { rerender } = render(<HeatingSchematic snap={snap} />);
    expect(document.querySelector('[data-valve]')?.getAttribute('data-valve')).toBe('tank');
    snap.dhw.valve_to_dhw = true;
    rerender(<HeatingSchematic snap={snap} />);
    expect(screen.getByTestId('heating-sch-valve').textContent).toContain('→ ohřevTUV');
  });
  for (const activity of ['cooling', 'fault', 'blocked_hdo'] as const) {
    it(`${activity} keeps an idle drawing`, () => {
      const snap = buildMockSnapshot('idle', 0);
      snap.activity = activity;
      expect(heroScene(snap).scenario).toBe('idle');
      expect(heroScene(snap).activePipes).toEqual([]);
    });
  }
  it('compressor LED replaces the old status panel', () => {
    const snap = buildMockSnapshot('heating', 0);
    const { rerender } = render(<HeatingSchematic snap={snap} />);
    const led = document.querySelector('[data-testid="heating-sch-compressor-led"]')!;
    expect(led.classList.contains('ht-c3-comp-led-on')).toBe(true);
    expect(document.querySelector('[data-label="compressor"]')).toBeNull();
    expect(document.querySelector('.ht-c3-display')).toBeNull();
    snap.heat_pump.compressor_on = false;
    rerender(<HeatingSchematic snap={snap} />);
    expect(
      document.querySelector('[data-testid="heating-sch-compressor-led"]')!.classList,
    ).toContain('ht-c3-comp-led-off');
  });
});

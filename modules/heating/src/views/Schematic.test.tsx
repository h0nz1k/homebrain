import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { buildMockSnapshot, type HeatingScenario } from '../mock.js';
import { heroScene } from '../model.js';
import { HeatingSchematic } from './Schematic.js';

afterEach(cleanup);
const active: Record<string, string[]> = {
  heating: ['hp-supply', 'hp-return', 'collector'],
  dhw: ['hp-supply', 'hp-return', 'collector'],
  house: ['heat-supply', 'heat-return'],
  idle: [],
  solar: ['solar-supply', 'solar-return'],
};

describe('C3 measured state and routes', () => {
  for (const [scenario, pipes] of Object.entries(active)) {
    it(`${scenario}: only the approved pipes carry heat`, () => {
      const snap = buildMockSnapshot(scenario as HeatingScenario, 0);
      render(<HeatingSchematic snap={snap} />);
      const scenePipes = heroScene(snap).activePipes;
      if (scenario === 'solar') {
        expect(scenePipes).toEqual(expect.arrayContaining(pipes));
        expect(scenePipes).toHaveLength(pipes.length);
      } else {
        expect(scenePipes).toEqual(pipes);
      }
      expect(
        Array.from(document.querySelectorAll('[data-active]'), (el) =>
          el.getAttribute('data-pipe-id'),
        ),
      ).toEqual(expect.arrayContaining(pipes));
      expect(document.querySelectorAll('[data-active]')).toHaveLength(pipes.length);
      expect(document.querySelector('[data-pipe-id="dhw-draw"] circle')).toBeNull();
      const extraSolar = snap.extras.solar != null ? 1 : 0;
      expect(document.querySelectorAll('[data-pump]')).toHaveLength(2 + extraSolar);
    });
  }

  it('without solar mapping: panel, coil, solar pipes and pump hidden', () => {
    const snap = buildMockSnapshot('heating', 0);
    snap.extras.solar = null;
    render(<HeatingSchematic snap={snap} />);
    expect(document.querySelector('[data-testid="heating-sch-solar-panel"]')).toBeNull();
    expect(document.querySelector('[data-pipe-id="solar-supply"]')).toBeNull();
    expect(document.querySelector('[data-pipe-id="solar-return"]')).toBeNull();
    expect(document.querySelector('[data-pump="solar"]')).toBeNull();
    expect(document.querySelectorAll('[data-pump]')).toHaveLength(2);
    expect(document.querySelector('[data-solar]')).toBeNull();
  });

  it('null values stay unknown with muted cards', () => {
    const snap = buildMockSnapshot('heating', 0);
    snap.heat_pump.compressor_on = null;
    snap.heat_pump.power_w = null;
    snap.house.supply_temp = null;
    snap.dhw.temp = null;
    snap.dhw.target = null;
    snap.tank.bottom = null;
    render(<HeatingSchematic snap={snap} />);
    for (const id of ['dhw', 'tank', 'hp-state']) {
      expect(screen.getByTestId(`heating-sch-${id}`).classList.contains('ht-c3-muted')).toBe(true);
    }
    expect(heroScene(snap).activePipes).not.toContain('collector');
  });

  it('simplified schematic has no valve, mixing, cold inlet or legacy labels', () => {
    const snap = buildMockSnapshot('house', 0);
    render(<HeatingSchematic snap={snap} />);
    expect(document.querySelector('[data-valve]')).toBeNull();
    expect(document.querySelector('[data-pipe-id="cold-water"]')).toBeNull();
    expect(screen.queryByTestId('heating-sch-valve')).toBeNull();
    expect(screen.queryByTestId('heating-sch-mixing')).toBeNull();
    expect(screen.queryByTestId('heating-sch-hp-out')).toBeNull();
    expect(screen.queryByTestId('heating-sch-charge')).toBeNull();
    expect(screen.queryByTestId('heating-sch-house-pump')).toBeNull();
    expect(screen.getByTestId('heating-sch-tap').textContent).toBe('Odběr teplé vody');
    expect(screen.getByTestId('heating-sch-hp').textContent).toBe('Tepelnéčerpadlo');
    expect(screen.getByTestId('heating-sch-heat').textContent).toBe('Topení');
    expect(screen.queryByText('Nádrž nahoře')).toBeNull();
  });

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

  for (const activity of ['cooling', 'fault', 'blocked_hdo'] as const) {
    it(`${activity} keeps an idle drawing`, () => {
      const snap = buildMockSnapshot('idle', 0);
      snap.activity = activity;
      expect(heroScene(snap).scenario).toBe('idle');
      expect(heroScene(snap).activePipes).toEqual([]);
    });
  }

  it('off state: no active pipes, muted HP state', () => {
    const snap = buildMockSnapshot('off', 0);
    const scene = heroScene(snap);
    expect(scene.activePipes).toEqual([]);
    expect(scene.schematicOff).toBe(true);
    render(<HeatingSchematic snap={snap} />);
    const root = screen.getByTestId('heating-schematic');
    expect(root.getAttribute('data-state')).toBe('off');
    expect(root.querySelector('[data-active].ht-c3-hot')).toBeNull();
    expect(root.querySelector('.ht-c3-direction')).toBeNull();
    expect(screen.getByTestId('heating-sch-off-note').textContent).toBe(
      'Teploty: naposledy naměřené',
    );
  });
});

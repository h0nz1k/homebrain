import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { buildMockSnapshot, withMixerFault } from '../mock.js';
import { FullSchematic } from './FullSchematic.js';

afterEach(cleanup);
const NOW = Date.parse('2026-01-12T10:00:00Z');

describe('FullSchematic (live data)', () => {
  it('draws chevrons only on flowing pipes and none on closed / idle legs', () => {
    render(<FullSchematic snap={buildMockSnapshot('heating', 0, NOW)} theme="dark" />);
    const routes = new Set(
      Array.from(document.querySelectorAll('[data-flow-route]'), (el) =>
        el.getAttribute('data-flow-route'),
      ),
    );
    expect(routes.size).toBeGreaterThan(0);
    for (const r of routes) {
      expect(document.querySelector(`path[data-route="${r}"]`)?.getAttribute('data-state')).toBe(
        'flow',
      );
    }
    expect(routes.has('valve_to_tuv')).toBe(false);
    expect(routes.has('chlad_to_hx')).toBe(false);
  });

  it('missing values show – with the no-data style, never a placeholder number', () => {
    render(<FullSchematic snap={buildMockSnapshot('heating', 0, NOW)} theme="dark" />);
    const coll = document.querySelector('[data-label="hp_coll_in"]')!;
    expect(coll.textContent).toContain('Z kolektoru');
    expect(coll.querySelector('[data-reading="none"]')?.textContent?.trim()).toBe('–');
    const out = document.querySelector('[data-label="hp_t_out"]')!;
    expect(out.querySelector('[data-reading=""]')?.textContent).toMatch(/46,0\s?°C/u);
  });

  it('mixer fault: ring + badge on the valve body, pill and A→AB open path, B leg grey', () => {
    render(
      <FullSchematic
        snap={withMixerFault(buildMockSnapshot('house', 0, NOW), NOW)}
        theme="light"
      />,
    );
    expect(screen.getByTestId('heating-full-mix-fault')).toBeTruthy();
    const valve = document.querySelector('[data-glyph="valve_mix"]')!;
    expect(valve.getAttribute('data-path')).toBe('A');
    expect(valve.querySelector('[data-fault-glyph]')).not.toBeNull();
    expect(valve.querySelector('[data-open-path]')).not.toBeNull();
    expect(
      document.querySelector('path[data-route="jbyp_to_mix"]')?.getAttribute('data-state'),
    ).toBe('closed');
    expect(document.querySelector('[data-junction="j_byp"]')).not.toBeNull();
    expect(document.querySelector('[data-bridge="jbyp_to_mix"]')).not.toBeNull();
  });

  it('no PLC codes in the normal view; service view shows the addresses of the private map', () => {
    const snap = buildMockSnapshot('heating', 0, NOW);
    const { unmount } = render(<FullSchematic snap={snap} theme="dark" />);
    expect(document.querySelectorAll('[data-service-code]')).toHaveLength(0);
    expect(document.querySelector('svg')!.textContent).not.toMatch(/\b[XYR]\d{2,4}\b/u);
    unmount();
    render(<FullSchematic snap={snap} service theme="dark" />);
    const codes = Array.from(
      document.querySelectorAll('[data-service-code]'),
      (el) => el.textContent,
    );
    expect(codes).toContain('X336');
    expect(codes).toContain('X360');
  });

  it('heat pump: production proportions, LED + compressor state, readouts outside', () => {
    render(<FullSchematic snap={buildMockSnapshot('idle', 0, NOW)} theme="dark" />);
    const hp = screen.getByTestId('heating-full-hp');
    expect(hp.getAttribute('data-compressor')).toBe('off');
    const cab = hp.querySelector('.fs-hp-cabinet')!;
    const w = Number(cab.getAttribute('width'));
    const h = Number(cab.getAttribute('height'));
    expect(w / h).toBeCloseTo(66 / 88, 3);
    expect(Number(cab.getAttribute('rx')) / w).toBeCloseTo(9 / 66, 3);
    const cut = hp.querySelector('.fs-hp-cutaway')!;
    expect(Number(cut.getAttribute('height')) / h).toBeCloseTo(29 / 88, 3);
    expect(hp.querySelector('.fs-comp-off')).not.toBeNull();
    expect(screen.getByTestId('heating-full-hp-state').textContent).toContain('TČ stojí');
  });

  it('keeps the on-site questions visible as ? markers and in the legend', () => {
    render(<FullSchematic snap={buildMockSnapshot('heating', 0, NOW)} theme="dark" />);
    const badges = Array.from(
      document.querySelectorAll('[data-badge-for] text'),
      (el) => el.textContent,
    );
    expect(badges).toEqual(expect.arrayContaining(['?1', '?2', '?3', '?']));
    const text = document.querySelector('svg')!.textContent!;
    expect(text).toContain('OVĚŘIT NA MÍSTĚ');
    expect(text).toContain('Zemní kolektor');
  });
});

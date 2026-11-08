import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import type { ModuleViewProps } from '@homebrain/ha-client';
import HeatingView from './HeatingView.js';

const base = {} as ModuleViewProps;
import { setHeatingApiFactory } from '../api.js';
import { createMockHeatingApi, type HeatingScenario } from '../mock.js';

function mount(scenario: HeatingScenario, rooms = 4, path = '') {
  const api = createMockHeatingApi({ scenario, rooms });
  setHeatingApiFactory(() => api);
  return render(<HeatingView {...base} route={{ path }} />);
}

afterEach(cleanup);

describe('HeatingView', () => {
  it('Teď: plain sentence + schematic with spinning pumps only while they run', async () => {
    mount('heating');
    await waitFor(() =>
      expect(screen.getByTestId('heating-headline').textContent).toContain('nahřívá nádrž'),
    );
    const sch = screen.getByTestId('heating-schematic');
    expect(sch.dataset.compressor).toBe('on');
    expect(sch.querySelector('[data-pump="primary"]')?.hasAttribute('data-on')).toBe(true);
    expect(sch.querySelector('[data-pump="circulation"]')?.hasAttribute('data-on')).toBe(false);
    expect(sch.querySelector('[data-pipe="brine"]')).not.toBeNull();
    expect(screen.queryByTestId('heating-backup')).toBeNull();
  });

  it('fault shows the backup heater and the critical pill', async () => {
    mount('fault');
    await waitFor(() =>
      expect(screen.getByTestId('heating-pill').textContent).toContain('Porucha'),
    );
    expect(screen.getByTestId('heating-backup')).not.toBeNull();
    expect(screen.getByTestId('heating-schematic').querySelector('[data-pipe]')).toBeNull();
  });

  it('Místnosti without bound sensors explains how to add them', async () => {
    mount('heating', 0, '/mistnosti');
    await waitFor(() =>
      expect(screen.getByTestId('heating-rooms-empty').textContent).toContain('Aqara'),
    );
  });

  it('unconfigured hides the tabs', async () => {
    mount('unconfigured');
    await waitFor(() => expect(screen.getByTestId('heating-unconfigured')).not.toBeNull());
    expect(screen.queryByRole('radiogroup', { name: 'Sekce' })).toBeNull();
  });

  it('kiosk gets no heating detail', () => {
    const api = createMockHeatingApi({ scenario: 'heating' });
    setHeatingApiFactory(() => api);
    render(<HeatingView {...base} kiosk />);
    expect(screen.getByText('Topení je na nástěnce jen ve Dnes')).not.toBeNull();
  });
});

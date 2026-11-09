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
      expect(screen.getByTestId('heating-headline').textContent).toContain('nahříváme nádrž'),
    );
    const sch = screen.getByTestId('heating-schematic');
    expect(sch.dataset.compressor).toBe('on');
    expect(sch.querySelector('[data-pump="charge"]')?.hasAttribute('data-on')).toBe(true);
    expect(sch.querySelector('[data-pump="circulation"]')).toBeNull(); // not mapped (null)
    expect(sch.querySelector('[data-pipe-id="collector"]')).not.toBeNull();
    expect(screen.queryByTestId('heating-backup')).toBeNull();
    expect(screen.getByTestId('heating-sch-collector').textContent).toBe('Zemní kolektor');
    expect(screen.queryByText(/Chlazení/)).toBeNull();
  });

  it('fault shows the critical pill and no backup heater (regulation has none)', async () => {
    mount('fault');
    await waitFor(() =>
      expect(screen.getByTestId('heating-pill').textContent).toContain('Porucha'),
    );
    expect(screen.queryByTestId('heating-backup')).toBeNull();
    expect(screen.getByTestId('heating-schematic').querySelector('[data-active]')).toBeNull();
  });

  it('Místnosti without bound sensors explains how to add them', async () => {
    mount('heating', 0, '/mistnosti');
    await waitFor(() =>
      expect(screen.getByTestId('heating-rooms-empty').textContent).toContain('Aqara'),
    );
    const ref = screen.getByTestId('heating-ref-room');
    expect(ref.contains(screen.getByTestId('heating-rooms-empty'))).toBe(true);
    expect(ref.textContent).toContain('řídí topení celého domu');
    expect(ref.textContent).toContain('cíl 22,5');
    expect(ref.textContent).toContain('Nastavení HomeBrain → Moduly → Topení');
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

it('unknown cooling is hidden in Modes', async () => {
  mount('heating', 0, '/rezimy');
  await waitFor(() => expect(screen.getByTestId('heating-modes')).not.toBeNull());
  expect(screen.queryByText('Chlazení')).toBeNull();
});

it('season run median is explicitly approximate hourly data', async () => {
  mount('heating', 0, '/sezony');
  await waitFor(() => expect(screen.getAllByTestId('heating-season')).toHaveLength(10));
  expect(screen.getAllByText('Medián délky běhu (hodinová data, orientační)')).toHaveLength(10);
});

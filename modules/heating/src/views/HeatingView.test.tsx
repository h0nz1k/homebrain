import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import type { ModuleViewProps } from '@homebrain/ha-client';
import { mockHeatingAdvisor } from '../../../../apps/panel/dev/mocks/heating/advisor.js';
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

describe('Doporučení', () => {
  it.each([
    ['suggest_lower', /Zkuste snížit teplotu vody v bodě p3/],
    ['suggest_higher', /Zkuste zvýšit teplotu vody v bodě p2/],
    ['ok', /doporučuji ponechat/],
    ['insufficient_data', /21 dní.*3 dny.*pod 8 °C/],
    ['recent_change', /Čerstvá změna křivky.*4 dny/],
  ])('renders %s with measured values and the read-only note', async (status, text) => {
    const advisor = mockHeatingAdvisor(status, '2025-01-13T00:20:00Z');
    setHeatingApiFactory(() => createMockHeatingApi({ advisor }));
    render(<HeatingView {...base} />);
    const card = await screen.findByTestId('heating-advisor');
    expect(card.dataset.status).toBe(status);
    expect(card.textContent).toMatch(text);
    expect(card.textContent).toContain('Referenční místnost');
    expect(card.textContent).toContain('143 dnů');
    expect(card.textContent).toContain('114–132 W/K');
    expect(card.textContent).toContain('Do regulace nic nezapisuji');
    expect(card.querySelector('button')).toBeNull();
  });

  it('shows the model without loss units when the nominal output is unset', async () => {
    const advisor = mockHeatingAdvisor('ok', '2025-01-13T00:20:00Z');
    Object.assign(advisor.model, {
      thermal_kw: null,
      heat_loss_wk_low: null,
      heat_loss_wk_high: null,
      design_loss_kw_low: null,
      design_loss_kw_high: null,
    });
    setHeatingApiFactory(() => createMockHeatingApi({ advisor }));
    render(<HeatingView {...base} />);
    const card = await screen.findByTestId('heating-advisor');
    expect(card.textContent).toContain('Odhad venkovní hranice topení');
    expect(card.textContent).toContain('Zadejte ho v nastavení HomeBrain → Topení.');
    expect(card.textContent).toContain('zahrnuje i ohřev teplé vody');
    expect(card.textContent).not.toContain('W/K');
  });

  it('shows an empty model state when there are zero usable days', async () => {
    const advisor = mockHeatingAdvisor('insufficient_data', '2025-01-13T00:20:00Z');
    Object.assign(advisor.model, { days: 0, slope_h_per_k: null });
    setHeatingApiFactory(() => createMockHeatingApi({ advisor }));
    render(<HeatingView {...base} />);
    const card = await screen.findByTestId('heating-advisor');
    expect(card.textContent).toContain('Pro odhad tepelné ztráty zatím chybí data.');
  });
});

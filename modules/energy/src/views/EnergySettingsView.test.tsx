// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { EnergySettingsView } from './EnergySettingsView';
import { settingsDemo } from '../settingsDemo';
afterEach(cleanup);
it('renders all sections, explains settings and confirms reserve before sending', async () => {
  const send = vi.fn(async (message: { type: string }) =>
    message.type.includes('settings') ? structuredClone(settingsDemo) : {},
  );
  render(<EnergySettingsView connection={{ sendMessagePromise: send as never }} />);
  for (const name of ['Fotovoltaika', 'Baterie', 'Síť', 'Tarif a ceny', 'Střídač'])
    expect(await screen.findByRole('heading', { name })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Nápověda: Rezerva v síti' }));
  expect(screen.getByRole('tooltip').textContent).toContain('DoD');
  const input = screen.getByRole('spinbutton', { name: 'Rezerva v síti: nová hodnota' });
  fireEvent.change(input, { target: { value: '20' } });
  fireEvent.submit(input.closest('form')!);
  expect(screen.getByRole('alertdialog').textContent).toContain('1,2 kWh míň');
  expect(send.mock.calls.some(([m]) => m.type.endsWith('/set'))).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Potvrdit změnu' }));
  await waitFor(() =>
    expect(send).toHaveBeenCalledWith({
      type: 'homebrain/energy/settings/set',
      key: 'energy_battery_dod_ongrid',
      value: 20,
    }),
  );
});
it('keeps every row read-only for adults', async () => {
  const data = { rows: settingsDemo.rows.map((row) => ({ ...row, editable: false })) };
  render(
    <EnergySettingsView connection={{ sendMessagePromise: vi.fn(async () => data) as never }} />,
  );
  await screen.findByRole('heading', { name: 'Baterie' });
  expect(screen.queryByRole('spinbutton')).toBeNull();
  expect(screen.getAllByText(/Mění se v aplikaci SolarGo/).length).toBeGreaterThan(0);
});

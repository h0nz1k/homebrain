// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { EnergySettingsView } from './EnergySettingsView';
import { settingsDemo } from '../settingsDemo';
afterEach(cleanup);
const connect = (data = structuredClone(settingsDemo)) => {
  const send = vi.fn(async (message: { type: string }) =>
    message.type.includes('settings') ? structuredClone(data) : {},
  );
  render(<EnergySettingsView connection={{ sendMessagePromise: send as never }} />);
  return send;
};
it('opens the reserve in a sheet and confirms the inverter write before sending', async () => {
  const send = connect();
  for (const name of ['Fotovoltaika', 'Baterie', 'Síť', 'Tarif a ceny', 'Střídač'])
    expect(await screen.findByRole('heading', { name })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /^Rezerva v síti: 10\s%$/ }));
  const sheet = screen.getByRole('dialog', { name: 'Rezerva v síti' });
  expect(sheet.textContent).toMatch(/„Maximum vybití“ = 100\s% − rezerva \(teď 90\s%\)/);
  // Editable rows never send the user to the original app.
  expect(sheet.textContent).not.toContain('SolarGo');
  fireEvent.click(
    within(sheet).getByRole('button', { name: 'Zvýšit: Rezerva v síti: nová hodnota' }),
  );
  fireEvent.click(
    within(sheet).getByRole('button', { name: 'Zvýšit: Rezerva v síti: nová hodnota' }),
  );
  fireEvent.click(within(sheet).getByRole('button', { name: 'Pokračovat' }));
  const confirm = screen.getByRole('dialog', { name: /Změnit rezervu baterie z 10\s% na 20\s%\?/ });
  expect(confirm.textContent).toMatch(/1,2\skWh míň/);
  expect(confirm.textContent).toMatch(/uloží do střídače/);
  expect(send.mock.calls.some(([m]) => m.type.endsWith('/set'))).toBe(false);
  fireEvent.click(within(confirm).getByRole('button', { name: 'Potvrdit změnu' }));
  await waitFor(() =>
    expect(send).toHaveBeenCalledWith({
      type: 'homebrain/energy/settings/set',
      key: 'energy_battery_dod_ongrid',
      value: 20,
    }),
  );
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
});
it('saves a price directly from the sheet via the number field', async () => {
  const send = connect();
  fireEvent.click(await screen.findByRole('button', { name: /^Cena vysokého tarifu:/ }));
  const input = screen.getByRole('spinbutton', { name: 'Cena vysokého tarifu: nová hodnota' });
  fireEvent.change(input, { target: { value: '6.5' } });
  fireEvent.click(screen.getByRole('button', { name: 'Uložit' }));
  await waitFor(() =>
    expect(send).toHaveBeenCalledWith({
      type: 'homebrain/energy/settings/set',
      key: 'energy_tariff_price_vt',
      value: 6.5,
    }),
  );
});
it('keeps every row read-only for adults and says where it changes', async () => {
  connect({ rows: settingsDemo.rows.map((row) => ({ ...row, editable: false })) });
  await screen.findByRole('heading', { name: 'Baterie' });
  expect(screen.queryByRole('button', { name: /Použít/ })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Provozní režim: Obecný, jen pro čtení' }));
  const sheet = screen.getByRole('dialog', { name: 'Provozní režim' });
  expect(within(sheet).queryByRole('spinbutton')).toBeNull();
  expect(within(sheet).queryByRole('button', { name: 'Uložit' })).toBeNull();
  expect(sheet.textContent).toContain('Mění se v aplikaci SolarGo.');
});
it('warns about a very different inverter export limit and offers to align the forecast', async () => {
  const send = connect();
  const note = await screen.findByRole('note');
  expect(note.textContent).toMatch(/nejvýš 80\sW, předpověď ale počítá s 5\skW/);
  fireEvent.click(within(note).getByRole('button', { name: /Použít 0,08\skW i pro předpověď/ }));
  const confirm = screen.getByRole('dialog', { name: /Použít 0,08\skW i pro předpověď\?/ });
  fireEvent.click(within(confirm).getByRole('button', { name: 'Potvrdit změnu' }));
  await waitFor(() =>
    expect(send).toHaveBeenCalledWith({
      type: 'homebrain/energy/settings/set',
      key: 'export_limit_kw',
      value: 0.08,
    }),
  );
});

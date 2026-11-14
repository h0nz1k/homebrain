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
  fireEvent.click(screen.getByRole('button', { name: /^Rezerva při běžném provozu: 10\s%$/ }));
  const sheet = screen.getByRole('dialog', { name: 'Rezerva při běžném provozu' });
  expect(sheet.textContent).toMatch(/„Maximum vybití“ = 100\s% − rezerva \(teď 90\s%\)/);
  // Editable rows never send the user to the original app.
  expect(sheet.textContent).not.toContain('SolarGo');
  fireEvent.click(
    within(sheet).getByRole('button', { name: 'Zvýšit: Rezerva při běžném provozu: nová hodnota' }),
  );
  fireEvent.click(
    within(sheet).getByRole('button', { name: 'Zvýšit: Rezerva při běžném provozu: nová hodnota' }),
  );
  fireEvent.click(within(sheet).getByRole('button', { name: 'Uložit' }));
  const confirm = screen.getByRole('dialog', { name: 'Změnit rezervu baterie?' });
  expect(confirm.textContent).toMatch(/10\s%.*20\s%/);
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
  fireEvent.click(
    screen.getByRole('button', { name: 'Provozní režim: Obecný, jen pro čtení (ze střídače)' }),
  );
  const sheet = screen.getByRole('dialog', { name: 'Provozní režim' });
  expect(within(sheet).queryByRole('spinbutton')).toBeNull();
  expect(within(sheet).queryByRole('button', { name: 'Uložit' })).toBeNull();
  expect(sheet.textContent).toContain('Mění se v aplikaci SolarGo.');
});
it('warns about a very different inverter export limit and offers to align the forecast', async () => {
  const send = connect();
  const note = await screen.findByRole('note');
  expect(note.textContent).toMatch(/nejvýše 80\sW, předpověď počítá s\s5\skW \(62× víc\)/);
  expect(note.textContent).toMatch(/čte přímo ze střídače/);
  fireEvent.click(within(note).getByRole('button', { name: /Použít 80\sW i\spro předpověď/ }));
  const confirm = screen.getByRole('dialog', { name: 'Použít limit střídače i pro předpověď?' });
  expect(confirm.textContent).toMatch(/5\skW.*80\sW/);
  fireEvent.click(within(confirm).getByRole('button', { name: 'Potvrdit změnu' }));
  await waitFor(() =>
    expect(send).toHaveBeenCalledWith({
      type: 'homebrain/energy/settings/set',
      key: 'export_limit_kw',
      value: 0.08,
    }),
  );
});
it('keeps rows to one line, puts the export limits under the warning and asks to verify estimates', async () => {
  connect();
  const net = (await screen.findByRole('heading', { name: 'Síť' })).closest('section')!;
  const keys = [...net.querySelectorAll('[data-key]')].map((el) => el.getAttribute('data-key'));
  expect(keys.slice(0, 3)).toEqual([
    'energy_export_limit',
    'export_limit_kw',
    'energy_export_limit_enabled',
  ]);
  expect(document.querySelector('.hb-cell-desc')).toBeNull();
  expect(screen.getByRole('button', { name: 'Orientace panelů: Jih' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /^Sklon panelů:/ }));
  const sheet = screen.getByRole('dialog', { name: 'Sklon panelů' });
  expect(sheet.textContent).toContain('Ověřit sklon');
  expect(
    (within(sheet).getByRole('button', { name: 'Potvrdit' }) as HTMLButtonElement).disabled,
  ).toBe(false);
});
it('shows on/off settings as locked switches and source labels in plain words', async () => {
  connect();
  const row = await screen.findByRole('button', {
    name: 'Hlídat rezervu: Zapnuto, jen pro čtení (ze střídače)',
  });
  const toggle = row.querySelector('[role="switch"]')!;
  expect(toggle.getAttribute('aria-checked')).toBe('true');
  expect(toggle.hasAttribute('data-locked')).toBe(true);
  expect(row.textContent).not.toContain('Zapnuto');
  const off = screen.getByRole('button', { name: /^Rychlé nabíjení: Vypnuto/ });
  expect(off.querySelector('[role="switch"]')!.getAttribute('aria-checked')).toBe('false');
  // HDO is a tariff state, not a setting: stays text.
  expect(
    screen
      .getByRole('button', { name: /^Aktuální tarif HDO: Nízký tarif/ })
      .querySelector('[role="switch"]'),
  ).toBeNull();
  // One tag style for sources and the estimate; no „z HA“ shorthand.
  expect(document.body.textContent).not.toMatch(/z HA\b/);
  expect(screen.getAllByText('z Home Assistantu').length).toBeGreaterThan(0);
  const estimate = screen.getByText('odhad');
  expect(estimate.classList.contains('hb-cell-tag')).toBe(true);
  expect(estimate.getAttribute('data-tone')).toBe('info');
  fireEvent.click(off);
  const sheet = screen.getByRole('dialog', { name: 'Rychlé nabíjení' });
  expect(
    within(sheet).getByRole('switch', { name: 'Rychlé nabíjení: vypnuto, jen pro čtení' }),
  ).toBeTruthy();
  expect(sheet.textContent).toContain('Hodnota je ze střídače. Mění se v aplikaci SolarGo.');
});
it('edit sheet has one way out in the footer and marks the saved value on the slider', async () => {
  connect();
  fireEvent.click(
    await screen.findByRole('button', { name: /^Rezerva při běžném provozu: 10\s%$/ }),
  );
  const sheet = screen.getByRole('dialog', { name: 'Rezerva při běžném provozu' });
  expect(within(sheet).queryByRole('button', { name: 'Zavřít' })).toBeNull();
  expect(within(sheet).getByRole('button', { name: 'Zrušit' })).toBeTruthy();
  expect(within(sheet).getByText(/^teď 10\s%$/)).toBeTruthy();
  fireEvent.click(within(sheet).getByRole('button', { name: 'Zrušit' }));
  expect(screen.queryByRole('dialog')).toBeNull();
});

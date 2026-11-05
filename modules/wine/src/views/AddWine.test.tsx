import { Toaster, toastStore } from '@homebrain/ui';
// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createEntityStore } from '@homebrain/ha-client';
import { MIONETTO_EAN, createMockWineApi, setWineApiFactory } from '../api.js';
import { createSyntheticWines } from '../mock.js';
import WineView from './WineView.js';
import { AddWineSheet } from './AddWine.js';
import { ImportView } from './panels.js';
import { AI_HINT_CS } from './labels.js';

let api: ReturnType<typeof createMockWineApi>;
beforeEach(() => {
  localStorage.clear();
  api = createMockWineApi(createSyntheticWines(2026));
  setWineApiFactory(() => api);
});
afterEach(() => {
  cleanup();
  toastStore.reset();
  setWineApiFactory(null);
  vi.restoreAllMocks();
});

async function mountView() {
  render(
    <>
      <WineView store={createEntityStore()} bindings={{}} />
      <Toaster />
    </>,
  );
  await screen.findAllByTestId('wine-card');
  await act(async () => fireEvent.click(screen.getByTestId('wine-add-open')));
  return screen.findByTestId('wine-add');
}

it('přidat víno: EAN Mionetto → návrh z Open Food Facts → formulář → uložení s fotkou a zónou', async () => {
  const sheet = await mountView();
  expect(within(sheet).getByRole('heading').textContent).toBe('Přidat víno');
  await act(async () => fireEvent.click(within(sheet).getByTestId('wine-add-scan')));
  // jsdom has no camera → friendly message, manual entry still works
  expect(within(sheet).getByTestId('wine-add-camera-error').textContent).toMatch(/EAN ručně/);
  const ean = within(sheet).getByTestId('wine-add-ean');
  fireEvent.change(ean, { target: { value: '8006220001668' } });
  fireEvent.click(within(sheet).getByTestId('wine-add-ean-go'));
  expect(sheet.textContent).toContain('Kontrolní číslice');
  fireEvent.change(ean, { target: { value: '800 6220 001669' } });
  await act(async () => fireEvent.click(within(sheet).getByTestId('wine-add-ean-go')));
  const prop = await within(sheet).findByTestId('wine-add-proposal');
  expect(prop.dataset.provider).toBe('openfoodfacts');
  expect(prop.textContent).toContain('Prosecco DOC Treviso');
  expect(prop.textContent).toContain('Shoda podle EAN');
  expect(within(sheet).getByTestId('wine-add-statuses').textContent).toContain('AI: nedostupné');
  await act(async () => fireEvent.click(prop));
  const form = within(sheet).getByTestId('wine-add-form');
  expect((within(form).getByTestId('wine-add-f-name') as HTMLInputElement).value).toBe(
    'Prosecco DOC Treviso',
  );
  expect((within(form).getByTestId('wine-add-f-producer') as HTMLInputElement).value).toBe(
    'Mionetto',
  );
  expect((within(form).getByTestId('wine-add-f-ean') as HTMLInputElement).value).toBe(MIONETTO_EAN);
  expect(
    within(form).getByTestId('wine-add-f-type').querySelector('[aria-pressed=true]')?.textContent,
  ).toBe('Šumivé');
  expect(form.textContent).toContain('odhad'); // region/grapes inferred from the category
  expect((within(form).getByTestId('wine-add-vivino') as HTMLAnchorElement).href).toContain(
    'Mionetto',
  );
  expect(within(form).getByTestId('wine-add-photo-source').getAttribute('aria-checked')).toBe(
    'true',
  );
  const more = within(form)
    .getByTestId('wine-add-f-qty')
    .parentElement!.querySelector('button[aria-label="Více"]')!;
  fireEvent.click(more);
  fireEvent.click(more);
  fireEvent.change(within(form).getByTestId('wine-add-f-price'), { target: { value: '239' } });
  fireEvent.change(within(form).getByTestId('wine-add-f-zone'), { target: { value: 'Zóna B' } });
  expect(within(sheet).getByTestId('wine-add-save').textContent).toContain('3 lahve');
  await act(async () => fireEvent.click(within(sheet).getByTestId('wine-add-save')));
  expect((await screen.findAllByTestId('hb-toast')).at(-1)!.textContent).toContain(
    'Přidáno: Prosecco DOC Treviso (3 lahve).',
  );
  expect(screen.queryByTestId('wine-add')).toBeNull();
  const saved = (await api.list()).find((w) => w.ean === MIONETTO_EAN)!;
  expect(saved).toMatchObject({
    producer: 'Mionetto',
    quantity: 3,
    purchasePrice: 239,
    location: { zone: 'Zóna B' },
    confidence: 'inferred',
    source: { provider: 'catalog-provider', catalog: 'openfoodfacts' },
  });
  expect(saved.image?.licenseStatus).toBe('approved');
  expect(api.events().filter((e) => e.wineId === saved.id)).toHaveLength(1);
});

it('stejný EAN podruhé: víno už máte → naskladnit +2 místo duplicity', async () => {
  const first = await api.lookup({ ean: MIONETTO_EAN });
  await api.create(
    {
      name: 'Prosecco DOC Treviso',
      producer: 'Mionetto',
      ean: first.proposals[0]!.fields.ean ?? null,
      quantity: 1,
      color: 'white',
      wineType: 'sparkling',
    },
    'op-seed',
  );
  const sheet = await mountView();
  fireEvent.change(within(sheet).getByTestId('wine-add-query'), {
    target: { value: MIONETTO_EAN },
  });
  await act(async () => fireEvent.click(within(sheet).getByTestId('wine-add-search')));
  const prop = await within(sheet).findByTestId('wine-add-proposal');
  expect(prop.dataset.provider).toBe('local');
  expect(prop.textContent).toContain('Už máte 1 ks');
  await act(async () => fireEvent.click(prop));
  const box = within(sheet).getByTestId('wine-add-existing');
  fireEvent.click(box.querySelector('button[aria-label="Více"]')!);
  await act(async () => fireEvent.click(within(sheet).getByTestId('wine-add-stock')));
  expect((await screen.findAllByTestId('hb-toast')).at(-1)!.textContent).toContain(
    'Naskladněno 2 lahve',
  );
  const all = (await api.list()).filter((w) => w.ean === MIONETTO_EAN);
  expect(all).toHaveLength(1);
  expect(all[0]!.quantity).toBe(3);
});

it('AI není v HA: dlaždice fotky je nedostupná a ukáže českou nápovědu', async () => {
  const sheet = await mountView();
  await within(sheet).findByTestId('wine-add-providers');
  expect(within(sheet).getByTestId('wine-add-ai-hint').textContent).toContain(AI_HINT_CS);
  const tile = within(sheet).getByTestId('wine-add-photo');
  expect(tile.getAttribute('aria-disabled')).toBe('true');
  expect(tile.querySelector('input')!.disabled).toBe(true);
  expect(within(sheet).getByTestId('wine-add-ai-off').textContent).toBe('Nedostupné');
  const ai = within(sheet).getByTestId('wine-add-providers').querySelector('li:last-child')!;
  expect(ai.hasAttribute('data-available')).toBe(false);
});

it('AI v HA je: fotka etikety se zmenší, AI navrhne víno a fotka se nabídne jako „Moje fotka“', async () => {
  const aiApi = createMockWineApi(createSyntheticWines(2026), undefined, { ai: true });
  const prepare = vi.fn(async () => 'data:image/jpeg;base64,AAAA');
  const lookup = vi.spyOn(aiApi, 'lookup');
  render(
    <AddWineSheet
      api={aiApi}
      wines={[]}
      onClose={() => undefined}
      onCreated={() => undefined}
      onOpenWine={() => undefined}
      preparePhoto={prepare}
    />,
  );
  const sheet = await screen.findByTestId('wine-add');
  await within(sheet).findByTestId('wine-add-providers');
  expect(within(sheet).queryByTestId('wine-add-ai-hint')).toBeNull();
  const input = within(sheet).getByTestId('wine-add-photo').querySelector('input')!;
  expect(input.getAttribute('capture')).toBe('environment');
  const file = new File(['x'], 'etiketa.jpg', { type: 'image/jpeg' });
  await act(async () => fireEvent.change(input, { target: { files: [file] } }));
  expect(prepare).toHaveBeenCalledWith(file);
  expect(lookup).toHaveBeenCalledWith({ photo: 'data:image/jpeg;base64,AAAA' });
  const prop = await within(sheet).findByTestId('wine-add-proposal');
  expect(prop.textContent).toContain('Přečteno AI');
  await act(async () => fireEvent.click(prop));
  expect(within(sheet).getByTestId('wine-add-photo-own').getAttribute('aria-checked')).toBe('true');
});

it('ručně bez internetu: povinná pole, chybný EAN, pak uložení jako „manual“', async () => {
  const onCreated = vi.fn();
  render(
    <AddWineSheet
      api={api}
      wines={createSyntheticWines(2026)}
      onClose={() => undefined}
      onCreated={onCreated}
      onOpenWine={() => undefined}
    />,
  );
  const sheet = await screen.findByTestId('wine-add');
  fireEvent.click(within(sheet).getByTestId('wine-add-manual'));
  await act(async () => fireEvent.click(within(sheet).getByTestId('wine-add-save')));
  expect(sheet.textContent).toContain('Vyplňte název vína.');
  expect(sheet.textContent).toContain('Vyplňte vinařství.');
  fireEvent.change(within(sheet).getByTestId('wine-add-f-name'), {
    target: { value: 'Domácí cuvée' },
  });
  fireEvent.change(within(sheet).getByTestId('wine-add-f-producer'), {
    target: { value: 'Soused' },
  });
  fireEvent.change(within(sheet).getByTestId('wine-add-f-ean'), { target: { value: '123' } });
  await act(async () => fireEvent.click(within(sheet).getByTestId('wine-add-save')));
  expect(sheet.textContent).toContain('kontrolní číslici');
  fireEvent.change(within(sheet).getByTestId('wine-add-f-ean'), { target: { value: '' } });
  fireEvent.click(within(sheet).getByTestId('wine-add-f-color').querySelector('[data-value=red]')!);
  await act(async () => fireEvent.click(within(sheet).getByTestId('wine-add-save')));
  expect(onCreated).toHaveBeenCalledTimes(1);
  const [wine, msg] = onCreated.mock.calls[0]!;
  expect(msg).toBe('Přidáno: Domácí cuvée (1 lahev).');
  expect(wine).toMatchObject({ color: 'red', confidence: 'manual', quantity: 1, image: null });
});

it('hledání podle názvu: vlastní vinotéka první, Znovín návrh; zpět vrací na začátek', async () => {
  const sheet = await mountView();
  fireEvent.change(within(sheet).getByTestId('wine-add-query'), {
    target: { value: 'Ryzlink rýnský' },
  });
  await act(async () => fireEvent.submit(within(sheet).getByRole('search')));
  const props = await within(sheet).findAllByTestId('wine-add-proposal');
  expect(props[0]!.dataset.provider).toBe('local');
  expect(props.some((p) => p.dataset.provider === 'znovin')).toBe(true);
  fireEvent.click(within(sheet).getByTestId('wine-add-back'));
  expect(within(sheet).getByTestId('wine-add-query')).toBeTruthy();
  fireEvent.keyDown(window, { key: 'Escape' });
  expect(screen.queryByTestId('wine-add')).toBeNull();
});

const VIVINO_CSV = [
  'Winery,Wine name,Vintage,Your rating,Your review',
  'Vinařství Synthetic A,Ryzlink rýnský,2023,4.5,Skvělé k rybě',
  'Neznámé,Úplně jiné víno,2019,3,',
].join('\n');

it('import z Vivina: náhled párování → potvrzení uloží osobní hodnocení', async () => {
  const wines = await api.list();
  const target = wines.find(
    (w) => wines.filter((o) => o.name === w.name && o.vintage === w.vintage).length === 1,
  )!;
  const csv = VIVINO_CSV.replace('Ryzlink rýnský', target.name)
    .replace('2023', String(target.vintage))
    .replace('Vinařství Synthetic A', target.producer);
  const onImported = vi.fn();
  render(<ImportView api={api} onImported={onImported} />);
  const box = screen.getByTestId('wine-vivino-import');
  expect(box.textContent).toContain('Vivino nemá veřejné API');
  const file = new File([csv], 'full_wine_list.csv', { type: 'text/csv' });
  await act(async () =>
    fireEvent.change(within(box).getByTestId('wine-vivino-file'), { target: { files: [file] } }),
  );
  const plan = await within(box).findByTestId('wine-vivino-plan');
  const rows = within(plan).getAllByTestId('wine-vivino-row');
  expect(rows.length).toBeGreaterThanOrEqual(1);
  const exact = rows.find((r) => r.dataset.match === 'exact')!;
  expect((exact.querySelector('input[type=checkbox]') as HTMLInputElement).checked).toBe(true);
  expect(exact.textContent).toContain('4,5');
  await act(async () => fireEvent.click(within(plan).getByTestId('wine-vivino-apply')));
  expect((await within(box).findByTestId('wine-vivino-done')).textContent).toMatch(
    /Uloženo z Vivina: [1-9]/,
  );
  expect(onImported).toHaveBeenCalled();
  const after = (await api.get(target.id)).wine;
  expect(after.personalRating).toBe(4.5);
  expect(after.personalNote).toContain('Skvělé k rybě');
});

it('import z Vivina: cizí soubor se odmítne česky', async () => {
  render(<ImportView api={api} onImported={() => undefined} />);
  const box = screen.getByTestId('wine-vivino-import');
  const file = new File(['a,b\n1,2'], 'x.csv', { type: 'text/csv' });
  await act(async () =>
    fireEvent.change(within(box).getByTestId('wine-vivino-file'), { target: { files: [file] } }),
  );
  expect((await within(box).findByRole('alert')).textContent).toContain('export z Vivina');
});

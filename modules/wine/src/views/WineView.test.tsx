import { Toaster, toastStore } from '@homebrain/ui';
// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createEntityStore } from '@homebrain/ha-client';
import { createMockWineApi, setWineApiFactory } from '../api.js';
import { createSyntheticWines } from '../mock.js';
import WineView from './WineView.js';
import { ImportView, autoEnrichText } from './panels.js';

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
});
async function mount(bindings: Record<string, string> = { wine_cellar_temperature: 'sensor.t' }) {
  const store = createEntityStore();
  store.update({
    'sensor.light': {
      entity_id: 'sensor.light',
      state: 'off',
      last_updated: new Date().toISOString(),
      attributes: {},
    },
    'sensor.t': {
      entity_id: 'sensor.t',
      state: '16.4',
      last_updated: new Date().toISOString(),
      attributes: {},
    },
    'sensor.z1': {
      entity_id: 'sensor.z1',
      state: '11.8',
      last_updated: new Date().toISOString(),
      attributes: {},
    },
    'sensor.z1s': {
      entity_id: 'sensor.z1s',
      state: '12',
      last_updated: new Date().toISOString(),
      attributes: {},
    },
  });
  render(
    <>
      <WineView store={store} bindings={bindings} />
      <Toaster />
    </>,
  );
  await screen.findAllByTestId('wine-card');
}
async function open(card: HTMLElement) {
  await act(async () => fireEvent.click(card));
  return screen.findByTestId('wine-detail');
}

it('přehled: metriky, zóny chladničky, hledání, drawer filtrů a prázdné hledání', async () => {
  await mount();
  expect(screen.getAllByTestId('wine-card')).toHaveLength(50);
  const total = createSyntheticWines(2026).reduce((s, w) => s + w.quantity, 0);
  expect(screen.getByTestId('wine-metric-total').textContent).toContain(String(total));
  expect(screen.getByTestId('wine-cellar-chip').textContent).toContain('16,4 °C');
  expect(screen.getByTestId('wine-signals').textContent).toContain('příliš teplo');
  fireEvent.change(screen.getByTestId('wine-search'), { target: { value: 'pálava' } });
  const n = screen.getAllByTestId('wine-card').length;
  expect(n).toBeGreaterThan(0);
  expect(n).toBeLessThan(50);
  fireEvent.click(screen.getByTestId('wine-more-filters'));
  const drawer = screen.getByTestId('wine-filters');
  expect(drawer.getAttribute('role')).toBe('dialog');
  fireEvent.click(within(drawer).getByTestId('wine-filter-color-red'));
  expect(within(drawer).getByTestId('wine-filter-apply').textContent).toBe('Žádné výsledky');
  fireEvent.click(within(drawer).getByTestId('wine-filter-apply'));
  expect(screen.queryAllByTestId('wine-card')).toHaveLength(0);
  expect(screen.getByText('Žádné víno neodpovídá hledání')).toBeTruthy();
  fireEvent.click(screen.getByTestId('wine-clear-search'));
  expect(screen.getAllByTestId('wine-card').length).toBeGreaterThan(0);
  fireEvent.click(screen.getByTestId('wine-more-filters'));
  fireEvent.click(screen.getByText('Zrušit filtry'));
  fireEvent.click(screen.getByTestId('wine-filter-apply'));
  fireEvent.click(screen.getByTestId('wine-mode-list'));
  expect(within(screen.getByTestId('wine-table')).getAllByRole('row')).toHaveLength(51);
}, 60_000); // 50 cards + filter drawer: slow in jsdom on loaded runners

it('zóny z bindingů s cílovou teplotou; bez bindingů stav nenakonfigurováno', async () => {
  await mount({
    wine_zone_1_temperature: 'sensor.z1',
    wine_zone_1_target: 'sensor.z1s',
    wine_light: 'sensor.light',
  });
  expect(screen.getByTestId('wine-cooler-light').textContent).toContain('vypnuto');
  const card = screen.getByTestId('wine-cellar-chip');
  expect(card.textContent).toContain('Zóna 1');
  expect(card.textContent).toContain('11,8 °C');
  expect(card.textContent).toContain('cíl 12 °C');
  expect(card.textContent).toContain('V pořádku');
  cleanup();
  await mount({});
  expect(screen.getByTestId('wine-cooler-unconfigured').textContent).toContain('není připojená');
  expect(screen.getByTestId('wine-cellar-chip').textContent).toContain('Nenakonfigurováno');
});

it('otevření poslední lahve vyžaduje potvrzení a zapíše historii', async () => {
  await mount();
  const last = screen
    .getAllByTestId('wine-card')
    .find((c) => within(c).getByTestId('wine-card-qty').textContent === '1 ks')!;
  const detail = await open(last);
  expect(within(detail).getByTestId('wine-photo-placeholder')).toBeTruthy();
  await act(async () => fireEvent.click(screen.getByTestId('wine-consume')));
  const dialog = screen.getByTestId('wine-confirm');
  expect(dialog.getAttribute('role')).toBe('alertdialog');
  expect(dialog.textContent).toContain('Otevřít poslední láhev?');
  await act(async () => fireEvent.click(screen.getByTestId('wine-confirm-ok')));
  expect((await screen.findAllByTestId('hb-toast')).at(-1)!.textContent).toContain('Zbývá 0 ks');
  expect(screen.getByTestId('wine-detail-qty').textContent).toBe('0');
  fireEvent.click(screen.getByTestId('wine-tab-history'));
  expect(screen.getByTestId('wine-history').textContent).toContain('Odepsáno');
  expect(api.events().filter((e) => e.operation === 'consume')).toHaveLength(1);
});

it('zápis vlastního hodnocení (celá hvězda, opakovaný klik = půl hvězdy)', async () => {
  await mount();
  await open(screen.getAllByTestId('wine-card')[0]!);
  await act(async () => fireEvent.click(screen.getByTestId('wine-rate-2')));
  expect((await screen.findAllByTestId('hb-toast')).at(-1)!.textContent).toContain(
    'Hodnocení uloženo: 2 z 5',
  );
  await act(async () => fireEvent.click(screen.getByTestId('wine-rate-2')));
  expect((await screen.findAllByTestId('hb-toast')).at(-1)!.textContent).toContain('1,5 z 5');
  const id = (await api.list()).find((w) => w.personalRating === 1.5);
  expect(id).toBeTruthy();
});

it('hodnocení nesmaže fotku lahve, i když zápis vrátí záznam bez podepsané URL', async () => {
  const signed = (id: string) => `/api/homebrain/wine/image/${id}?authSig=synthetic`;
  const withPhoto = createSyntheticWines(2026).map((w) => ({
    ...w,
    image: {
      localPath: `homebrain/media/wine/${w.id}.webp`,
      sourceUrl: null,
      licenseStatus: 'approved' as const,
    },
  }));
  const inner = createMockWineApi(withPhoto);
  const sign = <T extends { id: string; image: unknown }>(w: T) =>
    w.image ? { ...w, image: { ...(w.image as object), url: signed(w.id) } } : w;
  // Reads are signed (like the integration); the write result is not (pre-fix server).
  setWineApiFactory(() => ({
    ...inner,
    list: async () => (await inner.list()).map(sign),
    get: async (id) => {
      const d = await inner.get(id);
      return { ...d, wine: sign(d.wine) };
    },
  }));
  await mount();
  const card = screen.getAllByTestId('wine-card')[0]!;
  const src = (within(card).getByTestId('wine-photo') as HTMLImageElement).getAttribute('src');
  expect(src).toContain('authSig=');
  await open(card);
  await act(async () => fireEvent.click(screen.getByTestId('wine-rate-4')));
  expect((await screen.findAllByTestId('hb-toast')).at(-1)!.textContent).toContain('4 z 5');
  // The rated wine's card still shows its photo (the card order may change after rating).
  const srcs = screen
    .getAllByTestId('wine-card')
    .map((c) => within(c).queryByTestId('wine-photo')?.getAttribute('src'));
  expect(srcs).toContain(src);
  expect(srcs.every(Boolean)).toBe(true);
});

it('oprava stavu v záložce Historie odmítne záporné číslo', async () => {
  await mount();
  await open(screen.getAllByTestId('wine-card')[0]!);
  fireEvent.click(screen.getByTestId('wine-tab-history'));
  fireEvent.click(screen.getByTestId('wine-correct'));
  const form = screen.getByTestId('wine-correct-form');
  fireEvent.change(within(form).getByRole('spinbutton'), { target: { value: '-3' } });
  await act(async () => fireEvent.submit(form));
  expect(screen.getByRole('alert').textContent).toContain('Neplatné množství');
  fireEvent.change(within(form).getByRole('spinbutton'), { target: { value: '11' } });
  await act(async () => fireEvent.submit(form));
  expect((await screen.findAllByTestId('hb-toast')).at(-1)!.textContent).toContain('opraven na 11');
});

it('sekce: Moje vína (srdíčko), Objednávky (připravujeme), Importer s náhledem', async () => {
  await mount();
  fireEvent.click(screen.getAllByTestId('wine-fav')[3]!);
  fireEvent.click(screen.getByTestId('wine-nav-mine'));
  expect(screen.getAllByTestId('wine-card')).toHaveLength(1);
  expect(localStorage.getItem('homebrain.wine.section')).toBe('"mine"');
  fireEvent.click(screen.getByTestId('wine-nav-orders'));
  expect(screen.getByText('Objednávky připravujeme')).toBeTruthy();
  fireEvent.click(screen.getByTestId('wine-nav-import'));
  expect(screen.getByTestId('wine-import-pdf').textContent).toContain('Nahrát PDF objednávky');
  fireEvent.change(screen.getByTestId('wine-import-content'), {
    target: {
      value: 'name;producer;vintage;quantity\nNové víno;Vinařství Test;2024;3\nX;Y;2020;-1',
    },
  });
  await act(async () => fireEvent.click(screen.getByTestId('wine-import-preview')));
  const plan = screen.getByTestId('wine-import-plan');
  expect(plan.textContent).toContain('Nové víno 1');
  expect(plan.textContent).toContain('chyby 1');
});

it('nákupní cena: volitelný zápis, záporná odmítnuta; Dohledat: diff → potvrzení → fotka; odkaz na Vivino', async () => {
  await mount();
  const detail = await open(screen.getAllByTestId('wine-card')[0]!);
  fireEvent.click(within(detail).getByTestId('wine-price-edit'));
  const form = screen.getByTestId('wine-price-form');
  fireEvent.change(within(form).getByRole('textbox'), { target: { value: '-5' } });
  await act(async () => fireEvent.submit(form));
  expect(within(form).getByRole('alert').textContent).toContain('Neplatná cena');
  fireEvent.change(within(form).getByRole('textbox'), { target: { value: '289,50' } });
  await act(async () => fireEvent.submit(form));
  expect((await screen.findAllByTestId('hb-toast')).at(-1)!.textContent).toContain(
    'Nákupní cena uložena',
  );
  expect((await api.list()).some((w) => w.purchasePrice === 289.5)).toBe(true);
  // Dohledat (#81): one button, every provider, per-field diff – empty fields pre-selected.
  const vivino = within(detail).getByTestId('wine-vivino') as HTMLAnchorElement;
  expect(vivino.href).toMatch(/^https:\/\/www\.vivino\.com\/search\/wines\?q=/);
  expect(vivino.target).toBe('_blank');
  expect(vivino.rel).toContain('noopener');
  await act(async () => fireEvent.click(within(detail).getByTestId('wine-lookup')));
  const panel = await within(detail).findByTestId('wine-lookup-diff');
  expect(within(detail).getByTestId('wine-lookup-source').textContent).toContain('Znovín');
  expect(within(detail).queryByTestId('wine-photo')).toBeNull();
  const desc = within(panel).getByTestId('wine-lookup-f-description') as HTMLInputElement;
  expect(desc.checked).toBe(true);
  expect((within(panel).getByTestId('wine-lookup-photo') as HTMLInputElement).checked).toBe(true);
  await act(async () => fireEvent.click(within(detail).getByTestId('wine-lookup-apply')));
  expect((await screen.findAllByTestId('hb-toast')).at(-1)!.textContent).toContain(
    'ze zdroje Znovín',
  );
  const list = await api.list();
  expect(list.some((w) => w.image?.licenseStatus === 'approved')).toBe(true);
  expect(list.some((w) => w.description?.startsWith('Syntetický popis'))).toBe(true);
});

const SYNTH_ORDER = [
  'Ukázkový Ryzlink',
  'suché/pozdní sběr 2024/Ukázková řada',
  'Šarže 9101 /Obj. číslo Z 9101 /Obsah 0,75 l',
  '2 ks 300 Kč',
  'Ukázková Frankovka',
  'polosuché/výběr z hroznů 2025/Ukázková řada',
  'Šarže 9102 /Obj. číslo Z 9102 /Obsah 0,75 l',
  '3 ks 600 Kč',
  'Slevový kód',
  '-100 Kč',
  'Cena celkem: 800 Kč',
].join('\n');

it('import objednávky: náhled s kontrolou součtu, nesoulad blokuje potvrzení', async () => {
  await mount();
  fireEvent.click(screen.getByTestId('wine-nav-import'));
  expect(screen.getByTestId('wine-import-pdf').textContent).toContain('Nahrát PDF objednávky');
  const area = screen.getByTestId('wine-import-order-text');
  fireEvent.change(area, { target: { value: SYNTH_ORDER.replace('800 Kč', '900 Kč') } });
  await act(async () => fireEvent.click(screen.getByTestId('wine-import-order-preview')));
  expect(screen.getByTestId('wine-import-check').textContent).toContain('NESOUHLASÍ');
  expect((screen.getByTestId('wine-import-order-apply') as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(area, { target: { value: SYNTH_ORDER } });
  await act(async () => fireEvent.click(screen.getByTestId('wine-import-order-preview')));
  const plan = screen.getByTestId('wine-import-order-plan');
  expect(plan.textContent).toContain('2 položek · 5 lahví');
  expect(screen.getByTestId('wine-import-check').textContent).toContain('souhlasí');
  // Manual batch stays available (e.g. a backend without auto-enrichment).
  const realImport = api.importFile.bind(api);
  vi.spyOn(api, 'importFile').mockImplementation(async (i) => {
    const res = await realImport(i);
    delete res.autoEnrich;
    return res;
  });
  await act(async () => fireEvent.click(screen.getByTestId('wine-import-order-apply')));
  expect((await api.list()).some((w) => w.source.externalProductId === 'Z 9102')).toBe(true);
  await act(async () => fireEvent.click(screen.getByTestId('wine-enrich-all')));
  await act(async () => fireEvent.click(screen.getByTestId('wine-enrich-all-confirm')));
  expect(screen.getByTestId('wine-enrich-all-result').textContent).toContain('Doplněno: 2 z 2');
});

it('po importu se fotky doplní automaticky: průběh 1/2 → hotovo a obnovení seznamu', async () => {
  const onImported = vi.fn();
  render(<ImportView api={api} onImported={onImported} pollMs={1} />);
  fireEvent.change(screen.getByTestId('wine-import-order-text'), {
    target: { value: SYNTH_ORDER },
  });
  await act(async () => fireEvent.click(screen.getByTestId('wine-import-order-preview')));
  expect(screen.queryByTestId('wine-auto-enrich')).toBeNull();
  await act(async () => fireEvent.click(screen.getByTestId('wine-import-order-apply')));
  const line = screen.getByTestId('wine-auto-enrich');
  expect(line.textContent).toMatch(/^Doplňuji fotky a popisy ze Znovínu… [01]\/2$/);
  expect((screen.getByTestId('wine-enrich-all') as HTMLButtonElement).disabled).toBe(true);
  await screen.findByText(/Fotky a popisy ze Znovínu doplněny: 2 z 2/);
  expect(onImported).toHaveBeenCalledTimes(2); // import + refresh after enrichment
  const imported = (await api.list()).filter((w) => w.source.provider === 'order-import');
  expect(imported.every((w) => w.image?.licenseStatus === 'approved')).toBe(true);
});

it('stavový text automatického doplnění', () => {
  const base = { total: 15, ok: 0, failed: 0, items: [] };
  expect(autoEnrichText({ ...base, running: true, done: 7 })).toBe(
    'Doplňuji fotky a popisy ze Znovínu… 7/15',
  );
  const done = autoEnrichText({
    running: false,
    done: 3,
    total: 3,
    ok: 2,
    failed: 1,
    items: [
      { wineId: 'a', ok: true, photo: true },
      { wineId: 'b', ok: true, skipped: 'has_image' },
      { wineId: 'c', ok: false, code: 'ENRICH_NOT_FOUND' },
    ],
  });
  expect(done).toContain('doplněny: 1 z 3 (1 už fotku mělo)');
  expect(done).toContain('1 bez shody');
});

it('Dohledat: nic nenalezeno → odkaz na stránku vína → náhled změn; nahrazení jen na přání', async () => {
  const real = api.lookup.bind(api);
  const spy = vi.spyOn(api, 'lookup').mockImplementation(async (i) => {
    if (!i.url) return { proposals: [], providers: [] };
    return real({ wineId: i.wineId });
  });
  await mount();
  const detail = await open(screen.getAllByTestId('wine-card')[0]!);
  await act(async () => fireEvent.click(within(detail).getByTestId('wine-lookup')));
  expect((await within(detail).findByTestId('wine-lookup-empty')).textContent).toContain(
    'Nic nového',
  );
  const url = 'https://vinarstvi.example/vino/ryzlink';
  fireEvent.change(within(detail).getByTestId('wine-lookup-url'), { target: { value: url } });
  await act(async () => fireEvent.submit(within(detail).getByTestId('wine-lookup-url-form')));
  expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ url }));
  const diff = await within(detail).findByTestId('wine-lookup-diff');
  // A value that would REPLACE existing data is never pre-selected.
  const region = within(diff).queryByTestId('wine-lookup-f-region') as HTMLInputElement | null;
  if (region) expect(region.checked).toBe(false);
  fireEvent.click(within(diff).getByTestId('wine-lookup-photo'));
  fireEvent.click(within(diff).getByTestId('wine-lookup-f-description'));
  expect((within(detail).getByTestId('wine-lookup-apply') as HTMLButtonElement).disabled).toBe(
    within(diff)
      .queryAllByRole('checkbox')
      .every((c) => !(c as HTMLInputElement).checked),
  );
});

it('nerozpoznaný text objednávky se nehádá', async () => {
  await mount();
  fireEvent.click(screen.getByTestId('wine-nav-import'));
  fireEvent.change(screen.getByTestId('wine-import-order-text'), {
    target: { value: 'nákupní seznam' },
  });
  await act(async () => fireEvent.click(screen.getByTestId('wine-import-order-preview')));
  expect(screen.getByRole('alert').textContent).toContain('nic se nehádá');
});

it('bez spojení zobrazí nedostupný stav', () => {
  setWineApiFactory(null);
  render(
    <>
      <WineView store={createEntityStore()} bindings={{}} />
      <Toaster />
    </>,
  );
  expect(screen.getByText('Vinotéka není dostupná')).toBeTruthy();
});

it('karta: název + podtitul etikety + ročník · přívlastek, bez ceny; hledání i v etiketě', async () => {
  await mount();
  const card = screen.getAllByTestId('wine-card').find((c) => /Cryo/.test(c.textContent ?? ''))!;
  const label = within(card).getByTestId('wine-card-label').textContent;
  const wine = createSyntheticWines(2026).find(
    (w) => w.labelName === label && card.textContent?.startsWith(`${w.quantity} ks${w.name}`),
  )!;
  expect(card.querySelector('.wine-name')?.textContent).toBe(wine.name);
  expect(within(card).getByTestId('wine-card-label').textContent).toBe(wine.labelName);
  expect(document.querySelectorAll('[data-testid=wine-card-label]').length).toBeLessThan(50);
  expect(card.textContent).toContain(`${wine.vintage} · ${wine.predicate}`);
  expect(card.textContent).not.toMatch(/Kč/);
  expect(document.querySelectorAll('.wine-card .wine-price')).toHaveLength(0);
  fireEvent.change(screen.getByTestId('wine-search'), { target: { value: 'cryo 3,14' } });
  const hits = screen.getAllByTestId('wine-card');
  expect(hits.length).toBeGreaterThan(0);
  expect(hits.every((c) => /Cryo/.test(c.textContent ?? ''))).toBe(true);
});

it('detail: podtitul, přívlastek a historie cen (nákupy + e-shop sparkline)', async () => {
  await mount();
  const card = screen.getAllByTestId('wine-card').find((c) => /Cryo/.test(c.textContent ?? ''))!;
  const label = within(card).getByTestId('wine-card-label').textContent;
  const wine = createSyntheticWines(2026).find(
    (w) => w.labelName === label && card.textContent?.startsWith(`${w.quantity} ks${w.name}`),
  )!;
  const detail = await open(card);
  expect(within(detail).getByRole('heading', { level: 2 }).textContent).toBe(wine.name);
  expect(within(detail).getByTestId('wine-detail-label').textContent).toBe(wine.labelName);
  expect(within(detail).getByTestId('wine-detail-meta').textContent).toContain(wine.predicate!);
  const prices = within(detail).getByTestId('wine-price-history');
  expect(within(prices).getByTestId('wine-price-last').textContent).toMatch(/Kč/);
  expect(within(prices).getByTestId('wine-price-shop').textContent).toMatch(/Kč/);
  expect(within(prices).getByTestId('wine-price-spark').querySelector('path')).toBeTruthy();
  const lots = within(prices).getByTestId('wine-price-lots').querySelectorAll('li');
  expect(lots.length).toBeGreaterThanOrEqual(1);
  expect(lots[0]!.textContent).toMatch(/obj\. [0-9a-f]{4}/);
});

it('detail: starší server bez priceHistory ukáže aspoň uloženou nákupní cenu', async () => {
  const get = api.get.bind(api);
  api.get = async (id) => ({ ...(await get(id)), priceHistory: undefined });
  await mount();
  const detail = await open(screen.getAllByTestId('wine-card')[0]!);
  const prices = within(detail).getByTestId('wine-price-history');
  expect(within(prices).getByTestId('wine-price-last').textContent).toMatch(/Kč/);
  expect(within(prices).queryByTestId('wine-price-shop')).toBeNull();
});

it('derives wine details from the HA route and responds to route changes', async () => {
  localStorage.setItem('homebrain.wine.section', JSON.stringify('import'));
  const wines = createSyntheticWines(2026);
  const store = createEntityStore();
  const { rerender } = render(
    <WineView
      store={store}
      bindings={{}}
      route={{ path: `/${encodeURIComponent(wines[3]!.id)}` }}
    />,
  );
  const detail = await screen.findByTestId('wine-detail');
  expect(detail.textContent).toContain(wines[3]!.name);
  rerender(
    <WineView
      store={store}
      bindings={{}}
      route={{ path: `/${encodeURIComponent(wines[7]!.id)}` }}
    />,
  );
  await screen.findByText(wines[7]!.name, { selector: '.wine-hero-text h2' });
  rerender(<WineView store={store} bindings={{}} route={{ path: '' }} />);
  await act(async () => {});
  expect(screen.queryByTestId('wine-detail')).toBeNull();
});

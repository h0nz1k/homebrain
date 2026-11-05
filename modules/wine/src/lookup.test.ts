import { expect, it, vi } from 'vitest';
import { MIONETTO_EAN, createMockWineApi, createWsWineApi } from './api.js';
import {
  diffProposal,
  draftFromProposal,
  draftToWine,
  emptyDraft,
  gtinValid,
  normalizeEan,
  vivinoSearchUrl,
} from './lookup.js';
import { createSyntheticWines } from './mock.js';

it('GTIN kontrolní číslice jako integrace', () => {
  expect(gtinValid(MIONETTO_EAN)).toBe(true);
  expect(gtinValid('8006220001668')).toBe(false);
  expect(gtinValid('96385074')).toBe(true);
  expect(normalizeEan(' 800-6220 001669 ')).toBe(MIONETTO_EAN);
  expect(normalizeEan('abc')).toBeNull();
});

it('Vivino odkaz = vyhledávání podle výrobce + názvu + ročníku', () => {
  expect(
    vivinoSearchUrl({ producer: 'Mionetto', name: 'Prosecco DOC Treviso', vintage: null }),
  ).toBe('https://www.vivino.com/search/wines?q=Mionetto%20Prosecco%20DOC%20Treviso');
});

it('mock lookup: EAN fixture, neplatný EAN, AI nedostupná', async () => {
  const api = createMockWineApi(createSyntheticWines(2026));
  const res = await api.lookup({ ean: MIONETTO_EAN });
  expect(res.proposals[0]).toMatchObject({
    provider: 'openfoodfacts',
    confidence: 'matched',
    fields: { producer: 'Mionetto', ean: MIONETTO_EAN, wineType: 'sparkling' },
  });
  expect(res.proposals[0]!.vivinoUrl).toContain('Mionetto');
  expect(res.providers.find((p) => p.id === 'ai_task')?.status).toBe('unavailable');
  await expect(api.lookup({ ean: '8006220001668' })).rejects.toMatchObject({
    code: 'LOOKUP_EAN_INVALID',
  });
  await expect(api.lookup({})).rejects.toMatchObject({ code: 'LOOKUP_EMPTY' });
  const providers = await api.lookupProviders();
  expect(providers.find((p) => p.id === 'ai_task')).toMatchObject({
    available: false,
    hint: 'no_ai_entity',
  });
});

it('draft: návrh → formulář → payload create (zdroj, důvěra, zóna, cena)', async () => {
  const api = createMockWineApi([]);
  const p = (await api.lookup({ ean: MIONETTO_EAN })).proposals[0]!;
  const draft = {
    ...draftFromProposal(p, emptyDraft('2026-11-02')),
    quantity: 3,
    zone: 'Zóna A',
    price: '239',
  };
  const { wine, errors } = draftToWine(draft, p);
  expect(errors).toEqual({});
  expect(wine).toMatchObject({
    name: 'Prosecco DOC Treviso',
    producer: 'Mionetto',
    ean: MIONETTO_EAN,
    quantity: 3,
    purchasePrice: 239,
    location: { zone: 'Zóna A' },
    acquiredOn: '2026-11-02',
    confidence: 'inferred',
    grapeVarieties: ['Glera'],
    source: { provider: 'catalog-provider', catalog: 'openfoodfacts' },
  });
  const bad = draftToWine(
    { ...draft, vintage: '99', volumeMl: '', alcoholPct: '140', price: '-1' },
    p,
  );
  expect(bad.wine).toBeNull();
  expect(Object.keys(bad.errors).sort()).toEqual(['alcoholPct', 'price', 'vintage', 'volumeMl']);
  const created = await api.create(wine!, 'op-1');
  expect(created.wine.quantity).toBe(3);
  expect((await api.create(wine!, 'op-1')).replayed).toBe(true);
});

it('diff: prázdná pole = doplnit, rozdílná = nahradit, stejná se nezobrazí', () => {
  const [w] = createSyntheticWines(2026, 1);
  const diffs = diffProposal(
    { ...w!, region: 'Znojemská', description: null, alcoholPct: 12 },
    {
      provider: 'znovin',
      providerLabel: 'Znovín e-shop',
      confidence: 'matched',
      fields: { region: 'Mikulovská', description: 'Popis', alcoholPct: 12 },
      inferred: [],
      imageUrl: null,
      imageLicense: null,
      sourceUrl: null,
      externalProductId: null,
      existing: null,
      note: null,
    },
  );
  expect(diffs.map((d) => [d.field, d.fill])).toEqual([
    ['region', false],
    ['description', true],
  ]);
});

it('WS: lookup / create / set_image / import_vivino posílají snake_case payload', async () => {
  const sendMessagePromise = vi.fn(async (msg: Record<string, unknown>) => {
    if (msg.type === 'homebrain/wine/lookup_providers') return { providers: [] };
    if (msg.type === 'homebrain/wine/set_image') return { wine: { id: 'w1' } };
    return {};
  });
  const api = createWsWineApi({ sendMessagePromise } as never);
  await api.lookup({
    wineId: 'w1',
    url: 'https://x.example/v',
    photo: 'data:image/jpeg;base64,AA',
  });
  await api.create(
    { name: 'A', producer: 'B', color: 'white', wineType: 'still', quantity: 2 },
    'op',
  );
  await api.setImage('w1', { imageUrl: 'https://img.example/a.jpg' });
  await api.setImage('w1', { photo: 'data:image/jpeg;base64,AA' });
  await api.importVivino({ content: 'csv', dryRun: false, accept: [{ row: 1, wineId: 'w1' }] });
  await api.lookupProviders();
  expect(sendMessagePromise.mock.calls.map((c) => c[0])).toEqual([
    {
      type: 'homebrain/wine/lookup',
      url: 'https://x.example/v',
      photo: 'data:image/jpeg;base64,AA',
      wine_id: 'w1',
    },
    {
      type: 'homebrain/wine/create',
      wine: { name: 'A', producer: 'B', color: 'white', wineType: 'still', quantity: 2 },
      source_operation_id: 'op',
    },
    { type: 'homebrain/wine/set_image', wine_id: 'w1', image_url: 'https://img.example/a.jpg' },
    { type: 'homebrain/wine/set_image', wine_id: 'w1', photo: 'data:image/jpeg;base64,AA' },
    {
      type: 'homebrain/wine/import_vivino',
      content: 'csv',
      dry_run: false,
      accept: [{ row: 1, wine_id: 'w1' }],
    },
    { type: 'homebrain/wine/lookup_providers' },
  ]);
});

it('WS: LOOKUP_* chyby se propisují jako kód', async () => {
  const api = createWsWineApi({
    sendMessagePromise: async () => Promise.reject({ code: 'LOOKUP_AI_UNAVAILABLE' }),
  } as never);
  await expect(api.lookup({ query: 'x' })).rejects.toMatchObject({ code: 'LOOKUP_AI_UNAVAILABLE' });
});

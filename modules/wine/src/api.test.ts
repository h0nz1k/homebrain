import { expect, it } from 'vitest';
import {
  WineApiError,
  createMockWineApi,
  createWsWineApi,
  getWineApi,
  mergeWineRecord,
  setWineApiFactory,
} from './api.js';
import { createSyntheticWines } from './mock.js';

const seed = createSyntheticWines(2026);
const code = async (p: Promise<unknown>) =>
  p.then(
    () => 'OK',
    (e: WineApiError) => e.code,
  );

it('mock consume: gate, audit event, idempotence', async () => {
  const api = createMockWineApi(seed);
  const wine = seed.find((w) => w.quantity === 6)!;
  expect(
    await code(
      api.consume({ wineId: wine.id, quantity: 2, confirmed: false, sourceOperationId: 'op-1' }),
    ),
  ).toBe('CONFIRMATION_REQUIRED');
  const r = await api.consume({
    wineId: wine.id,
    quantity: 2,
    confirmed: true,
    sourceOperationId: 'op-2',
  });
  expect(r.wine.quantity).toBe(4);
  expect(r.event).toMatchObject({
    operation: 'consume',
    quantityDelta: -2,
    sourceOperationId: 'op-2',
  });
  const again = await api.consume({
    wineId: wine.id,
    quantity: 2,
    confirmed: true,
    sourceOperationId: 'op-2',
  });
  expect(again.replayed).toBe(true);
  expect((await api.get(wine.id)).wine.quantity).toBe(4);
  expect(
    await code(
      api.consume({ wineId: wine.id, quantity: 1, confirmed: true, sourceOperationId: 'op-2' }),
    ),
  ).toBe('IDEMPOTENT_REPLAY');
  const empty = seed.find((w) => w.quantity === 0)!;
  expect(
    await code(
      api.consume({ wineId: empty.id, quantity: 1, confirmed: true, sourceOperationId: 'op-3' }),
    ),
  ).toBe('ZERO_STOCK');
  expect(
    await code(
      api.consume({ wineId: 'nope', quantity: 1, confirmed: true, sourceOperationId: 'op-4' }),
    ),
  ).toBe('TARGET_NOT_FOUND');
});
it('mock correct + update validace', async () => {
  const api = createMockWineApi(seed);
  const wine = seed[0]!;
  expect(
    await code(
      api.correct({ wineId: wine.id, quantity: -1, reason: 'Inventura', sourceOperationId: 'c-1' }),
    ),
  ).toBe('INVALID_QUANTITY');
  expect(
    await code(
      api.correct({
        wineId: wine.id,
        quantity: wine.quantity,
        reason: 'Inventura',
        sourceOperationId: 'c-2',
      }),
    ),
  ).toBe('NO_CHANGE');
  const r = await api.correct({
    wineId: wine.id,
    quantity: 9,
    reason: 'Inventura',
    sourceOperationId: 'c-3',
  });
  expect(r.event.quantityDelta).toBe(9 - wine.quantity);
  const { events } = await api.get(wine.id);
  expect(events.map((e) => e.operation)).toEqual(['correction', 'stock_in']);
  expect(await code(api.update(wine.id, { personalRating: 7 }))).toBe('RATING_OUT_OF_RANGE');
  expect(await code(api.update(wine.id, { quantity: 1 }))).toBe('INVALID_FIELD');
});
it('WS klient posílá homebrain/wine/* a mapuje chyby', async () => {
  const sent: unknown[] = [];
  const api = createWsWineApi({
    async sendMessagePromise<T>(m: { type: string }) {
      sent.push(m);
      if (m.type === 'homebrain/wine/consume') throw { code: 'ZERO_STOCK', message: 'x' };
      if (m.type === 'homebrain/wine/correct') throw { code: 'weird' };
      return { wines: [] } as T;
    },
  });
  expect(await api.list()).toEqual([]);
  expect(
    await code(
      api.consume({ wineId: 'w', quantity: 1, confirmed: false, sourceOperationId: 'op-xx' }),
    ),
  ).toBe('ZERO_STOCK');
  expect(
    await code(api.correct({ wineId: 'w', quantity: 1, reason: 'r', sourceOperationId: 'op-yy' })),
  ).toBe('UNKNOWN');
  expect(sent[1]).toEqual({
    type: 'homebrain/wine/consume',
    wine_id: 'w',
    quantity: 1,
    confirmed: false,
    source_operation_id: 'op-xx',
  });
});
it('factory: bez spojení null, s přepsáním mock', () => {
  expect(getWineApi({})).toBeNull();
  const mock = createMockWineApi([]);
  setWineApiFactory(() => mock);
  expect(getWineApi({})).toBe(mock);
  setWineApiFactory(null);
});

it('mergeWineRecord: write result without a signed URL keeps the photo (rc.9 regression)', () => {
  const base = seed[0]!;
  const localPath = `homebrain/media/wine/${base.id}.webp`;
  const signed = `/api/homebrain/wine/image/${base.id}?authSig=synthetic`;
  const prev = {
    ...base,
    image: { localPath, sourceUrl: null, licenseStatus: 'approved' as const, url: signed },
  };
  const rated = { ...prev, personalRating: 4, image: { ...prev.image, url: undefined } };
  expect(mergeWineRecord(prev, rated).image?.url).toBe(signed);
  expect(mergeWineRecord(prev, rated).personalRating).toBe(4);
  // A fresh signature from the server wins.
  const fresh = { ...rated, image: { ...rated.image, url: `${signed}-2` } };
  expect(mergeWineRecord(prev, fresh).image?.url).toBe(`${signed}-2`);
  // Different file or removed photo → never reuse the old URL.
  const other = { ...rated, image: { ...rated.image, localPath: 'homebrain/media/wine/x.webp' } };
  expect(mergeWineRecord(prev, other).image?.url).toBeUndefined();
  expect(mergeWineRecord(prev, { ...rated, image: null }).image).toBeNull();
  expect(mergeWineRecord(undefined, rated)).toBe(rated);
});

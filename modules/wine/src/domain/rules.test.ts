import { describe, expect, it } from 'vitest';
import type { DomainErrorCode, WineRecord } from './index.js';
import {
  cloneRecord,
  evaluateConsume,
  evaluateRating,
  isNonNegativeInteger,
  resolveTargetCode,
  sortWines,
} from './index.js';
import { createSyntheticWines } from '../mock.js';

const base = { matchCount: 1, stockQuantity: 4, quantity: 1, confirmed: false };
describe('wine-domain (port z donoru)', () => {
  it('isNonNegativeInteger', () => {
    expect([0, 3].map(isNonNegativeInteger)).toEqual([true, true]);
    expect([-1, 1.5, Number.NaN].map(isNonNegativeInteger)).toEqual([false, false, false]);
  });
  const cases: Array<[Partial<typeof base>, DomainErrorCode]> = [
    [{ quantity: 0 }, 'INVALID_QUANTITY'],
    [{ quantity: 1.5 }, 'INVALID_QUANTITY'],
    [{ matchCount: 0 }, 'TARGET_NOT_FOUND'],
    [{ matchCount: 2 }, 'TARGET_AMBIGUOUS'],
    [{ stockQuantity: -1 }, 'INVALID_QUANTITY'],
    [{ stockQuantity: 0, confirmed: true }, 'ZERO_STOCK'],
    [{ quantity: 5, confirmed: true }, 'INVALID_QUANTITY'],
    [{ stockQuantity: 1 }, 'CONFIRMATION_REQUIRED'],
    [{ quantity: 2 }, 'CONFIRMATION_REQUIRED'],
  ];
  it.each(cases)('evaluateConsume %j → %s', (input, code) => {
    expect(evaluateConsume({ ...base, ...input })).toEqual({ ok: false, code });
  });
  it('evaluateConsume ok', () => {
    expect(evaluateConsume(base)).toEqual({ ok: true, value: true });
    expect(evaluateConsume({ ...base, stockQuantity: 1, confirmed: true }).ok).toBe(true);
    expect(evaluateConsume({ ...base, quantity: 3, confirmed: true }).ok).toBe(true);
  });
  it('evaluateRating a resolveTargetCode', () => {
    expect(evaluateRating(5)).toEqual({ ok: true, value: true });
    expect(evaluateRating(5.1)).toEqual({ ok: false, code: 'RATING_OUT_OF_RANGE' });
    expect(evaluateRating(Number.NaN)).toEqual({ ok: false, code: 'RATING_OUT_OF_RANGE' });
    expect([0, 1, 2].map(resolveTargetCode)).toEqual([
      'TARGET_NOT_FOUND',
      null,
      'TARGET_AMBIGUOUS',
    ]);
  });
  it('cloneRecord je hluboká kopie', () => {
    const w = createSyntheticWines(2026, 1)[0]!;
    const c = cloneRecord(w);
    c.grapeVarieties.push('x');
    c.location!.zone = 'Z';
    expect(w.grapeVarieties).toHaveLength(1);
    expect(w.location!.zone).toBe('Zóna A');
  });
  it('řazení je deterministické (name cs, rating, vintage, id tie-break)', () => {
    const mk = (id: string, name: string, personalRating: number | null, vintage: number | null) =>
      ({ ...createSyntheticWines(2026, 1)[0]!, id, name, personalRating, vintage }) as WineRecord;
    const list = [
      mk('b', 'Čakan', 4, 2020),
      mk('a', 'Cabernet', 4, 2020),
      mk('c', 'Ábel', null, null),
    ];
    expect(sortWines(list).map((w) => w.id)).toEqual(['c', 'a', 'b']);
    expect(sortWines(list, 'rating').map((w) => w.id)).toEqual(['a', 'b', 'c']);
    expect(sortWines(list, 'vintage').map((w) => w.id)).toEqual(['a', 'b', 'c']);
    expect(sortWines(list, 'id').map((w) => w.id)).toEqual(['a', 'b', 'c']);
  });
});

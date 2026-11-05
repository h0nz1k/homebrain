import type { DomainErrorCode, DomainResult, WineRecord } from './types.js';
import { RATING_MAX, RATING_MIN } from './types.js';

export function isNonNegativeInteger(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

export function cloneRecord(record: WineRecord): WineRecord {
  return {
    ...record,
    grapeVarieties: [...record.grapeVarieties],
    location: record.location ? { ...record.location } : null,
    image: record.image ? { ...record.image } : null,
    source: { ...record.source },
  };
}

export function evaluateRating(rating: number): DomainResult<true> {
  if (
    typeof rating !== 'number' ||
    Number.isNaN(rating) ||
    rating < RATING_MIN ||
    rating > RATING_MAX
  ) {
    return { ok: false, code: 'RATING_OUT_OF_RANGE' };
  }
  return { ok: true, value: true };
}

export interface ConsumeEvaluationInput {
  matchCount: number;
  stockQuantity: number;
  quantity: number;
  confirmed: boolean;
}

/** Pure consume gate — no mutation, no storage, no UI. */
export function evaluateConsume(input: ConsumeEvaluationInput): DomainResult<true> {
  if (!isNonNegativeInteger(input.quantity) || input.quantity < 1) {
    return { ok: false, code: 'INVALID_QUANTITY' };
  }
  if (input.matchCount === 0) {
    return { ok: false, code: 'TARGET_NOT_FOUND' };
  }
  if (input.matchCount > 1) {
    return { ok: false, code: 'TARGET_AMBIGUOUS' };
  }
  if (!isNonNegativeInteger(input.stockQuantity)) {
    return { ok: false, code: 'INVALID_QUANTITY' };
  }
  if (input.stockQuantity === 0) {
    return { ok: false, code: 'ZERO_STOCK' };
  }
  if (input.quantity > input.stockQuantity) {
    return { ok: false, code: 'INVALID_QUANTITY' };
  }
  if ((input.stockQuantity === 1 || input.quantity > 1) && !input.confirmed) {
    return { ok: false, code: 'CONFIRMATION_REQUIRED' };
  }
  return { ok: true, value: true };
}

export function resolveTargetCode(
  matchCount: number,
): Extract<DomainErrorCode, 'TARGET_NOT_FOUND' | 'TARGET_AMBIGUOUS'> | null {
  if (matchCount === 0) return 'TARGET_NOT_FOUND';
  if (matchCount > 1) return 'TARGET_AMBIGUOUS';
  return null;
}

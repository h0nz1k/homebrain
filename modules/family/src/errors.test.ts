import { afterEach, describe, expect, it, vi } from 'vitest';
import { TimeoutError, createChoreErrorCode, nextDistinctName, withTimeout } from './errors.js';

afterEach(() => vi.useRealTimers());

describe('create chore errors', () => {
  it('maps WS error codes; unknown → service_failed, socket drop → network', () => {
    expect(createChoreErrorCode({ code: 'duplicate_name', message: '' })).toBe('duplicate_name');
    expect(createChoreErrorCode({ code: 'not_configured' })).toBe('not_configured');
    expect(createChoreErrorCode({ code: 'unauthorized' })).toBe('unauthorized');
    expect(createChoreErrorCode({ code: 'home_assistant_error' })).toBe('service_failed');
    expect(createChoreErrorCode({ code: 3 })).toBe('network');
    expect(createChoreErrorCode(new TimeoutError())).toBe('timeout');
    expect(createChoreErrorCode(undefined)).toBe('service_failed');
  });

  it('proposes a distinct name within 80 chars', () => {
    expect(nextDistinctName('Myčka horní koš')).toBe('Myčka horní koš (2)');
    expect(nextDistinctName('Myčka horní koš (2)')).toBe('Myčka horní koš (3)');
    expect(nextDistinctName('Myčka (12:00)')).toBe('Myčka (12:00) (2)');
    expect(nextDistinctName('x'.repeat(80))).toHaveLength(80);
  });

  it('withTimeout rejects after the limit and passes results through', async () => {
    vi.useFakeTimers();
    const slow = withTimeout(new Promise(() => undefined), 15_000);
    const caught = slow.catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(await caught).toBeInstanceOf(TimeoutError);
    await expect(withTimeout(Promise.resolve(1))).resolves.toBe(1);
    await expect(withTimeout(Promise.reject(new Error('x')))).rejects.toThrow('x');
  });
});

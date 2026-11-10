// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DOCK_RESOLVE_PENDING_MS,
  dockResolvePendingKey,
  readDockResolvePending,
  writeDockResolvePending,
} from './dockResolvePending.js';

describe('dock resolve pending', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('stores pending per slot, code and last_changed', () => {
    const key = dockResolvePendingKey(1, 'water_empty', '2026-11-10T08:00:00Z');
    expect(readDockResolvePending(1, 'water_empty', '2026-11-10T08:00:00Z')).toBe(false);
    writeDockResolvePending(1, 'water_empty', '2026-11-10T08:00:00Z');
    expect(localStorage.getItem(key)).toMatch(/^\d+$/);
    expect(readDockResolvePending(1, 'water_empty', '2026-11-10T08:00:00Z')).toBe(true);
    expect(readDockResolvePending(1, 'water_empty', '2026-11-10T09:00:00Z')).toBe(false);
    expect(readDockResolvePending(1, 'duct_blockage', '2026-11-10T08:00:00Z')).toBe(false);
  });

  it('expires after the pending window', () => {
    writeDockResolvePending(1, 'water_empty', 't1');
    vi.advanceTimersByTime(DOCK_RESOLVE_PENDING_MS + 1);
    expect(readDockResolvePending(1, 'water_empty', 't1')).toBe(false);
  });
});

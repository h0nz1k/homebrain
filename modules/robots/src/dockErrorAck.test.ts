// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from 'vitest';
import {
  dockAckStorageKey,
  dockErrorBannerCollapsed,
  readDockErrorAcknowledged,
  writeDockErrorAcknowledged,
} from './dockErrorAck.js';

describe('dock error acknowledge', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('stores acknowledgement per slot, code and last_changed', () => {
    const key = dockAckStorageKey(1, 'water_empty', '2026-11-10T08:00:00Z');
    expect(readDockErrorAcknowledged(1, 'water_empty', '2026-11-10T08:00:00Z')).toBe(false);
    writeDockErrorAcknowledged(1, 'water_empty', '2026-11-10T08:00:00Z');
    expect(localStorage.getItem(key)).toBe('1');
    expect(readDockErrorAcknowledged(1, 'water_empty', '2026-11-10T08:00:00Z')).toBe(true);
    expect(readDockErrorAcknowledged(1, 'water_empty', '2026-11-10T09:00:00Z')).toBe(false);
    expect(readDockErrorAcknowledged(1, 'duct_blockage', '2026-11-10T08:00:00Z')).toBe(false);
  });

  it('collapses banner only for refill-type dock errors', () => {
    const err = { code: 'water_empty', source: 'dock' as const, title: '', steps: [], part: 'water_tank' as const, severity: 'error' as const };
    writeDockErrorAcknowledged(1, 'water_empty', 't1');
    expect(dockErrorBannerCollapsed(err, 't1', 1)).toBe(true);
    expect(dockErrorBannerCollapsed(err, 't2', 1)).toBe(false);
    const other = { ...err, code: 'duct_blockage' };
    writeDockErrorAcknowledged(1, 'duct_blockage', 't1');
    expect(dockErrorBannerCollapsed(other, 't1', 1)).toBe(false);
  });
});

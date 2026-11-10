import { isRefillDockError } from './errors.js';

const PREFIX = 'hb.robots.dockAck.';

export function dockAckStorageKey(slot: number, code: string, stamp: string): string {
  return `${PREFIX}${slot}.${code}.${stamp}`;
}

export function readDockErrorAcknowledged(
  slot: number,
  code: string | null | undefined,
  stamp: string | null | undefined,
): boolean {
  if (!code || !stamp || !isRefillDockError(code)) return false;
  try {
    return localStorage.getItem(dockAckStorageKey(slot, code, stamp)) === '1';
  } catch {
    return false;
  }
}

export function writeDockErrorAcknowledged(slot: number, code: string, stamp: string): void {
  try {
    localStorage.setItem(dockAckStorageKey(slot, code, stamp), '1');
  } catch {
    /* quota / private mode */
  }
}

export function dockErrorBannerCollapsed(
  dockError: { code: string } | null,
  stamp: string | null | undefined,
  slot: number,
): boolean {
  if (!dockError || !stamp) return false;
  return readDockErrorAcknowledged(slot, dockError.code, stamp);
}

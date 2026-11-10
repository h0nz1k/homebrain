import { isRefillDockError } from './errors.js';

const PREFIX = 'hb.robots.dockResolve.';
export const DOCK_RESOLVE_PENDING_MS = 30_000;

export function dockResolvePendingKey(slot: number, code: string, stamp: string): string {
  return `${PREFIX}${slot}.${code}.${stamp}`;
}

export function writeDockResolvePending(slot: number, code: string, stamp: string): void {
  if (!stamp || !isRefillDockError(code)) return;
  try {
    localStorage.setItem(dockResolvePendingKey(slot, code, stamp), String(Date.now()));
  } catch {
    /* quota / private mode */
  }
}

export function readDockResolvePending(
  slot: number,
  code: string | null | undefined,
  stamp: string | null | undefined,
): boolean {
  if (!code || !stamp || !isRefillDockError(code)) return false;
  try {
    const raw = localStorage.getItem(dockResolvePendingKey(slot, code, stamp));
    if (!raw) return false;
    const at = Number(raw);
    if (!Number.isFinite(at) || Date.now() - at > DOCK_RESOLVE_PENDING_MS) {
      localStorage.removeItem(dockResolvePendingKey(slot, code, stamp));
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function clearDockResolvePending(slot: number, code: string, stamp: string): void {
  try {
    localStorage.removeItem(dockResolvePendingKey(slot, code, stamp));
  } catch {
    /* private mode */
  }
}

import type { Action, RankedSignal, Signal } from './types.js';

export type ServiceAllowlist = ReadonlyArray<{
  service: string;
  target?: string;
  confirm: boolean;
}>;
export interface ActionOptions {
  allowlist?: ServiceAllowlist;
  haConnected: boolean;
  stale: boolean;
}
const entryFor = (action: Extract<Action, { type: 'service' }>, allowlist?: ServiceAllowlist) =>
  allowlist?.find((entry) => entry.service === action.service && entry.target === action.target);

export function resolveActionState(
  signal: Signal,
  options: ActionOptions,
): RankedSignal['actionState'] {
  if (!signal.action) return undefined;
  if (signal.action.type !== 'service') return { enabled: true };
  if (!entryFor(signal.action, options.allowlist))
    return { enabled: false, reason: 'Akce není povolena' };
  if (!options.haConnected) return { enabled: false, reason: 'HA nedostupný' };
  if (options.stale) return { enabled: false, reason: 'Data jsou zastaralá' };
  return { enabled: true };
}

/** Return the effective action without mutating the module's action. */
export function resolveAction(signal: Signal, allowlist?: ServiceAllowlist): Action | undefined {
  const action = signal.action;
  if (action?.type !== 'service') return action ? { ...action } : undefined;
  return { ...action, confirm: action.confirm || (entryFor(action, allowlist)?.confirm ?? false) };
}

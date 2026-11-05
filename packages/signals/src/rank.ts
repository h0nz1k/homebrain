import { resolveAction, resolveActionState } from './actions.js';
import type { ServiceAllowlist } from './actions.js';
import { applyMinDwell, rememberLayout, stabilize } from './hysteresis.js';
import type { PreviousLayout } from './hysteresis.js';
import { mergeGroups } from './merge.js';
import type { MergedSignal } from './merge.js';
import { ageSeconds, isStale } from './stale.js';
import { SEVERITY_RANK } from './types.js';
import type { RankedSignal, Signal } from './types.js';
import { urgency } from './urgency.js';

export const LAYOUT_LIMITS = {
  mobile: { hero: 1, cards: 3 },
  desktop: { hero: 1, cards: 5 },
  kiosk: { hero: 1, cards: 3 },
} as const;
export interface RankOptions {
  layout?: keyof typeof LAYOUT_LIMITS;
  allowlist?: ServiceAllowlist;
  haConnected?: boolean;
  previous?: PreviousLayout;
  hysteresis?: number;
  minDwellMs?: number;
}
export interface RankResult {
  hero: RankedSignal | null;
  cards: RankedSignal[];
  more: number;
  info: RankedSignal[];
  calm: RankedSignal[];
  all: RankedSignal[];
  previous: PreviousLayout;
}
export function round3(value: number): number {
  const scaled = value * 1000;
  return Math.round(scaled + Number.EPSILON * Math.abs(scaled)) / 1000;
}
export function rank(signals: readonly Signal[], now: Date, options: RankOptions = {}): RankResult {
  const enrich = (signal: MergedSignal): RankedSignal => {
    const u = round3(urgency(signal, now));
    const stale = isStale(signal, now);
    return {
      ...signal,
      u,
      p: round3(0.6 * u + 0.4 * signal.relevance),
      also: signal.also.map(enrich),
      stale,
      ageS: ageSeconds(signal, now),
      action: resolveAction(signal, options.allowlist),
      actionState: resolveActionState(signal, {
        allowlist: options.allowlist,
        haConnected: options.haConnected ?? true,
        stale,
      }),
      ...(signal.related ? { relatedContext: [...signal.related] } : {}),
    };
  };
  const all = mergeGroups(signals)
    .map(enrich)
    .sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || b.p - a.p);
  const candidates = all.filter((signal) => SEVERITY_RANK[signal.severity] >= SEVERITY_RANK.notice);
  const ordered = options.previous
    ? stabilize(candidates, options.previous, now, options.hysteresis)
    : candidates;
  const limit = LAYOUT_LIMITS[options.layout ?? 'desktop'].cards + 1;
  const shown = applyMinDwell(ordered, limit, options.previous, now, options.minDwellMs ?? 300_000);
  return {
    hero: shown[0] ?? null,
    cards: shown.slice(1),
    more: candidates.length - shown.length,
    info: all.filter((signal) => signal.severity === 'info'),
    calm: all.filter((signal) => signal.severity === 'calm'),
    all,
    previous: rememberLayout(shown, options.previous, now),
  };
}

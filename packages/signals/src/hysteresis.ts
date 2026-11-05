import { SEVERITY_RANK } from './types.js';
import type { RankedSignal } from './types.js';

export interface PreviousLayout {
  order: string[];
  shownAt: Record<string, number>;
}

export function stabilize(
  rankedCardsAndHero: readonly RankedSignal[],
  previous: PreviousLayout,
  now: Date,
  threshold = 0.1,
): RankedSignal[] {
  // Time affects dwell (below), not adjacent score comparisons.
  void now;
  const ordered = [...rankedCardsAndHero];
  const indices = new Map(previous.order.map((id, index) => [id, index]));
  for (let pass = 0; pass < ordered.length ** 2; pass++) {
    let changed = false;
    for (let i = 0; i + 1 < ordered.length; i++) {
      const a = ordered[i]!;
      const b = ordered[i + 1]!;
      const ai = indices.get(a.id);
      const bi = indices.get(b.id);
      if (
        a.severity === b.severity &&
        ai !== undefined &&
        bi !== undefined &&
        bi < ai &&
        Math.abs(a.p - b.p) <= threshold + Number.EPSILON
      ) {
        ordered[i] = b;
        ordered[i + 1] = a;
        changed = true;
      }
    }
    if (!changed) break;
  }
  return ordered;
}

/** Reserve previous visible slots while keeping every critical visible. */
export function applyMinDwell(
  ordered: readonly RankedSignal[],
  limit: number,
  previous: PreviousLayout | undefined,
  now: Date,
  minDwellMs: number,
): RankedSignal[] {
  const criticals = ordered.filter((signal) => signal.severity === 'critical');
  const count = Math.min(ordered.length, Math.max(limit, criticals.length));
  if (!previous) return ordered.slice(0, count);
  const slots: Array<RankedSignal | undefined> = Array.from({ length: count });
  criticals.forEach((signal, index) => {
    slots[index] = signal;
  });
  const byId = new Map(ordered.map((signal) => [signal.id, signal]));
  previous.order.forEach((id, index) => {
    const signal = byId.get(id);
    const since = previous.shownAt[id];
    if (
      signal &&
      signal.severity !== 'critical' &&
      since !== undefined &&
      now.getTime() - since < minDwellMs &&
      index < count &&
      !slots[index]
    )
      slots[index] = signal;
  });
  const used = new Set(slots.flatMap((signal) => (signal ? [signal.id] : [])));
  const remaining = ordered.filter((signal) => !used.has(signal.id));
  let next = 0;
  for (let i = 0; i < count; i++) if (!slots[i]) slots[i] = remaining[next++];
  // Severity transitions always win over an old slot preference.
  return (slots as RankedSignal[]).sort(
    (a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity],
  );
}

export function rememberLayout(
  shown: readonly RankedSignal[],
  previous: PreviousLayout | undefined,
  now: Date,
): PreviousLayout {
  return {
    order: shown.map((signal) => signal.id),
    shownAt: Object.fromEntries(
      shown.map((signal) => [
        signal.id,
        previous?.order.includes(signal.id)
          ? (previous.shownAt[signal.id] ?? now.getTime())
          : now.getTime(),
      ]),
    ),
  };
}

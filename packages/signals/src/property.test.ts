import { describe, expect, it } from 'vitest';
import { NOW, signal } from './__fixtures__/helpers.js';
import { stabilize } from './hysteresis.js';
import { LAYOUT_LIMITS, rank } from './rank.js';
import { SEVERITY_RANK } from './types.js';
import type { Severity, Signal, SignalKind } from './types.js';

function mulberry32(seed: number): () => number {
  return () => {
    let value = (seed += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
const random = mulberry32(37);
const severities: Severity[] = ['critical', 'warning', 'notice', 'info', 'calm'];
const kinds: SignalKind[] = ['event', 'deadline', 'window', 'state'];
const sets: Signal[][] = Array.from({ length: 500 }, (_, set) =>
  Array.from({ length: Math.floor(random() * 35) }, (_, index) => {
    const start = NOW.getTime() + Math.floor(random() * 240 - 120) * 60_000;
    return signal({
      id: `${set}-${index}`,
      severity: severities[Math.floor(random() * severities.length)]!,
      kind: kinds[Math.floor(random() * kinds.length)]!,
      relevance: Math.floor(random() * 5) / 4,
      valid_from: new Date(start).toISOString(),
      valid_to: new Date(start + Math.floor(random() * 180) * 60_000).toISOString(),
    });
  }),
);

describe('500 seeded signal sets', () => {
  sets.forEach((input, index) => {
    it(`set ${index}: ordering, determinism, stable ties, idempotence, limits and severity boundaries`, () => {
      const snapshot = structuredClone(input);
      for (const layout of Object.keys(LAYOUT_LIMITS) as Array<keyof typeof LAYOUT_LIMITS>) {
        const result = rank(input, NOW, { layout });
        expect(result).toEqual(rank(input, NOW, { layout }));
        expect(rank(result.all, NOW, { layout })).toEqual(result);
        result.all.forEach((s, i) => {
          const prior = result.all[i - 1];
          if (!prior) return;
          expect(SEVERITY_RANK[prior.severity]).toBeGreaterThanOrEqual(SEVERITY_RANK[s.severity]);
          if (prior.severity === s.severity) expect(prior.p).toBeGreaterThanOrEqual(s.p);
        });
        const candidates = result.all.filter(
          (s) => SEVERITY_RANK[s.severity] >= SEVERITY_RANK.notice,
        );
        const criticals = candidates.filter((s) => s.severity === 'critical');
        const shown = [result.hero, ...result.cards].filter((s) => s !== null);
        expect(result.cards.length).toBeLessThanOrEqual(
          Math.max(LAYOUT_LIMITS[layout].cards, criticals.length - 1),
        );
        for (const critical of criticals) expect(shown.map((s) => s.id)).toContain(critical.id);
        expect(result.more).toBe(candidates.length - shown.length);
        expect(shown.every((s) => SEVERITY_RANK[s.severity] >= SEVERITY_RANK.notice)).toBe(true);
        if (candidates.length)
          expect(SEVERITY_RANK[result.hero!.severity]).toBe(
            Math.max(...candidates.map((s) => SEVERITY_RANK[s.severity])),
          );
        else expect(result.hero).toBeNull();
        const stabilized = stabilize(
          candidates,
          { order: candidates.map((s) => s.id).reverse(), shownAt: {} },
          NOW,
        );
        expect(stabilized.map((s) => s.severity)).toEqual(candidates.map((s) => s.severity));
        const originalIndex = new Map(input.map((s, i) => [s.id, i]));
        result.all.forEach((s, i) => {
          const prior = result.all[i - 1];
          if (prior && prior.severity === s.severity && prior.p === s.p)
            expect(originalIndex.get(prior.id)!).toBeLessThan(originalIndex.get(s.id)!);
        });
      }
      // Shuffle deliberately equal keys: output must retain this exact input order.
      const tied = input.map((s) => signal({ id: s.id }));
      for (let i = tied.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [tied[i], tied[j]] = [tied[j]!, tied[i]!];
      }
      expect(rank(tied, NOW).all.map((s) => s.id)).toEqual(tied.map((s) => s.id));
      expect(input).toEqual(snapshot);
    });
  });
});

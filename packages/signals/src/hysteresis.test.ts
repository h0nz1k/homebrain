import { expect, it } from 'vitest';
import { NOW, ranked, signal } from './__fixtures__/helpers.js';
import { stabilize } from './hysteresis.js';
import { rank } from './rank.js';

const previous = { order: ['b', 'a'], shownAt: {} };
it('retains previous order for a score difference at or below the threshold', () => {
  const a = ranked({ id: 'a', p: 0.7 });
  const b = ranked({ id: 'b', p: 0.65 });
  expect(stabilize([a, b], previous, NOW).map((s) => s.id)).toEqual(['b', 'a']);
  expect(stabilize([a, { ...b, p: 0.6 }], previous, NOW).map((s) => s.id)).toEqual(['b', 'a']);
  expect(stabilize([a, b], previous, NOW, 0.01).map((s) => s.id)).toEqual(['a', 'b']);
});
it('reorders for a 0.15 difference and for severity changes', () => {
  expect(
    stabilize([ranked({ id: 'a', p: 0.8 }), ranked({ id: 'b', p: 0.65 })], previous, NOW).map(
      (s) => s.id,
    ),
  ).toEqual(['a', 'b']);
  expect(
    stabilize(
      [ranked({ id: 'a', p: 0.7, severity: 'warning' }), ranked({ id: 'b', p: 0.65 })],
      previous,
      NOW,
    ).map((s) => s.id),
  ).toEqual(['a', 'b']);
});
it('restores a reversed chain and ignores new IDs without mutating', () => {
  const cards = ['a', 'b', 'c'].map((id) => ranked({ id, p: 0.7 }));
  const before = structuredClone(cards);
  expect(stabilize(cards, { order: ['c', 'b', 'a'], shownAt: {} }, NOW).map((s) => s.id)).toEqual([
    'c',
    'b',
    'a',
  ]);
  expect(stabilize(cards, { order: ['c', 'a'], shownAt: {} }, NOW).map((s) => s.id)).toEqual([
    'a',
    'b',
    'c',
  ]);
  expect(cards).toEqual(before);
});
const inputs = ['a', 'b', 'c', 'd', 'e'].map((id, i) => signal({ id, relevance: 1 - i / 10 }));
const visible = (result: ReturnType<typeof rank>) =>
  [result.hero, ...result.cards].flatMap((s) => (s ? [s.id] : []));
it('keeps a visible slot for less than five minutes, then drops it', () => {
  const first = rank(inputs, NOW, { layout: 'mobile' });
  const changed = inputs.map((s) => (s.id === 'd' ? { ...s, relevance: 0 } : s));
  const next = rank(changed, new Date(NOW.getTime() + 299_999), {
    layout: 'mobile',
    previous: first.previous,
  });
  expect(visible(next)).toEqual(['a', 'b', 'c', 'd']);
  expect(next.previous.shownAt.d).toBe(NOW.getTime());
  const expired = rank(changed, new Date(NOW.getTime() + 300_000), {
    layout: 'mobile',
    previous: next.previous,
  });
  expect(visible(expired)).toEqual(['a', 'b', 'c', 'e']);
  expect(expired.previous.shownAt.d).toBeUndefined();
});
it('removes disappeared signals immediately and dates new slots', () => {
  const first = rank(inputs, NOW, { layout: 'mobile' });
  const later = new Date(NOW.getTime() + 1000);
  const result = rank(
    inputs.filter((s) => s.id !== 'd'),
    later,
    { layout: 'mobile', previous: first.previous },
  );
  expect(visible(result)).toEqual(['a', 'b', 'c', 'e']);
  expect(result.previous.shownAt).toMatchObject({ a: NOW.getTime(), e: later.getTime() });
});
it('critical signals always take space ahead of dwell reservations', () => {
  const first = rank(inputs, NOW, { layout: 'mobile' });
  const criticals = Array.from({ length: 5 }, (_, i) =>
    signal({ id: `critical-${i}`, severity: 'critical' }),
  );
  const result = rank([...inputs, ...criticals], NOW, {
    layout: 'mobile',
    previous: first.previous,
  });
  expect(visible(result)).toEqual(criticals.map((s) => s.id));
  expect(result.more).toBe(5);
});
it('rank applies score hysteresis when dwell is disabled', () => {
  const a = signal({ id: 'a', relevance: 0.25 });
  const b = signal({ id: 'b', relevance: 0.125 });
  const result = rank([a, b], NOW, { previous, minDwellMs: 0 });
  expect(result.hero?.id).toBe('b');
});

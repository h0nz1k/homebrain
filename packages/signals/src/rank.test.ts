import { describe, expect, it } from 'vitest';
import { EXPECTED, STATES } from './__fixtures__/round3.js';
import { NOW, signal } from './__fixtures__/helpers.js';
import { LAYOUT_LIMITS, rank, round3 } from './rank.js';
import { deadlineUrgency, eventUrgency, stateUrgency, urgency, windowUrgency } from './urgency.js';

describe('round 3 Python parity', () => {
  for (const [key, state] of Object.entries(STATES)) {
    for (const layout of Object.keys(LAYOUT_LIMITS) as Array<keyof typeof LAYOUT_LIMITS>) {
      it(`${key}/${layout}`, () => {
        const result = rank(state.signals, new Date(state.now), { layout });
        expect({
          hero: result.hero?.id ?? null,
          cards: result.cards.map((s) => [s.id, s.severity, s.p]),
          more: result.more,
          info: result.info.map((s) => s.id),
        }).toEqual(EXPECTED[`${key}/${layout}` as keyof typeof EXPECTED]);
      });
    }
  }
});

it('uses rounded urgency to compute the reference score', () => {
  const now = new Date(STATES.b.now);
  const rain = STATES.b.signals[0]!;
  expect(urgency(rain, now)).toBeCloseTo(Math.exp(-35 / 60), 12);
  const result = rank(STATES.b.signals, now);
  expect(result.cards[0]).toMatchObject({ u: 0.558, p: 0.615 });
  expect(result.hero).toMatchObject({ u: 0.708, p: 0.785 });
  expect(result.cards[1]).toMatchObject({ u: 0.775, p: 0.705 });
  expect(round3(0.6148)).toBe(0.615);
  expect(round3(0.6145)).toBe(0.615);
});

it('covers each urgency curve before, during and after validity', () => {
  const s = signal({ valid_from: '2026-11-01T12:00:00Z', valid_to: '2026-11-01T13:00:00Z' });
  const before = new Date('2026-11-01T11:00:00Z');
  const middle = new Date('2026-11-01T12:30:00Z');
  const after = new Date('2026-11-01T14:00:00Z');
  expect(eventUrgency(s, before)).toBe(Math.exp(-1));
  expect(eventUrgency(s, NOW)).toBe(1);
  expect(eventUrgency(s, middle)).toBe(0.75);
  expect(eventUrgency(s, after)).toBe(0.5);
  expect(windowUrgency(s, before)).toBe(Math.exp(-2));
  expect(windowUrgency(s, NOW)).toBeCloseTo(0.9);
  expect(windowUrgency(s, middle)).toBeCloseTo(0.6);
  expect(windowUrgency(s, after)).toBe(0.3);
  expect(deadlineUrgency(s, before)).toBe(0);
  expect(deadlineUrgency(s, NOW)).toBe(0.5);
  expect(deadlineUrgency(s, after)).toBe(1);
  expect(stateUrgency(s, before)).toBe(0.5);
  expect(stateUrgency(s, middle)).toBe(1);
  const zeroDuration = { ...s, valid_to: s.valid_from };
  expect(eventUrgency(zeroDuration, middle)).toBe(0.5);
  expect(windowUrgency(zeroDuration, middle)).toBe(0.3);
});

it('keeps related IDs as context without merging them', () => {
  const result = rank(STATES.b.signals, new Date(STATES.b.now));
  expect(result.hero?.relatedContext).toEqual(['weather.nowcast.rain']);
  expect(result.hero?.also).toEqual([]);
});

it('handles empty input and separates calm and info from cards', () => {
  expect(rank([], NOW)).toMatchObject({
    hero: null,
    cards: [],
    more: 0,
    info: [],
    calm: [],
    all: [],
    previous: { order: [], shownAt: {} },
  });
  const result = rank(STATES.a.signals, new Date(STATES.a.now));
  expect(result.calm.map((s) => s.id)).toEqual(['waste.next']);
});

it('is idempotent when ranked input already contains merged members', () => {
  const now = new Date(STATES.c.now);
  const first = rank(STATES.c.signals, now);
  const snapshot = structuredClone(first);
  expect(rank(first.all, now)).toEqual(first);
  expect(first).toEqual(snapshot);
});

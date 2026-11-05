import { describe, expect, it } from 'vitest';
import { LAYOUT_LIMITS, rank } from '@homebrain/signals';
import { FIXTURES, ICON_CONDITION_HINTS } from './fixtures.js';
import { parseInstant } from './time.js';
import type { StateKey } from './types.js';

const STATES: StateKey[] = ['a', 'a-night', 'b', 'c', 'd'];
const LAYOUTS = ['mobile', 'desktop', 'kiosk'] as const;

describe('fixtures rank', () => {
  it.each(STATES)('state %s ranks without error', (state) => {
    const data = FIXTURES[state];
    const now = parseInstant(data.now);
    for (const layout of LAYOUTS) {
      expect(() =>
        rank(data.signals, now, { layout, haConnected: data.ha.connected }),
      ).not.toThrow();
    }
  });

  it.each(LAYOUTS)('respects layout card limits for state b (%s)', (layout) => {
    const data = FIXTURES.b;
    const result = rank(data.signals, parseInstant(data.now), { layout });
    const limit = LAYOUT_LIMITS[layout].cards;
    expect(result.cards.length).toBeLessThanOrEqual(limit);
    expect((result.hero ? 1 : 0) + result.cards.length).toBeLessThanOrEqual(limit + 1);
  });

  it('state c hero is critical wind warning', () => {
    const data = FIXTURES.c;
    const result = rank(data.signals, parseInstant(data.now), {
      layout: 'desktop',
      haConnected: false,
    });
    expect(result.hero?.id).toBe('weather.chmu.wind');
    expect(result.hero?.severity).toBe('critical');
  });
});

describe('summary vs icon', () => {
  it.each(STATES)('condition text matches weather icon for %s', (state) => {
    const { station } = FIXTURES[state];
    const hints = ICON_CONDITION_HINTS[station.icon];
    const match = hints.some((hint) => station.condition.toLowerCase().includes(hint));
    expect(match).toBe(true);
  });
});

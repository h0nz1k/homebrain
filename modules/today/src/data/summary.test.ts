import { describe, expect, it } from 'vitest';
import { rank } from '@homebrain/signals';
import { buildSummary } from './summary.js';
import { FIXTURES } from './fixtures.js';
import { parseInstant } from './time.js';

describe('buildSummary', () => {
  it('hiddenCount equals ranked.more for each fixture state', () => {
    for (const data of Object.values(FIXTURES)) {
      const ranked = rank(data.signals, parseInstant(data.now), {
        layout: 'mobile',
        haConnected: data.ha.connected,
      });
      const summary = buildSummary(data, ranked);
      expect(summary.footer.hiddenCount).toBe(ranked.more);
    }
  });

  it('selects one unused info signal without repeating weather', () => {
    const data = FIXTURES.a;
    const ranked = rank(data.signals, parseInstant(data.now), { layout: 'desktop' });
    const summary = buildSummary(data, ranked);
    expect(summary.sentence).toBe('Klidný den · Přebytek FVE 1,6 kW');
    expect(summary.signalId).toBe('energy.pv');
    expect(summary.sentence).not.toContain(data.station.condition);
    expect(summary.sentence).not.toContain('°C');
  });
});

it.each([
  ['b', 'Rušné ráno'],
  ['c', 'Kritická situace'],
  ['d', 'Pozor'],
] as const)('uses the mood for %s without repeating the hero', (key, mood) => {
  const data = FIXTURES[key];
  const ranked = rank(data.signals, parseInstant(data.now), { layout: 'desktop' });
  const summary = buildSummary(data, ranked);
  expect(summary.sentence.startsWith(mood)).toBe(true);
  expect(summary.sentence).not.toContain(ranked.hero!.title);
});

import { expect, it } from 'vitest';
import { NOW, signal } from './__fixtures__/helpers.js';
import { buildCalmSummary, isCalm } from './summary.js';

it('formats Czech weather and preserves the best info title', () => {
  expect(
    buildCalmSummary({
      now: NOW,
      tempC: 12.4,
      sky: 'odpoledne polojasno',
      ranked: [signal({ severity: 'info', title: 'Levný proud 13–15 h' })],
    }),
  ).toBe('Klidný den · 12 °C, odpoledne polojasno · Levný proud 13–15 h');
});
it('skips absent weather/info parts', () => {
  expect(buildCalmSummary({ now: NOW, ranked: [] })).toBe('Klidný den');
  expect(buildCalmSummary({ now: NOW, sky: 'jasno', tempC: NaN, ranked: [] })).toBe(
    'Klidný den · jasno',
  );
  expect(buildCalmSummary({ now: NOW, tempC: -3, ranked: [] })).toBe('Klidný den · -3 °C');
});
it('selects evening, morning warning, afternoon warning, and critical moods', () => {
  const warning = signal({ severity: 'warning', title: 'Silný vítr' });
  expect(buildCalmSummary({ now: new Date('2026-11-01T18:00:00Z'), ranked: [] })).toBe(
    'Klidný večer',
  );
  expect(buildCalmSummary({ now: new Date('2026-11-01T07:00:00Z'), ranked: [warning] })).toBe(
    'Rušné ráno',
  );
  expect(buildCalmSummary({ now: NOW, ranked: [warning] })).toBe('Pozor: Silný vítr');
  expect(
    buildCalmSummary({
      now: NOW,
      ranked: [warning, signal({ severity: 'critical', title: 'Výpadek sítě' })],
    }),
  ).toBe('Výpadek sítě');
});
it('is calm exactly when there are no notice, warning or critical signals', () => {
  expect(isCalm([])).toBe(true);
  expect(isCalm([signal({ severity: 'calm' }), signal({ severity: 'info' })])).toBe(true);
  for (const severity of ['notice', 'warning', 'critical'] as const)
    expect(isCalm([signal({ severity })])).toBe(false);
});

import { expect, it } from 'vitest';
import { STATES } from './__fixtures__/round3.js';
import { rank } from './rank.js';
import {
  chmuWarningSeverity,
  haDataSeverity,
  rainNowcastSeverity,
  windGustSeverity,
} from './severity.js';

it.each([
  ['yellow', 'notice'],
  ['orange', 'warning'],
  ['red', 'critical'],
  ['purple', 'critical'],
] as const)('CHMU %s → %s', (level, expected) => {
  expect(chmuWarningSeverity(level)).toBe(expected);
});
it.each([
  [{ connected: false, ageS: 0 }, 'critical'],
  [{ connected: true, ageS: 3601 }, 'critical'],
  [{ connected: true, ageS: 3600 }, 'warning'],
  [{ connected: true, ageS: 121 }, 'warning'],
  [{ connected: true, ageS: 120 }, 'calm'],
  [{ connected: true, ageS: 60, staleAfterS: 30 }, 'warning'],
] as const)('HA data %j → %s', (input, expected) => expect(haDataSeverity(input)).toBe(expected));
it.each([
  [0.5, 'notice'],
  [1, 'warning'],
  [4, 'warning'],
  [4.1, 'warning'],
] as const)('rain %s → %s', (value, expected) => expect(rainNowcastSeverity(value)).toBe(expected));
it('promotes heavy rain and hail only with a CHMU warning', () => {
  expect(rainNowcastSeverity(5, { chmuWarning: true })).toBe('critical');
  expect(rainNowcastSeverity(0.5, { hail: true })).toBe('warning');
  expect(rainNowcastSeverity(0.5, { hail: true, chmuWarning: true })).toBe('critical');
  expect(rainNowcastSeverity(2, { chmuWarning: true })).toBe('warning');
});
it.each([
  [49.9, 'info'],
  [50, 'notice'],
  [69.9, 'notice'],
  [70, 'warning'],
  [90, 'warning'],
  [90.1, 'critical'],
] as const)('wind %s → %s', (value, expected) => expect(windGustSeverity(value)).toBe(expected));
it('state c under owner rules', () => {
  const signals = STATES.c.signals.map((s) => ({
    ...s,
    severity:
      s.id === 'weather.chmu.wind'
        ? chmuWarningSeverity('orange')
        : s.id === 'system.ha.stale'
          ? haDataSeverity({ connected: false, ageS: 840 })
          : s.severity,
  }));
  const result = rank(signals, new Date(STATES.c.now));
  expect(result.hero?.id).toBe('system.ha.stale');
  expect(result.cards.map((s) => s.id)).toEqual(['weather.chmu.wind', 'energy.battery.low']);
  const red = signals.map((s) =>
    s.id === 'weather.chmu.wind' ? { ...s, severity: chmuWarningSeverity('red') } : s,
  );
  expect(rank(red, new Date(STATES.c.now)).hero).toMatchObject({
    id: 'weather.chmu.wind',
    severity: 'critical',
  });
});

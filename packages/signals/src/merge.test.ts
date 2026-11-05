import { expect, it } from 'vitest';
import { STATES } from './__fixtures__/round3.js';
import { signal } from './__fixtures__/helpers.js';
import { mergeGroups } from './merge.js';

it('merges station gust into the CHMU host', () => {
  const merged = mergeGroups(STATES.c.signals);
  expect(merged[0]?.id).toBe('weather.chmu.wind');
  expect(merged[0]?.also.map((s) => s.id)).toEqual(['weather.station.gust']);
  expect(merged).toHaveLength(4);
});
it('upgrades a later host in the first group position, preserving its old host tree', () => {
  const input = [
    signal({ id: 'first', group: 'wind' }),
    signal({ id: 'other' }),
    signal({ id: 'second', group: 'wind' }),
    signal({ id: 'critical', group: 'wind', severity: 'critical' }),
    signal({ id: 'last', group: 'wind' }),
  ];
  const merged = mergeGroups(input);
  expect(merged.map((s) => s.id)).toEqual(['critical', 'other']);
  expect(merged[0]?.also.map((s) => s.id)).toEqual(['first', 'last']);
  expect(merged[0]?.also[0]?.also.map((s) => s.id)).toEqual(['second']);
});
it('retains first host for equal severity and never groups missing/empty keys', () => {
  const merged = mergeGroups([
    signal({ id: 'a', group: 'g' }),
    signal({ id: 'b', group: 'g' }),
    signal({ id: 'c', group: '' }),
    signal({ id: 'd', group: '' }),
  ]);
  expect(merged.map((s) => s.id)).toEqual(['a', 'c', 'd']);
  expect(merged[0]?.also[0]?.id).toBe('b');
});
it('does not mutate input even on repeated calls or host upgrades', () => {
  const input = [
    signal({ id: 'a', group: 'g' }),
    signal({ id: 'b', group: 'g', severity: 'critical' }),
  ];
  const snapshot = structuredClone(input);
  input.forEach(Object.freeze);
  Object.freeze(input);
  expect(mergeGroups(input)).toEqual(mergeGroups(input));
  expect(input).toEqual(snapshot);
  expect(mergeGroups(input)[0]).not.toBe(input[1]);
});

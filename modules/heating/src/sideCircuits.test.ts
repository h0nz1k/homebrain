import { describe, expect, it } from 'vitest';
import { buildMockSnapshot } from './mock.js';
import { fishHeatChip } from './sideCircuits.js';

describe('fish heat chip', () => {
  it('topí when valve open', () => {
    const snap = buildMockSnapshot('heating', 0);
    expect(fishHeatChip(snap.extras.fish!)).toMatchObject({ label: 'topí', tone: 'ok' });
  });

  it('netopí – teplo stačí when heating on, valve closed, temp ≥ target', () => {
    const snap = buildMockSnapshot('idle', 0);
    expect(fishHeatChip(snap.extras.fish!)).toMatchObject({
      label: 'netopí – teplo stačí',
      tone: 'ok',
    });
  });

  it('warn tone below target − hyst − 1 °C', () => {
    const snap = buildMockSnapshot('heating', 0);
    const fish = { ...snap.extras.fish!, temp: 6.5 };
    expect(fishHeatChip(fish)).toMatchObject({
      belowTarget: true,
      tone: 'warn',
    });
  });

  it('vytápění vypnuto', () => {
    const snap = buildMockSnapshot('heating', 0);
    const fish = { ...snap.extras.fish!, heating_on: false, valve_open: false };
    expect(fishHeatChip(fish)).toMatchObject({ label: 'vytápění vypnuto', tone: 'neutral' });
  });
});

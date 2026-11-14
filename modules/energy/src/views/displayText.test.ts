import { describe, expect, it } from 'vitest';
import type { EnergySetting } from '../settings.js';
import { displayText } from './EnergySettingsView.js';

const row = (over: Partial<EnergySetting>): EnergySetting => ({
  key: 'demo',
  section: 'Baterie',
  label: 'Demo',
  unit: '',
  summary: 's',
  explanation: 'e',
  value: null,
  editable: false,
  ...over,
});

describe('displayText', () => {
  it('distinguishes option, unassigned binding and disconnected entity', () => {
    expect(displayText(row({ key: 'battery_capacity_kwh' }))).toBe('nenastaveno');
    expect(displayText(row({ binding: 'energy_fast_charge' }))).toBe('nepřiřazeno');
    expect(
      displayText(row({ binding: 'energy_fast_charge', entity_id: 'switch.demo_fast_charging' })),
    ).toBe('nepřipojeno');
  });
});
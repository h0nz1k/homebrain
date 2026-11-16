import { describe, expect, it } from 'vitest';
import { buildMockSnapshot } from '../mock.js';
import { bindSchematicValues, schematicPipeActive } from './bindSchematicValues.js';
import { DETAIL_SCHEMATIC_MODEL } from './buildDetailModel.js';

describe('full schematic live values', () => {
  it('keeps house, pool heating and filtration independent', () => {
    const snap = buildMockSnapshot('heating', 3);
    snap.pumps.heating = false;
    snap.extras.pool = { temp: 28, heating_pump: false, filter_pump: true };
    expect(schematicPipeActive('hp-supply', snap)).toBe(true);
    expect(schematicPipeActive('rad-supply', snap)).toBe(false);
    expect(schematicPipeActive('pool-floor-loop', snap)).toBe(false);
    expect(schematicPipeActive('pool-supply', snap)).toBe(false);
    expect(schematicPipeActive('pool-water', snap)).toBe(true);
    snap.mode.main_switch = false;
    expect(schematicPipeActive('pool-water', snap)).toBe(false);
  });

  it('gives every primary chip a value without fabricating a floor sensor', () => {
    const snap = buildMockSnapshot('heating', 3);
    const values = bindSchematicValues(DETAIL_SCHEMATIC_MODEL, snap);
    for (const label of DETAIL_SCHEMATIC_MODEL.labels.filter((l) => l.tier < 2)) {
      expect(values[label.id]?.value, label.id).toBeTruthy();
    }
    expect(DETAIL_SCHEMATIC_MODEL.labels.some((l) => l.id === 'pool-floor')).toBe(false);
  });
});

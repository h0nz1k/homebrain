import { describe, expect, it } from 'vitest';
import { DataQuality, EntityValue } from './index';

describe('Datové kontrakty', () => {
  const sample = {
    entityId: 'sensor.test_value',
    value: 21,
    updatedAt: '2026-01-01T12:00:00Z',
    quality: 'ok',
    source: 'test',
  };

  it('přijímá všechny stavy kvality a odmítá neznámou kvalitu', () => {
    for (const quality of DataQuality.options) {
      expect(EntityValue.parse({ ...sample, quality }).quality).toBe(quality);
    }
    expect(EntityValue.safeParse({ ...sample, quality: 'unknown' }).success).toBe(false);
  });

  it('ověřuje volitelnou jednotku, chybějící hodnotu a čas aktualizace', () => {
    expect(EntityValue.parse(sample).unit).toBeUndefined();
    expect(EntityValue.parse({ ...sample, value: null, unit: '°C' }).value).toBeNull();
    expect(EntityValue.safeParse({ ...sample, updatedAt: 'včera' }).success).toBe(false);
    expect(EntityValue.safeParse({ ...sample, source: undefined }).success).toBe(false);
  });
});

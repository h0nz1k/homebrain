import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chartTimeMarks } from './chartTime.js';

describe('chartTimeMarks přes změnu času (Europe/Prague, 2026-10-25)', () => {
  const previousTz = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = 'Europe/Prague';
  });
  afterAll(() => {
    if (previousTz === undefined) delete process.env.TZ;
    else process.env.TZ = previousTz;
  });
  const local = (ms: number) => {
    const d = new Date(ms);
    return `${d.getDate()}. ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  };
  it('půlnoci i popisky zůstanou na 0:00 / 12:00 místního času', () => {
    const now = Date.parse('2026-10-24T20:00:00Z'); // 22:00 CEST
    const { midnights, xLabels } = chartTimeMarks(now - 12 * 3600000, now + 48 * 3600000);
    expect(midnights.map(local)).toEqual(['25. 0:00', '26. 0:00']);
    expect(xLabels.map(local)).toEqual([
      '24. 12:00',
      '25. 0:00',
      '25. 12:00',
      '26. 0:00',
      '26. 12:00',
    ]);
    // den změny času má 25 h – pevný krok 24 h by skončil na 23:00
    expect(midnights[1]! - midnights[0]!).toBe(25 * 3600000);
    expect(xLabels[2]! - xLabels[1]!).toBe(13 * 3600000);
  });
});

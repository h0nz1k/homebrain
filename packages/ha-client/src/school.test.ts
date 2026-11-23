import { describe, expect, it } from 'vitest';
import { schoolDateLabel, schoolLastLoaded, schoolSoup } from './school.js';

describe('školní formáty', () => {
  it('polévka s malým písmenem, ostatní text beze změny', () => {
    expect(schoolSoup('Mrkvová')).toBe('polévka mrkvová');
    expect(schoolSoup('Hovězí vývar s nudlemi')).toBe('polévka hovězí vývar s nudlemi');
    expect(schoolSoup('Polévka Čočková')).toBe('polévka čočková');
  });

  it('datum s dnem v týdnu a „načteno“ po česku', () => {
    expect(schoolDateLabel('2026-11-04', true)).toBe('st 4. 11.');
    expect(schoolDateLabel('2026-11-04')).toBe('4. 11.');
    const now = new Date('2026-11-02T10:00:00+01:00');
    expect(schoolLastLoaded('2026-11-02T04:00:00+01:00', now)).toBe('načteno dnes 4:00');
    expect(schoolLastLoaded('2026-11-01T22:30:00+01:00', now)).toBe('načteno 1. 11. 22:30');
  });
});

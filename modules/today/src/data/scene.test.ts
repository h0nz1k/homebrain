import { describe, expect, it } from 'vitest';
import { arcXAtFraction, arcYAtFraction, computeScene } from './scene.js';
import { FIXTURES, fixtureFor } from './fixtures.js';

describe('computeScene', () => {
  it('places sun at x=0 and x=1 on sunrise and sunset', () => {
    expect(arcXAtFraction(0)).toBe(0);
    expect(arcXAtFraction(1)).toBe(1);
  });

  it('arc height is symmetric around solar noon fraction', () => {
    expect(arcYAtFraction(0.25)).toBeCloseTo(arcYAtFraction(0.75), 5);
    expect(arcYAtFraction(0.3)).toBeCloseTo(arcYAtFraction(0.7), 5);
  });

  it('nightDim is true for a-night and false for c at night', () => {
    const calmNight = computeScene(FIXTURES['a-night'], FIXTURES['a-night'].now);
    expect(calmNight.nightDim).toBe(true);

    const criticalNight = computeScene(
      {
        ...fixtureFor('c'),
        now: '2026-11-01T23:00:00+01:00',
      },
      '2026-11-01T23:00:00+01:00',
    );
    expect(criticalNight.nightDim).toBe(false);
    expect(criticalNight.phase).toBe('night');
  });

  it('scene key is stable for identical data', () => {
    const data = FIXTURES.a;
    const first = computeScene(data, data.now);
    const second = computeScene(structuredClone(data), data.now);
    expect(first.key).toBe(second.key);
  });

  it('changes key when cloud cover changes', () => {
    const base = FIXTURES.a;
    const other = { ...fixtureFor('a'), cloudCover: 0.9 };
    const a = computeScene(base, base.now);
    const b = computeScene(other, other.now);
    expect(a.key).not.toBe(b.key);
  });
});

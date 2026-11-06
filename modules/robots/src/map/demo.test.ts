import { describe, expect, it } from 'vitest';
import { demoVectorMap } from './demo.js';

type Demo = { map: { robot: { x: number; y: number }; path: unknown[] } };
const at = (nowMs: number, start?: number) =>
  (demoVectorMap(1, nowMs, 2000, null, start) as unknown as Demo).map;

describe('demoVectorMap route start (#38)', () => {
  it('starts at the given share of the route at time 0, independent of the wall clock', () => {
    expect(at(0, 0.1)).toEqual(at(999, 0.1));
    expect(at(0, 0.1).path.length).toBeLessThan(at(0, 0.5).path.length);
  });

  it('drives forward without wrapping for 15 ticks from the start share', () => {
    const lengths = Array.from({ length: 15 }, (_, k) => at(k * 2000, 0.05).path.length);
    lengths.slice(1).forEach((len, k) => expect(len).toBeGreaterThanOrEqual(lengths[k]!));
    expect(at(14 * 2000, 0.05).robot).not.toEqual(at(0, 0.05).robot);
  });
});

describe('demoVectorMap dense path with a route start (#38)', () => {
  it('records the travelled path in small steps, like a real robot, so the marker can glide', () => {
    type Pt = { x: number; y: number };
    const map = (k: number) =>
      (
        demoVectorMap(1, k * 2000, 2000, null, 0.4) as unknown as {
          map: { robot: Pt; path: number[] };
        }
      ).map;
    const tickStep = Math.hypot(map(1).robot.x - map(0).robot.x, map(1).robot.y - map(0).robot.y);
    const flat = map(1).path;
    const path = Array.from({ length: flat.length / 2 }, (_, i) => ({
      x: flat[2 * i]!,
      y: flat[2 * i + 1]!,
    }));
    const gaps = path.slice(1).map((p, i) => Math.hypot(p.x - path[i]!.x, p.y - path[i]!.y));
    expect(tickStep).toBeGreaterThan(0);
    expect(Math.max(...gaps)).toBeLessThanOrEqual(tickStep / 4);
  });
});

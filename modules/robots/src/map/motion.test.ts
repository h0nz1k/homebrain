import { describe, expect, it } from 'vitest';
import {
  easeTravel,
  glideDuration,
  planGlide,
  pointAt,
  smoothPath,
  trackBetween,
  type Pt,
} from './motion.js';

const PATH: Pt[] = [
  [0, 0],
  [100, 0],
  [200, 0],
  [200, 100],
  [200, 200],
];

describe('robot glide between map updates', () => {
  it('follows the recorded path instead of cutting the corner', () => {
    const track = trackBetween([100, 0], [200, 200], PATH);
    expect(track).toEqual([
      [100, 0],
      [200, 0],
      [200, 100],
      [200, 200],
    ]);
    // Half way along the track is past the corner, not the diagonal midpoint (150, 100).
    const mid = pointAt(track, 0.5);
    expect(mid.x).toBeCloseTo(200);
    expect(mid.y).toBeCloseTo(50);
    expect(mid.heading).toBeCloseTo(90);
  });

  it('marks which path points are already behind the marker', () => {
    expect(planGlide([100, 0], [200, 200], PATH).travelled).toBe(2);
    expect(planGlide(null, [200, 200], PATH)).toEqual({ track: [[200, 200]], travelled: 5 });
  });

  it('hops straight when the old position is far from the path, jumps without history', () => {
    expect(trackBetween([5000, 5000], [200, 200], PATH)).toEqual([
      [5000, 5000],
      [200, 200],
    ]);
    expect(trackBetween(null, [1, 2], PATH)).toEqual([[1, 2]]);
    expect(trackBetween([1, 2], [1, 2], PATH)).toEqual([[1, 2]]);
  });

  it('eases in/out but keeps a constant middle speed and exact ends', () => {
    expect(easeTravel(0)).toBe(0);
    expect(easeTravel(1)).toBeCloseTo(1);
    expect(easeTravel(0.5)).toBeCloseTo(0.5);
    const d1 = easeTravel(0.4) - easeTravel(0.3);
    const d2 = easeTravel(0.7) - easeTravel(0.6);
    expect(d1).toBeCloseTo(d2);
    for (let t = 0; t < 1; t += 0.05)
      expect(easeTravel(t + 0.05)).toBeGreaterThanOrEqual(easeTravel(t));
  });

  it('glides a bit shorter than the update interval, within limits', () => {
    expect(glideDuration(30_000)).toBe(27_600);
    expect(glideDuration(120_000)).toBe(30_000);
    expect(glideDuration(100)).toBe(600);
    expect(glideDuration(null)).toBe(1200);
  });
});

describe('smoothPath', () => {
  it('passes through every point with cubic segments', () => {
    const d = smoothPath([
      [0, 0],
      [10, 0],
      [10, 10],
    ]);
    expect(d.startsWith('M0.0 0.0C')).toBe(true);
    expect(d.match(/C/g)).toHaveLength(2);
    expect(d.endsWith(' 10.0 10.0')).toBe(true);
  });
  it('drops duplicates and needs two distinct points', () => {
    expect(smoothPath([[1, 1]])).toBe('');
    expect(
      smoothPath([
        [1, 1],
        [1, 1],
      ]),
    ).toBe('');
    expect(
      smoothPath([
        [0, 0],
        [0, 0],
        [4, 0],
      ]).match(/C/g),
    ).toHaveLength(1);
  });
});

describe('planGlide never tweens through walls or gaps', () => {
  // Invented corridor: a wall at x = 50 between two rooms, robot hops across it.
  const wall: Pt[] = [
    [50, -100],
    [50, 100],
  ];
  const crosses = (a: Pt, b: Pt) => (a[0] - 50) * (b[0] - 50) < 0 && Math.abs(a[1]) < 100;

  it('skips the blocked hop and glides only along the recorded points after it', () => {
    const path: Pt[] = [
      [10, 0],
      [20, 0],
      [80, 0],
      [90, 0],
    ];
    const plan = planGlide([10, 0], [100, 0], path, { blocked: crosses });
    expect(plan.track[0]).toEqual([80, 0]);
    for (let i = 1; i < plan.track.length; i++)
      expect(crosses(plan.track[i - 1]!, plan.track[i]!)).toBe(false);
    expect(wall).toHaveLength(2);
  });

  it('jumps straight to the pose when the last hop is blocked or too long', () => {
    expect(planGlide([10, 0], [90, 0], [], { blocked: crosses }).track).toEqual([[90, 0]]);
    const far = planGlide(
      [0, 0],
      [500, 0],
      [
        [0, 0],
        [500, 0],
      ],
      { maxGap: 100 },
    );
    expect(far.track).toEqual([[500, 0]]);
  });

  it('keeps the normal glide when nothing is blocked', () => {
    const path: Pt[] = [
      [10, 0],
      [20, 0],
      [30, 0],
    ];
    expect(planGlide([10, 0], [30, 0], path, { blocked: crosses }).track).toEqual([
      [10, 0],
      [20, 0],
      [30, 0],
    ]);
  });
});

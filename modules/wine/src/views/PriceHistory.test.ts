import { expect, it } from 'vitest';
import { smoothPath } from './PriceHistory.js';

it('smoothPath: monotone cubic through every point, no overshoot on a plateau', () => {
  expect(smoothPath([])).toBe('');
  expect(smoothPath([[0, 50]])).toBe('M0,50');
  const d = smoothPath([
    [0, 50],
    [50, 20],
    [100, 20],
  ]);
  expect(d.startsWith('M0,50C')).toBe(true);
  expect(d.endsWith(' 100,20')).toBe(true);
  // Plateau segment keeps control points on y=20 (no dip below the real price).
  const last = d
    .split('C')
    .pop()!
    .split(' ')
    .map((p) => Number(p.split(',')[1]));
  expect(last.every((y) => y === 20)).toBe(true);
});

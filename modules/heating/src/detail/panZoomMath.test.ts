import { describe, expect, it } from 'vitest';
import { fitAllTransform, labelTierVisible, zoomAtPoint } from './panZoomMath.js';

describe('panZoomMath', () => {
  const world = { x: -60, y: 60, w: 1225, h: 1140 };

  it('fit-all centres the drawing with margin', () => {
    const t = fitAllTransform({ x: 16, y: 70, w: 360, h: 600 }, world);
    expect(t.scale).toBeGreaterThan(0);
    const cx = (t.tx + (world.x + world.w / 2) * t.scale - (16 + 360 / 2)) / t.scale;
    expect(Math.abs(cx)).toBeLessThan(2);
  });

  it('LOD hides tier 2 until zoomed in', () => {
    expect(labelTierVisible(0, 0.2, 0.2)).toBe(true);
    expect(labelTierVisible(2, 0.25, 0.2)).toBe(false);
    expect(labelTierVisible(2, 1.2, 0.2)).toBe(true);
  });

  it('zoomAt clamps scale between min and max', () => {
    const base = { scale: 1, tx: 0, ty: 0, minScale: 0.2 };
    const out = zoomAtPoint(base, 100, 100, 10, 390, 844, world);
    expect(out.scale).toBeLessThanOrEqual(4);
    expect(out.scale).toBeGreaterThanOrEqual(0.2);
  });
});
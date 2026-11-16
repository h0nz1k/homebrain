import { describe, expect, it } from 'vitest';
import { clampPan, fitAllTransform, labelTierVisible, zoomAtPoint } from './panZoomMath.js';

describe('panZoomMath', () => {
  const world = { x: -60, y: 60, w: 1225, h: 1140 };

  it('fit-all centres the drawing with margin', () => {
    const t = fitAllTransform({ x: 16, y: 70, w: 360, h: 600 }, world);
    expect(t.scale).toBeGreaterThan(0);
    const cx = (t.tx + (world.x + world.w / 2) * t.scale - (16 + 360 / 2)) / t.scale;
    expect(Math.abs(cx)).toBeLessThan(2);
  });

  it('keeps the world visible after extreme pans and centred zoom', () => {
    const fit = fitAllTransform({ x: 8, y: 8, w: 344, h: 650 }, world);
    let zoomed = fit;
    for (let i = 0; i < 3; i++) zoomed = zoomAtPoint(zoomed, 180, 333, 1.25, 360, 666, world);
    for (const offset of [-10000, 10000]) {
      const p = clampPan({ ...zoomed, tx: offset, ty: offset }, 360, 666, world);
      expect(p.tx + world.x * zoomed.scale).toBeLessThanOrEqual(180);
      expect(p.tx + (world.x + world.w) * zoomed.scale).toBeGreaterThanOrEqual(180);
      expect(p.ty + world.y * zoomed.scale).toBeLessThanOrEqual(333);
      expect(p.ty + (world.y + world.h) * zoomed.scale).toBeGreaterThanOrEqual(333);
    }
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

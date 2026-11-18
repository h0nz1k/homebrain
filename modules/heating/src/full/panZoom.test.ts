import { describe, expect, it } from 'vitest';
import { READABLE_SCALE, clampView, fitView, focusView, toWorld, zoomAt } from './panZoom.js';

const WORLD = { x: 0, y: 0, w: 3235, h: 1300 };

describe('full schematic pan/zoom', () => {
  it('fit centres the whole drawing', () => {
    const v = fitView(1280, 740, WORLD);
    expect(v.scale).toBeCloseTo((1280 - 16) / 3235, 4);
    const [cx, cy] = toWorld(v, 640, 370);
    expect(cx).toBeCloseTo(1617.5, 1);
    expect(cy).toBeCloseTo(650, 1);
  });

  it('phone preset keeps labels readable (≥ 12 px) and centres on the chosen part', () => {
    const v = focusView(
      360,
      520,
      { x: 880, y: 330, w: 1350, h: 640 },
      { minScale: READABLE_SCALE, centre: [1235, 690] },
    );
    expect(v.scale).toBe(READABLE_SCALE);
    expect(15 * v.scale).toBeGreaterThanOrEqual(12);
    expect(toWorld(v, 180, 260)).toEqual([1235, 690]);
  });

  it('wide preset fits its box', () => {
    const v = focusView(1280, 700, { x: 880, y: 330, w: 1350, h: 640 });
    expect(v.scale).toBeCloseTo(Math.min(1280 / 1350, 700 / 640), 5);
  });

  it('zoom keeps the point under the finger and respects the limits', () => {
    const v = { scale: 0.5, tx: -100, ty: -40 };
    const z = zoomAt(v, 200, 100, 2, 0.1);
    expect(toWorld(z, 200, 100)).toEqual(toWorld(v, 200, 100));
    expect(zoomAt(v, 0, 0, 100, 0.1).scale).toBe(3);
    expect(zoomAt(v, 0, 0, 0.001, 0.1).scale).toBe(0.1);
  });

  it('clamp keeps the drawing on screen', () => {
    const c = clampView({ scale: 1, tx: 500, ty: 500 }, 400, 400, WORLD, 0.1);
    expect(c.tx + 0).toBe(0);
    expect(c.ty + 0).toBe(0);
    const far = clampView({ scale: 1, tx: -99_999, ty: -99_999 }, 400, 400, WORLD, 0.1);
    expect(far.tx).toBe(400 - 3235);
    expect(far.ty).toBe(400 - 1300);
    const small = clampView({ scale: 0.05, tx: 0, ty: 0 }, 400, 400, WORLD, 0.05);
    expect(small.tx).toBeCloseTo((400 - 3235 * 0.05) / 2, 5);
  });
});

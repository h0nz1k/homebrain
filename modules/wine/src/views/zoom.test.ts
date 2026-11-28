import { describe, expect, it } from 'vitest';
import {
  DOUBLE_TAP_SCALE,
  MAX_SCALE,
  MIN_SCALE,
  clampPan,
  clampScale,
  doubleTapToggle,
  zoomAround,
} from './zoom.js';

const VP = { width: 400, height: 800 };
const CENTER = { px: VP.width / 2, py: VP.height / 2 };

describe('clampScale', () => {
  it('passes through values within range', () => {
    expect(clampScale(2)).toBe(2);
    expect(clampScale(MIN_SCALE)).toBe(MIN_SCALE);
    expect(clampScale(MAX_SCALE)).toBe(MAX_SCALE);
  });
  it('clamps below MIN_SCALE to MIN_SCALE', () => {
    expect(clampScale(0.1)).toBe(MIN_SCALE);
  });
  it('clamps above MAX_SCALE to MAX_SCALE', () => {
    expect(clampScale(100)).toBe(MAX_SCALE);
  });
});

describe('zoomAround', () => {
  it('keeps the focal point fixed when zooming at viewport centre', () => {
    // When we zoom around the viewport centre, translation stays 0.
    const state = { scale: 1, tx: 0, ty: 0 };
    const zoomed = zoomAround(state, 2, CENTER.px, CENTER.py, VP);
    expect(zoomed.scale).toBe(2);
    expect(zoomed.tx).toBeCloseTo(0, 5);
    expect(zoomed.ty).toBeCloseTo(0, 5);
  });

  it('keeps the focal point fixed when zooming at a non-centre point', () => {
    // Start at scale=1, zoom to 2× around point (100, 200).
    // px=100, py=200, cx=200, cy=400
    // ratio = 2, tx = (100-200)*(1-2) + 0*2 = (-100)*(-1) = 100
    //          ty = (200-400)*(1-2) + 0*2 = (-200)*(-1) = 200
    const state = { scale: 1, tx: 0, ty: 0 };
    const zoomed = zoomAround(state, 2, 100, 200, VP);
    expect(zoomed.scale).toBe(2);
    expect(zoomed.tx).toBeCloseTo(100, 5);
    expect(zoomed.ty).toBeCloseTo(200, 5);

    // Verify: the image content under px=100, py=200 is the same before/after.
    // Before: imgX = (100 - 200 - 0) / 1 = -100, imgY = (200 - 400 - 0) / 1 = -200
    // After:  imgX = (100 - 200 - 100) / 2 = -100, imgY = (200 - 400 - 200) / 2 = -200 ✓
    const imgXBefore = (100 - 200 - state.tx) / state.scale;
    const imgXAfter = (100 - 200 - zoomed.tx) / zoomed.scale;
    expect(imgXAfter).toBeCloseTo(imgXBefore, 5);
  });

  it('clamps result to MAX_SCALE', () => {
    const state = { scale: 5, tx: 0, ty: 0 };
    const zoomed = zoomAround(state, 100, CENTER.px, CENTER.py, VP);
    expect(zoomed.scale).toBe(MAX_SCALE);
  });

  it('calls clampPan so translation stays in bounds', () => {
    // Zoom around a far corner with a large scale increment.
    const state = { scale: 1, tx: 0, ty: 0 };
    const zoomed = zoomAround(state, 6, 0, 0, VP);
    const maxX = (VP.width * (zoomed.scale - 1)) / 2;
    const maxY = (VP.height * (zoomed.scale - 1)) / 2;
    expect(Math.abs(zoomed.tx)).toBeLessThanOrEqual(maxX + 0.001);
    expect(Math.abs(zoomed.ty)).toBeLessThanOrEqual(maxY + 0.001);
  });
});

describe('clampPan', () => {
  it('forces tx=ty=0 at scale=1', () => {
    expect(clampPan({ scale: 1, tx: 999, ty: -999 }, VP)).toEqual({
      scale: 1,
      tx: 0,
      ty: 0,
    });
  });

  it('allows free movement within the allowed range', () => {
    const state = { scale: 2, tx: 100, ty: 200 };
    const clamped = clampPan(state, VP);
    // maxX = (400 * (2-1)) / 2 = 200; maxY = (800 * (2-1)) / 2 = 400
    expect(clamped.tx).toBe(100);
    expect(clamped.ty).toBe(200);
  });

  it('clamps excessive positive translation', () => {
    const state = { scale: 2, tx: 500, ty: 500 };
    const clamped = clampPan(state, VP);
    expect(clamped.tx).toBe(200); // maxX = 200
    expect(clamped.ty).toBe(400); // maxY = 400
  });

  it('clamps excessive negative translation', () => {
    const state = { scale: 2, tx: -500, ty: -500 };
    const clamped = clampPan(state, VP);
    expect(clamped.tx).toBe(-200);
    expect(clamped.ty).toBe(-400);
  });
});

describe('doubleTapToggle', () => {
  it('zooms in to DOUBLE_TAP_SCALE when at 1×', () => {
    const state = { scale: 1, tx: 0, ty: 0 };
    const zoomed = doubleTapToggle(state, CENTER.px, CENTER.py, VP);
    expect(zoomed.scale).toBe(DOUBLE_TAP_SCALE);
  });

  it('resets to 1× with tx=ty=0 when already zoomed', () => {
    const state = { scale: 3, tx: 100, ty: 200 };
    const reset = doubleTapToggle(state, CENTER.px, CENTER.py, VP);
    expect(reset.scale).toBe(MIN_SCALE);
    expect(reset.tx).toBe(0);
    expect(reset.ty).toBe(0);
  });

  it('zooms around the tap point, not the centre', () => {
    const state = { scale: 1, tx: 0, ty: 0 };
    const tapped = doubleTapToggle(state, 100, 100, VP);
    // The same content under (100, 100) should stay there.
    const imgXBefore = (100 - VP.width / 2 - state.tx) / state.scale;
    const imgXAfter = (100 - VP.width / 2 - tapped.tx) / tapped.scale;
    expect(imgXAfter).toBeCloseTo(imgXBefore, 5);
  });

  it('pan is clamped after zoom-in', () => {
    const state = { scale: 1, tx: 0, ty: 0 };
    // Tap at top-left corner of a very wide viewport – translation would be huge.
    const zoomed = doubleTapToggle(state, 0, 0, { width: 100, height: 100 });
    const maxX = (100 * (zoomed.scale - 1)) / 2;
    const maxY = (100 * (zoomed.scale - 1)) / 2;
    expect(Math.abs(zoomed.tx)).toBeLessThanOrEqual(maxX + 0.001);
    expect(Math.abs(zoomed.ty)).toBeLessThanOrEqual(maxY + 0.001);
  });
});

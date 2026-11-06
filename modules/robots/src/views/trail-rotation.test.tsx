// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { demoVectorMap } from '../map/demo.js';
import {
  frameFor,
  normRotation,
  rotatePoint,
  rotationTransform,
  toView,
  type MapRotation,
  type VectorMap,
} from '../map/geometry.js';
import { VectorFloorPlan, trailLayers, type TrailMode } from './VectorMap.js';

afterEach(cleanup);

const demo = (): VectorMap => {
  const result = demoVectorMap(1, 0);
  if (!result.available) throw new Error('demo map');
  return result.map;
};

describe('trailLayers (trail chip semantics)', () => {
  it('ON draws the whole run: swept area + line, no fade', () => {
    expect(trailLayers('full', 'cleaning', 300)).toEqual({ cover: 300, line: 300, fade: false });
    // Docked after a run: the last run stays visible.
    expect(trailLayers('full', 'idle', 120)).toEqual({ cover: 120, line: 120, fade: false });
  });
  it('OFF drops history: only a short fading tail while driving, nothing when parked', () => {
    expect(trailLayers('faded', 'cleaning', 300)).toEqual({ cover: 0, line: 8, fade: true });
    expect(trailLayers('faded', 'returning', 3)).toEqual({ cover: 0, line: 3, fade: true });
    expect(trailLayers('faded', 'idle', 300)).toEqual({ cover: 0, line: 0, fade: true });
    expect(trailLayers('faded', 'error', 300).line).toBe(0);
  });
});

describe('map rotation transform', () => {
  const map = demo();
  it('normalises the option value', () => {
    expect(normRotation(90)).toBe(90);
    expect(normRotation('270')).toBe(270);
    expect(normRotation(45)).toBe(0);
    expect(normRotation(undefined)).toBe(0);
  });
  it('swaps the view size for quarter turns', () => {
    const f0 = frameFor(map);
    const f90 = frameFor(map, 120, 90);
    expect([f90.width, f90.height]).toEqual([f0.height, f0.width]);
    expect([frameFor(map, 120, 180).width, frameFor(map, 120, 180).height]).toEqual([
      f0.width,
      f0.height,
    ]);
  });
  it.each([90, 180, 270] as MapRotation[])('%i°: points stay inside and turn clockwise', (rot) => {
    const f0 = frameFor(map);
    const f = frameFor(map, 120, rot);
    // Unrotated corners map onto rotated corners (clockwise quarter turns).
    const tl = rotatePoint(f, 0, 0);
    const tr = rotatePoint(f, f0.width, 0);
    const expected: Record<number, [number, number][]> = {
      90: [
        [f.width, 0],
        [f.width, f.height],
      ],
      180: [
        [f.width, f.height],
        [0, f.height],
      ],
      270: [
        [0, f.height],
        [0, 0],
      ],
    };
    expect([tl, tr]).toEqual(expected[rot]);
    // The SVG transform of the raster base matches the point transform.
    const [a, b, deg] = (rotationTransform(f)!.match(/-?[\d.]+/g) ?? []).map(Number);
    const rad = (deg! * Math.PI) / 180;
    const [ux, uy] = [1234, 567];
    const p = {
      x: a! + ux * Math.cos(rad) - uy * Math.sin(rad),
      y: b! + ux * Math.sin(rad) + uy * Math.cos(rad),
    };
    const [rx, ry] = rotatePoint(f, ux, uy);
    expect(p.x).toBeCloseTo(rx, 6);
    expect(p.y).toBeCloseTo(ry, 6);
    // toView = flip + rotate.
    const [vx, vy] = toView(frameFor(map), 2000, 3000);
    expect(toView(f, 2000, 3000)).toEqual(rotatePoint(f, vx, vy));
  });
});

function mount(trail: TrailMode, tone: 'cleaning' | 'idle', rotation: MapRotation = 0) {
  render(
    <div data-theme="dark">
      <VectorFloorPlan
        map={demo()}
        rooms={[{ id: 1, name: 'Obývací pokoj' }]}
        selected={[]}
        onToggle={vi.fn()}
        tone={tone}
        label="Mapa"
        trail={trail}
        rotation={rotation}
      />
    </div>,
  );
}

it('trail ON vs OFF renders visibly different trail layers', async () => {
  mount('full', 'idle');
  await act(async () => {});
  expect(screen.getByTestId('robots-map-cover')).toBeTruthy();
  const full = screen.getByTestId('robots-map-trail-line').getAttribute('d') ?? '';
  expect(full.length).toBeGreaterThan(50);
  cleanup();
  mount('faded', 'idle');
  await act(async () => {});
  expect(screen.queryByTestId('robots-map-cover')).toBeNull();
  expect(screen.getByTestId('robots-map-trail-line').getAttribute('d') ?? '').toBe('');
});

it('rotated plan: view box swapped, data-rotation set', async () => {
  mount('faded', 'cleaning', 90);
  await act(async () => {});
  const f = frameFor(demo(), 120, 90);
  const root = screen.getByTestId('robots-vector-map');
  expect(root.getAttribute('data-rotation')).toBe('90');
  expect(root.querySelector('svg')!.getAttribute('viewBox')).toBe(
    `0 0 ${Math.round(f.width)} ${Math.round(f.height)}`,
  );
});

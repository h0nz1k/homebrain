// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { demoVectorMap } from '../map/demo.js';
import { rasterRect, frameFor, type VectorMap } from '../map/geometry.js';
import { VectorFloorPlan } from './VectorMap.js';

afterEach(cleanup);

const demo = (): VectorMap => {
  const result = demoVectorMap(1, 0);
  if (!result.available) throw new Error('demo map');
  return result.map;
};
const rooms = [
  { id: 1, name: 'Obývací pokoj' },
  { id: 2, name: 'Kuchyně' },
  { id: 3, name: 'Jídelna' },
];

async function mount(
  map: VectorMap,
  theme = 'dark',
  extra: { selected?: number[]; tone?: 'cleaning' | 'idle' } = {},
) {
  const resolve = vi.fn(async (path: string) => `signed:${path}`);
  const onToggle = vi.fn();
  render(
    <div data-theme={theme}>
      <VectorFloorPlan
        map={map}
        rooms={rooms}
        selected={extra.selected ?? []}
        onToggle={onToggle}
        tone={extra.tone ?? 'cleaning'}
        label="Mapa"
        resolveBase={resolve}
      />
    </div>,
  );
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  return { resolve, onToggle };
}

it('raster mode (?mapa=rastr): themed base + wall layers at the payload bounds', async () => {
  window.history.replaceState(null, '', '/?mapa=rastr');
  const map = demo();
  const { resolve, onToggle } = await mount(map, 'light', { selected: [3] });
  expect(resolve).toHaveBeenCalledWith('/api/homebrain/robots/map/1/demo-1/light.png');
  expect(resolve).toHaveBeenCalledWith('/api/homebrain/robots/map/1/demo-1/light-walls.png');
  const base = screen.getByTestId('robots-map-base');
  expect(base.getAttribute('href')).toBe('signed:/api/homebrain/robots/map/1/demo-1/light.png');
  // Same transform as the overlays: the image rect is the raster bounds in view space.
  const rect = rasterRect(frameFor(map), map.raster!);
  expect(Number(base.getAttribute('x'))).toBeCloseTo(rect.x);
  expect(Number(base.getAttribute('height'))).toBeCloseTo(rect.height);
  expect(screen.getByTestId('robots-vector-map').getAttribute('data-base')).toBeTruthy();
  // Vector floor/walls are not drawn on top of the bitmap.
  expect(screen.queryByTestId('robots-map-walls')).toBeNull();
  // Wall layer sits above the room hit areas (selection tint stays under the walls).
  const svg = base.closest('svg')!;
  const order = Array.from(svg.children).map(
    (el: Element) => el.getAttribute('data-testid') ?? el.tagName,
  );
  expect(order.indexOf('robots-map-base-walls')).toBeGreaterThan(order.indexOf('g'));
  expect(screen.getByTestId('robots-map-room-3').getAttribute('data-selected')).toBe('true');
  fireEvent.click(screen.getByTestId('robots-map-room-2'));
  expect(onToggle).toHaveBeenCalledWith(2);
  window.history.replaceState(null, '', '/');
});

it('dark theme requests the dark layers; failed signing falls back to the vector drawing', async () => {
  window.history.replaceState(null, '', '/?mapa=rastr');
  const map = demo();
  const { resolve } = await mount(map, 'dark');
  expect(resolve).toHaveBeenCalledWith('/api/homebrain/robots/map/1/demo-1/dark.png');
  cleanup();
  render(
    <div data-theme="dark">
      <VectorFloorPlan
        map={map}
        rooms={rooms}
        selected={[]}
        onToggle={() => {}}
        tone="idle"
        label="Mapa"
        resolveBase={() => Promise.reject(new Error('denied'))}
      />
    </div>,
  );
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  expect(screen.queryByTestId('robots-map-base')).toBeNull();
  expect(screen.getByTestId('robots-map-walls')).toBeTruthy();
  window.history.replaceState(null, '', '/');
});

it('vector drawing is the default; the route history is faded unless turned on', async () => {
  await mount(demo());
  expect(screen.queryByTestId('robots-map-base')).toBeNull();
  expect(screen.getByTestId('robots-map-walls')).toBeTruthy();
  expect(screen.getByTestId('robots-vector-map').getAttribute('data-trail')).toBe('faded');
});

it('payload without raster or ?mapa=vektor keeps the vector map', async () => {
  await mount({ ...demo(), raster: null });
  expect(screen.queryByTestId('robots-map-base')).toBeNull();
  cleanup();
  window.history.replaceState(null, '', '/?mapa=vektor');
  await mount(demo());
  expect(screen.queryByTestId('robots-map-base')).toBeNull();
  window.history.replaceState(null, '', '/');
});

it('docked robot: the dock badge is moved out from under the robot', async () => {
  const map = demo();
  await mount({ ...map, robot: { ...map.dock!, a: 90 }, path: [] }, 'dark', { tone: 'idle' });
  const dock = screen.getByTestId('robots-map-dock');
  expect(dock.getAttribute('data-docked')).toBe('true');
  expect(screen.getByTestId('robots-map-robot').getAttribute('data-docked')).toBe('true');
  // Painted after (above) the robot and shifted away from the dock point.
  const robot = screen.getByTestId('robots-map-robot');
  expect(robot.compareDocumentPosition(dock) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(dock.getAttribute('transform')).toMatch(/scale\(0\.7\)/);
});

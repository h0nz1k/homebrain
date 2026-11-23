// @vitest-environment jsdom
import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { demoVectorMap } from '../../map/demo.js';
import { toggleRoom } from '../../rooms.js';
import { VectorFloorPlan } from '../VectorMap.js';
import { MapViewSwitch } from './MapViewSwitch.js';
import { createScene } from './scene.js';

vi.mock('./scene.js', () => ({ createScene: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

const demo = demoVectorMap(1, 0, 30_000, 'kuchyne');
if (!demo.available) throw new Error('Missing demo map');
const { map } = demo;
const rooms = map.rooms.map(({ id }) => ({ id, name: `Místnost ${id}` }));

function Harness() {
  const [mode, setMode] = useState('2d');
  const [selected, setSelected] = useState<number[]>([]);
  const props = {
    map,
    rooms,
    selected,
    onToggle: (id: number) => setSelected((previous) => toggleRoom(previous, id)),
    tone: 'idle' as const,
    label: 'Mapa',
    trail: 'faded' as const,
    rotation: 0 as const,
  };
  const floorPlan = <VectorFloorPlan {...props} />;
  return (
    <>
      <button onClick={() => setMode('2d')}>2D</button>
      <button onClick={() => setMode('3d')}>3D</button>
      {mode === '3d' ? <MapViewSwitch {...props} fallback={floorPlan} /> : floorPlan}
    </>
  );
}

it('preserves the same room order when switching between renderers', async () => {
  vi.mocked(createScene).mockImplementation((viewport, _, __, onToggle) => {
    viewport.addEventListener('click', () => onToggle(3));
    return { updateMap: vi.fn(), updateColors: vi.fn(), setView: vi.fn(), dispose: vi.fn() };
  });
  render(<Harness />);
  fireEvent.click(screen.getByTestId('robots-map-room-1'));
  fireEvent.click(screen.getByText('3D'));
  const scene = await screen.findByTestId('robots-map-3d');
  expect(scene.querySelector('[data-map3d-room="1"] .rb-map3d-badge')?.textContent).toBe('1');
  fireEvent.click(screen.getByRole('group', { name: 'Mapa' }));
  expect(scene.querySelector('[data-map3d-room="3"] .rb-map3d-badge')?.textContent).toBe('2');
  fireEvent.click(screen.getByText('2D'));
  expect(screen.getByTestId('robots-map-room-3').getAttribute('data-selected')).toBe('true');
});

it('uses the same 2D map and room selection when WebGL is unavailable', async () => {
  vi.mocked(createScene).mockReturnValue(null);
  render(<Harness />);
  fireEvent.click(screen.getByTestId('robots-map-room-1'));
  fireEvent.click(screen.getByText('3D'));
  expect(await screen.findByText(/3D pohled není dostupný/)).toBeTruthy();
  expect(screen.getByTestId('robots-map-room-1').getAttribute('data-selected')).toBe('true');
  expect(screen.queryByTestId('robots-map-3d')).toBeNull();
});

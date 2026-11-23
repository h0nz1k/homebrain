import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Button } from '@homebrain/ui';
import { orderBadge, type Room } from '../../rooms.js';
import type { MapRotation, VectorMap } from '../../map/geometry.js';
import { ROOM_HUES, ROOM_STEPS, type MarkerTone, type TrailMode } from '../VectorMap.js';
import type { CameraView } from './camera.js';
import { createScene } from './scene.js';

export interface Map3DProps {
  map: VectorMap;
  rooms: Room[];
  selected: number[];
  onToggle: (id: number) => void;
  tone: MarkerTone;
  label: string;
  trail: TrailMode;
  rotation: MapRotation;
  onUnavailable: () => void;
}

export default function Map3D({
  map,
  rooms,
  selected,
  onToggle,
  tone,
  label,
  trail,
  rotation,
  onUnavailable,
}: Map3DProps) {
  const viewport = useRef<HTMLDivElement>(null);
  const scene = useRef<ReturnType<typeof createScene>>(null);
  // The parent keys this component by layout and rotation, so pose samples reuse the GPU meshes.
  const [layout] = useState(() => ({ map, rotation }));
  const [view, setView] = useState<CameraView>('overview');
  const selectionKey = selected.join(',');
  const callbacks = useRef({ onToggle, onUnavailable });
  useEffect(() => {
    callbacks.current = { onToggle, onUnavailable };
  }, [onToggle, onUnavailable]);
  useEffect(() => {
    const current = viewport.current;
    if (!current) return;
    const unavailable = () => callbacks.current.onUnavailable();
    let renderer: ReturnType<typeof createScene>;
    try {
      renderer = createScene(
        current,
        layout.map,
        layout.rotation,
        (id) => callbacks.current.onToggle(id),
        unavailable,
      );
    } catch {
      renderer = null;
    }
    if (!renderer) {
      unavailable();
      return;
    }
    scene.current = renderer;
    return () => {
      renderer.dispose();
      scene.current = null;
    };
  }, [layout]);
  useEffect(() => {
    scene.current?.updateMap(map, tone, trail);
  }, [map, tone, trail]);
  useEffect(() => {
    scene.current?.updateColors();
  }, [selectionKey]);

  function chooseView(next: CameraView) {
    setView(next);
    scene.current?.setView(next, tone === 'cleaning' || tone === 'returning');
  }

  return (
    <div
      className="rb-map3d rv"
      data-testid="robots-map-3d"
      data-has-selection={!!selected.length || undefined}
    >
      <div className="rb-map3d-stage" ref={viewport} role="group" aria-label={label}>
        {layout.map.rooms.map(({ id }) => {
          const name = rooms.find((room) => room.id === id)?.name ?? 'Místnost';
          const badge = orderBadge(selected, id);
          return (
            <span key={id} className="rb-map3d-label" data-map3d-room={id} aria-hidden="true">
              {badge !== null && <span className="rb-map3d-badge">{badge}</span>}
              <span className="rb-map3d-room-name">{name}</span>
            </span>
          );
        })}
        <div hidden>
          {layout.map.rooms.map(({ id }, index) => (
            <span
              key={id}
              className="rv-room-under rb-map3d-room-color"
              data-map3d-color={id}
              data-selected={selected.includes(id) || undefined}
              style={
                {
                  '--rv-hue': ROOM_HUES[index % ROOM_HUES.length],
                  '--rv-step': ROOM_STEPS[index % ROOM_STEPS.length],
                } as CSSProperties
              }
            />
          ))}
          <span className="rb-map3d-wall-color" />
          <span className="rb-map3d-dock-color" />
          <span className="rb-map3d-live-color" />
        </div>
      </div>
      <div className="rb-map3d-controls" role="group" aria-label="Pohled na mapu">
        <Button aria-pressed={view === 'top'} onClick={() => chooseView('top')}>
          Pohled shora
        </Button>
        <Button
          aria-pressed={view === 'follow'}
          onClick={() => chooseView('follow')}
          disabled={!map.robot}
        >
          Sledovat robota
        </Button>
        <Button onClick={() => chooseView('overview')}>Výchozí pohled</Button>
      </div>
    </div>
  );
}

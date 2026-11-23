import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { orderBadge, type Room } from '../../rooms.js';
import type { MapView } from '../../uiMemory.js';
import type { MapRotation, VectorMap } from '../../map/geometry.js';
import { ROOM_HUES, ROOM_STEPS, type MarkerTone, type TrailMode } from '../VectorMap.js';
import type { CameraView } from './camera.js';
import { MapViewToggle } from './MapViewToggle.js';
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
  liveRoom?: number | null;
  onMapView?: (view: MapView) => void;
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
  liveRoom,
  onMapView,
  onUnavailable,
}: Map3DProps) {
  const viewport = useRef<HTMLDivElement>(null);
  const scene = useRef<ReturnType<typeof createScene>>(null);
  // The parent keys this component by layout and rotation, so pose samples reuse the GPU meshes.
  const [layout] = useState(() => ({ map, rotation }));
  const [view, setView] = useState<CameraView>('overview');
  const selectionKey = selected.join(',');
  const [hint, setHint] = useState(() => {
    try {
      return !hintSeen && localStorage.getItem(HINT_KEY) !== '1';
    } catch {
      return !hintSeen;
    }
  });
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
    // The stage takes the shape of the default view, so the plan fills the panel width.
    current.style.aspectRatio = String(Math.min(2.4, Math.max(1.05, renderer.shape)));
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
  }, [selectionKey, liveRoom, rooms]);

  function chooseView(next: CameraView) {
    setView(next);
    dismissHint();
    scene.current?.setView(next);
  }

  function dismissHint() {
    if (!hint) return;
    rememberHint();
    setHint(false);
  }

  return (
    <div className="rb-map-stack" data-testid="robots-map-3d">
      <div className="rb-map rb-map3d" data-map-kind="vector">
        <div
          className="rb-map3d-stage rv"
          data-walls=""
          data-has-selection={!!selected.length || undefined}
          ref={viewport}
          role="group"
          aria-label={label}
          onPointerDown={dismissHint}
          onWheel={dismissHint}
        >
          {layout.map.rooms.map(({ id }, index) => {
            const name = rooms.find((room) => room.id === id)?.name || 'Místnost';
            const badge = orderBadge(selected, id);
            const live = liveRoom === id;
            return (
              <span
                key={id}
                className="rv-label rb-map3d-label"
                data-map3d-room={id}
                data-selected={badge !== null || undefined}
                data-live={live || undefined}
                style={
                  {
                    '--rv-hue': ROOM_HUES[index % ROOM_HUES.length],
                    '--rv-step': ROOM_STEPS[index % ROOM_STEPS.length],
                  } as CSSProperties
                }
                aria-hidden="true"
                hidden
              >
                {badge !== null && <b className="rv-badge rb-map3d-badge">{badge}</b>}
                <span className="rv-label-text">{name}</span>
                <i className="rb-map3d-room-color" hidden />
              </span>
            );
          })}
          <div className="rb-map3d-bot" aria-hidden="true" hidden />
          <div className="rb-map3d-dock" aria-hidden="true" hidden>
            <svg viewBox="0 0 16 16" fill="currentColor">
              <path d="m9 2-5 7h3l-1 5 6-7H9z" />
            </svg>
          </div>
          <span className="rb-map3d-wall-color" hidden />
          <span className="rb-map3d-cap-color" hidden />
          <span className="rb-map3d-live-color" hidden />
          <span className="rb-map3d-live-edge" hidden />
          <span className="rb-map3d-hint" data-dismissed={!hint || undefined} aria-hidden={!hint}>
            Táhni pro otočení · štípni pro zoom
          </span>
        </div>
      </div>
      <div className="rb-map-view-row rb-map3d-toolbar">
        <div className="rb-map3d-cams" role="group" aria-label="Pohled kamery">
          {VIEWS.map(([key, title, icon]) => (
            <button
              key={key}
              type="button"
              aria-label={title}
              title={title}
              aria-pressed={view === key}
              disabled={key === 'follow' && !map.robot}
              onClick={() => chooseView(key)}
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d={icon} />
              </svg>
            </button>
          ))}
        </div>
        {onMapView && <MapViewToggle onMapView={onMapView} />}
      </div>
    </div>
  );
}

const HINT_KEY = 'homebrain.robots.ui.map-gesture-seen';
let hintSeen = false;

function rememberHint() {
  hintSeen = true;
  try {
    localStorage.setItem(HINT_KEY, '1');
  } catch {
    // In restricted browsers the hint is dismissed for the current page.
  }
}

const VIEWS = [
  ['overview', 'Výchozí', 'm12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Zm-8 4.5 8 4.5 8-4.5M12 12v9'],
  ['top', 'Shora', 'M4 4h16v16H4z M8 8h8v8H8z'],
  [
    'follow',
    'Sledovat',
    'M12 3v3m0 12v3M3 12h3m12 0h3 M18 12a6 6 0 1 1-12 0 6 6 0 0 1 12 0ZM12 11v2',
  ],
] as const;

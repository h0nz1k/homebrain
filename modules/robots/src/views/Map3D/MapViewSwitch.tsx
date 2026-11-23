import { lazy, Suspense, useState, type ReactNode } from 'react';
import { VectorMapBoundary } from '../VectorMap.js';
import type { Map3DProps } from './Map3D.js';

const Map3D = lazy(() => import('./Map3D.js'));

export function MapViewSwitch({
  fallback,
  onMapView,
  ...props
}: Omit<Map3DProps, 'onUnavailable'> & { fallback: ReactNode }) {
  const [unavailable, setUnavailable] = useState(false);
  // Loading and WebGL fallback keep an exit to the 2D mode.
  const wrap = (content: ReactNode) => (
    <div className="rb-map" data-map-kind="vector">
      {onMapView && (
        <div className="rb-map3d-controls" role="radiogroup" aria-label="Zobrazení mapy">
          <button type="button" role="radio" aria-checked={false} onClick={() => onMapView('2d')}>
            2D
          </button>
          <button type="button" role="radio" aria-checked={true}>
            3D
          </button>
        </div>
      )}
      {content}
    </div>
  );
  const backup = wrap(
    <>
      <p className="rb-map3d-note" role="status">
        3D pohled není dostupný. Zobrazujeme 2D mapu.
      </p>
      {fallback}
    </>,
  );
  if (unavailable) return backup;
  return (
    <VectorMapBoundary resetKey={props.map.digest} fallback={backup}>
      <Suspense
        fallback={wrap(
          <p className="rb-map3d-note" role="status">
            Načítá se 3D mapa…
          </p>,
        )}
      >
        <Map3D {...props} onMapView={onMapView} onUnavailable={() => setUnavailable(true)} />
      </Suspense>
    </VectorMapBoundary>
  );
}

import { lazy, Suspense, useState, type ReactNode } from 'react';
import { VectorMapBoundary } from '../VectorMap.js';
import type { Map3DProps } from './Map3D.js';

const Map3D = lazy(() => import('./Map3D.js'));

export function MapViewSwitch({
  fallback,
  ...props
}: Omit<Map3DProps, 'onUnavailable'> & { fallback: ReactNode }) {
  const [unavailable, setUnavailable] = useState(false);
  const backup = (
    <>
      <p className="rb-map3d-note" role="status">
        3D pohled není dostupný. Zobrazujeme 2D mapu.
      </p>
      {fallback}
    </>
  );
  if (unavailable) return backup;
  return (
    <VectorMapBoundary resetKey={props.map.digest} fallback={backup}>
      <Suspense
        fallback={
          <p className="rb-map3d-note" role="status">
            Načítá se 3D mapa…
          </p>
        }
      >
        <Map3D {...props} onUnavailable={() => setUnavailable(true)} />
      </Suspense>
    </VectorMapBoundary>
  );
}

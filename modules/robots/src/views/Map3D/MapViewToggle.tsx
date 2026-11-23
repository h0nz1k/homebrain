import type { MapView } from '../../uiMemory.js';
import { IconSegmentedControl } from '../IconSegmentedControl.js';

/** The same 2D | 3D segment as under the 2D map, so the switch never moves. */
export function MapViewToggle({ onMapView }: { onMapView: (view: MapView) => void }) {
  return (
    <IconSegmentedControl
      compact
      label="Zobrazení mapy"
      value="3d"
      options={[
        ['2d', '2D'],
        ['3d', '3D'],
      ]}
      onChange={onMapView}
      className="rb-map-view"
    />
  );
}

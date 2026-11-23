import { ExtrudeGeometry, Path, Shape, Vector2 } from 'three';
import {
  containsPoint,
  frameFor,
  polylabel,
  roomRings,
  toView,
  viewRing,
  type MapRotation,
  type Ring,
  type VectorMap,
} from '../../map/geometry.js';

export const WALL_HEIGHT = 780;
export const WALL_WIDTH = 105;
const SLAB_DEPTH = 140;

/** Match the SVG's even-odd fill, including disjoint fragments and islands within holes. */
export function roomSlab(rings: Ring[]): ExtrudeGeometry {
  const nested = rings.map((ring, index) =>
    rings.filter(
      (other, otherIndex) => otherIndex !== index && containsPoint([other], ...ring[0]!),
    ),
  );
  const points = (ring: Ring) => ring.map(([x, z]) => new Vector2(x, -z));
  const shapes = rings.flatMap((ring, index) => {
    const depth = nested[index]!.length;
    if (depth % 2) return [];
    const shape = new Shape(points(ring));
    shape.holes = rings.flatMap((hole, i) =>
      nested[i]!.length === depth + 1 && nested[i]!.includes(ring) ? [new Path(points(hole))] : [],
    );
    return [shape];
  });
  return new ExtrudeGeometry(shapes, { depth: SLAB_DEPTH, bevelEnabled: false })
    .rotateX(-Math.PI / 2)
    .translate(0, -SLAB_DEPTH, 0);
}

/** Each wall polyline is independent, so no geometry bridges door openings. */
export function wallSegments(walls: Ring[]) {
  return walls.flatMap((wall) =>
    wall.slice(1).flatMap(([x, z], index) => {
      const [x0, z0] = wall[index]!;
      const length = Math.hypot(x - x0, z - z0);
      return length > 0
        ? [{ x: (x + x0) / 2, z: (z + z0) / 2, length, angle: Math.atan2(z0 - z, x - x0) }]
        : [];
    }),
  );
}

export function planGeometry(map: VectorMap, rotation: MapRotation) {
  // Freeze the frame for this layout, even when the robot moves.
  const frame = frameFor({ ...map, robot: null }, 120, rotation);
  const center = ([x, z]: [number, number]): [number, number] => [
    x - frame.width / 2,
    z - frame.height / 2,
  ];
  const project = (x: number, y: number) => center(toView(frame, x, y));
  return {
    frame,
    project,
    walls: map.walls.map((wall) => viewRing(frame, wall).map(center)),
    rooms: map.rooms.map((room) => {
      const rings = roomRings(frame, room).map((ring) => ring.map(center));
      const [x, z] = polylabel(rings, 50);
      return { id: room.id, rings, label: [x, z] as const };
    }),
  };
}

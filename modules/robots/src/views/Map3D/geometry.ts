import { ExtrudeGeometry, Path, Shape, Vector2 } from 'three';
import {
  containsPoint,
  frameFor,
  pointToPolygonDist,
  polylabel,
  roomRings,
  toView,
  viewRing,
  type MapRotation,
  type Ring,
  type VectorMap,
} from '../../map/geometry.js';

export const WALL_HEIGHT = 780;
export const WALL_WIDTH = 140;
const SLAB_DEPTH = 40;

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
export function wallSegments(walls: Ring[], spurLength = 0) {
  const links = new Map<string, number>();
  const seen = new Set<string>();
  const segments = walls.flatMap((wall) =>
    wall.slice(1).flatMap((end, index) => {
      const start = wall[index]!;
      const [x, z] = end;
      const [x0, z0] = start;
      const length = Math.hypot(x - x0, z - z0);
      const keys = [start.join(':'), end.join(':')];
      const key = [...keys].sort().join('/');
      if (!length || seen.has(key)) return [];
      seen.add(key);
      for (const point of keys) links.set(point, (links.get(point) ?? 0) + 1);
      return [
        {
          x: (x + x0) / 2,
          z: (z + z0) / 2,
          length,
          angle: Math.atan2(z0 - z, x - x0),
          ends: [start, end],
          keys,
        },
      ];
    }),
  );
  // A short dead end at a branch is a scan spur. Keep standalone walls and door jambs.
  return segments.flatMap(({ keys, ...segment }) => {
    const a = links.get(keys[0]!)!;
    const b = links.get(keys[1]!)!;
    return segment.length <= spurLength && Math.min(a, b) === 1 && Math.max(a, b) >= 3
      ? []
      : [segment];
  });
}

export function planGeometry(map: VectorMap, rotation: MapRotation) {
  // Freeze the frame for this layout, even when the robot moves.
  const frame = frameFor({ ...map, robot: null }, 120, rotation);
  const center = ([x, z]: [number, number]): [number, number] => [
    x - frame.width / 2,
    z - frame.height / 2,
  ];
  const project = (x: number, y: number) => center(toView(frame, x, y));
  const zones = map.no_go.map((zone) => viewRing(frame, zone).map(center));
  const rooms = map.rooms.map((room) => {
    const rings = roomRings(frame, room).map((ring) => ring.map(center));
    const holes = zones.filter((zone) => zone.every(([x, z]) => containsPoint(rings, x, z)));
    const [x, z] = polylabel([...rings, ...holes], Math.max(frame.width, frame.height) / 400);
    return {
      id: room.id,
      rings,
      label: [x, z] as const,
      anchors: labelAnchors([...rings, ...holes], [x, z]),
    };
  });
  const floor = map.floor.length
    ? map.floor.map((ring) => viewRing(frame, ring).map(center)).flat()
    : rooms.flatMap((room) => room.rings.flat());
  return {
    frame,
    floor: floor.length
      ? floor
      : [project(map.bounds[0], map.bounds[1]), project(map.bounds[2], map.bounds[3])],
    rooms,
    project,
    walls: map.walls.map((wall) => viewRing(frame, wall).map(center)),
  };
}

/**
 * Label positions inside the room polygon: the pole of inaccessibility first, then other deep
 * interior points, so a label can step aside from the robot or route without crossing a wall.
 */
export function labelAnchors(rings: Ring[], pole: readonly [number, number], count = 6) {
  const outer = rings[0] ?? [];
  if (!outer.length) return [pole];
  const xs = outer.map(([x]) => x);
  const zs = outer.map(([, z]) => z);
  const [minX, maxX, minZ, maxZ] = [
    Math.min(...xs),
    Math.max(...xs),
    Math.min(...zs),
    Math.max(...zs),
  ];
  const step = Math.max(maxX - minX, maxZ - minZ) / 12;
  const cells: { x: number; z: number; d: number }[] = [];
  for (let x = minX + step / 2; x < maxX; x += step)
    for (let z = minZ + step / 2; z < maxZ; z += step) {
      const d = pointToPolygonDist(x, z, rings);
      if (d > 0) cells.push({ x, z, d });
    }
  cells.sort((a, b) => b.d - a.d);
  const anchors: (readonly [number, number])[] = [pole];
  for (const { x, z, d } of cells) {
    if (anchors.length >= count) break;
    // Keep the alternatives apart, otherwise they collide with the same obstacle.
    if (anchors.every(([ax, az]) => Math.hypot(ax - x, az - z) > Math.max(step * 1.5, d)))
      anchors.push([x, z] as const);
  }
  return anchors;
}

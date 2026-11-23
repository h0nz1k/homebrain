import { describe, expect, it } from 'vitest';
import { Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { pointToPolygonDist, toView, type Ring } from '../../map/geometry.js';
import { demoVectorMap } from '../../map/demo.js';
import { labelAnchors, planGeometry, roomSlab, wallSegments, WALL_HEIGHT } from './geometry.js';

const rect = (x: number, z: number, side: number): Ring => [
  [x, z],
  [x + side, z],
  [x + side, z + side],
  [x, z + side],
];

describe('3D map geometry', () => {
  it('extrudes room surfaces with the same even-odd holes and detached fragments as 2D', () => {
    const geometry = roomSlab([rect(0, 0, 12), rect(2, 2, 8), rect(4, 4, 4), rect(15, 0, 3)]);
    const material = new MeshBasicMaterial();
    const floor = new Mesh(geometry, material);
    const down = new Vector3(0, -1, 0);
    const hits = (x: number, z: number) =>
      new Raycaster(new Vector3(x, 40, z), down).intersectObject(floor);
    expect(hits(1, 1)[0]?.point.y).toBeCloseTo(0);
    expect(hits(3, 3)).toHaveLength(0);
    expect(hits(5, 5)).not.toHaveLength(0);
    expect(hits(16, 1)).not.toHaveLength(0);
    expect(hits(14, 1)).toHaveLength(0);
    geometry.dispose();
    material.dispose();
  });

  it('creates separate wall segments on either side of a door opening', () => {
    expect(
      wallSegments([
        [
          [0, 0],
          [1500, 0],
        ],
        [
          [2300, 0],
          [4000, 0],
          [4000, 0],
        ],
      ]),
    ).toEqual([
      {
        x: 750,
        z: 0,
        length: 1500,
        angle: 0,
        ends: [
          [0, 0],
          [1500, 0],
        ],
      },
      {
        x: 3150,
        z: 0,
        length: 1700,
        angle: 0,
        ends: [
          [2300, 0],
          [4000, 0],
        ],
      },
    ]);
    expect(WALL_HEIGHT).toBeGreaterThanOrEqual(600);
    expect(WALL_HEIGHT).toBeLessThanOrEqual(1000);
  });

  it('applies the same quarter-turn to rooms and pose as the 2D renderer', () => {
    const demo = demoVectorMap(1, 0);
    if (!demo.available) throw new Error('Missing demo map');
    const layout = planGeometry(demo.map, 90);
    const [x, y] = demo.map.rooms[0]!.polygons[0]!;
    const [u, v] = toView(layout.frame, x!, y!);
    const expected = [u - layout.frame.width / 2, v - layout.frame.height / 2];
    expect(layout.project(x!, y!)).toEqual(expected);
    expect(layout.rooms[0]?.rings[0]?.[0]).toEqual(expected);
  });

  it('offers label anchors inside the room polygon, starting with its visual centre', () => {
    // L-shaped room: the bounding box centre lies outside the polygon.
    const room: Ring = [
      [0, 0],
      [4000, 0],
      [4000, 1000],
      [1000, 1000],
      [1000, 4000],
      [0, 4000],
    ];
    const anchors = labelAnchors([room], [500, 500]);
    expect(anchors[0]).toEqual([500, 500]);
    expect(anchors.length).toBeGreaterThan(2);
    for (const [x, z] of anchors) expect(pointToPolygonDist(x, z, [room])).toBeGreaterThan(0);
    const demo = demoVectorMap(1, 0);
    if (!demo.available) throw new Error('Missing demo map');
    for (const { rings, label, anchors: list } of planGeometry(demo.map, 0).rooms) {
      expect(list[0]).toEqual(label);
      for (const [x, z] of list) expect(pointToPolygonDist(x, z, rings)).toBeGreaterThan(0);
    }
  });
});

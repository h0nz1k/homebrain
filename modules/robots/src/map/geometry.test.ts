import { describe, expect, it } from 'vitest';
import {
  clipTrail,
  frameFor,
  parseVectorMap,
  pointToPolygonDist,
  polylabel,
  roundedLine,
  roundedPath,
  segmentsCross,
  toView,
  type Ring,
} from './geometry.js';
import { demoVectorMap } from './demo.js';

const L_SHAPE: Ring = [
  [0, 0],
  [100, 0],
  [100, 30],
  [30, 30],
  [30, 100],
  [0, 100],
];

describe('parseVectorMap', () => {
  it('passes a valid map and drops malformed rooms/lists', () => {
    const demo = demoVectorMap(1, 0);
    expect(demo.available).toBe(true);
    const raw = JSON.parse(JSON.stringify(demo)) as { map: Record<string, unknown> };
    (raw.map.rooms as unknown[]).push({ id: 'x', polygons: [] }, { id: 99, polygons: [[1, 2]] });
    raw.map.no_go = [[1, 2, 3], 'bad'];
    const parsed = parseVectorMap({ available: true, map: raw.map });
    expect(parsed.available && parsed.map.rooms.map((r) => r.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(parsed.available && parsed.map.no_go).toEqual([]);
  });

  it('turns failures into fallback reasons', () => {
    expect(parseVectorMap({ available: false, reason: 'unsupported_ha' })).toEqual({
      available: false,
      reason: 'unsupported_ha',
    });
    expect(parseVectorMap(null)).toEqual({ available: false, reason: 'invalid' });
    expect(parseVectorMap({ available: true, map: { bounds: [0, 0, 1, 1], rooms: [] } })).toEqual({
      available: false,
      reason: 'no_rooms',
    });
  });
});

describe('frame + transform', () => {
  it('flips y and crops to the floor with padding', () => {
    const result = demoVectorMap(1, 0);
    if (!result.available) throw new Error('demo');
    const frame = frameFor(result.map, 100);
    const [x, y] = toView(frame, frame.minX + 10, frame.maxY - 20);
    expect([x, y]).toEqual([10, 20]);
    expect(frame.width).toBeGreaterThan(frame.height);
  });
});

describe('label placement (polylabel)', () => {
  it('puts the label inside the thick part of an L-shaped room, not at the bbox centre', () => {
    const [x, y, d] = polylabel([L_SHAPE], 0.5);
    // Bounding-box centre (50, 50) is outside the L.
    expect(pointToPolygonDist(50, 50, [L_SHAPE])).toBeLessThan(0);
    expect(pointToPolygonDist(x, y, [L_SHAPE])).toBeGreaterThan(0);
    expect(d).toBeGreaterThanOrEqual(14);
  });

  it('avoids holes', () => {
    const outer: Ring = [
      [0, 0],
      [100, 0],
      [100, 100],
      [0, 100],
    ];
    const hole: Ring = [
      [30, 30],
      [30, 70],
      [70, 70],
      [70, 30],
    ];
    const [x, y] = polylabel([outer, hole], 0.5);
    expect(pointToPolygonDist(x, y, [outer, hole])).toBeGreaterThan(10);
  });
});

describe('roundedPath', () => {
  it('rounds every corner with a quadratic curve and clamps the radius on short edges', () => {
    const d = roundedPath(
      [
        [0, 0],
        [100, 0],
        [100, 4],
        [0, 4],
      ],
      10,
    );
    expect(d.match(/Q/g)).toHaveLength(4);
    expect(d).toContain('M0 1.8Q0 0 1.8 0'); // 45 % of the 4-unit edge
    expect(d.endsWith('Z')).toBe(true);
    expect(roundedPath([[0, 0]], 5)).toBe('');
  });
});

describe('walls and trail clipping', () => {
  // Two rooms side by side (0–100 and 100–200), a wall at x = 100 with a door at y 40–60.
  const left: Ring = [
    [0, 0],
    [100, 0],
    [100, 100],
    [0, 100],
  ];
  const right: Ring = [
    [100, 0],
    [200, 0],
    [200, 100],
    [100, 100],
  ];
  const walls: Ring[] = [
    [
      [100, 0],
      [100, 40],
    ],
    [
      [100, 60],
      [100, 100],
    ],
  ];

  it('parses walls and dividers, tolerating payloads without them', () => {
    const demo = demoVectorMap(2, 0);
    if (!demo.available) throw new Error('demo');
    expect(demo.map.walls.length).toBeGreaterThan(5);
    const raw = JSON.parse(JSON.stringify(demo)) as { map: Record<string, unknown> };
    raw.map.walls = [[1, 2, 3, 4], [1, 2, 3], 'x'];
    delete raw.map.dividers;
    const parsed = parseVectorMap({ available: true, ...raw });
    expect(parsed.available && parsed.map.walls).toEqual([[1, 2, 3, 4]]);
    expect(parsed.available && parsed.map.dividers).toEqual([]);
  });

  it('keeps a path that goes through the door', () => {
    const runs = clipTrail(
      [
        [50, 50],
        [150, 50],
      ],
      [[left], [right]],
      walls,
      5,
    );
    expect(runs).toEqual([
      [
        [50, 50],
        [150, 50],
      ],
    ]);
  });

  it('splits the path where a segment would cut through a wall', () => {
    const runs = clipTrail(
      [
        [20, 20],
        [60, 20],
        [140, 20],
        [180, 20],
      ],
      [[left], [right]],
      walls,
      5,
    );
    expect(runs).toEqual([
      [
        [20, 20],
        [60, 20],
      ],
      [
        [140, 20],
        [180, 20],
      ],
    ]);
  });

  it('drops points outside the rooms (+ buffer) but keeps ones within the buffer', () => {
    const runs = clipTrail(
      [
        [10, 10],
        [50, -3],
        [90, 10],
        [90, 160],
        [80, 90],
        [60, 90],
      ],
      [[left]],
      [],
      5,
    );
    expect(runs).toEqual([
      [
        [10, 10],
        [50, -3],
        [90, 10],
      ],
      [
        [80, 90],
        [60, 90],
      ],
    ]);
  });

  it('a segment that leaves the plan between two inside points is split', () => {
    const uShape: Ring = [
      [0, 0],
      [100, 0],
      [100, 100],
      [70, 100],
      [70, 30],
      [30, 30],
      [30, 100],
      [0, 100],
    ];
    const runs = clipTrail(
      [
        [15, 90],
        [85, 90],
      ],
      [[uShape]],
      [],
      2,
    );
    expect(runs).toEqual([]);
  });

  it('segmentsCross ignores touching end points', () => {
    expect(
      segmentsCross(
        [
          [0, 0],
          [10, 10],
        ],
        [
          [0, 10],
          [10, 0],
        ],
      ),
    ).toBe(true);
    expect(
      segmentsCross(
        [
          [0, 0],
          [10, 0],
        ],
        [
          [10, 0],
          [10, 10],
        ],
      ),
    ).toBe(false);
  });

  it('roundedLine draws open polylines and closes loops', () => {
    const open = roundedLine(
      [
        [0, 0],
        [100, 0],
        [100, 100],
      ],
      10,
    );
    expect(open.startsWith('M0 0L90 0Q100 0 100 10')).toBe(true);
    expect(open.endsWith('L100 100')).toBe(true);
    expect(roundedLine([...left, left[0]!], 10).endsWith('Z')).toBe(true);
    expect(roundedLine([[0, 0]], 10)).toBe('');
  });
});

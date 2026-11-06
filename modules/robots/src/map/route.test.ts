import { describe, expect, it } from 'vitest';
import { demoVectorMap } from './demo.js';
import {
  frameFor,
  polylabel,
  roomAt,
  roomRings,
  segmentsCross,
  toView,
  viewRing,
  type VectorMap,
} from './geometry.js';
import { findDoors, planDoorRoute, planRoute, trimLine, type Pt } from './route.js';

const plan = () => {
  const result = demoVectorMap(1, 0, 30_000, 'kuchyne');
  if (!result.available) throw new Error('demo');
  const map: VectorMap = result.map;
  const frame = frameFor(map);
  const rooms = map.rooms.map((room) => roomRings(frame, room));
  const walls = map.walls.map((flat) => viewRing(frame, flat));
  const unit = Math.max(frame.width, frame.height) / 100;
  const centre = (id: number) => {
    const [x, y] = polylabel(rooms[map.rooms.findIndex((r) => r.id === id)]!, unit / 4);
    return [x, y] as Pt;
  };
  return { map, frame, rooms, walls, unit, centre };
};

describe('demo scenes', () => {
  it('pins the robot pose and derives its room from the map', () => {
    const a = demoVectorMap(1, 0, 30_000, 'kuchyne');
    const b = demoVectorMap(1, 9_999_999, 30_000, 'kuchyne');
    expect(a).toEqual(b);
    if (!a.available) throw new Error('demo');
    expect(roomAt(a.map, a.map.robot!.x, a.map.robot!.y)).toBe(2);
    const hall = demoVectorMap(1, 0, 30_000, 'chodba');
    if (!hall.available) throw new Error('demo');
    expect(roomAt(hall.map, hall.map.robot!.x, hall.map.robot!.y)).toBe(4);
    const dock = demoVectorMap(1, 0, 30_000, 'dok');
    if (!dock.available) throw new Error('demo');
    expect(dock.map.robot).toMatchObject({ x: dock.map.dock!.x, y: dock.map.dock!.y });
  });
});

describe('planned route', () => {
  it('runs from the robot through the doors to every selected room, never across a wall', () => {
    const { map, frame, rooms, walls, unit, centre } = plan();
    const start = toView(frame, map.robot!.x, map.robot!.y);
    const legs = planRoute(rooms, walls, start, [centre(3), centre(1)], {
      cell: unit * 1.4,
      clearance: unit * 1.6,
    });
    expect(legs).toHaveLength(2);
    for (const leg of legs) {
      expect(leg.length).toBeGreaterThan(1);
      for (let i = 1; i < leg.length; i++)
        for (const wall of walls)
          for (let k = 1; k < wall.length; k++)
            expect(segmentsCross([leg[i - 1]!, leg[i]!], [wall[k - 1]!, wall[k]!])).toBe(false);
    }
    expect(legs[0]![0]).toEqual(start);
    expect(legs[1]![legs[1]!.length - 1]).toEqual(centre(1));
    // String pulling keeps it to a few straight legs.
    expect(legs[1]!.length).toBeLessThan(8);
  });

  it('trims both ends of a polyline', () => {
    const line: Pt[] = [
      [0, 0],
      [10, 0],
      [10, 10],
    ];
    expect(trimLine(line, 5, 5)).toEqual([
      [5, 0],
      [10, 0],
      [10, 5],
    ]);
    expect(trimLine(line, 30, 0)).toEqual([]);
  });
});

const DOOR_OPTS = { minWidth: 550, maxWidth: 1500, joint: 60 };

describe('door graph', () => {
  const load = (slot: number, scene: 'kuchyne' | 'chodba' | 'dok' | null) => {
    const result = demoVectorMap(slot, 0, 30_000, scene);
    if (!result.available) throw new Error('demo');
    const map = result.map;
    const frame = frameFor(map);
    const rooms = map.rooms.map((room) => roomRings(frame, room));
    const walls = map.walls.map((flat) => viewRing(frame, flat));
    return { map, frame, rooms, walls, doors: findDoors(rooms, walls, DOOR_OPTS) };
  };

  it('finds every demo door between two rooms, at the centre of the gap', () => {
    const one = load(1, 'dok');
    // Living↔hall ×2, hall↔dining, kitchen↔dining, hall↔WC/bath/laundry/wardrobe.
    expect(one.doors).toHaveLength(8);
    for (const door of one.doors) {
      expect(door.width).toBeCloseTo(800, -1);
      expect(door.rooms[0]).not.toBe(door.rooms[1]);
    }
    expect(load(2, null).doors).toHaveLength(6);
  });

  for (const [slot, scene] of [
    [1, 'dok'],
    [1, 'kuchyne'],
    [1, 'chodba'],
    [2, null],
  ] as const)
    it(`plan ${slot}/${scene ?? 'parked'}: orthogonal legs through door centres, never across a wall`, () => {
      const { map, frame, rooms, walls, doors } = load(slot, scene);
      const start = toView(frame, map.robot!.x, map.robot!.y);
      const wallSegs = walls.flatMap((w) => w.slice(1).map((p, i) => [w[i]!, p] as [Pt, Pt]));
      const ids = rooms.map((_, i) => i);
      // Every room as a single target plus one long multi-room tour.
      for (const targets of [...ids.map((i) => [i]), [...ids].reverse()]) {
        const legs = planDoorRoute(rooms, walls, doors, start, targets, {
          clearance: 250,
          approach: 500,
          depth: 1200,
        });
        expect(legs, `targets ${targets.join(',')}`).not.toBeNull();
        for (const leg of legs!) {
          for (let i = 1; i < leg.length; i++) {
            const [a, b] = [leg[i - 1]!, leg[i]!];
            // Axis-parallel only (all demo doors sit in axis-parallel walls).
            expect(Math.min(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]))).toBeLessThan(1);
            for (const w of wallSegs) expect(segmentsCross([a, b], w)).toBe(false);
          }
          // Where a leg changes room it does so exactly through a door centre.
          const roomOf = (p: Pt) => rooms.findIndex((r) => r.length && pointInside(r, p));
          for (let i = 1; i < leg.length; i++) {
            const [a, b] = [leg[i - 1]!, leg[i]!];
            const ra = roomOf(a);
            const rb = roomOf(b);
            if (ra >= 0 && rb >= 0 && ra !== rb)
              expect(
                doors.some((d) => distSeg(d.c, a, b) < 1),
                `room change ${ra}→${rb} away from a door`,
              ).toBe(true);
          }
        }
      }
    });
});

function pointInside(rings: Pt[][], p: Pt): boolean {
  let inside = false;
  for (const ring of rings)
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i]!;
      const b = ring[j]!;
      if (
        a[1] > p[1] !== b[1] > p[1] &&
        p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]
      )
        inside = !inside;
    }
  return inside;
}

function distSeg(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l = dx * dx + dy * dy;
  const t = l ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l)) : 0;
  return Math.hypot(a[0] + dx * t - p[0], a[1] + dy * t - p[1]);
}

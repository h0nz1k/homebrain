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
import { planRoute, trimLine, type Pt } from './route.js';

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

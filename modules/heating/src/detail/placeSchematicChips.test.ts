import { describe, expect, it } from 'vitest';
import {
  segmentTouchesBox,
  placeSchematicChip,
  schematicObstacles,
} from './placeSchematicChips.js';
import { DETAIL_SCHEMATIC_MODEL } from './buildDetailModel.js';

describe('measured chip clearance', () => {
  it('clips horizontal, vertical and diagonal outlines, including end points', () => {
    const box = { x: 10, y: 10, w: 20, h: 20 };
    expect(segmentTouchesBox([0, 20, 40, 20], box)).toBe(true);
    expect(segmentTouchesBox([20, 0, 20, 40], box)).toBe(true);
    expect(segmentTouchesBox([0, 0, 10, 10], box)).toBe(true);
    expect(segmentTouchesBox([0, 3, 40, 3], box, 6)).toBe(false);
    expect(segmentTouchesBox([0, 4, 40, 4], box, 6)).toBe(true);
    expect(segmentTouchesBox([0, 0, 5, 5], box)).toBe(false);
  });
  it('moves a chip clear of a pipe and an already placed chip', () => {
    const model = DETAIL_SCHEMATIC_MODEL;
    const line = [100, 100, 500, 100] as const;
    const occupied = [{ x: 100, y: 200, w: 180, h: 60 }];
    const placed = placeSchematicChip({ x: 100, y: 80, w: 180, h: 60 }, occupied, model, [line], 1);
    expect(segmentTouchesBox(line, placed, 6)).toBe(false);
    expect(placed).not.toEqual({ x: 100, y: 80, w: 180, h: 60 });
    expect(schematicObstacles(model).length).toBeGreaterThan(model.pipes.length);
  });
  it('uses a narrow nearby slot that falls between grid samples', () => {
    const preferred = { x: 703.86, y: 67.73, w: 126.27, h: 93.54 };
    const occupied = [{ x: 500, y: 50, w: 195, h: 130 }];
    const placed = placeSchematicChip(preferred, occupied, DETAIL_SCHEMATIC_MODEL, [], 0.3929);
    expect(placed.y).toBe(preferred.y);
    expect(placed.x).toBeGreaterThan(714);
    expect(placed.x + placed.w).toBeLessThanOrEqual(DETAIL_SCHEMATIC_MODEL.bounds.w);
    expect(Math.hypot(placed.x - preferred.x, placed.y - preferred.y)).toBeLessThan(15);
  });
});

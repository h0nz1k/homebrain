import { describe, expect, it } from 'vitest';
import {
  LEVEL_ICON_CIRCLES,
  LEVEL_ICON_RECTS,
  levelIconFitsViewBox,
  type LevelIconKey,
} from './levelIcons.js';

describe('level icons viewBox', () => {
  it.each(['basic', 'advanced'] satisfies LevelIconKey[])('icon %s fits inside 24×24', (key) => {
    expect(levelIconFitsViewBox(key)).toBe(true);
    for (const [x, , w] of LEVEL_ICON_RECTS[key]) {
      expect(x + w).toBeLessThanOrEqual(24);
    }
    for (const [cx, , r] of LEVEL_ICON_CIRCLES[key]) {
      expect(cx + r).toBeLessThanOrEqual(24);
      expect(cx - r).toBeGreaterThanOrEqual(0);
    }
  });
});

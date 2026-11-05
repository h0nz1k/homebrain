/*
 * Box / circle geometry for the flow diagram's value pills and arrowheads (diagram units, no
 * DOM), shared by the placement in EnergyFlowHero and its collision tests.
 */

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
export interface Circle {
  cx: number;
  cy: number;
  r: number;
}

export const boxesHit = (a: Box, b: Box, gap = 0) =>
  a.x0 < b.x1 + gap && b.x0 < a.x1 + gap && a.y0 < b.y1 + gap && b.y0 < a.y1 + gap;

/** Distance from a box to a circle's rim (negative = overlap). */
export function boxCircleGap(b: Box, c: Circle): number {
  const px = Math.max(b.x0, Math.min(c.cx, b.x1));
  const py = Math.max(b.y0, Math.min(c.cy, b.y1));
  return Math.hypot(px - c.cx, py - c.cy) - c.r;
}

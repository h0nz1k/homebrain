import type { DetailSchematicModel } from './types.js';

export interface ChipBox {
  x: number;
  y: number;
  w: number;
  h: number;
}
export type LineSegment = readonly [number, number, number, number];

/** Segment/rectangle clipping, including diagonal roof edges and zero-length segments. */
export function segmentTouchesBox(segment: LineSegment, box: ChipBox, pad = 0): boolean {
  const [x, y, endX, endY] = segment;
  const dx = endX - x,
    dy = endY - y;
  let lo = 0,
    hi = 1;
  const p = [-dx, dx, -dy, dy];
  const q = [x - box.x + pad, box.x + box.w + pad - x, y - box.y + pad, box.y + box.h + pad - y];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i]! < 0) return false;
    } else {
      const t = q[i]! / p[i]!;
      if (p[i]! < 0) lo = Math.max(lo, t);
      else hi = Math.min(hi, t);
      if (lo > hi) return false;
    }
  }
  return true;
}

export function schematicObstacles(model: DetailSchematicModel): LineSegment[] {
  const lines: LineSegment[] = [];
  for (const pipe of model.pipes)
    for (let i = 1; i < pipe.points.length; i++) {
      const a = pipe.points[i - 1]!,
        b = pipe.points[i]!;
      lines.push([a[0], a[1], b[0], b[1]]);
    }
  const ratio = model.bodies.find((b) => b.id === 'tank')!.h / 420;
  for (const b of model.bodies.filter((b) => b.id.endsWith('house') || b.id === 'pool-hall')) {
    const roof = (b.id === 'pool-hall' ? 0 : b.id === 'main-house' ? 90 : 45) * ratio;
    const points = [
      [b.x, b.y + roof],
      [b.x + b.w / 2, b.y],
      [b.x + b.w, b.y + roof],
      [b.x + b.w, b.y + b.h],
      [b.x, b.y + b.h],
      [b.x, b.y + roof],
    ];
    for (let i = 1; i < points.length; i++)
      lines.push([points[i - 1]![0]!, points[i - 1]![1]!, points[i]![0]!, points[i]![1]!]);
  }
  return lines;
}

/** Pack measured, minimum-screen-size chips into reserved free space before paint. */
export function placeSchematicChip(
  preferred: ChipBox,
  occupied: ChipBox[],
  model: DetailSchematicModel,
  obstacles: LineSegment[],
  scale: number,
): ChipBox {
  const pad = 6.5 / scale + 3;
  const hall = model.bodies.find((b) => b.id === 'pool-hall')!;
  const ratio = model.bodies.find((b) => b.id === 'tank')!.h / 420;
  const solids: ChipBox[] = [
    ...model.bodies.filter((b) =>
      ['tank', 'hp', 'radiator', 'fish', 'pool', 'pool-exch'].includes(b.id),
    ),
    ...model.devices.map((d) => ({ x: d.x - 20, y: d.y - 20, w: 40, h: 40 })),
    { x: hall.x + hall.w * 0.26 - 55, y: hall.y + 100 * ratio - 30, w: 110, h: 40 },
  ];
  const candidates: ChipBox[] = [preferred];
  // An 8 px sampling grid can skip a valid narrow slot beside another chip.
  // Include exact edge placements so nearby labels never jump across the scene.
  for (const box of occupied) {
    candidates.push(
      { ...preferred, x: box.x + box.w + pad + 0.01 },
      { ...preferred, x: box.x - preferred.w - pad - 0.01 },
      { ...preferred, y: box.y + box.h + pad + 0.01 },
      { ...preferred, y: box.y - preferred.h - pad - 0.01 },
    );
  }
  const step = 8 / scale;
  for (let y = 12 / scale; y + preferred.h < model.bounds.h - 12 / scale; y += step)
    for (let x = 12 / scale; x + preferred.w < model.bounds.w - 12 / scale; x += step)
      candidates.push({ ...preferred, x, y });
  candidates.sort(
    (a, b) =>
      Math.hypot(a.x - preferred.x, a.y - preferred.y) -
      Math.hypot(b.x - preferred.x, b.y - preferred.y),
  );
  return (
    candidates.find((box) => {
      if (
        box.x < 0 ||
        box.y < 0 ||
        box.x + box.w > model.bounds.w ||
        box.y + box.h > model.bounds.h
      )
        return false;
      if (
        occupied.some(
          (b) =>
            box.x < b.x + b.w + pad &&
            box.x + box.w + pad > b.x &&
            box.y < b.y + b.h + pad &&
            box.y + box.h + pad > b.y,
        )
      )
        return false;
      if (obstacles.some((line) => segmentTouchesBox(line, box, pad))) return false;
      return !solids.some(
        (b) =>
          box.x < b.x + b.w + pad &&
          box.x + box.w + pad > b.x &&
          box.y < b.y + b.h + pad &&
          box.y + box.h + pad > b.y,
      );
    }) ?? preferred
  );
}

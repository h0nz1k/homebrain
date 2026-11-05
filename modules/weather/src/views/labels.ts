/**
 * Map label placement (pure): priority by rank, then candidate order; a label is kept only if
 * its estimated box keeps a minimum gap to every kept label and stays clear of reserved
 * rectangles (time chip, scale bar, home marker) and the map edge.
 */
export interface LabelCandidate {
  name: string;
  /** Anchor in map px (left edge of the text = x + dx, vertically centred on y). */
  x: number;
  y: number;
  rank: number;
  /** Pinned labels (the home town) are placed first and never dropped for spacing. */
  pinned?: boolean;
}
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface PlaceOptions {
  width: number;
  height: number;
  reserved?: Rect[];
  max?: number;
  /** Minimum free space between two label boxes (px). */
  gap?: number;
  /** Text offset right of the anchor dot (px). */
  dx?: number;
}

/** Rough text box: Inter at 12-13 px is ~0.56 em per glyph on average for Czech names. */
export function labelBox(c: LabelCandidate, dx = 7): Rect {
  const size = c.rank === 0 ? 13 : 12;
  const w = c.name.length * size * 0.56 + 2;
  return { x: c.x + dx - 4, y: c.y - size * 0.62, w: w + 4, h: size * 1.24 };
}

const clash = (a: Rect, b: Rect, gap: number) =>
  a.x < b.x + b.w + gap && a.x + a.w + gap > b.x && a.y < b.y + b.h + gap && a.y + a.h + gap > b.y;

export function placeMapLabels<T extends LabelCandidate>(cands: T[], o: PlaceOptions): T[] {
  const gap = o.gap ?? 10;
  const max = o.max ?? 8;
  const order = cands
    .map((c, i) => ({ c, i }))
    .sort(
      (a, b) => Number(!!b.c.pinned) - Number(!!a.c.pinned) || a.c.rank - b.c.rank || a.i - b.i,
    );
  const kept: { c: T; r: Rect }[] = [];
  for (const { c } of order) {
    if (kept.length >= max && !c.pinned) break;
    const r = labelBox(c, o.dx);
    const inside = r.x >= 4 && r.y >= 4 && r.x + r.w <= o.width - 4 && r.y + r.h <= o.height - 4;
    if (!inside) continue;
    if (!c.pinned && (o.reserved ?? []).some((z) => clash(r, z, 4))) continue;
    if (!c.pinned && kept.some((k) => clash(r, k.r, gap))) continue;
    kept.push({ c, r });
  }
  return kept.map((k) => k.c);
}

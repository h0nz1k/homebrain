/** Pan/zoom maths of the full-schematic viewer (pure; screen px ↔ drawing units). */
export interface View {
  scale: number;
  tx: number;
  ty: number;
}
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const MAX_SCALE = 3;
/** Drawing text is 15 units: from this scale every label is ≥ 12 CSS px. */
export const READABLE_SCALE = 0.8;

/** Whole drawing inside the viewport with `pad` px around. */
export function fitView(vw: number, vh: number, world: Rect, pad = 8): View {
  const scale = Math.max(0.01, Math.min((vw - 2 * pad) / world.w, (vh - 2 * pad) / world.h));
  return {
    scale,
    tx: vw / 2 - (world.x + world.w / 2) * scale,
    ty: vh / 2 - (world.y + world.h / 2) * scale,
  };
}

/** Keep the drawing on screen: centred when smaller than the viewport, edges clamped otherwise. */
export function clampView(v: View, vw: number, vh: number, world: Rect, minScale: number): View {
  const scale = Math.min(MAX_SCALE, Math.max(minScale, v.scale));
  const axis = (t: number, extent: number, start: number, length: number) => {
    const scaled = length * scale;
    if (scaled <= extent) return (extent - scaled) / 2 - start * scale;
    return Math.min(-start * scale, Math.max(extent - (start + length) * scale, t));
  };
  return {
    scale,
    tx: axis(v.tx, vw, world.x, world.w),
    ty: axis(v.ty, vh, world.y, world.h),
  };
}

/** Zoom by `factor` keeping the screen point (px, py) fixed. */
export function zoomAt(v: View, px: number, py: number, factor: number, minScale: number): View {
  const scale = Math.min(MAX_SCALE, Math.max(minScale, v.scale * factor));
  const r = scale / v.scale;
  return { scale, tx: px - (px - v.tx) * r, ty: py - (py - v.ty) * r };
}

/** Screen px → drawing units. */
export function toWorld(v: View, px: number, py: number): [number, number] {
  return [(px - v.tx) / v.scale, (py - v.ty) / v.scale];
}

export interface ViewBounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PanZoomState {
  scale: number;
  tx: number;
  ty: number;
  minScale: number;
}

export interface SafeRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const PAN_ZOOM_LIMITS = { minScaleFloor: 0.08, maxScale: 4, margin: 30, fitPad: 12 };

export function clampPan(
  state: PanZoomState,
  viewportW: number,
  viewportH: number,
  world: ViewBounds,
): Pick<PanZoomState, 'tx' | 'ty'> {
  const { scale, margin } = { scale: state.scale, margin: PAN_ZOOM_LIMITS.margin };
  const tx = Math.max(
    margin - (world.x + world.w) * scale,
    Math.min(viewportW - margin - world.x * scale, state.tx),
  );
  const ty = Math.max(
    margin - (world.y + world.h) * scale,
    Math.min(viewportH - margin - world.y * scale, state.ty),
  );
  return { tx, ty };
}

export function fitAllTransform(
  safe: SafeRect,
  world: ViewBounds,
): Pick<PanZoomState, 'scale' | 'tx' | 'ty' | 'minScale'> {
  const pad = PAN_ZOOM_LIMITS.fitPad;
  const minScale = Math.min((safe.w - pad) / world.w, (safe.h - pad) / world.h);
  const scale = minScale;
  const tx = safe.x + safe.w / 2 - (world.x + world.w / 2) * scale;
  const ty = safe.y + safe.h / 2 - (world.y + world.h / 2) * scale;
  return { scale, tx, ty, minScale };
}

export function focusBoxTransform(
  safe: SafeRect,
  box: { x: number; y: number; w: number; h: number },
  minScale: number,
  multiplier = 2,
): Pick<PanZoomState, 'scale' | 'tx' | 'ty'> {
  const pad = 16;
  const target = Math.min(minScale * multiplier, (safe.h - pad) / box.h, (safe.w - pad) / box.w);
  const scale = Math.max(minScale, target);
  const tx = safe.x + safe.w / 2 - (box.x + box.w / 2) * scale;
  const ty = safe.y + safe.h / 2 - (box.y + box.h / 2) * scale;
  return { scale, tx, ty };
}

export function zoomAtPoint(
  state: PanZoomState,
  cx: number,
  cy: number,
  factor: number,
  viewportW: number,
  viewportH: number,
  world: ViewBounds,
): PanZoomState {
  const nextScale = Math.min(
    PAN_ZOOM_LIMITS.maxScale,
    Math.max(state.minScale, state.scale * factor),
  );
  const r = nextScale / state.scale;
  const tx = cx - (cx - state.tx) * r;
  const ty = cy - (cy - state.ty) * r;
  const clamped = clampPan({ ...state, scale: nextScale, tx, ty }, viewportW, viewportH, world);
  return { ...state, scale: nextScale, ...clamped };
}

/** LOD tiers from r3: hide secondary values and sensor ids when zoomed out. */
export function labelTierVisible(tier: 0 | 1 | 2, scale: number, minScale: number): boolean {
  if (tier === 0) return true;
  if (tier === 1) return scale >= minScale * 1.5;
  return scale >= Math.max(minScale * 2.5, 1.1);
}
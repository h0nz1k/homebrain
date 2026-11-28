/**
 * Pure zoom / pan math for the label photo viewer (WIN-027).
 *
 * No DOM, no React — all functions are deterministic given their inputs.
 * The viewer applies `transform: translate(tx px, ty px) scale(scale)` with
 * `transform-origin: center center` on the image element, so the coordinate
 * system is relative to the viewport centre.
 */

export interface ZoomState {
  scale: number;
  /** Horizontal translation in px relative to the viewport centre. */
  tx: number;
  /** Vertical translation in px relative to the viewport centre. */
  ty: number;
}

export const MIN_SCALE = 1;
export const MAX_SCALE = 6;
/** Scale used by double-tap zoom-in. */
export const DOUBLE_TAP_SCALE = 2.5;

/** Clamp a scale value to [MIN_SCALE, MAX_SCALE]. */
export function clampScale(scale: number): number {
  return Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale));
}

/**
 * Zoom around a viewport point (px, py) so that the image pixel under the
 * pointer stays fixed on screen.
 *
 * Derivation: for a point P at (px, py) in viewport space, its position in
 * image space (centred transform) is:
 *   imgX = (px - cx - tx) / scale
 * After zooming to `newScale`, to keep the same image pixel at (px, py):
 *   newTx = (px - cx) - imgX * newScale = (px - cx) * (1 - ratio) + tx * ratio
 * where ratio = newScale / scale.
 */
export interface Size {
  width: number;
  height: number;
}

export function zoomAround(
  state: ZoomState,
  newScale: number,
  /** Viewport x of the focal point (pixels, top-left origin). */
  px: number,
  /** Viewport y of the focal point (pixels, top-left origin). */
  py: number,
  viewport: Size,
  /** Rendered image size at 1× (defaults to the viewport). */
  content: Size = viewport,
): ZoomState {
  const clamped = clampScale(newScale);
  const ratio = clamped / state.scale;
  const cx = viewport.width / 2;
  const cy = viewport.height / 2;
  const tx = (px - cx) * (1 - ratio) + state.tx * ratio;
  const ty = (py - cy) * (1 - ratio) + state.ty * ratio;
  return clampPan({ scale: clamped, tx, ty }, viewport, content);
}

/**
 * Clamp translation so the image edge never moves past the viewport edge.
 *
 * At scale = 1 translation is locked to (0, 0). For scale > 1 the image may
 * move by half of the part that overflows the viewport on each axis:
 * `max(0, content.w * scale - viewport.w) / 2`. An axis that still fits stays
 * centred (a tall narrow bottle photo can't be dragged sideways off screen).
 */
export function clampPan(state: ZoomState, viewport: Size, content: Size = viewport): ZoomState {
  if (state.scale <= MIN_SCALE) {
    return { scale: state.scale, tx: 0, ty: 0 };
  }
  const maxX = Math.max(0, (content.width * state.scale - viewport.width) / 2);
  const maxY = Math.max(0, (content.height * state.scale - viewport.height) / 2);
  return {
    scale: state.scale,
    tx: Math.max(-maxX, Math.min(maxX, state.tx)),
    ty: Math.max(-maxY, Math.min(maxY, state.ty)),
  };
}

/**
 * Double-tap toggle: zooms in to DOUBLE_TAP_SCALE around the tap point when
 * currently at 1×, or resets to 1× when already zoomed.
 */
export function doubleTapToggle(
  state: ZoomState,
  px: number,
  py: number,
  viewport: Size,
  content: Size = viewport,
): ZoomState {
  if (state.scale > MIN_SCALE) {
    return { scale: MIN_SCALE, tx: 0, ty: 0 };
  }
  return zoomAround(state, DOUBLE_TAP_SCALE, px, py, viewport, content);
}

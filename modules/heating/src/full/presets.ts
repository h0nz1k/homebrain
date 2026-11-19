import { READABLE_SCALE, type Rect, type View } from './panZoom.js';

/**
 * Focus presets of the full schematic (pure). Each preset is a content box in drawing units that
 * cuts no label (guarded by presets.test.ts): the viewer fits the box with padding and clips the
 * drawing to it, so nothing unrelated bleeds into the frame. A group shows its coarse box when it
 * is readable on this screen (≥ 12 CSS px text), otherwise its finer boxes.
 */
export interface Preset {
  id: string;
  label: string;
  box: Rect;
}
export interface PresetGroup extends Preset {
  fine: Preset[];
  /** r3: the coarse box would cut the valve cluster (rooms sit above it) – always the fine ones. */
  alwaysFine?: boolean;
}

const r = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h });

// r3: drawing units after the two free columns (valves | TČ +110, tank | right side +230).
export const PRESET_GROUPS: PresetGroup[] = [
  {
    id: 'tech',
    label: 'Technika',
    box: r(700, 329, 1766, 640),
    fine: [
      { id: 'valves', label: 'Ventily', box: r(940, 332, 410, 628) },
      { id: 'hp', label: 'TČ', box: r(1338, 470, 440, 520) },
      { id: 'tank', label: 'Nádrž', box: r(1972, 352, 469, 640) },
    ],
  },
  {
    id: 'pool',
    label: 'Bazén',
    box: r(2620, 724, 940, 506),
    fine: [
      { id: 'basin', label: 'Bazén', box: r(3270, 560, 290, 670) },
      { id: 'pit', label: 'Jímka', box: r(2840, 904, 422, 316) },
    ],
  },
  {
    id: 'house',
    label: 'Dům',
    box: r(280, 90, 868, 880),
    alwaysFine: true,
    fine: [
      { id: 'fish', label: 'Rybárna', box: r(280, 340, 410, 630) },
      { id: 'rooms', label: 'Patra', box: r(690, 90, 458, 240) },
    ],
  },
];

/** Whole drawing without the empty margins of the canvas. */
export const CONTENT: Rect = r(16, 86, 3543, 1146);

export const PRESET_PAD = 12;
/** Phones keep 8 px around a preset (every unit of width is text size there). */
export const padFor = (vw: number) => (vw < 700 ? 8 : PRESET_PAD);
/** Presets never magnify beyond this (a small box on a big screen stays a sensible size). */
export const PRESET_MAX_SCALE = 1.6;

/** Fit `box` into the viewport with padding, centred (or at the top: a phone lists facts below). */
export function boxView(
  vw: number,
  vh: number,
  box: Rect,
  pad = padFor(vw),
  align: 'centre' | 'top' = 'centre',
): View {
  const scale = Math.min(
    PRESET_MAX_SCALE,
    Math.max(0.01, Math.min((vw - 2 * pad) / box.w, (vh - 2 * pad) / box.h)),
  );
  return {
    scale,
    tx: vw / 2 - (box.x + box.w / 2) * scale,
    ty: align === 'top' ? pad - box.y * scale : vh / 2 - (box.y + box.h / 2) * scale,
  };
}

/**
 * r4: the visible frame of a preset on this screen. The box is fitted as before (its scale), then
 * grown along the axis with slack until it fills the viewport (inside the drawn content), so no
 * empty band stays above / below or beside the drawing. The frame is top-aligned under the
 * toolbar; the viewer later shrinks grown edges that would cut a text or glyph (`snapFrame`).
 */
export function presetFrame(
  vw: number,
  vh: number,
  box: Rect,
  pad = padFor(vw),
): { view: View; frame: Rect } {
  const { scale } = boxView(vw, vh, box, pad);
  const grow = (lo: number, len: number, want: number, min: number, max: number) => {
    const size = Math.min(Math.max(len, want), max - min);
    const start = Math.min(Math.max(lo - (size - len) / 2, min), max - size);
    return [start, size] as const;
  };
  const [x, w] = grow(box.x, box.w, (vw - 2 * pad) / scale, CONTENT.x, CONTENT.x + CONTENT.w);
  const [y, h] = grow(box.y, box.h, (vh - 2 * pad) / scale, CONTENT.y, CONTENT.y + CONTENT.h);
  const frame = { x, y, w, h };
  return { frame, view: frameView(vw, frame, scale, pad) };
}

/** View showing `frame` at `scale`: centred across, top-aligned under the toolbar. */
export function frameView(vw: number, frame: Rect, scale: number, pad = PRESET_PAD): View {
  return { scale, tx: vw / 2 - (frame.x + frame.w / 2) * scale, ty: pad - frame.y * scale };
}

/**
 * Shrink the grown edges of `frame` (never past `box`) until no item straddles an edge: a text,
 * pill or glyph is either whole in the frame or not shown at all (pure; boxes in drawing units).
 */
export function snapFrame(frame: Rect, box: Rect, items: readonly Rect[]): Rect {
  let [l, t, r, b] = [frame.x, frame.y, frame.x + frame.w, frame.y + frame.h];
  const [bl, bt, br, bb] = [box.x, box.y, box.x + box.w, box.y + box.h];
  for (let pass = 0; pass < 12; pass++) {
    let moved = false;
    for (const it of items) {
      const [il, it0, ir, ib] = [it.x, it.y, it.x + it.w, it.y + it.h];
      // only items that are (partly) visible matter
      if (ir <= l || il >= r || ib <= t || it0 >= b) continue;
      if (il < l && ir > l && l < bl) {
        l = Math.min(bl, ir + 2);
        moved = true;
      }
      if (ir > r && il < r && r > br) {
        r = Math.max(br, il - 2);
        moved = true;
      }
      if (it0 < t && ib > t && t < bt) {
        t = Math.min(bt, ib + 2);
        moved = true;
      }
      if (ib > b && it0 < b && b > bb) {
        b = Math.max(bb, it0 - 2);
        moved = true;
      }
    }
    if (!moved) break;
  }
  return { x: l, y: t, w: r - l, h: b - t };
}

/**
 * The grown frame may sit anywhere along its slack axis as long as it still holds the box: try
 * a few positions, snap each and keep the largest (ties: the most centred one).
 */
export function bestFrame(frame: Rect, box: Rect, items: readonly Rect[]): Rect {
  return bestPlacement(frame, box, items).snapped;
}

/** As `bestFrame`, plus the unsnapped frame at the chosen position. */
export function bestPlacement(
  frame: Rect,
  box: Rect,
  items: readonly Rect[],
): { snapped: Rect; raw: Rect } {
  const opts: Rect[] = [];
  const along = (lo: number, hi: number, set: (v: number) => Rect) => {
    for (let i = 0; i <= 8; i++) opts.push(set(lo + ((hi - lo) * i) / 8));
  };
  const xlo = Math.max(CONTENT.x, box.x + box.w - frame.w);
  const xhi = Math.min(box.x, CONTENT.x + CONTENT.w - frame.w);
  const ylo = Math.max(CONTENT.y, box.y + box.h - frame.h);
  const yhi = Math.min(box.y, CONTENT.y + CONTENT.h - frame.h);
  if (frame.h > box.h && yhi > ylo) along(ylo, yhi, (y) => ({ ...frame, y }));
  else if (frame.w > box.w && xhi > xlo) along(xlo, xhi, (x) => ({ ...frame, x }));
  else opts.push(frame);
  let best: { snapped: Rect; raw: Rect } | null = null;
  let bestScore = -Infinity;
  for (const o of opts) {
    const f = snapFrame(o, box, items);
    const off = Math.abs(o.x - frame.x) + Math.abs(o.y - frame.y);
    // more visible things beat empty room: each whole item inside counts like a small area
    const whole = items.filter(
      (it) => it.x >= f.x && it.y >= f.y && it.x + it.w <= f.x + f.w && it.y + it.h <= f.y + f.h,
    ).length;
    const score = f.w * f.h + whole * 600 - off * 0.01;
    if (score > bestScore) {
      bestScore = score;
      best = { snapped: f, raw: o };
    }
  }
  return best ?? { snapped: frame, raw: frame };
}

/** Presets offered on a viewport of `vw` × `vh` CSS px (coarse when readable, else fine). */
export function presetsFor(vw: number, vh: number): Preset[] {
  // r4: a coarse box is offered only when it is readable and its frame fills the canvas
  const fills = (box: Rect) => {
    const { frame, view } = presetFrame(vw, vh, box);
    return (frame.h * view.scale) / vh >= 0.86 && (frame.w * view.scale) / vw >= 0.86;
  };
  return PRESET_GROUPS.flatMap((g) =>
    !g.alwaysFine && boxView(vw, vh, g.box, padFor(vw)).scale >= READABLE_SCALE && fills(g.box)
      ? [g]
      : g.fine,
  );
}

/** Same place on another screen size: a fine id maps to its group and back. */
export function equivalentPreset(id: string, offered: Preset[]): string | null {
  if (offered.some((p) => p.id === id)) return id;
  const group = PRESET_GROUPS.find((g) => g.id === id || g.fine.some((f) => f.id === id));
  if (!group) return null;
  if (offered.some((p) => p.id === group.id)) return group.id;
  return group.fine.find((f) => offered.some((p) => p.id === f.id))?.id ?? null;
}

export function presetById(id: string): Preset | undefined {
  for (const g of PRESET_GROUPS) {
    if (g.id === id) return g;
    const f = g.fine.find((p) => p.id === id);
    if (f) return f;
  }
  return undefined;
}

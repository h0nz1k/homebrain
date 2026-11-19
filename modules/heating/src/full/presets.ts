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
  /**
   * Right edge of the clip when it differs from the box (framing unchanged): the tank presets end
   * the right-hand pipe stubs at their fittings instead of letting a sliver run into the frame edge.
   */
  clipRight?: number;
}
export interface PresetGroup extends Preset {
  fine: Preset[];
}

const r = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h });
/** Outer edge of the fittings on the right tank wall (x 2124 + half the 10-unit fitting). */
export const TANK_FITTING_EDGE = 2130;

export const PRESET_GROUPS: PresetGroup[] = [
  {
    id: 'tech',
    label: 'Technika',
    box: r(700, 329, 1434, 640),
    clipRight: TANK_FITTING_EDGE,
    fine: [
      { id: 'valves', label: 'Ventily', box: r(980, 352, 360, 423) },
      { id: 'hp', label: 'TČ', box: r(1172, 530, 530, 415) },
      { id: 'tank', label: 'Nádrž', box: r(1706, 352, 428, 590), clipRight: TANK_FITTING_EDGE },
    ],
  },
  {
    id: 'pool',
    label: 'Bazén',
    box: r(2292, 800, 926, 430),
    fine: [
      { id: 'basin', label: 'Bazén', box: r(2930, 790, 290, 440) },
      { id: 'pit', label: 'Jímka', box: r(2478, 904, 444, 316) },
    ],
  },
  {
    id: 'house',
    label: 'Dům',
    box: r(280, 90, 710, 880),
    fine: [
      { id: 'fish', label: 'Rybárna', box: r(280, 340, 410, 630) },
      { id: 'rooms', label: 'Patra', box: r(690, 90, 300, 240) },
    ],
  },
];

/** Whole drawing without the empty margins of the canvas. */
export const CONTENT: Rect = r(16, 86, 3205, 1146);

export const PRESET_PAD = 12;
/** Presets never magnify beyond this (a small box on a big screen stays a sensible size). */
export const PRESET_MAX_SCALE = 1.6;

/** Fit `box` into the viewport with padding, centred (or at the top: a phone lists facts below). */
export function boxView(
  vw: number,
  vh: number,
  box: Rect,
  pad = PRESET_PAD,
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

/** Presets offered on a viewport of `vw` × `vh` CSS px (coarse when readable, else fine). */
export function presetsFor(vw: number, vh: number): Preset[] {
  return PRESET_GROUPS.flatMap((g) =>
    boxView(vw, vh, g.box).scale >= READABLE_SCALE ? [g] : g.fine,
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

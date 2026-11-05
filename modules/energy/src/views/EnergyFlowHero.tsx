import { useEffect, useMemo, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { useBackClosable } from '@homebrain/ha-client';
import { Pill, type Tone } from '@homebrain/ui';
import type { ApplianceReading, ApplianceSlot } from '../appliances.js';
import type { EnergyModel, GridFlowMode, InverterChip, Reading } from '../contract.js';
import {
  batteryTempState,
  cellTempSpread,
  cellVoltageSpread,
  inverterTempState,
  seriesRange,
  type ThermalState,
} from '../thermal.js';
import {
  localParts,
  PHASE_HISTORY_NONE,
  THERMAL_HISTORY_NONE,
  type PhaseHistory,
  type ThermalHistory,
  type ThermalKey,
} from '../adapter.js';
import {
  createConsumerTracker,
  flowAllocation,
  flowEdges,
  flowPeriodS,
  FLOW_IDLE_KW,
  FLOW_PAIRS,
  type ConsumerItem,
  type FlowAllocation,
  type FlowEdge,
  type FlowNode,
  type FlowPair,
  type FlowPairId,
  type FlowLinkId,
  inverterAcKw,
  linkLanes,
  PAIR_LINKS,
  roundParts,
  viaInverter,
} from '../flow.js';
import { boxCircleGap, boxesHit, type Box, type Circle } from '../flowLabels.js';
import { Pictogram, type PictogramName } from './pictograms.js';
import type { ThermalTone } from '../thermal.js';
import { PhaseSheetBody, PhaseStrip, phaseView } from './PhaseStrip.js';

/*
 * Energie hero: pictogram power-flow diagram. Sun, grid (HV pylon), battery and house connect
 * through the inverter hub; dots move in the direction of the flow, faster with more power.
 * Running appliances (debounced, see flow.ts) appear next to the house. Text is HTML on top of
 * the SVG (positioned in viewBox units via container query units) so it keeps real px sizes.
 */

type NodeId = FlowNode | 'hub';
type Pt = { x: number; y: number; r?: number };
type Side = 'below' | 'right';
interface Layout {
  name: 'wide' | 'compact';
  w: number;
  h: number;
  r: number;
  /** Inverter hub disc radius (bigger: it is the centre of the installation). */
  hubR: number;
  /** Distance between parallel lanes and the base corner radius at the AC T joint. */
  gap: number;
  bend: number;
  /** AC bus (distribution board) line: grid ↔ T joint under the inverter ↔ house. */
  busY: number;
  /** Gap disc → text block under the grid and house discs (room for the pills under the bus). */
  busDrop: number;
  nodes: Record<NodeId, Pt>;
  labelSide: Record<NodeId, Side>;
  align: Record<NodeId, 'start' | 'center' | 'end'>;
}
/*
 * Single-line diagram of a hybrid installation: PV (DC) above the inverter, battery (DC) left of
 * it, the inverter's AC output drops into the AC bus, which runs grid (left) → house (right).
 */
export const WIDE: Layout = {
  name: 'wide',
  w: 1000,
  h: 528,
  r: 38,
  hubR: 47,
  gap: 14,
  bend: 30,
  busY: 404,
  busDrop: 10,
  nodes: {
    pv: { x: 440, y: 66 },
    hub: { x: 440, y: 212 },
    battery: { x: 150, y: 212 },
    grid: { x: 150, y: 404 },
    house: { x: 720, y: 404 },
  },
  labelSide: { pv: 'right', hub: 'right', battery: 'below', grid: 'below', house: 'below' },
  align: { pv: 'start', hub: 'start', battery: 'center', grid: 'center', house: 'center' },
};
export const COMPACT: Layout = {
  name: 'compact',
  w: 360,
  h: 514,
  r: 27,
  hubR: 34,
  gap: 10,
  bend: 20,
  busY: 382,
  busDrop: 30,
  nodes: {
    pv: { x: 178, y: 50 },
    hub: { x: 178, y: 184 },
    battery: { x: 50, y: 184 },
    grid: { x: 34, y: 382 },
    house: { x: 326, y: 382 },
  },
  labelSide: { pv: 'right', hub: 'right', battery: 'below', grid: 'below', house: 'below' },
  align: { pv: 'start', hub: 'start', battery: 'start', grid: 'start', house: 'end' },
};
const BUS_X = 790;
const CONSUMER_X = 868;
const CONSUMER_GAP = 76;
/** Appliance column: centred on the house line, lifted when it would leave the stage. */
const consumerY = (i: number, n: number) => {
  const c = Math.min(WIDE.nodes.house.y, WIDE.h - 36 - ((n - 1) / 2) * CONSUMER_GAP);
  return c + (i - (n - 1) / 2) * CONSUMER_GAP;
};

const COLOR: Record<NodeId, string> = {
  pv: 'var(--ef-sun)',
  grid: 'var(--hb-energy-grid)',
  battery: 'var(--hb-energy-battery)',
  house: 'var(--hb-energy-home)',
  hub: 'var(--ef-hub)',
};
const ICON: Record<NodeId, PictogramName> = {
  pv: 'sun',
  grid: 'pylon',
  battery: 'battery',
  house: 'house',
  hub: 'inverter',
};
const CONSUMER_ICON: Record<ApplianceSlot, PictogramName> = {
  heat_pump: 'heat_pump',
  dishwasher: 'dishwasher',
  coffee_maker: 'coffee_maker',
  dehumidifier: 'dehumidifier',
};
/** Short names for the diagram (full labels stay in the detail sheet and the appliance card). */
const CONSUMER_SHORT: Record<ApplianceSlot, string> = {
  heat_pump: 'Tepelné čerpadlo',
  dishwasher: 'Myčka',
  coffee_maker: 'Kávovar',
  dehumidifier: 'Odvlhčovač',
};
const PAIR_NAME: Record<FlowNode, string> = {
  pv: 'Slunce',
  grid: 'Síť',
  battery: 'Baterie',
  house: 'Dům',
};

const nf = (digits: number) =>
  new Intl.NumberFormat('cs-CZ', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const kwText = (kw: number | null | undefined, digits = 1) =>
  kw === null || kw === undefined || !Number.isFinite(kw) ? '–' : nf(digits).format(kw);
/** W below 1 kW, kW above (value + unit). */
const THERMAL_TONE: Record<ThermalTone, Tone> = {
  ok: 'ok',
  cold: 'accent',
  notice: 'warn',
  warn: 'warn',
  crit: 'crit',
  muted: 'neutral',
};
/** Temperature chip = catalog Pill (size sm): tone dot + integer °C, full state in the title. */
function TempChip({
  temp,
  testId,
}: {
  temp: { c: number; title: string; state: { tone: ThermalTone; label: string } };
  testId: string;
}) {
  return (
    <Pill
      size="sm"
      dot
      tone={THERMAL_TONE[temp.state.tone]}
      className="ef-temp"
      data-thermal={temp.state.tone}
      title={`${temp.title}: ${temp.state.label}`}
      data-testid={testId}
    >
      {tempInt(temp.c)}
    </Pill>
  );
}

export function powerParts(watts: number | null): [string, string] {
  if (watts === null || !Number.isFinite(watts)) return ['–', 'W'];
  return watts < 995
    ? [nf(0).format(Math.round(watts / 10) * 10), 'W']
    : [kwText(watts / 1000), 'kW'];
}
const signedKw = (kw: number | null) =>
  kw === null ? '–' : `${kw < -0.049 ? '−' : ''}${kwText(Math.abs(kw))}`;

/** Layout + CSS px per diagram unit (drives the label collision pass). */
function useLayout(): [(el: HTMLDivElement | null) => void, Layout, number] {
  const [width, setWidth] = useState(() =>
    typeof window !== 'undefined' ? (window.innerWidth ?? 0) : 0,
  );
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.round(entry.contentRect.width));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  // Before the first measurement: the window width (the stage is a bit narrower).
  const measured = el !== null && width > 0;
  const wide = measured ? width >= 640 : width >= 900;
  const L = wide ? WIDE : COMPACT;
  const stage = measured ? width : Math.min(width - 60, 1080);
  const k = stage > 0 ? Math.max(0.6, stage / L.w) : L.name === 'wide' ? 1 : 0.83;
  return [setEl, L, k];
}

/* ------------------------------------------------------------------ geometry */

const f1 = (v: number) => Math.round(v * 10) / 10;
/** Visible outer edge of a node (battery: its SoC ring, inverter: its status ring). */
const ringR = (L: Layout, node: NodeId) =>
  node === 'hub' ? L.hubR + 5 : L.r + (node === 'battery' ? 6 : 0);
/**
 * Distance from the node centre where a lane `off` units beside the centre line touches the
 * node's outer edge (1 unit inside: the disc / ring stroke covers the wire end, no gap).
 */
export const laneEndR = (L: Layout, node: NodeId, off = 0) => {
  const R = ringR(L, node);
  return Math.sqrt(Math.max(0, R * R - off * off)) - 1;
};
/** AC distribution board (rozvaděč): every bus lane and the inverter's AC wire meet here. */
export const junctionAt = (L: Layout): Pt => ({ x: L.nodes.hub.x, y: L.busY });
/** Plate margin around the outermost conductor (units); also caps the board corner radius. */
const BOARD_PAD = 5;
/** Half size of the board plate (units): covers both conductors of each board link. */
export const boardHalf = (L: Layout, conductors = 2) => ((conductors - 1) / 2) * L.gap + BOARD_PAD;
/** Conductors on the busiest board link (at least two). */
export const boardConductors = (lanes: Record<FlowLinkId, FlowPairId[]>) =>
  Math.max(2, lanes['hub-ac'].length, lanes['grid-ac'].length, lanes['ac-house'].length);

/**
 * Conductor of a lone flow on a two-conductor board link (0 = top / left, 1 = bottom / right):
 * grid import below the export and the inverter flows, flows turning to the grid on the left.
 */
const boardSlot = (link: FlowLinkId, id: FlowPairId): 0 | 1 =>
  link === 'ac-house'
    ? id === 'grid-house'
      ? 1
      : 0
    : link === 'grid-ac'
      ? id.startsWith('grid-')
        ? 1
        : 0
      : PAIR_LINKS[id].includes('grid-ac')
        ? 0
        : 1;
/**
 * Lane offset of a pair on a link. The three AC board links (inverter ↕ board, grid ↔ board,
 * board → house) are always two parallel conductors; other bundles are centred on their link.
 */
function laneOffset(
  L: Layout,
  lanes: Record<FlowLinkId, FlowPairId[]>,
  link: FlowLinkId,
  id: FlowPairId,
) {
  if (link === 'grid-ac' || link === 'ac-house') {
    // Two conductors at least; bottom-anchored so grid → house runs straight through the board.
    const list = lanes[link];
    const n = Math.max(2, lanes['grid-ac'].length, lanes['ac-house'].length);
    if (list.length === 1 && boardSlot(link, id) === 0) return (-(n - 1) / 2) * L.gap;
    const k = list.length - 1 - list.indexOf(id);
    return ((n - 1) / 2 - k) * L.gap;
  }
  if (link === 'hub-ac' && lanes[link].length === 1) return (boardSlot(link, id) - 0.5) * L.gap;
  const list = lanes[link];
  return (list.indexOf(id) - (list.length - 1) / 2) * L.gap;
}

export interface PairRoute {
  pts: Pt[];
  /** Polyline segment index of each link of the pair (same order as PAIR_LINKS). */
  segOf: number[];
}

/**
 * Orthogonal lane route of a pair through the physical links (PAIR_LINKS). Corners under the
 * inverter disc are hidden; at the AC board the conductors turn with concentric corners.
 */
export function pairRoute(
  L: Layout,
  id: FlowPairId,
  lanes: Record<FlowLinkId, FlowPairId[]> = linkLanes([id]),
): PairRoute {
  const N = L.nodes;
  const hub = N.hub;
  const links = PAIR_LINKS[id];
  const segs = links.map((link) => {
    const off = laneOffset(L, lanes, link, id);
    return link === 'pv-hub' || link === 'hub-ac'
      ? { axis: 'v' as const, c: hub.x + off, link }
      : link === 'battery-hub'
        ? { axis: 'h' as const, c: hub.y + off, link }
        : { axis: 'h' as const, c: L.busY + off, link };
  });
  const [from, to] = id.split('-') as [FlowNode, FlowNode];
  const edge = (node: FlowNode, c: number): Pt => {
    const p = N[node];
    // Each lane ends where it touches the node's disc / ring (no gap, same at every node).
    if (node === 'pv') return { x: c, y: p.y + laneEndR(L, node, c - p.x) };
    if (node === 'house') return { x: p.x - laneEndR(L, node, c - p.y), y: c };
    return { x: p.x + laneEndR(L, node, c - p.y), y: c }; // battery, grid: lanes leave to the right
  };
  // Parallel conductors turn at the board with concentric corners (constant spacing, no crossing).
  const hubAc = lanes['hub-ac'];
  const xs = (ids: FlowPairId[]) => ids.map((q) => laneOffset(L, lanes, 'hub-ac', q));
  // Innermost board corner radius: at most the plate margin, so every concentric fillet stays
  // on the plate (0.6·gap reached past the plate edge = a visible kink at the rozvaděč).
  const R0 = Math.min(L.gap * 0.6, BOARD_PAD);
  const tR = (link: FlowLinkId, x: number) => {
    const off = x - hub.x;
    if (link === 'grid-ac') {
      const toGrid = hubAc.filter((q) => PAIR_LINKS[q].includes('grid-ac'));
      return R0 + (off - Math.min(off, ...xs(toGrid)));
    }
    const toHouse = hubAc.filter((q) => PAIR_LINKS[q].includes('ac-house'));
    return R0 + (Math.max(off, ...xs(toHouse)) - off);
  };
  const BOARD: FlowLinkId[] = ['hub-ac', 'grid-ac', 'ac-house'];
  const pts: Pt[] = [edge(from, segs[0]!.c)];
  const segOf: number[] = [0];
  for (let i = 0; i + 1 < segs.length; i++) {
    const a = segs[i]!;
    const b = segs[i + 1]!;
    if (BOARD.includes(a.link) && BOARD.includes(b.link) && a.axis !== b.axis) {
      const busLink = a.link === 'hub-ac' ? b.link : a.link;
      const v = a.axis === 'v' ? { x: a.c, y: b.c } : { x: b.c, y: a.c };
      pts.push({ ...v, r: tR(busLink, v.x) });
      segOf.push(pts.length - 1);
    } else if (a.axis !== b.axis) {
      pts.push({ ...(a.axis === 'v' ? { x: a.c, y: b.c } : { x: b.c, y: a.c }), r: 8 });
      segOf.push(pts.length - 1);
    } else if (Math.abs(a.c - b.c) > 0.01) {
      // Parallel links with different lanes: jog through the hub centre (hidden by the disc).
      if (a.axis === 'v') pts.push({ x: a.c, y: hub.y, r: 6 }, { x: b.c, y: hub.y, r: 6 });
      else pts.push({ x: hub.x, y: a.c, r: 6 }, { x: hub.x, y: b.c, r: 6 });
      segOf.push(pts.length - 1);
    } else {
      pts.push(a.axis === 'h' ? { x: hub.x, y: a.c } : { x: a.c, y: hub.y });
      segOf.push(pts.length - 1);
    }
  }
  pts.push(edge(to, segs[segs.length - 1]!.c));
  return { pts, segOf };
}

/** Fillet at vertex i: tangent length t (distance from the vertex) and radius. */
function filletAt(pts: Pt[], i: number, bend: number): { t: number; rr: number } {
  if (i <= 0 || i >= pts.length - 1) return { t: 0, rr: 0 };
  const [p, c, n] = [pts[i - 1]!, pts[i]!, pts[i + 1]!];
  const l1 = Math.hypot(c.x - p.x, c.y - p.y);
  const l2 = Math.hypot(n.x - c.x, n.y - c.y);
  if (l1 < 1e-6 || l2 < 1e-6) return { t: 0, rr: 0 };
  const cos = ((c.x - p.x) * (n.x - c.x) + (c.y - p.y) * (n.y - c.y)) / (l1 * l2);
  const turn = Math.acos(Math.max(-1, Math.min(1, cos)));
  if (turn < 1e-3) return { t: 0, rr: 0 };
  const t = Math.min((c.r ?? bend) * Math.tan(turn / 2), l1 * 0.45, l2 * 0.45);
  return { t, rr: t / Math.tan(turn / 2) };
}

/** Straight segments joined by circular corners. */
export function roundedPath(pts: Pt[], bend: number): string {
  let d = `M${f1(pts[0]!.x)} ${f1(pts[0]!.y)}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [p, c, n] = [pts[i - 1]!, pts[i]!, pts[i + 1]!];
    const l1 = Math.hypot(c.x - p.x, c.y - p.y) || 1;
    const l2 = Math.hypot(n.x - c.x, n.y - c.y) || 1;
    const v1 = { x: (c.x - p.x) / l1, y: (c.y - p.y) / l1 };
    const v2 = { x: (n.x - c.x) / l2, y: (n.y - c.y) / l2 };
    const { t, rr } = filletAt(pts, i, bend);
    d +=
      rr > 0.5
        ? `L${f1(c.x - v1.x * t)} ${f1(c.y - v1.y * t)}A${f1(rr)} ${f1(rr)} 0 0 ${v1.x * v2.y - v1.y * v2.x > 0 ? 1 : 0} ${f1(c.x + v2.x * t)} ${f1(c.y + v2.y * t)}`
        : `L${f1(c.x)} ${f1(c.y)}`;
  }
  const last = pts[pts.length - 1]!;
  return `${d}L${f1(last.x)} ${f1(last.y)}`;
}

/** Visible straight part [t0, t1] of polyline segment `seg`: corners and the inverter disc cut. */
function visibleSpan(L: Layout, pts: Pt[], seg: number) {
  const a = pts[seg]!;
  const b = pts[seg + 1]!;
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const ux = (b.x - a.x) / len;
  const uy = (b.y - a.y) / len;
  let t0 = filletAt(pts, seg, L.bend).t;
  let t1 = len - filletAt(pts, seg + 1, L.bend).t;
  // Clip the part inside the hub disc (+ margin for the status ring).
  const h = L.nodes.hub;
  const R = L.hubR + 9;
  const fx = a.x - h.x;
  const fy = a.y - h.y;
  const B = fx * ux + fy * uy;
  const disc = B * B - (fx * fx + fy * fy - R * R);
  if (disc > 0) {
    const s0 = -B - Math.sqrt(disc);
    const s1 = -B + Math.sqrt(disc);
    if (s0 <= t0 + 1 && s1 > t0) t0 = Math.max(t0, s1);
    if (s1 >= t1 - 1 && s0 < t1) t1 = Math.min(t1, s0);
  }
  return { a, ux, uy, t0, t1 };
}

/** Wire weight grows with power (2.4 → 6 units at ≥ 5 kW on the wide layout). */
const wireWidth = (kw: number, L: Layout = WIDE) =>
  (2.4 + Math.min(5, Math.max(0, kw)) * 0.72) * (L.r / 38);
/** Chevron half size (units) for a wire of width w. */
const chevSize = (w: number) => 4.2 + w * 0.4;

/* ------------------------------------------------------------ label placement */

/*
 * Value pills (owner's rule, PR #106): every flow has ONE pill in its own colour on the leg into
 * its target. A leg carrying one flow keeps the pill on the line (desktop look). On a leg with
 * several flows the pills sit beside the bundle: flows coming from the inverter above the AC bus,
 * the grid below it (battery leg: sun above, grid below). Each pill is centred on the free part
 * of its band; when even the smallest font (11 px) does not fit, the pill moves to its fallback
 * leg (battery flows on the compact phone layout). Arrowheads stay on their own lane, never under
 * a pill. No value is ever hidden or moved off its flow.
 */

/** Pill font sizes (CSS px), tried in order for the whole diagram. */
export const PILL_FONTS = [13, 12, 11] as const;
export type PillFont = (typeof PILL_FONTS)[number];
const PILL_PAD: Record<PillFont, number> = { 13: 8, 12: 6, 11: 5 };

/** Tabular digits at 13 px semibold (comma narrower). */
const digitsPx = (text: string) => {
  let w = 0;
  for (const ch of text) w += ch === ',' ? 3.8 : 8.3;
  return w;
};
/** Rendered pill size (CSS px): digits + " kW" at `font`, side padding, 2 px top/bottom. */
export function pillSizePx(text: string, font: PillFont = 13): { w: number; h: number } {
  return {
    w: Math.ceil(2 * PILL_PAD[font] + ((24 + digitsPx(text)) * font) / 13),
    h: Math.ceil(font * 1.35 + 4),
  };
}

/** Node text blocks (CSS px, conservative: long values, two-line subs). */
const LABEL_PX: Record<Layout['name'], Record<NodeId, [w: number, h: number]>> = {
  compact: { pv: [92, 86], hub: [122, 74], battery: [116, 66], grid: [120, 86], house: [96, 70] },
  wide: { pv: [176, 78], hub: [124, 80], battery: [168, 80], grid: [128, 92], house: [100, 76] },
};
/** Discs incl. rings (SoC ring r+6 + stroke, inverter status ring r+5). */
const discR = (L: Layout, id: NodeId) =>
  id === 'hub' ? L.hubR + 7 : id === 'battery' ? L.r + 8 : L.r + 1;
/** Top of a node's text block under its disc (grid/house drop lower: room for bus pills). */
const labelTop = (L: Layout, id: NodeId) =>
  L.nodes[id].y +
  (id === 'battery' ? L.r + 14 : L.r) +
  (id === 'grid' || id === 'house' ? L.busDrop : 10);

/** Static obstacles of the diagram (units) for a stage drawn at `k` CSS px per unit. */
export function labelObstacles(L: Layout, k: number) {
  const N = L.nodes;
  const ids = ['pv', 'grid', 'battery', 'house', 'hub'] as const;
  const boxes: Box[] = ids.map((id) => {
    const p = N[id];
    const [wPx, hPx] = LABEL_PX[L.name][id];
    const w = wPx / k;
    const h = hPx / k;
    if (L.labelSide[id] === 'right') {
      const x0 = p.x + (id === 'hub' ? L.hubR + 8 : L.r) + 8 - 6 / k;
      return { x0, y0: p.y - h / 2, x1: x0 + w, y1: p.y + h / 2 };
    }
    const y0 = labelTop(L, id);
    const al = L.align[id];
    const x0 =
      al === 'start' ? p.x - L.r - 6 / k : al === 'end' ? p.x + L.r + 6 / k - w : p.x - w / 2;
    return { x0, y0, x1: x0 + w, y1: y0 + h };
  });
  const circles: Circle[] = ids.map((id) => ({ cx: N[id].x, cy: N[id].y, r: discR(L, id) }));
  return {
    circles,
    /** AC distribution board: the small junction dot under the inverter. */
    junction: { cx: N.hub.x, cy: L.busY, r: boardHalf(L) + 1 } as Circle,
    boxes,
    bounds: { x0: 2 / k, y0: 2 / k, x1: L.w - 2 / k, y1: L.h - 2 / k } as Box,
  };
}

export type PillSide = 'on' | 'above' | 'below' | 'left' | 'right';
export interface FlowMark {
  /** Link the pill sits on – always one of the pair's own links. */
  link: FlowLinkId;
  side: PillSide;
  /** Pill centre and size (units). */
  x: number;
  y: number;
  w: number;
  h: number;
  font: PillFont;
  /** Arrowhead on the pair's own lane (half size `s`), in the flow direction. */
  chev: (Pt & { deg: number; s: number }) | null;
  collides: boolean;
}
type LabelPair = Pick<FlowPair, 'id' | 'kw' | 'displayKw'>;

/** Visible straight part of one pair's lane on one of its links (units). */
export interface LaneSeg {
  id: FlowPairId;
  link: FlowLinkId;
  horiz: boolean;
  /** Lane coordinate across the link (y of a horizontal lane, x of a vertical one). */
  c: number;
  /** Visible extent along the link (absolute x or y), lo ≤ hi. */
  lo: number;
  hi: number;
  /** Flow direction along the axis (+1 = growing x / y). */
  dir: 1 | -1;
  deg: number;
  /** Half wire width. */
  hw: number;
}

/** Lane pieces of all pairs (the drawn routes). */
export function laneSegments(
  L: Layout,
  pairs: LabelPair[],
  lanes: Record<FlowLinkId, FlowPairId[]>,
): LaneSeg[] {
  const out: LaneSeg[] = [];
  for (const p of pairs) {
    const { pts, segOf } = pairRoute(L, p.id, lanes);
    PAIR_LINKS[p.id].forEach((link, li) => {
      const { a, ux, uy, t0, t1 } = visibleSpan(L, pts, segOf[li]!);
      if (t1 - t0 < 1) return;
      const horiz = Math.abs(ux) > 0.5;
      const s0 = horiz ? a.x + ux * t0 : a.y + uy * t0;
      const s1 = horiz ? a.x + ux * t1 : a.y + uy * t1;
      out.push({
        id: p.id,
        link,
        horiz,
        c: horiz ? a.y : a.x,
        lo: Math.min(s0, s1),
        hi: Math.max(s0, s1),
        dir: (horiz ? ux : uy) > 0 ? 1 : -1,
        deg: (Math.atan2(uy, ux) * 180) / Math.PI,
        hw: wireWidth(p.kw, L) / 2,
      });
    });
  }
  return out;
}

export const laneBox = (s: LaneSeg, pad = 0): Box =>
  s.horiz
    ? { x0: s.lo, y0: s.c - s.hw - pad, x1: s.hi, y1: s.c + s.hw + pad }
    : { x0: s.c - s.hw - pad, y0: s.lo, x1: s.c + s.hw + pad, y1: s.hi };

/** Points along a pair's drawn route (straight parts + exact fillet arcs), every ~`step` units. */
export function routeSamples(L: Layout, pts: Pt[], step = 2): Pt[] {
  const out: Pt[] = [];
  const line = (a: Pt, b: Pt) => {
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step));
    for (let i = 0; i <= n; i++)
      out.push({ x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n });
  };
  let prev = pts[0]!;
  for (let i = 1; i < pts.length - 1; i++) {
    const [p, c, nx] = [pts[i - 1]!, pts[i]!, pts[i + 1]!];
    const { t, rr } = filletAt(pts, i, L.bend);
    const l1 = Math.hypot(c.x - p.x, c.y - p.y) || 1;
    const l2 = Math.hypot(nx.x - c.x, nx.y - c.y) || 1;
    const e = { x: c.x - ((c.x - p.x) / l1) * t, y: c.y - ((c.y - p.y) / l1) * t };
    const x = { x: c.x + ((nx.x - c.x) / l2) * t, y: c.y + ((nx.y - c.y) / l2) * t };
    line(prev, e);
    if (rr > 0.5) {
      // Rational quadratic Bézier with weight cos(turn/2) = the exact circular arc.
      const w = Math.cos(Math.atan(t / rr));
      const n = Math.max(2, Math.ceil((rr * 1.6) / step));
      for (let j = 1; j < n; j++) {
        const s = j / n;
        const [a, b, d] = [(1 - s) ** 2, 2 * s * (1 - s) * w, s * s];
        const den = a + b + d;
        out.push({
          x: (a * e.x + b * c.x + d * x.x) / den,
          y: (a * e.y + b * c.y + d * x.y) / den,
        });
      }
    }
    prev = x;
  }
  line(prev, pts[pts.length - 1]!);
  return out;
}

/** Pill legs per pair in order: the leg into the target first, then the fallback. */
const LABEL_LEGS: Record<FlowPairId, readonly [FlowLinkId, Exclude<PillSide, 'on'>][]> = {
  'pv-house': [['ac-house', 'above']],
  'battery-house': [['ac-house', 'above']],
  'grid-house': [['ac-house', 'below']],
  // Phones, PV and battery both exporting: no room for two rows above the grid leg.
  'pv-grid': [
    ['grid-ac', 'above'],
    ['pv-hub', 'left'],
  ],
  'battery-grid': [['grid-ac', 'above']],
  'pv-battery': [
    ['battery-hub', 'above'],
    ['pv-hub', 'left'],
  ],
  'grid-battery': [
    ['battery-hub', 'below'],
    ['hub-ac', 'right'],
  ],
};
/** Placement order: per side the pill of the lane nearest the line first (it takes row 0). */
const PLACE_ORDER: readonly FlowPairId[] = [
  'grid-house',
  'battery-house',
  'pv-house',
  'battery-grid',
  'pv-grid',
  'grid-battery',
  'pv-battery',
];

/** Node centres a link runs between (along its axis). */
function linkExtent(L: Layout, link: FlowLinkId): [number, number] {
  const N = L.nodes;
  switch (link) {
    case 'pv-hub':
      return [N.pv.y, N.hub.y];
    case 'hub-ac':
      return [N.hub.y, L.busY];
    case 'battery-hub':
      return [N.battery.x, N.hub.x];
    case 'grid-ac':
      return [N.grid.x, N.hub.x];
    default:
      return [N.hub.x, N.house.x];
  }
}

/**
 * Pill + arrowhead of every active pair (see the block comment above). Deterministic: fixed leg
 * and side per pair, the pill centred on the longest free run of its band. `k` = CSS px per unit.
 */
export function flowLabelLayout(
  L: Layout,
  pairs: LabelPair[],
  lanes: Record<FlowLinkId, FlowPairId[]> = linkLanes(pairs.map((p) => p.id)),
  k: number = L.name === 'wide' ? 1 : 0.83,
): Record<FlowPairId, FlowMark> {
  if (!pairs.length) return {} as Record<FlowPairId, FlowMark>;
  const obs = labelObstacles(L, k);
  const segs = laneSegments(L, pairs, lanes);
  const samples = pairs.map((p) => ({
    id: p.id,
    hw: wireWidth(p.kw, L) / 2,
    pts: routeSamples(L, pairRoute(L, p.id, lanes).pts),
  }));
  const byId = new Map(pairs.map((p) => [p.id, p]));
  const order = PLACE_ORDER.filter((id) => byId.has(id));
  let last: Record<FlowPairId, FlowMark> | null = null;
  for (const font of PILL_FONTS) {
    const out = {} as Record<FlowPairId, FlowMark>;
    const placed: Placed[] = [];
    let bad = 0;
    for (const id of order) {
      const m = placePill(L, k, font, byId.get(id)!, lanes, segs, samples, obs, placed);
      out[id] = m;
      if (m.collides) bad++;
      placed.push({
        pill: markBox(m),
        chev: m.chev ? chevBox(m.chev) : null,
        link: m.link,
        side: m.side,
      });
    }
    last = out;
    if (!bad) break;
  }
  return last!;
}

type Placed = { pill: Box; chev: Box | null; link: FlowLinkId; side: PillSide };
const markBox = (m: Pick<FlowMark, 'x' | 'y' | 'w' | 'h'>): Box => ({
  x0: m.x - m.w / 2,
  y0: m.y - m.h / 2,
  x1: m.x + m.w / 2,
  y1: m.y + m.h / 2,
});
const chevBox = (c: Pt & { s: number }): Box => ({
  x0: c.x - c.s,
  y0: c.y - c.s,
  x1: c.x + c.s,
  y1: c.y + c.s,
});

function placePill(
  L: Layout,
  k: number,
  font: PillFont,
  pair: LabelPair,
  lanes: Record<FlowLinkId, FlowPairId[]>,
  segs: LaneSeg[],
  samples: { id: FlowPairId; hw: number; pts: Pt[] }[],
  obs: ReturnType<typeof labelObstacles>,
  placed: Placed[],
): FlowMark {
  const size = pillSizePx(kwText(pair.displayKw), font);
  const pw = size.w / k;
  const ph = size.h / k;
  const g = 3 / k;
  const sz = chevSize(wireWidth(pair.kw, L));
  const tries: [FlowLinkId, PillSide][] = [];
  for (const [link, side] of LABEL_LEGS[pair.id]) {
    if (lanes[link].length === 1) tries.push([link, 'on']);
    tries.push([link, side]);
  }
  let fallback: FlowMark | null = null;
  for (const [link, side] of tries) {
    const seg = segs.find((s) => s.id === pair.id && s.link === link);
    if (!seg) continue;
    const bundle = segs.filter((s) => s.link === link);
    const cMin = Math.min(...bundle.map((s) => s.c));
    const cMax = Math.max(...bundle.map((s) => s.c));
    const reach = Math.max(...bundle.map((s) => chevSize(2 * s.hw))) + g;
    const horiz = seg.horiz;
    const along = horiz ? pw : ph;
    const acr = horiz ? ph : pw;
    const [e0, e1] = linkExtent(L, link).sort((a, b) => a - b) as [number, number];
    // Extra rows only to stack onto pills already beside this bundle (never free-floating).
    const rows =
      side === 'on' ? 1 : 1 + placed.filter((q) => q.link === link && q.side === side).length;
    for (let row = 0; row < rows; row++) {
      const across =
        side === 'on'
          ? seg.c
          : side === 'above' || side === 'left'
            ? cMin - reach - acr / 2 - row * (acr + 5 / k)
            : cMax + reach + acr / 2 + row * (acr + 5 / k);
      const at = (t: number) => (horiz ? { x: t, y: across } : { x: across, y: t });
      const boxAt = (t: number): Box => {
        const p = at(t);
        return { x0: p.x - pw / 2, y0: p.y - ph / 2, x1: p.x + pw / 2, y1: p.y + ph / 2 };
      };
      const chevFor = (t: number, pill: Box) => {
        // On the line: right after the pill in the flow direction (or before it); beside the
        // line: on the lane next to the pill centre, nudged along the lane when taken.
        const cand =
          side === 'on'
            ? [t + seg.dir * (along / 2 + g + sz), t - seg.dir * (along / 2 + g + sz)]
            : [0, 1, -1, 2, -2, 3, -3].map((i) => t + seg.dir * i * (2 * sz + 2 / k));
        for (const tc of cand) {
          if (tc - sz < seg.lo || tc + sz > seg.hi) continue;
          const p = horiz ? { x: tc, y: seg.c } : { x: seg.c, y: tc };
          const b = chevBox({ ...p, s: sz });
          if (boxesHit(b, pill, 1 / k)) continue;
          if (obs.circles.some((c) => boxCircleGap(b, c) < 1 / k)) continue;
          if (
            placed.some((q) => boxesHit(b, q.pill, 2 / k) || (q.chev && boxesHit(b, q.chev, 1 / k)))
          )
            continue;
          return { ...p, deg: seg.deg, s: sz };
        }
        return null;
      };
      // Only lane samples inside this band can touch the pill.
      const band = horiz ? [across - ph / 2, across + ph / 2] : [across - pw / 2, across + pw / 2];
      const near = samples.flatMap((s) =>
        s.pts
          .filter((p) => {
            const v = horiz ? p.y : p.x;
            if (v < band[0]! - s.hw - g || v > band[1]! + s.hw + g) return false;
            // On the line the pill covers its own straight lane piece – nothing else.
            return !(side === 'on' && s.id === pair.id && Math.abs(v - seg.c) < 0.5);
          })
          .map((p) => ({ ...p, pad: s.hw + g })),
      );
      const ok = (t: number) => {
        const b = boxAt(t);
        const B = obs.bounds;
        if (b.x0 < B.x0 || b.y0 < B.y0 || b.x1 > B.x1 || b.y1 > B.y1) return null;
        if (obs.circles.some((c) => boxCircleGap(b, c) < 8 / k)) return null;
        if (boxCircleGap(b, obs.junction) < g) return null;
        if (obs.boxes.some((o) => boxesHit(b, o, 4 / k))) return null;
        if (
          near.some(
            (p) =>
              p.x > b.x0 - p.pad && p.x < b.x1 + p.pad && p.y > b.y0 - p.pad && p.y < b.y1 + p.pad,
          )
        )
          return null;
        if (
          placed.some((q) => boxesHit(b, q.pill, 4 / k) || (q.chev && boxesHit(b, q.chev, 2 / k)))
        )
          return null;
        return chevFor(t, b);
      };
      // Longest free run of centres along the band (1-unit grid), then its middle.
      // Centre on the visible part of its own lane, pill inside the leg's node-to-node extent.
      const from = Math.max(e0 + along / 2, seg.lo);
      const to = Math.min(e1 - along / 2, seg.hi);
      let best: [number, number] | null = null;
      let run: number | null = null;
      const n = Math.floor(to - from);
      for (let i = 0; i <= n + 1; i++) {
        const free = i <= n && ok(from + i) !== null;
        if (free && run === null) run = i;
        if (!free && run !== null) {
          if (!best || i - 1 - run > best[1] - best[0]) best = [run, i - 1];
          run = null;
        }
      }
      if (best) {
        const t = from + Math.round((best[0] + best[1]) / 2);
        const chev = ok(t)!;
        const p = at(t);
        return { link, side, x: p.x, y: p.y, w: pw, h: ph, font, chev, collides: false };
      }
      if (!fallback) {
        const mid = (e0 + e1) / 2;
        const p = at(Math.min(e1 - along / 2, Math.max(e0 + along / 2, mid)));
        fallback = { link, side, x: p.x, y: p.y, w: pw, h: ph, font, chev: null, collides: true };
      }
    }
  }
  return fallback!;
}

/** Pill box and arrowhead box (units) of a pair's mark – for QA and tests. */
export function flowMarkBoxes(mark: FlowMark): { pill: Box; chev: Box | null } {
  return { pill: markBox(mark), chev: mark.chev ? chevBox(mark.chev) : null };
}

function PairLine(props: {
  pair: FlowPair;
  L: Layout;
  lanes: Record<FlowLinkId, FlowPairId[]>;
  mark: FlowMark | undefined;
}) {
  const { pair, L, lanes, mark } = props;
  const { pts } = pairRoute(L, pair.id, lanes);
  const d = roundedPath(pts, L.bend);
  const w = wireWidth(pair.kw, L);
  const s = chevSize(w);
  return (
    <g
      className="ef-edge"
      data-testid={`energy-flow-edge-${pair.id}`}
      data-period={pair.periodS ?? ''}
      data-kw={pair.kw}
      data-via={viaInverter(pair.id) ? 'hub' : 'bus'}
      style={{ color: COLOR[pair.from] }}
    >
      <path className="ef-wire ef-wire--on" d={d} strokeWidth={w} />
      <path
        className="ef-dots"
        d={d}
        strokeWidth={w + 1.5}
        style={
          {
            opacity: Math.round((0.55 + 0.45 * Math.min(1, pair.kw / 1.5)) * 100) / 100,
            animationDuration: `${pair.periodS}s`,
          } as CSSProperties
        }
      />
      {mark?.chev && (
        // Chevron next to the value pill, in the direction of the flow.
        <path
          className="ef-chev"
          data-testid={`energy-flow-edge-${pair.id}-chev`}
          d={`M${-s * 0.55} ${-s}L${s * 0.45} 0L${-s * 0.55} ${s}`}
          transform={`translate(${f1(mark.chev.x)} ${f1(mark.chev.y)}) rotate(${mark.chev.deg})`}
          data-link={mark.link}
        />
      )}
    </g>
  );
}

function FlowPill(props: { mark: FlowMark; pair: FlowPair; u: (v: number) => string }) {
  const { mark, pair: p } = props;
  return (
    <span
      className="ef-pill"
      data-testid={`energy-flow-edge-${p.id}-value`}
      data-link={mark.link}
      data-side={mark.side}
      data-font={mark.font}
      data-collides={mark.collides || undefined}
      aria-label={`${PAIR_NAME[p.from]} → ${PAIR_NAME[p.to]}${viaInverter(p.id) ? ' přes střídač' : ''}: ${kwText(p.displayKw)} kW`}
      style={
        {
          left: props.u(mark.x),
          top: props.u(mark.y),
          fontSize: mark.font === 13 ? undefined : `${mark.font}px`,
          paddingInline: mark.font === 13 ? undefined : `${PILL_PAD[mark.font]}px`,
          '--ef-c': COLOR[p.from],
        } as CSSProperties
      }
    >
      {kwText(p.displayKw)}
      <small> kW</small>
    </span>
  );
}

/** Appliance branch: trunk from the house → bus → stub to each chip, with rounded joints. */
function consumerStub(y: number, cy: number, R = 18): string {
  const x0 = BUS_X;
  const x1 = CONSUMER_X - 27;
  if (Math.abs(y - cy) < 1) return `M${x0} ${y}H${x1}`;
  const sy = Math.sign(y - cy);
  const r = Math.min(R, Math.abs(y - cy));
  return `M${x0} ${y - sy * r}A${r} ${r} 0 0 ${sy > 0 ? 0 : 1} ${x0 + r} ${y}H${x1}`;
}

function NodeDisc(props: {
  id: NodeId;
  at: Pt;
  r: number;
  active: boolean;
  soc?: number | null;
  tone?: InverterChip['tone'];
  gradient: string;
}) {
  const { at, r } = props;
  const hub = props.id === 'hub';
  return (
    <g
      className={`ef-node ef-node--${props.id}${props.active ? ' is-active' : ''}`}
      data-busy={hub && props.active ? true : undefined}
      data-tone={hub ? (props.tone ?? 'idle') : undefined}
      style={{ color: COLOR[props.id] }}
    >
      {(props.id === 'pv' || hub) && props.active && (
        <circle
          className="ef-halo"
          cx={at.x}
          cy={at.y}
          r={r * (hub ? 1.75 : 1.9)}
          fill={`url(#${props.gradient}-halo)`}
        />
      )}
      <circle className="ef-disc-base" cx={at.x} cy={at.y} r={r} />
      <circle className="ef-disc" cx={at.x} cy={at.y} r={r} fill={`url(#${props.gradient})`} />
      {hub && (
        <>
          <circle className="ef-hubring" cx={at.x} cy={at.y} r={r + 5} />
          {props.tone === 'err' && (
            <>
              <circle className="ef-hubfault" cx={at.x} cy={at.y} r={r} />
              <g
                className="ef-hubbadge"
                transform={`translate(${f1(at.x + r * 0.72)} ${f1(at.y - r * 0.72)})`}
              >
                <circle r={r * 0.27} />
                <path d={`M0 ${-r * 0.12}V${r * 0.03}M0 ${r * 0.13}v.01`} />
              </g>
            </>
          )}
        </>
      )}
      {props.id === 'battery' && props.soc != null && (
        <circle className="ef-soctrack" cx={at.x} cy={at.y} r={r + 6} />
      )}
      {props.id === 'battery' && props.soc != null && (
        <circle
          className="ef-socring"
          cx={at.x}
          cy={at.y}
          r={r + 6}
          pathLength={100}
          strokeDasharray={`${Math.max(0, Math.min(100, props.soc))} 100`}
          transform={`rotate(-90 ${at.x} ${at.y})`}
          data-testid="energy-flow-soc-ring"
        />
      )}
      <Pictogram
        name={ICON[props.id]}
        x={at.x}
        y={at.y}
        scale={(r * (hub ? 1.12 : 1.22)) / 24}
        weight={r > 35 ? 2.5 : 2.2}
        soc={props.soc}
      />
    </g>
  );
}

interface NodeText {
  name: string;
  value: string;
  unit: string;
  sub: string;
  extra?: string;
  /** Direction glyph next to the value (grid): in = odběr, out = dodávka, both = obojí. */
  dir?: 'in' | 'out' | 'both';
  /** Small temperature chip (°C) with its state colour. */
  temp?: { c: number; state: ThermalState; title: string };
  /** Status dot tone in front of the sub line (inverter). */
  tone?: InverterChip['tone'];
  /** Second, muted sub line (inverter: error / charging from the grid). */
  sub2?: string;
}

/** Import and export both above the idle threshold right now (two grid lines). */
function gridBoth(model: EnergyModel): boolean {
  const { importKw, exportKw } = model.power.gridFlow;
  return (importKw ?? 0) >= FLOW_IDLE_KW && (exportKw ?? 0) >= FLOW_IDLE_KW;
}

const GRID_MODE_TEXT: Record<GridFlowMode, string> = {
  phases: 'po fázích L1/L2/L3 – odběr i dodávka zvlášť',
  separate: 'samostatné senzory odběru a dodávky',
  net: 'jen saldo sítě – jedna čára',
};

/**
 * PV string values rounded so they add up to the displayed PV total (largest remainder), when the
 * strings agree with the total sensor; otherwise each string on its own.
 */
export function stringTexts(strings: (number | null)[], pvShown: number | null): string[] {
  const vals = strings.map((v) => Math.max(0, v ?? 0));
  const sum = vals.reduce((t, v) => t + v, 0);
  if (pvShown === null || strings.some((v) => v === null) || Math.abs(sum - pvShown) > 0.1)
    return strings.map((v) => kwText(v));
  return roundParts(vals, 1, pvShown).map((v) => kwText(v));
}

function nodeTexts(
  model: EnergyModel,
  edges: Record<FlowNode, FlowEdge>,
  ac: { kw: number | null; derived: boolean },
  alloc: FlowAllocation | null = null,
): Record<NodeId, NodeText> {
  const inv = model.inverterDetail;
  const rad = inv.tempRadiator.value;
  const cell = inv.cellTempMax.value ?? inv.batteryTemp.value;
  const fault = model.inverter?.tone === 'err';
  const { pv, pvStrings, grid, battery, house } = model.power;
  const soc = model.batterySoc.value;
  const strings = pvStrings.filter((r) => r.bound && r.value !== null);
  // Reconciled totals: every node = the sum of its displayed lines (see allocateFlows).
  const shown = alloc?.display ?? null;
  const pvShown = shown ? shown.pv : pv.value;
  const imp = shown ? shown.gridImport : model.power.gridFlow.importKw;
  const exp = shown ? shown.gridExport : model.power.gridFlow.exportKw;
  const gridShown = shown
    ? Math.abs(shown.gridImport - shown.gridExport)
    : grid.value === null
      ? null
      : Math.abs(grid.value);
  const batteryShown = shown
    ? Math.max(shown.discharge, shown.charge)
    : battery.value === null
      ? null
      : Math.abs(battery.value);
  const fv = stringTexts([pvStrings[0]?.value ?? null, pvStrings[1]?.value ?? null], pvShown);
  const verb = (e: FlowEdge, toHub: string, fromHub: string, idle: string) =>
    e.kw === null
      ? 'bez dat'
      : e.direction === 'idle'
        ? idle
        : e.direction === 'toHub'
          ? toHub
          : fromHub;
  return {
    pv: {
      name: 'Slunce',
      value: kwText(pvShown),
      unit: 'kW',
      sub:
        strings.length === 2 && edges.pv.direction !== 'idle'
          ? `FV1 ${fv[0]} kW · FV2 ${fv[1]} kW`
          : edges.pv.direction === 'idle' && fault
            ? 'odpojeno – porucha'
            : edges.pv.direction === 'idle' && pv.value !== null
              ? 'nevyrábí'
              : verb(edges.pv, 'vyrábí', 'vyrábí', 'nevyrábí'),
    },
    grid: {
      name: 'Síť',
      value: kwText(gridShown),
      unit: 'kW',
      sub: gridBoth(model)
        ? (grid.value ?? 0) < 0
          ? `dodávka ${kwText(exp)} kW\nodběr ${kwText(imp)} kW`
          : `odběr ${kwText(imp)} kW\ndodávka ${kwText(exp)} kW`
        : verb(edges.grid, 'odběr', 'dodávka do sítě', 'bez toku'),
      dir: gridBoth(model)
        ? (grid.value ?? 0) >= 0
          ? 'in'
          : 'out'
        : edges.grid.direction === 'toHub'
          ? 'in'
          : edges.grid.direction === 'fromHub'
            ? 'out'
            : undefined,
    },
    battery: {
      name: 'Baterie',
      value: kwText(batteryShown),
      unit: 'kW',
      extra: soc === null ? undefined : `${nf(0).format(soc)} %`,
      sub:
        fault && edges.battery.direction === 'idle'
          ? 'nedostupná – porucha střídače'
          : alloc?.pairs['grid-battery'].active && !alloc.pairs['pv-battery'].active
            ? 'nabíjí ze sítě'
            : verb(edges.battery, 'vybíjí', 'nabíjí', 'v klidu'),
      temp:
        cell === null
          ? undefined
          : {
              c: cell,
              state: batteryTempState(cell),
              title: inv.cellTempMax.value !== null ? 'nejteplejší článek' : 'teplota baterie',
            },
    },
    hub: {
      name: 'Střídač',
      // Magnitude only: the direction is spelled out in sub2 ('bere ze sítě'), a bare '−2,5'
      // read as an error on the card. The detail sheet keeps the signed value + legend.
      value: ac.kw === null ? '–' : kwText(Math.abs(ac.kw)),
      unit: 'kW',
      sub: model.inverter?.label ?? 'Stav neznámý',
      sub2: fault
        ? inv.error
          ? inv.error.label.replace(/^porucha\s+/, '')
          : undefined
        : ac.kw !== null && ac.kw < -0.049
          ? 'bere ze sítě'
          : undefined,
      tone: model.inverter?.tone ?? 'idle',
      temp:
        rad === null
          ? undefined
          : {
              c: rad,
              state: fault ? { tone: 'muted', label: 'mimo provoz' } : inverterTempState(rad),
              title: 'teplota chladiče',
            },
    },
    house: {
      name: 'Dům',
      value: kwText(shown && house.value !== null ? shown.house : house.value),
      unit: 'kW',
      sub: model.power.houseDerived ? 'dopočteno z toků' : 'spotřeba teď',
    },
  };
}

const PHASE_COUNT_CS = ['', 'jedna fáze', 'dvě fáze', 'tři fáze'];

/**
 * Headline when the grid imports and exports at the same time. The dominant
 * direction (what the meter counts) goes first; with per-phase data the
 * minority phases are counted so the sentence never claims a surplus while
 * the house is a net importer.
 */
export function simultaneousHeadline(gridFlow: EnergyModel['power']['gridFlow']): string {
  const imp = gridFlow.importKw ?? 0;
  const exp = gridFlow.exportKw ?? 0;
  const importing = imp >= exp;
  const minorityPhases =
    gridFlow.mode === 'phases'
      ? (gridFlow.phasesKw ?? []).filter((p) => (importing ? p < -0.005 : p > 0.005)).length
      : 0;
  if (minorityPhases === 0) {
    return importing
      ? 'Dům bere ze sítě a současně do ní dodává'
      : 'Přebytek jde do sítě a současně se ze sítě odebírá';
  }
  const minority = minorityPhases;
  const who = PHASE_COUNT_CS[minority] ?? 'část fází';
  return importing
    ? `Dům bere ze sítě, ${who} přitom ${minority > 1 ? 'dodávají' : 'dodává'}`
    : `Přebytek jde do sítě, ${who} přitom ${minority > 1 ? 'odebírají' : 'odebírá'}`;
}

/** Headline: what powers the house right now (and where the rest goes). */
export function flowHeadline(
  model: EnergyModel,
  alloc: FlowAllocation | null = flowAllocation(model),
): { title: string; ownPercent: number | null } {
  const { pv, grid, battery, house } = model.power;
  const h = house.value;
  if (h === null || pv.value === null || grid.value === null || !alloc)
    return { title: 'Toky energie nejsou kompletní', ownPercent: null };
  const on = (id: FlowPairId) => alloc.pairs[id].active;
  const imp = model.power.gridFlow.importKw ?? Math.max(0, grid.value);
  const dis = Math.max(0, battery.value ?? 0);
  // Share of the house load from own sources, from the same allocation as the drawn lines.
  // With reconciled totals the share is computed from the displayed numbers (0,3 of 1,0 = 30 %).
  const d = alloc.display;
  const own =
    d && d.house > 0
      ? Math.round(
          Math.max(0, Math.min(1, 1 - alloc.pairs['grid-house'].displayKw / d.house)) * 100,
        )
      : h > 0.01
        ? Math.round(Math.max(0, Math.min(1, 1 - imp / h)) * 100)
        : null;
  const p = Math.max(0, pv.value);
  let title: string;
  if (model.inverter?.tone === 'err')
    title = on('grid-house') ? 'Střídač hlásí poruchu – dům jede ze sítě' : 'Střídač hlásí poruchu';
  else if (alloc.simultaneous) title = simultaneousHeadline(model.power.gridFlow);
  else if (p >= h * 0.95 && p > 0.05) {
    title =
      on('pv-battery') && on('pv-grid')
        ? 'Slunce pokrývá dům, nabíjí baterii a přebytek posílá do sítě'
        : on('pv-battery')
          ? 'Slunce pokrývá dům a nabíjí baterii'
          : on('pv-grid')
            ? 'Slunce pokrývá dům a přebytek posílá do sítě'
            : 'Slunce pokrývá celou spotřebu domu';
  } else if (on('grid-battery'))
    title = on('grid-house') ? 'Síť napájí dům a nabíjí baterii' : 'Síť nabíjí baterii';
  else if (dis >= Math.max(p, imp) && dis > 0.05)
    title = on('battery-grid') ? 'Baterie napájí dům a dodává do sítě' : 'Dům běží z baterie';
  else if (imp >= Math.max(p, dis) && imp > 0.05)
    title = p > 0.05 ? 'Dům bere ze sítě, slunce pomáhá' : 'Dům bere ze sítě';
  else if (p > 0.05) title = 'Slunce a baterie pokrývají dům';
  else title = 'Dům je v klidu';
  return { title, ownPercent: own };
}

type SheetTarget = NodeId | ApplianceSlot | 'phases';
interface SheetRow {
  label: string;
  value: string;
  tone?: string;
}
interface SheetSection {
  title: string;
  rows: SheetRow[];
  note?: string;
}
interface SheetSpark {
  key: ThermalKey;
  label: string;
  color: string;
  now: number | null;
}

const kwOrDash = (kw: number | null) => (kw === null ? '–' : `${kwText(kw)} kW`);

/** One-line summary of the grid node: both directions, per phase when the meter provides it. */
function gridNote(model: EnergyModel): string {
  const g = model.power.gridFlow;
  const base = `Síť: odběr ${kwOrDash(g.importKw)} / dodávka ${kwOrDash(g.exportKw)}`;
  if (g.phasesKw)
    return `${base}, po fázích ${g.phasesKw.map((v, i) => `L${i + 1} ${v >= 0 ? '+' : '−'}${kwText(Math.abs(v), 2)}`).join(' / ')} kW (+ odběr, − dodávka)`;
  return g.mode === 'net'
    ? `${base}. Je k dispozici jen saldo sítě, proto jedna čára; odběr a dodávku zároveň (po fázích) ukáže až elektroměr po fázích nebo samostatné senzory.`
    : `${base} (samostatné senzory, mohou běžet zároveň).`;
}

const tempInt = (c: number) => `${nf(0).format(Math.round(c))}\u00a0°C`;
const tempText = (c: number | null) => (c === null ? '–' : `${nf(1).format(c)}\u00a0°C`);

function readingRow(label: string, r: Reading, digits = 1, unit = 'kW'): SheetRow {
  return { label, value: r.value === null ? '–' : `${kwText(r.value, digits)} ${unit}` };
}

function sheetContent(
  target: SheetTarget,
  model: EnergyModel,
  appliances: ApplianceReading[],
): {
  title: string;
  rows: SheetRow[];
  icon: PictogramName;
  color: string;
  note?: string;
  phases?: boolean;
  sections?: SheetSection[];
  sparks?: SheetSpark[];
} {
  const p = model.power;
  const t = model.today;
  switch (target) {
    case 'phases': {
      const view = phaseView(model);
      return {
        title: 'Fáze L1 · L2 · L3',
        icon: 'pylon',
        color: COLOR.grid,
        phases: true,
        rows: [
          {
            label: 'Hlavní jistič',
            value: `3×${view?.analysis.breakerA ?? 25} A${p.breaker.value === null ? ' (výchozí)' : ''}`,
          },
          {
            label: 'Zdroj dat',
            value: view?.source === 'grid' ? 'elektroměr po fázích' : 'spotřeba domu po fázích',
          },
        ],
      };
    }
    case 'pv':
      return {
        title: 'Slunce · fotovoltaika',
        icon: 'sun',
        color: COLOR.pv,
        rows: [
          readingRow('Výkon teď', p.pv),
          ...(p.pvStrings[0].bound ? [readingRow('String FV1', p.pvStrings[0])] : []),
          ...(p.pvStrings[1].bound ? [readingRow('String FV2', p.pvStrings[1])] : []),
          readingRow('Vyrobeno dnes', t.pv, 1, 'kWh'),
          ...(model.forecast.today.value !== null
            ? [readingRow('Předpověď dnes', model.forecast.today, 1, 'kWh')]
            : []),
        ],
      };
    case 'grid':
      return {
        title: 'Síť · distribuce VN',
        icon: 'pylon',
        color: COLOR.grid,
        note: gridNote(model),
        rows: [
          { label: 'Odběr teď', value: kwOrDash(p.gridFlow.importKw) },
          { label: 'Dodávka teď', value: kwOrDash(p.gridFlow.exportKw) },
          ...(p.gridFlow.mode !== 'net' && p.grid.value !== null
            ? [
                {
                  label: 'Saldo teď',
                  value: `${p.grid.value < 0 ? '−' : ''}${kwText(Math.abs(p.grid.value))} kW`,
                },
              ]
            : []),
          { label: 'Zdroj dat', value: GRID_MODE_TEXT[p.gridFlow.mode] },
          ...(p.gridFlow.phasesKw
            ? p.gridFlow.phasesKw.map((v, i) => ({
                label: `Síť L${i + 1}`,
                value: `${v >= 0 ? 'odběr' : 'dodávka'} ${kwText(Math.abs(v), 2)} kW`,
              }))
            : []),
          ...p.phases.flatMap((ph, i) =>
            ph.bound ? [readingRow(`Fáze L${i + 1} (dům)`, ph, 2)] : [],
          ),
          readingRow('Odběr dnes', t.gridImport, 1, 'kWh'),
          readingRow('Dodávka dnes', t.gridExport, 1, 'kWh'),
          ...(model.price.now.value !== null
            ? [readingRow('Spotová cena', model.price.now, 2, 'Kč/kWh')]
            : []),
        ],
      };
    case 'battery': {
      const inv = model.inverterDetail;
      const vs = cellVoltageSpread(inv.cellVoltageMax.value, inv.cellVoltageMin.value);
      const ts = cellTempSpread(inv.cellTempMax.value, inv.cellTempMin.value);
      const tC = inv.cellTempMax.value ?? inv.batteryTemp.value;
      const cells: SheetRow[] = [
        ...(inv.batteryTemp.value !== null
          ? [{ label: 'Teplota baterie', value: tempText(inv.batteryTemp.value) }]
          : []),
        ...(ts
          ? [
              {
                label: 'Teplota článků min–max',
                value: `${tempText(inv.cellTempMin.value)} – ${tempText(inv.cellTempMax.value)}`,
              },
            ]
          : []),
        ...(vs
          ? [
              {
                label: 'Napětí článků min–max',
                value: `${kwText(inv.cellVoltageMin.value, 3)} – ${kwText(inv.cellVoltageMax.value, 3)} V`,
              },
              { label: 'Rozdíl napětí článků', value: `${vs.spread} mV`, tone: vs.tone },
            ]
          : []),
        ...(inv.soh.value !== null
          ? [{ label: 'Zdraví baterie (SoH)', value: `${nf(0).format(inv.soh.value)} %` }]
          : []),
      ];
      return {
        title: 'Baterie',
        icon: 'battery',
        color: COLOR.battery,
        rows: [
          readingRow('Nabití', model.batterySoc, 0, '%'),
          {
            label: p.battery.value !== null && p.battery.value < 0 ? 'Nabíjí' : 'Vybíjí',
            value: p.battery.value === null ? '–' : `${kwText(Math.abs(p.battery.value))} kW`,
          },
          ...(tC !== null
            ? [
                {
                  label: 'Stav teploty',
                  value: batteryTempState(tC).label,
                  tone: batteryTempState(tC).tone,
                },
              ]
            : []),
          readingRow('Nabito dnes', t.batteryCharge, 1, 'kWh'),
          readingRow('Vybito dnes', t.batteryDischarge, 1, 'kWh'),
        ],
        sparks: [
          {
            key: 'energy_battery_cell_temp_max',
            label: 'Nejteplejší článek · 24 h',
            color: COLOR.battery,
            now: inv.cellTempMax.value,
          },
          {
            key: 'energy_battery_temp',
            label: 'Teplota baterie · 24 h',
            color: COLOR.battery,
            now: inv.batteryTemp.value,
          },
        ],
        sections: cells.length
          ? [
              {
                title: 'Články a teplota',
                rows: cells,
                note: [
                  vs?.note,
                  ts && ts.tone !== 'ok' ? ts.note : undefined,
                  'Orientačně (LFP): pod 10 °C se nabíjí pomaleji, při 0 °C a níž se nenabíjí, nad 40 °C rychleji stárne.',
                ]
                  .filter(Boolean)
                  .join(' '),
              },
            ]
          : undefined,
      };
    }
    case 'house':
      return {
        title: 'Dům',
        icon: 'house',
        color: COLOR.house,
        rows: [
          readingRow('Spotřeba teď', p.house),
          readingRow('Spotřeba dnes', t.house, 1, 'kWh'),
          ...appliances.map((a) => {
            const [v, u] = powerParts(a.power.value);
            return { label: a.label, value: `${v} ${u}` };
          }),
        ],
      };
    case 'hub': {
      const inv = model.inverterDetail;
      const ac = inverterAcKw(inv.acPower.value, flowAllocation(model));
      const rad = inv.tempRadiator.value;
      const pvRow = (i: 0 | 1): SheetRow => ({
        label: `String FV${i + 1}`,
        value: `${p.pvStrings[i].value === null ? '–' : `${kwText(p.pvStrings[i].value)} kW`}${
          inv.pvVoltages[i].value !== null ? ` · ${nf(0).format(inv.pvVoltages[i].value!)} V` : ''
        }`,
      });
      const sections: SheetSection[] = [
        {
          title: 'AC výstup (do rozvaděče)',
          rows: [
            { label: 'Výkon', value: `${signedKw(ac.kw)} kW${ac.derived ? ' (dopočteno)' : ''}` },
            ...inv.acPhases.flatMap((r, i) =>
              r.bound ? [{ label: `L${i + 1}`, value: `${signedKw(r.value)} kW` }] : [],
            ),
          ],
          note: 'Záporný výkon = střídač bere ze sítě a nabíjí baterii.',
        },
        {
          title: 'FV stringy (DC)',
          rows: [
            ...(p.pvStrings[0].bound || inv.pvVoltages[0].bound ? [pvRow(0)] : []),
            ...(p.pvStrings[1].bound || inv.pvVoltages[1].bound ? [pvRow(1)] : []),
            readingRow('Vyrobeno dnes', t.pv, 1, 'kWh'),
          ],
        },
        {
          title: 'Baterie (DC)',
          rows: [
            readingRow('Nabití', model.batterySoc, 0, '%'),
            {
              label: 'Výkon',
              value:
                p.battery.value === null
                  ? '–'
                  : `${kwText(Math.abs(p.battery.value))} kW · ${p.battery.value < -0.049 ? 'nabíjí' : p.battery.value > 0.049 ? 'vybíjí' : 'v klidu'}`,
            },
            ...(inv.batteryVoltage.value !== null
              ? [{ label: 'Napětí', value: `${kwText(inv.batteryVoltage.value, 1)} V` }]
              : []),
            ...(inv.batteryCurrent.value !== null
              ? [{ label: 'Proud', value: `${signedKw(inv.batteryCurrent.value)} A` }]
              : []),
            ...(inv.cellTempMax.value !== null || inv.batteryTemp.value !== null
              ? [
                  {
                    label: 'Teplota',
                    value: tempText(inv.cellTempMax.value ?? inv.batteryTemp.value),
                  },
                ]
              : []),
          ],
        },
      ];
      return {
        title: 'Střídač · hybridní, 3 fáze',
        icon: 'inverter',
        color: COLOR.hub,
        note: inv.error
          ? `Chyba: ${inv.error.label}.${
              model.inverter?.tone === 'err'
                ? ' Střídač se po odeznění chyby obvykle znovu připojí sám; pokud porucha trvá déle než hodinu, kontaktujte instalační firmu.'
                : ''
            }`
          : undefined,
        rows: [
          {
            label: 'Režim',
            value: model.inverter?.label ?? '–',
            tone:
              model.inverter?.tone === 'err'
                ? 'crit'
                : model.inverter?.tone === 'warn'
                  ? 'warn'
                  : undefined,
          },
          ...(rad !== null
            ? [
                {
                  label: 'Teplota chladiče',
                  value: `${tempText(rad)} · ${inverterTempState(rad).label}`,
                  tone: inverterTempState(rad).tone,
                },
              ]
            : []),
          ...(inv.tempAir.value !== null
            ? [{ label: 'Teplota vzduchu uvnitř', value: tempText(inv.tempAir.value) }]
            : []),
        ],
        sparks: [
          {
            key: 'energy_inverter_temp_radiator',
            label: 'Chladič · 24 h',
            color: COLOR.hub,
            now: rad,
          },
          {
            key: 'energy_inverter_temp_air',
            label: 'Vzduch uvnitř · 24 h',
            color: 'var(--hb-t2)',
            now: inv.tempAir.value,
          },
        ],
        sections,
      };
    }
    default: {
      const a = appliances.find((x) => x.slot === target);
      const [v, u] = powerParts(a?.power.value ?? null);
      return {
        title: a?.label ?? 'Spotřebič',
        icon: CONSUMER_ICON[target],
        color: COLOR.house,
        rows: [
          { label: 'Výkon teď', value: `${v} ${u}` },
          { label: 'Dnes', value: a?.todayKwh == null ? '–' : `${kwText(a.todayKwh, 2)} kWh` },
          {
            label: 'Podíl na domu dnes',
            value: a?.sharePercent == null ? '–' : `${nf(0).format(a.sharePercent)} %`,
          },
        ],
      };
    }
  }
}

/** 24 h temperature sparkline (no text in the SVG; caption as HTML). */
function TempSpark(props: { spark: SheetSpark; history: ThermalHistory }) {
  const raw = props.history.series[props.spark.key];
  // The live reading closes the curve, so "teď" always matches the row above.
  const now = props.spark.now;
  const v = raw && now !== null ? [...raw.slice(0, -1), now] : raw;
  const range = v ? seriesRange(v) : null;
  if (!v || !range) return null;
  const lo = Math.floor(range.min - 1);
  const hi = Math.ceil(range.max + 1);
  const pts = v
    .map((y, i) =>
      Number.isFinite(y)
        ? `${f1((i / Math.max(1, v.length - 1)) * 100)},${f1(30 - ((y - lo) / (hi - lo)) * 28 - 1)}`
        : null,
    )
    .filter(Boolean);
  const last = [...v].reverse().find((y) => Number.isFinite(y));
  return (
    <figure className="ef-tspark" data-testid={`energy-temp-spark-${props.spark.key}`}>
      <figcaption>
        <span>{props.spark.label}</span>
        <span>
          {tempText(range.min)} – {tempText(range.max)}
          {last !== undefined && <b> · teď {tempText(last)}</b>}
        </span>
      </figcaption>
      <svg viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true">
        <path
          className="ef-tspark-area"
          d={`M${pts.join('L')}L100,30L0,30Z`}
          style={{ color: props.spark.color }}
        />
        <path
          className="ef-tspark-line"
          d={`M${pts.join('L')}`}
          style={{ color: props.spark.color }}
        />
      </svg>
    </figure>
  );
}

function DetailSheet(props: {
  target: SheetTarget;
  model: EnergyModel;
  appliances: ApplianceReading[];
  phaseHistory: PhaseHistory;
  thermalHistory: ThermalHistory;
  onClose: () => void;
}) {
  const c = sheetContent(props.target, props.model, props.appliances);
  const { onClose } = props;
  // Android/iOS back closes the sheet instead of leaving the panel.
  useBackClosable(onClose);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="ef-sheet-wrap">
      <div className="ef-scrim" onClick={onClose} aria-hidden="true" />
      <div
        className="ef-sheet"
        data-wide={c.phases || undefined}
        role="dialog"
        aria-modal="true"
        aria-label={c.title}
        data-testid="energy-flow-sheet"
      >
        <div className="ef-sheet-head">
          <svg
            viewBox="0 0 48 48"
            className="ef-sheet-ic"
            style={{ color: c.color }}
            aria-hidden="true"
          >
            <Pictogram
              name={c.icon}
              x={24}
              y={24}
              scale={1.25}
              weight={2.2}
              soc={props.model.batterySoc.value}
            />
          </svg>
          <h3>{c.title}</h3>
          <button type="button" className="ef-close" onClick={onClose} autoFocus>
            Zavřít
          </button>
        </div>
        {c.note && (
          <p className="ef-sheet-note" data-testid="energy-flow-sheet-note">
            {c.note}
          </p>
        )}
        {c.phases && (
          <PhaseSheetBody
            model={props.model}
            history={props.phaseHistory}
            appliances={props.appliances}
          />
        )}
        <dl className="ef-rows">
          {c.rows.map((r) => (
            <div key={r.label} data-tone={r.tone}>
              <dt>{r.label}</dt>
              <dd>{r.value}</dd>
            </div>
          ))}
        </dl>
        {c.sparks?.map((sp) => (
          <TempSpark key={sp.key} spark={sp} history={props.thermalHistory} />
        ))}
        {c.sections?.map((sec) => (
          <section key={sec.title} className="ef-sec" data-testid="energy-flow-sheet-section">
            <h4>{sec.title}</h4>
            <dl className="ef-rows">
              {sec.rows.map((r) => (
                <div key={r.label} data-tone={r.tone}>
                  <dt>{r.label}</dt>
                  <dd>{r.value}</dd>
                </div>
              ))}
            </dl>
            {sec.note && <p className="ef-sheet-note">{sec.note}</p>}
          </section>
        ))}
      </div>
    </div>
  );
}

function ConsumerChip(props: { item: ConsumerItem; style?: CSSProperties; onOpen: () => void }) {
  const { item } = props;
  const [v, u] = powerParts(item.watts);
  return (
    <button
      type="button"
      className={`ef-cons${item.leaving ? ' is-leaving' : ''}`}
      style={props.style}
      data-testid={`energy-flow-consumer-${item.slot}`}
      data-leaving={item.leaving ? 'true' : 'false'}
      aria-label={`${item.label}: ${v} ${u}`}
      onClick={props.onOpen}
    >
      <svg viewBox="0 0 48 48" className="ef-cons-ic" aria-hidden="true">
        <circle cx="24" cy="24" r="23" className="ef-cons-disc" />
        <Pictogram name={CONSUMER_ICON[item.slot]} x={24} y={24} scale={1.04} weight={2.1} />
      </svg>
      <span className="ef-cons-t">
        <span className="ef-cons-n">{CONSUMER_SHORT[item.slot]}</span>
        <span className="ef-cons-v">
          {v}
          <small> {u}</small>
        </span>
      </span>
    </button>
  );
}

/** Rest of the house load (not a measured appliance) – muted, not interactive. */
function OtherChip({ kw, style }: { kw: number; style?: CSSProperties }) {
  return (
    <div className="ef-cons ef-cons--other" style={style} data-testid="energy-flow-other">
      <svg viewBox="0 0 48 48" className="ef-cons-ic" aria-hidden="true">
        <circle cx="24" cy="24" r="23" className="ef-cons-disc" />
        <Pictogram name="plug" x={24} y={24} scale={1.04} weight={2.1} />
      </svg>
      <span className="ef-cons-t">
        <span className="ef-cons-n">Ostatní</span>
        <span className="ef-cons-v">
          {kwText(kw)}
          <small> kW</small>
        </span>
      </span>
    </div>
  );
}

export function EnergyFlowHero({
  model,
  appliances,
  phaseHistory = PHASE_HISTORY_NONE,
  thermalHistory = THERMAL_HISTORY_NONE,
}: {
  model: EnergyModel;
  appliances: ApplianceReading[];
  phaseHistory?: PhaseHistory;
  thermalHistory?: ThermalHistory;
}) {
  const [setEl, L, k] = useLayout();
  const tracker = useMemo(() => createConsumerTracker(), []);
  useEffect(() => () => tracker.dispose(), [tracker]);
  const snap = useSyncExternalStore(tracker.subscribe, tracker.getSnapshot, tracker.getSnapshot);
  useEffect(() => {
    tracker.update(appliances, Date.now());
  }, [tracker, appliances]);
  useEffect(() => {
    if (snap.nextCheckAt === null) return;
    const timer = setTimeout(
      () => tracker.update(appliances, Date.now()),
      Math.max(50, snap.nextCheckAt - Date.now() + 20),
    );
    return () => clearTimeout(timer);
  }, [tracker, appliances, snap.nextCheckAt]);
  const [open, setOpen] = useState<SheetTarget | null>(null);
  const close = useMemo(() => () => setOpen(null), []);

  const edges = flowEdges(model);
  const alloc = flowAllocation(model);
  const pairs = alloc ? FLOW_PAIRS.map((id) => alloc.pairs[id]).filter((pr) => pr.active) : [];
  const lanes = linkLanes(pairs.map((pr) => pr.id));
  const marks = flowLabelLayout(L, pairs, lanes, k);
  const ac = inverterAcKw(model.inverterDetail.acPower.value, alloc);
  const hubActive = pairs.some((pr) => viaInverter(pr.id)) || Math.abs(ac.kw ?? 0) >= FLOW_IDLE_KW;
  // Import and export can both be non-zero over a day (and per 15 min): always show both.
  const today = (
    [
      ['Vyrobeno', model.today.pv, COLOR.pv, false],
      ['Spotřeba', model.today.house, COLOR.house, false],
      ['Odběr', model.today.gridImport, COLOR.grid, true],
      ['Dodávka', model.today.gridExport, COLOR.grid, true],
    ] as const
  )
    .filter(([, r, , always]) => always || r.value !== null)
    .map(([label, r, color]) => ({ label, kwh: r.value, color }));
  const texts = nodeTexts(model, edges, ac, alloc);
  const head = flowHeadline(model, alloc);
  const gid = 'ef-g';
  const n = L.nodes;
  const u = (v: number) => `calc(var(--ef-u) * ${v})`;
  const items = snap.items;
  const running = items.filter((c) => !c.leaving);
  const runningW = running.reduce((s, c) => s + (c.watts ?? 0), 0);
  // "Ostatní" from the displayed (rounded) numbers, so the column always adds up to the house.
  const r1 = (kw: number) => Math.round(kw * 10) / 10;
  const otherRaw =
    model.power.house.value !== null && running.length
      ? r1(model.power.house.value) - running.reduce((s, c) => s + r1((c.watts ?? 0) / 1000), 0)
      : null;
  const otherKw = otherRaw !== null && otherRaw >= 0.05 ? r1(otherRaw) : null;
  const rows = items.length + (otherKw !== null ? 1 : 0);
  const houseKw = Math.max(0, model.power.house.value ?? 0);
  const night = (() => {
    const hr = localParts(model.now, model.timeZone).hour;
    return hr >= 21 || hr < 5;
  })();
  const time = new Intl.DateTimeFormat('cs-CZ', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: model.timeZone,
  }).format(model.now);

  return (
    <section
      className={`en-card ef-hero ef-hero--${L.name}`}
      data-fault={model.inverter?.tone === 'err' || undefined}
      aria-label="Toky energie teď"
      data-testid="energy-flow"
      data-layout={L.name}
      data-sunny={edges.pv.direction !== 'idle' ? 'true' : 'false'}
      data-ef-night={night ? 'true' : 'false'}
    >
      <header className="ef-head">
        <div>
          <span className="ef-eyebrow">Teď · {time}</span>
          <h2 className="ef-title" data-testid="energy-flow-headline">
            {head.title}
          </h2>
        </div>
        <div className="ef-head-r">
          {head.ownPercent !== null && (
            <span className="ef-own" data-testid="energy-flow-own">
              <b>{head.ownPercent} %</b> z vlastních zdrojů
            </span>
          )}
        </div>
      </header>
      <div className="ef-body">
        {L.name === 'wide' && today.length > 0 && (
          <dl className="ef-today" data-testid="energy-flow-today">
            <dt className="ef-today-h">Dnes</dt>
            {today.map((row) => (
              <div
                key={row.label}
                data-out={row.label === 'Dodávka' ? 'true' : undefined}
                style={{ '--ef-c': row.color } as CSSProperties}
              >
                <dt>{row.label}</dt>
                <dd>
                  {kwText(row.kwh)}
                  <small> kWh</small>
                </dd>
              </div>
            ))}
          </dl>
        )}
        <div
          className="ef-stage"
          ref={setEl}
          style={{ '--ef-w': L.w, aspectRatio: `${L.w} / ${L.h}` } as CSSProperties}
        >
          <svg className="ef-svg" viewBox={`0 0 ${L.w} ${L.h}`} aria-hidden="true">
            <defs>
              {(['pv', 'grid', 'battery', 'house', 'hub'] as const).map((id) => (
                <radialGradient key={id} id={`${gid}-${id}`} cx="35%" cy="28%" r="80%">
                  <stop offset="0%" stopColor={COLOR[id]} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={COLOR[id]} stopOpacity={0.08} />
                </radialGradient>
              ))}
              {(['pv', 'grid', 'battery', 'house', 'hub'] as const).map((id) => (
                <radialGradient key={id} id={`${gid}-${id}-halo`}>
                  <stop offset="0%" stopColor={COLOR[id]} stopOpacity={id === 'pv' ? 0.26 : 0.2} />
                  <stop offset="55%" stopColor={COLOR[id]} stopOpacity={id === 'pv' ? 0.1 : 0.05} />
                  <stop offset="100%" stopColor={COLOR[id]} stopOpacity="0" />
                </radialGradient>
              ))}
            </defs>
            {/* Static wiring (also when idle): PV and battery → inverter; the three AC board links
                (pylon ↔ board, inverter ↕ board, board → house) as two parallel conductors. */}
            <path
              className="ef-wire ef-bus-rail"
              d={`M${n.pv.x} ${f1(n.pv.y + laneEndR(L, 'pv'))}V${f1(n.hub.y - laneEndR(L, 'hub'))}M${f1(n.battery.x + laneEndR(L, 'battery'))} ${n.hub.y}H${f1(n.hub.x - laneEndR(L, 'hub'))}${[
                -0.5, 0.5,
              ]
                .map((o) => {
                  const g = o * L.gap;
                  return `M${f1(n.grid.x + laneEndR(L, 'grid', g))} ${L.busY + g}H${f1(n.house.x - laneEndR(L, 'house', g))}`;
                })
                .join('')}`}
              strokeWidth={1.5}
              data-testid="energy-flow-rails"
            />
            <path
              className="ef-wire ef-bus-rail"
              d={[-0.5, 0.5]
                .map((o) => {
                  const g = o * L.gap;
                  return `M${n.hub.x + g} ${f1(n.hub.y + laneEndR(L, 'hub', g))}V${L.busY}`;
                })
                .join('')}
              strokeWidth={1.5}
              data-testid="energy-flow-ac-wire"
            />
            {/* AC board (rozvaděč): a small plate the conductors pass over. */}
            <rect
              className="ef-tjoint"
              x={junctionAt(L).x - boardHalf(L, boardConductors(lanes))}
              y={junctionAt(L).y - boardHalf(L, boardConductors(lanes))}
              width={boardHalf(L, boardConductors(lanes)) * 2}
              height={boardHalf(L, boardConductors(lanes)) * 2}
              rx={4}
              data-testid="energy-flow-board"
            >
              <title>AC rozvaděč</title>
            </rect>
            {pairs.map((pr) => (
              <PairLine key={pr.id} pair={pr} L={L} lanes={lanes} mark={marks[pr.id]} />
            ))}
            {L.name === 'wide' && rows > 0 && (
              <g className="ef-tree" style={{ color: COLOR.house }}>
                <path
                  className="ef-wire ef-wire--on"
                  d={`M${n.house.x + L.r + 6} ${n.house.y}H${BUS_X}`}
                  strokeWidth={wireWidth(houseKw, L)}
                />
                {houseKw >= 0.05 && (
                  <path
                    className="ef-dots"
                    d={`M${n.house.x + L.r + 6} ${n.house.y}H${BUS_X}`}
                    strokeWidth={wireWidth(houseKw, L) + 1.5}
                    style={{ animationDuration: `${flowPeriodS(houseKw)}s` }}
                  />
                )}
                {rows > 1 && (
                  <path
                    className="ef-wire ef-bus"
                    d={`M${BUS_X} ${Math.min(consumerY(0, rows) + 18, n.house.y)}V${Math.max(consumerY(rows - 1, rows) - 18, n.house.y)}`}
                    strokeWidth={2.5}
                  />
                )}
                {items.map((c, i) => {
                  const d = consumerStub(consumerY(i, rows), n.house.y);
                  const kw = (c.watts ?? 0) / 1000;
                  return (
                    <g
                      key={c.slot}
                      className={`ef-cwire${c.leaving ? ' is-leaving' : ''}`}
                      data-testid={`energy-flow-edge-${c.slot}`}
                      data-period={c.leaving ? '' : flowPeriodS(kw)}
                    >
                      <path
                        className="ef-wire ef-wire--on"
                        d={d}
                        strokeWidth={2.5 + Math.min(2.5, kw)}
                      />
                      {!c.leaving && (
                        <path
                          className="ef-dots ef-dots--thin"
                          d={d}
                          strokeWidth={4 + Math.min(2.5, kw)}
                          style={{ animationDuration: `${flowPeriodS(kw)}s` }}
                        />
                      )}
                    </g>
                  );
                })}
                {otherKw !== null && (
                  <g className="ef-cwire ef-cwire--other">
                    <path
                      className="ef-wire ef-wire--on"
                      strokeWidth={2.5 + Math.min(2.5, otherKw)}
                      d={consumerStub(consumerY(rows - 1, rows), n.house.y)}
                    />
                    <path
                      className="ef-dots ef-dots--thin"
                      strokeWidth={4 + Math.min(2.5, otherKw)}
                      d={consumerStub(consumerY(rows - 1, rows), n.house.y)}
                      style={{ animationDuration: `${flowPeriodS(otherKw)}s` }}
                    />
                  </g>
                )}
              </g>
            )}
            {(['pv', 'grid', 'battery', 'house', 'hub'] as const).map((id) => (
              <NodeDisc
                key={id}
                id={id}
                at={n[id]}
                r={id === 'hub' ? L.hubR : L.r}
                gradient={`${gid}-${id}`}
                active={id === 'hub' ? hubActive : edges[id].direction !== 'idle'}
                soc={id === 'battery' ? model.batterySoc.value : undefined}
                tone={id === 'hub' ? (model.inverter?.tone ?? 'idle') : undefined}
              />
            ))}
          </svg>

          {(['pv', 'grid', 'battery', 'house', 'hub'] as const).map((id) => {
            const t = texts[id];
            const p = n[id];
            const side = L.labelSide[id];
            const align = L.align[id];
            const R = id === 'hub' ? L.hubR + 8 : L.r;
            const sub = L.name === 'compact' ? t.sub.replace(' · FV2', '\nFV2') : t.sub;
            const left =
              side === 'right'
                ? p.x + R + 8
                : align === 'start'
                  ? p.x - L.r
                  : align === 'end'
                    ? p.x + L.r
                    : p.x;
            return (
              <button
                key={id}
                type="button"
                className={`ef-label ef-label--${side} ef-label--${side === 'right' ? 'side' : align}`}
                data-testid={id === 'hub' ? 'energy-flow-hub' : `energy-flow-${id}`}
                data-node={id}
                style={
                  {
                    left: u(left),
                    top: side === 'right' ? u(p.y) : u(labelTop(L, id)),
                    '--ef-c': COLOR[id],
                  } as CSSProperties
                }
                onClick={() => setOpen(id)}
              >
                <span className="ef-name">
                  {t.name}
                  {t.extra && <b className="ef-extra">{t.extra}</b>}
                  {t.temp && L.name !== 'compact' && (
                    <TempChip temp={t.temp} testId={`energy-flow-${id}-temp`} />
                  )}
                </span>
                <span className="ef-val">
                  {t.dir && (
                    <svg
                      className="ef-dir"
                      data-dir={t.dir}
                      viewBox="0 0 16 16"
                      role="img"
                      aria-label={
                        t.dir === 'in' ? 'odběr' : t.dir === 'out' ? 'dodávka' : 'odběr i dodávka'
                      }
                      data-testid={`energy-flow-${id}-dir`}
                    >
                      {t.dir === 'both' ? (
                        <path d="M2 5.5h10m-3-3 3 3-3 3M14 10.5H4m3-3-3 3 3 3" />
                      ) : (
                        <path d="M2.5 8h10m-4-4 4 4-4 4" />
                      )}
                    </svg>
                  )}
                  {t.value}
                  <small> {t.unit}</small>
                </span>
                <span
                  className="ef-sub"
                  data-ml={sub.includes('\n') || undefined}
                  data-tone={t.tone}
                  data-testid={id === 'hub' ? 'energy-flow-hub-status' : undefined}
                >
                  {t.tone && <i aria-hidden="true" />}
                  {sub}
                  {t.temp && id === 'battery' && L.name === 'compact' && sub.length <= 9 && (
                    <TempChip temp={t.temp} testId={`energy-flow-${id}-temp`} />
                  )}
                </span>
                {/* Long battery state ('nabíjí ze sítě'): the chip gets its own row so the label
                    stays clear of the inverter ↕ board conductors on phones. */}
                {t.temp && id === 'battery' && L.name === 'compact' && sub.length > 9 && (
                  <span className="ef-sub">
                    <TempChip temp={t.temp} testId={`energy-flow-${id}-temp`} />
                  </span>
                )}
                {t.sub2 && (
                  <span className="ef-sub ef-sub2" data-tone2={t.tone}>
                    {t.sub2}
                  </span>
                )}
                {/* Phones: the inverter's chip sits under its text, not beside the name (on
                    320 px 'Střídač 22 °C' ran past the card's right edge). */}
                {t.temp && id === 'hub' && L.name === 'compact' && (
                  <span className="ef-sub">
                    <TempChip temp={t.temp} testId={`energy-flow-${id}-temp`} />
                  </span>
                )}
              </button>
            );
          })}
          {(['pv', 'grid', 'battery', 'house', 'hub'] as const).map((id) => (
            <button
              key={id}
              type="button"
              className="ef-hit"
              aria-label={
                id === 'hub' ? `Střídač: ${model.inverter?.label ?? 'bez dat'}` : texts[id].name
              }
              data-testid={`energy-flow-node-${id}`}
              style={{
                left: u(n[id].x - (id === 'hub' ? L.hubR : L.r)),
                top: u(n[id].y - (id === 'hub' ? L.hubR : L.r)),
                width: u(2 * (id === 'hub' ? L.hubR : L.r)),
              }}
              onClick={() => setOpen(id)}
            />
          ))}
          {pairs.map(
            (pr) => marks[pr.id] && <FlowPill key={pr.id} mark={marks[pr.id]!} pair={pr} u={u} />,
          )}
          {L.name === 'wide' && (
            <div
              className="ef-cons-col"
              data-testid="energy-flow-consumers"
              aria-label="Běžící spotřebiče"
            >
              {items.map((c, i) => (
                <ConsumerChip
                  key={c.slot}
                  item={c}
                  onOpen={() => setOpen(c.slot)}
                  style={{ left: u(CONSUMER_X - 24), top: u(consumerY(i, rows) - 24) }}
                />
              ))}
              {!items.length && (
                <span className="ef-cons-none" style={{ left: u(BUS_X), top: u(n.house.y - 12) }}>
                  Žádný velký spotřebič neběží
                </span>
              )}
              {otherKw !== null && (
                <OtherChip
                  kw={otherKw}
                  style={{ left: u(CONSUMER_X - 24), top: u(consumerY(rows - 1, rows) - 24) }}
                />
              )}
              {snap.overflow > 0 && (
                <span
                  className="ef-cons-more"
                  style={{
                    left: u(CONSUMER_X + 34),
                    top: u(consumerY(rows - 1, rows) + 30),
                  }}
                >
                  +{snap.overflow} další
                </span>
              )}
            </div>
          )}
        </div>
      </div>
      <PhaseStrip model={model} appliances={appliances} onOpen={() => setOpen('phases')} />
      {L.name === 'compact' && (
        <div
          className="ef-cons-row"
          data-testid="energy-flow-consumers"
          aria-label="Běžící spotřebiče"
        >
          <div className="ef-cons-h">
            <span>Běží teď</span>
            {running.length > 0 && (
              <span>
                <b>{powerParts(runningW).join(' ')}</b>
                {model.power.house.value !== null && (
                  <> z {kwText(model.power.house.value)} kW domu</>
                )}
              </span>
            )}
          </div>
          {items.length ? (
            <div className="ef-cons-grid">
              {items.map((c) => (
                <ConsumerChip key={c.slot} item={c} onOpen={() => setOpen(c.slot)} />
              ))}
              {otherKw !== null && <OtherChip kw={otherKw} />}
              {snap.overflow > 0 && <span className="ef-cons-more">+{snap.overflow} další</span>}
            </div>
          ) : (
            <p className="ef-cons-none">Žádný velký spotřebič neběží</p>
          )}
        </div>
      )}
      {open && (
        <DetailSheet
          target={open}
          model={model}
          appliances={appliances}
          phaseHistory={phaseHistory}
          thermalHistory={thermalHistory}
          onClose={close}
        />
      )}
    </section>
  );
}

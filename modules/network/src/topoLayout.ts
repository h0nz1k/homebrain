/**
 * Pure layout for the Síť map: horizontal UniFi-like tree (desktop) + child ordering for the
 * vertical phone tree. Coordinates are CSS px; text never goes into the SVG (HTML overlays).
 */
import type { TopoEdge, TopoGraph, TopoKind, TopoNode } from './types.js';

export interface TopoBox {
  id: string;
  node: TopoNode;
  edge: TopoEdge | null;
  col: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TopoLink {
  edge: TopoEdge;
  /** Shared part (parent → trunk → child row); always drawn neutral. */
  trunk: string | null;
  /** Child-specific part; carries the speed colour and the label. */
  branch: string;
  label: { x: number; y: number; text: string } | null;
}

export interface TopoLayout {
  boxes: TopoBox[];
  links: TopoLink[];
  /** Split points where one parent fans out to several side children. */
  junctions: Array<{ x: number; y: number }>;
  width: number;
  height: number;
}

const WIDTH: Record<TopoKind, number> = {
  internet: 196,
  gateway: 196,
  switch: 196,
  ap: 196,
  client: 172,
  more: 172,
};
const DEVICE_H = 60;
const LEAF_H = 36;
const COL_GAP = 128;
/** Trunk leaves the parent this far right of its edge (scaled with the gap, never hugging). */
const TRUNK_MIN = 32;
const TRUNK_MAX = 56;
/** Extra width a box may take when the card is wider than the tree. */
const GROW_MAX = 48;
const GAP_MAX = 220;
const ROW_GAP = 12;
const LEAF_GAP = 8;
const MESH_X = 26;
const ORDER: Record<TopoKind, number> = {
  internet: 0,
  gateway: 1,
  switch: 2,
  ap: 3,
  client: 4,
  more: 5,
};

const isLeaf = (n: TopoNode) => n.kind === 'client' || n.kind === 'more';
const height = (n: TopoNode) => (isLeaf(n) ? LEAF_H : DEVICE_H);

/** Children per node: devices (mesh APs included), then clients and the `+N` chip last. */
export function treeChildren(graph: TopoGraph): Map<string, TopoNode[]> {
  const edgeTo = new Map(graph.edges.map((e) => [e.to, e]));
  const out = new Map<string, TopoNode[]>();
  graph.nodes.forEach((n) => {
    if (!n.parent) return;
    const list = out.get(n.parent) ?? [];
    list.push(n);
    out.set(n.parent, list);
  });
  const rank = (n: TopoNode) => ORDER[n.kind] + (edgeTo.get(n.id)?.type === 'mesh' ? 0.5 : 0);
  for (const list of out.values()) list.sort((a, b) => rank(a) - rank(b));
  return out;
}

export function speedText(mbps: number): string {
  return mbps >= 1000 ? `${String(mbps / 1000).replace('.', ',')}G` : `${mbps}M`;
}

/** Link chip text: only what is known (V1 has little; V2 fills port/PoE/dBm). */
export function edgeLabel(edge: TopoEdge): string | null {
  const parts: string[] = [];
  if (edge.type === 'mesh') parts.push('mesh');
  if (edge.port != null) parts.push(`p${edge.port}`);
  if (edge.speed_mbps) parts.push(speedText(edge.speed_mbps));
  if (edge.poe_w) parts.push(`⚡${edge.poe_w.toFixed(1).replace('.', ',')} W`);
  if (edge.signal_dbm != null)
    parts.push(`${edge.signal_dbm < 0 ? '−' : ''}${Math.abs(edge.signal_dbm)} dBm`);
  if (!parts.length && edge.assumed) return 'předpoklad';
  return parts.length ? parts.join(' · ') : null;
}

export type EdgeTone = 'slow' | 'weak' | 'fast' | null;

/** Line colour = link quality only (node status lives on the node). */
export function edgeTone(edge: TopoEdge): EdgeTone {
  if (edge.slow) return 'slow';
  if (edge.signal_dbm != null && edge.signal_dbm <= -70) return 'weak';
  if ((edge.speed_mbps ?? 0) >= 2500) return 'fast';
  return null;
}

export function layoutTopology(
  graph: TopoGraph,
  opts: { collapsed?: ReadonlySet<string>; width?: number } = {},
): TopoLayout {
  const kids = treeChildren(graph);
  const edgeTo = new Map(graph.edges.map((e) => [e.to, e]));
  const placed: Array<{ node: TopoNode; col: number; y: number }> = [];
  let cursor = 0;

  const visit = (n: TopoNode, col: number) => {
    const y = cursor;
    placed.push({ node: n, col, y });
    const children = opts.collapsed?.has(n.id) ? [] : (kids.get(n.id) ?? []);
    // Mesh children and the router (under Internet) hang below their parent, same column.
    const stacked = (c: TopoNode) => edgeTo.get(c.id)?.type === 'mesh' || n.kind === 'internet';
    const side = children.filter((c) => !stacked(c));
    const below = children.filter(stacked);
    side.forEach((c) => visit(c, col + 1));
    const own = y + height(n) + (isLeaf(n) ? LEAF_GAP : ROW_GAP);
    cursor = Math.max(cursor, own);
    below.forEach((c) => {
      cursor += 14; // room for the vertical mesh link + its chip
      visit(c, col);
    });
  };
  graph.nodes.filter((n) => !n.parent).forEach((root) => visit(root, 0));

  const cols = Math.max(0, ...placed.map((p) => p.col)) + 1;
  const colW = Array.from({ length: cols }, (_, c) =>
    Math.max(0, ...placed.filter((p) => p.col === c).map((p) => WIDTH[p.node.kind])),
  );
  // Fill the card: widen boxes a little, then the gaps, and centre what is left.
  const natural = colW.reduce((s, w) => s + w, 0) + COL_GAP * (cols - 1);
  let extra = Math.max(0, (opts.width ?? 0) - natural);
  const grow = Math.min(GROW_MAX, Math.floor(extra / 2 / cols));
  extra -= grow * cols;
  const gap = cols > 1 ? Math.min(GAP_MAX, COL_GAP + Math.floor(extra / (cols - 1))) : COL_GAP;
  extra -= (gap - COL_GAP) * (cols - 1);
  const offset = Math.floor(Math.max(0, extra) / 2);
  const widths = colW.map((w) => w + grow);
  const colX = widths.map((_, c) => offset + widths.slice(0, c).reduce((s, w) => s + w + gap, 0));
  const trunk = Math.round(Math.min(TRUNK_MAX, Math.max(TRUNK_MIN, gap * 0.28)));
  // Every box takes its column's width, so cards line up (a server is as wide as a switch).
  const boxes: TopoBox[] = placed.map((p) => ({
    id: p.node.id,
    node: p.node,
    edge: edgeTo.get(p.node.id) ?? null,
    col: p.col,
    x: colX[p.col] ?? 0,
    y: p.y,
    w: widths[p.col] ?? WIDTH[p.node.kind],
    h: height(p.node),
  }));
  const byId = new Map(boxes.map((b) => [b.id, b]));
  const links: TopoLink[] = [];
  const fan = new Map<string, number>();
  const junctions: Array<{ x: number; y: number }> = [];
  const assumedLabelled = new Set<string>();
  for (const b of boxes) {
    const parent = b.node.parent ? byId.get(b.node.parent) : undefined;
    if (!parent || !b.edge) continue;
    let text = edgeLabel(b.edge);
    // „předpoklad“ once per shared trunk – the dashed style + legend say the rest.
    if (text === 'předpoklad') {
      if (assumedLabelled.has(parent.id)) text = null;
      assumedLabelled.add(parent.id);
    }
    if (b.edge.type === 'mesh' || parent.node.kind === 'internet') {
      const x = parent.x + MESH_X;
      const y1 = parent.y + parent.h;
      links.push({
        edge: b.edge,
        trunk: null,
        branch: `M${x} ${y1} V${b.y}`,
        label: text ? { x: x + 10, y: (y1 + b.y) / 2, text } : null,
      });
      continue;
    }
    const y1 = parent.y + parent.h / 2;
    const y2 = b.y + b.h / 2;
    const mx = parent.x + parent.w + trunk;
    fan.set(parent.id, (fan.get(parent.id) ?? 0) + 1);
    if (fan.get(parent.id) === 2) junctions.push({ x: mx, y: y1 });
    links.push({
      edge: b.edge,
      trunk: `M${parent.x + parent.w} ${y1} H${mx} V${y2}`,
      branch: `M${mx} ${y2} H${b.x}`,
      label: text ? { x: (mx + b.x) / 2, y: y2, text } : null,
    });
  }
  return {
    boxes,
    links,
    junctions,
    width: Math.max(opts.width ?? 0, ...boxes.map((b) => b.x + b.w)),
    height: Math.max(0, ...boxes.map((b) => b.y + b.h)),
  };
}

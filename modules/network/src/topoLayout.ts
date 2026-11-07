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
  width: number;
  height: number;
}

const WIDTH: Record<TopoKind, number> = {
  internet: 168,
  gateway: 168,
  switch: 200,
  ap: 200,
  client: 184,
  more: 184,
};
const DEVICE_H = 60;
const LEAF_H = 36;
const COL_GAP = 108;
const TRUNK = 22;
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

/** Children per node: devices, then clients, the `+N` chip, mesh children last. */
export function treeChildren(graph: TopoGraph): Map<string, TopoNode[]> {
  const edgeTo = new Map(graph.edges.map((e) => [e.to, e]));
  const out = new Map<string, TopoNode[]>();
  graph.nodes.forEach((n) => {
    if (!n.parent) return;
    const list = out.get(n.parent) ?? [];
    list.push(n);
    out.set(n.parent, list);
  });
  const rank = (n: TopoNode) => (edgeTo.get(n.id)?.type === 'mesh' ? 9 : ORDER[n.kind]);
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
  opts: { collapsed?: ReadonlySet<string> } = {},
): TopoLayout {
  const kids = treeChildren(graph);
  const edgeTo = new Map(graph.edges.map((e) => [e.to, e]));
  const placed: Array<{ node: TopoNode; col: number; y: number }> = [];
  let cursor = 0;

  const visit = (n: TopoNode, col: number) => {
    const y = cursor;
    placed.push({ node: n, col, y });
    const children = opts.collapsed?.has(n.id) ? [] : (kids.get(n.id) ?? []);
    const side = children.filter((c) => edgeTo.get(c.id)?.type !== 'mesh');
    const below = children.filter((c) => edgeTo.get(c.id)?.type === 'mesh');
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
  const colX = colW.map((_, c) => colW.slice(0, c).reduce((s, w) => s + w + COL_GAP, 0));
  const boxes: TopoBox[] = placed.map((p) => ({
    id: p.node.id,
    node: p.node,
    edge: edgeTo.get(p.node.id) ?? null,
    col: p.col,
    x: colX[p.col] ?? 0,
    y: p.y,
    w: WIDTH[p.node.kind],
    h: height(p.node),
  }));
  const byId = new Map(boxes.map((b) => [b.id, b]));
  const links: TopoLink[] = [];
  for (const b of boxes) {
    const parent = b.node.parent ? byId.get(b.node.parent) : undefined;
    if (!parent || !b.edge) continue;
    const text = edgeLabel(b.edge);
    if (b.edge.type === 'mesh') {
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
    const mx = parent.x + parent.w + TRUNK;
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
    width: Math.max(0, ...boxes.map((b) => b.x + b.w)),
    height: Math.max(0, ...boxes.map((b) => b.y + b.h)),
  };
}

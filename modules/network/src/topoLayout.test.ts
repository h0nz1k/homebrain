import { describe, expect, it } from 'vitest';
import { mockTopology } from './mock.js';
import { edgeLabel, edgeTone, layoutTopology, treeChildren } from './topoLayout.js';
import type { TopoEdge, TopoGraph } from './types.js';

const edge = (over: Partial<TopoEdge> = {}): TopoEdge => ({
  from: 'a',
  to: 'b',
  type: 'wired',
  assumed: false,
  port: null,
  speed_mbps: null,
  max_mbps: null,
  poe_w: null,
  signal_dbm: null,
  slow: false,
  ...over,
});

const graph: TopoGraph = mockTopology('problems');
const box = (id: string) => {
  const b = layoutTopology(graph).boxes.find((x) => x.id === id);
  if (!b) throw new Error(`no box ${id}`);
  return b;
};

describe('layoutTopology (desktop, horizontal tree)', () => {
  it('puts levels in columns left → right', () => {
    expect(box('internet').col).toBe(0);
    expect(box('gateway').col).toBe(1);
    expect(box('sw-lite').col).toBe(2);
    expect(box('ap-obyvak').col).toBe(3);
    expect(box('client:c-robot').col).toBe(4);
    expect(box('sw-lite').x).toBeGreaterThan(box('gateway').x + box('gateway').w);
  });

  it('hangs a mesh AP under its parent in the same column, below the parent subtree', () => {
    const parent = box('ap-kuchyn');
    const mesh = box('ap-podkrovi');
    expect(mesh.col).toBe(parent.col);
    const parentKids = layoutTopology(graph).boxes.filter((b) => b.node.parent === 'ap-kuchyn');
    for (const kid of parentKids.filter((k) => k.col > parent.col))
      expect(mesh.y).toBeGreaterThanOrEqual(kid.y + kid.h);
  });

  it('aligns a parent with its first child and never overlaps boxes', () => {
    const { boxes } = layoutTopology(graph);
    expect(box('gateway').y).toBe(box('sw-flex').y);
    for (const a of boxes)
      for (const b of boxes) {
        if (a === b) continue;
        const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
        expect(overlap, `${a.id} × ${b.id}`).toBe(false);
      }
  });

  it('draws one link per edge, branch coloured separately from the shared trunk', () => {
    const { links, width, height } = layoutTopology(graph);
    expect(links).toHaveLength(graph.edges.length);
    const mesh = links.find((l) => l.edge.type === 'mesh');
    expect(mesh?.trunk).toBeNull();
    const wired = links.find((l) => l.edge.to === 'ap-obyvak');
    expect(wired?.branch).toMatch(/^M[\d.]+ [\d.]+ H[\d.]+$/);
    expect(width).toBeGreaterThan(800);
    expect(height).toBeGreaterThan(200);
  });

  it('skips collapsed subtrees', () => {
    const all = layoutTopology(graph).boxes.length;
    const some = layoutTopology(graph, { collapsed: new Set(['ap-obyvak']) }).boxes;
    expect(some.length).toBeLessThan(all);
    expect(some.some((b) => b.node.parent === 'ap-obyvak')).toBe(false);
  });
});

describe('edge labels and tones', () => {
  it('formats port, speed, PoE and signal when known', () => {
    expect(edgeLabel(edge({ port: 1, speed_mbps: 1000, poe_w: 7.5 }))).toBe('p1 · 1G · ⚡7,5 W');
    expect(edgeLabel(edge({ speed_mbps: 2500 }))).toBe('2,5G');
    expect(edgeLabel(edge({ type: 'mesh', signal_dbm: -72 }))).toBe('mesh · −72 dBm');
    expect(edgeLabel(edge({ type: 'mesh' }))).toBe('mesh');
    expect(edgeLabel(edge({ assumed: true }))).toBe('předpoklad');
    expect(edgeLabel(edge({ type: 'wireless' }))).toBeNull();
    expect(edgeLabel(edge())).toBeNull();
  });

  it('red for 100 Mb/s on capable links, amber for weak signal, blue for 2.5G', () => {
    expect(edgeTone(edge({ speed_mbps: 100, slow: true }))).toBe('slow');
    expect(edgeTone(edge({ type: 'mesh', signal_dbm: -72 }))).toBe('weak');
    expect(edgeTone(edge({ type: 'mesh', signal_dbm: -55 }))).toBeNull();
    expect(edgeTone(edge({ speed_mbps: 2500 }))).toBe('fast');
    expect(edgeTone(edge({ speed_mbps: 1000 }))).toBeNull();
  });
});

describe('treeChildren (phone tree)', () => {
  it('orders devices first, then clients, the +N chip and mesh children last', () => {
    const kids = treeChildren(graph).get('ap-kuchyn') ?? [];
    expect(kids.map((k) => k.kind)).toEqual(['client', 'more', 'ap']);
    expect(treeChildren(graph).get('gateway')?.[0]?.kind).toBe('switch');
  });
});

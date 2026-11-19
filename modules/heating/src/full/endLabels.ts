import type { Rect } from './panZoom.js';
import type { GeoPipe } from './types.js';

/**
 * End labels of a preset frame (pure, r3): every pipe that leaves the visible box gets a short
 * "where it goes" label at the frame edge instead of being cut silently. The far end is the
 * nearest named piece of equipment along the circuit (pumps, sensors and tees are passed through).
 */
const TERMINAL: Record<string, string> = {
  tank: 'AKN',
  hp: 'TČ',
  ground: 'zemní kolektor',
  radiators: 'radiátory',
  solar: 'solární kolektor',
  pool: 'bazén',
  floor_pool: 'bazén',
  hx_cool: 'výměník chlazení',
  valve_mix: 'směšovač',
  valve_cool: 'ventil chlazení',
  valve_dhw: 'přepínání TUV',
  tap: 'TUV',
  cold: 'SV',
};
/** Far ends named after the circuit rather than the first tee behind the frame. */
const VIA: Record<string, string> = {
  j_ret: 'dům',
  j_sup: 'patra',
  j_coll_r: 'zemní kolektor',
  j_coll_s: 'zemní kolektor',
  j_mix: 'zpátečka z domu',
};
const GROUP: Array<[RegExp, string]> = [
  [/^(ryb_|valve_ryb|pump_ryb|j_ryb)/u, 'rybárna'],
  [/^(pump_filt|filter_pool|ph_probe|salinator|acid_dosing)$/u, 'jímka'],
];

const partOf = (port: string) => port.split('.')[0]!;
const nameOf = (part: string) =>
  TERMINAL[part] ?? VIA[part] ?? GROUP.find(([re]) => re.test(part))?.[1] ?? null;

/** Nearest named equipment reachable from `start` without using `via` (BFS by pipe count). */
export function farEnd(
  pipes: readonly GeoPipe[],
  via: string,
  start: string,
  inFrame: (part: string) => boolean = () => false,
): string {
  const own = nameOf(start);
  if (own && !inFrame(start)) return own;
  const seen = new Set([start]);
  let front = [start];
  const used = new Set([via]);
  while (front.length) {
    const found = new Set<string>();
    const next: string[] = [];
    for (const part of front) {
      for (const p of pipes) {
        if (used.has(p.id)) continue;
        const a = partOf(p.from);
        const b = partOf(p.to);
        if (a !== part && b !== part) continue;
        used.add(p.id);
        const other = a === part ? b : a;
        if (seen.has(other)) continue;
        seen.add(other);
        const n = nameOf(other);
        // named equipment inside the frame is a dead end (the label points out of the frame)
        if (n) {
          if (!inFrame(other)) found.add(n);
        } else next.push(other);
      }
    }
    if (found.size) return [...found].join(', ');
    front = next;
  }
  return '…';
}

export type Edge = 'l' | 'r' | 't' | 'b';
export interface EndLabel {
  pipe: string;
  /** Thin leader from the exit to a label that had to move away from its pipe. */
  bracket?: [number, number, number, number];
  /** r4: a supply/return pair (or two ports of one valve) shares one label between its pipes. */
  pair?: [number, number, number, number];
  edge: Edge;
  /** Crossing point on the frame edge. */
  at: [number, number];
  /** Full single-line text (also what tests read). */
  text: string;
  /** Lines as drawn (a short or two-line form where the full text has no room). */
  lines: string[];
  x: number;
  y: number;
  anchor: 'start' | 'end';
}

const ARROW: Record<Edge, string> = { l: '←', r: '→', t: '↑', b: '↓' };
const FONT = 15;
const LH = 18;
/** Circuit words for two pairs going to the same place (pool water vs pool floor heating). */
const CIRCUIT: Record<string, string> = {
  pool: 'filtrace',
  heat_supply: 'ohřev dna',
  heat_return: 'ohřev dna',
  coll: 'kolektor',
  solar: 'solár',
  cool: 'chlazení',
};
/** Shorter names for tight places (a narrow gap between the frame and a big glyph). */
const SHORT: Record<string, string> = {
  'zpátečka z domu': 'dům',
  'přepínání TUV': 'ventil TUV',
  'zemní kolektor': 'kolektor',
  'solární kolektor': 'solár',
  'výměník chlazení': 'výměník',
  'ventil chlazení': 'ventil',
};

/** Crossings of the polyline with the frame edge, with the side that lies outside. */
function exits(pts: number[][], f: Rect) {
  const inside = (p: number[]) =>
    p[0]! > f.x && p[0]! < f.x + f.w && p[1]! > f.y && p[1]! < f.y + f.h;
  const out: Array<{ at: [number, number]; edge: Edge; outer: 'from' | 'to' }> = [];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const ia = inside(a);
    const ib = inside(b);
    if (!ia && !ib) {
      // a straight run through the whole frame: it enters on one edge and leaves on the other
      if (a[1] === b[1] && a[1]! > f.y && a[1]! < f.y + f.h) {
        const [lo, hi] = [Math.min(a[0]!, b[0]!), Math.max(a[0]!, b[0]!)];
        if (lo < f.x && hi > f.x + f.w) {
          const aLeft = a[0]! < b[0]!;
          out.push({ at: [f.x, a[1]!], edge: 'l', outer: aLeft ? 'from' : 'to' });
          out.push({ at: [f.x + f.w, a[1]!], edge: 'r', outer: aLeft ? 'to' : 'from' });
        }
      } else if (a[0] === b[0] && a[0]! > f.x && a[0]! < f.x + f.w) {
        const [lo, hi] = [Math.min(a[1]!, b[1]!), Math.max(a[1]!, b[1]!)];
        if (lo < f.y && hi > f.y + f.h) {
          const aTop = a[1]! < b[1]!;
          out.push({ at: [a[0]!, f.y], edge: 't', outer: aTop ? 'from' : 'to' });
          out.push({ at: [a[0]!, f.y + f.h], edge: 'b', outer: aTop ? 'to' : 'from' });
        }
      }
      continue;
    }
    if (ia === ib) continue;
    const [p, q] = ia ? [a, b] : [b, a];
    let at: [number, number];
    let edge: Edge;
    if (p[1] === q[1]) {
      edge = q[0]! < p[0]! ? 'l' : 'r';
      at = [edge === 'l' ? f.x : f.x + f.w, p[1]!];
    } else {
      edge = q[1]! < p[1]! ? 't' : 'b';
      at = [p[0]!, edge === 't' ? f.y : f.y + f.h];
    }
    // the outside part of the route runs towards the end that lies beyond this crossing
    out.push({ at, edge, outer: ia ? 'to' : 'from' });
  }
  return out;
}

export type Box4 = [number, number, number, number];
/** Width of a 15-unit semibold label (Inter): narrow, wide and capital glyphs differ a lot. */
export function textWidth(t: string, font = FONT): number {
  let em = 0;
  for (const ch of t) {
    if ("iljtfr.,:;()·'| ".includes(ch)) em += 0.32;
    else if ('mwMW'.includes(ch)) em += 0.86;
    else if (ch === '←' || ch === '→' || ch === '↑' || ch === '↓') em += 0.8;
    else if (/[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ]/u.test(ch)) em += 0.68;
    else if (/\d/u.test(ch)) em += 0.6;
    else em += 0.56;
  }
  return em * font * 1.03;
}

const overlaps = (a: Box4, b: Box4) =>
  a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3];

/** Does the segment (x1, y1) → (x2, y2) pass through the box (sampled)? */
function crosses([x1, y1, x2, y2]: [number, number, number, number], b: Box4): boolean {
  for (let t = 0.04; t < 0.97; t += 0.04) {
    const x = x1 + (x2 - x1) * t;
    const y = y1 + (y2 - y1) * t;
    if (x > b[0] && x < b[0] + b[2] && y > b[1] && y < b[1] + b[3]) return true;
  }
  return false;
}

/** Thin boxes around every pipe segment (obstacles for labels). */
export function pipeBoxes(pipes: readonly GeoPipe[], half = 4): Box4[] {
  return pipes.flatMap((p) =>
    p.pts.slice(1).map((b, i) => {
      const a = p.pts[i]!;
      const x = Math.min(a[0]!, b[0]!) - half;
      const y = Math.min(a[1]!, b[1]!) - half;
      return [x, y, Math.abs(a[0]! - b[0]!) + 2 * half, Math.abs(a[1]! - b[1]!) + 2 * half] as Box4;
    }),
  );
}

/**
 * End labels for `frame` (r4): one label per exit, or one label between the two pipes of a pair
 * (supply/return or two ports of one valve). A label never overlaps another end label or anything
 * in `avoid` (pipes, glyphs, labels, zone borders): it tries spots next to its pipe, then a short
 * or two-line form, then the nearest free spot with a leader. Two labels of one view never read
 * the same: equal names get "přívod" / "zpátečka" by the flow direction.
 */
export function endLabels(
  pipes: readonly GeoPipe[],
  frame: Rect,
  avoid: readonly Box4[] = [],
  partBoxes: Record<string, number[]> = {},
): EndLabel[] {
  const inFrame = (part: string) => {
    const b = partBoxes[part];
    if (!b) return false;
    const cx = b[0]! + (b[2] ?? 0) / 2;
    const cy = b[1]! + (b[3] ?? 0) / 2;
    return cx > frame.x && cx < frame.x + frame.w && cy > frame.y && cy < frame.y + frame.h;
  };
  const raw = pipes.flatMap((p) =>
    exits(p.pts, frame).map((e) => ({
      pipe: p.id,
      colour: p.colour,
      ...e,
      name: ((n) =>
        // a pipe that only loops out over the edge and back: named after where it goes
        n === '…' ? (nameOf(partOf(p.to)) ?? nameOf(partOf(p.from)) ?? n) : n)(
        farEnd(pipes, p.id, partOf(e.outer === 'to' ? p.to : p.from), inFrame),
      ),
    })),
  );
  // glyphs and labels of equipment outside the frame are cut away (their labels are hidden), so
  // only thin boxes (pipes, borders) and boxes centred inside the frame are obstacles
  // (the viewer hides what a frame edge would cut, so only boxes wholly inside count)
  const centredIn = (b: Box4) =>
    b[0] >= frame.x - 6 &&
    b[0] + b[2] <= frame.x + frame.w + 6 &&
    b[1] >= frame.y - 6 &&
    b[1] + b[3] <= frame.y + frame.h + 6;
  const near = avoid.filter(
    (b) =>
      overlaps(b, [frame.x - 2, frame.y - 2, frame.w + 4, frame.h + 4]) &&
      (b[2] <= 12 || b[3] <= 12 || centredIn(b)),
  );
  const side = (e: Edge) => e === 'l' || e === 'r';
  const along = (v: { at: [number, number]; edge: Edge }) => (side(v.edge) ? v.at[1] : v.at[0]);
  raw.sort((a, b) => (a.edge === b.edge ? along(a) - along(b) : a.edge.localeCompare(b.edge)));
  const groups: Array<typeof raw> = [];
  for (const e of raw) {
    const g = groups.find(
      (gr) =>
        gr[0]!.edge === e.edge &&
        gr[0]!.name === e.name &&
        gr.length < 2 &&
        // r4: two exits to the same place in the same direction share one label up to 200 apart
        Math.abs(along(gr.at(-1)!) - along(e)) <=
          (gr[0]!.outer === e.outer ? 200 : side(e.edge) ? 90 : 160),
    );
    if (g) g.push(e);
    else groups.push([e]);
  }
  // equal names in one view: tell them apart by the flow direction (towards the far end or back)
  // (per edge: on different edges the arrows already make the texts differ)
  const key = (g: typeof raw) => `${g[0]!.edge}|${g[0]!.name}`;
  const count = new Map<string, number>();
  for (const g of groups) count.set(key(g), (count.get(key(g)) ?? 0) + 1);
  const nameOfGroup = (g: typeof raw) => {
    const n = g[0]!.name;
    if ((count.get(key(g)) ?? 0) < 2) return n;
    // a supply/return pair: told apart from another pair of the same name by its circuit
    if (g.length > 1) {
      const pairs = groups.filter((o) => o.length > 1 && key(o) === key(g)).length;
      return pairs > 1 && CIRCUIT[g[0]!.colour] ? `${n} · ${CIRCUIT[g[0]!.colour]}` : n;
    }
    return `${n} (${g[0]!.outer === 'to' ? 'přívod' : 'zpátečka'})`;
  };
  const placed: Box4[] = [];
  const out: EndLabel[] = [];
  type Cand = { x: number; y: number; anchor: 'start' | 'end' };
  const width = (lines: string[]) => Math.max(...lines.map((t) => textWidth(t)));
  const boxOf = (c: Cand, lines: string[]): Box4 => {
    const w = width(lines);
    return [
      c.anchor === 'start' ? c.x : c.x - w,
      c.y - FONT + 1,
      w,
      FONT + 3 + (lines.length - 1) * LH,
    ];
  };
  const free = (box: Box4) =>
    box[0] >= frame.x + 2 &&
    box[0] + box[2] <= frame.x + frame.w - 2 &&
    box[1] >= frame.y + 2 &&
    box[1] + box[3] <= frame.y + frame.h - 2 &&
    ![...placed, ...near].some((b) => overlaps(box, b));
  const glyphs = near.filter((b) => b[2] > 12 && b[3] > 12);
  const textOf = (edge: Edge, name: string) =>
    edge === 'r' ? `${name} ${ARROW.r}` : `${ARROW[edge]} ${name}`;
  /** One- and two-line forms of the full and the short name. */
  const forms = (edge: Edge, name: string): string[][] => {
    const m = /^(.*) \((přívod|zpátečka)\)$/u.exec(name);
    const base = m ? m[1]! : name;
    const qual = m ? ` (${m[2]})` : '';
    const out: string[][] = [];
    for (const n of [base, ...(SHORT[base] ? [SHORT[base]!] : [])]) {
      const t = textOf(edge, n + qual);
      out.push([t]);
      if (qual) {
        out.push([textOf(edge, n), qual.trim()]);
        continue;
      }
      const words = t.split(' ');
      if (words.length >= 3) {
        // break at the word that balances the two lines best
        let best: string[] | null = null;
        for (let i = 2; i < words.length; i++) {
          const ls = [words.slice(0, i).join(' '), words.slice(i).join(' ')];
          // an arrow never stands alone on its line
          if (ls.some((l) => !/\p{L}/u.test(l))) continue;
          if (!best || width(ls) < width(best)) best = ls;
        }
        if (best) out.push(best);
      }
    }
    return out;
  };
  for (const g of groups) {
    const first = g[0]!;
    const { edge } = first;
    const name = nameOfGroup(g);
    const text = textOf(edge, name);
    let pick: (Cand & { lines: string[] }) | undefined;
    let leader: [number, number, number, number] | undefined;
    let pair: [number, number, number, number] | undefined;
    const candsFor = (lines: string[], tier: number): Cand[] => {
      const n = lines.length;
      const cands: Cand[] = [];
      if (side(edge)) {
        const anchor = edge === 'l' ? ('start' as const) : ('end' as const);
        const top = Math.min(...g.map((e) => e.at[1]));
        const bottom = Math.max(...g.map((e) => e.at[1]));
        const between = g.length > 1 && bottom - top >= n * LH + 14;
        const ys =
          tier === 0
            ? [
                ...(between ? [(top + bottom) / 2 - ((n - 1) * LH) / 2 + 5] : []),
                top - 9 - (n - 1) * LH,
                bottom + 21,
              ]
            : [top - 29 - (n - 1) * LH, bottom + 41, top - 47 - (n - 1) * LH, bottom + 59];
        const dxs = tier === 0 ? [6, 20, 2] : [6, 20, 2, 34, 60];
        for (const dx of dxs)
          for (const y of ys)
            cands.push({ x: edge === 'l' ? frame.x + dx : frame.x + frame.w - dx, y, anchor });
      } else {
        const xs = g.map((e) => e.at[0]);
        for (const k of tier === 0 ? [0, 1] : [2, 3, 4]) {
          const y =
            edge === 't'
              ? frame.y + FONT + 6 + 20 * k
              : frame.y + frame.h - 8 - (n - 1) * LH - 20 * k;
          for (const d of [9, 6]) {
            cands.push({ x: Math.max(...xs) + d, y, anchor: 'start' });
            cands.push({ x: Math.min(...xs) - d, y, anchor: 'end' });
          }
        }
      }
      return cands;
    };
    // near spots with the full / short / two-line text first, then farther spots, and only then
    // the compact "←TČ" form (no space) right at the pipe
    const compact = (lines: string[]) => [lines[0]!.replace(' ', '')];
    const tries: Array<[number, string[]]> = [
      ...forms(edge, name).map((l) => [0, l] as [number, string[]]),
      ...forms(edge, name).map((l) => [1, l] as [number, string[]]),
      ...forms(edge, name)
        .filter((l) => l.length === 1 && l[0]!.split(' ').length === 2)
        .map((l) => [0, compact(l)] as [number, string[]]),
    ];
    search: for (const [tier, lines] of tries) {
      {
        const c = candsFor(lines, tier).find((cd) => free(boxOf(cd, lines)));
        if (!c) continue;
        pick = { ...c, lines };
        if (side(edge) && g.length > 1) {
          const top = Math.min(...g.map((e) => e.at[1]));
          const bottom = Math.max(...g.map((e) => e.at[1]));
          const b = boxOf(c, lines);
          if (b[1] > top && b[1] + b[3] < bottom) pair = [first.at[0], top, first.at[0], bottom];
        }
        break search;
      }
    }
    if (!pick) {
      // nearest free spot whose leader crosses no glyph (a leader only when the label is away)
      const [ax, ay] = first.at;
      const inx = edge === 'l' ? 6 : edge === 'r' ? -6 : 0;
      const iny = edge === 't' ? 6 : edge === 'b' ? -6 : 0;
      for (const radius of [90, 140]) {
        const lines = forms(edge, name).at(-1)!;
        const spots: Array<Cand & { d: number }> = [];
        for (let gx = frame.x + 4; gx < frame.x + frame.w - 20; gx += 8) {
          for (let gy = frame.y + FONT + 4; gy < frame.y + frame.h - 4; gy += 6) {
            const d = Math.hypot(gx - ax, gy - ay);
            if (d < radius) spots.push({ x: gx, y: gy, anchor: 'start', d });
          }
        }
        spots.sort((a, b) => a.d - b.d);
        for (const c of spots) {
          const b = boxOf(c, lines);
          if (!free(b)) continue;
          const tx = Math.min(Math.max(ax, b[0]), b[0] + b[2]);
          const ty = Math.min(Math.max(ay, b[1]), b[1] + b[3]);
          const seg: [number, number, number, number] = [ax + inx, ay + iny, tx, ty];
          // (a glyph box the exit itself lies in does not count: the leader starts there)
          const inBox = (gb: Box4) =>
            seg[0] > gb[0] && seg[0] < gb[0] + gb[2] && seg[1] > gb[1] && seg[1] < gb[1] + gb[3];
          if (glyphs.some((gb) => !inBox(gb) && crosses(seg, gb))) continue;
          pick = { ...c, lines };
          if (Math.hypot(tx - ax, ty - ay) > 36) leader = seg;
          break;
        }
        if (pick) break;
      }
    }
    if (!pick) continue;
    placed.push(boxOf(pick, pick.lines));
    out.push({
      pipe: g.map((e) => e.pipe).join(' '),
      edge,
      at: first.at,
      text,
      lines: pick.lines,
      x: pick.x,
      y: pick.y,
      anchor: pick.anchor,
      ...(leader ? { bracket: leader } : {}),
      ...(pair ? { pair } : {}),
    });
  }
  return out;
}

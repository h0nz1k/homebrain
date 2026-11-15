/** Toky r5 schematic geometry model (synthetic fixture). */
export const TOKY_SCHEMATIC_MODEL = {
  tank: { x0: 136, x1: 258, top: 101.5, bottom: 446 },
  lower_third_y: 331.16666666666663,
  ports: {
    'hp-supply': [
      [14, 354],
      [136, 270],
    ],
    'hp-return': [
      [136, 400],
      [50, 354],
    ],
    'heat-supply': [
      [258, 200],
      [272, 200],
    ],
    'heat-return': [
      [285, 225],
      [258, 290],
    ],
    'solar-supply': [
      [342, 14.4],
      [258, 338],
    ],
    'solar-return': [
      [258, 393],
      [356, 20.0],
    ],
    'dhw-draw': [
      [192, 146],
      [88.4, 76],
    ],
  },
  coil: {
    start: [258, 338],
    end: [258, 393],
    x_min: 229,
    x_max: 245,
    rows: [338, 393],
  },
  window: { x0: 139, x1: 255 },
  card_right: 219,
  panel_corners_global: [
    [289.4, 21.9],
    [281.25, 42.33],
    [363.71, 51.54],
    [355.55, 71.98],
  ],
  roof: { x0: 184, y0: 3, x1: 372, y1: 78, margin: 6 },
  panel: {
    centre_global: [322.85, 46.01],
    angle: 21.75,
    low_end: [360.0, 10.8],
    low_bottom: [342.0, 14.4],
  },
} as const;

type Model = typeof TOKY_SCHEMATIC_MODEL;

/** Refs #82 Toky r5 – geometric QA on the painted schematic (client coordinates). */
export function tokySchematicGeometry(el: HTMLElement, model: Model = TOKY_SCHEMATIC_MODEL) {
  const fails: string[] = [];
  const fail = (c: string, m: string) => fails.push(`${c}: ${m}`);
  const svg = el.querySelector('svg[data-toky-schematic], svg')! as SVGSVGElement;
  const scene = svg.querySelector(':scope > g[transform="translate(0 50)"]');
  if (!scene) {
    fail('0-scene', 'missing translate(0 50) group');
    return fails;
  }
  const ctm = svg.getScreenCTM();
  if (!ctm) return ['0-ctm: no screen CTM'];
  const scale = ctm.a;
  const toScreen = (pathEl: SVGGraphicsElement, x: number, y: number) => {
    const p = new DOMPoint(x, y).matrixTransform(pathEl.getScreenCTM()!);
    return [p.x, p.y] as const;
  };
  const R = (r: DOMRect) => ({ x: r.left, y: r.top, r: r.right, b: r.bottom });
  const inter = (a: ReturnType<typeof R>, b: ReturnType<typeof R>, pad = 0) =>
    a.x - pad < b.r && a.r + pad > b.x && a.y - pad < b.b && a.b + pad > b.y;

  const lines: { txt: string; id: string; bb: ReturnType<typeof R>; el: SVGTextElement }[] = [];
  const tw = document.createTreeWalker(svg, NodeFilter.SHOW_TEXT);
  let n: Node | null;
  while ((n = tw.nextNode())) {
    if (!n.textContent?.trim() || (n.parentElement as Element | null)?.closest('style')) continue;
    const rg = document.createRange();
    rg.selectNodeContents(n);
    const rr = rg.getBoundingClientRect();
    const t = (n.parentElement as Element).closest('text') as SVGTextElement | null;
    if (!t) continue;
    lines.push({ txt: n.textContent.trim(), id: t.dataset.label ?? '', bb: R(rr), el: t });
  }

  const hero = svg.closest('.ht-hero');
  const card = hero?.getBoundingClientRect();
  if (card) {
    for (const l of lines) {
      if (l.bb.x < card.left + 8 || l.bb.r > card.right - 8)
        fail('1-inside-card', `${l.txt} x ${l.bb.x.toFixed(1)}..${l.bb.r.toFixed(1)}`);
    }
  }

  const minFontPx = Math.min(
    ...lines
      .filter((l) => l.id !== 'dhw')
      .map((l) => Number.parseFloat(getComputedStyle(l.el).fontSize) * scale),
  );
  if (minFontPx < 11) fail('1-min-font', String(minFontPx));

  for (let i = 0; i < lines.length; i++)
    for (let j = i + 1; j < lines.length; j++) {
      if (lines[i]!.el === lines[j]!.el) continue;
      if (inter(lines[i]!.bb, lines[j]!.bb, 0))
        fail('2-text-text', `${lines[i]!.txt} / ${lines[j]!.txt}`);
    }

  const glyphs = Array.from(svg.querySelectorAll('[data-node], [data-pump]')).map((g) => ({
    id: (g as HTMLElement).dataset.node || `pump-${(g as HTMLElement).dataset.pump}`,
    bb: R(g.getBoundingClientRect()),
  }));
  const allowed: Record<string, string[]> = {
    tank: ['dhw', 'tank', 'tank-title'],
  };
  for (const l of lines)
    for (const g of glyphs) {
      if ((allowed[g.id] || []).includes(l.id)) continue;
      if (inter(l.bb, g.bb, 2)) fail('3-text-glyph', `${l.txt} hits ${g.id}`);
    }

  const distRect = (px: number, py: number, r: ReturnType<typeof R>) =>
    Math.hypot(Math.max(r.x - px, 0, px - r.r), Math.max(r.y - py, 0, py - r.b));

  const pipes = Array.from(svg.querySelectorAll('[data-pipe-id] > path, path[data-coil]'));
  const samples: Record<string, [number, number, number, number][]> = {};
  let minClear = 1e9;
  for (const p of pipes) {
    const parent = p.parentElement as HTMLElement | null;
    const id =
      parent?.dataset?.pipeId || (p.matches('[data-coil]') ? 'coil' : parent?.getAttribute('data-pipe-id') ?? 'pipe');
    const sw = Number.parseFloat(getComputedStyle(p).strokeWidth) * scale;
    const L = (p as SVGPathElement).getTotalLength();
    samples[id] = [];
    for (let s = 0; s <= L; s += 3) {
      const q = (p as SVGPathElement).getPointAtLength(s);
      const [x, y] = toScreen(p as SVGGraphicsElement, q.x, q.y);
      samples[id].push([x, y, q.x, q.y]);
      for (const l of lines) {
        if (id === 'coil' && l.id === 'tank') continue;
        const d = distRect(x, y, l.bb) - sw / 2;
        if (l.id !== 'dhw' && l.id !== 'tank') minClear = Math.min(minClear, d);
        if (d < 3) {
          fail('4-pipe-label', `${id} ${d.toFixed(1)}px from "${l.txt}"`);
          break;
        }
      }
    }
  }

  const ends = (id: string) => {
    const p = svg.querySelector(`[data-pipe-id="${id}"] > path`) as SVGPathElement;
    if (!p) return null;
    const L = p.getTotalLength();
    const a = p.getPointAtLength(0);
    const b = p.getPointAtLength(L);
    return [
      [a.x, a.y],
      [b.x, b.y],
    ] as [[number, number], [number, number]];
  };
  const near = (a: number[], b: number[], tol = 2) =>
    Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!) <= tol;

  const portEntries = Object.entries(model.ports) as [string, [[number, number], [number, number]]][];
  for (const [id, [s, e]] of portEntries) {
    const ab = ends(id);
    if (!ab) continue;
    const [a, b] = ab;
    if (!near(a, s) || !near(b, e))
      fail('5-port', `${id} ${JSON.stringify([a, b])} vs ${JSON.stringify([s, e])}`);
  }

  const coil = svg.querySelector('path[data-coil]') as SVGPathElement | null;
  if (coil) {
    const cL = coil.getTotalLength();
    const c0 = coil.getPointAtLength(0);
    const c1 = coil.getPointAtLength(cL);
    const sup = ends('solar-supply');
    const ret = ends('solar-return');
    if (sup && !near(sup[1]!, [c0.x, c0.y])) fail('5-port', 'solar-supply end != coil start');
    if (ret && !near(ret[0]!, [c1.x, c1.y])) fail('5-port', 'solar-return start != coil end');

    let coilMinY = 1e9;
    for (let s = 0; s <= cL; s += 1) coilMinY = Math.min(coilMinY, coil.getPointAtLength(s).y);
    if (coilMinY < model.lower_third_y)
      fail('6-solar-lower-third', `coil top ${coilMinY} < ${model.lower_third_y}`);
    if (sup && sup[1]![1]! < model.lower_third_y) fail('6-solar-lower-third', 'supply port');

    const [r0, r1] = model.coil.rows;
    for (let t = 0; t <= cL; t += 1) {
      const q = coil.getPointAtLength(t);
      const lead = Math.abs(q.y - r0!) < 0.5 || Math.abs(q.y - r1!) < 0.5;
      if (!lead && (q.x > model.window.x1 - 8 || q.x < model.card_right + 5)) {
        fail('6b-coil-wall', `coil point ${q.x.toFixed(1)},${q.y.toFixed(1)}`);
        break;
      }
    }
  }

  const panelNode = svg.querySelector('[data-node="solar-panel"]');
  if (panelNode) {
    const rf = model.roof;
    const roofY = (x: number) => rf.y0 + ((x - rf.x0) * (rf.y1 - rf.y0)) / (rf.x1 - rf.x0);
    for (const [x, y] of model.panel_corners_global) {
      if (x > rf.x1 - rf.margin || x < rf.x0 + rf.margin) fail('6c-panel-eave', `corner x ${x}`);
      if (y > roofY(x) + 1) fail('6c-panel-below-roof', `corner ${x},${y}`);
    }
    const panelRect = panelNode.querySelector('rect.ht-c3-metal');
    if (panelRect) {
      const bb = panelNode.getBoundingClientRect();
      const [ex] = toScreen(svg as SVGGraphicsElement, rf.x1, rf.y1);
      if (bb.right > ex - 2) fail('6c-panel-eave-dom', `${bb.right.toFixed(1)} > ${ex.toFixed(1)}`);
    }
    const panelRectEl = panelNode.querySelector('rect.ht-c3-metal') as SVGRectElement;
    for (const [id, end] of [
      ['solar-supply', 0],
      ['solar-return', 1],
    ] as const) {
      const ab = ends(id);
      if (!ab || !panelRectEl) continue;
      const p = ab[end];
      const [x, y] = toScreen(scene as unknown as SVGGraphicsElement, p![0]!, p![1]!);
      const inv = panelRectEl.getScreenCTM()!.inverse();
      const lp = new DOMPoint(x, y).matrixTransform(inv);
      const w = panelRectEl.width.baseVal.value;
      const h = panelRectEl.height.baseVal.value;
      const rx0 = panelRectEl.x.baseVal.value;
      const ry0 = panelRectEl.y.baseVal.value;
      const d = Math.hypot(
        Math.max(rx0 - lp.x, 0, lp.x - (rx0 + w)),
        Math.max(ry0 - lp.y, 0, lp.y - (ry0 + h)),
      );
      if (d > 1.5) fail('5-panel-port', `${id} ${d.toFixed(2)} from panel`);
    }
  }

  for (const [id, end] of [
    ['hp-supply', 1],
    ['hp-return', 0],
    ['heat-supply', 0],
    ['heat-return', 1],
    ['solar-supply', 1],
    ['solar-return', 0],
  ] satisfies [string, number][]) {
    const ab = ends(id);
    if (!ab) continue;
    const p = ab[end]!;
    if (id === 'solar-supply' && end === 0) continue;
    if (id === 'solar-return' && end === 1) continue;
    if (!(Math.abs(p[0] - 136) < 1 || Math.abs(p[0] - 258) < 1)) fail('5-tank-wall', `${id} ${p}`);
    else if (p[1] < model.tank.top || p[1] > model.tank.bottom) fail('5-tank-wall', `${id} ${p}`);
  }

  for (const p of [ends('hp-supply')?.[0], ends('hp-return')?.[1]]) {
    if (!p) continue;
    if (Math.abs(p[1]! - 354) > 1 || p[0]! < 8 || p[0]! > 74) fail('5-hp-port', String(p));
  }

  const xs: number[] = [];
  for (const [id, pts] of Object.entries(samples)) {
    if (id === 'coil') continue;
    const byX: Record<number, number> = {};
    for (const [, , x] of pts) {
      if (x > 262) {
        const k = Math.round(x);
        byX[k] = (byX[k] || 0) + 1;
      }
    }
    for (const [k, c] of Object.entries(byX))
      if (c >= 8) xs.push(Number(k));
  }
  const u = [...new Set(xs)].sort((a, b) => a - b);
  for (let i = 1; i < u.length; i++)
    if (u[i]! - u[i - 1]! < 12) fail('6d-bundle', `${u[i - 1]} / ${u[i]}`);
  if (u.length && 372 - u[u.length - 1]! < 12) fail('6d-wall', String(u[u.length - 1]));

  const ids = Object.keys(samples).filter((k) => k !== 'coil');
  for (let i = 0; i < ids.length; i++)
    for (let j = i + 1; j < ids.length; j++) {
      let md = 1e9;
      for (const a of samples[ids[i]!]!) for (const b of samples[ids[j]!]!) md = Math.min(md, Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!));
      if (md < 8) fail('7-pipe-pipe', `${ids[i]} / ${ids[j]} ${md.toFixed(1)}px`);
    }

  for (const pg of Array.from(svg.querySelectorAll('[data-pump]'))) {
    const m = pg.getAttribute('transform')?.match(/translate\(([\d.]+) ([\d.]+)\)/);
    if (!m) continue;
    const [x, y] = toScreen(scene as unknown as SVGGraphicsElement, Number(m[1]), Number(m[2]));
    let md = 1e9;
    for (const k of ids) for (const s of samples[k]!) md = Math.min(md, Math.hypot(s[0]! - x, s[1]! - y));
    if (md > 3) fail('8-pump-on-pipe', `${(pg as HTMLElement).dataset.pump} ${md.toFixed(1)}px`);
  }

  for (let i = 0; i < glyphs.length; i++)
    for (let j = i + 1; j < glyphs.length; j++) {
      if (inter(glyphs[i]!.bb, glyphs[j]!.bb, 0))
        fail('9-glyph-glyph', `${glyphs[i]!.id} / ${glyphs[j]!.id}`);
    }

  const hOverflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;
  if (hOverflow > 0) fail('10-h-overflow', String(hOverflow));

  return fails;
}

/** Legacy entry – Toky r5 geometry checks. */
export function schematicGeometry(el: HTMLElement | SVGElement) {
  return tokySchematicGeometry(el as HTMLElement);
}

/** Off state: flow labels must not overlap the tank shell. */
export function offSchematicTankLabelClearance(el: HTMLElement): string[] {
  const errors: string[] = [];
  const tank = el.querySelector<SVGGraphicsElement>('.ht-c3-shell');
  if (!tank || el.getAttribute('data-state') !== 'off') return errors;
  const tankBox = tank.getBoundingClientRect();
  const intersects = (a: DOMRect, b: DOMRect, margin = 1) =>
    Math.min(a.right, b.right) - Math.max(a.left, b.left) > margin &&
    Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > margin;
  for (const text of Array.from(el.querySelectorAll<SVGTextElement>('text[data-label]'))) {
    const id = text.dataset.label;
    if (!id || id === 'dhw' || id === 'tank') continue;
    if (intersects(text.getBoundingClientRect(), tankBox)) errors.push(`${id}: overlaps tank`);
  }
  return errors;
}

export function solarRenderedGeometry(el: HTMLElement) {
  const svg = el.querySelector('svg')!;
  const panel = el.querySelector('[data-testid="heating-sch-solar-panel"]');
  const coil = el.querySelector('[data-testid="heating-sch-solar-coil"]');
  const solarPump = el.querySelector('[data-pump="solar"]');
  if (!panel || !coil || !solarPump) {
    return { configured: false as const, overlaps: [] as string[] };
  }
  const overlaps: string[] = [];
  const envelope = svg.querySelector('.ht-c3-envelope') as SVGGeometryElement;
  const shell = el.querySelector('.ht-c3-shell') as SVGGeometryElement;
  const atticTop = shell.getBoundingClientRect().top;
  const panelBox = panel.getBoundingClientRect();
  const envInv = envelope.getScreenCTM()!.inverse();
  const panelPts: [number, number][] = [
    [panelBox.left, panelBox.top],
    [panelBox.right, panelBox.top],
    [panelBox.left, panelBox.bottom],
    [panelBox.right, panelBox.bottom],
  ];
  const collectorInHouse = panelPts.every(([x, y]) =>
    envelope.isPointInFill(new DOMPoint(x, y).matrixTransform(envInv)),
  );
  const collectorInRoof =
    collectorInHouse &&
    panelBox.bottom <= atticTop + 12 &&
    panelBox.top >= svg.getBoundingClientRect().top + 2;
  const tank = el.querySelector('[data-floor="tank"]')!.getBoundingClientRect();
  const coilBox = coil.getBoundingClientRect();
  const coilInLower =
    coilBox.top >= tank.top + tank.height * 0.6 - 2 && coilBox.bottom <= tank.bottom + 2;
  const badge = el.querySelector('[data-tank-card]')!.getBoundingClientRect();
  const badgeCoilOverlap =
    Math.min(badge.right, coilBox.right) - Math.max(badge.left, coilBox.left) > 0.1 &&
    Math.min(badge.bottom, coilBox.bottom) - Math.max(badge.top, coilBox.top) > 0.1;
  const solarHeating = Boolean(
    el.querySelector('[data-pipe-id="solar-supply"][data-active]') &&
      el.querySelector('[data-pipe-id="solar-return"][data-active]'),
  );
  return {
    configured: true as const,
    overlaps,
    collectorInHouse,
    collectorInRoof,
    coilInLower,
    badgeCoilOverlap,
    solarHeating,
  };
}
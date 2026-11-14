/** Rendered guards: allow route redesigns while keeping readable, attached labels. */
export function schematicGeometry(
  el: HTMLElement | SVGElement,
  onRouting?: (metrics: Record<string, unknown>) => void,
) {
  const svg = el.querySelector('svg')!;
  const errors: string[] = [];
  const scale = svg.getBoundingClientRect().width / svg.viewBox.baseVal.width;
  const q = (selector: string) => el.querySelector<SVGGraphicsElement>(selector)!;
  const gap = (a: DOMRect, b: DOMRect) =>
    Math.hypot(
      Math.max(0, a.left - b.right, b.left - a.right),
      Math.max(0, a.top - b.bottom, b.top - a.bottom),
    );
  const body = (node: SVGGraphicsElement) => {
    const parts = Array.from(
      node.querySelectorAll<SVGGraphicsElement>(
        'circle, rect, ellipse, path:not(.ht-c3-metal-pipe)',
      ),
    ).map((n) => n.getBoundingClientRect());
    if (!parts.length) return node.getBoundingClientRect();
    const left = Math.min(...parts.map((r) => r.left)),
      top = Math.min(...parts.map((r) => r.top));
    return new DOMRect(
      left,
      top,
      Math.max(...parts.map((r) => r.right)) - left,
      Math.max(...parts.map((r) => r.bottom)) - top,
    );
  };
  const samples = (path: SVGGeometryElement) => {
    const m = path.getScreenCTM()!,
      length = path.getTotalLength();
    const count = Math.ceil(length);
    const points = Array.from({ length: count + 1 }, (_, i) => {
      const p = path.getPointAtLength((length * i) / count);
      return new DOMPoint(p.x, p.y).matrixTransform(m);
    });
    return { points, half: (parseFloat(getComputedStyle(path).strokeWidth) * scale) / 2 };
  };
  const pathGap = (r: DOMRect, s: ReturnType<typeof samples>) =>
    Math.min(
      ...s.points.map((p) =>
        Math.hypot(
          Math.max(0, r.left - p.x, p.x - r.right),
          Math.max(0, r.top - p.y, p.y - r.bottom),
        ),
      ),
    ) - s.half;
  const pipes = Array.from(
    el.querySelectorAll<SVGPathElement>(
      '.ht-c3-route > path, path.ht-c3-cold-inlet, path.ht-c3-draw',
    ),
  ).map((p) => ({
    id: p.closest('[data-pipe-id]')!.getAttribute('data-pipe-id')!,
    sample: samples(p),
  }));
  const labels = Array.from(el.querySelectorAll<SVGTextElement>('text[data-label]')).filter((t) =>
    t.textContent?.trim(),
  );
  const cards = ['dhw', 'tank', 'hp-mark'];
  const components: Record<string, string> = {
    charge: '[data-pump="charge"]',
  'solar-pump': '[data-pump="solar"]',
    'house-pump': '[data-pump="house"]',
    mixing: '.ht-c3-valve:not([data-valve])',
    valve: '[data-valve]',
    radiators: '.ht-c3-radiator',
    tap: '.ht-c3-tap',
    'tank-title': '.ht-c3-tank',
  };
  const pipeOwners: Record<string, string> = {
    'hp-in': 'tank-return',
    'hp-out': 'compressor-outlet',
    'dhw-port': 'dhw-inlet',
    'tank-port': 'tank-inlet',
    supply: 'radiator-supply',
    'cold-water': 'cold-water',
    collector: 'collector',
    'solar-collector': 'solar-supply',
    'solar-pump': 'solar-return',
  };
  const iconNodes = Array.from(
    el.querySelectorAll<SVGGraphicsElement>(
      '[data-pump], .ht-c3-valve, .ht-c3-radiator, .ht-c3-tap, .ht-c3-cabinet',
    ),
  );
  const icons = iconNodes.map(body);
  const outlines = Array.from(
    el.querySelectorAll<SVGGeometryElement>(
      '.ht-c3-shell, .ht-c3-window, .ht-c3-vessel, .ht-c3-envelope',
    ),
  ).map(samples);
  const grass = Array.from(el.querySelectorAll('.ht-c3-grass, .ht-c3-blade')).map((n) =>
    n.getBoundingClientRect(),
  );
  const bounds = svg.getBoundingClientRect();
  for (const text of labels) {
    const id = text.dataset.label!,
      r = text.getBoundingClientRect();
    for (const other of labels)
      if (other !== text && gap(r, other.getBoundingClientRect()) < 4)
        errors.push(`${id}: text gap`);
    if (
      Math.min(
        r.left - bounds.left,
        bounds.right - r.right,
        r.top - bounds.top,
        bounds.bottom - r.bottom,
      ) < 4
    )
      errors.push(`${id}: scene edge`);

    if (cards.includes(id)) continue;
    const font = parseFloat(getComputedStyle(text).fontSize) * scale;
    if (font < 12) errors.push(`${id}: font ${font}`);
    if (
      r.height > font * 1.5 ||
      Array.from(text.querySelectorAll('tspan')).some((n) => n.hasAttribute('dy'))
    )
      errors.push(`${id}: multiline`);
    if (pipes.some((p) => pathGap(r, p.sample) < 4)) errors.push(`${id}: pipe gap`);
    if (icons.some((b) => gap(r, b) < 4)) errors.push(`${id}: icon gap`);
    if (outlines.some((p) => pathGap(r, p) < 4)) errors.push(`${id}: outline gap`);
    if (grass.some((b) => gap(r, b) < 4)) errors.push(`${id}: grass gap`);
    const owner = pipeOwners[id];
    if (id === 'hp-in' || id === 'hp-out') {
      const distances = pipes
        .map((pipe) => ({ id: pipe.id, distance: pathGap(r, pipe.sample) }))
        .sort((a, b) => a.distance - b.distance);
      if (distances[0]!.id !== owner) errors.push(`${id}: nearest pipe must be ${owner}`);
      const own = distances.find((pipe) => pipe.id === owner)!.distance;
      const other = distances.find(
        (pipe) => pipe.id === (id === 'hp-in' ? 'compressor-outlet' : 'tank-return'),
      )!.distance;
      if (other < 2 * own)
        errors.push(
          `${id}: opposite pipe must be at least twice as far (${own.toFixed(2)}/${other.toFixed(2)})`,
        );
    }
    const component = components[id];
    const distance = owner
      ? pathGap(r, pipes.find((p) => p.id === owner)!.sample)
      : component
        ? gap(
            r,
            component.includes('pump') || component.includes('valve')
              ? body(q(component))
              : q(component).getBoundingClientRect(),
          )
        : Infinity;
    if (distance > 16) errors.push(`${id}: component distance ${distance.toFixed(1)}`);
  }
  const label = (id: string) => q(`[data-label="${id}"]`).getBoundingClientRect();
  for (const [a, b, min] of [
    ['valve', 'tank-port', 10],
    ['tank-port', 'hp-in', 10],
    ['hp-in', 'charge', 10],
    ['charge', 'hp-out', 10],
    ['radiators', 'house-pump', 12],
    ['tank-title', 'dhw-port', 10],
  ] as const)
    if (gap(label(a), label(b)) < min) errors.push(`${a}/${b}: semantic group gap`);
  if (label('valve').bottom > q('[data-valve]').getBoundingClientRect().top)
    errors.push('valve caption must be above valve');
  if (q('[data-label="mixing"]').querySelectorAll('tspan').length > 1)
    errors.push('mixer must be one label');
  // Scan every rendered text/tspan, including the split large values and target.
  for (const text of Array.from(el.querySelectorAll('text, tspan'))) {
    const content = text.textContent ?? '';
    if (content.includes('℃') || /(?<!\u202f)°C/u.test(content))
      errors.push(`temperature unit: ${content}`);
    if (content.includes('°C') && !/\d(?:,\d)?\u202f°C/u.test(content)) {
      // A unit-only tspan belongs to its numeric parent, which is scanned as well.
      if (content !== '\u202f°C') errors.push(`temperature string: ${content}`);
      else if (!/\d(?:,\d)?\u202f°C/u.test(text.parentElement?.textContent ?? ''))
        errors.push('temperature unit without value');
    }
  }
  const houseLabel = label('house-pump');
  const ownPump = gap(houseLabel, body(q('[data-pump="house"]')));
  const competitors = [
    ...iconNodes
      .filter((node) => node !== q('[data-pump="house"]'))
      .map((node) => gap(houseLabel, body(node))),
    gap(houseLabel, q('.ht-c3-shell').getBoundingClientRect()),
    gap(houseLabel, q('[data-vessel]').getBoundingClientRect()),
    pathGap(houseLabel, pipes.find((pipe) => pipe.id === 'cold-water')!.sample),
  ];
  if (ownPump > 16 || competitors.some((distance) => distance < 2 * ownPump))
    errors.push(
      `house-pump: nearest owner (${ownPump.toFixed(2)}/${Math.min(...competitors).toFixed(2)})`,
    );
  if (
    pipes.some(
      (pipe) => pipe.id !== 'radiator-return' && pathGap(houseLabel, pipe.sample) < ownPump,
    )
  )
    errors.push('house-pump: another pipe nearer than heating pump');
  // Parse the actual straight SVG commands, independently of the marker table.
  // Curves join these runs and are checked by the direction/tangent guard below.
  for (const path of Array.from(
    el.querySelectorAll<SVGPathElement>(
      '.ht-c3-route > path, path.ht-c3-cold-inlet, path.ht-c3-draw',
    ),
  )) {
    const route = path.closest('[data-pipe-id]')!;
    if (
      path
        .getAttribute('d')!
        .match(/[a-z]/gi)
        ?.some((c) => !['M', 'H', 'V', 'L', 'Q', 'A'].includes(c))
    )
      errors.push(`${route.getAttribute('data-pipe-id')}: unsupported segment command`);
    const centers = Array.from(route.querySelectorAll<SVGGraphicsElement>('.ht-c3-direction')).map(
      (marker) => new DOMPoint(0, 0).matrixTransform(marker.getScreenCTM()!),
    );
    let x = 0,
      y = 0;
    const m = path.getScreenCTM()!;
    for (const command of path.getAttribute('d')!.matchAll(/([MHVLQA])([^MHVLQA]+)/g)) {
      const values = command[2]!.trim().split(/[ ,]+/).map(Number);
      const kind = command[1];
      const nextX = kind === 'V' ? x : (values.at(-2) ?? values[0]!);
      const nextY = kind === 'H' ? y : values.at(-1)!;
      if (['H', 'V', 'L'].includes(kind!)) {
        const a = new DOMPoint(x, y).matrixTransform(m);
        const b = new DOMPoint(nextX, nextY).matrixTransform(m);
        const length = Math.hypot(b.x - a.x, b.y - a.y);
        if (
          length >= 60 &&
          !centers.some((p) => {
            const along =
              ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / (length * length);
            const across = Math.abs((p.x - a.x) * (b.y - a.y) - (p.y - a.y) * (b.x - a.x)) / length;
            return along > 0 && along < 1 && across < 0.5;
          })
        )
          errors.push(
            `${route.getAttribute('data-pipe-id')}: segment ${command[0]} (${length.toFixed(1)}px) missing chevron`,
          );
      }
      x = nextX;
      y = nextY;
    }
  }
  for (const marker of Array.from(el.querySelectorAll<SVGGraphicsElement>('.ht-c3-direction'))) {
    const route = marker.closest('[data-pipe-id]')!;
    const path = route.querySelector<SVGPathElement>(':scope > path')!;
    const m = marker.getScreenCTM()!;
    const center = new DOMPoint(0, 0).matrixTransform(m);
    const forward = new DOMPoint(1, 0).matrixTransform(m);
    const points = samples(path).points;
    const nearest = points.reduce(
      (best, p, i) =>
        Math.hypot(p.x - center.x, p.y - center.y) <
        Math.hypot(points[best]!.x - center.x, points[best]!.y - center.y)
          ? i
          : best,
      0,
    );
    const before = points[Math.max(0, nearest - 1)]!,
      after = points[Math.min(points.length - 1, nearest + 1)]!;
    if (
      Math.hypot(points[nearest]!.x - center.x, points[nearest]!.y - center.y) > scale ||
      (forward.x - center.x) * (after.x - before.x) +
        (forward.y - center.y) * (after.y - before.y) <=
        0
    )
      errors.push(`${route.getAttribute('data-pipe-id')}: wrong flow chevron`);
  }
  const floor = q('[data-floor="tank"]').getBoundingClientRect().bottom;
  for (const part of ['[data-floor="hp"]', '.ht-c3-radiator'])
    if (Math.abs(q(part).getBoundingClientRect().bottom - floor) > 2) errors.push('common floor');
  const insideHouse = (p: DOMPoint) => {
    const local = p.matrixTransform(svg.getScreenCTM()!.inverse());
    return (
      local.x >= 0 &&
      local.x <= 372 &&
      local.y >= 9 + (Math.abs(local.x - 184) * 75) / 188 &&
      local.y <= 534
    );
  };
  for (const text of labels) {
    if (['collector', 'cold-water'].includes(text.dataset.label!)) continue;
    const r = text.getBoundingClientRect();
    if (
      ![
        new DOMPoint(r.left, r.top),
        new DOMPoint(r.right, r.top),
        new DOMPoint(r.left, r.bottom),
        new DOMPoint(r.right, r.bottom),
      ].every(insideHouse)
    )
      errors.push(`${text.dataset.label}: outside house`);
  }
  for (const pipe of pipes) {
    if (['collector', 'cold-water'].includes(pipe.id)) continue;
    if (!pipe.sample.points.every(insideHouse)) errors.push(`${pipe.id}: outside house`);
  }
  const collector = pipes.find((p) => p.id === 'collector')!;
  for (const p of collector.sample.points) {
    const local = p.matrixTransform(svg.getScreenCTM()!.inverse());
    if (
      Math.min(p.x - bounds.left, bounds.right - p.x, bounds.bottom - p.y) - collector.sample.half <
      3.9 * scale
    )
      errors.push('collector: scene edge');
    if (local.x > 64 && local.y < 558) errors.push('collector: loop above soil');
  }
  // Junction endpoints, rather than path snapshots, encode the hydraulic connections.
  const point = (id: string, end: boolean) => {
    const path = q(`[data-pipe-id="${id}"] > path`) as SVGPathElement;
    const p = path.getPointAtLength(end ? path.getTotalLength() : 0);
    return new DOMPoint(p.x, p.y).matrixTransform(path.getScreenCTM()!);
  };
  for (const [a, aEnd, b, bEnd] of [
    ['compressor-outlet', true, 'tank-inlet', false],
    ['compressor-outlet', true, 'dhw-inlet', false],
    ['mixing-hot', true, 'radiator-supply', false],
    ['mixing-bypass', true, 'radiator-supply', false],
    ['radiator-return', true, 'house-tank-return', false],
    ['radiator-return', true, 'mixing-bypass', false],
  ] as const) {
    const p = point(a, aEnd),
      r = point(b, bEnd);
    if (Math.hypot(p.x - r.x, p.y - r.y) > 0.5) errors.push(`disconnected: ${a}/${b}`);
  }
  for (const [pumpId, pipeId] of [
    ['charge', 'tank-return'],
    ['house', 'radiator-return'],
    ['solar', 'solar-supply'],
  ] as const) {
    const pump = q(`[data-pump="${pumpId}"]`);
    if (!pump) continue;
    const center = new DOMPoint(0, 0).matrixTransform(pump.getScreenCTM()!);
    if (
      pathGap(new DOMRect(center.x, center.y, 0, 0), pipes.find((p) => p.id === pipeId)!.sample) > 0
    )
      errors.push(`${pumpId}: pump off circuit`);
  }
  const inner = q('[data-vessel]').getBoundingClientRect(),
    card = q('[data-vessel-card]').getBoundingClientRect();
  if (
    Math.min(
      card.left - inner.left,
      inner.right - card.right,
      card.top - inner.top,
      inner.bottom - card.bottom,
    ) < 6
  )
    errors.push('vessel card padding');
  // Refs #82: the mixer draws buffer water beside, never inside, the DHW vessel.
  const tank = q('.ht-c3-shell');
  const shellSamples = samples(tank as SVGGeometryElement).points;
  const outlineGap = (p: DOMPoint) =>
    Math.min(...shellSamples.map((s) => Math.hypot(s.x - p.x, s.y - p.y)));
  const mixerStart = point('mixing-hot', false);
  const inTank = (p: DOMPoint) => {
    const local = p.matrixTransform(tank.getScreenCTM()!.inverse());
    return (tank as SVGGeometryElement).isPointInFill(local);
  };
  if (!inTank(mixerStart)) errors.push('mixer feed outside buffer');
  if (
    mixerStart.x >= inner.left &&
    mixerStart.x <= inner.right &&
    mixerStart.y >= inner.top &&
    mixerStart.y <= inner.bottom
  )
    errors.push('mixer feed inside DHW vessel bbox');
  if (Math.max(inner.left - mixerStart.x, mixerStart.x - inner.right) < 8)
    errors.push('mixer feed horizontal DHW gap');
  // Owner zones: top of the outer buffer, beside or above the vessel – a port on the shell itself.
  if (mixerStart.y >= inner.bottom || outlineGap(mixerStart) > scale)
    errors.push('mixer feed must leave the top cap or upper wall');
  if (point('house-tank-return', true).y <= mixerStart.y)
    errors.push('heating return must enter buffer below mixer feed');
  const flow = point('tank-inlet', true),
    back = point('tank-return', false);
  const tankBounds = tank.getBoundingClientRect();
  const flowHeight = (flow.y - tankBounds.top) / tankBounds.height;
  if (!inTank(flow) || flowHeight < 0.3 || flowHeight > 0.55 || flow.y <= inner.bottom)
    errors.push('charging flow must enter upper-middle buffer below DHW');
  if (
    back.y <= tankBounds.top + 0.75 * tankBounds.height ||
    back.y - flow.y < 0.25 * tankBounds.height
  )
    errors.push('charging return lower third / flow separation');
  const heatingReturn = point('house-tank-return', true);
  const returnHeight = (heatingReturn.y - tankBounds.top) / tankBounds.height;
  if (
    !inTank(heatingReturn) ||
    returnHeight < 0.55 ||
    returnHeight > 0.75 ||
    heatingReturn.y >= back.y
  )
    errors.push('heating return must enter lower zone above HP return');
  if ((mixerStart.y - tankBounds.top) / tankBounds.height >= 0.3)
    errors.push('mixer supply must draw from top buffer zone');
  const coldEnd = point('cold-water', true),
    hotStart = point('dhw-draw', false);
  if (Math.abs(coldEnd.y - inner.bottom) > 0.5 || coldEnd.x < inner.left || coldEnd.x > inner.right)
    errors.push('DHW cold inlet must meet vessel bottom');
  if (Math.abs(hotStart.y - inner.top) > 0.5 || hotStart.x < inner.left || hotStart.x > inner.right)
    errors.push('DHW hot outlet must meet vessel top');
  for (const port of [flow, back, heatingReturn, point('dhw-inlet', true)]) {
    if (Math.min(Math.abs(port.x - tankBounds.left), Math.abs(port.x - tankBounds.right)) > 0.5)
      errors.push('buffer port must meet tank wall');
  }
  const charge = q('[data-pump="charge"]').getBoundingClientRect();
  if (gap(charge, tankBounds) < 4) errors.push('charging pump tank clearance');
  if (!inTank(back) || back.y <= inner.bottom || back.y <= flow.y)
    errors.push('charging return must leave lower buffer below DHW vessel');
  const value = label('dhw');
  if (
    value.left < card.left ||
    value.right > card.right ||
    value.top < card.top ||
    value.bottom > card.bottom
  )
    errors.push('vessel value outside card');
  const cold = q('[data-pipe-id="cold-water"] > path') as SVGPathElement;
  const end = cold.getPointAtLength(cold.getTotalLength());
  const localEnd = new DOMPoint(end.x, end.y).matrixTransform(
    q('[data-vessel]').getCTM()!.inverse().multiply(cold.getCTM()!),
  );
  if (!(q('[data-vessel]') as SVGGeometryElement).isPointInFill(localEnd))
    errors.push('cold inlet outside vessel');
  const pill = q('.ht-c3-title-bg').getBoundingClientRect();
  const shell = q('.ht-c3-shell').getBoundingClientRect();
  // The cold inlet splits the lower buffer, so the nameplate sits on the floor right below the tank.
  if (
    pill.top < shell.bottom ||
    pill.top - shell.bottom > 16 ||
    pill.right <= shell.left ||
    pill.left >= shell.right
  )
    errors.push('tank title pill must sit directly under the tank');
  const allLines = Array.from(
    el.querySelectorAll<SVGGeometryElement>('path, rect, ellipse, circle, line, polyline, polygon'),
  ).filter(
    (node) =>
      !node.closest('.ht-c3-direction') &&
      getComputedStyle(node).stroke !== 'none' &&
      parseFloat(getComputedStyle(node).strokeWidth) > 0,
  );
  if (allLines.some((line) => pathGap(pill, samples(line)) < 6))
    errors.push('tank title pill line clearance');
  if (gap(pill, charge) < 6) errors.push('tank title pill charging pump clearance');
  const title = label('tank-title');
  if (
    title.left < pill.left ||
    title.right > pill.right ||
    title.top < pill.top ||
    title.bottom > pill.bottom
  )
    errors.push('tank title outside pill');
  const tankCard = q('[data-tank-card]').getBoundingClientRect();
  if (pathGap(tankCard, samples(cold)) < 8 * scale) errors.push('cold inlet near tank card');
  // Nested so Playwright serialises it together with this function.
  /** Refs #82 R17: pipe routing around the tank, measured on the painted SVG in CSS px. */
  function pipeRouting(el: HTMLElement | SVGElement) {
    const svg = el.querySelector('svg')!;
    const scale = svg.getBoundingClientRect().width / svg.viewBox.baseVal.width;
    const errors: string[] = [];
    const shell = el.querySelector<SVGGeometryElement>('.ht-c3-shell')!;
    const rim = el.querySelector<SVGGeometryElement>('ellipse.ht-c3-rim')!;
    const vessel = el.querySelector<SVGGeometryElement>('[data-vessel]')!;
    const outline = [shell, rim].flatMap((node) => {
      const m = node.getScreenCTM()!,
        length = node.getTotalLength();
      const pts = Array.from({ length: Math.ceil(length) * 2 + 1 }, (_, i) => {
        const p = node.getPointAtLength((length * i) / (Math.ceil(length) * 2));
        return new DOMPoint(p.x, p.y).matrixTransform(m);
      });
      const half = (parseFloat(getComputedStyle(node).strokeWidth) * scale) / 2;
      return pts.map((p, i) => {
        const a = pts[Math.max(0, i - 1)]!,
          b = pts[Math.min(pts.length - 1, i + 1)]!;
        const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        return { p, tx: (b.x - a.x) / len, ty: (b.y - a.y) / len, half };
      });
    });
    const nearest = (p: DOMPoint) =>
      outline.reduce(
        (best, o) => {
          const d = Math.hypot(o.p.x - p.x, o.p.y - p.y);
          return d < best.d ? { d, o } : best;
        },
        { d: Infinity, o: outline[0]! },
      );
    const tankBox = shell.getBoundingClientRect();
    const inBuffer = (p: DOMPoint) =>
      shell.isPointInFill(p.matrixTransform(shell.getScreenCTM()!.inverse())) &&
      nearest(p).d > 1.5 * scale;
    const inVessel = (p: DOMPoint) =>
      vessel.isPointInFill(p.matrixTransform(vessel.getScreenCTM()!.inverse()));
    type Segment = { id: string; a: DOMPoint; b: DOMPoint; half: number; length: number };
    const segments: Segment[] = [];
    const paths = Array.from(
      el.querySelectorAll<SVGPathElement>(
        '.ht-c3-route > path, path.ht-c3-cold-inlet, path.ht-c3-draw',
      ),
    );
    for (const path of paths) {
      const id = path.closest('[data-pipe-id]')!.getAttribute('data-pipe-id')!;
      const m = path.getScreenCTM()!;
      const half = (parseFloat(getComputedStyle(path).strokeWidth) * scale) / 2;
      let x = 0,
        y = 0;
      for (const command of path.getAttribute('d')!.matchAll(/([MHVLQA])([^MHVLQA]+)/g)) {
        const values = command[2]!.trim().split(/[ ,]+/).map(Number);
        const nextX = command[1] === 'V' ? x : (values.at(-2) ?? values[0]!);
        const nextY = command[1] === 'H' ? y : values.at(-1)!;
        if (['H', 'V', 'L'].includes(command[1]!)) {
          const a = new DOMPoint(x, y).matrixTransform(m),
            b = new DOMPoint(nextX, nextY).matrixTransform(m);
          segments.push({ id, a, b, half, length: Math.hypot(b.x - a.x, b.y - a.y) });
        }
        x = nextX;
        y = nextY;
      }
    }
    const along = (s: Segment, t: number) =>
      new DOMPoint(s.a.x + (s.b.x - s.a.x) * t, s.a.y + (s.b.y - s.a.y) * t);
    const dir = (s: Segment) => ({ x: (s.b.x - s.a.x) / s.length, y: (s.b.y - s.a.y) / s.length });
    // (a) Nothing may run along the tank outline; port stubs must meet it perpendicularly.
    let parallelMax = 0,
      nearestLane = Infinity;
    const stubs: { id: string; length: number; angle: number }[] = [];
    for (const s of segments) {
      const d = dir(s);
      const isStub = [s.a, s.b].some((p) => nearest(p).d <= 1.5 * scale);
      if (isStub) {
        const port = nearest(nearest(s.a).d < nearest(s.b).d ? s.a : s.b).o;
        const angle =
          (Math.acos(Math.min(1, Math.abs(d.x * port.tx + d.y * port.ty))) * 180) / Math.PI;
        stubs.push({ id: s.id, length: s.length, angle });
        if (angle < 70) errors.push(`${s.id}: port stub not perpendicular (${angle.toFixed(0)}°)`);
        continue;
      }
      let run = 0;
      const steps = Math.max(1, Math.ceil(s.length));
      for (let i = 0; i <= steps; i++) {
        const p = along(s, i / steps);
        const n = nearest(p);
        const edge = n.d - s.half - n.o.half;
        const parallel = Math.abs(d.x * n.o.tx + d.y * n.o.ty) > Math.cos((20 * Math.PI) / 180);
        if (parallel) nearestLane = Math.min(nearestLane, edge);
        if (parallel && edge < 20) run += s.length / steps;
      }
      parallelMax = Math.max(parallelMax, run);
      if (run > 24) errors.push(`${s.id}: runs along the tank outline for ${run.toFixed(1)} px`);
    }
    // (b) Parallel pipes keep a clear gap of 12 px wherever they run side by side for 30 px.
    let parallelGap = Infinity;
    for (const [i, s] of segments.entries())
      for (const t of segments.slice(i + 1)) {
        const ds = dir(s),
          dt = dir(t);
        if (Math.abs(ds.x * dt.y - ds.y * dt.x) > Math.sin((10 * Math.PI) / 180)) continue;
        const proj = (p: DOMPoint) => (p.x - s.a.x) * ds.x + (p.y - s.a.y) * ds.y;
        const lo = Math.max(0, Math.min(proj(t.a), proj(t.b))),
          hi = Math.min(s.length, Math.max(proj(t.a), proj(t.b)));
        if (hi - lo <= 30) continue;
        const gap = Math.abs((t.a.x - s.a.x) * ds.y - (t.a.y - s.a.y) * ds.x) - s.half - t.half;
        parallelGap = Math.min(parallelGap, gap);
        if (gap < 12) errors.push(`${s.id}/${t.id}: parallel gap ${gap.toFixed(1)} px`);
      }
    // (c) Buffer circuits stay outside the tank body; DHW nozzles cross the buffer straight.
    const inside: Record<string, number> = {};
    for (const path of paths) {
      const id = path.closest('[data-pipe-id]')!.getAttribute('data-pipe-id')!;
      if (id.startsWith('solar-')) continue;
      const m = path.getScreenCTM()!,
        length = path.getTotalLength();
      const xs: number[] = [];
      let run = 0;
      for (let n = 0; n <= length; n += 0.5) {
        const p = path.getPointAtLength(n);
        const s = new DOMPoint(p.x, p.y).matrixTransform(m);
        if (!inBuffer(s) || inVessel(s)) continue;
        run += 0.5 * scale;
        xs.push(s.x);
      }
      inside[id] = run;
      const nozzle = ['cold-water', 'dhw-draw'].includes(id);
      if (!nozzle && run > 0)
        errors.push(`${id}: drawn inside the tank body (${run.toFixed(1)} px)`);
      if (nozzle && xs.length && Math.max(...xs) - Math.min(...xs) > 0.5)
        errors.push(`${id}: DHW nozzle must cross the buffer as one straight riser`);
    }
    // (d) No crossings at all; junction endpoints do not count.
    const crossings: string[] = [];
    let nearTank = 0;
    for (const [i, s] of segments.entries())
      for (const t of segments.slice(i + 1)) {
        if (s.id === t.id) continue;
        const den = (s.b.x - s.a.x) * (t.b.y - t.a.y) - (s.b.y - s.a.y) * (t.b.x - t.a.x);
        if (Math.abs(den) < 1e-9) continue;
        const u = ((t.a.x - s.a.x) * (t.b.y - t.a.y) - (t.a.y - s.a.y) * (t.b.x - t.a.x)) / den;
        const v = ((t.a.x - s.a.x) * (s.b.y - s.a.y) - (t.a.y - s.a.y) * (s.b.x - s.a.x)) / den;
        if (u <= 0 || u >= 1 || v <= 0 || v >= 1) continue;
        const p = along(s, u);
        if ([s.a, s.b].some((e) => [t.a, t.b].some((f) => Math.hypot(e.x - f.x, e.y - f.y) < 1)))
          continue;
        crossings.push(`${s.id}/${t.id}`);
        const dx = Math.max(0, tankBox.left - p.x, p.x - tankBox.right),
          dy = Math.max(0, tankBox.top - p.y, p.y - tankBox.bottom);
        if (Math.hypot(dx, dy) <= 40) nearTank++;
      }
    if (crossings.length) errors.push(`pipe crossings: ${crossings.join(', ')}`);
    // Left: flow and return keep separate vertical lanes; the charging pump sits on the blue one.
    const vertical = (id: string) =>
      segments
        .filter((s) => s.id === id && Math.abs(s.a.x - s.b.x) < 0.5)
        .sort((a, b) => b.length - a.length)[0]!;
    const red = vertical('tank-inlet'),
      blue = vertical('tank-return');
    const laneGap = Math.abs(red.a.x - blue.a.x) - red.half - blue.half;
    if (laneGap < 14) errors.push(`charging lanes ${laneGap.toFixed(1)} px apart`);
    const pump = new DOMPoint(0, 0).matrixTransform(
      el.querySelector<SVGGraphicsElement>('[data-pump="charge"]')!.getScreenCTM()!,
    );
    const top = Math.min(blue.a.y, blue.b.y),
      bottom = Math.max(blue.a.y, blue.b.y);
    if (Math.abs(pump.x - blue.a.x) > 0.5 || pump.y <= top || pump.y >= bottom)
      errors.push('charging pump must sit on the blue lane');
    for (const [id, end] of [
      ['tank-inlet', true],
      ['tank-return', false],
      ['house-tank-return', true],
      ['dhw-inlet', true],
    ] as const) {
      const own = segments.filter((s) => s.id === id);
      const s = end ? own.at(-1)! : own[0]!;
      if (Math.abs(s.a.y - s.b.y) > 0.5) errors.push(`${id}: must meet the wall horizontally`);
    }
    return {
      errors,
      parallelMax,
      nearestLane,
      parallelGap,
      inside,
      crossings: crossings.length,
      nearTank,
      laneGap,
      stubs,
    };
  }
  const routing = pipeRouting(el);
  onRouting?.(routing);
  for (const issue of routing.errors) errors.push(issue);
  const luminance = (color: string) => {
    const rgb = color
      .match(/[\d.]+/g)!
      .slice(0, 3)
      .map(Number)
      .map((v) => {
        const c = v / 255;
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
    return rgb[0]! * 0.2126 + rgb[1]! * 0.7152 + rgb[2]! * 0.0722;
  };
  for (const marker of Array.from(el.querySelectorAll<SVGGraphicsElement>('.ht-c3-direction'))) {
    const route = marker.closest('[data-pipe-id]')!;
    const a = luminance(getComputedStyle(marker.querySelector('path')!).stroke);
    const b = luminance(getComputedStyle(route.querySelector(':scope > path')!).stroke);
    if ((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) < 3)
      errors.push(`${route.getAttribute('data-pipe-id')}: chevron contrast`);
  }
  if (el.closest('[data-theme="light"]'))
    for (const text of labels) {
      const id = text.dataset.label!;
      if (cards.includes(id)) continue;
      const bg = getComputedStyle(
        q(
          id === 'tank-title'
            ? '.ht-c3-title-bg'
            : ['collector', 'cold-water'].includes(id)
              ? '.ht-c3-topsoil'
              : '.ht-c3-interior',
        ),
      );
      const b = luminance(['collector', 'cold-water'].includes(id) ? bg.stroke : bg.fill);
      for (const node of [text, ...Array.from(text.querySelectorAll('tspan'))]) {
        const a = luminance(getComputedStyle(node).fill);
        if ((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) < 4.5)
          errors.push(`${id}: light contrast`);
      }
    }
  return [...new Set(errors)];
}

/** Refs #82 – solar loop geometry on the painted schematic (client coordinates). */
export function solarRenderedGeometry(el: HTMLElement) {
  const svg = el.querySelector('svg')!;
  const panel = el.querySelector('[data-testid="heating-sch-solar-panel"]');
  const coil = el.querySelector('[data-testid="heating-sch-solar-coil"]');
  const solarPump = el.querySelector('[data-pump="solar"]');
  if (!panel || !coil || !solarPump) {
    return { configured: false as const, overlaps: [] as string[] };
  }
  const overlaps: string[] = [];
  const box = (node: Element) => node.getBoundingClientRect();
  const intersects = (a: DOMRect, b: DOMRect, margin = 0.1) =>
    Math.min(a.right, b.right) - Math.max(a.left, b.left) > margin &&
    Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > margin;

  const textEls = Array.from(svg.querySelectorAll<SVGTextElement>('text[data-label]')).filter(
    (t) => t.getBoundingClientRect().width > 0,
  );
  for (let i = 0; i < textEls.length; i++) {
    for (let j = i + 1; j < textEls.length; j++) {
      if (intersects(box(textEls[i]!), box(textEls[j]!)))
        overlaps.push(`label:${textEls[i]!.dataset.label}/${textEls[j]!.dataset.label}`);
    }
  }
  const partBox = (part: Element) =>
    (part.querySelector<SVGGraphicsElement>('rect, path') ?? part).getBoundingClientRect();
  const solarCollectorLabel = textEls.find((t) => t.dataset.label === 'solar-collector');
  const solarParts = [
    { el: panel, key: 'heating-sch-solar-panel' },
    { el: coil, key: 'heating-sch-solar-coil' },
    { el: solarPump, key: 'solar' },
  ];
  for (const text of textEls) {
    if (text === solarCollectorLabel) continue;
    const tb = box(text);
    for (const part of solarParts) {
      if (intersects(tb, partBox(part.el), 2))
        overlaps.push(`label-icon:${text.dataset.label}/${part.key}`);
    }
  }

  const parseSegments = (path: SVGPathElement) => {
    const m = path.getScreenCTM()!;
    const segments: DOMRect[] = [];
    let x = 0;
    let y = 0;
    for (const command of path.getAttribute('d')!.matchAll(/([MHVL])([^MHVL]+)/g)) {
      const values = command[2]!.trim().split(/[ ,]+/).map(Number);
      const nextX = command[1] === 'V' ? x : (values.at(-2) ?? values[0]!);
      const nextY = command[1] === 'H' ? y : values.at(-1)!;
      if (['H', 'V', 'L'].includes(command[1]!)) {
        const a = new DOMPoint(x, y).matrixTransform(m);
        const b = new DOMPoint(nextX, nextY).matrixTransform(m);
        const left = Math.min(a.x, b.x) - 1;
        const right = Math.max(a.x, b.x) + 1;
        const top = Math.min(a.y, b.y) - 1;
        const bottom = Math.max(a.y, b.y) + 1;
        segments.push(new DOMRect(left, top, right - left, bottom - top));
      }
      x = nextX;
      y = nextY;
    }
    return segments;
  };

  for (const id of ['solar-supply', 'solar-return'] as const) {
    const path = el.querySelector(`[data-pipe-id="${id}"] path`) as SVGPathElement | null;
    if (!path) continue;
    for (const seg of parseSegments(path)) {
      for (const text of textEls) {
        if (intersects(seg, box(text))) overlaps.push(`pipe:${id}/${text.dataset.label}`);
      }
    }
  }

  const envelope = svg.querySelector('.ht-c3-envelope') as SVGGeometryElement;
  const shell = el.querySelector('.ht-c3-shell') as SVGGeometryElement;
  const atticTop = shell.getBoundingClientRect().top;
  const panelShape = panel.querySelector('rect')!;
  const panelBox = panelShape.getBoundingClientRect();
  const envInv = envelope.getScreenCTM()!.inverse();
  const panelCenter = new DOMPoint(
    (panelBox.left + panelBox.right) / 2,
    (panelBox.top + panelBox.bottom) / 2,
  );
  const collectorInHouse = envelope.isPointInFill(panelCenter.matrixTransform(envInv));
  const collectorInRoof =
    collectorInHouse &&
    panelBox.bottom <= atticTop + 6 &&
    panelBox.top >= svg.getBoundingClientRect().top + 4;

  const tank = el.querySelector('[data-floor="tank"]')!.getBoundingClientRect();
  const coilBox = box(coil);
  const coilInLower =
    coilBox.top >= tank.top + tank.height * 0.6 - 2 && coilBox.bottom <= tank.bottom + 2;
  const badge = el.querySelector('[data-tank-card]')!.getBoundingClientRect();
  const badgeCoilOverlap = intersects(badge, coilBox);

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

/** Off state: HP flow/return labels must not overlap the tank shell. */
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

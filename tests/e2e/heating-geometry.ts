/** Rendered guards: allow route redesigns while keeping readable, attached labels. */
export function schematicGeometry(el: HTMLElement | SVGElement) {
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
  };
  const icons = Array.from(
    el.querySelectorAll<SVGGraphicsElement>(
      '[data-pump], .ht-c3-valve, .ht-c3-radiator, .ht-c3-tap, .ht-c3-cabinet',
    ),
  ).map(body);
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
    if (/℃|(?<!\u202f)°C/u.test(text.textContent!)) errors.push(`${id}: temperature unit`);
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
  if (el.querySelectorAll('.ht-c3-direction').length !== 11)
    errors.push('missing static flow directions');
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
      local.x <= 344 &&
      local.y >= 9 + (Math.abs(local.x - 172) * 75) / 176 &&
      local.y <= 490
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
    if (local.x > 64 && local.y < 510) errors.push('collector: loop above soil');
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
  ] as const) {
    const pump = q(`[data-pump="${pumpId}"]`);
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
  if (
    pill.left < shell.left ||
    pill.right > shell.right ||
    pill.top < shell.top ||
    pill.bottom > shell.bottom
  )
    errors.push('tank title pill outside tank');
  if ([...outlines, ...pipes.map((pipe) => pipe.sample)].some((line) => pathGap(pill, line) < 6))
    errors.push('tank title pill line clearance');
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

import type { DetailSchematicModel, SchematicLabel, SchematicPipe } from './types.js';

export type GeometryFailCode =
  | 'pipe-intersection'
  | 'pipe-body'
  | 'endpoint'
  | 'device-off-pipe'
  | 'non-orthogonal'
  | 'parallel-spacing'
  | 'label-label'
  | 'undeclared-bridge';

export interface GeometryFail {
  code: GeometryFailCode;
  id: string;
}

function distanceToPolyline(x: number, y: number, points: [number, number][]): number {
  let best = Infinity;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const t = Math.max(
      0,
      Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy || 1)),
    );
    best = Math.min(best, Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy));
  }
  return best;
}

function parseSegments(
  d: string,
  pipe: SchematicPipe,
): Array<{ a: [number, number]; b: [number, number] }> {
  const segs: Array<{ a: [number, number]; b: [number, number] }> = [];
  const tokens = [...d.matchAll(/([MLQ])([^MLQ]+)/g)];
  let prev: [number, number] | null = null;
  for (const m of tokens) {
    const nums = m[2]!.trim().split(/[ ,]+/).map(Number);
    if (m[1] === 'Q') {
      if (!pipe.bridges?.length) return segs;
      prev = [nums[nums.length - 2]!, nums[nums.length - 1]!];
      continue;
    }
    const v: [number, number] = [nums[0]!, nums[1]!];
    if (m[1] === 'L' && prev) {
      if (Math.abs(v[0] - prev[0]) > 0.01 && Math.abs(v[1] - prev[1]) > 0.01) {
        throw new Error(`non-orthogonal:${pipe.id}`);
      }
      segs.push({ a: prev, b: v });
    }
    prev = v;
  }
  return segs;
}

function portsShare(
  startA: string,
  endA: string,
  startB: string,
  endB: string,
  ports: DetailSchematicModel['ports'],
) {
  const endsA = [startA, endA];
  const endsB = [startB, endB];
  return endsA.some((x) =>
    endsB.some((y) => Math.hypot(ports[x]!.x - ports[y]!.x, ports[x]!.y - ports[y]!.y) < 0.1),
  );
}

/** Preferred anchors may move during measured packing; rendered bboxes are audited in e2e. */
function approxChipBox(label: SchematicLabel): {
  left: number;
  right: number;
  top: number;
  bottom: number;
} {
  return {
    left: label.x - 85,
    right: label.x + 85,
    top: label.y - 26,
    bottom: label.y + 26,
  };
}

export function auditSchematicGeometry(model: DetailSchematicModel): GeometryFail[] {
  const fails: GeometryFail[] = [];
  const fail = (code: GeometryFailCode, id: string) => fails.push({ code, id });

  const segs: Array<{ p: string; a: [number, number]; b: [number, number] }> = [];
  for (const p of model.pipes) {
    try {
      for (const { a, b } of parseSegments(p.d, p)) segs.push({ p: p.id, a, b });
    } catch {
      fail('non-orthogonal', p.id);
    }
    if (p.d.includes('Q') && !p.bridges?.length) fail('undeclared-bridge', p.id);
    // Building envelopes and flat glyph bounds contain empty space. Check solid bodies only.
    for (const body of model.bodies.filter((b) =>
      ['tank', 'hp', 'radiator', 'fish', 'pool', 'pool-exch'].includes(b.id),
    )) {
      for (let i = 1; i < p.points.length; i++) {
        const a = p.points[i - 1]!;
        const b = p.points[i]!;
        const horizontal = a[1] === b[1];
        const vertical = a[0] === b[0];
        const inside = horizontal
          ? a[1] > body.y + 0.1 &&
            a[1] < body.y + body.h - 0.1 &&
            Math.max(Math.min(a[0], b[0]), body.x + 0.1) <
              Math.min(Math.max(a[0], b[0]), body.x + body.w - 0.1)
          : vertical &&
            a[0] > body.x + 0.1 &&
            a[0] < body.x + body.w - 0.1 &&
            Math.max(Math.min(a[1], b[1]), body.y + 0.1) <
              Math.min(Math.max(a[1], b[1]), body.y + body.h - 0.1);
        if (inside) fail('pipe-body', `${p.id}/${body.id}`);
      }
    }
    for (const key of ['start', 'end'] as const) {
      const port = model.ports[p[key]];
      const pt = key === 'start' ? p.points[0]! : p.points.at(-1)!;
      if (!port || Math.hypot(port.x - pt[0], port.y - pt[1]) > 1)
        fail('endpoint', `${p.id}:${key}`);
    }
  }

  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      const a = segs[i]!;
      const b = segs[j]!;
      const ah = Math.abs(a.a[1] - a.b[1]) < 0.01;
      const bh = Math.abs(b.a[1] - b.b[1]) < 0.01;
      if (ah !== bh) continue;
      const c = ah ? 1 : 0;
      const k = 1 - c;
      const overlap =
        Math.min(Math.max(a.a[k]!, a.b[k]!), Math.max(b.a[k]!, b.b[k]!)) -
        Math.max(Math.min(a.a[k]!, a.b[k]!), Math.min(b.a[k]!, b.b[k]!));
      const gap = Math.abs(a.a[c] - b.a[c]);
      if (
        overlap > 1 &&
        gap < 12 - 0.01 &&
        !(gap < 0.01 && a.p === b.p) &&
        !portsShare(
          model.pipes.find((p) => p.id === a.p)!.start,
          model.pipes.find((p) => p.id === a.p)!.end,
          model.pipes.find((p) => p.id === b.p)!.start,
          model.pipes.find((p) => p.id === b.p)!.end,
          model.ports,
        )
      ) {
        fail('parallel-spacing', `${a.p}/${b.p}:${gap.toFixed(2)}`);
      }
    }
  }

  for (let i = 0; i < model.pipes.length; i++) {
    const a = model.pipes[i]!;
    for (const b of model.pipes.slice(i + 1)) {
      for (let j = 1; j < a.points.length; j++)
        for (let k = 1; k < b.points.length; k++) {
          const p = a.points[j - 1]!,
            q = a.points[j]!;
          const r = b.points[k - 1]!,
            t = b.points[k]!;
          const ah = p[1] === q[1],
            bh = r[1] === t[1];
          if (ah === bh) {
            const axis = ah ? 0 : 1,
              fixed = 1 - axis;
            if (p[fixed] === r[fixed]) {
              const overlap =
                Math.min(Math.max(p[axis]!, q[axis]!), Math.max(r[axis]!, t[axis]!)) -
                Math.max(Math.min(p[axis]!, q[axis]!), Math.min(r[axis]!, t[axis]!));
              if (overlap > 0.01) fail('pipe-intersection', `${a.id}/${b.id}:overlap`);
            }
            continue;
          }
          const h0 = ah ? p : r,
            h1 = ah ? q : t;
          const v0 = ah ? r : p,
            v1 = ah ? t : q;
          const x = v0[0],
            y = h0[1];
          if (
            x < Math.min(h0[0], h1[0]) ||
            x > Math.max(h0[0], h1[0]) ||
            y < Math.min(v0[1], v1[1]) ||
            y > Math.max(v0[1], v1[1])
          )
            continue;
          // A permitted connection must be the very same declared component port,
          // not just two routes that happen to share some other endpoint.
          const ownersAt = (pipe: SchematicPipe) =>
            [pipe.start, pipe.end].flatMap((id) => {
              const port = model.ports[id]!;
              return Math.abs(port.x - x) < 0.01 && Math.abs(port.y - y) < 0.01 ? [port.owner] : [];
            });
          if (!ownersAt(a).some((owner) => ownersAt(b).includes(owner)))
            fail('pipe-intersection', `${a.id}/${b.id}@${x},${y}`);
        }
    }
  }

  for (const d of model.devices) {
    const pipe = model.pipes.find((p) => p.id === d.pipe);
    if (!pipe || distanceToPolyline(d.x, d.y, pipe.points) > 1) fail('device-off-pipe', d.id);
  }

  const tier0 = model.labels.filter((l) => l.tier < 2);
  for (let i = 0; i < tier0.length; i++) {
    for (let j = i + 1; j < tier0.length; j++) {
      const a = approxChipBox(tier0[i]!);
      const b = approxChipBox(tier0[j]!);
      if (a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top) {
        fail('label-label', `${tier0[i]!.id}/${tier0[j]!.id}`);
      }
    }
  }

  return fails;
}

export function mutateModel(
  model: DetailSchematicModel,
  kind: GeometryFailCode,
): DetailSchematicModel {
  const m = structuredClone(model);
  if (kind === 'pipe-intersection') {
    m.pipes[0]!.points.push([0, 500], [600, 500]);
  }
  if (kind === 'pipe-body') {
    const p = m.pipes.find((p) => p.id === 'tank-charge')!;
    const tank = m.bodies.find((b) => b.id === 'tank')!;
    p.points.splice(1, 0, [tank.x + 70, 420]);
  }
  if (kind === 'undeclared-bridge') {
    const p = m.pipes[0]!;
    p.d += 'Q1 2 3 4';
    p.bridges = [];
  }
  if (kind === 'endpoint') {
    const p = m.pipes.find((x) => x.id === 'hp-supply');
    if (p) p.points[0] = [140, 740];
    m.pipes = m.pipes.map((pipe) =>
      pipe.id === 'hp-supply' ? { ...p!, d: 'M140 740L-20 760L-20 550L300 550' } : pipe,
    );
  }
  if (kind === 'device-off-pipe') {
    const d = m.devices.find((x) => x.id === 'Nabíjení');
    if (d) d.x = 280;
  }
  if (kind === 'non-orthogonal') {
    const p = m.pipes.find((x) => x.id === 'tank-charge');
    if (p) {
      p.points = [
        [300, 550],
        [360, 565],
        [430, 550],
      ];
      p.d = 'M300 550L360 565L430 550';
    }
  }
  if (kind === 'parallel-spacing') {
    const p = m.pipes.find((x) => x.id === 'solar-return')!;
    const other = m.pipes.find((x) => x.id === 'solar-supply')!;
    p.points = other.points.map(([x, y]) => [x + 5, y]);
    p.d = p.points.map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y}`).join('');
  }
  if (kind === 'label-label') {
    const l = m.labels.find((x) => x.id === 'pool');
    const o = m.labels.find((x) => x.id === 'fish');
    if (l && o) {
      l.x = o.x;
      l.y = o.y;
    }
  }
  return m;
}

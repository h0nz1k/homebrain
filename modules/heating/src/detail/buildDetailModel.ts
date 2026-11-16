import { SCHEMATIC_MODEL_BASE } from './schematicModelBase.js';
import { computeBridges } from './pipePath.js';
import type {
  DetailLayoutParams,
  DetailSchematicModel,
  SchematicBody,
  SchematicPipe,
} from './types.js';

const DEFAULT_LAYOUT: DetailLayoutParams = {
  poolHallAttached: true,
  poolHallX: 800,
  floorBranchY: 790,
};

function cloneBase(): DetailSchematicModel {
  const b = SCHEMATIC_MODEL_BASE;
  return {
    architectures: b.architectures.map((a) => ({
      ...a,
      evidence: 'evidence' in a && a.evidence ? [...a.evidence] : undefined,
    })),
    circuitLegend: { ...b.circuitLegend },
    bounds: { ...b.bounds },
    ports: Object.fromEntries(Object.entries(b.ports).map(([k, v]) => [k, { ...v }])),
    pipes: b.pipes.map((p) => ({
      ...p,
      states: [...p.states],
      points: p.points.map((pt) => [...pt] as [number, number]),
      bridges:
        'bridges' in p && p.bridges
          ? p.bridges.map((br) => [...br] as [number, number])
          : undefined,
    })),
    bodies: b.bodies.map((x) => {
      const { id, bx, by, bw, bh } = {
        id: x.id,
        bx: x.x,
        by: x.y,
        bw: x.w,
        bh: x.h,
      };
      const body: SchematicBody = { id, x: bx, y: by, w: bw, h: bh };
      if ('polygon' in x && x.polygon) {
        body.polygon = x.polygon.map((pt) => [pt[0], pt[1]] as [number, number]);
      }
      return body;
    }),
    devices: b.devices.map((d) => ({ ...d })),
    labels: b.labels.map((l) => ({ ...l, anchor: [...l.anchor] as [number, number] })),
    regions: Object.fromEntries(
      Object.entries(b.regions).map(([k, v]) => [k, [...v] as [number, number]]),
    ),
    layout: { ...DEFAULT_LAYOUT },
    focusBoxes: {
      tank: { x: 410, y: 275, w: 260, h: 740 },
      hp: { x: -5, y: 385, w: 425, h: 610 },
      pool: { x: 745, y: 555, w: 360, h: 500 },
    },
  };
}

function upsertPipe(model: DetailSchematicModel, pipe: SchematicPipe) {
  const i = model.pipes.findIndex((p) => p.id === pipe.id);
  if (i >= 0) model.pipes[i] = pipe;
  else model.pipes.push(pipe);
}

function upsertBody(model: DetailSchematicModel, body: SchematicBody) {
  const i = model.bodies.findIndex((b) => b.id === body.id);
  if (i >= 0) model.bodies[i] = body;
  else model.bodies.push(body);
}

/** Owner-facing assumptions documented in design-notes.md; tunable via layout params. */
export function buildDetailSchematicModel(
  layout: Partial<DetailLayoutParams> = {},
): DetailSchematicModel {
  const model = cloneBase();
  model.layout = { ...DEFAULT_LAYOUT, ...layout };
  const branchY = model.layout.floorBranchY;

  model.architectures.push({
    id: 'pool-hall',
    kind: 'heated-building',
    label: 'Bazén',
    evidence: ['owner-2026-11-15-floor-heat'],
  });

  // Preserve r3's tank, house, rybárna and risers. The hall occupies the pool region.
  const port = (id: string, x: number, y: number, owner: string) => {
    model.ports[id] = { x, y, owner };
  };
  const route = (
    id: string,
    start: string,
    end: string,
    via: [number, number][],
    kind: SchematicPipe['kind'],
    states = [4],
  ) => {
    const a = model.ports[start]!;
    const b = model.ports[end]!;
    upsertPipe(model, {
      id,
      start,
      end,
      points: [[a.x, a.y], ...via, [b.x, b.y]],
      kind,
      states,
      d: '',
    });
  };
  port('pool.exch.in', 830, 718, 'pool-exch');
  port('pool.exch.out', 830, 754, 'pool-exch');
  port('pool.exch.waterin', 866, 754, 'pool-exch');
  port('pool.exch.waterout', 866, 718, 'pool-exch');
  port('pool.waterin', 925, 718, 'pool');
  port('pool.waterout', 925, 754, 'pool');
  port('pool.filterin', 1050, 754, 'pool');
  port('pool.filterout', 1050, 718, 'pool');
  port('floor.in', 810, branchY, 'floor');
  port('floor.out', 1060, branchY, 'floor');
  route('pool-supply', 'tank.pool', 'pool.exch.in', [], 'pool');
  route('pool-return', 'pool.exch.out', 'tank.poolret', [], 'pool');
  route('pool-exchange-supply', 'pool.exch.waterout', 'pool.waterin', [], 'pool');
  route(
    'pool-exchange-return',
    'pool.waterout',
    'pool.exch.waterin',
    [
      [890, 754],
      [890, 778],
      [866, 778],
    ],
    'pool',
  );
  route(
    'pool-water',
    'pool.filterout',
    'pool.filterin',
    [
      [1080, 718],
      [1080, 778],
      [1050, 778],
    ],
    'pool',
  );
  route(
    'pool-floor-supply',
    'fish.branch',
    'floor.in',
    [
      [769, 500],
      [769, branchY],
    ],
    'hot',
    [3, 4],
  );
  route(
    'pool-floor-return',
    'floor.out',
    'heat.junction',
    [
      [1076, branchY],
      [1076, 890],
      [700, 890],
      [700, 625],
    ],
    'cold',
    [3, 4],
  );
  route(
    'pool-floor-loop',
    'floor.in',
    'floor.out',
    [
      [810, branchY + 18],
      [1040, branchY + 18],
      [1040, branchY + 36],
      [810, branchY + 36],
      [810, branchY + 54],
      [1060, branchY + 54],
    ],
    'hot',
    [3, 4],
  );
  upsertBody(model, { id: 'pool-hall', x: 800, y: 645, w: 290, h: 225 });
  upsertBody(model, { id: 'pool', x: 925, y: 700, w: 125, h: 70 });
  upsertBody(model, { id: 'pool-exch', x: 830, y: 706, w: 36, h: 60 });

  // Titles always carry existing values; the floor loop has no dedicated sensor.
  const place = (id: string, x: number, y: number, anchor?: [number, number]) => {
    const label = model.labels.find((l) => l.id === id)!;
    Object.assign(label, { x, y, ...(anchor ? { anchor } : {}) });
  };
  place('pool', 985, 655, [985, 700]);
  place('fish', 915, 930, [915, 1000]);
  place('heat', 925, 430, [890, 500]);
  place('charge', 160, 1000, [240, 855]);
  place('ground', 360, 1230, [330, 1170]);
  place('cold-water', 540, 1085, [580, 1080]);
  place('solar-pump', 980, 1150, [965, 1070]);
  place('mix', 790, 350, [725, 500]);
  model.regions.pool = [950, 750];
  model.devices = model.devices.map((d) => {
    if (d.id === 'Natápění bazénu') return { ...d, x: 710, y: 718, pipe: 'pool-supply' };
    if (d.id === 'Filtrace') return { ...d, x: 1080, y: 750, pipe: 'pool-water' };
    return d;
  });
  // Keep the hall and the second building visibly separate.
  for (const key of ['fish.in', 'fish.out']) model.ports[key]!.y += 80;
  for (const pipe of model.pipes) {
    if (pipe.id === 'fish-supply' || pipe.id === 'fish-return') {
      pipe.points = pipe.points.map(([x, y]) => [x, y >= 900 ? y + 80 : y]);
    }
    if (pipe.id === 'solar-supply' || pipe.id === 'solar-return') {
      pipe.points = pipe.points.map(([x, y]) => [x, y === 1040 || y === 1070 ? y + 80 : y]);
    }
  }
  model.devices = model.devices.map((d) =>
    d.id === 'Ventil rybárny' || d.id === 'Solár' ? { ...d, y: d.y + 80 } : d,
  );
  const fishBody = model.bodies.find((b) => b.id === 'fish')!;
  fishBody.y += 80;
  place('solar-pump', 980, 1210, [965, 1150]);

  // Bounds include the collector chip and legend, with unchanged r3 building geometry.
  model.bounds = { x: -60, y: 60, w: 1225, h: 1300 };

  const hallOffset = model.layout.poolHallX - 800 + (model.layout.poolHallAttached ? 0 : 360);
  if (hallOffset) {
    for (const p of Object.values(model.ports)) {
      if (p.owner.startsWith('pool') || p.owner === 'floor') p.x += hallOffset;
    }
    for (const pipe of model.pipes) {
      if (pipe.id.startsWith('pool'))
        pipe.points = pipe.points.map(([x, y]) => [x >= 800 ? x + hallOffset : x, y]);
    }
    for (const body of model.bodies) if (body.id.startsWith('pool')) body.x += hallOffset;
    for (const d of model.devices) if (d.id === 'Filtrace') d.x += hallOffset;
    const label = model.labels.find((l) => l.id === 'pool')!;
    label.x += hallOffset;
    label.anchor[0] += hallOffset;
    model.bounds.w += Math.max(0, hallOffset);
    model.focusBoxes.pool!.x += hallOffset;
  }
  model.pipes = computeBridges(model.pipes);
  return model;
}

export const DETAIL_SCHEMATIC_MODEL = buildDetailSchematicModel();

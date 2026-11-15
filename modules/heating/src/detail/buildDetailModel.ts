import { SCHEMATIC_MODEL_BASE } from './schematicModelBase.js';
import { computeBridges } from './pipePath.js';
import type {
  DetailLayoutParams,
  DetailSchematicModel,
  SchematicBody,
  SchematicLabel,
  SchematicPipe,
} from './types.js';

const DEFAULT_LAYOUT: DetailLayoutParams = {
  poolHallAttached: true,
  floorBranchY: 842,
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
      bridges: 'bridges' in p && p.bridges ? p.bridges.map((br) => [...br] as [number, number]) : undefined,
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
    regions: Object.fromEntries(Object.entries(b.regions).map(([k, v]) => [k, [...v] as [number, number]])),
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

  // Reroute pool supply/return below house heating risers (y ≈ 500–625).
  upsertPipe(model, {
    id: 'pool-supply',
    start: 'tank.pool',
    end: 'pool.exch.in',
    points: [
      [649.6, 718],
      [720, 718],
      [720, branchY],
      [880, branchY],
      [880, 700],
    ],
    kind: 'pool',
    states: [4],
    d: '',
  });
  upsertPipe(model, {
    id: 'pool-return',
    start: 'pool.exch.out',
    end: 'tank.poolret',
    points: [
      [880, 728],
      [908, 728],
      [908, branchY + 36],
      [662, branchY + 36],
      [662, 754],
      [649.6, 754],
    ],
    kind: 'pool',
    states: [4],
    d: '',
  });

  const floorY = branchY - 40;
  model.ports['pool.exch.in'] = { x: 880, y: 700, owner: 'pool-exch' };
  model.ports['pool.exch.out'] = { x: 880, y: 728, owner: 'pool-exch' };
  model.ports['pool.waterin'] = { x: 1020, y: 748, owner: 'pool' };
  model.ports['pool.waterout'] = { x: 1020, y: 718, owner: 'pool' };
  model.ports['floor.branch'] = { x: 692, y: floorY, owner: 'junction' };
  model.ports['floor.in'] = { x: 780, y: 820, owner: 'pool-hall' };
  model.ports['floor.out'] = { x: 1040, y: 820, owner: 'pool-hall' };

  upsertPipe(model, {
    id: 'pool-floor-supply',
    start: 'floor.branch',
    end: 'floor.in',
    points: [
      [692, floorY],
      [780, floorY],
      [780, 820],
    ],
    kind: 'hot',
    states: [3, 4],
    d: '',
  });
  upsertPipe(model, {
    id: 'pool-water',
    start: 'pool.waterout',
    end: 'pool.waterin',
    points: [
      [1020, 718],
      [1060, 718],
      [1060, 800],
      [1040, 800],
      [1040, 748],
      [1020, 748],
    ],
    kind: 'pool',
    states: [4],
    d: '',
  });
  upsertPipe(model, {
    id: 'pool-floor-return',
    start: 'floor.out',
    end: 'heat.junction',
    points: [
      [1040, 820],
      [1118, 820],
      [1118, 1068],
      [725, 1068],
      [725, 625],
    ],
    kind: 'cold',
    states: [3, 4],
    d: '',
  });

  upsertBody(model, { id: 'pool-hall', x: 760, y: 560, w: 320, h: 280 });
  upsertBody(model, { id: 'pool-basin', x: 820, y: 650, w: 200, h: 120 });
  upsertBody(model, { id: 'pool-exch', x: 860, y: 688, w: 48, h: 56 });

  const pool = model.labels.find((l) => l.id === 'pool');
  if (pool) {
    pool.x = 920;
    pool.y = 640;
    pool.anchor = [920, 690];
    pool.caption = 'Bazén';
  }

  const hallLabel: SchematicLabel = {
    id: 'pool-hall-title',
    x: 920,
    y: 575,
    caption: 'Bazén',
    value: '',
    tier: 0,
    owner: 'pool-hall',
    anchor: [920, 600],
  };
  const floorChip: SchematicLabel = {
    id: 'pool-floor',
    x: 1080,
    y: 800,
    caption: 'Podlahovka haly',
    value: '',
    tier: 1,
    owner: 'pool-hall',
    anchor: [1000, 830],
  };
  const idxHall = model.labels.findIndex((l) => l.id === 'pool-hall-title');
  if (idxHall >= 0) model.labels[idxHall] = hallLabel;
  else model.labels.push(hallLabel);
  const idxFloor = model.labels.findIndex((l) => l.id === 'pool-floor');
  if (idxFloor >= 0) model.labels[idxFloor] = floorChip;
  else model.labels.push(floorChip);

  model.regions.pool = [920, 700];
  model.devices = model.devices.map((d) => {
    if (d.id === 'Natápění bazénu') return { ...d, x: 740, y: branchY, pipe: 'pool-supply' };
    if (d.id === 'Filtrace') return { ...d, x: 1060, y: 780, pipe: 'pool-water' };
    return d;
  });

  model.bounds = { x: -60, y: 60, w: 1225, h: 1140 };
  model.pipes = computeBridges(model.pipes);
  return model;
}

export const DETAIL_SCHEMATIC_MODEL = buildDetailSchematicModel();
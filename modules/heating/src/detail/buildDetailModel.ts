import { buildPipePath } from './pipePath.js';
import type { DetailLayoutParams, DetailSchematicModel, SchematicPipe } from './types.js';

/** Two arrangements share the same hydraulic graph; buildings stay distinct in both. */
export function buildDetailSchematicModel(
  layout: Partial<DetailLayoutParams> = {},
  wide = false,
): DetailSchematicModel {
  const tank = { x: 400, y: 240, w: 140, h: 420 };
  const hp = { x: 760, y: 410, w: 100, h: 130 };
  const rad = { x: 760, y: 270, w: 120, h: 65 };
  const fish = { x: 1120, y: 270, w: 120, h: 65 };
  const hallX = layout.poolHallX ?? 20;
  const hallY = wide ? 850 : 950;
  const branchY = layout.floorBranchY ?? hallY - 55;
  const floorY = hallY + 220;
  const pool = { x: hallX + 760, y: hallY + 125, w: 180, h: 65 };
  const exch = { x: hallX + 640, y: hallY + 125, w: 36, h: 60 };
  const houseW = 1060;
  const groundY = 730;
  const model: DetailSchematicModel = {
    architectures: [
      { id: 'main-house', kind: 'heated-building', label: 'Dům' },
      { id: 'fish-house', kind: 'heated-building', label: 'Rybárna' },
      {
        id: 'pool-hall',
        kind: 'heated-building',
        label: 'Bazén',
        evidence: ['owner-2026-11-16-pool-bottom'],
      },
    ],
    circuitLegend: {},
    ports: {},
    pipes: [],
    devices: [],
    labels: [],
    bodies: [
      { id: 'tank', ...tank },
      { id: 'hp', ...hp },
      { id: 'radiator', ...rad },
      { id: 'fish', ...fish },
      { id: 'pool', ...pool },
      { id: 'pool-exch', ...exch },
      { id: 'main-house', x: 20, y: 150, w: houseW - 20, h: groundY - 150 },
      { id: 'fish-house', x: fish.x - 30, y: fish.y - 80, w: 185, h: 175 },
      { id: 'pool-hall', x: hallX, y: hallY - 35, w: 1000, h: 360 },
    ],
    bounds: { x: 0, y: 0, w: 1300, h: wide ? 1200 : 1300 },
    regions: {},
    layout: { poolHallAttached: false, poolHallX: hallX, floorBranchY: branchY, ...layout },
    focusBoxes: {
      tank: { x: tank.x - 100, y: tank.y - 80, w: 340, h: 570 },
      hp: { x: hp.x - 45, y: hp.y - 100, w: 300, h: 430 },
      pool: { x: hallX - 30, y: hallY - 60, w: 1060, h: 415 },
    },
  };
  const port = (id: string, x: number, y: number, owner: string) => {
    model.ports[id] = { x, y, owner };
  };
  const route = (
    id: string,
    start: string,
    end: string,
    via: [number, number][],
    kind: SchematicPipe['kind'],
  ) => {
    const a = model.ports[start]!;
    const b = model.ports[end]!;
    model.pipes.push({
      id,
      start,
      end,
      points: [[a.x, a.y], ...via, [b.x, b.y]],
      kind,
      states: [1, 2, 3, 4],
      d: '',
    });
  };
  const tx = tank.x;
  const right = tx + tank.w;
  // Each face has a dedicated purpose: solar left, potable top/bottom,
  // heating / heat pump / pool right. Paired lanes are nested, never crossed.
  port('tank.in', right, 420, 'tank');
  port('tank.dhwheat', right, 390, 'tank');
  port('tank.ret', right, 465, 'tank');
  port('tank.draw', tx + 40, 240, 'tank');
  port('tank.water', tx + 80, 660, 'tank');
  for (const [name, y] of [
    ['heat', 300],
    ['heatret', 350],
    ['pool', 540],
    ['poolret', 580],
  ] as const)
    port(`tank.${name}`, right, y, 'tank');
  port('tank.solar', tx, 580, 'tank');
  port('tank.solarret', tx, 610, 'tank');
  port('hp.hot', hp.x, 440, 'hp');
  port('hp.cold', hp.x, 490, 'hp');
  port('hp.gout', hp.x + 100, 440, 'hp');
  port('hp.gin', hp.x + 100, 500, 'hp');
  for (const name of ['in', 'out', 'top']) port(`div.${name}`, 700, 420, 'div');
  route('hp-supply', 'hp.hot', 'div.in', [[700, 440]], 'hot');
  route('tank-charge', 'div.out', 'tank.in', [], 'hot');
  route('dhw-charge', 'div.top', 'tank.dhwheat', [[700, 390]], 'hot');
  route(
    'hp-return',
    'tank.ret',
    'hp.cold',
    [
      [680, 465],
      [680, 490],
    ],
    'cold',
  );
  route(
    'ground-loop',
    'hp.gout',
    'hp.gin',
    [
      [1050, 440],
      [1050, 780],
      [1030, 780],
      [1030, 500],
    ],
    'ground',
  );
  port('tap.in', tx + 40, 155, 'tap');
  route('dhw-draw', 'tank.draw', 'tap.in', [], 'dhw');
  port('mains.out', 200, 740, 'mains');
  route(
    'cold-water',
    'mains.out',
    'tank.water',
    [
      [200, 700],
      [tx + 80, 700],
    ],
    'mains',
  );
  for (const name of ['in', 'out', 'bottom']) port(`mix.${name}`, 580, 300, 'mix');
  port('fish.branch', 620, 300, 'junction');
  port('heat.junction', 580, 350, 'junction');
  port('fish.return', 650, 350, 'junction');
  port('rad.in', rad.x, 285, 'radiator');
  port('rad.out', rad.x + 120, 320, 'radiator');
  route('heat-in', 'tank.heat', 'mix.in', [], 'hot');
  route('heat-supply', 'mix.out', 'fish.branch', [], 'hot');
  route(
    'rad-supply',
    'fish.branch',
    'rad.in',
    [
      [680, 300],
      [680, 285],
    ],
    'hot',
  );
  route(
    'heat-return',
    'rad.out',
    'fish.return',
    [
      [960, 320],
      [960, 350],
    ],
    'cold',
  );
  route('return-branch', 'fish.return', 'heat.junction', [], 'cold');
  route('heat-tank-return', 'heat.junction', 'tank.heatret', [], 'cold');
  route('mix-bypass', 'heat.junction', 'mix.bottom', [], 'cold');
  port('fish.in', fish.x, fish.y + 25, 'fish');
  port('fish.out', fish.x + 120, fish.y + 50, 'fish');
  // The remote radiator has a straight wall entry and its own outer return.
  const fishReturnLane = 1270;
  route(
    'fish-supply',
    'fish.branch',
    'fish.in',
    [
      [620, 250],
      [fish.x - 50, 250],
      [fish.x - 50, fish.y + 25],
    ],
    'hot',
  );
  route(
    'fish-return',
    'fish.out',
    'fish.return',
    [
      [fishReturnLane, fish.y + 50],
      [fishReturnLane, 370],
      [650, 370],
    ],
    'cold',
  );
  port('solar.in', 370, 164, 'solar');
  port('solar.out', 350, 160, 'solar');
  route('solar-supply', 'solar.in', 'tank.solar', [[370, 580]], 'solar');
  route('solar-return', 'tank.solarret', 'solar.out', [[350, 610]], 'solar');
  port('pool.exch.in', exch.x, exch.y + 12, 'pool-exch');
  port('pool.exch.out', exch.x, exch.y + 48, 'pool-exch');
  port('pool.exch.waterout', exch.x + 36, exch.y + 12, 'pool-exch');
  port('pool.exch.waterin', exch.x + 36, exch.y + 48, 'pool-exch');
  port('pool.waterin', pool.x, pool.y + 12, 'pool');
  port('pool.waterout', pool.x, pool.y + 48, 'pool');
  port('pool.filterout', pool.x + 180, pool.y + 12, 'pool');
  port('pool.filterin', pool.x + 180, pool.y + 48, 'pool');
  route(
    'pool-supply',
    'tank.pool',
    'pool.exch.in',
    [
      [580, 540],
      [580, exch.y + 12],
    ],
    'pool',
  );
  route(
    'pool-return',
    'pool.exch.out',
    'tank.poolret',
    [
      [560, exch.y + 48],
      [560, 580],
    ],
    'pool',
  );
  route('pool-exchange-supply', 'pool.exch.waterout', 'pool.waterin', [], 'pool');
  route('pool-exchange-return', 'pool.waterout', 'pool.exch.waterin', [], 'pool');
  route(
    'pool-water',
    'pool.filterout',
    'pool.filterin',
    [
      [pool.x + 210, pool.y + 12],
      [pool.x + 210, pool.y + 48],
    ],
    'pool',
  );
  // Dedicated lower distribution ports feed the hall's heating branch. The
  // return turns into the left wall before the supply enters the floor.
  port('floor.branch.in', tx + 130, 660, 'tank');
  port('floor.branch.out', tx + 110, 660, 'tank');
  port('floor.in', hallX + 430, floorY, 'floor');
  port('floor.out', hallX + 80, floorY + 48, 'floor');
  route('pool-floor-supply', 'floor.branch.in', 'floor.in', [[tx + 130, floorY]], 'hot');
  route(
    'pool-floor-loop',
    'floor.in',
    'floor.out',
    [
      [hallX + 80, floorY],
      [hallX + 80, floorY + 24],
      [hallX + 930, floorY + 24],
      [hallX + 930, floorY + 48],
    ],
    'hot',
  );
  route(
    'pool-floor-return',
    'floor.out',
    'floor.branch.out',
    [
      [hallX + 60, floorY + 48],
      [hallX + 60, branchY],
      [tx + 110, branchY],
    ],
    'cold',
  );
  const device = (
    id: string,
    x: number,
    y: number,
    pipe: string,
    kind: 'pump' | 'valve' = 'pump',
    angle = 0,
  ) => model.devices.push({ id, x, y, pipe, kind, angle });
  device('Přepínání TUV / nádrž', 700, 420, 'hp-supply', 'valve');
  device('Směšování', 580, 300, 'heat-in', 'valve');
  device('Nabíjení', 680, 490, 'hp-return');
  device('Primární okruh', 1030, 680, 'ground-loop', 'pump', 90);
  device('Topení', 920, 350, 'heat-return');
  device('Solár', 350, 550, 'solar-return', 'pump', 90);
  device('Natápění bazénu', 580, hallY + 95, 'pool-supply', 'pump', 90);
  device('Filtrace', pool.x + 210, pool.y + 30, 'pool-water', 'pump', 90);
  device('Ventil rybárny', fish.x - 30, fish.y + 25, 'fish-supply', 'valve');
  const label = (id: string, x: number, y: number, anchor: [number, number], tier: 0 | 1 = 0) =>
    model.labels.push({ id, x, y, anchor, tier, caption: '', value: '', owner: null });
  label('outdoor', 100, 150, [140, 180]);
  label('solar', 280, 65, [360, 139]);
  label('tap', 530, 140, [440, 155]);
  label('tank-title', 160, 300, [400, 280]);
  label('bottom', 160, 600, [400, 650]);
  label('hp', 800, 630, [810, 540]);
  label('heat', 820, 175, [820, 270]);
  label('fish', fish.x + 60, 110, [fish.x + 60, fish.y - 80]);
  label('pool', 820, hallY + 75, [850, pool.y]);
  label('ground', 820, 760, [1040, 780]);
  label('cold-water', 260, 755, [200, 720]);
  label('solar-pump', 160, 480, [350, 550], 1);
  label('div', 650, 270, [700, 420], 1);
  label('charge', 650, 540, [680, 490], 1);
  label('mix', 1060, 520, [580, 300], 1);
  model.bounds.w = Math.max(model.bounds.w, hallX + 1020);
  // Landscape has a shorter building section, leaving room for the hall below.
  // Compress geometry (rather than the SVG) so pumps and text retain their proportions.
  if (wide) {
    const ratio = 0.65;
    for (const p of Object.values(model.ports)) p.y *= ratio;
    for (const p of model.pipes) p.points = p.points.map(([x, y]) => [x, y * ratio]);
    for (const b of model.bodies) {
      b.y *= ratio;
      b.h *= ratio;
    }
    for (const d of model.devices) d.y *= ratio;
    for (const l of model.labels) {
      l.y *= ratio;
      l.anchor[1] *= ratio;
    }
    for (const b of Object.values(model.focusBoxes)) {
      b.y *= ratio;
      b.h *= ratio;
    }
    model.layout.floorBranchY *= ratio;
    model.bounds.h *= ratio;
  }
  if (!wide) {
    // A taller portrait composition uses the same planar graph and tighter
    // horizontal spacing; measured labels retain their CSS pixel minimum.
    const ratio = 0.65;
    for (const p of Object.values(model.ports)) p.x *= ratio;
    for (const p of model.pipes) p.points = p.points.map(([x, y]) => [x * ratio, y]);
    for (const b of model.bodies) {
      b.x *= ratio;
      b.w *= ratio;
    }
    for (const d of model.devices) d.x *= ratio;
    for (const l of model.labels) {
      l.x *= ratio;
      l.anchor[0] *= ratio;
    }
    for (const b of Object.values(model.focusBoxes)) {
      b.x *= ratio;
      b.w *= ratio;
    }
    model.layout.poolHallX *= ratio;
    model.bounds.w *= ratio;
  }
  model.pipes = model.pipes.map((pipe) => ({ ...pipe, d: buildPipePath(pipe) }));
  return model;
}
export const DETAIL_SCHEMATIC_MODEL = buildDetailSchematicModel();
export const WIDE_SCHEMATIC_MODEL = buildDetailSchematicModel({}, true);

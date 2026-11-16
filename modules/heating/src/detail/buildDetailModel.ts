import { computeBridges } from './pipePath.js';
import type { DetailLayoutParams, DetailSchematicModel, SchematicPipe } from './types.js';

/** Two arrangements share the same hydraulic graph; buildings stay distinct in both. */
export function buildDetailSchematicModel(
  layout: Partial<DetailLayoutParams> = {},
  wide = false,
): DetailSchematicModel {
  const tank = { x: wide ? 490 : 290, y: 240, w: 140, h: 420 };
  const hp = { x: wide ? 200 : 65, y: 480, w: 100, h: 130 };
  const rad = { x: wide ? 800 : 530, y: 370, w: 120, h: 65 };
  const fish = { x: wide ? 1090 : 565, y: wide ? 480 : 830, w: 120, h: 65 };
  const hallX = layout.poolHallX ?? (wide ? 500 : 120);
  const hallY = wide ? 850 : 1070;
  const branchY = layout.floorBranchY ?? hallY - 55;
  const floorY = hallY + 220;
  const pool = { x: hallX + 250, y: hallY + 125, w: 180, h: 65 };
  const exch = { x: hallX + 125, y: hallY + 125, w: 36, h: 60 };
  const houseW = wide ? 970 : 710;
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
      { id: 'pool-hall', x: hallX, y: hallY, w: 500, h: 300 },
    ],
    bounds: { x: 0, y: 0, w: wide ? 1280 : 740, h: wide ? 1180 : 1400 },
    regions: {},
    layout: { poolHallAttached: false, poolHallX: hallX, floorBranchY: branchY, ...layout },
    focusBoxes: {
      tank: { x: tank.x - 100, y: tank.y - 80, w: 340, h: 570 },
      hp: { x: hp.x - 45, y: hp.y - 100, w: 300, h: 430 },
      pool: { x: hallX - 30, y: hallY - 60, w: 560, h: 390 },
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
  port('tank.in', tx, 400, 'tank');
  port('tank.dhwheat', tx, 320, 'tank');
  port('tank.ret', tx, 620, 'tank');
  port('tank.draw', tx + 40, 240, 'tank');
  port('tank.water', tx + 100, 660, 'tank');
  for (const [name, y] of [
    ['heat', 370],
    ['heatret', 460],
    ['pool', 500],
    ['poolret', 530],
    ['solar', 580],
    ['solarret', 610],
  ] as const)
    port(`tank.${name}`, right, y, 'tank');
  port('hp.hot', hp.x + 20, 480, 'hp');
  port('hp.cold', hp.x + 80, 480, 'hp');
  port('hp.gout', hp.x + 25, 610, 'hp');
  port('hp.gin', hp.x + 75, 610, 'hp');
  port('div.in', tx - 65, 400, 'div');
  port('div.out', tx - 65, 400, 'div');
  port('div.top', tx - 65, 400, 'div');
  route('hp-supply', 'hp.hot', 'div.in', [[hp.x + 20, 400]], 'hot');
  route('tank-charge', 'div.out', 'tank.in', [], 'hot');
  route('dhw-charge', 'div.top', 'tank.dhwheat', [[tx - 65, 320]], 'hot');
  route(
    'hp-return',
    'tank.ret',
    'hp.cold',
    [
      [tx - 25, 620],
      [tx - 25, 455],
      [hp.x + 80, 455],
    ],
    'cold',
  );
  route(
    'ground-loop',
    'hp.gout',
    'hp.gin',
    [
      [hp.x + 25, 780],
      [hp.x + 175, 780],
      [hp.x + 175, 810],
      [hp.x + 75, 810],
    ],
    'ground',
  );
  port('tap.in', tx - 110, 270, 'tap');
  route(
    'dhw-draw',
    'tank.draw',
    'tap.in',
    [
      [tx + 40, 210],
      [tx - 110, 210],
    ],
    'dhw',
  );
  port('mains.out', tx + 100, 800, 'mains');
  route('cold-water', 'mains.out', 'tank.water', [], 'mains');
  port('mix.in', right + 45, 370, 'mix');
  port('mix.out', right + 45, 370, 'mix');
  port('mix.bottom', right + 45, 370, 'mix');
  port('fish.branch', right + 75, 370, 'junction');
  port('heat.junction', right + 45, 460, 'junction');
  port('fish.return', right + 120, 460, 'junction');
  port('rad.in', rad.x, 385, 'radiator');
  port('rad.out', rad.x + 120, 420, 'radiator');
  route('heat-in', 'tank.heat', 'mix.in', [], 'hot');
  route('heat-supply', 'mix.out', 'fish.branch', [], 'hot');
  route(
    'rad-supply',
    'fish.branch',
    'rad.in',
    [
      [rad.x - 15, 370],
      [rad.x - 15, 385],
    ],
    'hot',
  );
  route(
    'heat-return',
    'rad.out',
    'fish.return',
    [
      [rad.x + 125, 420],
      [rad.x + 125, 460],
    ],
    'cold',
  );
  route('return-branch', 'fish.return', 'heat.junction', [], 'cold');
  route('heat-tank-return', 'heat.junction', 'tank.heatret', [], 'cold');
  route('mix-bypass', 'heat.junction', 'mix.bottom', [], 'cold');
  port('fish.in', fish.x, fish.y + 25, 'fish');
  port('fish.out', fish.x + 120, fish.y + 50, 'fish');
  const fishLane = wide ? 1010 : 675;
  const fishReturnLane = wide ? 1240 : 720;
  route(
    'fish-supply',
    'fish.branch',
    'fish.in',
    [
      [right + 75, 345],
      [fishLane, 345],
      [fishLane, fish.y - 30],
      [fish.x - 30, fish.y - 30],
      [fish.x - 30, fish.y + 25],
    ],
    'hot',
  );
  route(
    'fish-return',
    'fish.out',
    'fish.return',
    [
      [fishReturnLane, fish.y + 50],
      [fishReturnLane, 480],
      [right + 120, 480],
    ],
    'cold',
  );
  // Solar descends inside the wall, directly to the lower coil, never into the soil.
  port(
    'solar.in',
    right + 10,
    138 + ((right + 10 - (20 + (houseW - 20) / 2)) * 180) / (houseW - 20),
    'solar',
  );
  port(
    'solar.out',
    right + 30,
    138 + ((right + 30 - (20 + (houseW - 20) / 2)) * 180) / (houseW - 20),
    'solar',
  );
  route('solar-supply', 'solar.in', 'tank.solar', [[right + 10, 580]], 'solar');
  route('solar-return', 'tank.solarret', 'solar.out', [[right + 30, 610]], 'solar');
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
      [right + 60, 500],
      [right + 60, hallY - 35],
      [hallX + 60, hallY - 35],
      [hallX + 60, exch.y + 12],
    ],
    'pool',
  );
  route(
    'pool-return',
    'pool.exch.out',
    'tank.poolret',
    [
      [hallX + 105, exch.y + 48],
      [hallX + 105, hallY - 15],
      [right + 90, hallY - 15],
      [right + 90, 530],
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
  port('floor.in', hallX + 25, floorY, 'floor');
  port('floor.out', hallX + 475, floorY + 48, 'floor');
  route(
    'pool-floor-supply',
    'fish.branch',
    'floor.in',
    [
      [right + 75, branchY],
      [hallX + 25, branchY],
    ],
    'hot',
  );
  route(
    'pool-floor-loop',
    'floor.in',
    'floor.out',
    [
      [hallX + 475, floorY],
      [hallX + 475, floorY + 24],
      [hallX + 25, floorY + 24],
      [hallX + 25, floorY + 48],
    ],
    'hot',
  );
  route(
    'pool-floor-return',
    'floor.out',
    'fish.return',
    [
      [hallX + 490, floorY + 48],
      [hallX + 490, floorY + 75],
      [right + 120, floorY + 75],
      [right + 120, 460],
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
  device('Přepínání TUV / nádrž', tx - 65, 400, 'hp-supply', 'valve');
  device('Směšování', right + 45, 370, 'heat-in', 'valve');
  device('Nabíjení', tx - 25, 550, 'hp-return', 'pump', 90);
  device('Primární okruh', hp.x + 75, 700, 'ground-loop', 'pump', 90);
  device('Topení', rad.x + 110, 460, 'heat-return');
  device('Solár', right + 30, 565, 'solar-return', 'pump', 90);
  device('Natápění bazénu', hallX + 60, hallY + 15, 'pool-supply', 'pump', 90);
  device('Filtrace', pool.x + 210, pool.y + 30, 'pool-water', 'pump', 90);
  device('Ventil rybárny', fish.x - 10, fish.y + 25, 'fish-supply', 'valve');
  const label = (id: string, x: number, y: number, anchor: [number, number], tier: 0 | 1 = 0) =>
    model.labels.push({ id, x, y, anchor, tier, caption: '', value: '', owner: null });
  label('outdoor', 110, 40, [110, 150]);
  label('solar', right - 15, 40, [right + 15, 170]);
  label('tap', tx - 110, 160, [tx - 110, 270]);
  label('tank-title', tx + 70, 285, [tx + 70, 285]);
  label('bottom', tx + 70, 545, [tx + 70, 545]);
  label('hp', hp.x + 40, 350, [hp.x + 50, 480]);
  label('heat', rad.x + 60, 290, [rad.x + 60, 370]);
  label('fish', fish.x + 60, fish.y + 160, [fish.x + 60, fish.y + 65]);
  label('pool', pool.x + 60, hallY + 65, [pool.x + 60, pool.y]);
  label('ground', hp.x + 45, 890, [hp.x + 125, 780]);
  label('cold-water', wide ? tx - 50 : tx + 70, 905, [tx + 100, 800]);
  label('solar-pump', right + 170, 660, [right + 30, 565], 1);
  label('div', 110, 240, [tx - 65, 400], 1);
  label('charge', 110, 670, [tx - 25, 550], 1);
  label('mix', rad.x + 60, 545, [right + 45, 370], 1);
  model.bounds.w = Math.max(model.bounds.w, hallX + 520);
  // Landscape has a shorter building section, leaving room for the hall below.
  // Compress geometry (rather than the SVG) so pumps and text retain their proportions.
  if (wide) {
    const ratio = 0.6;
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
  model.pipes = computeBridges(model.pipes);
  return model;
}
export const DETAIL_SCHEMATIC_MODEL = buildDetailSchematicModel();
export const WIDE_SCHEMATIC_MODEL = buildDetailSchematicModel({}, true);

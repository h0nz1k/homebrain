/**
 * Invented vector floor plans for dev, unit tests and e2e (never real house data).
 * Shapes are drawn in a 350×274 sketch space and converted to Roborock-like map units
 * (≈ mm, y grows upwards) so they exercise the same transform as the real backend data.
 */
import type { VectorMapResult } from './geometry.js';
import { DEMO_RASTER_BOUNDS } from './demoRaster.js';

type P = [number, number];
const S = 40; // map units per sketch unit (350 → 14 m)
const OX = 24_000;
const OY = 24_000;
const toMap = ([x, y]: P): P => [OX + x * S, OY + (274 - y) * S];
const flat = (pts: P[]) => pts.flatMap((p) => toMap(p));

interface DemoPlan {
  rooms: [number, P[]][];
  floor: P[];
  dock: P;
  noGo?: P[][];
  /** App „virtual walls“ (no-go lines). */
  virtualWalls?: [P, P][];
  /** Physical walls as the backend traces them from the wall layer (door gaps included). */
  wallLines: P[][];
  /** Route the robot drives in the demo (sketch coords). */
  route: P[];
  /** Static robot (error) instead of driving the route. */
  parked?: P;
}

const lanes = (x0: number, x1: number, y0: number, y1: number, step: number): P[] => {
  const out: P[] = [];
  let up = true;
  for (let x = x0; x >= x1; x -= step, up = !up)
    out.push(
      ...([
        [x, up ? y1 : y0],
        [x, up ? y0 : y1],
      ] as P[]),
    );
  return out;
};

/** Horizontal / vertical wall pieces between door gaps. */
const h = (y: number, ...spans: [number, number][]): P[][] =>
  spans.map(([a, b]) => [
    [a, y],
    [b, y],
  ]);
const v = (x: number, ...spans: [number, number][]): P[][] =>
  spans.map(([a, b]) => [
    [x, a],
    [x, b],
  ]);
const OUTER: P[] = [
  [18, 18],
  [332, 18],
  [332, 256],
  [18, 256],
  [18, 18],
];

/** Demo plan unit = 4 cm: shoelace area in m² (synthetic flats of ~120 m²). */
const planArea = (pts: P[]) =>
  Math.round(
    (Math.abs(
      pts.reduce((sum, [x, y], i) => {
        const [nx, ny] = pts[(i + 1) % pts.length]!;
        return sum + x * ny - nx * y;
      }, 0),
    ) /
      2) *
      0.0016,
  );

const PLANS: Record<number, DemoPlan> = {
  1: {
    rooms: [
      [
        1,
        [
          [18, 18],
          [212, 18],
          [212, 152],
          [108, 152],
          [108, 122],
          [18, 122],
        ],
      ],
      [
        2,
        [
          [212, 18],
          [332, 18],
          [332, 102],
          [249, 102],
          [212, 69],
        ],
      ],
      [
        3,
        [
          [212, 69],
          [249, 102],
          [332, 102],
          [332, 192],
          [212, 192],
        ],
      ],
      [
        4,
        [
          [18, 122],
          [108, 122],
          [108, 152],
          [212, 152],
          [212, 192],
          [18, 192],
        ],
      ],
      [
        5,
        [
          [18, 192],
          [78, 192],
          [78, 256],
          [18, 256],
        ],
      ],
      [
        6,
        [
          [78, 192],
          [162, 192],
          [162, 256],
          [78, 256],
        ],
      ],
      [
        7,
        [
          [162, 192],
          [236, 192],
          [236, 256],
          [162, 256],
        ],
      ],
      [
        8,
        [
          [236, 192],
          [332, 192],
          [332, 256],
          [236, 256],
        ],
      ],
    ],
    // The floor ends on the outer wall axis (like the backend's floor layer).
    floor: [
      [18, 18],
      [332, 18],
      [332, 256],
      [18, 256],
    ],
    dock: [32, 162],
    wallLines: [
      OUTER,
      ...v(212, [18, 152], [172, 192]),
      [
        [18, 122],
        [60, 122],
      ],
      [
        [80, 122],
        [108, 122],
        [108, 152],
        [150, 152],
      ],
      ...h(152, [170, 212]),
      [
        [212, 69],
        [249, 102],
        [280, 102],
      ],
      ...h(102, [300, 332]),
      ...h(192, [18, 40], [60, 110], [130, 190], [210, 270], [290, 332]),
      ...v(78, [192, 256]),
      ...v(162, [192, 256]),
      ...v(236, [192, 256]),
    ],
    noGo: [
      [
        [146, 44],
        [184, 44],
        [184, 70],
        [146, 70],
      ],
    ],
    route: [
      [32, 162],
      [44, 172],
      [120, 172],
      [200, 170],
      [228, 150],
      [290, 128],
      [292, 96],
      ...lanes(322, 262, 28, 92, 10),
    ],
  },
  2: {
    rooms: [
      [
        16,
        [
          [18, 18],
          [152, 18],
          [152, 132],
          [18, 132],
        ],
      ],
      [
        17,
        [
          [152, 18],
          [246, 18],
          [246, 132],
          [152, 132],
        ],
      ],
      [
        18,
        [
          [246, 18],
          [332, 18],
          [332, 132],
          [246, 132],
        ],
      ],
      [
        19,
        [
          [18, 132],
          [332, 132],
          [332, 170],
          [18, 170],
        ],
      ],
      [
        20,
        [
          [18, 170],
          [132, 170],
          [132, 256],
          [18, 256],
        ],
      ],
      [
        21,
        [
          [132, 170],
          [196, 170],
          [196, 256],
          [132, 256],
        ],
      ],
      [
        22,
        [
          [196, 170],
          [332, 170],
          [332, 256],
          [196, 256],
        ],
      ],
    ],
    // The floor ends on the outer wall axis (like the backend's floor layer).
    floor: [
      [18, 18],
      [332, 18],
      [332, 256],
      [18, 256],
    ],
    dock: [300, 160],
    virtualWalls: [
      [
        [250, 46],
        [330, 46],
      ],
    ],
    wallLines: [
      OUTER,
      ...h(132, [18, 100], [120, 188], [208, 270], [290, 332]),
      ...v(152, [18, 132]),
      ...v(246, [18, 132]),
      ...h(170, [18, 60], [80, 150], [170, 260], [280, 332]),
      ...v(132, [170, 256]),
      ...v(196, [170, 256]),
    ],
    route: [
      [300, 160],
      [292, 151],
      [210, 150],
      [197, 120],
      [200, 86],
    ],
    parked: [200, 86],
  },
};

/**
 * Fixed demo scenes (dev `?scena=`, screenshots, e2e): the robot stands at a fixed share of
 * its route instead of following the wall clock.
 */
export type DemoScene = 'kuchyne' | 'chodba' | 'dok';
/** Sketch units between recorded path points when a route start is given. */
const DENSE_STEP = 8;
const SCENE_AT: Record<Exclude<DemoScene, 'dok'>, number> = { kuchyne: 0.5435, chodba: 0.07 };

/**
 * Demo `homebrain/robots/map` answer; robot 1 drives a route, one step per tick, looping.
 * `startShare` (0–1): where on the route the robot is at `nowMs` 0 – callers pass the time
 * since page load, so e2e runs start far from the loop's jump back to the route start (#38).
 */
export function demoVectorMap(
  slot: number,
  nowMs: number,
  tickMs = 30_000,
  scene?: DemoScene | null,
  startShare?: number | null,
): VectorMapResult {
  const plan = PLANS[slot];
  if (!plan) return { available: false, reason: 'parse_failed' };
  let robot: P;
  let path: P[];
  if (scene === 'dok' && !plan.parked) {
    // Back on the dock after a run: the robot still reports the last run's path.
    robot = plan.dock;
    path = plan.route;
  } else if (plan.parked) {
    robot = plan.parked;
    path = plan.route;
  } else {
    // Walk `step` sketch units per tick along the route, looping.
    const seg: number[] = [];
    let total = 0;
    for (let i = 1; i < plan.route.length; i++) {
      const [a, b] = [plan.route[i - 1]!, plan.route[i]!];
      seg.push(Math.hypot(b[0] - a[0], b[1] - a[1]));
      total += seg[i - 1]!;
    }
    const tick = Math.floor(nowMs / tickMs);
    let left =
      scene && scene !== 'dok'
        ? SCENE_AT[scene] * total
        : startShare == null
          ? ((tick * 46) % total) + 30
          : (startShare * total + tick * 46) % total;
    path = [plan.route[0]!];
    robot = plan.route[0]!;
    for (let i = 1; i < plan.route.length; i++) {
      const a = plan.route[i - 1]!;
      const b = plan.route[i]!;
      const done = Math.min(left, seg[i - 1]!);
      // With a route start (dev/e2e) record points every few units, like a real robot's path,
      // so the marker can glide along it; the default demo output stays unchanged.
      if (startShare != null) {
        for (let d = DENSE_STEP; d < done; d += DENSE_STEP) {
          const k = d / seg[i - 1]!;
          path.push([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]);
        }
      }
      if (left >= seg[i - 1]!) {
        left -= seg[i - 1]!;
        path.push(b);
        robot = b;
        continue;
      }
      const k = left / seg[i - 1]!;
      robot = [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
      path.push(robot);
      break;
    }
  }
  const [rx, ry] = toMap(robot);
  const [dx, dy] = toMap(plan.dock);
  const last = path.length > 1 ? toMap(path[path.length - 2]!) : [rx, ry - 1];
  if (!path.length) path = [robot];
  const angle = Math.round((Math.atan2(ry - last[1]!, rx - last[0]!) * 180) / Math.PI);
  return {
    available: true,
    map: {
      digest: `demo-${slot}`,
      bounds: [OX, OY, OX + 350 * S, OY + 274 * S],
      rooms: plan.rooms.map(([id, pts]) => ({ id, polygons: [flat(pts)], area_m2: planArea(pts) })),
      floor: [flat(plan.floor)],
      walls: plan.wallLines.map(flat),
      dividers: [],
      robot: { x: Math.round(rx), y: Math.round(ry), a: angle },
      dock: { x: dx, y: dy, a: 90 },
      path: flat(path).map(Math.round),
      no_go: (plan.noGo ?? []).map(flat),
      no_mop: [],
      virtual_walls: (plan.virtualWalls ?? []).map(([a, b]) => [...toMap(a), ...toMap(b)]),
      // Pre-rendered by scripts/build_robot_demo_rasters.py with the production renderer.
      raster: DEMO_RASTER_BOUNDS[slot]
        ? {
            bounds: DEMO_RASTER_BOUNDS[slot],
            path: `/api/homebrain/robots/map/${slot}/demo-${slot}/{theme}.png`,
          }
        : null,
    },
  };
}

/** Synthetic regression: 34 m² hall, 2.2 m² narrow room and 15 m² neighbour. */
export function narrowRoomMap(): VectorMapResult {
  const result = demoVectorMap(1, 0);
  if (!result.available) return result;
  const rectangle = (x: number, y: number, w: number, h: number) => [
    x,
    y,
    x + w,
    y,
    x + w,
    y + h,
    x,
    y + h,
  ];
  return {
    available: true,
    map: {
      ...result.map,
      digest: 'synthetic-narrow-room',
      bounds: [0, 0, 12_100, 5000],
      rooms: [
        { id: 1, area_m2: 34, polygons: [rectangle(0, 0, 6800, 5000)] },
        { id: 2, area_m2: 2.2, polygons: [rectangle(6800, 1500, 1100, 2000)] },
        { id: 3, area_m2: 15, polygons: [rectangle(7900, 0, 3000, 5000)] },
      ],
      floor: [rectangle(0, 0, 10_900, 5000)],
      walls: [[0, 0, 10_900, 0, 10_900, 5000, 0, 5000, 0, 0]],
      dividers: [],
      no_go: [],
      no_mop: [],
      virtual_walls: [],
      path: [],
      dock: { x: 6800, y: 2500, a: 0 },
      robot: { x: 6800, y: 2500, a: 0 },
      raster: null,
    },
  };
}

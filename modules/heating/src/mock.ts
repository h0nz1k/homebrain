import { normalizeHistory, type HeatingApi } from './api.js';
import type {
  HeatingHistory,
  HeatingRoom,
  HeatingSeason,
  HeatingSnapshot,
  HistoryKey,
  HistoryRange,
  WireHeatingHistory,
  WireHistoryPoint,
} from './types.js';

/** Dev/e2e scenarios (`?topeni=`). All numbers are SYNTHETIC, only shaped like a real system. */
export type HeatingScenario =
  'heating' | 'idle' | 'house' | 'dhw' | 'fault' | 'unconfigured' | 'stale';
export const HEATING_SCENARIOS: readonly HeatingScenario[] = [
  'heating',
  'idle',
  'house',
  'dhw',
  'fault',
  'unconfigured',
  'stale',
];

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** Small deterministic PRNG (mulberry32) so fixtures are stable across reloads and CI. */
export function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DEMO_ROOMS: HeatingRoom[] = [
  {
    id: 'demo_bedroom',
    name: 'Ložnice',
    temp: 20.7,
    humidity: 49,
    target: 21,
    valve_pct: 58,
    battery: 86,
    window_open: false,
    source: 'trv',
  },
  {
    id: 'demo_living',
    name: 'Obývák',
    temp: 22.2,
    humidity: 44,
    target: 22,
    valve_pct: 12,
    battery: 92,
    window_open: false,
    source: 'trv',
  },
  {
    id: 'demo_study',
    name: 'Pracovna',
    temp: 20.3,
    humidity: 52,
    target: 21.5,
    valve_pct: 100,
    battery: 17,
    window_open: false,
    source: 'trv',
  },
  {
    id: 'demo_kitchen',
    name: 'Kuchyň',
    temp: 21.4,
    humidity: 47,
    target: null,
    valve_pct: null,
    battery: 74,
    window_open: true,
    source: 'sensor',
  },
];

export function buildMockSnapshot(
  scenario: HeatingScenario,
  rooms: number,
  now = Date.now(),
): HeatingSnapshot {
  const iso = (ms: number) => new Date(ms).toISOString();
  const running = scenario === 'heating' || scenario === 'dhw';
  const snap: HeatingSnapshot = {
    updated_at: iso(now - (scenario === 'stale' ? 47 * MIN : 12_000)),
    stale: scenario === 'stale',
    source: scenario === 'unconfigured' ? 'unconfigured' : 'ok',
    activity:
      scenario === 'heating'
        ? 'heating_tank'
        : scenario === 'dhw'
          ? 'heating_dhw'
          : scenario === 'fault'
            ? 'fault'
            : scenario === 'house'
              ? 'house_circuit'
              : 'idle',
    mode: {
      season: 'winter',
      auto_season: true,
      setback_active: false,
      main_switch: true,
      cooling: null,
      hdo_low_tariff: scenario !== 'idle',
    },
    house: {
      ref_temp: 22.4,
      ref_target: 22.5,
      ref_target_effective: 22.5,
      hysteresis: 0.1,
      attic_temp: 19.6,
      circuit_on: scenario === 'house',
      supply_temp: 37.8,
      mixing_valve_pct: scenario === 'house' ? 72 : 100,
    },
    heat_pump: {
      compressor_on: running,
      running_since: running ? iso(now - (scenario === 'dhw' ? 14 : 27) * MIN) : null,
      power_w: running ? (scenario === 'dhw' ? 4900 : 4200) : 6,
      condenser_out: running ? (scenario === 'dhw' ? 52.5 : 46.0) : 32.4,
      return_temp: running ? (scenario === 'dhw' ? 43.2 : 41.8) : 29.7,
      brine_in: null,
      brine_out: null,
      primary_prerun: null,
      discharge_temp: null,
      discharge_bar: null,
      suction_temp: null,
      suction_bar: null,
      runtime_today_h: 3.4,
      starts_today: 5,
      energy_today_kwh: 14.2,
      motohours: 18_430.4,
    },
    tank: {
      top: scenario === 'dhw' ? 42.6 : 48.4,
      bottom:
        scenario === 'heating'
          ? 41.7
          : scenario === 'dhw'
            ? 42.4
            : scenario === 'house'
              ? 36.9
              : 39.5,
      target: 41,
      hysteresis: 5,
      curve_target: 41,
    },
    dhw: {
      temp: scenario === 'dhw' ? 44.6 : scenario === 'heating' ? 46.2 : 48.4,
      target: 47,
      reheat_below: 43,
      valve_to_dhw: scenario === 'dhw',
    },
    outdoor: { temp: -1.8, min_today: -4.6, max_today: 2.9 },
    pumps: {
      heating: scenario === 'house',
      secondary: running,
      circulation: null,
    },
    backup_heater: { on: null, available: false },
    faults: {
      active:
        scenario === 'fault'
          ? [
              {
                key: 'f_low_pressure',
                label: 'Nízký tlak sání – z kolektoru přichází málo tepla',
                since: iso(now - 38 * MIN),
              },
            ]
          : [],
      fatal: false,
      compressor_block: scenario === 'fault',
      monitored: 19,
    },
    curve: {
      points: [
        [-15, 50],
        [-5, 44],
        [5, 37],
        [15, 30],
      ],
      outdoor_now: -1.8,
    },
    schedules: [
      { key: 'dhw', label: 'Ohřev teplé vody', slots: [['05:00', '22:00']] },
      {
        key: 'setback',
        label: 'Útlum topení',
        slots: [
          ['00:00', '05:30'],
          ['22:30', '24:00'],
        ],
      },
      {
        key: 'circulation',
        label: 'Cirkulace TV',
        slots: [
          ['06:00', '08:00'],
          ['18:00', '21:00'],
        ],
      },
    ],
    extras: { solar: { temp: 4.1 }, pool: null, fish: { temp: 13.4 } },
    rooms: DEMO_ROOMS.slice(0, Math.max(0, Math.min(4, rooms))),
  };
  if (scenario === 'heating') snap.rooms = snap.rooms.map((r) => ({ ...r }));
  return snap;
}

/* ---------- History ---------- */

const RANGE_SPEC: Record<
  HistoryRange,
  { span: number; step: number; res: HeatingHistory['resolution'] }
> = {
  day: { span: DAY, step: 5 * MIN, res: '5min' },
  week: { span: 7 * DAY, step: HOUR, res: 'hour' },
  month: { span: 30 * DAY, step: HOUR, res: 'hour' },
  season: { span: 130 * DAY, step: DAY, res: 'day' },
  all: { span: 3650 * DAY, step: DAY, res: 'day' },
};

/** Outdoor temperature model: yearly cosine (coldest mid-January) + daily swing + noise. */
function outdoorAt(ts: number, rnd: () => number) {
  const d = new Date(ts);
  const doy = (ts - Date.UTC(d.getUTCFullYear(), 0, 1)) / DAY;
  const yearly = 9 - 11 * Math.cos(((doy - 15) / 365) * 2 * Math.PI);
  const hour = d.getHours() + d.getMinutes() / 60;
  const daily = 3.2 * Math.sin(((hour - 9) / 24) * 2 * Math.PI);
  return yearly + daily + (rnd() - 0.5) * 2.2;
}

/** Run hours per day: more in the cold, ~2.6× more before the 2018/19 season (synthetic). */
function runtimeFor(outdoorMean: number, ts: number, rnd: () => number) {
  const dd = Math.max(0, 18 - outdoorMean);
  const before = ts < Date.UTC(2018, 6, 1) ? 2.6 : 1;
  return Math.min(22, Math.max(0, (dd * 0.24 * before + (rnd() - 0.5) * 1.4) * (dd > 0 ? 1 : 0)));
}

/** Wire-format history exactly like `homebrain/heating/history` (counters = `[ts, change, null, null]`). */
export interface MockHistoryPin {
  /** The compressor has been running this many minutes (open run until now). */
  runningMin?: number;
  /** Last values (= the snapshot), blended in over the final hour so chart ends match the hero. */
  last?: Partial<Record<HistoryKey, number | null>>;
}

export function buildMockWireHistory(
  range: HistoryRange,
  keys: HistoryKey[],
  now = Date.now(),
  pin: MockHistoryPin = {},
): WireHeatingHistory {
  const { span, step, res } = RANGE_SPEC[range];
  const end = Math.floor(now / step) * step;
  const start = end - span;
  const rnd = seeded(range.length * 97 + 11);
  const series = new Map<HistoryKey, WireHistoryPoint[]>(keys.map((k) => [k, []]));
  const runs: Array<[number, number]> = [];
  // Tank sawtooth simulated every 5 min: cools while the house draws, the compressor runs from
  // 41 °C until 46 °C (target + hysteresis). Hourly ranges report the mean of 12 sub-steps.
  let tank = 43.5;
  let on = false;
  let runStart = 0;
  const sub = res === 'day' ? 0 : Math.round(step / (5 * MIN));
  for (let ts = start; ts <= end; ts += step) {
    const out = outdoorAt(ts, rnd);
    let bottom: number;
    let runtime = 0;
    if (res === 'day') {
      runtime = runtimeFor(out, ts, rnd);
      bottom = 40 + Math.min(4, Math.max(0, -out / 3)) + rnd() * 2;
    } else {
      let acc = 0;
      for (let k = 0; k < sub; k++) {
        const t = ts + k * 5 * MIN;
        const loss = 0.35 + Math.max(0, 14 - out) * 0.055;
        tank += ((on ? 7.5 : 0) - loss) / 12;
        if (!on && tank <= 41) {
          on = true;
          runStart = t;
        } else if (on && tank >= 46) {
          on = false;
          runs.push([runStart, t]);
        }
        acc += tank;
      }
      bottom = acc / sub;
    }
    const top = bottom + 3.4 + rnd() * 0.8;
    const supply = Math.max(24, Math.min(44, 38 - out * 0.45 + (rnd() - 0.5) * 1.5));
    const values: Record<HistoryKey, number> = {
      tank_bottom: bottom,
      tank_top: top,
      dhw_temp: top,
      outdoor_temp: out,
      house_supply_temp: supply,
      house_ref_temp: 22.3 + Math.sin(ts / (5 * HOUR)) * 0.25 + (rnd() - 0.5) * 0.15,
      compressor_runtime_h: runtime,
    };
    for (const k of keys) {
      const v = +values[k].toFixed(2);
      if (k === 'compressor_runtime_h') {
        // counter: change in the bucket (daily hours; per-hour share on finer ranges)
        series
          .get(k)!
          .push([ts, res === 'day' ? v : +(on ? step / HOUR : 0).toFixed(2), null, null]);
        continue;
      }
      const spread = res === 'day' ? (k === 'outdoor_temp' ? 4 : 2.5) : 0.4;
      series.get(k)!.push([ts, v, +(v - spread).toFixed(2), +(v + spread).toFixed(2)]);
    }
  }
  if (res !== 'day') {
    // like the backend: a run still in progress ends at `now`; match the snapshot's run
    if (on) runs.push([runStart, end]);
    if (pin.runningMin) {
      const from = end - pin.runningMin * MIN;
      while (runs.length && runs.at(-1)![1] > from - 20 * MIN) runs.pop();
      runs.push([from, end]);
    }
    const blend = Math.max(1, Math.round(HOUR / step));
    for (const k of keys) {
      const target = pin.last?.[k];
      if (target === null || target === undefined) continue;
      const pts = series.get(k)!;
      const n = Math.min(blend, pts.length);
      const delta = target - (pts.at(-1)![1] ?? target);
      for (let i = 0; i < n; i++) {
        const p = pts[pts.length - n + i]!;
        const f = (i + 1) / n;
        const shift = +(delta * f).toFixed(2);
        pts[pts.length - n + i] = [
          p[0],
          +((p[1] ?? 0) + shift).toFixed(2),
          p[2] === null ? null : +(p[2] + shift).toFixed(2),
          p[3] === null ? null : +(p[3] + shift).toFixed(2),
        ];
      }
    }
  }
  return {
    range,
    resolution: res,
    series: keys.map((key) => ({
      key,
      unit: key === 'compressor_runtime_h' ? 'h' : '°C',
      points: series.get(key)!,
    })),
    // like the backend: runs only for day/week, annotations not sent yet
    runs: range === 'day' || range === 'week' ? runs : [],
    annotations: [],
  };
}

/** Normalised mock history (what the views get from `HeatingApi.history`). */
export function buildMockHistory(
  range: HistoryRange,
  keys: HistoryKey[],
  now = Date.now(),
  pin: MockHistoryPin = {},
): HeatingHistory {
  return normalizeHistory(buildMockWireHistory(range, keys, now, pin), keys);
}

/* ---------- Seasons ---------- */

export function buildMockSeasons(now = Date.now()): HeatingSeason[] {
  const d = new Date(now);
  const firstHalf = d.getMonth() < 6;
  const current = d.getFullYear() - (firstHalf ? 1 : 0);
  const rnd = seeded(2026);
  const out: HeatingSeason[] = [];
  for (let i = 0; i < 10; i++) {
    const y = current - i;
    const partial = i === 0;
    const before = y < 2018;
    const dd = Math.round((partial ? 1180 : 3050) + (rnd() - 0.5) * 380);
    const per100 = +((before ? 81 : 30) + (rnd() - 0.5) * 8).toFixed(1);
    const hours = Math.round((dd / 100) * per100);
    const medianRun = Math.round(before ? 11 + rnd() * 3 : 17 + rnd() * 22);
    out.push({
      season: `${y}/${String((y + 1) % 100).padStart(2, '0')}`,
      partial,
      compressor_h: hours,
      starts: Math.round((hours * 60) / Math.max(8, medianRun * 1.15)),
      median_run_min: medianRun,
      degree_days: dd,
      h_per_100dd: per100,
      energy_kwh: Math.round(hours * (4.6 + rnd() * 0.3)),
      energy_measured: partial,
      coverage: +(i === 9 ? 0.91 : 0.985 + rnd() * 0.015).toFixed(3),
      outdoor_mean: +(partial ? 5.8 : 9.6 + rnd() * 2).toFixed(1),
      backup_heater_h: null,
    });
  }
  return out;
}

export function createMockHeatingApi(
  opts: { scenario?: HeatingScenario; rooms?: number; now?: () => number } = {},
): HeatingApi {
  const scenario =
    opts.scenario && HEATING_SCENARIOS.includes(opts.scenario) ? opts.scenario : 'heating';
  const now = opts.now ?? (() => Date.now());
  const rooms = opts.rooms ?? 4;
  const delay = <R>(v: R) => new Promise<R>((resolve) => setTimeout(() => resolve(v), 60));
  return {
    get: () => delay(buildMockSnapshot(scenario, rooms, now())),
    history: (range, keys) => {
      if (scenario === 'unconfigured') return delay(buildMockHistory(range, [], now()));
      const snap = buildMockSnapshot(scenario, rooms, now());
      const since = snap.heat_pump.running_since;
      return delay(
        buildMockHistory(range, keys, now(), {
          runningMin: since ? Math.round((now() - Date.parse(since)) / MIN) : undefined,
          last: {
            tank_bottom: snap.tank.bottom,
            tank_top: snap.tank.top,
            dhw_temp: snap.dhw.temp,
            outdoor_temp: snap.outdoor.temp,
            house_supply_temp: snap.house.supply_temp,
            house_ref_temp: snap.house.ref_temp,
          },
        }),
      );
    },
    seasons: () => delay(scenario === 'unconfigured' ? [] : buildMockSeasons(now())),
  };
}

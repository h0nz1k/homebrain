import { normalizeHistory, type HeatingApi } from './api.js';
import { deriveSolarState, type SolarSample } from './solar.js';
import type {
  HeatingAdvisor,
  HeatingClock,
  HeatingCycling,
  HeatingHistory,
  HeatingSchedule,
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
  | 'heating'
  | 'idle'
  | 'house'
  | 'dhw'
  | 'fault'
  | 'fault-warning'
  | 'unconfigured'
  | 'stale'
  | 'solar'
  | 'solar-nogain'
  | 'solar-off-hot'
  | 'off';
export const HEATING_SCENARIOS: readonly HeatingScenario[] = [
  'heating',
  'idle',
  'house',
  'dhw',
  'fault',
  'fault-warning',
  'unconfigured',
  'stale',
  'solar',
  'solar-nogain',
  'solar-off-hot',
  'off',
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

export type HeatingExtrasMode = 'default' | 'none';

/* ---------- Weekly programs (synthetic; local time, PLC on fixed UTC+1) ---------- */

const PLC_OFFSET_MIN = 60;
type MockSlot = readonly [start: string, minutes: number];

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};
const toHhmm = (min: number) => {
  const v = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`;
};

/** Local shift of program times today (summer time: +60 with a UTC+1 PLC). */
function localShiftMin(now: number): number {
  return -new Date(now).getTimezoneOffset() - PLC_OFFSET_MIN;
}

/** `days[0]` = Monday; local start + run minutes → contract `schedule` incl. `week`. */
function mockSchedule(
  key: string,
  label: string,
  days: ReadonlyArray<readonly MockSlot[]>,
  now: number,
  format: HeatingSchedule['format'] = 'start_end',
): HeatingSchedule {
  const shift = localShiftMin(now);
  const week = days.map((slots, i) => ({
    day: i + 1,
    slots: slots.map(([start, minutes]) => {
      const s = toMin(start);
      return {
        start,
        end: s + minutes === 1440 ? '24:00' : toHhmm(s + minutes),
        minutes,
        plc_start: toHhmm(s - shift),
        plc_end: toHhmm(s - shift + minutes),
      };
    }),
  }));
  const today = (new Date(now).getDay() + 6) % 7;
  return {
    key,
    label,
    format,
    slots: week[today]!.slots.map((x) => [x.plc_start, x.plc_end] as [string, string]),
    week,
  };
}

const weekdays = <T>(work: T, weekend: T): T[] => [work, work, work, work, work, weekend, weekend];

export function mockSchedules(now: number): HeatingSchedule[] {
  return [
    mockSchedule(
      'dhw',
      'Ohřev teplé vody',
      weekdays([['05:00', 17 * 60]], [['05:00', 17 * 60]]),
      now,
    ),
    mockSchedule(
      'setback',
      'Útlum topení',
      weekdays([['22:30', 7 * 60]], [['23:30', 8 * 60]]),
      now,
    ),
    mockSchedule(
      'circulation',
      'Cirkulace TV',
      weekdays(
        [
          ['06:00', 120],
          ['18:00', 180],
        ],
        [['08:00', 13 * 60]],
      ),
      now,
    ),
    mockSchedule(
      'pool_filter',
      'Filtrace bazénu',
      [
        ...Array.from({ length: 6 }, () => [['11:00', 90]] as MockSlot[]),
        [
          ['10:00', 120],
          ['18:00', 45],
        ],
      ],
      now,
      'start_duration',
    ),
  ];
}

export function mockClock(now: number, driftMin = 3): HeatingClock {
  const plc = new Date(now + (PLC_OFFSET_MIN + driftMin) * MIN);
  return {
    plc_utc_offset_minutes: PLC_OFFSET_MIN,
    local_shift_min: localShiftMin(now),
    plc_time: toHhmm(plc.getUTCHours() * 60 + plc.getUTCMinutes()),
    drift_min: driftMin,
  };
}

function mockCycling(starts: number | null, runtimeH: number | null): HeatingCycling | null {
  if (starts === null || runtimeH === null) return null;
  const avg = starts ? Math.round(((runtimeH * 60) / starts) * 10) / 10 : null;
  const yStarts = starts > 30 ? 52 : 6;
  const yAvg = starts > 30 ? 6.1 : 38.5;
  const short = (s: number, a: number | null) => s > 30 || (s >= 10 && a !== null && a < 8);
  return {
    starts_today: starts,
    avg_run_min_today: avg,
    starts_yesterday: yStarts,
    avg_run_min_yesterday: yAvg,
    short_cycling: short(starts, avg) || short(yStarts, yAvg),
    max_starts: 30,
    min_avg_run_min: 8,
  };
}

function mockExtras(
  scenario: HeatingScenario,
  mode: HeatingExtrasMode,
  tankBottom: number | null = null,
): HeatingSnapshot['extras'] {
  if (mode === 'none' || scenario === 'unconfigured') {
    return { solar: null, pool: null, fish: null };
  }
  const winterPool = {
    temp: 27.9,
    heating_pump: false,
    filter_pump: false,
    filter_enabled: true,
    filter_program_active: false,
    heating_enabled: false,
    auto: true,
    target: 28,
  };
  const fishWater = {
    water_temp: 17.6,
    water_target: 18.0,
    water_hysteresis: 1.0,
    water_heating_on: true,
    water_heating_running: false,
  };
  const collectorWinter = 4;
  const solarWinter = {
    temp: scenario === 'heating' || scenario === 'house' ? collectorWinter : 12.6,
    pump:
      tankBottom !== null && collectorWinter >= tankBottom
        ? scenario === 'heating' || scenario === 'house'
        : false,
    enabled: true,
    pump_pct: scenario === 'heating' || scenario === 'house' ? 0 : null,
    state: null,
  };
  if (scenario === 'heating') {
    return {
      fish: {
        temp: 7.9,
        target: 8.0,
        hysteresis: 0.2,
        heating_on: true,
        valve_open: true,
        ...fishWater,
      },
      solar: solarWinter,
      pool: winterPool,
    };
  }
  if (scenario === 'idle') {
    return {
      fish: {
        temp: 11.4,
        target: 8.0,
        hysteresis: 0.2,
        heating_on: true,
        valve_open: false,
      },
      solar: { temp: 12.6, pump: false, enabled: true, pump_pct: 0, state: null },
      pool: winterPool,
    };
  }
  return {
    fish: {
      temp: 9.8,
      target: 10.0,
      hysteresis: 0.2,
      heating_on: true,
      valve_open: true,
      ...fishWater,
    },
    solar: solarWinter,
    pool: winterPool,
  };
}

/** Made-up PLC addresses (same style as docs/modules/heating-map.example.yaml). */
const MOCK_SERVICE_CODES: Record<string, string> = {
  'heat_pump.compressor_on': 'Y50.7',
  'heat_pump.condenser_out': 'X336',
  'heat_pump.return_temp': 'X348',
  'heat_pump.collector_in': 'X360',
  'heat_pump.collector_out': 'X372',
  'house.supply_temp': 'X324',
  'house.attic_temp': 'X312',
  'house.ref_temp': 'X300',
  'house.mixing_valve_pct': 'R7050',
  'tank.top': 'X384',
  'tank.bottom': 'X396',
  'dhw.temp': 'X384',
  'dhw.valve_to_dhw': 'Y51.0',
  'pumps.heating': 'Y50.6',
  'pumps.secondary': 'Y50.5',
  'extras.solar_temp': 'X420',
  'extras.solar_pump': 'Y52.0',
  'extras.pool_temp': 'X432',
  'extras.pool_heating_pump': 'Y52.1',
  'extras.pool_filter_pump': 'Y52.2',
  'extras.fish_temp': 'X444',
  'extras.fish_valve_open': 'Y52.3',
};

/**
 * Dev/e2e fault fixture only (`&ventil=porucha`): a mixing-valve fault lamp mapped under the
 * explicit key. The real regulation has no such lamp today; the default mock has no faults.
 */
export function withMixerFault(snap: HeatingSnapshot, now = Date.now()): HeatingSnapshot {
  return {
    ...snap,
    faults: {
      ...snap.faults,
      active: [
        ...snap.faults.active,
        {
          key: 'mixing_valve',
          label: 'Směšovací ventil ÚT – porucha',
          since: new Date(now - 2 * HOUR).toISOString(),
        },
      ],
    },
  };
}

export function buildMockSnapshot(
  scenario: HeatingScenario,
  rooms: number,
  now = Date.now(),
  extrasMode: HeatingExtrasMode = 'default',
): HeatingSnapshot {
  const iso = (ms: number) => new Date(ms).toISOString();
  const running = scenario === 'heating' || scenario === 'dhw';
  const fault = scenario === 'fault' || scenario === 'fault-warning';
  const solarSamples: SolarSample[] = [];
  const snap: HeatingSnapshot = {
    updated_at: iso(now - (scenario === 'stale' ? 47 * MIN : 12_000)),
    stale: scenario === 'stale',
    source: scenario === 'unconfigured' ? 'unconfigured' : 'ok',
    activity:
      scenario === 'off'
        ? 'off'
        : scenario === 'heating'
          ? 'heating_tank'
          : scenario === 'dhw'
            ? 'heating_dhw'
            : fault
              ? 'fault'
              : scenario === 'house'
                ? 'house_circuit'
                : 'idle',
    alerts: [],
    mode: {
      season: 'winter',
      auto_season: true,
      setback_active: false,
      main_switch: scenario !== 'off',
      heating_enabled: scenario !== 'off',
      winter_limit: 12,
      summer_limit: null,
      cooling_enabled: false,
      cooling: null,
      hdo_low_tariff: scenario !== 'idle',
    },
    house: {
      ref_temp: 22.4,
      ref_target: 22.5,
      ref_target_effective: 22.5,
      hysteresis: 0.1,
      setback_drop: 0,
      setback_drop_alt: null,
      attic_temp: 19.6,
      circuit_on: scenario === 'house',
      supply_temp: 37.8,
      // live regulation: the valve position is not mapped (null); the house scenario shows a value
      mixing_valve_pct: scenario === 'house' ? 72 : null,
    },
    heat_pump: {
      compressor_on: running,
      running_since: running ? iso(now - (scenario === 'dhw' ? 14 : 27) * MIN) : null,
      power_w: running ? (scenario === 'dhw' ? 4900 : 4200) : 6,
      condenser_out: running ? (scenario === 'dhw' ? 52.5 : 46.0) : 32.4,
      return_temp: running ? (scenario === 'dhw' ? 43.2 : 41.8) : 29.7,
      collector_in: null,
      collector_out: null,
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
      active: fault
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
      weather_comp: true,
      constant_target: 50,
      min_water: 25,
    },
    schedules: mockSchedules(now).filter((x) => extrasMode !== 'none' || !x.key.startsWith('pool')),
    clock: mockClock(now),
    extras: mockExtras(
      scenario,
      extrasMode,
      scenario === 'heating'
        ? 41.7
        : scenario === 'dhw'
          ? 42.4
          : scenario === 'house'
            ? 36.9
            : scenario === 'idle'
              ? 39.5
              : null,
    ),
    rooms: DEMO_ROOMS.slice(0, Math.max(0, Math.min(4, rooms))),
    service_codes: scenario === 'unconfigured' ? {} : MOCK_SERVICE_CODES,
  };
  const tune: Record<
    Exclude<
      HeatingScenario,
      | 'fault'
      | 'fault-warning'
      | 'unconfigured'
      | 'stale'
      | 'solar'
      | 'solar-nogain'
      | 'solar-off-hot'
      | 'off'
    >,
    Partial<{
      ref: number;
      attic: number;
      setback: boolean;
      outdoor: number;
      tankTop: number;
      tankBottom: number;
      tankTarget: number;
      curveTarget: number;
      dhwTemp: number;
      runtime: number;
      starts: number;
      kwh: number;
      moto: number;
      supply: number;
      power: number;
      out: number;
      ret: number;
    }>
  > = {
    heating: {
      ref: 22.4,
      attic: 19.6,
      setback: false,
      outdoor: -1.8,
      tankTop: 49.8,
      tankBottom: 41.7,
      tankTarget: 41,
      curveTarget: 41,
      dhwTemp: 46.2,
      runtime: 3.4,
      starts: 5,
      kwh: 14.2,
      moto: 18_430.4,
      supply: 37.8,
      power: 4200,
      out: 46.0,
      ret: 41.8,
    },
    dhw: {
      ref: 22.3,
      attic: 24.1,
      setback: false,
      outdoor: 0.4,
      tankTop: 44.8,
      tankBottom: 42.4,
      tankTarget: 41,
      curveTarget: 38,
      dhwTemp: 44.6,
      // summer-like DHW cycling: many short runs (short-cycling card)
      runtime: 4.1,
      starts: 38,
      kwh: 5.4,
      moto: 18_430.4,
      supply: 35.2,
      power: 4900,
      out: 52.5,
      ret: 43.2,
    },
    house: {
      ref: 22.6,
      attic: 18.2,
      setback: false,
      outdoor: -3.2,
      tankTop: 38.4,
      tankBottom: 36.9,
      tankTarget: 43,
      curveTarget: 43,
      dhwTemp: 48.4,
      runtime: 2.8,
      starts: 4,
      kwh: 8.6,
      moto: 18_430.4,
      supply: 37.8,
      power: 6,
      out: 32.4,
      ret: 29.7,
    },
    idle: {
      ref: 22.5,
      attic: 17.8,
      setback: true,
      outdoor: 2.1,
      tankTop: 40.6,
      tankBottom: 39.5,
      tankTarget: 41,
      curveTarget: 37,
      dhwTemp: 47.9,
      runtime: 0.9,
      starts: 2,
      kwh: 3.1,
      moto: 18_430.4,
      supply: 34.1,
      power: 6,
      out: 32.4,
      ret: 29.7,
    },
  };
  if (scenario in tune) {
    const t = tune[scenario as keyof typeof tune]!;
    snap.house.ref_temp = t.ref!;
    snap.house.attic_temp = t.attic!;
    snap.mode.setback_active = t.setback!;
    snap.outdoor.temp = t.outdoor!;
    snap.outdoor.min_today = t.outdoor! - 2.8;
    snap.outdoor.max_today = t.outdoor! + 4.7;
    snap.curve.outdoor_now = t.outdoor!;
    snap.tank.top = t.tankTop!;
    snap.tank.bottom = t.tankBottom!;
    snap.tank.target = t.tankTarget!;
    snap.tank.curve_target = t.curveTarget!;
    snap.dhw.temp = t.dhwTemp!;
    snap.heat_pump.runtime_today_h = t.runtime!;
    snap.heat_pump.starts_today = t.starts!;
    snap.heat_pump.energy_today_kwh = t.kwh!;
    snap.heat_pump.motohours = t.moto!;
    snap.house.supply_temp = t.supply!;
    snap.heat_pump.power_w = running ? t.power! : 6;
    snap.heat_pump.condenser_out = running ? t.out! : t.out!;
    snap.heat_pump.return_temp = running ? t.ret! : t.ret!;
    snap.tank.top = scenario === 'dhw' ? t.tankTop! : snap.tank.top;
    snap.tank.bottom =
      scenario === 'heating'
        ? t.tankBottom!
        : scenario === 'house'
          ? t.tankBottom!
          : snap.tank.bottom;
  }
  if (scenario === 'heating') snap.rooms = snap.rooms.map((r) => ({ ...r }));
  if (scenario === 'fault-warning') {
    snap.alerts = [
      {
        id: 'fault',
        severity: 'warning',
        title: 'Čerpadlo zaznamenalo poruchu',
        body: 'Nízký tlak sání v 08:15. Potvrď ji na panelu čerpadla.',
        since: iso(now - 38 * MIN),
      },
    ];
  }
  if (scenario === 'solar') {
    snap.activity = 'idle';
    snap.heat_pump.compressor_on = false;
    snap.heat_pump.running_since = null;
    snap.heat_pump.power_w = 52;
    snap.heat_pump.energy_today_kwh = 3.8;
    snap.pumps.secondary = false;
    snap.tank.bottom = 38.4;
    snap.extras.solar = {
      temp: 54.8,
      pump: true,
      enabled: true,
      pump_pct: 78,
      state: 'heating',
    };
  }
  if (scenario === 'solar-off-hot') {
    snap.activity = 'idle';
    snap.heat_pump.compressor_on = false;
    snap.heat_pump.running_since = null;
    snap.heat_pump.power_w = 12;
    snap.tank.bottom = 39.2;
    snap.extras.solar = {
      temp: 118,
      pump: false,
      enabled: false,
      pump_pct: 0,
      state: 'stagnation',
    };
    snap.alerts = [
      {
        id: 'solar_off_hot',
        severity: 'critical',
        title: 'Solár je vypnutý a kolektor se přehřívá',
        body: 'Kolektor má 118\u202f°C, ale solární ohřev je v regulaci vypnutý – teplo se neukládá a kapalina se přehřívá. Zapněte solární ohřev v regulaci.',
        since: iso(now - 95 * MIN),
        value: '118',
      },
    ];
  }
  if (scenario === 'off') {
    snap.activity = 'off';
    snap.mode.main_switch = false;
    snap.heat_pump.compressor_on = false;
    snap.heat_pump.running_since = null;
    snap.heat_pump.power_w = 0;
    snap.alerts = [
      {
        id: 'hp_off',
        severity: 'warning',
        title: 'Tepelné čerpadlo je vypnuté',
        body: 'Hlavní vypínač v regulaci je vypnutý.',
        since: iso(now - 40 * MIN),
      },
    ];
  }
  if (scenario === 'solar-nogain') {
    snap.activity = 'idle';
    snap.heat_pump.compressor_on = false;
    snap.heat_pump.running_since = null;
    snap.heat_pump.power_w = 48;
    snap.tank.bottom = 38.1;
    snap.extras.solar = {
      temp: 61.2,
      pump: true,
      enabled: true,
      pump_pct: 82,
      state: null,
    };
    for (let i = 62; i >= 0; i -= 1) {
      solarSamples.push({
        ts: now - i * 30_000,
        collector: 61.2,
        tankBottom: 38.1,
        pump: true,
      });
    }
  }
  if (scenario === 'house') snap.mode.auto_season = false; // manual winter explanation
  if (snap.source !== 'unconfigured') {
    snap.heat_pump.cycling = mockCycling(
      snap.heat_pump.starts_today,
      snap.heat_pump.runtime_today_h,
    );
  }
  const solar = snap.extras.solar;
  if (solar) {
    const sunny =
      scenario === 'solar' || scenario === 'solar-nogain' || scenario === 'solar-off-hot';
    solar.today = sunny
      ? {
          pump_h: 3.4,
          max_temp: Math.max(78, solar.temp ?? 0),
          stagnation_min: scenario === 'solar-off-hot' ? 25 : 0,
        }
      : { pump_h: 0, max_temp: Math.max(9.5, solar.temp ?? 0), stagnation_min: 0 };
    solar.yesterday = sunny
      ? { pump_h: 5.2, max_temp: 114, stagnation_min: 35 }
      : { pump_h: 0.6, max_temp: 31, stagnation_min: 0 };
    if (solar.enabled === null) solar.enabled = true;
    if (solar.pump_pct === null && solar.pump === true) solar.pump_pct = 70;
    if (solar.pump_pct === null && solar.pump === false) solar.pump_pct = 0;
    solar.state = deriveSolarState(solar.temp, snap.tank.bottom, solar.pump, solarSamples, now);
  }
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
  opts: {
    scenario?: HeatingScenario;
    rooms?: number;
    now?: () => number;
    extrasMode?: HeatingExtrasMode;
    mixerFault?: boolean;
    advisor?: HeatingAdvisor;
  } = {},
): HeatingApi {
  const scenario =
    opts.scenario && HEATING_SCENARIOS.includes(opts.scenario) ? opts.scenario : 'heating';
  const now = opts.now ?? (() => Date.now());
  const rooms = opts.rooms ?? 4;
  const extrasMode = opts.extrasMode ?? 'default';
  const delay = <R>(v: R) => new Promise<R>((resolve) => setTimeout(() => resolve(v), 60));
  const mockChanges = [
    {
      ts: new Date(now() - 3 * HOUR).toISOString(),
      key: 'extras.solar_enabled',
      label: 'Solár',
      old: true,
      new: false,
      late: false,
    },
    {
      ts: new Date(now() - 26 * HOUR).toISOString(),
      key: 'mode.main_switch',
      label: 'Hlavní vypínač',
      old: false,
      new: true,
      late: true,
    },
  ];
  return {
    get: () => {
      const snap = buildMockSnapshot(scenario, rooms, now(), extrasMode);
      snap.advisor = opts.advisor;
      return delay(opts.mixerFault ? withMixerFault(snap, now()) : snap);
    },
    changes: () => delay(scenario === 'unconfigured' ? [] : mockChanges),
    history: (range, keys) => {
      if (scenario === 'unconfigured') return delay(buildMockHistory(range, [], now()));
      const snap = buildMockSnapshot(scenario, rooms, now(), extrasMode);
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

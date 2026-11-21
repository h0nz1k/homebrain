/**
 * `homebrain/heating/*` payloads (backend `heating/ws.py` + `model.py`). Temperatures °C;
 * null = not mapped / unavailable (the backend never invents a value).
 */

export type HeatingActivity =
  | 'off'
  | 'dhw_only'
  | 'idle'
  | 'heating_tank'
  | 'heating_dhw'
  | 'house_circuit'
  | 'cooling'
  | 'fault'
  | 'blocked_hdo';
export type HeatingAlertSeverity = 'info' | 'warning' | 'critical';

export interface HeatingAlert {
  id: string;
  severity: HeatingAlertSeverity;
  title: string;
  body: string;
  since: string;
  value?: string | null;
}

export interface HeatingChangeEntry {
  ts: string;
  key: string;
  label: string;
  old: unknown;
  new: unknown;
  late: boolean;
}
export type HeatingSource = 'ok' | 'auth' | 'unreachable' | 'unconfigured';
type T = number | null;
type B = boolean | null;

export interface HeatingFault {
  key: string;
  label: string;
  since: string | null;
}

export interface HeatingRoom {
  id: string;
  name: string;
  temp: T;
  humidity: T;
  target: T;
  valve_pct: T;
  battery: T;
  window_open: boolean;
  source: 'trv' | 'sensor';
}

export type SolarThermalState = 'heating' | 'no_gain' | 'stagnation' | 'idle';

/** One slot of `HeatingSchedule.week`, in real local time (DST included). */
export interface HeatingWeekSlot {
  start: string;
  /** Local end; may be after midnight (then `minutes` runs into the next day). */
  end: string;
  minutes: number;
  /** What the regulation itself displays (fixed PLC clock). */
  plc_start: string;
  plc_end: string;
}

export interface HeatingSchedule {
  key: string;
  label: string;
  /** Today's slots in PLC time (legacy field, kept for the change log). */
  slots: Array<[string, string]>;
  /** `start_end` = on/off windows; `start_duration` = start + run time (pool filtration). */
  format?: 'start_end' | 'start_duration';
  /** Monday … Sunday of the current week (day 1 = Monday). Missing on older backends. */
  week?: Array<{ day: number; slots: HeatingWeekSlot[] }>;
}

export interface HeatingClock {
  plc_utc_offset_minutes: number;
  /** Local UTC offset − PLC offset today (60 in summer time with a UTC+1 PLC). */
  local_shift_min: number;
  plc_time: string | null;
  /** + = the PLC clock is fast; null when the clock is not mapped. */
  drift_min: number | null;
}

export interface HeatingCycling {
  starts_today: number;
  avg_run_min_today: T;
  starts_yesterday: T;
  avg_run_min_yesterday: T;
  short_cycling: boolean;
  max_starts: number;
  min_avg_run_min: number;
}

export interface HeatingSolarDay {
  pump_h: T;
  max_temp: T;
  stagnation_min: T;
}

export interface HeatingSnapshot {
  updated_at: string | null;
  stale: boolean;
  source: HeatingSource;
  activity: HeatingActivity;
  alerts: HeatingAlert[];
  mode: {
    season: 'winter' | 'summer' | null;
    auto_season: B;
    setback_active: B;
    main_switch: B;
    heating_enabled: B;
    winter_limit: T;
    /** Older backends omit it. */
    summer_limit?: T;
    cooling_enabled: B;
    cooling: B;
    hdo_low_tariff: B;
  };
  house: {
    ref_temp: T;
    ref_target: T;
    ref_target_effective: T;
    hysteresis: T;
    setback_drop: T;
    setback_drop_alt: T;
    attic_temp: T;
    circuit_on: B;
    supply_temp: T;
    mixing_valve_pct: T;
  };
  heat_pump: {
    compressor_on: B;
    running_since: string | null;
    power_w: T;
    condenser_out: T;
    return_temp: T;
    collector_in: T;
    collector_out: T;
    /** Logger bit pulsing before every compressor start: collector (primary) pump pre-run, NOT a heater.
     * Not mapped on the current regulation (always null). */
    primary_prerun: B;
    discharge_temp: T;
    discharge_bar: T;
    suction_temp: T;
    suction_bar: T;
    runtime_today_h: T;
    starts_today: T;
    energy_today_kwh: T;
    /** Hours incl. the minutes counter (float). */
    motohours: T;
    /** null = compressor not mapped; missing on older backends. */
    cycling?: HeatingCycling | null;
  };
  tank: { top: T; bottom: T; target: T; hysteresis: T; curve_target: T };
  dhw: { temp: T; target: T; reheat_below: T; valve_to_dhw: B };
  outdoor: { temp: T; min_today: T; max_today: T };
  /** `circulation` is not mapped yet (null → the schematic hides that pump). */
  pumps: { heating: B; secondary: B; circulation: B };
  /** `available: false` = no backup heater on this regulation → never drawn or mentioned. */
  backup_heater: { on: B; available: boolean };
  faults: {
    active: HeatingFault[];
    fatal: boolean;
    compressor_block: boolean;
    monitored: number;
  };
  curve: {
    points: Array<[number, number]>;
    outdoor_now: T;
    weather_comp: B;
    constant_target: T;
    min_water: T;
  };
  schedules: HeatingSchedule[];
  clock?: HeatingClock;
  extras: {
    solar?: {
      temp: T;
      pump: B;
      enabled: B;
      pump_pct: T;
      state: SolarThermalState | null;
      today?: HeatingSolarDay | null;
      yesterday?: HeatingSolarDay | null;
    } | null;
    pool?: {
      temp: T;
      heating_pump: B;
      filter_pump: B;
      filter_enabled?: B;
      filter_program_active?: B;
      heating_enabled?: B;
      auto?: B;
      target?: T;
    } | null;
    fish?: {
      temp: T;
      target: T;
      hysteresis: T;
      heating_on: B;
      valve_open: B;
      water_temp?: T;
      water_target?: T;
      water_hysteresis?: T;
      water_heating_on?: B;
      water_heating_running?: B;
    } | null;
  };
  rooms: HeatingRoom[];
  /** Payload field (`house.supply_temp`) → PLC address from the private map; service view only.
   * Missing on older backends. */
  service_codes?: Record<string, string>;
}

/** Subset of `homebrain/heating/get` the kiosk role receives (`kiosk_subset`). */
export interface HeatingKioskSnapshot {
  updated_at: string | null;
  stale: boolean;
  source: HeatingSource;
  activity: HeatingActivity;
  house: Pick<HeatingSnapshot['house'], 'ref_temp' | 'ref_target_effective'>;
  heat_pump: Pick<HeatingSnapshot['heat_pump'], 'compressor_on' | 'running_since'>;
  dhw: Pick<HeatingSnapshot['dhw'], 'temp' | 'target' | 'reheat_below'>;
  outdoor: Pick<HeatingSnapshot['outdoor'], 'temp'>;
  faults: Pick<HeatingSnapshot['faults'], 'active' | 'fatal' | 'compressor_block'>;
  alerts: Array<Pick<HeatingAlert, 'title'>>;
}

export type HistoryRange = 'day' | 'week' | 'month' | 'season' | 'all';
/** History series keys = backend object ids `<section>_<field>` (`tank.bottom` → `tank_bottom`). */
export type HistoryKey =
  | 'tank_top'
  | 'tank_bottom'
  | 'dhw_temp'
  | 'outdoor_temp'
  | 'house_supply_temp'
  | 'house_ref_temp'
  | 'compressor_runtime_h';
/** Counter series: hours/starts/kWh added in that bucket (`[ts, change, null, null]` on the wire). */
export const COUNTER_KEYS: ReadonlySet<string> = new Set([
  'compressor_runtime_h',
  'compressor_starts',
  'energy_kwh',
]);
/** Wire point: [ts_ms, mean | change, min, max]; any value may be null (gaps, counters). */
export type WireHistoryPoint = [number, number | null, number | null, number | null];
/** Normalised point the charts draw: [ts_ms, value, min, max] (min/max = value when absent). */
export type HistoryPoint = [number, number, number, number];

export interface WireHeatingHistory {
  range: HistoryRange;
  resolution: '5min' | 'hour' | 'day';
  series: Array<{ key: string; unit: string | null; points: WireHistoryPoint[] }>;
  runs: Array<[number, number]>;
  annotations: Array<{ ts: number; text: string }>;
}

export interface HeatingHistory {
  range: HistoryRange;
  resolution: '5min' | 'hour' | 'day';
  series: Array<{ key: HistoryKey; unit: string | null; points: HistoryPoint[] }>;
  /** Compressor runs [on_ms, off_ms] – only for `day` and `week`. */
  runs: Array<[number, number]>;
  annotations: Array<{ ts: number; text: string }>;
}

export interface HeatingSeason {
  season: string;
  partial: boolean;
  compressor_h: number | null;
  starts: number | null;
  /** Set when hourly/daily counter totals cannot be shown (recorder inconsistency). */
  compressor_unavailable?: string | null;
  /** Recorder saw a decreasing total (odometer reset); increments after that are still counted. */
  counter_reset?: boolean;
  median_run_min: number | null;
  degree_days: number | null;
  h_per_100dd: number | null;
  energy_kwh: number | null;
  energy_measured: boolean;
  coverage: number;
  outdoor_mean: number | null;
  backup_heater_h: number | null;
}

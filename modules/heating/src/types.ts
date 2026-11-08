/** `homebrain/heating/*` payloads (shared contract v1). Temperatures °C; null = not mapped/unavailable. */

export type HeatingActivity =
  'idle' | 'heating_tank' | 'heating_dhw' | 'house_circuit' | 'cooling' | 'fault' | 'blocked_hdo';
export type HeatingSource = 'ok' | 'auth' | 'unreachable' | 'unconfigured';
type T = number | null;

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

export interface HeatingSchedule {
  key: string;
  label: string;
  slots: Array<[string, string]>;
}

export interface HeatingSnapshot {
  updated_at: string;
  stale: boolean;
  source: HeatingSource;
  activity: HeatingActivity;
  mode: {
    season: 'winter' | 'summer';
    auto_season: boolean;
    setback_active: boolean;
    main_switch: boolean;
    cooling: boolean;
    hdo_low_tariff: boolean | null;
  };
  house: {
    ref_temp: T;
    ref_target: T;
    ref_target_effective: T;
    hysteresis: T;
    attic_temp: T;
    circuit_on: boolean;
    supply_temp: T;
  };
  heat_pump: {
    compressor_on: boolean;
    running_since: string | null;
    power_w: T;
    condenser_out: T;
    return_temp: T;
    brine_in: T;
    brine_out: T;
    /** Logger bit pulsing before every compressor start: brine/primary pump pre-run, NOT a heater. */
    primary_prerun: boolean;
    discharge_temp: T;
    discharge_bar: T;
    suction_temp: T;
    suction_bar: T;
    runtime_today_h: T;
    starts_today: T;
    energy_today_kwh: T;
    motohours: T;
  };
  tank: { top: T; bottom: T; target: T; hysteresis: T; curve_target: T };
  dhw: { temp: T; target: T; reheat_below: T; valve_to_dhw: boolean };
  outdoor: { temp: T; min_today: T; max_today: T };
  pumps: { heating: boolean; secondary: boolean; circulation: boolean };
  backup_heater: { on: boolean; available: boolean };
  faults: {
    active: HeatingFault[];
    fatal: boolean;
    compressor_block: boolean;
    monitored: number;
  };
  curve: { points: Array<[number, number]>; outdoor_now: T };
  schedules: HeatingSchedule[];
  extras: {
    solar?: { temp: T } | null;
    pool?: { temp: T } | null;
    fish?: { temp: T } | null;
  };
  rooms: HeatingRoom[];
}

export type HistoryRange = 'day' | 'week' | 'month' | 'season' | 'all';
/** Series keys the UI asks for (backend maps them to statistic ids). */
export type HistoryKey =
  | 'tank_top'
  | 'tank_bottom'
  | 'dhw'
  | 'outdoor'
  | 'house_supply'
  | 'ref_temp'
  | 'compressor_runtime_h';
/** [ts_ms, mean, min, max] */
export type HistoryPoint = [number, number, number, number];

export interface HeatingHistory {
  range: HistoryRange;
  resolution: '5min' | 'hour' | 'day';
  series: Array<{ key: HistoryKey; unit: string; points: HistoryPoint[] }>;
  runs: Array<[number, number]>;
  annotations: Array<{ ts: number; text: string }>;
}

export interface HeatingSeason {
  season: string;
  partial: boolean;
  compressor_h: number;
  starts: number;
  median_run_min: number | null;
  degree_days: number | null;
  h_per_100dd: number | null;
  energy_kwh: number | null;
  energy_measured: boolean;
  coverage: number;
  outdoor_mean: number | null;
  backup_heater_h: number | null;
  /** Optional owner annotation (e.g. a change in the heated area). */
  note?: string | null;
}

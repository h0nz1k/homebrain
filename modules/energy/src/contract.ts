import type { DataQuality } from '@homebrain/contracts';

/**
 * Logical binding keys of the energy module (docs/requirements/energy.md).
 * Values are entity ids configured in the HomeBrain integration options, never in Git.
 */
export const ENERGY_BINDING_KEYS = [
  'energy_pv_power',
  // Optional per-string PV power (MPPT 1/2) – shown as detail of the sun node.
  'energy_pv1_power',
  'energy_pv2_power',
  'energy_grid_power',
  'energy_grid_import_power',
  'energy_grid_export_power',
  'energy_battery_soc',
  'energy_battery_power',
  'energy_house_power',
  'energy_phase_l1_power',
  'energy_phase_l2_power',
  'energy_phase_l3_power',
  // Optional signed grid power per phase at the grid meter (import +, export −): lets the hero
  // show import and export at the same time (one phase imports while another exports).
  'energy_grid_l1_power',
  'energy_grid_l2_power',
  'energy_grid_l3_power',
  // Optional per-phase grid current (A) and the main breaker rating (A, e.g. an input_number):
  // the 'Fáze' view compares each phase with the breaker; without sensors I ≈ P / 230 V, 25 A.
  'energy_grid_l1_current',
  'energy_grid_l2_current',
  'energy_grid_l3_current',
  'energy_main_breaker',
  'energy_pv_energy_today',
  'energy_grid_import_energy_today',
  'energy_grid_export_energy_today',
  'energy_house_energy_today',
  'energy_battery_charge_energy_today',
  'energy_battery_discharge_energy_today',
  'energy_pv_forecast_today',
  'energy_pv_forecast_tomorrow',
  'energy_spot_price_electricity',
  'energy_spot_prices_electricity_tomorrow',
  'energy_inverter_status',
  // Optional inverter detail (hub node + its sheet): AC output (+ to the board, − charging from
  // the grid), AC output per phase, error text/code, temperatures + battery cell stats (only bind working sensors),
  // PV string voltages, battery voltage/current.
  'energy_inverter_power',
  'energy_inverter_l1_power',
  'energy_inverter_l2_power',
  'energy_inverter_l3_power',
  'energy_inverter_error',
  'energy_pv1_voltage',
  'energy_pv2_voltage',
  'energy_battery_voltage',
  'energy_battery_current',
  'energy_inverter_temp_radiator',
  'energy_inverter_temp_air',
  'energy_battery_temp',
  'energy_battery_cell_temp_max',
  'energy_battery_cell_temp_min',
  'energy_battery_cell_voltage_max',
  'energy_battery_cell_voltage_min',
  'energy_battery_soh',
  // Costs (Náklady): own VT/NT tariff, fixed monthly fees, HDO and an optional meter correction;
  // spot comparison inputs (informative only). Numbers usually come from input_number helpers.
  'energy_tariff_price_vt',
  'energy_tariff_price_nt',
  'energy_tariff_fixed_monthly',
  'energy_tariff_hdo',
  'energy_tariff_next_change',
  'energy_meter_correction',
  'energy_spot_distribution_vt',
  'energy_spot_distribution_nt',
  'energy_spot_markup',
  'energy_spot_fixed_monthly',
  // Spotřebiče: power (W/kW), total energy (kWh, total_increasing), optional read-only switch.
  'energy_appliance_heat_pump_power',
  'energy_appliance_heat_pump_energy',
  'energy_appliance_heat_pump_switch',
  'energy_appliance_dishwasher_power',
  'energy_appliance_dishwasher_energy',
  'energy_appliance_dishwasher_switch',
  'energy_appliance_coffee_maker_power',
  'energy_appliance_coffee_maker_energy',
  'energy_appliance_coffee_maker_switch',
  'energy_appliance_dehumidifier_power',
  'energy_appliance_dehumidifier_energy',
  'energy_appliance_dehumidifier_switch',
] as const;
export type EnergyBindingKey = (typeof ENERGY_BINDING_KEYS)[number];

/** Keys whose recorder statistics feed the 24 h and 7 day charts (hourly/daily `change`). */
export const ENERGY_STATISTIC_KEYS = [
  'energy_pv_energy_today',
  'energy_house_energy_today',
  'energy_grid_import_energy_today',
  'energy_grid_export_energy_today',
] as const;
export type EnergyStatisticKey = (typeof ENERGY_STATISTIC_KEYS)[number];

export interface Reading {
  /** Normalised value (kW, kWh, %, Kč/kWh) or null when unusable – never a silent zero. */
  value: number | null;
  quality: DataQuality;
  updatedAt: string | null;
  bound: boolean;
}

export interface PricePoint {
  start: number;
  end: number;
  /** Kč/kWh */
  price: number;
}
export type PriceLevel = 'cheap' | 'normal' | 'expensive' | 'peak';
export interface PriceWindow {
  start: number;
  end: number;
  mean: number;
}

export interface StatPoint {
  start: number;
  /** kWh in the period */
  value: number;
}
export type EnergySeries = Partial<Record<EnergyStatisticKey, StatPoint[]>>;
export interface EnergyHistory {
  hourly: EnergySeries;
  daily: EnergySeries;
  status: 'idle' | 'loading' | 'ready' | 'error' | 'unsupported';
}

export interface EnergyModel {
  now: number;
  timeZone: string;
  quality: DataQuality;
  power: {
    pv: Reading;
    /** Optional per-string PV power (PV1, PV2); unbound readings when not configured. */
    pvStrings: [Reading, Reading];
    /** Signed grid power, import positive, export negative (kW). */
    grid: Reading;
    gridImport: Reading;
    gridExport: Reading;
    /** Signed battery power, discharge positive, charge negative (kW). */
    battery: Reading;
    house: Reading;
    houseDerived: boolean;
    /** House load per phase (inverter / Shelly 3EM). */
    phases: [Reading, Reading, Reading];
    phaseSpreadKw: number | null;
    /** Signed grid power per phase at the grid meter (import +); unbound when not configured. */
    gridPhases: [Reading, Reading, Reading];
    /** Import and export split for the flow diagram (see GridFlowMode). */
    gridFlow: GridFlow;
    /** Optional measured grid current per phase (A, magnitude). */
    gridCurrents: [Reading, Reading, Reading];
    /** Optional main breaker rating per phase (A). */
    breaker: Reading;
  };
  batterySoc: Reading;
  today: {
    pv: Reading;
    gridImport: Reading;
    gridExport: Reading;
    house: Reading;
    batteryCharge: Reading;
    batteryDischarge: Reading;
  };
  forecast: { today: Reading; tomorrow: Reading };
  price: {
    now: Reading;
    series: PricePoint[];
    intervalMinutes: number | null;
    averageToday: number | null;
    averageTomorrow: number | null;
    cheapestToday: PriceWindow | null;
    cheapestTomorrow: PriceWindow | null;
    /** Cheapest upcoming window within the next 24 h (may be in progress). */
    cheapestNext: PriceWindow | null;
    peakToday: PricePoint | null;
    next: PricePoint | null;
  };
  /** (house − import) / house · 100 for today; null when house energy is 0 or unknown. */
  selfSufficiencyPercent: number | null;
  /** Czech label of the inverter state (see `inverter` for raw + tone). */
  inverterStatus: string | null;
  inverter: InverterChip | null;
  inverterDetail: InverterDetail;
  notices: string[];
}

/**
 * How grid import/export are known: `phases` = per-phase meter powers (import and export can both
 * be > 0), `separate` = separate import/export sensors (both can be > 0), `net` = only a signed
 * net power (one line at most).
 */
export type GridFlowMode = 'phases' | 'separate' | 'net';
export interface GridFlow {
  mode: GridFlowMode;
  /** kW ≥ 0, null when unknown. */
  importKw: number | null;
  exportKw: number | null;
  /** Mode `phases`: per-phase grid power normalised to import + (kW). */
  phasesKw?: [number, number, number];
  /** Mode `phases`: sign that turns the raw meter readings into import + (GoodWe: −1). */
  meterSign?: 1 | -1;
}

export interface InverterDetail {
  /** AC output (kW, + to the AC board, − charging the battery from the grid). */
  acPower: Reading;
  acPhases: [Reading, Reading, Reading];
  /** Active error (Czech label), null when none / not bound. */
  error: { raw: string; label: string } | null;
  /** Radiator (heat sink) and internal air temperature (°C); implausible values → null. */
  tempRadiator: Reading;
  tempAir: Reading;
  pvVoltages: [Reading, Reading];
  batteryVoltage: Reading;
  batteryCurrent: Reading;
  batteryTemp: Reading;
  cellTempMax: Reading;
  cellTempMin: Reading;
  /** Cell voltages (V). */
  cellVoltageMax: Reading;
  cellVoltageMin: Reading;
  /** State of health (%). */
  soh: Reading;
}

export interface InverterChip {
  raw: string;
  label: string;
  tone: 'ok' | 'warn' | 'err' | 'idle';
}

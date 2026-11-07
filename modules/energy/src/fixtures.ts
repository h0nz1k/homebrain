import type { EntityStateLike } from '@homebrain/ha-client';
import { localDayStarter, localParts, startOfLocalDay } from './adapter.js';
import type { ComparisonResult } from './compare.js';
import type { EnergyBindingKey } from './contract.js';

/*
 * Synthetic fixtures. The shape mirrors an anonymised production review (2026-10-31):
 * power sensors in W (`measurement`, ~5 s updates, change-based last_updated), daily counters in
 * kWh (`total_increasing`, reset at midnight), SoC in %, spot price in Kč/kWh with hourly
 * ISO-timestamp attributes for today + tomorrow, a tomorrow "hour order" sensor with
 * `[order, price]` pairs, forecast.solar kWh for today/tomorrow. Entity ids are fake.
 */
export const DEMO_ENERGY_BINDINGS: Record<EnergyBindingKey, string> = {
  energy_pv_power: 'sensor.demo_energy_pv_power',
  energy_pv1_power: 'sensor.demo_energy_pv1_power',
  energy_pv2_power: 'sensor.demo_energy_pv2_power',
  energy_grid_power: 'sensor.demo_energy_grid_power',
  energy_grid_import_power: 'sensor.demo_energy_grid_import_power',
  energy_grid_export_power: 'sensor.demo_energy_grid_export_power',
  energy_battery_soc: 'sensor.demo_energy_battery_soc',
  energy_battery_power: 'sensor.demo_energy_battery_power',
  energy_house_power: 'sensor.demo_energy_house_power',
  energy_phase_l1_power: 'sensor.demo_energy_phase_l1_power',
  energy_phase_l2_power: 'sensor.demo_energy_phase_l2_power',
  energy_phase_l3_power: 'sensor.demo_energy_phase_l3_power',
  energy_grid_l1_power: 'sensor.demo_energy_grid_l1_power',
  energy_grid_l2_power: 'sensor.demo_energy_grid_l2_power',
  energy_grid_l3_power: 'sensor.demo_energy_grid_l3_power',
  // Like production: no per-phase current sensors (current estimated from power), 3×25 A breaker.
  energy_grid_l1_current: '',
  energy_grid_l2_current: '',
  energy_grid_l3_current: '',
  energy_main_breaker: 'input_number.demo_energy_main_breaker',
  energy_pv_energy_today: 'sensor.demo_energy_pv_today',
  energy_grid_import_energy_today: 'sensor.demo_energy_import_today',
  energy_grid_export_energy_today: 'sensor.demo_energy_export_today',
  energy_house_energy_today: 'sensor.demo_energy_house_today',
  energy_battery_charge_energy_today: 'sensor.demo_energy_battery_charge_today',
  energy_battery_discharge_energy_today: 'sensor.demo_energy_battery_discharge_today',
  energy_pv_forecast_today: 'sensor.demo_energy_forecast_today',
  energy_pv_forecast_tomorrow: 'sensor.demo_energy_forecast_tomorrow',
  energy_spot_price_electricity: 'sensor.demo_energy_spot_price',
  energy_spot_prices_electricity_tomorrow: 'sensor.demo_energy_spot_tomorrow_order',
  energy_inverter_status: 'sensor.demo_energy_inverter_mode',
  energy_inverter_power: 'sensor.demo_energy_inverter_power',
  energy_inverter_l1_power: 'sensor.demo_energy_inverter_l1_power',
  energy_inverter_l2_power: 'sensor.demo_energy_inverter_l2_power',
  energy_inverter_l3_power: 'sensor.demo_energy_inverter_l3_power',
  energy_inverter_error: 'sensor.demo_energy_inverter_errors',
  energy_pv1_voltage: 'sensor.demo_energy_pv1_voltage',
  energy_pv2_voltage: 'sensor.demo_energy_pv2_voltage',
  energy_battery_voltage: 'sensor.demo_energy_battery_voltage',
  energy_battery_current: 'sensor.demo_energy_battery_current',
  energy_inverter_temp_radiator: 'sensor.demo_energy_inverter_temp_radiator',
  energy_inverter_temp_air: 'sensor.demo_energy_inverter_temp_air',
  energy_battery_temp: 'sensor.demo_energy_battery_temp',
  energy_battery_cell_temp_max: 'sensor.demo_energy_battery_cell_temp_max',
  energy_battery_cell_temp_min: 'sensor.demo_energy_battery_cell_temp_min',
  energy_battery_cell_voltage_max: 'sensor.demo_energy_battery_cell_voltage_max',
  energy_battery_cell_voltage_min: 'sensor.demo_energy_battery_cell_voltage_min',
  energy_battery_soh: 'sensor.demo_energy_battery_soh',
  energy_tariff_price_vt: 'input_number.demo_price_vt',
  energy_tariff_price_nt: 'input_number.demo_price_nt',
  energy_tariff_fixed_monthly: 'input_number.demo_fixed_monthly',
  energy_tariff_hdo: 'binary_sensor.demo_hdo_low_tariff',
  energy_tariff_next_change: '',
  energy_meter_correction: 'input_number.demo_meter_correction',
  energy_spot_distribution_vt: 'input_number.demo_spot_distribution_vt',
  energy_spot_distribution_nt: 'input_number.demo_spot_distribution_nt',
  energy_spot_markup: 'input_number.demo_spot_markup',
  energy_spot_fixed_monthly: 'input_number.demo_spot_fixed_monthly',
  energy_appliance_heat_pump_power: 'sensor.demo_heat_pump_power',
  energy_appliance_heat_pump_energy: 'sensor.demo_heat_pump_energy',
  energy_appliance_heat_pump_switch: '',
  energy_appliance_dishwasher_power: 'sensor.demo_dishwasher_power',
  energy_appliance_dishwasher_energy: 'sensor.demo_dishwasher_energy',
  energy_appliance_dishwasher_switch: 'switch.demo_dishwasher_plug',
  energy_appliance_coffee_maker_power: 'sensor.demo_coffee_maker_power',
  energy_appliance_coffee_maker_energy: 'sensor.demo_coffee_maker_energy',
  energy_appliance_coffee_maker_switch: 'switch.demo_coffee_maker_plug',
  energy_appliance_dehumidifier_power: 'sensor.demo_dehumidifier_power',
  energy_appliance_dehumidifier_energy: 'sensor.demo_dehumidifier_energy',
  energy_appliance_dehumidifier_switch: 'switch.demo_dehumidifier_plug',
};

/** Hourly spot price shapes (Kč/kWh) – synthetic, typical autumn day. */
export const DEMO_PRICES_TODAY = [
  2.1, 2.0, 1.9, 1.9, 1.9, 2.1, 2.7, 3.4, 3.8, 3.1, 2.4, 1.85, 1.3, 0.9, 0.9, 1.1, 2.05, 3.3, 4.92,
  4.6, 3.7, 2.95, 2.5, 2.1,
];
export const DEMO_PRICES_TOMORROW = [
  2.05, 1.95, 1.9, 1.9, 1.9, 2.1, 2.6, 3.3, 3.5, 2.8, 2.1, 1.4, 0.95, 0.8, 0.77, 0.9, 1.9, 3.2,
  4.45, 4.3, 3.5, 2.85, 2.45, 2.2,
];

export type EnergyScenario = 'day' | 'night' | 'unavailable' | 'anomaly' | 'nodata';
/** PV forecast demo: Open-Meteo fallback, HA Energy forecast, not configured, fetch error. */
export type PvForecastScenario = 'fallback' | 'ha' | 'unconfigured' | 'error';

/** Forecast (kW) for a local hour – a generic 4 kWp demo array matching the live demo curve. */
export function demoPvForecastKw(hour: number): number {
  return demoPvKw(hour);
}
/** Demo system options (generic, not a real home): AC limit, battery, export limit. */
export const DEMO_PV_SYSTEM = {
  inverter_ac_limit_kw: 4,
  battery_capacity_kwh: 5,
  export_limit_kw: 1,
};
const sumForecast = (factor: number) => {
  let sum = 0;
  for (let h = 0; h < 24; h++) sum += demoPvForecastKw(h + 0.5) * factor;
  return Math.round(sum * 10) / 10;
};
/** Daily totals of the demo forecast (bound forecast sensors show the same numbers). */
export const DEMO_PV_FORECAST_KWH = { today: sumForecast(1), tomorrow: sumForecast(0.8) };

/**
 * Mock replies for `homebrain/energy/pv_forecast` and `energy/solar_forecast` covering
 * today + tomorrow (hourly, local hours of the given zone).
 */
export function createPvForecastDemo(
  now: number,
  scenario: PvForecastScenario = 'fallback',
  timeZone = 'Europe/Prague',
) {
  const dayStart = startOfLocalDay(now, timeZone);
  const points: { start: string; end: string; kw: number }[] = [];
  const days: Record<string, number> = {};
  for (let d = 0; d < 2; d++) {
    const start = startOfLocalDay(dayStart + d * 26 * HOUR, timeZone);
    const end = startOfLocalDay(start + 26 * HOUR, timeZone);
    let sum = 0;
    for (let t = start, h = 0; t < end; t += HOUR, h++) {
      const kw = Math.round(demoPvForecastKw(h + 0.5) * (d === 1 ? 0.8 : 1) * 1000) / 1000;
      points.push({ start: new Date(t).toISOString(), end: new Date(t + HOUR).toISOString(), kw });
      sum += kw;
    }
    days[new Date(start + 12 * HOUR).toISOString().slice(0, 10)] = Math.round(sum * 100) / 100;
  }
  const server =
    scenario === 'fallback'
      ? {
          status: 'ok',
          source: 'open_meteo',
          points,
          days,
          array: { kwp: 4, tilt: 35, azimuth: 0, assumed: ['tilt'] },
          system: DEMO_PV_SYSTEM,
        }
      : {
          status: scenario === 'error' ? 'error' : 'unconfigured',
          source: 'open_meteo',
          points: [],
          days: {},
          array: null,
          system: scenario === 'ha' ? DEMO_PV_SYSTEM : {},
        };
  const wh_hours = Object.fromEntries(
    points.filter((p) => p.kw > 0).map((p) => [p.start, Math.round(p.kw * 1000)]),
  );
  return {
    server,
    ha: scenario === 'ha' ? { demo_forecast_entry: { wh_hours } } : {},
  };
}
/** Dishwasher demo: mid-program, program finished 25 min ago, or idle all day. */
export type DishwasherScenario = 'running' | 'finished' | 'idle';
const HOUR = 3_600_000;

/** Bell-shaped PV curve (kW) for a given local hour. */
export function demoPvKw(hour: number): number {
  return hour < 6.5 || hour > 17.5 ? 0 : Math.max(0, 3.3 * Math.exp(-((hour - 12) ** 2) / 8));
}
/** House baseline (kW) for a local hour: night base, morning and evening peaks. */
export function demoHouseKw(hour: number): number {
  return (
    0.35 + 0.5 * Math.exp(-((hour - 7.5) ** 2) / 1.5) + 0.9 * Math.exp(-((hour - 19) ** 2) / 3)
  );
}

function entity(
  entity_id: string,
  state: string | number,
  attributes: Record<string, unknown>,
  updated: number,
): EntityStateLike {
  return {
    entity_id,
    state: String(state),
    attributes,
    last_updated: new Date(updated).toISOString(),
  };
}

/** Synthetic HDO schedule (NT everywhere except VT 8–9, 12–13, 17–18, 20–21 h). */
export const DEMO_HDO_ATTRS = {
  hdo_cas_od: ['00:00:00', '09:00:00', '13:00:00', '18:00:00', '21:00:00'],
  hdo_cas_do: ['08:00:00', '12:00:00', '17:00:00', '20:00:00', '23:59:00'],
};
const DEMO_VT_HOURS = [8, 12, 17, 20];
/** Synthetic tariff, fees and spot comparison inputs (not any real price list). */
function tariffStates(now: number, timeZone: string): EntityStateLike[] {
  const b = DEMO_ENERGY_BINDINGS;
  const kc = { unit_of_measurement: 'Kč/kWh' };
  const vt = DEMO_VT_HOURS.includes(localParts(now, timeZone).hour);
  return [
    entity(b.energy_tariff_price_vt, 5.12, kc, now - HOUR),
    entity(b.energy_tariff_price_nt, 4.31, kc, now - HOUR),
    entity(b.energy_tariff_fixed_monthly, 840, { unit_of_measurement: 'Kč' }, now - HOUR),
    entity(b.energy_meter_correction, 1.05, {}, now - HOUR),
    entity(b.energy_tariff_hdo, vt ? 'off' : 'on', DEMO_HDO_ATTRS, now - HOUR),
    entity(b.energy_spot_distribution_vt, 1.36, kc, now - HOUR),
    entity(b.energy_spot_distribution_nt, 0.62, kc, now - HOUR),
    entity(b.energy_spot_markup, 0.35, kc, now - HOUR),
    entity(b.energy_spot_fixed_monthly, 760, { unit_of_measurement: 'Kč' }, now - HOUR),
  ];
}
/** Synthetic hourly raw spot price (Kč/kWh excl. VAT): morning and evening peaks, cheap noon. */
export function demoSpotPrice(hour: number, dayIndex: number): number {
  const peak = hour >= 6 && hour < 9 ? 1.3 : hour >= 17 && hour < 21 ? 1.7 : 0;
  const noon = hour >= 11 && hour < 15 ? -0.7 : 0;
  return Math.max(0.2, 2.3 + peak + noon + 0.4 * Math.sin(dayIndex / 9));
}

export function createEnergyDemo(
  now: number,
  scenario: EnergyScenario = 'day',
  timeZone = 'Europe/Prague',
  dishwasher: DishwasherScenario = 'running',
) {
  const b = DEMO_ENERGY_BINDINGS;
  const dayStart = startOfLocalDay(now, timeZone);
  const hour = (now - dayStart) / HOUR;
  const night = scenario === 'night';
  const pvKw = night ? 0 : demoPvKw(hour) * 0.82;
  const houseKw = scenario === 'anomaly' ? 6.4 : night ? 0.55 : demoHouseKw(hour) + 0.1;
  // Day SoC follows the sun: ~58 % before noon, full by early afternoon.
  const soc = night ? 9 : Math.round(Math.min(100, Math.max(58, 58 + (hour - 11) * 42)));
  const batteryKw = night ? 0.25 : pvKw > houseKw && soc < 100 ? -Math.min(1.1, pvKw - houseKw) : 0; // + discharge
  const gridKw = houseKw - pvKw - batteryKw; // + import
  const W = { unit_of_measurement: 'W', device_class: 'power', state_class: 'measurement' };
  const kWh = {
    unit_of_measurement: 'kWh',
    device_class: 'energy',
    state_class: 'total_increasing',
  };
  const fresh = now - 4_000;
  const priceAttrs: Record<string, unknown> = {
    unit_of_measurement: 'Kč/kWh',
    state_class: 'measurement',
    friendly_name: 'Spotová cena elektřiny',
  };
  const orderAttrs: Record<string, unknown> = { friendly_name: 'Pořadí hodin zítra' };
  DEMO_PRICES_TODAY.forEach(
    (p, i) => (priceAttrs[new Date(dayStart + i * HOUR).toISOString()] = p),
  );
  const tomorrowStart = dayStart + 24 * HOUR;
  const order = [...DEMO_PRICES_TOMORROW]
    .map((p, i) => [p, i] as const)
    .sort((a, b) => a[0] - b[0]);
  DEMO_PRICES_TOMORROW.forEach((p, i) => {
    const key = new Date(tomorrowStart + i * HOUR).toISOString();
    priceAttrs[key] = p;
    orderAttrs[key] = [order.findIndex(([, idx]) => idx === i) + 1, p];
  });
  const priceNow = DEMO_PRICES_TODAY[Math.min(23, Math.floor(hour))]!;
  const integrate = (fn: (h: number) => number) => {
    let sum = 0;
    for (let h = 0; h < hour; h += 0.25) sum += fn(h) * 0.25;
    return sum;
  };
  const pvToday = night ? 0 : integrate((h) => demoPvKw(h) * 0.82);
  const houseToday = integrate((h) => demoHouseKw(h) + 0.1);
  const importToday = integrate((h) =>
    Math.max(0, demoHouseKw(h) + 0.1 - demoPvKw(h) * 0.82 - (h < 6 ? 0.2 : 0)),
  );
  const exportToday = night
    ? 0
    : integrate((h) => Math.max(0, demoPvKw(h) * 0.82 - demoHouseKw(h) - 1.2));
  const phaseShare = [0.46, 0.26, 0.28];
  // Spotřebiče: dishwasher program as power steps (W) relative to now, oldest first.
  const T0 = now - 133 * 60_000;
  const dishwasherSteps: Array<[number, number]> =
    dishwasher === 'idle'
      ? [[now - 6 * HOUR, 0.5]]
      : dishwasher === 'finished'
        ? [
            [now - 6 * HOUR, 0.5],
            [T0, 2100],
            [T0 + 20 * 60_000, 40],
            [T0 + 70 * 60_000, 2000],
            [T0 + 85 * 60_000, 30],
            [T0 + 108 * 60_000, 0.6],
          ]
        : [
            [now - 6 * HOUR, 0.5],
            [now - 35 * 60_000, 2100],
            [now - 15 * 60_000, 42],
            [now - 2 * 60_000, 1860],
          ];
  const dishwasherW = dishwasherSteps[dishwasherSteps.length - 1]![1];
  const applianceW = {
    // Part of the house load (keeps the demo consistent with energy_house_power).
    heat_pump: Math.round(houseKw * (night ? 0.6 : 0.45) * 1000),
    dishwasher: night ? 0.4 : dishwasherW,
    coffee_maker: night ? 0 : 2.1,
    dehumidifier: night ? 0 : Math.round(houseKw * 0.2 * 1000),
  };
  /** Today's kWh as a share of the house counter (keeps the demo consistent). */
  const applianceShare = {
    heat_pump: 0.38,
    dishwasher: 0.11,
    coffee_maker: 0.02,
    dehumidifier: 0.05,
  };
  const applianceStates = () =>
    (Object.keys(applianceW) as Array<keyof typeof applianceW>).flatMap((slot) => {
      const power = b[`energy_appliance_${slot}_power`];
      const energy = b[`energy_appliance_${slot}_energy`];
      const sw = b[`energy_appliance_${slot}_switch`];
      return [
        entity(
          power,
          applianceW[slot],
          W,
          slot === 'dishwasher' ? dishwasherSteps[dishwasherSteps.length - 1]![0] : fresh,
        ),
        entity(energy, (120 + applianceShare[slot] * houseToday).toFixed(2), kWh, fresh),
        ...(sw
          ? [entity(sw, night && slot !== 'dishwasher' ? 'off' : 'on', {}, now - 5 * HOUR)]
          : []),
      ];
    });
  const states: EntityStateLike[] = [
    entity(b.energy_pv_power, Math.round(pvKw * 1000), W, fresh),
    entity(b.energy_pv1_power, Math.round(pvKw * 550), W, fresh),
    entity(b.energy_pv2_power, Math.round(pvKw * 450), W, fresh),
    entity(b.energy_grid_power, Math.round(gridKw * 1000), W, fresh),
    entity(b.energy_grid_import_power, Math.round(Math.max(0, gridKw) * 1000), W, fresh),
    entity(b.energy_grid_export_power, Math.round(Math.max(0, -gridKw) * 1000), W, fresh),
    entity(b.energy_battery_power, Math.round(batteryKw * 1000), W, fresh),
    entity(b.energy_house_power, Math.round(houseKw * 1000), W, fresh),
    entity(
      b.energy_battery_soc,
      soc,
      { unit_of_measurement: '%', device_class: 'battery' },
      now - 40 * 60_000,
    ),
    ...phaseShare.map((share, i) =>
      entity(
        [b.energy_phase_l1_power, b.energy_phase_l2_power, b.energy_phase_l3_power][i]!,
        Math.round(houseKw * share * 1000),
        W,
        fresh,
      ),
    ),
    // Grid meter per phase (import +): the base demo splits the net evenly (no mixed phases).
    ...[b.energy_grid_l1_power, b.energy_grid_l2_power, b.energy_grid_l3_power].map((id) =>
      entity(id, Math.round((gridKw * 1000) / 3), W, fresh),
    ),
    entity(b.energy_main_breaker, '25.0', { unit_of_measurement: 'A' }, now - 30 * 24 * HOUR),
    entity(b.energy_pv_energy_today, pvToday.toFixed(1), kWh, fresh),
    entity(b.energy_grid_import_energy_today, importToday.toFixed(1), kWh, fresh),
    entity(b.energy_grid_export_energy_today, exportToday.toFixed(1), kWh, fresh),
    entity(b.energy_house_energy_today, houseToday.toFixed(1), kWh, fresh),
    entity(b.energy_battery_charge_energy_today, night ? 4.6 : 0.6, kWh, fresh),
    entity(b.energy_battery_discharge_energy_today, night ? 3.8 : 0.4, kWh, fresh),
    entity(
      b.energy_pv_forecast_today,
      DEMO_PV_FORECAST_KWH.today,
      { unit_of_measurement: 'kWh', device_class: 'energy' },
      now - HOUR,
    ),
    entity(
      b.energy_pv_forecast_tomorrow,
      DEMO_PV_FORECAST_KWH.tomorrow,
      { unit_of_measurement: 'kWh', device_class: 'energy' },
      now - HOUR,
    ),
    entity(
      b.energy_spot_price_electricity,
      priceNow,
      priceAttrs,
      dayStart + Math.floor(hour) * HOUR,
    ),
    entity(b.energy_spot_prices_electricity_tomorrow, 'unknown', orderAttrs, now - HOUR),
    entity(
      b.energy_inverter_status,
      night ? 'Wait Mode' : 'Normal (On-Grid)',
      { device_class: 'enum' },
      now - HOUR,
    ),
    ...inverterStates(pvKw, batteryKw, night ? 'Wait Mode' : 'Normal (On-Grid)', '', fresh),
    ...tariffStates(now, timeZone),
    ...applianceStates(),
  ].map((state) =>
    (scenario === 'unavailable' && state.entity_id !== b.energy_spot_price_electricity) ||
    scenario === 'nodata'
      ? {
          ...state,
          state: 'unavailable',
          attributes: scenario === 'nodata' ? { friendly_name: state.entity_id } : state.attributes,
        }
      : state,
  );
  return {
    bindings: Object.fromEntries(Object.entries(b).filter(([, id]) => id)) as Record<
      string,
      string
    >,
    states: Object.fromEntries(states.map((s) => [s.entity_id, s])),
    /** Mock reply for WS `recorder/statistic_during_period` (appliance kWh today). */
    statistic(message: { statistic_id?: string }) {
      const slot = (Object.keys(applianceShare) as Array<keyof typeof applianceShare>).find(
        (s) => b[`energy_appliance_${s}_energy`] === message.statistic_id,
      );
      if (!slot || scenario === 'unavailable') return {};
      // The dishwasher counter matches its program (≈1,2 kWh finished, ≈0,8 kWh mid-program).
      const kwh =
        slot !== 'dishwasher'
          ? applianceShare[slot] * houseToday
          : dishwasher === 'finished'
            ? 1.245
            : dishwasher === 'running'
              ? 0.76
              : 0;
      return { change: Number(kwh.toFixed(3)) };
    },
    /** Mock reply for WS `history/history_during_period` (compressed, minimal response). */
    history(message: { entity_ids?: string[] }) {
      const out: Record<string, Array<{ s: string; lu: number; a?: Record<string, unknown> }>> = {};
      for (const id of message.entity_ids ?? [])
        if (id === b.energy_appliance_dishwasher_power)
          out[id] = dishwasherSteps.map(([t, w], i) => ({
            s: scenario === 'unavailable' ? 'unavailable' : String(w),
            lu: t / 1000,
            ...(i === 0 ? { a: { unit_of_measurement: 'W' } } : {}),
          }));
      return out;
    },
    /** Mock reply for WS `recorder/statistics_during_period`. */
    statistics(message: { period?: string; start_time?: string; statistic_ids?: string[] }) {
      const start = Date.parse(message.start_time ?? '') || now - 24 * HOUR;
      const dayOf = localDayStarter(timeZone);
      const daily = message.period === 'day';
      const step = daily ? 24 * HOUR : HOUR;
      const series: Record<
        string,
        Array<{ start: number; end: number; change?: number; mean?: number }>
      > = {};
      // 5-minute mean grid power per phase (kW, import +) for the 'Fáze' detail.
      const gridPhaseIds = [b.energy_grid_l1_power, b.energy_grid_l2_power, b.energy_grid_l3_power];
      if (message.period === '5minute') {
        const FIVE = 5 * 60_000;
        for (const id of message.statistic_ids ?? []) {
          const phase = gridPhaseIds.indexOf(id);
          if (phase < 0 || scenario === 'unavailable') continue;
          const rows = [];
          for (let t = Math.ceil(start / FIVE) * FIVE; t < now; t += FIVE) {
            const h = (t - dayOf(t)) / HOUR;
            rows.push({
              start: t,
              end: t + FIVE,
              mean: Number(demoGridPhaseKw(h, phase).toFixed(3)),
            });
          }
          series[id] = rows;
        }
        return series;
      }
      const curves: Record<string, (h: number, d: number) => number> = {
        [b.energy_pv_energy_today]: (h, d) =>
          night && d === 0 ? 0 : demoPvKw(h) * (0.6 + 0.08 * ((d * 7) % 5)),
        [b.energy_house_energy_today]: (h) => demoHouseKw(h) + 0.1,
        [b.energy_grid_import_energy_today]: (h, d) =>
          Math.max(0, demoHouseKw(h) + 0.1 - demoPvKw(h) * (0.6 + 0.08 * ((d * 7) % 5))),
        [b.energy_grid_export_energy_today]: (h, d) =>
          Math.max(0, demoPvKw(h) * (0.6 + 0.08 * ((d * 7) % 5)) - demoHouseKw(h) - 1.2),
      };
      for (const id of message.statistic_ids ?? []) {
        const curve = curves[id];
        if (!curve) continue;
        const rows = [];
        for (let t = start; t < now; t += step) {
          const d = Math.round((dayStart - dayOf(t)) / (24 * HOUR));
          let change = 0;
          if (daily) {
            const hours = d === 0 ? hour : 24;
            for (let h = 0; h < hours; h += 0.5) change += curve(h, d) * 0.5;
          } else change = curve((t - dayOf(t)) / HOUR + 0.5, d);
          rows.push({ start: t, end: t + step, change: Number(change.toFixed(3)) });
        }
        series[id] = rows;
      }
      // Hourly mean spot price (Kč/kWh) for the cost comparison.
      if (
        message.period === 'hour' &&
        (message.statistic_ids ?? []).includes(b.energy_spot_price_electricity)
      ) {
        const rows = [];
        for (let t = start; t < now; t += HOUR) {
          const h = Math.round((t - dayOf(t)) / HOUR);
          rows.push({
            start: t,
            end: t + HOUR,
            mean: Number(demoSpotPrice(h, Math.floor(t / (24 * HOUR))).toFixed(4)),
          });
        }
        series[b.energy_spot_price_electricity] = rows;
      }
      // Hourly mean temperatures (°C): radiator follows the PV curve, battery is steady.
      if (message.period === 'hour')
        for (const id of message.statistic_ids ?? []) {
          const tempOf: Record<string, (h: number) => number> = {
            [b.energy_inverter_temp_radiator]: (h) => 22 + demoPvKw(h) * 4.1,
            [b.energy_inverter_temp_air]: (h) => 24 + demoPvKw(h) * 2.2,
            [b.energy_battery_temp]: (h) => 19 + 0.8 * Math.sin(((h - 9) / 24) * 2 * Math.PI),
            [b.energy_battery_cell_temp_max]: (h) =>
              20.6 + 1.1 * Math.sin(((h - 9) / 24) * 2 * Math.PI),
          };
          const f = tempOf[id];
          if (!f || scenario === 'unavailable') continue;
          const rows = [];
          for (let t = Math.ceil(start / HOUR) * HOUR; t < now; t += HOUR) {
            const h = (t - dayOf(t)) / HOUR + 0.5;
            rows.push({ start: t, end: t + HOUR, mean: Number(f(h).toFixed(2)) });
          }
          series[id] = rows;
        }
      return series;
    },
  };
}

/**
 * Synthetic per-phase grid power over a day (kW, import +): base load on all phases, the heat pump
 * cycles on L1 (early morning + evening), the oven on L2 around lunch, solar surplus exported
 * evenly at noon – gives a realistic asymmetry history for the 'Fáze' sparklines.
 */
export function demoGridPhaseKw(h: number, phase: number): number {
  const base = [0.16, 0.12, 0.2][phase]!;
  const cycle = (h * 60) % 60 < 22; // 22 min of every hour
  const heatPump = phase === 0 && (h < 6.5 || (h >= 17 && h < 22.5)) && cycle ? 2.4 : 0;
  const oven = phase === 1 && h >= 11.2 && h < 12.1 ? 2.9 : 0;
  const kettle = phase === 2 && ((h >= 7 && h < 7.1) || (h >= 19.5 && h < 19.6)) ? 2.0 : 0;
  const surplus = Math.max(0, demoPvKw(h) - demoHouseKw(h) - 1.2) / 3;
  return base + heatPump + oven + kettle - surplus;
}

/** Inverter detail entities (AC output = PV + discharge − charge, losses ignored). */
function inverterStates(
  pvKw: number,
  batteryKw: number,
  mode: string,
  errors: string,
  at: number,
): EntityStateLike[] {
  const b = DEMO_ENERGY_BINDINGS;
  const W = { unit_of_measurement: 'W', device_class: 'power' };
  const V = { unit_of_measurement: 'V', device_class: 'voltage' };
  const C = { unit_of_measurement: '°C', device_class: 'temperature' };
  const ac = mode === 'Fault Mode' ? 0 : pvKw + batteryKw;
  const vBat = 348 + Math.max(-4, Math.min(6, batteryKw * 2));
  const mk = (id: string, state: number | string, attrs: Record<string, unknown>) =>
    entity(id, state, attrs, at);
  return [
    mk(b.energy_inverter_power, Math.round(ac * 1000), W),
    ...[0.34, 0.33, 0.33].map((share, i) =>
      mk(
        [b.energy_inverter_l1_power, b.energy_inverter_l2_power, b.energy_inverter_l3_power][i]!,
        Math.round(ac * share * 1000),
        W,
      ),
    ),
    mk(b.energy_inverter_error, errors, {}),
    mk(b.energy_pv1_voltage, pvKw > 0.05 ? 382.4 : 0, V),
    mk(b.energy_pv2_voltage, pvKw > 0.05 ? 361.8 : 0, V),
    mk(b.energy_battery_voltage, Math.round(vBat * 10) / 10, V),
    mk(b.energy_battery_current, Math.round(((batteryKw * 1000) / vBat) * 10) / 10, {
      unit_of_measurement: 'A',
      device_class: 'current',
    }),
    mk(b.energy_inverter_temp_radiator, mode === 'Fault Mode' ? 31.2 : 22 + pvKw * 4.1, C),
    mk(b.energy_inverter_temp_air, mode === 'Fault Mode' ? 29.5 : 24 + pvKw * 2.2, C),
    mk(b.energy_battery_temp, 19.6, C),
    mk(b.energy_battery_cell_temp_max, 21.3, C),
    mk(b.energy_battery_cell_temp_min, 18.1, C),
    mk(b.energy_battery_cell_voltage_max, batteryKw < -0.05 ? 3.402 : 3.338, V),
    mk(b.energy_battery_cell_voltage_min, batteryKw < -0.05 ? 3.384 : 3.326, V),
    mk(b.energy_battery_soh, 96, { unit_of_measurement: '%' }),
  ];
}

/*
 * Hero flow scenarios (`?flow=` in the panel dev server) – override the live power readings of
 * the base demo with a consistent balance: PV + import + discharge = house + export + charge.
 */
export type FlowScenario =
  | 'noon'
  | 'evening'
  | 'night'
  | 'nightcharge'
  | 'suncharge'
  | 'mixed'
  | 'morning'
  | 'cloudy'
  | 'balanced'
  | 'asym'
  | 'fault';
export interface FlowScenarioValues {
  pv1Kw: number;
  pv2Kw: number;
  /** + discharge, − charge */
  batteryKw: number;
  houseKw: number;
  soc: number;
  appliancesW: Record<'heat_pump' | 'dishwasher' | 'coffee_maker' | 'dehumidifier', number>;
  /** Grid meter per phase (kW, import +); default = net split evenly. Must sum to the net. */
  gridPhasesKw?: [number, number, number];
  /** House load per phase (kW); default = house split 46/26/28 %. */
  housePhasesKw?: [number, number, number];
  /** Inverter work mode + error text; default Normal (On-Grid) by day, Wait Mode without PV. */
  inverter?: { mode: string; errors: string };
  /**
   * Net grid meter (kW, import +) when it differs from the phase sum (sampled at another moment,
   * prod GoodWe `active_power` vs `meter_active_power_l*`); default = the balance.
   */
  gridNetKw?: number;
}
export const FLOW_SCENARIOS: Record<FlowScenario, FlowScenarioValues> = {
  // Sunny noon: PV covers the house, charges the battery and exports; heat pump + dishwasher run.
  noon: {
    pv1Kw: 3.12,
    pv2Kw: 2.58,
    batteryKw: -1.4,
    houseKw: 3.62,
    soc: 64,
    appliancesW: { heat_pump: 1180, dishwasher: 1860, coffee_maker: 2.1, dehumidifier: 0 },
  },
  // Evening: battery feeds the house, the coffee maker heats up.
  evening: {
    pv1Kw: 0.05,
    pv2Kw: 0.03,
    batteryKw: 1.86,
    houseKw: 1.94,
    soc: 71,
    appliancesW: { heat_pump: 12, dishwasher: 0.4, coffee_maker: 1350, dehumidifier: 0 },
  },
  // Night: battery at reserve, the grid covers a quiet base load.
  night: {
    pv1Kw: 0,
    pv2Kw: 0,
    batteryKw: 0,
    houseKw: 0.42,
    soc: 10,
    appliancesW: { heat_pump: 6, dishwasher: 0.4, coffee_maker: 0, dehumidifier: 0 },
  },
  // Cheap night tariff: the grid feeds the house and charges the battery, nothing is exported.
  nightcharge: {
    pv1Kw: 0,
    pv2Kw: 0,
    batteryKw: -2.5,
    houseKw: 0.48,
    soc: 38,
    appliancesW: { heat_pump: 6, dishwasher: 0.4, coffee_maker: 0, dehumidifier: 0 },
  },
  // Sunny day + forced grid charging: the sun covers the house, the battery charges 9.4 kW from the
  // sun (3.1) AND the grid (6.3) – own sources must not claim 100 %.
  suncharge: {
    pv1Kw: 2.6,
    pv2Kw: 2.1,
    batteryKw: -9.4,
    houseKw: 1.6,
    soc: 42,
    appliancesW: { heat_pump: 6, dishwasher: 0.4, coffee_maker: 0, dehumidifier: 0 },
  },
  // 3-phase house with a hybrid inverter: the kettle on L1 imports 0.8 kW while L2 + L3 export
  // 2.1 kW of solar surplus → two grid lines (grid → house and PV → grid) at the same time.
  mixed: {
    pv1Kw: 2.3,
    pv2Kw: 1.9,
    batteryKw: -0.6,
    houseKw: 2.3,
    soc: 58,
    appliancesW: { heat_pump: 0, dishwasher: 0.4, coffee_maker: 1350, dehumidifier: 0 },
    gridPhasesKw: [0.8, -1.05, -1.05],
  },
  // Grey morning (prod bug rc.13): weak PV, empty battery, the house mostly from the grid, a
  // trickle exported on L3 → pv → house and grid → house share the short bus leg to the house.
  morning: {
    pv1Kw: 0.3,
    pv2Kw: 0.3,
    batteryKw: 0,
    houseKw: 3.2,
    soc: 10,
    appliancesW: { heat_pump: 0, dishwasher: 0.4, coffee_maker: 0, dehumidifier: 0 },
    gridPhasesKw: [1.9, 0.8, -0.1],
  },
  // Cloudy afternoon (prod 14:06, rc.13.1 screenshot): weak PV on both strings, empty battery,
  // the net meter reads 0.78 kW while the phase sum (used for the lines) is 0.73 kW → the grid
  // node said 0,8 kW and its line into the house 0,7 kW before the totals were reconciled.
  cloudy: {
    pv1Kw: 0.14,
    pv2Kw: 0.13,
    batteryKw: 0,
    houseKw: 1.0,
    soc: 10,
    appliancesW: { heat_pump: 0, dishwasher: 0.4, coffee_maker: 0, dehumidifier: 0 },
    gridPhasesKw: [0.34, 0.18, 0.21],
    gridNetKw: 0.78,
  },
  // Winter evening, empty battery: an even three-phase load (oven on all phases) from the grid.
  balanced: {
    pv1Kw: 0,
    pv2Kw: 0,
    batteryKw: 0,
    houseKw: 2.86,
    soc: 12,
    appliancesW: { heat_pump: 0, dishwasher: 0.4, coffee_maker: 0, dehumidifier: 0 },
    gridPhasesKw: [0.94, 0.98, 0.94],
    housePhasesKw: [0.94, 0.98, 0.94],
  },
  // Single-phase heat pump on L1 (4,2 kW incl. heating rod) at dusk: L1 near the breaker limit.
  asym: {
    pv1Kw: 0.12,
    pv2Kw: 0.08,
    batteryKw: 0,
    houseKw: 5.3,
    soc: 11,
    appliancesW: { heat_pump: 4200, dishwasher: 0.4, coffee_maker: 0, dehumidifier: 0 },
    gridPhasesKw: [4.42, 0.38, 0.3],
    housePhasesKw: [4.5, 0.42, 0.38],
  },
  // Sunny noon, but the inverter tripped on an insulation fault: no PV, battery idle, the grid
  // feeds the house directly (grid → house bypasses the inverter).
  fault: {
    pv1Kw: 0,
    pv2Kw: 0,
    batteryKw: 0,
    houseKw: 1.62,
    soc: 54,
    appliancesW: { heat_pump: 0, dishwasher: 0.4, coffee_maker: 1240, dehumidifier: 0 },
    inverter: { mode: 'Fault Mode', errors: 'Isolation Failure' },
  },
};

export function flowScenarioGridKw(v: FlowScenarioValues): number {
  return Math.round((v.houseKw - v.pv1Kw - v.pv2Kw - v.batteryKw) * 1000) / 1000;
}

export function applyFlowScenario(
  states: EntityStateLike[],
  scenario: FlowScenario,
): EntityStateLike[] {
  const v = FLOW_SCENARIOS[scenario];
  const b = DEMO_ENERGY_BINDINGS;
  const grid = v.gridNetKw ?? flowScenarioGridKw(v);
  const pv = v.pv1Kw + v.pv2Kw;
  const phaseShare = [0.46, 0.26, 0.28];
  const gp: [number, number, number] = v.gridPhasesKw ?? [grid / 3, grid / 3, grid / 3];
  const imp = gp.reduce((a, p) => a + Math.max(0, p), 0);
  const exp = gp.reduce((a, p) => a + Math.max(0, -p), 0);
  const watts: Record<string, number> = {
    [b.energy_pv_power]: pv * 1000,
    [b.energy_pv1_power]: v.pv1Kw * 1000,
    [b.energy_pv2_power]: v.pv2Kw * 1000,
    [b.energy_grid_power]: grid * 1000,
    [b.energy_grid_import_power]: imp * 1000,
    [b.energy_grid_export_power]: exp * 1000,
    [b.energy_grid_l1_power]: gp[0] * 1000,
    [b.energy_grid_l2_power]: gp[1] * 1000,
    [b.energy_grid_l3_power]: gp[2] * 1000,
    [b.energy_battery_power]: v.batteryKw * 1000,
    [b.energy_house_power]: v.houseKw * 1000,
    [b.energy_phase_l1_power]: (v.housePhasesKw?.[0] ?? v.houseKw * phaseShare[0]!) * 1000,
    [b.energy_phase_l2_power]: (v.housePhasesKw?.[1] ?? v.houseKw * phaseShare[1]!) * 1000,
    [b.energy_phase_l3_power]: (v.housePhasesKw?.[2] ?? v.houseKw * phaseShare[2]!) * 1000,
    [b.energy_appliance_heat_pump_power]: v.appliancesW.heat_pump,
    [b.energy_appliance_dishwasher_power]: v.appliancesW.dishwasher,
    [b.energy_appliance_coffee_maker_power]: v.appliancesW.coffee_maker,
    [b.energy_appliance_dehumidifier_power]: v.appliancesW.dehumidifier,
  };
  const mode =
    v.inverter?.mode ??
    (pv > 0.05 || Math.abs(v.batteryKw) > 0.05 ? 'Normal (On-Grid)' : 'Wait Mode');
  const inv = Object.fromEntries(
    inverterStates(pv, v.batteryKw, mode, v.inverter?.errors ?? '', 0).map((e) => [
      e.entity_id,
      e.state,
    ]),
  );
  const on = new Set([
    b.energy_appliance_dishwasher_switch,
    b.energy_appliance_coffee_maker_switch,
    b.energy_appliance_dehumidifier_switch,
  ]);
  return states.map((s) => {
    if (s.entity_id in watts)
      return { ...s, state: String(Math.round(watts[s.entity_id]! * 10) / 10) };
    if (s.entity_id === b.energy_battery_soc) return { ...s, state: String(v.soc) };
    if (on.has(s.entity_id)) return { ...s, state: 'on' };
    if (s.entity_id === b.energy_inverter_status) return { ...s, state: mode };
    if (s.entity_id in inv) return { ...s, state: inv[s.entity_id]! };
    return s;
  });
}

// ---------------------------------------------------------------------------------------------
// Period comparison mock (`homebrain/energy/compare`), synthetic numbers only.

export type CompareScenario = 'full' | 'nodata' | 'unconfigured';

const DEMO_HOUSE_MONTH = [1580, 1260, 1050, 980, 1010, 1090, 1120, 1100, 960, 1040, 1230, 1460];
const DEMO_PV_MONTH = [170, 270, 700, 960, 1090, 1080, 1120, 1020, 760, 560, 250, 130];

/** Synthetic reply of the integration for dev and e2e (`?srovnani=full|nodata|unconfigured`). */
export function createCompareDemo(scenario: CompareScenario, now: number): ComparisonResult {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Prague',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(now))
      .map((p) => [p.type, Number(p.value)]),
  ) as Record<string, number>;
  const year = parts.year!;
  const month = parts.month!;
  const day = parts.day!;
  const hour = parts.hour!;
  const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
  const frac = ((day - 1) * 24 + hour) / (daysIn(year, month) * 24);
  const r1 = (v: number) => Math.round(v * 10) / 10;
  const firstMonth = scenario === 'nodata' ? 4 : 1; // 'nodata': recorder since April this year
  const build = (base: number[], lastYearFactor: number, thisYearFactor: number, digits = 1) => {
    const round = (v: number) => (digits ? r1(v) : Math.round(v));
    const lastYear = base.map((v, i) =>
      scenario === 'nodata' ? null : round(v * lastYearFactor * (1 + 0.04 * Math.sin(i))),
    );
    const thisYear = base.map((v, i) => {
      if (i + 1 > month || i + 1 < firstMonth) return null;
      const full = v * thisYearFactor * (1 + 0.05 * Math.cos(i));
      return round(i + 1 === month ? full * frac : full);
    });
    const prevIndex = (month + 10) % 12;
    const prevYearArr = month === 1 ? lastYear : thisYear;
    const prevFull = prevYearArr[prevIndex] ?? null;
    const sum = (arr: Array<number | null>, upto: number, partial: number | null) => {
      const head = arr.slice(0, upto);
      if (head.some((v) => v === null) || partial === null) return null;
      return round(head.reduce<number>((a, v) => a + (v ?? 0), 0) + partial);
    };
    const lastYearPartial =
      lastYear[month - 1] === null ? null : round(lastYear[month - 1]! * frac);
    return {
      month: {
        current: thisYear[month - 1] ?? null,
        last_year: lastYearPartial,
        previous:
          prevFull === null
            ? null
            : round(prevFull * Math.min(1, (day - 1 + hour / 24) / daysIn(year, prevIndex + 1))),
      },
      ytd: {
        current: sum(thisYear, month - 1, thisYear[month - 1] ?? null),
        last_year: sum(lastYear, month - 1, lastYearPartial),
      },
      monthly: { this_year: thisYear, last_year: lastYear },
      first:
        scenario === 'nodata' ? `${year}-04-01T00:00:00+02:00` : `${year - 1}-01-01T00:00:00+01:00`,
    };
  };
  const house = build(DEMO_HOUSE_MONTH, 1.06, 1);
  const pv = build(DEMO_PV_MONTH, 0.92, 1);
  const imp = build(
    DEMO_HOUSE_MONTH.map((v, i) => Math.max(60, v - DEMO_PV_MONTH[i]! * 0.55)),
    1.1,
    1,
  );
  const cost = build(
    DEMO_HOUSE_MONTH.map((v, i) => 300 + Math.max(60, v - DEMO_PV_MONTH[i]! * 0.55) * 5.4),
    1.1,
    1,
    0,
  );
  const iso = (y: number, m: number, d = 1, h = 0) =>
    `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}T${String(h).padStart(2, '0')}:00:00+01:00`;
  return {
    status: 'ok',
    time_zone: 'Europe/Prague',
    now: new Date(now).toISOString(),
    year,
    month,
    partial: { day, hour, days_in_month: daysIn(year, month) },
    windows: {
      month: {
        current: [iso(year, month), iso(year, month, day, hour)],
        last_year: [iso(year - 1, month), iso(year - 1, month, day, hour)],
        previous: [iso(year, month - 1 || 12), iso(year, month - 1 || 12, day, hour)],
      },
      ytd: {
        current: [iso(year, 1), iso(year, month, day, hour)],
        last_year: [iso(year - 1, 1), iso(year - 1, month, day, hour)],
      },
    },
    series: { house, pv, import: imp, cost },
    cost_basis: { vt: 6.2, nt: 4.1, fixed_monthly: 300, hdo: true },
  };
}

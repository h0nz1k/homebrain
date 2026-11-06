import { describe, expect, it } from 'vitest';
import { describeError, DOCK_ERRORS, ROBOT_ERRORS } from './errors.js';
import { describeStatus } from './status.js';

// Enum options published by HA core `roborock` (vacuum_error / dock_error / status sensors).
const HA_ROBOT_ERRORS = [
  'none',
  'lidar_blocked',
  'bumper_stuck',
  'wheels_suspended',
  'cliff_sensor_error',
  'main_brush_jammed',
  'side_brush_jammed',
  'wheels_jammed',
  'robot_trapped',
  'no_dustbin',
  'strainer_error',
  'compass_error',
  'low_battery',
  'charging_error',
  'battery_error',
  'wall_sensor_dirty',
  'robot_tilted',
  'side_brush_error',
  'fan_error',
  'dock',
  'optical_flow_sensor_dirt',
  'vertical_bumper_pressed',
  'dock_locator_error',
  'return_to_dock_fail',
  'nogo_zone_detected',
  'visual_sensor',
  'light_touch',
  'vibrarise_jammed',
  'robot_on_carpet',
  'filter_blocked',
  'invisible_wall_detected',
  'cannot_cross_carpet',
  'internal_error',
  'collect_dust_error_3',
  'collect_dust_error_4',
  'mopping_roller_1',
  'mopping_roller_error_2',
  'clear_water_box_hoare',
  'dirty_water_box_hoare',
  'sink_strainer_hoare',
  'clear_water_box_exception',
  'clear_brush_exception',
  'clear_brush_exception_2',
  'filter_screen_exception',
  'up_water_exception',
  'drain_water_exception',
  'temperature_protection',
  'clean_carousel_exception',
  'clean_carousel_water_full',
  'water_carriage_drop',
  'check_clean_carouse',
  'audio_error',
];
const HA_DOCK_ERRORS = [
  'ok',
  'no_dustbin_or_filter',
  'auto_empty_dock_fan_error',
  'duct_blockage',
  'auto_empty_dock_voltage_error',
  'water_empty',
  'waste_water_tank_full',
  'maintenance_brush_jammed',
  'dirty_tank_latch_open',
  'no_dustbin',
  'cleaning_tank_full_or_blocked',
];
const HA_STATUS = [
  'unknown',
  'starting',
  'charger_disconnected',
  'idle',
  'remote_control_active',
  'cleaning',
  'returning_home',
  'manual_mode',
  'charging',
  'charging_problem',
  'paused',
  'spot_cleaning',
  'error',
  'shutting_down',
  'updating',
  'docking',
  'going_to_target',
  'zoned_cleaning',
  'segment_cleaning',
  'emptying_the_bin',
  'washing_the_mop',
  'going_to_wash_the_mop',
  'in_call',
  'mapping',
  'egg_attack',
  'patrol',
  'attaching_the_mop',
  'detaching_the_mop',
  'charging_complete',
  'device_offline',
  'locked',
  'air_drying_stopping',
  'robot_status_mopping',
  'clean_mop_cleaning',
  'clean_mop_mopping',
  'segment_mopping',
  'segment_clean_mop_cleaning',
  'segment_clean_mop_mopping',
  'zoned_mopping',
  'zoned_clean_mop_cleaning',
  'zoned_clean_mop_mopping',
  'back_to_dock_washing_duster',
];

describe('error advice', () => {
  it('has Czech advice for every HA robot and dock error option', () => {
    for (const code of HA_ROBOT_ERRORS.filter((c) => c !== 'none'))
      expect(ROBOT_ERRORS[code], code).toBeDefined();
    for (const code of HA_DOCK_ERRORS.filter((c) => c !== 'ok'))
      expect(DOCK_ERRORS[code], code).toBeDefined();
  });
  it('advice is plain Czech with at least one step and no raw English code', () => {
    for (const code of [...Object.keys(ROBOT_ERRORS), ...Object.keys(DOCK_ERRORS)]) {
      const advice = describeError(code in ROBOT_ERRORS ? 'robot' : 'dock', code)!;
      expect(advice.steps.length).toBeGreaterThan(0);
      expect(advice.title).not.toMatch(/_/);
      for (const step of advice.steps) expect(step).toMatch(/[.!?)]$/);
    }
  });
  it('maps a jammed main brush to a part and steps', () => {
    const advice = describeError('robot', 'main_brush_jammed')!;
    expect(advice).toMatchObject({
      title: 'Zamotaný hlavní kartáč',
      part: 'main_brush',
      severity: 'error',
    });
    expect(advice.steps[0]).toContain('kryt kartáče');
  });
  it('treats none/ok/unknown as no error and unknown codes as a generic fallback', () => {
    expect(describeError('robot', 'none')).toBeNull();
    expect(describeError('dock', 'ok')).toBeNull();
    expect(describeError('robot', 'unavailable')).toBeNull();
    expect(describeError('robot', null)).toBeNull();
    const fallback = describeError('dock', 'brand_new_code')!;
    expect(fallback.title).toBe('Dok hlásí chybu');
    expect(fallback.steps[0]).toContain('brand new code');
  });
  it('low battery is informational', () => {
    expect(describeError('robot', 'LOW_BATTERY')?.severity).toBe('info');
  });
});

describe('status', () => {
  it('labels every HA status option except unknown', () => {
    for (const code of HA_STATUS.filter((c) => c !== 'unknown')) {
      const status = describeStatus(code, 'docked');
      expect(status.code, code).toBe(code);
      expect(status.label).not.toMatch(/_/);
    }
  });
  it('groups the five headline states', () => {
    expect(describeStatus('segment_cleaning', 'cleaning')).toMatchObject({
      tone: 'cleaning',
      busy: true,
    });
    expect(describeStatus('charging', 'docked')).toMatchObject({ tone: 'charging', busy: false });
    expect(describeStatus('emptying_the_bin', 'docked').tone).toBe('emptying');
    expect(describeStatus('washing_the_mop', 'docked').label).toBe('Pere mop');
    expect(describeStatus('error', 'error').tone).toBe('error');
  });
  it('falls back to the vacuum state, then offline', () => {
    expect(describeStatus(null, 'returning').label).toBe('Vrací se do doku');
    expect(describeStatus('unknown', 'docked').tone).toBe('docked');
    expect(describeStatus(null, 'unavailable')).toMatchObject({
      tone: 'offline',
      label: 'Nedostupný',
    });
  });
});

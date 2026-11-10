import { describe, expect, it } from 'vitest';
import {
  CLEAN_MODE_LABELS,
  findResetButton,
  mopRouteChoices,
  planCleanRooms,
  waterChoices,
} from './commands.js';
import { statusWithBattery } from './views/RobotsView.js';

const base = {
  vacuum: 'vacuum.demo_robot_1',
  rooms: [{ id: 3, name: 'Jídelna' }],
  mode: 'both' as const,
  currentMode: 'both' as const,
  modeSelect: 'select.demo_robot_1_cleaning_mode',
  fan: 'balanced',
  currentFan: 'balanced',
};

describe('clean plan: water, mop route, passes', () => {
  it('labels the combined mode with the Czech „Obojí“', () => {
    expect(CLEAN_MODE_LABELS.both).toBe('Obojí');
  });

  it('sets water + mop route only when they change and the run mops', () => {
    const plan = planCleanRooms({
      ...base,
      repeat: 2,
      water: { entity: 'select.demo_robot_1_mop_intensity', value: 'intense', current: 'moderate' },
      mopRoute: { entity: 'select.demo_robot_1_mop_mode', value: 'standard', current: 'standard' },
    });
    expect(plan.map((p) => p.service)).toEqual(['select.select_option', 'vacuum.send_command']);
    expect(plan[0]!.data).toEqual({ option: 'intense' });
    expect(plan[0]!.summary).toBe('Voda: Vysoká');
    expect(plan[1]!.data).toEqual({
      command: 'app_segment_clean',
      params: [{ segments: [3], repeat: 2 }],
    });
    expect(plan[1]!.summary).toContain('2× každou');
    const vacuumOnly = planCleanRooms({
      ...base,
      mode: 'vacuum',
      water: { entity: 'select.demo_robot_1_mop_intensity', value: 'intense', current: 'moderate' },
    });
    expect(vacuumOnly.some((p) => p.entityId.endsWith('_mop_intensity'))).toBe(false);
  });

  it('offers every HA option in power order (Kraken-like lists)', () => {
    expect(waterChoices(['off', 'mild', 'moderate', 'intense', 'custom'], 'moderate')).toEqual([
      'off',
      'mild',
      'moderate',
      'intense',
      'custom',
    ]);
    expect(
      waterChoices(
        ['off', 'slight', 'low', 'medium', 'moderate', 'high', 'extreme'],
        'moderate',
      ),
    ).toEqual(['off', 'slight', 'low', 'medium', 'moderate', 'high', 'extreme']);
    expect(mopRouteChoices(['standard', 'deep', 'deep_plus', 'custom'], 'standard')).toEqual([
      'standard',
      'deep',
      'deep_plus',
      'custom',
    ]);
  });
});

describe('header status', () => {
  it('keeps the battery next to „Nabito“', () => {
    expect(statusWithBattery('Nabito, čeká v doku', 100)).toBe('Nabito 100\u00a0% · čeká v doku');
    expect(statusWithBattery('V doku', 64)).toBe('V doku · 64\u00a0%');
    expect(statusWithBattery('V doku', null)).toBe('V doku');
  });
});

describe('findResetButton', () => {
  const ha = new Set([
    'button.demo_robot_2_resetovat_hlavni_kartac',
    'button.demo_robot_2_dock_resetovat_cistici_kartac',
    'button.demo_robot_2_dock_resetovat_sitko',
    'button.garage_resetovat_hlavni_kartac',
  ]);
  const has = (id: string) => ha.has(id);
  it('finds the robot\'s own Czech/English reset button per part', () => {
    expect(findResetButton('main_brush', 'vacuum.demo_robot_2', has)).toBe(
      'button.demo_robot_2_resetovat_hlavni_kartac',
    );
    expect(findResetButton('dock_brush', 'vacuum.demo_robot_2', has)).toBe(
      'button.demo_robot_2_dock_resetovat_cistici_kartac',
    );
    expect(findResetButton('dock_strainer', 'vacuum.demo_robot_2', has)).toBe(
      'button.demo_robot_2_dock_resetovat_sitko',
    );
  });
  it('nothing for missing buttons, guide-only parts or another device', () => {
    expect(findResetButton('side_brush', 'vacuum.demo_robot_2', has)).toBeUndefined();
    expect(findResetButton('mop', 'vacuum.demo_robot_2', has)).toBeUndefined();
    expect(findResetButton('main_brush', 'vacuum.demo_robot_3', has)).toBeUndefined();
    expect(findResetButton('main_brush', '', has)).toBeUndefined();
  });
});

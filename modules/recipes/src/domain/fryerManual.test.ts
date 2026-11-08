import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LIMITS,
  blockerText,
  clampSetting,
  favouriteLine,
  liveBlockers,
  startLabel,
  startRequest,
  stepSetting,
  validateFavourite,
} from './fryerManual.js';

const E = {
  status: 'sensor.demo_fryer_cooking_status',
  drawer: 'binary_sensor.demo_fryer_drawer',
  error: 'sensor.demo_fryer_error_code',
};

describe('fryer manual domain', () => {
  it('clamps and steps settings inside the device limits', () => {
    expect(clampSetting('temperature', 230, DEFAULT_LIMITS)).toBe(200);
    expect(clampSetting('minutes', 0, DEFAULT_LIMITS)).toBe(1);
    expect(stepSetting('temperature', 195, 1, DEFAULT_LIMITS)).toBe(200);
    expect(stepSetting('temperature', 200, 1, DEFAULT_LIMITS)).toBe(200);
    expect(stepSetting('minutes', 1, -1, DEFAULT_LIMITS)).toBe(1);
    expect(stepSetting('probe_temperature', 60, 1, DEFAULT_LIMITS)).toBe(61);
  });

  it('derives live blockers from the entity states', () => {
    const read = (s: Record<string, string>) => (id: string) => s[id];
    expect(
      liveBlockers(E, read({ [E.status]: 'standby', [E.drawer]: 'off', [E.error]: '0' })),
    ).toEqual([]);
    expect(
      liveBlockers(E, read({ [E.status]: 'cooking', [E.drawer]: 'off', [E.error]: '0' })),
    ).toEqual(['AIRFRYER_BUSY']);
    expect(
      liveBlockers(E, read({ [E.status]: 'standby', [E.drawer]: 'on', [E.error]: '0' })),
    ).toEqual(['AIRFRYER_DRAWER_OPEN']);
    expect(
      liveBlockers(E, read({ [E.status]: 'standby', [E.drawer]: 'off', [E.error]: '5' })),
    ).toEqual(['AIRFRYER_ERROR']);
    expect(liveBlockers(E, read({ [E.status]: 'unavailable', [E.drawer]: 'off' }))).toEqual([
      'AIRFRYER_UNAVAILABLE',
    ]);
    expect(liveBlockers({}, read({}))).toEqual(['NOT_CONFIGURED']);
  });

  it('explains every blocker in Czech', () => {
    expect(blockerText('AIRFRYER_DRAWER_OPEN')).toMatch(/šuplík/i);
    expect(blockerText('AIRFRYER_BUSY')).toMatch(/peče/);
    expect(blockerText('NĚCO')).toBeTruthy();
  });

  it('builds the start request (probe only when enabled)', () => {
    const s = { temperature: 200, minutes: 18, air_speed: 2, probe: false, probe_temperature: 70 };
    expect(startRequest(s)).toEqual({
      temperature: 200,
      minutes: 18,
      air_speed: 2,
      probe_temperature: null,
      confirmed: true,
    });
    // Probe mode: the core temperature ends the cooking, so no time is sent at all.
    expect(startRequest({ ...s, probe: true })).toEqual({
      temperature: 200,
      air_speed: 2,
      probe_temperature: 70,
      confirmed: true,
    });
  });

  it('labels the start button with time or the probe target, never both', () => {
    const s = { temperature: 180, minutes: 15, air_speed: 2, probe: false, probe_temperature: 63 };
    expect(startLabel(s)).toBe('Spustit · 180 °C · 15 min');
    expect(startLabel({ ...s, probe: true })).toBe('Spustit · 180 °C · sonda 63 °C');
  });

  it('formats and validates favourites', () => {
    const f = {
      id: 'a',
      name: 'Hranolky',
      temperature: 200,
      minutes: 18,
      air_speed: 2,
      probe_temperature: null,
    };
    expect(favouriteLine(f)).toBe('200 °C · 18 min · silný vzduch');
    expect(favouriteLine({ ...f, air_speed: 1, probe_temperature: 65 })).toBe(
      '200 °C · sonda 65 °C · slabý vzduch',
    );
    expect(validateFavourite({ ...f, name: '  ' }, DEFAULT_LIMITS)).toBe('Zadejte název');
    expect(validateFavourite({ ...f, name: 'x'.repeat(41) }, DEFAULT_LIMITS)).toMatch(/40/);
    expect(validateFavourite({ ...f, temperature: 260 }, DEFAULT_LIMITS)).toMatch(/40–200/);
    expect(validateFavourite(f, DEFAULT_LIMITS)).toBeNull();
  });
});

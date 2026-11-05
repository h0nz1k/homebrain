import type { EntityStateLike } from '@homebrain/ha-client';
import { localDate } from './adapter.js';
import type { HealthBindingKey } from './contract.js';

/**
 * Synthetic demo/fixture data (donor `docs/fixtures-and-error-states.md`). All ids are
 * `demo_*`, all values invented; nothing comes from a real installation.
 */
export const HEALTH_SCENARIOS = [
  'week', // F-002 běžný rozpracovaný týden
  'met', // F-003 týdenní cíl splněn
  'empty', // F-001 prázdná instalace
  'missing', // HEA-001 integrace chybí
  'partial', // F-009 spánek nepřipojen
  'stale', // F-010 zastaralá data
  'unavailable', // zdroj nedostupný
  'error', // F-008 import selhal, stav beze změny
  'risk', // pozdní týden, minimum v ohrožení
  'unverified', // HEA-010 neověřený spánek
] as const;
export type HealthScenario = (typeof HEALTH_SCENARIOS)[number];

const DAY = 86_400_000;
const ids: Record<HealthBindingKey, string> = {
  health_source_status: 'sensor.demo_health_source_status',
  health_last_success: 'sensor.demo_health_last_success',
  health_next_step: 'sensor.demo_health_next_step',
  health_weekly_strength_progress: 'sensor.demo_health_weekly_strength_sessions',
  health_weekly_goal_met: 'binary_sensor.demo_health_weekly_goal_met',
  health_weekly_workout_duration: 'sensor.demo_health_weekly_workout_duration',
  health_streak_weeks: 'sensor.demo_health_streak_weeks',
  health_xp_total: 'sensor.demo_health_xp_total',
  health_xp_level: 'sensor.demo_health_xp_level',
  health_xp_level_progress: 'sensor.demo_health_xp_level_progress',
  health_last_workout: 'sensor.demo_health_last_workout_at',
  health_last_workout_duration: 'sensor.demo_health_last_workout_duration',
  health_weight_trend: 'sensor.demo_health_weight_trend',
  health_sleep_last: 'sensor.demo_health_sleep_last',
  health_flex_meal_token: 'binary_sensor.demo_health_flex_meal_token',
  health_milestone_0500: 'binary_sensor.demo_health_milestone_0500',
  health_milestone_1500: 'binary_sensor.demo_health_milestone_1500',
  health_milestone_3000: 'binary_sensor.demo_health_milestone_3000',
  health_milestone_5000: 'binary_sensor.demo_health_milestone_5000',
  health_milestone_10000: 'binary_sensor.demo_health_milestone_10000',
};

function offsetAt(ms: number, timeZone: string) {
  const name = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
    .formatToParts(new Date(ms))
    .find((p) => p.type === 'timeZoneName')?.value;
  const m = /GMT([+-]\d{2}):?(\d{2})?/.exec(name ?? '');
  return m ? `${m[1]}:${m[2] ?? '00'}` : '+00:00';
}
/** Local midnight of a date as ISO with explicit offset (weeks start on Monday, no DST jump at 00:00). */
function localMidnight(date: string, timeZone: string) {
  const noon = Date.parse(`${date}T12:00:00Z`);
  return `${date}T00:00:00${offsetAt(noon, timeZone)}`;
}
function shiftDate(date: string, days: number) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
}

export interface HealthDemo {
  states: Record<string, EntityStateLike>;
  bindings: Record<string, string>;
  statistics: (message: { statistic_ids?: string[] }) => Record<string, unknown>;
  /** `history/history_during_period` mock: workout timestamps of the current week. */
  history: (message: { entity_ids?: string[] }) => Record<string, unknown>;
}

export function createHealthDemo(
  now: number,
  scenario: HealthScenario = 'week',
  timeZone = 'Europe/Prague',
): HealthDemo {
  if (scenario === 'missing')
    return { states: {}, bindings: {}, statistics: () => ({}), history: () => ({}) };
  const today = localDate(now, timeZone);
  const weekday = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7;
  const monday = shiftDate(today, -weekday);
  const period = {
    period_start: localMidnight(monday, timeZone),
    period_end_exclusive: localMidnight(shiftDate(monday, 7), timeZone),
  };
  const updated = new Date(now - 40 * 60_000).toISOString();
  const states: Record<string, EntityStateLike> = {};
  const set = (key: HealthBindingKey, state: string, attributes: Record<string, unknown> = {}) => {
    states[ids[key]] = { entity_id: ids[key], state, attributes, last_updated: updated };
  };
  const empty = scenario === 'empty';
  const target = 3;
  const completed = empty ? 0 : scenario === 'met' ? 3 : scenario === 'risk' ? 1 : 2;
  const down = scenario === 'unavailable';
  const source =
    scenario === 'empty'
      ? 'empty'
      : scenario === 'stale'
        ? 'stale'
        : scenario === 'unavailable'
          ? 'unavailable'
          : scenario === 'error'
            ? 'error'
            : 'ok';
  set('health_source_status', source);
  const lastSuccess = scenario === 'stale' ? now - 10 * DAY : now - 3 * 3_600_000;
  set('health_last_success', empty ? 'unknown' : new Date(lastSuccess).toISOString(), {
    device_class: 'timestamp',
  });
  const weekAttrs = { ...period, target, completed };
  set(
    'health_weekly_strength_progress',
    down ? 'unavailable' : String(completed),
    down ? {} : weekAttrs,
  );
  set(
    'health_weekly_goal_met',
    down ? 'unavailable' : completed >= target ? 'on' : 'off',
    down ? {} : weekAttrs,
  );
  set('health_weekly_workout_duration', down ? 'unavailable' : String(completed * 1920), {
    unit_of_measurement: 's',
  });
  set('health_streak_weeks', down ? 'unavailable' : empty ? '0' : scenario === 'met' ? '3' : '2');
  const xp = empty ? 0 : scenario === 'met' ? 1650 : 1350;
  set('health_xp_total', down ? 'unavailable' : String(xp), { unit_of_measurement: 'XP' });
  set('health_xp_level', down ? 'unavailable' : String(1 + Math.floor(xp / 1000)));
  set('health_xp_level_progress', down ? 'unavailable' : String(Math.floor((xp % 1000) / 10)), {
    unit_of_measurement: '%',
  });
  const lastWorkoutDay = scenario === 'met' ? today : shiftDate(today, -1);
  const lastWorkout = Date.parse(`${lastWorkoutDay}T18:00:00${offsetAt(now, timeZone)}`);
  set('health_last_workout', empty || down ? 'unavailable' : new Date(lastWorkout).toISOString(), {
    device_class: 'timestamp',
  });
  set('health_last_workout_duration', empty || down ? 'unavailable' : '1920', {
    unit_of_measurement: 's',
    device_class: 'duration',
  });
  for (const [key, threshold] of [
    ['health_milestone_0500', 500],
    ['health_milestone_1500', 1500],
    ['health_milestone_3000', 3000],
    ['health_milestone_5000', 5000],
    ['health_milestone_10000', 10000],
  ] as const)
    set(key, down ? 'unavailable' : xp >= threshold ? 'on' : 'off');
  set('health_flex_meal_token', down ? 'unavailable' : empty ? 'off' : 'on');
  if (!empty) {
    set('health_weight_trend', down ? 'unavailable' : '90.6', {
      unit_of_measurement: 'kg',
      state_class: 'measurement',
    });
    if (scenario !== 'partial')
      set('health_sleep_last', down ? 'unavailable' : scenario === 'met' ? '465' : '445', {
        unit_of_measurement: 'min',
        source_verified: scenario !== 'unverified',
      });
  }

  const bindings = Object.fromEntries(
    Object.entries(ids).filter(([, id]) => id in states),
  ) as Record<string, string>;

  const statistics = (message: { statistic_ids?: string[] }) => {
    const weightId = ids.health_weight_trend;
    if (!message.statistic_ids?.includes(weightId) || empty || down) return {};
    const start = Date.parse(`${shiftDate(today, -29)}T00:00:00Z`);
    return {
      [weightId]: Array.from({ length: 30 }, (_, i) => ({
        start: start + i * DAY,
        end: start + (i + 1) * DAY,
        mean: Math.round((92.4 - i * 0.065 + Math.sin(i * 1.7) * 0.35) * 10) / 10,
      })),
    };
  };
  const history = (message: { entity_ids?: string[] }) => {
    const id = ids.health_last_workout;
    if (!message.entity_ids?.includes(id) || empty || down) return {};
    // `completed` workouts every other day back from the last one, inside this week.
    const days = Array.from({ length: completed }, (_, i) =>
      shiftDate(lastWorkoutDay, -2 * i),
    ).filter((d) => d >= monday);
    return {
      [id]: days.reverse().map((d) => ({
        s: new Date(Date.parse(`${d}T18:00:00${offsetAt(now, timeZone)}`)).toISOString(),
      })),
    };
  };
  return { states, bindings, statistics, history };
}

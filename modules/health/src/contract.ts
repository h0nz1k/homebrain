/**
 * Read-only view contract over the `health_fitness` integration (v0.7.0).
 *
 * The integration exposes anonymised sensors/binary sensors only; HomeBrain maps
 * logical keys to entity ids in the integration options (never in Git).
 */

/** Logical binding keys of the Health module (entity ids live only in HA options). */
export const HEALTH_BINDING_KEYS = [
  'health_source_status',
  'health_last_success',
  'health_next_step',
  'health_weekly_strength_progress',
  'health_weekly_goal_met',
  'health_weekly_workout_duration',
  'health_streak_weeks',
  'health_xp_total',
  'health_xp_level',
  'health_xp_level_progress',
  'health_last_workout',
  'health_last_workout_duration',
  'health_weight_trend',
  'health_sleep_last',
  'health_milestone_0500',
  'health_milestone_1500',
  'health_milestone_3000',
  'health_milestone_5000',
  'health_milestone_10000',
  'health_flex_meal_token',
] as const;
export type HealthBindingKey = (typeof HEALTH_BINDING_KEYS)[number];

/** Keys that prove the integration is present (HEA-001). */
export const HEALTH_CORE_KEYS: readonly HealthBindingKey[] = [
  'health_source_status',
  'health_weekly_strength_progress',
  'health_xp_total',
];

/** Milestone catalog v1 (`docs/milestone-catalog-contract.md` of the integration). */
export const MILESTONE_CATALOG = [
  {
    binding: 'health_milestone_0500',
    stableId: 'xp-total-0500-v1',
    threshold: 500,
    labelCs: 'První krok',
  },
  {
    binding: 'health_milestone_1500',
    stableId: 'xp-total-1500-v1',
    threshold: 1500,
    labelCs: 'Rytmus',
  },
  {
    binding: 'health_milestone_3000',
    stableId: 'xp-total-3000-v1',
    threshold: 3000,
    labelCs: 'Tempo',
  },
  {
    binding: 'health_milestone_5000',
    stableId: 'xp-total-5000-v1',
    threshold: 5000,
    labelCs: 'Momentum',
  },
  {
    binding: 'health_milestone_10000',
    stableId: 'xp-total-10000-v1',
    threshold: 10000,
    labelCs: 'Dlouhá hra',
  },
] as const satisfies readonly {
  binding: HealthBindingKey;
  stableId: string;
  threshold: number;
  labelCs: string;
}[];

/** `health_fitness.source_status.v1` states. */
export const SOURCE_STATES = ['ok', 'empty', 'partial', 'stale', 'unavailable', 'error'] as const;
export type SourceState = (typeof SOURCE_STATES)[number];

/** Overall module state; `missing` = integration not installed / not mapped (HEA-001). */
export type HealthStatus = 'missing' | SourceState;

/**
 * State of one value. `not_bound` = no mapping, `missing` = mapped entity absent,
 * `unavailable` = HA reports unavailable/unknown, `invalid` = unparsable or wrong unit.
 * A value is never invented: everything except `ok` carries `value: null`.
 */
export type FieldState = 'ok' | 'not_bound' | 'missing' | 'unavailable' | 'invalid';
export interface Field<T> {
  value: T | null;
  state: FieldState;
  updatedAt?: string;
}

export interface HealthWeek {
  completed: Field<number>;
  target: Field<number>;
  goalMet: Field<boolean>;
  /** Local ISO period bounds as provided by the integration attributes. */
  periodStart: string | null;
  periodEndExclusive: string | null;
  /** Calendar days left in the period including today (null when the period is unknown). */
  daysLeft: number | null;
  durationSeconds: Field<number>;
}

export interface HealthMilestone {
  stableId: string;
  threshold: number;
  labelCs: string;
  achieved: Field<boolean>;
}

export interface HealthModel {
  now: number;
  timeZone: string;
  status: HealthStatus;
  sourceStatus: Field<SourceState>;
  lastSuccessAt: string | null;
  /** Data are shown with their age and must not look current. */
  stale: boolean;
  nextStepText: Field<string>;
  week: HealthWeek;
  streakWeeks: Field<number>;
  xpTotal: Field<number>;
  xpLevel: Field<number>;
  xpLevelProgress: Field<number>;
  lastWorkoutAt: Field<string>;
  lastWorkoutSeconds: Field<number>;
  trainedToday: boolean | null;
  weight: Field<number> & { unit: string | null };
  sleepMinutes: Field<number> & { verified: boolean | null };
  flexMealAvailable: Field<boolean>;
  milestones: HealthMilestone[];
  /** Latest `last_updated` among the bound entities. */
  updatedAt: string | null;
}

export interface WeightPoint {
  t: number;
  v: number;
}
export interface WeightHistory {
  status: 'ready' | 'unsupported' | 'error';
  points: WeightPoint[];
}

export type NextStepKind =
  | 'source'
  | 'train'
  | 'rest'
  | 'done_today'
  | 'met'
  | 'missed'
  | 'unknown'
  | 'empty'
  | 'unavailable'
  | 'missing';
export interface NextStep {
  kind: NextStepKind;
  title: string;
  detail: string;
}

/** Local dates (YYYY-MM-DD) with a recorded workout in the current week, from recorder history. */
export interface WorkoutDays {
  status: 'ready' | 'unsupported' | 'error';
  days: string[];
}

import type { ConnectionLike, EntityStateLike } from '@homebrain/ha-client';
import { czPlural } from '@homebrain/ui';
import {
  HEALTH_BINDING_KEYS,
  HEALTH_CORE_KEYS,
  MILESTONE_CATALOG,
  SOURCE_STATES,
  type Field,
  type HealthBindingKey,
  type HealthModel,
  type HealthStatus,
  type NextStep,
  type SourceState,
  type WeightHistory,
  type WorkoutDays,
  type WeightPoint,
} from './contract.js';

const DAY = 86_400_000;

export interface HealthAdapterInput {
  bindings: Record<string, string>;
  getState: (entityId: string) => EntityStateLike | undefined;
  now: number;
  timeZone?: string;
  /** HomeBrain-side stale threshold for the last successful import (days). */
  staleAfterDays?: number;
}

export function boundId(bindings: Record<string, string>, key: HealthBindingKey) {
  const id = bindings[key];
  return typeof id === 'string' && id.trim() ? id.trim() : undefined;
}

export function selectHealthEntityIds(bindings: Record<string, string>): string[] {
  return [
    ...new Set(
      HEALTH_BINDING_KEYS.map((key) => boundId(bindings, key)).filter((id): id is string => !!id),
    ),
  ];
}

const UNAVAILABLE = new Set(['unavailable', 'unknown', '']);

type Reader = <T>(key: HealthBindingKey, parse: (entity: EntityStateLike) => T | null) => Field<T>;

function makeReader(input: HealthAdapterInput): Reader {
  return (key, parse) => {
    const id = boundId(input.bindings, key);
    if (!id) return { value: null, state: 'not_bound' };
    const entity = input.getState(id);
    if (!entity) return { value: null, state: 'missing' };
    const updatedAt = entity.last_updated;
    if (
      UNAVAILABLE.has(
        String(entity.state ?? '')
          .trim()
          .toLowerCase(),
      )
    )
      return { value: null, state: 'unavailable', updatedAt };
    const value = parse(entity);
    return value === null
      ? { value: null, state: 'invalid', updatedAt }
      : { value, state: 'ok', updatedAt };
  };
}

const toNumber = (raw: unknown): number | null => {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const n = Number(raw.trim());
  return Number.isFinite(n) ? n : null;
};
const nonNegativeInt = (raw: unknown) => {
  const n = toNumber(raw);
  return n !== null && n >= 0 && Number.isInteger(n) ? n : null;
};
const isoTime = (raw: unknown) =>
  typeof raw === 'string' && raw.trim() && Number.isFinite(Date.parse(raw)) ? raw.trim() : null;
const binary = (raw: unknown) => (raw === 'on' ? true : raw === 'off' ? false : null);
const unitOf = (entity: EntityStateLike) => {
  const unit = entity.attributes?.unit_of_measurement;
  return typeof unit === 'string' ? unit.trim() : '';
};

/** Duration in seconds respecting the entity unit; unknown units are rejected, not guessed. */
function durationSeconds(entity: EntityStateLike): number | null {
  const n = toNumber(entity.state);
  if (n === null || n < 0) return null;
  const factor: Record<string, number> = { '': 1, s: 1, min: 60, h: 3600, d: 86400 };
  const f = factor[unitOf(entity)];
  return f === undefined ? null : n * f;
}

/** Local calendar date `YYYY-MM-DD` in the configured time zone. */
export function localDate(ms: number, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(ms));
}
const dateIndex = (date: string) => Math.round(Date.parse(`${date}T00:00:00Z`) / DAY);

/** Days left in the period including today; uses the integration's local period bounds. */
export function daysLeftInPeriod(
  periodEndExclusive: string | null,
  now: number,
  timeZone: string,
): number | null {
  if (!periodEndExclusive) return null;
  const end = Date.parse(periodEndExclusive);
  if (!Number.isFinite(end) || end <= now) return null;
  // The bound is local midnight; the day before it is the last day of the period.
  const last = dateIndex(localDate(end - 1, timeZone));
  return last - dateIndex(localDate(now, timeZone)) + 1;
}

export function adaptHealthEntities(input: HealthAdapterInput): HealthModel {
  const timeZone = input.timeZone ?? 'Europe/Prague';
  const { now } = input;
  const read = makeReader(input);

  const sourceStatus = read<SourceState>('health_source_status', (e) =>
    (SOURCE_STATES as readonly string[]).includes(e.state) ? (e.state as SourceState) : null,
  );
  const lastSuccess = read('health_last_success', (e) => isoTime(e.state));
  const nextStepText = read('health_next_step', (e) => {
    const text = String(e.state ?? '').trim();
    return text && text.length <= 200 ? text : null;
  });

  const weekly = read('health_weekly_strength_progress', (e) => nonNegativeInt(e.state));
  const weeklyId = boundId(input.bindings, 'health_weekly_strength_progress');
  const weeklyAttrs = weeklyId ? input.getState(weeklyId)?.attributes : undefined;
  const target = (() => {
    if (weekly.state !== 'ok') return { value: null, state: weekly.state } as Field<number>;
    const t = nonNegativeInt(weeklyAttrs?.target);
    return t && t >= 1
      ? { value: t, state: 'ok' as const }
      : { value: null, state: 'invalid' as const };
  })();
  const periodStart = weekly.state === 'ok' ? isoTime(weeklyAttrs?.period_start) : null;
  const periodEndExclusive =
    weekly.state === 'ok' ? isoTime(weeklyAttrs?.period_end_exclusive) : null;
  const goalMetEntity = read('health_weekly_goal_met', (e) => binary(e.state));
  const goalMet: Field<boolean> =
    goalMetEntity.state === 'ok' || weekly.state !== 'ok' || target.value === null
      ? goalMetEntity
      : { value: weekly.value! >= target.value, state: 'ok' };

  const lastWorkoutAt = read('health_last_workout', (e) => isoTime(e.state));
  const lastWorkoutSeconds = read('health_last_workout_duration', durationSeconds);
  const weight = read('health_weight_trend', (e) => {
    const n = toNumber(e.state);
    return n !== null && n > 0 ? n : null;
  });
  const weightId = boundId(input.bindings, 'health_weight_trend');
  const weightUnit =
    weight.state === 'ok' && weightId ? unitOf(input.getState(weightId)!) || null : null;
  const sleep = read('health_sleep_last', (e) => {
    const s = durationSeconds(e);
    return s === null ? null : Math.round(s / 60);
  });
  const sleepId = boundId(input.bindings, 'health_sleep_last');
  const verifiedAttr = sleepId ? input.getState(sleepId)?.attributes?.source_verified : undefined;

  const milestones = MILESTONE_CATALOG.map((m) => ({
    stableId: m.stableId,
    threshold: m.threshold,
    labelCs: m.labelCs,
    achieved: read(m.binding, (e) => binary(e.state)),
  }));

  const fields: Field<unknown>[] = [
    sourceStatus,
    lastSuccess,
    weekly,
    goalMetEntity,
    lastWorkoutAt,
    lastWorkoutSeconds,
    weight,
    sleep,
  ];
  const updatedAt =
    fields
      .map((f) => f.updatedAt)
      .filter((t): t is string => !!t && Number.isFinite(Date.parse(t)))
      .sort()
      .at(-1) ?? null;

  // HEA-001: the integration counts as present only if a core entity exists in HA.
  const coreFields = HEALTH_CORE_KEYS.map((key) =>
    key === 'health_source_status'
      ? sourceStatus
      : key === 'health_weekly_strength_progress'
        ? weekly
        : read(key, (e) => toNumber(e.state)),
  );
  const present = coreFields.some((f) => f.state !== 'not_bound' && f.state !== 'missing');

  const lastSuccessAt = lastSuccess.value;
  const staleBySuccess =
    lastSuccessAt !== null && now - Date.parse(lastSuccessAt) > (input.staleAfterDays ?? 7) * DAY;
  let status: HealthStatus;
  if (!present) status = 'missing';
  else if (sourceStatus.value) status = sourceStatus.value;
  else if (coreFields.every((f) => f.state !== 'ok')) status = 'unavailable';
  else status = 'ok';
  if (status === 'ok' && staleBySuccess) status = 'stale';
  // F-009: a missing supplementary source (sleep) degrades to partial, never to error.
  if (status === 'ok' && sleep.state !== 'ok') status = 'partial';

  const xpRaw = read('health_xp_total', (e) => nonNegativeInt(e.state));
  const trainedToday =
    lastWorkoutAt.value === null
      ? lastWorkoutAt.state === 'unavailable' && weekly.state === 'ok'
        ? false
        : null
      : localDate(Date.parse(lastWorkoutAt.value), timeZone) === localDate(now, timeZone);

  return {
    now,
    timeZone,
    status,
    sourceStatus,
    lastSuccessAt,
    stale: status === 'stale' || staleBySuccess,
    nextStepText,
    week: {
      completed: weekly,
      target,
      goalMet,
      periodStart,
      periodEndExclusive,
      daysLeft: daysLeftInPeriod(periodEndExclusive, now, timeZone),
      durationSeconds: read('health_weekly_workout_duration', durationSeconds),
    },
    streakWeeks: read('health_streak_weeks', (e) => nonNegativeInt(e.state)),
    xpTotal: xpRaw,
    xpLevel: read('health_xp_level', (e) => {
      const n = nonNegativeInt(e.state);
      return n && n >= 1 ? n : null;
    }),
    xpLevelProgress: read('health_xp_level_progress', (e) => {
      const n = toNumber(e.state);
      return n !== null && n >= 0 && n <= 100 ? n : null;
    }),
    lastWorkoutAt,
    lastWorkoutSeconds,
    trainedToday,
    weight: { ...weight, unit: weightUnit },
    sleepMinutes: {
      ...sleep,
      verified: typeof verifiedAttr === 'boolean' ? verifiedAttr : null,
    },
    flexMealAvailable: read('health_flex_meal_token', (e) => binary(e.state)),
    milestones,
    updatedAt,
  };
}

/** True when the installation has no imported history yet (F-001): XP/streak must not pose as history. */
export const hasNoHistory = (model: HealthModel) =>
  model.status === 'empty' ||
  (model.lastWorkoutAt.state !== 'ok' && model.sourceStatus.value === 'empty');

export const trainingsCs = (n: number) => `${n} ${czPlural(n, 'trénink', 'tréninky', 'tréninků')}`;
export const daysCs = (n: number) => `${n} ${czPlural(n, 'den', 'dny', 'dní')}`;
export const weeksCs = (n: number) => `${n} ${czPlural(n, 'týden', 'týdny', 'týdnů')}`;

/** Remaining sessions and the days still usable for them (today excluded once trained). */
export function weekSlack(model: HealthModel) {
  const { completed, target, daysLeft } = model.week;
  if (completed.value === null || target.value === null || daysLeft === null) return null;
  const remaining = Math.max(0, target.value - completed.value);
  const usableDays = daysLeft - (model.trainedToday ? 1 : 0);
  return { remaining, usableDays, daysLeft, slack: usableDays - remaining };
}

/**
 * Hero "next step" (HEA-002). Deterministic copy derived only from provided weekly facts;
 * sleep never drives the recommendation (HEA-010), no diagnostic wording (HEA-012).
 */
export function deriveNextStep(model: HealthModel): NextStep {
  if (model.status === 'missing')
    return {
      kind: 'missing',
      title: 'Integrace Zdraví není připojená',
      detail:
        'Modul čte data z integrace health_fitness. Po instalaci a namapování entit se tu objeví další krok.',
    };
  if (hasNoHistory(model))
    return {
      kind: 'empty',
      title: 'Zatím žádné importované tréninky',
      detail:
        'Integrace běží, ale ještě nedostala žádný trénink. První import se tu ukáže automaticky.',
    };
  if (model.nextStepText.value)
    return { kind: 'source', title: model.nextStepText.value, detail: 'Doporučení z integrace.' };
  if (model.week.goalMet.value)
    return {
      kind: 'met',
      title: 'Týdenní minimum splněno',
      detail: 'Dnes klidně regenerace, procházka nebo dobrovolný trénink navíc.',
    };
  const slack = weekSlack(model);
  if (!slack)
    return model.status === 'unavailable' || model.status === 'error'
      ? {
          kind: 'unavailable',
          title: 'Data Zdraví teď nejsou k dispozici',
          detail: 'Integrace nevrací týdenní stav. Hodnoty se nedopočítávají.',
        }
      : {
          kind: 'unknown',
          title: 'Týdenní cíl zatím neznámý',
          detail: 'Integrace nedodala počet tréninků nebo hranice týdne.',
        };
  const { remaining, usableDays, daysLeft } = slack;
  const rest = `Do minima ${remaining === 1 ? 'zbývá' : 'zbývají'} ${trainingsCs(remaining)}, do konce týdne ${daysCs(daysLeft)}.`;
  if (remaining > usableDays)
    return {
      kind: 'missed',
      title: 'Minimum tento týden nevyjde',
      detail: `${rest} Každý trénink se i tak počítá do XP.`,
    };
  if (model.trainedToday) return { kind: 'done_today', title: 'Dnes máš odcvičeno', detail: rest };
  const yesterday = localDate(model.now - DAY, model.timeZone);
  const trainedYesterday =
    model.lastWorkoutAt.value !== null &&
    localDate(Date.parse(model.lastWorkoutAt.value), model.timeZone) === yesterday;
  if (trainedYesterday && slack.slack >= 2)
    return {
      kind: 'rest',
      title: 'Dnes klidně odpočinek',
      detail: `Včera trénink a času je dost. ${rest}`,
    };
  return { kind: 'train', title: 'Dnes silový trénink', detail: rest };
}

/** One-line summary for the Dnes screen (HEA-011); null when nothing may be shown. */
export function healthSummary(model: HealthModel): string | null {
  if (model.status === 'missing') return null;
  const step = deriveNextStep(model);
  const { completed, target } = model.week;
  const week =
    completed.value !== null && target.value !== null
      ? ` · ${completed.value} / ${target.value}`
      : '';
  return `${step.title}${week}`;
}

function parseMeanRows(raw: unknown): WeightPoint[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row: unknown) => {
      const r = row as { start?: unknown; mean?: unknown; state?: unknown };
      const t =
        typeof r.start === 'number'
          ? r.start
          : typeof r.start === 'string'
            ? Date.parse(r.start)
            : NaN;
      const v = toNumber(r.mean ?? r.state);
      return Number.isFinite(t) && v !== null && v > 0 ? { t, v } : null;
    })
    .filter((p): p is WeightPoint => p !== null)
    .sort((a, b) => a.t - b.t);
}

/** Daily mean weight from recorder long-term statistics (WS read-only, no writes). */
export async function fetchWeightHistory(
  connection: ConnectionLike | undefined,
  bindings: Record<string, string>,
  now: number,
  days = 30,
): Promise<WeightHistory> {
  const id = boundId(bindings, 'health_weight_trend');
  if (!connection || !id) return { status: 'unsupported', points: [] };
  try {
    const raw = await connection.sendMessagePromise<Record<string, unknown>>({
      type: 'recorder/statistics_during_period',
      start_time: new Date(now - days * DAY).toISOString(),
      end_time: new Date(now).toISOString(),
      statistic_ids: [id],
      period: 'day',
      types: ['mean'],
    } as { type: string });
    return { status: 'ready', points: parseMeanRows(raw?.[id]) };
  } catch {
    return { status: 'error', points: [] };
  }
}

/** Change between the first and last daily mean; informational only, never a judgement. */
export function weightChange(history: WeightHistory): { delta: number; days: number } | null {
  const first = history.points[0];
  const last = history.points.at(-1);
  if (!first || !last || history.points.length < 2) return null;
  return { delta: last.v - first.v, days: Math.max(1, Math.round((last.t - first.t) / DAY)) };
}

/**
 * Days of the current week with a workout: distinct local dates of the
 * `health_last_workout` timestamps the recorder saw since the week start
 * (plus the current value). Nothing is guessed – no history = `unsupported`.
 */
export async function fetchWorkoutDays(
  connection: ConnectionLike | undefined,
  bindings: Record<string, string>,
  model: Pick<HealthModel, 'now' | 'timeZone' | 'week' | 'lastWorkoutAt'>,
): Promise<WorkoutDays> {
  const id = boundId(bindings, 'health_last_workout');
  const start = model.week.periodStart ? Date.parse(model.week.periodStart) : NaN;
  if (!connection || !id || Number.isNaN(start)) return { status: 'unsupported', days: [] };
  try {
    const raw = await connection.sendMessagePromise<Record<string, unknown>>({
      type: 'history/history_during_period',
      start_time: new Date(start).toISOString(),
      end_time: new Date(model.now).toISOString(),
      entity_ids: [id],
      minimal_response: true,
      no_attributes: true,
      include_start_time_state: false,
    } as { type: string });
    const rows = Array.isArray(raw?.[id]) ? (raw[id] as unknown[]) : [];
    const stamps = rows.map((row) =>
      row && typeof row === 'object'
        ? ((row as { s?: unknown; state?: unknown }).s ?? (row as { state?: unknown }).state)
        : undefined,
    );
    if (model.lastWorkoutAt.value) stamps.push(model.lastWorkoutAt.value);
    const days = new Set<string>();
    for (const s of stamps) {
      const t = typeof s === 'string' ? Date.parse(s) : NaN;
      if (!Number.isNaN(t) && t >= start && t <= model.now) days.add(localDate(t, model.timeZone));
    }
    return { status: 'ready', days: [...days].sort() };
  } catch {
    return { status: 'error', days: [] };
  }
}

/** The 7 local dates of the week starting at `periodStart` (DST-safe: noon anchors). */
export function weekDates(periodStart: string | null, timeZone: string): string[] {
  if (!periodStart) return [];
  const start = Date.parse(periodStart);
  if (Number.isNaN(start)) return [];
  return Array.from({ length: 7 }, (_, i) => localDate(start + i * DAY + 12 * 3_600_000, timeZone));
}

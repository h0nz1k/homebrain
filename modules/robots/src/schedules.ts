import type { ConnectionLike } from '@homebrain/ha-client';
import { czCount } from '@homebrain/ui';
import {
  MAX_PLUS,
  MAX_PLUS_HINT,
  effectiveSettings,
  type CleanSettings,
  type PresetsBySlot,
} from './presets.js';

/**
 * Cleaning schedules run by the HomeBrain integration (backend `homebrain/robots/schedules/*`):
 * minute tick in HA's time zone, quiet hours, readiness retries every 30 min, notifications
 * only on errors. The panel only edits them and shows next run + last result.
 */
export interface RobotSchedule {
  id: string;
  name: string;
  slot: number;
  /** Stable preset id, or null = inline („vlastní“) settings + rooms. */
  preset_id: string | null;
  settings: CleanSettings | null;
  rooms: number[];
  /** 0 = Monday … 6 = Sunday. */
  days: number[];
  /** Local `HH:MM`. */
  time: string;
  enabled: boolean;
  paused_until: string | null;
}
export type RunResult = 'started' | 'ok' | 'failed' | 'error' | 'gave_up' | 'skipped';
export interface ScheduleRun {
  id: string;
  schedule_id: string;
  name: string;
  slot: number | null;
  at: string;
  result: RunResult;
  reason: string | null;
  attempts: number;
  manual: boolean;
}
export interface ScheduleView extends RobotSchedule {
  next_run: string | null;
  last_run: ScheduleRun | null;
  pending: { next_try: string; attempts: number; reason: string | null } | null;
}
export interface ScheduleSettings {
  quiet_start: string;
  quiet_end: string;
  paused_until: string | null;
}
export interface SchedulesOverview {
  schedules: ScheduleView[];
  settings: ScheduleSettings;
  runs: ScheduleRun[];
  notify_service: string | null;
  available_notify_services: string[];
  min_battery: number;
  retry_minutes: number;
}
export interface ScheduleDraft {
  id?: string;
  name: string;
  slot: number;
  preset_id: string | null;
  settings: CleanSettings | null;
  rooms: number[];
  days: number[];
  time: string;
  enabled: boolean;
}

export const DAY_LABELS = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'] as const;
const EVERY_DAY = [
  'Každé pondělí',
  'Každé úterý',
  'Každou středu',
  'Každý čtvrtek',
  'Každý pátek',
  'Každou sobotu',
  'Každou neděli',
];
export const SCHEDULE_NAME_MAX = 40;
export const DEFAULT_QUIET: ScheduleSettings = {
  quiet_start: '22:00',
  quiet_end: '07:00',
  paused_until: null,
};

const minutes = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));

/** Quiet hours `[start, end)`, may wrap midnight; equal = none (mirrors the backend). */
export function inQuiet(hm: string, start: string, end: string): boolean {
  const t = minutes(hm);
  const a = minutes(start);
  const b = minutes(end);
  if (a === b) return false;
  return a < b ? t >= a && t < b : t >= a || t < b;
}

/** „Každý den“, „Po–Pá“, „Víkend“, „Každou středu“, „Po, St, Pá“. */
export function describeDays(days: number[]): string {
  const sorted = [...new Set(days)].sort((a, b) => a - b);
  if (sorted.length === 7) return 'Každý den';
  if (sorted.join() === '0,1,2,3,4') return 'Po–Pá';
  if (sorted.join() === '5,6') return 'Víkend';
  if (sorted.length === 1) return EVERY_DAY[sorted[0]!]!;
  return sorted.map((d) => DAY_LABELS[d]).join(', ');
}

/** „dnes 10:00“, „zítra 10:00“, „st 4. 11. 10:00“ (local time). */
export function formatWhen(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  const hm = date.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((day(date) - day(now)) / 86_400_000);
  if (diff === 0) return `dnes ${hm}`;
  if (diff === 1) return `zítra ${hm}`;
  if (diff === -1) return `včera ${hm}`;
  const wd = DAY_LABELS[(date.getDay() + 6) % 7]!.toLowerCase();
  return `${wd} ${date.getDate()}. ${date.getMonth() + 1}. ${hm}`;
}

export const REASON_LABELS: Record<string, string> = {
  unavailable: 'robot nedostupný',
  busy: 'robot uklízel',
  robot_error: 'chyba robota',
  not_docked: 'mimo dok',
  battery: 'slabá baterie',
  quiet_hours: 'noční klid',
  missed: 'HA neběžel',
  queued: 'čeká na předchozí úklid',
  not_found: 'předvolba nebo robot chybí',
  unknown_room: 'místnost už není na mapě',
  apply_timeout: 'robot nepotvrdil nastavení',
  failed: 'chyba spuštění',
};

export type BadgeTone = 'ok' | 'warn' | 'crit' | 'neutral';
/** Last-result badge: label + tone. */
export function runBadge(run: ScheduleRun | null): { label: string; tone: BadgeTone } | null {
  if (!run) return null;
  const reason = run.reason ? (REASON_LABELS[run.reason] ?? run.reason) : null;
  switch (run.result) {
    case 'ok':
      return { label: 'Hotovo', tone: 'ok' };
    case 'started':
      return { label: 'Spuštěno', tone: 'ok' };
    case 'skipped':
      return { label: `Vynecháno${reason ? ` · ${reason}` : ''}`, tone: 'neutral' };
    case 'gave_up':
      return { label: `Neproběhlo${reason ? ` · ${reason}` : ''}`, tone: 'warn' };
    case 'error':
      return { label: 'Chyba robota', tone: 'crit' };
    default:
      return { label: `Nespuštěno${reason ? ` · ${reason}` : ''}`, tone: 'crit' };
  }
}

/** Short text of what the schedule does (preset name or inline summary + rooms). */
export function scheduleWhat(
  schedule: Pick<RobotSchedule, 'preset_id' | 'rooms' | 'slot'>,
  presets: PresetsBySlot,
): string {
  if (schedule.preset_id) {
    const preset = presets[String(schedule.slot)]?.presets.find((p) => p.id === schedule.preset_id);
    return preset ? preset.name : 'Smazaná předvolba';
  }
  return schedule.rooms.length
    ? czCount(schedule.rooms.length, 'místnost', 'místnosti', 'místností')
    : 'Celý byt';
}

/** Czech validation message or null. */
export function validateSchedule(draft: ScheduleDraft, settings: ScheduleSettings): string | null {
  const name = draft.name.trim();
  if (!name) return 'Zadejte název plánu.';
  if (name.length > SCHEDULE_NAME_MAX) return `Název může mít nejvýš ${SCHEDULE_NAME_MAX} znaků.`;
  if (!draft.days.length) return 'Vyberte aspoň jeden den.';
  if (!draft.preset_id && draft.settings?.fan === MAX_PLUS && draft.settings.mode !== 'vacuum')
    return `${MAX_PLUS_HINT}.`;
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(draft.time)) return 'Zadejte čas.';
  if (inQuiet(draft.time, settings.quiet_start, settings.quiet_end))
    return `Čas spadá do nočního klidu (${settings.quiet_start}–${settings.quiet_end}).`;
  return null;
}

// --- WebSocket ---------------------------------------------------------------------------

export function fetchSchedules(connection: ConnectionLike): Promise<SchedulesOverview> {
  const message = { type: 'homebrain/robots/schedules/list' };
  return connection.sendMessagePromise<SchedulesOverview>(message);
}
export async function saveSchedule(
  connection: ConnectionLike,
  draft: ScheduleDraft,
): Promise<RobotSchedule> {
  const { id, ...rest } = draft;
  const schedule = {
    ...rest,
    name: draft.name.trim().replace(/\s+/g, ' '),
    ...(id ? { id } : {}),
    ...(draft.preset_id ? { settings: null, rooms: [] } : {}),
  };
  const message = { type: 'homebrain/robots/schedules/save', schedule };
  const res = await connection.sendMessagePromise<{ schedule: RobotSchedule }>(message);
  return res.schedule;
}
export async function deleteSchedule(connection: ConnectionLike, id: string): Promise<void> {
  const message = { type: 'homebrain/robots/schedules/delete', schedule_id: id };
  await connection.sendMessagePromise(message);
}
export async function pauseSchedules(connection: ConnectionLike, until: string | null) {
  const message = { type: 'homebrain/robots/schedules/pause', until };
  await connection.sendMessagePromise(message);
}
export async function saveScheduleSettings(
  connection: ConnectionLike,
  patch: { quiet_start?: string; quiet_end?: string; notify_service?: string | null },
) {
  const message = { type: 'homebrain/robots/schedules/settings', ...patch };
  await connection.sendMessagePromise(message);
}

// --- dev mock ----------------------------------------------------------------------------

/** In-memory schedules backend for the dev panel and e2e (no robot is ever started). */
export function createSchedulesDemo(now: () => Date = () => new Date()) {
  const state = {
    schedules: [] as RobotSchedule[],
    settings: { ...DEFAULT_QUIET } as ScheduleSettings,
    runs: [] as ScheduleRun[],
    notify: null as string | null,
  };
  let next = 0x5c4ed0;
  const nextRun = (s: RobotSchedule): string | null => {
    if (!s.enabled || inQuiet(s.time, state.settings.quiet_start, state.settings.quiet_end))
      return null;
    const base = now();
    for (let i = 0; i < 380; i++) {
      const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (!s.days.includes((d.getDay() + 6) % 7)) continue;
      if (state.settings.paused_until && iso <= state.settings.paused_until) continue;
      d.setHours(minutes(s.time) / 60, minutes(s.time) % 60);
      if (d > base) return d.toISOString();
    }
    return null;
  };
  type Msg = Record<string, unknown>;
  return {
    state,
    handlers: {
      'homebrain/robots/schedules/list': (): SchedulesOverview => ({
        schedules: state.schedules.map((s) => ({
          ...structuredClone(s),
          next_run: nextRun(s),
          last_run: [...state.runs].reverse().find((r) => r.schedule_id === s.id) ?? null,
          pending: null,
        })),
        settings: { ...state.settings },
        runs: [...state.runs].reverse(),
        notify_service: state.notify,
        available_notify_services: ['mobile_app_telefon'],
        min_battery: 30,
        retry_minutes: 30,
      }),
      'homebrain/robots/schedules/save': (message: unknown) => {
        const raw = (message as Msg).schedule as ScheduleDraft;
        if (inQuiet(raw.time, state.settings.quiet_start, state.settings.quiet_end))
          throw Object.assign(new Error('quiet_hours'), { code: 'quiet_hours' });
        const stored: RobotSchedule = {
          id: raw.id ?? (next++).toString(16).padStart(12, '0'),
          name: raw.name,
          slot: raw.slot,
          preset_id: raw.preset_id ?? null,
          settings: raw.preset_id ? null : effectiveSettings(raw.settings),
          rooms: raw.preset_id ? [] : [...(raw.rooms ?? [])],
          days: [...raw.days].sort((a, b) => a - b),
          time: raw.time,
          enabled: raw.enabled !== false,
          paused_until: null,
        };
        const index = state.schedules.findIndex((s) => s.id === stored.id);
        if (index >= 0) state.schedules[index] = stored;
        else state.schedules.push(stored);
        return { schedule: stored };
      },
      'homebrain/robots/schedules/delete': (message: unknown) => {
        state.schedules = state.schedules.filter((s) => s.id !== (message as Msg).schedule_id);
        return { deleted: true };
      },
      'homebrain/robots/schedules/pause': (message: unknown) => {
        state.settings.paused_until = ((message as Msg).until as string | null) ?? null;
        return { settings: { ...state.settings } };
      },
      'homebrain/robots/schedules/settings': (message: unknown) => {
        const msg = message as Msg;
        if (typeof msg.quiet_start === 'string') state.settings.quiet_start = msg.quiet_start;
        if (typeof msg.quiet_end === 'string') state.settings.quiet_end = msg.quiet_end;
        if ('notify_service' in msg) state.notify = (msg.notify_service as string | null) ?? null;
        return { settings: { ...state.settings }, notify_service: state.notify };
      },
    },
    /** Seed a run result (screenshots / e2e badges). */
    addRun(run: Omit<ScheduleRun, 'id'>) {
      state.runs.push({ ...run, id: (next++).toString(16) });
    },
  };
}

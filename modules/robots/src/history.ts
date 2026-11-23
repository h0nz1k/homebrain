import type { ConnectionLike } from '@homebrain/ha-client';
import type { Room } from './rooms.js';

/**
 * Cleaning history (`homebrain/robots/history`): recorded by the integration from HA states
 * only (no Roborock calls), incl. runs started from the vendor app or its schedules.
 */
export type RunSource = 'homebrain' | 'aplikace' | null;

export interface RunRoom {
  /** Map segment id; null when the room name is not on a cached map (other floor). */
  id: number | null;
  name: string;
  dwell_s: number;
}

export interface CleanRun {
  id: string;
  slot: number;
  start: string;
  end: string;
  duration_s: number;
  area_m2: number | null;
  rooms: RunRoom[];
  source: RunSource;
  /** Known only from the robot's own record (HA did not watch the run live). */
  partial: boolean;
}

export interface RoomCleaned {
  id: number | null;
  name: string;
  at: string;
}

export interface RobotHistory {
  last_cleaned: RoomCleaned[];
  runs: CleanRun[];
  active: { start: string; source: RunSource } | null;
}

export type HistoryBySlot = Record<string, RobotHistory>;

const TZ = 'Europe/Prague';
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object';
const str = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const source = (v: unknown): RunSource => (v === 'homebrain' || v === 'aplikace' ? v : null);

function parseRun(raw: unknown): CleanRun | null {
  if (!isObj(raw) || !str(raw.id) || !str(raw.start) || !str(raw.end) || !num(raw.slot))
    return null;
  const rooms = Array.isArray(raw.rooms)
    ? raw.rooms.flatMap((room): RunRoom[] =>
        isObj(room) && str(room.name)
          ? [
              {
                id: num(room.id) ? room.id : null,
                name: room.name,
                dwell_s: num(room.dwell_s) ? room.dwell_s : 0,
              },
            ]
          : [],
      )
    : [];
  return {
    id: raw.id,
    slot: raw.slot,
    start: raw.start,
    end: raw.end,
    duration_s: num(raw.duration_s) ? raw.duration_s : 0,
    area_m2: num(raw.area_m2) ? raw.area_m2 : null,
    rooms,
    source: source(raw.source),
    partial: raw.partial === true,
  };
}

/** Validate the WS answer; anything odd is dropped (an old backend answers nothing). */
export function parseHistory(value: unknown): HistoryBySlot {
  const robots = isObj(value) && isObj(value.robots) ? value.robots : {};
  const out: HistoryBySlot = {};
  for (const [slot, raw] of Object.entries(robots)) {
    if (!isObj(raw)) continue;
    const runs = Array.isArray(raw.runs) ? raw.runs.map(parseRun).filter((r) => r !== null) : [];
    const last = Array.isArray(raw.last_cleaned)
      ? raw.last_cleaned.flatMap((item): RoomCleaned[] =>
          isObj(item) && str(item.name) && str(item.at)
            ? [{ id: num(item.id) ? item.id : null, name: item.name, at: item.at }]
            : [],
        )
      : [];
    const active =
      isObj(raw.active) && str(raw.active.start)
        ? { start: raw.active.start, source: source(raw.active.source) }
        : null;
    out[slot] = { last_cleaned: last, runs, active };
  }
  return out;
}

export async function fetchHistory(connection: ConnectionLike): Promise<HistoryBySlot> {
  return parseHistory(
    await connection.sendMessagePromise<unknown>({ type: 'homebrain/robots/history' }),
  );
}

/** Push `{slot}` when a run finished; resolves to an unsubscribe (no-op without support). */
export async function subscribeHistory(
  connection: ConnectionLike,
  onRunFinished: () => void,
): Promise<() => void> {
  if (!connection.subscribeMessage) return () => undefined;
  const unsub = await connection.subscribeMessage<unknown>(() => onRunFinished(), {
    type: 'homebrain/robots/history/subscribe',
  });
  return () => void unsub();
}

/** Tell the integration that HomeBrain just started this robot (history source). */
export function markCommand(connection: ConnectionLike, slot: number): Promise<unknown> {
  return connection
    .sendMessagePromise({ type: 'homebrain/robots/history/mark', slot } as { type: string })
    .catch(() => undefined);
}

/** When was this room last cleaned (segment id first, then the name of id-less records). */
export function lastCleanedAt(history: RobotHistory | null | undefined, room: Room): string | null {
  if (!history) return null;
  const byId = history.last_cleaned.find((item) => item.id === room.id);
  const byName = history.last_cleaned.find((item) => item.id === null && item.name === room.name);
  const at = [byId?.at, byName?.at].filter((v): v is string => !!v).sort();
  return at.at(-1) ?? null;
}

const dayKey = (date: Date) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
const clock = (date: Date) =>
  new Intl.DateTimeFormat('cs-CZ', { timeZone: TZ, hour: 'numeric', minute: '2-digit' }).format(
    date,
  );

/** Whole Prague calendar days between `at` and `now` (0 = today). */
export function daysAgo(at: Date, now: Date): number {
  const a = Date.parse(`${dayKey(at)}T00:00:00Z`);
  const b = Date.parse(`${dayKey(now)}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/** „Uklizeno dnes 9:40“ / „Uklizeno včera 18:05“ / „Uklizeno před 3 dny“ / „Zatím neuklizeno“. */
export function cleanedLabel(at: string | null, now: Date): string {
  const date = at ? new Date(at) : null;
  if (!date || Number.isNaN(date.getTime())) return 'Zatím neuklizeno';
  const days = Math.max(0, daysAgo(date, now));
  if (days === 0) return `Uklizeno dnes ${clock(date)}`;
  if (days === 1) return `Uklizeno včera ${clock(date)}`;
  return `Uklizeno před ${days} dny`;
}

/** Run time for the history list: „Dnes 9:40“, „Včera 18:05“, „Po 2. 11. 9:40“. */
export function runWhen(at: string, now: Date): string {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return '';
  const days = daysAgo(date, now);
  if (days === 0) return `Dnes ${clock(date)}`;
  if (days === 1) return `Včera ${clock(date)}`;
  const day = new Intl.DateTimeFormat('cs-CZ', {
    timeZone: TZ,
    weekday: 'short',
    day: 'numeric',
    month: 'numeric',
  }).format(date);
  // cs-CZ weekdays come lower-case („so“): capitalise like „Dnes“ / „Včera“.
  return `${day.charAt(0).toLocaleUpperCase('cs-CZ')}${day.slice(1)} ${clock(date)}`;
}

/** „42 min“, „1 h 5 min“ (at least 1 min). */
export function durationLabel(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** „před 4 min“ / „před 2 h“ / „před 30 h“ / „před 3 dny“ – compact age of a data stamp. */
export function ageLabel(ms: number): string {
  const minutes = Math.max(1, Math.floor(ms / 60_000));
  if (minutes < 60) return `před ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `před ${hours} h`;
  return `před ${Math.floor(hours / 24)} dny`;
}

export const MAP_STALE_MS = 2 * 60_000;
export const STATE_STALE_MS = 90_000;
/** In the dock the map only changes with the next run: its age matters after a day. */
export const MAP_DOCK_STALE_MS = 24 * 3_600_000;

/**
 * Muted „Mapa před 4 min“ / „Stav před 2 min“ while the robot is active: the HA Roborock
 * integration refreshes both only every ~30 s (cloud), so a gap means data is lagging.
 * In the dock only a map older than a day („Mapa před 30 h“). Nothing is fetched for it.
 */
export function staleLabels(
  input: { active: boolean; stateAt: string | null; mapAt: string | null; hasMap: boolean },
  now: number,
): { map: string | null; state: string | null } {
  const age = (at: string | null, limit: number | null, label: string) => {
    const ms = at ? Date.parse(at) : NaN;
    return limit !== null && Number.isFinite(ms) && now - ms > limit
      ? `${label} ${ageLabel(now - ms)}`
      : null;
  };
  return {
    map: input.hasMap
      ? age(input.mapAt, input.active ? MAP_STALE_MS : MAP_DOCK_STALE_MS, 'Mapa')
      : null,
    state: age(input.stateAt, input.active ? STATE_STALE_MS : null, 'Stav'),
  };
}

/** „Stav před 2 min“ regardless of the threshold (a command got no reply: data may be old). */
export function stateAgeLabel(stateAt: string | null, now: number): string | null {
  const ms = stateAt ? Date.parse(stateAt) : NaN;
  return Number.isFinite(ms) ? `Stav ${ageLabel(Math.max(0, now - ms))}` : null;
}

/**
 * The room the robot cleans right now: the HA `current_room` sensor (room name of the
 * current map, resolved by the integration from the map's `vacuum_room`), else the robot
 * position on the drawn map (point in polygon).
 */
export function liveRoomId(
  rooms: Room[],
  sensorRoom: string | null,
  poseRoom: number | null,
): number | null {
  const name = sensorRoom?.trim();
  const hit = name ? rooms.find((room) => room.name === name) : undefined;
  if (hit) return hit.id;
  return poseRoom !== null && rooms.some((room) => room.id === poseRoom) ? poseRoom : null;
}

/** Newest runs over all robots (history card). */
export function recentRuns(history: HistoryBySlot, limit = 10): CleanRun[] {
  return Object.values(history)
    .flatMap((robot) => robot.runs)
    .sort((a, b) => (a.start < b.start ? 1 : a.start > b.start ? -1 : 0))
    .slice(0, limit);
}

/** Dev/e2e: synthetic history relative to `nowMs` (no real household data). */
export function demoHistory(nowMs: number, variant: 'demo' | 'empty' = 'demo'): HistoryBySlot {
  if (variant === 'empty')
    return {
      '1': { last_cleaned: [], runs: [], active: null },
      '2': { last_cleaned: [], runs: [], active: null },
    };
  const iso = (minutesAgo: number) => new Date(nowMs - minutesAgo * 60_000).toISOString();
  const run = (
    id: string,
    slot: number,
    endedMinutesAgo: number,
    minutes: number,
    area: number,
    rooms: [number, string][],
    src: RunSource,
  ): CleanRun => ({
    id,
    slot,
    start: iso(endedMinutesAgo + minutes),
    end: iso(endedMinutesAgo),
    duration_s: minutes * 60,
    area_m2: area,
    rooms: rooms.map(([roomId, name]) => ({ id: roomId, name, dwell_s: 300 })),
    source: src,
    partial: false,
  });
  const runs1 = [
    run(
      'r1a',
      1,
      95,
      38,
      31.5,
      [
        [2, 'Kuchyně'],
        [3, 'Jídelna'],
        [4, 'Chodba'],
      ],
      'homebrain',
    ),
    run(
      'r1b',
      1,
      60 * 27,
      52,
      48,
      [
        [1, 'Obývací pokoj'],
        [4, 'Chodba'],
      ],
      'aplikace',
    ),
    run(
      'r1c',
      1,
      60 * 24 * 3 + 40,
      24,
      12.5,
      [
        [6, 'Koupelna'],
        [5, 'WC'],
      ],
      'aplikace',
    ),
  ];
  const runs2 = [
    run(
      'r2a',
      2,
      60 * 5,
      41,
      35,
      [
        [16, 'Ložnice'],
        [19, 'Chodba'],
      ],
      'aplikace',
    ),
    run(
      'r2b',
      2,
      60 * 24 * 2 + 15,
      33,
      27,
      [
        [17, 'Pracovna'],
        [18, 'Dětský pokoj'],
      ],
      'homebrain',
    ),
  ];
  const last = (runs: CleanRun[]): RoomCleaned[] => {
    const seen = new Map<number, RoomCleaned>();
    for (const r of runs)
      for (const room of r.rooms)
        if (room.id !== null && !seen.has(room.id))
          seen.set(room.id, { id: room.id, name: room.name, at: r.end });
    return [...seen.values()];
  };
  return {
    '1': { last_cleaned: last(runs1), runs: runs1, active: null },
    '2': { last_cleaned: last(runs2), runs: runs2, active: null },
  };
}

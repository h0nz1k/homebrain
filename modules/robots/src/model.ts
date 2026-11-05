import type { ConnectionLike, EntityStateLike } from '@homebrain/ha-client';
import {
  consumableInfo,
  sortConsumables,
  type ConsumableInfo,
  type ConsumableKind,
} from './consumables.js';
import { describeError, type ErrorAdvice } from './errors.js';
import { describeStatus, type RobotStatus } from './status.js';
import { activeMap, type RobotMap, type Room } from './rooms.js';
import { fanChoices, modeFromOption, type CleanMode } from './commands.js';

export const ROBOT_SLOTS = [1, 2, 3] as const;

/** One robot from `homebrain/robots/get` (display settings + room lists). */
export interface RobotMeta {
  slot: number;
  name: string;
  floor: string;
  image: string;
  vacuum: string;
  maps: RobotMap[];
  maps_error: string | null;
  maps_updated_at: string | null;
}

export interface TankInfo {
  key: 'clean_water' | 'dirty_water' | 'cleaning_fluid' | 'water_shortage';
  label: string;
  ok: boolean;
  text: string;
}

export interface RobotModel {
  slot: number;
  name: string;
  floor: string;
  image: string;
  vacuum: string;
  available: boolean;
  status: RobotStatus;
  battery: number | null;
  room: string | null;
  progress: number | null;
  error: ErrorAdvice | null;
  dockError: ErrorAdvice | null;
  consumables: ConsumableInfo[];
  tanks: TankInfo[];
  fan: string | null;
  fanChoices: string[];
  mode: CleanMode | null;
  modeSelect: string | null;
  modeOptions: string[];
  rooms: Room[];
  mapName: string | null;
  mapsError: string | null;
  mapImage: string | null;
  /** State of the map image entity (changes whenever HA refreshes the map). */
  mapStamp: string | null;
}

type Get = (entityId: string | undefined) => EntityStateLike | undefined;
const key = (slot: number, suffix: string) => `robot${slot}_${suffix}`;

function num(state: EntityStateLike | undefined): number | null {
  if (!state) return null;
  const value = Number.parseFloat(state.state);
  return Number.isFinite(value) ? value : null;
}
function text(state: EntityStateLike | undefined): string | null {
  if (!state || state.state === 'unavailable' || state.state === 'unknown') return null;
  return state.state;
}

const TANKS: [TankInfo['key'], string, string, string][] = [
  ['clean_water', 'Čistá voda', 'Doplnit', 'V pořádku'],
  ['dirty_water', 'Špinavá voda', 'Vylít', 'V pořádku'],
  ['cleaning_fluid', 'Saponát', 'Došel', 'V pořádku'],
  ['water_shortage', 'Voda v robotu', 'Chybí', 'V pořádku'],
];
const CONSUMABLES: ConsumableKind[] = [
  'main_brush',
  'side_brush',
  'filter',
  'sensors',
  'dock_strainer',
  'dock_brush',
];

/** Picture URL of an `image.*` entity (HA image proxy with the entity's access token). */
export function imageUrl(state: EntityStateLike | undefined): string | null {
  if (!state || state.state === 'unavailable') return null;
  const picture = state.attributes.entity_picture;
  if (typeof picture === 'string' && picture) return picture;
  const token = state.attributes.access_token;
  return typeof token === 'string'
    ? `/api/image_proxy/${state.entity_id}?token=${encodeURIComponent(token)}`
    : null;
}

/** Slots the owner configured: from the WS answer, else from bound vacuums only. */
export function configuredSlots(
  bindings: Record<string, string>,
  metas: RobotMeta[] | null,
): number[] {
  if (metas?.length) return metas.map((meta) => meta.slot);
  return ROBOT_SLOTS.filter((slot) => bindings[key(slot, 'vacuum')]);
}

export function buildRobot(
  slot: number,
  bindings: Record<string, string>,
  get: Get,
  meta: RobotMeta | undefined,
  dailyHours = 1,
): RobotModel {
  const b = (suffix: string) => bindings[key(slot, suffix)];
  const vacuumId = meta?.vacuum ?? b('vacuum') ?? '';
  const vacuum = get(vacuumId);
  const available = !!vacuum && vacuum.state !== 'unavailable';
  const status = available
    ? describeStatus(text(get(b('status'))), vacuum.state)
    : describeStatus(null, null);
  const consumables = sortConsumables(
    CONSUMABLES.flatMap((kind) => {
      const hours = num(get(b(kind)));
      return hours === null ? [] : [consumableInfo(kind, hours, dailyHours)];
    }),
  );
  const tanks = TANKS.flatMap(([suffix, label, bad, good]) => {
    const state = text(get(b(suffix)));
    if (state !== 'on' && state !== 'off') return [];
    return [{ key: suffix, label, ok: state === 'off', text: state === 'off' ? good : bad }];
  });
  const modeSelectId = b('cleaning_mode') ?? null;
  const modeState = get(modeSelectId ?? undefined);
  const options = modeState?.attributes.options;
  const map = activeMap(meta?.maps ?? [], text(get(b('selected_map'))));
  const fanList = vacuum?.attributes.fan_speed_list;
  const fan = vacuum?.attributes.fan_speed;
  const errorCode = text(get(b('error')));
  return {
    slot,
    name:
      meta?.name ||
      (typeof vacuum?.attributes.friendly_name === 'string'
        ? vacuum.attributes.friendly_name
        : `Robot ${slot}`),
    floor: meta?.floor || '',
    image: meta?.image ?? '',
    vacuum: vacuumId,
    available,
    status,
    battery:
      num(get(b('battery'))) ??
      (typeof vacuum?.attributes.battery_level === 'number'
        ? vacuum.attributes.battery_level
        : null),
    room: text(get(b('current_room'))),
    progress: status.tone === 'cleaning' ? num(get(b('cleaning_progress'))) : null,
    error: describeError('robot', errorCode),
    dockError: describeError('dock', text(get(b('dock_error')))),
    consumables,
    tanks,
    fan: typeof fan === 'string' ? fan : null,
    fanChoices: Array.isArray(fanList)
      ? fanChoices(
          fanList.filter((v): v is string => typeof v === 'string'),
          typeof fan === 'string' ? fan : null,
        )
      : [],
    mode: modeFromOption(text(modeState)),
    modeSelect: modeState ? modeSelectId : null,
    modeOptions: Array.isArray(options)
      ? options.filter((v): v is string => typeof v === 'string')
      : [],
    rooms: map?.rooms ?? [],
    mapName: map ? map.name || null : null,
    mapsError: meta ? meta.maps_error : null,
    mapImage: imageUrl(get(b('map_image'))),
    mapStamp: text(get(b('map_image'))),
  };
}

/** Overall attention for the floor switcher dot. */
export function attention(robot: RobotModel): 'crit' | 'warn' | 'ok' {
  if (robot.error?.severity === 'error' || robot.dockError || robot.status.tone === 'error')
    return 'crit';
  if (
    robot.error ||
    robot.consumables.some((c) => c.tone !== 'ok') ||
    robot.tanks.some((t) => !t.ok)
  )
    return 'warn';
  return 'ok';
}

export async function fetchRobots(
  connection: ConnectionLike,
  refresh = false,
): Promise<RobotMeta[]> {
  const message = { type: 'homebrain/robots/get', refresh };
  const response = await connection.sendMessagePromise<{ robots?: unknown }>(message);
  return Array.isArray(response?.robots) ? (response.robots as RobotMeta[]) : [];
}

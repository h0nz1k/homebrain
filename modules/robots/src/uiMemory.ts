import type { ConnectionLike } from '@homebrain/ha-client';
import type { CleanMode } from './commands.js';
import type { RobotModel } from './model.js';
import { fitSettings, robotCapabilities, type RobotCapabilities } from './presets.js';

export const ROBOTS_UI_STORAGE_KEY = 'homebrain_robots_v1';

export interface SlotUiMemory {
  advanced?: boolean;
  mode?: CleanMode | null;
  fan?: string | null;
  water?: string | null;
  route?: string | null;
  passes?: number;
  /** Last touched named preset (validated against the robot's list). */
  presetId?: string | null;
}

export interface RobotsUiStore {
  v: 1;
  slots: Record<string, SlotUiMemory>;
}

export const EMPTY_UI_STORE: RobotsUiStore = { v: 1, slots: {} };

const LS_KEY = 'homebrain.robots.ui';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Drop unknown / unsupported values after a robot model change. */
export function validateSlotMemory(
  raw: SlotUiMemory | undefined,
  caps: RobotCapabilities,
  presetIds: readonly string[],
): SlotUiMemory | null {
  if (!raw || typeof raw !== 'object') return null;
  const fitted = fitSettings(
    {
      mode: raw.mode ?? null,
      fan: raw.fan ?? null,
      water: raw.water ?? null,
      route: raw.route ?? null,
      passes: raw.passes ?? 1,
    },
    caps,
  );
  const out: SlotUiMemory = {};
  if (typeof raw.advanced === 'boolean') out.advanced = raw.advanced;
  if (fitted.mode) out.mode = fitted.mode;
  if (fitted.fan) out.fan = fitted.fan;
  if (fitted.water) out.water = fitted.water;
  if (fitted.route) out.route = fitted.route;
  if (raw.passes !== undefined) out.passes = fitted.passes;
  if (raw.presetId && presetIds.includes(raw.presetId)) out.presetId = raw.presetId;
  return Object.keys(out).length ? out : null;
}

export function parseRobotsUiStore(raw: unknown): RobotsUiStore {
  if (!isRecord(raw) || raw.v !== 1 || !isRecord(raw.slots)) return structuredClone(EMPTY_UI_STORE);
  const slots: Record<string, SlotUiMemory> = {};
  for (const [key, value] of Object.entries(raw.slots)) {
    if (isRecord(value)) slots[key] = value as SlotUiMemory;
  }
  return { v: 1, slots };
}

export function readLocalRobotsUi(): RobotsUiStore {
  try {
    const raw = globalThis.localStorage?.getItem(LS_KEY);
    if (!raw) return structuredClone(EMPTY_UI_STORE);
    return parseRobotsUiStore(JSON.parse(raw));
  } catch {
    return structuredClone(EMPTY_UI_STORE);
  }
}

export function writeLocalRobotsUi(store: RobotsUiStore): void {
  try {
    globalThis.localStorage?.setItem(LS_KEY, JSON.stringify(store));
  } catch {
    /* quota / private mode */
  }
}

export function slotMemoryForRobot(
  robot: RobotModel,
  presetIds: readonly string[],
  raw: SlotUiMemory | undefined,
): SlotUiMemory | null {
  return validateSlotMemory(raw, robotCapabilities(robot), presetIds);
}

export function mergeSlotMemory(
  store: RobotsUiStore,
  slot: number,
  patch: SlotUiMemory,
): RobotsUiStore {
  const key = String(slot);
  const next = structuredClone(store);
  next.slots[key] = { ...(next.slots[key] ?? {}), ...patch };
  return next;
}

export async function loadRobotsUi(connection?: ConnectionLike | null): Promise<RobotsUiStore> {
  const local = readLocalRobotsUi();
  if (connection) {
    try {
      const res = await connection.sendMessagePromise<{ value: unknown }>({
        type: 'frontend/get_user_data',
        key: ROBOTS_UI_STORAGE_KEY,
      } as { type: string });
      if (res.value !== undefined && res.value !== null) {
        const remote = parseRobotsUiStore(res.value);
        const merged =
          Object.keys(remote.slots).length === 0 && Object.keys(local.slots).length > 0
            ? local
            : remote;
        writeLocalRobotsUi(merged);
        return merged;
      }
    } catch {
      /* HA too old / mock without handler */
    }
  }
  return local;
}

export async function saveRobotsUi(
  connection: ConnectionLike | null | undefined,
  store: RobotsUiStore,
): Promise<void> {
  writeLocalRobotsUi(store);
  if (!connection) return;
  try {
    await connection.sendMessagePromise({
      type: 'frontend/set_user_data',
      key: ROBOTS_UI_STORAGE_KEY,
      value: store,
    } as { type: string });
  } catch {
    /* offline / unsupported */
  }
}

/** In-memory HA user-data mock (dev panel + tests). */
export function createRobotsUiMemoryDemo() {
  let value: RobotsUiStore = structuredClone(EMPTY_UI_STORE);
  return {
    get store() {
      return value;
    },
    handlers: {
      'frontend/get_user_data': (message: unknown) => {
        const key = String((message as { key?: string }).key ?? '');
        return key === ROBOTS_UI_STORAGE_KEY ? { value: structuredClone(value) } : { value: null };
      },
      'frontend/set_user_data': (message: unknown) => {
        const msg = message as { key?: string; value?: unknown };
        if (msg.key === ROBOTS_UI_STORAGE_KEY)
          value = parseRobotsUiStore(msg.value ?? EMPTY_UI_STORE);
        return { success: true };
      },
    },
  };
}

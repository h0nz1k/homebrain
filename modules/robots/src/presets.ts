import type { ConnectionLike } from '@homebrain/ha-client';
import {
  CLEAN_MODE_LABELS,
  FAN_LABELS,
  MOP_ROUTE_LABELS,
  WATER_LABELS,
  modeMops,
  modeOptionAvailable,
  planCleanRooms,
  type CleanMode,
  type ServiceCallPlan,
} from './commands.js';
import type { RobotModel } from './model.js';

/**
 * Per-robot default cleaning setup and named presets (backend: `homebrain/robots/presets/*`,
 * `homebrain/robots/defaults/*`, `homebrain/robots/start`). `null` = keep the robot's value.
 */
export interface CleanSettings {
  mode: CleanMode | null;
  fan: string | null;
  water: string | null;
  route: string | null;
  /** Passes per room (Roborock `repeat`, 1–3). */
  passes: number;
}
export interface RobotPreset extends CleanSettings {
  /** Stable id – schedules reference presets by it. */
  id: string;
  name: string;
  /** Ordered segment ids; empty = whole home. */
  rooms: number[];
}
export interface RobotPresetData {
  defaults: CleanSettings | null;
  presets: RobotPreset[];
}
export type PresetsBySlot = Record<string, RobotPresetData>;
export interface StartRequest {
  slot: number;
  preset_id?: string;
  rooms?: number[];
  settings?: Partial<CleanSettings>;
}

export const MAX_PASSES = 3;
export const PRESET_NAME_MAX = 40;
const SETTING_KEYS = ['mode', 'fan', 'water', 'route', 'passes'] as const;

export const EMPTY_SETTINGS: CleanSettings = {
  mode: null,
  fan: null,
  water: null,
  route: null,
  passes: 1,
};

/** Defaults ← preset ← explicit; `null`/missing fields never override (mirrors the backend). */
export function effectiveSettings(
  ...layers: (Partial<CleanSettings> | null | undefined)[]
): CleanSettings {
  const result: CleanSettings = { ...EMPTY_SETTINGS };
  for (const layer of layers)
    for (const key of SETTING_KEYS) {
      const value = layer?.[key];
      if (value !== null && value !== undefined)
        (result as unknown as Record<string, unknown>)[key] = value;
    }
  return result;
}

/** Options never applied from a preset (app-only modes, suction off / no water). */
const BLOCKED = new Set(['custom', 'custom_water_flow', 'off']);

/** What a robot supports – only these fields are offered in the editor. */
export interface RobotCapabilities {
  modes: CleanMode[];
  fans: string[];
  water: string[];
  routes: string[];
}
export function robotCapabilities(robot: RobotModel): RobotCapabilities {
  return {
    modes: (['vacuum', 'mop', 'both'] as CleanMode[]).filter((m) =>
      modeOptionAvailable(m, robot.modeSelect ? robot.modeOptions : []),
    ),
    fans: robot.fanChoices.filter((f) => !BLOCKED.has(f)),
    water: (robot.water?.choices ?? []).filter((w) => !BLOCKED.has(w)),
    routes: (robot.mopRoute?.choices ?? []).filter((r) => !BLOCKED.has(r)),
  };
}

export const MAX_PLUS = 'max_plus';
export const MAX_PLUS_HINT = 'Max+ jen při samotném vysávání';

/** Max+ suction is offered only in vacuum-only mode („Ponechat“ + Max+ is not allowed). */
export function fansForMode(fans: string[], mode: CleanMode | null): string[] {
  return mode === 'vacuum' ? fans : fans.filter((f) => f !== MAX_PLUS);
}

/**
 * Switch mode; Max+ becomes Max when the new mode mops (the robot would flip back to vacuum
 * or drop to balanced otherwise). `downgraded` drives the „Max+ jen při…“ hint.
 */
export function applyMode<T extends { mode: CleanMode | null; fan: string | null }>(
  settings: T,
  mode: CleanMode | null,
  fans: string[],
): { next: T; downgraded: boolean } {
  const downgraded = settings.fan === MAX_PLUS && mode !== 'vacuum';
  const fan = downgraded ? (fans.includes('max') ? 'max' : null) : settings.fan;
  return { next: { ...settings, mode, fan }, downgraded };
}

/** Drop values the robot does not expose (another model, removed option). */
export function fitSettings(settings: CleanSettings, caps: RobotCapabilities): CleanSettings {
  return {
    mode: settings.mode && caps.modes.includes(settings.mode) ? settings.mode : null,
    fan:
      settings.fan && fansForMode(caps.fans, settings.mode).includes(settings.fan)
        ? settings.fan
        : settings.fan === MAX_PLUS && caps.fans.includes('max')
          ? 'max'
          : null,
    water: settings.water && caps.water.includes(settings.water) ? settings.water : null,
    route: settings.route && caps.routes.includes(settings.route) ? settings.route : null,
    passes: Math.min(MAX_PASSES, Math.max(1, Math.round(settings.passes || 1))),
  };
}

/** Short Czech description, e.g. „Vysát · Turbo · 2×“ (only set fields). */
export function settingsSummary(settings: CleanSettings): string[] {
  const parts: string[] = [];
  if (settings.mode) parts.push(CLEAN_MODE_LABELS[settings.mode]);
  if (settings.fan && settings.mode !== 'mop')
    parts.push(`Sání ${FAN_LABELS[settings.fan] ?? settings.fan}`);
  if (modeMops(settings.mode) || settings.mode === null) {
    if (settings.water) parts.push(`Voda ${WATER_LABELS[settings.water] ?? settings.water}`);
    if (settings.route) parts.push(MOP_ROUTE_LABELS[settings.route] ?? settings.route);
  }
  if (settings.passes > 1) parts.push(`${settings.passes}×`);
  return parts;
}

/**
 * Service calls the backend start performs (for the confirmation sheet and the dev mock):
 * mode → suction → water → route (only when the run mops) → segment clean / whole-home start.
 */
export function planStart(
  robot: RobotModel,
  settings: CleanSettings,
  roomIds: number[],
): ServiceCallPlan[] {
  const fitted = fitSettings(settings, robotCapabilities(robot));
  const runMode = fitted.mode ?? robot.mode;
  const rooms = roomIds
    .map((id) => robot.rooms.find((room) => room.id === id) ?? { id, name: `#${id}` })
    .filter(Boolean);
  const plan = planCleanRooms({
    vacuum: robot.vacuum,
    rooms,
    mode: fitted.mode,
    currentMode: robot.mode,
    modeSelect: robot.modeSelect,
    fan: runMode === 'mop' ? null : fitted.fan,
    currentFan: robot.fan,
    repeat: fitted.passes,
    water: robot.water
      ? { entity: robot.water.entity, value: fitted.water, current: robot.water.value }
      : undefined,
    mopRoute: robot.mopRoute
      ? { entity: robot.mopRoute.entity, value: fitted.route, current: robot.mopRoute.value }
      : undefined,
  });
  if (!rooms.length)
    plan.push({ service: 'vacuum.start', entityId: robot.vacuum, summary: 'Uklidit celý byt' });
  return plan;
}

export interface PresetDraft extends CleanSettings {
  id?: string;
  name: string;
  rooms: number[];
}
/** Czech validation message or null. */
export function validateDraft(draft: PresetDraft, others: RobotPreset[]): string | null {
  const name = draft.name.trim().replace(/\s+/g, ' ');
  if (!name) return 'Zadejte název předvolby.';
  if (draft.fan === MAX_PLUS && draft.mode !== 'vacuum') return `${MAX_PLUS_HINT}.`;
  if (name.length > PRESET_NAME_MAX) return `Název může mít nejvýš ${PRESET_NAME_MAX} znaků.`;
  if (
    others.some(
      (p) => p.id !== draft.id && p.name.toLocaleLowerCase('cs') === name.toLocaleLowerCase('cs'),
    )
  )
    return 'Předvolba s tímto názvem už existuje.';
  return null;
}

/** Preset chips start after this undo window (owner: no confirm dialog, „Zrušit“ in a toast). */
export const PRESET_START_DELAY_MS = 5000;

/**
 * Run `start` after `delayMs` unless the returned cancel function is called first. Nothing is
 * sent to HA during the window, so cancelling never has to stop a running robot.
 */
export function delayedStart(
  start: () => void,
  delayMs: number = PRESET_START_DELAY_MS,
): () => boolean {
  let pending = true;
  const timer = setTimeout(() => {
    pending = false;
    start();
  }, delayMs);
  return () => {
    if (!pending) return false;
    pending = false;
    clearTimeout(timer);
    return true;
  };
}

// --- WebSocket ---------------------------------------------------------------------------

export async function fetchPresets(connection: ConnectionLike): Promise<PresetsBySlot> {
  const res = await connection.sendMessagePromise<{ robots: PresetsBySlot }>({
    type: 'homebrain/robots/presets/list',
  });
  return res.robots ?? {};
}
export async function savePreset(
  connection: ConnectionLike,
  slot: number,
  draft: PresetDraft,
): Promise<RobotPreset> {
  const { id, ...rest } = draft;
  const preset = { ...rest, name: draft.name.trim().replace(/\s+/g, ' '), ...(id ? { id } : {}) };
  const message = { type: 'homebrain/robots/presets/save', slot, preset };
  const res = await connection.sendMessagePromise<{ preset: RobotPreset }>(message);
  return res.preset;
}
export async function deletePreset(
  connection: ConnectionLike,
  slot: number,
  presetId: string,
): Promise<void> {
  const message = { type: 'homebrain/robots/presets/delete', slot, preset_id: presetId };
  await connection.sendMessagePromise(message);
}
export async function saveDefaults(
  connection: ConnectionLike,
  slot: number,
  defaults: CleanSettings | null,
): Promise<CleanSettings | null> {
  const message = { type: 'homebrain/robots/defaults/set', slot, defaults };
  const res = await connection.sendMessagePromise<{ defaults: CleanSettings | null }>(message);
  return res.defaults;
}
export async function startCleaning(
  connection: ConnectionLike,
  request: StartRequest,
): Promise<{ applied: string[]; skipped: string[] }> {
  const message = { type: 'homebrain/robots/start', ...request };
  return connection.sendMessagePromise(message);
}

// --- dev mock ----------------------------------------------------------------------------

/**
 * In-memory backend for the dev panel and e2e: same commands as the HA integration; a start
 * records the service calls the real backend would make (via {@link planStart}).
 */
export function createPresetsDemo(
  robotFor: (slot: number) => RobotModel | null,
  record: (message: Record<string, unknown>) => void,
) {
  const data: PresetsBySlot = {};
  let next = 0xa11ce0;
  const robot = (slot: number) => (data[String(slot)] ??= { defaults: null, presets: [] });
  const clean = (raw: Partial<CleanSettings> | null | undefined) => effectiveSettings(raw);
  type Msg = Record<string, unknown> & { slot: number };
  return {
    data,
    handlers: {
      'homebrain/robots/presets/list': () => ({ robots: structuredClone(data) }),
      'homebrain/robots/presets/save': (message: unknown) => {
        const { slot, preset } = message as Msg & { preset: PresetDraft };
        const r = robot(slot);
        const stored: RobotPreset = {
          ...clean(preset),
          id: preset.id ?? (next++).toString(16).padStart(12, '0'),
          name: preset.name,
          rooms: [...(preset.rooms ?? [])],
        };
        const index = r.presets.findIndex((p) => p.id === stored.id);
        if (index >= 0) r.presets[index] = stored;
        else r.presets.push(stored);
        return { preset: stored };
      },
      'homebrain/robots/presets/delete': (message: unknown) => {
        const { slot, preset_id } = message as Msg & { preset_id: string };
        const r = robot(slot);
        r.presets = r.presets.filter((p) => p.id !== preset_id);
        return { deleted: true };
      },
      'homebrain/robots/defaults/get': (message: unknown) => ({
        defaults: robot((message as Msg).slot).defaults,
      }),
      'homebrain/robots/defaults/set': (message: unknown) => {
        const { slot, defaults } = message as Msg & { defaults: CleanSettings | null };
        robot(slot).defaults = defaults ? clean(defaults) : null;
        return { defaults: robot(slot).defaults };
      },
      'homebrain/robots/start': (message: unknown) => {
        const msg = message as Msg & StartRequest;
        const model = robotFor(msg.slot);
        if (!model) throw new Error('not_found');
        const r = robot(msg.slot);
        const preset = msg.preset_id ? r.presets.find((p) => p.id === msg.preset_id) : undefined;
        const settings = effectiveSettings(r.defaults, preset, msg.settings);
        const rooms = preset ? preset.rooms : (msg.rooms ?? []);
        for (const step of planStart(model, settings, rooms)) {
          const [domain, service] = step.service.split('.');
          record({
            type: 'call_service',
            domain,
            service,
            service_data: step.data ?? {},
            target: { entity_id: step.entityId },
          });
        }
        return { started: true, applied: [], skipped: [] };
      },
    },
  };
}

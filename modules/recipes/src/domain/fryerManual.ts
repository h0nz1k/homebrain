/**
 * Fritéza – manual start independent of recipes (pure helpers, no React).
 *
 * The backend (`homebrain/fryer/*`) is the authority: it re-checks every blocker and range.
 * These helpers only keep the UI honest between HA updates.
 */

export type SettingKey = 'temperature' | 'minutes' | 'air_speed' | 'probe_temperature';
export type FryerLimits = Record<SettingKey, readonly [number, number]>;

/** Philips HomeID airfryer ranges (HA number entities: 40–200 °C, 1–60 min, air 1–2, probe 40–100 °C). */
export const DEFAULT_LIMITS: FryerLimits = {
  temperature: [40, 200],
  minutes: [1, 60],
  air_speed: [1, 2],
  probe_temperature: [40, 100],
};
const STEP: Record<SettingKey, number> = {
  temperature: 5,
  minutes: 1,
  air_speed: 1,
  probe_temperature: 1,
};

export interface FryerFavourite {
  id: string;
  name: string;
  temperature: number;
  minutes: number;
  air_speed: number;
  probe_temperature: number | null;
}
export type FryerFavouriteDraft = Omit<FryerFavourite, 'id'> & { id?: string };

export interface FryerInfo {
  configured: boolean;
  canControl: boolean;
  entities: Record<string, string>;
  capabilities: { airSpeed: boolean; probe: boolean; addTime: boolean };
  limits: FryerLimits;
  blockers: string[];
  /** Built-in AutoCook programs: never startable through the cloud integration (yet). */
  presets: { supported: boolean; programs: string[] };
  favourites: FryerFavourite[];
}

export interface ManualSettings {
  temperature: number;
  minutes: number;
  air_speed: number;
  probe: boolean;
  probe_temperature: number;
}
export interface FryerStartRequest {
  temperature: number;
  minutes: number;
  air_speed: number;
  probe_temperature: number | null;
  confirmed: boolean;
}
export type FryerAction = 'pause' | 'resume' | 'stop' | 'add_time';

export const DEFAULT_MANUAL: ManualSettings = {
  temperature: 180,
  minutes: 15,
  air_speed: 2,
  probe: false,
  probe_temperature: 65,
};

export function clampSetting(key: SettingKey, value: number, limits: FryerLimits) {
  const [low, high] = limits[key];
  return Math.min(high, Math.max(low, Math.round(value)));
}

/** One −/+ press: temperature in 5 °C steps snapped to the grid, the rest by one. */
export function stepSetting(key: SettingKey, value: number, dir: 1 | -1, limits: FryerLimits) {
  const step = STEP[key];
  const snapped =
    dir > 0 ? Math.floor(value / step) * step + step : Math.ceil(value / step) * step - step;
  return clampSetting(key, snapped, limits);
}

const UNAVAILABLE = new Set(['unavailable', 'unknown', '']);
const BUSY = new Set([
  'cooking',
  'pause',
  'user_action',
  'maintain',
  'finish',
  'preheat',
  'preheating',
]);
const NO_ERROR = new Set(['0', 'none', 'no_error', 'ok']);

/** Same rules as the backend's `start_blockers`, from live entity states. */
export function liveBlockers(
  entities: Partial<Record<string, string>>,
  read: (entityId: string) => string | undefined,
): string[] {
  if (!entities.status || !entities.drawer) return ['NOT_CONFIGURED'];
  const out: string[] = [];
  const status = read(entities.status);
  if (status === undefined || UNAVAILABLE.has(status)) out.push('AIRFRYER_UNAVAILABLE');
  else if (BUSY.has(status)) out.push('AIRFRYER_BUSY');
  const drawer = read(entities.drawer);
  if (drawer === 'on') out.push('AIRFRYER_DRAWER_OPEN');
  else if (drawer !== 'off' && !out.includes('AIRFRYER_UNAVAILABLE'))
    out.push('AIRFRYER_UNAVAILABLE');
  const error = entities.error ? read(entities.error) : undefined;
  if (error !== undefined && !UNAVAILABLE.has(error) && !NO_ERROR.has(error.toLowerCase())) {
    out.push('AIRFRYER_ERROR');
  }
  return out;
}

const BLOCKER_TEXT: Record<string, string> = {
  NOT_CONFIGURED: 'Fritéza není v Home Assistantu připojená.',
  AIRFRYER_UNAVAILABLE: 'Fritéza je offline. Zapněte ji do zásuvky a zkuste to znovu.',
  AIRFRYER_BUSY: 'Fritéza právě peče. Novou přípravu spustíte, až ji zastavíte.',
  AIRFRYER_DRAWER_OPEN: 'Šuplík je otevřený. Zasuňte ho, pak půjde spustit.',
  AIRFRYER_ERROR: 'Fritéza hlásí chybu. Zkontrolujte displej fritézy.',
  AIRFRYER_PROBE_UNPLUGGED: 'Sonda není zapojená. Zapojte ji, nebo pečte bez sondy.',
  CONFIRMATION_REQUIRED: 'Spuštění je potřeba potvrdit.',
  DEVICE_FAILED: 'Fritéza příkaz nepřijala. Zkuste to znovu.',
  unauthorized: 'Fritézu může ovládat jen dospělý.',
};
export function blockerText(code: string) {
  return BLOCKER_TEXT[code] ?? 'Fritézu teď nejde spustit.';
}

export function startRequest(s: ManualSettings): FryerStartRequest {
  return {
    temperature: s.temperature,
    minutes: s.minutes,
    air_speed: s.air_speed,
    probe_temperature: s.probe ? s.probe_temperature : null,
    confirmed: true,
  };
}

export function airLabel(speed: number) {
  return speed <= 1 ? 'slabý vzduch' : 'silný vzduch';
}

export function favouriteLine(f: Omit<FryerFavourite, 'id' | 'name'>) {
  const parts = [`${f.temperature} °C`, `${f.minutes} min`, airLabel(f.air_speed)];
  if (f.probe_temperature != null) parts.push(`sonda ${f.probe_temperature} °C`);
  return parts.join(' · ');
}

export function favouriteToManual(f: FryerFavourite): ManualSettings {
  return {
    temperature: f.temperature,
    minutes: f.minutes,
    air_speed: f.air_speed,
    probe: f.probe_temperature != null,
    probe_temperature: f.probe_temperature ?? DEFAULT_MANUAL.probe_temperature,
  };
}

/** Czech error for the favourite form, or null when it may be saved. */
export function validateFavourite(f: FryerFavouriteDraft, limits: FryerLimits): string | null {
  const name = f.name.trim();
  if (!name) return 'Zadejte název';
  if (name.length > 40) return 'Název může mít nejvýš 40 znaků';
  const checks: Array<[SettingKey, number | null, string]> = [
    ['temperature', f.temperature, 'Teplota'],
    ['minutes', f.minutes, 'Čas'],
    ['air_speed', f.air_speed, 'Vzduch'],
    ['probe_temperature', f.probe_temperature, 'Sonda'],
  ];
  for (const [key, value, label] of checks) {
    if (value == null) continue;
    const [low, high] = limits[key];
    if (!Number.isFinite(value) || value < low || value > high) return `${label}: ${low}–${high}`;
  }
  return null;
}

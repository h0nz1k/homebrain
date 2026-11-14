import type { ModuleId, Signal } from '@homebrain/signals';
import type { TodayData } from './types.js';

/** HomeBrain roles (ADR-0002). The role always comes from the server (`homebrain/session/get`). */
export type HomeBrainRole = 'owner' | 'adult' | 'child' | 'guest' | 'kiosk';

/**
 * Signal modules each role may see on Dnes (ADR-0002 §3.1). Health is per person and never
 * shown on a shared screen; wine and system diagnostics are not for the wall tablet either.
 */
const SIGNAL_VISIBILITY: Record<HomeBrainRole, ReadonlySet<ModuleId>> = {
  owner: new Set([
    'weather',
    'energy',
    'waste',
    'calendar',
    'health',
    'wine',
    'recipes',
    'network',
    'system',
  ]),
  adult: new Set([
    'weather',
    'energy',
    'waste',
    'calendar',
    'health',
    'wine',
    'recipes',
    'network',
    'system',
  ]),
  child: new Set(['weather', 'waste', 'calendar', 'recipes']),
  // Kitchen tablet: the airfryer status („Protřepej“, „Hotovo“) and running kitchen timers
  // (Minutky) belong on the wall.
  // Síť: only the summary headline („Internet nefunguje“), never a device list.
  kiosk: new Set(['weather', 'energy', 'waste', 'calendar', 'recipes', 'network', 'heating']),
  guest: new Set(),
};

/**
 * Modules visible on this screen. The kiosk layout is a shared wall display, so it is never more
 * permissive than the `kiosk` role even when the browser is signed in as the owner (the URL
 * parameter only ever removes data, never adds rights – ADR-0002 §3 point 5).
 */
export function visibleSignalModules(
  role: HomeBrainRole | undefined,
  kioskLayout: boolean,
): ReadonlySet<ModuleId> {
  const base = SIGNAL_VISIBILITY[role ?? 'owner'] ?? SIGNAL_VISIBILITY.guest;
  if (!kioskLayout) return base;
  return new Set([...base].filter((module) => SIGNAL_VISIBILITY.kiosk.has(module)));
}

export function filterSignalsForScreen(
  signals: Signal[],
  role: HomeBrainRole | undefined,
  kioskLayout: boolean,
): Signal[] {
  const visible = visibleSignalModules(role, kioskLayout);
  return signals.filter((signal) => visible.has(signal.module));
}

/**
 * Screen-safe Dnes data: hidden-module signals are removed and so are ribbon entries that
 * describe them (a ribbon label like „Ranní léky“ would otherwise leak health data).
 */
export function filterTodayDataForScreen(
  data: TodayData,
  role: HomeBrainRole | undefined,
  kioskLayout: boolean,
): TodayData {
  const visible = visibleSignalModules(role, kioskLayout);
  const hidden = new Set(data.signals.filter((s) => !visible.has(s.module)).map((s) => s.id));
  const hiddenModule = (id: string) => {
    const module = id.split('.')[0] as ModuleId;
    return !visible.has(module) && module in MODULE_PREFIXES;
  };
  return {
    ...data,
    signals: data.signals.filter((s) => visible.has(s.module)),
    ribbon: data.ribbon.filter(
      (item) => !item.signalId || (!hidden.has(item.signalId) && !hiddenModule(item.signalId)),
    ),
  };
}
const MODULE_PREFIXES: Record<ModuleId, true> = {
  weather: true,
  energy: true,
  waste: true,
  calendar: true,
  health: true,
  wine: true,
  recipes: true,
  network: true,
  heating: true,
  system: true,
};

/** The kiosk role always gets the kiosk layout; `?kiosk=1` alone only changes layout. */
export function kioskLayoutFor(role: HomeBrainRole | undefined, routeKiosk: boolean): boolean {
  return routeKiosk || role === 'kiosk';
}

export type NightHours = { start: number; end: number } | null;
export const DEFAULT_NIGHT_HOURS = { start: 22, end: 6 } as const;

/**
 * Night window of the kiosk from the tablet URL: `?night=22-6` (default), `?night=23:30-6`,
 * `?night=off`. Invalid values fall back to the default.
 */
export function parseNightHours(search: string): NightHours {
  const raw = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search).get('night');
  if (raw === null) return { ...DEFAULT_NIGHT_HOURS };
  if (raw === 'off' || raw === '0') return null;
  const match = /^(\d{1,2})(?::(\d{2}))?-(\d{1,2})(?::(\d{2}))?$/.exec(raw.trim());
  if (!match) return { ...DEFAULT_NIGHT_HOURS };
  const start = Number(match[1]) + Number(match[2] ?? 0) / 60;
  const end = Number(match[3]) + Number(match[4] ?? 0) / 60;
  if (start >= 24 || end >= 24 || start === end) return { ...DEFAULT_NIGHT_HOURS };
  return { start, end };
}

export function isWithinNight(hour: number, night: NightHours): boolean {
  if (!night) return false;
  return night.start > night.end
    ? hour >= night.start || hour < night.end
    : hour >= night.start && hour < night.end;
}

export type Freshness = { state: 'fresh' | 'stale' | 'offline'; ageS: number };
/** Data older than this is visibly marked as stale on the wall display. */
export const KIOSK_STALE_AFTER_S = 10 * 60;

export function dataFreshness(data: Pick<TodayData, 'now' | 'ha'>): Freshness {
  const updated = Date.parse(data.ha.updatedAt);
  const ageS = Number.isFinite(updated)
    ? Math.max(0, Math.round((Date.parse(data.now) - updated) / 1000))
    : Infinity;
  if (!data.ha.connected) return { state: 'offline', ageS };
  return { state: ageS > KIOSK_STALE_AFTER_S ? 'stale' : 'fresh', ageS };
}

export function formatAge(ageS: number): string {
  if (!Number.isFinite(ageS)) return 'neznámo kdy';
  if (ageS < 60) return `před ${ageS} s`;
  if (ageS < 3600) return `před ${Math.floor(ageS / 60)} min`;
  const hours = Math.floor(ageS / 3600);
  return `před ${hours} h ${Math.floor((ageS % 3600) / 60)} min`;
}

/** Burn-in guard: 9 positions, ±2 px, one step every 3 minutes (invisible jump). */
export const PIXEL_SHIFT_POSITIONS: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [2, 0],
  [2, 2],
  [0, 2],
  [-2, 2],
  [-2, 0],
  [-2, -2],
  [0, -2],
  [2, -2],
];
export const PIXEL_SHIFT_INTERVAL_MS = 180_000;
export function pixelShift(step: number): readonly [number, number] {
  const n = PIXEL_SHIFT_POSITIONS.length;
  return PIXEL_SHIFT_POSITIONS[((step % n) + n) % n]!;
}

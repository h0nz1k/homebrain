import type { ConnectionLike, EntityStateLike } from '@homebrain/ha-client';
import type { Signal } from '@homebrain/signals';
import { localParts, POWER_UNITS, readNumber, startOfLocalDay } from './adapter.js';
import type { EnergyBindingKey, Reading } from './contract.js';

const MIN = 60_000;
const HOUR = 60 * MIN;
/*
 * Smart plugs and meters report on change only: an appliance parked at 0 W keeps its old
 * last_updated for days. Connectivity is signalled by `unavailable`, so the age limit is wide.
 */
const APPLIANCE_MAX_AGE = 48 * HOUR;
/** Below this power the appliance counts as switched off (not standby). */
const OFF_BELOW_W = 1;

export interface ApplianceSlotConfig {
  slot: ApplianceSlot;
  label: string;
  /** Power above this threshold means the appliance is running (W). */
  runningW: number;
  /** Program-based appliance: report a finished cycle (Dnes notice). */
  cyclic: boolean;
}

export const APPLIANCE_SLOTS = [
  { slot: 'heat_pump', label: 'Tepelné čerpadlo', runningW: 100, cyclic: false },
  { slot: 'dishwasher', label: 'Myčka', runningW: 5, cyclic: true },
  { slot: 'coffee_maker', label: 'Kávovar', runningW: 15, cyclic: false },
  { slot: 'dehumidifier', label: 'Odvlhčovač', runningW: 30, cyclic: false },
] as const satisfies readonly { slot: string; label: string; runningW: number; cyclic: boolean }[];
export type ApplianceSlot = (typeof APPLIANCE_SLOTS)[number]['slot'];

export const applianceKey = (slot: ApplianceSlot, kind: 'power' | 'energy' | 'switch') =>
  `energy_appliance_${slot}_${kind}` as EnergyBindingKey;

export type ApplianceState = 'running' | 'standby' | 'off' | 'finished' | 'unknown';

export interface CycleFinish {
  startedAt: number;
  /** Last moment the power was above the running threshold. */
  endedAt: number;
  /** endedAt + quiet period – the signal becomes valid. */
  finishedAt: number;
  expiresAt: number;
  /** Energy of the cycle integrated from the power history (kWh), null without data. */
  energyKwh: number | null;
}

export interface ApplianceReading {
  slot: ApplianceSlot;
  label: string;
  runningW: number;
  /** Current power in W (never a silent zero: null when unknown). */
  power: Reading;
  /** Read-only switch state; null when not bound or unknown. */
  switchOn: boolean | null;
  state: ApplianceState;
  /** kWh since local midnight (recorder statistics), null when unknown. */
  todayKwh: number | null;
  /** Share of today's house consumption (%), null when not computable. */
  sharePercent: number | null;
  cycle: CycleFinish | null;
}

export interface ApplianceExtras {
  todayKwh?: Partial<Record<ApplianceSlot, number | null>>;
  cycles?: Partial<Record<ApplianceSlot, CycleFinish | null>>;
}

const bound = (bindings: Record<string, string>, key: EnergyBindingKey) =>
  bindings[key]?.trim() || null;

/** Slots with at least a power or an energy binding; unbound slots are hidden (no zeros). */
export function boundApplianceSlots(bindings: Record<string, string>) {
  return APPLIANCE_SLOTS.filter(
    (c) =>
      bound(bindings, applianceKey(c.slot, 'power')) ||
      bound(bindings, applianceKey(c.slot, 'energy')),
  );
}

export function adaptAppliances(input: {
  bindings: Record<string, string>;
  getState: (entityId: string) => EntityStateLike | undefined;
  now: number;
  /** House consumption today (kWh) – denominator of the share. */
  houseTodayKwh: number | null;
  extras?: ApplianceExtras;
}): ApplianceReading[] {
  const { bindings, getState, now, houseTodayKwh, extras = {} } = input;
  return boundApplianceSlots(bindings).map((config) => {
    const powerId = bound(bindings, applianceKey(config.slot, 'power'));
    const switchId = bound(bindings, applianceKey(config.slot, 'switch'));
    const kw: Reading = powerId
      ? readNumber(getState(powerId), POWER_UNITS, APPLIANCE_MAX_AGE, now)
      : { value: null, quality: 'unavailable', updatedAt: null, bound: false };
    const power: Reading = {
      ...kw,
      value: kw.value === null ? null : Math.round(kw.value * 1e6) / 1000,
    };
    const sw = switchId ? getState(switchId)?.state : undefined;
    const switchOn = sw === 'on' ? true : sw === 'off' ? false : null;
    const cycle = config.cyclic ? (extras.cycles?.[config.slot] ?? null) : null;
    let state: ApplianceState = 'unknown';
    if (switchOn === false) state = 'off';
    else if (power.value !== null)
      state =
        power.value > config.runningW
          ? 'running'
          : cycle && now >= cycle.finishedAt && now < cycle.expiresAt
            ? 'finished'
            : power.value < OFF_BELOW_W
              ? 'off'
              : 'standby';
    const todayKwh = extras.todayKwh?.[config.slot] ?? null;
    const sharePercent =
      todayKwh !== null && houseTodayKwh !== null && houseTodayKwh > 0
        ? Math.min(100, Math.max(0, (todayKwh / houseTodayKwh) * 100))
        : null;
    return {
      slot: config.slot,
      label: config.label,
      runningW: config.runningW,
      power,
      switchOn,
      state,
      todayKwh,
      sharePercent,
      cycle,
    };
  });
}

/**
 * kWh since local midnight per appliance via WS `recorder/statistic_during_period`
 * (read-only). HA merges long-term and 5-minute statistics, so the value is at most ~5 min
 * behind and survives counter resets of `total_increasing` sensors (meter swap, plug reboot).
 * A failed or empty query yields null – never zero.
 */
export async function fetchApplianceToday(
  connection: ConnectionLike,
  bindings: Record<string, string>,
  now: number,
  timeZone = 'Europe/Prague',
): Promise<Partial<Record<ApplianceSlot, number | null>>> {
  const start = new Date(startOfLocalDay(now, timeZone)).toISOString();
  const end = new Date(now).toISOString();
  const entries = await Promise.all(
    APPLIANCE_SLOTS.map(async ({ slot }) => {
      const id = bound(bindings, applianceKey(slot, 'energy'));
      if (!id) return [slot, null] as const;
      try {
        const reply = await connection.sendMessagePromise<{ change?: number | null } | null>({
          type: 'recorder/statistic_during_period',
          statistic_id: id,
          fixed_period: { start_time: start, end_time: end },
          types: ['change'],
          units: { energy: 'kWh' },
        } as { type: string });
        const change = reply?.change;
        return [
          slot,
          typeof change === 'number' && Number.isFinite(change) ? Math.max(0, change) : null,
        ] as const;
      } catch {
        return [slot, null] as const;
      }
    }),
  );
  return Object.fromEntries(
    entries.filter(([slot]) => bound(bindings, applianceKey(slot, 'energy'))),
  );
}

export interface PowerPoint {
  t: number;
  /** W, null when unavailable/unknown. */
  w: number | null;
}

interface CompressedState {
  s?: string;
  a?: Record<string, unknown>;
  lu?: number;
  lc?: number;
}

/** Parse a compressed `history/history_during_period` reply into W points. */
export function parsePowerHistory(rows: unknown): PowerPoint[] {
  if (!Array.isArray(rows)) return [];
  let factor = 1;
  const points: PowerPoint[] = [];
  for (const row of rows as CompressedState[]) {
    const unit = row?.a?.unit_of_measurement;
    if (typeof unit === 'string') factor = unit === 'kW' ? 1000 : unit === 'W' ? 1 : NaN;
    const ts = row?.lu ?? row?.lc;
    if (typeof ts !== 'number') continue;
    const raw = typeof row.s === 'string' && row.s.trim() !== '' ? Number(row.s) : NaN;
    points.push({ t: ts * 1000, w: Number.isFinite(raw * factor) ? raw * factor : null });
  }
  return points.sort((x, y) => x.t - y.t);
}

/**
 * Finished program cycle: power was above `thresholdW` for at least `minRunMs` (pauses shorter
 * than `quietMs` belong to the same cycle) and has stayed at or below it for `quietMs`.
 * Expires `expireMs` after the end of the cycle; a new run (power above threshold) or an
 * unknown current value cancels it.
 */
export function detectCycleFinish(
  points: PowerPoint[],
  now: number,
  options: { thresholdW: number; quietMs?: number; minRunMs?: number; expireMs?: number },
): CycleFinish | null {
  const { thresholdW, quietMs = 5 * MIN, minRunMs = 10 * MIN, expireMs = 2 * HOUR } = options;
  const last = points[points.length - 1];
  if (!last || last.w === null || last.w > thresholdW) return null;
  const runs: Array<{ start: number; end: number; kwh: number }> = [];
  points.forEach((p, i) => {
    if (p.w === null || p.w <= thresholdW) return;
    const end = Math.min(points[i + 1]?.t ?? now, now);
    const kwh = (p.w / 1000) * ((end - p.t) / HOUR);
    const prev = runs[runs.length - 1];
    if (prev && p.t - prev.end < quietMs) {
      prev.end = end;
      prev.kwh += kwh;
    } else runs.push({ start: p.t, end, kwh });
  });
  const run = runs[runs.length - 1];
  if (!run || run.end - run.start < minRunMs) return null;
  if (now - run.end < quietMs || now >= run.end + expireMs) return null;
  return {
    startedAt: run.start,
    endedAt: run.end,
    finishedAt: run.end + quietMs,
    expiresAt: run.end + expireMs,
    energyKwh: run.kwh,
  };
}

/** Power history of the cyclic appliances (WS `history/history_during_period`, read-only). */
export async function fetchApplianceCycles(
  connection: ConnectionLike,
  bindings: Record<string, string>,
  now: number,
): Promise<Partial<Record<ApplianceSlot, CycleFinish | null>>> {
  const cyclic = APPLIANCE_SLOTS.filter((c) => c.cyclic)
    .map((c) => ({ ...c, id: bound(bindings, applianceKey(c.slot, 'power')) }))
    .filter((c): c is typeof c & { id: string } => !!c.id);
  if (!cyclic.length) return {};
  const raw = await connection.sendMessagePromise<Record<string, unknown> | null>({
    type: 'history/history_during_period',
    // A long program (eco ~4 h) plus the 2 h validity of the notice.
    start_time: new Date(now - 6 * HOUR).toISOString(),
    end_time: new Date(now).toISOString(),
    entity_ids: cyclic.map((c) => c.id),
    minimal_response: true,
    significant_changes_only: false,
  } as { type: string });
  return Object.fromEntries(
    cyclic.map((c) => [
      c.slot,
      detectCycleFinish(parsePowerHistory(raw?.[c.id]), now, { thresholdW: c.runningW }),
    ]),
  );
}

const hhmm = (ms: number, timeZone: string) => {
  const p = localParts(ms, timeZone);
  return `${p.hour}:${String(p.minute).padStart(2, '0')}`;
};
const kwhFmt = (v: number) =>
  new Intl.NumberFormat('cs-CZ', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v);

/**
 * Dnes notice „Myčka dokončila“. Household information without personal data, therefore
 * suitable for the shared kiosk. Read-only: navigates to Energie, never switches the plug.
 */
export function applianceSignals(
  cycles: Partial<Record<ApplianceSlot, CycleFinish | null>>,
  now: number,
  timeZone = 'Europe/Prague',
): Signal[] {
  const cycle = cycles.dishwasher;
  if (!cycle || now < cycle.finishedAt || now >= cycle.expiresAt) return [];
  const minutes = Math.round((cycle.endedAt - cycle.startedAt) / MIN);
  const duration =
    minutes >= 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes} min`;
  return [
    {
      id: `energy.appliance.dishwasher.finished.${Math.round(cycle.endedAt / MIN)}`,
      module: 'energy',
      group: 'energy.appliances',
      kind: 'event',
      severity: 'notice',
      tone: 'neutral',
      relevance: 0.5,
      valid_from: new Date(cycle.finishedAt).toISOString(),
      valid_to: new Date(cycle.expiresAt).toISOString(),
      title: 'Myčka dokončila',
      context: `Program doběhl v ${hhmm(cycle.endedAt, timeZone)} (běžel ${duration}). Nádobí lze vyndat.`,
      ...(cycle.energyKwh !== null && cycle.energyKwh >= 0.05
        ? { value: { v: kwhFmt(cycle.energyKwh), unit: 'kWh', label: 'cyklus' } }
        : {}),
      action: { type: 'navigate', label: 'Energie', href: '/energy' },
      source: {
        name: 'Myčka · zásuvka',
        updated_at: new Date(now).toISOString(),
        stale_after_s: 600,
      },
    },
  ];
}

/** Structurally matches TodaySignalFeed in @homebrain/module-today (no import cycle). */
export interface ApplianceSignalFeed {
  subscribe: (cb: (signals: Signal[]) => void) => () => void;
}

/**
 * Dnes signal source for appliance notices. Reads the bindings and the dishwasher power
 * history over WS once a minute; on any error emits [] (no fixture substitution).
 */
export function energyAppliancesTodaySignalSource(
  context?: { connection?: ConnectionLike },
  options: { pollMs?: number; clock?: () => number } = {},
): ApplianceSignalFeed | null {
  const connection = context?.connection;
  if (!connection) return null;
  const { pollMs = MIN, clock = Date.now } = options;
  return {
    subscribe: (cb) => {
      let active = true;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const tick = async () => {
        try {
          const all = await connection.sendMessagePromise<Record<string, Record<string, string>>>({
            type: 'homebrain/bindings/get',
          });
          const now = clock();
          const cycles = await fetchApplianceCycles(connection, all?.energy ?? {}, now);
          if (active) cb(applianceSignals(cycles, now));
        } catch {
          if (active) cb([]);
        }
        if (active && pollMs > 0) timer = setTimeout(() => void tick(), pollMs);
      };
      void tick();
      return () => {
        active = false;
        if (timer) clearTimeout(timer);
      };
    },
  };
}

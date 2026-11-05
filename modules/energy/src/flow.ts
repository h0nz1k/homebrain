import type { ApplianceReading, ApplianceSlot } from './appliances.js';
import type { EnergyModel } from './contract.js';

/*
 * Pure model of the Energie hero (pictogram power-flow diagram): edge directions/speeds through
 * the inverter hub and the debounced "running consumers" list shown next to the house.
 */

/** Below this power (kW) an edge counts as idle: dim line, no moving dots. */
export const FLOW_IDLE_KW = 0.05;

export type FlowNode = 'pv' | 'grid' | 'battery' | 'house';
export type FlowDirection = 'toHub' | 'fromHub' | 'idle';
export interface FlowEdge {
  node: FlowNode;
  /** Absolute power on the edge (kW); null when unknown. */
  kw: number | null;
  direction: FlowDirection;
  /** Seconds for one dot period; shorter = faster. Null when idle/unknown. */
  periodS: number | null;
}

/** Dot period: ~2.6 s at 0.1 kW down to 0.55 s at ≥ 8 kW (sqrt keeps small flows visible). */
export function flowPeriodS(kw: number): number {
  const k = Math.min(8, Math.max(0.05, Math.abs(kw)));
  return Math.round(Math.max(0.55, Math.min(2.8, 1.6 / Math.sqrt(k))) * 100) / 100;
}

function edge(node: FlowNode, kw: number | null, positiveIsToHub: boolean): FlowEdge {
  if (kw === null || !Number.isFinite(kw))
    return { node, kw: null, direction: 'idle', periodS: null };
  const abs = Math.abs(kw);
  if (abs < FLOW_IDLE_KW) return { node, kw: abs, direction: 'idle', periodS: null };
  const toHub = kw > 0 === positiveIsToHub;
  return { node, kw: abs, direction: toHub ? 'toHub' : 'fromHub', periodS: flowPeriodS(abs) };
}

/** Edges sun/grid/battery/house ↔ inverter. Grid import and battery discharge flow to the hub. */
export function flowEdges(model: EnergyModel): Record<FlowNode, FlowEdge> {
  const { pv, grid, battery, house } = model.power;
  return {
    pv: edge('pv', pv.value === null ? null : Math.max(0, pv.value), true),
    grid: edge('grid', grid.value, true),
    battery: edge('battery', battery.value, true),
    house: edge('house', house.value === null ? null : Math.max(0, house.value), false),
  };
}

/* ------------------------------------------------------------ source → destination pairs */

/**
 * Separate flows like the HA Energy distribution card. Sources: PV, grid import, battery
 * discharge; sinks: house, grid export, battery charge.
 */
export type FlowPairId =
  | 'pv-house'
  | 'pv-battery'
  | 'pv-grid'
  | 'grid-house'
  | 'grid-battery'
  | 'battery-house'
  | 'battery-grid';
export const FLOW_PAIRS: readonly FlowPairId[] = [
  'pv-house',
  'pv-battery',
  'pv-grid',
  'grid-house',
  'grid-battery',
  'battery-house',
  'battery-grid',
];
export interface FlowPair {
  id: FlowPairId;
  from: FlowNode;
  to: FlowNode;
  /** Allocated power (kW, ≥ 0, rounded to 10 W). */
  kw: number;
  /** Display value (kW, 1 decimal); the pairs of one source add up to its displayed total. */
  displayKw: number;
  active: boolean;
  periodS: number | null;
}
export interface FlowAllocation {
  pairs: Record<FlowPairId, FlowPair>;
  /** Source power that could not be matched to a sink (measurement mismatch), kW. */
  unallocatedKw: number;
  /** House load not covered by any source (measurement mismatch), kW. */
  uncoveredKw: number;
  /** (pv + discharge + import) − (house + charge + export), kW; 0 when the house is derived. */
  balanceKw: number;
  /** |balanceKw| within BALANCE_TOLERANCE (measurements agree). */
  balanced: boolean;
  /** Import and export at the same time (two grid lines, e.g. phases with opposite signs). */
  simultaneous: boolean;
  /**
   * Node totals reconciled with the displayed flows (each = sum of its displayed pairs, at most
   * 0.1 kW from the measurement). Null when the measurements disagree beyond the tolerance –
   * the nodes then show their own readings.
   */
  display: FlowDisplayTotals | null;
}
export interface FlowInput {
  /** PV production (kW); negative values (inverter self-consumption at night) count as 0. */
  pv: number | null;
  /**
   * Net grid power, + import, − export (kW). Used only when gridImport/gridExport are not given
   * (signed net sensor only → at most one grid line).
   */
  grid?: number | null;
  /** Grid import (kW, ≥ 0), independent of the export (per-phase meter or separate sensors). */
  gridImport?: number | null;
  /** Grid export (kW, ≥ 0); may be > 0 together with the import. */
  gridExport?: number | null;
  /** + discharge, − charge (kW). */
  battery: number | null;
  /** House load (kW); null = derive from the balance. */
  house: number | null;
}

/** Conservation tolerance: max(150 W, 5 % of the larger side). */
export function balanceTolerance(sourcesKw: number, sinksKw: number): number {
  return Math.max(0.15, 0.05 * Math.max(sourcesKw, sinksKw));
}

const r2 = (kw: number) => Math.round(kw * 100) / 100;
const pos = (v: number | null) => (v === null || !Number.isFinite(v) ? 0 : Math.max(0, v));

/**
 * Largest-remainder rounding to 0.1 so the parts add up to the rounded total (or to `total`,
 * when given and reachable from the floors/ceilings of the parts).
 */
export function roundParts(parts: number[], digits = 1, total?: number): number[] {
  const f = 10 ** digits;
  const floors = parts.map((v) => Math.floor(v * f + 1e-9));
  const base = floors.reduce((s, v) => s + v, 0);
  const auto = Math.round(parts.reduce((s, v) => s + v, 0) * f);
  const want = total === undefined ? auto : Math.round(total * f);
  // A part may only move to its floor or ceiling (never further than 0.1 from its value).
  const target = want >= base && want <= base + parts.filter((v) => v > 0).length ? want : auto;
  let rest = target - base;
  const order = parts
    .map((v, i) => ({ i, rem: v * f - floors[i]! }))
    .filter(({ i }) => parts[i]! > 0)
    .sort((a, b) => b.rem - a.rem || a.i - b.i);
  for (const { i } of order) {
    if (rest <= 0) break;
    floors[i]! += 1;
    rest -= 1;
  }
  return floors.map((v) => v / f);
}

/** Node totals (kW) as the diagram shows them: always the sums of the displayed flows. */
export interface FlowDisplayTotals {
  pv: number;
  gridImport: number;
  gridExport: number;
  discharge: number;
  charge: number;
  house: number;
}

/**
 * Standard energy-distribution allocation (as the HA Energy card does): solar first to the
 * house, then to the battery, the rest is exported; battery discharge goes to the house, then to
 * the grid; grid import goes to the house, then to the battery. Import and export are independent
 * inputs: when both are > 0 (one phase imports while the others export), the import displaces
 * solar/battery at the house so both grid lines appear. Null when the grid input is incomplete.
 */
export function allocateFlows(input: FlowInput): FlowAllocation | null {
  const finite = (v: number | null | undefined): v is number => v != null && Number.isFinite(v);
  let imp: number;
  let exp: number;
  if (input.gridImport !== undefined || input.gridExport !== undefined) {
    if (!finite(input.gridImport) || !finite(input.gridExport)) return null;
    imp = Math.abs(input.gridImport);
    exp = Math.abs(input.gridExport);
  } else {
    if (!finite(input.grid)) return null;
    imp = pos(input.grid);
    exp = pos(-input.grid);
  }
  const pv = pos(input.pv);
  const dis = pos(input.battery);
  const chg = pos(input.battery === null ? null : -input.battery);
  const houseKnown = finite(input.house);
  const house = houseKnown ? Math.max(0, input.house!) : Math.max(0, pv + imp + dis - exp - chg);
  let pvHouse = Math.min(pv, house);
  let pvBattery = Math.min(pv - pvHouse, chg);
  let pvGrid = Math.min(pv - pvHouse - pvBattery, exp);
  let need = house - pvHouse;
  let batteryHouse = Math.min(dis, need);
  need -= batteryHouse;
  let batteryGrid = Math.min(dis - batteryHouse, exp - pvGrid);
  let gridHouse = Math.min(imp, need);
  need -= gridHouse;
  let gridBattery = Math.min(imp - gridHouse, chg - pvBattery);
  // Simultaneous import + export: the imported power physically feeds the house (or the battery)
  // on its phase, so it takes over that share from PV/battery, which goes out to the grid instead.
  const swap = (take: number) => {
    const x = Math.min(imp - gridHouse - gridBattery, exp - pvGrid - batteryGrid, take);
    return x > 1e-9 ? x : 0;
  };
  let x = swap(pvHouse);
  pvHouse -= x;
  gridHouse += x;
  pvGrid += x;
  x = swap(batteryHouse);
  batteryHouse -= x;
  gridHouse += x;
  batteryGrid += x;
  x = swap(pvBattery);
  pvBattery -= x;
  gridBattery += x;
  pvGrid += x;
  const raw: Record<FlowPairId, number> = {
    'pv-house': pvHouse,
    'pv-battery': pvBattery,
    'pv-grid': pvGrid,
    'grid-house': gridHouse,
    'grid-battery': gridBattery,
    'battery-house': batteryHouse,
    'battery-grid': batteryGrid,
  };
  // One largest-remainder pass over ALL visible pairs (grand total kept), so every node can show
  // the sum of its displayed lines: no "0,8 kW from the grid, 0,7 kW into the house" any more.
  // Hidden (idle) pairs must not absorb a rounding unit.
  const shownRaw = FLOW_PAIRS.map((id) => (r2(raw[id]) >= FLOW_IDLE_KW ? raw[id] : 0));
  const joint = roundParts(shownRaw);
  const display = Object.fromEntries(FLOW_PAIRS.map((id, i) => [id, joint[i]!])) as Record<
    FlowPairId,
    number
  >;
  const pairs = {} as Record<FlowPairId, FlowPair>;
  for (const id of FLOW_PAIRS) {
    const [from, to] = id.split('-') as [FlowNode, FlowNode];
    const kw = r2(raw[id]);
    const active = kw >= FLOW_IDLE_KW;
    pairs[id] = {
      id,
      from,
      to,
      kw,
      displayKw: display[id]!,
      active,
      periodS: active ? flowPeriodS(kw) : null,
    };
  }
  const used = pvHouse + pvBattery + pvGrid + batteryHouse + batteryGrid + gridHouse + gridBattery;
  const sources = pv + dis + imp;
  const sinks = house + chg + exp;
  const balanceKw = houseKnown ? r2(sources - sinks) : 0;
  const balanced = Math.abs(balanceKw) <= balanceTolerance(sources, sinks);
  const sum = (ids: FlowPairId[]) =>
    Math.round(ids.reduce((t, id) => t + display[id], 0) * 10) / 10;
  const totals: FlowDisplayTotals = {
    pv: sum(['pv-house', 'pv-battery', 'pv-grid']),
    gridImport: sum(['grid-house', 'grid-battery']),
    gridExport: sum(['pv-grid', 'battery-grid']),
    discharge: sum(['battery-house', 'battery-grid']),
    charge: sum(['pv-battery', 'grid-battery']),
    house: sum(['pv-house', 'grid-house', 'battery-house']),
  };
  const measured: FlowDisplayTotals = {
    pv,
    gridImport: imp,
    gridExport: exp,
    discharge: dis,
    charge: chg,
    house,
  };
  // Reconciled totals only when they stay within one display unit of every reading.
  const close = (Object.keys(totals) as (keyof FlowDisplayTotals)[]).every(
    (key) => Math.abs(totals[key] - measured[key]) <= 0.1 + 1e-6,
  );
  return {
    pairs,
    unallocatedKw: r2(Math.max(0, sources - used)),
    uncoveredKw: r2(Math.max(0, need)),
    balanceKw,
    balanced,
    simultaneous:
      (pairs['grid-house'].active || pairs['grid-battery'].active) &&
      (pairs['pv-grid'].active || pairs['battery-grid'].active),
    display: balanced && close ? totals : null,
  };
}

/* ------------------------------------------------------- physical topology (inverter hub) */

/**
 * Physical links of a hybrid inverter installation: PV strings (DC) → inverter, battery (DC) ↔
 * inverter, inverter AC output ↔ AC distribution board, grid meter ↔ board, board → house.
 * Canonical (positive) directions: pv→hub, battery→hub (discharge), hub→ac (inverter output),
 * grid→ac (import), ac→house.
 */
export type FlowLinkId = 'pv-hub' | 'battery-hub' | 'hub-ac' | 'grid-ac' | 'ac-house';
export const FLOW_LINKS: readonly FlowLinkId[] = [
  'pv-hub',
  'battery-hub',
  'hub-ac',
  'grid-ac',
  'ac-house',
];

/**
 * Links a pair passes in source → target order. Everything except grid → house runs through the
 * inverter (grid → battery: board → inverter AC side → DC → battery); grid → house only crosses
 * the board.
 */
export const PAIR_LINKS: Record<FlowPairId, readonly FlowLinkId[]> = {
  'pv-house': ['pv-hub', 'hub-ac', 'ac-house'],
  'pv-battery': ['pv-hub', 'battery-hub'],
  'pv-grid': ['pv-hub', 'hub-ac', 'grid-ac'],
  'grid-house': ['grid-ac', 'ac-house'],
  'grid-battery': ['grid-ac', 'hub-ac', 'battery-hub'],
  'battery-house': ['battery-hub', 'hub-ac', 'ac-house'],
  'battery-grid': ['battery-hub', 'hub-ac', 'grid-ac'],
};

/** Whether the pair physically passes the inverter (all but grid → house). */
export const viaInverter = (id: FlowPairId) =>
  !PAIR_LINKS[id].every((l) => l === 'grid-ac' || l === 'ac-house');

/** +1 when the pair runs along the link's canonical direction, −1 against it. */
function linkSign(id: FlowPairId, link: FlowLinkId): 1 | -1 {
  if (link === 'battery-hub') return id.startsWith('battery-') ? 1 : -1;
  if (link === 'hub-ac') return id === 'grid-battery' ? -1 : 1;
  if (link === 'grid-ac') return id.startsWith('grid-') ? 1 : -1;
  return 1;
}

/**
 * Signed power per physical link from the allocated pairs (kW, canonical direction positive).
 * `hub-ac` is the inverter AC output: PV + discharge − charging from the grid.
 */
export function linkFlows(alloc: FlowAllocation): Record<FlowLinkId, number> {
  const out = Object.fromEntries(FLOW_LINKS.map((l) => [l, 0])) as Record<FlowLinkId, number>;
  for (const id of FLOW_PAIRS)
    for (const link of PAIR_LINKS[id]) out[link] += linkSign(id, link) * alloc.pairs[id].kw;
  for (const l of FLOW_LINKS) out[l] = r2(out[l]) || 0;
  return out;
}

/**
 * Lane order of the active pairs on each link (metro-map style, no crossings outside the hub
 * disc). Vertical links list lanes left → right, horizontal links top → bottom. On the AC bus the
 * inverter flows sit on top and grid → house at the bottom; all bus lanes converge into the board
 * dot (rozvaděč) under the inverter.
 */
export const LANE_ORDER: Record<FlowLinkId, readonly FlowPairId[]> = {
  // pv → battery leftmost: its pill sits left of this leg on phones (next to its own lane).
  'pv-hub': ['pv-battery', 'pv-grid', 'pv-house'],
  'battery-hub': ['pv-battery', 'grid-battery', 'battery-grid', 'battery-house'],
  'hub-ac': ['pv-grid', 'battery-grid', 'grid-battery', 'battery-house', 'pv-house'],
  'grid-ac': ['pv-grid', 'battery-grid', 'grid-battery', 'grid-house'],
  'ac-house': ['pv-house', 'battery-house', 'grid-house'],
};

export function linkLanes(active: Iterable<FlowPairId>): Record<FlowLinkId, FlowPairId[]> {
  const on = new Set(active);
  return Object.fromEntries(
    FLOW_LINKS.map((l) => [l, LANE_ORDER[l].filter((id) => on.has(id))]),
  ) as Record<FlowLinkId, FlowPairId[]>;
}

/**
 * Inverter AC output (kW, + to the board, − charging the battery from the grid): the measured
 * sensor when bound and valid, otherwise derived from the allocation. `derived` marks the latter.
 */
export function inverterAcKw(
  measured: number | null,
  alloc: FlowAllocation | null,
): { kw: number | null; derived: boolean } {
  if (measured !== null && Number.isFinite(measured)) return { kw: r2(measured), derived: false };
  return alloc ? { kw: linkFlows(alloc)['hub-ac'], derived: true } : { kw: null, derived: true };
}

export function flowAllocation(model: EnergyModel): FlowAllocation | null {
  const { pv, gridFlow, battery, house } = model.power;
  return allocateFlows({
    pv: pv.value,
    gridImport: gridFlow.importKw,
    gridExport: gridFlow.exportKw,
    battery: battery.value,
    house: house.value,
  });
}

/* ---------------------------------------------------------------- running consumers */

export interface ConsumerRule {
  /** Shown once power stays ≥ onW for onDelayMs. */
  onW: number;
  /** Hidden once power stays < offW for offDelayMs (hysteresis band onW..offW). */
  offW: number;
  onDelayMs: number;
  offDelayMs: number;
}
/** Owner: show only appliances that really run (> 30 W). Heat pump idles at tens of watts. */
export const CONSUMER_RULES: Record<ApplianceSlot, ConsumerRule> = {
  heat_pump: { onW: 100, offW: 60, onDelayMs: 20_000, offDelayMs: 120_000 },
  // Dishwasher pauses between heating phases at ~40 W: keep it visible through the program.
  dishwasher: { onW: 30, offW: 15, onDelayMs: 10_000, offDelayMs: 180_000 },
  coffee_maker: { onW: 30, offW: 15, onDelayMs: 0, offDelayMs: 45_000 },
  dehumidifier: { onW: 30, offW: 15, onDelayMs: 20_000, offDelayMs: 60_000 },
};
export const MAX_VISIBLE_CONSUMERS = 4;

export interface ConsumerTrack {
  visible: boolean;
  /** Start of a pending flip (above on-threshold while hidden, below off-threshold while shown). */
  pendingSince: number | null;
}
export type ConsumerTracks = Partial<Record<ApplianceSlot, ConsumerTrack>>;

export interface RunningConsumer {
  slot: ApplianceSlot;
  label: string;
  /** Current power (W); null when the sensor went unknown while the item is still shown. */
  watts: number | null;
  todayKwh: number | null;
  sharePercent: number | null;
}

export interface ConsumerStep {
  tracks: ConsumerTracks;
  /** Sorted by power (desc), max MAX_VISIBLE_CONSUMERS. */
  visible: RunningConsumer[];
  /** Running but not shown because of the limit. */
  overflow: number;
  /** Earliest moment a pending flip can complete (for a re-check timer), null if none. */
  nextCheckAt: number | null;
}

/**
 * One debounce step. `initial` (first data after mount) shows already-running appliances at once.
 * Unknown power (null) or a switched-off plug hides the item immediately – never a stale chip.
 */
export function stepConsumers(
  prev: ConsumerTracks,
  readings: ApplianceReading[],
  now: number,
  initial = false,
  rules: Record<ApplianceSlot, ConsumerRule> = CONSUMER_RULES,
): ConsumerStep {
  const tracks: ConsumerTracks = {};
  let nextCheckAt: number | null = null;
  const due = (at: number) => (nextCheckAt = nextCheckAt === null ? at : Math.min(nextCheckAt, at));
  const shown: RunningConsumer[] = [];
  for (const r of readings) {
    const rule = rules[r.slot];
    const w = r.power.quality === 'ok' || r.power.quality === 'stale' ? r.power.value : null;
    const old = prev[r.slot] ?? { visible: false, pendingSince: null };
    let next: ConsumerTrack;
    if (w === null || r.switchOn === false) next = { visible: false, pendingSince: null };
    else if (!old.visible) {
      if (w < rule.onW) next = { visible: false, pendingSince: null };
      else if (initial || rule.onDelayMs === 0) next = { visible: true, pendingSince: null };
      else {
        const since = old.pendingSince ?? now;
        if (now - since >= rule.onDelayMs) next = { visible: true, pendingSince: null };
        else {
          next = { visible: false, pendingSince: since };
          due(since + rule.onDelayMs);
        }
      }
    } else if (w >= rule.offW) next = { visible: true, pendingSince: null };
    else {
      const since = old.pendingSince ?? now;
      if (now - since >= rule.offDelayMs) next = { visible: false, pendingSince: null };
      else {
        next = { visible: true, pendingSince: since };
        due(since + rule.offDelayMs);
      }
    }
    tracks[r.slot] = next;
    if (next.visible)
      shown.push({
        slot: r.slot,
        label: r.label,
        watts: w,
        todayKwh: r.todayKwh,
        sharePercent: r.sharePercent,
      });
  }
  shown.sort((a, b) => (b.watts ?? 0) - (a.watts ?? 0) || a.slot.localeCompare(b.slot));
  return {
    tracks,
    visible: shown.slice(0, MAX_VISIBLE_CONSUMERS),
    overflow: Math.max(0, shown.length - MAX_VISIBLE_CONSUMERS),
    nextCheckAt,
  };
}

export interface ConsumerItem extends RunningConsumer {
  /** Exit animation in progress (kept briefly after the item stopped running). */
  leaving: boolean;
}
export interface TrackerSnapshot {
  items: ConsumerItem[];
  overflow: number;
  nextCheckAt: number | null;
}
export const CONSUMER_EXIT_MS = 260;

/**
 * Tiny external store so React reads the debounced list via useSyncExternalStore. Items that stop
 * running stay CONSUMER_EXIT_MS in place with `leaving` (exit micro-animation), then disappear.
 */
export function createConsumerTracker(exitMs = CONSUMER_EXIT_MS) {
  let tracks: ConsumerTracks = {};
  let seeded = false;
  let snapshot: TrackerSnapshot = { items: [], overflow: 0, nextCheckAt: null };
  const leaving = new Map<ApplianceSlot, { item: ConsumerItem; index: number }>();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const listeners = new Set<() => void>();
  let last: ConsumerStep = { tracks, visible: [], overflow: 0, nextCheckAt: null };
  const emit = () => listeners.forEach((l) => l());
  const build = () => {
    const items: ConsumerItem[] = last.visible.map((c) => ({ ...c, leaving: false }));
    for (const [slot, { item, index }] of leaving)
      if (!items.some((c) => c.slot === slot)) items.splice(Math.min(index, items.length), 0, item);
    const next = { items, overflow: last.overflow, nextCheckAt: last.nextCheckAt };
    const same =
      next.overflow === snapshot.overflow &&
      next.nextCheckAt === snapshot.nextCheckAt &&
      next.items.length === snapshot.items.length &&
      next.items.every((c, i) => {
        const o = snapshot.items[i]!;
        return c.slot === o.slot && c.watts === o.watts && c.leaving === o.leaving;
      });
    if (!same) snapshot = next;
    return !same;
  };
  return {
    update(readings: ApplianceReading[], now: number) {
      const step = stepConsumers(tracks, readings, now, !seeded);
      seeded = seeded || readings.length > 0;
      tracks = step.tracks;
      const shown = new Set(step.visible.map((c) => c.slot));
      snapshot.items.forEach((c, index) => {
        if (c.leaving || shown.has(c.slot)) return;
        leaving.set(c.slot, { item: { ...c, leaving: true }, index });
        const timer = setTimeout(() => {
          timers.delete(timer);
          leaving.delete(c.slot);
          if (build()) emit();
        }, exitMs);
        timers.add(timer);
      });
      for (const slot of shown) leaving.delete(slot);
      last = step;
      if (build()) emit();
      return snapshot;
    },
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispose() {
      timers.forEach(clearTimeout);
      timers.clear();
    },
  };
}

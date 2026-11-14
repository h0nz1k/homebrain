/*
 * Three-phase view of the grid connection: per-phase power and current against the main
 * breaker, phase asymmetry (imbalance) and the "saldo" a summing meter applies when phases flow
 * in opposite directions. Pure functions only – the hero and the detail sheet render the result.
 *
 * Thresholds (documented in docs/requirements/energy.md):
 *  - notice: phases differ by ≥ 6 A (≈ 1,4 kW) or one phase carries ≥ 60 % of the main breaker;
 *  - warn:   phases differ by ≥ 16 A (≈ 3,7 kVA at 230 V – the asymmetry limit for PV in
 *            PPDS příloha 4) or one phase carries ≥ 80 % of the main breaker.
 */

import { formatPower } from '@homebrain/ui';

export type PhaseState = 'ok' | 'notice' | 'warn';
export type Triple<T> = [T, T, T];

export const NOMINAL_VOLTAGE = 230;
export const DEFAULT_BREAKER_A = 25;
export const PHASE_THRESHOLDS = {
  noticeSpreadA: 6,
  warnSpreadA: 16,
  noticeLoad: 0.6,
  warnLoad: 0.8,
  /** Below this mean current the relative imbalance is meaningless (noise) → null. */
  minMeanForPercentA: 2,
  /** A phase counts as importing/exporting from this power on (kW). */
  activeKw: 0.05,
} as const;

export interface PhaseReading {
  /** Grid power on the phase, import + / export − (kW). */
  kw: number;
  /** Signed current, import + (A). Measured magnitude when bound, else P / 230 V. */
  amps: number;
  /** |amps| / main breaker (0…). */
  load: number;
  estimated: boolean;
}

export interface PhaseSaldo {
  importing: number[];
  exporting: number[];
  importKw: number;
  exportKw: number;
  /** Net over the phases, import + (kW) – what a summing meter registers. */
  netKw: number;
  text: string;
}

export interface PhaseAnalysis {
  phases: Triple<PhaseReading>;
  breakerA: number;
  /** max − min of the signed phase currents (A). */
  spreadA: number;
  /** Max deviation of a phase from the mean, relative to the mean magnitude (%), or null. */
  imbalancePercent: number | null;
  state: PhaseState;
  reasons: string[];
  /** Index of the phase with the largest |current|. */
  heaviest: number;
  saldo: PhaseSaldo | null;
}

const nf = (digits: number) =>
  new Intl.NumberFormat('cs-CZ', { minimumFractionDigits: digits, maximumFractionDigits: digits });
export const kw1 = (kw: number) => nf(1).format(Math.abs(kw)).replace('−', '');
const label = (i: number) => `L${i + 1}`;
const joinPhases = (idx: number[]) => idx.map(label).join(' a ');
/** Saldo amounts like the rest of Energie: watts under 1 kW, so small flows never read „0,1 kW“ thrice. */
const power = (kw: number) => formatPower(Math.abs(kw), 'kW');

/** Main breaker in A from an optional reading; non-sense values fall back to 25 A. */
export function breakerAmps(value: number | null | undefined): number {
  return value !== null &&
    value !== undefined &&
    Number.isFinite(value) &&
    value >= 6 &&
    value <= 250
    ? value
    : DEFAULT_BREAKER_A;
}

/**
 * Signed current per phase: a bound current sensor gives the magnitude (more accurate – includes
 * reactive power), the direction always comes from the power. Without a sensor I ≈ P / 230 V.
 */
export function phaseAmps(
  kw: number,
  measuredA?: number | null,
): { amps: number; estimated: boolean } {
  const sign = kw < 0 ? -1 : 1;
  if (measuredA !== null && measuredA !== undefined && Number.isFinite(measuredA))
    return { amps: sign * Math.abs(measuredA), estimated: false };
  return { amps: (kw * 1000) / NOMINAL_VOLTAGE, estimated: true };
}

/** Phases flowing in opposite directions → what the summing meter counts. Null otherwise. */
export function phaseSaldo(powersKw: readonly number[]): PhaseSaldo | null {
  const t = PHASE_THRESHOLDS.activeKw;
  const importing = powersKw.flatMap((p, i) => (p >= t ? [i] : []));
  const exporting = powersKw.flatMap((p, i) => (p <= -t ? [i] : []));
  if (!importing.length || !exporting.length) return null;
  const importKw = importing.reduce((s, i) => s + powersKw[i]!, 0);
  const exportKw = -exporting.reduce((s, i) => s + powersKw[i]!, 0);
  const netKw = powersKw.reduce((s, p) => s + p, 0);
  const verb = (idx: number[], one: string, many: string) => (idx.length > 1 ? many : one);
  const result =
    Math.abs(netKw) < t
      ? 'elektroměr fáze sečte na nulu'
      : `elektroměr počítá ${netKw > 0 ? 'odběr' : 'dodávku'} ${power(netKw)}`;
  return {
    importing,
    exporting,
    importKw,
    exportKw,
    netKw,
    text:
      `${joinPhases(importing)} ${verb(importing, 'odebírá', 'odebírají')} ${power(importKw)}, ` +
      `${joinPhases(exporting)} ${verb(exporting, 'dodává', 'dodávají')} ${power(exportKw)} → ${result}`,
  };
}

export function analyzePhases(input: {
  powersKw: readonly number[];
  currentsA?: readonly (number | null)[];
  breakerA?: number | null;
}): PhaseAnalysis {
  const breakerA = breakerAmps(input.breakerA);
  const phases = input.powersKw.slice(0, 3).map((kw, i) => {
    const { amps, estimated } = phaseAmps(kw, input.currentsA?.[i]);
    return { kw, amps, load: Math.abs(amps) / breakerA, estimated };
  }) as Triple<PhaseReading>;
  const amps = phases.map((p) => p.amps);
  const spreadA = Math.max(...amps) - Math.min(...amps);
  const mean = amps.reduce((s, a) => s + a, 0) / 3;
  const meanAbs = amps.reduce((s, a) => s + Math.abs(a), 0) / 3;
  const imbalancePercent =
    meanAbs >= PHASE_THRESHOLDS.minMeanForPercentA
      ? Math.round((Math.max(...amps.map((a) => Math.abs(a - mean))) / meanAbs) * 100)
      : null;
  const heaviest = amps.reduce((best, a, i) => (Math.abs(a) > Math.abs(amps[best]!) ? i : best), 0);
  const T = PHASE_THRESHOLDS;
  const reasons: string[] = [];
  let state: PhaseState = 'ok';
  const bump = (s: PhaseState) => {
    if (s === 'warn' || (s === 'notice' && state === 'ok')) state = s;
  };
  const top = phases[heaviest]!;
  if (top.load >= T.noticeLoad) {
    bump(top.load >= T.warnLoad ? 'warn' : 'notice');
    reasons.push(`${label(heaviest)} na ${Math.round(top.load * 100)} % jističe`);
  }
  if (spreadA >= T.noticeSpreadA) {
    bump(spreadA >= T.warnSpreadA ? 'warn' : 'notice');
    reasons.push(`rozdíl fází ${Math.round(spreadA)} A`);
  }
  return {
    phases,
    breakerA,
    spreadA,
    imbalancePercent,
    state,
    reasons,
    heaviest,
    saldo: phaseSaldo(input.powersKw),
  };
}

export const PHASE_STATE_TEXT: Record<PhaseState, string> = {
  ok: 'vyrovnané',
  notice: 'mírná nesymetrie',
  warn: 'vysoká nesymetrie',
};

export interface ImbalanceStats {
  samples: number;
  avgSpreadA: number;
  p95SpreadA: number;
  maxSpreadA: number;
  /** Share of samples (0–100 %) at or above the notice / warn spread. */
  noticePercent: number;
  warnPercent: number;
  /** Highest single-phase |current| (A) and share of samples ≥ 80 % of the breaker. */
  maxPhaseA: number;
  overloadPercent: number;
  /** Phase that carried the most energy (import +) over the window. */
  heaviest: number | null;
}

/** Imbalance statistics over a window of per-phase samples (kW, import +, estimated at 230 V). */
export function imbalanceStats(
  samples: readonly (readonly number[])[],
  breakerA: number = DEFAULT_BREAKER_A,
): ImbalanceStats | null {
  const rows = samples.filter((r) => r.length === 3 && r.every((v) => Number.isFinite(v)));
  if (!rows.length) return null;
  const T = PHASE_THRESHOLDS;
  const spreads = rows.map((r) => ((Math.max(...r) - Math.min(...r)) * 1000) / NOMINAL_VOLTAGE);
  const sorted = [...spreads].sort((a, b) => a - b);
  const maxA = rows.map((r) => (Math.max(...r.map(Math.abs)) * 1000) / NOMINAL_VOLTAGE);
  const share = (n: number) => Math.round((n / rows.length) * 1000) / 10;
  const energy = [0, 1, 2].map((i) => rows.reduce((s, r) => s + Math.abs(r[i]!), 0));
  const heaviest = energy.some((e) => e > 0) ? energy.indexOf(Math.max(...energy)) : null;
  return {
    samples: rows.length,
    avgSpreadA: spreads.reduce((s, v) => s + v, 0) / rows.length,
    p95SpreadA: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]!,
    maxSpreadA: sorted[sorted.length - 1]!,
    noticePercent: share(spreads.filter((s) => s >= T.noticeSpreadA).length),
    warnPercent: share(spreads.filter((s) => s >= T.warnSpreadA).length),
    maxPhaseA: Math.max(...maxA),
    overloadPercent: share(maxA.filter((a) => a >= breakerA * T.warnLoad).length),
    heaviest,
  };
}

/**
 * Which phase a running single-phase appliance most likely sits on, from the house load per
 * phase: the appliance must dominate one phase (that phase ≥ 80 % of the appliance and ahead of
 * the next phase by ≥ 60 % of it). Null when unsure (small load, three-phase device, overlap).
 */
export function guessAppliancePhase(
  applianceKw: number,
  housePhasesKw: readonly (number | null)[],
): number | null {
  if (!(applianceKw >= 0.8) || housePhasesKw.length !== 3) return null;
  if (housePhasesKw.some((v) => v === null || !Number.isFinite(v))) return null;
  const v = housePhasesKw as number[];
  const order = [0, 1, 2].sort((a, b) => v[b]! - v[a]!);
  const [top, second] = [v[order[0]!]!, v[order[1]!]!];
  return top >= applianceKw * 0.8 && top - second >= applianceKw * 0.6 ? order[0]! : null;
}

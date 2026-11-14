import { useId, type CSSProperties } from 'react';
import type { PhaseHistory } from '../adapter.js';
import type { ApplianceReading } from '../appliances.js';
import type { EnergyModel } from '../contract.js';
import {
  analyzePhases,
  guessAppliancePhase,
  imbalanceStats,
  kw1,
  PHASE_STATE_TEXT,
  PHASE_THRESHOLDS,
  type PhaseAnalysis,
} from '../phases.js';

/*
 * 'Fáze' – compact three-phase element of the energy hero. Each phase is a bidirectional bar from
 * a centre line (right = odběr, left = dodávka) scaled to the main breaker, with a soft 80 % mark.
 * The head shows the asymmetry (max − min current) and its state; opposite flows get a saldo line.
 */

export interface PhaseView {
  source: 'grid' | 'house';
  analysis: PhaseAnalysis;
}

/** Grid meter phases when bound (signed, import +), else the house load per phase. */
export function phaseView(model: EnergyModel): PhaseView | null {
  const p = model.power;
  const currentsA = p.gridCurrents.map((r) =>
    r.quality === 'ok' || r.quality === 'stale' ? r.value : null,
  );
  const breakerA = p.breaker.value;
  if (p.gridFlow.phasesKw)
    return {
      source: 'grid',
      analysis: analyzePhases({ powersKw: p.gridFlow.phasesKw, currentsA, breakerA }),
    };
  const house = p.phases.map((r) => r.value);
  if (house.every((v): v is number => v !== null))
    return { source: 'house', analysis: analyzePhases({ powersKw: house, breakerA }) };
  return null;
}

const nf0 = new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** Row current: one decimal below 10 A so it matches the kW column (1,3 A ↔ 0,30 kW). */
const rowAmps = (a: number) => (Math.abs(a) < 9.95 ? nf1 : nf0).format(Math.abs(a));
/** Spread: one decimal below 10 A (0,4 A), whole amps above. */
const spreadText = (a: number) => (a < 9.95 ? nf1 : nf0).format(a);

function dirOf(kw: number): 'in' | 'out' | 'idle' {
  return kw >= PHASE_THRESHOLDS.activeKw ? 'in' : kw <= -PHASE_THRESHOLDS.activeKw ? 'out' : 'idle';
}

function PhaseBar(props: { i: number; a: PhaseAnalysis; delay: number }) {
  const ph = props.a.phases[props.i]!;
  const dir = dirOf(ph.kw);
  const hot = ph.load >= PHASE_THRESHOLDS.warnLoad;
  return (
    <span
      className="ef-ph-row"
      data-dir={dir}
      data-hot={hot || undefined}
      data-testid={`energy-phase-l${props.i + 1}`}
      style={{ '--x': Math.min(1, ph.load).toFixed(3), '--d': `${props.delay}ms` } as CSSProperties}
    >
      <span className="ef-ph-l">L{props.i + 1}</span>
      <span className="ef-ph-track" aria-hidden="true">
        <i className="ef-ph-fill" />
      </span>
      <span className="ef-ph-v">
        <b title={ph.estimated ? 'odhad z výkonu při 230 V' : undefined}>
          {dir === 'idle' ? '0' : rowAmps(ph.amps)}
          <small>&nbsp;A</small>
        </b>
        <em>{dir === 'idle' ? '0,00' : nf2.format(Math.abs(ph.kw))} kW</em>
      </span>
    </span>
  );
}

function PhaseBars({ a }: { a: PhaseAnalysis }) {
  const dirs = a.phases.map((p) => dirOf(p.kw));
  return (
    <span
      className="ef-ph-bars"
      data-export={dirs.includes('out') || undefined}
      style={{ '--z': dirs.includes('out') ? 0.5 : 0.18 } as CSSProperties}
    >
      <span className="ef-ph-axis" aria-hidden="true">
        {dirs.includes('out') && <span className="ef-ph-axis-out">← dodávka</span>}
        <span className="ef-ph-axis-in">odběr →</span>
        {!dirs.includes('out') && (
          <span className="ef-ph-axis-max">{nf0.format(a.breakerA)}&nbsp;A</span>
        )}
      </span>
      {[0, 1, 2].map((i) => (
        <PhaseBar key={i} i={i} a={a} delay={i * 70} />
      ))}
    </span>
  );
}

/** One actionable sentence under the bars (headroom of the busiest phase, appliance on it). */
export function phaseHint(
  a: PhaseAnalysis,
  appliances: ApplianceReading[],
  housePhasesKw: (number | null)[],
): { lead: string | null; text: string } {
  const h = a.heaviest;
  const top = a.phases[h]!;
  const others = [0, 1, 2].filter((i) => i !== h).map((i) => `L${i + 1}`);
  const headroom = `L${h + 1} ${rowAmps(top.amps)} z ${nf0.format(a.breakerA)} A · rezerva ${nf0.format(
    Math.max(0, a.breakerA - Math.abs(top.amps)),
  )} A`;
  if (a.state === 'ok') return { lead: null, text: `Fáze jsou zatížené rovnoměrně. ${headroom}` };
  const culprit = appliances
    .filter((ap) => (ap.power.value ?? 0) >= 800)
    .sort((x, y) => (y.power.value ?? 0) - (x.power.value ?? 0))
    .find((ap) => guessAppliancePhase((ap.power.value ?? 0) / 1000, housePhasesKw) === h);
  return culprit
    ? {
        lead: `${culprit.label} táhne L${h + 1}`,
        text: `Další velké spotřebiče raději na ${others.join(' nebo ')}. ${headroom}`,
      }
    : { lead: a.reasons.join(' · ') || null, text: headroom };
}

export function PhaseStrip(props: {
  model: EnergyModel;
  appliances?: ApplianceReading[];
  onOpen: () => void;
}) {
  const view = phaseView(props.model);
  if (!view) return null;
  const a = view.analysis;
  const dirs = a.phases.map((p) => dirOf(p.kw));
  const compact = a.state === 'ok' && !a.saldo;
  const currents = a.phases.map((p) => Math.abs(p.amps));
  const low = Math.min(...currents);
  const high = Math.max(...currents);
  const currentText =
    rowAmps(low) === rowAmps(high) ? `po ${rowAmps(high)}` : `${rowAmps(low)}–${rowAmps(high)}`;
  const hint = phaseHint(
    a,
    props.appliances ?? [],
    props.model.power.phases.map((r) => r.value),
  );
  const label = `Fáze: ${PHASE_STATE_TEXT[a.state]}, rozdíl ${spreadText(a.spreadA)} A. ${a.phases
    .map((p, i) => `L${i + 1} ${dirs[i] === 'out' ? 'dodávka' : 'odběr'} ${kw1(p.kw)} kW`)
    .join(', ')}`;
  return (
    <button
      type="button"
      className="ef-ph"
      data-state={a.state}
      data-compact={compact || undefined}
      data-saldo={a.saldo ? 'true' : undefined}
      data-testid="energy-phases"
      aria-label={label}
      onClick={props.onOpen}
    >
      {compact && (
        <span className="ef-ph-summary" data-testid="energy-phases-hint">
          L1–L3 {currentText}&nbsp;A · rezerva {nf0.format(Math.max(0, a.breakerA - high))}&nbsp;A
        </span>
      )}
      <span className="ef-ph-head" hidden={compact}>
        <span className="ef-ph-eyebrow">
          Fáze <span>· jistič 3×{nf0.format(a.breakerA)}&nbsp;A</span>
        </span>
        <span className="ef-ph-state" data-testid="energy-phases-state">
          <i aria-hidden="true" />
          {PHASE_STATE_TEXT[a.state]}
        </span>
        <span className="ef-ph-big">
          {spreadText(a.spreadA)}
          <small> A rozdíl fází</small>
        </span>
      </span>
      {!compact && <PhaseBars a={a} />}
      <span
        className="ef-ph-hint"
        hidden={compact}
        data-testid={compact ? undefined : a.saldo ? 'energy-phases-saldo' : 'energy-phases-hint'}
      >
        {a.saldo ? (
          <>
            <b>Saldování fází</b>
            {a.saldo.text}
          </>
        ) : (
          <>
            {hint.lead && <b>{hint.lead}</b>}
            {hint.text}
          </>
        )}
      </span>
    </button>
  );
}

/** Smooth 24 h area sparkline around a zero line (import above, export below). No text inside. */
function Spark(props: { t: number[]; kw: number[]; max: number; now: number }) {
  const id = useId().replace(/:/g, '');
  const W = 300;
  const H = 56;
  const mid = H / 2;
  const t0 = props.now - 24 * 3600_000;
  const x = (t: number) => ((t - t0) / (24 * 3600_000)) * W;
  const y = (v: number) => mid - (v / props.max) * (mid - 3);
  const pts = props.t.map((t, i) => `${x(t).toFixed(1)},${y(props.kw[i]!).toFixed(1)}`);
  if (pts.length < 2) return null;
  const line = `M${pts.join('L')}`;
  const area = `${line}L${x(props.t[props.t.length - 1]!).toFixed(1)},${mid}L${x(props.t[0]!).toFixed(1)},${mid}Z`;
  return (
    <svg
      className="ef-spark"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`${id}-g`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="var(--hb-energy-grid)" stopOpacity=".6" />
          <stop offset=".5" stopColor="var(--hb-energy-grid)" stopOpacity=".04" />
          <stop offset=".5" stopColor="var(--ef-sun)" stopOpacity=".04" />
          <stop offset="1" stopColor="var(--ef-sun)" stopOpacity=".6" />
        </linearGradient>
      </defs>
      <line className="ef-spark-zero" x1="0" x2={W} y1={mid} y2={mid} />
      <path d={area} fill={`url(#${id}-g)`} />
      <path className="ef-spark-line" d={line} />
    </svg>
  );
}

const pct = (v: number) =>
  `${new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: v < 10 ? 1 : 0 }).format(v)} %`;

/** Body of the 'Fáze' detail sheet: per-phase 24 h history, stats, big appliances per phase. */
export function PhaseSheetBody(props: {
  model: EnergyModel;
  history: PhaseHistory;
  appliances: ApplianceReading[];
}) {
  const view = phaseView(props.model);
  if (!view) return null;
  const a = view.analysis;
  const h = props.history;
  const sign = h.source === 'grid' ? (props.model.power.gridFlow.meterSign ?? 1) : 1;
  const kw = h.kw.map((s) => s.map((v) => v * sign));
  const samples = h.t.map((_, i) => [kw[0]![i]!, kw[1]![i]!, kw[2]![i]!]);
  const stats = h.status === 'ready' ? imbalanceStats(samples, a.breakerA) : null;
  const max = Math.max(1, ...kw.flat().map(Math.abs));
  const housePhases = props.model.power.phases.map((r) => r.value);
  const big = props.appliances
    .filter((ap) => (ap.power.value ?? 0) >= 800)
    .map((ap) => ({ ap, phase: guessAppliancePhase((ap.power.value ?? 0) / 1000, housePhases) }));
  const T = PHASE_THRESHOLDS;
  const sumA = a.phases.reduce((acc, p) => acc + Math.abs(p.amps), 0);
  const share = sumA > 0 ? (Math.abs(a.phases[a.heaviest]!.amps) / sumA) * 100 : 0;
  // Hour ticks every 6 h (local time) inside the 24 h window, as % of the width.
  const t0 = props.model.now - 24 * 3600_000;
  const ticks: { left: number; label: string }[] = [];
  const hourFmt = new Intl.DateTimeFormat('cs-CZ', {
    hour: 'numeric',
    timeZone: props.model.timeZone,
  });
  for (let t = Math.ceil(t0 / 3600_000) * 3600_000; t < props.model.now; t += 3600_000) {
    const hr = Number(hourFmt.format(t));
    const left = ((t - t0) / (24 * 3600_000)) * 100;
    if (hr % 6 === 0 && left > 14 && left < 90) ticks.push({ left, label: `${hr}:00` });
  }
  return (
    <div className="ef-phs" data-testid="energy-phases-sheet">
      {a.state === 'ok' && !a.saldo && <PhaseBars a={a} />}
      <div className="ef-phs-now" data-state={a.state}>
        <span className="ef-ph-state">
          <i aria-hidden="true" />
          {PHASE_STATE_TEXT[a.state]}
        </span>
        <span>
          rozdíl <b>{spreadText(a.spreadA)} A</b>
          {a.imbalancePercent !== null && (
            <>
              {' '}
              · L{a.heaviest + 1} nese <b>{nf0.format(share)} %</b> proudu · odchylka od průměru{' '}
              {nf0.format(a.imbalancePercent)} %
            </>
          )}
        </span>
      </div>
      {a.saldo && <p className="ef-phs-saldo">{a.saldo.text}</p>}
      <div className="ef-phs-spark" data-testid="energy-phases-history">
        {[0, 1, 2].map((i) => (
          <div key={i} className="ef-phs-row">
            <span className="ef-ph-l">L{i + 1}</span>
            {h.status === 'ready' ? (
              <Spark t={h.t} kw={kw[i]!} max={max} now={props.model.now} />
            ) : (
              <span className="ef-phs-empty">
                {h.status === 'idle' ? 'Načítám…' : 'Historie není'}
              </span>
            )}
            <span className="ef-ph-v">
              {kw1(a.phases[i]!.kw)}
              <small> kW</small>
            </span>
          </div>
        ))}
        {h.status === 'ready' && (
          <div className="ef-phs-axis" aria-hidden="true">
            <span>před 24 h</span>
            {ticks.map((tk) => (
              <span key={tk.label} className="ef-phs-tick" style={{ left: `${tk.left}%` }}>
                {tk.label}
              </span>
            ))}
            <span>teď</span>
          </div>
        )}
      </div>
      {stats && <h4 className="ef-phs-h">Posledních 24 h · z 5min průměrů</h4>}
      {stats && (
        <dl className="ef-phs-stats" data-testid="energy-phases-stats">
          <div>
            <dt>Průměrný rozdíl</dt>
            <dd>{nf0.format(stats.avgSpreadA)} A</dd>
          </div>
          <div>
            <dt>Největší rozdíl</dt>
            <dd>{nf0.format(stats.maxSpreadA)} A</dd>
          </div>
          <div>
            <dt>Rozdíl nad {T.noticeSpreadA} A</dt>
            <dd>{pct(stats.noticePercent)} času</dd>
          </div>
          <div>
            <dt>Rozdíl nad {T.warnSpreadA} A</dt>
            <dd>{pct(stats.warnPercent)} času</dd>
          </div>
        </dl>
      )}
      {big.length > 0 && (
        <ul className="ef-phs-apps" aria-label="Velké spotřebiče po fázích">
          {big.map(({ ap, phase }) => (
            <li key={ap.slot}>
              <span>{ap.label}</span>
              <b>{phase === null ? 'fáze neurčena' : `nejspíš L${phase + 1}`}</b>
            </li>
          ))}
        </ul>
      )}
      <p className="ef-phs-foot">
        {view.source === 'house'
          ? 'Zobrazena spotřeba domu po fázích; elektroměr po fázích (energy_grid_l1…l3) ukáže i dodávku. '
          : ''}
        {a.phases.some((p) => p.estimated) ? 'Proud je odhad z výkonu při 230 V. ' : ''}
        Upozornění od rozdílu {T.noticeSpreadA} A nebo {Math.round(T.noticeLoad * 100)} % jističe,
        varování od {T.warnSpreadA}&nbsp;A (≈&nbsp;3,7&nbsp;kVA – limit nesymetrie FVE dle PPDS,
        příloha&nbsp;4) nebo {Math.round(T.warnLoad * 100)}&nbsp;% jističe. Historie z 5min průměrů
        vyhladí krátké špičky, proto může být „teď“ vyšší než maximum za 24 h.
      </p>
    </div>
  );
}

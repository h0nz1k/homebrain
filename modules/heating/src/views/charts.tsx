import { useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import {
  downsample,
  fmtNum,
  minutesOf,
  niceTicks,
  timeLabel,
  timeTicks,
  type SeasonCard,
} from '../model.js';
import type { HeatingSchedule, HistoryPoint, HistoryRange } from '../types.js';

export interface ChartSeries {
  key: string;
  label: string;
  color: string;
  points: HistoryPoint[];
  /** Draw the min/max band (only for the primary series). */
  band?: boolean;
}

const VW = 1000;
const pct = (v: number) => `${v.toFixed(3)}%`;

/** Line chart: SVG without text (stretched), HTML axis labels, crosshair readout, drag-to-zoom. */
export function TimeChart({
  series,
  range,
  domain,
  height = 220,
  onZoom,
  testid,
  runs,
}: {
  series: ChartSeries[];
  range: HistoryRange;
  domain: [number, number];
  height?: number;
  onZoom?: (from: number, to: number) => void;
  testid?: string;
  /** Compressor runs drawn as a lane directly under the plot, above the time labels. */
  runs?: Array<[number, number]>;
}) {
  const [from, to] = domain;
  const shown = useMemo(
    () =>
      series.map((s) => ({
        ...s,
        points: downsample(
          s.points.filter((p) => p[0] >= from && p[0] <= to),
          240,
        ),
      })),
    [series, from, to],
  );
  const all = shown.flatMap((s) => s.points.flatMap((p) => (s.band ? [p[2], p[3]] : [p[1]])));
  const ticks = niceTicks(Math.min(...all), Math.max(...all), 6);
  const y0 = ticks[0] ?? 0;
  const y1 = ticks[ticks.length - 1] ?? 1;
  const H = 100;
  const x = (ts: number) => ((ts - from) / Math.max(1, to - from)) * VW;
  const y = (v: number) => H - ((v - y0) / Math.max(1e-9, y1 - y0)) * H;
  const axis = useMemo(() => timeTicks(from, to), [from, to]);
  const xTicks = axis.ticks;
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [drag, setDrag] = useState<[number, number] | null>(null);
  const tsAt = (e: RPointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return from + ((e.clientX - r.left) / Math.max(1, r.width)) * (to - from);
  };
  const near = (s: (typeof shown)[number], ts: number) => {
    let best: HistoryPoint | null = null;
    for (const p of s.points) if (!best || Math.abs(p[0] - ts) < Math.abs(best[0] - ts)) best = p;
    return best;
  };
  if (!all.length)
    return (
      <div className="ht-chart-empty" data-testid={testid}>
        Pro tohle období zatím nejsou data.
      </div>
    );
  return (
    <div className="ht-chart-wrap" data-testid={testid}>
      <div
        className="ht-chart"
        ref={ref}
        style={{ height }}
        onPointerDown={(e) => {
          if (!onZoom || e.button !== 0) return;
          (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
          setDrag([tsAt(e), tsAt(e)]);
        }}
        onPointerMove={(e) => {
          const ts = tsAt(e);
          setHover(ts);
          if (drag) setDrag([drag[0], ts]);
        }}
        onPointerUp={() => {
          if (drag && onZoom) {
            const a = Math.min(...drag);
            const b = Math.max(...drag);
            if (b - a > (to - from) / 40) onZoom(a, b);
          }
          setDrag(null);
        }}
        onPointerLeave={() => {
          setHover(null);
        }}
      >
        <svg viewBox={`0 0 ${VW} ${H}`} preserveAspectRatio="none" aria-hidden="true">
          {ticks.map((t) => (
            <line key={t} x1={0} x2={VW} y1={y(t)} y2={y(t)} className="ht-grid" />
          ))}
          {shown.map((s) =>
            s.band && s.points.length > 1 ? (
              <path
                key={`${s.key}-band`}
                d={`${s.points.map((p, i) => `${i ? 'L' : 'M'}${x(p[0]).toFixed(1)} ${y(p[3]).toFixed(2)}`).join(' ')} ${s.points
                  .slice()
                  .reverse()
                  .map((p) => `L${x(p[0]).toFixed(1)} ${y(p[2]).toFixed(2)}`)
                  .join(' ')}Z`}
                fill={s.color}
                opacity={0.14}
              />
            ) : null,
          )}
          {shown.map((s) => (
            <path
              key={s.key}
              d={s.points
                .map((p, i) => `${i ? 'L' : 'M'}${x(p[0]).toFixed(1)} ${y(p[1]).toFixed(2)}`)
                .join(' ')}
              stroke={s.color}
              className="ht-line"
              data-series={s.key}
            />
          ))}
        </svg>
        {ticks.map((t) => (
          <span key={t} className="ht-ylab" style={{ top: pct((y(t) / H) * 100) }}>
            {fmtNum(t, 0)}°
          </span>
        ))}
        {drag && (
          <span
            className="ht-zoomsel"
            style={{
              left: pct((x(Math.min(...drag)) / VW) * 100),
              width: pct((Math.abs(x(drag[1]) - x(drag[0])) / VW) * 100),
            }}
          />
        )}
        {hover !== null && !drag && (
          <>
            <span className="ht-cross" style={{ left: pct((x(hover) / VW) * 100) }} />
            <span
              className="ht-tip"
              data-side={x(hover) > VW * 0.6 ? 'l' : 'r'}
              style={{ left: pct((x(hover) / VW) * 100) }}
            >
              <b>
                {new Date(hover).toLocaleString(
                  'cs-CZ',
                  range === 'day' || range === 'week'
                    ? {
                        weekday: 'short',
                        day: 'numeric',
                        month: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      }
                    : { day: 'numeric', month: 'numeric', year: 'numeric' },
                )}
              </b>
              {shown.map((s) => {
                const p = near(s, hover);
                return p ? (
                  <span key={s.key}>
                    <i style={{ background: s.color }} />
                    {s.label} {fmtNum(p[1])}
                  </span>
                ) : null;
              })}
            </span>
          </>
        )}
      </div>
      {runs && <RunStrip runs={runs} domain={domain} ticks={xTicks.map((t) => x(t) / VW)} />}
      <div className="ht-xlabs" aria-hidden="true">
        {xTicks.map((t) => (
          <span key={t} style={{ left: pct((x(t) / VW) * 100) }}>
            {timeLabel(t, axis.unit)}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Compressor run strip on the same time axis (one segment per run). */
export function RunStrip({
  runs,
  domain,
  ticks = [],
}: {
  runs: Array<[number, number]>;
  domain: [number, number];
  /** Time-axis tick positions (0…1) continued through the lane. */
  ticks?: number[];
}) {
  const [from, to] = domain;
  const span = Math.max(1, to - from);
  const visible = runs.filter(([a, b]) => b > from && a < to);
  return (
    <div
      className="ht-runs"
      data-testid="heating-runs"
      role="img"
      aria-label={`Běhy kompresoru: ${visible.length}`}
    >
      <span className="ht-runs-lbl" aria-hidden="true">
        TČ
      </span>
      {ticks.map((t) => (
        <b key={t} className="ht-runs-tick" style={{ left: pct(t * 100) }} />
      ))}
      {visible.map(([a, b]) => (
        <i
          key={a}
          style={{
            left: pct(((Math.max(a, from) - from) / span) * 100),
            width: pct(Math.max(0.25, ((Math.min(b, to) - Math.max(a, from)) / span) * 100)),
          }}
        />
      ))}
    </div>
  );
}

export interface ScatterPoint {
  x: number;
  y: number;
  group: 'before' | 'after' | 'current';
}

type Fit = { x0: number; y0: number; x1: number; y1: number } | null;

/** Daily run hours vs. mean outdoor temperature (1 dot = 1 day) + a trend line per group. */
export function Scatter({
  points,
  fits,
}: {
  points: ScatterPoint[];
  fits?: Record<ScatterPoint['group'], Fit>;
}) {
  const xs = niceTicks(Math.min(...points.map((p) => p.x)), Math.max(...points.map((p) => p.x)), 4);
  const maxY = Math.max(6, ...points.map((p) => p.y));
  const ys = niceTicks(0, maxY, 4);
  const X0 = xs[0] ?? -10;
  const X1 = xs[xs.length - 1] ?? 20;
  const Y1 = ys[ys.length - 1] ?? 24;
  const fx = (v: number) => ((v - X0) / (X1 - X0)) * VW;
  const fy = (v: number) => 100 - (v / Y1) * 100;
  return (
    <div className="ht-chart-wrap" data-testid="heating-scatter">
      <div className="ht-chart ht-scatter" style={{ height: 220 }}>
        <svg viewBox={`0 0 ${VW} 100`} preserveAspectRatio="none" aria-hidden="true">
          {ys.map((t) => (
            <line key={t} x1={0} x2={VW} y1={fy(t)} y2={fy(t)} className="ht-grid" />
          ))}
        </svg>
        {points.map((p, i) => (
          <i
            key={i}
            className="ht-dot"
            data-group={p.group}
            style={{ left: pct((fx(p.x) / VW) * 100), top: pct(fy(p.y)) }}
          />
        ))}
        {fits && (
          <svg
            viewBox={`0 0 ${VW} 100`}
            preserveAspectRatio="none"
            aria-hidden="true"
            className="ht-fits"
          >
            {(['before', 'after', 'current'] as const).map((g) => {
              const f = fits[g];
              return f ? (
                <line
                  key={g}
                  data-group={g}
                  className="ht-fit"
                  x1={fx(f.x0)}
                  y1={fy(f.y0)}
                  x2={fx(f.x1)}
                  y2={fy(f.y1)}
                />
              ) : null;
            })}
          </svg>
        )}
        {ys.map((t) => (
          <span key={t} className="ht-ylab" style={{ top: pct(fy(t)) }}>
            {fmtNum(t, 0)}
            {t === ys[ys.length - 1] ? '\u00a0h' : ''}
          </span>
        ))}
      </div>
      <div className="ht-xlabs" aria-hidden="true">
        {xs.map((t) => (
          <span key={t} style={{ left: pct((fx(t) / VW) * 100) }}>
            {fmtNum(t, 0)}&nbsp;°C
          </span>
        ))}
      </div>
    </div>
  );
}

/** Seasons as columns (run hours); a column with a note gets a marker + caption. */
export function SeasonBars({ cards }: { cards: SeasonCard[] }) {
  const ordered = cards.slice().reverse();
  const ticks = niceTicks(0, Math.max(...ordered.map((c) => c.compressor_h)), 3);
  const top = ticks[ticks.length - 1] ?? 1;
  return (
    <div className="ht-sbars" data-testid="heating-season-bars">
      {ticks.map((t) => (
        <span
          key={t}
          className="ht-sbars-grid"
          style={{ bottom: `calc(28px + (100% - 56px) * ${t / top})` }}
        >
          <em>
            {fmtNum(t, 0)}
            {t === top ? '\u00a0h' : ''}
          </em>
        </span>
      ))}
      {ordered.map((c) => (
        <div
          key={c.season}
          className="ht-sbar"
          data-partial={c.partial ? '' : undefined}
          data-note={c.note ? '' : undefined}
        >
          <b>{fmtNum(c.compressor_h, 0)}</b>
          <i style={{ height: `calc((100% - 56px) * ${c.compressor_h / top})` }} />
          <span>{c.season}</span>
          {c.note && <small className="ht-sbar-note">zlom</small>}
        </div>
      ))}
    </div>
  );
}

/** Heating curve (tank target vs. outdoor) with the current point. */
export function CurveChart({
  points,
  now,
  compact = false,
  markTarget = null,
}: {
  points: Array<[number, number]>;
  now: { x: number; y: number } | null;
  /** Shorter plot for the landscape dashboard column. */
  compact?: boolean;
  /** Horizontal guide at the equithermal target tank temp (°C). */
  markTarget?: number | null;
}) {
  const plotH = compact ? 72 : 220;
  const sorted = points.slice().sort((a, b) => a[0] - b[0]);
  const xs = niceTicks(
    Math.min(-15, ...sorted.map((p) => p[0])),
    Math.max(15, ...sorted.map((p) => p[0])),
    4,
  );
  const ys = niceTicks(
    Math.min(...sorted.map((p) => p[1])) - 2,
    Math.max(...sorted.map((p) => p[1])) + 2,
    3,
  );
  const X0 = xs[0]!;
  const X1 = xs[xs.length - 1]!;
  const Y0 = ys[0]!;
  const Y1 = ys[ys.length - 1]!;
  const fx = (v: number) => ((v - X0) / (X1 - X0)) * VW;
  const fy = (v: number) => 100 - ((v - Y0) / (Y1 - Y0)) * 100;
  const targetY = markTarget !== null ? fy(markTarget) : null;
  return (
    <div
      className={`ht-chart-wrap${compact ? ' ht-chart-compact' : ''}`}
      data-testid="heating-curve"
    >
      <div className="ht-chart" style={{ height: plotH }}>
        <svg viewBox={`0 0 ${VW} 100`} preserveAspectRatio="none" aria-hidden="true">
          {ys.map((t) => (
            <line key={t} x1={0} x2={VW} y1={fy(t)} y2={fy(t)} className="ht-grid" />
          ))}
          <path
            d={sorted.map((p, i) => `${i ? 'L' : 'M'}${fx(p[0])} ${fy(p[1])}`).join(' ')}
            className="ht-line ht-curve-line"
          />
          {targetY !== null && (
            <line
              x1={0}
              x2={VW}
              y1={targetY}
              y2={targetY}
              className="ht-curve-target"
              data-testid="heating-curve-target"
            />
          )}
          {now && <line x1={fx(now.x)} x2={fx(now.x)} y1={0} y2={100} className="ht-now-line" />}
        </svg>
        {!compact &&
          sorted.map((p) => (
            <i
              key={p[0]}
              className="ht-dot ht-curve-pt"
              style={{ left: pct((fx(p[0]) / VW) * 100), top: pct(fy(p[1])) }}
            />
          ))}
        {now && !compact && (
          <span
            className="ht-curve-now"
            data-testid="heating-curve-now"
            style={{ left: pct((fx(now.x) / VW) * 100), top: pct(fy(now.y)) }}
          >
            <i />
            <b>
              teď {fmtNum(now.x)}° → {fmtNum(now.y, 0)}°
            </b>
          </span>
        )}
        {!compact &&
          ys.map((t) => (
            <span key={t} className="ht-ylab" style={{ top: pct(fy(t)) }}>
              {fmtNum(t, 0)}°
            </span>
          ))}
      </div>
      {!compact && (
        <div className="ht-xlabs" aria-hidden="true">
          {xs.map((t) => (
            <span key={t} style={{ left: pct((fx(t) / VW) * 100) }}>
              {fmtNum(t, 0)}&nbsp;°C
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** 24 h ribbon per schedule with the current time. */
export function ScheduleRibbon({
  schedules,
  nowMin,
}: {
  schedules: HeatingSchedule[];
  nowMin: number;
}) {
  return (
    <ul className="ht-sched" data-testid="heating-schedules">
      {schedules.map((s) => (
        <li key={s.key} data-testid="heating-schedule">
          <span className="ht-sched-name">{s.label}</span>
          <span className="ht-sched-bar">
            {s.slots.map(([a, b]) => (
              <i
                key={a}
                style={{
                  left: pct((minutesOf(a) / 1440) * 100),
                  width: pct(((minutesOf(b) - minutesOf(a)) / 1440) * 100),
                }}
              />
            ))}
            <em style={{ left: pct((nowMin / 1440) * 100) }} />
          </span>
          <span className="ht-sched-slots">{s.slots.map(([a, b]) => `${a}–${b}`).join(', ')}</span>
        </li>
      ))}
      <li className="ht-sched-axis" aria-hidden="true">
        <span />
        <span className="ht-sched-bar">
          {[0, 6, 12, 18, 24].map((h) => (
            <b key={h} style={{ left: pct((h / 24) * 100) }}>
              {h}
            </b>
          ))}
        </span>
        <span />
      </li>
    </ul>
  );
}

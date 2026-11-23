import { Sparkline } from '@homebrain/ui';
import { fmtPct, seriesMax, smoothSeries, type BarTone } from '../format.js';
import type { Level, SeriesKey, ServerHistory } from '../types.js';

export const worst = (levels: Level[]): Level =>
  levels.includes('critical')
    ? 'critical'
    : levels.includes('warning')
      ? 'warning'
      : levels.length
        ? 'ok'
        : 'unknown';

export function Bar({ value, tone, label }: { value: number; tone: BarTone; label?: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <span
      className="srv-bar"
      data-tone={tone}
      role={label ? 'meter' : undefined}
      aria-label={label}
      aria-valuenow={label ? Math.round(pct) : undefined}
      aria-valuemin={label ? 0 : undefined}
      aria-valuemax={label ? 100 : undefined}
    >
      <i style={{ width: `${pct}%` }} />
    </span>
  );
}

/** Scroll + focus the evidence card for the hero verdict (same pattern as Síť „Co s tím“). */
export function revealCard(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView?.({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
  el.focus({ preventScroll: true });
}

export function Trend({
  history,
  series,
  format,
  current,
  testId = `server-trend-${series}`,
}: {
  history: ServerHistory | null;
  series: SeriesKey;
  format: (v: number) => string;
  current?: number | null;
  testId?: string;
}) {
  const raw = (history?.series[series] ?? []).map(([, v]) => v);
  const values = smoothSeries(raw);
  const peak = seriesMax(raw, current);
  if (!history) return <span className="srv-trend" data-empty="" aria-hidden="true" />;
  if (values.length < 2)
    return (
      <span className="srv-trend" data-empty="">
        <small>Historie zatím není</small>
      </span>
    );
  return (
    <span className="srv-trend" data-testid={testId}>
      <Sparkline values={values} width={240} height={44} area />
      <small>
        <span>24 h</span>
        <span>max {peak == null ? '–' : format(peak)}</span>
      </small>
    </span>
  );
}

/**
 * Percentage chart on a fixed 0–100 % scale (a 2 % guest must not look like a full one),
 * light 50/100 % gridlines and a marker at the live value.
 */
export function PctTrend({
  history,
  series,
  current,
  tone,
  testId,
}: {
  history: ServerHistory | null;
  series: SeriesKey;
  current?: number | null;
  tone?: BarTone;
  testId: string;
}) {
  const raw = (history?.series[series] ?? []).map(([, v]) => v);
  const values = smoothSeries(raw);
  const peak = seriesMax(raw, current);
  if (!history) return <span className="srv-trend" data-empty="" aria-hidden="true" />;
  if (values.length < 2)
    return (
      <span className="srv-trend" data-empty="">
        <small>Historie zatím není</small>
      </span>
    );
  const w = 240;
  const h = 64;
  const y = (v: number) => h - (Math.max(0, Math.min(100, v)) / 100) * h;
  const x = (i: number) => (i * w) / (values.length - 1);
  const line = values.map((v, i) => `${x(i)},${y(v)}`).join(' ');
  const last = current ?? values[values.length - 1]!;
  return (
    <span className="srv-trend srv-pct-trend" data-testid={testId} data-tone={tone}>
      <span className="srv-pct-plot">
        <svg
          viewBox={`0 0 ${w} ${h}`}
          preserveAspectRatio="none"
          aria-hidden="true"
          focusable="false"
        >
          <line className="srv-grid" x1="0" x2={w} y1={y(100)} y2={y(100)} />
          <line className="srv-grid" x1="0" x2={w} y1={y(50)} y2={y(50)} />
          <polygon points={`0,${h} ${line} ${w},${h}`} fill="currentColor" opacity=".12" />
          <polyline
            points={line}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <i className="srv-pct-dot" style={{ top: `${(y(last) / h) * 100}%` }} />
        <small className="srv-pct-axis" aria-hidden="true">
          <span>100</span>
          <span>50</span>
        </small>
      </span>
      <small>
        <span>24 h</span>
        <span>
          teď <b data-testid={`${testId}-now`}>{fmtPct(last)}</b> · max {fmtPct(peak)}
        </span>
      </small>
    </span>
  );
}

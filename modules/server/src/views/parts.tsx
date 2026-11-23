import { Sparkline } from '@homebrain/ui';
import { seriesMax, smoothSeries, type BarTone } from '../format.js';
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

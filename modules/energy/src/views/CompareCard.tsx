import { useState, type ReactNode } from 'react';
import { EmptyState, SegmentedControl } from '@homebrain/ui';
import {
  COMPARE_SERIES,
  barScale,
  compareDelta,
  deltaTone,
  formatCompareValue,
  formatDelta,
  monthName,
  partialRangeLabel,
  ytdRangeLabel,
  type Comparison,
  type ComparePeriod,
  type CompareSeries,
  type CompareSeriesKey,
} from '../compare.js';

const PERIOD_OPTIONS: ReadonlyArray<readonly [ComparePeriod, string]> = [
  ['month', 'Měsíc'],
  ['ytd', 'Od ledna'],
];

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function Tile(props: {
  label: string;
  value: number | null;
  /** The current value this tile's baseline (`value`) is compared against. */
  against?: number | null;
  seriesKey: CompareSeriesKey;
  missing?: string;
  testId: string;
  main?: boolean;
  sub?: string | null;
}) {
  const delta = props.against === undefined ? null : compareDelta(props.against, props.value);
  const tone = deltaTone(props.seriesKey, delta);
  const noData = props.value === null;
  return (
    <div
      className={`en-cmp-tile${props.main ? ' en-cmp-tile--main' : ''}`}
      data-testid={props.testId}
    >
      <span className="en-cmp-lbl">{props.label}</span>
      {noData && props.missing ? (
        <span className="en-cmp-missing" data-testid="energy-compare-missing">
          {props.missing}
        </span>
      ) : (
        <strong className="en-cmp-v">{formatCompareValue(props.value, props.seriesKey)}</strong>
      )}
      {delta && formatDelta(delta) ? (
        <span className="en-cmp-delta" data-tone={tone} data-testid={`${props.testId}-delta`}>
          <b>{formatDelta(delta)}</b>
          <span>
            {delta.diff > 0 ? '+' : delta.diff < 0 ? '\u2212' : ''}
            {formatCompareValue(Math.abs(delta.diff), props.seriesKey)}
          </span>
        </span>
      ) : (
        props.sub && <span className="en-cmp-sub">{props.sub}</span>
      )}
    </div>
  );
}

function MonthChart({
  series,
  meta,
  year,
  month,
  partialLabel,
}: {
  series: CompareSeries;
  meta: (typeof COMPARE_SERIES)[number];
  year: number;
  month: number;
  partialLabel: string | null;
}) {
  const { this_year: thisYear, last_year: lastYear } = series.monthly;
  const max = barScale([thisYear, lastYear]) * 1.08;
  const noLastYear = lastYear.every((v) => v === null);
  return (
    <div className="en-cmp-chart-wrap">
      <div
        className="en-cmp-chart"
        data-testid="energy-compare-chart"
        role="img"
        aria-label={`${meta.label} po měsících, ${year} proti ${year - 1}`}
      >
        {thisYear.map((value, i) => {
          const last = lastYear[i] ?? null;
          const current = i + 1 === month;
          return (
            <div
              key={i}
              className="en-cmp-col"
              data-current={current || undefined}
              data-testid="energy-compare-month"
            >
              <div className="en-cmp-pair">
                <span
                  className="en-cmp-bar en-cmp-bar--last"
                  data-empty={last === null || undefined}
                  style={{ height: last === null ? undefined : `${(last / max) * 100}%` }}
                  title={`${cap(monthName(i + 1))} ${year - 1}: ${last === null ? 'bez dat' : formatCompareValue(last, meta.key)}`}
                />
                <span
                  className="en-cmp-bar en-cmp-bar--this"
                  data-partial={current || undefined}
                  data-empty={value === null || undefined}
                  style={{
                    height: value === null ? undefined : `${(value / max) * 100}%`,
                    background: value === null ? undefined : meta.color,
                  }}
                  title={`${cap(monthName(i + 1))} ${year}: ${value === null ? 'bez dat' : formatCompareValue(value, meta.key)}`}
                />
              </div>
              <span className="en-axis-x">{monthName(i + 1, 'short')}</span>
            </div>
          );
        })}
      </div>
      <div className="en-legend">
        <span>
          <i style={{ background: meta.color }} />
          {year}
        </span>
        <span>
          <i className="en-cmp-legend-last" />
          {year - 1}
        </span>
        <span className="en-legend-note" data-testid="energy-compare-note">
          {noLastYear
            ? `Za rok ${year - 1} nemáme data.`
            : partialLabel
              ? `${cap(monthName(month))} zatím ${partialLabel}`
              : ''}
        </span>
      </div>
    </div>
  );
}

export function CompareCard({ comparison }: { comparison: Comparison }) {
  const [period, setPeriod] = useState<ComparePeriod>('month');
  const [picked, setPicked] = useState<CompareSeriesKey>('house');
  if (comparison.status === 'unconfigured') return null;
  const head = (extra?: ReactNode) => (
    <header className="en-cost-head">
      <h2 className="en-ct">Srovnání období</h2>
      {extra}
    </header>
  );
  if (comparison.status !== 'ok') {
    return (
      <section className="en-card en-cmp" aria-label="Srovnání období" data-testid="energy-compare">
        {head()}
        <EmptyState
          title={
            comparison.status === 'loading' ? 'Načítám statistiky…' : 'Srovnání není k dispozici'
          }
        >
          {comparison.status !== 'loading' &&
            'Srovnání počítá HomeBrain z dlouhodobých statistik Home Assistantu (recorder).'}
        </EmptyState>
      </section>
    );
  }
  const available = COMPARE_SERIES.filter((s) => comparison.series[s.key]);
  const meta = available.find((s) => s.key === picked) ?? available[0];
  if (!meta) return null;
  const series = comparison.series[meta.key]!;
  const { year, month } = comparison;
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const partialLabel = partialRangeLabel(comparison.partial, month);
  const ytdLabel = ytdRangeLabel(comparison.partial, month);
  const rangeLabel = period === 'month' ? partialLabel : ytdLabel;
  const missingLastYear = `nemáme data za ${year - 1}`;
  return (
    <section className="en-card en-cmp" aria-label="Srovnání období" data-testid="energy-compare">
      {head(
        <div className="en-cost-tools en-cmp-tools">
          {available.length > 1 && (
            <SegmentedControl
              label="Veličina"
              hideLabel
              size="sm"
              value={meta.key}
              options={available.map((s) => [s.key, s.short] as const)}
              onChange={setPicked}
            />
          )}
          <SegmentedControl
            label="Období"
            hideLabel
            size="sm"
            value={period}
            options={PERIOD_OPTIONS}
            onChange={setPeriod}
          />
        </div>,
      )}
      <div className="en-cmp-tiles" data-period={period}>
        {period === 'month' ? (
          <>
            <Tile
              main
              label={`${cap(monthName(month))} ${year}`}
              value={series.month.current}
              seriesKey={meta.key}
              testId="energy-compare-current"
              sub={partialLabel ? `${partialLabel} · rozpracovaný měsíc` : null}
              missing="zatím bez dat"
            />
            <Tile
              label={`Loni · ${monthName(month)} ${year - 1}`}
              value={series.month.last_year}
              against={series.month.current}
              seriesKey={meta.key}
              testId="energy-compare-last-year"
              missing={missingLastYear}
            />
            <Tile
              label={`Minulý měsíc · ${monthName(prevMonth)} ${prevYear}`}
              value={series.month.previous}
              against={series.month.current}
              seriesKey={meta.key}
              testId="energy-compare-previous"
              missing="nemáme data za minulý měsíc"
            />
          </>
        ) : (
          <>
            <Tile
              main
              label={`Rok ${year} od ledna`}
              value={series.ytd.current}
              seriesKey={meta.key}
              testId="energy-compare-current"
              sub={rangeLabel}
              missing="nemáme data od ledna"
            />
            <Tile
              label={`Loni ve stejném období · ${year - 1}`}
              value={series.ytd.last_year}
              against={series.ytd.current}
              seriesKey={meta.key}
              testId="energy-compare-last-year"
              missing={missingLastYear}
            />
          </>
        )}
      </div>
      {rangeLabel && (
        <p className="en-cmp-range" data-testid="energy-compare-range">
          Porovnáváme stejné dny a hodiny: {rangeLabel}
          {meta.key === 'cost' &&
            ' · náklady = odhad podle současného tarifu (VT/NT, stálé platby)'}
        </p>
      )}
      <MonthChart
        series={series}
        meta={meta}
        year={year}
        month={month}
        partialLabel={partialLabel}
      />
    </section>
  );
}

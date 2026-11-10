import { useMemo, useState, type ReactNode } from 'react';
import { EmptyState, SegmentedControl } from '@homebrain/ui';
import {
  COMPARE_SERIES,
  barScale,
  compareDelta,
  compareHeadline,
  deltaTone,
  formatCompareValue,
  formatDelta,
  monthName,
  niceTicks,
  partialRangeLabel,
  scopeLabel,
  ytdRangeLabel,
  type Comparison,
  type ComparePeriod,
  type CompareSeries,
  type CompareSeriesKey,
} from '../compare.js';
import {
  formatInvoiceMarkerDetail,
  invoiceMonthMarkerMap,
  type Invoice,
  type InvoiceMonthMarker,
} from '../invoices.js';

function ReceiptMarkerIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" data-hb-icon="" aria-hidden="true" focusable="false">
      <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z" />
      <path d="M14 8H8" />
      <path d="M16 12H8" />
      <path d="M14 16H8" />
    </svg>
  );
}

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
  /** Context value without a delta (e.g. the whole previous month). */
  context?: string | null;
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
      {props.context && (
        <span className="en-cmp-context" data-testid={`${props.testId}-context`}>
          {props.context}
        </span>
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
  invoiceMarkers,
}: {
  series: CompareSeries;
  meta: (typeof COMPARE_SERIES)[number];
  year: number;
  month: number;
  partialLabel: string | null;
  invoiceMarkers: Record<string, InvoiceMonthMarker>;
}) {
  const [active, setActive] = useState<number>(month - 1);
  const { this_year: thisYear, last_year: lastYear } = series.monthly;
  const ticks = niceTicks(barScale([thisYear, lastYear]));
  const top = ticks[ticks.length - 1]!;
  const pct = (v: number) => `${(v / top) * 100}%`;
  const noLastYear = lastYear.every((v) => v === null);
  const unit = meta.key === 'cost' ? 'Kč' : 'kWh';
  const tick = (v: number) =>
    new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 0 }).format(v).replace(/\s/g, '\u00a0');
  // Bars of the running month = the tile values (like-for-like); other months = whole months.
  const values = (i: number) => {
    const current = i + 1 === month;
    return {
      current,
      thisValue: i + 1 > month ? null : (thisYear[i] ?? null),
      lastValue: current ? series.month.last_year : (lastYear[i] ?? null),
      fullLast: current ? (lastYear[i] ?? null) : null,
    };
  };
  const monthKey = (i: number) => `${year}-${String(i + 1).padStart(2, '0')}`;
  const readout = (i: number) => {
    const v = values(i);
    const name = cap(monthName(i + 1));
    const parts = [
      `${name} ${year}: ${formatCompareValue(v.thisValue, meta.key)}`,
      `${year - 1}${v.current ? ' stejné dny' : ''}: ${formatCompareValue(v.lastValue, meta.key)}`,
    ];
    if (v.current && v.fullLast !== null)
      parts.push(
        `celý ${monthName(i + 1)} ${year - 1}: ${formatCompareValue(v.fullLast, meta.key)}`,
      );
    return parts.join(' · ');
  };
  const invoiceDetail = (i: number) => {
    const marker = invoiceMarkers[monthKey(i)];
    if (!marker) return null;
    const v = values(i);
    const measured =
      meta.key === 'cost' ? v.thisValue : meta.key === 'house' || meta.key === 'import' ? v.thisValue : null;
    return formatInvoiceMarkerDetail(marker, measured, meta.key, (val) =>
      formatCompareValue(val, meta.key),
    );
  };
  const hasAnyMarker = thisYear.some((_, i) => invoiceMarkers[monthKey(i)]);
  return (
    <div className={`en-cmp-chart-wrap${hasAnyMarker ? ' en-cmp-chart-wrap--invoiced' : ''}`}>
      <p className="en-cmp-readout" data-testid="energy-compare-readout" aria-live="polite">
        {readout(active)}
      </p>
      {invoiceDetail(active) && (
        <p className="en-cmp-inv-detail" data-testid="energy-compare-invoice-detail">
          {invoiceDetail(active)}
        </p>
      )}
      <div className="en-cmp-plot">
        <div className="en-cmp-yaxis" data-testid="energy-compare-yaxis" aria-hidden="true">
          <span className="en-cmp-unit">{unit}</span>
          {ticks.map((t) => (
            <span
              key={t}
              className="en-cmp-tick"
              data-testid="energy-compare-tick"
              style={{ bottom: pct(t) }}
            >
              {tick(t)}
            </span>
          ))}
        </div>
        <div
          className="en-cmp-chart"
          data-testid="energy-compare-chart"
          role="group"
          aria-label={`${meta.label} po měsících, ${year} proti ${year - 1}`}
        >
          <div className="en-cmp-grid" aria-hidden="true">
            {ticks.map((t) => (
              <i key={t} style={{ bottom: pct(t) }} />
            ))}
          </div>
          {thisYear.map((_, i) => {
            const { current, thisValue, lastValue, fullLast } = values(i);
            const invoiced = invoiceMarkers[monthKey(i)];
            const invLine = invoiceDetail(i);
            return (
              <button
                type="button"
                key={i}
                className="en-cmp-col"
                data-current={current || undefined}
                data-active={i === active || undefined}
                data-invoiced={invoiced ? 'true' : undefined}
                data-testid="energy-compare-month"
                aria-pressed={i === active}
                aria-label={invLine ? `${readout(i)}. ${invLine}` : readout(i)}
                onClick={() => setActive(i)}
              >
                {invoiced && (
                  <span className="en-cmp-inv-marker" data-testid="energy-compare-invoice-marker">
                    <ReceiptMarkerIcon />
                  </span>
                )}
                <span className="en-cmp-pair">
                  <span className="en-cmp-slot">
                    {fullLast !== null && (
                      <span
                        className="en-cmp-ghost"
                        data-value={fullLast}
                        style={{ height: pct(fullLast) }}
                      />
                    )}
                    {lastValue !== null && (
                      <span
                        className="en-cmp-bar en-cmp-bar--last"
                        data-value={lastValue}
                        style={{ height: pct(lastValue) }}
                      />
                    )}
                  </span>
                  <span className="en-cmp-slot">
                    {thisValue !== null && (
                      <span
                        className="en-cmp-bar en-cmp-bar--this"
                        data-value={thisValue}
                        style={{ height: pct(thisValue), background: meta.color }}
                      />
                    )}
                  </span>
                </span>
                <span className="en-axis-x">{monthName(i + 1, 'short')}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="en-legend" data-testid="energy-compare-legend">
        <span>
          <i className="en-cmp-sw en-cmp-legend-last" />
          {year - 1}
          {partialLabel && !noLastYear ? ` (${monthName(month, 'short')}: stejné dny)` : ''}
        </span>
        <span>
          <i className="en-cmp-sw" style={{ background: meta.color }} />
          {year}
          {partialLabel ? ` (${monthName(month, 'short')}: rozpracovaný)` : ''}
        </span>
        {partialLabel && !noLastYear && (
          <span>
            <i className="en-cmp-sw en-cmp-legend-ghost" />
            obrys = celý {monthName(month)} {year - 1}
          </span>
        )}
        {noLastYear && (
          <span className="en-legend-note" data-testid="energy-compare-note">
            Za rok {year - 1} nemáme data.
          </span>
        )}
        {hasAnyMarker && (
          <span data-testid="energy-compare-legend-invoice">
            <i className="en-cmp-legend-receipt" aria-hidden="true">
              <ReceiptMarkerIcon />
            </i>
            Fakturováno
          </span>
        )}
      </div>
    </div>
  );
}

export function CompareCard({
  comparison,
  invoices = null,
}: {
  comparison: Comparison;
  invoices?: Invoice[] | null;
}) {
  const invoiceMarkers = useMemo(
    () => (invoices?.length ? invoiceMonthMarkerMap(invoices) : {}),
    [invoices],
  );
  const [period, setPeriod] = useState<ComparePeriod>('month');
  const [picked, setPicked] = useState<CompareSeriesKey>('house');
  if (comparison.status === 'unconfigured') return null;
  const head = (extra?: ReactNode, headline?: ReactNode, tone?: string) => (
    <header className="en-cost-head">
      <div className="en-cmp-title">
        <h2 className="en-ct">Srovnání období</h2>
        {headline && (
          <p className="en-cmp-headline" data-tone={tone} data-testid="energy-compare-headline">
            {headline}
          </p>
        )}
      </div>
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
  const yoy =
    period === 'month'
      ? compareDelta(series.month.current, series.month.last_year)
      : compareDelta(series.ytd.current, series.ytd.last_year);
  const scope = scopeLabel(comparison.partial, month, period);
  const headlineText = compareHeadline(meta.short, yoy, null);
  const headline = headlineText && (
    <>
      {headlineText}
      {scope && (
        <>
          {' '}
          <span className="en-cmp-scope">za {scope}</span>
        </>
      )}
    </>
  );
  const prevFull =
    month === 1
      ? (series.monthly.last_year[11] ?? null)
      : (series.monthly.this_year[prevMonth - 1] ?? null);
  const lastYearFull = series.monthly.last_year.every((v) => v !== null)
    ? series.monthly.last_year.reduce<number>((a, v) => a + (v ?? 0), 0)
    : null;
  const fmt = (v: number | null) => formatCompareValue(v, meta.key);
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
        headline,
        deltaTone(meta.key, yoy),
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
              label={`Loni · ${partialRangeLabel(comparison.partial, month, year - 1) ?? `${monthName(month)} ${year - 1}`}`}
              value={series.month.last_year}
              against={series.month.current}
              seriesKey={meta.key}
              testId="energy-compare-last-year"
              missing={missingLastYear}
              context={
                partialLabel && series.monthly.last_year[month - 1] != null
                  ? `celý ${monthName(month)} ${year - 1}: ${fmt(series.monthly.last_year[month - 1]!)}`
                  : null
              }
            />
            <Tile
              label={`Minulý měsíc · ${partialRangeLabel(comparison.partial, prevMonth, prevYear === year ? undefined : prevYear) ?? `${monthName(prevMonth)} ${prevYear}`}`}
              value={series.month.previous}
              against={series.month.current}
              seriesKey={meta.key}
              testId="energy-compare-previous"
              missing="nemáme data za minulý měsíc"
              context={
                prevFull !== null
                  ? `celý ${monthName(prevMonth)} ${prevYear}: ${fmt(prevFull)}`
                  : null
              }
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
              sub={ytdLabel}
              missing="nemáme data od ledna"
            />
            <Tile
              label={`Loni · ${ytdRangeLabel(comparison.partial, month, year - 1) ?? year - 1}`}
              value={series.ytd.last_year}
              against={series.ytd.current}
              seriesKey={meta.key}
              testId="energy-compare-last-year"
              missing={missingLastYear}
              context={lastYearFull !== null ? `celý rok ${year - 1}: ${fmt(lastYearFull)}` : null}
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
        invoiceMarkers={invoiceMarkers}
      />
    </section>
  );
}

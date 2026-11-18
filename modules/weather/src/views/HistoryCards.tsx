import { useMemo, useState } from 'react';
import type { KeyboardEvent, PointerEvent as RPointerEvent, ReactNode } from 'react';
import { Skeleton } from '@homebrain/ui';
import type { HistoryDay, WeatherHistory, WeatherSnapshot } from '../contract.js';
import { Card, cap, nf } from './parts.js';
import { WX_TZ, pragueDate } from './sky.js';
import {
  DELTA_NEUTRAL,
  DRY_DAY_MM,
  GUST_STRONG_MS,
  MSL_JUMP_HPA,
  RAIN_DAY_MM,
  alertCallout,
  delta,
  dryStreak,
  hasRainBar,
  longestDry,
  niceCeil,
  records,
  recordsOf,
  streakCallout,
  tempTicks,
  windowStats,
  yesterdayToday,
  type Delta,
  type RecordKey,
  type RecordValue,
  type Records,
} from './history.js';

export type HistoryState =
  | { kind: 'loading' }
  | { kind: 'ready'; data: WeatherHistory }
  | { kind: 'error'; message: string };

/** cs-CZ dates with non-breaking spaces („31. 10.“ never splits across lines). */
const dayFmt = (opts: Intl.DateTimeFormatOptions) => {
  const f = new Intl.DateTimeFormat('cs-CZ', { timeZone: WX_TZ, ...opts });
  return { format: (d: Date) => f.format(d).replace(/ /g, '\u00a0') };
};
const dShort = dayFmt({ day: 'numeric', month: 'numeric' });
const dWeek = dayFmt({ weekday: 'short' });
const dWeekLong = dayFmt({ weekday: 'short', day: 'numeric', month: 'numeric' });
const dMonth = dayFmt({ month: 'long' });
const dMonthShort = dayFmt({ month: 'short' });
const dFull = dayFmt({ day: 'numeric', month: 'numeric', year: 'numeric' });
const at = (date: string) => new Date(`${date}T12:00:00Z`);
const dayLabel = (date: string) => dShort.format(at(date));
/** Capitalise only (``cap`` also drops a trailing dot, which a date like „30. 10.“ needs). */
const upper = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Czech plural for “den”. */
const daysCs = (n: number) => (n === 1 ? 'den' : n >= 2 && n <= 4 ? 'dny' : 'dní');

function statusText(h: WeatherHistory): string | null {
  if (h.status === 'unconfigured')
    return 'Historie potřebuje navázané senzory stanice (teplota, denní srážky) s dlouhodobými statistikami v HA.';
  if (h.status === 'unsupported')
    return 'V Home Assistantu neběží recorder, historie není dostupná.';
  if (h.days.length === 0) return 'Stanice zatím nemá žádné uložené statistiky.';
  return null;
}

function HistoryPending({ state }: { state: Exclude<HistoryState, { kind: 'ready' }> }) {
  if (state.kind === 'loading')
    return <Skeleton variant="card" lines={2} label="Načítám historii…" />;
  return <p className="wx-empty">Historii se nepodařilo načíst: {state.message}</p>;
}

// ---------- Včera a dnes ----------
const NBSP = ' ';
const dTime = dayFmt({ hour: '2-digit', minute: '2-digit' });
/** Missing value: an en dash with an explanation – never confused with a measured 0,0. */
function Missing() {
  return (
    <span className="wx-yt-gap" title="chybí data" aria-label="chybí data">
      –
    </span>
  );
}
/** Value + unit in a fixed-width slot, so decimals line up down the column. */
function Num({ v, unit, digits = 1 }: { v: number; unit: string; digits?: number }) {
  return (
    <>
      {nf(v, digits)}
      <small className="wx-yt-u">{unit}</small>
    </>
  );
}
/** Highlighted value: ⚠ + weight + warning colour (never colour alone). */
function Alert({ why, children }: { why: string; children: ReactNode }) {
  return (
    <span className="wx-yt-hi" title={why}>
      <span aria-hidden="true">⚠{NBSP}</span>
      <span className="wx-sr">{why}: </span>
      {children}
    </span>
  );
}
function rowValue(v: number | null, unit: string, digits = 1, alert: string | null = null) {
  if (v == null) return <Missing />;
  const num = <Num v={v} unit={unit} digits={digits} />;
  return alert ? <Alert why={alert}>{num}</Alert> : num;
}

function DeltaCell({
  dl,
  unit,
  digits = 1,
  alert = null,
}: {
  dl: Delta;
  unit: string;
  digits?: number;
  alert?: string | null;
}) {
  // no per-cell „zatím“: the Dnes header already says the whole column is so far
  if (dl.kind === 'missing') return <Missing />;
  if (dl.kind === 'same')
    return (
      <span
        className="wx-yt-d is-same"
        title={`rozdíl ${nf(dl.v, digits)} ${unit} – bráno jako beze změny`}
      >
        ≈{NBSP}stejně
      </span>
    );
  const word = dl.kind === 'up' ? 'víc' : 'míň';
  const body = (
    <span
      className={`wx-yt-d is-${dl.kind}`}
      aria-label={`o ${nf(dl.v, digits)} ${unit} ${word} než včera`}
    >
      {dl.kind === 'up' ? '↑' : '↓'}
      {NBSP}
      <Num v={dl.v} unit={unit} digits={digits} />
    </span>
  );
  return alert ? <Alert why={alert}>{body}</Alert> : body;
}

export function YesterdayTodayCard({ hist, d }: { hist: HistoryState; d: WeatherSnapshot }) {
  const today = pragueDate(Date.parse(d.generated_at));
  if (hist.kind !== 'ready' || statusText(hist.data))
    return (
      <Card title="Včera a dnes" className="wx-yt" testId="weather-yt">
        {hist.kind === 'ready' ? (
          <p className="wx-empty">{statusText(hist.data)}</p>
        ) : (
          <HistoryPending state={hist} />
        )}
      </Card>
    );
  const days = hist.data.days;
  const { yesterday: y, today: t, yesterdayDate } = yesterdayToday(days, d, today);
  const streak = dryStreak(days, t?.rain ?? null);
  const until = dTime.format(new Date(Date.parse(d.station.updated_at ?? d.generated_at)));
  const gustAlert = (v: number | null | undefined) =>
    v != null && v >= GUST_STRONG_MS ? `silný náraz (≥ ${GUST_STRONG_MS} m/s)` : null;
  const mslDl = delta(t?.msl_mean ?? null, y?.msl_mean ?? null, 'msl');
  const mslAlert =
    mslDl.kind !== 'missing' && Math.abs(mslDl.v) >= MSL_JUMP_HPA
      ? `velký rozdíl průměrného tlaku (≥ ${MSL_JUMP_HPA} hPa)`
      : null;
  const rows: { key: string; label: string; y: ReactNode; t: ReactNode; dl: ReactNode }[] = [
    {
      key: 't_max',
      label: 'Max. teplota',
      y: rowValue(y?.t_max ?? null, '°C'),
      t: rowValue(t?.t_max ?? null, '°C'),
      dl: <DeltaCell dl={delta(t?.t_max ?? null, y?.t_max ?? null, 't')} unit="°C" />,
    },
    {
      key: 't_min',
      label: 'Min. teplota',
      y: rowValue(y?.t_min ?? null, '°C'),
      t: rowValue(t?.t_min ?? null, '°C'),
      dl: <DeltaCell dl={delta(t?.t_min ?? null, y?.t_min ?? null, 't')} unit="°C" />,
    },
    {
      key: 'rain',
      label: 'Srážky',
      y: rowValue(y?.rain ?? null, 'mm'),
      t: rowValue(t?.rain ?? null, 'mm'),
      dl: <DeltaCell dl={delta(t?.rain ?? null, y?.rain ?? null, 'rain')} unit="mm" />,
    },
    {
      key: 'gust',
      label: 'Nejsilnější náraz',
      y: rowValue(y?.gust_max ?? null, 'm/s', 1, gustAlert(y?.gust_max)),
      t: rowValue(t?.gust_max ?? null, 'm/s', 1, gustAlert(t?.gust_max)),
      dl: <DeltaCell dl={delta(t?.gust_max ?? null, y?.gust_max ?? null, 'gust')} unit="m/s" />,
    },
    {
      key: 'msl',
      label: 'Průměrný tlak',
      y: rowValue(y?.msl_mean ?? null, 'hPa', 0),
      t: rowValue(t?.msl_mean ?? null, 'hPa', 0),
      dl: <DeltaCell dl={mslDl} unit="hPa" digits={0} alert={mslAlert} />,
    },
  ];
  const yGaps = y && y.gaps.length > 0;
  // „– = chybí data“ only when a dash is on the card (a missing value, so also its Δ)
  const anyMissing = (['t_max', 't_min', 'rain', 'gust_max', 'msl_mean'] as const).some(
    (k) => y?.[k] == null || t?.[k] == null,
  );
  // a ⚠ pressure change / gust is more important than the rain streak
  const alertText = alertCallout(mslDl, t?.gust_max ?? null, y?.gust_max ?? null);
  const callout =
    alertText ??
    streakCallout(streak, t?.rain ?? null, y?.rain ?? null, (date) => dWeekLong.format(at(date)));
  return (
    <Card title="Včera a dnes" sub="vlastní stanice" className="wx-yt" testId="weather-yt">
      <table className="wx-yt-t">
        <thead>
          <tr>
            <th scope="col">
              <span className="wx-sr">Veličina</span>
            </th>
            <th scope="col">
              Včera
              {yesterdayDate && (
                <span className="wx-yt-hd">{dWeekLong.format(at(yesterdayDate))}</span>
              )}
            </th>
            <th scope="col" data-testid="weather-yt-today-head">
              Dnes <span className="wx-yt-prov">zatím</span>
              {/* one line where it fits; on a phone it breaks only between date and time */}
              <span className="wx-yt-hd wx-yt-hd--now">
                <span>{dWeekLong.format(at(today))}</span>{' '}
                <span>
                  do{NBSP}
                  {until}
                </span>
              </span>
            </th>
            <th scope="col">
              <span aria-hidden="true">Δ</span>
              <span className="wx-sr">Rozdíl proti včerejšku</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} data-testid={`weather-yt-${r.key}`}>
              <th scope="row">{r.label}</th>
              <td>{r.y}</td>
              <td className="wx-yt-today">{r.t}</td>
              <td className="wx-yt-dc">{r.dl}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {callout && (
        <p
          className={`wx-info ${alertText ? 'wx-info--warn wx-yt-alert' : ''}`}
          data-testid={alertText ? 'weather-yt-alert' : 'weather-dry-streak'}
        >
          {alertText ? (
            // hanging indent: the ⚠ stands alone, wrapped lines align with the text
            <>
              <span className="wx-yt-alert-ic" aria-hidden="true">
                ⚠
              </span>
              <b>
                <span className="wx-sr">Pozor: </span>
                {alertText.replace(/^⚠ /, '')}
              </b>
            </>
          ) : (
            <b>{callout}</b>
          )}
        </p>
      )}
      <p className="wx-foot wx-yt-foot" data-testid="weather-yt-foot">
        <span>Δ = dnes zatím proti celému včerejšku</span>
        <span>
          ≈{NBSP}stejně{NBSP}={NBSP}rozdíl menší než {nf(DELTA_NEUTRAL.t)}
          {NBSP}°C, {nf(DELTA_NEUTRAL.rain)}
          {NBSP}mm, {nf(DELTA_NEUTRAL.gust, 0)}
          {NBSP}m/s, {nf(DELTA_NEUTRAL.msl, 0)}
          {NBSP}hPa
        </span>
        <span>
          <span className="wx-yt-hi">⚠</span> a <span className="wx-yt-hi">oranžová</span>
          {NBSP}={NBSP}náraz ≥{NBSP}
          {GUST_STRONG_MS}
          {NBSP}m/s nebo rozdíl průměrného tlaku ≥{NBSP}
          {MSL_JUMP_HPA}
          {NBSP}hPa
        </span>
        {(anyMissing || yGaps) && (
          <span data-testid="weather-yt-missing">
            {anyMissing ? `–${NBSP}=${NBSP}chybí data` : ''}
            {anyMissing && yGaps ? `${NBSP}· ` : ''}
            {yGaps ? 'včera chybí část hodinových dat' : ''}
          </span>
        )}
      </p>
    </Card>
  );
}

// ---------- Historie ----------
const RANGES = [7, 30, 365] as const;
type Range = (typeof RANGES)[number];
const RECORD_ROWS: { key: RecordKey; label: string; unit: string }[] = [
  { key: 't_max', label: 'Nejteplejší den', unit: '°C' },
  { key: 't_min', label: 'Nejchladnější den', unit: '°C' },
  { key: 'rain', label: 'Nejvíc srážek', unit: 'mm' },
  { key: 'gust_max', label: 'Nejsilnější náraz', unit: 'm/s' },
];

/**
 * X-axis labels on real data days: anchored on the last complete day (today's partial column is
 * drawn lighter and never labelled, so the last label is the last full day of data).
 */
function xLabels(days: HistoryDay[]): { i: number; text: string }[] {
  const n = days.length;
  const last = n - (days[n - 1]?.partial ? 2 : 1);
  const at0 = days.map((d, i) => ({ i, d })).filter(({ i }) => i <= last);
  if (n <= 10) return at0.map(({ i, d }) => ({ i, text: cap(dWeek.format(at(d.date))) }));
  if (n <= 45)
    return at0
      .filter(({ i }) => (last - i) % 7 === 0)
      .map(({ i, d }) => ({ i, text: dayLabel(d.date) }));
  return at0
    .filter(({ d, i }) => d.date.endsWith('-01') || i === 0)
    .filter(({ i }, k, all) => k === 0 || i - all[k - 1]!.i > 20)
    .map(({ i, d }) => ({ i, text: cap(dMonthShort.format(at(d.date))).replace('.', '') }));
}

// Chart geometry (viewBox units): temperature panel on top, rain in its own lower panel.
const VB_H = 260;
const T_TOP = 6;
const T_BOT = 140;
const R_TOP = 168;
const R_BOT = 256;
const pctY = (y: number) => `${(y / VB_H) * 100}%`;
/** Trace rain (> 0 mm) still gets a visible bar: 2,4 units ≈ 2 px at the 220–230 px chart height. */
const RAIN_MIN_H = 2.4;

function HistoryChart({
  days,
  sel,
  onSel,
  detail,
}: {
  days: HistoryDay[];
  sel: number;
  onSel: (i: number) => void;
  detail: string;
}) {
  const n = days.length;
  const temps = days.flatMap((d) => [d.t_min, d.t_max]).filter((v): v is number => v != null);
  const tLo = temps.length ? Math.min(...temps) : 0;
  const tHi = temps.length ? Math.max(...temps) : 10;
  const ticks = tempTicks(tLo, tHi);
  const lo = Math.min(tLo, ...ticks) - 0.5;
  const hi = Math.max(tHi, ...ticks) + 0.5;
  // the rain scale always covers the wettest day of the window
  const rainMax = niceCeil(Math.max(1, ...days.map((d) => d.rain ?? 0)));
  const rainTicks = [0, rainMax / 2, rainMax];
  const step = 1000 / Math.max(n, 1);
  const w = Math.max(1.5, step * (n > 60 ? 0.8 : 0.56));
  const xc = (i: number) => (i + 0.5) * step;
  const yT = (v: number) => T_TOP + ((hi - v) / (hi - lo || 1)) * (T_BOT - T_TOP);
  const yR = (v: number) => R_BOT - (v / rainMax) * (R_BOT - R_TOP);
  const pick = (e: RPointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.floor(((e.clientX - r.left) / (r.width || 1)) * n);
    onSel(Math.max(0, Math.min(n - 1, i)));
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const next =
      e.key === 'ArrowLeft'
        ? sel - 1
        : e.key === 'ArrowRight'
          ? sel + 1
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? n - 1
              : null;
    if (next == null) return;
    e.preventDefault();
    onSel(Math.max(0, Math.min(n - 1, next)));
  };
  const showZero = lo < 0 && hi > 0 && !ticks.includes(0);
  const colLeft = (i: number) => `${(i / n) * 100}%`;
  const colW = `${100 / n}%`;
  const labels = xLabels(days);
  const selPos = n ? ((sel + 0.5) / n) * 100 : 0;
  const rainDigits = rainMax < 5 ? 1 : 0;
  return (
    <div
      className="wx-hist-chart"
      role="slider"
      tabIndex={0}
      aria-label={`Den v grafu teploty a srážek za ${n} ${daysCs(n)} (táhněte nebo šipkami)`}
      aria-valuemin={1}
      aria-valuemax={n}
      aria-valuenow={sel + 1}
      aria-valuetext={detail}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture?.(e.pointerId);
        pick(e);
      }}
      onPointerMove={(e) => (e.buttons > 0 || e.pointerType === 'mouse' ? pick(e) : undefined)}
      onKeyDown={onKey}
      data-testid="weather-history-chart"
    >
      {/* overlays live in the plot box (overflow hidden): highlight and gaps never spill past it */}
      <div
        className="wx-hist-plot"
        style={{ top: pctY(T_TOP), bottom: pctY(VB_H - R_BOT) }}
        data-testid="weather-history-plot"
      >
        {sel >= 0 && sel < n && (
          <div
            className="wx-hist-selcol"
            style={{ left: colLeft(sel), width: colW }}
            data-testid="weather-history-cursor"
          />
        )}
        {/* gaps as HTML overlays: the same hatch as the legend swatch, undistorted by the SVG scale */}
        {days.map((d, i) => {
          const gapT = d.t_max == null || d.t_min == null;
          const gapR = d.rain == null;
          if (!gapT && !gapR) return null;
          const top = gapT ? T_TOP : R_TOP;
          const bot = gapR ? R_BOT : T_BOT;
          const plotH = R_BOT - T_TOP;
          return (
            <div
              key={d.date}
              className="wx-hist-gap"
              style={{
                left: colLeft(i),
                width: colW,
                top: `${((top - T_TOP) / plotH) * 100}%`,
                height: `${((bot - top) / plotH) * 100}%`,
              }}
              data-testid="weather-history-gap"
            />
          );
        })}
      </div>
      <svg viewBox={`0 0 1000 ${VB_H}`} preserveAspectRatio="none" aria-hidden="true">
        {ticks.map((v) => (
          <line
            key={v}
            x1="0"
            x2="1000"
            y1={yT(v)}
            y2={yT(v)}
            className={v === 0 ? 'wx-hist-zero' : 'wx-hist-grid'}
          />
        ))}
        {showZero && <line x1="0" x2="1000" y1={yT(0)} y2={yT(0)} className="wx-hist-zero" />}
        {rainTicks.slice(1).map((v) => (
          <line key={v} x1="0" x2="1000" y1={yR(v)} y2={yR(v)} className="wx-hist-grid" />
        ))}
        <line x1="0" x2="1000" y1={R_BOT} y2={R_BOT} className="wx-hist-base" />
        {/* the mm scale is an axis on the plot's right edge: its labels sit outside it */}
        <line x1="1000" x2="1000" y1={R_TOP} y2={R_BOT} className="wx-hist-base" />
        {days.map((d, i) => (
          <g key={d.date} className={d.partial ? 'is-partial' : undefined}>
            {d.t_min != null && d.t_max != null && (
              <rect
                x={xc(i) - w / 2}
                y={yT(d.t_max)}
                width={w}
                height={Math.max(2, yT(d.t_min) - yT(d.t_max))}
                rx={Math.min(w / 2, 4)}
                className="wx-hist-t"
              />
            )}
            {hasRainBar(d.rain) && (
              <rect
                x={xc(i) - w / 2}
                y={Math.min(yR(d.rain), R_BOT - RAIN_MIN_H)}
                width={w}
                height={Math.max(RAIN_MIN_H, R_BOT - yR(d.rain))}
                className="wx-hist-r"
              />
            )}
          </g>
        ))}
      </svg>
      <span className="wx-hist-yt">°C</span>
      {ticks.map((v) => (
        <span key={v} className="wx-hist-yl" style={{ top: pctY(yT(v)) }}>
          {nf(v, 0)}
        </span>
      ))}
      <span className="wx-hist-yt wx-hist-yt--r" style={{ top: pctY(R_TOP) }}>
        mm
      </span>
      {rainTicks.map((v) => (
        <span key={v} className="wx-hist-yl wx-hist-yl--r" style={{ top: pctY(yR(v)) }}>
          {nf(v, v === 0 ? 0 : rainDigits)}
        </span>
      ))}
      <div className="wx-hist-x" aria-hidden="true">
        {labels
          .filter((l) => Math.abs(((l.i + 0.5) / n) * 100 - selPos) > (n <= 10 ? 0 : 9))
          .map((l) => (
            <span key={l.i} style={{ left: `${((l.i + 0.5) / n) * 100}%` }}>
              {l.text}
            </span>
          ))}
        {days[sel] && (
          <span
            className="is-sel"
            style={{ left: `${selPos}%` }}
            data-testid="weather-history-seltick"
          >
            {n <= 10 ? cap(dWeek.format(at(days[sel].date))) : dayLabel(days[sel].date)}
          </span>
        )}
      </div>
    </div>
  );
}

const NB = ' ';
function dayDetail(d: HistoryDay): string {
  const parts = [
    `${upper(dWeekLong.format(at(d.date)))}${d.partial ? ' (zatím)' : ''}`,
    d.t_min != null && d.t_max != null
      ? `${nf(d.t_min)} až ${nf(d.t_max)}${NB}°C`
      : 'teplota chybí',
    d.rain != null ? `${nf(d.rain)}${NB}mm` : 'srážky chybí',
  ];
  if (d.gust_max != null) parts.push(`náraz ${nf(d.gust_max)}${NB}m/s`);
  if (!d.partial && d.gaps.length > 0) parts.push('neúplná data');
  return parts.join(`${NB}· `);
}

/**
 * Date column of a record: today's incomplete day is „dnes (zatím)“; in the 365-day view (two
 * calendar years) with the year.
 */
const recordDate = (v: RecordValue, withYear: boolean) =>
  v.partial ? `dnes${NB}(zatím)` : withYear ? dFull.format(at(v.date)) : dayLabel(v.date);

const RECORD_WORD: Record<RecordKey, string> = {
  t_max: 'nejteplejší den',
  t_min: 'nejchladnější den',
  rain: 'nejvíc srážek',
  gust_max: 'nejsilnější náraz',
};

function DayReadout({ d, marks }: { d: HistoryDay; marks: { scope: string; rec: Records }[] }) {
  const badges = marks.flatMap(({ scope, rec }) =>
    (Object.keys(RECORD_WORD) as RecordKey[])
      .filter((k) => rec.values[k]?.date === d.date)
      // a record of today's incomplete day is provisional
      .map((k) => `${d.partial ? 'zatím ' : ''}${RECORD_WORD[k]} ${scope}`),
  );
  return (
    <div className="wx-hist-detail" data-testid="weather-history-detail" aria-live="polite">
      <b>
        {upper(dWeekLong.format(at(d.date)))}
        {d.partial ? ' (zatím)' : ''}
      </b>
      <span>
        {d.t_min != null && d.t_max != null
          ? `${nf(d.t_min)} až ${nf(d.t_max)}${NB}°C`
          : 'teplota chybí'}
      </span>
      <span className="wx-rain">{d.rain != null ? `${nf(d.rain)}${NB}mm` : 'srážky chybí'}</span>
      {d.gust_max != null && (
        <span className={`wx-hist-g ${d.gust_max >= GUST_STRONG_MS ? 'wx-warnc' : ''}`}>
          náraz {nf(d.gust_max)}
          {NB}m/s
        </span>
      )}
      {!d.partial && d.gaps.length > 0 && <span className="wx-yt-gap">neúplná data</span>}
      {badges.length > 0 && (
        <span className="wx-hist-badges" data-testid="weather-history-record-badge">
          {badges.map((b) => (
            <em key={b}>rekord: {b}</em>
          ))}
        </span>
      )}
    </div>
  );
}

/**
 * The exact days of the window, e.g. „2. 10. – 31. 10. 2026 (dnes zatím)“: the window is the last
 * `range` days including today, so a record from the day before its first day is outside it.
 */
function windowRange(days: HistoryDay[]): string {
  const first = days[0]!;
  const last = days[days.length - 1]!;
  const sameYear = first.date.slice(0, 4) === last.date.slice(0, 4);
  const from = sameYear ? dayLabel(first.date) : dFull.format(at(first.date));
  return `${from} – ${dFull.format(at(last.date))}${last.partial ? ' (dnes zatím)' : ''}`;
}

const firstOfScope = (scope: string) => (scope.length === 4 ? `${scope}-01-01` : `${scope}-01`);

export function HistoryCard({ hist, now }: { hist: HistoryState; now: number }) {
  const [range, setRange] = useState<Range>(7);
  const [selRaw, setSel] = useState<number | null>(null);
  const all = useMemo(() => (hist.kind === 'ready' ? hist.data.days : []), [hist]);
  const days = useMemo(() => all.slice(-range), [all, range]);
  const stats = useMemo(() => windowStats(all, range), [all, range]);
  const today = pragueDate(now);
  // second records column: this month next to the 7-day window, this year next to 30/365 days
  const scope = today.slice(0, range === 7 ? 7 : 4);
  // cheap (≤ 400 days); the React compiler memoises it
  const recWin = recordsOf(days);
  const recScope = records(all, scope);
  const lastFull = days.length - (days[days.length - 1]?.partial ? 2 : 1);
  const sel = selRaw != null && selRaw < days.length ? selRaw : Math.max(0, lastFull);
  const message = hist.kind === 'ready' ? statusText(hist.data) : null;
  const firstDate = all[0]?.date;
  const scopeName = scope.length === 4 ? scope : dMonth.format(at(`${scope}-15`));
  // only call it a month / year record if the station data covers that month / year from its start
  const scopeCut = firstDate && firstDate > firstOfScope(scope) ? firstDate : null;
  const scopeTitle = `Rekordy – ${scopeName}${scopeCut ? ` (data od ${dayLabel(scopeCut)})` : ''}`;
  const scopeWord = scope.length === 4 ? `roku ${scope}` : `měsíce`;
  const selDay = days[sel];
  const dry = longestDry(days);
  return (
    <Card
      title="Historie"
      sub={`vlastní stanice${NB}· denní hodnoty`}
      className="wx-hist"
      testId="weather-history"
    >
      <div
        className="wx-seg wx-seg--touch wx-seg--strong wx-seg--full"
        role="tablist"
        aria-label="Období"
      >
        {RANGES.map((r) => (
          <button
            key={r}
            role="tab"
            aria-selected={r === range}
            className={r === range ? 'on' : ''}
            onClick={() => {
              setRange(r);
              setSel(null);
            }}
          >
            {r}
            {NB}dní
          </button>
        ))}
      </div>
      {hist.kind !== 'ready' ? (
        <HistoryPending state={hist} />
      ) : message ? (
        <p className="wx-empty">{message}</p>
      ) : (
        <>
          {days.length > 0 && (
            <p className="wx-hist-range" data-testid="weather-history-range">
              {windowRange(days)}
            </p>
          )}
          <dl className="wx-hist-sum" data-testid="weather-history-summary">
            <div>
              <dt>Srážky</dt>
              <dd>
                {nf(stats.rain)}
                <small>{NB}mm</small>
              </dd>
            </div>
            <div>
              <dt>Deštivé dny</dt>
              <dd data-testid="weather-history-raindays">
                {stats.rainDays}
                <small>
                  {NB}z{NB}
                  {stats.rainKnownDays}
                </small>
              </dd>
            </div>
            <div>
              <dt>Prům. teplota</dt>
              <dd>
                {nf(stats.t_mean)}
                <small>{NB}°C</small>
              </dd>
            </div>
            <div>
              <dt>Nejdelší sucho</dt>
              <dd data-testid="weather-history-dry">
                {dry ? dry.days : '–'}
                {dry && (
                  <small>
                    {NB}
                    {daysCs(dry.days)}
                  </small>
                )}
              </dd>
            </div>
          </dl>
          <HistoryChart
            days={days}
            sel={sel}
            onSel={setSel}
            detail={selDay ? dayDetail(selDay) : ''}
          />
          <div className="wx-hist-key">
            <span>
              <i className="wx-sw wx-sw--hist-t" /> teplota min–max
            </span>
            <span>
              <i className="wx-sw wx-sw--rain" /> srážky za den
            </span>
            {days[days.length - 1]?.partial && (
              <span>
                <i className="wx-sw wx-sw--partial" /> tmavý obrys = dnes (zatím)
              </span>
            )}
            <span data-testid="weather-history-selkey">
              <i className="wx-sw wx-sw--sel" /> rámeček = vybraný den
            </span>
            {stats.gapDays > 0 && (
              <span data-testid="weather-history-gaps">
                <i className="wx-sw wx-sw--gap" /> chybí data ({stats.gapDays}
                {NB}
                {daysCs(stats.gapDays)})
              </span>
            )}
          </div>
          {selDay && (
            <DayReadout
              d={selDay}
              marks={[
                { scope: `za ${range} dní`, rec: recWin },
                ...(scopeCut ? [] : [{ scope: scopeWord, rec: recScope }]),
              ]}
            />
          )}
          <div className="wx-rec" data-testid="weather-records">
            {[
              { title: `Rekordy za ${range} dní`, rec: recWin },
              { title: scopeTitle, rec: recScope },
            ].map(({ title, rec }) => (
              <section key={title} className="wx-rec-col" aria-label={title}>
                <h3>{title}</h3>
                <ul>
                  {RECORD_ROWS.map((r) => {
                    const v = rec.values[r.key];
                    return (
                      <li key={r.key}>
                        <span>{r.label}</span>
                        <b>
                          {v ? nf(v.v) : '–'}
                          {v && (
                            <small>
                              {NB}
                              {r.unit}
                            </small>
                          )}
                        </b>
                        <em className={v?.partial ? 'is-prov' : undefined}>
                          {v ? recordDate(v, range === 365) : ''}
                        </em>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
          <p className="wx-foot" data-testid="weather-history-foot">
            Jen vlastní stanice (dlouhodobé statistiky Home Assistantu)
            {firstDate && firstDate > `${today.slice(0, 4)}-01-01`
              ? `${NB}· data od ${dayLabel(firstDate)}`
              : ''}
            {NB}· chybějící hodiny se nedopočítávají
            <br />
            Deštivý den = aspoň {nf(RAIN_DAY_MM, 0)}
            {NB}mm srážek, slabě deštivý {nf(DRY_DAY_MM)} až &lt;{NB}
            {nf(RAIN_DAY_MM, 0)}
            {NB}mm, suchý pod {nf(DRY_DAY_MM)}
            {NB}mm.
            <br />
            Nejdelší sucho = nejvíc suchých dní po sobě v tomto období; dnešek a dny bez dat řadu
            přeruší.
          </p>
        </>
      )}
    </Card>
  );
}

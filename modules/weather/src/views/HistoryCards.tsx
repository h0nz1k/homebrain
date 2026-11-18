import { useId, useMemo, useState } from 'react';
import type { KeyboardEvent, PointerEvent as RPointerEvent, ReactNode } from 'react';
import { Skeleton } from '@homebrain/ui';
import type { HistoryDay, WeatherHistory, WeatherSnapshot } from '../contract.js';
import { Card, cap, nf } from './parts.js';
import { WX_TZ, pragueDate } from './sky.js';
import {
  DELTA_NEUTRAL,
  DRY_DAY_MM,
  GUST_STRONG_MS,
  RAIN_DAY_MM,
  delta,
  dryStreak,
  niceCeil,
  records,
  recordsOf,
  tempTicks,
  windowStats,
  yesterdayToday,
  type Delta,
  type RecordKey,
  type Records,
} from './history.js';

export type HistoryState =
  | { kind: 'loading' }
  | { kind: 'ready'; data: WeatherHistory }
  | { kind: 'error'; message: string };

const dayFmt = (opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('cs-CZ', { timeZone: WX_TZ, ...opts });
const dShort = dayFmt({ day: 'numeric', month: 'numeric' });
const dWeek = dayFmt({ weekday: 'short' });
const dWeekLong = dayFmt({ weekday: 'short', day: 'numeric', month: 'numeric' });
const dMonth = dayFmt({ month: 'long' });
const dMonthShort = dayFmt({ month: 'short' });
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
const NBSP = '\u00a0';
const dTime = dayFmt({ hour: '2-digit', minute: '2-digit' });
/** Missing value: an en dash with an explanation – never confused with a measured 0,0. */
function Missing() {
  return (
    <span className="wx-yt-gap" title="chybí data" aria-label="chybí data">
      –
    </span>
  );
}
function rowValue(v: number | null, unit: string, digits = 1, strong = false) {
  if (v == null) return <Missing />;
  return (
    <span
      className={strong ? 'wx-warnc' : undefined}
      title={strong ? `silný náraz (≥ ${GUST_STRONG_MS} m/s)` : undefined}
    >
      {nf(v, digits)}
      <small>
        {NBSP}
        {unit}
      </small>
    </span>
  );
}

function DeltaCell({ dl, unit, digits = 1 }: { dl: Delta; unit: string; digits?: number }) {
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
  return (
    <span
      className={`wx-yt-d is-${dl.kind}`}
      aria-label={`o ${nf(dl.v, digits)} ${unit} ${word} než včera`}
    >
      {dl.kind === 'up' ? '↑' : '↓'}
      {NBSP}
      {nf(dl.v, digits)}
      <small>
        {NBSP}
        {unit}
      </small>
    </span>
  );
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
  const strong = (v: number | null | undefined) => v != null && v >= GUST_STRONG_MS;
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
      y: rowValue(y?.gust_max ?? null, 'm/s', 1, strong(y?.gust_max)),
      t: rowValue(t?.gust_max ?? null, 'm/s', 1, strong(t?.gust_max)),
      dl: <DeltaCell dl={delta(t?.gust_max ?? null, y?.gust_max ?? null, 'gust')} unit="m/s" />,
    },
    {
      key: 'msl',
      label: 'Průměrný tlak',
      y: rowValue(y?.msl_mean ?? null, 'hPa', 0),
      t: rowValue(t?.msl_mean ?? null, 'hPa', 0),
      dl: (
        <DeltaCell
          dl={delta(t?.msl_mean ?? null, y?.msl_mean ?? null, 'msl')}
          unit="hPa"
          digits={0}
        />
      ),
    },
  ];
  const yGaps = y && y.gaps.length > 0;
  const past =
    streak.days > 0
      ? `${streak.exact ? '' : 'aspoň '}${streak.days}${NBSP}${daysCs(streak.days)} bez deště`
      : null;
  let streakText: ReactNode;
  if (t?.rain == null) streakText = <b>Dnešní srážky chybí</b>;
  else if (streak.todayWet)
    streakText = (
      <>
        <b>
          Dnes už napršelo {nf(t.rain)}
          {NBSP}mm
        </b>
        {past ? ` · předtím ${past}` : ''}
      </>
    );
  else
    streakText = (
      <>
        <b>Dnes zatím bez deště</b>
        {past
          ? ` · ${past}${streak.lastWet ? `, naposledy pršelo ${upper(dWeekLong.format(at(streak.lastWet)))}` : ''}`
          : y?.rain != null && y.rain >= DRY_DAY_MM
            ? ` · včera napršelo ${nf(y.rain)}${NBSP}mm`
            : ''}
      </>
    );
  return (
    <Card
      title="Včera a dnes"
      sub={yesterdayDate ? `včera = ${dWeekLong.format(at(yesterdayDate))}` : undefined}
      className="wx-yt"
      testId="weather-yt"
    >
      <table className="wx-yt-t">
        <thead>
          <tr>
            <th scope="col">
              <span className="wx-sr">Veličina</span>
            </th>
            <th scope="col">Včera</th>
            <th scope="col" data-testid="weather-yt-today-head">
              Dnes zatím{' '}
              <span className="wx-yt-until">
                (do{NBSP}
                {until})
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
              <td>{r.t}</td>
              <td className="wx-yt-dc">{r.dl}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="wx-info" data-testid="weather-dry-streak">
        {streakText}
      </p>
      <p className="wx-foot">
        Δ = dnes zatím proti celému včerejšku; rozdíl pod {nf(DELTA_NEUTRAL.t)}
        {NBSP}°C, {nf(DELTA_NEUTRAL.rain)}
        {NBSP}mm, {nf(DELTA_NEUTRAL.gust, 0)}
        {NBSP}m/s nebo {nf(DELTA_NEUTRAL.msl, 0)}
        {NBSP}hPa = ≈{NBSP}stejně · – = chybí data
        {yGaps ? ' · včera chybí část hodinových dat stanice' : ''}
      </p>
    </Card>
  );
}

// ---------- Historie ----------
const RANGES = [7, 30, 365] as const;
type Range = (typeof RANGES)[number];
const RECORD_ROWS: { key: RecordKey; label: string; unit: string }[] = [
  { key: 't_max', label: 'Nejtepleji', unit: '°C' },
  { key: 't_min', label: 'Nejchladněji', unit: '°C' },
  { key: 'rain', label: 'Nejvíc srážek', unit: 'mm' },
  { key: 'gust_max', label: 'Nejsilnější náraz', unit: 'm/s' },
];

function xLabels(days: HistoryDay[]): { i: number; text: string }[] {
  const n = days.length;
  if (n <= 10) return days.map((d, i) => ({ i, text: cap(dWeek.format(at(d.date))) }));
  if (n <= 45)
    return days
      .map((d, i) => ({ i, d }))
      .filter(({ i }) => (n - 1 - i) % 7 === 0)
      .map(({ i, d }) => ({ i, text: dayLabel(d.date) }));
  return days
    .map((d, i) => ({ i, d }))
    .filter(({ d, i }) => d.date.endsWith('-01') || i === 0)
    .filter(({ i }, k, all) => k === 0 || i - all[k - 1]!.i > 20)
    .map(({ i, d }) => ({ i, text: cap(dMonthShort.format(at(d.date))).replace('.', '') }));
}

// Chart geometry (viewBox units): temperature panel on top, rain in its own lower panel.
const VB_H = 250;
const T_TOP = 8;
const T_BOT = 150;
const R_TOP = 176;
const R_BOT = 246;
const pctY = (y: number) => `${(y / VB_H) * 100}%`;

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
  const hatch = `wxh${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const n = days.length;
  const temps = days.flatMap((d) => [d.t_min, d.t_max]).filter((v): v is number => v != null);
  const tLo = temps.length ? Math.min(...temps) : 0;
  const tHi = temps.length ? Math.max(...temps) : 10;
  const ticks = tempTicks(tLo, tHi);
  const lo = Math.min(tLo, ...ticks) - 0.5;
  const hi = Math.max(tHi, ...ticks) + 0.5;
  // the rain scale always covers the wettest day of the window
  const rainMax = niceCeil(Math.max(1, ...days.map((d) => d.rain ?? 0)));
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
      <svg viewBox={`0 0 1000 ${VB_H}`} preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <pattern
            id={hatch}
            width="8"
            height="8"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect width="8" height="8" className="wx-hist-gapbg" />
            <line x1="0" y1="0" x2="0" y2="8" className="wx-hist-hatch" />
          </pattern>
        </defs>
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
        <line x1="0" x2="1000" y1={R_TOP} y2={R_TOP} className="wx-hist-grid" />
        <line x1="0" x2="1000" y1={R_BOT} y2={R_BOT} className="wx-hist-base" />
        {days.map((d, i) => {
          const gapAll = d.t_max == null && d.rain == null;
          return (
            <g key={d.date} className={d.partial ? 'is-partial' : undefined}>
              {gapAll && (
                <rect
                  x={xc(i) - step / 2}
                  y={T_TOP}
                  width={step}
                  height={R_BOT - T_TOP}
                  fill={`url(#${hatch})`}
                  className="wx-hist-gap"
                  data-testid="weather-history-gap"
                />
              )}
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
              {d.rain != null && d.rain > 0 && (
                <rect
                  x={xc(i) - w / 2}
                  y={yR(d.rain)}
                  width={w}
                  height={R_BOT - yR(d.rain)}
                  className="wx-hist-r"
                />
              )}
              {d.rain == null && !gapAll && (
                <rect
                  x={xc(i) - step / 2}
                  y={R_TOP}
                  width={step}
                  height={R_BOT - R_TOP}
                  fill={`url(#${hatch})`}
                  className="wx-hist-gap"
                />
              )}
            </g>
          );
        })}
        {sel >= 0 && sel < n && (
          <g className="wx-hist-cur" data-testid="weather-history-cursor">
            <line x1={xc(sel)} x2={xc(sel)} y1="0" y2={VB_H} className="wx-hist-sel" />
            <rect
              x={xc(sel) - Math.max(w, 6) / 2 - 3}
              y={T_TOP - 4}
              width={Math.max(w, 6) + 6}
              height={R_BOT - T_TOP + 4}
              rx="4"
              className="wx-hist-selbox"
            />
          </g>
        )}
      </svg>
      {ticks.map((v) => (
        <span key={v} className="wx-hist-yl" style={{ top: pctY(yT(v)) }}>
          {nf(v, 0)}
          {' '}°C
        </span>
      ))}
      <span className="wx-hist-yl wx-hist-yl--r" style={{ top: pctY(R_TOP) }}>
        {nf(rainMax, rainMax < 5 ? 1 : 0)}
        {' '}mm
      </span>
      <span className="wx-hist-yl wx-hist-yl--r" style={{ top: pctY(R_BOT) }}>
        0{' '}mm
      </span>
      <div className="wx-hist-x" aria-hidden="true">
        {xLabels(days).map((l) => (
          <span key={l.i} style={{ left: `${(xc(l.i) / 1000) * 100}%` }}>
            {l.text}
          </span>
        ))}
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
  return parts.join(' · ');
}

const RECORD_WORD: Record<RecordKey, string> = {
  t_max: 'nejtepleji',
  t_min: 'nejchladněji',
  rain: 'nejvíc srážek',
  gust_max: 'nejsilnější náraz',
};

function DayReadout({ d, marks }: { d: HistoryDay; marks: { scope: string; rec: Records }[] }) {
  const badges = marks.flatMap(({ scope, rec }) =>
    (Object.keys(RECORD_WORD) as RecordKey[])
      .filter((k) => rec.values[k]?.date === d.date)
      .map((k) => `${RECORD_WORD[k]} ${scope}`),
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
  return (
    <Card
      title="Historie"
      sub="vlastní stanice · denní hodnoty"
      className="wx-hist"
      testId="weather-history"
      right={
        <div className="wx-seg wx-seg--touch" role="tablist" aria-label="Období">
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
              {r} dní
            </button>
          ))}
        </div>
      }
    >
      {hist.kind !== 'ready' ? (
        <HistoryPending state={hist} />
      ) : message ? (
        <p className="wx-empty">{message}</p>
      ) : (
        <>
          <dl className="wx-hist-sum" data-testid="weather-history-summary">
            <div>
              <dt>Srážky</dt>
              <dd>
                {nf(stats.rain)}
                <small>{NB}mm</small>
              </dd>
            </div>
            <div>
              <dt>
                Dny s deštěm{' '}
                <span className="wx-hist-thr">
                  ≥{NB}
                  {nf(RAIN_DAY_MM, 0)}
                  {NB}mm
                </span>
              </dt>
              <dd data-testid="weather-history-raindays">
                {stats.rainDays}
                <small>
                  {NB}z{NB}
                  {stats.rainKnownDays}
                </small>
              </dd>
            </div>
            <div>
              <dt>Průměr</dt>
              <dd>
                {nf(stats.t_mean)}
                <small>{NB}°C</small>
              </dd>
            </div>
            <div>
              <dt>Rozpětí</dt>
              <dd data-testid="weather-history-span">
                {nf(stats.t_min?.v)} až {nf(stats.t_max?.v)}
                <small>{NB}°C</small>
              </dd>
            </div>
          </dl>
          <HistoryChart
            days={days}
            sel={sel}
            onSel={setSel}
            detail={selDay ? dayDetail(selDay) : ''}
          />
          {selDay && (
            <DayReadout
              d={selDay}
              marks={[
                { scope: `za ${range} dní`, rec: recWin },
                ...(scopeCut ? [] : [{ scope: scopeWord, rec: recScope }]),
              ]}
            />
          )}
          <div className="wx-hist-key">
            <span>
              <i className="wx-sw wx-sw--hist-t" /> teplota min–max
            </span>
            <span>
              <i className="wx-sw wx-sw--rain" /> srážky za den
            </span>
            {stats.gapDays > 0 && (
              <span data-testid="weather-history-gaps">
                <i className="wx-sw wx-sw--gap" /> chybí data ({stats.gapDays}
                {NB}
                {daysCs(stats.gapDays)})
              </span>
            )}
          </div>
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
                        <em>{v ? dayLabel(v.date) : ''}</em>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
          <p className="wx-foot">
            Jen vlastní stanice (dlouhodobé statistiky Home Assistantu)
            {firstDate && firstDate > `${today.slice(0, 4)}-01-01`
              ? ` · data od ${dayLabel(firstDate)}`
              : ''}{' '}
            · chybějící hodiny se nedopočítávají · den s deštěm = aspoň {nf(RAIN_DAY_MM, 0)}
            {NB}mm
          </p>
        </>
      )}
    </Card>
  );
}

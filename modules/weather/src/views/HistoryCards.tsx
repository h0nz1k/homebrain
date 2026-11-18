import { useMemo, useState } from 'react';
import type { PointerEvent as RPointerEvent, ReactNode } from 'react';
import { Skeleton } from '@homebrain/ui';
import type { HistoryDay, WeatherHistory, WeatherSnapshot } from '../contract.js';
import { Card, cap, nf } from './parts.js';
import { WX_TZ, pragueDate } from './sky.js';
import {
  dryStreak,
  records,
  windowStats,
  yesterdayToday,
  type DaySummary,
  type RecordKey,
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
function rowValue(v: number | null, unit: string, gap: boolean, digits = 1) {
  if (v == null) return <span className="wx-yt-gap">{gap ? 'chybí data' : '—'}</span>;
  return (
    <>
      {nf(v, digits)}
      <small> {unit}</small>
    </>
  );
}

function diffText(today: number | null, yesterday: number | null): string | null {
  if (today == null || yesterday == null) return null;
  const delta = today - yesterday;
  if (Math.abs(delta) < 0.5) return 'jako včera';
  return delta > 0 ? `o ${nf(delta)}° víc než včera` : `o ${nf(-delta)}° míň než včera`;
}

export function YesterdayTodayCard({ hist, d }: { hist: HistoryState; d: WeatherSnapshot }) {
  const today = pragueDate(Date.parse(d.generated_at));
  if (hist.kind !== 'ready' || statusText(hist.data))
    return (
      <Card title="Včera a dnes" sub="naměřeno stanicí" className="wx-yt" testId="weather-yt">
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
  const gap = (s: DaySummary | null, v: string) => Boolean(s?.gaps.includes(v));
  const rows: {
    label: string;
    y: ReactNode;
    t: ReactNode;
    note?: string | null;
  }[] = [
    {
      label: 'Nejvíc',
      y: rowValue(y?.t_max ?? null, '°C', gap(y, 't2m')),
      t: rowValue(t?.t_max ?? null, '°C', gap(t, 't2m')),
      note: diffText(t?.t_max ?? null, y?.t_max ?? null),
    },
    {
      label: 'Nejméně',
      y: rowValue(y?.t_min ?? null, '°C', gap(y, 't2m')),
      t: rowValue(t?.t_min ?? null, '°C', gap(t, 't2m')),
    },
    {
      label: 'Srážky',
      y: rowValue(y?.rain ?? null, 'mm', gap(y, 'rain')),
      t: rowValue(t?.rain ?? null, 'mm', gap(t, 'rain')),
    },
    {
      label: 'Nejsilnější náraz',
      y: rowValue(y?.gust_max ?? null, 'm/s', gap(y, 'gust')),
      t: rowValue(t?.gust_max ?? null, 'm/s', gap(t, 'gust')),
    },
    {
      label: 'Tlak průměr',
      y: rowValue(y?.msl_mean ?? null, 'hPa', gap(y, 'msl'), 0),
      t: rowValue(t?.msl_mean ?? null, 'hPa', gap(t, 'msl'), 0),
    },
  ];
  const yGaps = y && y.gaps.length > 0;
  let streakText: ReactNode;
  if (streak.todayWet && streak.days > 0)
    streakText = (
      <>
        Dnes už napršelo {nf(t?.rain)} mm – předtím{' '}
        <b>{`${streak.days} ${daysCs(streak.days)} bez deště`}</b>
      </>
    );
  else if (streak.days > 0)
    streakText = (
      <>
        <b>
          {streak.exact ? '' : 'Aspoň '}
          {`${streak.days} ${daysCs(streak.days)} bez deště`}
        </b>
        {streak.lastWet
          ? ` · naposledy pršelo ${upper(dWeekLong.format(at(streak.lastWet)))}`
          : ' · starší data chybí'}
      </>
    );
  else if (y && y.rain != null && y.rain >= 0.2)
    streakText = (
      <>
        Včera napršelo <b>{nf(y.rain)} mm</b>
      </>
    );
  else streakText = 'Počet dní bez deště nelze určit (chybí data).';
  return (
    <Card
      title="Včera a dnes"
      sub={`naměřeno stanicí${yesterdayDate ? ` · včera ${dayLabel(yesterdayDate)}` : ''}`}
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
            <th scope="col">Dnes zatím</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <th scope="row">{r.label}</th>
              <td>{r.y}</td>
              <td>
                {r.t}
                {r.note && <span className="wx-yt-note">{r.note}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="wx-info" data-testid="weather-dry-streak">
        {streakText}
      </p>
      {yGaps && (
        <p className="wx-foot">
          Včera chybí část hodinových dat stanice – hodnoty jsou jen z dostupných hodin.
        </p>
      )}
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

function HistoryChart({
  days,
  sel,
  onSel,
}: {
  days: HistoryDay[];
  sel: number;
  onSel: (i: number) => void;
}) {
  const n = days.length;
  const temps = days.flatMap((d) => [d.t_min, d.t_max]).filter((v): v is number => v != null);
  const lo = temps.length ? Math.floor(Math.min(...temps)) - 1 : 0;
  const hi = temps.length ? Math.ceil(Math.max(...temps)) + 1 : 10;
  const rainMax = Math.max(5, ...days.map((d) => d.rain ?? 0));
  const step = 1000 / Math.max(n, 1);
  const w = Math.max(1, step * (n > 60 ? 0.8 : 0.56));
  const xc = (i: number) => (i + 0.5) * step;
  // temperature band 0–130, rain bars 150–220 (own baseline)
  const yT = (v: number) => 8 + ((hi - v) / (hi - lo || 1)) * 122;
  const yR = (v: number) => 220 - (v / rainMax) * 66;
  const onPoint = (e: RPointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.floor(((e.clientX - r.left) / (r.width || 1)) * n);
    onSel(Math.max(0, Math.min(n - 1, i)));
  };
  const zero = lo < 0 && hi > 0 ? yT(0) : null;
  return (
    <div
      className="wx-hist-chart"
      role="img"
      aria-label={`Teplota min–max a srážky za ${n} ${daysCs(n)}`}
      onPointerDown={onPoint}
      onPointerMove={(e) => (e.buttons > 0 || e.pointerType === 'mouse' ? onPoint(e) : undefined)}
      data-testid="weather-history-chart"
    >
      <svg viewBox="0 0 1000 224" preserveAspectRatio="none" aria-hidden="true">
        {zero != null && <line x1="0" x2="1000" y1={zero} y2={zero} className="wx-hist-zero" />}
        <line x1="0" x2="1000" y1="220" y2="220" className="wx-hist-base" />
        {days.map((d, i) => {
          const gapAll = d.t_max == null && d.rain == null;
          return (
            <g
              key={d.date}
              className={`${d.partial ? 'is-partial' : ''} ${i === sel ? 'is-sel' : ''}`}
            >
              {gapAll ? (
                <rect
                  x={xc(i) - step / 2}
                  y="4"
                  width={step}
                  height="216"
                  className="wx-hist-gap"
                  data-testid="weather-history-gap"
                />
              ) : null}
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
                  height={220 - yR(d.rain)}
                  className="wx-hist-r"
                />
              )}
              {d.rain == null && !gapAll && (
                <rect x={xc(i) - w / 2} y="214" width={w} height="6" className="wx-hist-rgap" />
              )}
            </g>
          );
        })}
        {sel >= 0 && sel < n && (
          <line x1={xc(sel)} x2={xc(sel)} y1="0" y2="224" className="wx-hist-sel" />
        )}
      </svg>
      <span className="wx-hist-yl" style={{ top: `${(yT(hi - 1) / 224) * 100}%` }}>
        {nf(hi - 1, 0)}°
      </span>
      <span className="wx-hist-yl" style={{ top: `${(yT(lo + 1) / 224) * 100}%` }}>
        {nf(lo + 1, 0)}°
      </span>
      <span className="wx-hist-yl wx-hist-yl--r" style={{ top: `${(yR(rainMax) / 224) * 100}%` }}>
        {nf(rainMax, 0)} mm
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

function dayDetail(d: HistoryDay): string {
  const parts = [
    `${upper(dWeekLong.format(at(d.date)))}${d.partial ? ' (zatím)' : ''}`,
    d.t_min != null && d.t_max != null ? `${nf(d.t_min)} až ${nf(d.t_max)} °C` : 'teplota chybí',
    d.rain != null ? `${nf(d.rain)} mm` : 'srážky chybí',
  ];
  if (d.gust_max != null) parts.push(`náraz ${nf(d.gust_max)} m/s`);
  if (!d.partial && d.gaps.length > 0) parts.push('neúplná data');
  return parts.join(' · ');
}

export function HistoryCard({ hist, now }: { hist: HistoryState; now: number }) {
  const [range, setRange] = useState<Range>(7);
  const [selRaw, setSel] = useState<number | null>(null);
  const all = useMemo(() => (hist.kind === 'ready' ? hist.data.days : []), [hist]);
  const days = useMemo(() => all.slice(-range), [all, range]);
  const stats = useMemo(() => windowStats(all, range), [all, range]);
  const today = pragueDate(now);
  const month = today.slice(0, 7);
  const year = today.slice(0, 4);
  const recMonth = useMemo(() => records(all, month), [all, month]);
  const recYear = useMemo(() => records(all, year), [all, year]);
  const lastFull = days.length - (days[days.length - 1]?.partial ? 2 : 1);
  const sel = selRaw != null && selRaw < days.length ? selRaw : Math.max(0, lastFull);
  const message = hist.kind === 'ready' ? statusText(hist.data) : null;
  const firstDate = all[0]?.date;
  return (
    <Card
      title="Historie"
      sub="stanice · denní hodnoty"
      className="wx-hist"
      testId="weather-history"
      right={
        <div className="wx-seg" role="tablist" aria-label="Období">
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
                {nf(stats.rain)} <small>mm</small>
              </dd>
            </div>
            <div>
              <dt>Dny s deštěm</dt>
              <dd>
                {stats.rainDays} <small>z {stats.days}</small>
              </dd>
            </div>
            <div>
              <dt>Průměr</dt>
              <dd>
                {nf(stats.t_mean)} <small>°C</small>
              </dd>
            </div>
            <div>
              <dt>Rozpětí</dt>
              <dd>
                {nf(stats.t_min?.v, 0)} až {nf(stats.t_max?.v, 0)} <small>°C</small>
              </dd>
            </div>
          </dl>
          <HistoryChart days={days} sel={sel} onSel={setSel} />
          {days[sel] && (
            <p className="wx-hist-detail" data-testid="weather-history-detail" aria-live="polite">
              {dayDetail(days[sel]!)}
            </p>
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
                <i className="wx-sw wx-sw--gap" /> chybí data ({stats.gapDays}{' '}
                {daysCs(stats.gapDays)})
              </span>
            )}
          </div>
          <div className="wx-rec" data-testid="weather-records">
            {[
              { title: `Rekordy – ${dMonth.format(at(`${month}-15`))}`, rec: recMonth },
              { title: `Rekordy – ${year}`, rec: recYear },
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
                          {v ? nf(v.v) : '—'}
                          {v && <small> {r.unit}</small>}
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
            Jen vlastní stanice (dlouhodobé statistiky HA)
            {firstDate && firstDate > `${year}-01-01` ? ` · data od ${dayLabel(firstDate)}` : ''} ·
            chybějící hodiny se nedopočítávají
          </p>
        </>
      )}
    </Card>
  );
}

import { useEffect, useId, useMemo, useState } from 'react';
import type { CSSProperties, PointerEvent as RPointerEvent, ReactNode } from 'react';
import type { ModuleViewProps } from '@homebrain/ha-client';
import { ErrorState, Pill, Skeleton } from '@homebrain/ui';
import type { Tone } from '@homebrain/ui';
import { getWeatherAdapter, type WeatherState } from '../adapter.js';
import type {
  BlendPoint,
  Condition,
  DailyPoint,
  SourceMeta,
  SourceStatus,
  WeatherSnapshot,
} from '../contract.js';
import { weatherStyles } from './weatherStyles.js';
import { chartTimeMarks } from './chartTime.js';
import { RadarCard } from './RadarCard.js';
import { bandPath, smoothPath, type Pt } from './curve.js';
import {
  conditionSentence,
  dailyWithToday,
  dayRange,
  pragueDate,
  skyScene,
  sunElevationDeg,
} from './sky.js';

// ---------- formatting ----------
const nf = (v: number | null | undefined, d = 1) =>
  v == null || !Number.isFinite(v)
    ? '—'
    : // normalise −0 (e.g. −0,3 rounded to 0 digits) so axes never show “-0°”
      (Number(v.toFixed(d)) === 0 ? 0 : v)
        .toLocaleString('cs-CZ', {
          minimumFractionDigits: d,
          maximumFractionDigits: d,
        })
        // cs-CZ ICU vrací spojovník; typograficky správné je znaménko minus (U+2212)
        .replace(/^-/, '−');
const signed = (v: number, d = 1) => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${nf(Math.abs(v), d)}`;
const hm = new Intl.DateTimeFormat('cs-CZ', { hour: 'numeric', minute: '2-digit' });
const hourOnly = new Intl.DateTimeFormat('cs-CZ', { hour: 'numeric' });
const weekday = new Intl.DateTimeFormat('cs-CZ', { weekday: 'short' });
const dayMonth = new Intl.DateTimeFormat('cs-CZ', { day: 'numeric', month: 'numeric' });
const fullDate = new Intl.DateTimeFormat('cs-CZ', {
  weekday: 'short',
  day: 'numeric',
  month: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(/\.$/, '');
const COMPASS = ['S', 'SV', 'V', 'JV', 'J', 'JZ', 'Z', 'SZ'];
const compass = (deg: number | null | undefined) =>
  deg == null ? '' : COMPASS[Math.round((((deg % 360) + 360) % 360) / 45) % 8]!;
function age(seconds: number | null | undefined): string {
  if (seconds == null) return '—';
  if (seconds < 90) return `před ${Math.max(1, Math.round(seconds))} s`;
  if (seconds < 5400) return `před ${Math.round(seconds / 60)} min`;
  return `před ${Math.round(seconds / 3600)} h`;
}
const CONDITION_CS: Record<Condition, string> = {
  clear: 'Jasno',
  partly: 'Polojasno',
  cloudy: 'Oblačno',
  overcast: 'Zataženo',
  rain: 'Déšť',
  heavy_rain: 'Silný déšť',
  snow: 'Sněžení',
  thunder: 'Bouřky',
  fog: 'Mlha',
  unknown: 'Neznámo',
};
const CONFIDENCE_CS = { high: 'Vysoká', medium: 'Střední', low: 'Nízká' } as const;
const CONFIDENCE_TONE: Record<string, Tone> = { high: 'ok', medium: 'accent', low: 'warn' };
const STATUS_TONE: Record<SourceStatus, Tone> = {
  fresh: 'ok',
  partial: 'warn',
  stale: 'warn',
  unavailable: 'crit',
  unbound: 'neutral',
};
const MODEL_COLOR: Record<string, string> = {
  blend: 'var(--hb-ac)',
  chmi_aladin_cz_1km: 'var(--hb-model-aladin)',
  icon_d2: 'var(--hb-model-icon-d2)',
  ecmwf_ifs: 'var(--hb-model-ecmwf)',
  gfs_seamless: 'var(--hb-model-gfs)',
  metno: 'var(--hb-model-met-no)',
  geosphere_arome_austria: 'var(--wx-m-arome)',
  icon_eu: 'var(--wx-m-icon-eu)',
  ukmo_seamless: 'var(--wx-m-ukmo)',
  ecmwf_aifs025_single: 'var(--wx-m-aifs)',
};
/** Night = sun below the horizon (central Czechia), not a fixed 7–18 h window. */
const isNight = (iso: string) => sunElevationDeg(new Date(iso)) < -0.8;

// ---------- small pieces ----------
function CondIcon({
  c,
  night = false,
  label,
  hero = false,
}: {
  c: Condition;
  night?: boolean;
  label?: string;
  hero?: boolean;
}) {
  const sun = c === 'clear' || c === 'partly';
  const cloud = c !== 'clear';
  return (
    <svg
      className={`wx-ic wx-ic--${c}${hero ? ' wx-ic--hero' : ''}`}
      data-hb-icon={hero ? 'lg' : ''}
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {sun && !night && (
        <g className="wx-ic-sun">
          <circle cx={c === 'clear' ? 16 : 12} cy={c === 'clear' ? 16 : 11} r="5" />
          {c === 'clear' && (
            <path d="M16 3v3m0 20v3M3 16h3m20 0h3M7 7l2 2m14 14 2 2M7 25l2-2M23 9l2-2" />
          )}
        </g>
      )}
      {sun && night && <path className="wx-ic-moon" d="M21 19a8 8 0 0 1-9-11 9 9 0 1 0 9 11Z" />}
      {cloud && c !== 'fog' && (
        <path className="wx-ic-cloud" d="M10 23a5 5 0 1 1 1-10 7 7 0 0 1 13 2 4 4 0 0 1 0 8Z" />
      )}
      {c === 'fog' && <path className="wx-ic-cloud" d="M6 13h20M4 18h24M8 23h16" />}
      {(c === 'rain' || c === 'heavy_rain') && (
        <path
          className="wx-ic-rain"
          d={c === 'rain' ? 'M13 26l-1 3m7-3-1 3' : 'M11 26l-1 3m5-3-1 3m5-3-1 3m5-3-1 3'}
        />
      )}
      {c === 'snow' && <path className="wx-ic-rain" d="M12 27h.01M16 29h.01M20 27h.01" />}
      {c === 'thunder' && <path className="wx-ic-bolt" d="m17 22-3 5h4l-2 4" />}
    </svg>
  );
}
function Card({
  id,
  title,
  sub,
  right,
  className = '',
  children,
  testId,
}: {
  id?: string;
  title: string;
  sub?: ReactNode;
  right?: ReactNode;
  className?: string;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <section id={id} className={`wx-card ${className}`} aria-label={title} data-testid={testId}>
      <header className="wx-ch">
        <div className="wx-ch-l">
          <h2 className="wx-ct">{title}</h2>
          {sub && <span className="wx-cs">{sub}</span>}
        </div>
        {right && <div className="wx-ch-r">{right}</div>}
      </header>
      {children}
    </section>
  );
}
function Cell({
  label,
  value,
  unit,
  sub,
}: {
  label: string;
  value: string;
  unit?: string;
  sub?: ReactNode;
}) {
  return (
    <div className="wx-cell">
      <span className="wx-lbl">{label}</span>
      <span className="wx-val">
        {value}
        {unit && value !== '—' && <small> {unit}</small>}
      </span>
      {sub && <span className="wx-sub">{sub}</span>}
    </div>
  );
}

// ---------- cards ----------
function ObservedSpark({ d, now }: { d: WeatherSnapshot; now: number }) {
  const fillId = useId();
  const pts = [
    ...d.observed.map((o) => ({ t: Date.parse(o.t), y: o.t2m })),
    ...(d.current.t2m != null && d.current.provenance.t2m !== 'blend'
      ? [{ t: now, y: d.current.t2m }]
      : []),
  ].filter((p) => Number.isFinite(p.y) && p.t >= now - 12 * 3600000);
  if (pts.length < 2) return null;
  const t0 = now - 12 * 3600000;
  const t1 = Math.max(now, pts[pts.length - 1]!.t);
  const ys = pts.map((p) => p.y);
  const lo = Math.min(...ys);
  const hi = Math.max(...ys);
  const X = (t: number) => ((t - t0) / (t1 - t0 || 1)) * 1000;
  // curve lives in 22–82 % of the box: room for the inline max label above and min below
  const Y = (v: number) => 82 - ((v - lo) / (hi - lo || 1)) * 60;
  const line: Pt[] = pts.map((p) => [X(p.t), Y(p.y)]);
  const last = line[line.length - 1]!;
  const hours = Math.round((t1 - t0) / 3600000);
  const iMax = ys.indexOf(hi);
  const iMin = ys.indexOf(lo);
  // the “now” label owns the right edge; extremes that sit there fold into it
  const marks = [
    { i: iMax, k: 'max', up: true },
    { i: iMin, k: 'min', up: false },
  ].filter((m) => line[m.i]![0] < 820 && m.i !== pts.length - 1);
  return (
    <div className="wx-spark" data-testid="weather-observed-spark">
      <svg viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id={fillId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="var(--hb-weather-measured)" stopOpacity=".2" />
            <stop offset="1" stopColor="var(--hb-weather-measured)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path
          d={`${smoothPath(line)}L${last[0]},100L${line[0]![0]},100Z`}
          fill={`url(#${fillId})`}
        />
        <path d={smoothPath(line)} className="wx-spark-l" />
      </svg>
      <i
        className="wx-spark-dot"
        style={{ left: `${last[0] / 10}%`, top: `calc((100% - 18px) * ${last[1] / 100})` }}
        aria-hidden="true"
      />
      {marks.map((m) => (
        <span
          key={m.k}
          className={`wx-spark-m ${m.up ? 'up' : 'down'}`}
          style={{
            left: `${line[m.i]![0] / 10}%`,
            top: `calc((100% - 18px) * ${line[m.i]![1] / 100})`,
          }}
        >
          {m.k} <b>{nf(pts[m.i]!.y)}°</b>
        </span>
      ))}
      <span
        className="wx-spark-now"
        style={{ top: `calc((100% - 18px) * ${last[1] / 100})` }}
        data-testid="weather-observed-now"
      >
        <b>{nf(pts[pts.length - 1]!.y)}°</b>
      </span>
      <span className="wx-spark-x">
        <span>před {hours} h</span>
        <span>teď</span>
      </span>
    </div>
  );
}

function StationCard({ d, now }: { d: WeatherSnapshot; now: number }) {
  const s = d.station;
  const val = (k: string) => {
    const v = s.values[k]?.v;
    return typeof v === 'number' ? v : null;
  };
  const pt = s.derived.pressure_tendency;
  const statusLabel =
    s.status === 'fresh'
      ? 'živě'
      : s.status === 'stale'
        ? 'zastaralé'
        : s.status === 'unbound'
          ? 'nenastaveno'
          : 'nedostupné';
  const updated = s.updated_at ? (now - Date.parse(s.updated_at)) / 1000 : null;
  const t = d.current.t2m;
  return (
    <Card
      title="Naměřeno"
      sub={`stanice · ${s.updated_at ? hm.format(new Date(s.updated_at)) : '—'}`}
      right={
        s.status !== 'fresh' && (
          <Pill tone={STATUS_TONE[s.status]} dot>
            {statusLabel}
            {updated != null ? ` · ${age(updated)}` : ''}
          </Pill>
        )
      }
      className="wx-station"
      testId="weather-station"
    >
      <ObservedSpark d={d} now={now} />
      <div className="wx-cells">
        <Cell
          label="Rosný bod"
          value={nf(d.current.td2m)}
          unit="°C"
          sub={
            t != null && d.current.td2m != null ? `rozdíl ${nf(t - d.current.td2m)} °C` : undefined
          }
        />
        <Cell
          label="Vlhkost"
          value={nf(d.current.rh, 0)}
          unit="%"
          sub={s.values.rh ? 'stanice' : 'model'}
        />
        <Cell
          label="Tlak"
          value={nf(d.current.msl)}
          unit="hPa"
          sub={pt ? `${pt.arrow} ${signed(pt.delta_hpa)} / 3 h` : 'tendence —'}
        />
        <Cell
          label="Vítr"
          value={nf(d.current.wind)}
          unit="m/s"
          sub={`${compass(d.current.wind_dir)} · nár. ${nf(d.current.gust)}`}
        />
        <Cell
          label="Srážky dnes"
          value={nf(d.current.rain_today)}
          unit="mm"
          sub={`${nf(val('rain_rate'))} mm/h`}
        />
        <Cell
          label="Záření"
          value={nf(val('solar'), 0)}
          unit="W/m²"
          sub={`UV ${nf(val('uv'), 0)}`}
        />
        <Cell
          label="Dnes max / min"
          value={`${nf(s.derived.today_max?.v)} / ${nf(s.derived.today_min?.v)}`}
          unit="°C"
          sub={
            s.derived.today_max && s.derived.today_min
              ? `${hm.format(new Date(s.derived.today_max.at))} · ${hm.format(new Date(s.derived.today_min.at))}`
              : 'od spuštění'
          }
        />
        <Cell
          label="Uvnitř"
          value={nf(val('indoor_t'))}
          unit="°C"
          sub={val('indoor_rh') != null ? `${nf(val('indoor_rh'), 0)} %` : undefined}
        />
      </div>
    </Card>
  );
}

const LEVEL_TONE: Record<number, Tone> = { 1: 'warn', 2: 'severe', 3: 'crit', 4: 'crit' };

/** End of a warning: only the time when it ends on the same day as it starts (or as now). */
function untilLabel(onset: string | null | undefined, expires: string, now: string): string {
  const end = new Date(expires);
  const start = new Date(onset && Date.parse(onset) > Date.parse(now) ? onset : now);
  return end.toDateString() === start.toDateString() ? hm.format(end) : cap(fullDate.format(end));
}

/** The one place a ČHMÚ warning is shown (#64): inside the hero, glass panel on the sky. */
function WarningsPanel({ d }: { d: WeatherSnapshot }) {
  const ws = d.warnings;
  const regional = ws.every((w) => w.region_filtered) && d.location.region;
  const src = d.sources.find((s) => s.id === 'chmi:alerts');
  const now = Date.parse(d.generated_at);
  const span = 48 * 3600000;
  const pct = (t: number) => Math.min(100, Math.max(0, ((t - now) / span) * 100));
  const scope =
    d.location.area && ws.every((w) => w.area)
      ? `ORP ${d.location.area.name}`
      : regional
        ? 'váš kraj'
        : 'celá ČR';
  if (ws.length === 0)
    return (
      <aside className="wx-hw wx-hw--ok" data-testid="weather-warnings" aria-label="Výstrahy ČHMÚ">
        <Pill tone="ok" dot>
          Bez výstrah
        </Pill>
        <span className="wx-hw-sub">
          ČHMÚ · {scope} · {age(src?.age_s)}
        </span>
      </aside>
    );
  const top = Math.max(...ws.map((w) => w.level));
  return (
    <aside
      id="vystrahy"
      className="wx-hw"
      data-level={top}
      data-testid="weather-warnings"
      aria-label="Výstrahy ČHMÚ"
    >
      {ws.map((w, i) => (
        <article
          key={w.id}
          className="wx-hw-item"
          data-level={w.level}
          role={i === 0 ? 'alert' : undefined}
          data-testid={i === 0 ? 'weather-alert-banner' : undefined}
        >
          <div className="wx-hw-h">
            <Pill tone={LEVEL_TONE[w.level] ?? 'warn'} variant="solid">
              {w.level_label} výstraha
            </Pill>
            <span className="wx-hw-sub">ČHMÚ</span>
          </div>
          <b className="wx-hw-e">{w.event}</b>
          <span className="wx-hw-t">
            {w.onset && Date.parse(w.onset) > now
              ? cap(fullDate.format(new Date(w.onset)))
              : 'Platí teď'}
            {' – '}
            {w.expires ? untilLabel(w.onset, w.expires, d.generated_at) : 'do odvolání'}
            {w.area && ` · ORP ${w.area}`}
          </span>
          {i === 0 && w.description && <p className="wx-hw-d">{w.description}</p>}
          {i === 0 && w.instruction && (
            <details className="wx-hw-more">
              <summary>Co dělat</summary>
              <p>{w.instruction}</p>
            </details>
          )}
        </article>
      ))}
      <div className="wx-hw-tl" data-testid="weather-warn-timeline" aria-label="Platnost 48 h">
        <div className="wx-hw-track">
          {ws.map((w) => {
            const a = pct(w.onset ? Date.parse(w.onset) : now);
            const b = pct(w.expires ? Date.parse(w.expires) : now + span);
            return (
              <i
                key={w.id}
                className="wx-hw-seg"
                data-level={w.level}
                style={{ left: `${a}%`, width: `${Math.max(2, b - a)}%` }}
                title={w.event}
              />
            );
          })}
        </div>
        <div className="wx-hw-tlx">
          <span>teď</span>
          <span>+24 h</span>
          <span>+48 h</span>
        </div>
      </div>
      <p className="wx-hw-foot">
        ČHMÚ (CC BY 4.0) · {scope} · {age(src?.age_s)} ·{' '}
        <a
          href="https://www.chmi.cz/predpovedi/vystrahy-a-informace"
          target="_blank"
          rel="noreferrer"
        >
          všechny výstrahy
        </a>
      </p>
    </aside>
  );
}

function WeatherHero({ d, now }: { d: WeatherSnapshot; now: number }) {
  const scene = skyScene(d.current.condition, new Date(now));
  const t = d.current.t2m;
  const trend = d.station.derived.temp_trend_c_h;
  const range = dayRange(d);
  const hours = d.hourly
    .filter((p) => Date.parse(p.t) > now - 30 * 60000 && p.t2m != null)
    .slice(0, 12);
  const showPop = hours.some((p) => p.pop != null && p.pop >= 0.3);
  const nModels = d.hourly[1]?.contributors.length ?? d.models.length;
  const fc = d.sources.find((s) => s.id.startsWith('om:') && s.age_s != null);
  const st = d.station.status;
  const style = {
    '--sky-a': scene.top,
    '--sky-b': scene.bottom,
    '--sky-glow': scene.glow,
    '--sky-x': `${scene.glowX}%`,
    '--sky-y': `${scene.glowY}%`,
    ...(scene.light && {
      '--sky-la': scene.light.top,
      '--sky-lb': scene.light.bottom,
      '--sky-lglow': scene.light.glow,
    }),
  } as CSSProperties;
  return (
    <section
      className="wx-hero"
      data-sky={`${scene.phase}-${scene.group}`}
      data-wx-bright={scene.light ? 'true' : undefined}
      style={style}
      data-testid="weather-hero"
      aria-label="Teď"
    >
      <div className="wx-sky" aria-hidden="true" />
      <div className="wx-hero-main">
        <h1 className="wx-h1 wx-sr">Počasí</h1>
        <p className="wx-hero-k">
          <i className={`wx-dot wx-dot--${STATUS_TONE[st]}`} aria-hidden="true" />
          Doma
          {d.location.elevation_m != null && ` · ${nf(d.location.elevation_m, 0)} m n. m.`}
          {' · '}
          {st === 'fresh' ? 'stanice živě' : st === 'stale' ? 'stanice zastaralá' : 'bez stanice'}
        </p>
        <div className="wx-hero-now">
          <span className="wx-hero-t" data-testid="weather-now-temp">
            {nf(t)}
            <span className="wx-hero-u">°C</span>
          </span>
          <CondIcon
            c={d.current.condition}
            night={scene.night}
            label={CONDITION_CS[d.current.condition]}
            hero
          />
        </div>
        <p className="wx-hero-s" data-testid="weather-hero-sentence">
          {conditionSentence(d, scene.night)}
        </p>
        <ul className="wx-hero-meta">
          <li>
            Pocitově <b>{nf(d.current.feels_like)}°</b>
          </li>
          {range.min != null && range.max != null && (
            <li>
              Dnes <b>{nf(range.min, 0)}°</b> až <b>{nf(range.max, 0)}°</b>
            </li>
          )}
          {trend != null && Math.abs(trend) > 0.2 && (
            <li>
              {trend > 0 ? 'Otepluje se' : 'Ochlazuje se'} <b>{signed(trend)} °C/h</b>
            </li>
          )}
        </ul>
        {hours.length > 1 && (
          <ol className="wx-hours" data-testid="weather-hero-hours" aria-label="Příštích 12 hodin">
            {hours.map((p, i) => (
              <li key={p.t}>
                <span className="wx-hours-h">
                  {i === 0 && Math.abs(Date.parse(p.t) - now) <= 30 * 60000
                    ? 'Teď'
                    : hourOnly.format(new Date(p.t))}
                </span>
                <CondIcon c={p.condition} night={isNight(p.t)} label={CONDITION_CS[p.condition]} />
                <b>
                  {nf(
                    i === 0 && Math.abs(Date.parse(p.t) - now) <= 30 * 60000 && t != null
                      ? t
                      : p.t2m,
                    0,
                  )}
                  °
                </b>
                {showPop && (
                  <span className={`wx-hours-p ${p.pop != null && p.pop >= 0.3 ? 'on' : ''}`}>
                    {p.pop != null && p.pop >= 0.2 ? `${Math.round(p.pop * 100)} %` : ''}
                  </span>
                )}
              </li>
            ))}
          </ol>
        )}
        <p className="wx-hero-src">
          Předpověď = vážený mix {nModels} modelů · aktualizace {age(fc?.age_s)}
        </p>
      </div>
      <WarningsPanel d={d} />
    </section>
  );
}

/** Models drawn by default (highest weights); the rest are one legend tap away. */
const DEFAULT_MODELS = 3;
type Variable = 't2m' | 'precip' | 'wind' | 'msl';
const VAR_LABEL: Record<Variable, [string, string]> = {
  t2m: ['Teplota', '°C'],
  precip: ['Srážky', 'mm/h'],
  wind: ['Vítr', 'm/s'],
  msl: ['Tlak', 'hPa'],
};
function niceTicks(min: number, max: number, count = 4): number[] {
  const span = max - min || 1;
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step)
    out.push(Math.round(v * 100) / 100);
  return out;
}
function ModelsCard({ d, now }: { d: WeatherSnapshot; now: number }) {
  const [v, setV] = useState<Variable>('t2m');
  const ranked = useMemo(() => [...d.models].sort((a, b) => b.weight - a.weight), [d.models]);
  const [shown, setShown] = useState<Set<string>>(
    () => new Set(ranked.slice(0, DEFAULT_MODELS).map((m) => m.id)),
  );
  const [hover, setHover] = useState<number | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const fillId = useId();
  // r3: one highlighted model (most accurate vs. the station, else the heaviest weight);
  // the other drawn models stay thin and quiet so the mix + best model read at a glance.
  const mae = new Map(
    d.verification.filter((r) => r.enough && r.source !== 'blend').map((r) => [r.source, r.mae]),
  );
  const bestId = [...mae.entries()].sort((a, b) => a[1] - b[1])[0]?.[0] ?? ranked[0]?.id ?? null;
  const colorOf = (id: string) =>
    id === bestId && mae.has(id) ? 'var(--wx-best)' : (MODEL_COLOR[id] ?? 'var(--hb-t3)');
  const hiId =
    focus ??
    (bestId && shown.has(bestId) ? bestId : (ranked.find((m) => shown.has(m.id))?.id ?? null));
  const t0 = now - 12 * 3600000;
  const t1 = now + 48 * 3600000;
  const x = (t: string | number) =>
    ((Number(typeof t === 'string' ? Date.parse(t) : t) - t0) / (t1 - t0)) * 1000;
  const blend = d.hourly.map((p) => ({ t: p.t, y: p[v] as number | null, lo: p.p10, hi: p.p90 }));
  const series = ranked
    .filter((m) => shown.has(m.id))
    .map((m) => ({
      id: m.id,
      label: m.label,
      weight: m.weight,
      pts: m.points.map((p) => ({ t: p.t, y: p[v] })),
    }));
  const all = [
    ...blend.flatMap((p) => [p.y, v === 't2m' ? p.lo : null, v === 't2m' ? p.hi : null]),
    ...series.flatMap((s) => s.pts.map((p) => p.y)),
    ...(v === 't2m' ? d.observed.map((o) => o.t2m) : []),
  ].filter((n): n is number => n != null);
  let lo = Math.min(...all);
  let hi = Math.max(...all);
  if (v === 'precip') lo = 0;
  if (!Number.isFinite(lo)) [lo, hi] = [0, 1];
  const pad = (hi - lo) * 0.08 || 1;
  lo = v === 'precip' ? 0 : lo - pad;
  hi += pad;
  const y = (n: number) => 240 - ((n - lo) / (hi - lo)) * 230;
  const pts = (list: { t: string; y: number | null }[]): Pt[] =>
    list.filter((p) => p.y != null).map((p) => [x(p.t), y(p.y!)]);
  const blendPts = pts(blend);
  const band =
    v === 't2m'
      ? bandPath(
          blend.filter((p) => p.hi != null && p.lo != null).map((p) => [x(p.t), y(p.hi!)]),
          blend.filter((p) => p.hi != null && p.lo != null).map((p) => [x(p.t), y(p.lo!)]),
        )
      : '';
  const area =
    v !== 't2m' && blendPts.length > 1
      ? `${smoothPath(blendPts)}L${blendPts[blendPts.length - 1]![0]},250L${blendPts[0]![0]},250Z`
      : '';
  const ticks = niceTicks(lo, hi);
  // measured series ends at the live station reading; a dashed connector marks the hand-over
  // to the blend at “now” so the step between measurement and forecast is explicit, not a gap.
  const obsNow =
    v === 't2m' && d.current.t2m != null && d.current.provenance.t2m !== 'blend'
      ? d.current.t2m
      : null;
  const obsPts = [
    ...d.observed.map((o) => ({ t: o.t, y: o.t2m })),
    ...(obsNow != null ? [{ t: new Date(now).toISOString(), y: obsNow }] : []),
  ];
  let blendNow: number | null = null;
  for (let i = 0; i + 1 < blend.length; i++) {
    const a = blend[i]!;
    const b = blend[i + 1]!;
    const ta = Date.parse(a.t);
    const tb = Date.parse(b.t);
    if (a.y != null && b.y != null && ta <= now && now <= tb) {
      blendNow = a.y + ((b.y - a.y) * (now - ta)) / (tb - ta || 1);
      break;
    }
  }
  const { midnights, xLabels } = chartTimeMarks(t0, t1);
  const [label, unit] = VAR_LABEL[v];
  const digits = v === 'precip' || v === 'wind' ? 1 : v === 'msl' ? 0 : 1;
  // hover / tap tooltip: snap to the nearest hourly blend sample
  const tip = hover == null ? null : d.hourly[hover];
  const valueAt = (list: { t: string; y: number | null }[], t: number) => {
    let best: { t: string; y: number | null } | undefined;
    for (const p of list)
      if (!best || Math.abs(Date.parse(p.t) - t) < Math.abs(Date.parse(best.t) - t)) best = p;
    return best && Math.abs(Date.parse(best.t) - t) <= 45 * 60000 ? best.y : null;
  };
  const onPoint = (e: RPointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const tt = t0 + ((e.clientX - r.left) / (r.width || 1)) * (t1 - t0);
    let bi = -1;
    d.hourly.forEach((p, i) => {
      if (bi < 0 || Math.abs(Date.parse(p.t) - tt) < Math.abs(Date.parse(d.hourly[bi]!.t) - tt))
        bi = i;
    });
    setHover(bi < 0 ? null : bi);
  };
  const toggle = (id: string) =>
    setShown((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const allShown = shown.size === ranked.length;
  // direct labels at the line ends (mix + highlighted model), nudged apart when they'd touch
  const lastPt = (list: Pt[]) => list[list.length - 1];
  const hiSeries = series.find((s) => s.id === hiId);
  const endLabels = [
    { id: 'blend', label: 'Mix', c: 'var(--hb-ac)', p: lastPt(blendPts) },
    ...(hiSeries
      ? [
          {
            id: hiSeries.id,
            label: hiSeries.label,
            c: colorOf(hiSeries.id),
            p: lastPt(pts(hiSeries.pts)),
          },
        ]
      : []),
  ]
    .filter((l): l is typeof l & { p: Pt } => l.p != null)
    .map((l) => ({ id: l.id, label: l.label, c: l.c, x: l.p[0], y: l.p[1], ey: l.p[1] }));
  if (endLabels.length === 2) {
    const [a, b] = endLabels as [(typeof endLabels)[0], (typeof endLabels)[0]];
    const gap = 22 - Math.abs(a.y - b.y);
    if (gap > 0) {
      const up = a.y <= b.y ? a : b;
      const dn = up === a ? b : a;
      up.y -= gap / 2;
      dn.y += gap / 2;
    }
  }
  const tipT = tip ? Date.parse(tip.t) : 0;
  const tipX = tip ? x(tip.t) : 0;
  const tipRows = tip
    ? [
        ...(v === 't2m' && tipT <= now + 30 * 60000
          ? [
              {
                id: 'obs',
                label: 'Naměřeno',
                c: 'var(--hb-weather-measured)',
                y: valueAt(obsPts, tipT),
              },
            ]
          : []),
        { id: 'blend', label: 'Mix', c: 'var(--hb-ac)', y: tip[v] as number | null },
        ...series.map((s) => ({
          id: s.id,
          label: s.label,
          c: colorOf(s.id),
          y: valueAt(s.pts, tipT),
        })),
      ].filter((r) => r.y != null)
    : [];
  return (
    <Card
      title="Porovnání modelů"
      sub={`${label.toLowerCase()} · −12 h až +48 h`}
      className="wx-models"
      testId="weather-models"
      right={
        <div className="wx-seg" role="tablist" aria-label="Veličina">
          {(Object.keys(VAR_LABEL) as Variable[]).map((key) => (
            <button
              key={key}
              role="tab"
              aria-selected={key === v}
              className={key === v ? 'on' : ''}
              onClick={() => setV(key)}
            >
              {VAR_LABEL[key][0]}
            </button>
          ))}
        </div>
      }
    >
      <div
        className="wx-chart"
        role="img"
        aria-label={`${label}: naměřeno, mix modelů a ${series.length} z ${ranked.length} modelů`}
        onPointerMove={onPoint}
        onPointerDown={onPoint}
        onPointerLeave={(e) => e.pointerType === 'mouse' && setHover(null)}
        onPointerCancel={() => setHover(null)}
        data-testid="weather-models-chart"
      >
        <svg viewBox="0 0 1000 250" preserveAspectRatio="none">
          <defs>
            <linearGradient id={fillId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="var(--hb-ac)" stopOpacity=".26" />
              <stop offset="1" stopColor="var(--hb-ac)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {ticks.map((tk) => (
            <line key={tk} x1="0" x2="1000" y1={y(tk)} y2={y(tk)} className="wx-grid" />
          ))}
          {midnights.map((m) => (
            <line key={m} x1={x(m)} x2={x(m)} y1="0" y2="250" className="wx-grid wx-grid--day" />
          ))}
          <rect x={x(now)} y="0" width={1000 - x(now)} height="250" className="wx-future" />
          {band && <path d={band} className="wx-band" />}
          {area && <path d={area} fill={`url(#${fillId})`} />}
          {[...series]
            .sort((a, b) => Number(a.id === hiId) - Number(b.id === hiId))
            .map((s) => (
              <path
                key={s.id}
                d={smoothPath(pts(s.pts))}
                className={`wx-line wx-line--model ${s.id === hiId ? 'is-hi' : ''}`}
                style={{ stroke: colorOf(s.id) }}
              />
            ))}
          <path
            d={smoothPath(blendPts)}
            className="wx-line wx-line--blend"
            data-testid="weather-models-blend"
          />
          {v === 't2m' && <path d={smoothPath(pts(obsPts))} className="wx-line wx-line--obs" />}
          {obsNow != null && blendNow != null && (
            <line
              x1={x(now)}
              x2={x(now)}
              y1={y(obsNow)}
              y2={y(blendNow)}
              className="wx-handover"
              data-testid="weather-handover"
            />
          )}
          <line x1={x(now)} x2={x(now)} y1="0" y2="250" className="wx-now" />
        </svg>
        {ticks.map((tk) => (
          <span key={tk} className="wx-ylab" style={{ top: `${(y(tk) / 250) * 100}%` }}>
            {nf(tk, v === 'precip' ? 1 : 0)}
            {v === 't2m' ? '°' : ''}
          </span>
        ))}
        {obsNow != null && (
          <i
            className="wx-nowdot"
            style={{ left: `${x(now) / 10}%`, top: `${(y(obsNow) / 250) * 100}%` }}
            aria-hidden="true"
          />
        )}
        <span className="wx-nowlab" style={{ left: `${x(now) / 10}%` }}>
          teď
        </span>
        {endLabels.map((l) => (
          <span
            key={l.id}
            className={`wx-endlab ${l.id === 'blend' ? 'is-blend' : ''}`}
            style={{ top: `${(l.y / 250) * 100}%`, '--c': l.c } as CSSProperties}
          >
            {l.label}
          </span>
        ))}
        {endLabels
          .filter((l) => l.x < 985)
          .map((l) => (
            <i
              key={l.id}
              className="wx-enddot"
              style={{ left: `${l.x / 10}%`, top: `${(l.ey / 250) * 100}%`, background: l.c }}
              aria-hidden="true"
            />
          ))}
        {tip && (
          <>
            <i className="wx-tip-guide" style={{ left: `${tipX / 10}%` }} aria-hidden="true" />
            {tipRows.map((r) => (
              <i
                key={r.id}
                className="wx-tip-dot"
                style={{
                  left: `${tipX / 10}%`,
                  top: `${(y(r.y!) / 250) * 100}%`,
                  background: r.c,
                }}
                aria-hidden="true"
              />
            ))}
            <div
              className={`wx-tip ${tipX > 620 ? 'wx-tip--l' : ''}`}
              style={{ left: `${tipX / 10}%` }}
              data-testid="weather-models-tip"
            >
              <b>
                {cap(weekday.format(new Date(tip.t)))} {hm.format(new Date(tip.t))}
              </b>
              {tipRows.map((r) => (
                <span key={r.id} className="wx-tip-r">
                  <i style={{ background: r.c }} />
                  {r.label}
                  <em>
                    {nf(r.y, digits)} {v === 't2m' ? '°' : unit}
                  </em>
                </span>
              ))}
            </div>
          </>
        )}
      </div>
      <div className="wx-xlabs">
        {xLabels.map((m) => (
          <span
            key={m}
            className={new Date(m).getHours() === 0 ? undefined : 'wx-xl-noon'}
            style={{ left: `${x(m) / 10}%` }}
          >
            {new Date(m).getHours() === 0 ? `${cap(weekday.format(new Date(m)))} 0:00` : '12:00'}
          </span>
        ))}
      </div>
      <div className="wx-legend" data-testid="weather-models-legend">
        <div className="wx-lg-key">
          {v === 't2m' && (
            <span className="wx-lg">
              <i className="wx-sw wx-sw--obs" /> Naměřeno
            </span>
          )}
          <span className="wx-lg">
            <i className="wx-sw wx-sw--blend" /> Mix vážený
          </span>
          {v === 't2m' && (
            <span className="wx-lg">
              <i className="wx-sw wx-sw--band" /> Rozptyl P10–P90
            </span>
          )}
        </div>
        <div className="wx-lg-models" role="group" aria-label="Modely v grafu">
          {[...ranked]
            .sort((a, b) => Number(b.id === bestId) - Number(a.id === bestId))
            .map((m) => {
              return (
                <button
                  key={m.id}
                  type="button"
                  className={`wx-lg-btn ${m.id === bestId ? 'is-best' : ''} ${m.id === hiId ? 'is-hi' : ''}`}
                  aria-pressed={shown.has(m.id)}
                  onClick={() => toggle(m.id)}
                  onPointerEnter={() => shown.has(m.id) && setFocus(m.id)}
                  onPointerLeave={() => setFocus(null)}
                  onFocus={() => shown.has(m.id) && setFocus(m.id)}
                  onBlur={() => setFocus(null)}
                  style={{ '--c': colorOf(m.id) } as CSSProperties}
                >
                  <i />
                  <span className="wx-lg-n">{m.label}</span>
                  <span className="wx-lg-w">{Math.round(m.weight * 100)} %</span>
                  {m.id === bestId && mae.has(m.id) && (
                    <span
                      className="wx-lg-best"
                      title={`nejpřesnější samostatný model · průměrná chyba ${nf(mae.get(m.id), 2)} °C`}
                      aria-label="nejpřesnější samostatný model"
                    >
                      ★ nejpřesnější
                    </span>
                  )}
                </button>
              );
            })}
          <button
            type="button"
            className="wx-lg-all"
            onClick={() =>
              setShown(
                new Set((allShown ? ranked.slice(0, DEFAULT_MODELS) : ranked).map((m) => m.id)),
              )
            }
          >
            {allShown ? 'Jen hlavní' : 'Všechny modely'}
          </button>
        </div>
      </div>
      <p className="wx-foot">
        {unit} · teplota modelů po korekci systematické odchylky vůči stanici, kde je dost dat
        {obsNow != null && blendNow != null && (
          <>
            {' '}
            · teď naměřeno {nf(obsNow)}°, mix {nf(blendNow)}°
          </>
        )}
      </p>
    </Card>
  );
}

function biasText(b: number): string {
  if (Math.abs(b) < 0.05) return 'bez odchylky';
  return b > 0 ? `teplejší o ${nf(b)}°` : `chladnější o ${nf(-b)}°`;
}
function ScoreCard({ d }: { d: WeatherSnapshot }) {
  const rows = d.verification.filter((r) => r.enough).sort((a, b) => a.mae - b.mae);
  const label = (id: string) =>
    id === 'blend' ? 'Mix (vážený)' : (d.models.find((m) => m.id === id)?.label ?? id);
  const bestMae = Math.min(...rows.map((r) => r.mae));
  const blend = rows.find((r) => r.source === 'blend');
  const best = rows.find((r) => r.source !== 'blend');
  const weight = (id: string) => d.models.find((m) => m.id === id)?.weight;
  return (
    <Card
      title="Kdo se trefuje"
      sub="teplota 0–24 h · průměrná chyba vs. stanice"
      className="wx-score"
      testId="weather-score"
    >
      {rows.length === 0 ? (
        <p className="wx-empty">
          Skóre se zobrazí po nasbírání alespoň 48 párů předpověď–měření (zhruba 2 dny provozu
          stanice).
        </p>
      ) : (
        <>
          <ol className="wx-rank" aria-label="Pořadí podle přesnosti">
            {rows.map((r, i) => {
              const w = weight(r.source);
              return (
                <li
                  key={r.source}
                  className={`wx-rank-i ${r.source === 'blend' ? 'is-blend' : ''}`}
                  style={{ '--c': MODEL_COLOR[r.source] ?? 'var(--hb-t3)' } as CSSProperties}
                >
                  <span className="wx-rank-n">{i + 1}</span>
                  <span className="wx-rank-name">
                    <i aria-hidden="true" />
                    {label(r.source)}
                  </span>
                  <span className="wx-rank-v" aria-label={`průměrná chyba ${nf(r.mae, 2)} °C`}>
                    {nf(r.mae, 2)}°
                  </span>
                  <span className="wx-rank-bar" aria-hidden="true">
                    <i style={{ width: `${Math.max(8, (bestMae / r.mae) * 100)}%` }} />
                  </span>
                  <span className="wx-rank-sub">
                    {biasText(r.bias)}
                    {r.source === 'blend'
                      ? ' · všechny modely'
                      : w != null
                        ? ` · váha ${Math.round(w * 100)} %`
                        : ''}
                  </span>
                </li>
              );
            })}
          </ol>
          <p className="wx-rank-k">Delší pruh = přesnější · číslo = průměrná chyba proti stanici</p>
          {blend && best && blend.mae < best.mae && (
            <p className="wx-info">
              <b>Mix je o {Math.round((1 - blend.mae / best.mae) * 100)} % přesnější</b> než
              nejlepší samostatný model ({label(best.source)}).
            </p>
          )}
        </>
      )}
    </Card>
  );
}

/** 48 h as a horizontal hourly strip (#64 r2): icons, a smooth temperature curve, rain bars. */
function MeteogramCard({ d, now }: { d: WeatherSnapshot; now: number }) {
  const fillId = useId();
  const cols: (BlendPoint & { psum: number; gmax: number; popmax: number })[] = [];
  // same first hour as the hero's 12 h strip, so “Teď” agrees across the page
  const hourly = d.hourly.filter((p) => Date.parse(p.t) > now - 30 * 60000);
  for (let i = 0; i + 1 < hourly.length && cols.length < 24; i += 2) {
    const a = hourly[i]!;
    const b = hourly[i + 1]!;
    cols.push({
      ...a,
      psum: (a.precip ?? 0) + (b.precip ?? 0),
      gmax: Math.max(a.gust ?? 0, b.gust ?? 0),
      // “Teď” keeps the hero's own hour so both strips agree; later columns = max over 2 h
      popmax: cols.length === 0 ? (a.pop ?? 0) : Math.max(a.pop ?? 0, b.pop ?? 0),
    });
  }
  const n = cols.length;
  const temps = cols.flatMap((c) => [c.t2m, c.p10, c.p90]).filter((v): v is number => v != null);
  const lo = Math.min(...temps);
  const hi = Math.max(...temps);
  // curve fills 12–90 % of its band; values sit in their own row above (never on the line)
  const yp = (v: number) => 90 - ((v - lo) / (hi - lo || 1)) * 78;
  const xc = (i: number) => ((i + 0.5) / Math.max(n, 1)) * 1000;
  const pmax = Math.max(2, ...cols.map((c) => c.psum));
  const line: Pt[] = cols.flatMap((c, i) => (c.t2m == null ? [] : [[xc(i), yp(c.t2m)] as Pt]));
  const withBand = cols.map((c, i) => ({ c, i })).filter(({ c }) => c.p10 != null && c.p90 != null);
  const band = bandPath(
    withBand.map(({ c, i }) => [xc(i), yp(c.p90!)] as Pt),
    withBand.map(({ c, i }) => [xc(i), yp(c.p10!)] as Pt),
  );
  const nowT = d.current.t2m;
  const dayLong = new Intl.DateTimeFormat('cs-CZ', { weekday: 'long' });
  const isNow = (c: BlendPoint) => Math.abs(Date.parse(c.t) - now) <= 30 * 60000;
  const style = { '--wx-cols': n } as CSSProperties;
  const col = (i: number) => ({ gridColumn: i + 1 });
  return (
    <Card
      title="48 hodin"
      sub="mix modelů · po 2 h"
      right={
        <span className="wx-hs-key">
          <span>
            <i className="wx-sw wx-sw--temp" /> teplota
          </span>
          <span>
            <i className="wx-sw wx-sw--rain" /> srážky mm · pravděpodobnost
          </span>
          <span>vítr m/s (nárazy)</span>
        </span>
      }
      className="wx-mg-card"
      testId="weather-48h"
    >
      {n === 0 ? (
        <p className="wx-empty">Předpověď není k dispozici.</p>
      ) : (
        <div className="wx-hscroll">
          <div className="wx-hs" style={style} role="list" aria-label="Předpověď na 48 hodin">
            {cols.map((c, i) =>
              new Date(c.t).getHours() < 2 && i > 0 ? (
                <i key={`d${c.t}`} className="wx-hs-day" style={col(i)} aria-hidden="true" />
              ) : null,
            )}
            {cols.map((c, i) =>
              isNow(c) ? (
                <i key="now" className="wx-hs-now" style={col(i)} aria-hidden="true" />
              ) : null,
            )}
            {cols.map((c, i) => {
              const day = new Date(c.t).getHours() < 2;
              const wet = c.psum >= 0.1;
              return (
                <div key={c.t} className="wx-hs-col" style={col(i)} role="listitem">
                  <span className="wx-hs-dn">
                    {i === 0 ? 'Dnes' : day ? cap(dayLong.format(new Date(c.t))) : ''}
                  </span>
                  <span className={`wx-hs-h ${i === 0 && isNow(c) ? 'is-now' : ''}`}>
                    {i === 0 && isNow(c) ? 'Teď' : hourOnly.format(new Date(c.t))}
                  </span>
                  <span className="wx-hs-i">
                    <CondIcon
                      c={c.condition}
                      night={isNight(c.t)}
                      label={CONDITION_CS[c.condition]}
                    />
                  </span>
                  <b className="wx-hs-tv">
                    {i === 0 && isNow(c) && nowT != null
                      ? `${nf(nowT, 0)}°`
                      : c.t2m == null
                        ? '–'
                        : `${nf(c.t2m, 0)}°`}
                  </b>
                  <span className="wx-hs-tgap" />
                  <span className="wx-hs-rain" title={`${nf(c.psum)} mm`}>
                    {wet && <em>{nf(c.psum)}</em>}
                    <i
                      hidden={!wet}
                      style={
                        wet
                          ? { height: `calc((100% - 16px) * ${Math.max(0.24, c.psum / pmax)})` }
                          : undefined
                      }
                    />
                  </span>
                  <span className={`wx-hs-p ${c.popmax >= 0.3 ? 'on' : ''}`}>
                    {c.popmax >= 0.2 ? `${Math.round(c.popmax * 100)} %` : ''}
                  </span>
                  <span className={`wx-hs-w ${c.gmax >= 15 ? 'wx-warnc' : ''}`}>
                    {nf(c.wind, 0)} <small>({nf(c.gmax, 0)})</small>
                  </span>
                </div>
              );
            })}
            <div className="wx-hs-temp" aria-hidden="true">
              <svg viewBox="0 0 1000 100" preserveAspectRatio="none">
                <defs>
                  <linearGradient id={fillId} x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0" stopColor="var(--hb-weather-temp)" stopOpacity=".22" />
                    <stop offset="1" stopColor="var(--hb-weather-temp)" stopOpacity="0" />
                  </linearGradient>
                </defs>
                {band && <path d={band} className="wx-hs-band" />}
                {line.length > 1 && (
                  <>
                    <path
                      d={`${smoothPath(line)}L${line[line.length - 1]![0]},100L${line[0]![0]},100Z`}
                      fill={`url(#${fillId})`}
                    />
                    <path d={smoothPath(line)} className="wx-line wx-line--temp" />
                  </>
                )}
              </svg>
              {cols.map((c, i) =>
                c.t2m == null || i > 0 || !isNow(c) ? null : (
                  <i
                    key={`o${c.t}`}
                    className="wx-hs-pt"
                    style={{ left: `${xc(i) / 10}%`, top: `${yp(c.t2m)}%` }}
                  />
                ),
              )}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

function DailyCard({ d }: { d: WeatherSnapshot }) {
  const days = dailyWithToday(d);
  const vals = days
    .flatMap((x) => [x.tmin_lo, x.tmax_hi, x.tmin, x.tmax])
    .filter((n): n is number => n != null);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const pos = (n: number) => ((n - lo) / (hi - lo || 1)) * 100;
  const today = pragueDate(Date.parse(d.generated_at));
  const name = (x: DailyPoint) =>
    x.date === today ? 'Dnes' : cap(weekday.format(new Date(`${x.date}T12:00:00Z`)));
  return (
    <Card
      title="10 dní"
      sub="min–max · světlé pásmo = rozptyl modelů"
      right={<span className="wx-cs">jistota z rozptylu</span>}
      className="wx-daily"
      testId="weather-10d"
    >
      {days.length === 0 ? (
        <p className="wx-empty">Desetidenní předpověď není k dispozici.</p>
      ) : (
        <ul className="wx-days">
          {days.map((x) => (
            <li key={x.date} className="wx-day">
              <b className="wx-day-n">{name(x)}</b>
              <span className="wx-day-d wx-t3">
                {dayMonth.format(new Date(`${x.date}T12:00:00`))}
              </span>
              <CondIcon c={x.condition} label={CONDITION_CS[x.condition]} />
              <span className={`wx-day-p ${x.pop != null && x.pop >= 0.5 ? 'wx-rain' : 'wx-t3'}`}>
                {x.pop != null ? `${Math.round(x.pop * 100)} %` : '—'}
              </span>
              <span className="wx-day-min wx-t2">{nf(x.tmin, 0)}°</span>
              <span className="wx-range" aria-label={`${nf(x.tmin, 0)} až ${nf(x.tmax, 0)} °C`}>
                {x.tmin_lo != null && x.tmax_hi != null && (
                  <i
                    className="wx-range-s"
                    style={{
                      left: `${pos(x.tmin_lo)}%`,
                      width: `${pos(x.tmax_hi) - pos(x.tmin_lo)}%`,
                    }}
                  />
                )}
                {x.tmin != null && x.tmax != null && (
                  <i
                    className="wx-range-c"
                    style={{
                      left: `${pos(x.tmin)}%`,
                      width: `${Math.max(2, pos(x.tmax) - pos(x.tmin))}%`,
                    }}
                  />
                )}
              </span>
              <b className="wx-day-max">{nf(x.tmax, 0)}°</b>
              <span className="wx-day-w wx-t2">{nf(x.wind, 0)} m/s</span>
              <Pill tone={CONFIDENCE_TONE[x.confidence]} className="wx-day-c">
                {CONFIDENCE_CS[x.confidence]}
              </Pill>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function sourceStatus(s: SourceMeta): string {
  if (s.status === 'unavailable') return s.error ? `nedostupné · ${s.error}` : 'nedostupné';
  if (s.status === 'unbound') return 'nenastaveno';
  const a = age(s.age_s);
  if (s.status === 'stale') return `zastaralé · ${s.error ?? a}`;
  if (s.status === 'partial') return `část horizontu · ${a}`;
  return a;
}
function SourcesCard({ d }: { d: WeatherSnapshot }) {
  const ok = d.sources.filter((s) => s.status === 'fresh').length;
  return (
    <Card
      title="Zdroje dat"
      sub={`${d.sources.length} zdrojů · ${ok} v pořádku`}
      className="wx-sources"
      testId="weather-sources"
    >
      <ul className="wx-src">
        {d.sources.map((s) => (
          <li key={s.id}>
            <i className={`wx-dot wx-dot--${STATUS_TONE[s.status]}`} aria-hidden="true" />
            <b>{s.label}</b>
            <span className="wx-t3 wx-src-d">{s.detail}</span>
            <span className="wx-t3 wx-src-s">{sourceStatus(s)}</span>
          </li>
        ))}
      </ul>
      <p className="wx-attr">
        {d.attribution.map((a, i) => (
          <span key={a.label}>
            {i > 0 && ' · '}
            <a href={a.url} target="_blank" rel="noreferrer">
              {a.text}
            </a>
          </span>
        ))}
      </p>
    </Card>
  );
}

// ---------- view ----------
export default function WeatherView({ connection }: Partial<ModuleViewProps>) {
  const adapter = useMemo(() => getWeatherAdapter(connection), [connection]);
  const [state, setState] = useState<WeatherState>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!adapter) return;
    let alive = true;
    const load = () =>
      adapter.fetch().then(
        (data) => alive && setState({ kind: 'ready', data, receivedAt: Date.now() }),
        (err: unknown) =>
          alive &&
          setState({ kind: 'error', message: err instanceof Error ? err.message : String(err) }),
      );
    void load();
    const timer = adapter.pollMs ? setInterval(() => void load(), adapter.pollMs) : undefined;
    return () => {
      alive = false;
      if (timer) clearInterval(timer);
    };
  }, [adapter, attempt]);
  const retry = () => {
    setState({ kind: 'loading' });
    setAttempt((n) => n + 1);
  };
  const view: WeatherState = adapter
    ? state
    : { kind: 'error', message: 'Integrace HomeBrain není připojena.' };

  if (view.kind !== 'ready')
    return (
      <div className="wx" data-testid="weather">
        <style>{weatherStyles}</style>
        <h1 className="wx-h1">Počasí</h1>
        {view.kind === 'loading' ? (
          <Skeleton
            variant="card"
            lines={3}
            label="Načítám počasí…"
            data-testid="weather-loading"
          />
        ) : (
          <ErrorState
            title="Počasí není k dispozici"
            onRetry={adapter ? retry : undefined}
            data-testid="weather-error"
          >
            {view.message}
          </ErrorState>
        )}
      </div>
    );
  const d = view.data;
  const now = Date.parse(d.generated_at);
  return (
    <div className="wx" data-testid="weather">
      <style>{weatherStyles}</style>
      <WeatherHero d={d} now={now} />
      <div className="wx-grid">
        <StationCard d={d} now={now} />
        <RadarCard d={d} now={now} radarImage={adapter?.radarImage} />
        <ScoreCard d={d} />
        <MeteogramCard d={d} now={now} />
        <ModelsCard d={d} now={now} />
        <DailyCard d={d} />
        <SourcesCard d={d} />
      </div>
    </div>
  );
}

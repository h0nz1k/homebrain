import { useId } from 'react';
import { TIER_LABEL, TIERS, dur, hm, num } from '../copy.js';
import type { Band, Health } from '../types.js';

const HOUR = 3_600_000;
const LEGEND: Record<Health, string> = { ok: 'V pořádku', ...TIER_LABEL };

/** Highest tier per hour over the last 24 h (oldest first). */
export function HealthStrip({ health, now }: { health: Health[]; now: string }) {
  const end = Date.parse(now);
  return (
    <figure className="aw-strip" data-testid="aw-health">
      <div
        className="aw-strip-bars"
        role="img"
        aria-label="Nejvyšší úroveň hlášení v jednotlivých hodinách za posledních 24 h"
      >
        {health.map((tier, k) => (
          <span
            key={k}
            data-tier={tier}
            title={`${hm(end - (health.length - 1 - k) * HOUR)} · ${LEGEND[tier]}`}
          />
        ))}
      </div>
      <div className="aw-strip-axis">
        <span>před 24 h</span>
        <span>teď</span>
      </div>
      <figcaption className="aw-strip-legend">
        {(['ok', ...TIERS] as const).map((tier) => (
          <span key={tier}>
            <i data-tier={tier} />
            {LEGEND[tier]}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}

const minuteOfDay = (value: string | number) => {
  const [h, m] = hm(value).split(':').map(Number);
  return h! * 60 + m!;
};

/** Today's curve against the usual range for each hour; after „teď“ the band is only a forecast. */
export function BaselineBand({ band, now }: { band: Band; now: string }) {
  const id = useId();
  const width = 480;
  const height = 112;
  const usual = band.usual.map((b, h) => (b ? { lo: b[0], hi: b[1], minute: h * 60 + 30 } : null));
  const known = usual.filter((u): u is NonNullable<typeof u> => !!u);
  const today = band.today;
  const all = [...known.flatMap((u) => [u.lo, u.hi]), ...today.map((p) => p[1])];
  if (!all.length) return null;
  const pad = Math.max(1, (Math.max(...all) - Math.min(...all)) * 0.12);
  const top = Math.ceil(Math.max(...all) + pad);
  const bottom = Math.floor(Math.min(...all) - pad);
  const x = (minute: number) => (minute / 1440) * width;
  const y = (value: number) => 8 + ((top - value) / (top - bottom || 1)) * (height - 16);
  const nowMinute = minuteOfDay(now);
  const nowX = x(nowMinute);
  const edges = known.length
    ? [{ ...known[0]!, minute: 0 }, ...known, { ...known.at(-1)!, minute: 1440 }]
    : [];
  const area = [
    ...edges.map((p) => `${x(p.minute)},${y(p.hi)}`),
    ...edges
      .slice()
      .reverse()
      .map((p) => `${x(p.minute)},${y(p.lo)}`),
  ].join(' ');
  const edge = (key: 'hi' | 'lo') => edges.map((p) => `${x(p.minute)},${y(p[key])}`).join(' ');
  const line = today
    .filter(([m]) => m <= nowMinute)
    .map(([m, v]) => `${x(m)},${y(v)}`)
    .join(' ');
  const current = today.filter(([m]) => m <= nowMinute).at(-1);
  const unit = band.unit ? ` ${band.unit}` : '';
  const ticks = [top, (top + bottom) / 2, bottom];
  return (
    <figure className="aw-band" aria-label="Dnešní průběh proti obvyklému rozmezí pro denní dobu">
      <div className="aw-band-chart">
        <div className="aw-band-y" aria-hidden="true">
          {ticks.map((t) => (
            <span key={t}>
              {num(t)}
              {unit}
            </span>
          ))}
        </div>
        <div className="aw-band-plot">
          <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <clipPath id={`${id}-past`}>
                <rect x={0} y={0} width={nowX} height={height} />
              </clipPath>
              <clipPath id={`${id}-future`}>
                <rect x={nowX} y={0} width={width - nowX} height={height} />
              </clipPath>
            </defs>
            {ticks.map((v) => (
              <line key={v} x1={0} x2={width} y1={y(v)} y2={y(v)} className="aw-band-grid" />
            ))}
            {area && (
              <>
                <polygon points={area} className="aw-band-usual" clipPath={`url(#${id}-past)`} />
                <g clipPath={`url(#${id}-future)`}>
                  <polygon points={area} className="aw-band-usual aw-band-ahead" />
                  <polyline points={edge('hi')} className="aw-band-edge" />
                  <polyline points={edge('lo')} className="aw-band-edge" />
                </g>
              </>
            )}
            <line x1={nowX} x2={nowX} y1={0} y2={height} className="aw-band-now" />
            {line && <polyline points={line} className="aw-band-today" />}
          </svg>
          {current && (
            <span
              className="aw-band-dot"
              style={{
                left: `${(current[0] / 1440) * 100}%`,
                top: `${(y(current[1]) / height) * 100}%`,
              }}
            />
          )}
          <span className="aw-band-tag" style={{ left: `${(nowMinute / 1440) * 100}%` }}>
            teď {hm(now)}
          </span>
        </div>
        <div className="aw-band-axis" aria-hidden="true">
          <span>0:00</span>
          <span>6:00</span>
          <span>12:00</span>
          <span>18:00</span>
          <span>24:00</span>
        </div>
      </div>
      <figcaption>
        <span>
          <i className="aw-key-usual" />
          Obvyklé rozmezí
        </span>
        <span>
          <i className="aw-key-today" />
          Dnes · průměr za 5 min
        </span>
      </figcaption>
    </figure>
  );
}

/** Shared 4h window, so a longer gap is visibly longer on every card. */
const GAP_WINDOW = 4 * HOUR;

/**
 * Outage timeline: received reports, the last one, and the expected reports that did not come.
 * The anchor is the last report (the same time as in the card's headline line).
 */
export function SilenceTimeline({
  last,
  intervalS,
  now,
}: {
  last: string;
  intervalS: number;
  now: string;
}) {
  const end = Date.parse(now);
  const start = end - GAP_WINDOW;
  const step = Math.max(60, intervalS) * 1000;
  const lastMs = Date.parse(last);
  const pos = (t: number) => Math.min(100, Math.max(0, ((t - start) / (end - start)) * 100));
  const hours: number[] = [];
  for (let t = Math.ceil(start / HOUR) * HOUR; t <= end; t += HOUR) hours.push(t);
  // Hour labels keep clear of the „teď“ label at the right end.
  const labelled = hours.filter((t) => end - t >= 0.3 * GAP_WINDOW);
  const received: number[] = [];
  for (let t = lastMs; t >= start; t -= step) received.push(t);
  let missing = 0;
  const expected: number[] = [];
  for (let t = lastMs + step; t <= end; t += step) {
    missing += 1;
    if (t >= start) expected.push(t);
  }
  const lastPos = pos(lastMs);
  return (
    <figure className="aw-gap" data-testid="aw-gap">
      <figcaption>
        <b data-testid="aw-gap-title">
          Od {hm(lastMs)} chybí {missing}&nbsp;hlášení
        </b>
        <span>obvykle hlásí každých {dur(step / 60_000)}</span>
      </figcaption>
      <div className="aw-gap-scale" aria-hidden="true">
        <div className="aw-gap-events">
          <span
            style={{ left: `${lastPos}%` }}
            data-align={lastPos < 25 ? 'start' : lastPos > 70 ? 'end' : 'center'}
          >
            poslední hodnota <b>{hm(lastMs)}</b>
          </span>
        </div>
        <div className="aw-gap-track">
          <span className="aw-gap-data" style={{ width: `${lastPos}%` }} />
          <span className="aw-gap-missing" style={{ left: `${lastPos}%` }} />
          {hours.map((t) => (
            <i key={t} className="aw-gap-hour" style={{ left: `${pos(t)}%` }} />
          ))}
          {received.map((t) => (
            <i key={t} className="aw-gap-got" style={{ left: `${pos(t)}%` }} />
          ))}
          {expected.map((t) => (
            <i key={t} className="aw-gap-miss" style={{ left: `${pos(t)}%` }} />
          ))}
          <i className="aw-gap-last" style={{ left: `${lastPos}%` }} />
        </div>
        <div className="aw-gap-hours">
          {labelled.map((t) => (
            <span key={t} style={{ left: `${pos(t)}%` }}>
              {hm(t)}
            </span>
          ))}
          <span className="aw-gap-now">
            teď <b>{hm(end)}</b>
          </span>
        </div>
      </div>
    </figure>
  );
}

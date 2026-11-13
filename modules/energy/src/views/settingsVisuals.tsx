import { Quantity, formatQuantity } from '@homebrain/ui';
import { localParts } from '../adapter.js';
import type { PvForecast } from '../pvForecast.js';

const TZ = 'Europe/Prague';

/** Panel tilt: ground line, panel at the real angle and the angle arc (decorative). */
export function TiltGlyph({ deg }: { deg: number }) {
  const a = (Math.min(90, Math.max(0, deg)) * Math.PI) / 180;
  const x = 4 + 20 * Math.cos(a);
  const y = 20 - 20 * Math.sin(a);
  const r = 12;
  return (
    <svg className="en-glyph" viewBox="0 0 28 24" width="28" height="24">
      <path className="en-glyph-base" d="M2 20h24" />
      <path
        className="en-glyph-arc"
        d={`M4 20H${4 + r}A${r} ${r} 0 0 0 ${4 + r * Math.cos(a)} ${20 - r * Math.sin(a)}Z`}
      />
      <path className="en-glyph-main" d={`M4 20L${x} ${y}`} />
    </svg>
  );
}

/** Compass with north up; the arrow points where the panels face (azimuth 0 = south). */
export function CompassGlyph({ azimuth }: { azimuth: number }) {
  return (
    <svg className="en-glyph" viewBox="0 0 24 24" width="24" height="24">
      <circle className="en-glyph-base" cx="12" cy="12" r="10" />
      <path className="en-glyph-tick" d="M12 2.5v2.5" />
      <g transform={`rotate(${180 + azimuth} 12 12)`}>
        <path className="en-glyph-needle" d="M12 5.5l3 7.5h-6z" />
        <circle className="en-glyph-hub" cx="12" cy="12" r="1.6" />
      </g>
    </svg>
  );
}

/** Inverter export limit vs. the limit the forecast assumes, on one shared scale. */
export function ExportLimitBars({
  inverterW,
  forecastKw,
}: {
  inverterW: number;
  forecastKw: number;
}) {
  const max = Math.max(inverterW / 1000, forecastKw, 0.001);
  const rows = [
    ['Střídač', inverterW / 1000, formatQuantity(inverterW, 'W'), 'inverter'],
    ['Předpověď', forecastKw, formatQuantity(forecastKw, 'kW'), 'forecast'],
  ] as const;
  return (
    <div
      className="en-limit"
      role="img"
      aria-label={`Limit střídače ${rows[0][2]}, předpověď ${rows[1][2]}`}
    >
      {rows.map(([name, kw, text, kind]) => (
        <div className="en-limit-row" key={kind} data-kind={kind}>
          <span>{name}</span>
          <span className="en-limit-track">
            <i style={{ width: `${Math.max(1.5, (kw / max) * 100)}%` }} />
          </span>
          <b>{text}</b>
        </div>
      ))}
    </div>
  );
}

function dayKey(offset: number) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return new Intl.DateTimeFormat('sv-SE', { timeZone: TZ }).format(d);
}

/** Tomorrow's forecast as the Fotovoltaika hero: big kWh, hourly area chart, context line. */
export function PvForecastHero({ pv }: { pv: PvForecast | null }) {
  const tomorrow = dayKey(1);
  const kwh = pv?.days[tomorrow];
  if (kwh === undefined || !pv) return null;
  const hours: number[] = Array.from({ length: 24 }, () => 0);
  for (const p of pv.points) {
    const at = localParts(p.start, TZ);
    if (at.day === tomorrow) hours[at.hour]! += (p.kw * (p.end - p.start)) / 3_600_000;
  }
  const lit = hours.map((v, h) => (v > 0.01 ? h : -1)).filter((h) => h >= 0);
  const from = Math.max(0, (lit[0] ?? 6) - 1);
  const to = Math.min(24, (lit[lit.length - 1] ?? 18) + 2);
  const peak = Math.max(...hours, 0.001);
  const peakHour = hours.indexOf(peak);
  const W = 240;
  const H = 56;
  const x = (h: number) => ((h - from) / (to - from)) * W;
  const y = (v: number) => H - (v / peak) * (H - 4);
  const pts = hours
    .slice(from, to)
    .map((v, i) => `${x(from + i + 0.5).toFixed(1)},${y(v).toFixed(1)}`)
    .join(' L');
  const line = `M${pts}`;
  const area = `M${x(from).toFixed(1)},${H} L${pts} L${x(to).toFixed(1)},${H} Z`;
  const others = Object.entries(pv.days)
    .filter(([day, v]) => day > dayKey(0) && day !== tomorrow && v > 0)
    .map(([, v]) => v);
  const window = [kwh, ...others];
  const avg = window.reduce((s, v) => s + v, 0) / window.length;
  const diff = avg > 0 ? Math.round(((kwh - avg) / avg) * 100) : 0;
  const context =
    window.length > 1
      ? Math.abs(diff) < 5
        ? `Zhruba jako průměr příštích ${window.length} dnů`
        : `O ${Math.abs(diff)} % ${diff > 0 ? 'víc' : 'míň'} než průměr příštích ${window.length} dnů`
      : null;
  const ticks = [from, Math.round((from + to) / 2), to];
  return (
    <div className="en-pv-hero">
      <div className="en-pv-head">
        <span className="en-pv-label">Předpověď na zítra</span>
        <strong className="en-pv-value">
          <Quantity value={Math.round(kwh * 10) / 10} unit="kWh" />
        </strong>
        <span className="en-pv-context">
          {context && <>{context} · </>}
          špička {formatQuantity(Math.round(peak * 10) / 10, 'kW')} kolem {peakHour}:30
        </span>
      </div>
      <div className="en-pv-chart">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id="en-pv-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--hb-energy-pv)" stopOpacity=".42" />
              <stop offset="1" stopColor="var(--hb-energy-pv)" stopOpacity=".02" />
            </linearGradient>
          </defs>
          <path d={area} fill="url(#en-pv-fill)" />
          <path d={line} className="en-pv-line" />
        </svg>
        <div className="en-pv-axis" aria-hidden="true">
          {ticks.map((h) => (
            <span key={h} style={{ left: `${(x(h) / W) * 100}%` }}>
              {h}:00
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

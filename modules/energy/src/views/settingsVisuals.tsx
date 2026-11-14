import { formatPower, formatQuantity } from '@homebrain/ui';
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

function dayKey(offset: number) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return new Intl.DateTimeFormat('sv-SE', { timeZone: TZ }).format(d);
}

/**
 * Tomorrow's forecast as a compact strip in the Fotovoltaika card: one line of text and a small
 * hourly sparkline. Hourly values are plotted as they are (straight segments at the middle of each
 * hour, no smoothing); the dot marks the peak at its real time. Equal neighbouring hours form a
 * flat top and the peak time is then the middle of that run.
 */
export function PvForecastStrip({ pv }: { pv: PvForecast | null }) {
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
  const top = hours.map((v, h) => (peak - v < 1e-6 ? h : -1)).filter((h) => h >= 0);
  const peakAt = (top[0]! + top[top.length - 1]!) / 2 + 0.5;
  const W = 240;
  const H = 40;
  const x = (h: number) => ((h - from) / (to - from)) * W;
  const y = (v: number) => H - (v / peak) * (H - 3);
  const pts = hours
    .slice(from, to)
    .map((v, i) => `${x(from + i + 0.5).toFixed(1)},${y(v).toFixed(1)}`)
    .join(' L');
  const line = `M${pts}`;
  const area = `M${x(from).toFixed(1)},${H} L${pts} L${x(to).toFixed(1)},${H} Z`;
  const time = `${Math.floor(peakAt)}:${String(Math.round((peakAt % 1) * 60)).padStart(2, '0')}`;
  const ticks = [from, Math.round((from + to) / 2), to];
  return (
    <div className="en-pv-strip">
      <p className="en-pv-text">
        <span>
          Zítra ~<strong>{formatQuantity(Math.round(kwh * 10) / 10, 'kWh')}</strong>
        </span>
        <span className="en-pv-peak">
          {' · '}špička {formatPower(Math.round(peak * 10) / 10, 'kW')} v {time}
        </span>
      </p>
      <div className="en-pv-chart" aria-hidden="true">
        <div className="en-pv-plot">
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
            <defs>
              <linearGradient id="en-pv-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="var(--hb-energy-pv)" stopOpacity=".38" />
                <stop offset="1" stopColor="var(--hb-energy-pv)" stopOpacity=".02" />
              </linearGradient>
            </defs>
            <path d={area} fill="url(#en-pv-fill)" />
            <path d={line} className="en-pv-line" />
          </svg>
          <i
            className="en-pv-dot"
            style={{ left: `${(x(peakAt) / W) * 100}%`, top: `${(y(peak) / H) * 100}%` }}
          />
        </div>
        <div className="en-pv-axis">
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

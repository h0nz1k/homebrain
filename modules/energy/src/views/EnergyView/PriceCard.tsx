import { EmptyState } from '@homebrain/ui';
import { localParts, priceLevels, startOfLocalDay } from '../../adapter.js';
import type { EnergyModel, PricePoint } from '../../contract.js';
import { fmt, hourOf, HOUR } from './format.js';

const LEVEL_COLOR = {
  cheap: 'var(--hb-ok)',
  normal: 'var(--hb-ac)',
  expensive: 'var(--hb-warn)',
  peak: 'var(--hb-crit)',
} as const;

export function PriceCard({ model }: { model: EnergyModel }) {
  const { series, peakToday, averageToday, averageTomorrow } = model.price;
  const tz = model.timeZone;
  const dayStart = startOfLocalDay(model.now, tz);
  const visible = series.filter((p) => p.start >= dayStart && p.start < dayStart + 48 * HOUR);
  const currentPrice = (
    <div className="en-price-now" data-testid="energy-kpi-price">
      <span>
        Spot teď{' '}
        <b>
          {fmt(model.price.now.value, 2)}
          {'\u00a0'}Kč/kWh
        </b>
      </span>
      <span className="en-sub">
        {model.price.next
          ? `od ${hourOf(model.price.next.start, tz)} h ${fmt(model.price.next.price, 2)}\u00a0Kč/kWh`
          : 'další hodina bez dat'}
      </span>
    </div>
  );
  if (!visible.length)
    return (
      <section className="en-card en-price" aria-label="Spotová cena" data-testid="energy-price">
        <h2 className="en-ct">Spotová cena</h2>
        {currentPrice}
        <EmptyState title="Ceny nejsou k dispozici" />
      </section>
    );
  const span = 48 * HOUR;
  const x = (t: number) => ((t - dayStart) / span) * 100;
  const max = Math.max(...visible.map((p) => p.price), 0.1) * 1.08;
  const y = (v: number) => 100 - (Math.max(0, v) / max) * 100;
  const split = dayStart + 24 * HOUR;
  const todayLevel = priceLevels(visible.filter((p) => p.start < split));
  const tomorrowLevel = priceLevels(visible.filter((p) => p.start >= split));
  const level = (p: PricePoint) => (p.start < split ? todayLevel : tomorrowLevel)(p.price);
  const step = max > 12 ? 4 : max > 6 ? 2 : 1;
  const ticks = [1, 2, 3, 4, 5, 6].map((i) => i * step).filter((t) => t < max * 0.95);
  return (
    <section className="en-card en-price" aria-label="Spotová cena" data-testid="energy-price">
      <h2 className="en-ct">
        Spotová cena <small>dnes + zítra · Kč/kWh</small>
      </h2>
      {currentPrice}
      <div className="en-chips">
        {averageTomorrow === null && (
          <span className="en-chip en-chip--off" data-testid="energy-tomorrow-pending">
            {localParts(model.now, tz).hour >= 13
              ? 'Zítřejší ceny zatím nevyhlášeny'
              : 'Zítřejší ceny po 13. hodině'}
          </span>
        )}
        {peakToday && (
          <span className="en-chip en-chip--warn">
            Špička <b>{hourOf(peakToday.start, tz)} h</b> · {fmt(peakToday.price, 2)} Kč
          </span>
        )}
        <span className="en-chip-text">
          průměr dnes <b>{fmt(averageToday, 2)} Kč</b>
          {averageTomorrow !== null && (
            <>
              {' '}
              · zítra <b>{fmt(averageTomorrow, 2)} Kč</b>
            </>
          )}
        </span>
      </div>
      <div className="en-hscroll">
        <div className="en-hscroll-in">
          <div className="en-chart en-chart--price">
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              {ticks.map((t) => (
                <line
                  key={t}
                  x1="0"
                  x2="100"
                  y1={y(t)}
                  y2={y(t)}
                  stroke="var(--hb-b1)"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              {visible.map((p) => {
                const w = x(p.end) - x(p.start);
                return (
                  <rect
                    key={p.start}
                    data-level={level(p)}
                    x={x(p.start) + w * 0.14}
                    width={w * 0.72}
                    y={y(p.price)}
                    height={100 - y(p.price)}
                    fill={LEVEL_COLOR[level(p)]}
                    opacity={p.end <= model.now ? 0.38 : 1}
                  />
                );
              })}
              {averageToday !== null && (
                <line
                  x1="0"
                  x2="50"
                  y1={y(averageToday)}
                  y2={y(averageToday)}
                  stroke="var(--hb-t2)"
                  strokeDasharray="2 4"
                  vectorEffect="non-scaling-stroke"
                />
              )}
              <line
                x1="50"
                x2="50"
                y1="0"
                y2="100"
                stroke="var(--hb-b2)"
                vectorEffect="non-scaling-stroke"
              />
              <line
                x1={x(model.now)}
                x2={x(model.now)}
                y1="0"
                y2="100"
                stroke="var(--hb-t1)"
                strokeDasharray="3 3"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
            {ticks.map((t) => (
              <span key={t} className="en-axis en-axis--y" style={{ top: `${y(t)}%` }}>
                {t}
              </span>
            ))}
            <span className="en-axis en-axis--tag" style={{ left: `${x(model.now)}%` }}>
              teď
            </span>
            <span
              className={`en-axis en-axis--tag${Math.abs(x(model.now) - 50) < 9 ? ' en-axis--tag-in' : ''}`}
              style={{ left: '50%' }}
            >
              zítra
            </span>
          </div>
          <div className="en-xaxis">
            {[0, 6, 12, 18, 24, 30, 36, 42].map((h) => (
              <span key={h} style={{ left: `${(h / 48) * 100}%` }}>
                {h % 24}
              </span>
            ))}
            <span style={{ left: '100%' }}>24 h</span>
          </div>
        </div>
      </div>
      <div className="en-legend">
        <span>
          <i style={{ background: LEVEL_COLOR.cheap }} />
          levné
        </span>
        <span>
          <i style={{ background: LEVEL_COLOR.normal }} />
          běžné
        </span>
        <span>
          <i style={{ background: LEVEL_COLOR.expensive }} />
          drahé
        </span>
        <span>
          <i style={{ background: LEVEL_COLOR.peak }} />
          špička
        </span>
        <span>
          <i className="en-dash" />
          průměr dne
        </span>
        <span className="en-legend-note">hladiny podle kvartilů dne</span>
      </div>
    </section>
  );
}

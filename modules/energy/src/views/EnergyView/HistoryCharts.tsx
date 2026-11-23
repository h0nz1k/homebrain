import { localParts } from '../../adapter.js';
import type { EnergyHistory, EnergyModel, StatPoint } from '../../contract.js';
import { fmt, hourOf, HOUR, total, weekday } from './format.js';

function StatsEmpty({ history }: { history: EnergyHistory }) {
  return (
    <p className="en-sub en-empty">
      {history.status === 'loading' || history.status === 'idle'
        ? 'Načítám statistiky…'
        : 'Statistiky nejsou k dispozici'}
    </p>
  );
}

/** Four or fewer intervals with round, readable energy values. */
function energyAxis(values: number[], minimumStep: number) {
  const peak = Math.max(minimumStep, ...values);
  const rough = Math.max(minimumStep, peak / 3);
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 5, 10].map((n) => n * power).find((n) => n >= rough)!;
  const max = Math.ceil(peak / step) * step;
  return { max, ticks: Array.from({ length: Math.round(max / step) + 1 }, (_, i) => i * step) };
}

export function DayChart({ model, history }: { model: EnergyModel; history: EnergyHistory }) {
  const pv = history.hourly.energy_pv_energy_today ?? [];
  const house = history.hourly.energy_house_energy_today ?? [];
  const start = Math.floor(model.now / HOUR) * HOUR - 23 * HOUR;
  const { max, ticks } = energyAxis(
    [...pv, ...house].map((p) => p.value),
    1,
  );
  const xs = (t: number) => ((t - start + HOUR / 2) / (24 * HOUR)) * 100;
  const line = (pts: StatPoint[]) =>
    pts.map((p) => `${xs(p.start)},${100 - (p.value / max) * 100}`).join(' ');
  return (
    <section className="en-card en-day" aria-label="Posledních 24 hodin" data-testid="energy-24h">
      <h2 className="en-ct">
        Výroba a spotřeba <small>posledních 24 h · kWh za hodinu</small>
      </h2>
      {!pv.length && !house.length ? (
        <StatsEmpty history={history} />
      ) : (
        <>
          <div className="en-chart en-chart--line">
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              {ticks.map((tick) => (
                <line
                  key={tick}
                  x1="0"
                  x2="100"
                  y1={100 - (tick / max) * 100}
                  y2={100 - (tick / max) * 100}
                  stroke="var(--hb-b1)"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              {pv.length > 1 && (
                <polygon
                  points={`${xs(pv[0]!.start)},100 ${line(pv)} ${xs(pv[pv.length - 1]!.start)},100`}
                  fill="var(--hb-energy-pv)"
                  opacity="0.18"
                />
              )}
              {pv.length > 1 && (
                <polyline
                  points={line(pv)}
                  fill="none"
                  stroke="var(--hb-energy-pv)"
                  strokeWidth="2"
                  vectorEffect="non-scaling-stroke"
                />
              )}
              {house.length > 1 && (
                <polyline
                  points={line(house)}
                  fill="none"
                  stroke="var(--hb-energy-home)"
                  strokeWidth="2"
                  vectorEffect="non-scaling-stroke"
                />
              )}
            </svg>
            {ticks.map((tick) => (
              <span
                key={tick}
                className="en-axis en-axis--y"
                style={{ top: `${100 - (tick / max) * 100}%` }}
              >
                {fmt(tick, 0)}
              </span>
            ))}
          </div>
          <div className="en-xaxis">
            {[0, 6, 12, 18].map((h) => (
              <span key={h} style={{ left: `${((h + 0.5) / 24) * 100}%` }}>
                {hourOf(start + h * HOUR, model.timeZone)} h
              </span>
            ))}
            <span style={{ left: '100%' }}>teď</span>
          </div>
          <div className="en-legend">
            <span>
              <i style={{ background: 'var(--hb-energy-pv)' }} />
              FVE <b>{fmt(total(pv))} kWh</b>
            </span>
            <span>
              <i style={{ background: 'var(--hb-energy-home)' }} />
              Dům <b>{fmt(total(house))} kWh</b>
            </span>
          </div>
        </>
      )}
    </section>
  );
}

export function WeekChart({ model, history }: { model: EnergyModel; history: EnergyHistory }) {
  const pv = history.daily.energy_pv_energy_today ?? [];
  const house = history.daily.energy_house_energy_today ?? [];
  const days = [...new Set([...pv, ...house].map((p) => p.start))].sort((a, b) => a - b).slice(-7);
  const val = (pts: StatPoint[], t: number) => pts.find((p) => p.start === t)?.value ?? 0;
  const { max, ticks } = energyAxis(
    days.flatMap((d) => [val(pv, d), val(house, d)]),
    5,
  );
  const today = localParts(model.now, model.timeZone).day;
  return (
    <section className="en-card en-week" aria-label="Posledních 7 dní" data-testid="energy-7d">
      <h2 className="en-ct">
        7 dní <small>kWh za den · dnešek rozpracovaný (obrys)</small>
      </h2>
      {!days.length ? (
        <StatsEmpty history={history} />
      ) : (
        <>
          <div className="en-week-plot">
            {ticks.map((tick) => (
              <div key={tick} className="en-week-grid" style={{ bottom: `${(tick / max) * 100}%` }}>
                <span>{fmt(tick, 0)}</span>
              </div>
            ))}
            <div className="en-bars">
              {days.map((d) => (
                <div
                  key={d}
                  className="en-bar-day"
                  data-progress={
                    localParts(d + 12 * HOUR, model.timeZone).day === today || undefined
                  }
                >
                  <div className="en-bar-pair">
                    <span
                      style={{
                        height: `${(val(pv, d) / max) * 100}%`,
                        background: 'var(--hb-energy-pv)',
                      }}
                      title={`FVE ${fmt(val(pv, d))} kWh`}
                    />
                    <span
                      style={{
                        height: `${(val(house, d) / max) * 100}%`,
                        background: 'var(--hb-energy-home)',
                      }}
                      title={`Dům ${fmt(val(house, d))} kWh`}
                    />
                  </div>
                  <span className="en-axis-x">
                    {localParts(d + 12 * HOUR, model.timeZone).day === today
                      ? 'dnes'
                      : weekday(d + 12 * HOUR, model.timeZone)}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="en-legend">
            <span>
              <i style={{ background: 'var(--hb-energy-pv)' }} />
              FVE{' '}
              <b>
                {fmt(total(pv), 0)}
                {'\u00a0'}kWh za 7 dní
              </b>
            </span>
            <span>
              <i style={{ background: 'var(--hb-energy-home)' }} />
              Dům{' '}
              <b>
                {fmt(total(house), 0)}
                {'\u00a0'}kWh za 7 dní
              </b>
            </span>
          </div>
        </>
      )}
    </section>
  );
}

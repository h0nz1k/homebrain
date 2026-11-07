import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { EntityStateLike, EntityStore, ModuleViewProps } from '@homebrain/ha-client';
import { Breakdown, EmptyState, SegmentedControl, StatusBadge } from '@homebrain/ui';
import { fetchComparison, type Comparison } from '../compare.js';
import { CompareCard } from './CompareCard.js';
import { InvoicesCard } from './InvoicesCard.js';
import {
  adaptEnergyEntities,
  fetchEnergyHistory,
  fetchPhaseHistory,
  fetchThermalHistory,
  THERMAL_HISTORY_NONE,
  type ThermalHistory,
  PHASE_HISTORY_NONE,
  type PhaseHistory,
  localParts,
  priceLevels,
  selectEnergyEntityIds,
  startOfLocalDay,
} from '../adapter.js';
import type { EnergyHistory, EnergyModel, PricePoint, StatPoint } from '../contract.js';
import { energySignals } from '../signals.js';
import {
  adaptAppliances,
  applianceSignals,
  boundApplianceSlots,
  fetchApplianceCycles,
  fetchApplianceToday,
  type ApplianceExtras,
  type ApplianceReading,
  type ApplianceState,
} from '../appliances.js';
import { fetchPvForecast, PV_FORECAST_NONE, pvUsable, type PvForecast } from '../pvForecast.js';
import {
  computeCosts,
  fetchCostHours,
  hdoStatus,
  parseHdoSchedule,
  readTariffSettings,
  type CostHour,
  type CostPeriod,
  type Costs,
  type HdoState,
  type TariffSettings,
} from '../costs.js';
import { energyStyles } from './energyStyles.js';
import { EnergyFlowHero } from './EnergyFlowHero.js';

const HOUR = 3_600_000;
const HISTORY_REFRESH_MS = 10 * 60_000;
const APPLIANCE_REFRESH_MS = 60_000;
const PV_REFRESH_MS = 30 * 60_000;

function createEntitiesSource(store: EntityStore, ids: string[]) {
  let cached: (EntityStateLike | undefined)[] = [];
  const snapshot = () => {
    const next = ids.map((id) => store.getSnapshot(id));
    if (next.length !== cached.length || next.some((state, i) => state !== cached[i]))
      cached = next;
    return cached;
  };
  return {
    snapshot,
    subscribe: (notify: () => void) => {
      const stops = ids.map((id) => store.subscribe(id, notify));
      return () => stops.forEach((stop) => stop());
    },
  };
}
function useEntities(store: EntityStore, ids: string[]) {
  const key = JSON.stringify(ids);
  const source = useMemo(
    () => createEntitiesSource(store, JSON.parse(key) as string[]),
    [store, key],
  );
  return useSyncExternalStore(source.subscribe, source.snapshot, source.snapshot);
}

export function fmt(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '–';
  return new Intl.NumberFormat('cs-CZ', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}
const hourOf = (ms: number, tz: string) => localParts(ms, tz).hour;
const weekday = (ms: number, tz: string) =>
  new Intl.DateTimeFormat('cs-CZ', { weekday: 'short', timeZone: tz }).format(new Date(ms));

function Sparkline({ points, color }: { points: number[]; color: string }) {
  if (points.length < 2) return <div className="en-spark" aria-hidden="true" />;
  const max = Math.max(...points, 0.001);
  const d = points.map((v, i) => `${(i / (points.length - 1)) * 100},${30 - (v / max) * 27}`);
  return (
    <svg className="en-spark" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true">
      <polygon points={`0,30 ${d.join(' ')} 100,30`} fill={color} opacity="0.16" />
      <polyline
        points={d.join(' ')}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function Kpi(props: {
  label: string;
  value: string;
  unit: string;
  sub: string;
  color: string;
  spark?: number[];
  testId?: string;
}) {
  return (
    <section className="en-card en-kpi" data-testid={props.testId}>
      <span className="en-lbl">{props.label}</span>
      <strong className="en-kpi-v">
        {props.value}
        <small> {props.unit}</small>
      </strong>
      <span className="en-sub">{props.sub}</span>
      <Sparkline points={props.spark ?? []} color={props.color} />
    </section>
  );
}

const LEVEL_COLOR = {
  cheap: 'var(--hb-ok)',
  normal: 'var(--hb-ac)',
  expensive: 'var(--hb-warn)',
  peak: 'var(--hb-crit)',
} as const;

function PriceCard({ model }: { model: EnergyModel }) {
  const { series, peakToday, averageToday, averageTomorrow } = model.price;
  const tz = model.timeZone;
  const dayStart = startOfLocalDay(model.now, tz);
  const visible = series.filter((p) => p.start >= dayStart && p.start < dayStart + 48 * HOUR);
  if (!visible.length)
    return (
      <section className="en-card en-price" aria-label="Spotová cena">
        <h2 className="en-ct">Spotová cena</h2>
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

const values = (points: StatPoint[] | undefined) => (points ?? []).map((p) => p.value);
const total = (points: StatPoint[]) => points.reduce((s, p) => s + p.value, 0);
function StatsEmpty({ history }: { history: EnergyHistory }) {
  return (
    <p className="en-sub en-empty">
      {history.status === 'loading' || history.status === 'idle'
        ? 'Načítám statistiky…'
        : 'Statistiky nejsou k dispozici'}
    </p>
  );
}

function DayChart({ model, history }: { model: EnergyModel; history: EnergyHistory }) {
  const pv = history.hourly.energy_pv_energy_today ?? [];
  const house = history.hourly.energy_house_energy_today ?? [];
  const start = Math.floor(model.now / HOUR) * HOUR - 23 * HOUR;
  const max = Math.max(0.5, ...pv.map((p) => p.value), ...house.map((p) => p.value)) * 1.1;
  const xs = (t: number) => ((t - start + HOUR / 2) / (24 * HOUR)) * 100;
  const line = (pts: StatPoint[]) =>
    pts.map((p) => `${xs(p.start)},${100 - (p.value / max) * 100}`).join(' ');
  return (
    <section className="en-card en-day" aria-label="Posledních 24 hodin" data-testid="energy-24h">
      <h2 className="en-ct">
        Výroba a spotřeba <small>24 h · kWh za hodinu</small>
      </h2>
      {!pv.length && !house.length ? (
        <StatsEmpty history={history} />
      ) : (
        <>
          <div className="en-chart en-chart--line">
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              {[0.25, 0.5, 0.75].map((f) => (
                <line
                  key={f}
                  x1="0"
                  x2="100"
                  y1={f * 100}
                  y2={f * 100}
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
            <span className="en-axis en-axis--y" style={{ top: '0%' }}>
              {fmt(max, 1)}
            </span>
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

function WeekChart({ model, history }: { model: EnergyModel; history: EnergyHistory }) {
  const pv = history.daily.energy_pv_energy_today ?? [];
  const house = history.daily.energy_house_energy_today ?? [];
  const days = [...new Set([...pv, ...house].map((p) => p.start))].sort((a, b) => a - b).slice(-7);
  const val = (pts: StatPoint[], t: number) => pts.find((p) => p.start === t)?.value ?? 0;
  const max = Math.max(1, ...days.flatMap((d) => [val(pv, d), val(house, d)])) * 1.1;
  return (
    <section className="en-card en-week" aria-label="Posledních 7 dní" data-testid="energy-7d">
      <h2 className="en-ct">
        7 dní <small>kWh za den</small>
      </h2>
      {!days.length ? (
        <StatsEmpty history={history} />
      ) : (
        <>
          <div className="en-bars">
            {days.map((d) => (
              <div key={d} className="en-bar-day">
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
                <span className="en-axis-x">{weekday(d + 12 * HOUR, model.timeZone)}</span>
              </div>
            ))}
          </div>
          <div className="en-legend">
            <span>
              <i style={{ background: 'var(--hb-energy-pv)' }} />
              FVE <b>{fmt(total(pv), 0)}</b>
            </span>
            <span>
              <i style={{ background: 'var(--hb-energy-home)' }} />
              Dům <b>{fmt(total(house), 0)}</b>
            </span>
          </div>
        </>
      )}
    </section>
  );
}

function Stack({
  parts,
}: {
  parts: Array<{ label: string; value: number | null; color: string }>;
}) {
  const valid = parts.filter((p) => (p.value ?? 0) > 0);
  return (
    <>
      <div className="en-stack">
        {valid.map((p) => (
          <span key={p.label} style={{ flexGrow: p.value!, background: p.color }} />
        ))}
        {!valid.length && <span style={{ flexGrow: 1, background: 'var(--hb-s3)' }} />}
      </div>
      <div className="en-legend">
        {parts.map((p) => (
          <span key={p.label}>
            <i style={{ background: p.color }} />
            {p.label} <b>{fmt(p.value)}</b>
          </span>
        ))}
      </div>
    </>
  );
}

function BalanceCard({ model }: { model: EnergyModel }) {
  const t = model.today;
  const sum = (v: Array<number | null>) => v.reduce<number>((s, x) => s + (x ?? 0), 0);
  const sources = sum([t.pv.value, t.gridImport.value, t.batteryDischarge.value]);
  const uses = sum([t.house.value, t.gridExport.value, t.batteryCharge.value]);
  return (
    <section className="en-card en-balance" aria-label="Bilance dne" data-testid="energy-balance">
      <h2 className="en-ct">
        Bilance dne <small>kWh od půlnoci</small>
      </h2>
      <span className="en-lbl">
        Zdroje · {fmt(sources)} <span className="en-unit">kWh</span>
      </span>
      <Stack
        parts={[
          { label: 'FVE', value: t.pv.value, color: 'var(--hb-energy-pv)' },
          { label: 'Síť', value: t.gridImport.value, color: 'var(--hb-energy-grid)' },
          { label: 'Baterie', value: t.batteryDischarge.value, color: 'var(--hb-energy-battery)' },
        ]}
      />
      <span className="en-lbl">
        Užití · {fmt(uses)} <span className="en-unit">kWh</span>
      </span>
      <Stack
        parts={[
          { label: 'Dům', value: t.house.value, color: 'var(--hb-energy-home)' },
          { label: 'Prodej', value: t.gridExport.value, color: 'var(--hb-ok)' },
          { label: 'Do baterie', value: t.batteryCharge.value, color: 'var(--hb-energy-battery)' },
        ]}
      />
      {Math.abs(sources - uses) >= 0.5 && (
        <p className="en-note" data-testid="energy-balance-gap">
          Rozdíl {fmt(Math.abs(sources - uses))} kWh – ztráty střídače nebo měřidla, která se
          nesčítají (počítadla jsou z různých senzorů).
        </p>
      )}
    </section>
  );
}

const APPLIANCE_CHIP: Record<ApplianceState, { label: string; tone: string }> = {
  running: { label: 'Běží', tone: 'ok' },
  standby: { label: 'Pohotovost', tone: 'idle' },
  off: { label: 'Vypnuto', tone: 'off' },
  finished: { label: 'Dokončeno', tone: 'ac' },
  unknown: { label: 'Bez dat', tone: 'warn' },
};
function watts(w: number | null): [string, string] {
  if (w === null) return ['–', 'W'];
  return w >= 1000 ? [fmt(w / 1000, 2), 'kW'] : [fmt(w, w < 10 ? 1 : 0), 'W'];
}
const clock = (ms: number, tz: string) => {
  const p = localParts(ms, tz);
  return `${p.hour}:${String(p.minute).padStart(2, '0')}`;
};

function AppliancesCard({ items, model }: { items: ApplianceReading[]; model: EnergyModel }) {
  return (
    <section className="en-card en-appl" aria-label="Spotřebiče" data-testid="energy-appliances">
      <h2 className="en-ct">
        Spotřebiče <small>výkon teď · dnes od půlnoci · podíl na spotřebě domu</small>
      </h2>
      <ul className="en-appl-list">
        {items.map((a) => {
          const chip = APPLIANCE_CHIP[a.state];
          const [v, unit] = watts(a.power.value);
          return (
            <li
              key={a.slot}
              className="en-appl-item"
              data-testid={`energy-appliance-${a.slot}`}
              data-state={a.state}
            >
              <div className="en-appl-top">
                <span className="en-appl-name">{a.label}</span>
                <span
                  className={`en-chip en-chip--${chip.tone}`}
                  title={`Běží nad ${fmt(a.runningW, 0)} W`}
                >
                  {chip.label}
                  {a.state === 'off' && a.switchOn === false ? ' · spínač' : ''}
                </span>
              </div>
              <div className="en-appl-mid">
                <div
                  className={`en-appl-v${a.state === 'running' ? '' : ' en-appl-v--idle'}`}
                  aria-label={`Výkon teď ${v} ${unit}`}
                >
                  {v} <small>{unit}</small>
                  {a.power.quality === 'stale' && <span className="en-appl-stale">neaktuální</span>}
                </div>
                <div className="en-appl-today">
                  <span>
                    dnes <b>{fmt(a.todayKwh)}</b> kWh
                  </span>
                  {a.sharePercent !== null && (
                    <span>
                      <b>{fmt(a.sharePercent, 0)} %</b> domu
                    </span>
                  )}
                </div>
              </div>
              <div className="en-track" aria-hidden="true">
                <span
                  style={{
                    width: `${a.sharePercent ?? 0}%`,
                    minWidth: a.sharePercent ? 4 : 0,
                  }}
                />
              </div>
              {a.state === 'finished' && a.cycle && (
                <span className="en-appl-note">
                  Program doběhl v {clock(a.cycle.endedAt, model.timeZone)}
                  {a.cycle.energyKwh !== null ? ` · cyklus ${fmt(a.cycle.energyKwh)} kWh` : ''}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------------ costs */

export interface CostView {
  costs: Costs | null;
  settings: TariffSettings;
  hdo: HdoState | null;
  status: 'loading' | 'ready' | 'error' | 'unsupported';
}

const kc = (v: number | null | undefined, digits = 0) =>
  v === null || v === undefined || !Number.isFinite(v) ? '–' : `${fmt(v, digits)}\u00a0Kč`;
const clockOf = (ms: number, tz: string) =>
  new Intl.DateTimeFormat('cs-CZ', { hour: 'numeric', minute: '2-digit', timeZone: tz }).format(
    new Date(ms),
  );
const dateOf = (ms: number, tz: string) =>
  new Intl.DateTimeFormat('cs-CZ', { day: 'numeric', month: 'numeric', timeZone: tz }).format(
    new Date(ms),
  );
const kwh = (v: number) => `${fmt(v, v < 10 ? 2 : 1)}\u00a0kWh`;
const PERIOD_LABEL: Record<CostPeriod, string> = {
  day: 'Dnes zatím za elektřinu',
  month: 'Tento měsíc zatím',
  year: 'Letos zatím',
};
const PERIODS: ReadonlyArray<readonly [CostPeriod, string]> = [
  ['day', 'Dnes'],
  ['month', 'Měsíc'],
  ['year', 'Rok'],
];

function HdoPill({ hdo, model }: { hdo: HdoState; model: EnergyModel }) {
  const tz = model.timeZone;
  const other = hdo.tariff === 'NT' ? 'VT' : 'NT';
  const sameDay =
    hdo.nextChange !== null && localParts(hdo.nextChange, tz).day === localParts(model.now, tz).day;
  return (
    <span className="en-pill en-hdo" data-tariff={hdo.tariff} data-testid="energy-hdo">
      <i className="en-dot" aria-hidden="true" />
      Teď <b>{hdo.tariff === 'NT' ? 'nízký tarif' : 'vysoký tarif'}</b>
      {hdo.nextChange !== null && (
        <span className="en-hdo-next">
          · {other} {sameDay ? 'od' : 'zítra od'} {clockOf(hdo.nextChange, tz)}
        </span>
      )}
    </span>
  );
}

function CostCard({ cost, model }: { cost: CostView | null; model: EnergyModel }) {
  const [period, setPeriod] = useState<CostPeriod>('day');
  if (!cost) return null;
  const tz = model.timeZone;
  const { costs, settings: s, hdo } = cost;
  const p = costs?.[period];
  const fromLabel =
    p && period !== 'day' ? `od ${dateOf(p.from, tz)}` : p ? `do ${clockOf(model.now, tz)}` : '';
  const spot = p?.spot ?? null;
  const dig = period === 'day' ? 1 : 0;
  const round = (v: number) =>
    Math.round(v * 10 ** (period === 'day' ? 1 : 0)) / 10 ** (period === 'day' ? 1 : 0);
  // Difference of the DISPLAYED (rounded) totals, so the user's own subtraction matches.
  const diff = spot ? round(spot.total) - round(spot.tariffTotal) : null;
  return (
    <section
      className="en-card en-cost"
      aria-label="Náklady na elektřinu"
      data-testid="energy-costs"
    >
      <header className="en-cost-head">
        <h2 className="en-ct">
          Náklady na elektřinu <small>odhad podle měření střídače</small>
        </h2>
        <div className="en-cost-tools">
          {hdo && <HdoPill hdo={hdo} model={model} />}
          <SegmentedControl
            label="Období"
            hideLabel
            size="sm"
            value={period}
            options={PERIODS}
            onChange={setPeriod}
          />
        </div>
      </header>
      {!costs || !p ? (
        <EmptyState
          title={
            cost.status === 'loading'
              ? 'Načítám statistiky…'
              : s.priceVt === null || s.priceNt === null || s.fixedMonthly === null
                ? 'Chybí ceny tarifu'
                : 'Statistiky odběru nejsou k dispozici'
          }
        >
          {cost.status !== 'loading' &&
            'Ceny VT/NT a stálé platby nastavíte ve vazbách modulu Energie (např. pomocné entity input_number).'}
        </EmptyState>
      ) : (
        <div className="en-cost-grid">
          <div className="en-cost-col" data-testid="energy-cost-total">
            <span className="en-lbl">{PERIOD_LABEL[period]}</span>
            <strong className="en-cost-v">{kc(p.total, dig)}</strong>
            <span className="en-sub">
              {fromLabel} · {kwh(p.importKwh)} ze sítě
            </span>
            {p.savings !== null && (
              <span className="en-cost-save" data-testid="energy-cost-savings">
                <b>FVE a baterie ušetřily {kc(p.savings, dig)}</b>
                <span>dům nemusel odebrat ze sítě {kwh(p.coveredKwh)}</span>
              </span>
            )}
          </div>
          <div className="en-cost-col">
            <Breakdown
              label="Rozpis nákladů"
              items={[
                {
                  key: 'vt',
                  label: 'Vysoký tarif',
                  detail: `${kwh(p.vtKwh)} × ${fmt(s.priceVt, 2)} Kč/kWh`,
                  value: kc(p.vtKwh * (s.priceVt ?? 0), dig),
                  amount: p.vtKwh * (s.priceVt ?? 0),
                  color: 'var(--hb-warn)',
                },
                {
                  key: 'nt',
                  label: 'Nízký tarif',
                  detail: `${kwh(p.ntKwh)} × ${fmt(s.priceNt, 2)} Kč/kWh`,
                  value: kc(p.ntKwh * (s.priceNt ?? 0), dig),
                  amount: p.ntKwh * (s.priceNt ?? 0),
                  color: 'var(--hb-energy-grid)',
                },
                {
                  key: 'fixed',
                  label: 'Stálé platby',
                  detail: `poměrná část z ${kc(s.fixedMonthly)}/měs.`,
                  value: kc(p.fixedCost, dig),
                  amount: p.fixedCost,
                  color: 'var(--hb-t3)',
                },
              ]}
            />
          </div>
        </div>
      )}
      {p && (
        <div className="en-cost-spot" data-testid="energy-cost-spot">
          {spot ? (
            <p className="en-cost-spot-line" data-testid="energy-cost-spot-diff">
              Pro srovnání: se spotovým tarifem by to vyšlo <b>{kc(spot.total, dig)}</b>
              {diff !== null &&
                (Math.abs(diff) < 0.5
                  ? ' – stejně jako teď'
                  : ` – o ${kc(Math.abs(diff), dig)} ${diff > 0 ? 'dráž' : 'levněji'}`)}
              {spot.coverage < 0.95 &&
                ` (spotové ceny jen pro ${fmt(spot.coverage * 100, 0)} % odběru)`}
            </p>
          ) : (
            <p className="en-cost-spot-line" data-testid="energy-cost-spot-missing">
              Srovnání se spotem: doplňte ve vazbách distribuci VT/NT (s poplatky a DPH).
            </p>
          )}
        </div>
      )}
      <details className="en-cost-more" data-testid="energy-cost-basis">
        <summary>Jak to počítáme</summary>
        <p>
          Odběr ze sítě po hodinách × cena VT/NT podle HDO, plus stálé platby poměrně podle
          uplynulého času. Měří střídač, fakturační elektroměr může ukázat víc
          {s.correction !== 1 ? ` (použitá korekce ×${fmt(s.correction, 2)})` : ''}. Ceny podle
          aktuálního tarifu.
        </p>
        <p>
          Úspora = energie, kterou pokryla FVE a baterie, oceněná cenou VT/NT dané hodiny; bez
          příjmu za přetoky.
        </p>
        {spot && (
          <p>
            Spot = hodinová cena + přirážka {fmt(s.spotMarkup, 2)} Kč/kWh, obojí s DPH, + distribuce
            VT/NT ({kc(spot.energyCost, dig)}) a stálé platby spotového produktu{' '}
            {kc(s.spotFixedMonthly)}/měs. ({kc(spot.fixedCost, dig)}). Spot je jen srovnání, ne
            doporučení.
          </p>
        )}
      </details>
    </section>
  );
}

export function EnergyScreen({
  model,
  history,
  appliances = [],
  pv = PV_FORECAST_NONE,
  phaseHistory = PHASE_HISTORY_NONE,
  thermalHistory = THERMAL_HISTORY_NONE,
  cost = null,
  comparison = { status: 'unconfigured' },
  invoices = null,
}: {
  model: EnergyModel;
  /** Energie „Faktury“ card (needs the connection; absent in pure screen tests). */
  invoices?: ReactNode;
  cost?: CostView | null;
  comparison?: Comparison;
  history: EnergyHistory;
  appliances?: ApplianceReading[];
  pv?: PvForecast;
  phaseHistory?: PhaseHistory;
  thermalHistory?: ThermalHistory;
}) {
  const pvTodayKwh = pvUsable(pv) ? pv.days[localParts(model.now, model.timeZone).day] : undefined;
  const signals = useMemo(
    () => [
      ...energySignals(model, history),
      ...applianceSignals(
        Object.fromEntries(appliances.map((a) => [a.slot, a.cycle])),
        model.now,
        model.timeZone,
      ),
    ],
    [model, history, appliances],
  );
  const t = model.today;
  const nextPrice = model.price.next;
  const priceSpark = model.price.series
    .filter((p) => p.end > model.now - 6 * HOUR && p.start < model.now + 18 * HOUR)
    .map((p) => p.price);
  const interval = model.price.intervalMinutes;
  return (
    <div className="en-root">
      <header className="en-head">
        <div>
          <h1>Energie</h1>
          <p className="en-sub">
            FVE · baterie · 3 fáze · <b>spotová cena</b>
            {interval ? ` po ${interval === 60 ? 'hodinách' : `${interval} min`}` : ''}
          </p>
        </div>
        <div className="en-head-r">
          {model.inverter && (
            <span
              className={`en-pill en-pill--${model.inverter.tone}`}
              title={model.inverter.raw}
              data-testid="energy-inverter"
            >
              <i className="en-dot" aria-hidden="true" />
              Střídač · {model.inverter.label}
            </span>
          )}
          <span className="en-pill en-pill--ac">Kč/kWh</span>
          <StatusBadge quality={model.quality} />
        </div>
      </header>
      {model.notices.length > 0 && (
        <ul className="en-notices" aria-label="Oznámení">
          {model.notices.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
      <EnergyFlowHero
        model={model}
        appliances={appliances}
        phaseHistory={phaseHistory}
        thermalHistory={thermalHistory}
      />
      {signals.length > 0 && (
        <ul className="en-signals" aria-label="Postřehy" data-testid="energy-signals">
          {signals.map((s) => (
            <li key={s.id} data-tone={s.tone} data-severity={s.severity}>
              <b>{s.title}</b>
              {s.value && (
                <span className="en-signal-v">
                  {' '}
                  {s.value.v} {s.value.unit}
                </span>
              )}
              <span> · {s.context}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="en-grid">
        <Kpi
          label="Výroba FVE"
          value={fmt(t.pv.value)}
          unit="kWh"
          color="var(--hb-energy-pv)"
          spark={values(history.hourly.energy_pv_energy_today)}
          testId="energy-kpi-pv"
          sub={
            model.forecast.today.value !== null
              ? `předpověď ${fmt(model.forecast.today.value)} kWh`
              : pvTodayKwh !== undefined
                ? `předpověď ${fmt(pvTodayKwh)} kWh`
                : 'dnes'
          }
        />
        <Kpi
          label="Spotřeba"
          value={fmt(t.house.value)}
          unit="kWh"
          color="var(--hb-energy-home)"
          spark={values(history.hourly.energy_house_energy_today)}
          testId="energy-kpi-house"
          sub="dům dnes"
        />
        <Kpi
          label="Nákup ze sítě"
          value={fmt(t.gridImport.value)}
          unit="kWh"
          color="var(--hb-energy-grid)"
          spark={values(history.hourly.energy_grid_import_energy_today)}
          testId="energy-kpi-import"
          sub="dnes"
        />
        <Kpi
          label="Prodej"
          value={fmt(t.gridExport.value)}
          unit="kWh"
          color="var(--hb-ok)"
          spark={values(history.hourly.energy_grid_export_energy_today)}
          testId="energy-kpi-export"
          sub="přetoky dnes"
        />
        <Kpi
          label="Soběstačnost"
          value={fmt(model.selfSufficiencyPercent, 0)}
          unit="%"
          color="var(--hb-ok)"
          testId="energy-kpi-self"
          sub={model.selfSufficiencyPercent === null ? 'nelze spočítat' : 'bez nákupu ze sítě'}
        />
        <Kpi
          label="Spot teď"
          value={fmt(model.price.now.value, 2)}
          unit="Kč/kWh"
          color="var(--hb-warn)"
          spark={priceSpark}
          testId="energy-kpi-price"
          sub={
            nextPrice
              ? `od ${hourOf(nextPrice.start, model.timeZone)} h ${fmt(nextPrice.price, 2)} Kč`
              : 'další hodina bez dat'
          }
        />
        <CostCard cost={cost} model={model} />
        <CompareCard comparison={comparison} />
        {invoices}
        <PriceCard model={model} />
        <DayChart model={model} history={history} />
        <WeekChart model={model} history={history} />
        <BalanceCard model={model} />
        {appliances.length > 0 && <AppliancesCard items={appliances} model={model} />}
      </div>
    </div>
  );
}

export default function EnergyView({
  store,
  bindings,
  connection,
  fetchWithAuth,
  kiosk,
}: ModuleViewProps) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const ids = selectEnergyEntityIds(bindings);
  const entities = useEntities(store, ids);
  const model = useMemo(
    () =>
      adaptEnergyEntities({
        bindings,
        getState: (id) => entities.find((entity) => entity?.entity_id === id),
        now,
      }),
    [bindings, entities, now],
  );
  const [history, setHistory] = useState<EnergyHistory>({
    hourly: {},
    daily: {},
    status: 'idle',
  });
  const bindingsKey = JSON.stringify(bindings);
  const historySlot = Math.floor(now / HISTORY_REFRESH_MS);
  useEffect(() => {
    let cancelled = false;
    if (!connection) {
      queueMicrotask(
        () => !cancelled && setHistory({ hourly: {}, daily: {}, status: 'unsupported' }),
      );
      return () => {
        cancelled = true;
      };
    }
    fetchEnergyHistory(connection, JSON.parse(bindingsKey) as Record<string, string>, Date.now())
      .then((next) => !cancelled && setHistory(next))
      .catch(() => !cancelled && setHistory({ hourly: {}, daily: {}, status: 'error' }));
    return () => {
      cancelled = true;
    };
  }, [connection, bindingsKey, historySlot]);
  const [phaseHistory, setPhaseHistory] = useState<PhaseHistory>(PHASE_HISTORY_NONE);
  useEffect(() => {
    let cancelled = false;
    if (!connection) return;
    fetchPhaseHistory(connection, JSON.parse(bindingsKey) as Record<string, string>, Date.now())
      .then((next) => !cancelled && setPhaseHistory(next))
      .catch(() => !cancelled && setPhaseHistory({ ...PHASE_HISTORY_NONE, status: 'error' }));
    return () => {
      cancelled = true;
    };
  }, [connection, bindingsKey, historySlot]);
  const [thermalHistory, setThermalHistory] = useState<ThermalHistory>(THERMAL_HISTORY_NONE);
  useEffect(() => {
    let cancelled = false;
    if (!connection) return;
    fetchThermalHistory(connection, JSON.parse(bindingsKey) as Record<string, string>, Date.now())
      .then((next) => !cancelled && setThermalHistory(next))
      .catch(() => !cancelled && setThermalHistory({ ...THERMAL_HISTORY_NONE, status: 'error' }));
    return () => {
      cancelled = true;
    };
  }, [connection, bindingsKey, historySlot]);
  const [extras, setExtras] = useState<ApplianceExtras>({});
  const applianceSlot = Math.floor(now / APPLIANCE_REFRESH_MS);
  useEffect(() => {
    let cancelled = false;
    const parsed = JSON.parse(bindingsKey) as Record<string, string>;
    if (!connection || !boundApplianceSlots(parsed).length) return;
    const at = Date.now();
    void Promise.all([
      fetchApplianceToday(connection, parsed, at).catch(() => ({})),
      fetchApplianceCycles(connection, parsed, at).catch(() => ({})),
    ]).then(([todayKwh, cycles]) => !cancelled && setExtras({ todayKwh, cycles }));
    return () => {
      cancelled = true;
    };
  }, [connection, bindingsKey, applianceSlot]);
  const [costHours, setCostHours] = useState<{
    hours: CostHour[] | null;
    status: CostView['status'];
  }>({ hours: null, status: 'loading' });
  useEffect(() => {
    let cancelled = false;
    if (!connection) return;
    fetchCostHours(connection, JSON.parse(bindingsKey) as Record<string, string>, Date.now())
      .then(
        (hours) => !cancelled && setCostHours({ hours, status: hours ? 'ready' : 'unsupported' }),
      )
      .catch(() => !cancelled && setCostHours({ hours: null, status: 'error' }));
    return () => {
      cancelled = true;
    };
  }, [connection, bindingsKey, historySlot]);
  const cost = useMemo<CostView>(() => {
    const getState = (id: string) => entities.find((entity) => entity?.entity_id === id);
    const settings = readTariffSettings(bindings, getState);
    const hdoId = bindings.energy_tariff_hdo?.trim();
    const nextId = bindings.energy_tariff_next_change?.trim();
    const hdoState = hdoId ? getState(hdoId) : undefined;
    const hdo = hdoStatus(hdoState, now, model.timeZone, nextId ? getState(nextId) : null);
    const costs = costHours.hours
      ? computeCosts({
          hours: costHours.hours,
          settings,
          schedule: parseHdoSchedule(hdoState?.attributes),
          now,
          timeZone: model.timeZone,
          liveTodayImportKwh: model.today.gridImport.value,
          liveSpot: model.price.now.value,
        })
      : null;
    return { costs, settings, hdo, status: connection ? costHours.status : 'unsupported' };
  }, [bindings, entities, now, model, costHours, connection]);
  const [comparison, setComparison] = useState<Comparison>({ status: 'loading' });
  useEffect(() => {
    let cancelled = false;
    void fetchComparison(connection ?? null).then((next) => !cancelled && setComparison(next));
    return () => {
      cancelled = true;
    };
  }, [connection, bindingsKey, historySlot]);
  const [pv, setPv] = useState<PvForecast>(PV_FORECAST_NONE);
  const pvSlot = Math.floor(now / PV_REFRESH_MS);
  useEffect(() => {
    let cancelled = false;
    void fetchPvForecast(connection).then((next) => !cancelled && setPv(next));
    return () => {
      cancelled = true;
    };
  }, [connection, pvSlot]);
  const appliances = useMemo(
    () =>
      adaptAppliances({
        bindings,
        getState: (id) => entities.find((entity) => entity?.entity_id === id),
        now,
        houseTodayKwh: model.today.house.value,
        extras,
      }),
    [bindings, entities, now, model.today.house.value, extras],
  );
  return (
    <>
      <style>{energyStyles}</style>
      {ids.length ? (
        <EnergyScreen
          model={model}
          history={history}
          appliances={appliances}
          pv={pv}
          phaseHistory={phaseHistory}
          thermalHistory={thermalHistory}
          cost={cost}
          comparison={comparison}
          invoices={
            <InvoicesCard
              connection={connection}
              fetchWithAuth={fetchWithAuth}
              kiosk={kiosk}
              now={now}
            />
          }
        />
      ) : (
        <div className="en-root">
          <h1>Energie</h1>
          <EmptyState title="Modul Energie nemá nastavené entity.">
            Vazby nastavíte v integraci HomeBrain v Home Assistantu.
          </EmptyState>
        </div>
      )}
    </>
  );
}

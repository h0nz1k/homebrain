import { useMemo, type ReactNode } from 'react';
import { StatusBadge } from '@homebrain/ui';
import { localParts, PHASE_HISTORY_NONE, THERMAL_HISTORY_NONE } from '../../adapter.js';
import type { PhaseHistory, ThermalHistory } from '../../adapter.js';
import { applianceSignals, type ApplianceReading } from '../../appliances.js';
import type { Comparison } from '../../compare.js';
import type { EnergyHistory, EnergyModel } from '../../contract.js';
import type { InvoiceList } from '../../invoices.js';
import { PV_FORECAST_NONE, pvUsable, type PvForecast } from '../../pvForecast.js';
import { energySignals } from '../../signals.js';
import { CompareCard } from '../CompareCard.js';
import { EnergyFlowHero } from '../EnergyFlowHero.js';
import { AppliancesCard } from './AppliancesCard.js';
import { BalanceCard } from './BalanceCard.js';
import { CostCard, type CostView } from './CostCard.js';
import { fmt, values } from './format.js';
import { DayChart, WeekChart } from './HistoryCharts.js';
import { Kpi, Sparkline } from './Kpi.js';
import { PriceCard } from './PriceCard.js';

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
  invoiceList = null,
  offers = null,
}: {
  model: EnergyModel;
  /** Energie „Faktury“ card (needs the connection; absent in pure screen tests). */
  invoices?: ReactNode;
  /** Confirmed/uploaded invoices for compare markers (shared fetch with Faktury). */
  invoiceList?: InvoiceList | null;
  /** Energie „Srovnání nabídek“ card (needs the connection). */
  offers?: ReactNode;
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
  const interval = model.price.intervalMinutes;
  return (
    <div className="en-root">
      <header className="en-head">
        <div>
          <p className="en-sub">
            FVE · baterie · 3 fáze · <b>spotová cena</b>
            {interval ? ` po ${interval === 60 ? 'hodinách' : `${interval} min`}` : ''}
          </p>
        </div>
        <div className="en-head-r">
          {model.inverter && model.inverter.tone !== 'ok' && (
            <span
              className={`en-pill en-pill--${model.inverter.tone}`}
              title={model.inverter.raw}
              data-testid="energy-inverter"
            >
              <i className="en-dot" aria-hidden="true" />
              Střídač · {model.inverter.label}
            </span>
          )}
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
        <section className="en-card en-kpi en-kpi-grid" data-testid="energy-kpi-grid">
          <span className="en-lbl">Síť dnes</span>
          <div className="en-grid-split">
            {(
              [
                [
                  'import',
                  '↓ Nákup',
                  t.gridImport.value,
                  'var(--hb-energy-grid)',
                  history.hourly.energy_grid_import_energy_today,
                ],
                [
                  'export',
                  '↑ Prodej',
                  t.gridExport.value,
                  'var(--hb-energy-grid-export)',
                  history.hourly.energy_grid_export_energy_today,
                ],
              ] as const
            ).map(([key, label, value, color, points]) => (
              <div className="en-grid-half" key={key} data-testid={`energy-kpi-${key}`}>
                <strong className="en-kpi-v">
                  {fmt(value)}
                  <small>{'\u00a0'}kWh</small>
                </strong>
                <span className="en-sub" style={{ color }}>
                  {label}
                </span>
                <Sparkline points={values(points)} color={color} />
              </div>
            ))}
          </div>
          <span className="en-spark-time">posledních 24 h</span>
        </section>
        <Kpi
          label="Soběstačnost"
          gauge={model.selfSufficiencyPercent}
          value={fmt(model.selfSufficiencyPercent, 0)}
          unit="%"
          color="var(--hb-ok)"
          testId="energy-kpi-self"
          sub={model.selfSufficiencyPercent === null ? 'nelze spočítat' : 'bez nákupu ze sítě'}
        />
        <CostCard cost={cost} model={model} />
        <CompareCard comparison={comparison} invoices={invoiceList?.invoices ?? null} />
        {invoices}
        {offers}
        <DayChart model={model} history={history} />
        <WeekChart model={model} history={history} />
        <BalanceCard model={model} />
        {appliances.length > 0 && <AppliancesCard items={appliances} model={model} />}
        {/* Spotová cena až na konci: vlastník ji používá jen výjimečně. */}
        <PriceCard model={model} />
      </div>
    </div>
  );
}

import { useState } from 'react';
import { Breakdown, EmptyState, SegmentedControl } from '@homebrain/ui';
import { localParts } from '../../adapter.js';
import type { EnergyModel } from '../../contract.js';
import type { CostPeriod, Costs, HdoState, TariffSettings } from '../../costs.js';
import { fmt } from './format.js';

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

export function CostCard({ cost, model }: { cost: CostView | null; model: EnergyModel }) {
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
            <strong className="en-cost-v">{kc(p.total, dig)}</strong>
            <span className="en-sub">
              {PERIOD_LABEL[period].toLocaleLowerCase('cs-CZ')} {fromLabel} · {kwh(p.importKwh)} ze
              sítě
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
              Se spotovým tarifem by to vyšlo <b>{kc(spot.total, dig)}</b>
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

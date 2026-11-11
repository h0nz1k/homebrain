import type { ReactNode } from 'react';
import { Card, Chip, czCount } from '@homebrain/ui';
import {
  avgRunLengthMin,
  fmtMotohours,
  heatPumpDeltaT,
  showAtticTemp,
  showDhwReheatHint,
  tankGaugeModel,
} from '../landscape.js';
import { curveAt, fmtDuration, fmtNum, fmtT, roomsModel } from '../model.js';
import type { HeatingHistory, HeatingSnapshot, HistoryKey } from '../types.js';
import { CurveChart, TimeChart } from './charts.js';
import { SideCircuitsLandscape } from './SideCircuits.js';

const SERIES: Record<HistoryKey, { label: string; color: string }> = {
  tank_bottom: { label: 'Nádrž dole', color: 'var(--ht-c-tank)' },
  tank_top: { label: 'Nádrž nahoře', color: 'var(--ht-c-top)' },
  dhw_temp: { label: 'Teplá voda', color: 'var(--ht-c-dhw)' },
  house_supply_temp: { label: 'Do domu', color: 'var(--ht-c-supply)' },
  outdoor_temp: { label: 'Venku', color: 'var(--ht-c-out)' },
  house_ref_temp: { label: 'Doma', color: 'var(--ht-c-home)' },
  compressor_runtime_h: { label: 'Běh kompresoru', color: 'var(--ht-c-tank)' },
};

const LAND_AREAS: Record<string, string> = {
  house: 'house',
  outdoor: 'outdoor',
  store: 'store',
  compressor: 'compressor',
  day: 'day',
  status: 'status',
};

function Panel({
  id,
  title,
  children,
  aside,
  className,
}: {
  id: string;
  title: string;
  children: ReactNode;
  aside?: ReactNode;
  className?: string;
}) {
  return (
    <Card
      className={`ht-land-panel${className ? ` ${className}` : ''}`}
      data-testid={`heating-land-${id}`}
      data-land-area={LAND_AREAS[id]}
    >
      <header className="ht-ch">
        <h3>{title}</h3>
        {aside}
      </header>
      {children}
    </Card>
  );
}

function KvRow({ k, v, hide }: { k: string; v: ReactNode; hide?: boolean }) {
  if (hide) return null;
  return (
    <li>
      <span>{k}</span>
      <b>{v}</b>
    </li>
  );
}

function TankGauge({ snap }: { snap: HeatingSnapshot }) {
  const g = tankGaugeModel(snap);
  if (!g) return null;
  const dhw = snap.dhw;
  return (
    <div className="ht-tank-gauge" data-testid="heating-land-gauge">
      <div className="ht-tank-gauge-bar" aria-hidden="true">
        <i className="ht-tank-gauge-fill" />
        {g.bandBottomFrac !== null && g.bandTopFrac !== null && (
          <em
            className="ht-tank-gauge-band"
            style={{
              bottom: `${g.bandBottomFrac * 100}%`,
              height: `${(g.bandTopFrac - g.bandBottomFrac) * 100}%`,
            }}
          />
        )}
        {g.bottomFrac !== null && (
          <span
            className="ht-tank-gauge-mark ht-tank-gauge-bottom"
            style={{ bottom: `${g.bottomFrac * 100}%` }}
          />
        )}
        {g.topFrac !== null && (
          <span
            className="ht-tank-gauge-mark ht-tank-gauge-top"
            style={{ bottom: `${g.topFrac * 100}%` }}
          />
        )}
      </div>
      <ul className="ht-kv ht-tank-gauge-kv">
        <KvRow k="Nádrž nahoře" v={fmtT(g.top)} hide={g.top === null} />
        <KvRow k="Dole" v={fmtT(g.bottom)} hide={g.bottom === null} />
        <KvRow
          k="Cíl nádrže"
          v={
            g.target !== null && g.hyst !== null
              ? `${fmtT(g.target, 0)} ± ${fmtNum(g.hyst, 0)}\u00a0°C`
              : fmtT(g.target, 0)
          }
          hide={g.target === null}
        />
        <KvRow k="Cíl TUV" v={fmtT(dhw.target, 0)} hide={dhw.target === null} />
        <KvRow k="Dohřev pod" v={fmtT(dhw.reheat_below, 0)} hide={dhw.reheat_below === null} />
      </ul>
      {showDhwReheatHint(dhw) && (
        <p className="ht-muted ht-tank-gauge-hint">
          Dohřeje pod {fmtT(dhw.reheat_below, 0)} (cíl {fmtT(dhw.target, 0)})
        </p>
      )}
    </div>
  );
}

function Legend({ keys, runs }: { keys: HistoryKey[]; runs?: boolean }) {
  return (
    <span className="ht-legend">
      {keys.map((k) => (
        <span key={k}>
          <i style={{ background: SERIES[k].color }} />
          {SERIES[k].label}
        </span>
      ))}
      {runs && (
        <span>
          <i className="ht-legend-run" />
          Kompresor
        </span>
      )}
    </span>
  );
}

export function LandscapeDashboard({
  snap,
  day,
  domain,
  nowMs,
  goRooms,
}: {
  snap: HeatingSnapshot;
  day: HeatingHistory | null | undefined;
  domain: [number, number] | null;
  nowMs: number;
  goRooms: () => void;
}) {
  const h = snap.house;
  const hp = snap.heat_pump;
  const target = h.ref_target_effective ?? h.ref_target;
  const out = snap.curve.outdoor_now ?? snap.outdoor.temp;
  const curveY = out !== null ? curveAt(snap.curve.points, out) : null;
  const tankTarget = snap.tank.curve_target ?? snap.tank.target;
  const avg = avgRunLengthMin(hp.runtime_today_h, hp.starts_today);
  const delta = heatPumpDeltaT(snap);
  const faults = snap.faults.active.length;
  const rooms = roomsModel(snap);
  const mode = snap.mode;

  return (
    <aside className="ht-land-dash-inner">
      <SideCircuitsLandscape snap={snap} />
      <Panel id="house" title="Dům">
        <ul className="ht-kv">
          <KvRow k="Referenční místnost" v={fmtT(h.ref_temp)} hide={h.ref_temp === null} />
          <KvRow
            k="Cíl ± hystereze"
            v={
              target !== null && h.hysteresis !== null
                ? `${fmtT(target)} ± ${fmtNum(h.hysteresis)}\u00a0°C`
                : fmtT(target)
            }
            hide={target === null}
          />
          <KvRow k="Půda" v={fmtT(h.attic_temp)} hide={!showAtticTemp(h.attic_temp)} />
          <KvRow
            k="Útlum"
            v={mode.setback_active ? 'běží' : 'ne'}
            hide={mode.setback_active === null}
          />
          <KvRow k="Okruh domu" v={h.circuit_on ? 'topí' : 'stojí'} hide={h.circuit_on === null} />
        </ul>
      </Panel>

      <Panel id="outdoor" title="Venku a ekviterm">
        <ul className="ht-kv">
          <KvRow k="Teplota" v={fmtT(snap.outdoor.temp)} hide={snap.outdoor.temp === null} />
          <KvRow
            k="Dnes min / max"
            v={`${fmtT(snap.outdoor.min_today)} až ${fmtT(snap.outdoor.max_today)}`}
            hide={snap.outdoor.min_today === null || snap.outdoor.max_today === null}
          />
          <KvRow k="Cíl nádrže (křivka)" v={fmtT(tankTarget, 0)} hide={tankTarget === null} />
        </ul>
        {snap.curve.points.length > 0 && (
          <div className="ht-land-curve">
            <CurveChart
              points={snap.curve.points}
              now={out !== null && curveY !== null ? { x: out, y: curveY } : null}
              compact
              markTarget={tankTarget}
            />
          </div>
        )}
      </Panel>

      <Panel id="store" title="Nádrž">
        <TankGauge snap={snap} />
      </Panel>

      <Panel id="compressor" title="Kompresor dnes">
        <ul className="ht-kv">
          <KvRow
            k="Běh"
            v={`${fmtNum(hp.runtime_today_h)}\u00a0h`}
            hide={hp.runtime_today_h === null}
          />
          <KvRow
            k="Starty"
            v={
              hp.starts_today !== null ? czCount(hp.starts_today, 'start', 'starty', 'startů') : '–'
            }
            hide={hp.starts_today === null}
          />
          <KvRow
            k="Elektřina"
            v={`${fmtNum(hp.energy_today_kwh)}\u00a0kWh`}
            hide={hp.energy_today_kwh === null}
          />
          <KvRow k="Ø délka běhu" v={avg !== null ? fmtDuration(avg) : '–'} hide={avg === null} />
          <KvRow k="Motohodiny" v={fmtMotohours(hp.motohours)} hide={hp.motohours === null} />
          <KvRow k="ΔT TČ" v={`${fmtNum(delta)}\u00a0°C`} hide={delta === null} />
          <KvRow
            k="Běží od"
            v={
              hp.running_since && hp.compressor_on
                ? fmtDuration(Math.max(0, (nowMs - Date.parse(hp.running_since)) / 60_000))
                : '—'
            }
            hide={hp.compressor_on !== true || !hp.running_since}
          />
        </ul>
      </Panel>

      {domain && day && (
        <Panel id="day" title="Posledních 24 h" className="ht-land-day">
          <Legend keys={['dhw_temp', 'tank_bottom', 'outdoor_temp']} runs />
          <TimeChart
            range="day"
            domain={domain}
            height={120}
            series={day.series.map((s) => ({
              ...SERIES[s.key],
              key: s.key,
              points: s.points,
              band: s.key === 'tank_bottom',
            }))}
            runs={day.runs}
            testid="heating-land-day-chart"
          />
        </Panel>
      )}

      <Panel id="status" title="Stav">
        <ul className="ht-kv">
          <KvRow
            k="Poruchy"
            v={faults ? snap.faults.active.map((f) => f.label).join(' · ') : 'V pořádku'}
          />
          <KvRow
            k="Tarif HDO"
            v={mode.hdo_low_tariff ? 'nízký' : 'vysoký'}
            hide={mode.hdo_low_tariff === null}
          />
          <KvRow
            k="Sezóna"
            v={
              mode.season
                ? `${mode.season === 'winter' ? 'zima' : 'léto'}${mode.auto_season ? ' · auto' : ''}`
                : '—'
            }
            hide={!mode.season && mode.auto_season === null}
          />
          <KvRow
            k="Hlavní vypínač"
            v={mode.main_switch ? 'zapnuto' : 'vypnuto'}
            hide={mode.main_switch === null}
          />
        </ul>
        {rooms.rows.length > 0 && (
          <footer className="ht-land-rooms-link">
            <button type="button" className="ht-link" onClick={goRooms}>
              Místnosti ({rooms.rows.length}) ›
            </button>
          </footer>
        )}
      </Panel>
    </aside>
  );
}

export function LandscapePumpChips({ snap }: { snap: HeatingSnapshot }) {
  return (
    <div className="ht-land-pump-chips" data-testid="heating-land-pumps">
      {snap.pumps.secondary !== null && (
        <Chip size="sm">nádrž · {snap.pumps.secondary ? 'běží' : 'stojí'}</Chip>
      )}
      {snap.pumps.heating !== null && (
        <Chip size="sm">topení · {snap.pumps.heating ? 'běží' : 'stojí'}</Chip>
      )}
      {snap.pumps.circulation !== null && (
        <Chip size="sm">cirkulace · {snap.pumps.circulation ? 'běží' : 'stojí'}</Chip>
      )}
    </div>
  );
}

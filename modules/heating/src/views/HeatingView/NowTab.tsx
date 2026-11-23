import { Suspense, lazy, useState } from 'react';
import { Button, Card, Chip, Pill, Skeleton, czCount } from '@homebrain/ui';
import type { HeatingApi } from '../../api.js';
import {
  activityModel,
  bannerAlert,
  fmtDuration,
  fmtHpPower,
  fmtNum,
  fmtT,
  heroSectionLabel,
  hpElectricityVisible,
  roomsModel,
  tankSecondaryChipLabel,
} from '../../model.js';
import type { HeatingSnapshot } from '../../types.js';
import { solarStateOf } from '../../solar.js';
import { showAtticTemp } from '../../landscape.js';
import { TimeChart } from '../charts.js';
import { LandscapeDashboard, LandscapePumpChips } from '../LandscapeDashboard.js';
import { SideCircuitsPortrait, SolarPortraitBanner } from '../SideCircuits.js';
import { HeatingSchematic } from '../Schematic.js';
import { AdvisorCards } from '../AdvisorCard.js';
import { AlertBanner, HpElectricityBar, Legend, Stat } from './NowCards.js';
import { DAY_KEYS, SERIES } from './series.js';
import type { TabId } from './tabs.js';
import { nowMs } from './time.js';
import { useHistory } from './useHeating.js';

/** Full schematic (fullscreen pan/zoom): own chunk, loaded on first open. */
const FullSchematicSheet = lazy(() =>
  import('../../full/FullSchematicSheet.js').then((m) => ({ default: m.FullSchematicSheet })),
);

export function NowTab({
  snap,
  api,
  go,
}: {
  snap: HeatingSnapshot;
  api: HeatingApi;
  go: (t: TabId) => void;
}) {
  const act = activityModel(snap, nowMs());
  const copies: Partial<Record<HeatingSnapshot['activity'], readonly [string, string, string]>> = {
    heating_tank: ['Právě nahříváme nádrž.', 'Teplo ze země ukládáme na později.', 'Ohřev nádrže'],
    heating_dhw: [
      'Dohříváme teplou vodu.',
      'Ohříváme horní část zásoby pro TUV.',
      'Ohřev teplé vody',
    ],
    house_circuit: [
      'Dům čerpá teplo z nádrže.',
      'Zásoba tepla právě zahřívá radiátory.',
      'Vytápění domu',
    ],
    idle: ['Teplo je připravené.', 'Zásoba čeká na další potřebu tepla.', 'Klidový režim'],
  };
  const copy = copies[snap.activity];
  const solarStory = solarStateOf(snap);
  const sceneCopy =
    snap.source === 'ok' &&
    !snap.stale &&
    copy &&
    solarStory !== 'heating' &&
    solarStory !== 'no_gain' &&
    solarStory !== 'stagnation'
      ? copy
      : undefined;
  const day = useHistory(api, 'day', DAY_KEYS);
  const rooms = roomsModel(snap);
  const hp = snap.heat_pump;
  const dhwShare = snap.dhw.temp !== null ? Math.max(0, Math.min(1, (snap.dhw.temp - 30) / 30)) : 0;
  const dhwMark =
    snap.dhw.target !== null ? Math.max(0, Math.min(1, (snap.dhw.target - 30) / 30)) : null;
  const faults = snap.faults.active.length;
  const criticalFault = snap.faults.fatal || snap.faults.compressor_block;
  const domain: [number, number] | null = day?.series[0]?.points.length
    ? [day.series[0].points[0]![0], day.series[0].points.at(-1)![0]]
    : null;
  const tick = nowMs();
  const compressorLine =
    hp.compressor_on === null
      ? 'Kompresor —'
      : hp.compressor_on
        ? `Kompresor běží${hp.running_since && Number.isFinite(Date.parse(hp.running_since)) ? ` ${fmtDuration(Math.max(0, (tick - Date.parse(hp.running_since)) / 60_000))}` : ''}`
        : 'Kompresor stojí';
  const powerLine = fmtHpPower(hp.power_w);
  const landHeadline =
    sceneCopy?.[0] ??
    `${act.headline[0]}${act.headline[1]}${act.headline[2]}`.replace(/\s+/g, ' ').trim();
  const heroCardTone =
    act.tone === 'crit'
      ? 'critical'
      : act.tone === 'warn'
        ? 'warning'
        : act.state === 'off'
          ? 'notice'
          : 'calm';
  const showCompressorMeta = act.state !== 'off';
  const [fullOpen, setFullOpen] = useState(false);
  return (
    <div className="ht-now">
      <AlertBanner snap={snap} onDetail={() => go('poruchy')} />
      <Card
        className="ht-hero ht-hero-now"
        tone={heroCardTone}
        data-testid="heating-hero"
        data-state={act.state}
      >
        <div className="ht-now-hero-grid">
          <header className="ht-land-strip ht-land-only" data-testid="heating-land-strip">
            <Pill tone={act.tone} dot>
              {sceneCopy?.[2] ?? act.pill}
            </Pill>
            <p className="ht-land-strip-head">{landHeadline}</p>
            {showCompressorMeta && (
              <p className="ht-land-strip-meta">
                <span>{compressorLine}</span>
                <span className="ht-land-strip-sep" aria-hidden="true">
                  ·
                </span>
                <b className={hp.power_w === null ? 'ht-muted' : undefined}>
                  Elektřina TČ {powerLine}
                  {hp.energy_today_kwh !== null
                    ? ` · dnes ${fmtNum(hp.energy_today_kwh)}\u00a0kWh`
                    : ''}
                </b>
              </p>
            )}
            <LandscapePumpChips snap={snap} />
            {act.solarWarn && !bannerAlert(snap) && (
              <p className="ht-insight ht-land-only">{act.solarWarn}</p>
            )}
          </header>
          <div className="ht-hero-copy ht-portrait-hero-copy">
            <span className="ht-k">{heroSectionLabel(snap)}</span>
            <Pill tone={act.tone} dot data-testid="heating-pill">
              {sceneCopy?.[2] ?? act.pill}
            </Pill>
            <h2 data-testid="heating-headline">
              {sceneCopy?.[0] ?? (
                <>
                  {act.headline[0]}
                  <b>{act.headline[1]}</b>
                  {act.headline[2]}
                </>
              )}
            </h2>
            {(sceneCopy?.[1] ?? act.detail) ? (
              <p className="ht-hero-detail">{sceneCopy?.[1] ?? act.detail}</p>
            ) : null}
            {act.solarWarn && !bannerAlert(snap) && (
              <p className="ht-insight" data-testid="heating-solar-warn">
                {act.solarWarn}
              </p>
            )}
            {showCompressorMeta && (
              <p className="ht-run-meta">
                <span>{compressorLine}</span>
                {hpElectricityVisible(snap) && (
                  <b>
                    Elektřina TČ {powerLine}
                    {hp.energy_today_kwh !== null
                      ? ` · dnes ${fmtNum(hp.energy_today_kwh)}\u00a0kWh`
                      : ''}
                  </b>
                )}
              </p>
            )}
          </div>
          <div className="ht-now-schematic">
            <HeatingSchematic snap={snap} />
            <Button
              type="button"
              variant="ghost"
              className="ht-full-open"
              data-testid="heating-full-open"
              onClick={() => setFullOpen(true)}
            >
              Celé schéma
            </Button>
          </div>
          <aside className="ht-land-dash" data-testid="heating-land-dash">
            <LandscapeDashboard
              snap={snap}
              day={day}
              domain={domain}
              nowMs={tick}
              goRooms={() => go('mistnosti')}
            />
          </aside>
        </div>
        <div className="ht-c3-chips ht-portrait-only">
          <Chip>{tankSecondaryChipLabel(snap)}</Chip>
          <Chip>
            Topení · {snap.pumps.heating === null ? '—' : snap.pumps.heating ? 'běží' : 'stojí'}
          </Chip>
          {showAtticTemp(snap.house.attic_temp) && (
            <Chip data-testid="heating-attic-portrait">Půda · {fmtT(snap.house.attic_temp)}</Chip>
          )}
          {snap.mode.season && (
            <Pill>{snap.mode.season === 'winter' ? 'Zima · ekviterm' : 'Léto'}</Pill>
          )}
          {snap.mode.hdo_low_tariff !== null && (
            <Pill tone={snap.mode.hdo_low_tariff ? 'ok' : 'warn'} data-testid="heating-hdo">
              {snap.mode.hdo_low_tariff ? 'Nízký tarif' : 'Vysoký tarif'}
            </Pill>
          )}
        </div>
      </Card>
      {fullOpen && (
        <Suspense fallback={null}>
          <FullSchematicSheet snap={snap} open onClose={() => setFullOpen(false)} />
        </Suspense>
      )}
      <HpElectricityBar snap={snap} className="ht-card ht-portrait-only" />
      <SolarPortraitBanner snap={snap} />
      <div className="ht-stats ht-portrait-only">
        <Stat
          id="outdoor"
          label="Venku"
          value={fmtT(snap.outdoor.temp)}
          sub={`dnes ${fmtT(snap.outdoor.min_today)} až ${fmtT(snap.outdoor.max_today)}`}
        />
        <Stat
          id="dhw"
          label="Teplá voda"
          value={fmtT(snap.dhw.temp)}
          sub={`cíl ${fmtT(snap.dhw.target, 0)}, dohřívá pod ${fmtT(snap.dhw.reheat_below, 0)}`}
        >
          <span className="ht-meter" aria-hidden="true">
            <i style={{ transform: `scaleX(${dhwShare})` }} />
            {dhwMark !== null && <em style={{ left: `${dhwMark * 100}%` }} />}
          </span>
        </Stat>
        <Stat
          id="today"
          label="Dnes"
          tone={hp.cycling?.short_cycling ? 'warn' : undefined}
          value={`${fmtNum(hp.runtime_today_h)}\u00a0h běhu`}
          sub={`${hp.starts_today !== null ? czCount(hp.starts_today, 'start', 'starty', 'startů') : '–'}${hp.energy_today_kwh !== null ? ` · ${fmtNum(hp.energy_today_kwh)}\u00a0kWh` : ''}${hp.cycling?.short_cycling ? ' · často spíná' : ''}`}
        />
        <Stat
          id="faults"
          label="Poruchy"
          tone={criticalFault ? 'crit' : faults ? 'warn' : 'ok'}
          value={
            faults
              ? czCount(faults, 'porucha', 'poruchy', 'poruch')
              : criticalFault
                ? 'Porucha'
                : 'Vše v pořádku'
          }
          sub={`hlídá ${czCount(snap.faults.monitored, 'čidlo a ochranu', 'čidla a ochrany', 'čidel a ochran')}`}
        />
      </div>
      <div className="ht-row ht-portrait-only">
        <Card className="ht-card ht-grow" data-testid="heating-day">
          <header className="ht-ch">
            <h3>Posledních 24 hodin</h3>
            <Legend keys={['dhw_temp', 'tank_bottom', 'outdoor_temp']} runs />
          </header>
          {day === undefined || !domain ? (
            <Skeleton variant="block" height="200px" />
          ) : (
            <>
              <TimeChart
                range="day"
                domain={domain}
                height={190}
                series={day!.series.map((s) => ({
                  ...SERIES[s.key],
                  key: s.key,
                  points: s.points,
                  band: s.key === 'tank_bottom',
                }))}
                runs={day!.runs}
              />
            </>
          )}
        </Card>
        <Card className="ht-card ht-side" data-testid="heating-rooms-mini">
          <header className="ht-ch">
            <h3>Místnosti</h3>
            <Button size="sm" variant="ghost" onClick={() => go('mistnosti')}>
              Všechny ›
            </Button>
          </header>
          {rooms.rows.length ? (
            <>
              <ul className="ht-mini">
                {rooms.rows.slice(0, 3).map((r) => (
                  <li key={r.id}>
                    <span>{r.name}</span>
                    <b>{fmtT(r.temp)}</b>
                    <em data-cold={r.delta !== null && r.delta < -0.5 ? '' : undefined}>
                      {r.delta === null ? '' : `${r.delta > 0 ? '+' : ''}${fmtNum(r.delta)}`}
                    </em>
                  </li>
                ))}
              </ul>
              {rooms.insight && <p className="ht-insight">{rooms.insight}</p>}
            </>
          ) : (
            <p className="ht-muted">
              Zatím jen referenční místnost (chodba) {fmtT(snap.house.ref_temp)}. Čidla a hlavice v
              pokojích přidá správce v nastavení.
            </p>
          )}
        </Card>
      </div>
      <div className="ht-row ht-land-rooms-only">
        <Card className="ht-card ht-grow" data-testid="heating-rooms-mini-land">
          <header className="ht-ch">
            <h3>Místnosti</h3>
            <Button size="sm" variant="ghost" onClick={() => go('mistnosti')}>
              Všechny ›
            </Button>
          </header>
          {rooms.rows.length ? (
            <>
              <ul className="ht-mini">
                {rooms.rows.slice(0, 4).map((r) => (
                  <li key={r.id}>
                    <span>{r.name}</span>
                    <b>{fmtT(r.temp)}</b>
                    <em data-cold={r.delta !== null && r.delta < -0.5 ? '' : undefined}>
                      {r.delta === null ? '' : `${r.delta > 0 ? '+' : ''}${fmtNum(r.delta)}`}
                    </em>
                  </li>
                ))}
              </ul>
              {rooms.insight && <p className="ht-insight">{rooms.insight}</p>}
            </>
          ) : (
            <p className="ht-muted">
              Zatím jen referenční místnost (chodba) {fmtT(snap.house.ref_temp)}. Čidla a hlavice v
              pokojích přidá správce v nastavení.
            </p>
          )}
        </Card>
      </div>
      <SideCircuitsPortrait snap={snap} />
      <AdvisorCards advisor={snap.advisor} />
    </div>
  );
}

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { navigateTab, type ModuleViewProps } from '@homebrain/ha-client';
import {
  Button,
  Card,
  Chip,
  EmptyState,
  Pill,
  ProgressRing,
  SegmentedControl,
  Skeleton,
  czCount,
} from '@homebrain/ui';
import { getHeatingApi, type HeatingApi } from '../api.js';
import {
  HEATING_BREAK_TS,
  RANGE_LABELS,
  activityModel,
  curveAt,
  efficiencyModel,
  fmtDuration,
  fmtNum,
  fmtPctChange,
  fmtSeasonEnergy,
  fmtT,
  roomsModel,
  schematicState,
  seasonsModel,
} from '../model.js';
import type {
  HeatingHistory,
  HeatingSeason,
  HeatingSnapshot,
  HistoryKey,
  HistoryRange,
} from '../types.js';
import {
  CurveChart,
  Scatter,
  ScheduleRibbon,
  SeasonBars,
  TimeChart,
  type ChartSeries,
} from './charts.js';
import { HeatingSchematic } from './Schematic.js';
import { heatingStyles } from './styles.js';

type TabId = 'ted' | 'mistnosti' | 'trendy' | 'sezony' | 'rezimy' | 'poruchy';
const TABS: ReadonlyArray<readonly [TabId, string]> = [
  ['ted', 'Teď'],
  ['mistnosti', 'Místnosti'],
  ['trendy', 'Trendy'],
  ['sezony', 'Sezóny'],
  ['rezimy', 'Režimy'],
  ['poruchy', 'Poruchy'],
];
const tabFromRoute = (path: string | undefined): TabId => {
  const seg = (path ?? '').split('/').filter(Boolean).pop();
  return TABS.some(([id]) => id === seg) ? (seg as TabId) : 'ted';
};

const POLL_MS = 30_000;
const SERIES: Record<HistoryKey, { label: string; color: string }> = {
  tank_bottom: { label: 'Nádrž dole', color: 'var(--ht-c-tank)' },
  tank_top: { label: 'Nádrž nahoře', color: 'var(--ht-c-top)' },
  dhw_temp: { label: 'Teplá voda', color: 'var(--ht-c-dhw)' },
  house_supply_temp: { label: 'Do domu', color: 'var(--ht-c-supply)' },
  outdoor_temp: { label: 'Venku', color: 'var(--ht-c-out)' },
  house_ref_temp: { label: 'Doma', color: 'var(--ht-c-home)' },
  compressor_runtime_h: { label: 'Běh kompresoru', color: 'var(--ht-c-tank)' },
};
const OVERLAYS: HistoryKey[] = ['tank_bottom', 'dhw_temp', 'house_supply_temp', 'outdoor_temp'];
const DAY_KEYS: HistoryKey[] = ['tank_bottom', 'dhw_temp', 'outdoor_temp'];
const EFF_KEYS: HistoryKey[] = ['outdoor_temp', 'compressor_runtime_h'];

function useHeating(api: HeatingApi | null) {
  const [snap, setSnap] = useState<HeatingSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    if (!api) return;
    api.get().then(
      (s) => {
        setSnap(s);
        setError(null);
      },
      (e: unknown) => setError(e instanceof Error ? e.message : 'Topení neodpovědělo.'),
    );
  }, [api]);
  useEffect(() => {
    load();
    const unsub = api?.subscribe?.((s) => setSnap(s));
    const tick = setInterval(() => {
      if (typeof document === 'undefined' || !document.hidden) load();
    }, POLL_MS);
    return () => {
      clearInterval(tick);
      unsub?.();
    };
  }, [api, load]);
  return { snap, error };
}

function useHistory(api: HeatingApi | null, range: HistoryRange, keys: HistoryKey[]) {
  const [data, setData] = useState<{ id: string; h: HeatingHistory | null } | null>(null);
  const id = `${range}:${keys.join(',')}`;
  useEffect(() => {
    if (!api) return;
    let live = true;
    api.history(range, keys).then(
      (h) => live && setData({ id, h }),
      () => live && setData({ id, h: null }),
    );
    return () => {
      live = false;
    };
    // keys are part of `id`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, id]);
  return data?.id === id ? data.h : undefined;
}

const nowMs = () => Date.now();
function ago(iso: string | null): string {
  if (!iso) return 'neznámo kdy';
  const s = Math.max(0, (nowMs() - Date.parse(iso)) / 1000);
  if (s < 60) return `před ${Math.round(s)}\u00a0s`;
  return `před ${fmtDuration(s / 60)}`;
}

/* ---------- Teď ---------- */

function Stat({
  id,
  label,
  value,
  sub,
  tone,
  children,
}: {
  id: string;
  label: string;
  value: ReactNode;
  sub: ReactNode;
  tone?: 'ok' | 'warn' | 'crit';
  children?: ReactNode;
}) {
  return (
    <Card className="ht-stat" data-testid={`heating-stat-${id}`} data-tone={tone}>
      <span className="ht-k">{label}</span>
      <b className="ht-v">{value}</b>
      <span className="ht-sub">{sub}</span>
      {children}
    </Card>
  );
}

function NowTab({
  snap,
  api,
  go,
}: {
  snap: HeatingSnapshot;
  api: HeatingApi;
  go: (t: TabId) => void;
}) {
  const act = activityModel(snap, nowMs());
  const st = schematicState(snap);
  const day = useHistory(api, 'day', DAY_KEYS);
  const rooms = roomsModel(snap);
  const hp = snap.heat_pump;
  const dhwShare = snap.dhw.temp !== null ? Math.max(0, Math.min(1, (snap.dhw.temp - 30) / 30)) : 0;
  const dhwMark =
    snap.dhw.target !== null ? Math.max(0, Math.min(1, (snap.dhw.target - 30) / 30)) : null;
  const faults = snap.faults.active.length;
  const extras: Array<[string, number | null]> = [];
  if (snap.extras.solar) extras.push(['Solár', snap.extras.solar.temp]);
  if (snap.extras.pool) extras.push(['Bazén', snap.extras.pool.temp]);
  if (snap.extras.fish) extras.push(['Rybárna', snap.extras.fish.temp]);
  const domain: [number, number] | null = day?.series[0]?.points.length
    ? [day.series[0].points[0]![0], day.series[0].points.at(-1)![0]]
    : null;
  return (
    <>
      <Card
        className="ht-hero"
        tone={act.tone === 'crit' ? 'critical' : act.tone === 'warn' ? 'warning' : 'calm'}
        data-testid="heating-hero"
        data-state={act.state}
      >
        <div className="ht-hero-copy">
          <h2 data-testid="heating-headline">
            {act.headline[0]}
            <b>{act.headline[1]}</b>
            {act.headline[2]}
          </h2>
          <p className="ht-hero-detail">{act.detail}</p>
          <div className="ht-pills">
            <Pill tone={act.tone} dot data-testid="heating-pill">
              {act.pill}
            </Pill>
            {snap.mode.season && (
              <Pill>{snap.mode.season === 'winter' ? 'Zima · ekviterm' : 'Léto'}</Pill>
            )}
            {snap.mode.hdo_low_tariff !== null && (
              <Pill tone={snap.mode.hdo_low_tariff ? 'ok' : 'warn'} data-testid="heating-hdo">
                {snap.mode.hdo_low_tariff ? 'Nízký tarif' : 'Vysoký tarif'}
              </Pill>
            )}
          </div>
          <p className="ht-big">
            {fmtNum(snap.house.ref_temp)}
            <small>°C</small>
          </p>
          <p className="ht-hero-sub">
            doma (chodba – referenční místnost) · cíl{' '}
            {fmtT(snap.house.ref_target_effective ?? snap.house.ref_target)}
          </p>
        </div>
        <HeatingSchematic snap={snap} state={st} />
      </Card>
      <div className="ht-stats">
        <Stat
          id="outdoor"
          label="Venku"
          value={fmtT(snap.outdoor.temp)}
          sub={`dnes ${fmtNum(snap.outdoor.min_today)} až ${fmtT(snap.outdoor.max_today)}`}
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
          value={`${fmtNum(hp.runtime_today_h)}\u00a0h běhu`}
          sub={`${hp.starts_today !== null ? czCount(hp.starts_today, 'start', 'starty', 'startů') : '–'}${hp.energy_today_kwh !== null ? ` · ${fmtNum(hp.energy_today_kwh)}\u00a0kWh` : ''}`}
        />
        <Stat
          id="faults"
          label="Poruchy"
          tone={faults ? 'crit' : 'ok'}
          value={faults ? czCount(faults, 'porucha', 'poruchy', 'poruch') : 'Vše v pořádku'}
          sub={`hlídá ${czCount(snap.faults.monitored, 'čidlo a ochranu', 'čidla a ochrany', 'čidel a ochran')}`}
        />
      </div>
      <div className="ht-row">
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
      {extras.length > 0 && (
        <div className="ht-extras" data-testid="heating-extras">
          <span>Další okruhy · jen měření</span>
          {extras.map(([name, temp]) => (
            <Pill key={name}>
              {name} {fmtT(temp)}
            </Pill>
          ))}
        </div>
      )}
    </>
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

/* ---------- Místnosti ---------- */

function RoomsTab({ snap }: { snap: HeatingSnapshot }) {
  const m = roomsModel(snap);
  const h = snap.house;
  return (
    <>
      <Card className="ht-ref" tone="calm" data-testid="heating-ref-room">
        <div>
          <div className="ht-pills">
            <Pill tone="accent">Referenční místnost · chodba</Pill>
            <Pill tone={h.circuit_on ? 'ok' : 'neutral'} dot data-testid="heating-circuit">
              {h.circuit_on ? 'Okruh domu topí' : 'Okruh domu stojí'}
            </Pill>
          </div>
          <p className="ht-big">
            {fmtNum(h.ref_temp)}
            <small>°C</small>
          </p>
          <p className="ht-hero-sub">
            čidlo regulace TČ · cíl {fmtT(h.ref_target_effective ?? h.ref_target)} · hystereze{' '}
            {fmtNum(h.hysteresis)}&nbsp;°C
          </p>
          <p className="ht-hero-detail">
            Chodba řídí topení celého domu. Když dosáhne cílové teploty, čerpadlo topení se zastaví
            – i když je v jiném pokoji chladněji.
          </p>
        </div>
        <div className="ht-ref-notes">
          {m.rows.length === 0 && (
            <div className="ht-bind-help" data-testid="heating-rooms-empty">
              <h3>Přidejte přehled o pokojích</h3>
              <p>Uvidíte, kde je teplo a kde ještě přitopit.</p>
              <ol>
                <li>Spárujte teploměry Aqara nebo termostatické hlavice přes Zigbee2MQTT.</li>
                <li>
                  V Nastavení HomeBrain → Moduly → Topení vyberte čidla a hlavice pro jednotlivé
                  pokoje.
                </li>
              </ol>
              <p>Stačí i samotný teploměr. Pokoje se pak seřadí od nejchladnějšího.</p>
            </div>
          )}
          {m.insight && (
            <Card tone="notice" className="ht-note" data-testid="heating-rooms-insight">
              <b>Nejchladnější místnost</b>
              <p>{m.insight}</p>
            </Card>
          )}
          {m.throttle && (
            <Card tone="warning" className="ht-note" data-testid="heating-rooms-throttle">
              <b>Hlavice přiškrcují průtok</b>
              <p>{m.throttle}</p>
            </Card>
          )}
          {!m.insight && !m.throttle && m.rows.length > 0 && (
            <p className="ht-muted">Všechny místnosti jsou blízko cíle.</p>
          )}
        </div>
      </Card>
      {m.rows.length > 0 && (
        <Card className="ht-card" data-testid="heating-rooms">
          <header className="ht-ch">
            <h3>Místnosti</h3>
            <span className="ht-muted">
              podle odchylky od cíle · teplota · ventil hlavice · vlhkost
            </span>
          </header>
          <ul className="ht-rooms">
            {m.rows.map((r) => {
              const pos = r.delta === null ? 0.5 : Math.max(0, Math.min(1, 0.5 + r.delta / 4));
              return (
                <li
                  key={r.id}
                  data-testid="heating-room"
                  data-coldest={m.coldest?.id === r.id ? '' : undefined}
                >
                  <div className="ht-room-name">
                    <b>{r.name}</b>
                    <span className="ht-muted">{r.source === 'trv' ? 'hlavice' : 'čidlo'}</span>
                    {r.window_open && (
                      <Pill tone="warn" size="sm">
                        okno otevřeno
                      </Pill>
                    )}
                    {r.battery !== null && r.battery < 20 && (
                      <Pill tone="warn" size="sm">
                        baterie {fmtNum(r.battery, 0)}&nbsp;%
                      </Pill>
                    )}
                  </div>
                  <div className="ht-room-temp">
                    <b>{fmtT(r.temp)}</b>
                    <span className="ht-muted">
                      {r.target === null
                        ? 'bez cíle'
                        : `cíl ${fmtNum(r.target)} · ${r.delta! > 0 ? '+' : ''}${fmtNum(r.delta)}\u00a0°C`}
                    </span>
                    <span
                      className="ht-track"
                      aria-hidden="true"
                      data-empty={r.delta === null ? '' : undefined}
                    >
                      <i
                        data-cold={r.delta !== null && r.delta < -0.3 ? '' : undefined}
                        style={{ left: `${pos * 100}%` }}
                      />
                    </span>
                  </div>
                  <div className="ht-room-valve">
                    {r.valve_pct !== null ? (
                      <ProgressRing
                        value={r.valve_pct / 100}
                        size={44}
                        tone="accent"
                        label={`Ventil ${r.valve_pct} %`}
                      >
                        <small>{fmtNum(r.valve_pct, 0)}&nbsp;%</small>
                      </ProgressRing>
                    ) : (
                      <span className="ht-muted" title="bez hlavice">
                        —
                      </span>
                    )}
                  </div>
                  <div className="ht-room-hum">
                    <span className="ht-k">vlhkost</span>
                    <b>{r.humidity === null ? '–' : `${fmtNum(r.humidity, 0)}\u00a0%`}</b>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </>
  );
}

/* ---------- Trendy ---------- */

function TrendsTab({ api }: { api: HeatingApi }) {
  const [range, setRange] = useState<HistoryRange>('week');
  const [on, setOn] = useState<HistoryKey[]>(['tank_bottom', 'dhw_temp', 'outdoor_temp']);
  const [zoom, setZoom] = useState<[number, number] | null>(null);
  const h = useHistory(api, range, OVERLAYS);
  const all = useHistory(api, 'all', EFF_KEYS);
  const pts = h?.series.find((s) => s.points.length)?.points;
  const full: [number, number] | null = pts ? [pts[0]![0], pts.at(-1)![0]] : null;
  const domain = zoom ?? full;
  const series: ChartSeries[] = (h?.series ?? [])
    .filter((s) => on.includes(s.key))
    .map((s) => ({
      ...SERIES[s.key],
      key: s.key,
      points: s.points,
      band: s.key === 'tank_bottom',
    }));
  const runs = h?.runs ?? [];
  const inDomain = domain ? runs.filter(([a, b]) => b > domain[0] && a < domain[1]) : [];
  const runMin = inDomain.map(([a, b]) => (b - a) / 60_000).sort((a, b) => a - b);
  const eff = useMemo(() => {
    if (!all) return null;
    const out = all.series.find((s) => s.key === 'outdoor_temp')?.points ?? [];
    const rt = all.series.find((s) => s.key === 'compressor_runtime_h')?.points ?? [];
    return efficiencyModel(out, rt, nowMs(), HEATING_BREAK_TS);
  }, [all]);
  return (
    <>
      <Card className="ht-card" data-testid="heating-trend" data-range={range}>
        <header className="ht-ch ht-ch-wrap">
          <h3>Teploty a běh kompresoru</h3>
          <SegmentedControl
            label="Období"
            hideLabel
            size="sm"
            value={range}
            options={RANGE_LABELS}
            onChange={(r) => {
              setRange(r);
              setZoom(null);
            }}
            className="ht-range"
          />
        </header>
        <div className="ht-chips" role="group" aria-label="Křivky v grafu">
          {OVERLAYS.map((k) => (
            <Chip
              key={k}
              size="sm"
              pressed={on.includes(k)}
              look="soft"
              icon={<i className="ht-chip-dot" style={{ background: SERIES[k].color }} />}
              onPressedChange={(p) =>
                setOn((cur) => (p ? [...cur, k] : cur.filter((x) => x !== k)))
              }
            >
              {SERIES[k].label}
            </Chip>
          ))}
          {zoom && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setZoom(null)}
              data-testid="heating-zoom-reset"
            >
              Zrušit přiblížení
            </Button>
          )}
        </div>
        {h === undefined || !domain ? (
          <Skeleton variant="block" height="260px" />
        ) : (
          <>
            <TimeChart
              range={range}
              domain={domain}
              series={series}
              height={260}
              onZoom={(a, b) => setZoom([a, b])}
              testid="heating-trend-chart"
              runs={runs.length > 0 ? runs : undefined}
            />
            {runs.length > 0 ? (
              <>
                <p className="ht-muted ht-runs-note" data-testid="heating-runs-summary">
                  {czCount(inDomain.length, 'běh', 'běhy', 'běhů')} kompresoru
                  {runMin.length
                    ? ` · medián ${fmtDuration(runMin[Math.floor(runMin.length / 2)]!)}`
                    : ''}{' '}
                  · přibližte tažením v grafu
                </p>
              </>
            ) : (
              <p className="ht-muted ht-runs-note">
                {range === 'month' ? 'Hodinové' : 'Denní'} průměry · jednotlivé běhy kompresoru jsou
                vidět za poslední týden.
              </p>
            )}
          </>
        )}
      </Card>
      <Card className="ht-card" data-testid="heating-efficiency">
        <header className="ht-ch ht-ch-wrap">
          <h3>Běh kompresoru podle venkovní teploty</h3>
          <span className="ht-legend" data-testid="heating-scatter-legend">
            {eff?.legend.map((l) => (
              <span key={l.group} data-group={l.group}>
                <i className="ht-dot-l" data-group={l.group} />
                {l.label}
              </span>
            ))}
            <span className="ht-muted">1 tečka = 1 den · čára = trend</span>
          </span>
        </header>
        {!eff ? (
          <Skeleton variant="block" height="220px" />
        ) : eff.points.length ? (
          <Scatter points={eff.points} fits={eff.fits} />
        ) : (
          <p className="ht-muted">Zatím málo dní s topením.</p>
        )}
        {eff?.insight && (
          <p className="ht-insight" data-testid="heating-efficiency-insight">
            {eff.insight}
          </p>
        )}
      </Card>
    </>
  );
}

/* ---------- Sezóny ---------- */

function SeasonsTab({ api }: { api: HeatingApi }) {
  const [rows, setRows] = useState<HeatingSeason[] | null>(null);
  useEffect(() => {
    api.seasons().then(setRows, () => setRows([]));
  }, [api]);
  if (!rows) return <Skeleton variant="block" height="320px" />;
  if (!rows.length)
    return (
      <Card className="ht-card">
        <EmptyState title="Historie sezón zatím není">
          Po importu archivu regulace se tu objeví 10 let topení.
        </EmptyState>
      </Card>
    );
  const { cards } = seasonsModel(rows);
  const noted = cards.filter((c) => c.note);
  return (
    <>
      <Card className="ht-card" data-testid="heating-seasons-chart">
        <header className="ht-ch ht-ch-wrap">
          <h3>Hodiny běhu kompresoru za sezónu</h3>
          <span className="ht-muted">sezóna = červenec–červen</span>
        </header>
        <SeasonBars cards={cards} />
        {noted.map((c) => (
          <p key={c.season} className="ht-insight" data-testid="heating-season-note">
            <b>
              {c.season}: {c.note?.charAt(0).toLowerCase()}
              {c.note?.slice(1)}.
            </b>{' '}
            Od té doby běží kompresor na 100 denostupňů zhruba {fmtNum(c.h_per_100dd, 0)}&nbsp;h
            místo dřívějších {fmtNum(cards[cards.indexOf(c) + 1]?.h_per_100dd ?? null, 0)}&nbsp;h.
          </p>
        ))}
      </Card>
      <div className="ht-seasons">
        {cards.map((c) => (
          <Card
            key={c.season}
            className="ht-season"
            data-testid="heating-season"
            data-partial={c.partial ? '' : undefined}
          >
            <header>
              <b>{c.season}</b>
              {c.partial ? (
                <Pill tone="accent" size="sm">
                  probíhá
                </Pill>
              ) : c.note ? (
                <Pill size="sm">zlom</Pill>
              ) : null}
            </header>
            <p className="ht-v">
              {fmtNum(c.compressor_h, 0)}
              <small>&nbsp;h běhu</small>
            </p>
            <span className="ht-share" aria-hidden="true">
              <i style={{ transform: `scaleX(${c.share})` }} />
            </span>
            <dl>
              <dt>Elektřina</dt>
              <dd>{fmtSeasonEnergy(c)}</dd>
              <dt>Starty</dt>
              <dd>{fmtNum(c.starts, 0)}</dd>
              <dt>Medián délky běhu (hodinová data, orientační)</dt>
              <dd>{c.median_run_min === null ? '–' : `${c.median_run_min}\u00a0min`}</dd>
              <dt>Na 100 denostupňů</dt>
              <dd>
                {fmtNum(c.h_per_100dd, 0)}&nbsp;h
                {c.vsPrev !== null && Math.abs(c.vsPrev) >= 0.05 && (
                  <em data-tone={c.vsPrev > 0 ? 'up' : 'down'}> {fmtPctChange(c.vsPrev)}</em>
                )}
              </dd>
              <dt>Venku ⌀</dt>
              <dd>{fmtT(c.outdoor_mean)}</dd>
              <dt>Data</dt>
              <dd>{fmtNum(c.coverage * 100, 1)}&nbsp;%</dd>
            </dl>
            {c.note && <p className="ht-season-note">{c.note}</p>}
          </Card>
        ))}
      </div>
    </>
  );
}

/* ---------- Režimy ---------- */

function ModesTab({ snap }: { snap: HeatingSnapshot }) {
  const out = snap.curve.outdoor_now ?? snap.outdoor.temp;
  const y = out === null ? null : curveAt(snap.curve.points, out);
  const d = new Date();
  const mode = snap.mode;
  const rows: Array<[string, string, boolean | null]> = [
    [
      'Sezóna',
      `${mode.season === 'winter' ? 'zima (topení)' : mode.season === 'summer' ? 'léto (jen teplá voda)' : 'neznámá'}${mode.auto_season ? ' · přepíná se samo' : ''}`,
      null,
    ],
    [
      'Hlavní vypínač',
      mode.main_switch === null ? 'neznámo' : mode.main_switch ? 'zapnuto' : 'vypnuto',
      mode.main_switch,
    ],
    [
      'Útlum',
      mode.setback_active === null ? 'neznámo' : mode.setback_active ? 'právě běží' : 'teď ne',
      mode.setback_active,
    ],
    [
      'Tarif (HDO)',
      mode.hdo_low_tariff === null ? 'neznámý' : mode.hdo_low_tariff ? 'nízký' : 'vysoký',
      mode.hdo_low_tariff,
    ],
  ];
  return (
    <>
      <p className="ht-lock" data-testid="heating-readonly">
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <rect x="3" y="7" width="10" height="7" rx="2" fill="currentColor" />
          <path d="M5 7V5a3 3 0 0 1 6 0v2" fill="none" stroke="currentColor" strokeWidth="1.6" />
        </svg>{' '}
        Jen pro čtení. Úpravy teplot a programů přidáme později – bezpečně a s potvrzením.
      </p>
      <div className="ht-row">
        <Card className="ht-card ht-grow" data-testid="heating-curve-card">
          <header className="ht-ch">
            <h3>Ekvitermní křivka</h3>
            <span className="ht-muted">cíl nádrže podle venkovní teploty</span>
          </header>
          <CurveChart
            points={snap.curve.points}
            now={out !== null && y !== null ? { x: out, y } : null}
          />
          {out !== null && y !== null && (
            <p className="ht-insight">
              Venku je {fmtT(out)}, takže regulace chce v nádrži {fmtT(y, 0)}
              {snap.tank.hysteresis !== null
                ? ` – kompresor naskočí pod ${fmtT(y, 0)} a nahřívá do ${fmtT(y + snap.tank.hysteresis, 0)}`
                : ''}
              . Čím je venku chladněji, tím teplejší voda jde do radiátorů.
            </p>
          )}
        </Card>
        <Card className="ht-card ht-side" data-testid="heating-modes">
          <header className="ht-ch">
            <h3>Režimy</h3>
          </header>
          <ul className="ht-kv">
            {rows.map(([k, v, flag]) => (
              <li key={k}>
                <span>{k}</span>
                <b data-on={flag === true ? '' : undefined}>{v}</b>
              </li>
            ))}
            <li>
              <span>Teplá voda</span>
              <b>
                cíl {fmtT(snap.dhw.target, 0)}, dohřev pod {fmtT(snap.dhw.reheat_below, 0)}
              </b>
            </li>
            <li>
              <span>Doma (chodba)</span>
              <b>
                cíl {fmtT(snap.house.ref_target)} ± {fmtNum(snap.house.hysteresis)}
              </b>
            </li>
          </ul>
        </Card>
      </div>
      <Card className="ht-card">
        <header className="ht-ch">
          <h3>Programy</h3>
          <span className="ht-muted">týdenní program, dnes</span>
        </header>
        {snap.schedules.length ? (
          <ScheduleRibbon schedules={snap.schedules} nowMin={d.getHours() * 60 + d.getMinutes()} />
        ) : (
          <p className="ht-muted">Regulace nehlásí žádné časové programy.</p>
        )}
      </Card>
    </>
  );
}

/* ---------- Poruchy ---------- */

function FaultsTab({ snap }: { snap: HeatingSnapshot }) {
  const f = snap.faults;
  return (
    <>
      {f.active.length === 0 ? (
        <Card className="ht-hero ht-ok" tone="calm" data-testid="heating-faults-ok">
          <div className="ht-hero-copy">
            <Pill tone="ok" dot>
              Bez poruch
            </Pill>
            <h2>Vše v pořádku.</h2>
            <p className="ht-hero-detail">
              Regulace hlídá{' '}
              {czCount(f.monitored, 'čidlo a ochranu', 'čidla a ochrany', 'čidel a ochran')} –
              tlaky, teploty, průtok i kompresor. Jakmile se něco stane, uvidíte to tady i ve Dnes.
            </p>
          </div>
        </Card>
      ) : (
        <div className="ht-faults">
          {f.active.map((x) => (
            <Card key={x.key} tone="critical" className="ht-fault" data-testid="heating-fault">
              <Pill tone="crit" dot>
                {f.fatal ? 'Porucha – topení stojí' : 'Porucha'}
              </Pill>
              <h2>{x.label}</h2>
              {x.since && (
                <p className="ht-muted">
                  od{' '}
                  {new Date(x.since).toLocaleString('cs-CZ', {
                    hour: '2-digit',
                    minute: '2-digit',
                    day: 'numeric',
                    month: 'numeric',
                  })}
                </p>
              )}
              <p>
                {f.compressor_block
                  ? 'Kompresor je zablokovaný, aby se nepoškodil. '
                  : 'Regulace kompresor hlídá a podle potřeby ho sama zastaví. '}
                {!snap.backup_heater.available
                  ? ''
                  : snap.backup_heater.on
                    ? 'Dům teď hřeje záložní elektrické topení – je to dražší, ale doma bude teplo. '
                    : 'Kdyby kompresor stál dlouho, zapne se záložní elektrické topení. '}
              </p>
              <p>
                <b>Co dělat:</b> nic neresetujte. Pokud porucha nezmizí do hodiny nebo se opakuje,
                zavolejte servis tepelného čerpadla a řekněte mu text poruchy.
              </p>
            </Card>
          ))}
        </div>
      )}
      <Card className="ht-card">
        <header className="ht-ch">
          <h3>Co hlídáme</h3>
        </header>
        <ul className="ht-kv">
          <li>
            <span>Poruchové lampy regulace</span>
            <b>{f.monitored}</b>
          </li>
          <li>
            <span>Blokace kompresoru</span>
            <b data-on={f.compressor_block ? '' : undefined}>{f.compressor_block ? 'ano' : 'ne'}</b>
          </li>
          {snap.backup_heater.available && (
            <li>
              <span>Záložní elektrické topení</span>
              <b>{snap.backup_heater.on ? 'hřeje' : 'vypnuto (zapne se jen při poruše)'}</b>
            </li>
          )}
          <li>
            <span>Motohodiny kompresoru</span>
            <b>{fmtNum(snap.heat_pump.motohours, 0)}&nbsp;h</b>
          </li>
        </ul>
      </Card>
    </>
  );
}

/* ---------- View ---------- */

export default function HeatingView({ connection, route, kiosk }: ModuleViewProps) {
  const api = useMemo(() => getHeatingApi(connection), [connection]);
  const [tab, setTab] = useState<TabId>(() => tabFromRoute(route?.path));
  const { snap, error } = useHeating(kiosk ? null : api);
  const selectTab = (next: TabId) => {
    setTab(next);
    try {
      navigateTab(next === 'ted' ? '/heating' : `/heating/${next}`, next === 'ted');
    } catch {
      /* outside HA */
    }
  };
  let body: ReactNode;
  if (kiosk)
    body = (
      <EmptyState title="Topení je na nástěnce jen ve Dnes">
        Podrobnosti najdete v telefonu nebo počítači.
      </EmptyState>
    );
  else if (!api)
    body = (
      <EmptyState title="Topení není k dispozici">
        Potřebuje připojení k Home Assistantu.
      </EmptyState>
    );
  else if (error && !snap) body = <EmptyState title="Topení se nenačetlo">{error}</EmptyState>;
  else if (!snap)
    body = (
      <div className="ht-loading">
        <Skeleton variant="block" height="360px" />
        <Skeleton variant="block" height="120px" />
      </div>
    );
  else if (snap.source === 'unconfigured') {
    const act = activityModel(snap, nowMs());
    body = (
      <Card className="ht-card" data-testid="heating-unconfigured">
        <EmptyState title="Topení zatím není připojené">{act.detail}</EmptyState>
      </Card>
    );
  } else
    body =
      tab === 'ted' ? (
        <NowTab snap={snap} api={api} go={selectTab} />
      ) : tab === 'mistnosti' ? (
        <RoomsTab snap={snap} />
      ) : tab === 'trendy' ? (
        <TrendsTab api={api} />
      ) : tab === 'sezony' ? (
        <SeasonsTab api={api} />
      ) : tab === 'rezimy' ? (
        <ModesTab snap={snap} />
      ) : (
        <FaultsTab snap={snap} />
      );
  const showTabs = !kiosk && snap && snap.source !== 'unconfigured';
  return (
    <div className="ht" data-testid="heating-view">
      <style>{heatingStyles}</style>
      <header className="ht-head">
        <h1 className="hb-sr-only">Topení</h1>
        {showTabs && (
          <SegmentedControl
            label="Sekce"
            hideLabel
            size="sm"
            value={tab}
            options={TABS}
            onChange={selectTab}
            className="ht-tabs"
          />
        )}
        {snap && snap.source !== 'unconfigured' && (
          <span
            className="ht-live"
            data-stale={snap.stale || snap.source !== 'ok' ? '' : undefined}
            data-testid="heating-live"
          >
            <i />
            {snap.stale
              ? `data ${ago(snap.updated_at)} – zastaralá`
              : snap.source !== 'ok'
                ? 'regulace neodpovídá'
                : `živě · ${ago(snap.updated_at)}`}
          </span>
        )}
      </header>
      {snap?.stale && (
        <Card tone="warning" className="ht-note" data-testid="heating-stale">
          <b>Údaje nejsou aktuální</b>
          <p>
            Regulace neposlala data {ago(snap.updated_at)}. Schéma je zastavené, dokud nepřijdou
            nová.
          </p>
        </Card>
      )}
      {body}
    </div>
  );
}

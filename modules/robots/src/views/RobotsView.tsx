import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { ModuleViewProps } from '@homebrain/ha-client';
import { Button, Card, Chip, SegmentedControl, czCount, useToast } from '@homebrain/ui';
import {
  attention,
  buildRobot,
  configuredSlots,
  fetchRobots,
  type RobotMeta,
  type RobotModel,
} from '../model.js';
import {
  CLEAN_MODE_LABELS,
  FAN_LABELS,
  MOP_ROUTE_LABELS,
  WATER_LABELS,
  modeMops,
  modeOptionAvailable,
  planCleanRooms,
  planResumeAfterFix,
  planSimple,
  runPlan,
  type CleanMode,
  type ServiceCallPlan,
} from '../commands.js';
import { orderBadge, pruneOrder, toggleRoom } from '../rooms.js';
import { RobotArt } from './RobotArt.js';
import {
  VectorFloorPlan,
  VectorMapBoundary,
  vectorMapEnabled,
  type MarkerTone,
} from './VectorMap.js';
import { useVectorMap } from './useVectorMap.js';
import { roomAt } from '../map/geometry.js';
import { robotsStyles } from './robotsStyles.js';

function initialSlot(slots: number[]): number | null {
  const wanted = Number(new URLSearchParams(globalThis.location?.search ?? '').get('robot'));
  return slots.includes(wanted) ? wanted : (slots[0] ?? null);
}

function summary(robots: RobotModel[]): string {
  const parts: string[] = [];
  const count = (pred: (r: RobotModel) => boolean) => robots.filter(pred).length;
  const cleaning = count((r) => r.status.tone === 'cleaning');
  const help = count((r) => attention(r) === 'crit');
  const charging = count((r) => r.status.tone === 'charging' || r.status.tone === 'docked');
  if (cleaning) parts.push(cleaning === 1 ? '1 uklízí' : `${cleaning} uklízejí`);
  if (help) parts.push(help === 1 ? '1 potřebuje pomoc' : `${help} potřebují pomoc`);
  if (charging) parts.push(charging === 1 ? '1 je v doku' : `${charging} jsou v doku`);
  return parts.join(' · ') || 'Všichni roboti jsou v klidu';
}

export default function RobotsView({ store, bindings, connection }: ModuleViewProps) {
  const version = useSyncExternalStore(
    store.subscribeAll,
    () => store.lastUpdatedAt() ?? 0,
    () => 0,
  );
  const [metas, setMetas] = useState<RobotMeta[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const load = useCallback(
    (refresh: boolean) => {
      if (!connection) return;
      fetchRobots(connection, refresh)
        .then((value) => {
          setMetas(value);
          setLoadError(false);
        })
        .catch(() => setLoadError(true));
    },
    [connection],
  );
  useEffect(() => {
    load(false);
  }, [load]);
  const slots = configuredSlots(bindings, metas);
  const slotKey = slots.join(',');
  // `version` ticks on every entity store update, so the models follow live HA states.
  const robots = useMemo(
    () =>
      slotKey
        .split(',')
        .filter(Boolean)
        .map(Number)
        .map((slot) =>
          buildRobot(
            slot,
            bindings,
            (id) => (id ? store.getSnapshot(id) : undefined),
            metas?.find((meta) => meta.slot === slot),
          ),
        ),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- version = store update tick
    [slotKey, bindings, metas, store, version],
  );
  const [picked, setPicked] = useState<number | null>(null);
  const active = robots.find((robot) => robot.slot === (picked ?? initialSlot(slots))) ?? robots[0];
  if (!active)
    return (
      <section className="hb-robots rb rb-empty" data-testid="robots-empty">
        <style>{robotsStyles}</style>
        <h1>Roboti</h1>
        <p>
          Zatím tu není žádný robot. Přidejte ho v nastavení integrace HomeBrain (Vazby entit →
          Robot 1–3): vysavač, stav, baterii, chyby a spotřební díly.
        </p>
      </section>
    );
  return (
    <section className="hb-robots rb" data-testid="robots-view">
      <style>{robotsStyles}</style>
      <p className="rb-sub rb-summary">{summary(robots)}</p>
      <nav className="rb-floors" role="tablist" aria-label="Patra">
        {robots.map((robot) => (
          <button
            key={robot.slot}
            role="tab"
            type="button"
            aria-selected={robot.slot === active.slot}
            className="rb-floor"
            data-testid={`robots-floor-${robot.slot}`}
            data-rb-tone={robot.status.tone}
            onClick={() => setPicked(robot.slot)}
          >
            <span className="rb-floor-name">{robot.floor || `Robot ${robot.slot}`}</span>
            <span className="rb-floor-meta">
              <i className="rb-dot" data-rb-att={attention(robot)} aria-hidden="true" />
              <span className="rb-floor-robot">{robot.name} · </span>
              {robot.battery !== null ? `${Math.round(robot.battery)}\u00a0%` : robot.status.label}
              {attention(robot) === 'crit' ? (
                <span className="rb-floor-help">{' · potřebuje pomoc'}</span>
              ) : (
                ''
              )}
            </span>
          </button>
        ))}
      </nav>
      {loadError && (
        <p className="rb-note" role="status">
          Seznam místností se nepodařilo načíst. Stav robotů je aktuální.
        </p>
      )}
      <RobotPanel
        key={active.slot}
        robot={active}
        connection={connection}
        onReloadRooms={() => load(true)}
      />
    </section>
  );
}

function RobotPanel({
  robot,
  connection,
  onReloadRooms,
}: {
  robot: RobotModel;
  connection: ModuleViewProps['connection'];
  onReloadRooms: () => void;
}) {
  const [order, setOrder] = useState<number[]>([]);
  const [mode, setMode] = useState<CleanMode | null>(robot.mode);
  const [fan, setFan] = useState<string | null>(robot.fan);
  const [water, setWater] = useState<string | null>(robot.water?.value ?? null);
  const [mopRoute, setMopRoute] = useState<string | null>(robot.mopRoute?.value ?? null);
  const [passes, setPasses] = useState(1);
  const [advanced, setAdvanced] = useState(false);
  const [confirm, setConfirm] = useState<{ title: string; plan: ServiceCallPlan[] } | null>(null);
  const [sending, setSending] = useState(false);
  const notify = useToast();
  const selected = pruneOrder(order, robot.rooms);
  const [vectorOn] = useState(vectorMapEnabled);
  const [fullTrail, setFullTrail] = useState(readTrailPref);
  const vector = useVectorMap(
    connection,
    robot.slot,
    robot.mapStamp,
    robot.status.tone === 'cleaning' || robot.status.tone === 'returning',
    vectorOn,
  );
  const canAct = !!connection && robot.available;
  const vmap = vector?.available ? vector.map : null;
  const areas = new Map((vmap?.rooms ?? []).map((room) => [room.id, Math.round(room.area_m2)]));
  const roomsLabel = czCount(selected.length, 'místnost', 'místnosti', 'místností');
  const selectedArea = selected.reduce((sum, id) => sum + (areas.get(id) ?? 0), 0);
  // Rough duration for the CTA (≈ 1 m²/min vacuuming, slower with the mop); hidden without areas.
  const estimate = selectedArea
    ? Math.max(5, Math.round((selectedArea * MINUTES_PER_M2[mode ?? 'vacuum']) / 5) * 5)
    : null;
  // The room shown as „Uklízí X“ comes from the robot pose on the drawn map, so the header,
  // the hero and the marker never disagree (the HA room sensor lags behind).
  const poseRoom = vmap?.robot ? roomAt(vmap, vmap.robot.x, vmap.robot.y) : null;
  const liveRoom = vmap?.robot
    ? (robot.rooms.find((room) => room.id === poseRoom)?.name ?? null)
    : robot.room;
  const chipsRef = useRef<HTMLDivElement>(null);
  const lastPicked = selected[selected.length - 1];
  // Keep the last picked room's chip in view (the row scrolls sideways on phones).
  useEffect(() => {
    const row = chipsRef.current;
    if (!row || lastPicked === undefined || row.scrollWidth <= row.clientWidth) return;
    const chip = row.querySelector<HTMLElement>(`[data-testid='robots-room-${lastPicked}']`);
    if (!chip) return;
    let left = chip.offsetLeft - (row.clientWidth - chip.offsetWidth) / 2;
    // Never stop with a chip cut at the left edge (it read as an empty chip): start flush
    // with the chip that would be cut.
    const cut = Array.from(row.querySelectorAll<HTMLElement>('[data-testid^="robots-room-"]')).find(
      (el) => el.offsetLeft < left && el.offsetLeft + el.offsetWidth > left,
    );
    if (cut) left = cut.offsetLeft;
    row.scrollTo?.({ left: Math.max(0, left) });
  }, [lastPicked]);
  // Edge fades only where more chips hide (none at the start position).
  useEffect(() => {
    const row = chipsRef.current;
    if (!row) return;
    const update = () => {
      const fade = [
        row.scrollLeft > 2 ? 'start' : '',
        row.scrollLeft + row.clientWidth < row.scrollWidth - 2 ? 'end' : '',
      ]
        .filter(Boolean)
        .join(' ');
      if (fade) row.setAttribute('data-fade', fade);
      else row.removeAttribute('data-fade');
    };
    update();
    row.addEventListener('scroll', update, { passive: true });
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(update) : null;
    observer?.observe(row);
    return () => {
      row.removeEventListener('scroll', update);
      observer?.disconnect();
    };
  }, [robot.slot, robot.rooms.length]);
  const portraitMap =
    !!vmap && vmap.bounds[3] - vmap.bounds[1] > (vmap.bounds[2] - vmap.bounds[0]) * 1.1;
  // <image> cannot send the bearer token: the raster base path is signed by HA (10 min).
  const resolveBase = useMemo(
    () =>
      connection
        ? async (path: string) => {
            const message = { type: 'auth/sign_path', path, expires: 600 };
            return (await connection.sendMessagePromise<{ path: string }>(message)).path;
          }
        : null,
    [connection],
  );
  const imageMap = robot.mapImage ? (
    <img
      src={robot.mapImage}
      alt={`Mapa – ${robot.floor || robot.name}`}
      data-testid="robots-map"
    />
  ) : (
    <p className="rb-map-empty">
      Mapa se ukáže po přiřazení obrázku mapy (entita image) v nastavení robota.
    </p>
  );
  const modes = (['vacuum', 'mop', 'both'] as CleanMode[]).filter((m) =>
    modeOptionAvailable(m, robot.modeOptions),
  );
  // Mop water / route only matter when the run mops; „Pokročilé“ keeps them out of the way.
  const mops = modeMops(mode ?? robot.mode);
  const ask = (title: string, plan: ServiceCallPlan[]) =>
    plan.length && setConfirm({ title, plan });
  const send = async () => {
    if (!confirm || !connection) return;
    setSending(true);
    try {
      await runPlan(connection, confirm.plan);
      notify.success('Příkaz odeslán. Čekám na skutečný stav z Home Assistantu.');
      if (confirm.plan.some((step) => step.service === 'vacuum.send_command')) setOrder([]);
    } catch (error) {
      notify.error(
        `Příkaz se nepodařilo odeslat${error instanceof Error && error.message ? `: ${error.message}` : '.'}`,
      );
    } finally {
      setSending(false);
      setConfirm(null);
    }
  };
  const care = (
    <>
      <Card as="article" className="rb-care rb-card" data-testid="robots-care">
        <div className="rb-card-head">
          <h3>Údržba</h3>
          <p className="rb-micro">Odhad při ~1 h úklidu denně</p>
        </div>
        {robot.consumables.length ? (
          <ul className="rb-parts">
            {robot.consumables.map((item) => (
              <li key={item.kind} data-rb-tone={item.tone} data-testid={`robots-part-${item.kind}`}>
                <span className="rb-ring-wrap">
                  <Ring percent={item.percent} />
                  <em>{item.percent}</em>
                </span>
                <span className="rb-part-text">
                  <b>{item.label}</b>
                  <span>{item.action}</span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rb-note">Spotřební díly nejsou přiřazené.</p>
        )}
      </Card>

      <Card
        as="article"
        className="rb-dock rb-card"
        data-testid="robots-dock"
        data-rb-dock-warn={!!robot.dockError || robot.tanks.some((tank) => !tank.ok)}
      >
        <div className="rb-card-head">
          <h3>Dok</h3>
          <p className="rb-micro">
            {robot.dockError
              ? robot.dockError.title
              : robot.tanks.some((tank) => !tank.ok)
                ? 'Potřebuje doplnit'
                : 'Vše v pořádku'}
          </p>
        </div>
        {robot.tanks.length ? (
          <ul className="rb-tanks">
            {robot.tanks.map((tank) => (
              <li key={tank.key} data-rb-ok={tank.ok} data-rb-tank={tank.key}>
                <Tank ok={tank.ok} kind={tank.key} />
                <span>
                  <b>{tank.label}</b>
                  <span>{tank.text}</span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rb-note">Nádrže doku nejsou přiřazené.</p>
        )}
      </Card>
    </>
  );
  const tone = robot.status.tone;
  const busy = tone === 'cleaning' || tone === 'returning';
  const problem = robot.error ?? robot.dockError;
  return (
    <div className="rb-grid" data-rb-tone={tone}>
      <div className="rb-col">
        <Card as="article" className="rb-hero rb-card" data-testid="robots-hero">
          {/* Visual slot: today the vector/photo RobotArt; a future 3D or per-state photo view
              plugs in here (data-rb-visual) without touching the hero layout. */}
          <div className="rb-hero-art" data-rb-visual="art" data-testid="robots-hero-visual">
            <RobotArt tone={tone} image={robot.image} name={robot.name} />
          </div>
          <div className="rb-hero-body">
            <p className="rb-eyebrow">
              {robot.name}
              {robot.floor ? ` · ${robot.floor}` : ''}
            </p>
            <h2 className="rb-state" data-testid="robots-state">
              {robot.status.label}
            </h2>
            <p className="rb-room">
              {liveRoom ? (
                <>
                  {robot.status.busy ? 'V místnosti ' : 'Naposledy v místnosti '}
                  <b>{liveRoom}</b>
                </>
              ) : (
                'Místnost neznámá'
              )}
            </p>
            {robot.progress !== null && (
              <div
                className="rb-progress"
                role="progressbar"
                aria-label="Průběh úklidu"
                aria-valuenow={robot.progress}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <span style={{ width: `${Math.max(2, Math.min(100, robot.progress))}%` }} />
                <em>Hotovo {Math.round(robot.progress)} %</em>
              </div>
            )}
            <div className="rb-hero-foot">
              <Battery value={robot.battery} charging={tone === 'charging'} />
              <div className="rb-hero-actions">
                {tone === 'paused' ? (
                  <Button
                    disabled={!canAct}
                    onClick={() => ask('Pokračovat v úklidu?', planSimple('resume', robot.vacuum))}
                  >
                    Pokračovat
                  </Button>
                ) : tone === 'cleaning' ? (
                  // Pause only while cleaning – a disabled „Pauza“ in other states read as broken.
                  <Button
                    variant="strong"
                    data-testid="robots-pause"
                    disabled={!canAct}
                    onClick={() => ask('Pozastavit úklid?', planSimple('pause', robot.vacuum))}
                  >
                    <PauseIcon />
                    Pauza
                  </Button>
                ) : null}
                <Button
                  data-testid="robots-home"
                  disabled={!canAct || tone === 'charging' || tone === 'docked'}
                  onClick={() => ask('Poslat robota do doku?', planSimple('home', robot.vacuum))}
                >
                  <HomeIcon />
                  Zpět do doku
                </Button>
              </div>
            </div>
          </div>
        </Card>

        {problem && (
          <Card
            as="article"
            className="rb-problem rb-card"
            data-testid="robots-problem"
            role="alert"
          >
            <p className="rb-eyebrow">
              {problem.source === 'robot' ? 'Jak to opravit' : 'Dok – jak to opravit'}
            </p>
            <h3>{problem.title}</h3>
            <ol>
              {problem.steps.map((step) => (
                <li key={step}>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
            {robot.error && robot.dockError && (
              <p className="rb-problem-more">
                Dok navíc hlásí: <b>{robot.dockError.title}</b> – {robot.dockError.steps[0]}
              </p>
            )}
            {robot.error && (
              <div className="rb-problem-cta">
                <Button
                  variant="strong"
                  data-testid="robots-fixed-resume"
                  disabled={!canAct}
                  onClick={() =>
                    ask(
                      'Závada odstraněná? Pokračovat v úklidu',
                      planResumeAfterFix(robot.vacuum, robot.error!.title),
                    )
                  }
                >
                  Hotovo – pokračovat
                </Button>
                <span>Robot pokračuje až po potvrzení.</span>
              </div>
            )}
            <details>
              <summary>Podrobnosti</summary>
              Kód pro servis: {problem.code}
            </details>
          </Card>
        )}

        {care}
      </div>
      <div className="rb-col">
        <Card as="article" className="rb-clean rb-card" data-testid="robots-clean">
          {/* Portrait plans on a wide card: the room list sits beside the map (container query),
              so the card has no empty side strips; one list, so test ids stay unique. */}
          <div className="rb-card-head rb-clean-head">
            <div className="rb-clean-title">
              <h3>Uklidit místnosti</h3>
              <p className="rb-micro" data-testid="robots-map-name">
                {robot.mapName ?? 'Mapa'}
                {busy && (liveRoom || tone === 'returning') ? (
                  <>
                    {' · '}
                    <span className="rb-live" data-testid="robots-live-room">
                      {tone === 'returning' ? 'Vrací se do doku' : `Uklízí ${liveRoom}`}
                    </span>
                  </>
                ) : (
                  // Idle: the robot's own state (e.g. „V doku · 100 %“) so the map marker has
                  // a matching source of truth, then the room count.
                  <>
                    {' · '}
                    {statusWithBattery(robot.status.label, robot.battery)}
                    {robot.rooms.length
                      ? ` · ${czCount(robot.rooms.length, 'místnost', 'místnosti', 'místností')}`
                      : ''}
                  </>
                )}
              </p>
            </div>
            {vector?.available && vector.map.path.length > 0 && (
              <Chip
                className="rb-chip rb-trail-toggle"
                pressed={fullTrail}
                data-testid="robots-trail-toggle"
                aria-label="Celá trasa úklidu"
                onPress={() => {
                  setFullTrail(!fullTrail);
                  writeTrailPref(!fullTrail);
                }}
              >
                <svg className="rb-ico" viewBox="0 0 16 16" aria-hidden="true">
                  <path
                    d="M3.5 13.5a2 2 0 1 1 0-4h7a2 2 0 1 0 0-4H5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                  <circle cx="12.5" cy="13.5" r="1.6" />
                  <circle cx="3.5" cy="5.5" r="1.6" />
                </svg>
                Trasa
              </Chip>
            )}
          </div>
          <div className="rb-map-row" data-rb-portrait={portraitMap || undefined}>
            <div className="rb-map" data-map-kind={vector?.available ? 'vector' : 'image'}>
              {vector?.available ? (
                <VectorMapBoundary resetKey={vector.map.digest} fallback={imageMap}>
                  <VectorFloorPlan
                    map={vector.map}
                    rooms={robot.rooms}
                    selected={selected}
                    onToggle={(id) => setOrder(toggleRoom(selected, id))}
                    tone={markerTone(robot.status.tone)}
                    label={`Mapa – ${robot.floor || robot.name}`}
                    callout={
                      robot.error
                        ? { title: robot.error.title, detail: robot.error.steps[0] }
                        : null
                    }
                    resolveBase={resolveBase}
                    trail={fullTrail ? 'full' : 'faded'}
                  />
                </VectorMapBoundary>
              ) : vector === null && robot.mapImage ? (
                <span className="rb-map-loading" aria-hidden="true" />
              ) : (
                imageMap
              )}
            </div>
            <div className="rb-clean-side">
              {robot.rooms.length ? (
                <div
                  ref={chipsRef}
                  className="rb-chips"
                  role="group"
                  aria-label="Místnosti v pořadí úklidu"
                >
                  {robot.rooms.map((room) => {
                    const badge = orderBadge(selected, room.id);
                    return (
                      <Chip
                        key={room.id}
                        className="rb-chip"
                        look="soft"
                        pressed={badge !== null}
                        badge={badge}
                        badgeLabel={badge !== null ? `pořadí ${badge}` : undefined}
                        data-testid={`robots-room-${room.id}`}
                        onPress={() => setOrder(toggleRoom(selected, room.id))}
                      >
                        <span className="rb-chip-name">{room.name}</span>
                        {areas.get(room.id) ? (
                          <span className="rb-chip-area">{areas.get(room.id)} m²</span>
                        ) : null}
                      </Chip>
                    );
                  })}
                </div>
              ) : (
                <p className="rb-note">
                  {robot.mapsError
                    ? 'Místnosti se nepodařilo načíst. '
                    : 'Robot zatím nemá místnosti. '}
                  <button type="button" className="rb-link" onClick={onReloadRooms}>
                    Načíst znovu
                  </button>
                </p>
              )}

              <p className="rb-hint" aria-live="polite" data-testid="robots-selection-summary">
                {selected.length ? (
                  <>
                    <b>{czCount(selected.length, 'místnost', 'místnosti', 'místností')}</b>
                    {selectedArea ? <> · {selectedArea} m²</> : null} · v pořadí podle čísel
                  </>
                ) : busy ? (
                  'Robot právě uklízí. Chcete-li úklid změnit, vyberte místnosti.'
                ) : (
                  'Klepněte na místnosti v pořadí, v jakém se mají uklidit.'
                )}
              </p>
              <div className="rb-controls" data-testid="robots-controls">
                <SegmentedControl
                  label="Nastavení"
                  tone="accent"
                  className="rb-level"
                  value={advanced ? 'advanced' : 'basic'}
                  options={[
                    ['basic', 'Základní'],
                    ['advanced', 'Pokročilé'],
                  ]}
                  onChange={(value) => setAdvanced(value === 'advanced')}
                />
                {modes.length > 1 && (
                  <SegmentedControl
                    label="Režim"
                    tone="accent"
                    value={mode}
                    options={modes.map((m) => [m, CLEAN_MODE_LABELS[m]])}
                    onChange={(value) => setMode(value as CleanMode)}
                  />
                )}
                {robot.fanChoices.length > 1 && (
                  <SegmentedControl
                    label="Sání"
                    tone="accent"
                    value={fan}
                    options={robot.fanChoices.map((f) => [f, FAN_LABELS[f] ?? f])}
                    onChange={setFan}
                  />
                )}
                {advanced && mops && robot.water && (
                  <SegmentedControl
                    label="Voda"
                    tone="accent"
                    className="rb-adv"
                    value={water}
                    options={robot.water.choices.map((w) => [w, WATER_LABELS[w] ?? w])}
                    onChange={setWater}
                  />
                )}
                {advanced && mops && robot.mopRoute && (
                  <SegmentedControl
                    label="Mopování"
                    tone="accent"
                    className="rb-adv"
                    value={mopRoute}
                    options={robot.mopRoute.choices.map((m) => [m, MOP_ROUTE_LABELS[m] ?? m])}
                    onChange={setMopRoute}
                  />
                )}
                {advanced && (
                  <SegmentedControl
                    label="Průchody"
                    tone="accent"
                    className="rb-adv"
                    value={String(passes)}
                    options={[
                      ['1', '1×'],
                      ['2', '2×'],
                    ]}
                    onChange={(value) => setPasses(Number(value))}
                  />
                )}
              </div>
              <div className="rb-clean-actions">
                {tone === 'cleaning' && (
                  <Button
                    size="lg"
                    data-testid="robots-clean-pause"
                    disabled={!canAct}
                    onClick={() => ask('Pozastavit úklid?', planSimple('pause', robot.vacuum))}
                  >
                    <PauseIcon />
                    Pozastavit
                  </Button>
                )}
                <Button
                  variant="primary"
                  size="lg"
                  block
                  className="rb-start"
                  data-testid="robots-start"
                  disabled={!canAct || !selected.length || Boolean(robot.error)}
                  onClick={() =>
                    ask(
                      'Spustit úklid?',
                      planCleanRooms({
                        vacuum: robot.vacuum,
                        rooms: selected.map((id) => robot.rooms.find((room) => room.id === id)!),
                        mode,
                        currentMode: robot.mode,
                        modeSelect: robot.modeSelect,
                        fan,
                        currentFan: robot.fan,
                        repeat: passes,
                        water: robot.water
                          ? { entity: robot.water.entity, value: water, current: robot.water.value }
                          : undefined,
                        mopRoute: robot.mopRoute
                          ? {
                              entity: robot.mopRoute.entity,
                              value: mopRoute,
                              current: robot.mopRoute.value,
                            }
                          : undefined,
                      }),
                    )
                  }
                >
                  {robot.error
                    ? 'Nejdřív odstraňte závadu'
                    : busy
                      ? selected.length
                        ? `Uklidit ${roomsLabel}`
                        : 'Probíhá úklid'
                      : selected.length
                        ? `Uklidit ${roomsLabel}`
                        : 'Uklidit vybrané'}
                  {!robot.error && selected.length > 0 && estimate !== null && (
                    <span className="rb-est" data-testid="robots-start-estimate">
                      {' '}
                      · cca&nbsp;{estimate}&nbsp;min
                    </span>
                  )}
                </Button>
              </div>
              {!connection && (
                <p className="rb-micro">Bez spojení s Home Assistantem nelze posílat příkazy.</p>
              )}
            </div>
          </div>
        </Card>
      </div>

      {confirm && (
        <div className="rb-scrim" onClick={() => !sending && setConfirm(null)}>
          <div
            className="rb-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="rb-confirm-title"
            data-testid="robots-confirm"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 id="rb-confirm-title">{confirm.title}</h3>
            <p className="rb-sub">
              {robot.name}
              {robot.floor ? ` · ${robot.floor}` : ''}
            </p>
            <ul>
              {confirm.plan.map((step) => (
                <li key={step.service + step.summary}>{step.summary}</li>
              ))}
            </ul>
            {robot.status.tone === 'cleaning' &&
              confirm.plan.some((s) => s.service === 'vacuum.send_command') && (
                <p className="rb-micro">Robot právě uklízí – nový úklid nahradí ten současný.</p>
              )}
            <div className="rb-sheet-actions">
              <Button onClick={() => setConfirm(null)} disabled={sending}>
                Zrušit
              </Button>
              <Button
                variant="primary"
                data-testid="robots-confirm-send"
                onClick={() => void send()}
                disabled={sending}
              >
                {sending ? 'Odesílám…' : 'Odeslat'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function markerTone(tone: RobotModel['status']['tone']): MarkerTone {
  if (tone === 'cleaning' || tone === 'returning' || tone === 'error') return tone;
  return 'idle';
}

function Battery({ value, charging }: { value: number | null; charging: boolean }) {
  const pct = value === null ? 0 : Math.max(0, Math.min(100, Math.round(value)));
  const tone = value === null ? 'off' : pct <= 15 ? 'crit' : pct <= 30 ? 'warn' : 'ok';
  return (
    <div className="rb-battery" data-rb-batt={tone} data-testid="robots-battery">
      <svg viewBox="0 0 44 22" aria-hidden="true">
        <rect x="1" y="1" width="38" height="20" rx="6" className="rb-batt-shell" />
        <rect x="40.5" y="7" width="2.5" height="8" rx="1.2" className="rb-batt-cap" />
        <rect
          x="4"
          y="4"
          width={Math.max(2, (32 * pct) / 100)}
          height="14"
          rx="3.5"
          className="rb-batt-fill"
        />
      </svg>
      <span>
        <b>{value === null ? '–' : `${pct}\u00a0%`}</b>
        <em>{charging ? 'nabíjí se' : 'baterie'}</em>
      </span>
    </div>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 20 20" className="rb-ico" aria-hidden="true">
      <rect x="5" y="4" width="3.4" height="12" rx="1.2" />
      <rect x="11.6" y="4" width="3.4" height="12" rx="1.2" />
    </svg>
  );
}

function HomeIcon() {
  return (
    <svg viewBox="0 0 20 20" className="rb-ico" aria-hidden="true">
      <path d="M3.5 9.2 10 3.8l6.5 5.4V16a1 1 0 0 1-1 1h-3.3v-4.4H7.8V17H4.5a1 1 0 0 1-1-1Z" />
    </svg>
  );
}

function Ring({ percent }: { percent: number }) {
  const r = 16;
  const c = 2 * Math.PI * r;
  return (
    <svg className="rb-ring" viewBox="0 0 40 40" aria-hidden="true">
      <circle cx="20" cy="20" r={r} className="rb-ring-track" />
      <circle
        cx="20"
        cy="20"
        r={r}
        className="rb-ring-fill"
        strokeDasharray={`${(c * Math.max(percent, 1.5)) / 100} ${c}`}
        transform="rotate(-90 20 20)"
      />
    </svg>
  );
}

function Tank({ ok, kind }: { ok: boolean; kind: string }) {
  const level = kind === 'dirty_water' ? (ok ? 0.25 : 0.92) : ok ? 0.72 : 0.08;
  return (
    <svg className="rb-tank" viewBox="0 0 28 36" aria-hidden="true">
      <rect x="2" y="2" width="24" height="32" rx="7" className="rb-tank-shell" />
      <rect
        x="5"
        y={5 + 26 * (1 - level)}
        width="18"
        height={26 * level}
        rx="4"
        className="rb-tank-fill"
      />
    </svg>
  );
}

const TRAIL_KEY = 'hb.robots.trail';
/** Rough cleaning pace for the CTA estimate (minutes per m², incl. turns and transit). */
const MINUTES_PER_M2: Record<CleanMode, number> = { vacuum: 0.8, mop: 1, both: 1.2 };

function readTrailPref(): boolean {
  try {
    return globalThis.localStorage?.getItem(TRAIL_KEY) === 'full';
  } catch {
    return false;
  }
}

function writeTrailPref(full: boolean): void {
  try {
    globalThis.localStorage?.setItem(TRAIL_KEY, full ? 'full' : 'faded');
  } catch {
    /* private mode: the toggle still works for this session */
  }
}

/**
 * Idle header state with the battery next to the word it belongs to: „Nabito 100 % · čeká
 * v doku“ (never „Nabito, čeká v doku 100 %“), otherwise „V doku · 64 %“.
 */
export function statusWithBattery(label: string, battery: number | null): string {
  if (battery === null) return label;
  const pct = `${Math.round(battery)}\u00a0%`;
  const [head, ...rest] = label.split(', ');
  if (/^(Nabito|Nabíjí)/.test(head!)) return [`${head} ${pct}`, ...rest].join(' · ');
  return `${label} · ${pct}`;
}

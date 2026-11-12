import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { ModuleViewProps } from '@homebrain/ha-client';
import {
  Button,
  Card,
  Chip,
  ProgressRing,
  Stepper,
  Tile,
  czCount,
  useToast,
} from '@homebrain/ui';
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
  findResetButton,
  isRobotResetButton,
  planResetCounter,
  planResolveDockError,
  planResumeAfterFix,
  planSimple,
  runPlan,
  type CleanMode,
  type ServiceCallPlan,
} from '../commands.js';
import { orderBadge, pruneOrder, toggleRoom } from '../rooms.js';
import { RobotArt } from './RobotArt.js';
import { GuideSheet, useGuides } from './GuideSheet.js';
import { PresetSheet, type PresetEditorTarget } from './PresetSheet.js';
import { SchedulesCard } from './SchedulesCard.js';
import {
  MAX_PLUS,
  MAX_PLUS_HINT,
  fansForMode,
  PRESET_START_DELAY_MS,
  delayedStart,
  deletePreset,
  effectiveSettings,
  fetchPresets,
  saveDefaults,
  savePreset,
  settingsSummary,
  startCleaning,
  type PresetDraft,
  type PresetsBySlot,
  type RobotPresetData,
  type RobotPreset,
  type StartRequest,
} from '../presets.js';
import { guideFor, type GuidePart } from '../guides.js';
import {
  maintenanceGroups,
  maintenanceItems,
  maintenanceSummary,
  type MaintItem,
} from '../maintenance.js';
import { RobotPhoto, usePhotoManifest } from './RobotPhoto.js';
import { anyPartLow, photoBase, photoView } from '../photo.js';
import {
  VectorFloorPlan,
  VectorMapBoundary,
  vectorMapEnabled,
  type MarkerTone,
} from './VectorMap.js';
import { useVectorMap } from './useVectorMap.js';
import { roomAt } from '../map/geometry.js';
import { robotsStyles } from './robotsStyles.js';
import { CleaningOptionRow } from './CleaningOptionRow.js';
import { LevelSegmentedControl } from './LevelSegmentedControl.js';
import { RoomIcon } from './roomIcons.js';
import { useRobotsUiMemory } from '../useRobotsUiMemory.js';
import type { SlotUiMemory } from '../uiMemory.js';
import {
  CheckIcon,
  EditIcon,
  HomeIcon,
  InfoIcon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  RouteIcon,
} from './robotActionIcons.js';
import {
  readDockResolvePending,
  writeDockResolvePending,
} from '../dockResolvePending.js';
import {
  DOCK_REFILL_ACK_NOTE,
  DOCK_REFILL_AFTER_HINT,
  canResolveRefillDockError,
  dockErrorRoborockCode,
  isRefillDockError,
} from '../errors.js';

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
    const timer = setInterval(() => load(false), 30 * 60_000);
    return () => clearInterval(timer);
  }, [load]);
  // Defaults + named presets per robot (HA storage); empty until loaded or on old backends.
  const [presets, setPresets] = useState<PresetsBySlot>({});
  const loadPresets = useCallback(() => {
    if (!connection) return;
    fetchPresets(connection)
      .then(setPresets)
      .catch(() => setPresets({}));
  }, [connection]);
  useEffect(() => {
    loadPresets();
  }, [loadPresets]);
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
        hasEntity={(id) => {
          const state = store.getSnapshot(id);
          return !!state && state.state !== 'unavailable';
        }}
        onReloadRooms={() => load(true)}
        presetData={presets[String(active.slot)] ?? null}
        onPresetsChanged={loadPresets}
      />
      {connection && (
        <SchedulesCard
          key={`s${active.slot}`}
          robot={active}
          connection={connection}
          presets={presets}
        />
      )}
    </section>
  );
}

function RobotPanel({
  robot,
  connection,
  hasEntity,
  onReloadRooms,
  presetData,
  onPresetsChanged,
}: {
  robot: RobotModel;
  connection: ModuleViewProps['connection'];
  hasEntity: (entityId: string) => boolean;
  onReloadRooms: () => void;
  presetData: RobotPresetData | null;
  onPresetsChanged: () => void;
}) {
  const [order, setOrder] = useState<number[]>([]);
  // Inline controls start from the robot's remembered default setup (else its current
  // values); a tap overrides them for this run only.
  const defaults = presetData?.defaults ?? null;
  const presetList = presetData?.presets ?? [];
  const [modePick, setMode] = useState<CleanMode | null>(null);
  const [fanPick, setFan] = useState<string | null>(null);
  const [waterPick, setWater] = useState<string | null>(null);
  const [routePick, setMopRoute] = useState<string | null>(null);
  const [passesPick, setPasses] = useState<number | null>(null);
  const pickOr = <T,>(
    pick: T | null,
    choices: readonly T[] | null,
    ...rest: (T | null | undefined)[]
  ) =>
    pick ??
    rest.find((v) => v !== null && v !== undefined && (!choices || choices.includes(v))) ??
    null;
  const mode = pickOr<CleanMode>(modePick, null, defaults?.mode, robot.mode);
  const rawFan = pickOr(fanPick, robot.fanChoices, defaults?.fan, robot.fan);
  // Max+ only in vacuum-only mode (Roborock flips the mode / drops Max+ otherwise).
  const fan = rawFan === MAX_PLUS && mode !== 'vacuum' ? 'max' : rawFan;
  const [maxPlusHint, setMaxPlusHint] = useState(false);
  const chooseMode = (next: CleanMode) => {
    setMode(next);
    const downgraded = fan === MAX_PLUS && next !== 'vacuum';
    setMaxPlusHint(downgraded);
    if (downgraded) setFan('max');
  };
  const water = pickOr(
    waterPick,
    robot.water?.choices ?? null,
    defaults?.water,
    robot.water?.value,
  );
  const mopRoute = pickOr(
    routePick,
    robot.mopRoute?.choices ?? null,
    defaults?.route,
    robot.mopRoute?.value,
  );
  const passes = passesPick ?? defaults?.passes ?? 1;
  const [advanced, setAdvanced] = useState(false);
  const [presetIdPick, setPresetIdPick] = useState<string | null>(null);
  const applyUiMemory = useCallback((slot: SlotUiMemory) => {
    if (typeof slot.advanced === 'boolean') setAdvanced(slot.advanced);
    if (slot.mode) setMode(slot.mode);
    if (slot.fan) setFan(slot.fan);
    if (slot.water) setWater(slot.water);
    if (slot.route) setMopRoute(slot.route);
    if (slot.passes !== undefined) setPasses(slot.passes);
    if (slot.presetId) setPresetIdPick(slot.presetId);
  }, []);
  const { rememberPreset } = useRobotsUiMemory(
    connection,
    robot,
    presetList.map((p) => p.id),
    {
      advanced,
      modePick,
      fanPick,
      waterPick,
      routePick,
      passesPick,
      presetIdPick,
    },
    applyUiMemory,
  );
  const [dockPendingRevision, setDockPendingRevision] = useState(0);
  const [dockResolvePendingUiBySlot, setDockResolvePendingUiBySlot] = useState<
    Record<number, boolean>
  >({});
  const dockResolvePendingUi = dockResolvePendingUiBySlot[robot.slot] ?? false;
  const setDockResolvePendingUi = (pending: boolean) =>
    setDockResolvePendingUiBySlot((prev) => ({ ...prev, [robot.slot]: pending }));
  const dockResolvePending = useMemo(
    () =>
      dockResolvePendingUi ||
      readDockResolvePending(robot.slot, robot.dockError?.code, robot.dockErrorStamp),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pending marker reread after resolve_error
    [robot.slot, robot.dockError, robot.dockErrorStamp, dockPendingRevision, dockResolvePendingUi],
  );
  const [confirm, setConfirm] = useState<{
    title: string;
    plan: ServiceCallPlan[];
    start?: StartRequest;
  } | null>(null);
  const [sending, setSending] = useState(false);
  const [editor, setEditor] = useState<PresetEditorTarget | null>(null);
  const [saving, setSaving] = useState(false);
  const notify = useToast();
  const [guidePart, setGuidePart] = useState<GuidePart | null>(null);
  const photoDir = photoBase(robot);
  const guides = useGuides(photoDir);
  const maintItems = maintenanceItems(robot, guides);
  const tone = robot.status.tone;
  const busy = tone === 'cleaning' || tone === 'returning';
  const maintGroups = maintenanceGroups(maintItems, robot.dockError, dockResolvePending);
  const maintSummary = maintenanceSummary(maintItems, robot.dockError, dockResolvePending);
  // Guide's own reset entity wins; else the robot's Roborock reset button found in HA.
  const guideWithReset = (part: GuidePart) => {
    const guide = guideFor(guides, part);
    return guide.reset
      ? guide
      : { ...guide, reset: findResetButton(part, robot.vacuum, hasEntity) };
  };

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
  const rooms = useMemo(() => {
    if (!vmap) return robot.rooms;
    const names = new Map(robot.rooms.map((room) => [room.id, room.name]));
    return vmap.rooms.map((room) => ({ id: room.id, name: names.get(room.id) || 'Místnost' }));
  }, [vmap, robot.rooms]);
  const selected = pruneOrder(order, rooms);
  const roomRefresh = useRef('');
  useEffect(() => {
    if (!vmap) return;
    const ids = vmap.rooms
      .map((room) => room.id)
      .sort((a, b) => a - b)
      .join(',');
    const cached = robot.rooms
      .map((room) => room.id)
      .sort((a, b) => a - b)
      .join(',');
    // One refresh per observed partition, even if the vendor still returns stale names.
    if (ids !== cached && roomRefresh.current !== ids) {
      roomRefresh.current = ids;
      onReloadRooms();
    }
  }, [vmap, robot.rooms, onReloadRooms]);
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
    ? (rooms.find((room) => room.id === poseRoom)?.name ?? null)
    : robot.room;
  // A quarter-turn rotation swaps the drawn width and height (portrait ↔ landscape).
  const quarter = robot.rotation === 90 || robot.rotation === 270;
  const mapW = vmap ? vmap.bounds[2] - vmap.bounds[0] : 0;
  const mapH = vmap ? vmap.bounds[3] - vmap.bounds[1] : 0;
  const portraitMap = !!vmap && (quarter ? mapW > mapH * 1.1 : mapH > mapW * 1.1);
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
  // Owner decision: a preset chip starts right away (no confirm); the WS start is sent only
  // after the 5 s „Zrušit“ window, so cancelling never has to stop a running robot.
  const [managePresets, setManagePresets] = useState(false);
  const launchPreset = (preset: RobotPreset) => {
    if (!connection) return;
    rememberPreset({
      presetId: preset.id,
      mode: preset.mode,
      fan: preset.fan,
      water: preset.water,
      route: preset.route,
      passes: preset.passes,
    });
    setPresetIdPick(preset.id);
    const toastId = `rb-preset-start-${robot.slot}`;
    const cancel = delayedStart(() => {
      notify.dismiss(toastId);
      startCleaning(connection, { slot: robot.slot, preset_id: preset.id })
        .then(() => notify.success(`Úklid „${preset.name}“ spuštěn. Čekám na stav robota.`))
        .catch((error: unknown) =>
          notify.error(
            `Spuštění „${preset.name}“ se nepodařilo${error instanceof Error && error.message ? `: ${error.message}` : '.'}`,
          ),
        );
    }, PRESET_START_DELAY_MS);
    notify.undo(
      `Spouštím „${preset.name}“…`,
      () => {
        if (cancel()) notify.info(`Spuštění „${preset.name}“ zrušeno.`);
      },
      { id: toastId, actionLabel: 'Zrušit', duration: PRESET_START_DELAY_MS },
    );
  };
  const persist = async (draft: PresetDraft) => {
    if (!connection || !editor) return;
    setSaving(true);
    try {
      if (editor.kind === 'defaults') {
        const { mode, fan, water, route, passes } = draft;
        await saveDefaults(connection, robot.slot, { mode, fan, water, route, passes });
        notify.success('Výchozí nastavení uloženo.');
      } else {
        await savePreset(connection, robot.slot, draft);
        notify.success(`Předvolba „${draft.name.trim()}“ uložena.`);
      }
      setEditor(null);
      onPresetsChanged();
    } catch (error) {
      notify.error(
        `Uložení se nepodařilo${error instanceof Error && error.message ? `: ${error.message}` : '.'}`,
      );
    } finally {
      setSaving(false);
    }
  };
  const remove = async (preset: RobotPreset) => {
    if (!connection) return;
    setSaving(true);
    try {
      await deletePreset(connection, robot.slot, preset.id);
      notify.success(`Předvolba „${preset.name}“ smazána.`);
      setEditor(null);
      onPresetsChanged();
    } catch {
      notify.error('Předvolbu se nepodařilo smazat.');
    } finally {
      setSaving(false);
    }
  };
  const send = async () => {
    if (!confirm || !connection) return;
    setSending(true);
    try {
      // Cleaning starts go through the backend: it applies the settings, waits until HA
      // reports them and only then starts the robot (no race with the old suction/water).
      if (confirm.start) await startCleaning(connection, confirm.start);
      else await runPlan(connection, confirm.plan, [robot.vacuum]);
      notify.success('Příkaz odeslán. Čekám na skutečný stav z Home Assistantu.');
      if (confirm.start) setOrder([]);
    } catch (error) {
      notify.error(
        `Příkaz se nepodařilo odeslat${error instanceof Error && error.message ? `: ${error.message}` : '.'}`,
      );
    } finally {
      setSending(false);
      setConfirm(null);
    }
  };
  const confirmDockRefillResolved = async () => {
    if (!connection || !robot.dockError || dockResolveCode === null) return;
    const plan = planResolveDockError(robot.vacuum, dockResolveCode, robot.dockError.title);
    if (!plan.length) return;
    setSending(true);
    try {
      setDockResolvePendingUi(true);
      if (robot.dockErrorStamp)
        writeDockResolvePending(robot.slot, robot.dockError.code, robot.dockErrorStamp);
      setDockPendingRevision((n) => n + 1);
      await runPlan(connection, plan, [robot.vacuum]);
      notify.success('Chyba doku potvrzena');
    } catch (error) {
      const detail = error instanceof Error && error.message ? `: ${error.message}` : '';
      notify.error(`Chybu doku se nepodařilo potvrdit${detail}. Potvrďte chybu v aplikaci Roborock.`);
    } finally {
      setSending(false);
    }
  };
  const care = (
    <Card
      as="article"
      className="rb-care rb-card"
      data-testid="robots-care"
      data-rb-maint={maintSummary.tone}
    >
      <div className="rb-card-head">
        <h3>Údržba</h3>
        <p className="rb-micro rb-maint-summary" data-testid="robots-maint-summary">
          {maintSummary.text}
        </p>
      </div>
      {maintGroups.length ? (
        maintGroups.map((group) => (
          <section
            key={group.id}
            className="rb-maint-group"
            aria-label={group.label}
            data-testid={`robots-maint-${group.id}`}
          >
            <div className="rb-maint-head">
              <h4>{group.label}</h4>
              {group.id === 'dock' && dockResolvePending && (
                <Chip
                  className="rb-dock-ack-chip"
                  data-testid="robots-dock-ack-chip"
                  tone="neutral"
                  variant="soft"
                >
                  {DOCK_REFILL_ACK_NOTE}
                </Chip>
              )}
              {group.note && (
                <span className="rb-maint-note" data-testid={`robots-maint-${group.id}-note`}>
                  {group.note}
                </span>
              )}
            </div>
            {group.items.length > 0 && (
              <ul className="rb-maint-grid">
                {group.items.map((item) => (
                  <li
                    key={item.id}
                    data-testid={`robots-part-${item.id}`}
                    data-rb-tone={item.tone}
                    data-rb-kind={item.kind}
                  >
                    <Tile
                      className="rb-maint-tile"
                      tone={item.tone === 'ok' ? 'neutral' : item.tone}
                      icon={<MaintIcon item={item} />}
                      label={item.label}
                      status={item.status}
                      detail={
                        dockResolvePending && item.id === 'clean_water' ? DOCK_REFILL_ACK_NOTE : undefined
                      }
                      onPress={() => setGuidePart(item.part)}
                      aria-label={`${item.label}: ${item.status}${
                        item.percent !== null ? ` (${item.percent} %)` : ''
                      }. Otevřít návod`}
                      data-testid={`robots-guide-open-${item.id}`}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))
      ) : (
        <p className="rb-note">Díly ani nádrže nejsou přiřazené.</p>
      )}
      {maintItems.some((item) => item.kind === 'counter') && (
        <p className="rb-micro rb-maint-foot">Odhad zbývající doby při ~1 h úklidu denně</p>
      )}
    </Card>
  );
  const problem = robot.error ?? robot.dockError;
  const dockResolveCode =
    robot.dockError && canResolveRefillDockError(robot.dockError.code)
      ? dockErrorRoborockCode(robot.dockError.code)
      : null;
  const manifest = usePhotoManifest(photoDir);
  const [failedPhotoDir, setFailedPhotoDir] = useState<string | null>(null);
  const [maintenance, setMaintenance] = useState(false);
  const photo = !!photoDir && !!manifest && failedPhotoDir !== photoDir;
  return (
    <>
      <div className="rb-grid" data-rb-tone={tone}>
        <div className="rb-col">
          <Card
            as="article"
            className="rb-hero rb-card"
            data-testid="robots-hero"
            data-rb-photo={photo || undefined}
          >
            {/* Visual slot: the owner's photo set (manifest under /local/homebrain/robots/<robot>/,
              never bundled) or the neutral RobotArt fallback. */}
            <div
              className="rb-hero-art"
              data-rb-visual={photo ? 'photo' : 'art'}
              data-testid="robots-hero-visual"
            >
              {photo ? (
                <RobotPhoto
                  base={photoDir}
                  manifest={manifest}
                  name={robot.name}
                  view={photoView(tone, robot.error ?? robot.dockError, maintenance)}
                  error={robot.error ?? robot.dockError}
                  parts={robot.consumables}
                  partsLow={anyPartLow(robot.consumables)}
                  maintenance={maintenance}
                  onMaintenance={setMaintenance}
                  onFail={() => setFailedPhotoDir(photoDir)}
                />
              ) : (
                <RobotArt tone={tone} image={photoDir ? '' : robot.image} name={robot.name} />
              )}
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
                      onClick={() =>
                        ask('Pokračovat v úklidu?', planSimple('resume', robot.vacuum))
                      }
                    >
                      <PlayIcon />
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
              {problem.steps.length === 1 ? (
                <p className="rb-problem-step">{problem.steps[0]}</p>
              ) : (
                <Stepper
                  variant="instructions"
                  label="Jak to opravit"
                  steps={problem.steps.map((step, i) => ({
                    key: `${i}-${step}`,
                    title: step,
                    state: 'todo' as const,
                  }))}
                />
              )}
              {problem.source === 'dock' && isRefillDockError(problem.code) && (
                <p className="rb-problem-refill" data-testid="robots-dock-refill-hint">
                  {DOCK_REFILL_AFTER_HINT}
                </p>
              )}
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
                    <PlayIcon />
                    Hotovo – pokračovat
                  </Button>
                  <span>Robot pokračuje až po potvrzení.</span>
                </div>
              )}
              {problem.source === 'dock' && dockResolveCode !== null && (
                <div className="rb-problem-cta">
                  <Button
                    variant="strong"
                    data-testid="robots-dock-ack-refilled"
                    disabled={!canAct || dockResolvePending || sending}
                    onClick={() => void confirmDockRefillResolved()}
                  >
                    <CheckIcon />
                    Doplněno, potvrdit
                  </Button>
                  {!busy && tone !== 'charging' && tone !== 'docked' && (
                    <Button
                      data-testid="robots-dock-return-home"
                      disabled={!canAct}
                      onClick={() => ask('Poslat robota do doku?', planSimple('home', robot.vacuum))}
                    >
                      <HomeIcon />
                      Vrátit do doku
                    </Button>
                  )}
                </div>
              )}
              <details>
                <summary>
                  <InfoIcon />
                  Podrobnosti
                </summary>
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
                      {rooms.length
                        ? ` · ${czCount(rooms.length, 'místnost', 'místnosti', 'místností')}`
                        : ''}
                    </>
                  )}
                </p>
              </div>
              {/* At least two path points: a single point has nothing to show or hide. */}
              {vector?.available && vector.map.path.length >= 4 && (
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
                  <RouteIcon />
                  Trasa
                </Chip>
              )}
            </div>
            {connection && (
              <div className="rb-presets" data-testid="robots-presets">
                <div className="rb-chips" role="group" aria-label="Předvolby úklidu">
                  {presetList.map((preset) => (
                    <Chip
                      key={preset.id}
                      className="rb-chip rb-preset"
                      pressed={false}
                      look="soft"
                      data-testid={`robots-preset-${preset.id}`}
                      disabled={!managePresets && (!canAct || Boolean(robot.error))}
                      aria-label={
                        managePresets
                          ? `Upravit předvolbu ${preset.name}`
                          : `Spustit předvolbu ${preset.name}`
                      }
                      onPress={() =>
                        managePresets ? setEditor({ kind: 'preset', preset }) : launchPreset(preset)
                      }
                    >
                      {managePresets ? <EditIcon /> : <PlayIcon />}
                      <span className="rb-chip-name">{preset.name}</span>
                      <span className="rb-chip-sub">
                        {[
                          ...settingsSummary(effectiveSettings(defaults, preset)).slice(0, 2),
                          preset.rooms.length
                            ? czCount(preset.rooms.length, 'místnost', 'místnosti', 'místností')
                            : 'celý byt',
                        ].join(' · ')}
                      </span>
                    </Chip>
                  ))}
                  {presetList.length > 0 && (
                    <Chip
                      className="rb-chip"
                      data-testid="robots-presets-manage"
                      pressed={managePresets}
                      onPressedChange={setManagePresets}
                    >
                      {managePresets ? 'Hotovo' : 'Upravit'}
                    </Chip>
                  )}
                  <Chip
                    className="rb-chip"
                    data-testid="robots-preset-add"
                    pressed={false}
                    onPress={() => setEditor({ kind: 'preset', preset: null })}
                  >
                    <PlusIcon />
                    Předvolba
                  </Chip>
                  <Chip
                    className="rb-chip"
                    data-testid="robots-defaults-edit"
                    pressed={false}
                    aria-label="Výchozí nastavení úklidu"
                    onPress={() => setEditor({ kind: 'defaults' })}
                  >
                    Výchozí
                    {defaults
                      ? `: ${settingsSummary(defaults).slice(0, 2).join(' · ') || 'beze změn'}`
                      : ''}
                  </Chip>
                </div>
              </div>
            )}
            <div className="rb-map-row" data-rb-portrait={portraitMap || undefined}>
              <div className="rb-map" data-map-kind={vector?.available ? 'vector' : 'image'}>
                {vector?.available ? (
                  <VectorMapBoundary resetKey={vector.map.digest} fallback={imageMap}>
                    <VectorFloorPlan
                      map={vector.map}
                      rooms={rooms}
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
                      rotation={robot.rotation}
                    />
                  </VectorMapBoundary>
                ) : vector === null && robot.mapImage ? (
                  <span className="rb-map-loading" aria-hidden="true" />
                ) : (
                  imageMap
                )}
              </div>
              <div className="rb-clean-side">
                {rooms.length ? (
                  <div
                    className="rb-room-grid"
                    role="group"
                    aria-label="Místnosti v pořadí úklidu"
                  >
                    {rooms.map((room) => {
                      const badge = orderBadge(selected, room.id);
                      return (
                        <Chip
                          key={room.id}
                          className="rb-chip rb-room-tile"
                          look="soft"
                          pressed={badge !== null}
                          badge={badge}
                          badgeLabel={badge !== null ? `pořadí ${badge}` : undefined}
                          data-testid={`robots-room-${room.id}`}
                          onPress={() => setOrder(toggleRoom(selected, room.id))}
                        >
                          <RoomIcon name={room.name} className="rb-room-tile-ico" />
                          <span className="rb-room-tile-name">{room.name}</span>
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
                  <LevelSegmentedControl
                    label="Nastavení"
                    className="rb-level"
                    value={advanced ? 'advanced' : 'basic'}
                    onChange={(value) => setAdvanced(value === 'advanced')}
                  />
                  {modes.length > 1 && (
                    <CleaningOptionRow
                      label="Režim"
                      value={mode}
                      iconKind="mode"
                      options={modes.map((m) => [m, CLEAN_MODE_LABELS[m]])}
                      onChange={(value) => chooseMode(value as CleanMode)}
                    />
                  )}
                  {robot.fanChoices.length > 1 && (
                    <CleaningOptionRow
                      label="Sání"
                      value={fan}
                      iconKind="fan"
                      options={fansForMode(robot.fanChoices, mode).map((f) => [
                        f,
                        FAN_LABELS[f] ?? f,
                      ])}
                      onChange={(value) => {
                        setFan(value);
                        setMaxPlusHint(false);
                      }}
                    />
                  )}
                  {maxPlusHint && (
                    <p className="rb-micro rb-hint" role="status" data-testid="robots-maxplus-hint">
                      {MAX_PLUS_HINT}
                    </p>
                  )}
                  {advanced && mops && robot.water && (
                    <CleaningOptionRow
                      label="Voda"
                      className="rb-adv"
                      iconKind="water"
                      value={water}
                      options={robot.water.choices.map((w) => [w, WATER_LABELS[w] ?? w])}
                      onChange={setWater}
                    />
                  )}
                  {advanced && mops && robot.mopRoute && (
                    <CleaningOptionRow
                      label="Mopování"
                      className="rb-adv"
                      iconKind="mop"
                      value={mopRoute}
                      options={robot.mopRoute.choices.map((m) => [m, MOP_ROUTE_LABELS[m] ?? m])}
                      onChange={setMopRoute}
                    />
                  )}
                  {advanced && (
                    <CleaningOptionRow
                      label="Průchody"
                      className="rb-adv"
                      iconKind="passes"
                      value={String(passes)}
                      options={[
                        ['1', '1×'],
                        ['2', '2×'],
                        ['3', '3×'],
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
                      setConfirm({
                        title: 'Spustit úklid?',
                        // Explicit values from the controls (prefilled with the defaults).
                        start: {
                          slot: robot.slot,
                          rooms: selected,
                          settings: {
                            mode,
                            fan,
                            water: modeMops(mode ?? robot.mode) ? water : null,
                            route: modeMops(mode ?? robot.mode) ? mopRoute : null,
                            passes,
                          },
                        },
                        plan: planCleanRooms({
                          vacuum: robot.vacuum,
                          rooms: selected.map((id) => rooms.find((room) => room.id === id)!),
                          mode,
                          currentMode: robot.mode,
                          modeSelect: robot.modeSelect,
                          fan,
                          currentFan: robot.fan,
                          repeat: passes,
                          water: robot.water
                            ? {
                                entity: robot.water.entity,
                                value: water,
                                current: robot.water.value,
                              }
                            : undefined,
                          mopRoute: robot.mopRoute
                            ? {
                                entity: robot.mopRoute.entity,
                                value: mopRoute,
                                current: robot.mopRoute.value,
                              }
                            : undefined,
                        }),
                      })
                    }
                  >
                    {!robot.error && selected.length > 0 ? <PlayIcon /> : null}
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
      </div>
      {/* Sheets live outside .rb-grid: its entry animation leaves a transform that would
          make the fixed scrim relative to the grid. */}
      {guidePart && (
        <GuideSheet
          part={guidePart}
          guide={guideWithReset(guidePart)}
          robotName={robot.name}
          base={photoDir}
          manifest={manifest}
          resetReady={(() => {
            const reset = guideWithReset(guidePart).reset;
            return !!reset && isRobotResetButton(reset, robot.vacuum) && hasEntity(reset);
          })()}
          canAct={canAct}
          onClose={() => setGuidePart(null)}
          onReset={() => {
            const guide = guideWithReset(guidePart);
            setGuidePart(null);
            if (guide.reset)
              ask('Vynulovat počítadlo?', planResetCounter(guide.reset, robot.vacuum, guide.title));
          }}
        />
      )}
      {editor && (
        <PresetSheet
          robot={robot}
          target={editor}
          defaults={defaults}
          presets={presetList}
          busy={saving}
          onClose={() => !saving && setEditor(null)}
          onSave={(draft) => void persist(draft)}
          onDelete={(preset) => void remove(preset)}
        />
      )}
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
    </>
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

/** Tile icon: life-left ring for counters, tank level for tanks, wrench for guide-only parts. */
function MaintIcon({ item }: { item: MaintItem }) {
  if (item.kind === 'counter' && item.percent !== null)
    return (
      <ProgressRing
        value={item.percent / 100}
        size={40}
        thickness={4}
        tone={item.tone === 'crit' ? 'crit' : item.tone === 'warn' ? 'warn' : 'ok'}
      >
        <em className="rb-maint-pct">{item.percent}</em>
      </ProgressRing>
    );
  if (item.kind === 'tank') return <Tank ok={item.ok !== false} kind={item.id} />;
  return (
    <svg viewBox="0 0 20 20" className="rb-maint-glyph" aria-hidden="true">
      <path d="M13.9 2.6a4 4 0 0 0-4.6 5.3l-6 6a1.6 1.6 0 1 0 2.3 2.3l6-6a4 4 0 0 0 5.3-4.6l-2.4 2.4-2.3-.6-.6-2.3Z" />
    </svg>
  );
}

function Tank({ ok, kind }: { ok: boolean; kind: string }) {
  const level = kind === 'dirty_water' ? (ok ? 0.25 : 0.92) : ok ? 0.72 : 0.08;
  return (
    <svg
      className="rb-tank"
      viewBox="0 0 28 36"
      aria-hidden="true"
      data-rb-tank={kind}
      data-rb-ok={ok}
    >
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

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { ModuleViewProps } from '@homebrain/ha-client';
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
import { robotsStyles } from './robotsStyles.js';

type Toast = { kind: 'ok' | 'error'; text: string } | null;

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
              {robot.battery !== null ? `${Math.round(robot.battery)} %` : robot.status.label}
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
  const [confirm, setConfirm] = useState<{ title: string; plan: ServiceCallPlan[] } | null>(null);
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState<Toast>(null);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(timer);
  }, [toast]);
  const selected = pruneOrder(order, robot.rooms);
  const canAct = !!connection && robot.available;
  const modes = (['vacuum', 'mop', 'both'] as CleanMode[]).filter((m) =>
    modeOptionAvailable(m, robot.modeOptions),
  );
  const ask = (title: string, plan: ServiceCallPlan[]) =>
    plan.length && setConfirm({ title, plan });
  const send = async () => {
    if (!confirm || !connection) return;
    setSending(true);
    try {
      await runPlan(connection, confirm.plan);
      setToast({ kind: 'ok', text: 'Příkaz odeslán. Čekám na skutečný stav z Home Assistantu.' });
      if (confirm.plan.some((step) => step.service === 'vacuum.send_command')) setOrder([]);
    } catch (error) {
      setToast({
        kind: 'error',
        text: `Příkaz se nepodařilo odeslat${error instanceof Error && error.message ? `: ${error.message}` : '.'}`,
      });
    } finally {
      setSending(false);
      setConfirm(null);
    }
  };
  const care = (
    <>
      <article className="rb-care rb-card" data-testid="robots-care">
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
      </article>

      <article
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
      </article>
    </>
  );
  const tone = robot.status.tone;
  const problem = robot.error ?? robot.dockError;
  return (
    <div className="rb-grid" data-rb-tone={tone}>
      <div className="rb-col">
        <article className="rb-hero rb-card" data-testid="robots-hero">
          <div className="rb-hero-art">
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
              {robot.room ? (
                <>
                  {robot.status.busy ? 'V místnosti ' : 'Naposledy v místnosti '}
                  <b>{robot.room}</b>
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
                  <button
                    type="button"
                    className="rb-btn"
                    disabled={!canAct}
                    onClick={() => ask('Pokračovat v úklidu?', planSimple('resume', robot.vacuum))}
                  >
                    Pokračovat
                  </button>
                ) : tone === 'cleaning' ? (
                  // Pause only while cleaning – a disabled „Pauza“ in other states read as broken.
                  <button
                    type="button"
                    className="rb-btn rb-btn-strong"
                    data-testid="robots-pause"
                    disabled={!canAct}
                    onClick={() => ask('Pozastavit úklid?', planSimple('pause', robot.vacuum))}
                  >
                    <PauseIcon />
                    Pauza
                  </button>
                ) : null}
                <button
                  type="button"
                  className="rb-btn"
                  data-testid="robots-home"
                  disabled={!canAct || tone === 'charging' || tone === 'docked'}
                  onClick={() => ask('Poslat robota do doku?', planSimple('home', robot.vacuum))}
                >
                  <HomeIcon />
                  Zpět do doku
                </button>
              </div>
            </div>
          </div>
        </article>

        {problem && (
          <article className="rb-problem rb-card" data-testid="robots-problem" role="alert">
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
                <button
                  type="button"
                  className="rb-btn rb-btn-strong"
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
                </button>
                <span>Robot pokračuje až po potvrzení.</span>
              </div>
            )}
            <details>
              <summary>Podrobnosti</summary>
              Kód pro servis: {problem.code}
            </details>
          </article>
        )}

        {care}
      </div>
      <div className="rb-col">
        <article className="rb-clean rb-card" data-testid="robots-clean">
          <div className="rb-card-head">
            <h3>Uklidit místnosti</h3>
            <p className="rb-micro">{robot.mapName ?? 'Mapa'}</p>
          </div>
          <div className="rb-map">
            {robot.mapImage ? (
              <img
                src={robot.mapImage}
                alt={`Mapa – ${robot.floor || robot.name}`}
                data-testid="robots-map"
              />
            ) : (
              <p className="rb-map-empty">
                Mapa se ukáže po přiřazení obrázku mapy (entita image) v nastavení robota.
              </p>
            )}
          </div>
          {robot.rooms.length ? (
            <div className="rb-chips" role="group" aria-label="Místnosti v pořadí úklidu">
              {robot.rooms.map((room) => {
                const badge = orderBadge(selected, room.id);
                return (
                  <button
                    key={room.id}
                    type="button"
                    className="rb-chip"
                    aria-pressed={badge !== null}
                    data-testid={`robots-room-${room.id}`}
                    onClick={() => setOrder(toggleRoom(selected, room.id))}
                  >
                    {badge !== null && (
                      <span className="rb-badge" aria-label={`pořadí ${badge}`}>
                        {badge}
                      </span>
                    )}
                    {room.name}
                  </button>
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
          <p className="rb-hint" aria-live="polite">
            {selected.length
              ? `${selected.length} ${selected.length === 1 ? 'místnost' : selected.length < 5 ? 'místnosti' : 'místností'} v pořadí podle čísel`
              : 'Klepněte na místnosti v pořadí, v jakém se mají uklidit.'}
          </p>
          <div className="rb-controls">
            {modes.length > 1 && (
              <Segmented
                label="Režim"
                value={mode}
                options={modes.map((m) => [m, CLEAN_MODE_LABELS[m]])}
                onChange={(value) => setMode(value as CleanMode)}
              />
            )}
            {robot.fanChoices.length > 1 && (
              <Segmented
                label="Sání"
                value={fan}
                options={robot.fanChoices.map((f) => [f, FAN_LABELS[f] ?? f])}
                onChange={setFan}
              />
            )}
          </div>
          <button
            type="button"
            className="rb-primary"
            data-testid="robots-start"
            disabled={!canAct || !selected.length}
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
                }),
              )
            }
          >
            Uklidit vybrané{selected.length ? ` (${selected.length})` : ''}
          </button>
          {!connection && (
            <p className="rb-micro">Bez spojení s Home Assistantem nelze posílat příkazy.</p>
          )}
        </article>
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
              <button
                type="button"
                className="rb-btn"
                onClick={() => setConfirm(null)}
                disabled={sending}
              >
                Zrušit
              </button>
              <button
                type="button"
                className="rb-primary"
                data-testid="robots-confirm-send"
                onClick={() => void send()}
                disabled={sending}
              >
                {sending ? 'Odesílám…' : 'Odeslat'}
              </button>
            </div>
          </div>
        </div>
      )}
      {toast && (
        <p className="rb-toast" data-kind={toast.kind} role="status" data-testid="robots-toast">
          {toast.text}
        </p>
      )}
    </div>
  );
}

function Segmented({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string | null;
  options: [string, string][];
  onChange: (value: string) => void;
}) {
  return (
    <div className="rb-seg-wrap">
      <span className="rb-seg-label">{label}</span>
      <div className="rb-seg" role="radiogroup" aria-label={label}>
        {options.map(([key, text]) => (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={value === key}
            onClick={() => onChange(key)}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
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
        <b>{value === null ? '–' : `${pct} %`}</b>
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

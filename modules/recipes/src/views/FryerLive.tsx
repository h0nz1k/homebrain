import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useBackClosable, type EntityStore } from '@homebrain/ha-client';
import { Button, ProgressRing, Sheet, Stepper, toast } from '@homebrain/ui';
import { RecipesApiError, type RecipesApi } from '../api.js';
import {
  detectFryerEntities,
  formatCountdown,
  fryerControls,
  fryerEta,
  fryerModel,
  fryerNeedsAction,
  fryerPhase,
  fryerProgramLine,
  fryerTimeline,
  fryerVisible,
  type FryerControl,
} from '../domain/fryerLive.js';
import { FRYER_HINT, fryerHeld, readFryerStates } from '../fryerSignal.js';
import { cachedProgramName, resolveProgramName } from '../fryerProgram.js';
import { FryerArt } from './FryerArt.js';
import { Icon } from './parts.js';

const CONTROL_LABEL: Record<FryerControl, string> = {
  pause: 'Pozastavit',
  stop: 'Zastavit',
  keep_warm: 'Udržovat v teple',
};

/** Re-render on every HA update (entity ids may appear later than the first render). */
function useStoreVersion(store: EntityStore) {
  return useSyncExternalStore(
    (cb) => store.subscribeAll(cb),
    () => store.lastUpdatedAt(),
    () => store.lastUpdatedAt(),
  );
}

function useNow(ticking: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!ticking) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [ticking]);
  return now;
}

function StopConfirm({ onConfirm, onClose }: { onConfirm: () => void; onClose: () => void }) {
  useBackClosable(onClose);
  return (
    <Sheet
      title="Zastavit fritézu?"
      onClose={onClose}
      dismissOnScrim
      data-testid="recipes-fryer-stop-dialog"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Nechat péct
          </Button>
          <Button variant="primary" data-testid="recipes-fryer-stop-confirm" onClick={onConfirm}>
            Zastavit
          </Button>
        </>
      }
    >
      <p>Pečení se ukončí a zbývající čas se zahodí. Znovu spustit jde jen na fritéze.</p>
    </Sheet>
  );
}

/** Live airfryer card for Recepty: hidden while the fryer is off or idle. */
export function FryerLiveCard({
  api,
  store,
  statusEntity,
  allowed = true,
}: {
  api: RecipesApi;
  store: EntityStore;
  statusEntity?: string;
  allowed?: boolean;
}) {
  const version = useStoreVersion(store);
  const entities = useMemo(
    () =>
      detectFryerEntities(
        store.entityIds(),
        statusEntity ? { recipes_airfryer_status: statusEntity } : {},
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- new ids arrive with HA updates
    [store, statusEntity, version],
  );
  const states = entities ? readFryerStates(store, entities) : {};
  const phase = fryerPhase(states);
  const ticking = phase === 'cooking' || phase === 'preheat';
  const now = useNow(ticking);
  const programId = Number(states.program?.state) || null;
  const [programName, setProgramName] = useState(() => cachedProgramName(programId));
  useEffect(() => {
    let live = true;
    void resolveProgramName(api, programId).then((name) => {
      if (live) setProgramName(name);
    });
    return () => {
      live = false;
    };
  }, [api, programId]);
  const [confirmStop, setConfirmStop] = useState(false);
  const [busy, setBusy] = useState<FryerControl | null>(null);
  if (!entities) return null;
  const m = fryerModel(states, now);
  if (!fryerVisible(m.phase)) return null;
  const urgent = fryerNeedsAction(m.phase);
  const held = fryerHeld(m.phase);
  const controls = allowed ? fryerControls(m.phase).filter((c) => entities[CTRL_ROLE[c]]) : [];
  const send = (action: FryerControl, confirmed = false) => {
    setBusy(action);
    api
      .airfryerControl(action, confirmed)
      .then(() => toast.success(`Fritéza · ${CONTROL_LABEL[action].toLowerCase()}`))
      .catch((err: unknown) => {
        const code = err instanceof RecipesApiError ? err.code : '';
        toast.error(
          code === 'AIRFRYER_NOT_RUNNING' ? 'Fritéza už neběží' : 'Příkaz se nepodařilo odeslat',
        );
      })
      .finally(() => setBusy(null));
  };
  const program = fryerProgramLine(m, programName);
  const countdown = m.remainingS !== null ? formatCountdown(m.remainingS) : null;
  const eta = fryerEta(m, now);
  const finished = m.phase === 'done' || m.phase === 'warm';
  const steps = fryerTimeline(m.phase, m.progress);
  const isError = m.phase === 'error';
  // Shake / drawer: the instruction is the hero, the (stopped) countdown a plain-text side note.
  const instruction = m.phase === 'action' || m.phase === 'drawer';
  // Calm states lead with the food („Hranolky“) and show the phase as a status pill.
  const food = program === 'Ruční' ? 'Ruční pečení' : program || 'Fritéza';
  const foodTitle = !instruction && !isError;
  // One muted line under the title; joined here so no separator is ever left dangling.
  const meta = [
    foodTitle && food === 'Fritéza' ? null : 'Fritéza',
    foodTitle ? null : program,
    m.amount ? `Zaplnění ${m.amount}/7` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const ring = (
    <span className="rc-fl-ringwrap">
      <ProgressRing
        className="rc-fl-ring"
        value={m.progress ?? 0}
        size={176}
        thickness={10}
        tone={finished ? 'ok' : held ? 'warn' : 'accent'}
        held={held}
        data-testid="recipes-fryer-ring"
      >
        {finished ? (
          <Icon name="check" />
        ) : (
          <>
            <span className="rc-fl-time num" data-testid="recipes-fryer-countdown">
              {countdown ?? '–'}
            </span>
            <small>{held ? 'stojí' : 'zbývá'}</small>
          </>
        )}
      </ProgressRing>
      {m.phase === 'paused' ? (
        <span className="rc-fl-badge" aria-hidden="true" data-testid="recipes-fryer-paused-badge">
          <Icon name="pause" />
        </span>
      ) : null}
    </span>
  );
  const visual = isError ? null : instruction ? (
    <FryerArt phase={m.phase} className="rc-fl-hero-art" />
  ) : (
    ring
  );
  // Labelled stats: temperature, ETA or the stopped countdown (plain text, never pill/button-like).
  const facts: ReactNode[] = [];
  if (m.currentTemp !== null && !finished && !isError) {
    facts.push(
      <span className="rc-fl-fact" key="t">
        <small>
          {m.targetTemp ? `Teplota · cíl ${Math.round(m.targetTemp)}\u00a0°C` : 'Teplota'}
        </small>
        <b className="rc-fl-nw num" data-testid="recipes-fryer-temp">
          {Math.round(m.currentTemp)}&nbsp;°C
        </b>
      </span>,
    );
  }
  if (instruction && countdown) {
    facts.push(
      <span className="rc-fl-fact" key="h" data-testid="recipes-fryer-held">
        <small>Odpočet stojí na</small>
        <b className="num" data-testid="recipes-fryer-countdown">
          {countdown}
        </b>
      </span>,
    );
  } else if (eta && !held) {
    facts.push(
      <span className="rc-fl-fact" key="e">
        <small>Konec v</small>
        <b className="num">{eta}</b>
      </span>,
    );
  }
  // Paused / shake / drawer / error: resume happens on the device, so guidance text, no fake primary.
  const guidance =
    m.phase === 'paused'
      ? FRYER_HINT.paused
      : instruction
        ? 'Po vrácení šuplíku fritéza pokračuje sama.'
        : null;
  const hint =
    m.phase === 'action'
      ? 'Vytáhněte koš a protřepejte nebo otočte jídlo.'
      : m.phase === 'drawer'
        ? 'Po protřepání koš zasuňte zpět.'
        : m.phase === 'paused' || m.phase === 'cooking' || m.phase === 'preheat'
          ? null
          : FRYER_HINT[m.phase];
  const primary = controls.filter((c) => c !== 'stop');
  const hasStop = controls.includes('stop');
  return (
    <>
      <section
        className="rc-fl"
        data-phase={m.phase}
        data-urgent={urgent || undefined}
        data-instruction={instruction || undefined}
        aria-label="Fritéza"
        data-testid="recipes-fryer-live"
      >
        {isError ? (
          <div className="rc-fl-band" data-testid="recipes-fryer-band">
            <Icon name="alert" />
            <h2 role="status" aria-live="polite" data-testid="recipes-fryer-state">
              {m.label}
            </h2>
            <span className="rc-fl-code num" data-testid="recipes-fryer-code">
              Kód {m.errorCode ?? '?'}
            </span>
          </div>
        ) : null}
        {visual ? <div className="rc-fl-vis">{visual}</div> : null}
        <div className="rc-fl-main">
          {isError ? (
            <p className="rc-fl-meta">{meta}</p>
          ) : foodTitle ? (
            <div className="rc-fl-head">
              <span
                className="rc-fl-pill"
                role="status"
                aria-live="polite"
                data-testid="recipes-fryer-state"
              >
                {m.label}
              </span>
              <h2 data-testid="recipes-fryer-title">{food}</h2>
              {meta ? (
                <p className="rc-fl-meta" title={meta} data-testid="recipes-fryer-meta">
                  {meta}
                </p>
              ) : null}
            </div>
          ) : (
            <div className="rc-fl-head">
              <h2 role="status" aria-live="polite" data-testid="recipes-fryer-state">
                {m.label}
              </h2>
              <p className="rc-fl-meta" title={meta} data-testid="recipes-fryer-meta">
                {meta}
              </p>
            </div>
          )}
          <div className="rc-fl-body">
            {hint ? <p className="rc-fl-hint">{hint}</p> : null}
            {facts.length ? <div className="rc-fl-facts">{facts}</div> : null}
            {!isError && !finished ? (
              <div className="rc-fl-steps">
                <Stepper steps={steps} compact label="Průběh pečení" />
              </div>
            ) : null}
          </div>
          {controls.length || guidance ? (
            <div className="rc-fl-actions" data-testid="recipes-fryer-actions">
              {guidance ? (
                <p className="rc-fl-guide" data-testid="recipes-fryer-guide">
                  <Icon name="fryer" />
                  <span>{guidance}</span>
                </p>
              ) : null}
              {primary.map((c) => (
                <Button
                  key={c}
                  size="md"
                  // Pause is routine: calm tonal button; only Udržovat v teple (done) is a filled CTA.
                  variant={c === 'pause' ? 'strong' : 'primary'}
                  icon={c === 'pause' ? <Icon name="pause" /> : undefined}
                  loading={busy === c}
                  disabled={busy !== null}
                  data-testid={`recipes-fryer-${c}`}
                  onClick={() => send(c)}
                >
                  {CONTROL_LABEL[c]}
                </Button>
              ))}
              {hasStop ? (
                <Button
                  size="md"
                  variant="secondary"
                  className="rc-fl-stop"
                  data-tone={finished ? undefined : 'danger'}
                  loading={busy === 'stop'}
                  disabled={busy !== null}
                  data-testid="recipes-fryer-stop"
                  onClick={() => setConfirmStop(true)}
                >
                  {finished ? 'Ukončit' : CONTROL_LABEL.stop}
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
        {!instruction && !isError ? <FryerArt phase={m.phase} className="rc-fl-side-art" /> : null}
      </section>
      {/* Outside the card: its isolation would trap the sheet under the recipe grid. */}
      {confirmStop ? (
        <StopConfirm
          onClose={() => setConfirmStop(false)}
          onConfirm={() => {
            setConfirmStop(false);
            send('stop', true);
          }}
        />
      ) : null}
    </>
  );
}

const CTRL_ROLE = { pause: 'pause', stop: 'stop', keep_warm: 'keepWarm' } as const;

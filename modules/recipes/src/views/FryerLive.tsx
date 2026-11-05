import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
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
  fryerSeen,
  fryerTimeline,
  fryerVisible,
  type FryerControl,
  type FryerPhase,
} from '../domain/fryerLive.js';
import { FRYER_HINT, fryerHeld, readFryerStates } from '../fryerSignal.js';
import { cachedProgramName, resolveProgramName } from '../fryerProgram.js';
import { Icon } from './parts.js';

const CONTROL_LABEL: Record<FryerControl, string> = {
  pause: 'Pozastavit',
  stop: 'Zastavit',
  keep_warm: 'Udržovat teplé',
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
  // Phases seen during this cook (stored from the previous render, React's derived-state pattern).
  const [seen, setSeen] = useState<FryerPhase[]>([]);
  if (!seen.includes(phase) || ((phase === 'off' || phase === 'idle') && seen.length)) {
    setSeen(fryerSeen(seen, phase));
  }
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
  const steps = fryerTimeline(m.phase, seen);
  // Shake / drawer / error: the instruction is the hero, the (stopped) countdown a side note.
  const instruction = m.phase === 'action' || m.phase === 'drawer' || m.phase === 'error';
  const visual = instruction ? (
    <span className="rc-fl-glyph" aria-hidden="true">
      <Icon name={m.phase === 'error' ? 'alert' : m.phase === 'drawer' ? 'drawer' : 'shake'} />
    </span>
  ) : (
    <ProgressRing
      className="rc-fl-ring"
      value={m.progress ?? 0}
      size={136}
      thickness={9}
      tone={finished ? 'ok' : held ? 'muted' : 'accent'}
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
  );
  // Left side of the action row: the stopped countdown / ETA / how to resume – never a lone button.
  const note =
    (m.phase === 'action' || m.phase === 'drawer') && countdown ? (
      <span className="rc-fl-note rc-fl-heldnote" data-testid="recipes-fryer-held">
        <Icon name="pause" />
        <span>
          Odpočet stojí na{' '}
          <b className="num" data-testid="recipes-fryer-countdown">
            {countdown}
          </b>
        </span>
      </span>
    ) : m.phase === 'error' ? (
      <span className="rc-fl-note rc-fl-code" data-testid="recipes-fryer-code">
        Kód chyby: {m.errorCode ?? '?'}
      </span>
    ) : m.phase === 'paused' ? (
      <span className="rc-fl-note">{FRYER_HINT.paused}</span>
    ) : eta ? (
      <span className="rc-fl-note">Hotovo v {eta}</span>
    ) : null;
  const primary = controls.filter((c) => c !== 'stop');
  const hasStop = controls.includes('stop');
  return (
    <section
      className="rc-fl"
      data-phase={m.phase}
      data-urgent={urgent || undefined}
      data-instruction={instruction || undefined}
      aria-label="Fritéza"
      data-testid="recipes-fryer-live"
    >
      <div className="rc-fl-vis">{visual}</div>
      <div className="rc-fl-copy">
        <span className="rc-fl-kicker">
          <Icon name="fryer" /> Fritéza
          {program ? <span className="rc-fl-prog">{program}</span> : null}
          {m.amount ? <span className="rc-fl-amount">Zaplnění {m.amount}/7</span> : null}
        </span>
        <h2 role="status" aria-live="polite" data-testid="recipes-fryer-state">
          {m.label}
        </h2>
        {FRYER_HINT[m.phase] && m.phase !== 'paused' ? (
          <p className="rc-fl-hint">{FRYER_HINT[m.phase]}</p>
        ) : null}
        {m.currentTemp !== null && !finished && m.phase !== 'error' ? (
          <div className="rc-fl-temp" data-testid="recipes-fryer-temp">
            <Icon name="thermo" />
            <span className="num rc-fl-nw">
              <b>{Math.round(m.currentTemp)}</b>&nbsp;°C
            </span>
            {m.targetTemp ? (
              <>
                <span className="rc-fl-bar" aria-hidden="true">
                  <i
                    style={{
                      width: `${Math.max(4, Math.min(100, (m.currentTemp / m.targetTemp) * 100))}%`,
                    }}
                  />
                </span>
                <span className="num t2 rc-fl-nw">cíl&nbsp;{Math.round(m.targetTemp)}&nbsp;°C</span>
              </>
            ) : null}
          </div>
        ) : null}
        {m.phase !== 'error' && steps.length > 1 ? (
          <div className="rc-fl-steps">
            <Stepper steps={steps} compact label="Průběh pečení" />
          </div>
        ) : null}
      </div>
      {controls.length ? (
        <div className="rc-fl-actions" data-testid="recipes-fryer-actions">
          {note ?? <span />}
          <span className="rc-fl-btns">
            {hasStop ? (
              <Button
                size="md"
                variant="ghost"
                className="rc-fl-stop"
                loading={busy === 'stop'}
                disabled={busy !== null}
                data-testid="recipes-fryer-stop"
                onClick={() => setConfirmStop(true)}
              >
                {finished ? 'Ukončit' : CONTROL_LABEL.stop}
              </Button>
            ) : null}
            {primary.map((c) => (
              <Button
                key={c}
                size="md"
                variant={c === 'keep_warm' ? 'primary' : 'secondary'}
                icon={c === 'pause' ? <Icon name="pause" /> : undefined}
                loading={busy === c}
                disabled={busy !== null}
                data-testid={`recipes-fryer-${c}`}
                onClick={() => send(c)}
              >
                {CONTROL_LABEL[c]}
              </Button>
            ))}
          </span>
        </div>
      ) : null}
      {confirmStop ? (
        <StopConfirm
          onClose={() => setConfirmStop(false)}
          onConfirm={() => {
            setConfirmStop(false);
            send('stop', true);
          }}
        />
      ) : null}
    </section>
  );
}

const CTRL_ROLE = { pause: 'pause', stop: 'stop', keep_warm: 'keepWarm' } as const;

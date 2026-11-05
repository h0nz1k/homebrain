import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useBackClosable, type EntityStore } from '@homebrain/ha-client';
import { Button, Sheet, toast } from '@homebrain/ui';
import { RecipesApiError, type RecipesApi } from '../api.js';
import {
  detectFryerEntities,
  formatCountdown,
  fryerControls,
  fryerModel,
  fryerNeedsAction,
  fryerPhase,
  fryerProgramLine,
  fryerVisible,
  type FryerControl,
  type FryerModel,
} from '../domain/fryerLive.js';
import { readFryerStates } from '../fryerSignal.js';
import { Icon, Ring } from './parts.js';

const CONTROL_LABEL: Record<FryerControl, string> = {
  pause: 'Pozastavit',
  stop: 'Zastavit',
  keep_warm: 'Udržovat teplé',
};

const HINT: Partial<Record<FryerModel['phase'], string>> = {
  action: 'Vytáhněte šuplík, protřepejte nebo otočte jídlo a zasuňte ho zpět.',
  drawer: 'Pečení stojí. Po protřepání šuplík zasuňte, fritéza naváže.',
  paused: 'Pečení je pozastavené, pokračovat lze na fritéze.',
  done: 'Jídlo je hotové, můžete ho vyndat.',
  warm: 'Jídlo se udržuje teplé.',
  error: 'Fritéza hlásí chybu. Zkontrolujte ji a případně ji vypněte.',
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
  const [confirmStop, setConfirmStop] = useState(false);
  const [busy, setBusy] = useState<FryerControl | null>(null);
  if (!entities) return null;
  const m = fryerModel(states, now);
  if (!fryerVisible(m.phase)) return null;
  const urgent = fryerNeedsAction(m.phase);
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
  const program = fryerProgramLine(m);
  const countdown =
    m.phase === 'done' ? 'Hotovo' : m.remainingS !== null ? formatCountdown(m.remainingS) : '–';
  return (
    <section
      className="rc-fry"
      data-phase={m.phase}
      data-urgent={urgent || undefined}
      aria-label="Fritéza"
      data-testid="recipes-fryer-live"
    >
      <div className="rc-fry-ring" aria-hidden={m.phase === 'done'}>
        <Ring fraction={m.progress ?? 0} size={112} />
        <span className="rc-fry-time num" data-testid="recipes-fryer-countdown">
          {countdown}
          {m.phase !== 'done' && m.remainingS !== null ? <small>zbývá</small> : null}
        </span>
      </div>
      <div className="rc-fry-body">
        <span className="rc-fry-kicker">
          <Icon name="fryer" /> Fritéza{program ? ` · ${program}` : ''}
        </span>
        <h2 role="status" aria-live="polite" data-testid="recipes-fryer-state">
          {m.label}
        </h2>
        {HINT[m.phase] ? <p className="rc-fry-hint">{HINT[m.phase]}</p> : null}
        {m.currentTemp !== null ? (
          <div className="rc-fry-temp" data-testid="recipes-fryer-temp">
            <span className="num">
              <b>{Math.round(m.currentTemp)}</b> °C
            </span>
            {m.targetTemp ? (
              <>
                <span className="rc-fry-bar" aria-hidden="true">
                  <i
                    style={{
                      width: `${Math.max(4, Math.min(100, (m.currentTemp / m.targetTemp) * 100))}%`,
                    }}
                  />
                </span>
                <span className="num t2">cíl {Math.round(m.targetTemp)} °C</span>
              </>
            ) : null}
          </div>
        ) : null}
      </div>
      {controls.length ? (
        <div className="rc-fry-actions">
          {controls.map((c) => (
            <Button
              key={c}
              size="md"
              variant={c === 'keep_warm' ? 'primary' : 'secondary'}
              loading={busy === c}
              disabled={busy !== null}
              data-testid={`recipes-fryer-${c}`}
              onClick={() => (c === 'stop' ? setConfirmStop(true) : send(c))}
            >
              {CONTROL_LABEL[c]}
            </Button>
          ))}
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

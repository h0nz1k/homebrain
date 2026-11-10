import { useEffect, useMemo, useState } from 'react';
import { navigatePanel, type ConnectionLike } from '@homebrain/ha-client';
import { Button, SegmentedControl, Switch, czCount, toast } from '@homebrain/ui';
import {
  EGG_MODEL,
  computeEggTime,
  eggTimerLabel,
  formatEggTime,
  type EggDoneness,
  type EggInput,
  type EggKind,
  type EggSize,
} from '../domain/eggs.js';
import type { TimerStore, TimerView } from '../domain/timers.js';
import { Icon, TimerCard } from './parts.js';
import { kitchenTimersLinkStyles, kitchenTimersStyles } from './timersStyles.js';

/** Recepty header entry to Minutky with the number of running timers. */
export function KitchenTimersButton({ running, onOpen }: { running: number; onOpen: () => void }) {
  return (
    <>
      <style>{kitchenTimersLinkStyles}</style>
      <Button
        className="kt-link"
        icon={<Icon name="timer" />}
        data-testid="recipes-kitchen-timers"
        aria-label={running ? `Minutky, běží ${running}` : 'Minutky'}
        onClick={onOpen}
      >
        Minutky
        {running ? <span className="kt-link-n">{running}</span> : null}
      </Button>
    </>
  );
}

export const TIMER_PRESETS_MIN = [1, 3, 5, 8, 10, 15, 20, 30] as const;

/** Home elevation from HA (`get_config`); null when unknown or not configured. */
export function useHaElevation(connection: ConnectionLike | undefined): number | null {
  const [elevation, setElevation] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    connection
      ?.sendMessagePromise<{ elevation?: number }>({ type: 'get_config' })
      .then((c) => alive && setElevation(typeof c?.elevation === 'number' ? c.elevation : null))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [connection]);
  return elevation;
}

/** Free kitchen timers (Minutky) + the egg wizard. Timers are owned by the HA integration. */
export function KitchenTimers({
  store,
  views,
  connection,
}: {
  store: TimerStore;
  views: TimerView[];
  connection?: ConnectionLike;
}) {
  const elevation = useHaElevation(connection);
  const active = views.filter((v) => v.status !== 'done');
  return (
    <div className="kt" data-testid="kitchen-timers">
      <style>{kitchenTimersStyles}</style>
      <header className="rc-top kt-top">
        <Button
          variant="ghost"
          icon={<Icon name="back" />}
          aria-label="Zpět na recepty"
          onClick={() => navigatePanel('/recipes')}
        />
        <div className="rc-ttl">
          <h1>Minutky</h1>
          <p>
            {active.length
              ? `Běží ${czCount(active.length, 'minutka', 'minutky', 'minutek')} · na všech zařízeních`
              : 'Nic neběží'}
          </p>
        </div>
      </header>
      <div className="kt-grid">
        <section className="kt-run" aria-label="Běžící minutky">
          {active.length ? (
            <div className="rc-tstrip kt-strip" data-testid="recipes-timers">
              {active.map((t) => (
                <TimerCard
                  key={t.id}
                  timer={t}
                  store={store}
                  soon={t.remainingMs < 60_000}
                  addMinute
                />
              ))}
            </div>
          ) : (
            <p className="kt-empty" data-testid="kitchen-timers-empty">
              Žádná minutka neběží. Spusťte rychlou minutku nebo vajíčka.
            </p>
          )}
        </section>
        <EggWizard store={store} elevationM={elevation} />
        <QuickTimer store={store} />
      </div>
    </div>
  );
}

export function QuickTimer({ store }: { store: TimerStore }) {
  const [name, setName] = useState('');
  const [minutes, setMinutes] = useState('');
  const start = (min: number) => {
    const label = name.trim() || `Minutka ${min} min`;
    store.add(label, Math.round(min * 60));
    toast.success(`Minutka „${label}“ běží`, { id: 'kt-start' });
    setName('');
    setMinutes('');
  };
  const custom = Number(minutes.replace(',', '.'));
  const customOk = Number.isFinite(custom) && custom > 0 && custom <= 24 * 60;
  return (
    <section className="kt-card kt-quick" aria-labelledby="kt-quick-h" data-testid="kitchen-quick">
      <h2 id="kt-quick-h">Nová minutka</h2>
      <label className="kt-field">
        <span>Název</span>
        <input
          value={name}
          maxLength={60}
          placeholder="např. Těstoviny"
          data-testid="kitchen-timer-name"
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <div className="kt-presets" role="group" aria-label="Rychlé časy">
        {TIMER_PRESETS_MIN.map((m) => (
          <Button key={m} size="sm" data-testid={`kitchen-preset-${m}`} onClick={() => start(m)}>
            {m} min
          </Button>
        ))}
      </div>
      <form
        className="kt-custom"
        onSubmit={(e) => {
          e.preventDefault();
          if (customOk) start(custom);
        }}
      >
        <label className="kt-field">
          <span>Vlastní čas (min)</span>
          <input
            inputMode="decimal"
            value={minutes}
            placeholder="např. 12"
            data-testid="kitchen-timer-minutes"
            onChange={(e) => setMinutes(e.target.value)}
          />
        </label>
        <Button
          type="submit"
          variant="strong"
          disabled={!customOk}
          data-testid="kitchen-timer-start"
        >
          Spustit
        </Button>
      </form>
    </section>
  );
}

const DONENESS_OPTIONS: ReadonlyArray<readonly [EggDoneness, string]> = [
  ['namekko', 'NAMĚKKO'],
  ['nahnilicko', 'NAHNILIČKO'],
  ['natvrdo', 'NATVRDO'],
];
const SIZE_OPTIONS: ReadonlyArray<readonly [EggSize, string]> = [
  ['S', 'S'],
  ['M', 'M'],
  ['L', 'L'],
  ['XL', 'XL'],
];
const KIND_OPTIONS: ReadonlyArray<readonly [EggKind, string]> = [
  ['chicken', 'Slepičí'],
  ['quail', 'Křepelčí'],
];

export function EggWizard({ store, elevationM }: { store: TimerStore; elevationM: number | null }) {
  const [input, setInput] = useState<EggInput>({
    kind: 'chicken',
    size: 'M',
    chilled: true,
    count: 2,
    doneness: 'namekko',
  });
  const set = (patch: Partial<EggInput>) => setInput((v) => ({ ...v, ...patch }));
  const full = { ...input, elevationM };
  const result = useMemo(() => computeEggTime(full), [input, elevationM]); // eslint-disable-line react-hooks/exhaustive-deps
  const label = eggTimerLabel(full);
  const quail = input.kind === 'quail';
  return (
    <section className="kt-card kt-eggs" aria-labelledby="kt-eggs-h" data-testid="eggs-wizard">
      <div className="kt-eggs-head">
        <h2 id="kt-eggs-h">Vajíčka</h2>
        {!result.calibrated ? (
          <span className="kt-badge" data-testid="eggs-uncalibrated">
            nekalibrováno
          </span>
        ) : null}
      </div>
      <div className="kt-eggs-form">
        <SegmentedControl
          label="Typ vejce"
          value={input.kind}
          options={KIND_OPTIONS}
          onChange={(kind) => set({ kind })}
        />
        <SegmentedControl
          label="Velikost"
          value={quail ? null : input.size}
          options={SIZE_OPTIONS}
          disabled={quail}
          onChange={(size) => set({ size })}
        />
        <SegmentedControl
          label="Stupeň"
          value={input.doneness}
          options={DONENESS_OPTIONS}
          onChange={(doneness) => set({ doneness })}
        />
        <div className="kt-row">
          <div className="kt-switch">
            <Switch
              checked={input.chilled}
              label="Chlazený"
              data-testid="eggs-chilled"
              onChange={(chilled) => set({ chilled })}
            />
            <span aria-hidden="true">
              Chlazený <small>{input.chilled ? 'z lednice' : 'pokojová teplota'}</small>
            </span>
          </div>
          <div className="kt-count" role="group" aria-label="Počet vajec">
            <Button
              size="sm"
              aria-label="Méně vajec"
              icon={<Icon name="minus" />}
              disabled={input.count <= 1}
              onClick={() => set({ count: Math.max(1, input.count - 1) })}
            />
            <output data-testid="eggs-count" aria-live="polite">
              {input.count} ks
            </output>
            <Button
              size="sm"
              aria-label="Více vajec"
              icon={<Icon name="plus" />}
              disabled={input.count >= 30}
              onClick={() => set({ count: Math.min(30, input.count + 1) })}
            />
          </div>
        </div>
      </div>
      <div className="kt-result" aria-live="polite">
        <b className="kt-time" data-testid="eggs-time">
          {formatEggTime(result.seconds)}
        </b>
        <span>{label}</span>
      </div>
      <details className="kt-why">
        <summary>Jak počítáme</summary>
        <ul>
          {result.explanation.map((line) => (
            <li key={line}>{line}</li>
          ))}
          {quail || input.count > 1 ? null : (
            <li>Každé další vejce přidá {EGG_MODEL.perExtraEggS} s.</li>
          )}
          <li>Čas běží od vložení vajec do vroucí vody.</li>
        </ul>
      </details>
      <Button
        variant="primary"
        size="lg"
        block
        icon={<Icon name="timer" />}
        data-testid="eggs-start"
        onClick={() => {
          store.add(label, result.seconds);
          toast.success(`${label} · ${formatEggTime(result.seconds)}`, { id: 'kt-start' });
        }}
      >
        Spustit {formatEggTime(result.seconds)}
      </Button>
    </section>
  );
}

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import {
  navigateTab,
  type EntityStateLike,
  type EntityStore,
  type ModuleViewProps,
} from '@homebrain/ha-client';
import { Sparkline } from '@homebrain/ui';
import {
  adaptHealthEntities,
  daysCs,
  deriveNextStep,
  fetchWeightHistory,
  fetchWorkoutDays,
  hasNoHistory,
  localDate,
  selectHealthEntityIds,
  trainingsCs,
  weekSlack,
  weeksCs,
  weekDates,
  weightChange,
} from '../adapter.js';
import type { Field, HealthModel, HealthStatus, WeightHistory, WorkoutDays } from '../contract.js';
import { healthSignals, isKioskLocation } from '../signals.js';
import { healthStyles } from './healthStyles.js';

function createEntitiesSource(store: EntityStore, ids: string[]) {
  let cached: (EntityStateLike | undefined)[] = [];
  const snapshot = () => {
    const next = ids.map((id) => store.getSnapshot(id));
    if (next.length !== cached.length || next.some((state, i) => state !== cached[i]))
      cached = next;
    return cached;
  };
  return {
    snapshot,
    subscribe: (notify: () => void) => {
      const unsubscribe = ids.map((id) => store.subscribe(id, notify));
      return () => unsubscribe.forEach((stop) => stop());
    },
  };
}
function useEntities(store: EntityStore, ids: string[]) {
  const key = JSON.stringify(ids);
  const source = useMemo(
    () => createEntitiesSource(store, JSON.parse(key) as string[]),
    [store, key],
  );
  return useSyncExternalStore(source.subscribe, source.snapshot, source.snapshot);
}

const TZ = 'Europe/Prague';
const STATUS_CS: Record<HealthStatus, string> = {
  ok: 'Aktuální',
  empty: 'Bez dat',
  partial: 'Částečná data',
  stale: 'Zastaralé',
  unavailable: 'Nedostupné',
  error: 'Chyba importu',
  missing: 'Nepřipojeno',
};
const FIELD_CS: Record<Exclude<Field<unknown>['state'], 'ok'>, string> = {
  not_bound: 'Nenamapováno',
  missing: 'Entita chybí',
  unavailable: 'Nedostupné',
  invalid: 'Neplatná hodnota',
};
const num = (v: number, digits = 0) =>
  new Intl.NumberFormat('cs-CZ', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(v);
const time = (ms: number) =>
  new Intl.DateTimeFormat('cs-CZ', { hour: '2-digit', minute: '2-digit', timeZone: TZ }).format(ms);
const shortDate = (ms: number) =>
  new Intl.DateTimeFormat('cs-CZ', { day: 'numeric', month: 'numeric', timeZone: TZ }).format(ms);
const weekdayDate = (ms: number) =>
  new Intl.DateTimeFormat('cs-CZ', {
    weekday: 'long',
    day: 'numeric',
    month: 'numeric',
    timeZone: TZ,
  }).format(ms);
function duration(seconds: number) {
  const m = Math.round(seconds / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
}
function relativeDay(ms: number, now: number) {
  const d = localDate(ms, TZ);
  if (d === localDate(now, TZ)) return `dnes ${time(ms)}`;
  if (d === localDate(now - 86_400_000, TZ)) return `včera ${time(ms)}`;
  return `${weekdayDate(ms)} ${time(ms)}`;
}

function Unknown({ field, empty }: { field: Field<unknown>; empty?: string }) {
  const reason = field.state === 'ok' ? '' : FIELD_CS[field.state];
  return (
    <>
      <span className="hl-unknown" aria-label={`Neznámá hodnota: ${empty ?? reason}`}>
        –
      </span>
      <p className="hl-note">{empty ?? reason}</p>
    </>
  );
}

const LockIcon = () => (
  <svg
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    aria-hidden="true"
    data-hb-icon=""
  >
    <rect x="3" y="7" width="10" height="7" rx="1.5" />
    <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
  </svg>
);

function MissingState() {
  return (
    <section className="hl-card hl-empty" data-testid="health-missing">
      <span className="hl-lbl">Zdraví</span>
      <h2>Integrace Zdraví není připojená</h2>
      <p className="hl-note">
        Modul jen zobrazuje data integrace <code>health_fitness</code> (HACS release v0.7.0). Nic
        nezapisuje a bez integrace nic nepředstírá.
      </p>
      <ol>
        <li>
          Nainstaluj integraci Health Fitness přes HACS a přidej ji v Nastavení → Zařízení a služby.
        </li>
        <li>
          Tréninky do ní posílá Calistree (Tasker / lokální webhook) – nastavuje se v integraci, ne
          v HomeBrainu.
        </li>
        <li>
          V nastavení HomeBrain namapuj entity modulu Zdraví (týdenní tréninky, XP, streak …).
        </li>
      </ol>
    </section>
  );
}

export type HealthTab = 'dnes' | 'progres' | 'odmeny' | 'data';
const TABS: { id: HealthTab; label: string }[] = [
  { id: 'dnes', label: 'Dnes' },
  { id: 'progres', label: 'Progres' },
  { id: 'odmeny', label: 'Odměny' },
  { id: 'data', label: 'Data' },
];
const isTab = (v: string | null): v is HealthTab => TABS.some((t) => t.id === v);
const WEEKDAYS = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'];

function heroPill(model: HealthModel, goalMet: boolean): { text: string; tone: string } {
  if (model.status === 'error') return { text: 'Zdroj vyžaduje pozornost', tone: 'crit' };
  if (model.status === 'unavailable') return { text: 'Zdroj je nedostupný', tone: 'crit' };
  if (model.stale || model.status === 'stale') return { text: 'Data jsou zastaralá', tone: 'warn' };
  if (model.status === 'empty') return { text: 'Čeká na první data', tone: 'neutral' };
  if (goalMet) return { text: 'Týdenní minimum splněno', tone: 'ok' };
  if (model.status === 'partial') return { text: 'Částečný režim', tone: 'warn' };
  return { text: 'Zdroje aktuální', tone: 'ok' };
}

function daysAgo(ms: number, now: number) {
  const a = Date.parse(`${localDate(ms, TZ)}T00:00:00Z`);
  const b = Date.parse(`${localDate(now, TZ)}T00:00:00Z`);
  const n = Math.round((b - a) / 86_400_000);
  return n <= 0 ? 'Dnes' : n === 1 ? 'Včera' : `Před ${daysCs(n)}`;
}

function WeekRing({ completed, target }: { completed: number | null; target: number | null }) {
  const known = completed !== null && target !== null && target > 0;
  const pct = known ? Math.min(1, completed / target) : 0;
  const c = 2 * Math.PI * 49;
  return (
    <div
      className="hl-ring"
      aria-label={known ? `${completed} z ${target} tréninků týdne` : 'Týdenní cíl neznámý'}
    >
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <circle className="hl-ring-track" cx="60" cy="60" r="49" />
        {known && pct > 0 && (
          <circle
            className="hl-ring-value"
            cx="60"
            cy="60"
            r="49"
            strokeDasharray={`${c * pct} ${c}`}
          />
        )}
      </svg>
      <div className="hl-ring-c">
        <strong>{known ? `${completed}/${target}` : '–'}</strong>
        <span>{known ? trainingsCs(target).split(' ')[1] : 'neznámé'}</span>
      </div>
    </div>
  );
}

function Tabs({ tab, onTab }: { tab: HealthTab; onTab: (t: HealthTab) => void }) {
  return (
    <div className="hl-tabs" role="tablist" aria-label="Části modulu Zdraví">
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          data-nav="tab"
          id={`hl-tab-${t.id}`}
          aria-selected={tab === t.id}
          aria-controls={`hl-panel-${t.id}`}
          data-testid={`health-tab-${t.id}`}
          onClick={() => onTab(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

function Jump({
  to,
  onTab,
  children,
}: {
  to: HealthTab;
  onTab: (t: HealthTab) => void;
  children: string;
}) {
  return (
    <button type="button" className="hl-jump" data-nav="jump" onClick={() => onTab(to)}>
      {children}
    </button>
  );
}

function SleepCard({ model }: { model: HealthModel }) {
  const s = model.sleepMinutes;
  const badge =
    s.value !== null
      ? s.verified === true
        ? 'Ověřený zdroj'
        : 'Neověřený zdroj'
      : s.state === 'not_bound'
        ? 'Nepřipojeno'
        : FIELD_CS[s.state === 'ok' ? 'invalid' : s.state];
  return (
    <section className="hl-card hl-sleep" data-testid="health-sleep">
      <div className="hl-ch">
        <span className="hl-lbl">Spánek</span>
        <span
          className="hl-badge"
          data-tone={s.value !== null && s.verified === true ? 'ok' : 'neutral'}
        >
          {badge}
        </span>
      </div>
      {s.value !== null ? (
        <>
          <div className="hl-big">
            {Math.floor(s.value / 60)} <small>h</small> {s.value % 60} <small>min</small>
          </div>
          <p className="hl-note">Poslední noc · jen pro přehled, bez hodnocení kvality</p>
        </>
      ) : (
        <>
          <span className="hl-unknown" aria-label="Neznámá hodnota">
            –
          </span>
          <p className="hl-note">
            {s.state === 'not_bound'
              ? 'Zdroj spánku není připojen.'
              : 'Spánek teď není k dispozici.'}{' '}
            Doporučení pokračuje jen z tréninkových dat.
          </p>
        </>
      )}
    </section>
  );
}

export function HealthScreen({
  model,
  weight,
  workoutDays = null,
  kiosk = false,
  initialTab = 'dnes',
  tab: routeTab,
  onTab,
}: {
  model: HealthModel;
  weight: WeightHistory | null;
  workoutDays?: WorkoutDays | null;
  kiosk?: boolean;
  initialTab?: HealthTab;
  /** Controlled by the panel route (`/homebrain-zdravi/<tab>`), so back returns to Dnes. */
  tab?: HealthTab;
  onTab?: (tab: HealthTab) => void;
}) {
  const [tabState, setTabState] = useState<HealthTab>(initialTab);
  const tab = routeTab ?? tabState;
  const setTab = onTab ?? setTabState;
  if (kiosk)
    return (
      <div className="hl-root" data-testid="health-private">
        <style>{healthStyles}</style>
        <section className="hl-card hl-empty">
          <span className="hl-lbl">Zdraví</span>
          <h2>Osobní údaje se na sdíleném displeji nezobrazují</h2>
          <p className="hl-note">Zdraví vidí jen jeho vlastník po přihlášení na svém zařízení.</p>
        </section>
      </div>
    );
  const step = deriveNextStep(model);
  const noHistory = hasNoHistory(model);
  const signals = healthSignals(model, { audience: 'owner' });
  const { completed, target, goalMet, daysLeft } = model.week;
  const slack = weekSlack(model);
  const periodStart = model.week.periodStart ? Date.parse(model.week.periodStart) : null;
  const periodEnd = model.week.periodEndExclusive
    ? Date.parse(model.week.periodEndExclusive) - 1
    : null;
  const change = weight ? weightChange(weight) : null;
  const xp = model.xpTotal.value;
  const nextMilestone = xp !== null ? model.milestones.find((m) => m.threshold > xp) : undefined;
  const achievedCount = model.milestones.filter((m) => m.achieved.value === true).length;
  const updated = model.lastSuccessAt ?? model.updatedAt;
  const lastWorkoutEmpty =
    noHistory ||
    (model.lastWorkoutAt.state === 'unavailable' && model.week.completed.state === 'ok');
  const pill = heroPill(model, goalMet.value === true);
  const weekKnown = completed.value !== null && target.value !== null;
  const today = localDate(model.now, TZ);
  const dates = weekDates(model.week.periodStart, TZ);
  const trained = new Set(workoutDays?.status === 'ready' ? workoutDays.days : []);
  const unit = model.weight.unit ?? 'kg';
  const signedKg = (d: number) =>
    `${d > 0 ? '+' : d < 0 ? '−' : '±'}${num(Math.abs(d), 1)} ${unit}`;

  const weightValue =
    model.weight.value !== null ? (
      <div className="hl-big">
        {num(model.weight.value, 1)} <small>{model.weight.unit ?? ''}</small>
      </div>
    ) : (
      <Unknown
        field={model.weight}
        empty={model.weight.state === 'not_bound' ? 'Zdroj hmotnosti není připojen' : undefined}
      />
    );
  const weightChart = (height: number, ticks: number) =>
    weight?.points.length ? (
      <>
        <Sparkline
          className="hl-spark"
          values={weight.points.map((p) => p.v)}
          width={600}
          height={height}
          area
        />
        <div className="hl-axis">
          {Array.from({ length: ticks }, (_, i) => {
            const idx = Math.round((i * (weight.points.length - 1)) / (ticks - 1));
            return <span key={i}>{shortDate(weight.points[idx]!.t)}</span>;
          })}
        </div>
      </>
    ) : model.weight.value !== null ? (
      <p className="hl-note">
        {weight === null
          ? 'Načítám historii…'
          : weight.status === 'error'
            ? 'Historie z recorderu není dostupná.'
            : 'Historie z recorderu zatím není.'}
      </p>
    ) : null;

  const dnes = (
    <div className="hl-grid hl-grid--dnes">
      <section className="hl-card hl-hero" data-testid="health-hero" data-kind={step.kind}>
        <div className="hl-hero-copy">
          <span className="hl-badge" data-tone={pill.tone} data-testid="health-hero-pill">
            <span className="hl-dot" aria-hidden="true" />
            {pill.text}
          </span>
          <span className="hl-lbl">Nejbližší správný krok</span>
          <h2>{step.title}</h2>
          <p>{step.detail}</p>
          <div className="hl-actions">
            <Jump to="progres" onTab={setTab}>
              Zobrazit progres
            </Jump>
            {model.trainedToday === true && <span className="hl-chip">Dnešní trénink zapsán</span>}
          </div>
        </div>
        <WeekRing completed={completed.value} target={target.value} />
      </section>

      <SleepCard model={model} />

      <section className="hl-card hl-last" data-testid="health-last-workout">
        <div className="hl-ch">
          <span className="hl-lbl">Poslední trénink</span>
          {model.lastWorkoutAt.value !== null && (
            <span className="hl-badge" data-tone="neutral">
              {daysAgo(Date.parse(model.lastWorkoutAt.value), model.now)}
            </span>
          )}
        </div>
        {model.lastWorkoutAt.value !== null ? (
          <>
            <div className="hl-big">
              {model.lastWorkoutSeconds.value !== null ? (
                <>
                  {Math.round(model.lastWorkoutSeconds.value / 60)} <small>min</small>
                </>
              ) : (
                '–'
              )}
            </div>
            <p className="hl-note">
              {relativeDay(Date.parse(model.lastWorkoutAt.value), model.now)}
              {model.lastWorkoutSeconds.value === null && model.lastWorkoutSeconds.state !== 'ok'
                ? ` · délka: ${FIELD_CS[model.lastWorkoutSeconds.state].toLowerCase()}`
                : ''}
            </p>
            <p className="hl-note hl-muted">Cviky a série zůstávají v Calistree.</p>
          </>
        ) : (
          <Unknown
            field={model.lastWorkoutAt}
            empty={lastWorkoutEmpty ? 'Zatím žádný trénink' : undefined}
          />
        )}
      </section>

      <section
        className="hl-card hl-week"
        data-testid="health-week"
        data-met={goalMet.value === true ? 'true' : undefined}
      >
        <div className="hl-ch">
          <div>
            <span className="hl-lbl">Tento týden</span>
            <h3>
              {!weekKnown
                ? 'Čeká na data'
                : goalMet.value
                  ? 'Minimum splněno'
                  : model.stale
                    ? 'Zastaralé údaje'
                    : 'Stabilní tempo'}
            </h3>
          </div>
          {weekKnown && (
            <span className="hl-badge" data-tone={goalMet.value ? 'ok' : 'neutral'}>
              {goalMet.value
                ? 'Splněno ✓'
                : slack && daysLeft !== null
                  ? `Zbývá ${trainingsCs(slack.remaining)} · ${daysCs(daysLeft)}`
                  : 'Konec týdne neznámý'}
            </span>
          )}
        </div>
        {dates.length === 7 && (
          <ol className="hl-days" aria-label="Dny týdne">
            {dates.map((d, i) => {
              const did = trained.has(d);
              const known = workoutDays?.status === 'ready';
              const state = did
                ? 'trained'
                : d === today
                  ? 'today'
                  : d > today
                    ? 'future'
                    : known
                      ? 'rest'
                      : 'unknown';
              return (
                <li key={d} data-state={state} data-today={d === today ? 'true' : undefined}>
                  <b>{WEEKDAYS[i]}</b>
                  <span>
                    {did ? 'Trénink' : d === today ? 'Dnes' : state === 'rest' ? 'Volno' : '–'}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
        {workoutDays && workoutDays.status !== 'ready' && (
          <p className="hl-note hl-muted">Dny tréninků bez historie recorderu nezobrazujeme.</p>
        )}
        <dl className="hl-stats">
          <div>
            <dt>Silový trénink</dt>
            <dd
              aria-label={weekKnown ? `${completed.value} z ${target.value} tréninků` : undefined}
            >
              {weekKnown ? `${completed.value} / ${target.value}` : '–'}
            </dd>
            {!weekKnown && completed.state !== 'ok' && (
              <span className="hl-note">{FIELD_CS[completed.state]}</span>
            )}
          </div>
          <div>
            <dt>Čas tréninku</dt>
            <dd>
              {model.week.durationSeconds.value !== null
                ? duration(model.week.durationSeconds.value)
                : '–'}
            </dd>
          </div>
          <div>
            <dt>Týdenní série</dt>
            <dd>
              {!noHistory && model.streakWeeks.value !== null
                ? weeksCs(model.streakWeeks.value)
                : '–'}
            </dd>
          </div>
        </dl>
      </section>

      <section className="hl-card hl-weight" data-testid="health-weight">
        <div className="hl-ch">
          <div>
            <span className="hl-lbl">Hmotnost</span>
            <h3>Trend, ne denní výkyv</h3>
          </div>
          <Jump to="progres" onTab={setTab}>
            Detail
          </Jump>
        </div>
        <div className="hl-row">
          {weightValue}
          {change && (
            <span className="hl-delta" data-testid="health-weight-change">
              {signedKg(change.delta)} od {shortDate(weight!.points[0]!.t)}
            </span>
          )}
        </div>
        {weightChart(56, 2)}
      </section>

      <section className="hl-card hl-reward" data-testid="health-reward-teaser">
        <div className="hl-ch">
          <div>
            <span className="hl-lbl">Odměny</span>
            <h3>
              {noHistory || xp === null
                ? 'Zatím bez historie'
                : model.xpLevel.value !== null
                  ? `Úroveň ${model.xpLevel.value}`
                  : `${num(xp)} XP`}
            </h3>
          </div>
          <Jump to="odmeny" onTab={setTab}>
            Odměny
          </Jump>
        </div>
        {!noHistory && xp !== null ? (
          <p className="hl-note">
            <b>{num(xp)} XP</b>
            {nextMilestone ? (
              <>
                {' '}
                · další milník <b>{nextMilestone.labelCs}</b> za {num(nextMilestone.threshold - xp)}{' '}
                XP
              </>
            ) : null}
          </p>
        ) : (
          <p className="hl-note">XP přibydou s prvním tréninkem. Odpočinek se netrestá.</p>
        )}
      </section>

      <section className="hl-card hl-sync" data-testid="health-sync">
        <div className="hl-ch">
          <div>
            <span className="hl-lbl">Data</span>
            <h3>{STATUS_CS[model.status]}</h3>
          </div>
          <Jump to="data" onTab={setTab}>
            Detail
          </Jump>
        </div>
        <p className="hl-note">
          {model.lastSuccessAt
            ? `Poslední úspěšný import ${relativeDay(Date.parse(model.lastSuccessAt), model.now)}`
            : 'Zatím žádný úspěšný import'}
        </p>
      </section>
    </div>
  );

  const perWeek =
    change && change.days >= 7 ? `${signedKg((change.delta / change.days) * 7)} / týden` : null;
  const progres = (
    <div className="hl-grid">
      <section className="hl-card hl-wide" data-testid="health-weight-detail">
        <div className="hl-ch">
          <div>
            <span className="hl-lbl">Hmotnost</span>
            <h3>Trend za 30 dní</h3>
          </div>
          {perWeek && (
            <span className="hl-badge" data-tone="neutral">
              {perWeek}
            </span>
          )}
        </div>
        <div className="hl-row">
          {weightValue}
          <span className="hl-note">Denní průměr z recorderu</span>
        </div>
        {weightChart(140, 4)}
        <p className="hl-note hl-muted">Informativní trend, ne hodnocení.</p>
      </section>
      <section className="hl-card hl-side" data-testid="health-activity">
        <span className="hl-lbl">Pohyb tento týden</span>
        <dl className="hl-list">
          <div>
            <dt>Silové tréninky</dt>
            <dd>{weekKnown ? `${completed.value} / ${target.value}` : '–'}</dd>
          </div>
          <div>
            <dt>Čas tréninku</dt>
            <dd>
              {model.week.durationSeconds.value !== null
                ? duration(model.week.durationSeconds.value)
                : '–'}
            </dd>
          </div>
          <div>
            <dt>Poslední trénink</dt>
            <dd>
              {model.lastWorkoutSeconds.value !== null
                ? duration(model.lastWorkoutSeconds.value)
                : '–'}
            </dd>
          </div>
        </dl>
      </section>
      <SleepCard model={model} />
      <section className="hl-card hl-gap" data-testid="health-progress-gap">
        <span className="hl-lbl">Cviky a pravidelnost spánku</span>
        <h3>Zatím mimo dosah integrace</h3>
        <p className="hl-note">
          Integrace Health Fitness v0.7.0 zatím neposílá progres vybraných cviků, týdenní spánek ani
          aktivní minuty. Nic z toho tady nedopočítáváme – detail tréninku zůstává v Calistree.
        </p>
      </section>
    </div>
  );

  const odmeny = (
    <div className="hl-grid">
      <section className="hl-card hl-wide hl-level" data-testid="health-xp">
        <span className="hl-lbl">
          {model.xpLevel.value !== null && !noHistory
            ? `Úroveň ${model.xpLevel.value}`
            : 'XP a úroveň'}
        </span>
        <h2>Klidná konzistence</h2>
        <p className="hl-lead">
          Body oceňují pravidelnost. Odpočinek, nemoc ani chybějící data se netrestají.
        </p>
        {noHistory ? (
          <Unknown
            field={model.xpTotal}
            empty="Zatím bez historie – XP přibydou s prvním tréninkem."
          />
        ) : xp !== null ? (
          <>
            <div className="hl-big">
              {num(xp)} <small>XP</small>
            </div>
            {model.xpLevelProgress.value !== null && (
              <>
                <div
                  className="hl-bar"
                  role="progressbar"
                  aria-label="Průběh úrovně"
                  aria-valuenow={model.xpLevelProgress.value}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <span style={{ width: `${model.xpLevelProgress.value}%` }} />
                </div>
                <p className="hl-note">
                  {num(model.xpLevelProgress.value)} %
                  {model.xpLevel.value !== null
                    ? ` cesty k úrovni ${model.xpLevel.value + 1}`
                    : ' aktuální úrovně'}
                </p>
              </>
            )}
          </>
        ) : (
          <Unknown field={model.xpTotal} />
        )}
      </section>
      <section className="hl-card hl-side" data-testid="health-streak">
        <span className="hl-lbl">Týdenní série</span>
        {noHistory ? (
          <Unknown field={model.streakWeeks} empty="Zatím bez historie" />
        ) : model.streakWeeks.value !== null ? (
          <>
            <div className="hl-big">
              {model.streakWeeks.value}{' '}
              <small>{weeksCs(model.streakWeeks.value).split(' ')[1]}</small>
            </div>
            <p className="hl-note">
              {goalMet.value !== true && slack && slack.remaining > 0
                ? `Stačí dokončit ještě ${trainingsCs(slack.remaining)}.`
                : 'Splněných týdnů v řadě.'}
            </p>
          </>
        ) : (
          <Unknown field={model.streakWeeks} />
        )}
      </section>
      <section className="hl-card hl-side" data-testid="health-flex-card">
        <span className="hl-lbl">Flexibilní jídlo</span>
        {model.flexMealAvailable.value !== null && !noHistory ? (
          <>
            <h3>{model.flexMealAvailable.value ? 'Token je k dispozici' : 'Tento týden využit'}</h3>
            <span className="hl-chip" data-testid="health-flex">
              Flex režim: <b>{model.flexMealAvailable.value ? 'k dispozici' : 'využit'}</b>
            </span>
          </>
        ) : (
          <h3>Zatím bez tokenu</h3>
        )}
        <p className="hl-note">
          Plánované jídlo bez pocitu selhání. Není to kredit za spálené kalorie.
        </p>
      </section>
      <section className="hl-card hl-wide" data-testid="health-milestones">
        <div className="hl-ch">
          <div>
            <span className="hl-lbl">Milníky</span>
            <h3>Co už drží pohromadě</h3>
          </div>
          <span className="hl-badge" data-tone={achievedCount ? 'ok' : 'neutral'}>
            {achievedCount} z {model.milestones.length}
          </span>
        </div>
        <ul className="hl-mlist">
          {model.milestones.map((m) => {
            const state =
              m.achieved.value === true ? 'on' : m.achieved.value === false ? 'off' : 'unknown';
            return (
              <li
                key={m.stableId}
                data-state={state}
                data-next={m === nextMilestone ? 'true' : undefined}
              >
                <span className="hl-mark" aria-hidden="true">
                  {state === 'on' ? '✓' : state === 'unknown' ? '?' : ''}
                </span>
                <span>{m.labelCs}</span>
                <span>
                  {state === 'unknown'
                    ? FIELD_CS[m.achieved.state === 'ok' ? 'invalid' : m.achieved.state]
                    : `${num(m.threshold)} XP`}
                </span>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );

  const fieldRow = (label: string, f: Field<unknown>, ok: string) => (
    <div>
      <dt>{label}</dt>
      <dd data-state={f.state}>{f.state === 'ok' ? ok : FIELD_CS[f.state]}</dd>
    </div>
  );
  const data = (
    <div className="hl-grid">
      <section className="hl-card hl-wide" data-testid="health-sources">
        <div className="hl-ch">
          <div>
            <span className="hl-lbl">Data a synchronizace</span>
            <h3>Integrace Health Fitness</h3>
          </div>
          <span className="hl-pill" data-status={model.status}>
            {STATUS_CS[model.status]}
          </span>
        </div>
        <dl className="hl-list">
          <div>
            <dt>Poslední úspěšný import</dt>
            <dd>
              {model.lastSuccessAt
                ? relativeDay(Date.parse(model.lastSuccessAt), model.now)
                : 'zatím žádný'}
            </dd>
          </div>
          <div>
            <dt>Limit zastarání</dt>
            <dd>7 dní</dd>
          </div>
          {fieldRow('Tréninky (Calistree)', model.week.completed, 'Aktuální')}
          {fieldRow('XP a milníky', model.xpTotal, 'Aktuální')}
          {fieldRow(
            'Spánek',
            model.sleepMinutes,
            model.sleepMinutes.verified ? 'Ověřený' : 'Neověřený',
          )}
          {fieldRow('Hmotnost', model.weight, 'Aktuální')}
        </dl>
        <p className="hl-note hl-muted">
          Import, duplicity a opakování řeší integrace. Počty posledního běhu integrace v0.7.0 do HA
          neposílá.
        </p>
      </section>
      <section className="hl-card hl-side" data-testid="health-privacy">
        <span className="hl-lbl">Soukromí</span>
        <h3>Jen čtení, jen pro tebe</h3>
        <p className="hl-note">
          HomeBrain hodnoty z HA jen čte. Raw exporty, webhook ani osobní poznámky sem nepatří. Na
          kiosku a pro hosty je modul skrytý.
        </p>
      </section>
    </div>
  );

  return (
    <div className="hl-root" data-testid="health-view" data-status={model.status} data-tab={tab}>
      <style>{healthStyles}</style>
      <header className="hl-head">
        <div>
          <h1>Zdraví</h1>
          <p className="hl-sub">
            {periodStart !== null && periodEnd !== null && (
              <>
                Silový týden{' '}
                <b>
                  {shortDate(periodStart)} – {shortDate(periodEnd)}
                </b>
                {' · '}
              </>
            )}
            {updated
              ? `Poslední import ${relativeDay(Date.parse(updated), model.now)}`
              : model.status === 'missing'
                ? 'Read-only přehled nad integrací health_fitness'
                : 'Zatím žádný import'}
          </p>
        </div>
        <div className="hl-head-r">
          <span className="hl-pill" data-status={model.status} data-testid="health-status">
            {STATUS_CS[model.status]}
          </span>
          <span className="hl-pill" title="Zdraví je osobní – na kiosku a pro hosty skryté">
            <LockIcon /> Jen pro tebe
          </span>
        </div>
      </header>

      {model.status === 'missing' ? (
        <div className="hl-grid">
          <MissingState />
        </div>
      ) : (
        <>
          <Tabs tab={tab} onTab={setTab} />
          {model.stale && (
            <p className="hl-banner" data-testid="health-stale">
              <b>Zastaralá data.</b> Poslední úspěšný import{' '}
              {model.lastSuccessAt
                ? relativeDay(Date.parse(model.lastSuccessAt), model.now)
                : 'neznámý'}
              . Hodnoty níže nemusí odpovídat dnešku.
            </p>
          )}
          {(model.status === 'unavailable' || model.status === 'error') && (
            <p className="hl-banner" data-tone="crit" data-testid="health-error">
              <b>{model.status === 'error' ? 'Poslední import selhal.' : 'Zdroj je nedostupný.'}</b>{' '}
              {model.status === 'error'
                ? 'Uložený stav zůstal beze změny – zobrazujeme poslední známé hodnoty.'
                : 'Integrace teď nevrací data; nic se nedopočítává.'}
            </p>
          )}
          {signals.some((s) => s.id.startsWith('health.streak.')) && (
            <ul className="hl-signals" data-testid="health-signals" aria-label="Upozornění do Dnes">
              {signals
                .filter((s) => s.id.startsWith('health.streak.'))
                .map((s) => (
                  <li key={s.id} data-severity={s.severity}>
                    <b>{s.title}</b> · {s.context}
                  </li>
                ))}
            </ul>
          )}
          <div role="tabpanel" id={`hl-panel-${tab}`} aria-labelledby={`hl-tab-${tab}`}>
            {tab === 'dnes' ? dnes : tab === 'progres' ? progres : tab === 'odmeny' ? odmeny : data}
          </div>
        </>
      )}
      <p className="hl-foot">
        Informativní přehled z integrace Health Fitness, ne zdravotní doporučení. Chybějící hodnoty
        se nedopočítávají.
      </p>
    </div>
  );
}

export default function HealthView({
  store,
  bindings,
  connection,
  route,
}: Partial<ModuleViewProps>) {
  const safeBindings = useMemo(() => bindings ?? {}, [bindings]);
  const safeStore = useMemo(
    () =>
      store ??
      ({
        getSnapshot: () => undefined,
        subscribe: () => () => undefined,
      } as unknown as EntityStore),
    [store],
  );
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  const entities = useEntities(safeStore, selectHealthEntityIds(safeBindings));
  const model = useMemo(
    () =>
      adaptHealthEntities({
        bindings: safeBindings,
        getState: (id) => entities.find((entity) => entity?.entity_id === id),
        now,
        timeZone: TZ,
      }),
    [safeBindings, entities, now],
  );
  const [weight, setWeight] = useState<WeightHistory | null>(null);
  const weightId = safeBindings.health_weight_trend;
  const day = localDate(now, TZ);
  useEffect(() => {
    let alive = true;
    void fetchWeightHistory(connection, safeBindings, Date.now()).then((h) => {
      if (alive) setWeight(h);
    });
    return () => {
      alive = false;
    };
    // Refetch when the connection, the weight binding or the local day changes.
  }, [connection, weightId, day]); // eslint-disable-line react-hooks/exhaustive-deps
  const [workoutDays, setWorkoutDays] = useState<WorkoutDays | null>(null);
  const lastWorkout = model.lastWorkoutAt.value;
  const weekStart = model.week.periodStart;
  useEffect(() => {
    let alive = true;
    void fetchWorkoutDays(connection, safeBindings, model).then((d) => {
      if (alive) setWorkoutDays(d);
    });
    return () => {
      alive = false;
    };
    // Refetch when a new workout lands or the week rolls over.
  }, [connection, lastWorkout, weekStart]); // eslint-disable-line react-hooks/exhaustive-deps
  const kiosk =
    typeof location !== 'undefined' && isKioskLocation(location.pathname, location.search);
  const requested =
    typeof location !== 'undefined' ? new URLSearchParams(location.search).get('zalozka') : null;
  const segment = route?.path.split('/').filter(Boolean)[0] ?? null;
  const initialTab = isTab(requested) ? requested : 'dnes';
  return (
    <HealthScreen
      model={model}
      weight={weight}
      workoutDays={workoutDays}
      kiosk={kiosk}
      initialTab={initialTab}
      tab={route ? (isTab(segment) ? segment : initialTab) : undefined}
      onTab={
        route
          ? (next) => navigateTab(next === 'dnes' ? '/health' : `/health/${next}`, next === 'dnes')
          : undefined
      }
    />
  );
}

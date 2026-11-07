import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { EntityStore, EntityStateLike, ModuleViewProps } from '@homebrain/ha-client';
import { Card, EmptyState, StatusBadge, toast } from '@homebrain/ui';
import { adaptWasteEntities, selectWasteEntityIds } from '../adapter.js';
import { toLocalDateKey, wasteLabel } from '../normalize.js';
import { useWasteCalendar } from '../calendar.js';
import { useWasteHistoryData } from '../history.js';
import { horizonNotice, typesWithoutNext } from '../horizon.js';
import type { WasteCollectionEvent } from '../contract.js';
import type { CSSProperties } from 'react';
import { WasteBin, collectionDays, daysLabel, fillLevel } from './WasteBin.js';
import { wasteStyles } from './wasteStyles.js';

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
const dateFormatter = new Intl.DateTimeFormat('cs-CZ', {
  weekday: 'long',
  day: 'numeric',
  month: 'numeric',
  timeZone: 'UTC',
});
/** Only an observed regular collection interval defines a cycle. */
export function cycleProgress(event: WasteCollectionEvent, reference: string): number | null {
  if (['electro', 'bulky', 'hazardous', 'other'].includes(event.waste_type)) return null;
  return fillLevel(event.last_collection_date, event.collection_date, reference);
}
function Countdown({ days }: { days: number | null }) {
  return (
    <div className="wb-countdown" aria-label={daysLabel(days)}>
      {days !== null && days > 1 ? (
        <>
          <span className="wb-number">{days}</span>{' '}
          <span className="wb-unit">{days <= 4 ? 'dny' : 'dní'}</span>
        </>
      ) : (
        <span>{days === 0 ? 'Dnes' : days === 1 ? 'Zítra' : 'Bez termínu'}</span>
      )}
    </div>
  );
}
function CycleBar({
  event,
  reference,
  placeholder = false,
}: {
  event: WasteCollectionEvent;
  reference: string;
  /** Fleet card: keep an empty track for irregular types so all cards share one rhythm. */
  placeholder?: boolean;
}) {
  const progress = cycleProgress(event, reference);
  if (progress === null)
    return placeholder ? <div className="wb-cycle is-empty" aria-hidden="true" /> : null;
  return (
    <div
      className="wb-cycle"
      role="progressbar"
      aria-label="Uplynulá část cyklu svozu"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress * 100)}
      title="Podíl času od minulého svozu do příštího svozu"
    >
      <span style={{ transform: `scaleX(${progress})` }} />
    </div>
  );
}
function actionLabel(event: WasteCollectionEvent, days: number | null, hour: number) {
  if (days === 1) return 'Vyvezte dnes večer';
  if (days === 0)
    return hour < 9
      ? 'Vyvezte hned ráno'
      : hour < COLLECTED_AFTER_HOUR
        ? 'Dnes se vyváží'
        : 'Dnes vyvezeno';
  const cycle = event.last_collection_date
    ? collectionDays(event.collection_date, event.last_collection_date)
    : null;
  return !['electro', 'bulky', 'hazardous', 'other'].includes(event.waste_type) &&
    cycle &&
    cycle > 0
    ? `Cyklus svozu · ${cycle} dní`
    : 'Svoz podle plánu';
}
function EventDetails({ event }: { event: WasteCollectionEvent }) {
  return (
    <>
      <strong>{event.display_name}</strong>
      {' · '}
      <time dateTime={event.collection_date}>
        {dateFormatter.format(new Date(`${event.collection_date}T00:00:00Z`))}
      </time>
      {event.availability === 'tentative' && ' (předběžný termín)'}
    </>
  );
}
function readPreferences(): Record<string, boolean> {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem('hb-waste-reminders') ?? '{}');
    if (typeof saved === 'object' && saved !== null) {
      return Object.fromEntries(
        Object.entries(saved).filter(([, value]) => typeof value === 'boolean'),
      );
    }
  } catch {
    /* Storage is optional in embedded panels. */
  }
  return {};
}
function Reminders({ days, now }: { days: number | null; now: number }) {
  const [preferences, setPreferences] = useState(readPreferences);
  const options = [
    ['evening', 'Večer před svozem · 20:00'],
    ['morning', 'V den svozu · 5:30'],
  ] as const;
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Prague',
      hour: '2-digit',
      hourCycle: 'h23',
      minute: '2-digit',
    })
      .format(new Date(now))
      .split(':')
      .slice(0, 2)
      .reduce((hours, part, index) => hours + Number(part) / (index === 0 ? 1 : 60), 0),
  );
  return (
    <aside className="wb-reminders" aria-label="Připomínky">
      <h3>Připomínky</h3>
      {options.map(([key, label]) => (
        <label key={key}>
          {label}
          <input
            type="checkbox"
            role="switch"
            checked={preferences[key] ?? true}
            onChange={(event) => {
              const next = { ...preferences, [key]: event.target.checked };
              setPreferences(next);
              try {
                localStorage.setItem('hb-waste-reminders', JSON.stringify(next));
                const which = key === 'evening' ? 'Večerní' : 'Ranní';
                toast.success(
                  `${which} připomínka ${event.target.checked ? 'zapnuta' : 'vypnuta'}`,
                  {
                    id: 'waste-reminders',
                  },
                );
              } catch {
                toast.error('Nastavení se nepodařilo uložit', { id: 'waste-reminders' });
              }
            }}
          />
        </label>
      ))}
      <p className="wb-local">
        Jen v&nbsp;tomto prohlížeči, když je panel otevřený. Do&nbsp;telefonu se nic neposílá.
      </p>
      {days === 1 && hour >= 20 && preferences.evening !== false && (
        <p role="status" className="wb-local">
          Vyvezte dnes večer
        </p>
      )}
      {days === 0 && hour >= 5.5 && hour < 9 && preferences.morning !== false && (
        <p role="status" className="wb-local">
          Ranní připomínka: dnes je svoz.
        </p>
      )}
    </aside>
  );
}
const MONTHS_CS = [
  'leden',
  'únor',
  'březen',
  'duben',
  'květen',
  'červen',
  'červenec',
  'srpen',
  'září',
  'říjen',
  'listopad',
  'prosinec',
] as const;
const DAY_NAMES_CS = ['po', 'út', 'st', 'čt', 'pá', 'so', 'ne'] as const;
/** `YYYY-MM` posunutý o `delta` měsíců. */
export function shiftMonth(month: string, delta: number): string {
  const [year, index] = month.split('-').map(Number) as [number, number];
  const total = year * 12 + (index - 1) + delta;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}
function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}
function shortDate(key: string) {
  return `${Number(key.slice(8, 10))}.\u00a0${Number(key.slice(5, 7))}.`;
}
/** „dnes“, „včera“, „před 14 dny (19. 10.)“ – kdy byla nádoba naposledy vyvezena. */
export function lastCollectedLabel(last: string, reference: string, compact = false): string {
  const days = collectionDays(reference, last);
  if (days <= 0) return 'dnes';
  if (days === 1) return 'včera';
  return compact ? `před ${days} dny` : `před ${days} dny (${shortDate(last)})`;
}
function LastCollected({
  event,
  reference,
  compact = false,
}: {
  event: WasteCollectionEvent;
  reference: string;
  /**
   * Fleet card: same „Naposledy před 14 dny · 19. 10.“ as the hero; an empty placeholder keeps
   * the grid row when the type has no history, so cycle bars stay aligned across cards.
   */
  compact?: boolean;
}) {
  const last = event.last_collection_date;
  if (!last || last > reference)
    return compact ? <p className="wb-last" aria-hidden="true" /> : null;
  const full = dateFormatter.format(new Date(`${last}T00:00:00Z`));
  const relative = lastCollectedLabel(last, reference, true);
  return (
    <p className="wb-last" title={`Naposledy vyvezeno ${full}`}>
      <svg viewBox="0 0 12 12" aria-hidden="true">
        <path d="M6 1.5a4.5 4.5 0 1 0 4.5 4.5M6 3.5V6l1.8 1.2M10.5 1.8v2.6H7.9" />
      </svg>
      <span className="wb-last-label">Naposledy</span>{' '}
      <span className="wb-last-value">
        <time dateTime={last} aria-label={`${relative}, ${full}`}>
          {relative}
        </time>
        {relative !== 'dnes' && relative !== 'včera' && (
          <span className="wb-last-date"> · {shortDate(last)}</span>
        )}
      </span>
    </p>
  );
}
/** Hodina, od které se dnešní svoz považuje za proběhlý (odhad, svozová firma čas nehlásí). */
export const COLLECTED_AFTER_HOUR = 14;
function Chevron({ direction }: { direction: 'prev' | 'next' }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d={direction === 'prev' ? 'M10 3.5 5.5 8l4.5 4.5' : 'M6 3.5 10.5 8 6 12.5'} />
    </svg>
  );
}
/** Minimální vodorovný posun (px), od kterého je tah gestem změnou měsíce. */
export const SWIPE_THRESHOLD = 44;
/** Rozsah měsíců, kam lze v kalendáři listovat: od nejstaršího záznamu po poslední termín. */
export function monthBounds(events: WasteCollectionEvent[], reference: string) {
  const months = [
    reference.slice(0, 7),
    ...events.map((e) => e.collection_date.slice(0, 7)),
  ].sort();
  return { min: months[0]!, max: months[months.length - 1]! };
}
/**
 * Měsíční kalendář svozů (po–ne, jeden řádek názvů dnů). Šipky, klávesy ←/→ a swipe listují do
 * minulosti (jen kam sahá historie) i do budoucnosti (jen kam sahají termíny). Minulé svozy jsou
 * ztlumené s fajfkou, dnešek má plný kroužek.
 */
function MonthCalendar({
  events,
  reference,
  hour,
}: {
  events: WasteCollectionEvent[];
  reference: string;
  hour: number;
}) {
  const current = reference.slice(0, 7);
  const { min, max } = monthBounds(events, reference);
  const [view, setView] = useState({ month: current, direction: '' as '' | 'prev' | 'next' });
  const month = view.month < min ? min : view.month > max ? max : view.month;
  const surface = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; x: number; y: number; axis: '' | 'x' | 'y' } | null>(null);
  const go = (delta: number) => {
    const next = shiftMonth(month, delta);
    if (next < min || next > max) return false;
    setView({ month: next, direction: delta < 0 ? 'prev' : 'next' });
    return true;
  };
  const setOffset = (dx: number) => {
    const grid = surface.current?.querySelector<HTMLElement>('.wb-month-grid');
    if (!grid) return;
    grid.style.transform = dx ? `translateX(${dx}px)` : '';
    grid.style.transition = dx ? 'none' : '';
  };
  const endDrag = (dx: number | null) => {
    const state = drag.current;
    drag.current = null;
    setOffset(0);
    if (state?.axis !== 'x' || dx === null || Math.abs(dx) < SWIPE_THRESHOLD) return;
    go(dx < 0 ? 1 : -1);
  };
  const first = new Date(`${month}-01T00:00:00Z`);
  const start = new Date(first);
  start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
  const end = new Date(first);
  end.setUTCMonth(end.getUTCMonth() + 1);
  const days: Date[] = [];
  for (
    const day = new Date(start);
    day < end || days.length % 7;
    day.setUTCDate(day.getUTCDate() + 1)
  )
    days.push(new Date(day));
  const [year, index] = month.split('-').map(Number) as [number, number];
  const title = `${MONTHS_CS[index - 1]} ${year}`;
  const inMonth = events.filter(
    (event) => event.collection_date.slice(0, 7) === month && event.availability !== 'cancelled',
  );
  const pickupDays = new Set(events.map((event) => event.collection_date));
  const busyWeeks = new Set(
    days.flatMap((date, i) =>
      pickupDays.has(dateKey(date)) && dateKey(date).slice(0, 7) === month
        ? [Math.floor(i / 7)]
        : [],
    ),
  );
  const legend = [...new Map(inMonth.map((event) => [event.waste_type, event])).values()];
  const collectedCount = inMonth.filter(
    (event) =>
      event.collection_date < reference ||
      (event.collection_date === reference && hour >= COLLECTED_AFTER_HOUR),
  ).length;
  const summary =
    month < current
      ? `${inMonth.length} ${inMonth.length === 1 ? 'svoz' : inMonth.length >= 2 && inMonth.length <= 4 ? 'svozy' : 'svozů'} v historii`
      : month === current
        ? `${collectedCount} z ${inMonth.length} svozů proběhlo`
        : `${inMonth.length} ${inMonth.length === 1 ? 'plánovaný svoz' : inMonth.length >= 2 && inMonth.length <= 4 ? 'plánované svozy' : 'plánovaných svozů'}`;
  return (
    <section
      className="wb-section wb-calendar"
      aria-label="Kalendář svozů"
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft') go(-1);
        if (event.key === 'ArrowRight') go(1);
      }}
    >
      <div className="wb-section-title">
        <h2>Kalendář svozů</h2>
      </div>
      <div
        ref={surface}
        className="wb-surface wb-month"
        data-month={month}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, axis: '' };
        }}
        onPointerMove={(event) => {
          const state = drag.current;
          if (!state || state.id !== event.pointerId) return;
          const dx = event.clientX - state.x;
          const dy = event.clientY - state.y;
          if (!state.axis && Math.max(Math.abs(dx), Math.abs(dy)) > 8) {
            state.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
            if (state.axis === 'x') event.currentTarget.setPointerCapture?.(event.pointerId);
          }
          if (state.axis !== 'x') return;
          // Gumový odpor na okraji historie / plánu.
          const blocked = (dx > 0 && month <= min) || (dx < 0 && month >= max);
          setOffset(blocked ? dx * 0.15 : dx * 0.5);
        }}
        onPointerUp={(event) => {
          const state = drag.current;
          if (!state || state.id !== event.pointerId) return;
          endDrag(event.clientX - state.x);
        }}
        onPointerCancel={() => endDrag(null)}
        onLostPointerCapture={(event) => {
          // Dotyk má implicitní capture na dítěti; jeho ztrátu (bublá sem) při převzetí ignorovat.
          if (event.target === event.currentTarget && drag.current) endDrag(null);
        }}
      >
        <div className="wb-month-bar">
          <span className="wb-month-label" aria-live="polite">
            {title}
          </span>
          <div className="wb-month-nav">
            {month !== current && (
              <button
                type="button"
                className="wb-month-today"
                onClick={() =>
                  setView({ month: current, direction: current < month ? 'prev' : 'next' })
                }
              >
                Dnes
              </button>
            )}
            <button
              type="button"
              className="wb-month-step"
              aria-label="Předchozí měsíc"
              title={month <= min ? 'Starší svozy nejsou v historii' : 'Předchozí měsíc'}
              disabled={month <= min}
              onClick={() => go(-1)}
            >
              <Chevron direction="prev" />
            </button>
            <button
              type="button"
              className="wb-month-step"
              aria-label="Další měsíc"
              title={month >= max ? 'Další termíny zatím nejsou zveřejněné' : 'Další měsíc'}
              disabled={month >= max}
              onClick={() => go(1)}
            >
              <Chevron direction="next" />
            </button>
          </div>
        </div>
        <div className="wb-month-head" aria-hidden="true">
          {DAY_NAMES_CS.map((name) => (
            <span key={name}>{name}</span>
          ))}
        </div>
        <div
          key={month}
          className={`wb-month-grid${view.direction ? ` wb-slide-${view.direction}` : ''}`}
        >
          {days.map((date, i) => {
            const key = dateKey(date);
            const relative = collectionDays(key, reference);
            const collected = relative < 0 || (relative === 0 && hour >= COLLECTED_AFTER_HOUR);
            const onDay = events
              .filter((event) => event.collection_date === key)
              .sort(
                (a, b) =>
                  Number(b.availability === 'cancelled') - Number(a.availability === 'cancelled'),
              );
            const visibleCount = onDay.length > 2 ? 1 : 2;
            const names = onDay
              .filter((event) => event.availability !== 'cancelled')
              .map((event) => event.display_name);
            return (
              <div
                key={key}
                className={`wb-day${relative < 0 ? ' is-past' : ''}${key.slice(0, 7) !== month ? ' is-outside' : ''}${onDay.length ? ' has-pickup' : ''}${busyWeeks.has(Math.floor(i / 7)) ? '' : ' is-quiet'}`}
                aria-current={key === reference ? 'date' : undefined}
                style={
                  onDay[0]
                    ? ({
                        '--event-color': `var(--hb-waste-${onDay[0].waste_type})`,
                      } as CSSProperties)
                    : undefined
                }
              >
                <time
                  dateTime={key}
                  aria-label={`${dateFormatter.format(date)}${key === reference ? ', dnes' : ''}${
                    names.length ? `: ${names.join(', ')}${collected ? ' – vyvezeno' : ''}` : ''
                  }`}
                >
                  {date.getUTCDate()}
                </time>
                {onDay.length > 0 && key.slice(0, 7) === month && (
                  <div className="wb-mini-stack">
                    {onDay.slice(0, visibleCount).map((event) => (
                      <WasteBin
                        key={event.id}
                        type={event.waste_type}
                        days={relative}
                        availability={event.availability}
                        size="mini"
                        done={collected}
                      />
                    ))}
                    {onDay.length > 2 && (
                      <span
                        className="wb-more"
                        title={onDay
                          .slice(visibleCount)
                          .map(
                            (event) =>
                              `${event.display_name}${event.availability === 'cancelled' ? ' (zrušeno)' : ''}`,
                          )
                          .join(', ')}
                      >
                        +{onDay.length - visibleCount}
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="wb-month-foot">
          <ul className="wb-legend" aria-label="Typy svozů v měsíci">
            {legend.map((event) => (
              <li
                key={event.waste_type}
                title={event.display_name}
                style={{ '--event-color': `var(--hb-waste-${event.waste_type})` } as CSSProperties}
              >
                <i aria-hidden="true" />
                <span>{wasteLabel(event).short}</span>
              </li>
            ))}
          </ul>
          <span className="wb-month-summary">
            {month === current && inMonth.length > 0 && (
              <span className="wb-month-dots" aria-hidden="true">
                {[...inMonth]
                  .sort((a, b) => a.collection_date.localeCompare(b.collection_date))
                  .map((event) => (
                    <i
                      key={event.id}
                      className={
                        event.collection_date < reference ||
                        (event.collection_date === reference && hour >= COLLECTED_AFTER_HOUR)
                          ? 'is-done'
                          : undefined
                      }
                      style={
                        { '--event-color': `var(--hb-waste-${event.waste_type})` } as CSSProperties
                      }
                    />
                  ))}
              </span>
            )}
            {inMonth.length ? summary : month < current ? 'Bez záznamu' : 'Žádné svozy'}
          </span>
        </div>
      </div>
    </section>
  );
}
/** Hero (desktop): sedm dní od dneška – co se kdy vyváží, bez nutnosti scrollovat ke kalendáři. */
function WeekStrip({
  events,
  reference,
  hour,
}: {
  events: WasteCollectionEvent[];
  reference: string;
  hour: number;
}) {
  return (
    <ol className="wb-week-strip" aria-label="Příštích 7 dní">
      {Array.from({ length: 7 }, (_, offset) => {
        const date = new Date(`${reference}T00:00:00Z`);
        date.setUTCDate(date.getUTCDate() + offset);
        const key = dateKey(date);
        const onDay = events.filter(
          (event) => event.collection_date === key && event.availability !== 'cancelled',
        );
        const collected = offset === 0 && hour >= COLLECTED_AFTER_HOUR;
        return (
          <li
            key={key}
            className={onDay.length ? 'has-pickup' : undefined}
            aria-current={offset === 0 ? 'date' : undefined}
            aria-label={`${dateFormatter.format(date)}${onDay.length ? `: ${onDay.map((event) => event.display_name).join(', ')}` : ''}`}
          >
            <span className="wb-strip-day">
              {offset === 0 ? 'Dnes' : DAY_NAMES_CS[(date.getUTCDay() + 6) % 7]}
            </span>
            <span className="wb-strip-bins">
              {onDay.slice(0, 2).map((event) => (
                <WasteBin
                  key={event.id}
                  type={event.waste_type}
                  days={offset}
                  availability={event.availability}
                  size="mini"
                  done={collected}
                />
              ))}
              {!onDay.length && <i aria-hidden="true" />}
            </span>
            <span className="wb-strip-date">{shortDate(key)}</span>
          </li>
        );
      })}
    </ol>
  );
}
export default function WasteView({ store, bindings, connection, kiosk }: ModuleViewProps) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);
  const entities = useEntities(store, selectWasteEntityIds(bindings));
  const calendarEvents = useWasteCalendar(
    connection,
    bindings.waste_calendar?.trim() || undefined,
    toLocalDateKey(new Date(now), 'Europe/Prague'),
  );
  const historyData = useWasteHistoryData(
    connection,
    toLocalDateKey(new Date(now), 'Europe/Prague'),
  );
  const history = historyData === 'error' ? 'error' : historyData?.events;
  // Konec dat jen pro admina (WS je admin-only) a nikdy na kiosku – děti nemají co řešit.
  const dataEnd =
    kiosk || !historyData || historyData === 'error' ? null : horizonNotice(historyData.horizon);
  const schedule = useMemo(
    () =>
      adaptWasteEntities({
        bindings,
        getState: (id) => entities.find((entity) => entity?.entity_id === id),
        now,
        calendarEvents,
        history,
      }),
    [bindings, entities, now, calendarEvents, history],
  );
  const updatedAt = schedule.sourceUpdatedAt ?? entities.find((entity) => entity)?.last_updated;
  const validUpdate = updatedAt && Number.isFinite(Date.parse(updatedAt));
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Prague',
      hour: '2-digit',
      hourCycle: 'h23',
    }).format(new Date(now)),
  );
  // Po odhadovaném svozu (14:00) se hero přepne na další termín; dnešek zůstane jako „vyvezeno“.
  const collectedToday = hour >= COLLECTED_AFTER_HOUR ? schedule.today : [];
  const pending = collectedToday.length
    ? schedule.upcoming.filter((event) => event.collection_date !== schedule.referenceDate)
    : schedule.upcoming;
  const next = pending[0] ?? null;
  const days = next ? collectionDays(next.collection_date, schedule.referenceDate) : null;
  const fleet = pending.filter(
    (event, index, events) =>
      event.waste_type !== next?.waste_type &&
      events.findIndex((other) => other.waste_type === event.waste_type) === index,
  );
  const sameDay = next
    ? pending.filter((event) => event.collection_date === next.collection_date)
    : [];
  // Hlavní text hero („Dnes“) už stav nese; pilulka „Dnes se vyváží“ by ho jen opakovala.
  const heroAction = next && days !== null ? actionLabel(next, days, hour) : '';
  // Na tabletu je „Další svozy“ vodorovný karusel: po načtení / změně dat musí začínat první
  // kartou (scroll-snap jinak v Chromu po reflow přichytí druhou kartu). Na telefonu je to
  // svislý seznam bez posuvu, kde je reset neškodný (scrollLeft zůstává 0).
  const fleetRef = useRef<HTMLUListElement>(null);
  const fleetKey = fleet.map((event) => event.id).join('|');
  useLayoutEffect(() => {
    if (fleetRef.current) fleetRef.current.scrollLeft = 0;
  }, [fleetKey]);
  const tomorrowOthers = schedule.tomorrow.filter((event) => !sameDay.includes(event));
  const lastByType = [
    ...new Map(
      [...schedule.past, ...collectedToday].map((event) => [event.waste_type, event]),
    ).values(),
  ].sort((a, b) => b.collection_date.localeCompare(a.collection_date));
  const unknownNext = typesWithoutNext(lastByType, pending);
  return (
    <Card className="hb-waste wb-panel">
      <style>{wasteStyles}</style>
      <header className="wb-header">
        <div>
          <p className="wb-eyebrow">Každá nádoba má svůj den</p>
        </div>
        <StatusBadge quality={schedule.quality} />
      </header>
      {schedule.quality === 'stale' && (
        <p className="wb-status">
          Data mohou být zastaralá
          {validUpdate && (
            <>
              {' '}
              · Poslední aktualizace:{' '}
              <time dateTime={updatedAt}>{new Date(updatedAt).toLocaleString('cs-CZ')}</time>
            </>
          )}
        </p>
      )}
      {schedule.quality === 'unavailable' && (
        <p className="wb-status">Data svozu nejsou momentálně dostupná</p>
      )}
      {schedule.notices.length > 0 && (
        <ul className="wb-notices" aria-label="Oznámení">
          {schedule.notices.map((notice) => (
            <li key={notice}>{notice}</li>
          ))}
        </ul>
      )}
      {dataEnd && (
        <section
          className="wb-surface wb-horizon"
          role="region"
          aria-label="Konec svozových dat"
          data-severity="info"
          data-testid="waste-horizon"
        >
          <p className="wb-horizon-title">
            <i aria-hidden="true" />
            {dataEnd.title}
          </p>
          <details className="wb-horizon-help">
            <summary>Co s tím</summary>
            <ol>
              {dataEnd.help.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </details>
        </section>
      )}
      {next ? (
        <section
          className={`wb-surface wb-hero${days === 0 ? ' is-today' : days === 1 ? ' is-tomorrow' : ''}`}
          aria-label="Příští svoz"
          style={{ '--event-color': `var(--hb-waste-${next.waste_type})` } as CSSProperties}
        >
          <WasteBin
            key={next.id}
            type={next.waste_type}
            days={days}
            availability={next.availability}
            size="hero"
            evening={hour >= 16}
            collected={
              days === 0
                ? hour >= COLLECTED_AFTER_HOUR
                : next.last_collection_date === schedule.referenceDate
            }
          />
          <div className="wb-hero-copy">
            <h2 className="wb-type" title={next.display_name}>
              <i aria-hidden="true" />
              <span className="wb-type-label">
                <span className="wb-card-name">
                  {wasteLabel(next).short}
                  {next.availability === 'tentative' ? ' · předběžně' : ''}
                </span>
                {wasteLabel(next).detail && (
                  <span className="wb-type-detail">{wasteLabel(next).detail}</span>
                )}
              </span>
            </h2>
            <Countdown days={days} />
            {sameDay.length > 1 && (
              <p className="wb-date">
                Také{' '}
                {sameDay
                  .slice(1)
                  .map((event) => event.display_name)
                  .join(' a ')}
              </p>
            )}
            <time className="wb-date" dateTime={next.collection_date}>
              {dateFormatter.format(new Date(`${next.collection_date}T00:00:00Z`))}
            </time>
            <LastCollected event={next} reference={schedule.referenceDate} />
            {days !== 0 && <CycleBar event={next} reference={schedule.referenceDate} />}
            {heroAction !== 'Dnes se vyváží' && (
              <p
                className={`wb-action${days === 0 ? ` wb-pill${hour >= COLLECTED_AFTER_HOUR ? ' is-done' : ''}` : ''}`}
              >
                {days === 0 && <i aria-hidden="true" />}
                {heroAction}
              </p>
            )}
            <section role="region" aria-label="Dnes a zítra" className="wb-summary">
              {collectedToday.length > 0 && (
                <p className="wb-done-chip" data-testid="waste-collected-today">
                  <i aria-hidden="true" />
                  Dnes vyvezeno: {collectedToday.map((event) => event.display_name).join(', ')}
                </p>
              )}
              {tomorrowOthers.length > 0 && (
                <a href={fleet.length ? '#waste-fleet' : undefined} data-testid="waste-tomorrow">
                  <p>Svoz zítra: {tomorrowOthers.map((event) => event.display_name).join(', ')}</p>
                  <span className="hb-waste-sr-only">Připravte popelnice večer</span>
                </a>
              )}
              {!schedule.today.length && !schedule.tomorrow.length && (
                <p>Dnes ani zítra se nic nevyváží</p>
              )}
            </section>
          </div>
          <WeekStrip events={schedule.upcoming} reference={schedule.referenceDate} hour={hour} />
        </section>
      ) : (
        <section className="wb-surface wb-hero" aria-label="Příští svoz">
          <WasteBin type="mixed" days={null} availability="unavailable" size="hero" />
          <div>
            <p className="wb-local">Dnes ani zítra se nic nevyváží</p>
            <EmptyState
              title={
                schedule.quality !== 'ok'
                  ? 'Čekáme na termíny svozu'
                  : schedule.past.length
                    ? 'Další svozy zatím nejsou známé'
                    : 'Žádné naplánované svozy'
              }
            />
          </div>
        </section>
      )}
      {fleet.length > 0 && (
        <section className="wb-section">
          <div className="wb-section-title">
            <h2>Další svozy</h2>
            <span>Nejbližší termín každé nádoby</span>
          </div>
          <ul
            ref={fleetRef}
            id="waste-fleet"
            tabIndex={-1}
            aria-label="Nejbližší svozy"
            className="wb-fleet"
          >
            {fleet.map((event) => {
              const relative = collectionDays(event.collection_date, schedule.referenceDate);
              return (
                <li
                  key={event.id}
                  className={
                    relative === 0 ? 'is-today' : relative === 1 ? 'is-tomorrow' : undefined
                  }
                  aria-current={relative === 0 ? 'date' : undefined}
                  style={
                    { '--event-color': `var(--hb-waste-${event.waste_type})` } as CSSProperties
                  }
                >
                  <WasteBin
                    type={event.waste_type}
                    days={relative}
                    availability={event.availability}
                    evening={hour >= 16}
                    collected={
                      relative === 0
                        ? hour >= COLLECTED_AFTER_HOUR
                        : event.last_collection_date === schedule.referenceDate
                    }
                  />
                  <div className="wb-card-copy">
                    <strong className="wb-type" title={event.display_name}>
                      <i aria-hidden="true" />
                      <span className="wb-type-label">
                        <span className="wb-card-name">{wasteLabel(event).short}</span>
                        {wasteLabel(event).detail && (
                          <span className="wb-type-detail">{wasteLabel(event).detail}</span>
                        )}
                      </span>
                    </strong>
                    <div
                      className={`wb-card-count${
                        event.availability === 'tentative' ? ' wb-date-tentative' : ''
                      }`}
                      title={event.availability === 'tentative' ? 'předběžný termín' : undefined}
                    >
                      <Countdown days={relative} />
                    </div>
                    <time className="wb-card-date" dateTime={event.collection_date}>
                      {dateFormatter.format(new Date(`${event.collection_date}T00:00:00Z`))}
                    </time>
                    <LastCollected event={event} reference={schedule.referenceDate} compact />
                    <CycleBar event={event} reference={schedule.referenceDate} placeholder />
                    <p className="wb-action">{actionLabel(event, relative, hour)}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      <MonthCalendar
        events={[...schedule.past, ...schedule.upcoming, ...schedule.cancelled]}
        reference={schedule.referenceDate}
        hour={hour}
      />
      <div className="wb-side">
        {lastByType.length > 0 && (
          <section className="wb-surface wb-history" aria-label="Naposledy vyvezeno">
            <h3>Naposledy vyvezeno</h3>
            <ul>
              {lastByType.map((event) => (
                <li key={event.waste_type}>
                  <WasteBin
                    type={event.waste_type}
                    days={collectionDays(event.collection_date, schedule.referenceDate)}
                    availability={event.availability}
                    size="mini"
                  />
                  <span className="wb-history-name" title={event.display_name}>
                    {wasteLabel(event).short}
                  </span>
                  <span className="wb-history-when">
                    {lastCollectedLabel(event.collection_date, schedule.referenceDate, true)}
                    <time dateTime={event.collection_date}>{shortDate(event.collection_date)}</time>
                  </span>
                  {unknownNext.has(event.waste_type) && (
                    <span className="wb-history-next">Další termín zatím neznámý</span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
        {next && <Reminders days={days} now={now} />}
      </div>
      {schedule.cancelled.length > 0 && (
        <section aria-label="Zrušené svozy" className="wb-cancelled">
          <h2>Zrušené svozy</h2>
          <ul>
            {schedule.cancelled.map((event) => (
              <li key={event.id}>
                <WasteBin
                  type={event.waste_type}
                  days={collectionDays(event.collection_date, schedule.referenceDate)}
                  availability="cancelled"
                  size="mini"
                />
                <span>
                  <EventDetails event={event} />
                </span>
                <span className="wb-badge">zrušeno</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Card>
  );
}

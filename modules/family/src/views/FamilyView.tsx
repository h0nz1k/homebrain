import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import { hostWindow, usePeople, type ModuleViewProps } from '@homebrain/ha-client';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Icon,
  PresenceStrip,
  Pill,
  Skeleton,
  czCount,
  czPlural,
  presenceHex,
  useToast,
} from '@homebrain/ui';
import { getFamilyApi } from '../api.js';
import { choreManagementError } from '../errors.js';
import { newRequestId } from '../uid.js';
import {
  choreNote,
  choreTally,
  eventWho,
  formatOutOf,
  pointsAmount,
  isPast,
  longDate,
  nextDays,
  nextEvent,
  pointsLabel,
  relLabel,
  sortChores,
  timeLabel,
  todayEvents,
  upcomingParts,
} from '../format.js';
import { handedToLabel, takenFromLabel, reassignedToLabel } from '../czech.js';
import type { ChoreManagement, FamilyEvent, FamilyKid, FamilySnapshot } from '../types.js';
import { familyStyles } from './familyStyles.js';
import {
  AddChoreSheet,
  ChoreMenuSheet,
  DeleteChoreSheet,
  ApprovalsBlock,
  PointsSheet,
  SwapSheet,
  useApprovals,
} from './familySheets.js';

const POLL_MS = 60_000;
/** Calendar categories use non-person hues (blue-grey, amber) so they never read as a kid. */
export const SRC_COLOR = { family: '#8a9bb8', school: '#e0a23a' } as const;
const KID_COLORS = ['#e879a8', '#2dd4bf', '#f59e0b', '#a78bfa'];

/** Phone layout (same breakpoint as the stacked grid in familyStyles). */
function usePhone(): boolean {
  const query = '(max-width: 760px)';
  const [phone, setPhone] = useState(
    () => typeof window !== 'undefined' && !!window.matchMedia?.(query).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return;
    const on = () => setPhone(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return phone;
}

function Check() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

/** Calendar colour is always the category (legend); the person is shown only by the avatar. */
function srcStyle(ev: FamilyEvent) {
  return { '--fam-src': SRC_COLOR[ev.kind] ?? SRC_COLOR.family } as React.CSSProperties;
}

function SchoolTag({ ev }: { ev: FamilyEvent }) {
  if (ev.kind !== 'school') return null;
  return (
    <span className="fam-src" data-testid="family-school-tag" title={ev.source}>
      <Icon name="school" size={14} />
      Škola
    </span>
  );
}

interface Member {
  id: string;
  name: string;
  color: string;
}

const membersOf = (snap: FamilySnapshot): Member[] =>
  snap.kids.map((k) => ({
    id: k.id,
    name: k.name,
    color:
      KID_COLORS[
        Array.from(k.id).reduce((sum, char) => sum + char.charCodeAt(0), 0) % KID_COLORS.length
      ]!,
  }));

function Who({ ids, members }: { ids: string[]; members: Member[] }) {
  if (!ids.length) return null;
  const names = ids.map((id) => members.find((m) => m.id === id)).filter(Boolean) as Member[];
  return (
    <span
      className="fam-who"
      data-testid="family-who"
      aria-label={names.map((m) => m.name).join(', ')}
    >
      {names.map((m) => (
        <span
          key={m.id}
          className="fam-avatar fam-avatar-sm"
          style={{ '--fam-kid': m.color } as React.CSSProperties}
          title={m.name}
          aria-hidden="true"
        >
          {m.name.slice(0, 1)}
        </span>
      ))}
    </span>
  );
}

function Legend({ snap }: { snap: FamilySnapshot }) {
  const kinds = (['family', 'school'] as const).filter((k) =>
    snap.calendars.some((c) => c.kind === k),
  );
  if (kinds.length < 2) return null;
  return (
    <span className="fam-legend" data-testid="family-legend">
      {kinds.map((k) => (
        <span key={k} style={{ '--fam-src': SRC_COLOR[k] } as React.CSSProperties}>
          {k === 'school' ? 'Škola' : 'Rodina'}
        </span>
      ))}
    </span>
  );
}

function TodayCard({
  snap,
  now,
  admin,
  members,
}: {
  snap: FamilySnapshot;
  now: Date;
  admin: boolean;
  members: Member[];
}) {
  const today = todayEvents(snap.events, now);
  const next = nextEvent(snap.events, now);
  const rest = today.filter((ev) => ev.id !== next?.id);
  const nextWho = next ? eventWho(next, members) : null;
  const nextDetail = next ? [next.location, next.description].filter(Boolean).join(' · ') : '';
  return (
    <Card className="fam-card" data-testid="family-today">
      <div className="fam-card-h">
        <h2>Dnes v rodině</h2>
        {snap.calendars.length > 0 && (
          <span className="fam-meta">
            {czCount(today.length, 'událost', 'události', 'událostí')}
          </span>
        )}
      </div>
      {snap.calendars.length === 0 ? (
        <p className="fam-empty" data-testid="family-no-calendar">
          {admin
            ? 'Vyberte rodinný kalendář v Nastavení → Rodina.'
            : 'Rodinný kalendář zatím není nastaven.'}
        </p>
      ) : (
        <>
          {next && nextWho && (
            <div className="fam-next" style={srcStyle(next)} data-testid="family-next">
              <small>{relLabel(next, now)}</small>
              <div className="fam-next-t">
                <Who ids={nextWho.who} members={members} />
                <strong>{nextWho.title}</strong>
              </div>
              <span>
                <span className="fam-nowrap">
                  {timeLabel(next.start)}
                  {'\u00a0–\u00a0'}
                  {timeLabel(next.end)}
                </span>
                {nextDetail ? ` · ${nextDetail}` : ''}
              </span>
            </div>
          )}
          {today.length === 0 ? (
            <p className="fam-empty">Dnes nic v kalendáři.</p>
          ) : rest.length === 0 ? null : (
            <ul className="fam-events">
              {rest.map((ev) => {
                const { who, title } = eventWho(ev, members);
                const past = isPast(ev, now);
                return (
                  <li
                    key={ev.id}
                    className="fam-ev"
                    style={srcStyle(ev)}
                    data-testid="family-event"
                    data-past={past || undefined}
                  >
                    {ev.all_day ? (
                      <time data-allday>celý den</time>
                    ) : (
                      <time
                        aria-label={`${timeLabel(ev.start)} až ${timeLabel(ev.end)}`}
                        data-testid="family-event-time"
                      >
                        {timeLabel(ev.start)}
                        <small>{timeLabel(ev.end)}</small>
                      </time>
                    )}
                    <i />
                    <div className="fam-ev-t">
                      <Who ids={who} members={members} />
                      <div>
                        <b>{title}</b>
                        {(ev.location || ev.description) && (
                          <p className="fam-detail" data-testid="family-event-detail">
                            {[ev.location, ev.description].filter(Boolean).join(' · ')}
                          </p>
                        )}
                        {past && <p className="fam-detail fam-ev-past-note">Proběhlo</p>}
                      </div>
                    </div>
                    {ev.kind === 'school' ? <SchoolTag ev={ev} /> : <span />}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
      {snap.errors.length > 0 && (
        <p className="fam-err">Některý kalendář nebo seznam je teď nedostupný.</p>
      )}
    </Card>
  );
}

function WeekCard({ snap, now, members }: { snap: FamilySnapshot; now: Date; members: Member[] }) {
  if (snap.calendars.length === 0) return null;
  return (
    <Card className="fam-card" data-testid="family-week">
      <div className="fam-card-h">
        <h2>Příštích 7 dní</h2>
        <Legend snap={snap} />
      </div>
      <div className="fam-days">
        {nextDays(snap.events, now).map((day) => (
          <div className="fam-day" key={day.key} data-testid="family-day">
            <div>
              <b>{day.day}</b>
              <small>{day.date}</small>
            </div>
            {day.events.length ? (
              <ul>
                {day.events.map((ev) => {
                  const { who, title } = eventWho(ev, members);
                  return (
                    <li
                      key={ev.id}
                      style={srcStyle(ev)}
                      data-allday={ev.all_day || undefined}
                      data-testid="family-week-event"
                    >
                      <span className="fam-wk-time">
                        {ev.all_day ? 'celý den' : timeLabel(ev.start)}
                      </span>
                      <i aria-hidden="true" />
                      <span className="fam-wk-t">
                        <Who ids={who} members={members} />
                        <em>
                          {title}
                          {ev.kind === 'school' && (
                            <>
                              {'\u00a0'}
                              <span
                                className="fam-wk-school"
                                title="Škola"
                                data-testid="family-school-cap"
                              >
                                <Icon name="school" size={16} label="Škola" />
                              </span>
                            </>
                          )}
                        </em>
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="fam-free">Nic v plánu</p>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

interface Actions {
  claim(kid: string, chore: string): void;
  busy: string | null;
  onPoints?: () => void;
  onAdd?: () => void;
  onMenu?: (kid: string, chore: string) => void;
  onGive?: (kid: string, chore: string) => void;
}

type ChoreRow = FamilyKid['chores'][number];

/**
 * Today's row the viewer can still act on (tick off / hand over): every such row – and only
 * such rows – can offer a transfer action. The adult menu also supports chore management.
 */
export function isActionableChore(c: ChoreRow | null | undefined): boolean {
  return (
    !!c &&
    (c.state === 'todo' || c.state === 'overdue') &&
    c.swap_today?.kind !== 'pending_give' &&
    c.swap_today?.kind !== 'transferred_out'
  );
}

/** A chore the viewer can hand over / reassign for today (the only „⋯“ action). */
export function canTransferChore(c: ChoreRow | null | undefined): boolean {
  return (
    !!c?.can_request_swap &&
    c.state !== 'done' &&
    c.state !== 'claimed' &&
    c.swap_today?.kind !== 'pending_give' &&
    c.swap_today?.kind !== 'transferred_out'
  );
}

/** Handover tag – the same small tag for „Předáno“ and „Převzato“ (rows and kiosk). */
function SwapTag({ swap }: { swap: NonNullable<ChoreRow['swap_today']> }) {
  const text =
    swap.kind === 'transferred_out'
      ? handedToLabel(swap.partner_name)
      : takenFromLabel(swap.partner_name);
  return (
    <span className="fam-swap-tag" data-testid="family-swap-note" data-kind={swap.kind}>
      <Icon name="swap" size={14} />
      {text}
    </span>
  );
}

/** Pending: one short single-line pill (icon says which kind); deadline is its own meta. */
function PendingPill({ kind }: { kind: 'swap' | 'completion' }) {
  return (
    <Pill
      size="sm"
      tone="warn"
      icon={<Icon name={kind === 'swap' ? 'swap' : 'clock'} size={14} />}
      data-testid="family-pending-pill"
      data-pending={kind}
      data-status="pending"
      className="fam-pending-pill"
    >
      {kind === 'swap' ? 'Předání čeká na schválení' : 'Splnění čeká na schválení'}
    </Pill>
  );
}

function ChoreMeta({ c, note }: { c: ChoreRow; note: { text: string; tone?: 'warn' | 'crit' } }) {
  const swap = c.swap_today;
  const deadline =
    note.text && c.state !== 'claimed' && c.state !== 'done' ? (
      <small data-tone={note.tone} className="fam-due">
        {note.text.replace(/^Do /, 'do ')}
      </small>
    ) : null;
  if (swap?.kind === 'transferred_out')
    return (
      <div className="fam-chore-meta">
        <SwapTag swap={swap} />
      </div>
    );
  const pending =
    swap?.kind === 'pending_give' ? 'swap' : c.state === 'claimed' ? 'completion' : null;
  if (!pending && !deadline && !swap) return null;
  // Deadline always first (same place in every row), then the status chips.
  return (
    <div className="fam-chore-meta">
      {deadline}
      {pending && <PendingPill kind={pending} />}
      {swap?.kind === 'transferred_in' && <SwapTag swap={swap} />}
    </div>
  );
}

/** Chore name of the last created chore, highlighted (and scrolled to) once it shows up. */
export interface Highlight {
  name: string;
  kids: string[];
}

const UPCOMING_COMPACT = 3;

/** „Vícekrát denně“ creates „<name> (12:00)“, „<name> (19:00)“: highlight all of them. */
const isHighlighted = (name: string, highlight?: string | null) =>
  !!highlight && (name === highlight || name.startsWith(`${highlight} (`));

/**
 * Planned chores of the next days: a calm, read-only list under today's actionable rows
 * (Rodina ticks off only today's chores). Kiosk and the child's view keep today first and
 * show at most three rows.
 */
function UpcomingList({
  kid,
  now,
  compact,
  line,
  highlight,
  onMenu,
}: {
  kid: FamilyKid;
  now: Date;
  compact?: boolean;
  /** Kiosk: a single summary line. */
  line?: boolean;
  onMenu?: Actions['onMenu'];
  highlight?: string | null;
}) {
  const all = kid.upcoming ?? [];
  if (!all.length) return null;
  // Kiosk: the chores card has a fixed height, so the plan is one line under today's rows.
  if (line) return <UpcomingLine chores={all} now={now} />;
  const rows = compact ? all.slice(0, UPCOMING_COMPACT) : all;
  const more = all.length - rows.length;
  return (
    <section
      className="fam-upcoming"
      data-testid="family-upcoming"
      data-compact={compact || undefined}
      aria-label={`Naplánované úkoly: ${kid.name}`}
    >
      <h3 className="fam-list-h fam-upcoming-h" data-testid="family-upcoming-h">
        <Icon name="calendar" size={14} />
        Naplánované · {czCount(all.length, 'úkol', 'úkoly', 'úkolů')}
        <small data-testid="family-upcoming-count">· další dny</small>
      </h3>
      <ul>
        {rows.map((c) => {
          const when = upcomingParts(c.due, now);
          return (
            <li
              key={c.id}
              className="fam-upcoming-row"
              data-testid="family-upcoming-chore"
              data-group={c.group}
              data-highlight={isHighlighted(c.name, highlight) || undefined}
            >
              {/* Same lead column as today's tick boxes, so the titles share one left edge. */}
              <span className="fam-upcoming-lead" aria-hidden="true">
                <Icon name="calendar" size={16} />
              </span>
              <span className="fam-upcoming-t">
                {onMenu && c.management ? (
                  <button
                    type="button"
                    className="fam-chore-detail fam-upcoming-name"
                    onClick={() => onMenu(kid.id, c.id)}
                  >
                    {c.name}
                  </button>
                ) : (
                  <span className="fam-upcoming-name">{c.name}</span>
                )}
                <small className="fam-upcoming-meta">
                  <span className="fam-upcoming-when" data-testid="family-upcoming-day">
                    {when.day}
                  </span>
                  {when.time && <span className="fam-upcoming-time">{` · do ${when.time}`}</span>}
                </small>
              </span>
              {c.points != null && <Pts className="fam-upcoming-pts" value={c.points} />}
              {onMenu && c.management && (
                <Button
                  variant="ghost"
                  className="fam-overflow"
                  icon={<Icon name="more" size={22} />}
                  aria-label={`Další akce: ${c.name}`}
                  data-testid="family-upcoming-menu"
                  onClick={() => onMenu(kid.id, c.id)}
                />
              )}
            </li>
          );
        })}
      </ul>
      {more > 0 && (
        <p className="fam-upcoming-more">a {czCount(more, 'další', 'další', 'dalších')}</p>
      )}
    </section>
  );
}

/**
 * Kiosk plan line: whole items only. Items that do not fit the line are hidden and counted
 * in „a N další“ – never an ellipsis in the middle of a word.
 */
const capFirst = (s: string) => s.charAt(0).toLocaleUpperCase('cs') + s.slice(1);

/**
 * Row points as a narrow two-line column („+3“ over „body“), so long status chips keep
 * their room; the text stays „+3\u00a0body“ for tests and screen readers.
 */
function Pts({ value, className }: { value: number | null; className: string }) {
  if (value === null) return null;
  const [num, word] = pointsLabel(value).split('\u00a0');
  return (
    <span className={className} data-stack>
      <b>{num}</b>
      <span className="hb-sr-only">{'\u00a0'}</span>
      <small>{word}</small>
    </span>
  );
}

function UpcomingLine({ chores, now }: { chores: NonNullable<FamilyKid['upcoming']>; now: Date }) {
  const boxRef = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(chores.length);
  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const fit = () => {
      const items = [...box.querySelectorAll<HTMLElement>('.fam-upcoming-item')];
      items.forEach((el) => el.removeAttribute('data-hidden'));
      const more = box.querySelector<HTMLElement>('.fam-upcoming-more-inline');
      more?.removeAttribute('hidden');
      const limit = box.getBoundingClientRect().right;
      // While the counter is not rendered yet, keep room for it („a 3 další“ ≈ 90 px at 18 px).
      const reserve = more ? 0 : 100;
      let n = items.length;
      if (items.some((el) => el.getBoundingClientRect().right > limit + 0.5)) {
        n = items.findIndex((el) => el.getBoundingClientRect().right > limit - reserve);
        if (n < 0) n = items.length;
      }
      items.forEach((el, i) => (i >= n ? el.setAttribute('data-hidden', '') : null));
      setShown(n);
    };
    fit();
    let frame = 0;
    // Refit on the next frame: hiding items inside the callback would loop the observer.
    const ro =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(fit);
          });
    ro?.observe(box);
    // The item box shrink-wraps its items; the line itself tells when there is more room.
    if (box.parentElement) ro?.observe(box.parentElement);
    return () => {
      cancelAnimationFrame(frame);
      ro?.disconnect();
    };
  }, [chores, now]);
  const hidden = chores.length - shown;
  return (
    <p className="fam-upcoming fam-upcoming-line" data-testid="family-upcoming" data-compact="line">
      <Icon name="calendar" size={14} />
      {/* „Zítra: …“ already says it is planned; the label stays for screen readers. */}
      <span className="hb-sr-only">Naplánované: </span>
      <span ref={boxRef} className="fam-upcoming-items">
        {chores.map((c) => (
          <span key={c.id} className="fam-upcoming-item" data-testid="family-upcoming-item">
            {`${capFirst(upcomingParts(c.due, now, { short: true }).day)}: ${c.name}`}
          </span>
        ))}
      </span>
      {hidden > 0 && (
        <span className="fam-upcoming-more-inline" data-testid="family-upcoming-more">
          a {czCount(hidden, 'další', 'další', 'dalších')}
        </span>
      )}
    </p>
  );
}

function KidCard({
  kid,
  color,
  now,
  act,
  compact,
  collapseDone,
  collapsible,
  self,
  members,
  highlight,
}: {
  kid: FamilyKid;
  color: string;
  /** Name of a just-created chore to highlight. */
  highlight?: string | null;
  now: Date;
  act: Actions;
  /** Kiosk: finished chores fold into one static „Hotovo: N“ line so the card fits the screen. */
  compact?: boolean;
  /** Phone: finished chores fold into an expandable „Hotovo: N“ line (shorter page). */
  collapseDone?: boolean;
  /** Parent views: the kid section folds via its header (default expanded). */
  collapsible?: boolean;
  /** Child's own view: the card header already names the viewer. */
  self?: boolean;
  members: Member[];
}) {
  const [open, setOpen] = useState(true);
  const [showDone, setShowDone] = useState(false);
  const bodyId = useId();
  const active = kid.chores.filter((c) => c.counts_today !== false);
  const t = choreTally(active.length ? active : kid.chores);
  const sorted = sortChores(kid.chores);
  const fold = compact || (collapseDone && !showDone);
  const doneRows = sorted.filter((c) => c.state === 'done');
  const rows = fold ? sorted.filter((c) => c.state !== 'done') : sorted;
  const progress = t.total ? `${formatOutOf(t.done, t.total)} hotovo` : 'Dnes nic';
  // Every row reserves the same trailing slot (menu button, done-expander or an empty
  // spacer) whenever any row can have one, so the points column lines up in each list.
  const menuSlot = !!act.onMenu || !!act.onGive || (!!collapseDone && !compact);
  const head = (
    <>
      {!self && (
        <span className="fam-avatar" aria-hidden="true" data-testid="family-kid-avatar">
          {kid.name.slice(0, 1)}
        </span>
      )}
      <div>
        <b>{self ? progress : kid.name}</b>
        {!self && <small>{progress}</small>}
      </div>
      {kid.points !== null && (
        <div className="fam-points" data-testid="family-points">
          <strong data-testid="family-today-points">
            {pointsLabel(kid.points_today ?? t.earned)}
          </strong>
          <small>dnes</small>
        </div>
      )}
    </>
  );
  return (
    <article
      className="fam-kid"
      style={{ '--fam-kid': color } as React.CSSProperties}
      data-testid="family-kid"
      data-kid={kid.id}
      data-collapsed={(collapsible && !open) || undefined}
    >
      {collapsible ? (
        <button
          type="button"
          className="fam-kid-h fam-kid-toggle"
          aria-expanded={open}
          aria-controls={bodyId}
          data-testid="family-kid-toggle"
          onClick={() => setOpen((v) => !v)}
        >
          {head}
          <span className="fam-kid-chev" aria-hidden="true">
            <Icon name="chevron" size={18} />
          </span>
        </button>
      ) : (
        <div className="fam-kid-h">{head}</div>
      )}
      {t.total > 0 && (
        <div
          className="fam-bar"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={t.total}
          aria-valuenow={t.done}
          aria-label={`${kid.name}: hotovo ${formatOutOf(t.done, t.total)}`}
        >
          <i style={{ width: `${(t.done / t.total) * 100}%` }} />
          <i
            data-pending
            data-status="pending"
            style={{ width: `${(t.pending / t.total) * 100}%` }}
          />
        </div>
      )}
      {/* Handover waiting is shown on its own row only (no second pill here). */}
      {t.waiting > 0 && (
        <div className="fam-kid-pending" data-testid="family-kid-pending">
          {t.waiting > 0 && (
            <span
              className="fam-wait-chip"
              data-tone="warn"
              data-status="pending"
              data-testid="family-pending-points"
            >
              <Icon name="clock" size={14} />
              {pointsLabel(t.waiting)} {czPlural(t.waiting, 'čeká', 'čekají', 'čeká')} na schválení
            </span>
          )}
        </div>
      )}
      <div id={bodyId} className="fam-kid-body" hidden={collapsible && !open}>
        {((kid.points !== null && act.onPoints) || act.onAdd) && (
          <div className="fam-kid-tools">
            {kid.points !== null && act.onPoints && (
              <button
                type="button"
                className="fam-total-link"
                data-testid="family-total"
                onClick={act.onPoints}
              >
                celkem {pointsAmount(Math.round(kid.points))}
                <Icon name="chevron" size={16} />
              </button>
            )}
            {act.onAdd && (
              <Button
                size="sm"
                variant="secondary"
                className="fam-add-chore-btn"
                icon={<Icon name="plus" size={18} />}
                data-testid="family-add-chore"
                aria-label={`Přidat úkol: ${kid.name}`}
                onClick={act.onAdd}
              >
                Úkol
              </Button>
            )}
          </div>
        )}
        {!compact && (rows.length > 0 || doneRows.length > 0) && (
          <h3 className="fam-list-h" data-testid="family-today-h">
            Dnes
          </h3>
        )}
        <ul className="fam-chores">
          {rows.map((c) => {
            const note = choreNote(c, now, { parentApproves: !c.can_approve });
            const ui = c.state === 'overdue' ? 'todo' : c.state;
            const key = `${kid.id}/${c.id}`;
            const out = c.swap_today?.kind === 'transferred_out';
            const partner = out
              ? members.find((m) => m.name === c.swap_today?.partner_name)
              : undefined;
            const showMenu = act.onMenu && (c.management || isActionableChore(c));
            const showGive = act.onGive && canTransferChore(c);
            const nameId = `${bodyId}-${c.id}`;
            return (
              <li
                key={c.id}
                className="fam-chore"
                data-state={ui}
                data-muted={out || undefined}
                data-swap={c.swap_today?.kind}
                data-highlight={isHighlighted(c.name, highlight) || undefined}
                data-testid="family-chore"
              >
                {out ? (
                  <span
                    className="fam-avatar fam-avatar-sm fam-handed-avatar"
                    style={
                      partner ? ({ '--fam-kid': partner.color } as React.CSSProperties) : undefined
                    }
                    data-testid="family-handed-avatar"
                    aria-hidden="true"
                  >
                    {(c.swap_today?.partner_name ?? '?').slice(0, 1)}
                  </span>
                ) : (
                  <button
                    type="button"
                    className="fam-check"
                    data-testid="family-chore-check"
                    disabled={!c.can_claim || act.busy === key}
                    aria-label={
                      c.can_claim
                        ? `Hotovo: ${c.name}`
                        : `${c.name}: ${note.text || (c.state === 'done' ? 'hotovo' : '')}`
                    }
                    onClick={() => act.claim(kid.id, c.id)}
                  >
                    <Check />
                  </button>
                )}
                <div className="fam-chore-t">
                  <b id={nameId}>
                    {act.onMenu && c.management ? (
                      <button
                        type="button"
                        className="fam-chore-detail"
                        onClick={() => act.onMenu?.(kid.id, c.id)}
                      >
                        {c.name}
                      </button>
                    ) : (
                      c.name
                    )}
                  </b>
                  <ChoreMeta c={c} note={note} />
                </div>
                {out ? (
                  // Handed to the sibling: the points go with the chore, not counted twice.
                  <span className="fam-pts" data-out data-testid="family-pts-out">
                    <s aria-hidden="true">{pointsLabel(c.points)}</s>
                    <span aria-hidden="true">→&nbsp;{c.swap_today?.partner_name ?? '?'}</span>
                    <span className="hb-sr-only">
                      {`Body dostane ${c.swap_today?.partner_name ?? 'sourozenec'}`}
                    </span>
                  </span>
                ) : (
                  <Pts className="fam-pts" value={c.points} />
                )}
                {menuSlot && (
                  <span className="fam-menu-slot" data-testid="family-menu-slot">
                    {showGive && (
                      <Button
                        variant="ghost"
                        className="fam-overflow"
                        icon={<Icon name="swap" size={22} />}
                        data-testid="family-chore-give"
                        aria-label="Předat na dnes"
                        aria-describedby={nameId}
                        onClick={() => act.onGive?.(kid.id, c.id)}
                      />
                    )}
                    {showMenu && (
                      <Button
                        variant="ghost"
                        className="fam-overflow"
                        icon={<Icon name="more" size={22} />}
                        data-testid="family-chore-menu"
                        aria-label="Další akce"
                        aria-describedby={nameId}
                        onClick={() => act.onMenu?.(kid.id, c.id)}
                      />
                    )}
                  </span>
                )}
              </li>
            );
          })}
          {fold && doneRows.length > 0 && (
            <li className="fam-chore fam-done-sum" data-testid="family-done-summary">
              <span className="fam-done-sum-i" aria-hidden="true">
                <Check />
              </span>
              <div className="fam-chore-t">
                <b>Hotovo: {doneRows.length}</b>
                <div className="fam-chore-meta">
                  <small>{doneRows.map((c) => c.name).join(' · ')}</small>
                </div>
              </div>
              <Pts
                className="fam-pts"
                value={doneRows.reduce((sum, c) => sum + (c.points ?? 0), 0)}
              />
              {menuSlot && (
                <span className="fam-menu-slot" data-testid="family-menu-slot">
                  {collapseDone && !compact && (
                    <button
                      type="button"
                      className="fam-done-more"
                      aria-expanded={false}
                      data-testid="family-done-expand"
                      onClick={() => setShowDone(true)}
                    >
                      <span className="hb-sr-only">Ukázat hotové úkoly</span>
                      <Icon name="chevron" size={18} />
                    </button>
                  )}
                </span>
              )}
            </li>
          )}
        </ul>
        <UpcomingList
          kid={kid}
          now={now}
          compact={compact || self}
          line={compact}
          highlight={highlight}
          onMenu={act.onMenu}
        />
      </div>
    </article>
  );
}

function ChoresCard({
  snap,
  now,
  act,
  members,
  onAdd,
  onApproval,
  kidAct,
  phone,
  highlight,
}: {
  snap: FamilySnapshot;
  now: Date;
  act: Actions;
  members: Member[];
  phone?: boolean;
  highlight?: Highlight | null;
  onAdd: (kid: FamilyKid) => void;
  kidAct: (kid: FamilyKid) => Actions;
  onApproval: {
    approveCompletion: (item: import('../types.js').FamilyApproval) => void;
    rejectCompletion: (item: import('../types.js').FamilyApproval) => void;
    approveSwap: (item: import('../types.js').FamilyApproval) => void;
    rejectSwap: (item: import('../types.js').FamilyApproval) => void;
  };
}) {
  const approvals = useApprovals(snap);
  if (snap.kids.length === 0) return null;
  const waiting = approvals.length;
  const parent = snap.role === 'owner' || snap.role === 'adult';
  const child = snap.role === 'child';
  const viewer = child && snap.kids.length === 1 ? snap.kids[0]! : null;
  const viewerColor = viewer
    ? (members.find((m) => m.id === viewer.id)?.color ?? KID_COLORS[0]!)
    : '';
  return (
    <Card className="fam-card" data-testid="family-chores">
      <div className="fam-card-h">
        <h2>{child ? 'Moje povinnosti' : 'Povinnosti dětí'}</h2>
        {viewer && (
          <span
            className="fam-viewer"
            data-testid="family-viewer"
            style={{ '--fam-kid': viewerColor } as React.CSSProperties}
          >
            <span className="fam-avatar fam-avatar-sm" aria-hidden="true">
              {viewer.name.slice(0, 1)}
            </span>
            {viewer.name}
          </span>
        )}
        {waiting > 0 && (
          <span
            className="fam-meta"
            data-tone="warn"
            data-status="pending"
            data-testid="family-pending-badge"
          >
            {czCount(waiting, 'čeká na schválení', 'čekají na schválení', 'čeká na schválení')}
          </span>
        )}
      </div>
      {parent && (
        <ApprovalsBlock
          kids={snap.kids}
          colors={Object.fromEntries(members.map((m) => [m.id, m.color]))}
          items={approvals}
          busy={act.busy}
          onApproveCompletion={onApproval.approveCompletion}
          onRejectCompletion={onApproval.rejectCompletion}
          onApproveSwap={onApproval.approveSwap}
          onRejectSwap={onApproval.rejectSwap}
        />
      )}
      <div className="fam-kids">
        {snap.kids.map((kid, i) => (
          <KidCard
            key={kid.id}
            kid={kid}
            color={members[i]?.color ?? KID_COLORS[0]!}
            now={now}
            compact={snap.role === 'kiosk'}
            collapseDone={parent && phone}
            collapsible={parent}
            self={!!viewer}
            members={members}
            highlight={highlight?.kids.includes(kid.kid_uuid ?? kid.id) ? highlight.name : null}
            act={{
              ...kidAct(kid),
              onAdd: snap.capabilities?.can_create_chore && parent ? () => onAdd(kid) : undefined,
            }}
          />
        ))}
      </div>
    </Card>
  );
}

function ShoppingCard({
  snap,
  onAdd,
  onToggle,
  busy,
}: {
  snap: FamilySnapshot;
  onAdd(s: string): Promise<void>;
  onToggle(uid: string, done: boolean): void;
  busy: string | null;
}) {
  const [text, setText] = useState('');
  if (!snap.shopping) return null;
  const open = snap.shopping.items.filter((i) => !i.done);
  const done = snap.shopping.items.filter((i) => i.done);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const value = text.trim();
    if (!value) return;
    await onAdd(value);
    setText('');
  };
  const row = (i: (typeof open)[number]) => (
    <li
      key={i.uid}
      className="fam-item"
      data-done={i.done || undefined}
      data-testid="family-shop-item"
    >
      <button
        type="button"
        className="fam-box"
        data-testid="family-shop-toggle"
        disabled={busy === i.uid}
        aria-label={i.done ? `Vrátit: ${i.summary}` : `Koupeno: ${i.summary}`}
        onClick={() => onToggle(i.uid, !i.done)}
      >
        <Check />
      </button>
      <span>{i.summary}</span>
    </li>
  );
  return (
    <Card className="fam-card" data-testid="family-shopping">
      <div className="fam-card-h">
        <h2>Nákup</h2>
        <span className="fam-meta">
          {open.length ? czCount(open.length, 'položka', 'položky', 'položek') : ''}
        </span>
      </div>
      <form className="fam-add" onSubmit={(e) => void submit(e)}>
        <input
          value={text}
          maxLength={120}
          onChange={(e) => setText(e.target.value)}
          placeholder="Přidat položku…"
          aria-label="Nová položka nákupu"
          data-testid="family-shop-input"
        />
        <button type="submit" data-testid="family-shop-add">
          Přidat
        </button>
      </form>
      {open.length === 0 ? (
        <p className="fam-empty">Nic k nákupu</p>
      ) : (
        <ul className="fam-items">{open.map(row)}</ul>
      )}
      {done.length > 0 && (
        <>
          <p className="fam-done-h">Koupeno · {done.length}</p>
          <ul className="fam-items">{done.slice(0, 6).map(row)}</ul>
        </>
      )}
    </Card>
  );
}

export default function FamilyView({ connection, kiosk }: ModuleViewProps) {
  const api = useMemo(() => getFamilyApi(connection), [connection]);
  const people = usePeople(connection);
  const [snap, setSnap] = useState<FamilySnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [clock, setClock] = useState(() => new Date());
  const [pointsKid, setPointsKid] = useState<FamilyKid | null>(null);
  const [addChore, setAddChore] = useState<string | null>(null);
  const [swap, setSwap] = useState<{
    kid: string;
    chore: string;
    mode: 'give' | 'reassign';
  } | null>(null);
  const [menu, setMenu] = useState<{ kid: string; chore: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    kid: string;
    chore: string;
    management: ChoreManagement;
  } | null>(null);
  const [skipBusy, setSkipBusy] = useState(false);
  const skipInFlight = useRef(false);
  const [skipError, setSkipError] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<Highlight | null>(null);
  const phone = usePhone();
  const notify = useToast();

  // A just-created chore: scroll its row into view once the refreshed snapshot has it (once
  // per creation). Closing the sheet goes `history.back()`, whose popstate restores the scroll
  // position from before the sheet opened (two frames later) – so scroll after that restore,
  // with a timeout fallback when no popstate comes.
  const scrolledFor = useRef<Highlight | null>(null);
  useEffect(() => {
    if (!highlight || scrolledFor.current === highlight) return;
    const selector =
      '[data-testid="family-chore"][data-highlight], [data-testid="family-upcoming-chore"][data-highlight]';
    if (!document.querySelector(selector)) return;
    scrolledFor.current = highlight;
    const host = hostWindow();
    const reveal = () => {
      const frames = (n: number) =>
        n
          ? window.requestAnimationFrame(() => frames(n - 1))
          : document.querySelector<HTMLElement>(selector)?.scrollIntoView?.({ block: 'center' });
      frames(3);
    };
    // No cleanup: a later snapshot/poll must not cancel the pending reveal (it is idempotent
    // and finds nothing once the highlight is gone).
    host.addEventListener('popstate', reveal, { once: true });
    window.setTimeout(reveal, 400);
  }, [highlight, snap]);
  useEffect(() => {
    if (!highlight) return;
    const t = window.setTimeout(() => setHighlight(null), 6000);
    return () => window.clearTimeout(t);
  }, [highlight]);

  useEffect(() => {
    if (!kiosk) return;
    const t = window.setInterval(() => setClock(new Date()), 10_000);
    return () => window.clearInterval(t);
  }, [kiosk]);

  const load = useCallback(async () => {
    if (!api) return;
    try {
      setSnap(await api.get());
      setNow(new Date());
      setError(null);
    } catch {
      setError('Rodinný přehled se nepodařilo načíst.');
    }
  }, [api]);

  useEffect(() => {
    void Promise.resolve().then(load);
    const t = window.setInterval(() => void load(), POLL_MS);
    return () => window.clearInterval(t);
  }, [load]);

  const run = useCallback(
    async (key: string, fn: () => Promise<void>) => {
      setBusy(key);
      try {
        await fn();
        setError(null);
      } catch {
        setError('Změnu se nepodařilo uložit, zkuste to znovu.');
      } finally {
        setBusy(null);
        await load();
      }
    },
    [load],
  );

  if (!api) return <EmptyState title="Rodina">Bez spojení s Home Assistantem.</EmptyState>;
  if (!snap)
    return error ? (
      <ErrorState title="Rodina" onRetry={() => void load()} data-testid="family-error">
        {error}
      </ErrorState>
    ) : (
      <Skeleton
        variant="card"
        lines={4}
        label="Načítám rodinný přehled…"
        data-testid="family-loading"
      />
    );

  const admin = snap.role === 'owner' && !kiosk;
  const parent = !kiosk && (snap.role === 'owner' || snap.role === 'adult');
  const act: Actions = {
    busy,
    claim: (kid, chore) => void run(`${kid}/${chore}`, () => api.claim(kid, chore)),
    onPoints: () => undefined,
    onMenu: parent
      ? (kid, chore) => {
          setSkipError(null);
          setMenu({ kid, chore });
        }
      : undefined,
    onGive:
      !kiosk && snap.role === 'child'
        ? (kid, chore) => setSwap({ kid, chore, mode: 'give' })
        : undefined,
  };
  const makeKidAct = (kid: FamilyKid): Actions => ({
    ...act,
    onPoints: kiosk ? undefined : () => setPointsKid(kid),
  });
  const approvalHandlers = {
    approveCompletion: (item: import('../types.js').FamilyApproval) =>
      void run(`done-${item.kid_id}-${item.chore_id}`, () =>
        api.approve(item.kid_id!, item.chore_id!),
      ),
    rejectCompletion: (item: import('../types.js').FamilyApproval) => void item,
    approveSwap: (item: import('../types.js').FamilyApproval) =>
      item.request_id &&
      void run(`swap-${item.request_id}`, async () => {
        await api.swapDecide(item.request_id!, 'approve', item.revision);
      }),
    rejectSwap: (item: import('../types.js').FamilyApproval) =>
      item.request_id &&
      void run(`swap-${item.request_id}`, async () => {
        await api.swapDecide(item.request_id!, 'reject', item.revision);
      }),
  };
  const members = membersOf(snap).map((member) => ({
    ...member,
    color: (() => {
      const person = people?.find(
        (p) => p.id === member.id || p.id === `person.${member.id}` || p.name === member.name,
      );
      return person ? presenceHex(person.color) : member.color;
    })(),
  }));
  // Calendar ownership resolves against the whole household (a child's snapshot only lists itself).
  const calendarMembers: Member[] = [
    ...members,
    ...(people ?? [])
      .filter((p) => !members.some((m) => m.name === p.name))
      .map((p) => ({ id: p.id, name: p.name, color: presenceHex(p.color) })),
  ];
  const identityColors = Object.fromEntries([
    ...members.flatMap((member) => [
      [member.id, member.color],
      [member.name, member.color],
    ]),
    ...(people ?? []).map((person) => [person.name, presenceHex(person.color)]),
  ]);
  const slot = (name: string, node: React.ReactNode) => (
    <div className="fam-slot" data-slot={name}>
      {node}
    </div>
  );
  const today = slot(
    'today',
    <TodayCard snap={snap} now={now} admin={admin} members={calendarMembers} />,
  );
  const week = slot('week', <WeekCard snap={snap} now={now} members={calendarMembers} />);
  const chores = slot(
    'chores',
    <ChoresCard
      snap={kiosk ? { ...snap, role: 'kiosk' } : snap}
      now={now}
      act={act}
      members={members}
      onAdd={(kid) => setAddChore(kid.kid_uuid ?? kid.id)}
      kidAct={makeKidAct}
      onApproval={approvalHandlers}
      phone={phone}
      highlight={highlight}
    />,
  );
  const shop = slot(
    'shop',
    <ShoppingCard
      snap={snap}
      busy={busy}
      onAdd={(s) => run('add', () => api.addItem(s))}
      onToggle={(uid, done) => void run(uid, () => api.setItemDone(uid, done))}
    />,
  );
  const menuKid = menu && snap.kids.find((k) => k.id === menu.kid);
  const menuToday = menuKid && menuKid.chores.find((c) => c.id === menu.chore);
  const menuChore = menuToday || (menuKid && menuKid.upcoming?.find((c) => c.id === menu.chore));
  const canTransfer = canTransferChore(menuToday || null);
  const management = menuChore?.management;
  const skipToday = async () => {
    if (!menu || !menuChore?.due || skipInFlight.current) return;
    skipInFlight.current = true;
    setSkipBusy(true);
    setSkipError(null);
    const input = { ...menu, client_request_id: newRequestId() };
    const message = 'Dnešní termín smazán';
    try {
      const result = await api.skipChoreToday({ ...input, expected_due: menuChore.due });
      setMenu(null);
      if (result.can_undo) {
        notify.undo(
          message,
          () => {
            void api
              .skipChoreToday({
                ...menu,
                client_request_id: newRequestId(),
                undo_request_id: input.client_request_id,
              })
              .then(() => {
                notify.success('Dnešní termín obnoven.');
                void load();
              })
              .catch((err: unknown) => {
                notify.error(choreManagementError(err, 'Původní termín se nepodařilo obnovit.'));
              });
          },
          { actionLabel: 'Zpět' },
        );
      } else notify.success(message);
      void load();
    } catch (err) {
      setSkipError(choreManagementError(err, 'Dnešní termín se nepodařilo smazat. Zkus to znovu.'));
    } finally {
      skipInFlight.current = false;
      setSkipBusy(false);
    }
  };
  return (
    <div className="fam" data-kiosk={kiosk || undefined} data-testid="family" data-role={snap.role}>
      <style>{familyStyles}</style>
      <header className="fam-head">
        <h1 className="hb-sr-only">Rodina</h1>
        {kiosk && (
          <time className="fam-clock" data-testid="family-clock">
            {timeLabel(clock.toISOString())}
          </time>
        )}
        <p>{longDate(kiosk ? clock : now)}</p>
        <PresenceStrip people={people} layout="grid" className="fam-presence" />
      </header>
      {error && (
        <p className="fam-err" role="alert">
          {error}
        </p>
      )}
      {kiosk ? (
        <div className="fam-grid">
          <div className="fam-col">
            {today}
            {week}
          </div>
          <div className="fam-col">{chores}</div>
          <div className="fam-col">{shop}</div>
        </div>
      ) : (
        <div className="fam-grid" data-testid="family-grid">
          <div className="fam-col">
            {today}
            {week}
          </div>
          <div className="fam-col">
            {chores}
            {shop}
          </div>
        </div>
      )}
      {pointsKid && api && (
        <PointsSheet kid={pointsKid} api={api} onClose={() => setPointsKid(null)} />
      )}
      {addChore && api && (
        <AddChoreSheet
          kids={snap.kids}
          api={api}
          colors={identityColors}
          initialKid={addChore}
          onClose={() => setAddChore(null)}
          onCreated={(created) => {
            notify.success(`Úkol přidán: ${created.who} · ${created.when}`, {
              id: 'family-chore-created',
              description: created.name,
            });
            setHighlight({ name: created.name, kids: created.assignees });
            void load();
          }}
        />
      )}
      {swap && api && (
        <SwapSheet
          api={api}
          snap={snap}
          choreId={swap.chore}
          kidId={swap.kid}
          colors={identityColors}
          mode={swap.mode}
          onClose={() => setSwap(null)}
          onDone={(name) => {
            if (swap.mode === 'reassign') notify.success(reassignedToLabel(name));
            void load();
          }}
        />
      )}
      {parent && menu && menuChore && (
        <ChoreMenuSheet
          title={menuChore.name}
          onClose={() => {
            if (!skipInFlight.current) setMenu(null);
          }}
        >
          {management && <p className="fam-hint">{management.assignees.join(', ')}</p>}
          <ul className="fam-menu-list">
            {menuToday && !management?.one_off && (
              <li>
                <Button
                  variant="ghost"
                  disabled={!canTransfer || skipBusy}
                  onClick={() => {
                    setSwap({ kid: menu.kid, chore: menu.chore, mode: 'reassign' });
                    setMenu(null);
                  }}
                >
                  Přeřadit na dnes…
                </Button>
              </li>
            )}
            {management && (
              <>
                {!management.one_off && (
                  <li>
                    <Button
                      variant="ghost"
                      disabled={!management.can_skip || skipBusy}
                      onClick={() => void skipToday()}
                    >
                      Smazat jen dnes
                    </Button>
                  </li>
                )}
                <li>
                  <Button
                    variant="ghost"
                    disabled={skipBusy}
                    onClick={() => {
                      setDeleteTarget({ ...menu, management });
                      setMenu(null);
                    }}
                  >
                    {management.one_off ? 'Smazat úkol' : 'Smazat celou řadu'}
                  </Button>
                </li>
              </>
            )}
          </ul>
          {skipError && (
            <p className="fam-field-err" role="alert">
              {skipError}
            </p>
          )}
          {!management && !canTransfer && (
            <p className="fam-hint">
              {menuToday?.swap_unavailable_reason ?? 'Tento úkol teď nelze předat.'}
            </p>
          )}
        </ChoreMenuSheet>
      )}
      {parent && deleteTarget && (
        <DeleteChoreSheet
          chore={deleteTarget.management}
          onClose={() => setDeleteTarget(null)}
          onDelete={async (seriesIds) => {
            await api.deleteChore({
              client_request_id: newRequestId(),
              kid: deleteTarget.kid,
              chore: deleteTarget.chore,
              ...(seriesIds && { series_ids: seriesIds }),
            });
            notify.success(deleteTarget.management.one_off ? 'Úkol smazán.' : 'Řada smazána.');
            setDeleteTarget(null);
            void load();
          }}
        />
      )}
    </div>
  );
}

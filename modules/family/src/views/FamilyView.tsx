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
  Pill,
  Skeleton,
  czCount,
  czPlural,
  presenceHex,
  toastStore,
  useToast,
} from '@homebrain/ui';
import { getFamilyApi } from '../api.js';
import { choreManagementError } from '../errors.js';
import { newRequestId } from '../uid.js';
import {
  canTransferChore,
  choreNote,
  dayWord,
  transferLabel,
  choreApprovalKind,
  choreTally,
  eventWho,
  formatOutOf,
  pointsAmount,
  isPast,
  longDate,
  nextDays,
  pointsLabel,
  sortChores,
  timeLabel,
  timeRange,
  todayEvents,
  upcomingParts,
} from '../format.js';
import { pendingHandoverLabel, reassignedToLabel } from '../czech.js';
import type {
  ChoreManagement,
  FamilyEvent,
  FamilyKid,
  FamilySnapshot,
  FreeChore,
} from '../types.js';
import { familyStyles } from './familyStyles.js';
import { FreeTasks, PersonsRow, PersonView, personColor } from './PersonView.js';
import { PersonsSettings } from './PersonsSettings.js';
import {
  AddChoreSheet,
  ChoreMenuSheet,
  DeleteChoreSheet,
  ApprovalsBlock,
  PointsSheet,
  SwapSheet,
  swapError,
  useApprovals,
} from './familySheets.js';

const POLL_MS = 60_000;
/** „Udělal jsem“ on a free task: the claim is sent to ChoreOps only after this undo window. */
export const CLAIM_UNDO_MS = 5000;
/** Calendar categories use blue-grey and green, independently of people and approvals. */
export const SRC_COLOR = { family: '#8a9bb8', school: '#54b765' } as const;
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
  (snap.members ?? snap.kids).map((k) => ({
    id: k.id,
    name: k.name,
    color:
      'color' in k
        ? personColor(k.color as number)
        : KID_COLORS[
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

/** Shared (whole-family) event: a neutral house avatar so every title starts at the same x. */
function FamilyAvatar() {
  return (
    <span
      className="fam-avatar fam-avatar-sm fam-avatar-family"
      role="img"
      aria-label="Rodina"
      title="Rodina"
      data-testid="family-avatar-family"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 11.5 12 5l8 6.5" />
        <path d="M6.5 10v8.5h11V10" />
      </svg>
    </span>
  );
}

function CategoryIcon({ kind }: { kind: FamilyEvent['kind'] }) {
  return (
    <span
      className="fam-category-icon"
      data-category={kind}
      role="img"
      aria-label={kind === 'school' ? 'Škola' : 'Rodina'}
    >
      <Icon name={kind === 'school' ? 'school' : 'calendar'} size={20} />
    </span>
  );
}

/** Fixed avatar column of event rows: the person(s) or the family placeholder. */
function EventLead({
  ids,
  members,
  family = true,
}: {
  ids: string[];
  members: Member[];
  family?: boolean;
}) {
  return (
    <span className="fam-ev-lead" data-testid="family-event-lead">
      {ids.length ? <Who ids={ids} members={members} /> : family ? <FamilyAvatar /> : null}
    </span>
  );
}

function Legend({ snap, kiosk }: { snap: FamilySnapshot; kiosk: boolean }) {
  const kinds = (['family', 'school'] as const).filter((k) =>
    snap.calendars.some((c) => c.kind === k),
  );
  if (kinds.length < 2) return null;
  return (
    <span className="fam-legend" data-testid="family-legend">
      {kinds.map((k) => (
        <span key={k} style={{ '--fam-src': SRC_COLOR[k] } as React.CSSProperties}>
          {kiosk && (
            <span aria-hidden="true">
              <CategoryIcon kind={k} />
            </span>
          )}
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
  kiosk,
}: {
  snap: FamilySnapshot;
  now: Date;
  admin: boolean;
  members: Member[];
  kiosk: boolean;
}) {
  const today = todayEvents(snap.events, now);
  const next = today.find((event) => !event.all_day && new Date(event.start) > now);
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
          {today.length === 0 ? (
            <p className="fam-empty">Dnes nic v kalendáři.</p>
          ) : (
            <ul className="fam-events">
              {today.map((ev) => {
                const { who, title } = eventWho(ev, members);
                const past = isPast(ev, now);
                const running = !ev.all_day && !past && new Date(ev.start) <= now;
                return (
                  <li
                    key={ev.id}
                    className="fam-ev"
                    style={srcStyle(ev)}
                    data-testid="family-event"
                    data-past={past || undefined}
                    data-running={running || undefined}
                    data-next={ev.id === next?.id || undefined}
                  >
                    {ev.all_day ? (
                      <time data-allday>celý den</time>
                    ) : (
                      <time
                        aria-label={`${timeLabel(ev.start)} až ${timeLabel(ev.end)}${past ? ', proběhlo' : ''}`}
                        data-testid="family-event-time"
                      >
                        {timeRange(ev)}
                      </time>
                    )}
                    {!kiosk && <i />}
                    <div className="fam-ev-t">
                      {!kiosk && <EventLead ids={who} members={members} />}
                      <div className="fam-ev-copy">
                        {kiosk && ev.kind === 'school' && (
                          <span className="fam-school-bar" role="img" aria-label="Škola" />
                        )}
                        <b title={kiosk ? title : undefined}>{title}</b>
                        {(running || ev.id === next?.id) && (
                          <span
                            className="fam-event-state"
                            data-kind={running ? 'now' : 'next'}
                            data-testid="family-event-state"
                          >
                            {running ? 'teď' : 'další'}
                          </span>
                        )}
                        {(ev.location || ev.description) && (
                          <p className="fam-detail" data-testid="family-event-detail">
                            {[ev.location, ev.description].filter(Boolean).join(' · ')}
                          </p>
                        )}
                      </div>
                    </div>
                    {kiosk && <EventLead ids={who} members={members} />}
                    {!kiosk && ev.kind === 'school' && <SchoolTag ev={ev} />}
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

function WeekCard({
  snap,
  now,
  members,
  kiosk,
}: {
  snap: FamilySnapshot;
  now: Date;
  members: Member[];
  kiosk: boolean;
}) {
  if (snap.calendars.length === 0) return null;
  return (
    <Card className="fam-card" data-testid="family-week">
      <div className="fam-card-h">
        <h2>Příštích 7 dní</h2>
        <Legend snap={snap} kiosk={kiosk} />
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
                      {!kiosk && <i aria-hidden="true" />}
                      <span className="fam-wk-t">
                        {!kiosk && <EventLead ids={who} members={members} family={false} />}
                        {kiosk && ev.kind === 'school' && (
                          <span className="fam-school-bar" role="img" aria-label="Škola" />
                        )}
                        {!kiosk && ev.kind === 'school' && (
                          <span
                            className="fam-wk-school"
                            title="Škola"
                            data-testid="family-school-cap"
                          >
                            <Icon name="school" size={16} label="Škola" />
                          </span>
                        )}
                        <em title={kiosk ? title : undefined}>{title}</em>
                      </span>
                      {kiosk && <EventLead ids={who} members={members} family={false} />}
                    </li>
                  );
                })}
              </ul>
            ) : kiosk ? (
              <ul>
                <li className="fam-week-empty">
                  <span className="fam-free">Nic v plánu</span>
                </li>
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
const KIOSK_CHORE_LIMIT = 3;

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

/** Handover tag – the same small tag for „Předáno“ and „Převzato“ (rows and kiosk). */
function SwapTag({
  swap,
  now = new Date(),
}: {
  swap: NonNullable<ChoreRow['swap_today']>;
  now?: Date;
}) {
  const text = transferLabel(swap, now);
  return (
    <span className="fam-swap-tag" data-testid="family-swap-note" data-kind={swap.kind}>
      {text.replace(/ · jen dnes$/u, '')}
    </span>
  );
}

/** Pending: one short single-line pill (icon says which kind); deadline is its own meta. */
function PendingPill({ kind, recipient }: { kind: 'swap' | 'completion'; recipient?: string }) {
  if (kind === 'swap') {
    return (
      <small
        className="fam-handover-pending"
        data-testid="family-pending-pill"
        data-pending="swap"
        data-status="pending"
      >
        {pendingHandoverLabel(recipient)}
      </small>
    );
  }
  return (
    <Pill
      size="sm"
      tone="warn"
      icon={<Icon name="clock" size={14} />}
      data-testid="family-pending-pill"
      data-pending={kind}
      data-status="pending"
      className="fam-pending-pill"
    >
      Čeká na schválení
    </Pill>
  );
}

function ChoreMeta({ c, note }: { c: ChoreRow; note: { text: string; tone?: 'warn' | 'crit' } }) {
  const swap = c.swap_today;
  const deadline =
    note.text && note.tone !== 'warn' ? (
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
  const pending = choreApprovalKind(c);
  if (!pending && !deadline && !swap) return null;
  // Deadline always first (same place in every row), then the status chips.
  return (
    <div className="fam-chore-meta">
      {deadline}
      {pending && <PendingPill kind={pending} recipient={swap?.partner_name} />}
      {(swap?.kind === 'transferred_in' || swap?.kind === 'transfer_failed') && (
        <SwapTag swap={swap} />
      )}
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
  kiosk,
  highlight,
  onMenu,
  onGive,
}: {
  kid: FamilyKid;
  now: Date;
  compact?: boolean;
  kiosk?: boolean;
  onMenu?: Actions['onMenu'];
  onGive?: Actions['onGive'];
  highlight?: string | null;
}) {
  const all = kid.upcoming ?? [];
  if (!all.length) return null;
  const rows = kiosk ? all.slice(0, 1) : compact ? all.slice(0, UPCOMING_COMPACT) : all;
  const more = all.length - rows.length;
  return (
    <section
      className="fam-upcoming"
      data-testid="family-upcoming"
      data-compact={kiosk ? 'kiosk' : compact || undefined}
      aria-label={`Naplánované úkoly: ${kid.name}`}
    >
      <h3
        className={kiosk ? 'hb-sr-only' : 'fam-list-h fam-upcoming-h'}
        data-testid="family-upcoming-h"
      >
        <Icon name="calendar" size={14} />
        Naplánované · {czCount(all.length, 'úkol', 'úkoly', 'úkolů')}
        <small data-testid="family-upcoming-count">· další dny</small>
      </h3>
      <ul>
        {rows.map((c) => {
          const when = upcomingParts(c.due, now, kiosk ? { short: true } : undefined);
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
                <Icon name="calendar" size={28} />
              </span>
              <span className="fam-upcoming-t">
                {onMenu && (c.management || canTransferChore(c)) ? (
                  <button
                    type="button"
                    className="fam-chore-detail fam-upcoming-name"
                    onClick={() => onMenu(kid.id, c.id)}
                  >
                    {c.name}
                  </button>
                ) : (
                  <span className="fam-upcoming-name">
                    {kiosk ? `${capFirst(when.day)}: ${c.name}` : c.name}
                  </span>
                )}
                {!kiosk && c.swap_today && <SwapTag swap={c.swap_today} now={now} />}
                {!kiosk && (
                  <small className="fam-upcoming-meta">
                    <span className="fam-upcoming-when" data-testid="family-upcoming-day">
                      {when.day}
                    </span>
                    {when.time && <span className="fam-upcoming-time">{` · do ${when.time}`}</span>}
                  </small>
                )}
              </span>
              <Pts className="fam-upcoming-pts" value={c.points} />
              {onMenu && (c.management || canTransferChore(c)) ? (
                <span className="fam-menu-slot">
                  <Button
                    variant="ghost"
                    className="fam-overflow"
                    icon={<Icon name="more" size={22} />}
                    aria-label={`Další akce: ${c.name}`}
                    data-testid="family-upcoming-menu"
                    onClick={() => onMenu(kid.id, c.id)}
                  />
                </span>
              ) : onGive && canTransferChore(c) ? (
                <Button
                  variant="ghost"
                  className="fam-overflow"
                  icon={<Icon name="swap" size={20} />}
                  data-testid="family-upcoming-give"
                  aria-label={`Předat: ${c.name}`}
                  title="Předat…"
                  onClick={() => onGive(kid.id, c.id)}
                />
              ) : (
                !kiosk && <span className="fam-menu-slot" aria-hidden="true" />
              )}
            </li>
          );
        })}
      </ul>
      {!kiosk && more > 0 && (
        <p className="fam-upcoming-more" data-testid="family-upcoming-more">
          a {more} další
        </p>
      )}
    </section>
  );
}

const capFirst = (s: string) => s.charAt(0).toLocaleUpperCase('cs') + s.slice(1);

/**
 * Keep a shared trailing column, including tasks with no points.
 */
function Pts({ value, className }: { value: number | null; className: string }) {
  return <span className={className}>{pointsLabel(value)}</span>;
}

function OverflowChip({
  label,
  testId,
  onClick,
  pending,
  context,
  expanded,
  controls,
}: {
  label: string;
  testId: string;
  onClick(): void;
  pending?: number;
  context?: string;
  expanded?: boolean;
  controls?: string;
}) {
  const pendingLabel = pending ? czCount(pending, 'čeká', 'čekají', 'čeká') : '';
  return (
    <button
      type="button"
      className="fam-overflow-chip"
      data-testid={testId}
      aria-label={context ? [label, pendingLabel, context].filter(Boolean).join(' · ') : undefined}
      aria-expanded={expanded}
      aria-controls={controls}
      onClick={onClick}
    >
      <span>
        {label}
        {pendingLabel && (
          <>
            {' · '}
            <span data-status="pending">{pendingLabel}</span>
          </>
        )}
      </span>
      <Icon name="chevron" size={18} />
    </button>
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
  highlight,
  onPerson,
}: {
  kid: FamilyKid;
  onPerson?: () => void;
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
}) {
  const [open, setOpen] = useState(true);
  const [showDone, setShowDone] = useState(false);
  const bodyId = useId();
  const active = kid.chores.filter(
    (c) => c.counts_today !== false && c.swap_today?.kind !== 'transferred_out',
  );
  const t = choreTally(active);
  const sorted = sortChores(compact ? active : kid.chores);
  const fold = compact || (collapseDone && !showDone);
  const doneRows = sorted.filter((c) => c.state === 'done');
  const remaining = fold ? sorted.filter((c) => c.state !== 'done') : sorted;
  const rows = compact && onPerson ? remaining.slice(0, KIOSK_CHORE_LIMIT) : remaining;
  const hidden = remaining.slice(rows.length);
  const hiddenPending = hidden.filter(choreApprovalKind).length;
  const progress = t.total ? `${formatOutOf(t.done, t.total)} hotovo` : 'Dnes nic';
  // Every row reserves the same trailing slot (menu button, done-expander or an empty
  // spacer) whenever any row can have one, so the points column lines up in each list.
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
      ) : onPerson ? (
        <div className="fam-kid-heading">
          <button type="button" className="fam-kid-h fam-kid-toggle" onClick={onPerson}>
            {head}
          </button>
          {compact && doneRows.length > 0 && (
            <span className="fam-kid-done" data-testid="family-done-summary">
              Hotovo: {doneRows.length}
            </span>
          )}
        </div>
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
        {((kid.points !== null && act.onPoints) || act.onAdd || (collapsible && onPerson)) && (
          <div className="fam-kid-tools">
            {collapsible && onPerson && (
              <Button
                variant="ghost"
                size="sm"
                className="fam-list-detail"
                data-testid="family-list-person"
                onClick={onPerson}
              >
                Detail osoby
              </Button>
            )}
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
                  // Handed over: a state glyph (same swap mark as in the person detail), not
                  // the receiver's avatar – the row is about this kid's list.
                  <span
                    className="fam-handed-mark"
                    data-testid="family-handed-mark"
                    aria-hidden="true"
                  >
                    <Icon name="swap" size={18} />
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
                {!compact && (
                  <span className="fam-menu-slot" data-testid="family-menu-slot">
                    {showGive && (
                      <Button
                        variant="ghost"
                        className="fam-overflow"
                        icon={<Icon name="swap" size={22} />}
                        data-testid="family-chore-give"
                        aria-label="Předat…"
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
          {fold && doneRows.length > 0 && (!compact || !onPerson) && (
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
              {!compact && (
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
        {hidden.length > 0 && onPerson && (
          <OverflowChip
            label={`Další ${hidden.length} dnes`}
            pending={hiddenPending}
            context={kid.name}
            testId="family-chores-more"
            onClick={onPerson}
          />
        )}
        {(!compact || rows.length < KIOSK_CHORE_LIMIT) && (
          <UpcomingList
            kid={kid}
            now={now}
            compact={compact || self}
            kiosk={compact}
            highlight={highlight}
            onMenu={act.onMenu}
            onGive={act.onGive}
          />
        )}
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
  onPerson,
}: {
  snap: FamilySnapshot;
  now: Date;
  act: Actions;
  members: Member[];
  phone?: boolean;
  onPerson?: (id: string) => void;
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
  if (snap.kids.length === 0 && !approvals.length) return null;
  const waiting =
    snap.role === 'kiosk'
      ? (snap.members ?? snap.kids).reduce(
          (total, member) => total + member.chores.filter(choreApprovalKind).length,
          0,
        )
      : approvals.length;
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
          kids={snap.members ?? snap.kids}
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
        {snap.kids.map((kid) => (
          <KidCard
            key={kid.id}
            kid={kid}
            color={members.find((member) => member.id === kid.id)?.color ?? KID_COLORS[0]!}
            onPerson={onPerson && (() => onPerson(kid.id))}
            now={now}
            compact={snap.role === 'kiosk'}
            collapseDone={parent && phone}
            collapsible={parent}
            self={!!viewer}
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
  const [expanded, setExpanded] = useState(false);
  const moreId = useId();
  const moreItems = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (expanded) moreItems.current?.scrollIntoView?.({ block: 'nearest' });
  }, [expanded]);
  if (!snap.shopping) return null;
  const open = snap.shopping.items.filter((i) => !i.done);
  const done = snap.shopping.items.filter((i) => i.done);
  const kiosk = snap.role === 'kiosk';
  const visibleOpen = kiosk ? open.slice(0, 3) : open;
  const hiddenCount = open.length - visibleOpen.length;
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
        <ul className="fam-items">{visibleOpen.map(row)}</ul>
      )}
      {!kiosk && done.length > 0 && (
        <>
          <p className="fam-done-h">Koupeno · {done.length}</p>
          <ul className="fam-items">{done.slice(0, 6).map(row)}</ul>
        </>
      )}
      {hiddenCount > 0 && (
        <>
          <OverflowChip
            label={
              expanded
                ? 'Skrýt další položky'
                : `Další ${czCount(hiddenCount, 'položka', 'položky', 'položek')}`
            }
            testId="family-shop-more"
            expanded={expanded}
            controls={moreId}
            onClick={() => setExpanded((value) => !value)}
          />
          <div id={moreId} ref={moreItems} hidden={!expanded}>
            {expanded && <ul className="fam-items">{open.slice(visibleOpen.length).map(row)}</ul>}
          </div>
        </>
      )}
    </Card>
  );
}

export default function FamilyView({ connection, kiosk }: ModuleViewProps) {
  const api = useMemo(() => getFamilyApi(connection), [connection]);
  const people = usePeople(connection);
  const [stagedClaim, setStagedClaim] = useState<{
    member: string;
    chore: string;
    free: FreeChore;
  } | null>(null);
  const [personId, setPersonId] = useState<string | null>(null);
  const [editingPersons, setEditingPersons] = useState(false);
  const detailRef = useRef<HTMLDivElement>(null);
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
  // A staged free-task claim not sent yet: flushed when the view goes away (never lost).
  const pendingClaim = useRef<(() => void) | null>(null);
  useEffect(() => {
    const flush = () => pendingClaim.current?.();
    const host = hostWindow();
    window.addEventListener('pagehide', flush);
    if (host !== window) host.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      if (host !== window) host.removeEventListener('pagehide', flush);
      flush();
    };
  }, []);
  const openSheet = deleteTarget ?? swap ?? menu ?? addChore ?? pointsKid;
  useLayoutEffect(() => {
    if (openSheet) notify.dismiss();
  }, [notify, openSheet]);

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

  const snapshotRequest = useRef(0);
  const load = useCallback(async () => {
    if (!api) return;
    const request = ++snapshotRequest.current;
    try {
      const next = await api.get();
      if (request !== snapshotRequest.current) return;
      setSnap(next);
      setNow(new Date());
      setError(null);
    } catch {
      if (request === snapshotRequest.current) setError('Rodinný přehled se nepodařilo načíst.');
    }
  }, [api]);

  useEffect(() => {
    void Promise.resolve().then(load);
    const t = window.setInterval(() => void load(), POLL_MS);
    return () => window.clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (!personId && !editingPersons) return;
    // The panel's Back handler restores the overview scroll over two frames.
    let frame = window.requestAnimationFrame(() => {
      frame = window.requestAnimationFrame(() => {
        const detail = detailRef.current;
        const main = detail?.closest('main');
        if (main) main.scrollTop = 0;
        if (document.scrollingElement) document.scrollingElement.scrollTop = 0;
        detail?.querySelector('button')?.focus({ preventScroll: true });
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [personId, editingPersons]);

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
        try {
          await api.swapDecide(item.request_id!, 'approve', item.revision);
        } catch (err) {
          notify.error(swapError(err, 'Předání se nepodařilo schválit.'));
        }
      }),
    rejectSwap: (item: import('../types.js').FamilyApproval) =>
      item.request_id &&
      void run(`swap-${item.request_id}`, async () => {
        try {
          await api.swapDecide(item.request_id!, 'reject', item.revision);
        } catch (err) {
          notify.error(swapError(err, 'Žádost se nepodařilo zamítnout.'));
        }
      }),
  };
  const familyMembers = snap.members ?? [];
  const profile = familyMembers.find((member) => member.id === personId);
  const selected =
    profile &&
    profile.id === stagedClaim?.member &&
    !profile.chores.some((chore) => chore.id === stagedClaim.chore)
      ? {
          ...profile,
          counts: {
            ...profile.counts,
            total: profile.counts.total + 1,
            pending: profile.counts.pending + 1,
          },
          chores: [
            ...profile.chores,
            {
              id: stagedClaim.chore,
              name: stagedClaim.free.name,
              due: stagedClaim.free.due,
              points: stagedClaim.free.points,
              state: 'claimed' as const,
              can_claim: false,
              can_approve: false,
            },
          ],
        }
      : profile;
  const activeSnapshot = kiosk
    ? {
        ...snap,
        role: 'kiosk' as const,
        events: snap.events.map((event) => ({
          ...event,
          location: undefined,
          description: undefined,
        })),
      }
    : snap;
  const members = membersOf(snap).map((member) => ({
    ...member,
    color: snap.members
      ? member.color
      : (() => {
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
    ...(people ?? []).map((person) => [person.name, presenceHex(person.color)]),
    ...members.flatMap((member) => [
      [member.id, member.color],
      [member.name, member.color],
    ]),
  ]);
  const slot = (name: string, node: React.ReactNode) => (
    <div className="fam-slot" data-slot={name}>
      {node}
    </div>
  );
  const overviewTime = kiosk ? clock : now;
  const today = slot(
    'today',
    <TodayCard
      snap={activeSnapshot}
      now={overviewTime}
      admin={admin}
      members={calendarMembers}
      kiosk={!!kiosk}
    />,
  );
  const week = slot(
    'week',
    <WeekCard snap={activeSnapshot} now={overviewTime} members={calendarMembers} kiosk={!!kiosk} />,
  );
  const chores = slot(
    'chores',
    <ChoresCard
      snap={activeSnapshot}
      now={now}
      act={act}
      members={members}
      onAdd={(kid) => setAddChore(kid.kid_uuid ?? kid.id)}
      kidAct={makeKidAct}
      onApproval={approvalHandlers}
      phone={phone}
      highlight={highlight}
      onPerson={snap.members ? setPersonId : undefined}
    />,
  );
  const shop = slot(
    'shop',
    <ShoppingCard
      snap={activeSnapshot}
      busy={busy}
      onAdd={(s) => run('add', () => api.addItem(s))}
      onToggle={(uid, done) => void run(uid, () => api.setItemDone(uid, done))}
    />,
  );
  const menuKid = menu && snap.kids.find((k) => k.id === menu.kid);
  const menuToday = menuKid && menuKid.chores.find((c) => c.id === menu.chore);
  const menuChore = menuToday || (menuKid && menuKid.upcoming?.find((c) => c.id === menu.chore));
  const canTransfer = canTransferChore(menuChore);
  const management = menuChore?.management;
  const showReassign = canTransfer;
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
  const free = (snap.free_chores ?? []).filter(
    (row) =>
      row !== stagedClaim?.free &&
      !row.assignees.some((option) => option.chore === stagedClaim?.chore),
  );
  const claimFree = (member: string, chore: string) => {
    const row = free.find((entry) =>
      entry.assignees.some(
        (option) => option.member === member && option.chore === chore && option.can_claim,
      ),
    );
    if (stagedClaim || !row) return;
    setStagedClaim({ member, chore, free: row });

    // „Kdo dřív“ has no reservation: „Udělal jsem“ submits the task for a parent's approval
    // (ChoreOps claim). ChoreOps has no child-side unclaim, so the claim is held back for
    // 5 s – „Vrátit“ drops it; timeout, closing the toast or leaving the view sends it.
    let settled = false;
    const finish = () => {
      settled = true;
      window.clearTimeout(timer);
      unsubscribe();
      pendingClaim.current = null;
    };
    const commit = () => {
      if (settled) return;
      finish();
      notify.dismiss(toastId);
      void run(chore, async () => {
        try {
          await api.claim(member, chore);
        } catch {
          notify.error(`${row.name}: ke schválení se nepodařilo odeslat.`);
        }
      }).finally(() => setStagedClaim(null));
    };
    const toastId = notify.undo(
      `${row.name} · posíláme ke schválení`,
      () => {
        if (settled) return;
        finish();
        setStagedClaim(null);
      },
      { actionLabel: 'Vrátit', duration: CLAIM_UNDO_MS },
    );
    const timer = window.setTimeout(commit, CLAIM_UNDO_MS);
    const unsubscribe = toastStore.subscribe(() => {
      const toast = toastStore.getSnapshot().toasts.find((t) => t.id === toastId);
      // Closed with ✕ (or pushed out of the stack): send now instead of waiting.
      if (!toast || toast.state === 'closing') commit();
    });
    pendingClaim.current = commit;
  };
  const freeSlot = free.length
    ? slot('free', <FreeTasks rows={free} members={familyMembers} />)
    : null;
  const next = kiosk
    ? todayEvents(activeSnapshot.events, clock).find(
        (event) => !event.all_day && new Date(event.start) > clock,
      )
    : undefined;
  const choreSheets = (
    <>
      {swap && api && (
        <SwapSheet
          api={api}
          snap={snap}
          choreId={swap.chore}
          kidId={swap.kid}
          colors={identityColors}
          mode={swap.mode}
          onClose={() => setSwap(null)}
          onError={notify.error}
          onDone={(name, day) => {
            if (swap.mode === 'reassign')
              notify.success(
                reassignedToLabel(name, dayWord(new Date(`${day}T12:00:00`), new Date())),
              );
            else notify.success('Žádost byla odeslána rodiči.');
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
          <ul className="fam-menu-list" data-mixed={(showReassign && !!management) || undefined}>
            {showReassign && (
              <li>
                <Button
                  variant="ghost"
                  icon={<Icon name="swap" size={20} />}
                  disabled={skipBusy}
                  title={skipBusy ? 'Probíhá změna úkolu.' : undefined}
                  onClick={() => {
                    setSwap({ kid: menu.kid, chore: menu.chore, mode: 'reassign' });
                    setMenu(null);
                  }}
                >
                  Přeřadit…
                </Button>
              </li>
            )}
            {management && (
              <>
                {!management.one_off && (
                  <li>
                    <Button
                      variant="danger"
                      icon={<Icon name="calendar" size={20} />}
                      disabled={!management.can_skip || skipBusy}
                      onClick={() => void skipToday()}
                    >
                      Smazat jen dnes
                    </Button>
                  </li>
                )}
                <li>
                  <Button
                    variant="danger"
                    icon={<Icon name="bin" size={20} />}
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
          {!canTransfer && (
            <p className="fam-hint">
              {menuChore.swap_unavailable_reason ??
                (!menuChore.due ? 'Úkol nemá termín.' : 'Tento výskyt teď nelze předat.')}
            </p>
          )}
        </ChoreMenuSheet>
      )}
      {parent && deleteTarget && (
        <DeleteChoreSheet
          chore={deleteTarget.management}
          onClose={() => setDeleteTarget(null)}
          onDelete={async (scope) => {
            await api.deleteChore({
              client_request_id: newRequestId(),
              kid: deleteTarget.kid,
              chore: deleteTarget.chore,
              ...scope,
            });
            const wholeSeries =
              scope.series_ids ||
              (!deleteTarget.management.one_off && deleteTarget.management.slots.length < 2);
            notify.success(wholeSeries ? 'Řada smazána.' : 'Úkol smazán.');
            setDeleteTarget(null);
            void load();
          }}
        />
      )}
    </>
  );
  if (selected || editingPersons) {
    return (
      <div
        ref={detailRef}
        className="fam"
        data-kiosk={kiosk || undefined}
        data-testid="family"
        data-role={snap.role}
      >
        <style>{familyStyles}</style>
        {error && (
          <p className="fam-err" role="alert">
            {error}
          </p>
        )}
        {selected ? (
          <PersonView
            key={selected.id}
            api={api}
            member={selected}
            members={familyMembers}
            now={kiosk ? clock : now}
            events={activeSnapshot.events}
            free={free}
            busy={busy?.startsWith(`${selected.id}/`) ? busy.slice(selected.id.length + 1) : busy}
            refreshedAt={now.getTime()}
            onBack={() => setPersonId(null)}
            onClaim={claimFree}
            claimDisabled={!!stagedClaim}
            placed={stagedClaim?.member === selected.id ? stagedClaim.chore : null}
            onComplete={(chore) => act.claim(selected.id, chore)}
            onTransfer={
              selected.role === 'child' && (parent || (selected.own && act.onGive))
                ? (chore) => (act.onMenu ?? act.onGive)?.(selected.id, chore)
                : undefined
            }
            transferMenu={parent}
          />
        ) : (
          <PersonsSettings
            api={api}
            onBack={() => setEditingPersons(false)}
            onSaved={() => {
              setEditingPersons(false);
              void load();
            }}
          />
        )}
        {choreSheets}
      </div>
    );
  }
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
        {next && (
          <div className="fam-head-next" data-testid="family-next-event">
            <span>Další událost</span>
            <strong>
              <time>{timeLabel(next.start)}</time> {eventWho(next, calendarMembers).title}
            </strong>
          </div>
        )}
        {admin && snap.members && (
          <Button
            variant="ghost"
            size="sm"
            className="fam-settings-link"
            onClick={() => setEditingPersons(true)}
          >
            Nastavení osob
          </Button>
        )}
      </header>
      {familyMembers.length > 0 && (
        <PersonsRow members={familyMembers} onPerson={setPersonId} kiosk={kiosk} />
      )}
      {error && (
        <p className="fam-err" role="alert">
          {error}
        </p>
      )}
      {kiosk ? (
        <div className="fam-grid">
          <div className="fam-col">
            {today}
            {shop}
          </div>
          <div className="fam-col">
            {week}
            {freeSlot}
          </div>
          <div className="fam-col">{chores}</div>
        </div>
      ) : (
        <div className="fam-grid" data-testid="family-grid">
          <div className="fam-col">
            {today}
            {week}
          </div>
          <div className="fam-col">
            {chores}
            {freeSlot}
            {shop}
          </div>
        </div>
      )}
      {pointsKid && api && (
        <PointsSheet kid={pointsKid} api={api} onClose={() => setPointsKid(null)} />
      )}
      {addChore && api && (
        <AddChoreSheet
          kids={snap.members ?? snap.kids}
          api={api}
          colors={identityColors}
          initialKid={addChore}
          now={api.now}
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
      {choreSheets}
    </div>
  );
}

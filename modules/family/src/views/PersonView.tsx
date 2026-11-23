import { PersonSchool } from './PersonSchool.js';
import { PersonTimetable } from './PersonTimetable.js';
import { useEffect, useId, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { useBackClosable } from '@homebrain/ha-client';
import { Button, Card, Icon, czCount, czPlural } from '@homebrain/ui';
import type { FamilyApi } from '../api.js';
import {
  CARRIED_LABEL,
  MISSED_LABEL,
  canTransferChore,
  isTransferredOut,
  transferLabel,
  carriedFrom,
  carriedLabel,
  choreApprovalKind,
  choreTally,
  czDate,
  shortDate,
  eventWho,
  fmtPoints,
  formatOutOf,
  isPast,
  localKey,
  longDate,
  pointsAmount,
  pointsLabel,
  timeLabel,
  timeRange,
  todayEvents,
} from '../format.js';
import { personActivity } from '../personActivity.js';
import { pendingHandoverLabel } from '../czech.js';
import type {
  FamilyChore,
  FamilyEvent,
  FamilyMember,
  FamilyPresence,
  FreeChore,
  PersonHistoryEntry,
} from '../types.js';

export const personColor = (index: number) => `var(--fam-person-${index}, var(--fam-person-1))`;
const colorStyle = (member: FamilyMember) =>
  ({ '--person-color': personColor(member.color) }) as CSSProperties;

/** Copy of the „kdo dřív“ rule, shared by the overview card and the person detail. */
export const FREE_HINT = 'Body dostane, kdo to udělá první · po\u00a0schválení rodičem';

function Avatar({ member }: { member: FamilyMember }) {
  return (
    <span className="fam-person-avatar" aria-hidden="true">
      {member.name.trim()[0]}
    </span>
  );
}

function Presence({ presence }: { presence: FamilyPresence | null }) {
  if (presence?.kind === 'derived' && presence.source === 'school_timetable')
    return (
      <span
        className="fam-person-presence"
        data-testid="family-wifi-presence"
        data-school=""
        title="Odvozeno z rozvrhu hodin, ne z Wi-Fi"
      >
        <span aria-hidden="true" />
        ve škole <small>· podle rozvrhu</small>
      </span>
    );
  if (presence?.kind !== 'home' && presence?.kind !== 'away') return null;
  return (
    <span
      className="fam-person-presence"
      data-testid="family-wifi-presence"
      data-home={presence.kind === 'home' || undefined}
    >
      <span aria-hidden="true" />
      {presence.kind === 'home' ? 'doma' : 'pryč'}
    </span>
  );
}

function Progress({
  counts,
  handovers = 0,
}: Pick<FamilyMember, 'counts'> & { handovers?: number }) {
  return (
    <span className="fam-person-progress">
      <span>{formatOutOf(counts.done, counts.total)} hotovo</span>
      {counts.pending > 0 && (
        <span className="fam-person-wait">
          <Icon name="clock" size={16} />
          {handovers === counts.pending ? (
            <span data-testid="family-member-handover">
              {handovers} {czPlural(handovers, 'předání čeká', 'předání čekají', 'předání čeká')}
            </span>
          ) : (
            <>
              {counts.pending} {czPlural(counts.pending, 'čeká', 'čekají', 'čeká')}
              {handovers > 0 && (
                <span data-testid="family-member-handover"> · {handovers} předání</span>
              )}
            </>
          )}
        </span>
      )}
    </span>
  );
}

function ProgressMeter({ counts }: Pick<FamilyMember, 'counts'>) {
  const { done, pending, total } = counts;
  return (
    <span className="fam-person-meter" aria-hidden="true">
      <i style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
      <i data-waiting style={{ width: `${total ? (pending / total) * 100 : 0}%` }} />
    </span>
  );
}

export function PersonsRow({
  members,
  onPerson,
  kiosk,
}: {
  members: FamilyMember[];
  onPerson(id: string): void;
  kiosk?: boolean | undefined;
}) {
  return (
    <div className="fam-persons" data-testid="family-persons" aria-label="Členové rodiny">
      {members.map((member) => {
        const handovers = member.chores.filter(
          (chore) => choreApprovalKind(chore) === 'swap',
        ).length;
        const counts = kiosk
          ? { ...member.counts, pending: member.chores.filter(choreApprovalKind).length }
          : member.counts;
        return (
          <button
            key={member.id}
            className="fam-person-tile"
            data-testid="family-person-tile"
            type="button"
            style={colorStyle(member)}
            onClick={() => onPerson(member.id)}
          >
            <span className="fam-person-identity">
              <Avatar member={member} />
              <span className="fam-person-name">
                <strong>{member.name}</strong>
                <Presence presence={member.presence} />
              </span>
            </span>
            <ProgressMeter counts={counts} />
            <Progress counts={counts} handovers={kiosk ? handovers : 0} />
            {kiosk && (
              <span className="fam-tile-points">{pointsAmount(member.points_today ?? 0)} dnes</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

const parts = ['Ráno', 'Odpoledne', 'Večer'] as const;
const tabs = ['Dnes', 'Týden', 'Historie'] as const;
type Tab = (typeof tabs)[number];

function part(due: string | null) {
  const hour = due ? new Date(due).getHours() : 16;
  return hour < 11 ? parts[0] : hour < 17 ? parts[1] : parts[2];
}

type TaskRow = FamilyChore & {
  occurrence?: 'carried' | 'missed';
  /** Carried rows: the day the task moved to („čt 19. 11.“). */
  carriedTo?: string;
};

type MarkKind = 'open' | 'done' | 'waiting' | 'handed' | 'carried' | 'missed';

/** One glyph system for every task row: ring = open, filled check = done, swap = handed over. */
function markKind(row: TaskRow): MarkKind {
  if (isTransferredOut(row)) return 'handed';
  if (row.occurrence === 'missed') return 'missed';
  if (row.occurrence === 'carried') return 'carried';
  if (row.state === 'done') return 'done';
  if (row.state === 'claimed') return 'waiting';
  return 'open';
}

const MARK_ICON: Record<MarkKind, 'check' | 'clock' | 'swap' | 'arrow' | 'minus' | null> = {
  open: null,
  done: 'check',
  waiting: 'clock',
  handed: 'swap',
  carried: 'arrow',
  missed: 'minus',
};

function TaskMark({ kind }: { kind: MarkKind }) {
  const icon = MARK_ICON[kind];
  return (
    <span className="fam-person-mark" data-mark={kind} aria-hidden="true">
      {icon && <Icon name={icon} size={kind === 'done' ? 18 : 20} />}
    </span>
  );
}

type TransferAction = {
  onTransfer?: (chore: string) => void;
  transferMenu?: boolean;
};

function ChoreRows({
  rows,
  today,
  busy,
  highlight,
  onComplete,
  onTransfer,
  transferMenu,
}: TransferAction & {
  rows: TaskRow[];
  today: string;
  busy?: string | null;
  highlight?: string | null;
  onComplete?(chore: string): void;
}) {
  return (
    <ul>
      {rows.map((chore) => {
        const swap = chore.swap_today;
        const carried = carriedFrom(chore, today);
        const mark = markKind(chore);
        const status =
          swap?.kind === 'pending_give'
            ? pendingHandoverLabel(swap.partner_name)
            : swap
              ? transferLabel(swap, new Date(`${today}T12:00:00`))
              : chore.state === 'claimed'
                ? 'Čeká na schválení'
                : undefined;
        const waiting = chore.state === 'claimed' && !chore.occurrence;
        return (
          <li
            key={`${chore.id}/${chore.occurrence ?? ''}`}
            className="fam-person-task"
            data-testid="family-person-chore"
            data-state={chore.state}
            data-mark={mark}
            data-carried-days={chore.carried_days}
            data-muted={swap?.muted || chore.occurrence === 'carried' || undefined}
            data-missed={chore.occurrence === 'missed' || undefined}
            data-highlight={(highlight && chore.id === highlight) || undefined}
          >
            {onComplete && chore.can_claim ? (
              <button
                type="button"
                className="fam-person-check"
                role="checkbox"
                aria-checked={false}
                aria-label={`Splnit: ${chore.name}`}
                disabled={busy === chore.id}
                onClick={() => onComplete(chore.id)}
              >
                <TaskMark kind="open" />
              </button>
            ) : (
              <TaskMark kind={mark} />
            )}
            <div className="fam-person-task-text">
              <strong>{chore.name}</strong>
              {chore.occurrence ? (
                <small>
                  {chore.occurrence === 'carried'
                    ? `${CARRIED_LABEL}${chore.carriedTo ? `\u00a0→ ${chore.carriedTo}` : ''}`
                    : MISSED_LABEL}
                </small>
              ) : carried ? (
                <small className="fam-person-carried" data-testid="family-carried-line">
                  {carriedLabel(carried)}
                </small>
              ) : chore.due && chore.state !== 'done' && chore.state !== 'claimed' ? (
                <small data-overdue={chore.state === 'overdue' || undefined}>
                  {localKey(new Date(chore.due)) > today && (
                    <>{shortDate(new Date(chore.due))} · </>
                  )}
                  do&nbsp;{timeLabel(chore.due)}
                </small>
              ) : null}
              {status && (
                <small
                  data-pending={
                    chore.state === 'claimed' || swap?.kind === 'pending_give' || undefined
                  }
                  data-handed={swap?.kind === 'transferred_out' || undefined}
                >
                  {status.replace(/ · jen dnes$/u, '')}
                </small>
              )}
              {onTransfer && !transferMenu && !chore.due && <small>Úkol nemá termín.</small>}
              {chore.rotation_turn && <small>Střídá se · na řadě {chore.rotation_turn}</small>}
            </div>
            <span className="fam-person-points" data-waiting={waiting || undefined}>
              {chore.occurrence === 'missed' ? (
                pointsAmount(0)
              ) : swap?.muted && chore.occurrence !== 'carried' ? (
                <s>{pointsLabel(chore.points)}</s>
              ) : waiting && chore.points != null ? (
                <>
                  {pointsLabel(chore.points)}
                  <small>po schválení</small>
                </>
              ) : (
                pointsLabel(chore.points)
              )}
            </span>
            {onTransfer &&
              !chore.occurrence &&
              (canTransferChore(chore) || (transferMenu && !!swap?.operation_id)) && (
                <Button
                  variant="ghost"
                  className="fam-overflow fam-person-transfer"
                  icon={<Icon name={transferMenu ? 'more' : 'swap'} size={20} />}
                  aria-label={`${transferMenu ? 'Další akce' : 'Předat'}: ${chore.name}`}
                  title={transferMenu ? 'Další akce' : 'Předat…'}
                  onClick={() => onTransfer(chore.id)}
                />
              )}
          </li>
        );
      })}
    </ul>
  );
}

function GroupHead({
  label,
  count,
  now,
  finished,
}: {
  label: string;
  count: string;
  now?: boolean;
  finished?: boolean;
}) {
  return (
    <h3 className="fam-person-group-title">
      <span className="fam-person-chev" aria-hidden="true">
        <Icon name="chevron" size={16} />
      </span>
      <span className="fam-person-group-label">{label}</span>
      {now && (
        <span className="fam-now-pill" data-kind="now">
          teď
        </span>
      )}
      <small>
        {finished && <Icon name="check" size={14} />}
        {count}
      </small>
    </h3>
  );
}

function TodayChores({
  member,
  now,
  busy,
  highlight,
  onComplete,
  onTransfer,
  transferMenu,
}: TransferAction & {
  member: FamilyMember;
  now: Date;
  busy: string | null;
  highlight?: string | null;
  onComplete(chore: string): void;
}) {
  const today = localKey(now);
  const carried = member.chores.filter((chore) => carriedFrom(chore, today));
  const late = member.chores.filter(
    (chore) => chore.state === 'overdue' && chore.due && localKey(new Date(chore.due)) === today,
  );
  const scheduled = member.chores.filter(
    (chore) => !carried.includes(chore) && !late.includes(chore),
  );
  const groups = [
    {
      label: 'Po termínu',
      rows: late,
      late: true,
    },
    { label: CARRIED_LABEL, rows: carried, late: false },
    ...parts.map((label) => ({
      label,
      rows: scheduled.filter((chore) => part(chore.due) === label),
      late: false,
    })),
  ].filter((group) => group.rows.length);
  const count = (rows: FamilyChore[]) => {
    const { done, total } = choreTally(rows.filter((chore) => chore.counts_today !== false));
    return `${formatOutOf(done, total)} hotovo`;
  };
  const current = part(now.toISOString());
  return (
    <section className="fam-person-tasks">
      <div className="fam-person-section-head">
        <h2>Úkoly</h2>
      </div>
      <div className="fam-person-surface">
        {!groups.length && <p className="fam-person-empty">Dnes bez úkolů.</p>}
        {groups.map((group) => {
          const finished = group.rows.every((chore) => chore.state === 'done');
          return (
            // Every group folds the same way (chevron); finished ones start folded, ✓ + muted.
            <details
              key={group.label}
              className="fam-person-group"
              data-late={group.late || undefined}
              data-carried={group.label === CARRIED_LABEL || undefined}
              data-finished={finished || undefined}
              data-now={group.label === current || undefined}
              open={!finished}
            >
              <summary className="fam-person-group-head">
                <GroupHead
                  label={group.label}
                  count={count(group.rows)}
                  now={group.label === current}
                  finished={finished}
                />
              </summary>
              <ChoreRows
                today={today}
                rows={group.rows}
                busy={busy}
                highlight={highlight}
                onComplete={onComplete}
                onTransfer={onTransfer}
                transferMenu={transferMenu}
              />
            </details>
          );
        })}
      </div>
    </section>
  );
}

function FreeRow({
  chore,
  members,
  member,
  busy,
  onClaim,
  claimDisabled,
}: {
  chore: FreeChore;
  members: FamilyMember[];
  member?: FamilyMember | undefined;
  busy?: string | null | undefined;
  onClaim?: ((member: string, chore: string) => void) | undefined;
  claimDisabled?: boolean | undefined;
}) {
  const option = chore.assignees.find((choice) => choice.member === member?.id && choice.can_claim);
  const names = chore.assignees
    .map((choice) => members.find((person) => person.id === choice.member)?.name)
    .filter(Boolean);
  return (
    <li className="fam-person-task fam-person-free" data-testid="family-free-row">
      {/* Not a checkbox: nothing to tick before the task is done. */}
      <span className="fam-person-free-icon" aria-hidden="true">
        <Icon name="broom" size={20} />
      </span>
      <div className="fam-person-task-text">
        <strong>{chore.name}</strong>
        <small className="fam-free-meta">
          {chore.due && <span className="fam-nowrap">do&nbsp;{timeLabel(chore.due)}</span>}
          <span className="fam-nowrap">{names.join(' nebo ')}</span>
        </small>
      </div>
      {option && onClaim ? (
        <Button
          variant="secondary"
          disabled={claimDisabled || busy === option.chore}
          onClick={() => onClaim(option.member, option.chore)}
          data-testid="family-free-done"
        >
          Udělal jsem{chore.points != null && ` · +${fmtPoints(chore.points)}`}
          <span className="hb-sr-only">: {chore.name}</span>
        </Button>
      ) : (
        <span className="fam-person-points">{pointsLabel(chore.points)}</span>
      )}
    </li>
  );
}

export function FreeTasks({
  rows,
  members,
  member,
  busy,
  onClaim,
  claimDisabled,
}: {
  rows: FreeChore[];
  members: FamilyMember[];
  member?: FamilyMember;
  busy?: string | null;
  onClaim?(member: string, chore: string): void;
  claimDisabled?: boolean;
}) {
  const visible = rows.filter(
    (row) => !member || row.assignees.some((option) => option.member === member.id),
  );
  if (!visible.length) return null;
  const list = visible.map((chore) => (
    <FreeRow
      key={chore.assignees[0]?.chore ?? chore.name}
      chore={chore}
      members={members}
      member={member}
      busy={busy}
      onClaim={onClaim}
      claimDisabled={claimDisabled}
    />
  ));
  if (!member) {
    // Overview / kiosk: a card like the others, heading inside the panel.
    return (
      <Card className="fam-card fam-free-card" data-testid="family-free">
        <div className="fam-card-h">
          <h2>Volné úkoly</h2>
          <span className="fam-meta">kdo dřív</span>
        </div>
        <ul className="fam-free-list">{list}</ul>
      </Card>
    );
  }
  return (
    <section className="fam-person-free-tasks" data-testid="family-free">
      <div className="fam-person-section-head">
        <h2>Volné úkoly</h2>
        <p>{FREE_HINT}</p>
      </div>
      <ul className="fam-person-surface">{list}</ul>
    </section>
  );
}

type WeekRow = TaskRow & { weekDay: string | null };

/** Rows of the Týden tab: today's open tasks, carried origins, credits, misses, planned days. */
function weekRows(member: FamilyMember, activity: ReturnType<typeof personActivity>): WeekRow[] {
  const { today, week, days } = activity;
  const weekStart = localKey(days[0]!);
  const counted = member.chores.filter((chore) => chore.counts_today !== false);
  const todayLabel = shortDate(new Date(`${today}T12:00:00`));
  return [
    ...counted
      .filter((chore) => chore.state !== 'done')
      .map((chore) => ({ ...chore, weekDay: today })),
    ...counted.flatMap((chore) => {
      const day = carriedFrom(chore, today);
      return day && day >= weekStart
        ? [
            {
              ...chore,
              weekDay: day,
              occurrence: 'carried' as const,
              carriedTo: todayLabel,
              state: 'overdue' as const,
            },
          ]
        : [];
    }),
    ...week.map((entry) => ({
      ...entry,
      weekDay: entry.date ? localKey(new Date(entry.date)) : null,
      due: entry.date,
      state: entry.missed ? ('overdue' as const) : ('done' as const),
      ...(entry.missed && { occurrence: 'missed' as const }),
      can_claim: false,
      can_approve: false,
    })),
    ...(member.upcoming ?? []).flatMap((chore) => {
      const day = chore.due ? localKey(new Date(chore.due)) : null;
      return day && day > today
        ? [
            {
              ...chore,
              weekDay: day,
              state: 'todo' as const,
              can_claim: false,
              can_approve: false,
            },
          ]
        : [];
    }),
  ];
}

const DAY_SHORT = ['Ne', 'Po', 'Út', 'St', 'Čt', 'Pá', 'So'];

/** Týden / Historie: points and task totals for the listed week. */
function WeekSummary({
  activity,
  rows,
  loaded,
  showUpcoming,
}: {
  activity: ReturnType<typeof personActivity>;
  rows: WeekRow[];
  loaded: boolean;
  showUpcoming?: boolean;
}) {
  const { days, week, today, points } = activity;
  const perDay = days.map((day) => {
    const key = localKey(day);
    return {
      key,
      label: DAY_SHORT[day.getDay()] ?? '',
      points: week
        .filter((row) => !row.missed && row.date && localKey(new Date(row.date)) === key)
        .reduce((sum, row) => sum + (row.points ?? 0), 0),
    };
  });
  const max = Math.max(1, ...perDay.map((day) => day.points));
  const done = week.filter((row) => !row.missed).length;
  const missed = week.filter((row) => row.missed).length;
  const carried = rows.filter((row) => row.occurrence === 'carried').length;
  const end = localKey(days[6]!);
  const open = rows.filter(
    (row) =>
      row.weekDay &&
      row.weekDay >= today &&
      row.weekDay <= end &&
      !row.occurrence &&
      !choreApprovalKind(row) &&
      (row.state === 'todo' || row.state === 'overdue'),
  ).length;
  const ahead = showUpcoming
    ? rows
        .filter((row) => row.weekDay && row.weekDay > today && !row.occurrence)
        .sort((a, b) => (a.weekDay ?? '').localeCompare(b.weekDay ?? ''))
        .slice(0, 3)
    : [];
  return (
    <section className="fam-person-summary" data-testid="family-week-summary">
      <div className="fam-person-section-head">
        <h2>Souhrn týdne</h2>
        {loaded && <small>{pointsAmount(points)}</small>}
      </div>
      <div className="fam-person-surface">
        <ol className="fam-week-bars" aria-label="Body po dnech">
          {perDay.map((day) => (
            <li
              key={day.key}
              data-today={day.key === today || undefined}
              data-future={day.key > today || undefined}
              aria-label={`${day.key === today ? 'Dnes' : day.label}: ${day.key > today ? 'budoucí den' : pointsAmount(day.points)}`}
            >
              <b aria-hidden="true">{day.key <= today && loaded ? fmtPoints(day.points) : ''}</b>
              <span className="fam-week-bar" aria-hidden="true">
                <i style={{ height: `${(day.points / max) * 100}%` }} />
              </span>
              <small aria-hidden="true">{day.key === today ? 'Dnes' : day.label}</small>
            </li>
          ))}
        </ol>
        <dl className="fam-week-stats">
          <div>
            <dt>Hotovo</dt>
            <dd>{done}</dd>
          </div>
          {missed > 0 && (
            <div data-tone="crit">
              <dt>{MISSED_LABEL}</dt>
              <dd>{missed}</dd>
            </div>
          )}
          <div>
            <dt>{CARRIED_LABEL}</dt>
            <dd>{carried}</dd>
          </div>
          <div>
            <dt>Zbývá splnit</dt>
            <dd>
              {open}
              <small>Od dneška do neděle</small>
            </dd>
          </div>
        </dl>
        {ahead.length > 0 && (
          <div className="fam-week-ahead">
            <h3>Dál v týdnu</h3>
            <ul>
              {ahead.map((row) => (
                <li key={`${row.id}/${row.weekDay}`}>
                  <span>{shortDate(new Date(`${row.weekDay}T12:00:00`))}</span>
                  <strong>{row.name}</strong>
                  <span className="fam-person-points">{pointsLabel(row.points)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}

function Week({
  history,
  activity,
  rows,
  onTransfer,
  transferMenu,
}: TransferAction & {
  history: ReturnType<typeof usePersonHistory>;
  activity: ReturnType<typeof personActivity>;
  rows: WeekRow[];
}) {
  const { today, days } = activity;
  return (
    <section className="fam-person-week">
      <div className="fam-person-section-head">
        <h2>Tento týden</h2>
        <small>
          {czDate(days[0]!)} – {czDate(days[6]!)}
        </small>
      </div>
      <div className="fam-person-surface" aria-busy={!history.entries && !history.error}>
        {history.error && (
          <p className="fam-person-empty" role="alert">
            Splněné úkoly se nepodařilo načíst.
          </p>
        )}
        {days.map((day) => {
          const key = localKey(day);
          const chores = rows.filter((chore) => chore.weekDay === key);
          const carried = chores.filter((chore) => chore.occurrence === 'carried').length;
          const { done, total } = choreTally(
            chores.filter((chore) => chore.occurrence !== 'carried'),
          );
          return (
            <section
              className="fam-person-group fam-person-day"
              data-today={key === today || undefined}
              data-past={key < today || undefined}
              key={key}
            >
              <h3 className="fam-person-group-head">
                <span>
                  {key === today ? 'Dnes · ' : ''}
                  {longDate(day)}
                </span>
                <small>
                  {[
                    total || carried ? `${formatOutOf(done, total + carried)} hotovo` : '',
                    carried ? `${carried} přeneseno` : '',
                  ]
                    .filter(Boolean)
                    .join(' · ') ||
                    (history.entries ? (key < today ? 'Bez záznamů' : 'Bez úkolů') : '')}
                </small>
              </h3>
              {chores.length > 0 && (
                <ChoreRows
                  rows={chores}
                  today={today}
                  onTransfer={onTransfer}
                  transferMenu={transferMenu}
                />
              )}
            </section>
          );
        })}
      </div>
    </section>
  );
}

function usePersonHistory(api: FamilyApi, member: string, refreshedAt: number) {
  const [history, setHistory] = useState<{ entries: PersonHistoryEntry[] | null; error: boolean }>({
    entries: null,
    error: false,
  });
  useEffect(() => {
    let active = true;
    void api.personHistory(member).then(
      (result) => {
        if (active) setHistory({ entries: result.entries, error: false });
      },
      () => {
        if (active) setHistory({ entries: null, error: true });
      },
    );
    return () => {
      active = false;
    };
  }, [api, member, refreshedAt]);
  return history;
}

function History({
  history,
  activity,
}: {
  history: ReturnType<typeof usePersonHistory>;
  activity: ReturnType<typeof personActivity>;
}) {
  const { entries, error } = history;
  const { history: rows, today } = activity;
  const days = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = row.date ? localKey(new Date(row.date)) : '';
    const day = days.get(key);
    if (day) day.push(row);
    else days.set(key, [row]);
  }
  return (
    <section className="fam-person-history">
      <div className="fam-person-section-head">
        <h2>Historie úkolů</h2>
      </div>
      <div className="fam-person-surface" aria-busy={!entries && !error}>
        {error && (
          <p className="fam-person-empty" role="alert">
            Splněné úkoly se nepodařilo načíst.
          </p>
        )}
        {!entries && !error && <p className="fam-person-empty">Načítám splněné úkoly…</p>}
        {entries && !rows.length && <p className="fam-person-empty">Zatím žádné záznamy.</p>}
        {[...days].map(([day, items]) => (
          <section className="fam-person-group fam-person-day" key={day}>
            <h3 className="fam-person-group-head">
              {day === today && 'Dnes · '}
              {day ? longDate(new Date(`${day}T12:00:00`)) : 'Datum neznámé'}
            </h3>
            <ul>
              {items.map((row) => (
                <li
                  className="fam-person-task"
                  data-testid="family-history-row"
                  data-missed={row.missed || undefined}
                  data-state={row.missed ? undefined : 'approved'}
                  data-mark={row.missed ? 'missed' : 'done'}
                  key={`${row.id}/${row.date}`}
                >
                  <TaskMark kind={row.missed ? 'missed' : 'done'} />
                  <div className="fam-person-task-text">
                    <strong>{row.name}</strong>
                    <small>
                      {row.missed
                        ? MISSED_LABEL
                        : row.date
                          ? `Hotovo v\u00a0${timeLabel(row.date)}`
                          : 'Hotovo'}
                    </small>
                  </div>
                  <span className="fam-person-points">
                    {row.missed ? pointsAmount(0) : pointsLabel(row.points)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </section>
  );
}

function TodaySummary({ member, now }: { member: FamilyMember; now: Date }) {
  const today = localKey(now);
  const next = member.chores
    .filter(
      (chore) =>
        chore.due &&
        localKey(new Date(chore.due)) === today &&
        Date.parse(chore.due) > now.getTime() &&
        chore.counts_today !== false &&
        chore.state === 'todo' &&
        !choreApprovalKind(chore),
    )
    .sort((a, b) => Date.parse(a.due!) - Date.parse(b.due!))[0];
  return (
    <section className="fam-person-today-summary">
      <div className="fam-person-section-head">
        <h2>Shrnutí dne</h2>
      </div>
      <div className="fam-person-surface fam-today-stats">
        <div>
          <small>Povinnosti</small>
          <strong>{formatOutOf(member.counts.done, member.counts.total)} hotovo</strong>
          <ProgressMeter counts={member.counts} />
          {member.counts.pending > 0 && (
            <small className="fam-person-wait">
              {czCount(member.counts.pending, 'čeká', 'čekají', 'čeká')}
            </small>
          )}
        </div>
        <div>
          <small>Body dnes</small>
          <strong>{member.points_today ?? 0}</strong>
        </div>
        <div className="fam-today-deadline">
          <small>Nejbližší termín</small>
          <strong>
            {next?.due ? (
              <>
                <time>{timeLabel(next.due)}</time> {next.name}
              </>
            ) : (
              'Bez termínu'
            )}
          </strong>
        </div>
      </div>
    </section>
  );
}

function PersonCalendar({
  today,
  now,
}: {
  today: { event: FamilyEvent; title: string }[];
  now: Date;
}) {
  if (!today.length) return null;
  const rows = today.map(({ event, title }) => {
    const past = isPast(event, now);
    const running = !event.all_day && !past && Date.parse(event.start) <= now.getTime();
    return (
      <li
        className="fam-person-event"
        key={event.id}
        data-past={past || undefined}
        data-running={running || undefined}
        data-testid="family-person-event"
      >
        <time>{event.all_day ? 'celý den' : timeRange(event)}</time>
        <span>
          {title}
          {past && <small>proběhlo</small>}
        </span>
      </li>
    );
  });
  const next = today.findIndex(({ event }) => !event.all_day && !isPast(event, now));
  rows.splice(
    next === -1 ? rows.length : next,
    0,
    <li key="now" className="fam-person-calendar-now">
      <span className="fam-now-pill">Teď {timeLabel(now.toISOString())}</span>
    </li>,
  );
  return (
    <section className="fam-person-calendar">
      <div className="fam-person-section-head">
        <h2>Dnes v kalendáři</h2>
      </div>
      <ul className="fam-person-surface">{rows}</ul>
    </section>
  );
}

export function PersonView({
  api,
  member,
  members,
  now,
  events,
  free,
  busy,
  onBack,
  onClaim,
  onComplete,
  claimDisabled,
  placed,
  refreshedAt,
  onTransfer,
  transferMenu,
}: TransferAction & {
  api: FamilyApi;
  member: FamilyMember;
  members: FamilyMember[];
  now: Date;
  events: FamilyEvent[];
  free: FreeChore[];
  busy: string | null;
  refreshedAt: number;
  claimDisabled: boolean;
  /** Chore just moved here from „Volné úkoly“: highlighted for 2 s and scrolled into view. */
  placed?: string | null;
  onBack(): void;
  onComplete(chore: string): void;
  onClaim(member: string, chore: string): void;
}) {
  const [tab, setTab] = useState<Tab>('Dnes');
  const history = usePersonHistory(api, member.id, refreshedAt);
  const activity = personActivity(member, history.entries ?? [], now);
  const id = useId();
  useBackClosable(onBack);
  useEffect(() => {
    if (!placed) return;
    const frame = window.requestAnimationFrame(() => {
      const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      document
        .querySelector<HTMLElement>('[data-testid="family-person-chore"][data-highlight]')
        ?.scrollIntoView?.({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [placed]);
  const keyTab = (event: KeyboardEvent, index: number) => {
    const next =
      event.key === 'ArrowRight'
        ? (index + 1) % tabs.length
        : event.key === 'ArrowLeft'
          ? (index + tabs.length - 1) % tabs.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? tabs.length - 1
              : -1;
    if (next < 0) return;
    event.preventDefault();
    setTab(tabs[next]!);
    document.getElementById(`${id}-${next}`)?.focus();
  };
  const today = todayEvents(events, now).flatMap((event) => {
    const { who, title } = eventWho(event, members);
    return who.includes(member.id) || (!who.length && event.kind === 'family')
      ? [{ event, title }]
      : [];
  });
  const rows = weekRows(member, activity);
  const upcoming = rows.filter((row) => row.weekDay && row.weekDay > activity.today);
  const waiting = member.chores
    .filter((chore) => chore.state === 'claimed')
    .reduce((sum, chore) => sum + (chore.points ?? 0), 0);
  return (
    <article
      className="fam-person-view"
      style={colorStyle(member)}
      data-testid="family-person"
      data-toast={placed ? '' : undefined}
    >
      <div className="fam-person-head">
        <Button variant="ghost" className="fam-person-back" onClick={onBack}>
          ‹&nbsp; Zpět
        </Button>
        <div className="fam-person-identity">
          <Avatar member={member} />
          <div className="fam-person-name">
            <div>
              <h1>{member.name}</h1>
              <Presence presence={member.presence} />
            </div>
            {history.entries && (
              <p data-testid="family-person-points">
                {pointsAmount(activity.points)} tento týden
                {waiting > 0 && (
                  <span className="fam-nowrap">
                    {` · ${pointsAmount(waiting)} ${czPlural(waiting, 'čeká', 'čekají', 'čeká')}`}
                  </span>
                )}
              </p>
            )}
          </div>
        </div>
      </div>
      <div className="fam-person-tabs" role="tablist" aria-label="Přehled osoby">
        {tabs.map((label, index) => (
          <button
            type="button"
            role="tab"
            key={label}
            id={`${id}-${index}`}
            aria-controls={`${id}-panel`}
            aria-selected={label === tab}
            tabIndex={label === tab ? 0 : -1}
            onKeyDown={(event) => keyTab(event, index)}
            onClick={() => setTab(label)}
          >
            {label}
          </button>
        ))}
      </div>
      <div
        id={`${id}-panel`}
        role="tabpanel"
        aria-labelledby={`${id}-${tabs.indexOf(tab)}`}
        tabIndex={0}
      >
        <div className="fam-person-flow" data-tab={tab}>
          {tab === 'Dnes' && (
            <>
              <TodaySummary member={member} now={now} />
              {member.role === 'child' && (
                <PersonTimetable api={api} member={member.id} now={now} refreshedAt={refreshedAt} />
              )}
              <TodayChores
                member={member}
                now={now}
                busy={busy}
                highlight={placed}
                onComplete={onComplete}
                onTransfer={onTransfer}
                transferMenu={transferMenu}
              />
              {onTransfer && upcoming.length > 0 && (
                <section className="fam-person-tasks">
                  <div className="fam-person-section-head">
                    <h2>Naplánované úkoly</h2>
                  </div>
                  <div className="fam-person-surface">
                    <ChoreRows
                      rows={upcoming}
                      today={activity.today}
                      onTransfer={onTransfer}
                      transferMenu={transferMenu}
                    />
                  </div>
                </section>
              )}
              <PersonCalendar today={today} now={now} />
              <FreeTasks
                rows={free}
                members={members}
                member={member}
                busy={busy}
                onClaim={onClaim}
                claimDisabled={claimDisabled}
              />
              {member.role === 'child' && (
                <PersonSchool api={api} member={member.id} now={now} refreshedAt={refreshedAt} />
              )}
            </>
          )}
          {tab === 'Týden' && (
            <>
              <WeekSummary activity={activity} rows={rows} loaded={!!history.entries} />
              <Week
                history={history}
                activity={activity}
                rows={rows}
                onTransfer={onTransfer}
                transferMenu={transferMenu}
              />
            </>
          )}
          {tab === 'Historie' && (
            <>
              <WeekSummary
                activity={activity}
                rows={rows}
                loaded={!!history.entries}
                showUpcoming
              />
              <History history={history} activity={activity} />
            </>
          )}
        </div>
      </div>
    </article>
  );
}

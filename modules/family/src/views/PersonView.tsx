import { useEffect, useId, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { useBackClosable } from '@homebrain/ha-client';
import { Button, Icon, czPlural } from '@homebrain/ui';
import type { FamilyApi } from '../api.js';
import {
  choreTally,
  czDate,
  shortDate,
  eventWho,
  formatOutOf,
  localKey,
  longDate,
  pointsAmount,
  pointsLabel,
  timeLabel,
  todayEvents,
} from '../format.js';
import { personActivity } from '../personActivity.js';
import { handedToLabel, pendingHandoverLabel, takenFromLabel } from '../czech.js';
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

function Avatar({ member }: { member: FamilyMember }) {
  return (
    <span className="fam-person-avatar" aria-hidden="true">
      {member.name.trim()[0]}
    </span>
  );
}

function Presence({ presence }: { presence: FamilyPresence | null }) {
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

function Progress({ counts }: Pick<FamilyMember, 'counts'>) {
  return (
    <span className="fam-person-progress">
      {formatOutOf(counts.done, counts.total)} hotovo
      {counts.pending > 0 && (
        <span className="fam-person-wait">
          <Icon name="clock" size={16} />
          {counts.pending} {czPlural(counts.pending, 'čeká', 'čekají', 'čeká')}
        </span>
      )}
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
        const { done, pending, total } = member.counts;
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
            <span className="fam-person-meter" aria-hidden="true">
              <i style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
              <i data-waiting style={{ width: `${total ? (pending / total) * 100 : 0}%` }} />
            </span>
            <Progress counts={member.counts} />
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

type TaskRow = FamilyChore & { occurrence?: 'carried' | 'missed' };

function ChoreRows({
  rows,
  busy,
  onComplete,
}: {
  rows: TaskRow[];
  busy?: string | null;
  onComplete?(chore: string): void;
}) {
  return (
    <ul>
      {rows.map((chore) => {
        const swap = chore.swap_today;
        const carried = chore.carried_days && chore.due;
        const status =
          swap?.kind === 'pending_give'
            ? pendingHandoverLabel(swap.partner_name)
            : swap?.kind === 'transferred_out' && swap.partner_name
              ? handedToLabel(swap.partner_name)
              : swap?.kind === 'transferred_in' && swap.partner_name
                ? takenFromLabel(swap.partner_name)
                : chore.state === 'claimed'
                  ? 'Čeká na schválení'
                  : undefined;
        return (
          <li
            key={chore.id}
            className="fam-person-task"
            data-testid="family-person-chore"
            data-state={chore.state}
            data-carried-days={chore.carried_days}
            data-muted={swap?.muted || undefined}
            data-missed={chore.occurrence === 'missed' || undefined}
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
                <span className="fam-person-mark" aria-hidden="true" />
              </button>
            ) : (
              <span className="fam-person-mark" aria-hidden="true">
                {chore.state === 'done' && <Icon name="check" size={20} />}
                {chore.state === 'claimed' && <Icon name="clock" size={20} />}
                {chore.occurrence === 'missed' && <Icon name="minus" size={20} />}
                {chore.occurrence === 'carried' && <Icon name="arrow" size={20} />}
                {!onComplete &&
                  !chore.occurrence &&
                  (chore.state === 'todo' || chore.state === 'overdue') && (
                    <Icon name="calendar" size={20} />
                  )}
              </span>
            )}
            <div className="fam-person-task-text">
              <strong>{chore.name}</strong>
              {chore.occurrence ? (
                <small>{chore.occurrence === 'carried' ? 'přeneseno' : 'Zmeškáno'}</small>
              ) : carried ? (
                <small className="fam-person-overdue">
                  Nesplněno od {shortDate(new Date(chore.due!))}
                </small>
              ) : chore.due && chore.state !== 'done' && chore.state !== 'claimed' ? (
                <small>do&nbsp;{timeLabel(chore.due)}</small>
              ) : null}
              {status && (
                <small
                  data-pending={
                    chore.state === 'claimed' || swap?.kind === 'pending_give' || undefined
                  }
                >
                  {status.replace(/ · jen dnes$/u, '')}
                </small>
              )}
              {chore.rotation_turn && <small>Střídá se · na řadě {chore.rotation_turn}</small>}
            </div>
            <span className="fam-person-points">
              {chore.occurrence === 'missed' ? (
                pointsAmount(0)
              ) : swap?.muted ? (
                <s>{pointsLabel(chore.points)}</s>
              ) : (
                pointsLabel(chore.points)
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function TodayChores({
  member,
  now,
  busy,
  onComplete,
}: {
  member: FamilyMember;
  now: Date;
  busy: string | null;
  onComplete(chore: string): void;
}) {
  const groups = [
    {
      label: 'Po termínu',
      rows: member.chores.filter((chore) => chore.state === 'overdue'),
      late: true,
    },
    ...parts.map((label) => ({
      label,
      rows: member.chores.filter((chore) => chore.state !== 'overdue' && part(chore.due) === label),
      late: false,
    })),
  ].filter((group) => group.rows.length);
  const finished = (group: (typeof groups)[number]) =>
    group.rows.every((chore) => chore.state === 'done');
  const count = (rows: FamilyChore[]) => {
    const { done, total } = choreTally(rows.filter((chore) => chore.counts_today !== false));
    return `${formatOutOf(done, total)} hotovo`;
  };
  const current = part(now.toISOString());
  return (
    <section>
      <div className="fam-person-section-head">
        <h2>Úkoly</h2>
        <Progress counts={member.counts} />
      </div>
      <div className="fam-person-surface">
        {!groups.length && <p className="fam-person-empty">Dnes bez úkolů.</p>}
        {groups.map((group) => {
          const label = (
            <>
              <span>
                {group.label}
                {group.label === current && ' · teď'}
              </span>
              <small>{count(group.rows)}</small>
            </>
          );
          const chores = <ChoreRows rows={group.rows} busy={busy} onComplete={onComplete} />;
          return finished(group) ? (
            <details key={group.label} className="fam-person-group fam-person-finished">
              <summary className="fam-person-group-head">{label}</summary>
              {chores}
            </details>
          ) : (
            <section
              className="fam-person-group"
              data-late={group.late || undefined}
              key={group.label}
            >
              <h3 className="fam-person-group-head">{label}</h3>
              {chores}
            </section>
          );
        })}
      </div>
    </section>
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
  return (
    <section data-testid="family-free">
      <div className="fam-person-section-head">
        <h2>Volné úkoly</h2>
        {member && <p>Kdo si úkol vezme první, dostane body po splnění</p>}
      </div>
      <ul className="fam-person-surface">
        {visible.map((chore) => {
          const option = chore.assignees.find(
            (choice) => choice.member === member?.id && choice.can_claim,
          );
          const names = chore.assignees
            .map((choice) => members.find((person) => person.id === choice.member)?.name)
            .filter(Boolean);
          return (
            <li className="fam-person-task fam-person-free" key={chore.assignees[0]?.chore}>
              <span className="fam-person-mark" aria-hidden="true">
                <Icon name="swap" size={20} />
              </span>
              <div className="fam-person-task-text">
                <strong>{chore.name}</strong>
                <small>
                  {chore.due && <>do&nbsp;{timeLabel(chore.due)} · </>}
                  {names.join(' nebo ')}
                </small>
              </div>
              {option && onClaim ? (
                <Button
                  variant="secondary"
                  disabled={claimDisabled || busy === option.chore}
                  onClick={() => onClaim(option.member, option.chore)}
                >
                  Vezmu si to{chore.points != null && ` · +${chore.points}`}
                  <span className="hb-sr-only">: {chore.name}</span>
                </Button>
              ) : (
                <span className="fam-person-points">{pointsLabel(chore.points)}</span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Week({
  member,
  history,
  activity,
}: {
  member: FamilyMember;
  history: ReturnType<typeof usePersonHistory>;
  activity: ReturnType<typeof personActivity>;
}) {
  const { today, days, week } = activity;
  const rows: (TaskRow & { weekDay: string | null })[] = [
    ...member.chores
      .filter((chore) => chore.counts_today !== false && chore.state !== 'done')
      .map((chore) => ({ ...chore, weekDay: today })),
    ...member.chores.flatMap((chore) =>
      chore.carried_days && chore.due
        ? [
            {
              ...chore,
              weekDay: localKey(new Date(chore.due)),
              occurrence: 'carried' as const,
              points: null,
            },
          ]
        : [],
    ),
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
  return (
    <section>
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
          const { done, total } = choreTally(chores);
          return (
            <section
              className="fam-person-group fam-person-day"
              data-today={key === today || undefined}
              key={key}
            >
              <h3 className="fam-person-group-head">
                <span>
                  {key === today ? 'Dnes · ' : ''}
                  {longDate(day)}
                </span>
                <small>
                  {total
                    ? `${formatOutOf(done, total)} hotovo`
                    : history.entries
                      ? 'Bez úkolů'
                      : ''}
                </small>
              </h3>
              {chores.length > 0 && <ChoreRows rows={chores} />}
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
    <section>
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
                  key={`${row.id}/${row.date}`}
                >
                  <span className="fam-person-mark" aria-hidden="true">
                    <Icon name={row.missed ? 'minus' : 'check'} size={20} />
                  </span>
                  <div className="fam-person-task-text">
                    <strong>{row.name}</strong>
                    <small>
                      {row.missed
                        ? 'Zmeškáno'
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

function PersonCalendar({ today }: { today: { event: FamilyEvent; title: string }[] }) {
  if (!today.length) return null;
  return (
    <section>
      <div className="fam-person-section-head">
        <h2>Dnes v kalendáři</h2>
      </div>
      <ul className="fam-person-surface">
        {today.map(({ event, title }) => (
          <li className="fam-person-event" key={event.id}>
            <time>{event.all_day ? 'Celý den' : timeLabel(event.start)}</time>
            <span>
              {title}
              {!event.all_day && <small>do&nbsp;{timeLabel(event.end)}</small>}
            </span>
          </li>
        ))}
      </ul>
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
  refreshedAt,
}: {
  api: FamilyApi;
  member: FamilyMember;
  members: FamilyMember[];
  now: Date;
  events: FamilyEvent[];
  free: FreeChore[];
  busy: string | null;
  refreshedAt: number;
  claimDisabled: boolean;
  onBack(): void;
  onComplete(chore: string): void;
  onClaim(member: string, chore: string): void;
}) {
  const [tab, setTab] = useState<Tab>('Dnes');
  const history = usePersonHistory(api, member.id, refreshedAt);
  const activity = personActivity(member, history.entries ?? [], now);
  const id = useId();
  useBackClosable(onBack);
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
  return (
    <article className="fam-person-view" style={colorStyle(member)} data-testid="family-person">
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
            {history.entries && <p>{pointsAmount(activity.points)} tento týden</p>}
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
        {tab === 'Dnes' && (
          <div className="fam-person-columns">
            <TodayChores member={member} now={now} busy={busy} onComplete={onComplete} />
            <div className="fam-person-side">
              <FreeTasks
                rows={free}
                members={members}
                member={member}
                busy={busy}
                onClaim={onClaim}
                claimDisabled={claimDisabled}
              />
              <PersonCalendar today={today} />
            </div>
          </div>
        )}
        {tab !== 'Dnes' && (
          <div className="fam-person-columns">
            {tab === 'Týden' ? (
              <Week member={member} history={history} activity={activity} />
            ) : (
              <History history={history} activity={activity} />
            )}
            <aside className="fam-person-tab-aside fam-person-side">
              <TodayChores member={member} now={now} busy={busy} onComplete={onComplete} />
              <PersonCalendar today={today} />
            </aside>
          </div>
        )}
      </div>
    </article>
  );
}

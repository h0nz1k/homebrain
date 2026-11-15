import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { usePeople, type ModuleViewProps } from '@homebrain/ha-client';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  PresenceStrip,
  Sheet,
  Skeleton,
  czCount,
} from '@homebrain/ui';
import { getFamilyApi } from '../api.js';
import {
  choreNote,
  choreTally,
  eventWho,
  fmtPoints,
  isPast,
  longDate,
  nextDays,
  nextEvent,
  pointsLabel,
  relLabel,
  sortChores,
  timeLabel,
  todayEvents,
} from '../format.js';
import type { FamilyEvent, FamilyKid, FamilySnapshot } from '../types.js';
import { familyStyles } from './familyStyles.js';
import {
  AddChoreSheet,
  ApprovalsBlock,
  PointsSheet,
  SwapSheet,
  useApprovals,
} from './familySheets.js';

const POLL_MS = 60_000;
const SRC_COLOR = { family: '#3d8bff', school: '#a970ff' } as const;
const KID_COLORS = ['#e879a8', '#2dd4bf', '#f59e0b', '#a78bfa'];

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

function srcStyle(ev: FamilyEvent) {
  return { '--fam-src': SRC_COLOR[ev.kind] ?? SRC_COLOR.family } as React.CSSProperties;
}

interface Member {
  id: string;
  name: string;
  color: string;
}

const membersOf = (snap: FamilySnapshot): Member[] =>
  snap.kids.map((k, i) => ({ id: k.id, name: k.name, color: KID_COLORS[i % KID_COLORS.length]! }));

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
                {timeLabel(next.start)} – {timeLabel(next.end)}
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
                    <time>
                      {ev.all_day ? 'Celý den' : timeLabel(ev.start)}
                      {!ev.all_day && <small>– {timeLabel(ev.end)}</small>}
                    </time>
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
                    {ev.kind === 'school' ? <span className="fam-src">{ev.source}</span> : <span />}
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
                    <li key={ev.id} style={srcStyle(ev)} data-allday={ev.all_day || undefined}>
                      {!ev.all_day && <span>{timeLabel(ev.start)}</span>}
                      <Who ids={who} members={members} />
                      <em>{title}</em>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="fam-free">Volno</p>
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
  onPoints: () => void;
  onMenu?: (kid: string, chore: string) => void;
}

function KidCard({
  kid,
  color,
  now,
  act,
}: {
  kid: FamilyKid;
  color: string;
  now: Date;
  act: Actions;
}) {
  const active = kid.chores.filter((c) => c.counts_today !== false);
  const t = choreTally(active.length ? active : kid.chores);
  return (
    <article
      className="fam-kid"
      style={{ '--fam-kid': color } as React.CSSProperties}
      data-testid="family-kid"
      data-kid={kid.id}
    >
      <div className="fam-kid-h">
        <span className="fam-avatar" aria-hidden="true">
          {kid.name.slice(0, 1)}
        </span>
        <div>
          <b>{kid.name}</b>
          <small>
            <span>{t.total ? `${t.done} z ${t.total} hotovo` : 'Dnes nic'}</span>
            {kid.points !== null && (
              <button
                type="button"
                className="fam-total-link"
                data-testid="family-total"
                onClick={act.onPoints}
              >
                {' '}
                · celkem {Math.round(kid.points)} b. ›
              </button>
            )}
          </small>
        </div>
        {kid.points !== null && (
          <div className="fam-points" data-testid="family-points">
            <strong data-testid="family-today-points">
              {pointsLabel(kid.points_today ?? t.earned)}
            </strong>
            <small>
              dnes
              {t.waiting > 0 && (
                <em data-testid="family-pending-points">+{fmtPoints(t.waiting)} čeká</em>
              )}
            </small>
          </div>
        )}
      </div>
      {t.total > 0 && (
        <div
          className="fam-bar"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={t.total}
          aria-valuenow={t.done}
          aria-label={`${kid.name}: hotovo ${t.done} z ${t.total}`}
        >
          <i style={{ width: `${(t.done / t.total) * 100}%` }} />
          <i data-pending style={{ width: `${(t.pending / t.total) * 100}%` }} />
        </div>
      )}
      <ul className="fam-chores">
        {sortChores(kid.chores).map((c) => {
          const note = choreNote(c, now, { parentApproves: !c.can_approve });
          const ui = c.state === 'overdue' ? 'todo' : c.state;
          const key = `${kid.id}/${c.id}`;
          const pendingSwap = c.swap_today?.kind === 'pending_give';
          const swapLabel =
            c.swap_today?.kind === 'pending_give'
              ? 'Čeká na předání'
              : c.swap_today?.label;
          return (
            <li
              key={c.id}
              className="fam-chore"
              data-state={ui}
              data-muted={c.swap_today?.muted || undefined}
              data-testid="family-chore"
            >
              <button
                type="button"
                className="fam-check"
                data-testid="family-chore-check"
                disabled={!c.can_claim || act.busy === key}
                aria-label={c.can_claim ? `Hotovo: ${c.name}` : `${c.name}: ${note.text}`}
                onClick={() => act.claim(kid.id, c.id)}
              >
                <Check />
              </button>
              <div className="fam-chore-t">
                <b>{c.name}</b>
                <div className="fam-chore-meta">
                  <small data-tone={pendingSwap || c.state === 'claimed' ? 'warn' : note.tone}>
                    {swapLabel ?? (c.state === 'claimed' ? 'Ke schválení' : note.text)}
                  </small>
                </div>
              </div>
              <span className="fam-pts">{pointsLabel(c.points)}</span>
              {(c.can_request_swap || act.onMenu) && (
                <div className="fam-chore-menu">
                  <button
                    type="button"
                    className="fam-overflow"
                    data-testid="family-chore-menu"
                    aria-label={`Akce: ${c.name}`}
                    onClick={() => act.onMenu?.(kid.id, c.id)}
                  >
                    ···
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
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
}: {
  snap: FamilySnapshot;
  now: Date;
  act: Actions;
  members: Member[];
  onAdd: () => void;
  kidAct: (kid: FamilyKid) => Actions;
  onApproval: {
    approveCompletion: (item: import('../types.js').FamilyApproval) => void;
    rejectCompletion: (item: import('../types.js').FamilyApproval) => void;
    approveSwap: (item: import('../types.js').FamilyApproval) => void;
    rejectSwap: (item: import('../types.js').FamilyApproval) => void;
  };
}) {
  if (snap.kids.length === 0) return null;
  const approvals = useApprovals(snap);
  const waiting = approvals.length;
  const parent = snap.role === 'owner' || snap.role === 'adult';
  return (
    <Card className="fam-card" data-testid="family-chores">
      <div className="fam-card-h">
        <h2>{snap.role === 'child' ? 'Moje povinnosti' : 'Povinnosti dětí'}</h2>
        {snap.capabilities?.can_create_chore && parent && (
          <Button size="md" variant="secondary" data-testid="family-add-chore" onClick={onAdd}>
            + Úkol
          </Button>
        )}
        {waiting > 0 && (
          <span className="fam-meta" data-tone="warn">
            {czCount(waiting, 'čeká na schválení', 'čekají na schválení', 'čeká na schválení')}
          </span>
        )}
      </div>
      {parent && (
        <ApprovalsBlock
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
            act={kidAct(kid)}
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
  const [addChore, setAddChore] = useState(false);
  const [swap, setSwap] = useState<{
    kid: string;
    chore: string;
    mode: 'give' | 'reassign';
  } | null>(null);
  const [menu, setMenu] = useState<{ kid: string; chore: string } | null>(null);

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
  const parent = snap.role === 'owner' || snap.role === 'adult';
  const act: Actions = {
    busy,
    claim: (kid, chore) => void run(`${kid}/${chore}`, () => api.claim(kid, chore)),
    onPoints: () => undefined,
    onMenu: parent || snap.role === 'child' ? (kid, chore) => setMenu({ kid, chore }) : undefined,
  };
  const makeKidAct = (kid: FamilyKid): Actions => ({
    ...act,
    onPoints: () => setPointsKid(kid),
  });
  const approvalHandlers = {
    approveCompletion: (item: import('../types.js').FamilyApproval) =>
      void run(`${item.kid_id}/${item.chore_id}`, () => api.approve(item.kid_id!, item.chore_id!)),
    rejectCompletion: () => undefined,
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
  const members = membersOf(snap);
  const slot = (name: string, node: React.ReactNode) => (
    <div className="fam-slot" data-slot={name}>
      {node}
    </div>
  );
  const today = slot('today', <TodayCard snap={snap} now={now} admin={admin} members={members} />);
  const week = slot('week', <WeekCard snap={snap} now={now} members={members} />);
  const chores = slot(
    'chores',
    <ChoresCard
      snap={snap}
      now={now}
      act={act}
      members={members}
      onAdd={() => setAddChore(true)}
      kidAct={makeKidAct}
      onApproval={approvalHandlers}
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
        <PresenceStrip people={people} className="fam-presence" />
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
          onClose={() => setAddChore(false)}
          onCreated={() => void load()}
        />
      )}
      {swap && api && (
        <SwapSheet
          api={api}
          snap={snap}
          choreId={swap.chore}
          kidId={swap.kid}
          mode={swap.mode}
          onClose={() => setSwap(null)}
          onDone={() => void load()}
        />
      )}
      {menu && (
        <Sheet
          title="Akce"
          onClose={() => setMenu(null)}
          appearance="raised"
          data-testid="family-chore-menu-sheet"
        >
          <ul className="fam-menu-list">
            {snap.role === 'child' && (
              <li>
                <button
                  type="button"
                  onClick={() => {
                    setSwap({ kid: menu.kid, chore: menu.chore, mode: 'give' });
                    setMenu(null);
                  }}
                >
                  Předat na dnes…
                </button>
              </li>
            )}
            {parent && (
              <li>
                <button
                  type="button"
                  onClick={() => {
                    setSwap({ kid: menu.kid, chore: menu.chore, mode: 'reassign' });
                    setMenu(null);
                  }}
                >
                  Přeřadit na dnes…
                </button>
              </li>
            )}
          </ul>
        </Sheet>
      )}
    </div>
  );
}

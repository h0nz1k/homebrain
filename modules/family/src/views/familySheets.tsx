import { useEffect, useId, useMemo, useState, type FormEvent } from 'react';
import { useBackClosable } from '@homebrain/ha-client';
import { Button, SegmentedControl, Sheet } from '@homebrain/ui';
import type { FamilyApi } from '../api.js';
import { localKey, timeLabel } from '../format.js';
import type {
  CreateChoreInput,
  FamilyApproval,
  FamilyKid,
  FamilySnapshot,
  PointsHistory,
  PointsSummary,
  Recurrence,
  Weekday,
} from '../types.js';

const WEEKDAYS: { id: Weekday; label: string }[] = [
  { id: 'mon', label: 'Po' },
  { id: 'tue', label: 'Út' },
  { id: 'wed', label: 'St' },
  { id: 'thu', label: 'Čt' },
  { id: 'fri', label: 'Pá' },
  { id: 'sat', label: 'So' },
  { id: 'sun', label: 'Ne' },
];

export function ApprovalsBlock({
  items,
  busy,
  onApproveCompletion,
  onRejectCompletion,
  onApproveSwap,
  onRejectSwap,
}: {
  items: FamilyApproval[];
  busy: string | null;
  onApproveCompletion: (item: FamilyApproval) => void;
  onRejectCompletion: () => void;
  onApproveSwap: (item: FamilyApproval) => void;
  onRejectSwap: (item: FamilyApproval) => void;
}) {
  if (!items.length) return null;
  return (
    <div className="fam-approvals" data-testid="family-approvals">
      <h3>Ke schválení</h3>
      <ul>
        {items.map((item) => {
          const key =
            item.kind === 'swap'
              ? `swap-${item.request_id}`
              : `done-${item.kid_id}-${item.chore_id}`;
          const due = item.due ? timeLabel(item.due) : null;
          return (
            <li key={key} className="fam-approval" data-kind={item.kind}>
              <span className="fam-approval-type">{item.type_label}</span>
              <div className="fam-approval-body">
                <strong>
                  {item.kind === 'swap' ? 'Předání úkolu' : item.chore_name}
                </strong>
                <small>
                  {item.kid_name}
                  {due ? ` · Splnit do ${due}` : ''}
                  {item.points != null ? ` · ${item.points} b.` : ''}
                </small>
              </div>
              <div className="fam-approval-actions">
                {item.kind === 'swap' ? (
                  <>
                    <Button
                      size="md"
                      data-testid="family-swap-approve"
                      disabled={busy === key}
                      onClick={() => onApproveSwap(item)}
                    >
                      Schválit předání
                    </Button>
                    <Button
                      size="md"
                      variant="secondary"
                      disabled={busy === key}
                      onClick={() => onRejectSwap(item)}
                    >
                      Zamítnout
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      size="md"
                      data-testid="family-approve"
                      disabled={busy === key}
                      onClick={() => onApproveCompletion(item)}
                    >
                      Schválit splnění
                    </Button>
                    <Button
                      size="md"
                      variant="secondary"
                      disabled={busy === key}
                      onClick={() => onRejectCompletion(item)}
                    >
                      Vrátit
                    </Button>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function PointsSheet({
  kid,
  api,
  onClose,
}: {
  kid: FamilyKid;
  api: FamilyApi;
  onClose: () => void;
}) {
  useBackClosable(onClose);
  const [days, setDays] = useState<7 | 30>(7);
  const [summary, setSummary] = useState<PointsSummary | null>(kid.points_summary ?? null);
  const [history, setHistory] = useState<PointsHistory | null>(null);
  useEffect(() => {
    void api.pointsGet(kid.kid_uuid ?? kid.id).then(setSummary).catch(() => undefined);
  }, [api, kid.id, kid.kid_uuid]);
  useEffect(() => {
    void api.pointsHistory(kid.kid_uuid ?? kid.id, days).then(setHistory).catch(() => undefined);
  }, [api, kid.id, kid.kid_uuid, days]);
  const net = summary?.net_month;
  const earned = summary?.earned_month;
  const spent = summary?.spent_month;
  return (
    <Sheet
      title={`Body · ${kid.name}`}
      onClose={onClose}
      appearance="raised"
      width="lg"
      stickyFooter
      closeLabel="Zavřít přehled bodů"
      data-testid="family-points-sheet"
    >
      <div className="fam-points-sheet">
        <header className="fam-points-sticky">
          <p className="fam-points-hero" data-testid="family-points-balance">
            {summary?.balance != null ? `${Math.round(summary.balance)} b. k dispozici` : '—'}
          </p>
          {net != null && earned != null && spent != null && (
            <p className="fam-points-month">
              čistě +{Math.round(net)} tento měsíc
              <span>
                získáno {Math.round(earned)} · využito {Math.round(spent)}
              </span>
            </p>
          )}
        </header>
        <dl className="fam-points-stats">
          <div>
            <dt>Získáno dnes</dt>
            <dd>{summary?.earned_today ?? '—'}</dd>
          </div>
          <div>
            <dt>Získáno tento týden</dt>
            <dd>{summary?.earned_week ?? '—'}</dd>
          </div>
          <div>
            <dt>Nejdelší série</dt>
            <dd>{summary?.longest_streak ?? '—'}</dd>
          </div>
          <div>
            <dt>Nejčastější úkol</dt>
            <dd>{summary?.top_chore_month ?? 'Údaj není dostupný'}</dd>
          </div>
        </dl>
        {summary?.sources_month && (
          <ul className="fam-points-sources">
            {Object.entries(summary.sources_month).map(([label, value]) => (
              <li key={label} data-source={label}>
                <i />
                {label}: {value ?? '—'}
              </li>
            ))}
          </ul>
        )}
        <SegmentedControl
          label="Období grafu"
          value={String(days) as '7' | '30'}
          onChange={(v: string) => setDays(Number(v) as 7 | 30)}
          options={[
            ['7', '7 dní'],
            ['30', '30 dní'],
          ]}
        />
        {history?.chart && (
          <p className="fam-chart" data-testid="family-points-chart" aria-hidden="true">
            {history.chart.earned.map((v, i) => (
              <span
                key={history.chart.days[i]}
                style={{ height: `${history.chart.max ? (100 * v) / history.chart.max : 0}%` }}
                data-today={history.chart.days[i] === localKey(new Date()) ? '' : undefined}
              />
            ))}
          </p>
        )}
        {history?.truncated && <p className="fam-hint">Zobrazit vše</p>}
      </div>
    </Sheet>
  );
}

export function AddChoreSheet({
  kids,
  api,
  onClose,
  onCreated,
}: {
  kids: FamilyKid[];
  api: FamilyApi;
  onClose: () => void;
  onCreated: () => void;
}) {
  useBackClosable(onClose);
  const errId = useId();
  const [name, setName] = useState('');
  const [points, setPoints] = useState('2');
  const [assignees, setAssignees] = useState<string[]>(kids[0] ? [kids[0].kid_uuid ?? kids[0].id] : []);
  const [recurrence, setRecurrence] = useState<Recurrence>('daily');
  const [weekdays, setWeekdays] = useState<Weekday[]>(['mon', 'thu']);
  const [firstDate, setFirstDate] = useState(localKey(new Date()));
  const [dueTime, setDueTime] = useState('18:00');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const toggleAssignee = (id: string) =>
    setAssignees((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const toggleDay = (d: Weekday) =>
    setWeekdays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !assignees.length) {
      setError('Vyplňte název a komu úkol patří.');
      return;
    }
    const payload: CreateChoreInput = {
      client_request_id: crypto.randomUUID(),
      name: name.trim(),
      points: Number(points),
      assignees,
      recurrence,
      weekdays: recurrence === 'weekly' ? weekdays : undefined,
      first_date: firstDate,
      due_time: dueTime,
    };
    setBusy(true);
    setError('');
    try {
      await api.createChore(payload);
      onCreated();
      onClose();
    } catch {
      setError('Úkol se nepodařilo uložit.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet
      title="Přidat úkol"
      onClose={onClose}
      appearance="raised"
      stickyFooter
      closeLabel="Zavřít formulář"
      footer={
        <Button type="submit" form="fam-add-chore" disabled={busy} data-testid="family-add-chore-save">
          Uložit úkol
        </Button>
      }
      data-testid="family-add-chore-sheet"
    >
      <form id="fam-add-chore" className="fam-add-chore" onSubmit={(e) => void submit(e)}>
        <label>
          Název
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required />
        </label>
        <label>
          Body
          <input
            value={points}
            onChange={(e) => setPoints(e.target.value)}
            inputMode="decimal"
            aria-describedby={error ? errId : undefined}
          />
          <span className="fam-suffix">b.</span>
        </label>
        <fieldset>
          <legend>Komu</legend>
          <div className="fam-chips">
            {kids.map((k) => {
              const id = k.kid_uuid ?? k.id;
              const on = assignees.includes(id);
              return (
                <button
                  key={id}
                  type="button"
                  className="fam-chip"
                  data-pressed={on || undefined}
                  onClick={() => toggleAssignee(id)}
                >
                  {k.name}
                </button>
              );
            })}
          </div>
        </fieldset>
        <SegmentedControl
          label="Opakování"
          value={recurrence}
          onChange={(v: string) => setRecurrence(v as Recurrence)}
          options={[
            ['once', 'Jednou'],
            ['daily', 'Denně'],
            ['weekly', 'Týdně'],
          ]}
        />
        {recurrence === 'weekly' && (
          <div className="fam-chips">
            {WEEKDAYS.map((d) => (
              <button
                key={d.id}
                type="button"
                className="fam-chip"
                data-pressed={weekdays.includes(d.id) || undefined}
                onClick={() => toggleDay(d.id)}
              >
                {d.label}
              </button>
            ))}
          </div>
        )}
        <label>
          {recurrence === 'once' ? 'Den splnění' : 'První den'}
          <input type="date" value={firstDate} onChange={(e) => setFirstDate(e.target.value)} />
        </label>
        <label>
          Splnit do
          <input type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} />
        </label>
        {error && (
          <p id={errId} className="fam-err" role="alert">
            {error}
          </p>
        )}
      </form>
    </Sheet>
  );
}

export function SwapSheet({
  api,
  snap,
  choreId,
  kidId,
  mode,
  onClose,
  onDone,
}: {
  api: FamilyApi;
  snap: FamilySnapshot;
  choreId: string;
  kidId: string;
  mode: 'give' | 'reassign';
  onClose: () => void;
  onDone: () => void;
}) {
  useBackClosable(onClose);
  const [partners, setPartners] = useState<Array<{ id: string; name: string }>>([]);
  const [target, setTarget] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fromKid = snap.kids.find((k) => k.id === kidId);
  const chore = fromKid?.chores.find((c) => c.id === choreId);
  useEffect(() => {
    void api
      .swapOptions('give', choreId)
      .then((r) => setPartners(r.partners.filter((p) => p.id !== (fromKid?.kid_uuid ?? kidId))))
      .catch(() => undefined);
  }, [api, choreId, fromKid?.kid_uuid, kidId]);
  const submit = async () => {
    if (!fromKid || !target || !chore) return;
    setBusy(true);
    try {
      const payload = {
        client_request_id: crypto.randomUUID(),
        chore: choreId,
        from_kid: fromKid.kid_uuid ?? fromKid.id,
        to_kid: target,
        local_date: localKey(new Date()),
        direction: 'give' as const,
      };
      if (mode === 'reassign') await api.swapReassign(payload);
      else await api.swapRequest(payload);
      onDone();
      onClose();
    } finally {
      setBusy(false);
    }
  };
  const requester =
    snap.role === 'child' ? 'Žádáš ty' : snap.role === 'owner' || snap.role === 'adult' ? 'Přeřadit na dnes' : '';
  return (
    <Sheet
      title={mode === 'reassign' ? 'Přeřadit na dnes' : 'Předat na dnes'}
      onClose={onClose}
      appearance="raised"
      stickyFooter
      closeLabel="Zavřít předání"
      footer={
        <Button
          disabled={!target || target === (fromKid?.kid_uuid ?? kidId) || busy}
          onClick={() => void submit()}
          data-testid="family-swap-submit"
        >
          {mode === 'reassign' ? 'Přeřadit' : 'Poslat rodiči ke schválení'}
        </Button>
      }
      data-testid="family-swap-sheet"
    >
      <div className="fam-swap-sheet">
        {requester && <p className="fam-swap-chip">{requester}</p>}
        <p className="fam-swap-chore">{chore?.name}</p>
        <p className="fam-swap-hint">Body dostane ten, kdo úkol splní.</p>
        <div className="fam-chips">
          {partners.map((p) => (
            <button
              key={p.id}
              type="button"
              className="fam-chip"
              data-pressed={target === p.id || undefined}
              onClick={() => setTarget(p.id)}
            >
              {p.name}
            </button>
          ))}
        </div>
      </div>
    </Sheet>
  );
}

export function useApprovals(snap: FamilySnapshot): FamilyApproval[] {
  return useMemo(() => {
    const base = snap.pending_approvals ?? [];
    const completions =
      snap.role === 'owner' || snap.role === 'adult'
        ? snap.kids.flatMap((kid) =>
            kid.chores
              .filter((c) => c.can_approve && c.state === 'claimed')
              .map(
                (c) =>
                  ({
                    kind: 'completion',
                    type_label: 'Hotovo ke kontrole',
                    kid_id: kid.id,
                    kid_name: kid.name,
                    chore_id: c.id,
                    chore_name: c.name,
                    points: c.points,
                    due: c.due,
                  }) satisfies FamilyApproval,
              ),
          )
        : [];
    const seen = new Set(base.map((b) => (b.kind === 'swap' ? b.request_id : `${b.kid_id}/${b.chore_id}`)));
    return [
      ...base,
      ...completions.filter((c) => !seen.has(`${c.kid_id}/${c.chore_id}`)),
    ];
  }, [snap]);
}
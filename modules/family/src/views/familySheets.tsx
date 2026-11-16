import { useEffect, useId, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useBackClosable } from '@homebrain/ha-client';
import { Button, Chip, Icon, SegmentedControl, Sheet, type IconName } from '@homebrain/ui';
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
  kids,
  colors,
  onApproveCompletion,
  onRejectCompletion,
  onApproveSwap,
  onRejectSwap,
}: {
  items: FamilyApproval[];
  kids: FamilyKid[];
  colors: Record<string, string>;
  busy: string | null;
  onApproveCompletion: (item: FamilyApproval) => void;
  onRejectCompletion: (item: FamilyApproval) => void;
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
          const from = kids.find((k) => (k.kid_uuid ?? k.id) === item.from_kid_id);
          const to = kids.find((k) => (k.kid_uuid ?? k.id) === item.to_kid_id);
          const source = from?.chores.find((c) => c.id === item.chore_id);
          const choreName = item.chore_name ?? source?.name ?? 'Úkol není dostupný';
          const points = item.points ?? source?.points;
          const due = item.due ? timeLabel(item.due) : null;
          return (
            <li key={key} className="fam-approval" data-kind={item.kind}>
              <span className="fam-approval-type">{item.type_label}</span>
              <div className="fam-approval-body">
                <strong>{choreName}</strong>
                <small>
                  {item.kind === 'swap'
                    ? `Žádá ${item.requester_name ?? from?.name ?? 'dítě'} · jen dnes`
                    : item.kid_name}
                  {due ? ` · Splnit do ${due}` : ''}
                  {points != null ? ` · ${points} b.` : ''}
                </small>
                {item.kind === 'swap' && (
                  <div className="fam-transfer">
                    <span className="fam-person-pill">
                      <i style={{ background: colors[from?.id ?? ''] }}>{from?.name[0]}</i>
                      {from?.name ?? 'Původní dítě'}
                    </span>
                    <Icon name="arrow" size={18} />
                    <span className="fam-person-pill">
                      <i style={{ background: colors[to?.id ?? ''] }}>{to?.name[0]}</i>
                      {to?.name ?? 'Náhradník'}
                    </span>
                  </div>
                )}
              </div>
              <div className="fam-approval-actions">
                {item.kind === 'swap' ? (
                  <>
                    <Button
                      size="md"
                      variant="primary"
                      contrast="high"
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
                      variant="primary"
                      contrast="high"
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
  const [showAll, setShowAll] = useState(false);
  const [history, setHistory] = useState<PointsHistory | null>(null);
  useEffect(() => {
    void api
      .pointsGet(kid.kid_uuid ?? kid.id)
      .then(setSummary)
      .catch(() => undefined);
  }, [api, kid.id, kid.kid_uuid]);
  useEffect(() => {
    void api
      .pointsHistory(kid.kid_uuid ?? kid.id, days, showAll ? 1000 : 30)
      .then(setHistory)
      .catch(() => undefined);
  }, [api, kid.id, kid.kid_uuid, days, showAll]);
  const net = summary?.net_month;
  const earned = summary?.earned_month;
  const spent = summary?.spent_month;
  return (
    <Sheet
      title={`Body · ${kid.name}`}
      onClose={onClose}
      appearance="raised"
      isolation="strong"
      width="lg"
      stickyFooter
      closeLabel="Zavřít přehled bodů"
      data-testid="family-points-sheet"
    >
      <div className="fam-points-sheet">
        <header className="fam-points-intro">
          <p className="fam-hint">{kid.name} · k dispozici</p>
          <p className="fam-points-hero" data-testid="family-points-balance">
            {summary?.balance ?? '—'} <small>b.</small>
          </p>
          <p className="fam-earned">
            {net == null ? '—' : `${net >= 0 ? '+' : '−'}${Math.abs(net)}`} čistě tento měsíc
          </p>
          <p className="fam-hint">
            +{earned ?? '—'} získáno · −{spent ?? '—'} využito
          </p>
          <p className="fam-hint">
            Celkem získáno {summary?.earned_all_time ?? '—'} b. · využito{' '}
            {summary?.spent_all_time ?? '—'} b.
          </p>
        </header>
        <dl className="fam-points-stats">
          <div>
            <dt>Dnes</dt>
            <dd>
              +{summary?.earned_today ?? '—'} <small>b.</small>
            </dd>
          </div>
          <div>
            <dt>Týden</dt>
            <dd>
              +{summary?.earned_week ?? '—'} <small>b.</small>
            </dd>
          </div>
          <div>
            <dt>Měsíc</dt>
            <dd>
              +{earned ?? '—'} <small>b.</small>
            </dd>
          </div>
          <div>
            <dt>Nejdelší série · celkově</dt>
            <dd>
              {summary?.longest_streak ?? '—'} <small>splnění</small>
            </dd>
          </div>
        </dl>
        <div className="fam-chart-head">
          <h3>Získané body</h3>
          <SegmentedControl
            label="Období grafu"
            hideLabel
            tone="accent"
            value={String(days)}
            onChange={(v: string) => setDays(Number(v) as 7 | 30)}
            options={[
              ['7', '7 dní'],
              ['30', '30 dní'],
            ]}
          />
        </div>
        {history?.chart ? (
          <figure className="fam-chart-wrap" data-testid="family-points-chart">
            <div className="fam-chart-axis">
              <span>{history.chart.max} b.</span>
              <span>{history.chart.max / 2}</span>
              <span>0</span>
            </div>
            <div
              className="fam-chart"
              role="img"
              aria-label={`Získané body po dnech: ${history.chart.earned.join(', ')}`}
            >
              {history.chart.earned.map((v, i) => (
                <div className="fam-chart-column" key={history.chart.days[i]}>
                  <span
                    style={{ height: `${history.chart.max ? (100 * v) / history.chart.max : 0}%` }}
                    data-today={history.chart.days[i] === localKey(new Date()) ? '' : undefined}
                  />
                  <small>
                    {days === 7
                      ? new Date(`${history.chart.days[i]}T12:00:00`).toLocaleDateString('cs-CZ', {
                          weekday: 'short',
                        })
                      : i % 7 === 0
                        ? new Date(`${history.chart.days[i]}T12:00:00`).getDate()
                        : ''}
                  </small>
                </div>
              ))}
            </div>
            <figcaption>
              <i /> Dnes{!history.chart.coverage_complete && ' · Za část období chybí data'}
            </figcaption>
          </figure>
        ) : (
          <p className="fam-info">Denní historie zatím není dostupná.</p>
        )}
        <section className="fam-sources">
          <h3>
            Odkud jsou body <small>Tento měsíc</small>
          </h3>
          {(['Získáno', 'Utraceno'] as const).map((group) => (
            <div key={group}>
              <h4>{group}</h4>
              <ul className="fam-points-sources">
                {Object.entries(summary?.sources_month ?? {})
                  .filter(
                    ([label, value]) =>
                      value != null &&
                      value !== 0 &&
                      (['Odměny', 'Sankce'].includes(label) || value < 0) ===
                        (group === 'Utraceno'),
                  )
                  .map(([label, value]) => (
                    <li key={label} data-source={label}>
                      <i />
                      {label}
                      <strong className={group === 'Získáno' ? 'fam-earned' : 'fam-spent'}>
                        {group === 'Získáno' ? '+' : '−'}
                        {Math.abs(value!)} b.
                      </strong>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </section>
        <section className="fam-info">
          <h3>Další odměna</h3>
          <p>Další odměna zatím není dostupná. Jakmile bude nastavená, uvidíš tu svůj pokrok.</p>
        </section>
        <section className="fam-history">
          <h3>Poslední pohyby</h3>
          {history?.entries.length ? (
            <ul>
              {history.entries.slice(0, showAll ? undefined : 8).map((entry, i) => (
                <li key={i}>
                  <span>
                    {String(entry.item_name ?? 'Pohyb bodů')}
                    <small>{new Date(String(entry.timestamp)).toLocaleDateString('cs-CZ')}</small>
                  </span>
                  <strong className={Number(entry.amount) >= 0 ? 'fam-earned' : 'fam-spent'}>
                    {Number(entry.amount) >= 0 ? '+' : '−'}
                    {Math.abs(Number(entry.amount))} b.
                  </strong>
                </li>
              ))}
            </ul>
          ) : (
            <p className="fam-hint">Historie bodů zatím není dostupná.</p>
          )}
        </section>
        {history &&
          history.entries.length > 0 &&
          (history.truncated || history.entries.length > 8) &&
          !showAll && (
            <Button variant="ghost" onClick={() => setShowAll(true)}>
              Zobrazit vše
            </Button>
          )}
      </div>
    </Sheet>
  );
}

export function AddChoreSheet({
  kids,
  api,
  onClose,
  onCreated,
  initialKid,
  colors,
}: {
  kids: FamilyKid[];
  api: FamilyApi;
  onClose: () => void;
  onCreated: () => void;
  initialKid?: string;
  colors: Record<string, string>;
}) {
  useBackClosable(onClose);
  const errId = useId();
  const [name, setName] = useState('');
  const [points, setPoints] = useState('2');
  const [assignees, setAssignees] = useState<string[]>(
    initialKid ? [initialKid] : kids[0] ? [kids[0].kid_uuid ?? kids[0].id] : [],
  );
  const [recurrence, setRecurrence] = useState<Recurrence>('daily');
  const [weekdays, setWeekdays] = useState<Weekday[]>(['mon', 'thu']);
  const [firstDateText, setFirstDateText] = useState(() =>
    new Date(Date.now() + 86400000).toLocaleDateString('cs-CZ'),
  );
  const firstDate = firstDateText
    .trim()
    .split(/\.\s*/)
    .reverse()
    .map((v, i) => (i === 0 ? v : v.padStart(2, '0')))
    .join('-');
  const [icon, setIcon] = useState('mdi:broom');
  const [requestId] = useState(() => crypto.randomUUID());
  const [dueTime, setDueTime] = useState('18:00');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [openedAt] = useState(() => Date.now());
  const chooseSchedule = (nextRecurrence: Recurrence, nextDays: Weekday[]) => {
    setRecurrence(nextRecurrence);
    setWeekdays(nextDays);
    if (nextRecurrence !== 'weekly' || !nextDays.length || !/^\d{4}-\d{2}-\d{2}$/.test(firstDate))
      return;
    const day = new Date(`${firstDate}T12:00:00`);
    if (Number.isNaN(day.getTime())) return;
    for (let i = 0; i < 7; i++) {
      if (nextDays.includes(WEEKDAYS[(day.getDay() + 6) % 7]!.id)) break;
      day.setDate(day.getDate() + 1);
    }
    setFirstDateText(day.toLocaleDateString('cs-CZ'));
  };
  const toggleAssignee = (id: string) =>
    setAssignees((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const toggleDay = (d: Weekday) =>
    chooseSchedule(
      recurrence,
      weekdays.includes(d) ? weekdays.filter((x) => x !== d) : [...weekdays, d],
    );
  const valid =
    !!name.trim() &&
    assignees.length > 0 &&
    Number.isFinite(Number(points)) &&
    Number(points) >= 0 &&
    Number(points) <= 1000 &&
    /^(?:\d+)(?:\.\d{1,2})?$/.test(points) &&
    (recurrence !== 'weekly' || weekdays.length > 0) &&
    /^\d{4}-\d{2}-\d{2}$/.test(firstDate) &&
    !Number.isNaN(new Date(`${firstDate}T12:00:00`).getTime()) &&
    localKey(new Date(`${firstDate}T12:00:00`)) === firstDate &&
    /^([01]\d|2[0-3]):[0-5]\d$/.test(dueTime) &&
    new Date(`${firstDate}T${dueTime}`).getTime() > openedAt;
  const summaryText = `${kids
    .filter((k) => assignees.includes(k.kid_uuid ?? k.id))
    .map((k) => k.name)
    .join(', ')} · ${
    recurrence === 'weekly'
      ? WEEKDAYS.filter((d) => weekdays.includes(d.id))
          .map((d) => d.label)
          .join(' a ')
      : recurrence === 'daily'
        ? 'Denně'
        : 'Jednou'
  } v ${dueTime} · ${points} b.`;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid || busy || new Date(`${firstDate}T${dueTime}`).getTime() <= new Date().getTime()) {
      setError('Vyplňte název a komu úkol patří.');
      return;
    }
    const payload: CreateChoreInput = {
      client_request_id: requestId,
      name: name.trim(),
      points: Number(points),
      assignees,
      recurrence,
      weekdays: recurrence === 'weekly' ? weekdays : undefined,
      first_date: firstDate,
      due_time: dueTime,
      icon,
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
      isolation="strong"
      stickyFooter
      closeLabel="Zavřít formulář"
      footer={
        <div>
          {!valid && <p className="fam-hint">Vyplň název, příjemce a budoucí termín.</p>}
          <Button
            variant="primary"
            contrast="high"
            type="submit"
            form="fam-add-chore"
            disabled={busy || !valid}
            data-testid="family-add-chore-save"
          >
            {busy ? 'Ukládám…' : 'Uložit úkol'}
          </Button>
        </div>
      }
      data-testid="family-add-chore-sheet"
    >
      <form id="fam-add-chore" className="fam-add-chore" onSubmit={(e) => void submit(e)}>
        <label>
          Název
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            placeholder="Např. Zalít květiny"
            required
          />
        </label>
        <div className="fam-form-points">
          <label htmlFor="fam-chore-points">Body</label>
          <div className="fam-stepper">
            <Button
              variant="ghost"
              aria-label="Ubrat bod"
              onClick={() => setPoints(String(Math.max(0, Number(points) - 1)))}
            >
              −
            </Button>
            <input
              id="fam-chore-points"
              aria-describedby={error ? errId : undefined}
              value={points}
              onChange={(e) => setPoints(e.target.value)}
              inputMode="decimal"
            />
            <span>b.</span>
            <Button
              variant="ghost"
              aria-label="Přidat bod"
              onClick={() => setPoints(String(Math.min(1000, Number(points) + 1)))}
            >
              +
            </Button>
          </div>
        </div>
        <fieldset>
          <legend>Ikona · volitelné</legend>
          <details className="fam-icon-picker">
            <summary>
              <Icon
                name={
                  (
                    {
                      'mdi:broom': 'broom',
                      'mdi:trash-can-outline': 'trash',
                      'mdi:flower': 'flower',
                      'mdi:food': 'food',
                    } as Record<string, IconName>
                  )[icon]!
                }
                size={20}
              />
              {
                (
                  {
                    'mdi:broom': 'Úklid',
                    'mdi:trash-can-outline': 'Koš',
                    'mdi:flower': 'Květina',
                    'mdi:food': 'Jídlo',
                  } as Record<string, string>
                )[icon]
              }
              <Icon name="chevron" size={16} />
            </summary>
            <div className="fam-chips">
              {[
                ['mdi:broom', 'Úklid'],
                ['mdi:trash-can-outline', 'Koš'],
                ['mdi:flower', 'Květina'],
                ['mdi:food', 'Jídlo'],
              ].map(([value, label]) => (
                <Chip
                  className="fam-chip"
                  key={value}
                  onPress={() => setIcon(value!)}
                  look="soft"
                  pressed={icon === value}
                >
                  <Icon
                    name={
                      (
                        {
                          'mdi:broom': 'broom',
                          'mdi:trash-can-outline': 'trash',
                          'mdi:flower': 'flower',
                          'mdi:food': 'food',
                        } as Record<string, IconName>
                      )[value!]!
                    }
                    size={18}
                  />
                  {label}
                </Chip>
              ))}
            </div>
          </details>
        </fieldset>
        <fieldset>
          <legend>Komu</legend>
          <div className="fam-chips">
            {kids.map((k) => {
              const id = k.kid_uuid ?? k.id;
              const on = assignees.includes(id);
              return (
                <Chip
                  key={id}
                  className="fam-chip"
                  onPress={() => toggleAssignee(id)}
                  look="soft"
                  pressed={on}
                >
                  <span className="fam-partner-avatar" style={{ background: colors[k.id] }}>
                    {k.name[0]}
                  </span>
                  {k.name}
                </Chip>
              );
            })}
          </div>
        </fieldset>
        <SegmentedControl
          label="Opakování"
          tone="accent"
          value={recurrence}
          onChange={(v: string) => chooseSchedule(v as Recurrence, weekdays)}
          options={[
            ['once', 'Jednou'],
            ['daily', 'Denně'],
            ['weekly', 'Vybrané dny'],
          ]}
        />
        {recurrence === 'weekly' && (
          <div className="fam-chips">
            {WEEKDAYS.map((d) => (
              <Chip
                key={d.id}
                className="fam-chip"
                onPress={() => toggleDay(d.id)}
                look="soft"
                pressed={weekdays.includes(d.id)}
              >
                {d.label}
              </Chip>
            ))}
          </div>
        )}
        <div className="fam-form-dates">
          <label>
            {recurrence === 'once' ? 'Den splnění' : 'První den'}
            <input
              aria-label="První den"
              placeholder="DD. MM. RRRR"
              value={firstDateText}
              onChange={(e) => setFirstDateText(e.target.value)}
              onBlur={() => chooseSchedule(recurrence, weekdays)}
            />
          </label>
          <label>
            Splnit do
            <input
              type="text"
              inputMode="numeric"
              placeholder="18:00"
              value={dueTime}
              onChange={(e) => setDueTime(e.target.value)}
            />
          </label>
        </div>
        <p className="fam-hint" data-testid="family-chore-summary">
          {summaryText}
        </p>
        <p className="fam-hint">
          {assignees.length > 1
            ? 'Každý plní svůj úkol. Splnění schvaluje rodič.'
            : 'Splnění schvaluje rodič.'}
        </p>
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
  colors,
  onClose,
  onDone,
}: {
  api: FamilyApi;
  snap: FamilySnapshot;
  choreId: string;
  kidId: string;
  mode: 'give' | 'reassign';
  colors: Record<string, string>;
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
      .then((r) => {
        const available = r.partners.filter((p) => p.id !== (fromKid?.kid_uuid ?? kidId));
        setPartners(available);
        if (available.length === 1) setTarget(available[0]!.id);
      })
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
  return (
    <Sheet
      title={mode === 'reassign' ? 'Přeřadit na dnes' : 'Předat na dnes'}
      onClose={onClose}
      appearance="raised"
      isolation="strong"
      stickyFooter
      closeLabel="Zavřít předání"
      footer={
        <Button
          variant="primary"
          contrast="high"
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
        <div className="fam-swap-chore">
          <Icon
            name={chore?.name.toLocaleLowerCase('cs').includes('koš') ? 'trash' : 'broom'}
            size={26}
          />
          <div>
            <strong>{chore?.name}</strong>
            <p className="fam-hint">
              {fromKid?.name} · {chore?.points} b.
              {chore?.due ? ` · Splnit do ${timeLabel(chore.due)}` : ''}
            </p>
          </div>
        </div>
        <h3>Komu?</h3>
        <div className="fam-chips">
          {partners.map((p) => (
            <Chip
              key={p.id}
              className="fam-chip"
              onPress={() => setTarget(p.id)}
              look="soft"
              pressed={target === p.id}
            >
              <span
                className="fam-partner-avatar"
                style={{ background: colors[p.id] ?? colors[p.name] }}
              >
                {p.name[0]}
              </span>
              {p.name}
              {target === p.id && <Icon name="arrow" size={18} />}
            </Chip>
          ))}
        </div>
        <div className="fam-info">
          <Icon name="info" size={20} />
          <div>
            <strong>{mode === 'reassign' ? 'Jen pro dnešek' : 'Nejdřív schválí rodič'}</strong>
            <p>
              {mode === 'reassign'
                ? 'Přeřazení platí ihned. Zítra má úkol původní přiřazení.'
                : 'Jen na dnes. Dokud to rodič neschválí, úkol zůstává tobě.'}
            </p>
          </div>
        </div>
        <p className="fam-hint">Body dostane ten, kdo úkol splní.</p>
        {!target && <p className="fam-hint">Vyber, komu chceš úkol předat.</p>}
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
              .filter(
                (c) =>
                  c.can_approve && c.state === 'claimed' && c.swap_today?.kind !== 'pending_give',
              )
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
    const seen = new Set(
      base.map((b) => (b.kind === 'swap' ? b.request_id : `${b.kid_id}/${b.chore_id}`)),
    );
    return [...base, ...completions.filter((c) => !seen.has(`${c.kid_id}/${c.chore_id}`))];
  }, [snap]);
}

export function ChoreMenuSheet({
  onClose,
  children,
}: {
  onClose: () => void;
  children: ReactNode;
}) {
  useBackClosable(onClose);
  return (
    <Sheet
      title="Akce úkolu"
      onClose={onClose}
      appearance="raised"
      isolation="strong"
      closeLabel="Zavřít akce"
      data-testid="family-chore-menu-sheet"
    >
      {children}
    </Sheet>
  );
}

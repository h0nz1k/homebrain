import {
  useEffect,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from 'react';
import { useBackClosable } from '@homebrain/ha-client';
import {
  Button,
  Chip,
  Icon,
  SegmentedControl,
  Sheet,
  czPlural,
  type IconName,
} from '@homebrain/ui';
import type { FamilyApi } from '../api.js';
import { pointsWord } from '../czech.js';
import {
  czDate,
  fmtPoints,
  localKey,
  monthPoints,
  pointsAmount,
  pointsLabel,
  timeLabel,
} from '../format.js';
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
          const swap = item.kind === 'swap';
          return (
            <li key={key} className="fam-approval" data-kind={item.kind}>
              <div className="fam-approval-top">
                <span className="fam-approval-type" data-kind={item.kind}>
                  <Icon name={swap ? 'swap' : 'check'} size={16} />
                  {swap ? 'Předání na dnes' : 'Splnění ke kontrole'}
                </span>
                {points != null && (
                  <span className="fam-approval-pts" data-testid="family-approval-points">
                    +{points} b.
                  </span>
                )}
              </div>
              <div className="fam-approval-body">
                <strong>{choreName}</strong>
                <small>
                  {swap
                    ? `Žádá ${item.requester_name ?? from?.name ?? 'dítě'}`
                    : `Hotovo hlásí ${item.kid_name ?? 'dítě'}`}
                  {due ? ` · splnit do ${due}` : ''}
                </small>
                {swap && (
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

/** Chart ceiling with ~20 % headroom on an even number, so the mid tick stays whole. */
export function chartCeiling(max: number): number {
  if (!(max > 0)) return 2;
  return Math.max(2, Math.ceil((max * 1.2) / 2) * 2);
}

export function PointsSheet({
  kid,
  api,
  onClose,
  words,
}: {
  kid: FamilyKid;
  api: FamilyApi;
  onClose: () => void;
  /** Kid-facing unit („128 bodů“) when a child looks at their own points. */
  words?: boolean;
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
  const month = monthPoints(summary);
  const { net, earned } = month;
  const unit = { words };
  const ceiling = history?.chart ? chartCeiling(history.chart.max) : 0;
  const signed = (v: number | null | undefined) =>
    v == null ? '—' : v >= 0 ? pointsLabel(v, unit) : `−${pointsAmount(Math.abs(v), unit)}`;
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
          <p className="fam-points-label">K dispozici</p>
          <p className="fam-points-hero" data-testid="family-points-balance">
            {summary?.balance ?? '—'}{' '}
            <small>{words && summary?.balance != null ? pointsWord(summary.balance) : 'b.'}</small>
          </p>
          <p className="fam-earned" data-testid="family-points-month">
            Tento měsíc čistě {signed(net)}
          </p>
          <p className="fam-hint">
            Celkem získáno {summary?.earned_all_time ?? '—'} · utraceno{' '}
            {summary?.spent_all_time ?? '—'}
          </p>
        </header>
        <dl className="fam-points-stats">
          <div>
            <dt>Dnes</dt>
            <dd>
              +{summary?.earned_today ?? '—'}{' '}
              <small>{words ? pointsWord(summary?.earned_today ?? 0) : 'b.'}</small>
            </dd>
          </div>
          <div>
            <dt>7 dní</dt>
            <dd>
              +{summary?.earned_week ?? '—'}{' '}
              <small>{words ? pointsWord(summary?.earned_week ?? 0) : 'b.'}</small>
            </dd>
          </div>
          <div>
            <dt>Měsíc získáno</dt>
            <dd data-testid="family-points-month-earned">
              +{earned ?? '—'} <small>{words ? pointsWord(earned ?? 0) : 'b.'}</small>
            </dd>
          </div>
          <div data-kind="streak">
            <dt>Nejdelší série</dt>
            <dd data-testid="family-points-streak">
              {summary?.longest_streak ?? '—'}{' '}
              <small>
                {summary?.longest_streak == null
                  ? 'dní v řadě'
                  : `${czPlural(summary.longest_streak, 'den', 'dny', 'dní')} v řadě`}
              </small>
            </dd>
          </div>
        </dl>
        <div className="fam-chart-head">
          <h3>Získané body</h3>
          <SegmentedControl
            label="Období grafu"
            hideLabel
            tone="solid"
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
            <div className="fam-chart-axis" data-testid="family-points-axis">
              <span>{fmtPoints(ceiling)}</span>
              <span>{fmtPoints(ceiling / 2)}</span>
              <span>0</span>
            </div>
            <div
              className="fam-chart"
              role="img"
              aria-label={`Získané body po dnech: ${history.chart.earned.join(', ')}`}
            >
              {history.chart.earned.map((v, i) => {
                const today = history.chart.days[i] === localKey(new Date()) ? '' : undefined;
                return (
                  <div className="fam-chart-column" key={history.chart.days[i]} data-today={today}>
                    <span
                      style={{ height: `${ceiling ? (100 * v) / ceiling : 0}%` }}
                      data-today={today}
                    >
                      {today !== undefined && (
                        <b className="fam-chart-value" data-testid="family-points-today-value">
                          +{fmtPoints(v)}
                        </b>
                      )}
                    </span>
                    <small>
                      {days === 7
                        ? new Date(`${history.chart.days[i]}T12:00:00`).toLocaleDateString(
                            'cs-CZ',
                            {
                              weekday: 'short',
                            },
                          )
                        : i % 7 === 0
                          ? new Date(`${history.chart.days[i]}T12:00:00`).getDate()
                          : ''}
                    </small>
                  </div>
                );
              })}
            </div>
            {!history.chart.coverage_complete && (
              <figcaption>Za část období chybí data.</figcaption>
            )}
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
              <h4>
                {group} <span>{group === 'Získáno' ? '(+)' : '(−)'}</span>
              </h4>
              <ul
                className="fam-points-sources"
                data-testid={`family-points-${group === 'Získáno' ? 'earned' : 'spent'}`}
              >
                {(group === 'Získáno' ? month.earnedSources : month.spentSources).map(
                  ([label, value]) => (
                    <li key={label} data-source={label}>
                      <i />
                      {label}
                      <strong className={group === 'Získáno' ? 'fam-earned' : 'fam-spent'}>
                        {group === 'Získáno' ? '+' : '−'}
                        {pointsAmount(value, unit)}
                      </strong>
                    </li>
                  ),
                )}
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
                    <small>{czDate(new Date(String(entry.timestamp)), { year: true })}</small>
                  </span>
                  <strong className={Number(entry.amount) >= 0 ? 'fam-earned' : 'fam-spent'}>
                    {Number(entry.amount) >= 0 ? '+' : '−'}
                    {pointsAmount(Math.abs(Number(entry.amount)), unit)}
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

const ICONS: ReadonlyArray<readonly [string, string, IconName]> = [
  ['mdi:broom', 'Úklid', 'broom'],
  ['mdi:delete-empty-outline', 'Koš', 'bin'],
  ['mdi:flower', 'Květina', 'flower'],
  ['mdi:food', 'Jídlo', 'food'],
];

/** „Po, St a Pá“ */
function joinCz(items: string[]): string {
  return items.length > 1
    ? `${items.slice(0, -1).join(', ')} a ${items.at(-1)}`
    : (items[0] ?? '—');
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
  const nameErrId = useId();
  const [name, setName] = useState('');
  const [points, setPoints] = useState(2);
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
  const [icon, setIcon] = useState('');
  const [iconOpen, setIconOpen] = useState(false);
  const [requestId] = useState(() => crypto.randomUUID());
  const [dueTime, setDueTime] = useState('18:00');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const [nameDirty, setNameDirty] = useState(false);
  const [submitted, setSubmitted] = useState(false);
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
  const dateOk =
    /^\d{4}-\d{2}-\d{2}$/.test(firstDate) &&
    !Number.isNaN(new Date(`${firstDate}T12:00:00`).getTime()) &&
    localKey(new Date(`${firstDate}T12:00:00`)) === firstDate;
  const timeOk = /^([01]\d|2[0-3]):[0-5]\d$/.test(dueTime);
  const futureOk = dateOk && timeOk && new Date(`${firstDate}T${dueTime}`).getTime() > openedAt;
  const problems = {
    name: !name.trim() ? 'Doplň název úkolu.' : '',
    who: !assignees.length ? 'Vyber, komu úkol patří.' : '',
    days: recurrence === 'weekly' && !weekdays.length ? 'Vyber aspoň jeden den.' : '',
    when: !dateOk
      ? 'Zadej datum ve tvaru 17. 11. 2026.'
      : !timeOk
        ? 'Zadej čas ve tvaru 18:00.'
        : !futureOk
          ? 'Termín musí být v budoucnu.'
          : '',
  };
  const valid = !Object.values(problems).some(Boolean);
  const showName = (nameTouched || submitted) && problems.name;
  const startLabel = dateOk ? czDate(new Date(`${firstDate}T12:00:00`)) : '—';
  const dayList = WEEKDAYS.filter((d) => weekdays.includes(d.id)).map((d) => d.label);
  const who =
    kids
      .filter((k) => assignees.includes(k.kid_uuid ?? k.id))
      .map((k) => k.name)
      .join(' a ') || 'Nikdo';
  // Date/time tokens stay on one line (no-break spaces + nowrap span).
  const tok = (text: string) => (
    <span className="fam-nowrap" data-testid="family-summary-token">
      {text}
    </span>
  );
  const due = tok(`do\u00a0${dueTime}`);
  const since = tok(`od\u00a0${startLabel}`);
  const scheduleText =
    recurrence === 'weekly' ? (
      <>
        {joinCz(dayList)} {due} · {since}
      </>
    ) : recurrence === 'daily' ? (
      <>
        každý den {due} · {since}
      </>
    ) : (
      <>
        {tok(startLabel)} {due}
      </>
    );
  const summaryText = (
    <>
      {who} · {`${points}\u00a0b.`} · {scheduleText}
    </>
  );
  const dueLabel =
    recurrence === 'daily'
      ? 'Každý den do'
      : recurrence === 'weekly'
        ? 'V tyto dny do'
        : 'Splnit do';
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (!valid || busy || new Date(`${firstDate}T${dueTime}`).getTime() <= new Date().getTime()) {
      if (problems.name) document.getElementById('fam-chore-name')?.focus();
      return;
    }
    const payload: CreateChoreInput = {
      client_request_id: requestId,
      name: name.trim(),
      points,
      assignees,
      recurrence,
      weekdays: recurrence === 'weekly' ? weekdays : undefined,
      first_date: firstDate,
      due_time: dueTime,
      icon: icon || undefined,
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
  const chosenIcon = ICONS.find(([value]) => value === icon);
  const fieldErr = (text: string, testid?: string) =>
    submitted && text ? (
      <p className="fam-field-err" data-testid={testid}>
        {text}
      </p>
    ) : null;
  return (
    <Sheet
      title="Přidat úkol"
      onClose={onClose}
      appearance="raised"
      isolation="strong"
      stickyFooter
      closeLabel="Zavřít formulář"
      footer={
        <Button
          variant="primary"
          contrast="high"
          type="submit"
          form="fam-add-chore"
          disabled={busy}
          aria-describedby={submitted && !valid ? errId : undefined}
          data-testid="family-add-chore-save"
          data-invalid={!valid || undefined}
          className="fam-cta"
        >
          {busy ? 'Ukládám…' : 'Uložit úkol'}
        </Button>
      }
      data-testid="family-add-chore-sheet"
    >
      <form
        id="fam-add-chore"
        className="fam-add-chore"
        noValidate
        onSubmit={(e) => void submit(e)}
      >
        <div className="fam-field">
          <label htmlFor="fam-chore-name">Název</label>
          <input
            id="fam-chore-name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setNameDirty(true);
            }}
            // Blur validates only an edited field: tabbing through an untouched form must not
            // insert errors (and shift the layout under the pointer).
            onBlur={() => nameDirty && setNameTouched(true)}
            maxLength={80}
            placeholder="Např. Zalít květiny"
            aria-invalid={showName ? true : undefined}
            aria-describedby={showName ? nameErrId : undefined}
          />
          {showName && (
            <p id={nameErrId} className="fam-field-err" data-testid="family-name-error">
              {problems.name}
            </p>
          )}
        </div>
        <div className="fam-form-points">
          <label htmlFor="fam-chore-points">Body</label>
          <div className="fam-stepper">
            <Button
              variant="secondary"
              size="sm"
              icon={<Icon name="minus" size={18} />}
              aria-label="Ubrat bod"
              disabled={points <= 0}
              onClick={() => setPoints((p) => Math.max(0, p - 1))}
            />
            <output
              id="fam-chore-points"
              className="fam-stepper-val"
              aria-live="polite"
              data-testid="family-points-value"
            >
              <b>{points}</b>
              <span>b.</span>
            </output>
            <Button
              variant="secondary"
              size="sm"
              icon={<Icon name="plus" size={18} />}
              aria-label="Přidat bod"
              disabled={points >= 100}
              onClick={() => setPoints((p) => Math.min(100, p + 1))}
            />
          </div>
        </div>
        <div className="fam-form-icon">
          <span className="fam-label" id="fam-icon-label">
            Ikona <small>· volitelné</small>
          </span>
          <button
            type="button"
            className="fam-icon-pick"
            aria-expanded={iconOpen}
            aria-labelledby="fam-icon-label fam-icon-value"
            data-testid="family-icon-pick"
            onClick={() => setIconOpen((v) => !v)}
          >
            {chosenIcon && <Icon name={chosenIcon[2]} size={20} />}
            <span id="fam-icon-value" data-empty={!chosenIcon || undefined}>
              {chosenIcon ? chosenIcon[1] : 'Vybrat'}
            </span>
            <Icon name="chevron" size={16} />
          </button>
        </div>
        {iconOpen && (
          <div className="fam-chips fam-icon-chips" role="group" aria-label="Ikona">
            {ICONS.map(([value, label, glyph]) => (
              <Chip
                className="fam-chip"
                key={value}
                onPress={() => {
                  setIcon(icon === value ? '' : value);
                  setIconOpen(false);
                }}
                pressed={icon === value}
              >
                <Icon name={glyph} size={18} />
                {label}
              </Chip>
            ))}
          </div>
        )}
        <fieldset>
          <legend>Komu {kids.length > 1 && <small>· můžeš vybrat víc dětí</small>}</legend>
          <div className="fam-chips">
            {kids.map((k) => {
              const id = k.kid_uuid ?? k.id;
              const on = assignees.includes(id);
              return (
                <Chip
                  key={id}
                  className="fam-chip fam-who-chip"
                  onPress={() => toggleAssignee(id)}
                  pressed={on}
                >
                  <span className="fam-partner-avatar" style={{ background: colors[k.id] }}>
                    {k.name[0]}
                  </span>
                  {k.name}
                  <span className="fam-chip-tick" aria-hidden="true">
                    {on && <Icon name="check" size={16} />}
                  </span>
                </Chip>
              );
            })}
          </div>
          {fieldErr(problems.who)}
        </fieldset>
        <SegmentedControl
          label="Opakování"
          tone="solid"
          value={recurrence}
          onChange={(v: string) => chooseSchedule(v as Recurrence, weekdays)}
          options={[
            ['once', 'Jednou'],
            ['daily', 'Denně'],
            ['weekly', 'Vybrané dny'],
          ]}
        />
        {recurrence === 'weekly' && (
          <div className="fam-weekdays-wrap">
            <div className="fam-chips fam-weekdays" role="group" aria-label="Dny v týdnu">
              {WEEKDAYS.map((d) => (
                <Chip
                  key={d.id}
                  className="fam-chip"
                  onPress={() => toggleDay(d.id)}
                  pressed={weekdays.includes(d.id)}
                >
                  {d.label}
                </Chip>
              ))}
            </div>
            {fieldErr(problems.days)}
          </div>
        )}
        <div className="fam-form-dates">
          <label>
            {recurrence === 'once' ? 'Den splnění' : 'Od kdy'}
            <span className="fam-input-icon">
              <input
                aria-label={recurrence === 'once' ? 'Den splnění' : 'První den'}
                placeholder="DD. MM. RRRR"
                inputMode="numeric"
                value={firstDateText}
                onChange={(e) => setFirstDateText(e.target.value)}
                onBlur={() => chooseSchedule(recurrence, weekdays)}
              />
              <Icon name="calendar" size={20} />
            </span>
          </label>
          <label>
            {dueLabel}
            <span className="fam-input-icon">
              <input
                type="text"
                inputMode="numeric"
                placeholder="18:00"
                value={dueTime}
                onChange={(e) => setDueTime(e.target.value)}
                data-testid="family-due-time"
              />
              <Icon name="clock" size={20} />
            </span>
          </label>
          {fieldErr(problems.when)}
        </div>
        <div className="fam-summary" data-testid="family-chore-summary-box">
          <Icon name="calendar" size={18} />
          <div>
            <strong data-testid="family-chore-summary">{summaryText}</strong>
            <p className="fam-hint">
              {assignees.length > 1
                ? 'Každý plní svůj úkol. Splnění schvaluje rodič.'
                : 'Splnění schvaluje rodič.'}
            </p>
          </div>
        </div>
        {submitted && !valid && (
          <p id={errId} className="hb-sr-only">
            {Object.values(problems).filter(Boolean).join(' ')}
          </p>
        )}
        {error && (
          <p className="fam-err" role="alert">
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
          className="fam-cta"
        >
          {mode === 'reassign' ? 'Přeřadit' : 'Poslat rodiči ke schválení'}
        </Button>
      }
      data-testid="family-swap-sheet"
    >
      <div className="fam-swap-sheet">
        <div className="fam-swap-chore">
          <span
            className="fam-icon-tile"
            style={{ '--fam-kid': colors[fromKid?.id ?? ''] } as CSSProperties}
          >
            <Icon
              name={chore?.name.toLocaleLowerCase('cs').includes('koš') ? 'bin' : 'broom'}
              size={24}
            />
          </span>
          <div>
            <strong>{chore?.name}</strong>
            <p className="fam-hint" data-testid="family-swap-chore-meta">
              {[
                mode === 'reassign' ? fromKid?.name : null,
                chore?.due ? `dnes do ${timeLabel(chore.due)}` : 'dnes',
                chore?.points != null
                  ? pointsAmount(chore.points, { words: mode === 'give' })
                  : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
        </div>
        {partners.length === 1 ? (
          <div className="fam-recipient" data-testid="family-swap-recipient">
            <span className="fam-recipient-label">Komu</span>
            <span
              className="fam-partner-avatar"
              style={{ background: colors[partners[0]!.id] ?? colors[partners[0]!.name] }}
              aria-hidden="true"
            >
              {partners[0]!.name[0]}
            </span>
            <strong>{partners[0]!.name}</strong>
          </div>
        ) : (
          <>
            <h3>Komu?</h3>
            <div className="fam-chips fam-person-chips" role="group" aria-label="Komu">
              {partners.map((p) => (
                <Chip
                  key={p.id}
                  className="fam-chip"
                  onPress={() => setTarget(p.id)}
                  pressed={target === p.id}
                >
                  <span
                    className="fam-partner-avatar"
                    style={{ background: colors[p.id] ?? colors[p.name] }}
                  >
                    {p.name[0]}
                  </span>
                  {p.name}
                  {target === p.id && <Icon name="check" size={18} className="fam-chip-check" />}
                </Chip>
              ))}
            </div>
          </>
        )}
        <div className="fam-info" data-tone="accent">
          <span className="fam-info-icon">
            <Icon name="info" size={20} />
          </span>
          <div>
            <strong>{mode === 'reassign' ? 'Jen pro dnešek' : 'Nejdřív schválí rodič'}</strong>
            <p>
              {mode === 'reassign'
                ? 'Přeřazení platí hned. Zítra má úkol zase původní přiřazení.'
                : 'Dokud to rodič neschválí, úkol zůstává na tobě.'}{' '}
              Body dostane ten, kdo úkol splní.
            </p>
          </div>
        </div>
        {!target && partners.length > 1 && (
          <p className="fam-hint">Vyber, komu chceš úkol předat.</p>
        )}
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
                    type_label: 'Splnění ke kontrole',
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

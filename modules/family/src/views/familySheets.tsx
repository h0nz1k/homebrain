import {
  useEffect,
  useId,
  useMemo,
  useRef,
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
import { ChorePicker } from './ChorePicker.js';
import { newRequestId } from '../uid.js';
import { nameAccusative } from '../czech.js';
import {
  CREATE_CHORE_ERRORS,
  choreManagementError,
  createChoreErrorCode,
  nextDistinctName,
  withTimeout,
  type CreateChoreErrorCode,
} from '../errors.js';
import {
  czDate,
  datedHandover,
  dayWord,
  defaultFirstDate,
  fmtPoints,
  localKey,
  monthPoints,
  nextTodayTime,
  reassignDueTime,
  pointsAmount,
  pointsLabel,
  pointsParts,
  shortDate,
  timeLabel,
} from '../format.js';
import type {
  ChoreManagement,
  CreateChoreInput,
  DeleteChoreScope,
  FamilyApproval,
  FamilyKid,
  FamilySnapshot,
  PointsHistory,
  PointsSummary,
  Recurrence,
  Weekday,
} from '../types.js';

/** Same avatar fill as the kid card (`.fam-avatar`), so one kid has one colour everywhere. */
export function kidAvatarBg(color: string | undefined): CSSProperties | undefined {
  return color
    ? { background: `linear-gradient(140deg, ${color}, color-mix(in srgb, ${color} 60%, #000))` }
    : undefined;
}

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
          const source = [...(from?.chores ?? []), ...(from?.upcoming ?? [])].find(
            (c) => c.id === item.chore_id,
          );
          const choreName = item.chore_name ?? source?.name ?? 'Úkol není dostupný';
          const points = item.points ?? source?.points;
          const due = item.due ? timeLabel(item.due) : null;
          const swap = item.kind === 'swap';
          return (
            <li key={key} className="fam-approval" data-kind={item.kind}>
              <div className="fam-approval-top">
                <span className="fam-approval-type" data-kind={item.kind}>
                  <Icon name={swap ? 'swap' : 'check'} size={16} />
                  {swap
                    ? datedHandover('Předání', item.local_date, new Date())
                    : 'Splnění ke kontrole'}
                </span>
                {points != null && (
                  <span className="fam-approval-pts" data-testid="family-approval-points">
                    {pointsLabel(points)}
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
                      <i style={kidAvatarBg(colors[from?.id ?? ''])}>{from?.name[0]}</i>
                      {from?.name ?? 'Původní dítě'}
                    </span>
                    <Icon name="arrow" size={18} />
                    <span className="fam-person-pill">
                      <i style={kidAvatarBg(colors[to?.id ?? ''])}>{to?.name[0]}</i>
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

/** Big number + small unit, both from `pointsParts` (one plural path for the whole module). */
export function PointsFigure({
  points,
  sign,
}: {
  points: number | null | undefined;
  sign?: boolean;
}) {
  const { value, word } = pointsParts(points, { sign });
  return (
    <>
      {value} <small>{word}</small>
    </>
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
  const month = monthPoints(summary);
  const { net, earned } = month;
  const ceiling = history?.chart ? chartCeiling(history.chart.max) : 0;
  const signed = (v: number | null | undefined) =>
    v == null ? '—' : v >= 0 ? pointsLabel(v) : `−${pointsAmount(Math.abs(v))}`;
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
            <PointsFigure points={summary?.balance} />
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
              <PointsFigure points={summary?.earned_today} sign />
            </dd>
          </div>
          <div>
            <dt>7 dní</dt>
            <dd>
              <PointsFigure points={summary?.earned_week} sign />
            </dd>
          </div>
          <div>
            <dt>Měsíc získáno</dt>
            <dd data-testid="family-points-month-earned">
              <PointsFigure points={earned} sign />
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
                        {pointsAmount(value)}
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
                    {pointsAmount(Math.abs(Number(entry.amount)))}
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

export interface CreatedChore {
  name: string;
  /** kid_uuid of every assignee. */
  assignees: string[];
  /** „Dcera a Syn“ */
  who: string;
  /** „dnes do 18:00“, „každý den 12:00 a 19:00“ … */
  when: string;
}

const RECURRENCE_HINT: Record<Recurrence, string> = {
  once: 'Jednou – jen v jeden den',
  daily: 'Denně – jednou za den',
  daily_multi: 'Vícekrát denně – každý čas zvlášť',
  weekly: 'Týdně – jen ve vybrané dny',
};

/** Date field text: „Dnes (19. 11.)“, „Zítra (20. 11.)“, otherwise „26. 11. 2026“. */
function dateFieldText(d: Date, now: Date): string {
  const word = dayWord(d, now);
  if (word === 'dnes') return `Dnes (${czDate(d)})`;
  if (word === 'zítra') return `Zítra (${czDate(d)})`;
  return d.toLocaleDateString('cs-CZ');
}

/**
 * Field text → `YYYY-MM-DD`: „19. 11. 2026“, „Dnes (19. 11.)“, „26. 11.“ (no year: this
 * year, or the next one for a day already past), „dnes“ / „zítra“. Anything else is
 * returned as is, so the date check reports it.
 */
function parseFieldDate(text: string, now: Date): string {
  const t = text.trim().toLocaleLowerCase('cs');
  const m = /(\d{1,2})\.\s*(\d{1,2})\.?(?:\s*(\d{4}))?/u.exec(t);
  if (m) {
    const [, dd, mm, yyyy] = m;
    let year = yyyy ? Number(yyyy) : now.getFullYear();
    if (!yyyy && localKey(new Date(year, Number(mm) - 1, Number(dd))) < localKey(now)) year += 1;
    return `${year}-${mm!.padStart(2, '0')}-${dd!.padStart(2, '0')}`;
  }
  if (t === 'dnes' || t === 'zítra') {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + (t === 'dnes' ? 0 : 1));
    return localKey(d);
  }
  return t;
}

const MAX_TIMES = 6;
const MIN_TIMES = 2;
const DEFAULT_TIMES = ['12:00', '18:00'];
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
/** „7:5“ / „7.30“ / „730“ → „07:05“ / „07:30“; anything else stays as typed. */
function normTime(text: string): string {
  const t = text.trim().replace('.', ':');
  const m = /^(\d{1,2}):?(\d{2})$/.exec(t) ?? /^(\d{1,2}):(\d)$/.exec(t);
  return m ? `${m[1]!.padStart(2, '0')}:${m[2]!.padStart(2, '0')}` : t;
}
const shortTime = (t: string) => t.replace(/^0(\d)/, '$1');

export function AddChoreSheet({
  kids,
  api,
  onClose,
  onCreated,
  initialKid,
  colors,
  now: nowProp,
}: {
  kids: FamilyKid[];
  api: FamilyApi;
  onClose: () => void;
  onCreated: (created: CreatedChore) => void;
  initialKid?: string;
  colors: Record<string, string>;
  /** Tests pin the clock. */
  now?: () => Date;
}) {
  useBackClosable(onClose);
  const clock = nowProp ?? (() => new Date());
  const errId = useId();
  const nameErrId = useId();
  const alertRef = useRef<HTMLDivElement>(null);
  const timesRef = useRef<HTMLFieldSetElement>(null);
  const [timesFlash, setTimesFlash] = useState(false);
  const [timesNote, setTimesNote] = useState('');
  const recurrenceHintId = useId();
  const dupWaitId = useId();
  const dupPanelId = useId();
  const dupHintId = useId();
  const footRef = useRef<HTMLDivElement>(null);
  // Live footer height: when the footer overlays the scroll area (sticky layouts), the body
  // gets the same bottom padding so no section can end up under it (duplicate, multi, errors).
  useEffect(() => {
    const foot = footRef.current?.closest<HTMLElement>('.hb-sheet-foot');
    const sheet = foot?.closest<HTMLElement>('.hb-sheet');
    if (!foot || !sheet || typeof ResizeObserver === 'undefined') return;
    const sync = () => {
      const overlay = getComputedStyle(foot).position !== 'static';
      sheet.style.setProperty(
        '--fam-foot-h',
        `${Math.ceil(foot.getBoundingClientRect().height)}px`,
      );
      sheet.style.setProperty(
        '--fam-foot-overlap',
        overlay ? `${Math.ceil(foot.getBoundingClientRect().height)}px` : '0px',
      );
    };
    const observer = new ResizeObserver(sync);
    observer.observe(foot);
    sync();
    return () => observer.disconnect();
  }, []);
  const [dateReference, setDateReference] = useState(clock);
  const [name, setName] = useState('');
  const [points, setPoints] = useState(2);
  const [assignees, setAssignees] = useState<string[]>(
    initialKid ? [initialKid] : kids[0] ? [kids[0].kid_uuid ?? kids[0].id] : [],
  );
  const [recurrence, setRecurrence] = useState<Recurrence>('daily');
  const [weekdays, setWeekdays] = useState<Weekday[]>(['mon', 'thu']);
  const [enteredTime, setDueTime] = useState('18:00');
  const [autoTime, setAutoTime] = useState<string | null>(null);
  const dueTime = autoTime ?? enteredTime;
  const [timeEdited, setTimeEdited] = useState(false);
  const [dateNote, setDateNote] = useState('');
  const [times, setTimes] = useState<string[]>(DEFAULT_TIMES);
  // „Dnes (19. 11.)“ / „Zítra (20. 11.)“ / „26. 11. 2026“: the field uses the summary's words.
  const [firstDateText, setFirstDateText] = useState(() =>
    dateFieldText(defaultFirstDate(dateReference, '18:00'), dateReference),
  );
  const writeDate = (day: Date, now = clock()) => {
    setDateReference(now);
    setFirstDateText(dateFieldText(day, now));
  };
  // The first day follows the due time until the user edits the date themself.
  const [dateEdited, setDateEdited] = useState(false);
  const firstDate = parseFieldDate(firstDateText, dateReference);
  const [icon, setIcon] = useState('');
  const [iconOpen, setIconOpen] = useState(false);
  const [requestId, setRequestId] = useState(newRequestId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ code: CreateChoreErrorCode; name: string } | null>(null);
  const [nameTouched, setNameTouched] = useState(false);
  const [nameDirty, setNameDirty] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const multi = recurrence === 'daily_multi';
  const slots = useMemo(() => [...new Set(times.map(normTime))].sort(), [times]);
  const defaultDay = (time: string) =>
    defaultFirstDate(clock(), TIME_RE.test(time) ? time : '18:00');
  const followDefault = (time: string) => {
    if (!dateEdited) writeDate(defaultDay(time));
  };
  const dateTyping = useRef(false);
  const commitDate = (value: string, schedule = recurrence, days = weekdays) => {
    dateTyping.current = false;
    setDateNote('');
    setAutoTime(null);
    const selected = parseFieldDate(value, dateReference);
    const day = new Date(`${selected}T12:00:00`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(selected) || localKey(day) !== selected) return;
    const alignWeekday = () => {
      if (schedule === 'weekly' && days.length) {
        while (!days.includes(WEEKDAYS[(day.getDay() + 6) % 7]!.id)) {
          day.setDate(day.getDate() + 1);
        }
      }
    };
    alignWeekday();
    const now = clock();
    const today = localKey(now);
    const time = normTime(enteredTime);
    if (
      schedule !== 'daily_multi' &&
      localKey(day) === today &&
      !timeEdited &&
      TIME_RE.test(time) &&
      new Date(`${today}T${time}`).getTime() - now.getTime() < 15 * 60_000
    ) {
      const next = nextTodayTime(now);
      if (next) {
        setAutoTime(next);
        setDateNote(
          new Date(`${today}T${time}`) < now
            ? `Dnes už je po ${time}, čas jsem posunul na ${next}.`
            : `Do ${time} zbývá méně než 15 minut, čas jsem posunul na ${next}.`,
        );
      } else {
        day.setDate(day.getDate() + 1);
        alignWeekday();
        setDateNote(`Na dnešek už nezbývá 30 minut. Termín je ${dayWord(day, now)}.`);
      }
    }
    writeDate(day, now);
  };
  const editTime = (value: string) => {
    setTimeEdited(true);
    setAutoTime(null);
    setDateNote('');
    setDueTime(value);
  };
  const editSlot = (index: number, value: string) => {
    setTimes((prev) => prev.map((slot, i) => (i === index ? value : slot)));
  };
  const chooseSchedule = (nextRecurrence: Recurrence, nextDays: Weekday[]) => {
    setRecurrence(nextRecurrence);
    setWeekdays(nextDays);
    const switchingMulti = (nextRecurrence === 'daily_multi') !== (recurrence === 'daily_multi');
    const time = nextRecurrence === 'daily_multi' ? (slots.at(-1) ?? '18:00') : enteredTime;
    const value = switchingMulti && !dateEdited ? localKey(defaultDay(time)) : firstDateText;
    if (nextRecurrence !== 'weekly' && recurrence !== 'weekly' && !switchingMulti) return;
    commitDate(value, nextRecurrence, nextDays);
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
  const timesOk = multi
    ? slots.length >= 2 && slots.length === times.length && slots.every((t) => TIME_RE.test(t))
    : TIME_RE.test(dueTime);
  /** First due slot on the first day that is still ahead (multi: earlier slots may be past). */
  const firstDue = (at: number) =>
    dateOk && timesOk
      ? (multi ? slots : [dueTime]).find((t) => new Date(`${firstDate}T${t}`).getTime() > at)
      : undefined;
  const renderedNow = clock();
  const today = localKey(renderedNow);
  const futureOk = !!firstDue(renderedNow.getTime()) || (multi && firstDate === today);
  const deferredSlots =
    multi && firstDate === today
      ? slots.filter((t) => TIME_RE.test(t) && new Date(`${firstDate}T${t}`) <= renderedNow)
      : [];
  const notice = multi
    ? deferredSlots.length
      ? `Od zítřka začnou časy ${joinCz(deferredSlots)}.`
      : ''
    : dateNote;
  const problems = {
    name: !name.trim() ? 'Doplň název úkolu.' : '',
    who: !assignees.length ? 'Vyber, komu úkol patří.' : '',
    days: recurrence === 'weekly' && !weekdays.length ? 'Vyber aspoň jeden den.' : '',
    when: !dateOk
      ? 'Zadej datum ve tvaru 17. 11. 2026.'
      : !timesOk
        ? multi
          ? slots.length < times.length
            ? 'Každý čas zadej jen jednou.'
            : 'Zadej aspoň dva časy ve tvaru 12:00.'
          : 'Zadej čas ve tvaru 18:00.'
        : !futureOk
          ? firstDate === today
            ? `Dnes už je po ${multi ? slots.at(-1) : dueTime}. Zvol pozdější čas nebo jiný den.`
            : 'Termín musí být v budoucnu.'
          : '',
  };
  const valid = !Object.values(problems).some(Boolean);
  const showName = (nameTouched || submitted) && problems.name;
  const firstDay = dateOk ? new Date(`${firstDate}T12:00:00`) : null;
  const startWord = firstDay ? dayWord(firstDay, renderedNow) : '—';
  const startLabel = firstDay
    ? startWord === 'dnes'
      ? 'dneška'
      : startWord === 'zítra'
        ? 'zítřka'
        : czDate(firstDay)
    : '—';
  // „dnes“ / „zítra“ / „st 26. 11.“
  const onceDay = firstDay ? startWord : '—';
  const dayList = WEEKDAYS.filter((d) => weekdays.includes(d.id)).map((d) => d.label);
  const chosen = kids.filter((k) => assignees.includes(k.kid_uuid ?? k.id));
  const who = chosen.map((k) => k.name).join(' a ') || 'Nikdo';
  const pointsText = pointsAmount(points);
  // Date/time tokens stay on one line (no-break spaces + nowrap span).
  const tok = (text: string) => (
    <span className="fam-nowrap" data-testid="family-summary-token">
      {text}
    </span>
  );
  const slotText = joinCz(slots.map(shortTime));
  const whenPlain =
    recurrence === 'weekly'
      ? `${joinCz(dayList)} do\u00a0${dueTime} · od\u00a0${startLabel}`
      : recurrence === 'daily'
        ? `každý den do\u00a0${dueTime} · od\u00a0${startLabel}`
        : multi
          ? `každý den ${slots.length}× (${slotText}) · od\u00a0${startLabel}`
          : `${onceDay} do\u00a0${dueTime}`;
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
    ) : multi ? (
      <>
        {tok(`${slots.length}×`)} denně ({slotText}) · {since}
      </>
    ) : (
      <>
        {tok(onceDay)} {due}
      </>
    );
  const perDay = points * slots.length;
  const rewardText = multi ? (
    <>
      {pointsText} za každé splnění ({tok(`${pointsAmount(perDay)} denně`)})
    </>
  ) : (
    pointsText
  );
  /** Merge duplicate times and sort them once the user leaves the times group. */
  const tidyTimes = () => {
    const norm = times.map(normTime);
    const ok = norm.filter((t) => TIME_RE.test(t));
    const uniq = [...new Set(ok)].sort();
    const rest = norm.filter((t) => !TIME_RE.test(t));
    const next = [...uniq, ...rest];
    while (next.length < MIN_TIMES) next.push('');
    const merged = uniq.length < ok.length;
    const reordered = !merged && ok.join() !== uniq.join();
    if (next.join('|') !== times.join('|')) setTimes(next);
    setTimesNote(
      merged
        ? 'Stejné časy jsme sloučili do jednoho.'
        : reordered
          ? 'Časy jsme seřadili podle dne.'
          : '',
    );
    followDefault(uniq.at(-1) ?? '18:00');
  };
  const dueLabel =
    recurrence === 'daily'
      ? 'Každý den do'
      : recurrence === 'weekly'
        ? 'V tyto dny do'
        : 'Splnit do';
  useEffect(() => {
    if (error) alertRef.current?.focus({ preventScroll: true });
  }, [error]);
  // „Nastavit vícekrát denně“: bring the times into view and flash them once.
  useEffect(() => {
    if (!timesFlash) return;
    const el = timesRef.current;
    el?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    // Focus the group (announced, no input focus ring); the inputs stay one Tab away.
    el?.focus({ preventScroll: true });
    const t = setTimeout(() => setTimesFlash(false), 1600);
    return () => clearTimeout(t);
  }, [timesFlash]);
  const switchToMulti = () => {
    const valid2 = times.map(normTime).filter((t) => TIME_RE.test(t));
    if (new Set(valid2).size < MIN_TIMES) setTimes(DEFAULT_TIMES);
    chooseSchedule('daily_multi', weekdays);
    setError(null);
    setTimesFlash(true);
  };
  const save = async (nameOverride?: string) => {
    setSubmitted(true);
    const finalName = (nameOverride ?? name).trim();
    const at = clock().getTime();
    const dueSlot =
      firstDue(at) ?? (multi && firstDate === localKey(new Date(at)) ? slots[0] : undefined);
    if (!valid || busy || !finalName || !dueSlot) {
      if (problems.name) document.getElementById('fam-chore-name')?.focus();
      return;
    }
    const payload: CreateChoreInput = {
      client_request_id: requestId,
      name: finalName,
      points,
      assignees,
      recurrence,
      weekdays: recurrence === 'weekly' ? weekdays : undefined,
      first_date: firstDate,
      due_time: dueSlot,
      times: multi ? slots : undefined,
      icon: icon || undefined,
    };
    setBusy(true);
    setError(null);
    try {
      await withTimeout(api.createChore(payload));
      onCreated({ name: finalName, assignees, who, when: whenPlain });
      onClose();
    } catch (err) {
      setError({ code: createChoreErrorCode(err), name: finalName });
      // A rejected request did not create anything: the next attempt is a new operation.
      setRequestId(newRequestId());
    } finally {
      setBusy(false);
    }
  };
  const duplicate = error?.code === 'duplicate_name';
  const suggestion = duplicate ? nextDistinctName(error.name) : '';
  const dupOwner = duplicate
    ? (chosen.find((k) =>
        [...k.chores, ...(k.upcoming ?? [])].some(
          (c) => c.name.trim().toLocaleLowerCase('cs') === error.name.toLocaleLowerCase('cs'),
        ),
      ) ?? (chosen.length === 1 ? chosen[0] : undefined))
    : undefined;
  const chosenIcon = ICONS.find(([value]) => value === icon);
  const fieldErr = (text: string, testid?: string) =>
    submitted && text ? (
      <p className="fam-field-err" data-testid={testid}>
        {text}
      </p>
    ) : null;
  const title = (
    <>
      Přidat úkol
      {chosen.length > 0 && (
        <span className="fam-title-who" data-testid="family-add-chore-title-who">
          {' · '}
          {chosen.length === 1
            ? chosen[0]!.name
            : `${chosen.length} ${
                chosen.some((member) => 'role' in member && member.role !== 'child')
                  ? czPlural(chosen.length, 'osoba', 'osoby', 'osob')
                  : czPlural(chosen.length, 'dítě', 'děti', 'dětí')
              }`}
        </span>
      )}
    </>
  );
  return (
    <Sheet
      title={title}
      onClose={onClose}
      appearance="raised"
      isolation="strong"
      stickyFooter
      closeLabel="Zavřít formulář"
      footer={
        <div className="fam-add-foot" ref={footRef}>
          {error && (
            <div
              ref={alertRef}
              tabIndex={-1}
              role="alert"
              className="fam-save-err"
              data-testid="family-add-chore-error"
              data-code={error.code}
            >
              <strong id={dupPanelId} data-testid="family-add-chore-error-text">
                <Icon name="info" size={18} />
                {duplicate
                  ? dupOwner
                    ? `${dupOwner.name} už má úkol „${error.name}“.`
                    : `Úkol „${error.name}“ už existuje.`
                  : CREATE_CHORE_ERRORS[error.code]}
              </strong>
              {duplicate && (
                <div className="fam-save-err-actions">
                  <Button
                    size="sm"
                    variant="secondary"
                    className="fam-save-err-action"
                    data-testid="family-duplicate-multi"
                    disabled={busy}
                    onClick={switchToMulti}
                  >
                    Přidat další čas (vícekrát denně)
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="fam-save-err-action fam-save-err-alt"
                    data-testid="family-duplicate-rename"
                    disabled={busy}
                    onClick={() => {
                      setName(suggestion);
                      void save(suggestion);
                    }}
                  >
                    Uložit jako „{suggestion}“
                  </Button>
                </div>
              )}
            </div>
          )}
          {duplicate && (
            <p id={dupWaitId} className="fam-dup-wait" data-testid="family-add-chore-dup-wait">
              Uložit nejde: stejný název už existuje. Přidej další čas, ulož pod jiným názvem, nebo
              název změň.
            </p>
          )}
          <Button
            // With the duplicate error shown the same name would fail again: the panel's
            // actions are the only way forward, so the plain save is disabled until then.
            variant="primary"
            contrast="high"
            type="submit"
            form="fam-add-chore"
            disabled={busy}
            aria-disabled={duplicate || undefined}
            aria-describedby={duplicate ? dupWaitId : submitted && !valid ? errId : undefined}
            data-testid="family-add-chore-save"
            data-invalid={!valid || undefined}
            data-busy={busy || undefined}
            className="fam-cta"
          >
            {busy ? 'Ukládám…' : 'Uložit úkol'}
          </Button>
        </div>
      }
      data-testid="family-add-chore-sheet"
    >
      <form
        id="fam-add-chore"
        className="fam-add-chore"
        noValidate
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          if (!duplicate) void save();
        }}
      >
        <div className="fam-field">
          <label htmlFor="fam-chore-name">Název</label>
          <input
            id="fam-chore-name"
            data-autofocus=""
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setNameDirty(true);
              if (duplicate) setError(null);
            }}
            // Blur validates only an edited field: tabbing through an untouched form must not
            // insert errors (and shift the layout under the pointer).
            onBlur={() => nameDirty && setNameTouched(true)}
            maxLength={80}
            placeholder="Např. Zalít květiny"
            aria-invalid={showName || duplicate ? true : undefined}
            aria-describedby={showName ? nameErrId : duplicate ? dupHintId : undefined}
          />
          {duplicate && !showName && (
            <p id={dupHintId} className="fam-dup-hint" data-testid="family-dup-hint">
              {dupOwner
                ? `Tento název už ${dupOwner.name} má – viz možnosti dole`
                : 'Tento název už existuje – viz možnosti dole'}
            </p>
          )}
          {showName && (
            <p id={nameErrId} className="fam-field-err" data-testid="family-name-error">
              {problems.name}
            </p>
          )}
        </div>
        <fieldset>
          <legend>Komu {kids.length > 1 && <small>· můžeš vybrat víc osob</small>}</legend>
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
                  data-testid="family-who-chip"
                  style={{ '--fam-chip-kid': colors[k.id] } as CSSProperties}
                >
                  <span className="fam-partner-avatar" style={kidAvatarBg(colors[k.id])}>
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
              <span>{pointsParts(points).word}</span>
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
            Ikona <small>(nepovinná)</small>
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
        <SegmentedControl
          label="Opakování"
          tone="solid"
          className="fam-recurrence"
          value={recurrence}
          onChange={(v: string) => chooseSchedule(v as Recurrence, weekdays)}
          options={[
            ['once', 'Jednou'],
            ['daily', 'Denně'],
            ['daily_multi', 'Vícekrát'],
            ['weekly', 'Týdně'],
          ]}
        />
        <p
          id={recurrenceHintId}
          className="fam-hint fam-recurrence-hint"
          data-testid="family-recurrence-hint"
        >
          {RECURRENCE_HINT[recurrence]}
        </p>
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
        {multi && (
          <fieldset
            ref={timesRef}
            className="fam-times"
            data-testid="family-multi-times"
            data-flash={timesFlash || undefined}
            tabIndex={-1}
            aria-describedby={`${errId}-times`}
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) tidyTimes();
            }}
          >
            <legend>Časy splnění</legend>
            <ol>
              {times.map((t, i) => (
                <li key={i}>
                  <span className="fam-times-n" aria-hidden="true">
                    {i + 1}.
                  </span>
                  <span className="fam-input-icon">
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="12:00"
                      aria-label={`${i + 1}. čas`}
                      value={t}
                      data-testid="family-multi-time"
                      onChange={(e) => editSlot(i, e.target.value)}
                    />
                    <ChorePicker
                      type="time"
                      now={renderedNow}
                      value={TIME_RE.test(t) ? t : ''}
                      onPick={(value) => editSlot(i, value)}
                    />
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="fam-times-remove"
                    icon={<Icon name="close" size={22} />}
                    aria-label={`Odebrat ${i + 1}. čas`}
                    title={times.length <= MIN_TIMES ? 'Aspoň 2 časy' : undefined}
                    data-testid="family-multi-remove"
                    disabled={times.length <= MIN_TIMES}
                    aria-disabled={times.length <= MIN_TIMES || undefined}
                    onClick={() => setTimes((prev) => prev.filter((_, j) => j !== i))}
                  />
                </li>
              ))}
            </ol>
            <p
              id={`${errId}-times`}
              className="fam-hint fam-times-hint"
              data-testid="family-multi-note"
              aria-live="polite"
            >
              {timesNote ||
                (times.length <= MIN_TIMES ? 'Aspoň 2 časy.' : `Nejvýš ${MAX_TIMES} časů.`)}
            </p>
            {times.length < MAX_TIMES && (
              <Button
                variant="secondary"
                size="sm"
                icon={<Icon name="plus" size={18} />}
                data-testid="family-multi-add"
                onClick={() => setTimes((prev) => [...prev, ''])}
              >
                Přidat čas
              </Button>
            )}
          </fieldset>
        )}
        <div className="fam-form-dates" data-multi={multi || undefined}>
          <div className="fam-form-date">
            <label htmlFor={`${errId}-date`}>
              {recurrence === 'once' ? 'Den splnění' : 'Od kdy'}
            </label>
            <span className="fam-input-icon">
              <input
                id={`${errId}-date`}
                aria-label={recurrence === 'once' ? 'Den splnění' : 'První den'}
                placeholder="DD. MM. RRRR"
                inputMode="numeric"
                value={firstDateText}
                data-testid="family-first-date"
                data-date={firstDate}
                onChange={(e) => {
                  if (!dateTyping.current) setDateReference(clock());
                  dateTyping.current = true;
                  setDateEdited(true);
                  setFirstDateText(e.target.value);
                }}
                onBlur={() => {
                  if (dateTyping.current) commitDate(firstDateText);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && dateTyping.current) {
                    e.preventDefault();
                    e.currentTarget.blur();
                  }
                }}
              />
              <ChorePicker
                type="date"
                value={dateOk && firstDate >= today ? firstDate : ''}
                min={today}
                onPick={(value) => {
                  setDateEdited(true);
                  commitDate(value);
                }}
              />
            </span>
          </div>
          {!multi && (
            <div className="fam-form-date">
              <label htmlFor={`${errId}-time`}>{dueLabel}</label>
              <span className="fam-input-icon">
                <input
                  id={`${errId}-time`}
                  type="text"
                  inputMode="numeric"
                  placeholder="18:00"
                  value={dueTime}
                  onChange={(e) => editTime(e.target.value)}
                  onBlur={() => {
                    const t = normTime(dueTime);
                    if (!autoTime) setDueTime(t);
                    followDefault(t);
                  }}
                  data-testid="family-due-time"
                />
                <ChorePicker
                  type="time"
                  now={renderedNow}
                  value={TIME_RE.test(dueTime) ? dueTime : ''}
                  onPick={(value) => {
                    editTime(value);
                    followDefault(value);
                  }}
                />
              </span>
            </div>
          )}
          {fieldErr(problems.when)}
          {notice && (
            <small className="fam-hint fam-date-note" role="status">
              <Icon name="info" size={20} />
              {notice}
            </small>
          )}
        </div>
        <div className="fam-summary" data-testid="family-chore-summary-box">
          <div>
            <strong data-testid="family-chore-summary">
              <span>{rewardText}</span>
              <span data-testid="family-add-chore-when">{scheduleText}</span>
            </strong>
            <p className="fam-hint">
              {multi
                ? 'Každé splnění schvaluje rodič.'
                : assignees.length > 1
                  ? 'Každý plní svůj úkol. Splnění schvaluje rodič.'
                  : 'Splnění schvaluje rodič.'}
              {!multi && startWord !== 'dnes' && recurrence !== 'weekly' && firstDay && (
                <> Do svého dne bude úkol v části „Naplánované“.</>
              )}
            </p>
          </div>
        </div>
        {submitted && !valid && (
          <p id={errId} className="hb-sr-only">
            {Object.values(problems).filter(Boolean).join(' ')}
          </p>
        )}
      </form>
    </Sheet>
  );
}

const SWAP_ERRORS = new Map([
  ['due_in_past', 'Termín úkolu už minul.'],
  ['unsupported_chore', 'Tento výskyt už nelze předat.'],
  ['expired', 'Den výskytu už uplynul nebo je mimo povolené období.'],
  ['conflict', 'Tento požadavek už byl použit.'],
  ['not_found', 'Úkol nebo příjemce už není dostupný.'],
  ['unauthorized', 'K předání úkolu nemáš oprávnění.'],
  ['not_configured', 'Úkoly nejsou nastavené.'],
  ['invalid_input', 'Zkontroluj den a čas.'],
]);

function errorCode(error: unknown): string | undefined {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' ? code : undefined;
}

export function swapError(error: unknown, fallback: string): string {
  return SWAP_ERRORS.get(errorCode(error) ?? '') ?? fallback;
}

/** Overdue reassign: the new deadline must still be ahead (ChoreOps rejects a past one). */
const REASSIGN_LEAD_MS = 5 * 60_000;

export function SwapSheet({
  api,
  snap,
  choreId,
  kidId,
  mode,
  colors,
  onClose,
  onDone,
  onError,
}: {
  api: FamilyApi;
  snap: FamilySnapshot;
  choreId: string;
  kidId: string;
  mode: 'give' | 'reassign';
  colors: Record<string, string>;
  onClose: () => void;
  onDone: (targetName: string, day: string) => void;
  onError: (message: string) => void;
}) {
  useBackClosable(onClose);
  const now = api.now?.() ?? new Date();
  const [partners, setPartners] = useState<Array<{ id: string; name: string }>>([]);
  const [target, setTarget] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  // One user action = one client_request_id, so a repeated tap or a retry after a lost
  // answer is deduplicated by the backend instead of starting another reassign.
  const attempt = useRef<{ key: string; id: string } | null>(null);
  // A payload the backend already refused: the button waits until something changes.
  const [rejected, setRejected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fromKid = snap.kids.find((k) => k.id === kidId);
  const fromId = fromKid?.kid_uuid ?? kidId;
  const chore = [...(fromKid?.chores ?? []), ...(fromKid?.upcoming ?? [])].find(
    (c) => c.id === choreId,
  );
  const expected = chore?.due ? localKey(new Date(chore.due)) : '';
  const [days, setDays] = useState<string[]>([]);
  const [day, setDay] = useState(expected);
  const [loading, setLoading] = useState(true);
  const overdue =
    mode === 'reassign' &&
    !!chore?.due &&
    (chore.state === 'overdue' || Date.parse(chore.due) <= now.getTime());
  const needsTime = overdue && day === localKey(now);
  const [dueTime, setDueTime] = useState(() => reassignDueTime(chore?.due, now) ?? '');
  const pickedTime = normTime(dueTime);
  const timeOk =
    TIME_RE.test(pickedTime) &&
    new Date(`${day}T${pickedTime}`).getTime() - now.getTime() > REASSIGN_LEAD_MS;
  useEffect(() => {
    let active = true;
    void api
      .swapOptions('give', choreId)
      .then((result) => {
        if (!active) return;
        const available = result.partners.filter((partner) => partner.id !== fromId);
        const dates = [
          ...new Set(
            result.occurrences
              .filter((row) => row.owner_kid_uuid === fromId && row.opaque_id === choreId)
              .map((row) => row.local_date),
          ),
        ].sort();
        setPartners(available);
        setDays(dates);
        setDay(dates.includes(expected) ? expected : (dates[0] ?? ''));
        if (available.length === 1) setTarget(available[0]!.id);
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        const message = 'Možnosti předání se nepodařilo načíst.';
        setError(message);
        onError(message);
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [api, choreId, expected, fromId, onError]);
  const recipient = partners.find((p) => p.id === target);
  const payload =
    fromKid && recipient
      ? {
          chore: choreId,
          from_kid: fromKid.kid_uuid ?? fromKid.id,
          to_kid: recipient.id,
          local_date: day,
          direction: 'give' as const,
          ...(needsTime ? { due_time: pickedTime } : {}),
        }
      : null;
  const payloadKey = payload ? JSON.stringify(payload) : '';
  const disabledReason = loading
    ? 'Načítám dostupné výskyty…'
    : !days.includes(day)
      ? 'Úkol nemá dostupný výskyt.'
      : !partners.length
        ? 'Není dostupný žádný sourozenec.'
        : !target
          ? 'Vyber příjemce.'
          : needsTime && !timeOk
            ? nextTodayTime(now)
              ? 'Vyber pozdější čas – nový termín musí být v budoucnu.'
              : 'Dnes už nový termín nastavit nejde.'
            : busy
              ? mode === 'reassign'
                ? 'Přeřazuji…'
                : 'Odesílám…'
              : rejected === payloadKey
                ? needsTime
                  ? 'Změň čas nebo příjemce.'
                  : 'Změň den nebo příjemce.'
                : undefined;
  const submit = async () => {
    if (!payload || !recipient || disabledReason || submitting.current) return;
    submitting.current = true;
    setError(null);
    setBusy(true);
    if (attempt.current?.key !== payloadKey)
      attempt.current = { key: payloadKey, id: newRequestId() };
    try {
      const input = { ...payload, client_request_id: attempt.current.id };
      if (mode === 'reassign') await api.swapReassign(input);
      else await api.swapRequest(input);
      onDone(recipient.name, day);
      onClose();
    } catch (err) {
      const code = errorCode(err);
      // The server answered: that result is final for this request id. A refusal waits for
      // a changed input; any other failure may be retried as a new attempt. Without an
      // answer (connection lost) the retry keeps the id, the backend replays the outcome.
      if (code && SWAP_ERRORS.has(code)) setRejected(payloadKey);
      else if (code) attempt.current = null;
      setError(
        swapError(
          err,
          mode === 'reassign'
            ? 'Přeřazení se nepovedlo, zkus to znovu.'
            : 'Žádost se nepodařilo odeslat.',
        ),
      );
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };
  return (
    <Sheet
      title={mode === 'reassign' ? 'Přeřadit úkol' : 'Předat úkol'}
      onClose={onClose}
      appearance="raised"
      isolation="strong"
      stickyFooter
      closeLabel="Zavřít předání"
      footer={
        <>
          {error && (
            <p className="fam-field-err" role="alert">
              {error}
            </p>
          )}
          <Button
            variant="primary"
            contrast="high"
            disabled={!!disabledReason}
            loading={busy}
            title={disabledReason}
            onClick={() => void submit()}
            data-testid="family-swap-submit"
            className="fam-cta"
          >
            {mode === 'give'
              ? 'Poslat rodiči ke schválení'
              : recipient
                ? `Přeřadit na ${nameAccusative(recipient.name) ?? recipient.name}`
                : 'Přeřadit'}
          </Button>
        </>
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
                mode === 'give' && day ? dayWord(new Date(`${day}T12:00:00`), new Date()) : null,
                chore?.points != null ? pointsAmount(chore.points) : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
        </div>
        <fieldset className="fam-swap-day">
          <legend>Který den</legend>
          {days.map((value) => (
            <label className="fam-swap-day-option" key={value}>
              <input
                type="radio"
                name="swap-day"
                value={value}
                checked={value === day}
                onChange={() => setDay(value)}
              />
              <Icon name="calendar" size={20} />
              {shortDate(new Date(`${value}T12:00:00`))}
              {days.length > 1 && value === day && (
                <Icon name="check" size={20} className="fam-swap-day-check" />
              )}
            </label>
          ))}
        </fieldset>
        {needsTime && (
          <div className="fam-form-date fam-swap-time">
            <label htmlFor={`${choreId}-swap-time`}>Nový termín dnes do</label>
            <span className="fam-input-icon">
              <input
                id={`${choreId}-swap-time`}
                type="text"
                inputMode="numeric"
                placeholder="18:00"
                value={dueTime}
                disabled={busy}
                onChange={(e) => setDueTime(e.target.value)}
                onBlur={() => setDueTime(pickedTime)}
                data-testid="family-swap-time"
              />
              <ChorePicker
                type="time"
                now={now}
                value={TIME_RE.test(pickedTime) ? pickedTime : ''}
                onPick={setDueTime}
              />
            </span>
            <small className="fam-hint">Původní termín už minul, úkol dostane nový.</small>
          </div>
        )}
        {disabledReason && (
          <p className="fam-hint" role="status">
            {disabledReason}
          </p>
        )}
        {partners.length > 0 && (
          <fieldset className="fam-swap-recipients">
            <legend>Komu</legend>
            <div
              className="fam-chips fam-person-chips"
              role="group"
              aria-label="Komu"
              data-testid="family-swap-recipient"
            >
              {partners.map((p) => (
                <Chip
                  key={p.id}
                  className="fam-chip"
                  onPress={() => setTarget(p.id)}
                  pressed={target === p.id}
                >
                  <span
                    className="fam-partner-avatar"
                    style={kidAvatarBg(colors[p.id] ?? colors[p.name])}
                    aria-hidden="true"
                  >
                    {p.name[0]}
                  </span>
                  {p.name}
                  {target === p.id && <Icon name="check" size={18} className="fam-chip-check" />}
                </Chip>
              ))}
            </div>
          </fieldset>
        )}
        <div className="fam-info" data-tone="accent">
          <span className="fam-info-icon">
            <Icon name="info" size={20} />
          </span>
          <div>
            <strong>{mode === 'reassign' ? 'Jeden výskyt' : 'Nejdřív schválí rodič'}</strong>
            <p>
              {mode === 'reassign'
                ? 'Přeřazení platí pro vybraný den.'
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
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useBackClosable(onClose);
  return (
    <Sheet
      title={title}
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

export function DeleteChoreSheet({
  chore,
  onDelete,
  onClose,
}: {
  chore: ChoreManagement;
  onDelete: (scope: DeleteChoreScope) => Promise<void>;
  onClose: () => void;
}) {
  const [selectedId, setSelectedId] = useState(chore.id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitting = useRef(false);
  const actions = useRef<HTMLDivElement>(null);
  useEffect(() => {
    actions.current?.querySelector<HTMLButtonElement>('[data-autofocus]')?.focus();
  }, []);
  const descriptionId = useId();
  const multi = chore.slots.length > 1;
  const all = multi && selectedId === null;
  const selectedSlot = chore.slots.find((slot) => slot.id === selectedId);
  const assignees = all
    ? [...new Set(chore.slots.flatMap((slot) => slot.assignees))]
    : (selectedSlot?.assignees ?? chore.assignees);
  const slotLabel = (slot: ChoreManagement['slots'][number]) => slot.time ?? slot.name;
  let deleteLabel = chore.one_off ? 'Smazat úkol' : 'Smazat řadu';
  if (all) deleteLabel = 'Smazat všechny časy';
  else if (multi && selectedSlot) deleteLabel = `Smazat ${slotLabel(selectedSlot)}`;
  const close = () => {
    if (!submitting.current) onClose();
  };
  useBackClosable(close);
  const submit = async () => {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError(null);
    try {
      if (all) await onDelete({ series_ids: chore.slots.map((slot) => slot.id) });
      else if (selectedSlot && selectedSlot.id !== chore.id) {
        await onDelete({ slot_id: selectedSlot.id });
      } else await onDelete({});
    } catch (err) {
      setError(choreManagementError(err, 'Úkol se nepodařilo smazat. Zkus to znovu.'));
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };

  return (
    <Sheet
      title="Smazat úkol"
      onClose={close}
      appearance="raised"
      isolation="strong"
      variant="alert"
      stickyFooter
      describedBy={descriptionId}
      data-testid="family-delete-chore-sheet"
      footer={
        <>
          {error && (
            <p className="fam-field-err" role="alert">
              {error}
            </p>
          )}
          <p id={descriptionId} className="fam-delete-points">
            Body, které už za něj někdo dostal, zůstanou.
          </p>
          <div className="fam-delete-actions" ref={actions}>
            <Button data-autofocus variant="secondary" onClick={close} disabled={busy}>
              Zrušit
            </Button>
            <Button variant="danger" onClick={() => void submit()} disabled={busy}>
              {deleteLabel}
            </Button>
          </div>
        </>
      }
    >
      <div className="fam-delete-summary">
        <strong>{chore.series_name}</strong>
        <p className="fam-hint">
          {assignees.join(', ')}
          {!chore.one_off &&
            ` · ${chore.times_per_day ? `${chore.times_per_day}× denně` : '1× v naplánovaný den'}`}
        </p>
        {multi && (
          <fieldset disabled={busy} className="fam-delete-slots">
            <legend>Které časy smazat?</legend>
            {chore.slots.map((slot) => (
              <label key={slot.id}>
                <input
                  type="radio"
                  name={descriptionId}
                  checked={selectedId === slot.id}
                  onChange={() => setSelectedId(slot.id)}
                />
                Jen {slotLabel(slot)}
              </label>
            ))}
            <label>
              <input
                type="radio"
                name={descriptionId}
                checked={all}
                onChange={() => setSelectedId(null)}
              />
              Všechny časy ({chore.slots.length})
            </label>
          </fieldset>
        )}
      </div>
    </Sheet>
  );
}

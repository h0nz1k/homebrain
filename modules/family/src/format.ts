import { handedToLabel, pointsWord, reassignedToLabel, takenFromLabel } from './czech.js';
import type {
  FamilyChore,
  FamilyEvent,
  FamilyUpcomingChore,
  FamilySwapToday,
  PointsSummary,
} from './types.js';

const DAY = ['Ne', 'Po', 'Út', 'St', 'Čt', 'Pá', 'So'];
const DAY_LONG = ['neděle', 'pondělí', 'úterý', 'středa', 'čtvrtek', 'pátek', 'sobota'];
const MONTH_GEN = [
  'ledna',
  'února',
  'března',
  'dubna',
  'května',
  'června',
  'července',
  'srpna',
  'září',
  'října',
  'listopadu',
  'prosince',
];

const pad = (n: number) => String(n).padStart(2, '0');
export const localKey = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Local calendar day of an event start (all-day events carry a plain date). */
export function eventDay(ev: Pick<FamilyEvent, 'start' | 'all_day'>): string {
  return ev.all_day ? ev.start.slice(0, 10) : localKey(new Date(ev.start));
}

export function timeLabel(iso: string): string {
  const d = new Date(iso);
  return `${d.getHours()}:${pad(d.getMinutes())}`;
}

/** Czech numeric date with no-break spaces so it never wraps: „17.\u00a011.“ / „17.\u00a011.\u00a02026“. */
export function czDate(d: Date, opts: { year?: boolean } = {}): string {
  const dm = `${d.getDate()}.\u00a0${d.getMonth() + 1}.`;
  return opts.year ? `${dm}\u00a0${d.getFullYear()}` : dm;
}

/** One time format for timed events everywhere: „7:45–8:15“ (en dash, no spaces). */
export function timeRange(ev: Pick<FamilyEvent, 'start' | 'end'>): string {
  return `${timeLabel(ev.start)}–${timeLabel(ev.end)}`;
}

export function shortDate(day: Date): string {
  return `${(DAY[day.getDay()] ?? '').toLowerCase()}\u00a0${czDate(day)}`;
}

export function longDate(now: Date): string {
  const weekday = DAY_LONG[now.getDay()] ?? '';
  return `${weekday.charAt(0).toLocaleUpperCase('cs') + weekday.slice(1)} ${now.getDate()}.\u00a0${MONTH_GEN[now.getMonth()]}`;
}

export function todayEvents(events: FamilyEvent[], now: Date): FamilyEvent[] {
  const key = localKey(now);
  return events
    .filter(
      (e) => eventDay(e) === key || (e.all_day && eventDay(e) < key && e.end.slice(0, 10) > key),
    )
    .sort(
      (a, b) => Number(b.all_day) - Number(a.all_day) || Date.parse(a.start) - Date.parse(b.start),
    );
}

export interface WeekDay {
  key: string;
  day: string;
  date: string;
  events: FamilyEvent[];
}

/** The 7 days after today, each with its events (empty days stay in the list). */
export function nextDays(events: FamilyEvent[], now: Date, count = 7): WeekDay[] {
  const out: WeekDay[] = [];
  for (let i = 1; i <= count; i += 1) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    const key = localKey(d);
    out.push({
      key,
      day: DAY[d.getDay()] ?? '',
      date: czDate(d),
      events: events.filter((e) => eventDay(e) === key),
    });
  }
  return out;
}

/** The running or next timed event of today. */
export function nextEvent(events: FamilyEvent[], now: Date): FamilyEvent | null {
  return (
    todayEvents(events, now).find((e) => !e.all_day && new Date(e.end).getTime() > now.getTime()) ??
    null
  );
}

export function isPast(ev: FamilyEvent, now: Date): boolean {
  return !ev.all_day && new Date(ev.end).getTime() <= now.getTime();
}

export function relLabel(ev: FamilyEvent, now: Date): string {
  const ms = new Date(ev.start).getTime() - now.getTime();
  if (ms <= 0) return 'Právě probíhá';
  const min = Math.round(ms / 60_000);
  if (min < 60) return `Za ${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `Za ${h} h ${m} min` : `Za ${h} h`;
}

export const CARRIED_LABEL = 'Přeneseno';
export const MISSED_LABEL = 'Nesplněno';

export function carriedFrom(chore: FamilyChore, today: string): string | null {
  if (!chore.due || (chore.state !== 'overdue' && chore.state !== 'claimed')) return null;
  const day = localKey(new Date(chore.due));
  return day < today ? day : null;
}

export function carriedLabel(day: string): string {
  return `${CARRIED_LABEL} · původně ${shortDate(new Date(`${day}T12:00:00`))}`;
}

export function choreNote(
  chore: FamilyChore,
  now: Date,
  opts: { parentApproves?: boolean } = {},
): { text: string; tone?: 'warn' | 'crit' } {
  // Done rows carry one signal only (green check + muted, struck-through name): no extra text.
  if (chore.state === 'done') return { text: '' };
  const carried = carriedFrom(chore, localKey(now));
  if (carried) return { text: carriedLabel(carried) };
  if (chore.state === 'claimed')
    return { text: opts.parentApproves ? 'Schválí rodič' : 'Čeká na schválení', tone: 'warn' };
  const due = chore.due ? new Date(chore.due) : null;
  if (chore.state === 'overdue')
    return { text: due ? `Po termínu (${timeLabel(chore.due!)})` : 'Po termínu', tone: 'crit' };
  if (due && localKey(due) === localKey(now)) return { text: `Do ${timeLabel(chore.due!)}` };
  return { text: 'Dnes' };
}

export function fmtPoints(points: number): string {
  // Float sums from the backend (3.9999…) must read „4“, not „4,0“.
  const shown = Math.round(points * 10) / 10;
  return Number.isInteger(shown) ? String(shown) : shown.toFixed(1).replace('.', ',');
}

/** One points style in the whole module: „+1 bod“, „+3 body“, „+5 bodů“. */
export function pointsLabel(points: number | null): string {
  if (points === null) return '';
  return `+${pointsAmount(points)}`;
}

/** Same without the sign: „1 bod“, „128 bodů“, „2,5 bodu“. */
export function pointsAmount(points: number): string {
  const { value, word } = pointsParts(points);
  return `${value}\u00a0${word}`;
}

/**
 * Number and unit as separate parts for big-number layouts („+4“ + „body“). The unit is
 * declined from the same value that is shown, so the two can never disagree; a missing value
 * is „—“ with the neutral „bodů“.
 */
export function pointsParts(
  points: number | null | undefined,
  opts: { sign?: boolean } = {},
): { value: string; word: string } {
  if (points == null || Number.isNaN(points)) return { value: '—', word: 'bodů' };
  const value = fmtPoints(points);
  return {
    value: opts.sign && points >= 0 ? `+${value}` : value,
    word: pointsWord(Number(value.replace(',', '.'))),
  };
}

/** Does the spoken genitive of `n` start with s/š/z/ž or a hard cluster (dvou, tří, čtyř)? */
function zeBefore(n: number): boolean {
  if (n < 10) return [2, 3, 4, 6, 7].includes(n); // dvou, tří, čtyř, šesti, sedmi
  if (n < 20) return [12, 13, 14, 16, 17].includes(n); // dvanácti … sedmnácti
  if (n < 100) return zeBefore(Math.floor(n / 10)); // dvaceti, šedesáti, sedmdesáti
  if (n < 1000) return n < 200 || zeBefore(Math.floor(n / 100)); // sta, dvou set
  if (n < 1_000_000) return n >= 2000 && zeBefore(Math.floor(n / 1000)); // tisíce, dvou tisíc
  return false;
}

/** „ze“ before 2, 3, 4, 6, 7, 12–14, 16, 17, 20…; „z“ before 1, 5, 8, 9, 10, 11, 15… */
export function outOfPrep(total: number): 'z' | 'ze' {
  return zeBefore(Math.abs(Math.trunc(total))) ? 'ze' : 'z';
}

/** „1 ze 3“, „3 z 5“ with no-break spaces so it never wraps. */
export function formatOutOf(done: number, total: number): string {
  return `${done}\u00a0${outOfPrep(total)}\u00a0${total}`;
}

const SPENT_SOURCES = ['Odměny', 'Sankce'];

export interface MonthPoints {
  /** Points earned this month (sum of the „Získáno“ sources). */
  earned: number | null;
  /** Points spent this month, positive (sum of the „Utraceno“ sources). */
  spent: number | null;
  /** earned − spent: the one net figure shown as „Tento měsíc čistě“. */
  net: number | null;
  earnedSources: [string, number][];
  spentSources: [string, number][];
}

/**
 * One source of truth for the monthly numbers of the points sheet: the header (net), the
 * „Měsíc získáno“ tile and the „Odkud jsou body“ breakdown all come from here, so
 * earned − spent = net always reconciles.
 */
export function monthPoints(
  s: Pick<PointsSummary, 'earned_month' | 'spent_month' | 'sources_month'> | null | undefined,
): MonthPoints {
  const earnedSources: [string, number][] = [];
  const spentSources: [string, number][] = [];
  for (const [label, value] of Object.entries(s?.sources_month ?? {})) {
    if (value == null || value === 0) continue;
    if (SPENT_SOURCES.includes(label) || value < 0) spentSources.push([label, Math.abs(value)]);
    else earnedSources.push([label, value]);
  }
  const sum = (xs: [string, number][]) => xs.reduce((a, [, v]) => a + v, 0);
  const fromSources = earnedSources.length + spentSources.length > 0;
  const earned = fromSources ? sum(earnedSources) : (s?.earned_month ?? null);
  const spent = fromSources ? sum(spentSources) : (s?.spent_month ?? null);
  const net = earned == null ? null : earned - (spent ?? 0);
  return { earned, spent, net, earnedSources, spentSources };
}

export interface ChoreTally {
  done: number;
  pending: number;
  open: number;
  total: number;
  /** Points of approved/done chores only. */
  earned: number;
  /** Points still waiting for a parent's approval. */
  waiting: number;
}

export function choreTally(chores: FamilyChore[]): ChoreTally {
  const t: ChoreTally = {
    done: 0,
    pending: 0,
    open: 0,
    total: chores.length,
    earned: 0,
    waiting: 0,
  };
  for (const c of chores) {
    if (c.state === 'done') {
      t.done += 1;
      t.earned += c.points ?? 0;
    } else if (c.state === 'claimed') {
      t.pending += 1;
      t.waiting += c.points ?? 0;
    } else t.open += 1;
  }
  return t;
}

export function isTransferredOut(chore: Pick<FamilyChore, 'swap_today'>): boolean {
  return chore.swap_today?.kind === 'transferred_out' && chore.swap_today.muted !== false;
}

export function choreApprovalKind(chore: FamilyChore): 'swap' | 'completion' | null {
  if (chore.counts_today === false || isTransferredOut(chore)) return null;
  if (chore.swap_today?.kind === 'pending_give') return 'swap';
  return chore.state === 'claimed' ? 'completion' : null;
}

const CHORE_RANK: Record<FamilyChore['state'], number> = {
  overdue: 0,
  todo: 1,
  claimed: 2,
  done: 3,
};

/** What still needs doing first (overdue, open), then waiting for approval, done last. */
export function sortChores(chores: FamilyChore[]): FamilyChore[] {
  return chores
    .map((c, i) => ({ c, i }))
    .sort((a, b) => CHORE_RANK[a.c.state] - CHORE_RANK[b.c.state] || a.i - b.i)
    .map(({ c }) => c);
}

interface EventMember {
  id: string;
  name: string;
}

const norm = (s: string) => s.trim().toLocaleLowerCase('cs');

/**
 * Who an event belongs to: a per-member calendar (calendar named after the member) or
 * a summary prefix „Syn: …“ / „Dcera, Syn – …“. Unknown names leave the summary as is.
 */
export function eventWho(
  ev: Pick<FamilyEvent, 'summary' | 'source'>,
  members: EventMember[],
): { who: string[]; title: string } {
  const byName = new Map(members.map((m) => [norm(m.name), m.id]));
  const own = byName.get(norm(ev.source));
  if (own) return { who: [own], title: ev.summary };
  const m = /^\s*([^:–—-]{1,60}?)\s*(?::|\s[–—-])\s*(.+)$/u.exec(ev.summary);
  if (m) {
    const names = m[1]!.split(/\s*(?:,|&|\+|\sa\s)\s*/u).filter(Boolean);
    const ids = names.map((n) => byName.get(norm(n)));
    if (ids.length && ids.every(Boolean)) return { who: ids as string[], title: m[2]!.trim() };
  }
  return { who: [], title: ev.summary };
}

/**
 * Day relative to today, one style everywhere: „dnes“, „zítra“, otherwise a lowercase
 * weekday + date („ne\u00a030.\u00a011.“) – never a bare weekday.
 */
export function dayWord(day: Date, now: Date): string {
  const start = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((start(day) - start(now)) / 86_400_000);
  if (diff === 0) return 'dnes';
  if (diff === 1) return 'zítra';
  return shortDate(day);
}

/**
 * Upcoming chore: day and due time („18:00“) as separate parts. Tomorrow keeps its date
 * („zítra\u00a0·\u00a0so\u00a020.\u00a011.“) so it never has to be worked out; later days
 * are „ne\u00a022.\u00a011.“. `short` (kiosk line) drops the date after „zítra“.
 */
export function upcomingParts(
  due: string | null,
  now: Date,
  opts: { short?: boolean } = {},
): { day: string; time: string } {
  const d = due ? new Date(due) : null;
  if (!d || Number.isNaN(d.getTime())) return { day: 'později', time: '' };
  const word = dayWord(d, now);
  const day =
    word === 'zítra' && !opts.short
      ? `zítra\u00a0·\u00a0${(DAY[d.getDay()] ?? '').toLowerCase()}\u00a0${czDate(d)}`
      : word;
  return { day, time: timeLabel(due!) };
}

/** „zítra 18:00“, „ne 30. 11. 17:00“. */
export function upcomingLabel(due: string | null, now: Date): string {
  const { day, time } = upcomingParts(due, now, { short: true });
  return time ? `${day} ${time}` : day;
}

/**
 * Default first day of a new chore: today while the due time is still ahead (at least
 * 15 minutes, so the kid can actually do it), otherwise tomorrow.
 */
export function defaultFirstDate(now: Date, dueTime: string): Date {
  const [h, m] = dueTime.split(':').map(Number);
  const due = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h ?? 18, m ?? 0);
  const today = due.getTime() - now.getTime() >= 15 * 60_000;
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + (today ? 0 : 1), 12);
}

/** A whole-hour deadline at least 30 minutes away, or the final 23:30 slot. */
export function nextTodayTime(now: Date): string | null {
  const hour = new Date(now);
  hour.setMinutes(0, 0, 0);
  const next = new Date(now.getTime() + 30 * 60_000);
  while (hour < next) hour.setHours(hour.getHours() + 1);
  if (localKey(hour) === localKey(now) && hour.getHours() <= 23)
    return `${String(hour.getHours()).padStart(2, '0')}:00`;
  const last = new Date(now);
  last.setHours(23, 30, 0, 0);
  return last >= next ? '23:30' : null;
}

export function canTransferChore(c: FamilyChore | FamilyUpcomingChore | null | undefined): boolean {
  return (
    !!c?.due &&
    !!c.can_request_swap &&
    c.state !== 'done' &&
    c.state !== 'claimed' &&
    (!c.swap_today || c.swap_today.kind === 'transfer_failed')
  );
}

export function datedHandover(label: string, day: string | undefined, now: Date): string {
  return day ? `${label} · ${dayWord(new Date(`${day}T12:00:00`), now)}` : label;
}

export function transferLabel(swap: FamilySwapToday, now: Date): string {
  if (swap.kind === 'transferred_out') {
    return swap.local_date
      ? reassignedToLabel(
          swap.partner_name ?? 'sourozence',
          dayWord(new Date(`${swap.local_date}T12:00:00`), now),
        )
      : handedToLabel(swap.partner_name);
  }
  if (swap.kind === 'transferred_in' && !swap.muted) return takenFromLabel(swap.partner_name);
  return swap.label;
}

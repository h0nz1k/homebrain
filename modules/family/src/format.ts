import type { FamilyChore, FamilyEvent } from './types.js';

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

export function longDate(now: Date): string {
  return `${DAY_LONG[now.getDay()]} ${now.getDate()}. ${MONTH_GEN[now.getMonth()]}`;
}

export function todayEvents(events: FamilyEvent[], now: Date): FamilyEvent[] {
  const key = localKey(now);
  return events.filter(
    (e) =>
      eventDay(e) === key || (e.all_day && e.start.slice(0, 10) < key && e.end.slice(0, 10) > key),
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
      date: `${d.getDate()}. ${d.getMonth() + 1}.`,
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

export function choreNote(chore: FamilyChore, now: Date): { text: string; tone?: 'warn' | 'crit' } {
  if (chore.state === 'done') return { text: 'Hotovo' };
  if (chore.state === 'claimed') return { text: 'Čeká na schválení', tone: 'warn' };
  const due = chore.due ? new Date(chore.due) : null;
  if (chore.state === 'overdue')
    return { text: due ? `Po termínu (${timeLabel(chore.due!)})` : 'Po termínu', tone: 'crit' };
  if (due && localKey(due) === localKey(now)) return { text: `Do ${timeLabel(chore.due!)}` };
  return { text: 'Dnes' };
}

export function pointsLabel(points: number | null): string {
  if (points === null) return '';
  const n = Number.isInteger(points) ? String(points) : points.toFixed(1).replace('.', ',');
  return `+${n}\u00a0b.`;
}

export function kidProgress(chores: FamilyChore[]): { done: number; total: number } {
  return { done: chores.filter((c) => c.state === 'done').length, total: chores.length };
}

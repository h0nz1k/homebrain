import type { ConnectionLike } from './index.js';
import { schoolDay, schoolDayOffset } from './school.js';

/** School timetable per child (Rodina, Dnes). Times are Europe/Prague wall clock „07:30“. */
export interface TimetableBell {
  start: string;
  end: string;
}

export interface TimetableLesson extends TimetableBell {
  period: number;
  subject: string;
}

export interface TimetableDay {
  date: string;
  /** The child has lessons that day. */
  school: boolean;
  /** Holiday or configured free range („Podzimní prázdniny“); null on weekends. */
  free: string | null;
  lessons: TimetableLesson[];
  start: string | null;
  end: string | null;
  lunch: TimetableBell | null;
  bring: Array<{ subject: string; item: string }>;
}

export interface TimetableAfternoon {
  weekday?: number | null;
  grades?: number[] | null;
  lunch: TimetableBell | null;
  periods: Array<TimetableBell & { period: number }>;
}

export interface TimetableChild {
  id: string;
  name: string;
  /** Mon–Fri × periods 1–9, „“ = empty period. */
  grid: string[][];
  afternoon_days: number[];
  /** Today and the next 7 days. */
  days: TimetableDay[];
  /** Today until its last lesson ends, otherwise the next day with lessons. */
  next: TimetableDay | null;
}

export interface TimetableSnapshot {
  enabled: boolean;
  today: string;
  bells: Array<TimetableBell | null>;
  afternoon: TimetableAfternoon | null;
  children: TimetableChild[];
}

export function getTimetable(connection: ConnectionLike): Promise<TimetableSnapshot> {
  return connection.sendMessagePromise<TimetableSnapshot>({ type: 'homebrain/family/timetable' });
}

const wallClock = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Prague',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** „07:30“ in Europe/Prague, comparable with lesson times as strings. */
export function timetableClock(now: Date): string {
  return wallClock.format(now);
}

/** „07:30“ → „7:30“ for display. */
export function timetableTime(clock: string | null | undefined): string {
  return clock ? clock.replace(/^0(\d)/, '$1') : '';
}

export function timetableSpan(day: Pick<TimetableDay, 'start' | 'end'>): string {
  return `${timetableTime(day.start)}–${timetableTime(day.end)}`;
}

export function timetableDay(child: TimetableChild, date: string): TimetableDay | undefined {
  return child.days.find((day) => day.date === date);
}

export type TimetablePhase = 'before' | 'lesson' | 'break' | 'lunch' | 'after' | 'none';

export interface TimetableStatus {
  today: TimetableDay | undefined;
  phase: TimetablePhase;
  /** The running lesson, or during a break the one that follows. */
  lesson: TimetableLesson | undefined;
}

export function timetableStatus(child: TimetableChild, now: Date): TimetableStatus {
  const today = timetableDay(child, schoolDay(now));
  if (!today?.school || !today.start || !today.end)
    return { today, phase: 'none', lesson: undefined };
  const clock = timetableClock(now);
  if (clock < today.start) return { today, phase: 'before', lesson: today.lessons[0] };
  if (clock >= today.end) return { today, phase: 'after', lesson: undefined };
  const running = today.lessons.find((row) => row.start <= clock && clock < row.end);
  if (running) return { today, phase: 'lesson', lesson: running };
  const lesson = today.lessons.find((row) => row.start > clock);
  const lunch = today.lunch && today.lunch.start <= clock && clock < today.lunch.end;
  return { today, phase: lunch ? 'lunch' : 'break', lesson };
}

export function timetableTomorrow(child: TimetableChild, now: Date): TimetableDay | undefined {
  return timetableDay(child, schoolDayOffset(schoolDay(now), 1));
}

/** „cvičky a úbor (Tv), výtvarné potřeby (Vv)“. */
export function timetableBring(day: TimetableDay): string {
  return day.bring.map((row) => `${row.item} (${row.subject})`).join(', ');
}

const lowerFirst = (text: string) =>
  /^\p{Lu}\p{Ll}/u.test(text) ? text.charAt(0).toLocaleLowerCase('cs-CZ') + text.slice(1) : text;

/** Dnes: one row per child, grouped under „Dnes“ / „Zítra“ (the shared free day has no name). */
export interface TimetableRow {
  when: 'today' | 'tomorrow';
  name: string | null;
  /** „7:30–12:05“, „do 12:05 · teď M“, „volno (podzimní prázdniny)“. */
  text: string;
  /** „cvičky a úbor (Tv)“ or „“. */
  bring: string;
}

/**
 * Before/while school „Ema · 7:30–12:05“ / „do 12:05 · teď M“ under Dnes, afterwards the next
 * day „Ema · 7:30–12:05 · s sebou: …“ under Zítra, and on the eve of free days „volno (…)“.
 */
export function timetableRow(child: TimetableChild, now: Date): TimetableRow | null {
  const { today, phase, lesson } = timetableStatus(child, now);
  if (today?.school && phase !== 'after') {
    const end = timetableTime(today.end);
    const row = { when: 'today' as const, name: child.name, bring: '' };
    if (phase === 'before')
      return { ...row, text: timetableSpan(today), bring: timetableBring(today) };
    if (phase === 'lesson') return { ...row, text: `do ${end} · teď ${lesson!.subject}` };
    if (phase === 'lunch') return { ...row, text: `do ${end} · polední přestávka` };
    return { ...row, text: `do ${end}${lesson ? ` · pak ${lesson.subject}` : ''}` };
  }
  const tomorrow = timetableTomorrow(child, now);
  if (tomorrow?.school)
    return {
      when: 'tomorrow',
      name: child.name,
      text: timetableSpan(tomorrow),
      bring: timetableBring(tomorrow),
    };
  if (tomorrow?.free && !today?.free)
    return {
      when: 'tomorrow',
      name: null,
      text: `volno (${lowerFirst(tomorrow.free)})`,
      bring: '',
    };
  return null;
}

/** Every child with lessons today is done (the evening); false on days without school. */
export function timetableSchoolOver(children: TimetableChild[], now: Date): boolean {
  const phases = children.map((child) => timetableStatus(child, now).phase);
  return phases.includes('after') && phases.every((phase) => phase === 'after' || phase === 'none');
}

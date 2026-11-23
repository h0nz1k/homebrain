import type { ConnectionLike } from './index.js';

export interface SchoolLunch {
  date: string;
  soup: string;
  main: string;
  sides: string[];
  allergens: string[];
}

export interface SchoolEvent {
  date: string;
  end_date: string | null;
  title: string;
  grades: number[] | null;
  person_ids: string[];
}

export interface SchoolSnapshot {
  enabled: boolean;
  updated_at: string | null;
  lunch: SchoolLunch[];
  events: SchoolEvent[];
  dates: Array<{ date: string; title: string }>;
}

export function getSchool(
  connection: ConnectionLike,
  remindersOnly = false,
): Promise<SchoolSnapshot> {
  const message = {
    type: 'homebrain/family/school',
    reminders_only: remindersOnly,
  };
  return connection.sendMessagePromise<SchoolSnapshot>(message);
}

const calendar = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Prague',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const clock = new Intl.DateTimeFormat('cs-CZ', {
  timeZone: 'Europe/Prague',
  hour: 'numeric',
  hourCycle: 'h23',
});
const shortDate = new Intl.DateTimeFormat('cs-CZ', {
  timeZone: 'UTC',
  day: 'numeric',
  month: 'numeric',
});
const loadedTime = new Intl.DateTimeFormat('cs-CZ', {
  timeZone: 'Europe/Prague',
  hour: 'numeric',
  minute: '2-digit',
  hourCycle: 'h23',
});
const WEEKDAYS = ['ne', 'po', 'út', 'st', 'čt', 'pá', 'so'];

export function schoolDay(now: Date): string {
  const parts = calendar.formatToParts(now);
  const value = (type: string) => parts.find((part) => part.type === type)?.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}

export function schoolDayOffset(day: string, offset: number): string {
  const date = new Date(day + 'T00:00:00Z');
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

export function schoolWeek(day: string): string[] {
  const weekday = new Date(day + 'T00:00:00Z').getUTCDay();
  return Array.from({ length: 5 }, (_, i) => schoolDayOffset(day, i - ((weekday + 6) % 7)));
}

export function schoolDateLabel(day: string, weekday = false): string {
  const date = new Date(day + 'T00:00:00Z');
  const label = shortDate.format(date);
  return weekday ? `${WEEKDAYS[date.getUTCDay()]} ${label}` : label;
}

/** „načteno dnes 4:00“ / „načteno 2. 11. 4:00“ in Europe/Prague. */
export function schoolLastLoaded(stamp: string, now: Date): string {
  const loaded = new Date(stamp);
  const day = schoolDay(loaded);
  const when = day === schoolDay(now) ? 'dnes' : schoolDateLabel(day);
  return `načteno ${when} ${loadedTime.format(loaded)}`;
}

/** Canteen soups come capitalised („Mrkvová“); render them as „polévka mrkvová“. */
export function schoolSoup(soup: string): string {
  const name = soup.trim().replace(/^polévka\s+/i, '');
  return `polévka ${name.charAt(0).toLocaleLowerCase('cs-CZ')}${name.slice(1)}`;
}

/**
 * `schoolOver`: the children's school day has ended (timetable), so today's events are past;
 * events that continue tomorrow stay (labelled „Zítra“ by the caller).
 */
export function schoolToday(snapshot: SchoolSnapshot, now: Date, schoolOver = false) {
  const today = schoolDay(now);
  const tomorrow = schoolDayOffset(today, 1);
  const afterLunch = Number(clock.format(now)) >= 14;
  const lunch = snapshot.lunch.find((row) => row.date === (afterLunch ? tomorrow : today));
  const events = snapshot.events
    .filter(
      (row) =>
        row.date <= tomorrow && (row.end_date ?? row.date) >= (schoolOver ? tomorrow : today),
    )
    .filter((row) => row.person_ids.length > 0);
  return { lunch, afterLunch, events, tomorrow };
}

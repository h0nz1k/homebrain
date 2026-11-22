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
const loadedAt = new Intl.DateTimeFormat('cs-CZ', {
  timeZone: 'Europe/Prague',
  dateStyle: 'short',
  timeStyle: 'short',
});

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

export function schoolDateLabel(day: string): string {
  return shortDate.format(new Date(day + 'T00:00:00Z'));
}

export function schoolLastLoaded(stamp: string): string {
  return `Naposledy načteno ${loadedAt.format(new Date(stamp))}`;
}

export function schoolToday(snapshot: SchoolSnapshot, now: Date) {
  const today = schoolDay(now);
  const tomorrow = schoolDayOffset(today, 1);
  const afterLunch = Number(clock.format(now)) >= 14;
  const lunch = snapshot.lunch.find((row) => row.date === (afterLunch ? tomorrow : today));
  const events = snapshot.events
    .filter((row) => row.date <= tomorrow && (row.end_date ?? row.date) >= today)
    .filter((row) => row.person_ids.length > 0);
  return { lunch, afterLunch, events, tomorrow };
}

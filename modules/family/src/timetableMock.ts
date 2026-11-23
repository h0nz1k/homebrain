import {
  schoolDay,
  schoolDayOffset,
  timetableClock,
  type TimetableBell,
  type TimetableDay,
  type TimetableSnapshot,
} from '@homebrain/ha-client';
import type { TimetableChildSettings, TimetableSettings } from './types.js';

/** `off` = no timetable; `holiday` = free days start tomorrow („Podzimní prázdniny“). */
export type TimetableScenario = 'off' | 'full' | 'holiday';

export const DEFAULT_TIMETABLE_ITEMS: Record<string, string> = {
  Tv: 'cvičky a úbor',
  Vv: 'výtvarné potřeby',
  Pč: 'pracovní oděv a potřeby',
  Hv: '',
};

/** Shape of a Czech primary school bell page (synthetic times). */
export const MOCK_BELLS: TimetableBell[] = [
  { start: '07:30', end: '08:15' },
  { start: '08:25', end: '09:10' },
  { start: '09:30', end: '10:15' },
  { start: '10:25', end: '11:10' },
  { start: '11:20', end: '12:05' },
  { start: '12:15', end: '13:00' },
];

const MOCK_AFTERNOON: TimetableSettings['afternoon'] = {
  weekday: 2,
  grades: [8, 9],
  lunch: { start: '12:05', end: '13:05' },
  periods: [
    { period: 6, start: '13:05', end: '13:50' },
    { period: 7, start: '13:55', end: '14:40' },
  ],
};

/** Ema: mostly until 12:05, Wednesday until 13:00, Tv on Friday (evening „s sebou“). Kuba: Wednesday afternoon until 14:40. */
const MOCK_CHILDREN: Record<string, TimetableChildSettings> = {
  dcera: {
    days: [
      ['Čj', 'M', 'Aj', 'Vl', 'Tv'],
      ['Čj', 'M', 'Vv', 'Vv', 'Hv'],
      ['Čj', 'M', 'Př', 'Aj', 'Inf', 'Pč'],
      ['Čj', 'M', 'Vl', 'Tv', 'Tv'],
      ['Čj', '', 'M', 'Aj', 'Tv'],
    ],
    afternoon_days: null,
  },
  syn: {
    days: [
      ['M', 'Čj', 'Aj', 'F', 'D', 'Z'],
      ['Ch', 'M', 'Čj', 'Př', 'Tv', 'Tv'],
      ['Čj', 'M', 'Aj', 'Nj', 'F', 'Tv', 'Tv'],
      ['M', 'Čj', 'Inf', 'Ch', 'D'],
      ['Aj', 'M', 'Čj', 'Z', 'Nj'],
    ],
    afternoon_days: [2],
  },
};

export function mockTimetableSettings(scenario: TimetableScenario, now: Date): TimetableSettings {
  const tomorrow = schoolDayOffset(schoolDay(now), 1);
  return {
    bells: [],
    afternoon: null,
    holiday_calendar: 'auto',
    free:
      scenario === 'holiday'
        ? [{ start: tomorrow, end: schoolDayOffset(tomorrow, 4), label: 'Podzimní prázdniny' }]
        : [],
    items: { ...DEFAULT_TIMETABLE_ITEMS },
    children: scenario === 'off' ? {} : structuredClone(MOCK_CHILDREN),
    imported: { bells: MOCK_BELLS, afternoon: MOCK_AFTERNOON },
    auto_holiday_calendar: 'calendar.demo_svatky',
  };
}

const weekday = (day: string) => (new Date(day + 'T00:00:00Z').getUTCDay() + 6) % 7;

/** Same rules as `family/timetable.py` (manual bells win, afternoon variant, free days). */
export function mockTimetable(
  settings: TimetableSettings,
  kids: Array<{ id: string; name: string; grade?: number | null }>,
  now: Date,
  role: string,
): TimetableSnapshot {
  const bells = settings.bells.length ? settings.bells : (settings.imported?.bells ?? []);
  const afternoon = settings.afternoon ?? settings.imported?.afternoon ?? null;
  const today = schoolDay(now);
  const freeLabel = (day: string) =>
    settings.free.find((row) => row.start <= day && day <= row.end)?.label ?? null;
  const afternoonDays = (child: TimetableChildSettings, grade: number | null | undefined) => {
    if (child.afternoon_days) return child.afternoon_days;
    if (afternoon?.weekday == null || !afternoon.periods.length) return [];
    return !afternoon.grades || (grade != null && afternoon.grades.includes(grade))
      ? [afternoon.weekday]
      : [];
  };
  const schedule = (child: TimetableChildSettings, days: number[], date: string): TimetableDay => {
    const wd = weekday(date);
    const free = wd < 5 ? freeLabel(date) : null;
    const times = new Map<number, TimetableBell>();
    bells.forEach((bell, i) => bell && times.set(i + 1, bell));
    if (days.includes(wd))
      afternoon?.periods.forEach((row) =>
        times.set(row.period, { start: row.start, end: row.end }),
      );
    const lessons =
      wd < 5 && !free
        ? (child.days[wd] ?? []).flatMap((subject, i) => {
            const bell = times.get(i + 1);
            return subject && bell ? [{ period: i + 1, subject, ...bell }] : [];
          })
        : [];
    const first = lessons[0];
    const last = lessons[lessons.length - 1];
    const lunch =
      days.includes(wd) && first && last && afternoon?.lunch
        ? first.start < afternoon.lunch.start && afternoon.lunch.start < last.end
          ? afternoon.lunch
          : null
        : null;
    return {
      date,
      school: lessons.length > 0,
      free,
      lessons,
      start: first?.start ?? null,
      end: last?.end ?? null,
      lunch,
      bring: [...new Set(lessons.map((row) => row.subject))].flatMap((subject) =>
        settings.items[subject] ? [{ subject, item: settings.items[subject] }] : [],
      ),
    };
  };
  const clock = timetableClock(now);
  const children = ['owner', 'adult', 'child'].includes(role)
    ? kids.flatMap((kid) => {
        const child = settings.children[kid.id];
        if (!child?.days.some((day) => day.some(Boolean))) return [];
        const days = afternoonDays(child, kid.grade);
        const upcoming = Array.from({ length: 8 }, (_, i) =>
          schedule(child, days, schoolDayOffset(today, i)),
        );
        let next: TimetableDay | null = null;
        for (let i = 0; i < 120 && !next; i++) {
          const day = upcoming[i] ?? schedule(child, days, schoolDayOffset(today, i));
          if (day.school && (i > 0 || clock < day.end!)) next = day;
        }
        return [
          {
            id: kid.id,
            name: kid.name,
            grid: child.days,
            afternoon_days: days,
            days: upcoming,
            next,
          },
        ];
      })
    : [];
  return {
    enabled: children.length > 0,
    today,
    bells: children.length ? bells : [],
    afternoon: children.length ? afternoon : null,
    children,
  };
}

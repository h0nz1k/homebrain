import { describe, expect, it } from 'vitest';
import {
  timetableClock,
  timetableLine,
  type TimetableChild,
  type TimetableDay,
} from './timetable.js';

const lesson = (period: number, subject: string, start: string, end: string) => ({
  period,
  subject,
  start,
  end,
});
const day = (date: string, extra: Partial<TimetableDay> = {}): TimetableDay => {
  const lessons = extra.lessons ?? [];
  return {
    date,
    school: lessons.length > 0,
    free: null,
    lunch: null,
    bring: [],
    start: lessons[0]?.start ?? null,
    end: lessons[lessons.length - 1]?.end ?? null,
    ...extra,
    lessons,
  };
};
const ema: TimetableChild = {
  id: 'ema',
  name: 'Ema',
  grid: [],
  afternoon_days: [],
  next: null,
  days: [
    day('2026-11-23', {
      lessons: [
        lesson(1, 'Čj', '07:30', '08:15'),
        lesson(2, 'M', '08:25', '09:10'),
        lesson(3, 'Tv', '09:30', '10:15'),
      ],
      bring: [{ subject: 'Tv', item: 'cvičky a úbor' }],
    }),
    day('2026-11-24', {
      lessons: [lesson(1, 'Vv', '07:30', '08:15'), lesson(2, 'Vv', '08:25', '09:10')],
      bring: [{ subject: 'Vv', item: 'výtvarné potřeby' }],
    }),
    day('2026-11-25', { free: 'Podzimní prázdniny' }),
  ],
};
const at = (time: string, date = '2026-11-23') => new Date(`${date}T${time}:00+01:00`);

describe('rozvrh na Dnes', () => {
  it('ráno, při hodině, o přestávce a po vyučování', () => {
    expect(timetableClock(at('07:05'))).toBe('07:05');
    expect(timetableLine(ema, at('07:05'))).toBe(
      'Ema · škola 7:30–10:15 · s sebou: cvičky a úbor (Tv)',
    );
    expect(timetableLine(ema, at('08:30'))).toBe('Ema · škola do 10:15 · teď M');
    expect(timetableLine(ema, at('09:15'))).toBe('Ema · škola do 10:15 · pak Tv');
    expect(timetableLine(ema, at('19:00'))).toBe(
      'Zítra Ema 7:30–9:10 · s sebou: výtvarné potřeby (Vv)',
    );
  });

  it('večer před volnem, během volna nic', () => {
    expect(timetableLine(ema, at('18:00', '2026-11-24'))).toBe('Zítra volno (podzimní prázdniny)');
    expect(timetableLine(ema, at('09:00', '2026-11-25'))).toBeNull();
  });

  it('čas podle Prahy i přes změnu času', () => {
    expect(timetableClock(new Date('2026-10-26T06:31:00Z'))).toBe('07:31');
    expect(timetableClock(new Date('2026-10-23T05:31:00Z'))).toBe('07:31');
  });
});

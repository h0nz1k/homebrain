import { describe, expect, it } from 'vitest';
import {
  choreNote,
  isPast,
  nextDays,
  nextEvent,
  pointsLabel,
  relLabel,
  todayEvents,
} from './format.js';
import type { FamilyChore, FamilyEvent } from './types.js';

const now = new Date(2026, 5, 2, 12, 40);
const at = (d: number, h: number, m = 0) => new Date(2026, 5, d, h, m).toISOString();
const ev = (id: string, start: string, end: string, all_day = false): FamilyEvent => ({
  id,
  calendar: 'calendar.rodina',
  source: 'Rodina',
  kind: 'family',
  summary: id,
  start,
  end,
  all_day,
});
const events = [
  ev('rano', at(2, 7, 45), at(2, 8, 15)),
  ev('trenink', at(2, 16, 30), at(2, 18)),
  ev('vylet', '2026-06-03', '2026-06-04', true),
  ev('zubar', at(4, 17), at(4, 18)),
];

describe('family format', () => {
  it('splits today and the next 7 days (empty days included)', () => {
    expect(todayEvents(events, now).map((e) => e.id)).toEqual(['rano', 'trenink']);
    const days = nextDays(events, now);
    expect(days).toHaveLength(7);
    expect(days[0]).toMatchObject({ day: 'St', date: '3. 6.' });
    expect(days[0]!.events.map((e) => e.id)).toEqual(['vylet']);
    expect(days[1]!.events.map((e) => e.id)).toEqual(['zubar']);
    expect(days[2]!.events).toEqual([]);
  });

  it('finds the next event and its countdown', () => {
    const next = nextEvent(events, now)!;
    expect(next.id).toBe('trenink');
    expect(relLabel(next, now)).toBe('Za 3 h 50 min');
    expect(isPast(events[0]!, now)).toBe(true);
  });

  it('describes chore states in Czech', () => {
    const c = (state: FamilyChore['state'], due: string | null = null): FamilyChore => ({
      id: 'x',
      name: 'x',
      state,
      points: 2,
      due,
      can_claim: false,
      can_approve: false,
    });
    expect(choreNote(c('claimed'), now)).toEqual({ text: 'Čeká na schválení', tone: 'warn' });
    expect(choreNote(c('todo', at(2, 18)), now).text).toBe('Do 18:00');
    expect(choreNote(c('overdue', at(2, 8)), now)).toEqual({
      text: 'Po termínu (8:00)',
      tone: 'crit',
    });
    expect(pointsLabel(2)).toBe('+2\u00a0b.');
    expect(pointsLabel(1.5)).toBe('+1,5\u00a0b.');
  });
});

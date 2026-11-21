import { describe, expect, it } from 'vitest';
import {
  choreNote,
  choreTally,
  czDate,
  dayWord,
  defaultFirstDate,
  upcomingLabel,
  upcomingParts,
  eventWho,
  formatOutOf,
  outOfPrep,
  pointsAmount,
  isPast,
  monthPoints,
  nextDays,
  nextEvent,
  pointsLabel,
  pointsParts,
  timeRange,
  relLabel,
  sortChores,
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
    expect(days[0]).toMatchObject({ day: 'St', date: '3.\u00a06.' });
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
    for (const state of ['overdue', 'claimed'] as const) {
      expect(choreNote(c(state, at(1, 8)), now)).toEqual({
        text: 'Přeneseno · původně po 1. 6.',
      });
    }
    expect(choreNote(c('done', at(1, 8)), now).text).toBe('');
    expect(pointsLabel(2)).toBe('+2\u00a0body');
    expect(pointsLabel(1.5)).toBe('+1,5\u00a0bodu');
  });

  it.each([
    [0, 1, '0\u00a0z\u00a01'],
    [1, 2, '1\u00a0ze\u00a02'],
    [1, 3, '1\u00a0ze\u00a03'],
    [2, 3, '2\u00a0ze\u00a03'],
    [1, 4, '1\u00a0ze\u00a04'],
    [3, 5, '3\u00a0z\u00a05'],
    [2, 6, '2\u00a0ze\u00a06'], // ze šesti
    [2, 7, '2\u00a0ze\u00a07'], // ze sedmi
    [4, 8, '4\u00a0z\u00a08'],
    [4, 9, '4\u00a0z\u00a09'],
    [5, 10, '5\u00a0z\u00a010'],
    [5, 11, '5\u00a0z\u00a011'],
    [5, 12, '5\u00a0ze\u00a012'],
    [5, 15, '5\u00a0z\u00a015'],
    [5, 17, '5\u00a0ze\u00a017'],
    [5, 20, '5\u00a0ze\u00a020'],
    [5, 25, '5\u00a0ze\u00a025'],
    [5, 50, '5\u00a0z\u00a050'],
    [5, 70, '5\u00a0ze\u00a070'],
    [5, 100, '5\u00a0ze\u00a0100'],
    [5, 500, '5\u00a0z\u00a0500'],
    [5, 1000, '5\u00a0z\u00a01000'],
  ])('formatOutOf(%i, %i) → %s', (done, total, text) => {
    expect(formatOutOf(done, total)).toBe(text);
    expect(outOfPrep(total)).toBe(text.includes('ze') ? 'ze' : 'z');
  });

  it.each([
    [0, '0\u00a0bodů'],
    [1, '1\u00a0bod'],
    [2, '2\u00a0body'],
    [4, '4\u00a0body'],
    [5, '5\u00a0bodů'],
    [128, '128\u00a0bodů'],
    [2.5, '2,5\u00a0bodu'],
  ])('pointsAmount(%s) → %s (no „b.“ anywhere)', (n, text) => {
    expect(pointsAmount(n)).toBe(text);
    expect(pointsLabel(n)).toBe(`+${text}`);
  });

  it.each([
    [0, '+0', 'bodů'],
    [1, '+1', 'bod'],
    [2, '+2', 'body'],
    [4, '+4', 'body'],
    [5, '+5', 'bodů'],
    [3.99999, '+4', 'body'],
    [null, '—', 'bodů'],
  ])('pointsParts(%s) → %s %s (points sheet path)', (n, value, word) => {
    expect(pointsParts(n, { sign: true })).toEqual({ value, word });
    if (n != null) expect(pointsLabel(n)).toBe(`${value}\u00a0${word}`);
  });

  it('timeRange uses one en dash format', () => {
    expect(
      timeRange({ start: '2026-11-19T07:45:00+01:00', end: '2026-11-19T08:15:00+01:00' }),
    ).toMatch(/^\d{1,2}:\d{2}–\d{1,2}:\d{2}$/u);
  });

  const chore = (
    id: string,
    state: FamilyChore['state'],
    points: number | null = 2,
  ): FamilyChore => ({
    id,
    name: id,
    state,
    points,
    due: null,
    can_claim: false,
    can_approve: false,
  });

  it('counts only approved/done chores as today points, pending separately', () => {
    const t = choreTally([
      chore('a', 'done', 2),
      chore('b', 'claimed', 4),
      chore('c', 'todo', 1),
      chore('d', 'done', null),
    ]);
    expect(t).toEqual({ done: 2, pending: 1, open: 1, total: 4, earned: 2, waiting: 4 });
  });

  it('orders overdue/open first, then pending approval, done last', () => {
    const order = sortChores([
      chore('done1', 'done'),
      chore('wait', 'claimed'),
      chore('todo', 'todo'),
      chore('late', 'overdue'),
      chore('done2', 'done'),
    ]).map((c) => c.id);
    expect(order).toEqual(['late', 'todo', 'wait', 'done1', 'done2']);
  });

  it('tells a viewer who cannot approve that a parent will approve', () => {
    const claimed = chore('x', 'claimed');
    expect(choreNote(claimed, now, { parentApproves: true })).toEqual({
      text: 'Schválí rodič',
      tone: 'warn',
    });
  });

  it('maps an event to family members by summary prefix or per-member calendar', () => {
    const members = [
      { id: 'dcera', name: 'Dcera' },
      { id: 'syn', name: 'Syn' },
    ];
    const prefixed = { ...events[1]!, summary: 'Syn: Trénink florbalu' };
    expect(eventWho(prefixed, members)).toEqual({ who: ['syn'], title: 'Trénink florbalu' });
    const both = { ...events[1]!, summary: 'Dcera, Syn – Kino' };
    expect(eventWho(both, members)).toEqual({ who: ['dcera', 'syn'], title: 'Kino' });
    const ownCal = { ...events[1]!, source: 'dcera', summary: 'Klavír' };
    expect(eventWho(ownCal, members)).toEqual({ who: ['dcera'], title: 'Klavír' });
    const nobody = { ...events[1]!, summary: 'Babička: oběd' };
    expect(eventWho(nobody, members)).toEqual({ who: [], title: 'Babička: oběd' });
  });

  it('formats Czech dates with no-break spaces only (never wraps inside a date)', () => {
    const d = new Date(2026, 10, 17, 12);
    expect(czDate(d)).toBe('17.\u00a011.');
    expect(czDate(d, { year: true })).toBe('17.\u00a011.\u00a02026');
    for (const out of [czDate(d), czDate(d, { year: true }), nextDays([], now)[0]!.date]) {
      expect(out).toContain('\u00a0');
      expect(out).not.toMatch(/ /);
    }
  });

  it('derives monthly points from one helper: net = earned − spent, reconciling with the sources', () => {
    const m = monthPoints({
      earned_month: 156,
      spent_month: 40,
      sources_month: { Úkoly: 144, Bonusy: 12, Odměny: 40, Sankce: 0, Ostatní: 0 },
    });
    expect(m).toMatchObject({ earned: 156, spent: 40, net: 116 });
    expect(m.earnedSources).toEqual([
      ['Úkoly', 144],
      ['Bonusy', 12],
    ]);
    expect(m.spentSources).toEqual([['Odměny', 40]]);
    const sum = (xs: [string, number][]) => xs.reduce((a, [, v]) => a + v, 0);
    expect(sum(m.earnedSources) - sum(m.spentSources)).toBe(m.net);
    // Negative sources (penalties) count as spent; without sources the summary fields are used.
    expect(
      monthPoints({ earned_month: 0, spent_month: 0, sources_month: { Úkoly: 10, Sankce: -3 } }),
    ).toMatchObject({ earned: 10, spent: 3, net: 7 });
    expect(monthPoints({ earned_month: 20, spent_month: 5, sources_month: {} })).toMatchObject({
      earned: 20,
      spent: 5,
      net: 15,
    });
    expect(monthPoints(null)).toMatchObject({ earned: null, net: null });
  });
});

describe('chore-fix dates', () => {
  const now = new Date(2026, 10, 19, 10); // Thursday
  it('dayWord: dnes / zítra / otherwise lowercase weekday + date, never a bare weekday', () => {
    expect(dayWord(new Date(2026, 10, 19, 20), now)).toBe('dnes');
    expect(dayWord(new Date(2026, 10, 20, 8), now)).toBe('zítra');
    expect(dayWord(new Date(2026, 10, 22, 8), now)).toBe('ne\u00a022.\u00a011.');
    expect(dayWord(new Date(2026, 10, 28, 8), now)).toBe('so\u00a028.\u00a011.');
  });
  it('upcomingParts / upcomingLabel: day and due time', () => {
    const due = new Date(2026, 10, 30, 17).toISOString();
    expect(upcomingParts(due, now)).toEqual({ day: 'po\u00a030.\u00a011.', time: '17:00' });
    expect(upcomingLabel(new Date(2026, 10, 20, 18).toISOString(), now)).toBe('zítra 18:00');
    expect(upcomingLabel(null, now)).toBe('později');
  });
  it('defaultFirstDate: today while the due time is ≥ 15 min ahead, else tomorrow', () => {
    expect(defaultFirstDate(now, '18:00').getDate()).toBe(19);
    expect(defaultFirstDate(new Date(2026, 10, 19, 17, 50), '18:00').getDate()).toBe(20);
    expect(defaultFirstDate(new Date(2026, 10, 19, 19), '18:00').getDate()).toBe(20);
    expect(defaultFirstDate(new Date(2026, 10, 30, 19), '18:00').getMonth()).toBe(11);
  });
});

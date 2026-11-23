// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import type { SchoolSnapshot, TimetableSnapshot } from '@homebrain/ha-client';
import { createMockHomeApi } from '../data/home.js';
import { TodaySchool } from './TodaySchool.js';

const morning = '2026-11-23T09:00:00+01:00';
const lunch = {
  date: '2026-11-23',
  main: 'Zeleninové placičky',
  soup: 'Mrkvová',
  sides: [],
  allergens: [],
};
const snapshot: SchoolSnapshot = {
  enabled: true,
  updated_at: '2026-11-22T05:00:00+01:00',
  lunch: [lunch, { ...lunch, date: '2026-11-24', main: 'Kuskus' }],
  events: [
    { date: '2026-11-23', title: 'Výstava', end_date: null, grades: null, person_ids: ['dite'] },
    { date: '2026-11-24', title: 'Divadlo', end_date: null, grades: [4], person_ids: ['dite'] },
    { date: '2026-11-24', title: 'Výlet', end_date: null, grades: [9], person_ids: [] },
  ],
  dates: [{ date: '2026-11-25', title: 'Schůzky' }],
};

const apiWith = (school: SchoolSnapshot) => ({
  ...createMockHomeApi('none', 'adult'),
  school: async () => school,
});
afterEach(cleanup);

const text = (id: string) => screen.getAllByTestId(id).map((el) => el.textContent);
// Each day group: its single label, then its lines.
const groups = () =>
  screen
    .getAllByTestId('school-group')
    .map((group) => [...group.querySelectorAll('p, li')].map((el) => el.textContent));

it('přepne ve 14.00 na zítřejší oběd a zachová ostatní školní údaje', async () => {
  const api = apiWith(snapshot);
  const { rerender } = render(<TodaySchool api={api} now={morning} kiosk />);
  expect((await screen.findByTestId('school-lunch')).textContent).toBe(
    'K obědu: Zeleninové placičky · polévka mrkvová',
  );
  expect(screen.getByRole('heading', { name: 'Škola' })).toBeTruthy();
  expect(groups()).toEqual([
    ['Dnes', 'K obědu: Zeleninové placičky · polévka mrkvová', 'Výstava'],
    ['Zítra', '4. ročník · Divadlo'],
    ['Dále', 'st 25. 11. · Schůzky'],
  ]);
  expect(screen.getByText('načteno 22. 11. 5:00')).toBeTruthy();
  rerender(<TodaySchool api={api} now="2026-11-23T14:00:00+01:00" kiosk />);
  expect(groups()).toEqual([
    ['Dnes', 'Výstava'],
    ['Zítra', 'K obědu: Kuskus · polévka mrkvová', '4. ročník · Divadlo'],
    ['Dále', 'st 25. 11. · Schůzky'],
  ]);
});

it('ukáže jen nejbližší důležitý termín a „načteno dnes“', async () => {
  const school = {
    ...snapshot,
    updated_at: '2026-11-23T04:00:00+01:00',
    dates: [
      { date: '2026-11-22', title: 'Minulé' },
      { date: '2026-11-25', title: 'Schůzky' },
      { date: '2026-12-01', title: 'Ředitelské volno' },
    ],
  };
  const shown: boolean[] = [];
  render(
    <TodaySchool
      api={apiWith(school)}
      now={morning}
      kiosk={false}
      onShown={(value) => shown.push(value)}
    />,
  );
  await screen.findByTestId('today-school');
  expect(text('school-date')).toEqual(['st 25. 11. · Schůzky']);
  expect(screen.getByText('načteno dnes 4:00')).toBeTruthy();
  await waitFor(() => expect(shown.at(-1)).toBe(true));
});

it.each([
  { state: 'prázdný jídelníček', lunch: [] },
  { state: 'svátek', lunch: [snapshot.lunch[1]!] },
])('nezobrazí oběd pro $state', async ({ lunch }) => {
  render(<TodaySchool api={apiWith({ ...snapshot, lunch })} now={morning} kiosk={false} />);
  await screen.findByTestId('today-school');
  expect(screen.queryByTestId('school-lunch')).toBeNull();
});

const child = (name: string, days: TimetableSnapshot['children'][number]['days']) => ({
  id: name.toLowerCase(),
  name,
  grid: [],
  afternoon_days: [],
  next: null,
  days,
});
const timetable: TimetableSnapshot = {
  enabled: true,
  today: '2026-11-23',
  bells: [],
  afternoon: null,
  children: [
    child('Ema', [
      {
        date: '2026-11-23',
        school: true,
        free: null,
        lessons: [
          { period: 1, subject: 'Čj', start: '07:30', end: '08:15' },
          { period: 2, subject: 'M', start: '08:25', end: '12:05' },
        ],
        start: '07:30',
        end: '12:05',
        lunch: null,
        bring: [],
      },
      {
        date: '2026-11-24',
        school: true,
        free: null,
        lessons: [{ period: 1, subject: 'Tv', start: '07:30', end: '12:05' }],
        start: '07:30',
        end: '12:05',
        lunch: null,
        bring: [{ subject: 'Tv', item: 'cvičky a úbor' }],
      },
    ]),
  ],
};

const rows = () =>
  screen
    .getAllByTestId('today-school')
    .flatMap((card) =>
      [...card.querySelectorAll('[data-testid^="school-timetable"]')].map((el) => el.textContent),
    );

it('přidá řádky rozvrhu pod „Dnes“ / „Zítra“ na telefonu, ne na kiosku', async () => {
  const api = { ...apiWith({ ...snapshot, enabled: false }), timetable: async () => timetable };
  const { rerender } = render(<TodaySchool api={api} now={morning} kiosk={false} />);
  await screen.findByTestId('school-timetable');
  expect(text('school-when')).toEqual(['Dnes']);
  expect(rows()).toEqual(['Ema do 12:05 · teď M']);
  rerender(<TodaySchool api={api} now="2026-11-23T19:00:00+01:00" kiosk={false} />);
  expect(text('school-when')).toEqual(['Zítra']);
  expect(rows()).toEqual(['Ema 7:30–12:05 s sebou: cvičky a úbor (Tv)']);
  // „s sebou“ is its own line under the child, with a muted label.
  const bring = screen.getByText('s sebou:');
  expect(bring.className).toBe('today-school-label');
  expect(bring.parentElement?.className).toBe('today-school-bring');
  expect(screen.getByText('Ema').tagName).toBe('STRONG');
  cleanup();
  render(<TodaySchool api={api} now={morning} kiosk />);
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(screen.queryByTestId('today-school')).toBeNull();
});

it('po konci vyučování skryje dnešní akci, zítřejší a vícedenní nechá', async () => {
  const school = {
    ...snapshot,
    events: [
      ...snapshot.events,
      {
        date: '2026-11-23',
        title: 'Lyžák',
        end_date: '2026-11-25',
        grades: null,
        person_ids: ['dite'],
      },
    ],
  };
  const api = { ...apiWith(school), timetable: async () => timetable };
  const { rerender } = render(<TodaySchool api={api} now={morning} kiosk={false} />);
  await screen.findByTestId('school-timetable');
  expect(groups().map((group) => group.filter((line) => !/obědu|do 12/.test(line ?? '')))).toEqual([
    ['Dnes', 'Výstava', 'Lyžák'],
    ['Zítra', '4. ročník · Divadlo'],
    ['Dále', 'st 25. 11. · Schůzky'],
  ]);
  rerender(<TodaySchool api={api} now="2026-11-23T19:00:00+01:00" kiosk={false} />);
  expect(groups()[0]).toEqual([
    'Zítra',
    'Ema 7:30–12:05 s sebou: cvičky a úbor (Tv)',
    'K obědu: Kuskus · polévka mrkvová',
    '4. ročník · Divadlo',
    'Lyžák',
  ]);
});

// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import type { SchoolSnapshot } from '@homebrain/ha-client';
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

it('přepne ve 14.00 na zítřejší oběd a zachová ostatní školní údaje', async () => {
  const api = apiWith(snapshot);
  const { rerender } = render(<TodaySchool api={api} now={morning} kiosk />);
  expect((await screen.findByTestId('school-lunch')).textContent).toBe(
    'K obědu: Zeleninové placičky · polévka mrkvová',
  );
  expect(screen.getByRole('heading', { name: 'Škola' })).toBeTruthy();
  expect(text('school-event')).toEqual(['Dnes: Výstava', 'Zítra: 4. ročník · Divadlo']);
  expect(text('school-date')).toEqual(['st 25. 11. · Schůzky']);
  expect(screen.getByText('načteno 22. 11. 5:00')).toBeTruthy();
  rerender(<TodaySchool api={api} now="2026-11-23T14:00:00+01:00" kiosk />);
  expect(screen.getByTestId('school-lunch').textContent).toBe(
    'Zítra k obědu: Kuskus · polévka mrkvová',
  );
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
  expect(shown.at(-1)).toBe(true);
});

it.each([
  { state: 'prázdný jídelníček', lunch: [] },
  { state: 'svátek', lunch: [snapshot.lunch[1]!] },
])('nezobrazí oběd pro $state', async ({ lunch }) => {
  render(<TodaySchool api={apiWith({ ...snapshot, lunch })} now={morning} kiosk={false} />);
  await screen.findByTestId('today-school');
  expect(screen.queryByTestId('school-lunch')).toBeNull();
});

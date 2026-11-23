// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { createMockFamilyApi } from '../mock.js';
import { PersonTimetable } from './PersonTimetable.js';

afterEach(cleanup);
const render_ = (iso: string, member = 'dcera', timetable: 'full' | 'off' = 'full') => {
  const api = createMockFamilyApi({ timetable, now: () => new Date(iso) });
  return render(<PersonTimetable api={api} member={member} now={new Date(iso)} refreshedAt={0} />);
};

describe('Rozvrh v detailu dítěte', () => {
  it('zvýrazní právě probíhající hodinu a rozbalí týden', async () => {
    render_('2026-11-23T08:40:00+01:00');
    const card = within(await screen.findByTestId('family-timetable'));
    expect(card.getByTestId('family-timetable-title').textContent).toBe('Dnes ve škole 7:30–12:05');
    const current = card.getByRole('listitem', { current: 'time' });
    expect(current.textContent).toContain('M');
    expect(card.getByTestId('family-timetable-bring').textContent).toBe(
      'S sebou: cvičky a úbor (Tv)',
    );
    fireEvent.click(card.getByRole('button', { name: /Celý týden/ }));
    const week = within(card.getByTestId('family-timetable-week'));
    expect(week.getAllByRole('row')).toHaveLength(7);
    expect(week.getByRole('columnheader', { current: 'date' }).textContent).toBe('Po');
    const now = week.getByRole('cell', { current: 'time' });
    expect(now.textContent).toBe('M');
    expect(now.closest('tr')!.querySelector('th')!.textContent).toBe('2.8:25');
    expect(week.getAllByRole('cell').filter((el) => el.hasAttribute('data-done'))).toHaveLength(1);
  });

  it('týden: dvouhodinovka jako jedna buňka, odpoledne se skutečným začátkem', async () => {
    render_('2026-11-25T06:00:00+01:00', 'syn');
    const card = within(await screen.findByTestId('family-timetable'));
    fireEvent.click(card.getByRole('button', { name: /Celý týden/ }));
    const week = card.getByTestId('family-timetable-week');
    // Kuba: Út 5.–6. Tv, St 6.–7. Tv (odpolední zvonění od 13:05).
    const tall = [...week.querySelectorAll('td[rowspan="2"]')].map((el) => el.textContent);
    expect(tall).toEqual(['Tv', 'Tv13:05']);
    expect(within(week).getByText('St: polední přestávka 12:05–13:05')).toBeTruthy();
    expect(week.textContent).not.toContain('odp.');
  });

  it('po poslední hodině ukáže příští školní den', async () => {
    render_('2026-11-27T13:00:00+01:00', 'syn');
    expect((await screen.findByTestId('family-timetable-title')).textContent).toBe(
      'Po 30. 11. do školy 7:30–13:00',
    );
  });

  it('odpolední vyučování Kuby ve středu do 14:40', async () => {
    render_('2026-11-25T06:00:00+01:00', 'syn');
    expect((await screen.findByTestId('family-timetable-title')).textContent).toBe(
      'Dnes ve škole 7:30–14:40',
    );
    expect(screen.getByText('Polední přestávka 12:05–13:05')).toBeTruthy();
  });

  it('bez rozvrhu nic nevykreslí', async () => {
    const { container } = render_('2026-11-23T08:40:00+01:00', 'dcera', 'off');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(container.innerHTML).toBe('');
  });
});

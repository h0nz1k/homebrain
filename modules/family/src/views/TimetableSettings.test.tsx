// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMockFamilyApi } from '../mock.js';
import { PersonsSettings } from './PersonsSettings.js';

afterEach(cleanup);
const monday = new Date('2026-11-23T06:30:00+01:00');

describe('Nastavení rozvrhu', () => {
  it('vyplní dvouhodinovku čipy a uloží ji', async () => {
    const api = createMockFamilyApi({ now: () => monday });
    const onSaved = vi.fn();
    render(<PersonsSettings api={api} onBack={() => {}} onSaved={onSaved} />);
    const ema = await screen.findByRole('group', { name: 'Ema' });
    expect(within(ema).getByText('Rozvrh není vyplněný')).toBeTruthy();
    fireEvent.click(within(ema).getByTestId('timetable-open'));
    const editor = within(await screen.findByTestId('timetable-editor'));
    fireEvent.click(editor.getByTestId('timetable-cell-0-1'));
    fireEvent.click(editor.getByRole('button', { name: 'Čj' }));
    fireEvent.click(editor.getByRole('button', { name: 'Tv' }));
    fireEvent.click(editor.getByRole('button', { name: 'Tv' }));
    expect(editor.getByTestId('timetable-cell-0-3').textContent).toBe('Tv');
    fireEvent.change(editor.getByLabelText('Jiný předmět'), { target: { value: 'Etv' } });
    fireEvent.click(editor.getByRole('button', { name: 'Vložit' }));
    expect(editor.getByTestId('timetable-cell-0-4').textContent).toBe('Etv');
    fireEvent.click(editor.getByRole('button', { name: /Hotovo/ }));
    const back = await screen.findByRole('group', { name: 'Ema' });
    expect(within(back).getByText('Rozvrh: 4 hodin týdně')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Uložit' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const snapshot = await api.timetable!();
    const child = snapshot.children.find((row) => row.id === 'dcera')!;
    expect(child.grid[0]).toEqual(['Čj', 'Tv', 'Tv', 'Etv']);
    expect(child.days[0]!.bring).toEqual([{ subject: 'Tv', item: 'cvičky a úbor' }]);
  });

  it('upraví zvonění a přidá prázdniny', async () => {
    const api = createMockFamilyApi({ timetable: 'full', now: () => monday });
    render(<PersonsSettings api={api} onBack={() => {}} onSaved={() => {}} />);
    fireEvent.click(await screen.findByTestId('timetable-school-open'));
    const editor = within(await screen.findByTestId('timetable-school-editor'));
    expect(editor.getByText('Načteno ze školního webu. Úpravou se uloží jako ruční.')).toBeTruthy();
    fireEvent.change(editor.getByLabelText('1. hodina od'), { target: { value: '08:00' } });
    fireEvent.change(editor.getByLabelText('1. hodina do'), { target: { value: '08:45' } });
    expect(editor.getByText('Upraveno ručně.')).toBeTruthy();
    fireEvent.click(editor.getByRole('button', { name: 'Přidat volno' }));
    const free = within(editor.getByTestId('timetable-free'));
    fireEvent.change(free.getByLabelText('Název'), { target: { value: 'Ředitelské volno' } });
    fireEvent.change(free.getByLabelText('Od'), { target: { value: '2026-11-24' } });
    fireEvent.click(editor.getByRole('button', { name: /Hotovo/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Uložit' }));
    await waitFor(async () => {
      const ema = (await api.timetable!()).children[0]!;
      expect(ema.days[0]!.start).toBe('08:00');
      expect(ema.days[1]!.free).toBe('Ředitelské volno');
    });
  });
});

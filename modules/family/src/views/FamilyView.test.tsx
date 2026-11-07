// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { setFamilyApiFactory } from '../api.js';
import { createMockFamilyApi } from '../mock.js';
import type { FamilyRole } from '../types.js';
import FamilyView from './FamilyView.js';

const store = { subscribe: () => () => {}, getSnapshot: () => undefined } as never;

async function mount(role: FamilyRole, scenario: 'full' | 'empty' = 'full', kiosk = false) {
  const api = createMockFamilyApi({ role, scenario });
  setFamilyApiFactory(() => api);
  render(<FamilyView store={store} bindings={{}} kiosk={kiosk} />);
  await screen.findByTestId('family');
  return api;
}

afterEach(cleanup);

describe('FamilyView', () => {
  it('owner: chores of both kids, approve calls the API', async () => {
    const api = await mount('owner');
    expect(screen.getAllByTestId('family-kid')).toHaveLength(2);
    await act(async () => fireEvent.click(screen.getByTestId('family-approve')));
    expect(api.log).toContainEqual({ kind: 'approve', kid: 'dcera', id: 'sensor.demo_luxovat' });
  });

  it('child: only own chores, no approval, no event details', async () => {
    await mount('child');
    expect(screen.getAllByTestId('family-kid')).toHaveLength(1);
    expect(screen.getByText('Moje povinnosti')).toBeTruthy();
    expect(screen.queryByTestId('family-approve')).toBeNull();
    expect(screen.queryByTestId('family-event-detail')).toBeNull();
  });

  it('kiosk: ticks a chore and adds a shopping item', async () => {
    const api = await mount('kiosk', 'full', true);
    expect(screen.getByTestId('family').dataset.kiosk).toBe('true');
    const todo = screen.getAllByTestId('family-chore').find((li) => li.dataset.state === 'todo')!;
    await act(async () => fireEvent.click(todo.querySelector('button')!));
    fireEvent.change(screen.getByTestId('family-shop-input'), { target: { value: 'Chleba' } });
    await act(async () => fireEvent.click(screen.getByTestId('family-shop-add')));
    expect(api.log).toContainEqual({ kind: 'add', summary: 'Chleba' });
    expect(api.log.some((e) => (e as { kind: string }).kind === 'claim')).toBe(true);
  });

  it('nothing configured: neutral text, no chores/shopping cards', async () => {
    await mount('adult', 'empty');
    expect(screen.getByTestId('family-no-calendar').textContent).toContain('zatím není nastaven');
    expect(screen.queryByTestId('family-chores')).toBeNull();
    expect(screen.queryByTestId('family-shopping')).toBeNull();
  });

  it('owner: today points count only done chores, pending shown separately, done last', async () => {
    await mount('owner');
    const dcera = screen.getAllByTestId('family-kid').find((k) => k.dataset.kid === 'dcera')!;
    expect(dcera.querySelector('[data-testid="family-today-points"]')!.textContent).toContain('+2');
    expect(dcera.querySelector('[data-testid="family-pending-points"]')!.textContent).toBe(
      '+4 čeká',
    );
    expect(dcera.querySelector('[data-testid="family-total"]')!.textContent).toContain('128');
    const states = Array.from(
      dcera.querySelectorAll<HTMLElement>('[data-testid="family-chore"]'),
    ).map((li) => li.dataset.state);
    expect(states).toEqual(['todo', 'claimed', 'done']);
  });

  it('calendar: next event is highlighted once and events show who they belong to', async () => {
    await mount('owner');
    const next = screen.queryByTestId('family-next');
    const listed = screen.getAllByTestId('family-event').map((li) => li.textContent);
    if (next)
      expect(listed.some((t) => t?.includes(next.querySelector('strong')!.textContent!))).toBe(
        false,
      );
    expect(document.querySelectorAll('[data-testid="family-who"]').length).toBeGreaterThan(0);
    expect(screen.getByTestId('family-legend').textContent).toContain('Škola');
  });

  it('kiosk: clock, full 7-day list, parent approves instead of a dangling counter', async () => {
    await mount('kiosk', 'full', true);
    expect(screen.getByTestId('family-clock')).toBeTruthy();
    expect(screen.getAllByTestId('family-day')).toHaveLength(7);
    expect(screen.getByTestId('family-chores').textContent).toContain('Schválí rodič');
    expect(screen.getByTestId('family-chores').textContent).not.toContain('čeká na schválení');
  });
});

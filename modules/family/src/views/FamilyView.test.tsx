// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
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
    const approvals = screen.getByTestId('family-approvals');
    const row = within(approvals).getByText('Uklidit boty').closest('.fam-approval') as HTMLElement;
    await act(async () => fireEvent.click(within(row).getByTestId('family-approve')));
    expect(api.log).toContainEqual({ kind: 'approve', kid: 'syn', id: 'sensor.demo_boty' });
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
    const todo = screen
      .getAllByTestId('family-chore')
      .find(
        (li) =>
          li.dataset.state === 'todo' &&
          !!li.querySelector('[data-testid="family-chore-check"]:not(:disabled)'),
      )!;
    await act(async () =>
      fireEvent.click(todo.querySelector('[data-testid="family-chore-check"]')!),
    );
    fireEvent.change(screen.getByTestId('family-shop-input'), { target: { value: 'Chleba' } });
    await act(async () => fireEvent.click(screen.getByTestId('family-shop-add')));
    expect(api.log).toContainEqual({ kind: 'add', summary: 'Chleba' });
    expect(api.log.some((e) => (e as { kind: string }).kind === 'claim')).toBe(true);
  });

  it('add chore opens on plain-http LAN (no crypto.randomUUID) and saves', async () => {
    const c = globalThis.crypto as Crypto & { randomUUID?: unknown };
    const original = c.randomUUID;
    Object.defineProperty(c, 'randomUUID', { value: undefined, configurable: true });
    try {
      const api = await mount('owner');
      await act(async () => fireEvent.click(screen.getAllByTestId('family-add-chore')[0]!));
      const sheet = await screen.findByTestId('family-add-chore-sheet');
      fireEvent.change(within(sheet).getByLabelText(/Název/), { target: { value: 'Zalít kytky' } });
      await act(async () => fireEvent.click(within(sheet).getByTestId('family-add-chore-save')));
      const created = api.log.find((e) => (e as { kind: string }).kind === 'createChore') as
        { input: { client_request_id: string } } | undefined;
      expect(created).toBeTruthy();
      expect(created!.input.client_request_id).toMatch(/^[0-9a-f-]{36}$/);
    } finally {
      Object.defineProperty(c, 'randomUUID', { value: original, configurable: true });
    }
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
    expect(dcera.querySelector('[data-testid="family-today-points"]')!.textContent).toContain('+6');
    expect(dcera.querySelector('[data-testid="family-pending-points"]')).toBeNull();
    expect(dcera.querySelector('[data-testid="family-total"]')!.textContent).toContain('128');
    const states = Array.from(
      dcera.querySelectorAll<HTMLElement>('[data-testid="family-chore"]'),
    ).map((li) => li.dataset.state);
    expect(states).toEqual(['todo', 'todo', 'done', 'done']);
  });

  it('calendar: the next event also stays in the agenda and events show who they belong to', async () => {
    await mount('owner');
    expect(screen.getAllByTestId('family-event')).toHaveLength(4);
    expect(document.querySelectorAll('[data-testid="family-who"]').length).toBeGreaterThan(0);
    expect(screen.getByTestId('family-legend').textContent).toContain('Škola');
  });

  it('kiosk: clock, full 7-day list, parent approves instead of a dangling counter', async () => {
    await mount('kiosk', 'full', true);
    expect(screen.getByTestId('family-clock')).toBeTruthy();
    expect(screen.getAllByTestId('family-day')).toHaveLength(7);
    const pills = screen.getAllByTestId('family-pending-pill');
    expect(pills.map((p) => p.dataset.pending).sort()).toEqual(['completion', 'swap']);
    const label = (kind: string) =>
      pills.find((p) => p.dataset.pending === kind)!.textContent?.trim();
    expect(label('swap')).toBe('Předání Kubovi čeká na schválení');
    expect(label('completion')).toBe('Čeká na schválení');
    expect(screen.getAllByTestId('family-done-summary')[0]!.textContent).toContain('Hotovo: 2');
    expect(screen.queryByTestId('family-approvals')).toBeNull();
  });

  it('handed-out chore: points struck with „→ name“, not counted twice', async () => {
    await mount('owner');
    const out = screen
      .getAllByTestId('family-chore')
      .find((li) => li.dataset.swap === 'transferred_out')!;
    const pts = within(out).getByTestId('family-pts-out');
    expect(pts.querySelector('s')!.textContent).toBe('+3\u00a0body');
    expect(pts.textContent).toContain('→\u00a0Kuba');
  });

  it('„⋯“ menu on every actionable row and on no other row', async () => {
    await mount('owner');
    for (const li of screen.getAllByTestId('family-chore')) {
      const actionable =
        (li.dataset.state === 'todo' || li.dataset.state === 'overdue') &&
        li.dataset.swap !== 'pending_give' &&
        li.dataset.swap !== 'transferred_out';
      expect(!!within(li).queryByTestId('family-chore-menu')).toBe(actionable);
    }
  });

  it('handover tags decline names; done rows carry no extra „Hotovo“ text', async () => {
    await mount('owner');
    const notes = screen.getAllByTestId('family-swap-note').map((n) => n.textContent);
    expect(notes).toContain('Předáno Kubovi');
    expect(notes).toContain('Převzato od Emy');
    expect(notes.some((t) => t?.includes(':'))).toBe(false);
    const done = screen.getAllByTestId('family-chore').filter((li) => li.dataset.state === 'done');
    expect(done.length).toBeGreaterThan(0);
    for (const li of done) expect(li.querySelector('.fam-chore-meta')).toBeNull();
    expect(screen.getByTestId('family-pending-points').textContent).toBe(
      '+2\u00a0body čekají na schválení',
    );
    // The handover wait is on its row only, not repeated in the kid header.
    expect(screen.queryByTestId('family-pending-swaps')).toBeNull();
    expect(
      screen.getAllByTestId('family-pending-pill').some((p) => p.textContent?.includes('Předání')),
    ).toBe(true);
  });

  it('child: kid-facing unit spelled out („3 body“), no abbreviations', async () => {
    await mount('child');
    const pts = Array.from(document.querySelectorAll('.fam-pts')).map((n) => n.textContent);
    expect(pts.length).toBeGreaterThan(0);
    expect(pts.every((t) => /\+\d+\u00a0bod(y|ů)?$/.test(t ?? ''))).toBe(true);
    expect(screen.getByTestId('family-today-points').textContent).toBe('+4\u00a0body');
  });

  it('parent: kid section collapses from its header', async () => {
    await mount('owner');
    const toggle = screen.getAllByTestId('family-kid-toggle')[0]!;
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });
});

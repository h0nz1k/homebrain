// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { toastStore } from '@homebrain/ui';
import { setFamilyApiFactory, type FamilyApi } from '../api.js';
import { createMockFamilyApi } from '../mock.js';
import type { FamilyRole } from '../types.js';
import FamilyView, { CLAIM_UNDO_MS } from './FamilyView.js';
import { PointsFigure } from './familySheets.js';

const store = { subscribe: () => () => {}, getSnapshot: () => undefined } as never;

async function mount(
  role: FamilyRole,
  scenario: 'full' | 'empty' | 'busy' = 'full',
  kiosk = false,
) {
  const api = createMockFamilyApi({ role, scenario });
  setFamilyApiFactory(() => api);
  render(<FamilyView store={store} bindings={{}} kiosk={kiosk} />);
  await screen.findByTestId('family');
  return api;
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  toastStore.reset();
});

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

  it('kiosk uses the same overflow control and accounts for hidden approvals', async () => {
    await mount('kiosk', 'busy', true);
    expect(screen.getByTestId('family-pending-badge').textContent).toBe('3 čekají na schválení');
    const [giver, receiver] = screen.getAllByTestId('family-kid');
    const more = within(receiver!).getByTestId('family-chores-more');
    expect(more.textContent).toBe('Další 1 dnes · 1 čeká');
    expect(more.previousElementSibling?.tagName).toBe('UL');
    expect(within(giver!).getByTestId('family-pending-pill').dataset.pending).toBe('swap');
    expect(screen.getByTestId('family-member-handover').textContent).toContain('předání');
    const shopMore = screen.getByTestId('family-shop-more');
    expect(shopMore.className).toBe(more.className);
    expect(screen.getAllByTestId('family-shop-item')).toHaveLength(3);
    fireEvent.click(shopMore);
    expect(shopMore.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getAllByTestId('family-shop-item')).toHaveLength(4);
  });

  it('only uses the overdue group for deadlines missed today', async () => {
    const now = new Date(2026, 10, 19, 16, 5);
    vi.setSystemTime(now);
    const api = createMockFamilyApi({ now: () => now });
    setFamilyApiFactory(() => ({
      ...api,
      async get() {
        const snap = await api.get();
        const member = snap.members!.find((person) => person.id === 'tata')!;
        const chore = member.chores.find((row) => row.state === 'overdue')!;
        member.chores.push({
          ...chore,
          id: 'demo-deadline-today',
          name: 'Dnešní termín',
          due: new Date(2026, 10, 19, 15).toISOString(),
        });
        return snap;
      },
    }));
    render(<FamilyView store={store} bindings={{}} />);
    fireEvent.click(await screen.findByRole('button', { name: /Táta/ }));
    const late = screen.getByText('Po termínu').closest('details')!;
    const carried = screen.getByText('Přeneseno', { exact: true }).closest('details')!;
    expect(late.dataset.late).toBe('true');
    expect(within(late).getByText('Dnešní termín')).toBeTruthy();
    expect(carried.dataset.late).toBeUndefined();
    expect(within(carried).getByText('Odvézt papír')).toBeTruthy();
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
    vi.setSystemTime(new Date(2026, 10, 19, 16, 5));
    await mount('kiosk', 'full', true);
    expect(screen.getByTestId('family-clock')).toBeTruthy();
    expect(screen.getAllByTestId('family-day')).toHaveLength(7);
    const week = screen.getByTestId('family-week');
    expect(within(week).getAllByTestId('family-week-event')).toHaveLength(7);
    expect(week.querySelectorAll('.fam-school-bar')).toHaveLength(3);
    for (const row of within(week).getAllByTestId('family-week-event')) {
      expect(Array.from(row.children, (node) => node.className)).toEqual([
        'fam-wk-time',
        'fam-wk-t',
        'fam-ev-lead',
      ]);
    }
    const pills = screen.getAllByTestId('family-pending-pill');
    expect(pills.map((p) => p.dataset.pending).sort()).toEqual(['completion', 'swap']);
    const label = (kind: string) =>
      pills.find((p) => p.dataset.pending === kind)!.textContent?.trim();
    expect(label('swap')).toBe('Předání Kubovi čeká na\u00a0schválení');
    expect(label('completion')).toBe('Čeká na schválení');
    expect(screen.getAllByTestId('family-done-summary')[0]!.textContent).toContain('Hotovo: 2');
    expect(screen.queryByTestId('family-approvals')).toBeNull();
  });

  it('kiosk: limits each child to three of their own rows and opens today for the rest', async () => {
    const mock = createMockFamilyApi({ role: 'kiosk', scenario: 'busy' });
    const snapshot = await mock.get();
    const handed = snapshot.kids[0]!.chores.find((c) => c.swap_today?.kind === 'transferred_out')!;
    delete handed.counts_today;
    setFamilyApiFactory(() => ({ ...mock, get: async () => snapshot }));
    render(<FamilyView store={store} bindings={{}} kiosk />);
    const [giver, receiver] = (await screen.findAllByTestId('family-kid')).map((card) =>
      within(card),
    );
    expect(giver!.getAllByTestId('family-chore')).toHaveLength(3);
    expect(giver!.getByText('Připravit batoh')).toBeTruthy();
    expect(giver!.queryByText('Vynést koš')).toBeNull();
    expect(giver!.queryByText('Uklidit prádlo')).toBeNull();
    expect(receiver!.getAllByTestId('family-chore')).toHaveLength(3);
    expect(receiver!.getByText('Vynést koš')).toBeTruthy();
    expect(receiver!.getByRole('button', { name: /^Další 1 dnes/ })).toBeTruthy();
    fireEvent.click(giver!.getByRole('button', { name: /^Další 2 dnes/ }));
    const person = await screen.findByTestId('family-person');
    expect(within(person).getByRole('tab', { name: 'Dnes', selected: true })).toBeTruthy();
    expect(within(person).getByText('Uklidit prádlo')).toBeTruthy();
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

  it.each(['owner', 'adult', 'child', 'kiosk'] as const)(
    'chore management menu for %s',
    async (role) => {
      await mount(role, 'full', role === 'kiosk');
      const menus = screen.queryAllByTestId('family-chore-menu');
      if (role === 'owner' || role === 'adult') {
        expect(menus).toHaveLength(screen.getAllByTestId('family-chore').length);
        fireEvent.click(menus[0]!);
        expect(screen.getByRole('button', { name: 'Smazat jen dnes' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Smazat celou řadu' })).toBeTruthy();
      } else {
        expect(menus).toHaveLength(0);
        expect(screen.queryByRole('button', { name: /Smazat/ })).toBeNull();
        if (role === 'child') expect(screen.getByTestId('family-upcoming-give')).toBeTruthy();
      }
    },
  );

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

  it.each([
    [0, '+0 bodů'],
    [1, '+1 bod'],
    [2, '+2 body'],
    [4, '+4 body'],
    [5, '+5 bodů'],
  ])('points sheet figure %s → %s (shared plural helper)', (n, text) => {
    const { container } = render(<PointsFigure points={n} sign />);
    expect(container.textContent).toBe(text);
  });

  const claims = (api: Awaited<ReturnType<typeof mount>>) =>
    api.log.filter((e) => (e as { kind: string }).kind === 'claim');
  const openKuba = async () => {
    fireEvent.click(
      screen.getAllByTestId('family-person-tile').find((t) => t.textContent?.includes('Kuba'))!,
    );
    return screen.findByTestId('family-free-done');
  };

  it('„Udělal jsem“ sends the claim only after the undo window', async () => {
    const api = await mount('child');
    const done = await openKuba();
    expect(done.textContent).toContain('Udělal jsem · +3');
    vi.useFakeTimers();
    fireEvent.click(done);
    expect(claims(api)).toHaveLength(0);
    const toast = toastStore.getSnapshot().toasts.at(-1)!;
    expect(toast.message).toBe('Vyskládat myčku · posíláme ke schválení');
    expect(toast.action?.label).toBe('Vrátit');
    const row = screen
      .getAllByTestId('family-person-chore')
      .find((li) => li.textContent?.includes('Vyskládat myčku'))!;
    expect(row.dataset.highlight).toBe('true');
    expect(row.textContent).toContain('Čeká na schválení');
    expect(row.textContent).toContain('po schválení');
    expect(row.textContent).not.toContain('Převzato');
    await act(async () => vi.advanceTimersByTime(CLAIM_UNDO_MS - 100));
    expect(claims(api)).toHaveLength(0);
    await act(async () => vi.advanceTimersByTime(200));
    expect(claims(api)).toEqual([{ kind: 'claim', kid: 'syn', id: 'free-syn' }]);
  });

  it('„Vrátit“ drops the claim; closing the toast or leaving sends it at once', async () => {
    const api = await mount('child');
    const done = await openKuba();
    vi.useFakeTimers();
    fireEvent.click(done);
    act(() => toastStore.getSnapshot().toasts.at(-1)!.action!.onAction());
    await act(async () => vi.advanceTimersByTime(CLAIM_UNDO_MS * 2));
    expect(claims(api)).toHaveLength(0);
    fireEvent.click(screen.getByTestId('family-free-done'));
    act(() => toastStore.dismiss(toastStore.getSnapshot().toasts.at(-1)!.id));
    expect(claims(api)).toHaveLength(1);
    cleanup();
    expect(claims(api)).toHaveLength(1);
  });

  it('unmount flushes a staged claim instead of losing it', async () => {
    const api = await mount('child');
    fireEvent.click(await openKuba());
    expect(claims(api)).toHaveLength(0);
    cleanup();
    expect(claims(api)).toHaveLength(1);
  });
});

describe('Reassign chore', () => {
  async function openReassign(swapReassign: FamilyApi['swapReassign']) {
    // Fake only the clock: 9:00, the overdue demo chore was due yesterday at 18:00.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 5, 2, 9));
    const mock = createMockFamilyApi({ role: 'owner', reassignDemo: 'overdue' });
    setFamilyApiFactory(() => ({ ...mock, swapReassign }));
    render(<FamilyView store={store} bindings={{}} />);
    await screen.findByTestId('family');
    const row = screen
      .getAllByTestId('family-chore')
      .find((item) => item.textContent?.includes('Utřít stůl'))!;
    fireEvent.click(within(row).getByTestId('family-chore-menu'));
    fireEvent.click(screen.getByRole('button', { name: 'Přeřadit…' }));
    await screen.findByTestId('family-swap-recipient');
    return screen.getByTestId('family-swap-submit') as HTMLButtonElement;
  }
  const ids = (fn: ReturnType<typeof vi.fn>) =>
    fn.mock.calls.map(([input]) => (input as { client_request_id: string }).client_request_id);

  it('rapid taps send one request; a refusal keeps the button off until the input changes', async () => {
    let reject!: (error: unknown) => void;
    const reassign = vi.fn(
      () =>
        new Promise<Record<string, unknown>>((_, fail) => {
          reject = fail;
        }),
    );
    const submit = await openReassign(reassign);
    for (let i = 0; i < 18; i++) fireEvent.click(submit);
    expect(submit.disabled).toBe(true);
    expect(submit.getAttribute('aria-busy')).toBe('true');
    expect(reassign).toHaveBeenCalledTimes(1);
    await act(async () => reject({ code: 'due_in_past' }));
    const sheet = screen.getByTestId('family-swap-sheet');
    const alert = within(sheet).getByRole('alert');
    expect(alert.textContent).toBe('Termín úkolu už minul.');
    expect(alert.nextElementSibling).toBe(submit);
    // Inline only – no lasting toast or banner for a refused attempt.
    expect(toastStore.getSnapshot().toasts.filter((t) => t.kind === 'error')).toHaveLength(0);
    expect(submit.disabled).toBe(true);
    for (let i = 0; i < 5; i++) fireEvent.click(submit);
    expect(reassign).toHaveBeenCalledTimes(1);
    fireEvent.change(within(sheet).getByTestId('family-swap-time'), {
      target: { value: '19:00' },
    });
    expect(submit.disabled).toBe(false);
    fireEvent.click(submit);
    expect(reassign).toHaveBeenCalledTimes(2);
    const [first, second] = ids(reassign);
    expect(second).not.toBe(first);
  });

  it('retries a lost answer with the same client_request_id', async () => {
    const reassign = vi
      .fn<FamilyApi['swapReassign']>()
      .mockRejectedValueOnce(new Error('Connection lost'))
      .mockResolvedValueOnce({ operation: { status: 'active' } });
    const submit = await openReassign(reassign);
    await act(async () => fireEvent.click(submit));
    expect(within(screen.getByTestId('family-swap-sheet')).getByRole('alert').textContent).toBe(
      'Přeřazení se nepovedlo, zkus to znovu.',
    );
    await act(async () => fireEvent.click(submit));
    const [first, second] = ids(reassign);
    expect(second).toBe(first);
    expect(screen.queryByTestId('family-swap-sheet')).toBeNull();
  });

  it('gives an overdue chore a new deadline today (its usual time by default)', async () => {
    const reassign = vi.fn(async () => ({ operation: { status: 'active' } }));
    const submit = await openReassign(reassign);
    const time = screen.getByTestId('family-swap-time') as HTMLInputElement;
    expect(time.value).toBe('18:00');
    fireEvent.change(time, { target: { value: '8:30' } });
    expect(submit.disabled).toBe(true);
    expect(screen.getByText('Vyber pozdější čas – nový termín musí být v budoucnu.')).toBeTruthy();
    fireEvent.change(time, { target: { value: '10:30' } });
    await act(async () => fireEvent.click(submit));
    expect(reassign).toHaveBeenCalledWith(
      expect.objectContaining({ local_date: '2026-06-02', due_time: '10:30' }),
    );
  });

  it('closes the sheet and confirms success with the recipient in Czech', async () => {
    const submit = await openReassign(async () => ({ operation: { status: 'active' } }));
    await act(async () => fireEvent.click(submit));
    expect(screen.queryByTestId('family-swap-sheet')).toBeNull();
    expect(
      toastStore
        .getSnapshot()
        .toasts.some((toast) => toast.message === 'Přeřazeno na Kubu na dnes'),
    ).toBe(true);
  });
});

describe('Failed reassign banner', () => {
  it('shows one banner per chore with the attempt count and hides it with Skrýt', async () => {
    const api = createMockFamilyApi({ role: 'owner', reassignDemo: 'needs-repair' });
    const swapDismiss = vi.fn(api.swapDismiss);
    setFamilyApiFactory(() => ({ ...api, swapDismiss }));
    render(<FamilyView store={store} bindings={{}} />);
    const [banner, ...rest] = await screen.findAllByTestId('family-swap-issue');
    expect(rest).toHaveLength(0);
    expect(banner!.textContent).toContain('Vyskládat myčku');
    expect(banner!.textContent).toContain('úkol zůstal u Emy');
    expect(within(banner!).getByTestId('family-swap-issue-count').textContent).toBe('3 pokusy');
    const hide = within(banner!).getByRole('button', { name: 'Skrýt upozornění: Vyskládat myčku' });
    await act(async () => {
      fireEvent.click(hide);
      fireEvent.click(hide);
    });
    expect(swapDismiss).toHaveBeenCalledTimes(1);
    expect(swapDismiss).toHaveBeenCalledWith(['swap-repair', 'swap-repair-2', 'swap-repair-3']);
    expect(screen.queryByTestId('family-swap-issue')).toBeNull();
  });
  it('stacks at most three banners and summarises the rest', async () => {
    const api = createMockFamilyApi({ role: 'owner' });
    const issue = (n: number) => ({
      id: `swap-${n}`,
      chore_name: `Úkol ${n}`,
      source_name: null,
      pending: false,
    });
    setFamilyApiFactory(() => ({
      ...api,
      get: async () => ({
        ...(await api.get()),
        swap_issues: [1, 2, 3, 4, 5].map(issue),
      }),
    }));
    render(<FamilyView store={store} bindings={{}} />);
    const banners = await screen.findAllByTestId('family-swap-issue');
    expect(banners.map((b) => b.querySelector('strong')?.textContent)).toEqual([
      'Úkol 1',
      'Úkol 2',
      'Úkol 3',
    ]);
    expect(screen.getByTestId('family-swap-issue-more').textContent).toBe('a další 2');
  });
});

describe('Delete chore', () => {
  async function openDelete(
    deleteChore: FamilyApi['deleteChore'],
    recurrence: 'daily_multi' | 'once' = 'daily_multi',
  ) {
    const api = createMockFamilyApi({ role: 'owner', now: () => new Date(2026, 5, 2, 9) });
    const firstKid = (await api.get()).kids[0]!;
    await api.createChore({
      client_request_id: 'create-12345678',
      name: 'Zalít záhon',
      points: 2,
      assignees: [firstKid.id],
      recurrence,
      first_date: '2026-06-02',
      due_time: '18:00',
      ...(recurrence === 'daily_multi' && { times: ['12:00', '18:00'] }),
    });
    setFamilyApiFactory(() => ({
      ...api,
      get: async () => {
        const snapshot = await api.get();
        snapshot.kids[0]!.name = 'Ema';
        for (const row of snapshot.kids[0]!.chores) {
          if (row.management) {
            row.management = {
              ...row.management,
              assignees: ['Ema'],
              slots: row.management.slots.map((slot) => ({ ...slot, assignees: ['Ema'] })),
            };
          }
        }
        return snapshot;
      },
      deleteChore,
    }));
    render(<FamilyView store={store} bindings={{}} />);
    fireEvent.click(
      await screen.findByRole('button', {
        name: recurrence === 'once' ? 'Zalít záhon' : 'Zalít záhon (18:00)',
      }),
    );
    const detail = screen.getByTestId('family-chore-menu-sheet');
    if (recurrence === 'once') {
      expect(
        within(detail).queryByRole('button', { name: /Smazat jen dnes|Smazat celou řadu/ }),
      ).toBeNull();
    }
    fireEvent.click(
      within(detail).getByRole('button', {
        name: recurrence === 'once' ? 'Smazat úkol' : 'Smazat celou řadu',
      }),
    );
    return screen.getByTestId('family-delete-chore-sheet');
  }

  it('confirms the exact slots and preserves the points copy with Cancel focused', async () => {
    const remove = vi.fn(async () => ({ deleted: 2 }));
    const sheet = await openDelete(remove);
    expect(within(sheet).getByText('Ema · 2× denně')).toBeTruthy();
    expect(within(sheet).getByText('Body, které už za něj někdo dostal, zůstanou.')).toBeTruthy();
    expect(document.activeElement).toBe(within(sheet).getByRole('button', { name: 'Zrušit' }));
    expect(
      (within(sheet).getByRole('radio', { name: 'Jen 18:00' }) as HTMLInputElement).checked,
    ).toBe(true);
    expect(within(sheet).getByRole('heading', { name: 'Smazat úkol' })).toBeTruthy();
    expect(within(sheet).getByRole('button', { name: 'Smazat 18:00' })).toBeTruthy();
    fireEvent.click(within(sheet).getByRole('radio', { name: 'Jen 12:00' }));
    expect(within(sheet).getByRole('button', { name: 'Smazat 12:00' })).toBeTruthy();
    fireEvent.click(within(sheet).getByRole('radio', { name: 'Všechny časy (2)' }));
    await act(async () =>
      fireEvent.click(within(sheet).getByRole('button', { name: 'Smazat všechny časy' })),
    );
    expect(remove).toHaveBeenCalledWith(
      expect.objectContaining({
        series_ids: expect.arrayContaining([expect.any(String), expect.any(String)]),
      }),
    );
    expect(screen.queryByTestId('family-delete-chore-sheet')).toBeNull();
  });

  it('shows only single deletion for one-off chores and keeps its service error inline', async () => {
    const sheet = await openDelete(async () => {
      throw { code: 'not_found' };
    }, 'once');
    await act(async () =>
      fireEvent.click(within(sheet).getByRole('button', { name: 'Smazat úkol' })),
    );
    expect(within(sheet).getByRole('alert').textContent).toBe('Úkol už není dostupný.');
  });
});

// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { toastStore } from '@homebrain/ui';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FamilyApi } from '../api.js';
import { setFamilyApiFactory } from '../api.js';
import { CREATE_CHORE_ERRORS } from '../errors.js';
import { createMockFamilyApi } from '../mock.js';
import type { CreateChoreInput } from '../types.js';
import FamilyView from './FamilyView.js';
import { AddChoreSheet } from './familySheets.js';

const store = { subscribe: () => () => {}, getSnapshot: () => undefined } as never;
const kids = createMockFamilyApi()
  .get()
  .then((s) => s.kids);

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  toastStore.dismiss();
});

async function mountView(api = createMockFamilyApi()) {
  setFamilyApiFactory(() => api);
  render(<FamilyView store={store} bindings={{}} />);
  await screen.findByTestId('family');
  return api;
}

async function openSheet() {
  await act(async () => fireEvent.click(screen.getAllByTestId('family-add-chore')[0]!));
  return screen.findByTestId('family-add-chore-sheet');
}

const nameInput = (sheet: HTMLElement) => within(sheet).getByLabelText(/Název/) as HTMLInputElement;
const save = (sheet: HTMLElement) =>
  act(async () => fireEvent.click(within(sheet).getByTestId('family-add-chore-save')));
const created = (api: { log: unknown[] }) =>
  api.log
    .filter((e) => (e as { kind: string }).kind === 'createChore')
    .map((e) => (e as { input: CreateChoreInput }).input);

/** Sheet with a stub API (own clock, own createChore). */
async function mountSheet(createChore: FamilyApi['createChore'], now = new Date(2026, 10, 19, 10)) {
  const api = { ...createMockFamilyApi(), createChore };
  const onCreated = vi.fn();
  render(
    <div className="fam">
      <AddChoreSheet
        kids={await kids}
        api={api}
        colors={{}}
        initialKid="syn"
        onClose={() => undefined}
        onCreated={onCreated}
        now={() => now}
      />
    </div>,
  );
  const sheet = screen.getByTestId('family-add-chore-sheet');
  fireEvent.change(nameInput(sheet), { target: { value: 'Vyndat myčku' } });
  return { sheet, onCreated };
}

describe('AddChoreSheet', () => {
  it('duplicate name: specific message pinned in the footer next to Save, rename path', async () => {
    const api = await mountView();
    const sheet = await openSheet();
    // „Vyndat myčku“ already exists (planned for tomorrow).
    fireEvent.change(nameInput(sheet), { target: { value: 'Vyndat myčku' } });
    await save(sheet);
    const alert = within(sheet).getByRole('alert');
    // One sentence naming the kid, no generic duplicate sentence on top.
    expect(within(sheet).getByTestId('family-add-chore-error-text').textContent).toBe(
      'Dcera už má úkol „Vyndat myčku“.',
    );
    expect(alert.textContent).not.toContain(CREATE_CHORE_ERRORS.duplicate_name);
    // Inside the sticky footer (always on screen), right above the Save button.
    const foot = sheet.querySelector('.hb-sheet-foot')!;
    expect(foot.contains(alert)).toBe(true);
    expect(
      alert.compareDocumentPosition(within(sheet).getByTestId('family-add-chore-save')) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(document.activeElement).toBe(alert);
    const btn = within(sheet).getByTestId('family-add-chore-save') as HTMLButtonElement;
    expect(btn.textContent).toBe('Uložit úkol');
    // Saving the same name again would fail: the plain Save is disabled until a panel choice.
    expect(btn.getAttribute('aria-disabled')).toBe('true');
    expect(btn.dataset.variant).toBe('secondary');
    const wait = within(sheet).getByTestId('family-add-chore-dup-wait');
    expect(wait.textContent).toBe('Nejdřív vyber jednu z možností výše');
    expect(btn.getAttribute('aria-describedby')).toBe(wait.id);
    await save(sheet);
    expect(created(api)).toHaveLength(1);
    // Primary way forward first, the rename second; no separate „Změnit název“.
    const actions = within(alert).getAllByRole('button');
    expect(actions.map((b) => b.textContent)).toEqual([
      'Přidat další čas (vícekrát denně)',
      'Uložit jako „Vyndat myčku (2)“',
    ]);
    expect(actions[0]!.dataset.variant).toBe('primary');
    expect(within(sheet).queryByText('Změnit název')).toBeNull();
    // The name field says it inline (linked for screen readers).
    const hint = within(sheet).getByTestId('family-name-duplicate');
    expect(hint.textContent).toBe('Tento název už existuje.');
    expect(nameInput(sheet).getAttribute('aria-describedby')).toBe(hint.id);
    expect(nameInput(sheet).getAttribute('aria-invalid')).toBe('true');
    // The form body no longer carries the old generic error at its very bottom.
    expect(sheet.querySelector('.hb-sheet-body [role="alert"]')).toBeNull();
    const rename = within(sheet).getByTestId('family-duplicate-rename');
    expect(rename.textContent).toBe('Uložit jako „Vyndat myčku (2)“');
    await act(async () => fireEvent.click(rename));
    expect(created(api).map((c) => c.name)).toEqual(['Vyndat myčku', 'Vyndat myčku (2)']);
    // Each attempt is its own operation (the failed one created nothing).
    const ids = created(api).map((c) => c.client_request_id);
    expect(new Set(ids).size).toBe(2);
    expect(screen.queryByTestId('family-add-chore-sheet')).toBeNull();
  });

  it('duplicate → „Nastavit vícekrát denně“: multi with 2 times, name kept, error cleared', async () => {
    const api = await mountView();
    const sheet = await openSheet();
    fireEvent.change(nameInput(sheet), { target: { value: 'Vyndat myčku' } });
    await save(sheet);
    await act(async () => fireEvent.click(within(sheet).getByTestId('family-duplicate-multi')));
    expect(within(sheet).queryByRole('alert')).toBeNull();
    expect(within(sheet).queryByTestId('family-name-duplicate')).toBeNull();
    expect(nameInput(sheet).value).toBe('Vyndat myčku');
    expect(
      within(sheet).getByRole('radio', { name: 'Vícekrát' }).getAttribute('aria-checked'),
    ).toBe('true');
    const times = within(sheet).getByTestId('family-multi-times');
    expect(times.hasAttribute('data-flash')).toBe(true);
    expect(within(times).getAllByTestId('family-multi-time')).toHaveLength(2);
    const btn = within(sheet).getByTestId('family-add-chore-save');
    expect(btn.dataset.variant).toBe('primary');
    await save(sheet);
    const last = created(api).at(-1)!;
    expect(last).toMatchObject({ name: 'Vyndat myčku', recurrence: 'daily_multi' });
    expect(last.times).toHaveLength(2);
  });

  it('typing a new name clears the duplicate error', async () => {
    await mountView();
    const sheet = await openSheet();
    fireEvent.change(nameInput(sheet), { target: { value: 'Vyndat myčku' } });
    await save(sheet);
    expect(within(sheet).queryByRole('alert')).not.toBeNull();
    fireEvent.change(nameInput(sheet), { target: { value: 'Vyndat myčku večer' } });
    expect(within(sheet).queryByRole('alert')).toBeNull();
  });

  it('client timeout after 15 s: message, Save usable again', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { sheet, onCreated } = await mountSheet(() => new Promise(() => undefined));
    await save(sheet);
    const btn = within(sheet).getByTestId('family-add-chore-save') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.textContent).toBe('Ukládám…');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    expect(within(sheet).getByRole('alert').textContent).toContain(CREATE_CHORE_ERRORS.timeout);
    expect(btn.disabled).toBe(false);
    expect(btn.textContent).toBe('Uložit úkol');
    expect(onCreated).not.toHaveBeenCalled();
  });

  it.each([
    [{ code: 'not_configured', message: 'x' }, CREATE_CHORE_ERRORS.not_configured],
    [{ code: 'invalid_input', message: 'x' }, CREATE_CHORE_ERRORS.invalid_input],
    [{ code: 3 }, CREATE_CHORE_ERRORS.network],
    [{ code: 'service_failed', message: 'duplicate_chore' }, CREATE_CHORE_ERRORS.service_failed],
  ])('maps backend error %j to a Czech message', async (err, text) => {
    const { sheet } = await mountSheet(() => Promise.reject(err));
    await save(sheet);
    expect(within(sheet).getByRole('alert').textContent).toContain(text);
    expect(within(sheet).queryByTestId('family-duplicate-rename')).toBeNull();
  });

  it('default first day: today while 18:00 is ahead, tomorrow in the evening', async () => {
    const morning = await mountSheet(
      vi.fn(async () => ({})),
      new Date(2026, 10, 19, 10),
    );
    fireEvent.click(within(morning.sheet).getByRole('radio', { name: 'Jednou' }));
    expect(within(morning.sheet).getByTestId('family-add-chore-when').textContent).toBe(
      'dnes do 18:00',
    );
    const date = within(morning.sheet).getByTestId('family-first-date') as HTMLInputElement;
    // Same words as the summary („od dneška“), still a plain editable date underneath.
    expect(date.value).toBe('Dnes (19.\u00a011.)');
    expect(date.dataset.date).toBe('2026-11-19');
    fireEvent.change(date, { target: { value: '26. 11.' } });
    expect(date.dataset.date).toBe('2026-11-26');
    fireEvent.blur(date);
    expect(date.value).toBe('26. 11. 2026');
    fireEvent.change(date, { target: { value: '20. 11. 2026' } });
    fireEvent.blur(date);
    expect(date.value).toBe('Zítra (20.\u00a011.)');
    cleanup();
    const evening = await mountSheet(
      vi.fn(async () => ({})),
      new Date(2026, 10, 19, 18, 30),
    );
    fireEvent.click(within(evening.sheet).getByRole('radio', { name: 'Jednou' }));
    expect(within(evening.sheet).getByTestId('family-add-chore-when').textContent).toBe(
      'zítra do 18:00',
    );
    expect(within(evening.sheet).getByTestId('family-chore-summary').textContent).toContain(
      'zítra do 18:00',
    );
    expect((within(evening.sheet).getByTestId('family-first-date') as HTMLInputElement).value).toBe(
      'Zítra (20.\u00a011.)',
    );
  });

  it('„Vícekrát denně“: time list, sorted daily_multi payload, summary 2×', async () => {
    const createChore = vi.fn(async () => ({}));
    const { sheet, onCreated } = await mountSheet(createChore, new Date(2026, 10, 19, 10));
    fireEvent.click(within(sheet).getByRole('radio', { name: 'Vícekrát' }));
    const times = () => within(sheet).getAllByTestId('family-multi-time') as HTMLInputElement[];
    expect(times().map((i) => i.value)).toEqual(['12:00', '18:00']);
    expect(within(sheet).queryByTestId('family-due-time')).toBeNull();
    fireEvent.click(within(sheet).getByTestId('family-multi-add'));
    fireEvent.change(times()[2]!, { target: { value: '7.30' } });
    fireEvent.blur(times()[2]!);
    // Leaving the group sorts the times and says so.
    expect(times().map((i) => i.value)).toEqual(['07:30', '12:00', '18:00']);
    expect(within(sheet).getByTestId('family-multi-note').textContent).toBe(
      'Časy jsme seřadili podle dne.',
    );
    expect(within(sheet).getByTestId('family-chore-summary').textContent).toContain(
      '2\u00a0body za každé splnění (6\u00a0bodů denně)',
    );
    expect(within(sheet).getByTestId('family-chore-summary').textContent).toContain(
      'každý den 3× (7:30, 12:00 a 18:00)',
    );
    await save(sheet);
    expect(createChore).toHaveBeenCalledTimes(1);
    const input = (createChore.mock.calls[0] as unknown as [CreateChoreInput])[0];
    expect(input).toMatchObject({
      recurrence: 'daily_multi',
      times: ['07:30', '12:00', '18:00'],
      first_date: '2026-11-19',
      // 7:30 is already past at 10:00: the first occurrence due today is 12:00.
      due_time: '12:00',
      assignees: ['syn'],
    });
    expect(onCreated).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Vyndat myčku', who: 'Syn' }),
    );
  });

  it('„Vícekrát denně“: ✕ on every row (min 2), up to 6 times, helper text', async () => {
    const { sheet } = await mountSheet(vi.fn(async () => ({})));
    fireEvent.click(within(sheet).getByRole('radio', { name: 'Vícekrát' }));
    const fs = within(sheet).getByTestId('family-multi-times');
    // „Každé splnění…“ lives once, in the summary; the group only states its limit.
    expect(sheet.textContent?.match(/Každé splnění má vlastní body/g) ?? []).toHaveLength(0);
    expect(within(fs).getByTestId('family-multi-note').textContent).toBe('Aspoň 2 časy.');
    expect(within(fs).getAllByTestId('family-multi-remove')[0]!.title).toBe('Aspoň 2 časy');
    const removes = () => within(fs).getAllByTestId('family-multi-remove') as HTMLButtonElement[];
    expect(removes()).toHaveLength(2);
    expect(removes().every((b) => b.disabled)).toBe(true);
    for (let i = 0; i < 4; i++) fireEvent.click(within(fs).getByTestId('family-multi-add'));
    expect(within(fs).getAllByTestId('family-multi-time')).toHaveLength(6);
    expect(within(fs).queryByTestId('family-multi-add')).toBeNull();
    expect(removes().every((b) => !b.disabled)).toBe(true);
    fireEvent.click(removes()[5]!);
    expect(within(fs).getAllByTestId('family-multi-time')).toHaveLength(5);
    expect(within(fs).getByTestId('family-multi-add').textContent).toBe('Přidat čas');
  });

  it('points with the proper plural in the stepper and the summary; Ikona (nepovinná)', async () => {
    const { sheet } = await mountSheet(vi.fn(async () => ({})));
    const value = () => within(sheet).getByTestId('family-points-value').textContent;
    const summary = () => within(sheet).getByTestId('family-chore-summary').textContent;
    expect(value()).toBe('2body');
    expect(summary()).toContain('2\u00a0body');
    fireEvent.click(within(sheet).getByLabelText('Ubrat bod'));
    expect(value()).toBe('1bod');
    for (let i = 0; i < 4; i++) fireEvent.click(within(sheet).getByLabelText('Přidat bod'));
    expect(value()).toBe('5bodů');
    expect(summary()).toContain('5\u00a0bodů');
    expect(summary()).not.toContain('b.');
    expect(sheet.textContent).toContain('Ikona (nepovinná)');
  });

  it('title: one kid by name, 2+ kids as a count', async () => {
    const { sheet } = await mountSheet(vi.fn(async () => ({})));
    const who = () => within(sheet).getByTestId('family-add-chore-title-who').textContent;
    expect(who()).toBe(' · Syn');
    const chips = within(sheet).getAllByTestId('family-who-chip');
    fireEvent.click(chips.find((c) => c.getAttribute('aria-pressed') === 'false')!);
    expect(who()).toBe(' · 2 děti');
  });

  it('Opakování is one radio group of four, labelled „Vícekrát denně“', async () => {
    const { sheet } = await mountSheet(vi.fn(async () => ({})));
    const group = within(sheet).getByRole('radiogroup', { name: 'Opakování' });
    expect(
      within(group)
        .getAllByRole('radio')
        .map((r) => r.textContent),
    ).toEqual(['Jednou', 'Denně', 'Vícekrát', 'Dny v týdnu']);
  });

  it('„Vícekrát denně“ needs two different times', async () => {
    const createChore = vi.fn(async () => ({}));
    const { sheet } = await mountSheet(createChore);
    fireEvent.click(within(sheet).getByRole('radio', { name: 'Vícekrát' }));
    const [first] = within(sheet).getAllByTestId('family-multi-time') as HTMLInputElement[];
    fireEvent.change(first!, { target: { value: '18:00' } });
    await save(sheet);
    expect(createChore).not.toHaveBeenCalled();
    expect(sheet.textContent).toContain('Každý čas zadej jen jednou.');
    // Leaving the group merges the duplicate and keeps a slot open for a second time.
    fireEvent.blur(first!);
    const after = within(sheet).getAllByTestId('family-multi-time') as HTMLInputElement[];
    expect(after.map((i) => i.value)).toEqual(['18:00', '']);
    expect(within(sheet).getByTestId('family-multi-note').textContent).toBe(
      'Stejné časy jsme sloučili do jednoho.',
    );
  });

  it('preselected kid is unmistakable: filled chip, title and „Pro:“ above Save', async () => {
    const { sheet } = await mountSheet(vi.fn(async () => ({})));
    const pressed = within(sheet)
      .getAllByTestId('family-who-chip')
      .filter((c) => c.getAttribute('aria-pressed') === 'true');
    expect(pressed.map((c) => c.textContent)).toEqual(['SSyn']);
    expect(within(sheet).getByTestId('family-add-chore-title-who').textContent).toBe(' · Syn');
    const foot = sheet.querySelector('.hb-sheet-foot')!;
    expect(within(foot as HTMLElement).getByTestId('family-add-chore-for').textContent).toMatch(
      /^Pro:SSyn/,
    );
  });
});

describe('FamilyView upcoming + confirmation', () => {
  it('owner sees planned chores per kid with day and time, not claimable', async () => {
    await mountView();
    const dcera = document.querySelector<HTMLElement>('[data-kid="dcera"]')!;
    const up = within(dcera).getByTestId('family-upcoming');
    expect(up.textContent).toContain('Naplánované');
    const rows = within(up).getAllByTestId('family-upcoming-chore');
    expect(within(rows[0]!).getByTestId('family-upcoming-day').textContent).toBe(
      'zítra\u00a0·\u00a0pá\u00a020.\u00a011.',
    );
    expect(within(up).getByTestId('family-upcoming-h').textContent).toMatch(
      /Naplánované · \d+ úkol(y|ů)?· další dny/u,
    );
    expect(rows[0]!.textContent).toContain('18:00');
    // One date style: lowercase weekday + date, never a bare weekday.
    for (const day of within(up).getAllByTestId('family-upcoming-day'))
      expect(day.textContent).toMatch(
        /^(dnes|(zítra\u00a0·\u00a0)?(po|út|st|čt|pá|so|ne)\u00a0\d{1,2}\.\u00a0\d{1,2}\.)$/u,
      );
    expect(within(up).getByTestId('family-upcoming-h').textContent).toContain('Naplánované');
    // „Dnes“ heads today's list, above the plan.
    const today = within(dcera).getByTestId('family-today-h');
    expect(today.textContent).toBe('Dnes');
    expect(today.compareDocumentPosition(up) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(rows[0]!.textContent).toContain('Vyndat myčku');
    expect(up.querySelector('button')).toBeNull();
  });

  it('kiosk and child keep today first, upcoming compact', async () => {
    setFamilyApiFactory(() => createMockFamilyApi({ role: 'kiosk' }));
    render(<FamilyView store={store} bindings={{}} kiosk />);
    await screen.findByTestId('family');
    const dcera = document.querySelector<HTMLElement>('[data-kid="dcera"]')!;
    const up = within(dcera).getByTestId('family-upcoming');
    expect(up.dataset.compact).toBe('line');
    expect(up.textContent).toContain('Zítra: Vyndat myčku');
    // Today's list comes first.
    expect(
      dcera.querySelector('.fam-chores')!.compareDocumentPosition(up) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('after create: toast „Úkol přidán“ and the new chore shows up highlighted', async () => {
    const api = await mountView();
    const sheet = await openSheet();
    fireEvent.change(nameInput(sheet), { target: { value: 'Vytřít chodbu' } });
    fireEvent.click(within(sheet).getByRole('radio', { name: 'Jednou' }));
    const date = within(sheet).getByTestId('family-first-date') as HTMLInputElement;
    const tomorrow = new Date(Date.now() + 86_400_000);
    fireEvent.change(date, { target: { value: tomorrow.toLocaleDateString('cs-CZ') } });
    await save(sheet);
    await act(async () => undefined);
    expect(created(api)).toHaveLength(1);
    const t = toastStore.getSnapshot().toasts.at(-1)!;
    expect(t.kind).toBe('success');
    expect(t.message).toBe('Úkol přidán: Dcera · zítra do 18:00');
    const row = await screen.findByText('Vytřít chodbu');
    expect(
      row.closest('[data-testid="family-upcoming-chore"]')!.hasAttribute('data-highlight'),
    ).toBe(true);
  });
});

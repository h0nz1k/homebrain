import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { setAnomalyApiFactory } from '../api.js';
import { MOCK_NOW, createMockAnomalyApi, type AnomalyScenario } from '../mock.js';
import AnomalyView from './AnomalyView.js';
import { AnomalyWatchCard } from './WatchCard.js';

const plain = (s: string | null) => (s ?? '').replace(/\u00a0/g, ' ');

function connection(isAdmin: boolean) {
  return {
    sendMessagePromise: async (msg: { type: string }) =>
      msg.type === 'homebrain/session/get'
        ? { role: isAdmin ? 'owner' : 'adult', visible_modules: [], is_admin: isAdmin }
        : null,
    subscribeMessage: async () => () => undefined,
  } as never;
}

function useMock(scenario: AnomalyScenario = 'confirmed') {
  const api = createMockAnomalyApi({ scenario });
  setAnomalyApiFactory(() => api);
  return api;
}

afterEach(() => {
  cleanup();
  setAnomalyApiFactory(() => null);
});

describe('AnomalyView (detail)', () => {
  it('every tier: exactly Vyřešeno (primary), Otevřít zařízení (secondary), Skrýt (link)', async () => {
    useMock('confirmed');
    render(<AnomalyView connection={connection(true)} />);
    const cards = await screen.findAllByTestId('aw-issue');
    expect(new Set(cards.map((c) => c.dataset.tier))).toEqual(new Set(['confirmed', 'suspicion']));
    await waitFor(() => within(cards[0]!).getByText('Otevřít zařízení'));
    for (const card of cards) {
      const actions = within(card).getByTestId('aw-actions');
      const buttons = within(actions).getAllByRole('button');
      expect(buttons.map((b) => b.textContent)).toEqual([
        'Vyřešeno',
        'Otevřít zařízení',
        'Skrýt na 7 dní',
      ]);
      expect(buttons[0]!.dataset.variant).toBe('primary');
      expect(buttons[0]!.className).toContain('aw-resolve');
      expect(buttons[1]!.dataset.variant).toBe('secondary');
      expect(buttons[2]!.className).toContain('aw-link');
      expect(plain(within(card).getByTestId('aw-resolve-hint').textContent)).toBe(
        'Pokud potíž trvá, za 2 h se hlášení vrátí.',
      );
    }
    expect(screen.queryByText(/Vím o tom|To je v pořádku|Ztlumit/)).toBeNull();
  });

  it('adults get no „Otevřít zařízení“ (HA settings are admin-only)', async () => {
    useMock('confirmed');
    render(<AnomalyView connection={connection(false)} />);
    const cards = await screen.findAllByTestId('aw-issue');
    const fault = cards.find((c) => c.dataset.tier === 'confirmed')!;
    const labels = within(within(fault).getByTestId('aw-actions'))
      .getAllByRole('button')
      .map((b) => b.textContent);
    expect(labels).toEqual(['Vyřešeno', 'Skrýt na 7 dní']);
  });

  it('suspicion: „Vyřešeno“ hides it locally, says it comes back after 2 h if it persists', async () => {
    const api = useMock('confirmed');
    render(<AnomalyView connection={connection(true)} />);
    const cellar = (await screen.findAllByTestId('aw-issue')).find(
      (c) => c.dataset.key === 'device:demo_dev_cellar',
    )!;
    expect(within(cellar).getByTestId('aw-issue-title').textContent).toBe(
      'Čidlo ve sklepě nehlásí vlhkost',
    );
    await act(async () => {
      fireEvent.click(within(cellar).getByText('Vyřešeno'));
    });
    expect(api.calls).toEqual(['ack:resolved:device:demo_dev_cellar']);
    await waitFor(() =>
      expect(
        screen.getAllByTestId('aw-issue').some((c) => c.dataset.key === 'device:demo_dev_cellar'),
      ).toBe(false),
    );
    const hidden = plain(screen.getByTestId('aw-hidden').textContent);
    expect(hidden).toContain('Čidlo ve sklepě');
    expect(hidden).toContain('Vyřešeno. Pokud potíž trvá, za 2 h se hlášení vrátí.');
  });

  it('mute, then unmute from the hidden list', async () => {
    const api = useMock('suspicion');
    render(<AnomalyView connection={connection(true)} />);
    const first = (await screen.findAllByTestId('aw-issue'))[0]!;
    await act(async () => {
      fireEvent.click(within(first).getByText('Skrýt na 7 dní'));
    });
    const hidden = await screen.findByTestId('aw-hidden');
    await act(async () => {
      fireEvent.click(within(hidden).getByText('Zobrazit znovu'));
    });
    expect(api.calls[0]).toMatch(/^mute:7:/);
    expect(api.calls[1]).toMatch(/^unmute:/);
  });

  it('timeline and headline share the last report', async () => {
    useMock('confirmed');
    render(<AnomalyView connection={connection(true)} />);
    const fault = (await screen.findAllByTestId('aw-issue')).find(
      (c) => c.dataset.tier === 'confirmed',
    )!;
    expect(plain(within(fault).getByTestId('aw-issue-meta').textContent)).toBe(
      'Neposílá žádné údaje · 2 h 21 min od posledního hlášení (8:19)',
    );
    expect(plain(within(fault).getByTestId('aw-gap-title').textContent)).toBe(
      'Chybí 14 hlášení · 2 h 21 min od posledního hlášení (8:19)',
    );
    // „Aktualizováno“ shows the same instant the durations count to
    expect(plain(screen.getByText(/^Aktualizováno/).textContent)).toBe(
      'Aktualizováno 10:40 · z historie Home Assistantu',
    );
  });

  it('learning state explains the warm-up', async () => {
    useMock('learning');
    render(<AnomalyView connection={connection(true)} />);
    expect((await screen.findByTestId('aw-headline')).textContent).toBe(
      'Hlídání se učí, jak dům běží',
    );
  });

  it('never claims to send anything to the phone in phase 1', async () => {
    useMock('confirmed');
    render(<AnomalyView connection={connection(true)} />);
    const phone = await screen.findByTestId('aw-phone');
    expect(phone.textContent).toContain('Upozornění na telefon zatím nejsou zapnutá.');
    expect(phone.textContent).not.toMatch(/přidám|další fázi/);
    expect(screen.queryByText(/Odesláno na telefon/)).toBeNull();
  });
});

describe('AnomalyWatchCard (Dnes)', () => {
  it('fault leads, suspicions in a subordinate list', async () => {
    useMock('confirmed');
    const levels: unknown[] = [];
    render(
      <AnomalyWatchCard
        connection={connection(true)}
        layout="kiosk"
        onLevel={(l) => levels.push(l)}
      />,
    );
    const card = await screen.findByTestId('aw-watch');
    expect(card.dataset.tier).toBe('confirmed');
    expect(card.dataset.layout).toBe('kiosk');
    expect(screen.getByTestId('aw-watch-title').textContent).toBe('Myčka neodpovídá');
    expect(screen.getAllByTestId('aw-watch-item').map((i) => i.textContent)).toEqual([
      expect.stringContaining('Čidlo ve sklepě nehlásí vlhkost'),
      expect.stringContaining('V obýváku je neobvykle teplo'),
    ]);
    // kiosk rows are not buttons (the wall tablet cannot open the detail)
    expect(screen.getAllByTestId('aw-watch-item').every((i) => i.tagName === 'DIV')).toBe(true);
    // the wall kiosk cannot open the detail page: no dead button there
    expect(screen.queryByTestId('aw-watch-cta')).toBeNull();
    await waitFor(() => expect(levels.at(-1)).toBe('confirmed'));
  });

  it('durations count to the clock Dnes shows, not to the snapshot time', async () => {
    useMock('confirmed');
    const clock = new Date(Date.parse(MOCK_NOW) + 30 * 60_000).toISOString(); // 11:10
    render(<AnomalyWatchCard connection={connection(true)} layout="desktop" now={clock} />);
    expect(plain((await screen.findByTestId('aw-watch-meta')).textContent)).toBe(
      'Neposílá žádné údaje · 2 h 51 min od posledního hlášení (8:19)',
    );
    expect(plain(screen.getAllByTestId('aw-watch-item')[0]!.textContent)).toContain(
      '4 h 25 min od posledního hlášení (6:45)',
    );
    expect(screen.queryByText(/Aktualizováno/)).toBeNull();
  });

  it('suspicion rows on the phone/tablet open the detail (button + chevron)', async () => {
    useMock('confirmed');
    render(<AnomalyWatchCard connection={connection(true)} layout="desktop" now={MOCK_NOW} />);
    const rows = await screen.findAllByTestId('aw-watch-item');
    for (const row of rows) {
      expect(row.tagName).toBe('BUTTON');
      expect(row.querySelector('.aw-row-chevron')).not.toBeNull();
    }
  });

  it('suspicion: solid primary button „Otevřít hlídání“', async () => {
    useMock('suspicion');
    render(<AnomalyWatchCard connection={connection(true)} layout="desktop" />);
    const cta = await screen.findByTestId('aw-watch-cta');
    expect(cta.textContent).toBe('Otevřít hlídání');
    expect(cta.dataset.tone).toBe('suspicion');
    expect(cta.dataset.variant).toBe('primary');
  });

  it('only observations: a quiet chip, no card', async () => {
    useMock('observations');
    const levels: unknown[] = [];
    render(
      <AnomalyWatchCard
        connection={connection(true)}
        layout="mobile"
        onLevel={(l) => levels.push(l)}
      />,
    );
    expect(plain((await screen.findByTestId('aw-watch-chip')).textContent)).toBe(
      'Dům · 2 pozorování',
    );
    expect(screen.queryByTestId('aw-watch')).toBeNull();
    expect(levels.every((l) => l === null)).toBe(true);
  });

  it('no API (no permission / module off): renders nothing', () => {
    setAnomalyApiFactory(() => null);
    const { container } = render(<AnomalyWatchCard layout="mobile" />);
    expect(container.textContent).toBe('');
  });
});

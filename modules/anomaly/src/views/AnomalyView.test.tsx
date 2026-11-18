import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { setAnomalyApiFactory } from '../api.js';
import { createMockAnomalyApi, type AnomalyScenario } from '../mock.js';
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
  it('fault: max 3 actions – Vyřešeno, Otevřít zařízení, Ztlumit (no „Vím o tom“)', async () => {
    useMock('confirmed');
    render(<AnomalyView connection={connection(true)} />);
    const cards = await screen.findAllByTestId('aw-issue');
    const fault = cards.find((c) => c.dataset.tier === 'confirmed')!;
    await waitFor(() => within(fault).getByText('Otevřít zařízení'));
    const actions = within(fault).getByTestId('aw-actions');
    const buttons = within(actions).getAllByRole('button');
    expect(buttons.map((b) => b.textContent)).toEqual([
      'Vyřešeno',
      'Otevřít zařízení',
      'Ztlumit na 7 dní',
    ]);
    expect(buttons[0]!.dataset.variant).toBe('primary');
    expect(buttons[1]!.dataset.variant).toBe('secondary');
    expect(buttons[2]!.className).toContain('aw-link');
    expect(screen.queryByText(/Vím o tom/)).toBeNull();
  });

  it('adults get no „Otevřít zařízení“ (HA settings are admin-only)', async () => {
    useMock('confirmed');
    render(<AnomalyView connection={connection(false)} />);
    const cards = await screen.findAllByTestId('aw-issue');
    const fault = cards.find((c) => c.dataset.tier === 'confirmed')!;
    const labels = within(within(fault).getByTestId('aw-actions'))
      .getAllByRole('button')
      .map((b) => b.textContent);
    expect(labels).toEqual(['Vyřešeno', 'Ztlumit na 7 dní']);
  });

  it('suspicion: „To je v pořádku“ hides it locally and shows it under Skrytá hlášení', async () => {
    const api = useMock('confirmed');
    render(<AnomalyView connection={connection(true)} />);
    const cellar = (await screen.findAllByTestId('aw-issue')).find(
      (c) => c.dataset.key === 'device:demo_dev_cellar',
    )!;
    expect(within(cellar).getByTestId('aw-issue-title').textContent).toBe(
      'Čidlo ve sklepě nehlásí vlhkost',
    );
    await act(async () => {
      fireEvent.click(within(cellar).getByText('To je v pořádku'));
    });
    expect(api.calls).toEqual(['ack:ok:device:demo_dev_cellar']);
    await waitFor(() =>
      expect(
        screen.getAllByTestId('aw-issue').some((c) => c.dataset.key === 'device:demo_dev_cellar'),
      ).toBe(false),
    );
    expect(screen.getByTestId('aw-hidden').textContent).toContain('Čidlo ve sklepě');
  });

  it('mute, then unmute from the hidden list', async () => {
    const api = useMock('suspicion');
    render(<AnomalyView connection={connection(true)} />);
    const first = (await screen.findAllByTestId('aw-issue'))[0]!;
    await act(async () => {
      fireEvent.click(within(first).getByText('Ztlumit na 7 dní'));
    });
    const hidden = await screen.findByTestId('aw-hidden');
    await act(async () => {
      fireEvent.click(within(hidden).getByText('Zrušit ztlumení'));
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
      'Všech 17 hodnot mlčí od 9:29 · 2 h 21 min',
    );
    expect(plain(within(fault).getByTestId('aw-gap-title').textContent)).toMatch(/^Od 9:29 chybí/);
  });

  it('learning state explains the warm-up', async () => {
    useMock('learning');
    render(<AnomalyView connection={connection(true)} />);
    expect((await screen.findByTestId('aw-headline')).textContent).toBe('Učím se, jak dům běží');
  });

  it('never claims to send anything to the phone in phase 1', async () => {
    useMock('confirmed');
    render(<AnomalyView connection={connection(true)} />);
    const phone = await screen.findByTestId('aw-phone');
    expect(phone.textContent).toContain('Zatím nic neposílám');
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
      expect.stringContaining('Klima obývák: neobvykle teplo'),
    ]);
    // the wall kiosk cannot open the detail page: no dead button there
    expect(screen.queryByTestId('aw-watch-cta')).toBeNull();
    await waitFor(() => expect(levels.at(-1)).toBe('confirmed'));
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

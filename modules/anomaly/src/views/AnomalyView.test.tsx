import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { setAnomalyApiFactory } from '../api.js';
import { MOCK_NOW, createMockAnomalyApi, type AnomalyScenario } from '../mock.js';
import AnomalyView from './AnomalyView.js';
import { BaselineBand, roundTicks, SilenceTimeline } from './charts.js';
import { mockAnomalySnapshot } from '../mock.js';
import { hm, sinceLast } from '../copy.js';
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
  it('every tier: Otevřít <zařízení> (primary), Vyřešeno (secondary) + caption, Skrýt (link)', async () => {
    useMock('confirmed');
    render(<AnomalyView connection={connection(true)} />);
    const cards = await screen.findAllByTestId('aw-issue');
    expect(new Set(cards.map((c) => c.dataset.tier))).toEqual(new Set(['confirmed', 'suspicion']));
    await waitFor(() => within(cards[0]!).getByText('Otevřít Myčku'));
    const names = ['Otevřít Myčku', 'Otevřít Čidlo ve sklepě', 'Otevřít Klima obývák'];
    cards.forEach((card, i) => {
      const actions = within(card).getByTestId('aw-actions');
      const buttons = within(actions).getAllByRole('button');
      expect(buttons.map((b) => b.textContent)).toEqual([names[i], 'Vyřešeno', 'Skrýt na 7 dní']);
      // the diagnostic step leads; an unchecked problem is not „Vyřešeno“ by default
      expect(buttons[0]!.dataset.variant).toBe('primary');
      expect(buttons[1]!.dataset.variant).toBe('secondary');
      expect(buttons[1]!.className).toContain('aw-resolve');
      expect(buttons[2]!.className).toContain('aw-link');
      // the caption belongs to Vyřešeno: in its group, right after it, and describes it
      const hint = within(card).getByTestId('aw-resolve-hint');
      expect(plain(hint.textContent)).toBe(
        'Když potíž po označení „Vyřešeno“ trvá, za 2 h se upozornění vrátí.',
      );
      expect(hint.previousElementSibling).toBe(buttons[1]);
      expect(buttons[1]!.getAttribute('aria-describedby')).toBe(hint.id);
      expect(buttons[2]!.compareDocumentPosition(hint) & Node.DOCUMENT_POSITION_PRECEDING).toBe(
        Node.DOCUMENT_POSITION_PRECEDING,
      );
    });
    expect(screen.queryByText(/Vím o tom|To je v pořádku|Ztlumit/)).toBeNull();
  });

  it('cards are ordered by urgency: soonest escalation to Porucha first', async () => {
    useMock('suspicion');
    render(<AnomalyView connection={connection(true)} />);
    const cards = await screen.findAllByTestId('aw-issue');
    expect(cards.map((c) => c.dataset.key)).toEqual([
      'device:demo_dev_dishwasher', // Porucha nejdříve v 11:20
      'device:demo_dev_cellar', // ve 13:55
      'device:demo_dev_living', // až při extrémní hodnotě
    ]);
    expect(plain(screen.getByTestId('aw-status-names').textContent)).toBe(
      'Myčka, Čidlo ve sklepě a Klima obývák',
    );
  });

  it('one concrete next step per card, from the kind of anomaly', async () => {
    useMock('suspicion');
    render(<AnomalyView connection={connection(true)} />);
    const cards = await screen.findAllByTestId('aw-issue');
    const step = (key: string) =>
      plain(
        within(cards.find((c) => c.dataset.key === key)!).getByTestId('aw-next-step').textContent,
      );
    expect(step('device:demo_dev_cellar')).toBe('Zkontrolujte baterii nebo dosah čidla.');
    expect(step('device:demo_dev_living')).toBe('Zkontrolujte topení, okno nebo přímé slunce.');
    expect(step('device:demo_dev_dishwasher')).toBe('Zkontrolujte napájení a připojení zařízení.');
    for (const card of cards) expect(within(card).getAllByTestId('aw-next-step')).toHaveLength(1);
  });

  it('the outage time („X od posledního hlášení (HH:MM)“) is shown once per card', async () => {
    useMock('confirmed');
    render(<AnomalyView connection={connection(true)} />);
    const snap = mockAnomalySnapshot('confirmed');
    for (const card of await screen.findAllByTestId('aw-issue')) {
      const r = snap.reports.find((x) => x.key === card.dataset.key)!;
      const last = r.findings[0]!.detail.last;
      if (!last) continue;
      const text = plain(card.textContent);
      const phrase = plain(sinceLast(last, snap.now));
      expect(text.split(phrase).length - 1, card.dataset.key).toBe(1);
      expect(text.split(`(${hm(last)})`).length - 1, card.dataset.key).toBe(1);
      expect(text).not.toContain('poslední hlášení');
    }
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
    expect(within(fault).getByText('Vyřešeno').closest('button')!.dataset.variant).toBe(
      'secondary',
    );
  });

  it('suspicion: „Vyřešeno“ hides it locally, says it comes back after 2 h if it persists', async () => {
    const api = useMock('confirmed');
    render(<AnomalyView connection={connection(true)} />);
    const cellar = (await screen.findAllByTestId('aw-issue')).find(
      (c) => c.dataset.key === 'device:demo_dev_cellar',
    )!;
    expect(within(cellar).getByTestId('aw-issue-title').textContent).toBe(
      'Čidlo ve sklepě přestalo posílat vlhkost',
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
    expect(hidden).toContain('Vyřešeno. Pokud potíž trvá, za 2 h se upozornění vrátí.');
    expect(hidden).toContain('Skrytá upozornění (1)');
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
    // the inset only counts the missing reports (the time is in the meta line)
    expect(plain(within(fault).getByTestId('aw-gap-title').textContent)).toBe('Chybí 14 hlášení');
    expect(plain(within(fault).getByTestId('aw-gap').textContent)).toContain(
      'Chybí 14 hlášení· obvykle každých 10 min',
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

  it('counts the visible four hours separately from a longer outage', () => {
    const { container } = render(
      <SilenceTimeline last="2026-11-01T00:03:00Z" now="2026-11-02T08:00:00Z" intervalS={600} />,
    );
    expect(plain(screen.getByTestId('aw-gap-title').textContent)).toBe(
      'Chybí 24 hlášení za poslední 4 h, celkem 191',
    );
    expect(container.querySelectorAll('.aw-gap-miss')).toHaveLength(24);
    expect(container.querySelector('.aw-gap-last')).toBeNull();
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
      expect.stringContaining('Čidlo ve sklepě přestalo posílat vlhkost'),
      expect.stringContaining('V obýváku je neobvykle teplo'),
    ]);
    // kiosk pill carries the count, the footer the affected devices
    expect(plain(screen.getByTestId('aw-tier').textContent)).toBe('1 porucha');
    expect(plain(screen.getByTestId('aw-watch-inventory').textContent)).toBe(
      '3 z 12 zařízení s upozorněním',
    );
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

  it('suspicion: tonal (not filled) „Otevřít hlídání“, most urgent first; fault: filled', async () => {
    useMock('suspicion');
    render(<AnomalyWatchCard connection={connection(true)} layout="desktop" />);
    const cta = await screen.findByTestId('aw-watch-cta');
    expect(cta.textContent).toBe('Otevřít hlídání');
    expect(cta.dataset.tone).toBe('suspicion');
    expect(cta.dataset.variant).toBe('secondary');
    expect(screen.getByTestId('aw-watch-title').textContent).toBe('Myčka neodpovídá');
    expect(plain(screen.getByTestId('aw-tier').textContent)).toBe('Podezření');
    cleanup();
    useMock('confirmed');
    render(<AnomalyWatchCard connection={connection(true)} layout="desktop" />);
    expect((await screen.findByTestId('aw-watch-cta')).dataset.variant).toBe('primary');
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

describe('BaselineBand (card B chart)', () => {
  it('the curve leaves the usual range at the start the text states („od 9:30“)', () => {
    const snap = mockAnomalySnapshot('suspicion');
    const r = snap.reports.find((x) => x.key === 'device:demo_dev_living')!;
    const [h, m] = hm(r.findings[0]!.since).split(':').map(Number);
    const start = h! * 60 + m!;
    expect(hm(r.findings[0]!.since)).toBe('9:30');
    const hiAt = (minute: number) => {
      // usual band as drawn: hourly values at :30, linear in between
      const pts = r.band!.usual.map((b, k) => ({ x: k * 60 + 30, hi: b![1] }));
      const k = Math.max(0, Math.min(pts.length - 2, Math.floor((minute - 30) / 60)));
      const a = pts[k]!;
      const b = pts[k + 1]!;
      return a.hi + ((b.hi - a.hi) * (minute - a.x)) / (b.x - a.x);
    };
    const outside = r.band!.today.filter(([x, v]) => v > hiAt(x)).map(([x]) => x);
    // inside the band until shortly before 9:30, outside from (at most 5 min after) 9:30 on
    expect(outside[0]).toBeGreaterThanOrEqual(start - 5);
    expect(outside[0]).toBeLessThanOrEqual(start + 5);
    expect(
      r.band!.today.filter(([x]) => x >= outside[0]!).every(([x]) => outside.includes(x)),
    ).toBe(true);
    // and it deviates visibly: at least 3 °C above the band within half an hour
    const later = r.band!.today.find(([x]) => x >= start + 30)!;
    expect(later[1] - hiAt(later[0])).toBeGreaterThan(3);
  });

  it('round Y ticks: 15 / 20 / 25 / 30 °C', () => {
    expect(roundTicks(17.9, 28.1).ticks).toEqual([30, 25, 20, 15]);
    expect(roundTicks(19.2, 21.4).ticks).toEqual([22, 21, 20, 19]);
    const r = mockAnomalySnapshot('suspicion').reports.find(
      (x) => x.key === 'device:demo_dev_living',
    )!;
    render(<BaselineBand band={r.band!} now={MOCK_NOW} />);
    expect(screen.getAllByTestId('aw-band-tick').map((t) => plain(t.textContent))).toEqual([
      '30 °C',
      '25 °C',
      '20 °C',
      '15 °C',
    ]);
  });
});

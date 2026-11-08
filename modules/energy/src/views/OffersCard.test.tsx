// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ConnectionLike } from '@homebrain/ha-client';
import { OffersCard } from './OffersCard';
import { createOffersDemo } from '../offersDemo';
import {
  formatDiff,
  monthLabel,
  offerPayload,
  offerSummary,
  offersHeadline,
  parseNum,
  rankedPlans,
  spotStatusText,
  type Offer,
} from '../offers';

afterEach(cleanup);
const NOW = Date.parse('2026-11-07T15:00:00Z');
const plain = (s: string | null | undefined) => (s ?? '').replace(/[\u00a0\u202f]/g, ' ');

function connectionFor(role: 'owner' | 'adult' | 'kiosk', scenario: 'full' | 'empty' = 'full') {
  const demo = createOffersDemo(NOW, scenario);
  const sent: Array<Record<string, unknown>> = [];
  const connection = {
    sendMessagePromise: vi.fn(async (m: { type: string } & Record<string, unknown>) => {
      sent.push(m);
      if (role === 'kiosk') throw new Error('unauthorized');
      return demo.handle(m, role === 'owner');
    }),
  };
  return { connection: connection as unknown as ConnectionLike, sent };
}

describe('offer helpers', () => {
  it('parses Czech numbers', () => {
    expect(parseNum('2 990,50')).toBe(2990.5);
    expect(parseNum(' 350 ')).toBe(350);
    expect(parseNum('')).toBeNull();
    expect(parseNum('abc')).toBeNull();
  });

  it('formats signed differences with a real minus', () => {
    expect(plain(formatDiff(-1234.4))).toBe('\u22121 234 Kč');
    expect(plain(formatDiff(87))).toBe('+87 Kč');
    expect(formatDiff(null)).toBe('–');
  });

  it('labels months', () => {
    expect(monthLabel('2026-10')).toBe('říj');
    expect(monthLabel('2026-10', true)).toBe('Říjen 2026');
  });

  it('summarises fixed and spot offers', () => {
    const fixed: Offer = {
      id: 'a',
      name: 'Fix',
      kind: 'fixed',
      price_vt: 2990,
      price_nt: 2500,
      margin: null,
      monthly_fee: 99,
      export: { mode: 'none', price: null, fee: null },
    };
    expect(plain(offerSummary(fixed))).toBe('VT 2 990 Kč/MWh · NT 2 500 Kč/MWh · 99 Kč/měs.');
    const spot: Offer = {
      ...fixed,
      kind: 'spot',
      price_vt: null,
      price_nt: null,
      margin: 350,
      export: { mode: 'spot', price: null, fee: 400 },
    };
    expect(plain(offerSummary(spot))).toBe(
      'spot + 350 Kč/MWh · 99 Kč/měs. · výkup: spot − 400 Kč/MWh',
    );
  });

  it('builds the save payload from the form', () => {
    expect(
      offerPayload({
        id: '',
        name: ' Spot ',
        kind: 'spot',
        price_vt: '',
        price_nt: '',
        margin: '350',
        monthly_fee: '',
        export_mode: 'fixed',
        export_price: '900',
        export_fee: '',
      }),
    ).toEqual({
      name: 'Spot',
      kind: 'spot',
      margin: 350,
      monthly_fee: 0,
      export: { mode: 'fixed', price: 900 },
    });
  });

  it('ranks plans and writes the headline', () => {
    const cmp = createOffersDemo(NOW, 'full').compare();
    const ranked = rankedPlans(cmp);
    expect(ranked[0]!.total).toBeLessThanOrEqual(ranked[1]!.total!);
    expect(plain(offersHeadline(cmp))).toMatch(
      /^Nejvýhodnější by byla „.+“ – ušetřili byste .+ Kč\.$/,
    );
  });

  it('describes the spot backfill', () => {
    expect(
      spotStatusText({ needed: true, source: null, running: true, done: 40, total: 365 }),
    ).toBe('Stahujeme spotové ceny z OTE: 40 z 365 dní.');
    expect(spotStatusText({ needed: false, source: null })).toBeNull();
  });
});

describe('OffersCard', () => {
  it('shows the ranked list cheapest first with the current contract', async () => {
    const { connection } = connectionFor('owner');
    render(<OffersCard connection={connection} />);
    const items = await screen.findAllByTestId('energy-offer-rank');
    expect(items.length).toBe(3);
    const totals = items.map((el) => Number(el.getAttribute('data-total')));
    expect([...totals].sort((a, b) => a - b)).toEqual(totals);
    expect(screen.getByTestId('energy-offers').textContent).toContain('Současná smlouva');
    expect(screen.getAllByTestId('energy-offer-bar-month').length).toBe(12);
    expect(plain(screen.getByTestId('energy-offers-hero').textContent)).toMatch(/−\d[\d ]* Kč/);
    expect(screen.getByTestId('energy-offers-assumptions').textContent).toContain(
      'regulované ceny 2026',
    );
  });

  it('lets the admin add an offer', async () => {
    const { connection, sent } = connectionFor('owner');
    render(<OffersCard connection={connection} />);
    fireEvent.click(await screen.findByTestId('energy-offer-add'));
    const sheet = await screen.findByTestId('energy-offer-edit');
    fireEvent.change(within(sheet).getByTestId('energy-offer-field-name'), {
      target: { value: 'Nová fixace' },
    });
    fireEvent.change(within(sheet).getByTestId('energy-offer-field-price_vt'), {
      target: { value: '2 400' },
    });
    fireEvent.change(within(sheet).getByTestId('energy-offer-field-price_nt'), {
      target: { value: '2100' },
    });
    fireEvent.click(within(sheet).getByTestId('energy-offer-save'));
    await waitFor(() => expect(screen.getAllByTestId('energy-offer-rank').length).toBe(4));
    const save = sent.find((m) => m.type === 'homebrain/energy/offers/save');
    expect(save?.offer).toMatchObject({ name: 'Nová fixace', kind: 'fixed', price_vt: 2400 });
  });

  it('is read-only for adults and hidden when not allowed', async () => {
    const adult = connectionFor('adult');
    render(<OffersCard connection={adult.connection} />);
    await screen.findAllByTestId('energy-offer-rank');
    expect(screen.queryByTestId('energy-offer-add')).toBeNull();
    expect(screen.queryByTestId('energy-offer-edit-open')).toBeNull();
    cleanup();
    const kiosk = connectionFor('kiosk');
    const { container } = render(<OffersCard connection={kiosk.connection} />);
    await waitFor(() => expect(kiosk.sent.length).toBeGreaterThan(0));
    expect(container.innerHTML).toBe('');
  });

  it('invites the admin to add the first offer', async () => {
    const { connection } = connectionFor('owner', 'empty');
    render(<OffersCard connection={connection} />);
    expect((await screen.findByTestId('energy-offers-empty')).textContent).toContain(
      'Přidejte nabídku',
    );
  });
});

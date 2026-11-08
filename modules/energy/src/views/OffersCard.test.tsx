// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ConnectionLike } from '@homebrain/ha-client';
import { OffersCard } from './OffersCard';
import { createOffersDemo } from '../offersDemo';
import {
  barValue,
  diffWords,
  formatDiff,
  heroWords,
  invoicePeriodText,
  monthLabel,
  offerPayload,
  offerSummary,
  offersHeadline,
  parseNum,
  rankedPlans,
  regulatedSourceText,
  roundToTotal,
  spotStatusText,
  type Offer,
  type Plan,
  type Regulated,
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

  it('words differences without a bare minus sign', () => {
    expect(plain(diffWords(-184.2).text)).toBe('O 184 Kč méně');
    expect(diffWords(-184).tone).toBe('ok');
    expect(plain(diffWords(120).text)).toBe('O 120 Kč víc');
    expect(diffWords(120).tone).toBe('warn');
    expect(diffWords(null).text).toBe('bez srovnání');
    expect(plain(barValue(-184.4))).toBe('184');
    expect(plain(barValue(1234))).toBe('1,2k');
    const best = { id: 'x' } as Plan;
    const saving = heroWords({ best, diff: -478, perMonth: -39.8, percent: -1.84 })!;
    expect(plain(saving.big)).toBe('Ušetřili byste 478 Kč');
    expect(plain(saving.percent)).toBe('1,8 % levněji');
    expect(plain(saving.perMonth)).toBe('≈ 40 Kč méně měsíčně');
    const extra = heroWords({ best, diff: 120, perMonth: 10, percent: 0.5 })!;
    expect(plain(extra.big)).toBe('Připlatili byste 120 Kč');
    expect(plain(extra.percent)).toBe('0,5 % dráž');
    for (const text of [saving.big, saving.percent, extra.big, extra.percent])
      expect(text).not.toMatch(/[-\u2212]/);
  });

  it('names the invoice the regulated prices come from', () => {
    expect(invoicePeriodText(['2026-09-01', '2026-09-30'])).toBe('září 2026');
    expect(invoicePeriodText(['2026-07-01', '2026-09-30'])).toBe('červenec – září 2026');
    expect(invoicePeriodText(null)).toBeNull();
    const reg: Regulated = {
      distribution_vt: 800,
      distribution_nt: 250,
      system_services: 164,
      poze: 0,
      tax: 28.3,
      monthly_fixed: 513,
      current_export_price: 800,
      vat_percent: 21,
      year: 2026,
      source: 'invoice',
      source_period: ['2026-09-01', '2026-09-30'],
    };
    expect(regulatedSourceText({ ...reg, source: 'invoice' })).toBe('z faktury za září 2026');
    expect(regulatedSourceText({ ...reg, source: 'saved' })).toBe('zadané v nastavení');
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
    expect(plain(offerSummary(fixed))).toBe(
      'Cena: VT 2 990 Kč/MWh, NT 2 500 Kč/MWh; Stálá platba: 99 Kč/měs.',
    );
    expect(roundToTotal([0.4, 0.4, 0.4, null])).toEqual([1, 0, 0, null]);
    expect(roundToTotal([-8.4, -45.4, 99.4])).toEqual([-8, -45, 99]);
    expect(roundToTotal([1.5, -0.6]).reduce<number>((a, v) => a + (v ?? 0), 0)).toBe(
      Math.round(0.9),
    );
    const spot: Offer = {
      ...fixed,
      kind: 'spot',
      price_vt: null,
      price_nt: null,
      margin: 350,
      export: { mode: 'spot', price: null, fee: 400 },
    };
    expect(plain(offerSummary(spot))).toBe(
      'Cena: spot plus 350 Kč/MWh; Stálá platba: 99 Kč/měs.; Výkup: spot mínus 400 Kč/MWh',
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
    expect(plain(offersHeadline(cmp))).toMatch(/^Nejvýhodnější je „.+“ oproti současné smlouvě\.$/);
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
    const hero = plain(screen.getByTestId('energy-offers-hero').textContent);
    expect(hero).toMatch(/Ušetřili byste \d[\d ]* Kč/);
    expect(hero).toMatch(/\d+(,\d)? % levněji/);
    expect(hero).not.toMatch(/[-\u2212]\d/);
    for (const diff of screen.getAllByTestId('energy-offer-diff'))
      expect(plain(diff.textContent)).toMatch(/^(O \d[\d ]* Kč (méně|víc)|bez srovnání)$/);
    expect(screen.getAllByTestId('energy-offer-bar-value').length).toBeGreaterThan(0);
    expect(screen.getByRole('table').textContent).toContain('Rozdíl');
    expect(screen.getByTestId('energy-offer-export-hint').textContent).toContain(
      'v létě vyhrává vyšší výkup přetoků',
    );
    const assumptions = screen.getByTestId('energy-offers-assumptions').textContent ?? '';
    expect(assumptions).toContain('VT = vysoký tarif, NT = nízký tarif (HDO)');
    expect(assumptions).toContain('čtvrthodinách se může mírně lišit');
    expect(plain(screen.getByTestId('energy-offers-reg-source').textContent)).toBe(
      'z faktury za září 2026',
    );
    expect(screen.getByTestId('energy-offers-poze-note').textContent).toBe(
      'v roce 2026 hradí stát (podle faktury)',
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

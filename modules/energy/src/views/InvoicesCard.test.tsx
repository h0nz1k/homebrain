// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ConnectionLike } from '@homebrain/ha-client';
import { InvoicesCard } from './InvoicesCard';
import { createInvoicesDemo } from '../invoicesDemo';
import {
  contractNotice,
  invoiceMonthMarkers,
  periodLabel,
  tariffUpdateCalls,
  uploadInvoice,
  type TariffCheck,
} from '../invoices';

afterEach(cleanup);
const NOW = Date.parse('2026-11-07T15:00:00Z');
const plain = (s: string | null) => (s ?? '').replace(/\u00a0/g, ' ');

function connectionFor(role: 'owner' | 'adult' | 'kiosk', scenario: 'one' | 'none' = 'one') {
  const demo = createInvoicesDemo(NOW, scenario);
  const sent: Array<Record<string, unknown>> = [];
  const connection = {
    sendMessagePromise: vi.fn(async (m: { type: string } & Record<string, unknown>) => {
      sent.push(m);
      if (role === 'kiosk') throw new Error('unauthorized');
      if (m.type === 'homebrain/energy/invoices/list') return demo.list(role === 'owner');
      if (m.type === 'homebrain/energy/invoices/compare') return demo.compare(String(m.invoice_id));
      if (m.type === 'call_service') {
        const t = m.target as { entity_id: string };
        demo.setTariff(t.entity_id, Number((m.service_data as { value: number }).value));
        return {};
      }
      throw new Error('unknown');
    }),
  };
  return { connection: connection as unknown as ConnectionLike, sent, demo };
}

describe('invoice helpers', () => {
  it('labels calendar months and other ranges', () => {
    expect(periodLabel(['2026-10-01', '2026-10-31'])).toBe('Říjen 2026');
    expect(plain(periodLabel(['2026-10-15', '2026-11-14']))).toBe('15. 10. – 14. 11. 2026');
    expect(periodLabel(null)).toBe('Období neznámé');
  });

  it('shows the contract notice from 30 days before the end', () => {
    expect(contractNotice('2027-03-04', Date.parse('2027-01-20T12:00:00Z'))).toBeNull();
    expect(plain(contractNotice('2027-03-04', Date.parse('2027-02-10T12:00:00Z')))).toBe(
      'Pevná cena končí 4. 3. 2027. Včas porovnejte nabídky.',
    );
    expect(contractNotice('2027-03-04', Date.parse('2027-03-10T12:00:00Z'))).toBeNull();
  });

  it('builds input_number.set_value calls only for differing bound helpers', () => {
    const check: TariffCheck = {
      values: { vt: 4.5, nt: 3.85, fixed_monthly: null },
      entities: { vt: 'input_number.vt', nt: 'input_number.nt', fixed_monthly: 'sensor.fixed' },
      items: {
        vt: { invoice: 4.59, current: 4.5, differs: true },
        nt: { invoice: 3.85, current: 3.85, differs: false },
        fixed_monthly: { invoice: 906.13, current: null, differs: true },
      },
      mismatch: true,
    };
    expect(tariffUpdateCalls(check)).toEqual([
      {
        type: 'call_service',
        domain: 'input_number',
        service: 'set_value',
        service_data: { value: 4.59 },
        target: { entity_id: 'input_number.vt' },
      },
    ]);
  });

  it('turns invoice history into month markers', () => {
    const demo = createInvoicesDemo(NOW);
    expect(invoiceMonthMarkers(demo.list(true).invoices)).toEqual({
      '2026-09': 600,
      '2026-08': 500,
      '2026-07': 470,
    });
  });

  it('uploads multipart and maps errors to Czech', async () => {
    const file = new File(['%PDF-1.4'], 'f.pdf', { type: 'application/pdf' });
    const ok = vi.fn(async () => new Response('{"id":"x"}', { status: 201 }));
    expect((await uploadInvoice(ok, file)).id).toBe('x');
    const [path, init] = ok.mock.calls[0] as unknown as [string, RequestInit];
    expect(path).toBe('/api/homebrain/energy/invoices');
    expect(init.body).toBeInstanceOf(FormData);
    const big = vi.fn(async () => new Response('{"message":"too_large"}', { status: 413 }));
    await expect(uploadInvoice(big, file)).rejects.toThrow('Soubor je větší než 5 MB.');
    const denied = vi.fn(async () => new Response('{}', { status: 403 }));
    await expect(uploadInvoice(denied, file)).rejects.toThrow('Faktury nahrává jen správce.');
  });
});

describe('InvoicesCard roles', () => {
  it('admin: upload button, comparison with the missing-import note and tariff rewrite', async () => {
    const { connection, sent } = connectionFor('owner');
    render(
      <InvoicesCard connection={connection} fetchWithAuth={vi.fn()} now={NOW} kiosk={false} />,
    );
    expect(await screen.findByTestId('energy-invoice-upload')).toBeTruthy();
    await waitFor(() =>
      expect(plain(screen.getByTestId('energy-invoice-grid').textContent)).toContain(
        'HA měří nákup od 1. 11. 2026',
      ),
    );
    expect(plain(screen.getByTestId('energy-invoice-self').textContent)).toContain('410 kWh');
    expect(screen.getByTestId('energy-invoice-contract')).toBeTruthy();
    fireEvent.click(screen.getByTestId('energy-invoice-apply-tariff'));
    fireEvent.click(await screen.findByTestId('energy-invoice-tariff-confirm-ok'));
    await waitFor(() =>
      expect(sent.filter((m) => m.type === 'call_service').map((m) => m.target)).toEqual([
        { entity_id: 'input_number.demo_price_vt' },
        { entity_id: 'input_number.demo_fixed_monthly' },
      ]),
    );
    await waitFor(() => expect(screen.queryByTestId('energy-invoice-apply-tariff')).toBeNull());
  });

  it('adult: read-only summary (no upload, no edit, no tariff rewrite, no contract notice)', async () => {
    const { connection } = connectionFor('adult');
    render(<InvoicesCard connection={connection} fetchWithAuth={vi.fn()} now={NOW} />);
    await screen.findByTestId('energy-invoice-compare');
    expect(screen.queryByTestId('energy-invoice-upload')).toBeNull();
    expect(screen.queryByTestId('energy-invoice-edit-open')).toBeNull();
    expect(screen.queryByTestId('energy-invoice-apply-tariff')).toBeNull();
    expect(screen.queryByTestId('energy-invoice-contract')).toBeNull();
  });

  it('kiosk: nothing', async () => {
    const { connection } = connectionFor('owner');
    const { container } = render(<InvoicesCard connection={connection} kiosk now={NOW} />);
    await new Promise((r) => setTimeout(r, 10));
    expect(container.innerHTML).toBe('');
    const denied = connectionFor('kiosk');
    const r2 = render(<InvoicesCard connection={denied.connection} now={NOW} />);
    await new Promise((r) => setTimeout(r, 10));
    expect(r2.container.innerHTML).toBe('');
  });
});

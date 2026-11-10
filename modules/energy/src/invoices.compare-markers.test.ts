import { describe, expect, it } from 'vitest';
import { createInvoicesDemo } from './invoicesDemo';
import {
  formatInvoiceMarkerDetail,
  invoiceMarkerDiffPct,
  invoiceMonthMarkerMap,
  invoiceMonthMarkers,
} from './invoices';

const NOW = Date.parse('2026-11-07T15:00:00Z');

describe('invoice month markers for compare chart', () => {
  it('maps history and the invoice month to kWh and billed amount', () => {
    const demo = createInvoicesDemo(NOW);
    expect(invoiceMonthMarkers(demo.list(true).invoices)).toEqual({
      '2026-09': 600,
      '2026-08': 500,
      '2026-07': 470,
    });
    expect(invoiceMonthMarkerMap(demo.list(true).invoices)['2026-09']).toEqual({
      kwh: 600,
      czk: 3265.05,
    });
  });

  it('formats tooltip lines and percent diff vs HA', () => {
    const marker = { kwh: 600, czk: 3265.05 };
    const detail = formatInvoiceMarkerDetail(marker, 960, 'house', (v) => `${v} kWh`);
    expect(detail).toContain('Faktura:');
    expect(detail.replace(/\u00a0/g, ' ')).toContain('600 kWh');
    expect(detail.replace(/\u00a0/g, ' ')).toContain('3 265 Kč');
    expect(detail).toContain('Naměřeno v HA: 960 kWh');
    expect(detail).toContain('Rozdíl:');
    expect(invoiceMarkerDiffPct(marker, 960, 'house')).toBeCloseTo(-37.5, 1);
  });
});

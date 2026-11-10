import { describe, expect, it } from 'vitest';
import { createInvoicesDemo } from './invoicesDemo';
import {
  formatInvoiceMarkerDetail,
  formatInvoiceMarkerDiffLine,
  invoiceMarkerDiffPct,
  invoiceMarkerDiffTone,
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
    const detail = formatInvoiceMarkerDetail(marker, 960, 'house', (v) => `${v} kWh`, '2026-09');
    expect(detail).toContain('Faktura za září 2026');
    expect(detail).toContain('Faktura:');
    expect(detail.replace(/\u00a0/g, ' ')).toContain('600 kWh');
    expect(detail.replace(/\u00a0/g, ' ')).toContain('3 265 Kč');
    expect(detail).toContain('Naměřeno v HA: 960 kWh');
    expect(detail).toContain('Rozdíl (faktura − HA):');
    expect(formatInvoiceMarkerDiffLine(marker, 960, 'house')?.replace(/\u00a0/g, ' ')).toMatch(
      /[−-]360 kWh \([−-]38 %\)/,
    );
    expect(invoiceMarkerDiffPct(marker, 960, 'house')).toBeCloseTo(-37.5, 1);
    expect(invoiceMarkerDiffTone(-37.5)).toBe('warn-strong');
    expect(invoiceMarkerDiffTone(-3)).toBe('muted');
    expect(invoiceMarkerDiffTone(10)).toBe('warn');
  });
});

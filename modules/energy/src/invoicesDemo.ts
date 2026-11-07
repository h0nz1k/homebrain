/** Synthetic Energie „Faktury“ backend for dev and e2e (`?faktury=none`, `?role=adult|kiosk`). */
import type {
  Invoice,
  InvoiceComparison,
  InvoiceFields,
  InvoiceList,
  InvoiceTariff,
  TariffKey,
} from './invoices.js';

const DAY = 86_400_000;
const iso = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function fields(month: '09' | '10', contractEnd: string): InvoiceFields {
  const sep = month === '09';
  return {
    supplier: 'ČEZ Prodej',
    distributor: 'EG.D',
    product: 'Elektřina - klesající na 2 roky',
    rate: 'D45D',
    breaker: '3x25A',
    period: sep ? ['2026-09-01', '2026-09-30'] : ['2026-10-01', '2026-10-31'],
    issued: sep ? '2026-10-06' : '2026-11-05',
    due: sep ? '2026-10-20' : '2026-11-19',
    contract_end: contractEnd,
    meter: sep
      ? { vt: [10000, 10120], nt: [50000, 50480] }
      : { vt: [10120, 10210], nt: [50480, 50930] },
    kwh: sep ? { vt: 120, nt: 480, total: 600 } : { vt: 90, nt: 450, total: 540 },
    commodity_czk_per_mwh_excl_vat: { vt: 3000, nt: 2800 },
    fixed_monthly_excl_vat: { stala_platba: 150, jistic: 500, nesitova_infrastruktura: 12.87 },
    distribution_czk_per_mwh_excl_vat: { vt: 800, nt: 250, systemove_sluzby: 164.24, dan: 28.3 },
    poze_czk_per_month_excl_vat: 0,
    poze_waived_czk: sep ? 400 : 360,
    total_excl_vat: sep ? 2698.39 : 2489.59,
    vat: sep ? 566.66 : 522.81,
    vat_rate: 21,
    total_incl_vat: sep ? 3265.05 : 3012.4,
    avg_incl_vat: { vt: 4.83, nt: 3.92 },
    fixed_monthly_incl_vat: 802.07,
    history: sep
      ? [
          { month: '2026-08', vt: 100, nt: 400, total: 500, czk: 2783 },
          { month: '2026-07', vt: 90, nt: 380, total: 470, czk: 2662 },
        ]
      : [
          { month: '2026-09', vt: 120, nt: 480, total: 600, czk: 3265.05 },
          { month: '2026-08', vt: 100, nt: 400, total: 500, czk: 2783 },
        ],
  };
}

function record(id: string, f: InvoiceFields, status: Invoice['status']): Invoice {
  return {
    id,
    uploaded_at: '2026-11-06T08:00:00+00:00',
    kind: 'pdf',
    mime: 'application/pdf',
    size: 182_000,
    status,
    parser: 'cez_prodej',
    fields: f,
    confidence: {},
    missing: [],
    warnings: [],
  };
}

export function createInvoicesDemo(now: number, scenario: 'one' | 'none' = 'one') {
  const contractEnd = iso(now + 25 * DAY);
  const invoices: Invoice[] =
    scenario === 'none' ? [] : [record('a1b2c3d4e5f60718', fields('09', contractEnd), 'confirmed')];
  const tariff: InvoiceTariff = {
    values: { vt: 4.5, nt: 3.92, fixed_monthly: 780 },
    entities: {
      vt: 'input_number.demo_price_vt',
      nt: 'input_number.demo_price_nt',
      fixed_monthly: 'input_number.demo_fixed_monthly',
    },
  };
  const sorted = () =>
    [...invoices].sort((a, b) =>
      (b.fields.period?.[0] ?? '').localeCompare(a.fields.period?.[0] ?? ''),
    );
  return {
    list: (canEdit: boolean): InvoiceList => ({
      invoices: sorted(),
      can_edit: canEdit,
      tariff: structuredClone(tariff),
    }),
    upload(): Invoice {
      const inv = record('f0e1d2c3b4a59687', fields('10', contractEnd), 'draft');
      inv.fields.avg_incl_vat = { vt: 4.83, nt: 3.92 };
      invoices.push(inv);
      return inv;
    },
    save(id: string, f: InvoiceFields): Invoice {
      const inv = invoices.find((i) => i.id === id);
      if (!inv) throw new Error('not_found');
      inv.fields = f;
      inv.status = 'confirmed';
      return inv;
    },
    remove(id: string) {
      const i = invoices.findIndex((x) => x.id === id);
      if (i >= 0) invoices.splice(i, 1);
      return { deleted: id };
    },
    setTariff(entity: string, value: number) {
      const key = (Object.keys(tariff.entities) as TariffKey[]).find(
        (k) => tariff.entities[k] === entity,
      );
      if (key) tariff.values[key] = value;
    },
    compare(id: string): InvoiceComparison {
      const inv = invoices.find((i) => i.id === id)!;
      const f = inv.fields;
      const items: InvoiceComparison['tariff']['items'] = {};
      const invoiceValues: Record<TariffKey, number | null | undefined> = {
        vt: f.avg_incl_vat?.vt,
        nt: f.avg_incl_vat?.nt,
        fixed_monthly: f.fixed_monthly_incl_vat,
      };
      for (const key of ['vt', 'nt', 'fixed_monthly'] as TariffKey[]) {
        const v = invoiceValues[key];
        if (v === null || v === undefined) continue;
        const cur = tariff.values[key];
        const tol = key === 'fixed_monthly' ? 0.5 : 0.005;
        items[key] = { invoice: v, current: cur, differs: cur === null || Math.abs(cur - v) > tol };
      }
      const total = f.kwh?.total ?? null;
      const house = f.period?.[0] === '2026-10-01' ? 905 : 1010;
      return {
        invoice_id: id,
        status: 'ok',
        tariff: { ...tariff, items, mismatch: Object.values(items).some((i) => i?.differs) },
        grid: {
          invoice: total,
          measured: null,
          diff: null,
          pct: null,
          status: 'missing',
          measured_since: '2026-11-01',
        },
        house,
        pv: f.period?.[0] === '2026-10-01' ? 410 : 690,
        export: null,
        self_consumption:
          total === null ? null : { kwh: house - total, basis: 'house_minus_invoice' },
        cost: { invoice: f.total_incl_vat, estimate: null, diff: null, pct: null },
      };
    },
  };
}

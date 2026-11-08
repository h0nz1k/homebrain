/**
 * Synthetic Energie „Srovnání nabídek“ backend for dev, vitest and e2e
 * (`?nabidky=empty|loading`, `?role=adult|kiosk`). Invented consumption and prices only.
 */
import type { Offer, OffersComparison, OffersState, Plan, PlanMonth, Regulated } from './offers.js';

export type OffersScenario = 'full' | 'empty' | 'loading';

const REGULATED: Regulated = {
  distribution_vt: 1800,
  distribution_nt: 300,
  system_services: 160,
  poze: 0,
  tax: 28.3,
  monthly_fixed: 520,
  current_export_price: 800,
  vat_percent: 21,
  year: 2026,
  source: 'invoice',
  source_period: ['2026-09-01', '2026-09-30'],
  poze_waived: true,
};

const OFFERS: Offer[] = [
  {
    id: 'demo00000001',
    name: 'Fixace 24 měsíců',
    kind: 'fixed',
    price_vt: 2690,
    price_nt: 2390,
    margin: null,
    monthly_fee: 129,
    export: { mode: 'fixed', price: 700, fee: null },
  },
  {
    id: 'demo00000002',
    name: 'Spot s výkupem',
    kind: 'spot',
    price_vt: null,
    price_nt: null,
    margin: 390,
    monthly_fee: 99,
    export: { mode: 'spot', price: null, fee: 450 },
  },
];

// Seasonal synthetic profile: import kWh, export kWh, NT share, mean spot Kč/MWh (12 months).
const IMPORT = [520, 640, 690, 600, 470, 300, 220, 180, 190, 230, 330, 450];
const EXPORT = [20, 10, 15, 60, 160, 260, 330, 360, 340, 250, 150, 60];
const SPOT = [2650, 2900, 2800, 2400, 1900, 1700, 1600, 1500, 1750, 2100, 2400, 2550];
const NT = 0.82;

function monthKeys(now: number): string[] {
  const d = new Date(now);
  const out: string[] = [];
  for (let back = 12; back >= 1; back--) {
    const m = new Date(d.getFullYear(), d.getMonth() - back, 1);
    out.push(`${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

export function createOffersDemo(now: number, scenario: OffersScenario = 'full') {
  let offers: Offer[] = scenario === 'empty' ? [] : OFFERS.map((o) => structuredClone(o));
  let regulated: Regulated = { ...REGULATED };
  let seq = 3;
  const keys = monthKeys(now);
  const idx = (key: string) => Number(key.slice(5, 7)) - 1;

  const state = (canEdit: boolean): OffersState => ({
    offers: structuredClone(offers),
    regulated: { ...regulated },
    can_edit: canEdit,
  });

  const month = (o: Offer | 'current', key: string): PlanMonth => {
    const i = idx(key);
    const imp = IMPORT[i]!;
    const exp = EXPORT[i]!;
    const spot = SPOT[i]!;
    if (o === 'current') {
      const energy = imp * (4.95 * (1 - NT) + 4.1 * NT);
      const fees = 690;
      const exportKc = (exp * regulated.current_export_price) / 1000;
      return {
        energy,
        distribution: null,
        fees,
        vat: ((energy + fees) * 0.21) / 1.21,
        export: exportKc,
        total: energy + fees - exportKc,
      };
    }
    const commodity =
      o.kind === 'fixed'
        ? o.price_vt! * (1 - NT) + o.price_nt! * NT
        : spot * 0.97 + (o.margin ?? 0); // households buy a bit more in cheaper hours
    const energy = (imp * commodity) / 1000;
    const r = regulated;
    const distribution =
      (imp *
        (r.distribution_vt * (1 - NT) +
          r.distribution_nt * NT +
          r.system_services +
          r.poze +
          r.tax)) /
      1000;
    const fees = o.monthly_fee + r.monthly_fixed;
    const base = energy + distribution + fees;
    const vat = (base * r.vat_percent) / 100;
    const exportKc =
      o.export.mode === 'fixed'
        ? (exp * (o.export.price ?? 0)) / 1000
        : o.export.mode === 'spot'
          ? (exp * (spot * 0.8 - (o.export.fee ?? 0))) / 1000 // export hours are the cheap ones
          : 0;
    return { energy, distribution, fees, vat, export: exportKc, total: base + vat - exportKc };
  };

  const compare = (): OffersComparison => {
    const plans: Plan[] = [{ id: 'current', name: 'Současná smlouva', kind: 'current' } as Plan]
      .concat(offers.map((o) => ({ id: o.id, name: o.name, kind: o.kind }) as Plan))
      .map((p) => {
        const src = p.kind === 'current' ? 'current' : offers.find((o) => o.id === p.id)!;
        const months = keys.map((k) => month(src, k));
        return {
          ...p,
          months,
          total: months.reduce((s, m) => s + (m.total ?? 0), 0),
          diff: null,
          missing_spot_hours: 0,
        };
      });
    const cur = plans[0]!;
    for (const p of plans.slice(1)) p.diff = p.total! - cur.total!;
    const ranking = [...plans].sort((a, b) => a.total! - b.total!).map((p) => p.id);
    return {
      status: 'ok',
      period: { from: keys[0]!, to: keys[11]! },
      months: keys.map((k) => ({
        month: k,
        partial: false,
        import_kwh: IMPORT[idx(k)]!,
        export_kwh: EXPORT[idx(k)]!,
        nt_share: NT,
        compared: true,
      })),
      months_compared: 12,
      plans,
      ranking,
      assumptions: [
        'same_profile',
        'hourly_metering',
        'hdo_schedule',
        'regulated_user',
        'export_no_vat',
      ],
      spot:
        scenario === 'loading'
          ? { needed: true, source: 'ote', running: true, done: 120, total: 365, days: 245 }
          : {
              needed: offers.some((o) => o.kind === 'spot'),
              source: 'ote',
              running: false,
              days: 365,
            },
    };
  };

  const handle = (m: { type: string } & Record<string, unknown>, canEdit: boolean): unknown => {
    switch (m.type) {
      case 'homebrain/energy/offers/get':
        return state(canEdit);
      case 'homebrain/energy/offers/compare':
        return compare();
      case 'homebrain/energy/offers/save': {
        if (!canEdit) throw new Error('unauthorized');
        if (m.offer) {
          const raw = m.offer as Offer & { id?: string };
          if (!raw.name || (raw.kind === 'fixed' && (raw.price_vt == null || raw.price_nt == null)))
            throw new Error('invalid_offer');
          const offer: Offer = {
            id: raw.id || `demo${String(seq++).padStart(8, '0')}`,
            name: raw.name,
            kind: raw.kind,
            price_vt: raw.kind === 'fixed' ? raw.price_vt : null,
            price_nt: raw.kind === 'fixed' ? raw.price_nt : null,
            margin: raw.kind === 'spot' ? (raw.margin ?? 0) : null,
            monthly_fee: raw.monthly_fee ?? 0,
            export: {
              mode: raw.export?.mode ?? 'none',
              price: raw.export?.price ?? null,
              fee: raw.export?.fee ?? null,
            },
          };
          const at = offers.findIndex((o) => o.id === offer.id);
          if (at >= 0) offers[at] = offer;
          else offers.push(offer);
        }
        if (m.regulated)
          regulated = { ...regulated, ...(m.regulated as Regulated), source: 'saved' };
        return state(canEdit);
      }
      case 'homebrain/energy/offers/delete':
        if (!canEdit) throw new Error('unauthorized');
        offers = offers.filter((o) => o.id !== m.offer_id);
        return state(canEdit);
      default:
        throw new Error(`unknown ${m.type}`);
    }
  };

  return { handle, compare };
}

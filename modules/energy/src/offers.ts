/**
 * Energie „Srovnání nabídek“: kolik by domácnost zaplatila u jiné nabídky.
 *
 * The integration computes everything (`homebrain/energy/offers/compare`) from the metered
 * hourly grid import/export and OTE spot prices; this file types the replies and formats them.
 */
import type { ConnectionLike } from '@homebrain/ha-client';

export type OfferKind = 'fixed' | 'spot';
export type ExportMode = 'none' | 'fixed' | 'spot';

export interface Offer {
  id: string;
  name: string;
  kind: OfferKind;
  /** Kč/MWh without VAT (fixed offers). */
  price_vt: number | null;
  price_nt: number | null;
  /** Kč/MWh without VAT added to the spot price (spot offers). */
  margin: number | null;
  /** Kč/month without VAT. */
  monthly_fee: number;
  export: { mode: ExportMode; price: number | null; fee: number | null };
}

export interface Regulated {
  distribution_vt: number;
  distribution_nt: number;
  system_services: number;
  poze: number;
  tax: number;
  monthly_fixed: number;
  current_export_price: number;
  vat_percent: number;
  year: number;
  source: 'saved' | 'invoice' | 'bindings' | 'empty';
  /** Billing period `[from, to]` (ISO dates) of the invoice the values came from. */
  source_period?: [string, string] | null;
  /** The invoice shows POZE waived by the state (charged 0 Kč). */
  poze_waived?: boolean;
}

export interface OffersState {
  offers: Offer[];
  regulated: Regulated;
  can_edit: boolean;
}

export interface PlanMonth {
  energy: number | null;
  distribution: number | null;
  fees: number | null;
  vat: number | null;
  export: number | null;
  total: number | null;
}

export interface Plan {
  id: string;
  name: string;
  kind: 'current' | OfferKind;
  months: PlanMonth[];
  total: number | null;
  diff: number | null;
  missing_spot_hours: number;
}

export interface SpotInfo {
  needed: boolean;
  source: 'ote' | 'ha' | 'ote+ha' | null;
  running?: boolean;
  done?: number;
  total?: number;
  days?: number;
  failed?: number;
}

export interface OffersComparison {
  status: 'ok' | 'nodata' | 'unconfigured' | 'unsupported';
  period?: { from: string; to: string };
  months?: Array<{
    month: string;
    partial: boolean;
    import_kwh: number | null;
    export_kwh: number | null;
    nt_share: number | null;
    compared?: boolean;
  }>;
  months_compared?: number;
  plans?: Plan[];
  ranking?: string[];
  assumptions?: string[];
  spot?: SpotInfo;
}

/** Editor form state (strings as typed by the user). */
export interface OfferForm {
  id: string;
  name: string;
  kind: OfferKind;
  price_vt: string;
  price_nt: string;
  margin: string;
  monthly_fee: string;
  export_mode: ExportMode;
  export_price: string;
  export_fee: string;
}

export const REGULATED_FIELDS: ReadonlyArray<
  readonly [keyof Regulated, string, 'Kč/MWh' | 'Kč/měs.' | '%']
> = [
  ['distribution_vt', 'Distribuce VT', 'Kč/MWh'],
  ['distribution_nt', 'Distribuce NT', 'Kč/MWh'],
  ['system_services', 'Systémové služby', 'Kč/MWh'],
  ['poze', 'Podpora OZE (POZE)', 'Kč/MWh'],
  ['tax', 'Daň z elektřiny', 'Kč/MWh'],
  ['monthly_fixed', 'Stálé regulované platby (jistič, OTE)', 'Kč/měs.'],
  ['current_export_price', 'Výkup přetoků u současné smlouvy', 'Kč/MWh'],
  ['vat_percent', 'DPH', '%'],
];

export const ASSUMPTION_TEXT: Record<string, string> = {
  same_profile:
    'Stejná spotřeba a přetoky hodinu po hodině jako ve skutečnosti – bez změny chování (např. přesunu spotřeby do levných hodin u spotu).',
  hourly_metering:
    'Počítáme z hodinových statistik Home Assistantu (střídač/elektroměr). Spotové ceny jsou od 1. 10. 2025 čtvrthodinové a průměrujeme je na hodinu, takže skutečné vyúčtování po čtvrthodinách se může mírně lišit.',
  hdo_schedule:
    'VT = vysoký tarif, NT = nízký tarif (HDO). Rozdělení VT/NT podle současného rozvrhu HDO – stejné hodiny NT každý den.',
  regulated_user:
    'Distribuci a regulované složky bereme z uloženého nastavení, jinak z poslední potvrzené faktury; ceny 2026 používáme pro všechny měsíce období a všechny nabídky stejně.',
  export_no_vat: 'Výkup přetoků je bez DPH (domácnost není plátce DPH).',
};

const NBSP = '\u00a0';
const nf = (digits: number) =>
  new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: digits, minimumFractionDigits: 0 });
const fmt = (v: number, digits = 0) => nf(digits).format(v).replace(/\s/g, NBSP);

export function formatKc(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '–';
  return `${value < 0 ? '\u2212' : ''}${fmt(Math.abs(Math.round(value)))}${NBSP}Kč`;
}

export function formatDiff(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '–';
  const r = Math.round(value);
  return `${r < 0 ? '\u2212' : r > 0 ? '+' : ''}${fmt(Math.abs(r))}${NBSP}Kč`;
}

/** `1,8 %` (absolute value, Czech decimal comma, NBSP before %). */
export function formatPercent(value: number): string {
  return `${fmt(Math.abs(value), 1)}${NBSP}%`;
}

/** Card wording of a difference vs the current contract: never a bare minus sign. */
export function diffWords(value: number | null | undefined): {
  text: string;
  tone: 'ok' | 'warn' | undefined;
} {
  if (value === null || value === undefined || !Number.isFinite(value))
    return { text: 'bez srovnání', tone: undefined };
  const r = Math.round(value);
  if (r < 0) return { text: `O${NBSP}${formatKc(-r)} méně`, tone: 'ok' };
  if (r > 0) return { text: `O${NBSP}${formatKc(r)} víc`, tone: 'warn' };
  return { text: 'Stejně jako teď', tone: undefined };
}

/** Round values so their sum equals the rounded total (largest remainder). */
export function roundToTotal(values: Array<number | null>): Array<number | null> {
  const out = values.map((v) => (v === null ? null : Math.round(v)));
  const exact = values.reduce<number>((a, v) => a + (v ?? 0), 0);
  let delta = Math.round(exact) - out.reduce<number>((a, v) => a + (v ?? 0), 0);
  const order = values
    .map((v, i) => ({ i, err: v === null ? 0 : v - Math.round(v) }))
    .filter((x) => values[x.i] !== null)
    .sort((a, b) => (delta > 0 ? b.err - a.err : a.err - b.err));
  for (const { i } of order) {
    if (delta === 0) break;
    out[i] = (out[i] ?? 0) + Math.sign(delta);
    delta -= Math.sign(delta);
  }
  return out;
}

/** Compact bar label (Kč, absolute): `184`, `1,2k`. */
export function barValue(value: number): string {
  const a = Math.abs(Math.round(value));
  return a >= 1000 ? `${fmt(a / 1000, 1)}k` : fmt(a);
}

export function parseNum(text: string): number | null {
  const clean = text
    .replace(/[\s\u00a0\u202f]/g, '')
    .replace(',', '.')
    .replace('\u2212', '-');
  if (!clean || !/^-?\d+(\.\d+)?$/.test(clean)) return null;
  return Number(clean);
}

const MONTHS = [
  'leden',
  'únor',
  'březen',
  'duben',
  'květen',
  'červen',
  'červenec',
  'srpen',
  'září',
  'říjen',
  'listopad',
  'prosinec',
];
const SHORT = ['led', 'úno', 'bře', 'dub', 'kvě', 'čvn', 'čvc', 'srp', 'zář', 'říj', 'lis', 'pro'];

/** `2026-10` → `říj` (short) or `Říjen 2026` (long). */
export function monthLabel(key: string, long = false): string {
  const [y, m] = key.split('-').map(Number);
  const i = (m ?? 1) - 1;
  if (!long) return SHORT[i] ?? key;
  const name = MONTHS[i] ?? key;
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${y}`;
}

const perMwh = (v: number | null) => `${fmt(v ?? 0)}${NBSP}Kč/MWh`;
const spotPlus = (v: number | null) =>
  `spot ${(v ?? 0) < 0 ? 'mínus' : 'plus'} ${perMwh(Math.abs(v ?? 0))}`;

/** One labelled price row of an offer; `parts` never break inside (wrap only between them). */
export interface PriceRow {
  label: string;
  parts: string[];
}

/** Price rows of an offer (the kind is shown separately as a badge). */
export function offerPrices(offer: Offer): PriceRow[] {
  const rows: PriceRow[] = [
    offer.kind === 'fixed'
      ? { label: 'Cena', parts: [`VT ${perMwh(offer.price_vt)}`, `NT ${perMwh(offer.price_nt)}`] }
      : { label: 'Cena', parts: [spotPlus(offer.margin)] },
  ];
  if (offer.monthly_fee)
    rows.push({ label: 'Stálá platba', parts: [`${fmt(offer.monthly_fee)}${NBSP}Kč/měs.`] });
  if (offer.export.mode === 'fixed')
    rows.push({ label: 'Výkup', parts: [perMwh(offer.export.price)] });
  if (offer.export.mode === 'spot')
    rows.push({ label: 'Výkup', parts: [spotPlus(-(offer.export.fee ?? 0))] });
  return rows;
}

/** Plain-text summary (aria, tests): `Cena: spot plus 350 Kč/MWh; Výkup: spot mínus 400 Kč/MWh`. */
export function offerSummary(offer: Offer): string {
  return offerPrices(offer)
    .map((r) => `${r.label}: ${r.parts.join(', ')}`)
    .join('; ');
}

/** `září 2026`, `červenec – září 2026` (accusative = nominative for Czech month names). */
export function invoicePeriodText(period: [string, string] | null | undefined): string | null {
  if (!period) return null;
  const [a, b] = period.map((d) => d.split('-').map(Number));
  if (!a || !b || !a[0] || !b[0]) return null;
  const name = (p: number[]) => MONTHS[(p[1] ?? 1) - 1] ?? '';
  if (a[0] === b[0] && a[1] === b[1]) return `${name(a)} ${a[0]}`;
  return a[0] === b[0]
    ? `${name(a)} – ${name(b)} ${b[0]}`
    : `${name(a)} ${a[0]} – ${name(b)} ${b[0]}`;
}

/** Where the regulated prices come from (shown next to the heading). */
export function regulatedSourceText(reg: Regulated): string {
  if (reg.source === 'saved') return 'zadané v nastavení';
  if (reg.source === 'invoice') {
    const period = invoicePeriodText(reg.source_period);
    return period ? `z faktury za ${period}` : 'z poslední faktury';
  }
  if (reg.source === 'bindings') return 'předvyplněno z pomocníků Energie – zkontrolujte';
  return 'zatím nezadané';
}

export function emptyForm(): OfferForm {
  return {
    id: '',
    name: '',
    kind: 'fixed',
    price_vt: '',
    price_nt: '',
    margin: '',
    monthly_fee: '',
    export_mode: 'none',
    export_price: '',
    export_fee: '',
  };
}

const str = (v: number | null | undefined) =>
  v === null || v === undefined ? '' : String(v).replace('.', ',');

export function formFromOffer(offer: Offer): OfferForm {
  return {
    id: offer.id,
    name: offer.name,
    kind: offer.kind,
    price_vt: str(offer.price_vt),
    price_nt: str(offer.price_nt),
    margin: str(offer.margin),
    monthly_fee: str(offer.monthly_fee || null),
    export_mode: offer.export.mode,
    export_price: str(offer.export.price),
    export_fee: str(offer.export.fee),
  };
}

/** WS payload for `homebrain/energy/offers/save` (the backend validates again). */
export function offerPayload(form: OfferForm): Record<string, unknown> {
  const out: Record<string, unknown> = { name: form.name.trim(), kind: form.kind };
  if (form.id) out.id = form.id;
  if (form.kind === 'fixed') {
    out.price_vt = parseNum(form.price_vt);
    out.price_nt = parseNum(form.price_nt);
  } else {
    out.margin = parseNum(form.margin);
  }
  out.monthly_fee = parseNum(form.monthly_fee) ?? 0;
  const mode = form.kind === 'fixed' && form.export_mode === 'spot' ? 'none' : form.export_mode;
  out.export =
    mode === 'fixed'
      ? { mode, price: parseNum(form.export_price) }
      : mode === 'spot'
        ? { mode, fee: parseNum(form.export_fee) ?? 0 }
        : { mode };
  return out;
}

/** Plans in backend ranking order (cheapest first, incomplete last). */
export function rankedPlans(cmp: OffersComparison | null): Plan[] {
  if (!cmp?.plans) return [];
  const order = cmp.ranking ?? cmp.plans.map((p) => p.id);
  return order.map((id) => cmp.plans!.find((p) => p.id === id)).filter((p): p is Plan => !!p);
}

export interface OffersHero {
  /** Saving (negative) or extra cost (positive) of the best offer vs the current contract. */
  diff: number | null;
  best: Plan;
  perMonth: number | null;
  percent: number | null;
}

export function offersHero(cmp: OffersComparison | null): OffersHero | null {
  const ranked = rankedPlans(cmp);
  const current = ranked.find((p) => p.kind === 'current');
  const best = ranked.find((p) => p.kind !== 'current' && p.total !== null);
  if (!best) return null;
  const months = cmp?.months_compared ?? 0;
  const diff = best.diff;
  return {
    best,
    diff,
    perMonth: diff !== null && months ? diff / months : null,
    percent: diff !== null && current?.total ? (diff / current.total) * 100 : null,
  };
}

/** Hero wording: `Ušetřili byste 478 Kč` / `Připlatili byste 120 Kč`, `1,8 % levněji`. */
export function heroWords(hero: OffersHero): {
  big: string;
  percent: string | null;
  perMonth: string | null;
} | null {
  if (hero.diff === null) return null;
  const r = Math.round(hero.diff);
  const big =
    r < 0
      ? `Ušetřili byste ${formatKc(-r)}`
      : r > 0
        ? `Připlatili byste ${formatKc(r)}`
        : 'Vyšlo by to nastejno';
  const percent =
    hero.percent === null || r === 0
      ? null
      : `${formatPercent(hero.percent)} ${hero.percent < 0 ? 'levněji' : 'dráž'}`;
  const perMonth =
    hero.perMonth === null || r === 0
      ? null
      : `≈${NBSP}${formatKc(Math.abs(hero.perMonth))} ${hero.perMonth < 0 ? 'méně' : 'víc'} měsíčně`;
  return { big, percent, perMonth };
}

export function offersHeadline(cmp: OffersComparison | null): string | null {
  const ranked = rankedPlans(cmp);
  const current = ranked.find((p) => p.kind === 'current');
  const best = ranked.find((p) => p.kind !== 'current' && p.total !== null);
  if (!best) return null;
  if (!current || current.total === null || best.diff === null)
    return `Nejlevnější nabídka: „${best.name}“ za ${formatKc(best.total)}.`;
  if (best.diff < 0) return `Nejvýhodnější je „${best.name}“ oproti současné smlouvě.`;
  return `Současná smlouva vychází nejlépe – nejbližší je „${best.name}“.`;
}

export function spotStatusText(spot: SpotInfo | undefined): string | null {
  if (!spot?.needed) return null;
  if (spot.running)
    return `Stahujeme spotové ceny z OTE: ${spot.done ?? 0} z ${spot.total ?? 0} dní.`;
  if (spot.source === 'ha') return 'Spotové ceny bereme ze statistik senzoru v Home Assistantu.';
  if (!spot.source) return 'Spotové ceny zatím nemáme – zkusíme je stáhnout z OTE znovu.';
  return null;
}

export function periodText(cmp: OffersComparison | null): string {
  if (!cmp?.period) return '';
  const { from, to } = cmp.period;
  const n = cmp.months_compared ?? 0;
  const span =
    from === to
      ? monthLabel(from, true)
      : `${monthLabel(from, true)} – ${monthLabel(to, true).toLowerCase()}`;
  const label = n === 1 ? 'měsíc' : n >= 2 && n <= 4 ? 'měsíce' : 'měsíců';
  return `${span} · ${n}${NBSP}${label}`;
}

/* ---------- WS ---------- */

export async function fetchOffers(connection: ConnectionLike | null | undefined) {
  if (!connection) return null;
  try {
    const state = await connection.sendMessagePromise<OffersState>({
      type: 'homebrain/energy/offers/get',
    });
    return state && Array.isArray(state.offers) ? state : null;
  } catch {
    return null; // kiosk, child or an older backend: no card
  }
}

export async function fetchOffersComparison(connection: ConnectionLike) {
  try {
    return await connection.sendMessagePromise<OffersComparison>({
      type: 'homebrain/energy/offers/compare',
    });
  } catch {
    return null;
  }
}

export function saveOffer(connection: ConnectionLike, offer: Record<string, unknown>) {
  const message = { type: 'homebrain/energy/offers/save', offer };
  return connection.sendMessagePromise<OffersState>(message);
}

export function saveRegulated(connection: ConnectionLike, regulated: Record<string, unknown>) {
  const message = { type: 'homebrain/energy/offers/save', regulated };
  return connection.sendMessagePromise<OffersState>(message);
}

export function deleteOffer(connection: ConnectionLike, offerId: string) {
  const message = { type: 'homebrain/energy/offers/delete', offer_id: offerId };
  return connection.sendMessagePromise<OffersState>(message);
}

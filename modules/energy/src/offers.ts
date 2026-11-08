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
  source: 'saved' | 'bindings' | 'empty';
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
    'Počítáme z hodinových statistik Home Assistantu (střídač/elektroměr). Čtvrthodinové spotové ceny (od 1. 10. 2025) průměrujeme na hodinu.',
  hdo_schedule: 'Rozdělení VT/NT podle současného rozvrhu HDO – stejné hodiny NT každý den.',
  regulated_user:
    'Distribuci a regulované složky bereme z hodnot zadaných v nastavení (regulované ceny 2026) a stejné pro všechny nabídky.',
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

/** Price parts of an offer (the kind is shown separately as a badge). */
export function offerParts(offer: Offer): string[] {
  const parts =
    offer.kind === 'fixed'
      ? [`VT ${perMwh(offer.price_vt)}`, `NT ${perMwh(offer.price_nt)}`]
      : [`spot ${(offer.margin ?? 0) < 0 ? '\u2212' : '+'} ${perMwh(Math.abs(offer.margin ?? 0))}`];
  if (offer.monthly_fee) parts.push(`${fmt(offer.monthly_fee)}${NBSP}Kč/měs.`);
  if (offer.export.mode === 'fixed') parts.push(`výkup ${perMwh(offer.export.price)}`);
  if (offer.export.mode === 'spot') parts.push(`výkup: spot \u2212 ${perMwh(offer.export.fee)}`);
  return parts;
}

export function offerSummary(offer: Offer): string {
  return offerParts(offer).join(' · ');
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

export function offersHeadline(cmp: OffersComparison | null): string | null {
  const ranked = rankedPlans(cmp);
  const current = ranked.find((p) => p.kind === 'current');
  const best = ranked.find((p) => p.kind !== 'current' && p.total !== null);
  if (!best) return null;
  if (!current || current.total === null || best.diff === null)
    return `Nejlevnější nabídka: „${best.name}“ za ${formatKc(best.total)}.`;
  if (best.diff < 0)
    return `Nejvýhodnější by byla „${best.name}“ – ušetřili byste ${formatKc(-best.diff)}.`;
  return `Současná smlouva vychází nejlépe – „${best.name}“ by vyšla o ${formatKc(best.diff)} dráž.`;
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
    from === to ? monthLabel(from, true) : `${monthLabel(from, true)} – ${monthLabel(to, true)}`;
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

/**
 * Energie „Faktury“: uploaded electricity invoices vs HA measurements.
 * The integration parses and stores invoices (`/api/homebrain/energy/invoices`, WS
 * `homebrain/energy/invoices/*`); this file types the replies and holds the pure helpers.
 */
import type { ConnectionLike } from '@homebrain/ha-client';

export type FetchWithAuth = (path: string, init?: RequestInit) => Promise<Response>;

export interface InvoiceFields {
  supplier: string | null;
  distributor: string | null;
  product: string | null;
  rate: string | null;
  breaker: string | null;
  period: [string, string] | null;
  issued: string | null;
  due: string | null;
  contract_end: string | null;
  meter: { vt: [number | null, number | null]; nt: [number | null, number | null] } | null;
  kwh: { vt: number | null; nt: number | null; total: number | null } | null;
  commodity_czk_per_mwh_excl_vat: { vt: number | null; nt: number | null } | null;
  fixed_monthly_excl_vat: {
    stala_platba: number | null;
    jistic: number | null;
    nesitova_infrastruktura: number | null;
  } | null;
  distribution_czk_per_mwh_excl_vat: {
    vt: number | null;
    nt: number | null;
    systemove_sluzby: number | null;
    dan: number | null;
  } | null;
  poze_czk_per_month_excl_vat: number | null;
  poze_waived_czk: number | null;
  total_excl_vat: number | null;
  vat: number | null;
  vat_rate: number | null;
  total_incl_vat: number | null;
  avg_incl_vat: { vt: number | null; nt: number | null } | null;
  fixed_monthly_incl_vat: number | null;
  history: Array<{
    month: string;
    vt: number | null;
    nt: number | null;
    total: number | null;
    czk: number | null;
  }>;
}

export interface Invoice {
  id: string;
  uploaded_at: string;
  kind: 'pdf' | 'image';
  mime: string;
  size: number;
  status: 'draft' | 'confirmed';
  parser: 'cez_prodej' | 'generic';
  fields: InvoiceFields;
  confidence: Record<string, 'high' | 'low'>;
  missing: string[];
  warnings: string[];
}

export type TariffKey = 'vt' | 'nt' | 'fixed_monthly';

export interface InvoiceTariff {
  values: Record<TariffKey, number | null>;
  entities: Record<TariffKey, string | null>;
}

export interface InvoiceList {
  invoices: Invoice[];
  can_edit: boolean;
  tariff: InvoiceTariff;
}

export interface TariffCheck extends InvoiceTariff {
  items: Partial<Record<TariffKey, { invoice: number; current: number | null; differs: boolean }>>;
  mismatch: boolean;
}

export interface InvoiceComparison {
  invoice_id: string;
  status: 'ok' | 'no_period' | 'unconfigured' | 'unsupported';
  tariff: TariffCheck;
  grid?: {
    invoice: number | null;
    measured: number | null;
    diff: number | null;
    pct: number | null;
    status: 'ok' | 'diff' | 'missing';
    measured_since: string | null;
  };
  house?: number | null;
  pv?: number | null;
  export?: number | null;
  self_consumption?: { kwh: number; basis: 'house_minus_import' | 'house_minus_invoice' } | null;
  cost?: {
    invoice: number | null;
    estimate: number | null;
    diff: number | null;
    pct: number | null;
  };
}

export const UPLOAD_PATH = '/api/homebrain/energy/invoices';
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export async function fetchInvoices(connection: ConnectionLike | null | undefined) {
  if (!connection) return null;
  try {
    const list = await connection.sendMessagePromise<InvoiceList>({
      type: 'homebrain/energy/invoices/list',
    });
    return list && Array.isArray(list.invoices) ? list : null;
  } catch {
    return null; // not allowed (kiosk, child) or older backend: no card
  }
}

export async function fetchInvoiceComparison(connection: ConnectionLike, invoiceId: string) {
  return connection.sendMessagePromise<InvoiceComparison>({
    type: 'homebrain/energy/invoices/compare',
    invoice_id: invoiceId,
  } as { type: string });
}

export async function saveInvoice(
  connection: ConnectionLike,
  invoiceId: string,
  fields: InvoiceFields,
) {
  return connection.sendMessagePromise<Invoice>({
    type: 'homebrain/energy/invoices/save',
    invoice_id: invoiceId,
    fields,
  } as { type: string });
}

export async function deleteInvoice(connection: ConnectionLike, invoiceId: string) {
  return connection.sendMessagePromise<unknown>({
    type: 'homebrain/energy/invoices/delete',
    invoice_id: invoiceId,
  } as { type: string });
}

const UPLOAD_ERRORS: Record<string, string> = {
  too_large: 'Soubor je větší než 5 MB.',
  unsupported_type: 'Nahrajte PDF nebo fotku (JPG, PNG, HEIC, WebP).',
  unreadable_pdf: 'PDF se nepodařilo přečíst (zaheslované nebo poškozené).',
  too_many: 'Uloženo je už příliš mnoho faktur.',
};

/** Multipart upload through the HA-authenticated HTTP view; throws a Czech message. */
export async function uploadInvoice(fetchWithAuth: FetchWithAuth, file: File): Promise<Invoice> {
  if (file.size > MAX_UPLOAD_BYTES) throw new Error(UPLOAD_ERRORS.too_large);
  const body = new FormData();
  body.append('file', file, file.name);
  const resp = await fetchWithAuth(UPLOAD_PATH, { method: 'POST', body });
  if (resp.status === 201) return (await resp.json()) as Invoice;
  let code = '';
  try {
    code = String(((await resp.json()) as { message?: string }).message ?? '');
  } catch {
    /* plain-text error */
  }
  if (resp.status === 401 || resp.status === 403) throw new Error('Faktury nahrává jen správce.');
  throw new Error(UPLOAD_ERRORS[code] ?? 'Fakturu se nepodařilo nahrát.');
}

const NBSP = '\u00a0';
const nf = (digits: number) =>
  new Intl.NumberFormat('cs-CZ', { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** „2 989 Kč“ / „4,59 Kč“ (Czech grouping, NBSP before the unit). */
export function formatKc(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '–';
  return `${nf(digits).format(value)}${NBSP}Kč`;
}

export function formatKwh(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '–';
  return `${nf(Math.abs(value) < 100 && !Number.isInteger(value) ? 1 : 0).format(value)}${NBSP}kWh`;
}

/** „1. 11. 2026“ from an ISO date. */
export function formatDateCs(iso: string | null | undefined): string {
  if (!iso) return '–';
  const [y, m, d] = iso.split('-').map(Number);
  return `${d}.${NBSP}${m}.${NBSP}${y}`;
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

/** „Říjen 2026“ for a calendar-month period, else „1. 10. – 15. 11. 2026“. */
export function periodLabel(period: [string, string] | null | undefined): string {
  if (!period) return 'Období neznámé';
  const [a, b] = period;
  const [ya, ma, da] = a.split('-').map(Number) as [number, number, number];
  const [yb, mb, db] = b.split('-').map(Number) as [number, number, number];
  const last = new Date(Date.UTC(yb, mb, 0)).getUTCDate();
  if (ya === yb && ma === mb && da === 1 && db === last) {
    const name = MONTHS[ma - 1]!;
    return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${ya}`;
  }
  return `${da}.${NBSP}${ma}.${ya === yb ? '' : ` ${ya}`} – ${formatDateCs(b)}`;
}

/** Signed percent „+1,0 %“ / „−8 %“. */
export function formatPct(pct: number | null | undefined): string {
  if (pct === null || pct === undefined) return '';
  const sign = pct > 0 ? '+' : pct < 0 ? '\u2212' : '±';
  return `${sign}${nf(Math.abs(pct) < 10 ? 1 : 0).format(Math.abs(pct))}${NBSP}%`;
}

/**
 * Calm admin notice for the end of a fixed-price contract: shown from 30 days before the end
 * date until the day after it. `now` in ms, `end` ISO date (local wall clock).
 */
export function contractNotice(end: string | null | undefined, now: number): string | null {
  if (!end) return null;
  const [y, m, d] = end.split('-').map(Number) as [number, number, number];
  const endMs = new Date(y, m - 1, d, 23, 59, 59).getTime();
  const days = Math.ceil((endMs - now) / 86_400_000);
  if (days > 30 || days < -1) return null;
  if (days < 0) return `Pevná cena skončila ${formatDateCs(end)}. Zkontrolujte nový ceník.`;
  return `Pevná cena končí ${formatDateCs(end)}. Včas porovnejte nabídky.`;
}

/** The newest invoice (by period start) that carries a contract end date. */
export function latestContractEnd(invoices: Invoice[]): string | null {
  const sorted = [...invoices].sort((a, b) =>
    (b.fields.period?.[0] ?? '').localeCompare(a.fields.period?.[0] ?? ''),
  );
  return sorted.find((i) => i.fields.contract_end)?.fields.contract_end ?? null;
}

export interface ServiceCall {
  type: 'call_service';
  domain: 'input_number';
  service: 'set_value';
  service_data: { value: number };
  target: { entity_id: string };
}

/** `input_number.set_value` calls that make the HA tariff helpers equal the invoice. */
export function tariffUpdateCalls(check: TariffCheck): ServiceCall[] {
  const out: ServiceCall[] = [];
  for (const key of ['vt', 'nt', 'fixed_monthly'] as const) {
    const item = check.items[key];
    const entity = check.entities[key];
    if (!item?.differs || !entity || !entity.startsWith('input_number.')) continue;
    out.push({
      type: 'call_service',
      domain: 'input_number',
      service: 'set_value',
      service_data: { value: item.invoice },
      target: { entity_id: entity },
    });
  }
  return out;
}

export const TARIFF_LABELS: Record<TariffKey, { label: string; unit: string }> = {
  vt: { label: 'Vysoký tarif (VT)', unit: 'Kč/kWh' },
  nt: { label: 'Nízký tarif (NT)', unit: 'Kč/kWh' },
  fixed_monthly: { label: 'Stálé platby', unit: 'Kč/měs.' },
};

export interface InvoiceMonthMarker {
  kwh: number;
  czk: number | null;
}

/** Same month keys as {@link invoiceMonthMarkers}, with billed kWh and amount when known. */
export function invoiceMonthMarkerMap(invoices: Invoice[]): Record<string, InvoiceMonthMarker> {
  const out: Record<string, InvoiceMonthMarker> = {};
  for (const inv of invoices) {
    for (const row of inv.fields.history ?? []) {
      if (row.total !== null && !(row.month in out)) {
        out[row.month] = { kwh: row.total, czk: row.czk ?? null };
      }
    }
    const p = inv.fields.period;
    const total = inv.fields.kwh?.total;
    if (p && total !== null && total !== undefined && p[0].slice(0, 7) === p[1].slice(0, 7)) {
      out[p[0].slice(0, 7)] = { kwh: total, czk: inv.fields.total_incl_vat ?? null };
    }
  }
  return out;
}

/** Invoice history months (incl. the invoice itself) as `{ 'YYYY-MM': kWh }` chart markers. */
export function invoiceMonthMarkers(invoices: Invoice[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [month, marker] of Object.entries(invoiceMonthMarkerMap(invoices))) {
    out[month] = marker.kwh;
  }
  return out;
}

/** Percent difference of invoiced vs HA-measured (same basis as the active compare series). */
export function invoiceMarkerDiffPct(
  marker: InvoiceMonthMarker,
  measured: number | null,
  seriesKey: 'house' | 'import' | 'cost',
): number | null {
  if (measured === null || !Number.isFinite(measured) || Math.abs(measured) < 1e-9) return null;
  const invoice = seriesKey === 'cost' ? marker.czk : marker.kwh;
  if (invoice === null || !Number.isFinite(invoice)) return null;
  return ((invoice - measured) / Math.abs(measured)) * 100;
}

/** Absolute difference invoice − HA in the active series unit. */
export function invoiceMarkerDiffValue(
  marker: InvoiceMonthMarker,
  measured: number | null,
  seriesKey: 'house' | 'import' | 'cost',
): number | null {
  if (measured === null || !Number.isFinite(measured)) return null;
  const invoice = seriesKey === 'cost' ? marker.czk : marker.kwh;
  if (invoice === null || !Number.isFinite(invoice)) return null;
  return invoice - measured;
}

export type InvoiceMarkerDiffTone = 'muted' | 'warn' | 'warn-strong';

/** Colour band from |percent| gap (never “success” for a large discrepancy). */
export function invoiceMarkerDiffTone(
  pct: number | null | undefined,
): InvoiceMarkerDiffTone | undefined {
  if (pct === null || pct === undefined) return undefined;
  const a = Math.abs(pct);
  if (a <= 5) return 'muted';
  if (a <= 15) return 'warn';
  return 'warn-strong';
}

export function formatInvoiceMarkerDiffLine(
  marker: InvoiceMonthMarker,
  measured: number | null,
  seriesKey: 'house' | 'import' | 'cost',
): string | null {
  const pct = invoiceMarkerDiffPct(marker, measured, seriesKey);
  const diff = invoiceMarkerDiffValue(marker, measured, seriesKey);
  if (pct === null || diff === null) return null;
  const raw = seriesKey === 'cost' ? formatKc(diff) : formatKwh(diff);
  const value = raw.replace(/^-/, '\u2212');
  return `Rozdíl (faktura − HA): ${value} (${formatPct(pct)})`;
}

/** „Faktura za září 2026“ from a `YYYY-MM` key. */
export function invoiceMarkerMonthTitle(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number);
  const name = MONTHS[(m! - 1 + 12) % 12]!;
  return `Faktura za ${name} ${y}`;
}

export function formatInvoiceMarkerDetail(
  marker: InvoiceMonthMarker,
  measured: number | null,
  seriesKey: 'house' | 'import' | 'cost' | 'pv' | 'export',
  formatMeasured: (v: number) => string,
  monthKey?: string,
): string {
  const parts: string[] = [];
  if (monthKey) parts.push(invoiceMarkerMonthTitle(monthKey));
  parts.push(
    `Faktura: ${formatKwh(marker.kwh)}${marker.czk !== null ? `, ${formatKc(marker.czk)}` : ''}`,
  );
  if (measured !== null) {
    parts.push(`Naměřeno v HA: ${formatMeasured(measured)}`);
    if (seriesKey === 'house' || seriesKey === 'import' || seriesKey === 'cost') {
      const line = formatInvoiceMarkerDiffLine(marker, measured, seriesKey);
      if (line) parts.push(line);
    }
  }
  return parts.join(' · ');
}

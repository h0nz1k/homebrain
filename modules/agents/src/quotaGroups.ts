import type { Level, Quota } from './types.js';

/**
 * Provider rows for the quotas card (max 2 visible slots each).
 *
 * Marginal quotas collapse into one shared `details` under the rows:
 * - window type `kredit` (credit / API bonus),
 * - secondary model of the same provider (name is a longer prefix match, e.g. „Claude Fable“ → Claude),
 * - excess short windows when the provider already fills both slots with long/family windows.
 *
 * Low or exhausted quotas (warning/critical) are never collapsed — they promote into a visible slot.
 */
export type WindowKind = 'short' | 'long' | 'credit' | 'other';

export interface QuotaSlot {
  quota: Quota;
  /** Slot label: „5 h“, „týden“, „Claude/GPT týden“, „Included“, „minuty“. */
  label: string;
}

export interface ProviderRow {
  /** Provider display name (part before „ · “). */
  name: string;
  /** Grey subtitle (rest after „ · “), or null. */
  subtitle: string | null;
  /** Left = short/primary, right = long/secondary; null → „–“. */
  slots: [QuotaSlot | null, QuotaSlot | null];
  /** Provider key used for stable ordering / tests. */
  key: string;
}

export interface QuotaLayout {
  rows: ProviderRow[];
  /** Collapsed marginal quotas (global details line). */
  collapsed: QuotaSlot[];
}

const LEVEL_ORDER: Record<Level, number> = {
  critical: 0,
  warning: 1,
  ok: 2,
  unknown: 3,
};

const SHORT_RE = /^\d+\s*h$/i;
const LONG_DAY_RE = /^\d+\s*dn/i;

/** Split `provider` on first „ · “ → name + optional subtitle. */
export function splitProvider(provider: string | null | undefined): {
  name: string;
  subtitle: string | null;
} {
  const raw = (provider ?? '').trim();
  if (!raw) return { name: '—', subtitle: null };
  const i = raw.indexOf(' · ');
  if (i < 0) return { name: raw, subtitle: null };
  const name = raw.slice(0, i).trim() || '—';
  const subtitle = raw.slice(i + 3).trim() || null;
  return { name, subtitle };
}

export function windowKind(q: Quota): WindowKind {
  const label = (q.window_label ?? '').trim().toLowerCase();
  const raw = (q.window ?? '').trim().toLowerCase();
  // Named product windows stay visible (Included / API / minuty).
  if (raw === 'api' || raw === 'included' || raw === 'actions min' || raw === 'minuty')
    return 'other';
  // Pure credit/bonus pools (Vertex …) collapse unless urgent.
  if (
    label === 'kredit' ||
    raw === 'credit' ||
    raw === 'credits' ||
    raw === 'bonus' ||
    raw === 'gcp bonus'
  )
    return 'credit';
  if (SHORT_RE.test(label) || label === 'den') return 'short';
  if (label === 'týden' || label === 'měsíc' || LONG_DAY_RE.test(label)) return 'long';
  return 'other';
}

/** True when remaining is low / exhausted (must stay visible). */
export function isQuotaUrgent(q: Quota): boolean {
  return q.level === 'critical' || q.level === 'warning';
}

/**
 * Human slot label. Keeps a descriptive prefix from raw `okno` (e.g. „Claude/GPT week“ →
 * „Claude/GPT týden“). Special raw names (Included, API, actions min) stay as-is / „minuty“.
 */
export function slotLabel(q: Quota): string {
  const raw = (q.window ?? '').trim();
  const low = raw.toLowerCase();
  if (low === 'included') return 'Included';
  if (low === 'api') return 'API';
  if (low === 'actions min' || low === 'minuty') return 'minuty';
  const wl = q.window_label?.trim();
  if (!raw) return wl || q.id;
  // Strip a trailing window token and keep the family/prefix when present —
  // but drop a prefix that only repeats the provider name („Claude week“ → „týden“).
  const stripped = raw.replace(
    /\s+(?:week|weekly|týden|month|monthly|měsíc|day|daily|den|\d+\s*h|\d+\s*d)$/i,
    '',
  );
  if (stripped && stripped.toLowerCase() !== low && wl) {
    const { name } = splitProvider(q.provider);
    if (stripped.toLowerCase() === name.toLowerCase()) return wl;
    return `${stripped} ${wl}`;
  }
  return wl || raw;
}

function collapsedSummaryLabel(slot: QuotaSlot): string {
  const { name } = splitProvider(slot.quota.provider);
  const pct = slot.quota.remaining_pct == null ? '' : ` ${Math.round(slot.quota.remaining_pct)} %`;
  // „Claude Fable týden 47 %“, „Vertex AI kredit 63 %“
  if (slot.label.toLowerCase() === 'kredit' || windowKind(slot.quota) === 'credit')
    return `${name} kredit${pct}`.trim();
  if (slot.label.includes(name)) return `${slot.label}${pct}`.trim();
  return `${name} ${slot.label}${pct}`.trim();
}

/** Summary text for the shared details row. */
export function collapsedSummary(collapsed: QuotaSlot[]): string {
  return collapsed.map(collapsedSummaryLabel).join(', ');
}

/** Primary grouping key: exact provider name, then absorb secondary models (prefix). */
function familyKey(name: string): string {
  return name.trim();
}

/**
 * Absorb „Claude Fable“ into „Claude“ when a shorter provider name is a prefix
 * (same first word / leading name + space).
 */
function resolveFamily(
  name: string,
  primaryNames: string[],
): { family: string; secondary: boolean } {
  const sorted = [...primaryNames].sort((a, b) => a.length - b.length);
  for (const p of sorted) {
    if (p === name) return { family: p, secondary: false };
    if (name.startsWith(`${p} `) || name.startsWith(`${p}·`)) return { family: p, secondary: true };
  }
  return { family: name, secondary: false };
}

interface Bucket {
  name: string;
  subtitle: string | null;
  primary: QuotaSlot[];
  secondary: QuotaSlot[];
}

function ensureBucket(map: Map<string, Bucket>, name: string, subtitle: string | null): Bucket {
  let b = map.get(name);
  if (!b) {
    b = { name, subtitle, primary: [], secondary: [] };
    map.set(name, b);
  } else if (!b.subtitle && subtitle) {
    b.subtitle = subtitle;
  }
  return b;
}

function pickSlots(candidates: QuotaSlot[]): {
  slots: [QuotaSlot | null, QuotaSlot | null];
  rest: QuotaSlot[];
} {
  if (!candidates.length) return { slots: [null, null], rest: [] };
  const urgent = candidates.filter((s) => isQuotaUrgent(s.quota));
  const restPool = candidates.filter((s) => !isQuotaUrgent(s.quota));

  const shorts = candidates.filter((s) => windowKind(s.quota) === 'short');
  const longs = candidates.filter((s) => windowKind(s.quota) === 'long');
  const credits = candidates.filter((s) => windowKind(s.quota) === 'credit');
  const others = candidates.filter((s) => windowKind(s.quota) === 'other');

  // Multi-family: several long windows → show longs (family labels), collapse shorts/credits.
  if (longs.length >= 2 && shorts.length > 0) {
    const chosen: QuotaSlot[] = [];
    // Urgent first, then remaining longs by remaining_pct ascending.
    const longSorted = [...longs].sort(
      (a, b) =>
        LEVEL_ORDER[a.quota.level] - LEVEL_ORDER[b.quota.level] ||
        (a.quota.remaining_pct ?? 101) - (b.quota.remaining_pct ?? 101) ||
        a.quota.id.localeCompare(b.quota.id),
    );
    for (const s of longSorted) {
      if (chosen.length >= 2) break;
      chosen.push(s);
    }
    // Promote any urgent that didn't fit (rare: >2 urgent).
    for (const s of urgent) {
      if (chosen.length >= 2) break;
      if (!chosen.includes(s)) chosen.push(s);
    }
    const used = new Set(chosen);
    return {
      slots: [chosen[0] ?? null, chosen[1] ?? null],
      rest: candidates.filter((s) => !used.has(s)),
    };
  }

  // Default: short left, long/other right; credits stay marginal unless urgent / only option.
  const left =
    shorts.find((s) => isQuotaUrgent(s.quota)) ??
    shorts[0] ??
    urgent.find((s) => windowKind(s.quota) !== 'credit') ??
    others.find((s) => isQuotaUrgent(s.quota)) ??
    others[0] ??
    (urgent[0] && windowKind(urgent[0].quota) === 'credit' ? urgent[0] : null) ??
    null;

  const used = new Set<QuotaSlot>();
  if (left) used.add(left);

  const rightCandidates = [
    ...longs,
    ...others.filter((s) => s !== left),
    ...urgent.filter((s) => s !== left),
    ...credits.filter((s) => isQuotaUrgent(s.quota) && s !== left),
  ];
  let right: QuotaSlot | null = null;
  for (const s of rightCandidates) {
    if (used.has(s)) continue;
    right = s;
    used.add(s);
    break;
  }
  // Single-quota provider: leave right empty („–“).
  // If only credit and it's urgent, it already sits in left.

  // Prefer classic short|long order when we somehow picked long first.
  let slots: [QuotaSlot | null, QuotaSlot | null] = [left, right];
  if (left && right && windowKind(left.quota) === 'long' && windowKind(right.quota) === 'short') {
    slots = [right, left];
  }
  // Included | API (proposal): plan window left of API credit-like product.
  if (slots[0] && slots[1]) {
    const w0 = (slots[0].quota.window ?? '').toLowerCase();
    const w1 = (slots[1].quota.window ?? '').toLowerCase();
    if (w0 === 'api' && w1 === 'included') slots = [slots[1], slots[0]];
  }

  // Anything not used → collapsed (credits preferred for collapse).
  const rest = candidates.filter((s) => !used.has(s));
  // Non-urgent credits always collapse when something else is visible.
  void restPool;
  return { slots, rest };
}

/**
 * Group quotas into provider rows (≤2 slots) + a shared collapsed list.
 * Deterministic: same input → same layout.
 */
export function groupQuotas(quotas: Quota[]): QuotaLayout {
  if (!quotas.length) return { rows: [], collapsed: [] };

  const names = [...new Set(quotas.map((q) => splitProvider(q.provider).name))];
  const buckets = new Map<string, Bucket>();

  for (const q of quotas) {
    const { name, subtitle } = splitProvider(q.provider);
    const { family, secondary } = resolveFamily(name, names);
    const bucketName = familyKey(family);
    // Prefer subtitle from the primary (shorter) provider name.
    const bucket = ensureBucket(buckets, bucketName, secondary ? null : subtitle);
    if (secondary && !bucket.subtitle) {
      // keep existing
    } else if (!secondary && subtitle) {
      bucket.subtitle = subtitle;
    }
    const slot: QuotaSlot = { quota: q, label: slotLabel(q) };
    if (secondary) bucket.secondary.push(slot);
    else bucket.primary.push(slot);
  }

  const rows: ProviderRow[] = [];
  const collapsed: QuotaSlot[] = [];

  for (const bucket of buckets.values()) {
    // Secondary models collapse unless urgent — then they join the pick pool.
    const secondaryVisible = bucket.secondary.filter((s) => isQuotaUrgent(s.quota));
    const secondaryCollapsed = bucket.secondary.filter((s) => !isQuotaUrgent(s.quota));
    const pool = [...bucket.primary, ...secondaryVisible];
    const { slots, rest } = pickSlots(pool);
    collapsed.push(...rest, ...secondaryCollapsed);

    // Skip empty provider rows (everything collapsed, e.g. only Vertex credit).
    if (!slots[0] && !slots[1]) {
      // All went to collapsed — still fine (no row).
      continue;
    }
    rows.push({
      name: bucket.name,
      subtitle: bucket.subtitle,
      slots,
      key: bucket.name,
    });
  }

  // Stable row order: worst visible level first, then name.
  rows.sort((a, b) => {
    const la = Math.min(
      ...[a.slots[0], a.slots[1]].filter(Boolean).map((s) => LEVEL_ORDER[s!.quota.level]),
      LEVEL_ORDER.ok,
    );
    const lb = Math.min(
      ...[b.slots[0], b.slots[1]].filter(Boolean).map((s) => LEVEL_ORDER[s!.quota.level]),
      LEVEL_ORDER.ok,
    );
    return la - lb || a.name.localeCompare(b.name, 'cs');
  });

  collapsed.sort(
    (a, b) =>
      LEVEL_ORDER[a.quota.level] - LEVEL_ORDER[b.quota.level] ||
      a.quota.id.localeCompare(b.quota.id),
  );

  return { rows, collapsed };
}

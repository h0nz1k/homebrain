import { czCount } from '@homebrain/ui';
import { fmtPct, renewalLabel, type BarTone, levelTone } from './format.js';
import type { AgentsSnapshot, Level, Quota, Reason, Service } from './types.js';

/**
 * One „K řešení“ row. Built once per problem (deduped); empty list → card hidden.
 *
 * Sources: exhausted / forecast quotas (+ exhaust_forecast), queue.blocked, stale data,
 * agents not running/waiting, services down/degraded.
 * Mere „low %“ quotas and operational-but-SLA&lt;99 services stay on their own cards
 * (values only) — avoids duplicating every tint into this list (matches UX proposal).
 * Never invent fields the sensors do not provide (no job IDs, no ETA unless in data).
 */
export interface TodoItem {
  id: string;
  /** Urgency tag label („vyčerpáno“, „dojde před obnovou“, …). */
  tag: string;
  tone: BarTone;
  level: Level;
  title: string;
  /** Second line: timing + next step. */
  detail: string;
  /** Sort key: sooner renewal / event first within the same level. */
  at: number | null;
}

const LEVEL_ORDER: Record<Level, number> = {
  critical: 0,
  warning: 1,
  ok: 2,
  unknown: 3,
};

function quotaTitle(q: Quota): string {
  // Prefer a compact label: provider name + window/family (not the full „ · “ subtitle chain).
  const name = q.provider?.split(' · ')[0]?.trim() || q.id;
  const raw = (q.window ?? '').trim();
  const family = raw
    .replace(/\s+(?:week|weekly|týden|month|monthly|měsíc|day|daily|den|\d+\s*h|\d+\s*d)$/i, '')
    .trim();
  const win = q.window_label?.trim();
  if (family && family.toLowerCase() !== name.toLowerCase() && win)
    return `${name} ${family} – ${win}`;
  if (win) return `${name} – ${win}`;
  return name;
}

function quotaTag(q: Quota): string {
  if (q.exhausted || (q.remaining_pct != null && q.remaining_pct < 10)) return 'vyčerpáno';
  if (q.exhaust_before_reset) return 'dojde před obnovou';
  if (q.remaining_pct != null && q.remaining_pct < 25) return 'málo zbývá';
  return 'kvóta';
}

function quotaDetail(q: Quota, now: number): string {
  const bits: string[] = [];
  if (q.remaining_pct != null && !q.exhausted) bits.push(`zbývá ${fmtPct(q.remaining_pct)}`);
  const renew = renewalLabel(q.reset_at, now);
  if (renew) bits.push(`obnova ${renew}`);
  return bits.join(' · ') || 'viz kvóty';
}

function serviceTag(s: Service): string {
  if (!s.up || s.state === 'down') return 'výpadek';
  if (s.state === 'degraded') return 'omezený provoz';
  return 'SLA';
}

function serviceDetail(s: Service): string {
  if (s.sla_24h != null)
    return `SLA 24 h ${s.sla_24h.toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} %`;
  return s.state === 'down' ? 'služba nedostupná' : 'viz služby';
}

/** Dedup key for a quota problem (exhausted + forecast of same quota → one). */
function quotaKey(label: string): string {
  return `quota:${label.toLowerCase()}`;
}

/**
 * Build sorted „K řešení“ items. Critical before warning; within a level, sooner `at` first.
 */
export function buildTodoItems(snap: AgentsSnapshot, now = Date.now()): TodoItem[] {
  const items: TodoItem[] = [];
  const seen = new Set<string>();

  const push = (item: TodoItem) => {
    if (seen.has(item.id)) return;
    seen.add(item.id);
    items.push(item);
  };

  // Quotas: only exhausted / will-exhaust-before-reset (not mere low %).
  for (const q of snap.quotas) {
    if (!q.exhausted && !q.exhaust_before_reset) continue;
    if (q.level !== 'critical' && q.level !== 'warning') continue;
    const title = quotaTitle(q);
    const shortName = q.provider?.split(' · ')[0] ?? title;
    push({
      id: quotaKey(title),
      tag: quotaTag(q),
      tone: levelTone(q.level),
      level: q.level,
      title: q.exhausted
        ? title
        : q.exhaust_before_reset
          ? `${shortName} dojde před obnovou`
          : title,
      detail: quotaDetail(q, now),
      at: q.reset_at ? Date.parse(q.reset_at) : null,
    });
  }

  // exhaust_forecast labels not already covered by an exhausted/forecast quota.
  if (snap.exhaust_forecast.active && snap.exhaust_forecast.items.length) {
    for (const label of snap.exhaust_forecast.items) {
      const id = quotaKey(label);
      if (seen.has(id)) continue;
      const labelName = label.split(' · ')[0]?.trim().toLowerCase() ?? '';
      const already = [...seen].some((s) => s.startsWith('quota:') && s.includes(labelName));
      const match = snap.quotas.find((q) => {
        const name = (q.provider?.split(' · ')[0] ?? '').toLowerCase();
        const t = quotaTitle(q).toLowerCase();
        return (
          t === label.toLowerCase() ||
          name === labelName ||
          label.toLowerCase().startsWith(name) ||
          t.startsWith(labelName)
        );
      });
      if (already || (match && (match.exhausted || match.exhaust_before_reset))) {
        seen.add(id);
        continue;
      }
      push({
        id,
        tag: 'dojde před obnovou',
        tone: 'warn',
        level: 'warning',
        title: `${labelName || label} dojde před obnovou`,
        detail: match ? quotaDetail(match, now) : 'viz kvóty',
        at: match?.reset_at ? Date.parse(match.reset_at) : null,
      });
    }
  }

  // Services: down / degraded only (SLA tint lives on the Služby card).
  for (const s of snap.services) {
    const down = !s.up || s.state === 'down';
    const degraded = s.state === 'degraded';
    if (!down && !degraded) continue;
    if (s.level !== 'critical' && s.level !== 'warning') continue;
    push({
      id: `service:${s.id}`,
      tag: serviceTag(s),
      tone: levelTone(s.level),
      level: s.level,
      title: s.name,
      detail: serviceDetail(s),
      at: null,
    });
  }

  // Stale data.
  if (snap.data.current === false) {
    push({
      id: 'data:stale',
      tag: 'data neaktuální',
      tone: 'warn',
      level: 'warning',
      title: 'Data z monitoringu nejsou aktuální',
      detail: snap.data.since
        ? `poslední změna ${renewalLabel(snap.data.since, now) ?? 'neznámá'}`
        : 'ověřit AgentsMonitoring',
      at: snap.data.since ? Date.parse(snap.data.since) : null,
    });
  }

  // Agents not running / waiting.
  if (snap.agents.available) {
    for (const a of snap.agents.items) {
      if (!a.alive) {
        push({
          id: `agent:stopped:${a.name}`,
          tag: 'neběží',
          tone: 'warn',
          level: 'warning',
          title: `Agent ${a.name} neběží`,
          detail: a.model ? `model ${a.model}` : 'ověřit v AgentsMonitoringu',
          at: null,
        });
      } else if (a.waiting) {
        push({
          id: `agent:waiting:${a.name}`,
          tag: 'čeká',
          tone: 'warn',
          level: 'warning',
          title: `Agent ${a.name} čeká`,
          detail: a.model ? `model ${a.model}` : 'čeká na kapacitu nebo rozhodnutí',
          at: null,
        });
      }
    }
  }

  // Queue blocked.
  if (snap.queue.available && snap.queue.blocked && snap.queue.blocked > 0) {
    push({
      id: 'queue:blocked',
      tag: 'blokováno',
      tone: 'warn',
      level: 'warning',
      title: 'Fronta: blokované úlohy',
      detail: `${czCount(snap.queue.blocked, 'úloha blokovaná', 'úlohy blokované', 'úloh blokovaných')} · rozhodnutí v AgentsMonitoringu`,
      at: null,
    });
  }

  // Soft-include status-only reasons that have no item counterpart (rare).
  for (const r of snap.verdict.reasons) {
    if (r.kind !== 'status') continue;
    push({
      id: `status:${r.level}`,
      tag: r.level === 'critical' ? 'kritické' : 'upozornění',
      tone: levelTone(r.level),
      level: r.level,
      title:
        r.level === 'critical' ? 'Monitoring hlásí kritický stav' : 'Monitoring hlásí upozornění',
      detail: 'podrobnosti v AgentsMonitoringu',
      at: null,
    });
  }

  items.sort(
    (a, b) =>
      LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] ||
      (a.at ?? Number.POSITIVE_INFINITY) - (b.at ?? Number.POSITIVE_INFINITY) ||
      a.title.localeCompare(b.title, 'cs'),
  );
  return items;
}

/** Map a legacy Reason into a short tag (tests / fallback). */
export function reasonTag(r: Reason): string {
  if (r.kind === 'quota') {
    if (r.detail === 'exhausted') return 'vyčerpáno';
    if (r.detail === 'forecast') return 'dojde před obnovou';
    return 'málo zbývá';
  }
  if (r.kind === 'service') return r.detail === 'down' ? 'výpadek' : 'SLA';
  if (r.kind === 'data') return 'data neaktuální';
  return r.level === 'critical' ? 'kritické' : 'upozornění';
}

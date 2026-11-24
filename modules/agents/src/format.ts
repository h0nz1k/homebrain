import { czCount, czPlural, type Tone } from '@homebrain/ui';
import type { AgentsSnapshot, Agent, Level, Reason, Service } from './types.js';

export const NB = ' ';
export const TZ = 'Europe/Prague';
export type BarTone = 'ok' | 'warn' | 'crit' | 'neutral';

/** Section anchors for „Co s tím“ (scroll + focus the evidence). */
export const AGENTS_ANCHORS = {
  quotas: 'agents-quotas',
  services: 'agents-services',
  footer: 'agents-footer',
} as const;

export const levelTone = (level: Level): BarTone =>
  level === 'critical' ? 'crit' : level === 'warning' ? 'warn' : level === 'ok' ? 'ok' : 'neutral';

const num = (v: number, digits: number) =>
  v.toLocaleString('cs-CZ', { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** Whole percent; one decimal below 10 % (5,5 % is not 6 %). */
export function fmtPct(v: number | null | undefined): string {
  if (v == null) return '–';
  const tenth = Math.round(v * 10) / 10;
  return v < 10 && !Number.isInteger(tenth)
    ? `${num(tenth, 1)}${NB}%`
    : `${num(Math.round(v), 0)}${NB}%`;
}
/** SLA keeps one decimal (99,9 % ≠ 100 %). */
export function fmtSla(v: number | null | undefined): string {
  if (v == null) return '–';
  const floored = Math.floor(v * 10) / 10;
  return `${num(floored, Number.isInteger(floored) ? 0 : 1)}${NB}%`;
}

const dayFmt = new Intl.DateTimeFormat('cs-CZ', { timeZone: TZ, weekday: 'short' });
const timeFmt = new Intl.DateTimeFormat('cs-CZ', {
  timeZone: TZ,
  hour: 'numeric',
  minute: '2-digit',
});
const dateFmt = new Intl.DateTimeFormat('cs-CZ', {
  timeZone: TZ,
  day: 'numeric',
  month: 'numeric',
});
const pragueDay = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** „13:57“ in Europe/Prague. */
export const fmtTime = (d: Date) => timeFmt.format(d);
const sameDay = (a: Date, b: Date) => pragueDay.format(a) === pragueDay.format(b);
/** „24. 11.“ (Intl gives „24. 11.“ with regular spaces). */
const fmtDate = (d: Date) => dateFmt.format(d);

/** „3 h 12 min“, „45 min“, „2 dny 4 h“ (rounded up to whole minutes). */
export function durationLabel(ms: number): string {
  const mins = Math.max(1, Math.ceil(ms / 60_000));
  const days = Math.floor(mins / 1440);
  const hours = Math.floor((mins % 1440) / 60);
  const rest = mins % 60;
  if (days > 0)
    return hours
      ? `${days}${NB}${czPlural(days, 'den', 'dny', 'dní')} ${hours}${NB}h`
      : `${days}${NB}${czPlural(days, 'den', 'dny', 'dní')}`;
  if (hours > 0) return rest ? `${hours}${NB}h ${rest}${NB}min` : `${hours}${NB}h`;
  return `${rest}${NB}min`;
}

/** „reset za 3 h 12 min · út 13:57“ (Europe/Prague); a week+ away adds the date. */
export function resetLabel(resetAt: string | null | undefined, now = Date.now()): string | null {
  if (!resetAt) return null;
  const at = Date.parse(resetAt);
  if (!Number.isFinite(at)) return null;
  if (at <= now) return 'reset právě probíhá';
  const d = new Date(at);
  const when =
    at - now >= 6 * 86_400_000
      ? `${dayFmt.format(d)} ${fmtDate(d)} ${fmtTime(d)}`
      : `${dayFmt.format(d)} ${fmtTime(d)}`;
  return `reset za ${durationLabel(at - now)} · ${when}`;
}

/** „dnes 8:15“ → „8:15“, otherwise „23. 11. 8:15“ (Europe/Prague). */
export function whenLabel(iso: string | null | undefined, now = Date.now()): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const d = new Date(t);
  return sameDay(d, new Date(now)) ? fmtTime(d) : `${fmtDate(d)} ${fmtTime(d)}`;
}

/** Footer/hero data age: „Data aktuální · 9:40“, „Data neaktuální od 8:15“. */
export function dataAgeLabel(data: AgentsSnapshot['data'], now = Date.now()): string {
  const at = whenLabel(data.since, now);
  if (data.current === true) return at ? `Data aktuální · ${at}` : 'Data aktuální';
  if (data.current === false) return at ? `Data neaktuální od ${at}` : 'Data neaktuální';
  return 'Stáří dat neznámé';
}

export function reasonText(r: Reason): string {
  switch (r.kind) {
    case 'service':
      return r.detail === 'down'
        ? `${r.label}: výpadek`
        : typeof r.value === 'number'
          ? `${r.label}: SLA ${fmtSla(r.value)}`
          : `${r.label}: omezený provoz`;
    case 'quota':
      if (r.detail === 'exhausted') return `${r.label}: vyčerpáno`;
      if (r.detail === 'forecast') return `${r.label}: dojde před resetem`;
      return `${r.label}: zbývá ${fmtPct(typeof r.value === 'number' ? r.value : null)}`;
    case 'data':
      return 'Data nejsou aktuální';
    case 'status':
      return r.level === 'critical'
        ? 'Monitoring hlásí kritický stav'
        : 'Monitoring hlásí upozornění';
  }
}

const reasonTarget: Record<Reason['kind'], string> = {
  service: AGENTS_ANCHORS.services,
  quota: AGENTS_ANCHORS.quotas,
  data: AGENTS_ANCHORS.footer,
  status: AGENTS_ANCHORS.footer,
};

export interface HeroModel {
  tone: BarTone;
  badge: string;
  headline: string;
  more: string[];
  target?: string;
}

export function heroModel(snap: AgentsSnapshot): HeroModel {
  const badge = snap.data.current === false ? 'Neaktuální' : snap.data.current ? 'Živě' : 'Bez dat';
  const level = snap.verdict.level;
  const tone = levelTone(level);
  const [top, ...rest] = snap.verdict.reasons;
  // Overall tone/headline follow the monitoring verdict, not the worst item.
  if (level === 'ok')
    return {
      tone: 'ok',
      badge,
      headline: 'V pořádku',
      more: snap.verdict.reasons.map(reasonText),
      target: top ? reasonTarget[top.kind] : undefined,
    };
  if (level === 'unknown')
    return { tone: 'neutral', badge: 'Bez dat', headline: 'Stav agentů není známý', more: [] };
  const prefix = level === 'critical' ? 'Kritické' : 'Pozor';
  if (!top) return { tone, badge, headline: prefix, more: [] };
  return {
    tone,
    badge,
    headline: `${prefix}: ${reasonText(top)}`,
    more: rest.map(reasonText),
    target: reasonTarget[top.kind],
  };
}

/** Counts that match the visible Agents list (items); sensor aggregates only as fallback. */
export function agentsListCounts(snap: AgentsSnapshot): {
  running: number | null;
  waiting: number | null;
  total: number | null;
} {
  const a = snap.agents;
  if (!a.available) return { running: null, waiting: null, total: null };
  if (a.items.length) {
    const running = a.items.filter((x) => x.alive && !x.waiting).length;
    const waiting = a.items.filter((x) => x.alive && x.waiting).length;
    return { running, waiting, total: a.items.length };
  }
  if (a.active == null) return { running: null, waiting: a.waiting, total: a.total };
  // Sensor `active` includes waiting agents; subtract when both are known.
  const waiting = a.waiting ?? 0;
  return {
    running: Math.max(0, a.active - waiting),
    waiting: a.waiting,
    total: a.total,
  };
}

/** Hero meta: „2 z 4 agentů běží · 1 čeká · 7 kvót · 3 služby“. */
export function heroMeta(snap: AgentsSnapshot): string[] {
  const out: string[] = [];
  const { running, waiting, total } = agentsListCounts(snap);
  if (running != null)
    out.push(
      total != null
        ? `${running} z ${czCount(total, 'agenta', 'agentů', 'agentů')} běží`
        : `${czCount(running, 'agent běží', 'agenti běží', 'agentů běží')}`,
    );
  if (waiting) out.push(`${waiting} čeká`);
  if (snap.quotas.length) out.push(czCount(snap.quotas.length, 'kvóta', 'kvóty', 'kvót'));
  if (snap.services.length) out.push(czCount(snap.services.length, 'služba', 'služby', 'služeb'));
  return out;
}

export type AgentState = 'running' | 'waiting' | 'stopped';
export const agentState = (a: Agent): AgentState =>
  !a.alive ? 'stopped' : a.waiting ? 'waiting' : 'running';
export const AGENT_STATE: Record<AgentState, { label: string; tone: Tone }> = {
  running: { label: 'Běží', tone: 'ok' },
  waiting: { label: 'Čeká', tone: 'warn' },
  stopped: { label: 'Neběží', tone: 'neutral' },
};

/** Running first, then waiting, stopped last; by name within a group. */
export function sortAgents(items: Agent[]): Agent[] {
  const order: Record<AgentState, number> = { waiting: 0, running: 1, stopped: 2 };
  return [...items].sort(
    (a, b) => order[agentState(a)] - order[agentState(b)] || a.name.localeCompare(b.name, 'cs'),
  );
}

export function serviceStateLabel(s: Service): string {
  if (!s.available || s.up == null) return 'nedostupné';
  if (!s.up || s.state === 'down') return 'Výpadek';
  if (s.state === 'degraded') return 'Omezený provoz';
  return 'V provozu';
}

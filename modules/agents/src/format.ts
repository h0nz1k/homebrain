import { czCount, czPlural, type Tone } from '@homebrain/ui';
import type { AgentsSnapshot, Agent, Level, Reason, Service } from './types.js';

export const NB = ' ';
export const TZ = 'Europe/Prague';
export type BarTone = 'ok' | 'warn' | 'crit' | 'neutral';

export const AGENTS_ANCHORS = {
  todos: 'agents-todos',
  quotas: 'agents-quotas',
  services: 'agents-services',
  agents: 'agents-agents',
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

function pragueParts(d: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '0';
  return {
    y: Number(get('year')),
    m: Number(get('month')),
    d: Number(get('day')),
    h: Number(get('hour')),
    min: Number(get('minute')),
  };
}

function dayOffset(from: Date, to: Date): number {
  const a = pragueParts(from);
  const b = pragueParts(to);
  const utcA = Date.UTC(a.y, a.m - 1, a.d);
  const utcB = Date.UTC(b.y, b.m - 1, b.d);
  return Math.round((utcB - utcA) / 86_400_000);
}

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

/**
 * Human renewal time in Europe/Prague:
 * „dnes 20:59“, „zítra 6:09“, „čt 26. 11. 17:03“, „1. 12.“.
 */
export function renewalLabel(resetAt: string | null | undefined, now = Date.now()): string | null {
  if (!resetAt) return null;
  const at = Date.parse(resetAt);
  if (!Number.isFinite(at)) return null;
  const d = new Date(at);
  const n = new Date(now);
  const offset = dayOffset(n, d);
  if (offset === 0) return `dnes ${fmtTime(d)}`;
  if (offset === 1) return `zítra ${fmtTime(d)}`;
  if (offset > 1 && offset < 7) return `${dayFmt.format(d)} ${fmtDate(d)} ${fmtTime(d)}`;
  // Further out: date only when midnight-ish, else include time.
  const p = pragueParts(d);
  if (p.h === 0 && p.min === 0) return fmtDate(d);
  if (offset >= 7) return fmtDate(d);
  return `${fmtDate(d)} ${fmtTime(d)}`;
}

/** Legacy countdown label (kept for tests that still assert it). */
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

/** Relative past for „K řešení“: „před 5 min“, „dnes 11:34“, „23. 11. 8:15“. */
export function formatRelTime(iso: string | null | undefined, now = Date.now()): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const ago = now - t;
  if (ago >= 0 && ago < 60 * 60_000) return `před ${durationLabel(ago || 1)}`;
  const d = new Date(t);
  if (sameDay(d, new Date(now))) return `dnes ${fmtTime(d)}`;
  return whenLabel(iso, now);
}

/** Relative age for the hero subline: „data před 1 min“. */
export function dataAgeShort(since: string | null | undefined, now = Date.now()): string | null {
  if (!since) return null;
  const t = Date.parse(since);
  if (!Number.isFinite(t)) return null;
  const ago = Math.max(0, now - t);
  return `data před ${durationLabel(ago || 1)}`;
}

/** Footer: „Aktualizováno 11:52“. */
export function updatedLabel(iso: string | null | undefined, now = Date.now()): string {
  const at = whenLabel(iso, now);
  return at ? `Aktualizováno ${at}` : 'Aktualizováno –';
}

/** Footer/hero data age (legacy wording, used where needed). */
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

export interface HeroModel {
  tone: BarTone;
  headline: string;
  /** Single grey subline (counts + queue + data age). */
  subline: string;
  /** Stale data → amber hint on the age fragment (not red). */
  stale: boolean;
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
  const waiting = a.waiting ?? 0;
  return {
    running: Math.max(0, a.active - waiting),
    waiting: a.waiting,
    total: a.total,
  };
}

function servicesUp(snap: AgentsSnapshot): number {
  return snap.services.filter((s) => s.available && s.up && s.state !== 'down').length;
}

/**
 * Hero: one sentence from the monitoring sensor state (+ todo count).
 * No reason lists / pills — those live only in „K řešení“.
 * `todoCount` = length of buildTodoItems() so the headline matches the card.
 */
export function heroModel(snap: AgentsSnapshot, now = Date.now(), todoCount = 0): HeroModel {
  const level = snap.verdict.level;
  const tone = levelTone(level);
  const things =
    todoCount > 0 ? czCount(todoCount, 'věc k řešení', 'věci k řešení', 'věcí k řešení') : null;

  const stale = snap.data.current === false;
  let headline: string;
  // Stale data must never read as a green „Vše v pořádku“ (contradicts K řešení).
  if (level === 'ok' && stale) headline = 'Data nejsou aktuální';
  else if (level === 'ok') headline = 'Vše v pořádku';
  else if (level === 'unknown') headline = 'Stav agentů není známý';
  else if (level === 'critical') headline = things ? `Kritické · ${things}` : 'Kritické';
  else headline = things ? `Běží vše · ${things}` : 'Běží vše';

  const bits: string[] = [];
  const { running } = agentsListCounts(snap);
  const svc = servicesUp(snap);
  if (running != null && snap.agents.available) {
    bits.push(
      `${czCount(running, 'agent', 'agenti', 'agentů')} a ${czCount(svc, 'služba', 'služby', 'služeb')} v provozu`,
    );
  } else if (snap.services.length) {
    bits.push(`${czCount(svc, 'služba', 'služby', 'služeb')} v provozu`);
  }
  if (snap.queue.available) {
    const run = snap.queue.running ?? 0;
    const pend = snap.queue.pending ?? 0;
    bits.push(`fronta ${run}${NB}běží, ${pend}${NB}čeká`);
  }
  const age = dataAgeShort(snap.data.since ?? snap.updated_at ?? null, now);
  if (age) bits.push(age);

  return {
    tone: level === 'unknown' ? 'neutral' : level === 'ok' && stale ? 'warn' : tone,
    headline,
    subline: bits.join(' · '),
    stale,
  };
}

/** @deprecated Prefer heroModel().subline — kept for transitional tests. */
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

/** Service is under ideal when SLA &lt; 99 % or state ≠ operational. */
export function serviceUnderIdeal(s: Service): boolean {
  if (!s.available || s.up == null) return true;
  if (!s.up || s.state === 'down' || s.state === 'degraded') return true;
  if (s.state && s.state !== 'operational') return true;
  if (s.sla_24h != null && s.sla_24h < 99) return true;
  return false;
}

export function agentsHaveProblem(snap: AgentsSnapshot): boolean {
  if (!snap.agents.available) return false;
  return snap.agents.items.some((a) => !a.alive || a.waiting);
}

/** Auto-expand Služby only for down/degraded — SLA tint alone stays collapsed-friendly. */
export function servicesHaveProblem(snap: AgentsSnapshot): boolean {
  return snap.services.some(
    (s) =>
      !s.available ||
      s.up === false ||
      s.state === 'down' ||
      s.state === 'degraded' ||
      s.level === 'critical',
  );
}

import type { AgentsApi } from './api.js';
import type { AgentsSnapshot, Level, Quota, Reason, Service } from './types.js';

/** Synthetic agent monitoring (no real agents, models, services or URLs). */
export type AgentsScenario = 'ok' | 'warn' | 'crit' | 'unconfigured' | 'unavailable';
export const AGENTS_SCENARIOS: AgentsScenario[] = [
  'ok',
  'warn',
  'crit',
  'unconfigured',
  'unavailable',
];

const MONITOR_URL = 'https://monitor.example';
const iso = (ms: number) => new Date(ms).toISOString();
const ORDER: Record<Level, number> = { critical: 0, warning: 1, ok: 2, unknown: 3 };

// Same thresholds as custom_components/homebrain/agents/rules.py.
function quotaLevel(q: Omit<Quota, 'level'>): Level {
  if (!q.available || q.remaining_pct == null) return 'unknown';
  if (q.exhausted || q.remaining_pct < 10) return 'critical';
  if (q.exhaust_before_reset || q.remaining_pct < 25) return 'warning';
  return 'ok';
}
function serviceLevel(s: Omit<Service, 'level'>): Level {
  if (s.up == null) return 'unknown';
  if (!s.up || s.state === 'down') return 'critical';
  if ((s.sla_24h != null && s.sla_24h < 95) || s.state === 'degraded') return 'warning';
  return 'ok';
}

function quota(
  id: string,
  provider: string,
  window: string,
  windowLabel: string,
  remaining: number | null,
  resetInMin: number | null,
  now: number,
  extra: Partial<Quota> = {},
): Quota {
  const base = {
    id,
    available: remaining != null,
    provider,
    window,
    window_label: windowLabel,
    remaining_pct: remaining,
    used_pct: remaining == null ? null : Math.round((100 - remaining) * 10) / 10,
    reset_at: resetInMin == null ? null : iso(now + resetInMin * 60_000),
    exhausted: false,
    exhaust_before_reset: false,
    ...extra,
  };
  return { ...base, level: quotaLevel(base) };
}

function service(id: string, name: string, up: boolean | null, state: string, sla: number) {
  const base = {
    id,
    name,
    available: up != null,
    up,
    state: up == null ? null : state,
    sla_24h: up == null ? null : sla,
  };
  return { ...base, level: serviceLevel(base) };
}

const STATUS_LEVEL: Record<string, Level> = {
  ok: 'ok',
  attention: 'warning',
  critical: 'critical',
};

/** Same rule as custom_components/homebrain/agents/rules.py ``verdict``. */
function verdict(snap: AgentsSnapshot): AgentsSnapshot['verdict'] {
  const reasons: Reason[] = [];
  for (const s of snap.services)
    if (s.level === 'critical' || s.level === 'warning')
      reasons.push({
        kind: 'service',
        label: s.name,
        level: s.level,
        value: s.sla_24h,
        detail: s.level === 'critical' ? 'down' : 'sla',
      });
  for (const q of snap.quotas)
    if (q.level === 'critical' || q.level === 'warning')
      reasons.push({
        kind: 'quota',
        label: [q.provider, q.window_label].filter(Boolean).join(' · '),
        level: q.level,
        value: q.remaining_pct,
        detail: q.exhausted
          ? 'exhausted'
          : q.remaining_pct != null && q.remaining_pct < 25
            ? 'low'
            : 'forecast',
      });
  if (snap.data.current === false)
    reasons.push({
      kind: 'data',
      label: 'Data nejsou aktuální',
      level: 'warning',
      value: snap.data.since,
      detail: null,
    });
  const kind = { service: 0, quota: 1, data: 2, status: 3 };
  const itemWorst = reasons.reduce((w, r) => Math.min(w, ORDER[r.level]), ORDER.ok);
  const sLevel = STATUS_LEVEL[snap.status.level] ?? 'unknown';
  if ((sLevel === 'critical' || sLevel === 'warning') && ORDER[sLevel] < itemWorst)
    reasons.push({
      kind: 'status',
      label: 'Monitoring',
      level: sLevel,
      value: null,
      detail: null,
    });
  reasons.sort(
    (a, b) =>
      ORDER[a.level] - ORDER[b.level] ||
      kind[a.kind] - kind[b.kind] ||
      (typeof a.value === 'number' ? a.value : 0) - (typeof b.value === 'number' ? b.value : 0),
  );
  let level: Level;
  if (sLevel === 'ok' || sLevel === 'warning' || sLevel === 'critical') level = sLevel;
  else if (reasons[0]) level = reasons[0].level;
  else if (snap.quotas.some((q) => q.level === 'ok')) level = 'ok';
  else level = 'unknown';
  return { level, reasons };
}

function empty(configured: boolean): AgentsSnapshot {
  return {
    configured,
    status: { available: false, level: 'unknown', critical: null, attention: null },
    data: { current: null, since: null },
    quotas: [],
    exhaust_forecast: { available: false, active: null, items: [] },
    agents: {
      available: false,
      active: null,
      total: null,
      waiting: null,
      waiting_names: [],
      items: [],
    },
    services: [],
    queue: { available: false, pending: null, running: null, blocked: null, review: null },
    monitor_url: null,
    last_alert: null,
    verdict: { level: 'unknown', reasons: [] },
  };
}

export function createMockSnapshot(
  scenario: AgentsScenario = 'ok',
  now = Date.now(),
): AgentsSnapshot {
  if (scenario === 'unconfigured') return { ...empty(false), updated_at: iso(now) };
  const warn = scenario === 'warn';
  const crit = scenario === 'crit';
  const gone = scenario === 'unavailable';
  const quotas: Quota[] = [
    quota('x_5h', 'Poskytovatel X · Plán A', '5h', '5 h', warn ? 18 : 72, 192, now),
    quota(
      'x_week',
      'Poskytovatel X · Plán A',
      'X week',
      'týden',
      warn ? 64 : 81,
      3 * 1440 + 200,
      now,
      {
        exhaust_before_reset: warn,
      },
    ),
    quota('y_5h', 'Poskytovatel Y', 'Y 5h', '5 h', warn ? 0 : 94, 47, now, { exhausted: warn }),
    quota('y_7d', 'Poskytovatel Y', '7d', '7 dní', warn ? 12 : 58, 6 * 1440 + 90, now),
    quota('z_month', 'Poskytovatel Z', 'Included', 'měsíc', gone ? null : 66, 12 * 1440, now),
    quota('z_credit', 'Poskytovatel Z', 'Bonus', 'kredit', 41, null, now),
  ].sort(
    (a, b) =>
      ORDER[a.level] - ORDER[b.level] ||
      (a.remaining_pct ?? 101) - (b.remaining_pct ?? 101) ||
      a.id.localeCompare(b.id),
  );
  const services: Service[] = [
    service(
      'brana',
      'Služba Brána',
      crit ? false : true,
      crit ? 'down' : 'operational',
      crit ? 81.5 : 99.9,
    ),
    service('wiki', 'Služba Wiki', true, 'operational', warn ? 93 : 100),
    service('fronta', 'Služba Fronta', gone ? null : true, 'operational', 99.4),
  ].sort((a, b) => ORDER[a.level] - ORDER[b.level] || a.name.localeCompare(b.name, 'cs'));
  const snap: AgentsSnapshot = {
    configured: true,
    status: {
      available: true,
      level: crit ? 'critical' : warn ? 'attention' : 'ok',
      critical: crit ? 1 : warn ? 2 : 0,
      attention: crit ? 1 : warn ? 3 : 0,
      stale: crit,
    },
    data: crit
      ? { current: false, since: iso(now - 47 * 60_000) }
      : { current: true, since: iso(now - 2 * 60_000) },
    quotas,
    exhaust_forecast: warn
      ? { available: true, active: true, items: ['Poskytovatel X · týden'] }
      : { available: true, active: false, items: [] },
    agents: gone
      ? {
          available: false,
          active: null,
          total: null,
          waiting: null,
          waiting_names: [],
          items: [],
        }
      : {
          // Sensor aggregates match the visible list (2 běží + 1 čeká + 1 neběží = 4).
          available: true,
          active: 3,
          total: 4,
          waiting: 1,
          waiting_names: ['Agent B'],
          items: [
            { name: 'Agent A', model: 'Model X', alive: true, waiting: false },
            { name: 'Agent B', model: 'Model Y', alive: true, waiting: true },
            { name: 'Agent C', model: 'Model X', alive: true, waiting: false },
            { name: 'Agent D', model: 'Model Z', alive: false, waiting: false },
          ],
        },
    services,
    queue: gone
      ? { available: false, pending: null, running: null, blocked: null, review: null }
      : { available: true, pending: 5, running: 2, blocked: crit ? 2 : 0, review: 3 },
    monitor_url: MONITOR_URL,
    last_alert: warn || crit ? iso(now - 25 * 60_000) : null,
    verdict: { level: 'unknown', reasons: [] },
    updated_at: iso(now),
  };
  snap.verdict = verdict(snap);
  return snap;
}

export function createMockAgentsApi(opts: { scenario?: AgentsScenario } = {}): AgentsApi {
  const scenario = opts.scenario ?? 'ok';
  const wait = <T>(v: T) => new Promise<T>((r) => setTimeout(() => r(v), 250));
  return { get: () => wait(createMockSnapshot(scenario)) };
}

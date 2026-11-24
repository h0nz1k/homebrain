import type { AgentsApi } from './api.js';
import type { AgentsSnapshot, Level, Quota, Reason, Service } from './types.js';

/**
 * Synthetic agent monitoring (no real agents, models, services, accounts or URLs).
 * `real` mirrors the *structure* of the approved UX proposal with anonymized names.
 */
export type AgentsScenario =
  'ok' | 'warn' | 'crit' | 'real' | 'stale' | 'unconfigured' | 'unavailable';
export const AGENTS_SCENARIOS: AgentsScenario[] = [
  'ok',
  'warn',
  'crit',
  'real',
  'stale',
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

/** Absolute reset offsets for the `real` scenario (Prague-friendly times). */
function realQuotas(now: number): Quota[] {
  // Fixed anchors relative to now so renewal labels stay deterministic in tests
  // when `now` is injected (see format.test / quotaGroups.test).
  const today2059 = (() => {
    // ~11 h ahead → „dnes 20:59“ when now is ~09:45 Prague.
    return 11 * 60 + 14;
  })();
  const tomorrow609 = 24 * 60 - (9 * 60 + 45) + 6 * 60 + 9; // ≈ zítra 6:09 from 9:45
  const thu1703 = 2 * 1440 + (17 * 60 + 3) - (9 * 60 + 45); // čt 17:03 from út 9:45
  const dec1 = Math.round((Date.parse('2026-12-01T00:00:00+01:00') - now) / 60_000);
  const dec22 = Math.round((Date.parse('2026-12-22T00:00:00+01:00') - now) / 60_000);

  return [
    quota('claude_5h', 'Claude · Max 5x', '5h', '5 h', 91, today2059, now),
    quota('claude_week', 'Claude · Max 5x', 'Claude week', 'týden', 13, today2059, now),
    quota(
      'claude_fable_week',
      'Claude Fable · Research',
      'Claude Fable week',
      'týden',
      47,
      5 * 1440,
      now,
    ),
    quota('codex_5h', 'Codex · demo', '5h', '5 h', 100, 200, now),
    quota('codex_week', 'Codex · demo', 'Codex week', 'týden', 11, thu1703, now, {
      exhaust_before_reset: true,
    }),
    quota('agy_cgpt_5h', 'Antigravity · Claude/GPT · Gemini', 'Claude/GPT 5h', '5 h', 88, 180, now),
    quota(
      'agy_cgpt_week',
      'Antigravity · Claude/GPT · Gemini',
      'Claude/GPT week',
      'týden',
      0,
      tomorrow609,
      now,
      {
        exhausted: true,
      },
    ),
    quota('agy_gem_5h', 'Antigravity · Claude/GPT · Gemini', 'Gemini 5h', '5 h', 97, 180, now),
    quota(
      'agy_gem_week',
      'Antigravity · Claude/GPT · Gemini',
      'Gemini week',
      'týden',
      99,
      tomorrow609,
      now,
    ),
    quota('cursor_incl', 'Cursor · Pro · měsíc', 'Included', 'měsíc', 96, dec22, now),
    quota('cursor_api', 'Cursor · Pro · měsíc', 'API', 'kredit', 100, null, now),
    quota('gha_min', 'GitHub Actions · minuty · měsíc', 'actions min', 'měsíc', 11, dec1, now),
    quota('vertex_credit', 'Vertex AI · cloud', 'GCP Bonus', 'kredit', 63, null, now),
  ];
}

function realAgents() {
  return [
    { name: 'Hermes', model: 'Model Alpha', alive: true, waiting: false },
    { name: 'LANA', model: 'Model Alpha', alive: true, waiting: false },
    { name: 'Claude', model: 'Model Alpha', alive: true, waiting: false },
    { name: 'Codex', model: 'Model Beta', alive: true, waiting: false },
    { name: 'Cursor', model: 'Model Gamma', alive: true, waiting: false },
    { name: 'LANA (terminál)', model: 'Model Beta', alive: true, waiting: false },
    { name: 'LANA · Agy', model: 'Model Delta', alive: true, waiting: false },
  ];
}

function okAgents() {
  return [
    { name: 'Agent A', model: 'Model X', alive: true, waiting: false },
    { name: 'Agent B', model: 'Model Y', alive: true, waiting: false },
    { name: 'Agent C', model: 'Model X', alive: true, waiting: false },
    { name: 'Agent D', model: 'Model Z', alive: true, waiting: false },
  ];
}

export function createMockSnapshot(
  scenario: AgentsScenario = 'ok',
  now = Date.now(),
): AgentsSnapshot {
  if (scenario === 'unconfigured') return { ...empty(false), updated_at: iso(now) };

  if (scenario === 'real') {
    const quotas = realQuotas(now);
    const services = [
      service('sys', 'Systém agentů', true, 'operational', 93.4),
      service('wiki', 'Wiki', true, 'operational', 94.2),
      service('tg', 'LANA Telegram', true, 'operational', 99.5),
      service('bridge', 'Telegram most', true, 'operational', 100),
    ];
    const snap: AgentsSnapshot = {
      configured: true,
      status: {
        available: true,
        level: 'attention',
        critical: 0,
        attention: 3,
        stale: false,
      },
      data: { current: true, since: iso(now - 60_000) },
      quotas,
      exhaust_forecast: {
        available: true,
        active: true,
        items: ['Codex · demo · týden'],
      },
      agents: {
        available: true,
        active: 7,
        total: 7,
        waiting: 0,
        waiting_names: [],
        items: realAgents(),
      },
      services,
      queue: { available: true, pending: 6, running: 3, blocked: 1, review: 1 },
      monitor_url: MONITOR_URL,
      last_alert: null,
      verdict: { level: 'unknown', reasons: [] },
      updated_at: iso(now),
    };
    snap.verdict = verdict(snap);
    return snap;
  }

  if (scenario === 'stale') {
    const quotas = [
      quota('x_5h', 'Poskytovatel X · Plán A', '5h', '5 h', 72, 192, now),
      quota('x_week', 'Poskytovatel X · Plán A', 'X week', 'týden', 81, 3 * 1440, now),
    ];
    const snap: AgentsSnapshot = {
      configured: true,
      status: { available: true, level: 'ok', critical: 0, attention: 0, stale: true },
      data: { current: false, since: iso(now - 47 * 60_000) },
      quotas,
      exhaust_forecast: { available: true, active: false, items: [] },
      agents: {
        available: true,
        active: 4,
        total: 4,
        waiting: 0,
        waiting_names: [],
        items: okAgents(),
      },
      services: [
        service('brana', 'Služba Brána', true, 'operational', 99.9),
        service('wiki', 'Služba Wiki', true, 'operational', 100),
      ],
      queue: { available: true, pending: 0, running: 1, blocked: 0, review: 0 },
      monitor_url: MONITOR_URL,
      last_alert: null,
      verdict: { level: 'unknown', reasons: [] },
      updated_at: iso(now),
    };
    snap.verdict = verdict(snap);
    return snap;
  }

  const warn = scenario === 'warn';
  const crit = scenario === 'crit';
  const gone = scenario === 'unavailable';
  const ok = scenario === 'ok';

  const quotas: Quota[] = ok
    ? [
        quota('x_5h', 'Poskytovatel X · Plán A', '5h', '5 h', 72, 192, now),
        quota('x_week', 'Poskytovatel X · Plán A', 'X week', 'týden', 81, 3 * 1440 + 200, now),
        quota('y_5h', 'Poskytovatel Y', 'Y 5h', '5 h', 94, 47, now),
        quota('y_7d', 'Poskytovatel Y', '7d', '7 dní', 58, 6 * 1440 + 90, now),
        quota('z_month', 'Poskytovatel Z', 'Included', 'měsíc', 66, 12 * 1440, now),
        quota('z_credit', 'Poskytovatel Z', 'Bonus', 'kredit', 41, null, now),
      ]
    : [
        quota('x_5h', 'Poskytovatel X · Plán A', '5h', '5 h', warn ? 18 : 72, 192, now),
        quota(
          'x_week',
          'Poskytovatel X · Plán A',
          'X week',
          'týden',
          warn ? 64 : 81,
          3 * 1440 + 200,
          now,
          { exhaust_before_reset: warn },
        ),
        quota('y_5h', 'Poskytovatel Y', 'Y 5h', '5 h', warn ? 0 : 94, 47, now, {
          exhausted: warn,
        }),
        quota('y_7d', 'Poskytovatel Y', '7d', '7 dní', warn ? 12 : 58, 6 * 1440 + 90, now),
        quota('z_month', 'Poskytovatel Z', 'Included', 'měsíc', gone ? null : 66, 12 * 1440, now),
        quota('z_credit', 'Poskytovatel Z', 'Bonus', 'kredit', 41, null, now),
      ];

  const services: Service[] = crit
    ? [
        service('brana', 'Služba Brána', false, 'down', 81.5),
        service('wiki', 'Služba Wiki', true, 'operational', 100),
        service('fronta', 'Služba Fronta', true, 'operational', 99.4),
      ]
    : [
        service('brana', 'Služba Brána', true, 'operational', 99.9),
        service('wiki', 'Služba Wiki', true, 'operational', warn ? 93 : 100),
        service('fronta', 'Služba Fronta', gone ? null : true, 'operational', 99.4),
      ];

  const agentItems = crit
    ? [
        { name: 'Agent A', model: 'Model X', alive: true, waiting: false },
        { name: 'Agent B', model: 'Model Y', alive: false, waiting: false },
        { name: 'Agent C', model: 'Model X', alive: true, waiting: false },
        { name: 'Agent D', model: 'Model Z', alive: true, waiting: false },
      ]
    : warn
      ? [
          { name: 'Agent A', model: 'Model X', alive: true, waiting: false },
          { name: 'Agent B', model: 'Model Y', alive: true, waiting: true },
          { name: 'Agent C', model: 'Model X', alive: true, waiting: false },
          { name: 'Agent D', model: 'Model Z', alive: false, waiting: false },
        ]
      : okAgents();

  const snap: AgentsSnapshot = {
    configured: true,
    status: {
      available: true,
      level: crit ? 'critical' : warn ? 'attention' : 'ok',
      critical: crit ? 1 : warn ? 2 : 0,
      attention: crit ? 1 : warn ? 3 : 0,
      stale: crit ? false : false,
    },
    data: { current: true, since: iso(now - 2 * 60_000) },
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
          available: true,
          active: agentItems.filter((a) => a.alive).length,
          total: agentItems.length,
          waiting: agentItems.filter((a) => a.alive && a.waiting).length,
          waiting_names: agentItems.filter((a) => a.waiting).map((a) => a.name),
          items: agentItems,
        },
    services,
    queue: gone
      ? { available: false, pending: null, running: null, blocked: null, review: null }
      : {
          available: true,
          pending: ok ? 0 : 5,
          running: ok ? 2 : 2,
          blocked: crit ? 2 : 0,
          review: ok ? 0 : 3,
        },
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

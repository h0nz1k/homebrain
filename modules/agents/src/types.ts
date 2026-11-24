export type Level = 'ok' | 'warning' | 'critical' | 'unknown';

export interface Reason {
  kind: 'service' | 'quota' | 'data' | 'status';
  label: string;
  level: Level;
  value: number | string | null;
  /** service: down|sla; quota: exhausted|low|forecast. */
  detail: string | null;
}
export interface Quota {
  id: string;
  available: boolean;
  provider: string | null;
  /** Raw window attribute (`okno`). */
  window: string | null;
  /** Czech label („5 h“, „7 dní“, „týden“, „měsíc“, „kredit“) or the raw text. */
  window_label: string | null;
  remaining_pct: number | null;
  used_pct: number | null;
  reset_at: string | null;
  exhausted: boolean;
  exhaust_before_reset: boolean;
  level: Level;
}
export interface Agent {
  name: string;
  model: string | null;
  alive: boolean;
  waiting: boolean;
  /** ISO last contact, when the sensor provides it. */
  last_seen?: string | null;
}
export interface Service {
  id: string;
  name: string;
  available: boolean;
  up: boolean | null;
  /** operational | degraded | down (owner's monitoring wording). */
  state: string | null;
  sla_24h: number | null;
  level: Level;
  /** ISO start of outage / last OK, when the sensor provides it. */
  since?: string | null;
  last_ok?: string | null;
}
export interface AgentsSnapshot {
  configured: boolean;
  status: {
    available: boolean;
    /** Monitoring's own aggregate (raw). */
    level: 'ok' | 'attention' | 'critical' | 'unknown';
    critical: number | null;
    attention: number | null;
    stale?: boolean | null;
  };
  data: { current: boolean | null; since: string | null };
  quotas: Quota[];
  exhaust_forecast: { available: boolean; active: boolean | null; items: string[] };
  agents: {
    available: boolean;
    active: number | null;
    total: number | null;
    waiting: number | null;
    waiting_names: string[];
    items: Agent[];
  };
  services: Service[];
  queue: {
    available: boolean;
    pending: number | null;
    running: number | null;
    blocked: number | null;
    review: number | null;
  };
  monitor_url: string | null;
  last_alert: string | null;
  verdict: { level: Level; reasons: Reason[] };
  updated_at?: string;
}

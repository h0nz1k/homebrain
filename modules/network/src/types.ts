/** Síť snapshot as returned by `homebrain/network/get` (no MAC/IP; times = epoch seconds). */
export type NetSeverity = 'critical' | 'warning' | 'notice' | 'info';
export type NetRole = 'owner' | 'adult' | 'child' | 'guest' | 'kiosk';

export interface NetProblem {
  id: string;
  rule: string;
  severity: NetSeverity;
  target: { kind: string; id: string };
  title: string;
  context: string;
  fix: string;
  since: number | null;
  important: boolean;
  actions: Array<{ label: string; route: string }>;
}

export interface NetPort {
  n: number;
  speed_mbps: number | null;
  poe_w: number | null;
}

export interface NetDevice {
  id: string;
  name: string;
  model: string | null;
  model_label: string | null;
  area: string | null;
  floor_id: string | null;
  state: string | null;
  state_since: number | null;
  clients: number | null;
  cpu_pct: number | null;
  mem_pct: number | null;
  uplink: { id: string; name: string } | null;
  fw: { installed: string | null; latest: string | null; update: boolean } | null;
  flaps_24h: number;
  max_link_mbps?: number;
  ports: NetPort[];
  poe?: { used_w: number; budget_w: number | null };
}

export interface NetClient {
  id: string;
  label: string;
  wired: boolean;
  ssid: string | null;
  ap_id: string | null;
  area: string | null;
  floor_id: string | null;
  online: boolean;
  since: number | null;
  important: boolean;
  expected_floor_id: string | null;
}

export interface NetSummary {
  status: 'ok' | 'problem';
  headline: string;
  severity: NetSeverity | null;
  problems_count: number;
  tips_count: number;
  internet_online: boolean | null;
  updated_at: number | null;
}

export interface NetSnapshot {
  updated_at: number;
  internet: {
    online: boolean | null;
    since: number | null;
    latency_ms: number | null;
    jitter_ms: number | null;
    loss_pct: number | null;
  } | null;
  floors: Array<{ id: string; name: string; level: number | null }>;
  aps: NetDevice[];
  switches: NetDevice[];
  ssids: Array<{ name: string; clients: number | null; guest: boolean }>;
  clients: NetClient[];
  problems: NetProblem[];
  summary: NetSummary;
}

export interface GuestQr {
  configured: boolean;
  ssid: string | null;
  open?: boolean;
  qr_payload: string | null;
}

export interface ImportantItem {
  id: string;
  label?: string;
  expected_floor_id?: string;
}

export interface NetSettings {
  important: ImportantItem[];
  guest: { ssid: string; password?: string | null; security?: 'WPA' | 'WEP' | 'nopass' } | null;
  gateway_label?: string | null;
}

/** Topology graph (`homebrain/network/topology`, admin only). V1 = HA data; V2 fills port/speed/dBm. */
export type TopoKind = 'internet' | 'gateway' | 'switch' | 'ap' | 'client' | 'more';
export type TopoEdgeType = 'wired' | 'mesh' | 'wireless';

export interface TopoNode {
  id: string;
  kind: TopoKind;
  label: string;
  parent: string | null;
  status: 'ok' | 'offline' | 'unknown';
  severity: NetSeverity | null;
  problem_ids: string[];
  model_label?: string | null;
  clients?: number | null;
  count?: number;
  wired?: boolean;
  latency_ms?: number | null;
  ref?: { kind: 'ap' | 'switch' | 'client'; id: string };
}

export interface TopoEdge {
  from: string;
  to: string;
  type: TopoEdgeType;
  assumed: boolean;
  port: number | null;
  speed_mbps: number | null;
  max_mbps: number | null;
  poe_w: number | null;
  signal_dbm: number | null;
  slow: boolean;
}

export interface TopoGraph {
  nodes: TopoNode[];
  edges: TopoEdge[];
  meta: { source: 'ha' | 'unifi'; slow_links: number; mesh: number; assumed: number };
}

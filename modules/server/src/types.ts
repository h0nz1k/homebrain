export type Level = 'ok' | 'warning' | 'critical' | 'unknown';

export interface Reason {
  kind: 'memory' | 'disk' | 'temperature' | 'storage' | 'backup' | 'backup_age' | 'node';
  label: string;
  value: number | null;
  level: Level;
}
export interface Disk {
  mount: string;
  percent: number | null;
  used_bytes: number | null;
  free_bytes: number | null;
  size_bytes: number | null;
  level: Level;
}
export interface TempSensor {
  label: string;
  value: number;
  kind: 'cpu' | 'disk' | 'other';
  warning: number | null;
  critical: number | null;
  level: Level;
}
export interface Iface {
  name: string;
  rx_bps: number | null;
  tx_bps: number | null;
}
export interface Vm {
  vmid: number;
  name: string;
  cpu_percent: number;
  mem_bytes: number;
  mem_percent: number | null;
}
export interface ProxmoxGuest {
  vmid: number;
  name: string;
  kind: 'vm' | 'ct';
  status: string | null;
  cpu_percent: number | null;
  mem_bytes: number | null;
  mem_max_bytes: number | null;
  mem_percent: number | null;
  up_since: string | null;
  disk_percent: number | null;
  netin_bps: number | null;
  netout_bps: number | null;
  netin_bytes?: number | null;
  netout_bytes?: number | null;
}
export interface ProxmoxBackup {
  ok: boolean | null;
  last: string | null;
  duration_s: number | null;
  /** Whole days since the last backup (server clock). */
  age_days?: number | null;
  max_age_days?: number;
  age_level?: Level;
}
export interface ProxmoxSnapshot {
  status: 'ok' | 'down' | 'off';
  node: { name: string; status: string | null; up_since: string | null } | null;
  guests: ProxmoxGuest[];
  storages: Array<{
    name: string;
    node: string;
    used_bytes: number | null;
    total_bytes: number | null;
    percent: number | null;
    active: boolean | null;
    level: Level;
  }>;
  backup: ProxmoxBackup | null;
}
export interface ServerSnapshot {
  available: boolean;
  state: 'ok' | 'down' | 'unconfigured';
  host: { title: string; entry_id: string } | null;
  updated_at?: string;
  cpu?: { percent: number | null; load: number | null; cores: number | null };
  memory?: {
    percent: number | null;
    used_bytes: number | null;
    free_bytes: number | null;
    total_bytes: number | null;
    level: Level;
  };
  swap?: { percent: number | null; used_bytes: number | null; total_bytes: number | null };
  disks?: Disk[];
  temperatures?: { cpu_max: number | null; composite: number | null; sensors: TempSensor[] };
  network?: { primary: string | null; interfaces: Iface[] };
  processes?: { running: number | null; total: number | null };
  up_since?: string | null;
  verdict: { severity: Level; reasons: Reason[] };
  vms?: { status: 'ok' | 'down' | 'off'; items: Vm[] };
  proxmox?: ProxmoxSnapshot;
  thresholds?: { memory: [number, number]; disk: [number, number]; backup_days?: number };
}
export type SeriesKey = 'cpu' | 'memory' | 'temperature' | 'rx' | 'tx';
export interface ServerHistory {
  hours: number;
  series: Partial<Record<SeriesKey, Array<[number, number]>>>;
}

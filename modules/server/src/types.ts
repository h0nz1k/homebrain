export type Level = 'ok' | 'warning' | 'critical' | 'unknown';

export interface Reason {
  kind: 'memory' | 'disk' | 'temperature' | 'storage' | 'backup' | 'backup_age' | 'node' | 'load';
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
  /** vCPU count (Proxmox `max_cpu`). */
  cpus?: number | null;
  mem_bytes: number | null;
  mem_max_bytes: number | null;
  mem_percent: number | null;
  up_since: string | null;
  /** Used disk; `null` on a VM without the guest agent (PVE reports 0). */
  disk_bytes?: number | null;
  /** Allocated disk size. */
  disk_max_bytes?: number | null;
  disk_percent: number | null;
  /** Rate from the cumulative counter delta (backend); `null` on the first sample or a reset. */
  netin_bps: number | null;
  netout_bps: number | null;
  netin_bytes?: number | null;
  netout_bytes?: number | null;
  cpu_level?: Level;
  mem_level?: Level;
  disk_level?: Level;
}
export interface ProxmoxNode {
  name: string;
  status: string | null;
  up_since: string | null;
  cpu_percent?: number | null;
  cpus?: number | null;
  mem_bytes?: number | null;
  mem_max_bytes?: number | null;
  mem_percent?: number | null;
  disk_bytes?: number | null;
  disk_max_bytes?: number | null;
  disk_percent?: number | null;
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
  node: ProxmoxNode | null;
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
  cpu?: {
    percent: number | null;
    /** 15-minute load average. */
    load: number | null;
    /** 1, 5 and 15-minute load averages (Glances API). */
    load_avg?: [number, number, number] | null;
    cores: number | null;
  };
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
  diskio?: {
    primary: string | null;
    disks: Array<{ name: string; read_bps: number | null; write_bps: number | null }>;
  };
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

export type Level = 'ok' | 'warning' | 'critical' | 'unknown';

export interface Reason {
  kind: 'memory' | 'disk' | 'temperature';
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
  thresholds?: { memory: [number, number]; disk: [number, number] };
}
export type SeriesKey = 'cpu' | 'memory' | 'temperature' | 'rx' | 'tx';
export interface ServerHistory {
  hours: number;
  series: Partial<Record<SeriesKey, Array<[number, number]>>>;
}

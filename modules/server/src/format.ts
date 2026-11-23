import { czCount, czPlural } from '@homebrain/ui';
import type { Level, ProxmoxGuest, ServerSnapshot } from './types.js';

export const NB = '\u00a0';
export type BarTone = 'ok' | 'warn' | 'crit' | 'neutral';

const num = (v: number, digits: number) =>
  v.toLocaleString('cs-CZ', { minimumFractionDigits: digits, maximumFractionDigits: digits });

export function fmtBytes(b: number | null | undefined): string {
  if (b == null || !Number.isFinite(b)) return '–';
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  let v = b;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${num(v, i >= 3 && v < 100 ? 1 : 0)}${NB}${units[i]}`;
}

export function fmtRate(bps: number | null | undefined): string {
  if (bps == null || !Number.isFinite(bps)) return '–';
  const units = ['B/s', 'kB/s', 'MB/s', 'GB/s'];
  let v = bps;
  let i = 0;
  while (v >= 1000 && i < units.length - 1) {
    v /= 1000;
    i += 1;
  }
  return `${num(v, i >= 2 && v < 10 ? 1 : 0)}${NB}${units[i]}`;
}

export const fmtPct = (v: number | null | undefined) =>
  v == null ? '–' : `${num(Math.round(v), 0)}${NB}%`;
export const fmtTemp = (v: number | null | undefined) =>
  v == null ? '–' : `${num(Math.round(v), 0)}${NB}°C`;
export const fmtNum = (v: number | null | undefined, digits = 1) =>
  v == null ? '–' : num(v, digits);

export function uptimeLabel(since: string | null | undefined, now = Date.now()): string | null {
  if (!since) return null;
  const mins = Math.max(0, Math.floor((now - Date.parse(since)) / 60_000));
  if (!Number.isFinite(mins)) return null;
  const days = Math.floor(mins / 1440);
  const hours = Math.floor((mins % 1440) / 60);
  if (days > 0) return `běží ${days}${NB}${czPlural(days, 'den', 'dny', 'dní')} ${hours}${NB}h`;
  if (hours > 0) return `běží ${hours}${NB}h ${mins % 60}${NB}min`;
  return `běží ${mins}${NB}min`;
}

export const daysLabel = (days: number) =>
  `${num(days, 0)}${NB}${czPlural(days, 'den', 'dny', 'dní')}`;

/** „dnes“, „včera“, „před 395 dny“ from whole days. */
export function daysAgoLabel(days: number): string {
  if (days <= 0) return 'dnes';
  if (days === 1) return 'včera';
  return `před ${num(days, 0)}${NB}dny`;
}

/** 17 s, 3 min 5 s, 1 h 4 min. */
export function durationLabel(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}${NB}s`;
  const mins = Math.floor(s / 60);
  if (mins < 60) return s % 60 ? `${mins}${NB}min ${s % 60}${NB}s` : `${mins}${NB}min`;
  return `${Math.floor(mins / 60)}${NB}h ${mins % 60}${NB}min`;
}

/** Bucket means: 288 five-minute points → `buckets` calm points (no seismograph look). */
export function smoothSeries(values: number[], buckets = 72): number[] {
  if (values.length <= buckets) return values;
  const size = values.length / buckets;
  return Array.from({ length: buckets }, (_, b) => {
    const part = values.slice(Math.floor(b * size), Math.floor((b + 1) * size));
    return part.reduce((s, v) => s + v, 0) / part.length;
  });
}

export const diskName = (mount: string) => (mount === '/' ? 'Systémový disk' : mount);

export function barTone(v: number | null | undefined, [warn, crit]: [number, number]): BarTone {
  if (v == null) return 'neutral';
  return v >= crit ? 'crit' : v >= warn ? 'warn' : 'ok';
}

export const levelTone = (l: Level): BarTone =>
  l === 'critical' ? 'crit' : l === 'warning' ? 'warn' : l === 'ok' ? 'ok' : 'neutral';

function reasonText(r: ServerSnapshot['verdict']['reasons'][number], cores: number | null): string {
  if (r.kind === 'load')
    return `zátěž ${fmtNum(r.value, 1)}${cores ? ` na ${coresLabel(cores)}` : ''}`;
  if (r.kind === 'memory') return `paměť ${fmtPct(r.value)}`;
  if (r.kind === 'disk')
    return `${r.label === '/' ? 'systémový disk' : `disk ${r.label}`} ${fmtPct(r.value)}`;
  if (r.kind === 'storage') return `úložiště ${r.label} ${fmtPct(r.value)}`;
  if (r.kind === 'node') return `uzel ${r.label} offline`;
  if (r.kind === 'backup') return 'záloha selhala';
  if (r.kind === 'backup_age') return `poslední záloha je stará ${daysLabel(r.value ?? 0)}`;
  return `teplota ${r.label} ${fmtTemp(r.value)}`;
}

export interface HeroModel {
  tone: BarTone;
  badge: string;
  headline: string;
  more: string[];
  /** Anchor id of the card that shows the evidence for the top reason. */
  target?: string;
}

/** Card anchors the hero „Co s tím“ button scrolls to. */
export const SERVER_ANCHORS = {
  disk: 'server-disks',
  node: 'server-proxmox-node',
  storage: 'server-proxmox-storages',
  backup: 'server-proxmox-backup',
  consumers: 'server-host-consumers',
} as const;

const reasonTarget: Partial<Record<ServerSnapshot['verdict']['reasons'][number]['kind'], string>> =
  {
    disk: SERVER_ANCHORS.disk,
    node: SERVER_ANCHORS.node,
    storage: SERVER_ANCHORS.storage,
    backup: SERVER_ANCHORS.backup,
    backup_age: SERVER_ANCHORS.backup,
    load: SERVER_ANCHORS.consumers,
  };

export function heroModel(snap: ServerSnapshot): HeroModel {
  // Glances down but the same host reports through Proxmox: still a live verdict.
  const proxmoxLive = snap.proxmox?.status === 'ok';
  if (snap.state !== 'ok' && !proxmoxLive && snap.verdict.reasons.length === 0)
    return {
      tone: 'neutral',
      badge: 'Bez dat',
      headline: snap.state === 'down' ? 'Server nedostupný' : 'Glances nenalezeno',
      more: [],
    };
  const [top, ...rest] = snap.verdict.reasons;
  if (!top) return { tone: 'ok', badge: 'Živě', headline: 'V pořádku', more: [] };
  const crit = top.level === 'critical';
  return {
    tone: crit ? 'crit' : 'warn',
    badge: 'Živě',
    headline: `${crit ? 'Kritické' : 'Pozor'}: ${reasonText(top, hostCores(snap))}`,
    more: rest.map((r) => reasonText(r, hostCores(snap))),
    // The load evidence („Kdo vytěžuje hostitele“) exists only with Proxmox guests.
    target: top.kind === 'load' && !proxmoxLive ? undefined : reasonTarget[top.kind],
  };
}

export interface VmRow {
  vmid: number;
  name: string;
  cpu: string;
  cpuShare: number;
  memLabel: string;
  memShare: number;
}

/** VMs by RAM; bar shares relative to the host RAM (CPU % of one core → of all cores). */
export function vmRows(snap: ServerSnapshot): VmRow[] {
  const items = [...(snap.vms?.items ?? [])].sort((a, b) => b.mem_bytes - a.mem_bytes);
  const total = snap.memory?.total_bytes ?? 0;
  const cores = snap.cpu?.cores ?? 1;
  return items.map((vm) => {
    // Glances reports per-process CPU as % of ONE core; label and bar both use share of the whole host.
    const cpuShare = Math.min(1, vm.cpu_percent / 100 / cores);
    return {
      vmid: vm.vmid,
      name: vm.name,
      cpu: fmtPct(cpuShare * 100),
      cpuShare,
      memLabel: fmtBytes(vm.mem_bytes),
      memShare: total ? Math.min(1, vm.mem_bytes / total) : 0,
    };
  });
}

/** Running guests first, busiest CPU on top; stopped (and unknown) ones by ID at the end. */
export function sortGuests<
  T extends Pick<ProxmoxGuest, 'vmid' | 'status'> & { cpu_percent?: number | null },
>(guests: T[]): T[] {
  const rank = (g: T) => (g.status === 'running' ? 0 : 1);
  const cpu = (g: T) => (g.status === 'running' ? (g.cpu_percent ?? 0) : 0);
  return [...guests].sort((a, b) => rank(a) - rank(b) || cpu(b) - cpu(a) || a.vmid - b.vmid);
}

/** Host cores: Glances API, else the Proxmox node's CPU count. */
export const hostCores = (snap: ServerSnapshot): number | null =>
  snap.cpu?.cores ?? snap.proxmox?.node?.cpus ?? null;

/**
 * Share of the whole host a guest uses: PVE reports CPU % of the guest's own vCPUs, so
 * 50 % of 2 vCPU on a 4-core host = 25 % of the host.
 */
export function hostShare(
  guest: Pick<ProxmoxGuest, 'cpu_percent' | 'cpus'>,
  cores: number | null,
): number | null {
  if (guest.cpu_percent == null || !cores) return null;
  return Math.min(100, (guest.cpu_percent * (guest.cpus ?? 1)) / cores);
}

export interface HostConsumer {
  vmid: number;
  name: string;
  share: number;
}

/** Running guests by their share of the host CPU (only those using at least 1 %). */
export function hostConsumers(snap: ServerSnapshot, limit = 4): HostConsumer[] {
  const cores = hostCores(snap);
  return (snap.proxmox?.guests ?? [])
    .filter((g) => g.status === 'running')
    .map((g) => ({ vmid: g.vmid, name: g.name, share: hostShare(g, cores) }))
    .filter((g): g is HostConsumer => g.share != null && g.share >= 1)
    .sort((a, b) => b.share - a.share || a.vmid - b.vmid)
    .slice(0, limit);
}

export const coresLabel = (cores: number) => czCount(cores, 'jádro', 'jádra', 'jader');

/** „4,7 na 4 jádra“ + warning when the 15-minute average exceeds the cores. */
export function loadModel(snap: ServerSnapshot): {
  value: string;
  avg: string | null;
  tone: BarTone;
} | null {
  const load15 = snap.cpu?.load_avg?.[2] ?? snap.cpu?.load;
  if (load15 == null) return null;
  const cores = hostCores(snap);
  const avg = snap.cpu?.load_avg ? snap.cpu.load_avg.map((v) => fmtNum(v, 2)).join(' / ') : null;
  return {
    value: `${fmtNum(load15, 1)}${cores ? ` na ${coresLabel(cores)}` : ''}`,
    avg,
    tone: cores ? (load15 > cores ? 'warn' : 'ok') : 'neutral',
  };
}

/** Short uptime for guest rows: „běží 36 dní“, „běží 5 h“, „běží 12 min“. */
export function uptimeShort(since: string | null | undefined, now = Date.now()): string | null {
  if (!since) return null;
  const mins = Math.max(0, Math.floor((now - Date.parse(since)) / 60_000));
  if (!Number.isFinite(mins)) return null;
  const days = Math.floor(mins / 1440);
  if (days > 0) return `běží ${daysLabel(days)}`;
  if (mins >= 60) return `běží ${Math.floor(mins / 60)}${NB}h`;
  return `běží ${mins}${NB}min`;
}

/** 24 h peak from raw samples (not bucket means), never below the live value. */
export function seriesMax(values: number[], current?: number | null): number | null {
  const all = current != null && Number.isFinite(current) ? [...values, current] : values;
  return all.length ? Math.max(...all) : null;
}

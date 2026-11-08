import { czPlural } from '@homebrain/ui';
import type { Level, ServerSnapshot } from './types.js';

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

export const diskName = (mount: string) => (mount === '/' ? 'Systémový disk' : mount);

export function barTone(v: number | null | undefined, [warn, crit]: [number, number]): BarTone {
  if (v == null) return 'neutral';
  return v >= crit ? 'crit' : v >= warn ? 'warn' : 'ok';
}

export const levelTone = (l: Level): BarTone =>
  l === 'critical' ? 'crit' : l === 'warning' ? 'warn' : l === 'ok' ? 'ok' : 'neutral';

function reasonText(r: ServerSnapshot['verdict']['reasons'][number]): string {
  if (r.kind === 'memory') return `paměť ${fmtPct(r.value)}`;
  if (r.kind === 'disk')
    return `${r.label === '/' ? 'systémový disk' : `disk ${r.label}`} ${fmtPct(r.value)}`;
  return `teplota ${r.label} ${fmtTemp(r.value)}`;
}

export interface HeroModel {
  tone: BarTone;
  badge: string;
  headline: string;
  more: string[];
}

export function heroModel(snap: ServerSnapshot): HeroModel {
  if (snap.state !== 'ok')
    return {
      tone: 'neutral',
      badge: 'Bez dat',
      headline: snap.state === 'down' ? 'Server nedostupný' : 'Glances nenalezeno',
      more: [],
    };
  const [top, ...rest] = snap.verdict.reasons;
  if (!top) return { tone: 'ok', badge: 'Vše v normě', headline: 'V pořádku', more: [] };
  const crit = top.level === 'critical';
  return {
    tone: crit ? 'crit' : 'warn',
    badge: crit ? 'Kritické' : 'Pozor',
    headline: `${crit ? 'Kritické' : 'Pozor'}: ${reasonText(top)}`,
    more: rest.map(reasonText),
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
  return items.map((vm) => ({
    vmid: vm.vmid,
    name: vm.name,
    cpu: fmtPct(vm.cpu_percent),
    cpuShare: Math.min(1, vm.cpu_percent / 100 / cores),
    memLabel: fmtBytes(vm.mem_bytes),
    memShare: total ? Math.min(1, vm.mem_bytes / total) : 0,
  }));
}

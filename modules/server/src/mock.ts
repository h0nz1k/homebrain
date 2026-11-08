import type { ServerApi } from './api.js';
import type { Level, Reason, ServerHistory, ServerSnapshot, Vm } from './types.js';

/** Synthetic home server (no real hosts, addresses or VM names). */
export type ServerScenario = 'ok' | 'warn' | 'crit' | 'down' | 'unconfigured' | 'noapi' | 'apidown';

const GIB = 1024 ** 3;
const TOTAL = 31.2 * GIB;
const lvl = (v: number, w: number, c: number): Level =>
  v >= c ? 'critical' : v >= w ? 'warning' : 'ok';

const VMS: Vm[] = [
  { vmid: 101, name: 'home-assistant', cpu_percent: 6.4, mem_bytes: 8 * GIB, mem_percent: 25.6 },
  { vmid: 102, name: 'docker-host', cpu_percent: 14.2, mem_bytes: 6.2 * GIB, mem_percent: 19.9 },
  { vmid: 103, name: 'media', cpu_percent: 2.1, mem_bytes: 4.1 * GIB, mem_percent: 13.1 },
  { vmid: 104, name: 'lab', cpu_percent: 0.4, mem_bytes: 1.5 * GIB, mem_percent: 4.8 },
];

export function createMockSnapshot(scenario: ServerScenario = 'ok'): ServerSnapshot {
  if (scenario === 'unconfigured')
    return {
      available: false,
      state: 'unconfigured',
      host: null,
      verdict: { severity: 'unknown', reasons: [] },
    };
  const host = { title: 'Proxmox (pve)', entry_id: 'demo' };
  if (scenario === 'down')
    return {
      available: false,
      state: 'down',
      host,
      verdict: { severity: 'unknown', reasons: [] },
      vms: { status: 'down', items: [] },
    };
  const memPct = scenario === 'warn' ? 87.2 : scenario === 'crit' ? 88.4 : 64.8;
  const rootPct = scenario === 'crit' ? 96.1 : 41.0;
  const reasons: Reason[] = [];
  if (rootPct >= 85)
    reasons.push({ kind: 'disk', label: '/', value: rootPct, level: lvl(rootPct, 85, 95) });
  if (memPct >= 85)
    reasons.push({ kind: 'memory', label: 'paměť', value: memPct, level: lvl(memPct, 85, 95) });
  const severity: Level = reasons.some((r) => r.level === 'critical')
    ? 'critical'
    : reasons.length
      ? 'warning'
      : 'ok';
  const rootSize = 93.9 * GIB;
  const used = (TOTAL * memPct) / 100;
  const temp = (label: string, value: number, kind: 'cpu' | 'disk') => ({
    label,
    value,
    kind,
    warning: kind === 'cpu' ? 90 : 70,
    critical: kind === 'cpu' ? 105 : 80,
    level: 'ok' as Level,
  });
  return {
    available: true,
    state: 'ok',
    host,
    updated_at: new Date().toISOString(),
    cpu: { percent: scenario === 'ok' ? 18.6 : 41.3, load: 1.42, cores: 4 },
    memory: {
      percent: memPct,
      used_bytes: used,
      free_bytes: TOTAL - used,
      total_bytes: TOTAL,
      level: lvl(memPct, 85, 95),
    },
    swap: { percent: 3, used_bytes: 0.24 * GIB, total_bytes: 8 * GIB },
    disks: [
      {
        mount: '/',
        percent: rootPct,
        used_bytes: (rootSize * rootPct) / 100,
        free_bytes: rootSize * (1 - rootPct / 100),
        size_bytes: rootSize,
        level: lvl(rootPct, 85, 95),
      },
      {
        mount: '/mnt/data',
        percent: 62.5,
        used_bytes: 1164 * GIB,
        free_bytes: 698 * GIB,
        size_bytes: 1862 * GIB,
        level: 'ok',
      },
      {
        mount: '/boot/efi',
        percent: 0.4,
        used_bytes: 0.004 * GIB,
        free_bytes: 1 * GIB,
        size_bytes: 1 * GIB,
        level: 'ok',
      },
    ],
    temperatures: {
      cpu_max: 53,
      composite: 41.9,
      sensors: [
        temp('Package id 0', 53, 'cpu'),
        temp('Core 0', 48, 'cpu'),
        temp('Core 1', 51, 'cpu'),
        temp('Core 2', 49, 'cpu'),
        temp('Core 3', 53, 'cpu'),
        temp('Composite', 41.9, 'disk'),
      ],
    },
    network: {
      primary: 'vmbr0',
      interfaces: [
        { name: 'vmbr0', rx_bps: 1_284_000, tx_bps: 212_000 },
        { name: 'enp1s0', rx_bps: 1_280_000, tx_bps: 210_000 },
      ],
    },
    processes: { running: 2, total: 312 },
    up_since: new Date(Date.now() - (9 * 24 + 6) * 3600_000).toISOString(),
    verdict: { severity, reasons },
    vms:
      scenario === 'noapi'
        ? { status: 'off', items: [] }
        : scenario === 'apidown'
          ? { status: 'down', items: [] }
          : { status: 'ok', items: VMS },
    thresholds: { memory: [85, 95], disk: [85, 95] },
  };
}

/** Deterministic 24 h of 5-minute means (smooth daily rhythm + small noise). */
export function createMockHistory(scenario: ServerScenario = 'ok'): ServerHistory {
  if (scenario === 'unconfigured' || scenario === 'down') return { hours: 24, series: {} };
  const end = Math.floor(Date.now() / 300_000) * 300_000;
  const n = 288;
  const wave = (i: number, base: number, amp: number, phase = 0, noise = 0.08) =>
    base +
    amp * Math.sin((i / n) * Math.PI * 2 + phase) +
    amp * noise * Math.sin(i * 0.37) +
    amp * noise * 0.6 * Math.cos(i * 0.13);
  const series = (fn: (i: number) => number): Array<[number, number]> =>
    Array.from({ length: n }, (_, i) => [end - (n - 1 - i) * 300_000, Math.round(fn(i) * 10) / 10]);
  const memBase = scenario === 'ok' ? 63 : 84;
  return {
    hours: 24,
    series: {
      cpu: series((i) => Math.max(2, wave(i, 18, 9, 1.2, 0.4))),
      memory: series((i) => wave(i, memBase, 2.4, 0.4, 0.35)),
      temperature: series((i) => wave(i, 50, 4, 1.2, 0.25)),
      rx: series((i) => Math.max(0, wave(i, 900_000, 600_000, 2, 0.5))),
      tx: series((i) => Math.max(0, wave(i, 180_000, 90_000, 2, 0.5))),
    },
  };
}

export function createMockServerApi(opts: { scenario?: ServerScenario } = {}): ServerApi {
  const scenario = opts.scenario ?? 'ok';
  const wait = <T>(v: T) => new Promise<T>((r) => setTimeout(() => r(v), 250));
  return {
    get: () => wait(createMockSnapshot(scenario)),
    history: () => wait(createMockHistory(scenario)),
  };
}

import type { GuestRef, ServerApi } from './api.js';
import type {
  Level,
  ProxmoxGuest,
  ProxmoxSnapshot,
  Reason,
  ServerHistory,
  ServerSnapshot,
  Vm,
} from './types.js';

/** Synthetic home server (no real hosts, addresses or VM names). */
export type ServerScenario =
  | 'ok'
  | 'warn'
  | 'crit'
  | 'down'
  | 'unconfigured'
  | 'noapi'
  | 'apidown'
  | 'proxmox-ok'
  | 'proxmox-off'
  | 'proxmox-down'
  | 'proxmox-backup-failed'
  | 'proxmox-backup-stale'
  | 'proxmox-backup-missing'
  | 'proxmox-storage-critical'
  | 'proxmox-load'
  | 'proxmox-noglances';

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

const BACKUP_DAYS = 8;
/** Host boot: shared by the Glances hero (uptime) and the Proxmox node card. */
const HOST_UPTIME_H = 9 * 24 + 6;
const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();

function mockBackup(scenario: ServerScenario): ProxmoxSnapshot['backup'] {
  if (scenario === 'proxmox-backup-missing') return null;
  const stale = scenario === 'proxmox-backup-stale';
  const days = stale ? 395 : 0;
  return {
    ok: scenario !== 'proxmox-backup-failed',
    last: new Date(Date.now() - (stale ? days * 24 + 3 : 12) * 3600_000).toISOString(),
    duration_s: stale ? 17 : 185,
    age_days: days,
    max_age_days: BACKUP_DAYS,
    age_level: lvlBackup(days),
  };
}

const guestRow = (g: Partial<ProxmoxGuest> & Pick<ProxmoxGuest, 'vmid' | 'name' | 'kind'>) => {
  const running = (g.status ?? 'running') === 'running';
  const mem = g.mem_percent ?? null;
  const disk = g.disk_percent ?? null;
  return {
    status: 'running',
    cpu_percent: null,
    cpus: null,
    mem_bytes: null,
    mem_max_bytes: null,
    mem_percent: null,
    up_since: null,
    disk_bytes: null,
    disk_max_bytes: null,
    disk_percent: null,
    netin_bps: null,
    netout_bps: null,
    netin_bytes: null,
    netout_bytes: null,
    ...g,
    cpu_level:
      !running || g.cpu_percent == null ? 'unknown' : g.cpu_percent >= 90 ? 'warning' : 'ok',
    mem_level: !running || mem == null ? 'unknown' : lvl(mem, 85, 95),
    disk_level: disk == null ? 'unknown' : lvl(disk, 85, 95),
  } satisfies ProxmoxGuest;
};

/** Synthetic guests: one VM at 93 % RAM, a CT still on its first network sample, one stopped. */
function mockGuests(busy: boolean): ProxmoxGuest[] {
  const up = hoursAgo(36 * 24 + 4);
  return [
    guestRow({
      vmid: 101,
      name: 'ha-vm',
      kind: 'vm',
      cpu_percent: busy ? 92 : 14,
      cpus: 2,
      mem_bytes: 3.72 * GIB,
      mem_max_bytes: 4 * GIB,
      mem_percent: 93,
      up_since: up,
      disk_max_bytes: 32 * GIB,
      netin_bps: 42_300,
      netout_bps: 18_100,
      netin_bytes: 118 * GIB,
      netout_bytes: 51 * GIB,
    }),
    guestRow({
      vmid: 102,
      name: 'web',
      kind: 'vm',
      cpu_percent: busy ? 97 : 31,
      cpus: 4,
      mem_bytes: 3.1 * GIB,
      mem_max_bytes: 8 * GIB,
      mem_percent: 38.8,
      up_since: up,
      disk_max_bytes: 64 * GIB,
      netin_bps: 1_840_000,
      netout_bps: 4_260_000,
      netin_bytes: 2.1 * 1024 * GIB,
      netout_bytes: 5.4 * 1024 * GIB,
    }),
    guestRow({
      vmid: 103,
      name: 'db',
      kind: 'ct',
      cpu_percent: 9,
      cpus: 2,
      mem_bytes: 1.4 * GIB,
      mem_max_bytes: 4 * GIB,
      mem_percent: 35,
      up_since: hoursAgo(2 * 24 + 5),
      disk_bytes: 9.3 * GIB,
      disk_max_bytes: 30 * GIB,
      disk_percent: 31,
      netin_bps: 310_000,
      netout_bps: 120_000,
      netin_bytes: 84 * GIB,
      netout_bytes: 22 * GIB,
    }),
    guestRow({
      vmid: 104,
      name: 'backup-ct',
      kind: 'ct',
      cpu_percent: 2,
      cpus: 1,
      mem_bytes: 0.31 * GIB,
      mem_max_bytes: 1 * GIB,
      mem_percent: 31,
      up_since: hoursAgo(0.4),
      disk_bytes: 92 * GIB,
      disk_max_bytes: 200 * GIB,
      disk_percent: 46,
      // Just started: the first counter sample, no rate yet.
      netin_bytes: 2.1 * 1024 ** 2,
      netout_bytes: 0.4 * 1024 ** 2,
    }),
    guestRow({
      vmid: 105,
      name: 'lab',
      kind: 'vm',
      status: 'stopped',
      cpus: 2,
      mem_max_bytes: 4 * GIB,
      disk_max_bytes: 32 * GIB,
    }),
  ];
}

const lvlBackup = (days: number): Level =>
  days >= 2 * BACKUP_DAYS ? 'critical' : days > BACKUP_DAYS ? 'warning' : 'ok';

function mockProxmox(scenario: ServerScenario): ProxmoxSnapshot {
  const empty = { node: null, guests: [], storages: [], backup: null };
  if (scenario === 'proxmox-down') return { status: 'down', ...empty };
  if (!scenario.startsWith('proxmox-') || scenario === 'proxmox-off')
    return { status: 'off', ...empty };

  const poolPct = scenario === 'proxmox-storage-critical' ? 96 : 42;
  const busy = scenario === 'proxmox-load';
  return {
    status: 'ok',
    // Same synthetic host as the Glances hero (Glances runs on the hypervisor itself).
    node: {
      name: 'pve',
      status: 'online',
      up_since: hoursAgo(HOST_UPTIME_H),
      cpu_percent: busy ? 96 : 21,
      cpus: 4,
      mem_bytes: 0.648 * TOTAL,
      mem_max_bytes: TOTAL,
      mem_percent: 64.8,
      disk_bytes: 38.5 * GIB,
      disk_max_bytes: 93.9 * GIB,
      disk_percent: 41,
    },
    guests: mockGuests(busy),
    storages: [
      {
        name: 'local',
        node: 'pve',
        percent: 22,
        used_bytes: 22 * GIB,
        total_bytes: 100 * GIB,
        active: true,
        level: 'ok',
      },
      {
        name: 'local-lvm',
        node: 'pve',
        percent: poolPct,
        used_bytes: poolPct * 5 * GIB,
        total_bytes: 500 * GIB,
        active: true,
        level: lvl(poolPct, 85, 95),
      },
    ],
    backup: mockBackup(scenario),
  };
}

export function createMockSnapshot(scenario: ServerScenario = 'ok'): ServerSnapshot {
  if (scenario === 'unconfigured')
    return {
      available: false,
      state: 'unconfigured',
      host: null,
      verdict: { severity: 'unknown', reasons: [] },
    };
  const host = { title: 'Proxmox (pve)', entry_id: 'demo' };
  if (scenario === 'proxmox-noglances')
    return {
      available: false,
      state: 'down',
      host,
      verdict: { severity: 'ok', reasons: [] },
      vms: { status: 'off', items: [] },
      proxmox: mockProxmox(scenario),
      thresholds: { memory: [85, 95], disk: [85, 95] },
    };
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
  const proxmox = mockProxmox(scenario);
  const reasons: Reason[] = [];
  for (const storage of proxmox.storages) {
    if (storage.level === 'critical')
      reasons.push({
        kind: 'storage',
        label: storage.name,
        value: storage.percent,
        level: storage.level,
      });
  }
  if (proxmox.backup?.ok === false)
    reasons.push({ kind: 'backup', label: '', value: null, level: 'warning' });
  const backupAge = proxmox.backup?.age_level;
  if (backupAge === 'warning' || backupAge === 'critical')
    reasons.push({
      kind: 'backup_age',
      label: '',
      value: proxmox.backup?.age_days ?? null,
      level: backupAge,
    });
  if (scenario === 'proxmox-load')
    reasons.push({ kind: 'load', label: 'zátěž', value: 4.7, level: 'warning' });
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
    // Live CPU stays inside the 24 h mock history band (peak ≈ 31 %).
    cpu:
      scenario === 'proxmox-load'
        ? { percent: 96.2, load: 4.7, load_avg: [5.31, 4.92, 4.7], cores: 4 }
        : {
            percent: scenario === 'ok' ? 18.6 : 24.3,
            load: 1.18,
            load_avg: [1.42, 1.31, 1.18],
            cores: 4,
          },
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
    diskio: {
      primary: 'nvme0n1',
      disks: [{ name: 'nvme0n1', read_bps: 2_410_000, write_bps: 862_000 }],
    },
    processes: { running: 2, total: 312 },
    up_since: hoursAgo(HOST_UPTIME_H),
    verdict: { severity, reasons },
    proxmox,
    vms:
      proxmox.status !== 'off' || scenario === 'noapi'
        ? { status: 'off', items: [] }
        : scenario === 'apidown'
          ? { status: 'down', items: [] }
          : { status: 'ok', items: VMS },
    thresholds: { memory: [85, 95], disk: [85, 95] },
  };
}

/** Deterministic 24 h of 5-minute means (smooth daily rhythm + small noise). */
export function createMockHistory(
  scenario: ServerScenario = 'ok',
  guest?: GuestRef,
): ServerHistory {
  if (guest) return guestHistory(scenario, guest);
  if (scenario === 'unconfigured' || scenario === 'down' || scenario === 'proxmox-noglances')
    return { hours: 24, series: {} };
  const end = Math.floor(Date.now() / 300_000) * 300_000;
  const n = 288;
  const wave = (i: number, base: number, amp: number, phase = 0, noise = 0.08) =>
    base +
    amp * Math.sin((i / n) * Math.PI * 2 + phase) +
    amp * noise * Math.sin(i * 0.37) +
    amp * noise * 0.6 * Math.cos(i * 0.13);
  const series = (fn: (i: number) => number): Array<[number, number]> =>
    Array.from({ length: n }, (_, i) => [end - (n - 1 - i) * 300_000, Math.round(fn(i) * 10) / 10]);
  // Same band as the live value in createMockSnapshot (only warn/crit run hot).
  const memBase = scenario === 'warn' || scenario === 'crit' ? 84 : 63;
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

/** 24 h CPU % and RAM % of one synthetic guest around its live value (stopped = none). */
function guestHistory(scenario: ServerScenario, ref: GuestRef): ServerHistory {
  const guest = mockProxmox(scenario).guests.find(
    (g) => g.vmid === ref.vmid && g.kind === ref.kind,
  );
  if (!guest || guest.status !== 'running') return { hours: 24, series: {} };
  const end = Math.floor(Date.now() / 300_000) * 300_000;
  const n = 288;
  const series = (base: number, amp: number, phase: number): Array<[number, number]> =>
    Array.from({ length: n }, (_, i) => {
      const v =
        base + amp * Math.sin((i / n) * Math.PI * 2 + phase) + amp * 0.2 * Math.sin(i * 0.41);
      return [end - (n - 1 - i) * 300_000, Math.round(Math.max(0, Math.min(100, v)) * 10) / 10];
    });
  const cpu = guest.cpu_percent ?? 0;
  const mem = guest.mem_percent ?? 0;
  return {
    hours: 24,
    series: {
      cpu: series(cpu * 0.8, Math.max(1, cpu * 0.35), ref.vmid),
      memory: series(mem - 1.5, 1.6, ref.vmid / 2),
    },
  };
}

export function createMockServerApi(opts: { scenario?: ServerScenario } = {}): ServerApi {
  const scenario = opts.scenario ?? 'ok';
  const wait = <T>(v: T) => new Promise<T>((r) => setTimeout(() => r(v), 250));
  return {
    get: () => wait(createMockSnapshot(scenario)),
    history: (_hours, guest) => wait(createMockHistory(scenario, guest)),
  };
}

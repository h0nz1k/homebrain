import { describe, expect, it } from 'vitest';
import {
  barTone,
  daysAgoLabel,
  daysLabel,
  diskName,
  durationLabel,
  fmtBytes,
  fmtPct,
  fmtRate,
  heroModel,
  seriesMax,
  smoothSeries,
  hostConsumers,
  hostShare,
  loadModel,
  sortGuests,
  uptimeLabel,
  uptimeShort,
  vmRows,
} from './format.js';
import { createMockHistory, createMockSnapshot } from './mock.js';

const NB = '\u00a0';

describe('formáty', () => {
  it('bajty v binárních jednotkách s desetinnou čárkou', () => {
    expect(fmtBytes(24310 * 1024 ** 2)).toBe(`23,7${NB}GiB`);
    expect(fmtBytes(512 * 1024 ** 2)).toBe(`512${NB}MiB`);
    expect(fmtBytes(null)).toBe('–');
  });
  it('rychlost sítě', () => {
    expect(fmtRate(152_400)).toBe(`152${NB}kB/s`);
    expect(fmtRate(1_250_000)).toBe(`1,3${NB}MB/s`);
    expect(fmtRate(320)).toBe(`320${NB}B/s`);
  });
  it('procenta a uptime', () => {
    expect(fmtPct(74.2)).toBe(`74${NB}%`);
    const now = Date.parse('2026-11-08T12:00:00Z');
    expect(uptimeLabel('2026-10-30T06:00:00Z', now)).toBe(`běží 9${NB}dní 6${NB}h`);
    expect(uptimeLabel('2026-11-08T11:20:00Z', now)).toBe(`běží 40${NB}min`);
    expect(uptimeLabel(null, now)).toBeNull();
  });
  it('disk / je systémový', () => {
    expect(diskName('/')).toBe('Systémový disk');
    expect(diskName('/mnt/data')).toBe('/mnt/data');
  });
  it('tón pruhu podle prahů', () => {
    expect(barTone(84, [85, 95])).toBe('ok');
    expect(barTone(85, [85, 95])).toBe('warn');
    expect(barTone(97, [85, 95])).toBe('crit');
  });
});

describe('trend', () => {
  it('zhladí 288 bodů do průměrů po skupinách', () => {
    const raw = Array.from({ length: 288 }, (_, i) => (i % 2 ? 10 : 20));
    const out = smoothSeries(raw, 72);
    expect(out).toHaveLength(72);
    expect(out.every((v) => v === 15)).toBe(true);
    expect(smoothSeries([1, 2, 3], 72)).toEqual([1, 2, 3]);
  });
});

describe('hero verdikt', () => {
  it('v pořádku', () => {
    const hero = heroModel(createMockSnapshot('ok'));
    expect(hero.headline).toBe('V pořádku');
    expect(hero.tone).toBe('ok');
  });
  it('pozor: paměť', () => {
    const hero = heroModel(createMockSnapshot('warn'));
    expect(hero.headline).toBe(`Pozor: paměť 87${NB}%`);
    expect(hero.tone).toBe('warn');
  });
  it('kritické první, další důvody v kontextu', () => {
    const hero = heroModel(createMockSnapshot('crit'));
    expect(hero.headline).toBe(`Kritické: systémový disk 96${NB}%`);
    expect(hero.more).toEqual([`paměť 88${NB}%`]);
  });
  it('server nedostupný', () => {
    expect(heroModel(createMockSnapshot('down')).headline).toBe('Server nedostupný');
  });
  it('hostitel v pořádku, host s plnou pamětí = upozornění s cílem na jeho řádek', () => {
    const hero = heroModel(createMockSnapshot('proxmox-ok'));
    expect(hero.headline).toBe(`1 upozornění · ha-vm má plnou paměť (93${NB}%)`);
    expect(hero.tone).toBe('warn');
    expect(hero.target).toBe('server-guest-vm-101');
  });
  it('problém hostitele vede, hosté jdou do „Dále“', () => {
    const hero = heroModel(createMockSnapshot('proxmox-load'));
    expect(hero.headline).toBe('Pozor: zátěž 4,7 na 4 jádra');
    expect(hero.more).toContain(`ha-vm má plnou paměť (93${NB}%)`);
    expect(hero.more).toContain(`web vytěžuje procesor (97${NB}%)`);
  });
});

describe('mock', () => {
  it('most vmbr0 nese aspoň součet provozu hostů', () => {
    const snap = createMockSnapshot('proxmox-ok');
    const bridge = snap.network!.interfaces.find((i) => i.name === 'vmbr0')!;
    const sum = (k: 'netin_bps' | 'netout_bps') =>
      snap.proxmox!.guests.reduce((s, g) => s + (g[k] ?? 0), 0);
    expect(bridge.rx_bps!).toBeGreaterThanOrEqual(sum('netin_bps'));
    expect(bridge.tx_bps!).toBeGreaterThanOrEqual(sum('netout_bps'));
  });
  it('historie hosta: CPU a RAM mají odlišný průběh', () => {
    const { series } = createMockHistory('proxmox-ok', { vmid: 101, kind: 'vm' });
    const cpu = series.cpu!.map(([, v]) => v);
    const mem = series.memory!.map(([, v]) => v);
    expect(Math.max(...mem)).toBeGreaterThan(85);
    expect(Math.max(...cpu)).toBeLessThan(40);
    expect(Math.abs(mem.at(-1)! - 93)).toBeLessThan(2);
  });
});

describe('virtuální stroje', () => {
  it('seřazené podle RAM s podílem pro pruhy', () => {
    const rows = vmRows(createMockSnapshot('ok'));
    expect(rows.map((r) => r.vmid)).toEqual([101, 102, 103, 104]);
    expect(rows[0]!.memShare).toBeGreaterThan(rows[1]!.memShare);
    expect(rows[0]!.memLabel).toBe(`8,0${NB}GiB`);
  });
});

describe('zálohy', () => {
  it('relativní stáří, dny a trvání česky', () => {
    expect(daysAgoLabel(0)).toBe('dnes');
    expect(daysAgoLabel(1)).toBe('včera');
    expect(daysAgoLabel(395)).toBe(`před 395${NB}dny`);
    expect(daysLabel(1)).toBe(`1${NB}den`);
    expect(daysLabel(3)).toBe(`3${NB}dny`);
    expect(daysLabel(10)).toBe(`10${NB}dní`);
    expect(durationLabel(17)).toBe(`17${NB}s`);
    expect(durationLabel(185)).toBe(`3${NB}min 5${NB}s`);
    expect(durationLabel(3840)).toBe(`1${NB}h 4${NB}min`);
  });
});

describe('Proxmox a trendy', () => {
  it('řadí běžící hosty podle CPU, vypnuté na konec podle ID', () => {
    const rows = sortGuests([
      { vmid: 104, status: 'stopped', cpu_percent: 50 },
      { vmid: 103, status: 'running', cpu_percent: 40 },
      { vmid: 100, status: 'stopped' },
      { vmid: 101, status: 'running', cpu_percent: 2 },
      { vmid: 102, status: 'running', cpu_percent: null },
    ]);
    expect(rows.map((g) => g.vmid)).toEqual([103, 101, 102, 100, 104]);
  });

  it('podíl hosta na hostiteli = CPU % × vCPU / jádra', () => {
    expect(hostShare({ cpu_percent: 50, cpus: 2 }, 4)).toBe(25);
    expect(hostShare({ cpu_percent: 50, cpus: null }, 4)).toBe(12.5);
    expect(hostShare({ cpu_percent: 100, cpus: 8 }, 4)).toBe(100);
    expect(hostShare({ cpu_percent: null, cpus: 2 }, 4)).toBeNull();
    expect(hostShare({ cpu_percent: 10, cpus: 2 }, null)).toBeNull();
    const names = hostConsumers(createMockSnapshot('proxmox-ok')).map((c) => c.name);
    expect(names).toEqual(['web', 'ha-vm', 'db']); // backup-ct 0,5 % is below 1 %
  });

  it('zátěž proti jádrům: pozor až nad jejich počtem', () => {
    expect(loadModel(createMockSnapshot('proxmox-ok'))).toEqual({
      value: `1,2 na 4 jádra`,
      avg: '1,42 / 1,31 / 1,18',
      tone: 'ok',
    });
    expect(loadModel(createMockSnapshot('proxmox-load'))?.tone).toBe('warn');
    const noCores = createMockSnapshot('ok');
    noCores.cpu = { percent: 10, load: 2, cores: null };
    expect(loadModel(noCores)).toEqual({ value: '2,0', avg: null, tone: 'neutral' });
  });

  it('krátká doba běhu hosta', () => {
    const now = Date.parse('2026-11-23T12:00:00Z');
    expect(uptimeShort('2026-10-18T08:00:00Z', now)).toBe(`běží 36${NB}dní`);
    expect(uptimeShort('2026-11-23T07:00:00Z', now)).toBe(`běží 5${NB}h`);
    expect(uptimeShort('2026-11-23T11:48:00Z', now)).toBe(`běží 12${NB}min`);
    expect(uptimeShort(null, now)).toBeNull();
  });

  it('max za 24 h počítá ze surových vzorků a nikdy není pod aktuální hodnotou', () => {
    expect(seriesMax([10, 31, 20], 41)).toBe(41);
    expect(seriesMax([10, 31, 20], 12)).toBe(31);
    expect(seriesMax([10, 31, 20])).toBe(31);
    expect(seriesMax([], null)).toBeNull();
  });

  it('hero ukazuje na kartu s důkazem', () => {
    expect(heroModel(createMockSnapshot('proxmox-backup-stale')).target).toBe(
      'server-proxmox-backup',
    );
    expect(heroModel(createMockSnapshot('proxmox-storage-critical')).target).toBe(
      'server-proxmox-storages',
    );
    expect(heroModel(createMockSnapshot('warn')).target).toBeUndefined();
    expect(heroModel(createMockSnapshot('ok')).target).toBeUndefined();
  });
});

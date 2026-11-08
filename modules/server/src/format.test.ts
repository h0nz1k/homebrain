import { describe, expect, it } from 'vitest';
import {
  barTone,
  diskName,
  fmtBytes,
  fmtPct,
  fmtRate,
  heroModel,
  smoothSeries,
  uptimeLabel,
  vmRows,
} from './format.js';
import { createMockSnapshot } from './mock.js';

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
});

describe('virtuální stroje', () => {
  it('seřazené podle RAM s podílem pro pruhy', () => {
    const rows = vmRows(createMockSnapshot('ok'));
    expect(rows.map((r) => r.vmid)).toEqual([101, 102, 103, 104]);
    expect(rows[0]!.memShare).toBeGreaterThan(rows[1]!.memShare);
    expect(rows[0]!.memLabel).toBe(`8,0${NB}GiB`);
  });
});

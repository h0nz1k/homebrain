import { describe, expect, it } from 'vitest';
import { countLabel, floorRows, heroModel, loadRows, speedLabel, statTiles } from './format.js';
import { createMockNetworkApi } from './mock.js';
import { networkSignals } from './signal.js';

const NOW = 1_800_000_000;
const snap = (scenario: 'problems' | 'ok' | 'down' | 'empty') =>
  createMockNetworkApi({ scenario, now: () => NOW }).get();

describe('Síť format', () => {
  it('hero headline = top problem, badge counts problems and tips', async () => {
    const s = await snap('problems');
    expect(heroModel(s)).toMatchObject({
      severity: 'warning',
      headline: 'Terasa vypadává',
      badge: '3 problémy · 2 tipy',
    });
    expect(heroModel(s).context).toContain('Internet je v pořádku.');
  });

  it('calm hero when nothing is wrong, critical when internet is down', async () => {
    expect(heroModel(await snap('ok'))).toMatchObject({
      severity: 'ok',
      headline: 'Síť v pořádku',
      badge: 'Vše v pořádku',
    });
    const down = heroModel(await snap('down'));
    expect(down).toMatchObject({ severity: 'critical', headline: 'Internet nefunguje' });
    expect(down.context).not.toContain('Internet je v pořádku');
  });

  it('stat tiles: internet latency, APs online, devices split', async () => {
    const tiles = statTiles(await snap('problems'));
    expect(tiles.map((t) => [t.id, t.value])).toEqual([
      ['internet', '14 ms'],
      ['aps', '7 / 7'],
      ['switches', '3 / 3'],
      ['clients', '31'],
    ]);
    expect(tiles[1]!.tone).toBe('warn');
  });

  it('floors top-down with outdoor last and switches on their floor', async () => {
    const rows = floorRows(await snap('problems'));
    expect(rows.map((r) => r.name)).toEqual(['2. patro', '1. patro', 'Přízemí', '-1. patro', 'Venku']);
    expect(rows.find((r) => r.id === 'outdoor')!.aps[0]).toMatchObject({ name: 'Terasa', problem: 'warning' });
    expect(rows.find((r) => r.id === 'fm1')!.switches).toBe(3);
  });

  it('load rows sorted by clients with a share sentence', async () => {
    const { rows, note } = loadRows(await snap('problems'));
    expect(rows[0]).toMatchObject({ name: 'Pracovna', clients: 8, frac: 1 });
    expect(note).toBe('Rozložení je v normě – nejvíc má Pracovna (26 %).');
  });

  it('czech labels', () => {
    expect(countLabel({ problems_count: 1, tips_count: 5 })).toBe('1 problém · 5 tipů');
    expect(speedLabel(2500)).toBe('2,5 G');
    expect(speedLabel(100)).toBe('100 M');
  });
});

describe('Síť roles (mock mirrors the server)', () => {
  it('kiosk gets the summary and the QR, never the snapshot or settings', async () => {
    const api = createMockNetworkApi({ role: 'kiosk' });
    await expect(api.get()).rejects.toThrow('unauthorized');
    await expect(api.settings()).rejects.toThrow('unauthorized');
    expect((await api.summary()).headline).toBe('Terasa vypadává');
    expect((await api.guestQr()).qr_payload).toContain('WIFI:T:WPA;S:Host demo;');
  });
});

describe('Dnes signal', () => {
  it('only when there is a problem, headline only', async () => {
    const s = await snap('problems');
    const [sig] = networkSignals(s.summary, NOW * 1000);
    expect(sig).toMatchObject({ module: 'network', title: 'Síť · Terasa vypadává (+2 další)' });
    expect(networkSignals((await snap('ok')).summary, NOW * 1000)).toEqual([]);
    expect(networkSignals((await snap('down')).summary, NOW * 1000)[0]!.severity).toBe('warning');
  });
});

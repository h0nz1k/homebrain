import { describe, expect, it } from 'vitest';
import {
  countLabel,
  floorLabel,
  floorRows,
  glue,
  heroModel,
  loadRows,
  speedLabel,
  splitProblems,
  statTiles,
} from './format.js';
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
    // The detail sentence stays in the problem card only.
    expect(heroModel(s).context).not.toContain('odpojeno');
    expect(heroModel(s).topId).toBe('ap-terasa');
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
    // All 7 APs are online: the count stays calm, only „1 nestabilní“ is amber.
    expect(tiles[1]).toMatchObject({ tone: 'ok', detail: '1 nestabilní', detailTone: 'warn' });
  });

  it('floors top-down with outdoor last and switches on their floor', async () => {
    const rows = floorRows(await snap('problems'));
    expect(rows.map((r) => r.name)).toEqual([
      '2. patro',
      '1. patro',
      'Přízemí',
      '\u22121. patro',
      'Venku',
    ]);
    expect(rows.find((r) => r.id === 'outdoor')!.aps[0]).toMatchObject({
      name: 'Terasa',
      problem: 'warning',
    });
    expect(rows.find((r) => r.id === 'fm1')!.switches).toBe(3);
  });

  it('load rows sorted by clients with a share sentence', async () => {
    const { rows, note } = loadRows(await snap('problems'));
    expect(rows[0]).toMatchObject({ name: 'Pracovna', clients: 8, frac: 1 });
    expect(note).toBe('Rozložení je v normě – nejvíc má Pracovna (26 %).');
  });

  it('glue keeps numbers with units and one-letter prepositions on one line', () => {
    expect(glue('nejvíc má Pracovna (26 %).')).toBe('nejvíc má Pracovna (26\u00a0%).');
    expect(glue('zapojte do USW Ultra (zbývá 30 W).')).toBe(
      'zapojte do USW Ultra (zbývá 30\u00a0W).',
    );
    expect(glue('Připojený k Pracovna (-1. patro) v Přízemí, 41 min.')).toBe(
      'Připojený k\u00a0Pracovna (\u22121. patro) v\u00a0Přízemí, 41\u00a0min.',
    );
    expect(glue('3 switche, 2 hodiny')).toBe('3 switche, 2 hodiny');
    expect(floorLabel('-1. patro')).toBe('\u22121. patro');
  });

  it('problems ordered by severity, tips after them', () => {
    const mk = (id: string, severity: 'critical' | 'warning' | 'notice' | 'info') =>
      ({ id, severity }) as never;
    const { serious, tips } = splitProblems([
      mk('a', 'warning'),
      mk('b', 'info'),
      mk('c', 'critical'),
      mk('d', 'notice'),
    ]);
    expect(serious.map((p: { id: string }) => p.id)).toEqual(['c', 'a']);
    expect(tips.map((p: { id: string }) => p.id)).toEqual(['d', 'b']);
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

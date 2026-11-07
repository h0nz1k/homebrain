import { describe, expect, it } from 'vitest';
import {
  countLabel,
  floorLabel,
  floorRows,
  glue,
  heroModel,
  loadRows,
  radioText,
  signalBars,
  sourceModel,
  speedLabel,
  splitProblems,
  statTiles,
  unifiAccountLabel,
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

describe('Síť V2 (vlastní účet UniFi)', () => {
  const unifiSnap = () =>
    createMockNetworkApi({ scenario: 'problems', unifi: true, now: () => NOW }).get();

  it('signal bars follow the dBm thresholds of the rules', () => {
    expect([-50, -60, -70, -80].map(signalBars)).toEqual([4, 3, 2, 1]);
    expect(signalBars(null)).toBeNull();
  });

  it('radio line shows channel, utilisation and interference only when it matters', () => {
    const base = { band: '5', channel: 44, self_pct: 9, clients: 3, satisfaction: 90 } as const;
    expect(radioText({ ...base, utilization_pct: 68, interference_pct: 59 })).toBe(
      '5 GHz · kanál 44 · 68 % (rušení 59 %)',
    );
    expect(radioText({ ...base, band: '2.4', utilization_pct: 12, interference_pct: 3 })).toBe(
      '2,4 GHz · kanál 44 · 12 %',
    );
  });

  it('source indicator: HA only with a setup hint, HA + UniFi, login problems', async () => {
    const plain = await snap('ok');
    expect(sourceModel(plain)).toMatchObject({ label: 'Zdroj: HA', tone: 'neutral' });
    expect(sourceModel(plain).note).toContain('Síť – UniFi');
    const s = await unifiSnap();
    expect(sourceModel(s)).toEqual({ label: 'Zdroj: HA + UniFi', tone: 'ok', note: null });
    expect(
      sourceModel({ ...s, unifi: { configured: true, status: 'ok', readonly: false } }),
    ).toMatchObject({ tone: 'warn' });
    expect(
      sourceModel({ ...s, unifi: { configured: true, status: 'auth_failed' } }).note,
    ).toContain('heslo');
  });

  it('settings label names the UniFi account and where it comes from', () => {
    expect(
      unifiAccountLabel({ configured: true, source: 'ha_integration', account: 'ha' }),
    ).toBe('Účet: ha (z integrace UniFi)');
    expect(unifiAccountLabel({ configured: true, source: 'manual', account: 'homebrain' })).toBe(
      'Účet: homebrain (vlastní účet)',
    );
    expect(unifiAccountLabel({ configured: false })).toBeNull();
    expect(unifiAccountLabel({ configured: true, source: 'ha_integration', account: null })).toBe(
      'Účet: z integrace UniFi',
    );
  });

  it('missing HA UniFi integration is a calm hint, not a warning', async () => {
    const s = await unifiSnap();
    const m = sourceModel({
      ...s,
      source: 'ha',
      unifi: { configured: true, status: 'unifi_source_missing', source: 'ha_integration' },
    });
    expect(m).toMatchObject({ label: 'Zdroj: HA', tone: 'neutral' });
    expect(m.note).toContain('Integrace UniFi v HA');
    expect(
      sourceModel({
        ...s,
        unifi: { configured: true, status: 'auth_failed', source: 'ha_integration' },
      }).note,
    ).toContain('integraci UniFi v HA');
  });

  it('mock V2 data fills AP radios, client signal and the new rules', async () => {
    const s = await unifiSnap();
    const rows = loadRows(s).rows;
    expect(rows.find((r) => r.id === 'ap-obyvak')?.radios).toHaveLength(2);
    expect(s.clients.find((c) => c.id === 'c-tablet')?.signal_dbm).toBe(-77);
    expect(s.problems.map((p) => p.rule)).toEqual(
      expect.arrayContaining(['mesh_weak', 'important_weak_signal', 'channel_congested']),
    );
    expect(s.summary.problems_count).toBe(
      s.problems.filter((p) => p.severity === 'critical' || p.severity === 'warning').length,
    );
    const graph = await createMockNetworkApi({ unifi: true, now: () => NOW }).topology();
    expect(graph.meta.source).toBe('ha+unifi');
    const mesh = graph.edges.find((e) => e.to === 'ap-podkrovi');
    expect(mesh?.signal_dbm).toBe(-69);
    expect(
      graph.edges.some((e) => e.from === 'sw-lite' && e.to.startsWith('client:') && !e.assumed),
    ).toBe(true);
  });
});

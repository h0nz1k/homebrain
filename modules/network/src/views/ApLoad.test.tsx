import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { createMockNetworkApi } from '../mock.js';
import type { NetSnapshot } from '../types.js';
import { ApLoad } from './ApLoad.js';

const snap = (scenario: 'ok' | 'problems', unifi = true): Promise<NetSnapshot> =>
  createMockNetworkApi({ role: 'owner', scenario, unifi }).get();

const row = (id: string) =>
  screen.getAllByTestId('network-ap-load').find((el) => el.dataset.ap === id)!;
const flags = (id: string) =>
  within(row(id))
    .queryAllByTestId('network-ap-flag')
    .map((f) => f.dataset.flag);

afterEach(cleanup);

describe('ApLoad (Zátěž Wi-Fi bodů)', () => {
  it('normal: no flags, compact band chips, CPU/RAM only in the tooltip, % explained', async () => {
    render(<ApLoad snap={await snap('ok')} />);
    expect(screen.queryAllByTestId('network-ap-flag')).toHaveLength(0);
    expect(screen.queryAllByTestId('network-ap-why')).toHaveLength(0);
    const pracovna = row('ap-pracovna');
    expect(pracovna.dataset.tone).toBe('ok');
    const bands = within(pracovna).getAllByTestId('network-ap-band');
    expect(bands.map((b) => b.textContent)).toEqual([
      '2,4\u00a0GHz · k.\u00a01' + '24\u00a0%',
      '5\u00a0GHz · k.\u00a036' + '34\u00a0%',
    ]);
    expect(bands[1]!.title).toContain('obsazený 34\u00a0% času');
    // RAM 71 % is normal for UniFi APs: never shown as row text.
    expect(pracovna.textContent).not.toContain('RAM');
    expect(within(pracovna).getByTestId('network-ap-clients').textContent).toBe('8klientů');
    expect(screen.getByTestId('network-load-legend').textContent).toContain('vytížení kanálu');
  });

  it('mesh weak: warn chip with dBm and a plain-language reason', async () => {
    render(<ApLoad snap={await snap('problems')} />);
    const podkrovi = row('ap-podkrovi');
    expect(podkrovi.dataset.tone).toBe('warn');
    const flag = within(podkrovi).getByTestId('network-ap-flag');
    expect(flag.textContent).toMatch(/^Mesh: slabý signál\s\u221269\sdBm$/);
    expect(within(podkrovi).getByTestId('network-ap-why').textContent).toContain(
      'připojený bezdrátově k\u00a0hlavnímu AP',
    );
  });

  it('high utilisation: crit chip + crit band, struggling APs sorted first', async () => {
    render(<ApLoad snap={await snap('problems')} />);
    const rows = screen.getAllByTestId('network-ap-load');
    expect(rows[0]!.dataset.ap).toBe('ap-obyvak');
    const rank = rows.map((r) => ['crit', 'warn', 'ok'].indexOf(r.dataset.tone!));
    expect(rank).toEqual([...rank].sort((a, b) => a - b));
    expect(flags('ap-obyvak')).toEqual(['channel_busy']);
    const busy = within(row('ap-obyvak')).getAllByTestId('network-ap-band')[1]!;
    expect(busy.dataset.tone).toBe('crit');
    expect(within(row('ap-obyvak')).getByTestId('network-ap-why').textContent).toContain(
      'vlastní provoz jen 9\u00a0%',
    );
    // 50–74 % = warn colour on the band only, no alarm chip.
    const kuchyn = within(row('ap-kuchyn')).getAllByTestId('network-ap-band');
    expect(kuchyn[0]!.dataset.tone).toBe('warn');
    expect(flags('ap-kuchyn')).toEqual([]);
  });

  it('AP without 5 GHz shows a single band chip', async () => {
    render(<ApLoad snap={await snap('ok')} />);
    const bands = within(row('ap-dilna')).getAllByTestId('network-ap-band');
    expect(bands).toHaveLength(1);
    expect(bands[0]!.textContent).toContain('2,4\u00a0GHz');
  });

  it('offline AP: crit chip, no client count, no bands; high RAM is flagged', async () => {
    const s = await snap('ok');
    s.aps = s.aps.map((a) =>
      a.id === 'ap-loznice'
        ? { ...a, state: 'disconnected' }
        : a.id === 'ap-kuchyn'
          ? { ...a, mem_pct: 93 }
          : a,
    );
    render(<ApLoad snap={s} />);
    const loznice = row('ap-loznice');
    expect(flags('ap-loznice')).toEqual(['offline']);
    expect(loznice.dataset.offline).toBe('true');
    expect(within(loznice).getByTestId('network-ap-clients').textContent).toBe('–klientů');
    expect(within(loznice).queryAllByTestId('network-ap-band')).toHaveLength(0);
    expect(screen.getAllByTestId('network-ap-load')[0]).toBe(loznice);
    expect(flags('ap-kuchyn')).toEqual(['mem']);
  });

  it('HA-only data (no UniFi radios): no band chips and no % legend', async () => {
    render(<ApLoad snap={await snap('ok', false)} />);
    expect(screen.queryAllByTestId('network-ap-band')).toHaveLength(0);
    expect(screen.queryByTestId('network-load-legend')).toBeNull();
    expect(screen.getByText('klienti teď')).toBeTruthy();
  });
});

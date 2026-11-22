import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { ModuleViewProps } from '@homebrain/ha-client';
import { setServerApiFactory } from '../api.js';
import { createMockServerApi, type ServerScenario } from '../mock.js';
import ServerView from './ServerView.js';

const NB = '\u00a0';
afterEach(cleanup);

function show(scenario: ServerScenario) {
  setServerApiFactory(() => createMockServerApi({ scenario }));
  render(<ServerView {...({ connection: {} } as unknown as ModuleViewProps)} />);
}

describe('ServerView', () => {
  it('načítá se skeletonem a pak ukáže verdikt, dlaždice a VM podle RAM', async () => {
    show('ok');
    expect(screen.getByTestId('server-loading')).toBeTruthy();
    expect((await screen.findByTestId('server-headline')).textContent).toBe('V pořádku');
    expect(screen.getByTestId('server-hero').textContent).toContain(`běží 9${NB}dní`);
    for (const id of ['cpu', 'ram', 'temp', 'net'])
      expect(screen.getByTestId(`server-tile-${id}`)).toBeTruthy();
    expect(screen.getAllByTestId('server-disk')).toHaveLength(3);
    const vms = screen.getAllByTestId('server-vm');
    expect(vms.map((v) => v.getAttribute('data-vmid'))).toEqual(['101', '102', '103', '104']);
    expect(vms[0]!.textContent).toContain('home-assistant');
  });

  it('pozor na paměť obarví hero i dlaždici RAM', async () => {
    show('warn');
    expect((await screen.findByTestId('server-headline')).textContent).toBe(
      `Pozor: paměť 87${NB}%`,
    );
    expect(screen.getByTestId('server-tile-ram').getAttribute('data-tone')).toBe('warn');
  });

  it('nedostupný server je klidný stav bez dlaždic', async () => {
    show('down');
    expect((await screen.findByTestId('server-headline')).textContent).toBe('Server nedostupný');
    expect(screen.queryByTestId('server-tile-cpu')).toBeNull();
  });

  it('bez Glances API vysvětlí, odkud se berou VM', async () => {
    show('noapi');
    expect((await screen.findByTestId('server-vms-note')).textContent).toContain('Glances API');
  });

  it('nepřipojené Glances = prázdný stav', async () => {
    show('unconfigured');
    expect((await screen.findByText('Glances nenalezeno')).tagName).toBe('H2');
  });
});

describe('Proxmox VE', () => {
  it('ukáže data uzlu, běžící hosty nahoře a vypnutou VM bez chybějících metrik', async () => {
    show('proxmox-ok');
    expect((await screen.findByTestId('server-headline')).textContent).toBe('V pořádku');
    expect(screen.getByText('Online')).toBeTruthy();
    expect(screen.queryByTestId('server-vms')).toBeNull();
    const guests = screen.getAllByTestId('server-proxmox-guest');
    expect(guests.map((row) => row.querySelector('b')?.textContent)).toEqual([
      'web-01',
      'db-ct',
      'batch-01',
    ]);
    expect(guests[0]?.textContent).toContain(`Příjem 12,0${NB}GiB`);
    expect(guests[1]?.textContent).toContain(`Disk 58${NB}%`);
    expect(guests[2]?.getAttribute('data-stopped')).toBe('true');
    expect(guests[2]?.textContent).not.toMatch(/RAM|CPU|Příjem|Odesílání/);
    expect(screen.getAllByTestId('server-proxmox-storage')).toHaveLength(2);
    expect(screen.getByTestId('server-proxmox-backup').textContent).toContain('Úspěšná');
    expect(screen.getByTestId('server-backup-age').textContent).toBe('dnes');
    expect(screen.queryByTestId('server-backup-stale')).toBeNull();
  });

  it('bez integrace ponechá odhad z Glances', async () => {
    show('proxmox-off');
    expect(await screen.findByTestId('server-vms')).toBeTruthy();
    expect(screen.queryByTestId('server-proxmox')).toBeNull();
  });

  it('při výpadku Proxmoxu zachová metriky Glances', async () => {
    show('proxmox-down');
    expect(await screen.findByText('Proxmox nedostupný')).toBeTruthy();
    expect(screen.getByTestId('server-tile-cpu')).toBeTruthy();
    expect(screen.queryByTestId('server-vms')).toBeNull();
  });

  it('propíše neúspěšnou zálohu do verdiktu', async () => {
    show('proxmox-backup-failed');
    expect((await screen.findByTestId('server-headline')).textContent).toBe(
      'Pozor: záloha selhala',
    );
    expect(screen.getByTestId('server-proxmox-backup').textContent).toContain('Selhala');
  });

  it('zastaralou zálohu ukáže relativně i absolutně a propíše do verdiktu', async () => {
    show('proxmox-backup-stale');
    expect((await screen.findByTestId('server-headline')).textContent).toBe(
      `Kritické: poslední záloha je stará 395${NB}dní`,
    );
    const card = screen.getByTestId('server-proxmox-backup');
    expect(card.getAttribute('data-tone')).toBe('crit');
    expect(screen.getByTestId('server-backup-age').textContent).toBe(`před 395${NB}dny`);
    expect(card.querySelector('time')?.getAttribute('dateTime')).toBeTruthy();
    expect(card.textContent).toContain(`17${NB}s`);
    expect(card.textContent).toContain('Úspěšná');
    expect(screen.getByTestId('server-backup-stale').textContent).toBe('Zastaralá');
    expect(screen.getByTestId('server-backup-warning').textContent).toContain(
      `Poslední záloha je stará 395${NB}dní`,
    );
  });

  it('bez senzoru zálohy nevaruje, jen řekne, že údaje chybí', async () => {
    show('proxmox-backup-missing');
    expect((await screen.findByTestId('server-headline')).textContent).toBe('V pořádku');
    const card = screen.getByTestId('server-proxmox-backup');
    expect(card.textContent).toContain('Údaje o zálohách nejsou k dispozici');
    expect(card.getAttribute('data-tone')).toBeNull();
    expect(screen.queryByTestId('server-backup-stale')).toBeNull();
  });

  it('propíše kritické úložiště do verdiktu i pruhu', async () => {
    show('proxmox-storage-critical');
    expect((await screen.findByTestId('server-headline')).textContent).toBe(
      `Kritické: úložiště local-lvm 96${NB}%`,
    );
    expect(screen.getByRole('meter', { name: 'local-lvm' }).getAttribute('data-tone')).toBe('crit');
  });
});

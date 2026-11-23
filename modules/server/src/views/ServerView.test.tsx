import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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
  it('jedna karta hostitele: Proxmox · pve, zátěž, disk I/O, úložiště a záloha', async () => {
    show('proxmox-ok');
    expect((await screen.findByTestId('server-headline')).textContent).toBe('V pořádku');
    const hero = screen.getByTestId('server-hero');
    expect(screen.getByTestId('server-host-meta').textContent).toContain('Proxmox · pve');
    expect(screen.getByTestId('server-node-state').textContent).toBe('Online');
    expect(hero.textContent).toContain(`běží 9${NB}dní`);
    expect(screen.queryByTestId('server-proxmox-node')).toBeNull(); // no second host card
    expect(screen.getByTestId('server-host-load').textContent).toContain(`1,2 na 4 jádra`);
    expect(screen.getByTestId('server-host-load').getAttribute('data-tone')).toBeNull();
    expect(screen.getByTestId('server-host-diskio').textContent).toContain(`čtení 2,4${NB}MB/s`);
    expect(screen.getByTestId('server-host-backup').textContent).toBe('dnes · úspěšná');
    const storages = screen.getAllByTestId('server-proxmox-storage');
    expect(storages).toHaveLength(2);
    expect(hero.contains(storages[0]!)).toBe(true);
    // Single node: its name is in the card title only.
    expect(storages.some((row) => row.textContent?.includes('pve'))).toBe(false);
    // web 31 % × 4 vCPU / 4 cores = 31 %, ha-vm 14 % × 2 / 4 = 7 %, db 9 % × 2 / 4 ≈ 5 %.
    expect(screen.getByTestId('server-host-consumers').textContent).toBe(
      `Kdo vytěžuje hostiteleweb 31${NB}%ha-vm 7${NB}%db 5${NB}%`,
    );
    expect(screen.queryByTestId('server-vms')).toBeNull();
    expect(screen.queryByTestId('server-hero-fix')).toBeNull();
    expect(screen.getByTestId('server-backup-run').textContent).toBe('úspěšný');
    expect(screen.getByTestId('server-backup-age').textContent).toBe('dnes');
    expect(screen.queryByTestId('server-backup-stale')).toBeNull();
  });

  it('hosté: běžící podle CPU, VM jen přidělený disk, rychlost sítě, vypnutý na konci', async () => {
    show('proxmox-ok');
    await screen.findByTestId('server-headline');
    const guests = screen.getAllByTestId('server-proxmox-guest');
    expect(guests.map((row) => row.querySelector('b')?.textContent)).toEqual([
      'web',
      'ha-vm',
      'db',
      'backup-ct',
      'lab',
    ]);
    const [web, ha, db, backup, lab] = guests;
    expect(web!.textContent).toContain(`VM 102`);
    expect(web!.textContent).toContain(`31${NB}% · 4${NB}vCPU`);
    expect(web!.textContent).toContain(`přiděleno 64,0${NB}GiB`);
    expect(web!.textContent).toContain(`↓${NB}1,8${NB}MB/s ↑${NB}4,3${NB}MB/s`);
    expect(web!.textContent).toContain(`běží 36${NB}dní`);
    // RAM 93 % = warning (rules.MEMORY), shown on the RAM metric only.
    const ram = ha!.querySelector('.srv-gm[data-tone="warn"]');
    expect(ram?.textContent).toContain(`3,7${NB}GiB z 4,0${NB}GiB`);
    expect(db!.textContent).toContain(`CT 103`);
    expect(db!.textContent).toContain(`9,3${NB}GiB z 30,0${NB}GiB`);
    expect(backup!.textContent).toContain('měří se…');
    expect(lab!.getAttribute('data-stopped')).toBe('true');
    expect(lab!.querySelector('[data-testid="server-guest-metrics"]')).toBeNull();
    expect(lab!.textContent).toContain(`2${NB}vCPU · 4,0${NB}GiB RAM · přiděleno 32,0${NB}GiB`);
    expect(
      guests.map((row) => row.querySelector('[data-testid="server-guest-state"]')?.textContent),
    ).toEqual(['Běží', 'Běží', 'Běží', 'Běží', 'Vypnuto']);
  });

  it('klepnutí na hosta otevře detail s grafy CPU a RAM za 24 h', async () => {
    show('proxmox-ok');
    await screen.findByTestId('server-headline');
    fireEvent.click(screen.getByRole('button', { name: /^ha-vm, VM 101/ }));
    const sheet = screen.getByTestId('server-guest-sheet');
    expect(sheet.textContent).toContain('Virtuální stroj · VM 101');
    expect(screen.getByTestId('server-guest-cpu').textContent).toBe(
      `14${NB}% · 2${NB}vCPU7${NB}% hostitele`,
    );
    expect(screen.getByTestId('server-guest-disk').textContent).toBe(`přiděleno 32,0${NB}GiB`);
    expect(await screen.findByTestId('server-guest-trend-cpu')).toBeTruthy();
    expect(screen.getByTestId('server-guest-trend-memory')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Zavřít' }));
    expect(screen.queryByTestId('server-guest-sheet')).toBeNull();
  });

  it('zátěž nad počtem jader = pozor v hero i v kartě hostitele', async () => {
    show('proxmox-load');
    expect((await screen.findByTestId('server-headline')).textContent).toBe(
      `Pozor: zátěž 4,7 na 4 jádra`,
    );
    expect(screen.getByTestId('server-host-load').getAttribute('data-tone')).toBe('warn');
    expect(screen.getByTestId('server-host-load').textContent).toContain('5,31 / 4,92 / 4,70');
    const cpu = screen.getAllByTestId('server-proxmox-guest')[0]!;
    expect(cpu.querySelector('.srv-gm[data-tone="warn"]')?.textContent).toContain('97');
  });

  it('bez Glances ukáže CPU, RAM a disk z uzlu Proxmoxu', async () => {
    show('proxmox-noglances');
    expect((await screen.findByTestId('server-headline')).textContent).toBe('V pořádku');
    expect(screen.getByTestId('server-glances-down').textContent).toContain('z Proxmoxu');
    expect(screen.getByTestId('server-ring-cpu').textContent).toContain(`21${NB}%`);
    expect(screen.getByTestId('server-ring-ram').textContent).toContain(`65${NB}%`);
    expect(screen.queryByTestId('server-ring-temp')).toBeNull();
    expect(screen.queryByTestId('server-tile-cpu')).toBeNull();
    expect(screen.getAllByTestId('server-proxmox-guest')).toHaveLength(5);
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
    expect(screen.getByTestId('server-backup-run').textContent).toBe('selhal');
    expect(screen.getByTestId('server-backup-title').textContent).toBe('Poslední záloha selhala');
    expect(screen.getByTestId('server-backup-stale').textContent).toBe('Pozor');
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
    expect(screen.getByTestId('server-backup-run').textContent).toBe('úspěšný');
    expect(screen.getByTestId('server-backup-title').textContent).toBe(
      'Poslední záloha je zastaralá',
    );
    expect(screen.getByTestId('server-backup-stale').textContent).toBe('Kritické');
    const warning = screen.getByTestId('server-backup-warning').textContent;
    expect(warning).toContain(`Poslední záloha je stará 395${NB}dní`);
    expect(warning).toContain('Zkontroluj plán záloh v Proxmoxu.');
  });

  it('„Co s tím“ v hero odscrolluje na kartu zálohy a předá jí focus', async () => {
    show('proxmox-backup-stale');
    const fix = await screen.findByTestId('server-hero-fix');
    const card = screen.getByTestId('server-proxmox-backup');
    const scroll = vi.fn();
    card.scrollIntoView = scroll;
    fireEvent.click(fix);
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(card);
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
    fireEvent.click(screen.getByTestId('server-hero-fix'));
    expect(document.activeElement).toBe(screen.getByTestId('server-proxmox-storages'));
  });
});

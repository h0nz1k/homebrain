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

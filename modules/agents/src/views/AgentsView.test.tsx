import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { ModuleViewProps } from '@homebrain/ha-client';
import { setAgentsApiFactory } from '../api.js';
import { createMockAgentsApi, type AgentsScenario } from '../mock.js';
import AgentsView from './AgentsView.js';

afterEach(cleanup);

function show(scenario: AgentsScenario) {
  setAgentsApiFactory(() => createMockAgentsApi({ scenario }));
  render(<AgentsView {...({ connection: {} } as unknown as ModuleViewProps)} />);
}

describe('AgentsView – redesign', () => {
  it('ok: Vše v pořádku, K řešení skrytá, agenti/služby sbalené, fronta řádek, odkaz', async () => {
    show('ok');
    expect(screen.getByTestId('agents-loading')).toBeTruthy();
    expect((await screen.findByTestId('agents-headline')).textContent).toBe('Vše v pořádku');
    expect(screen.queryByTestId('agents-todos')).toBeNull();
    expect(screen.getByTestId('agents-agents-details').hasAttribute('open')).toBe(false);
    expect(screen.getByTestId('agents-agents-toggle').textContent).toMatch(
      /^Zobrazit agenty a modely/,
    );
    expect(screen.getByTestId('agents-queue-line').textContent).toMatch(/běží/);
    const link = screen.getByTestId('agents-monitor-link');
    expect(link.getAttribute('href')).toBe('https://monitor.example');
    expect(link.textContent).toMatch(/Detail v AgentsMonitoringu/);
    expect(screen.getByTestId('agents-updated').textContent).toMatch(/^Aktualizováno/);
  });

  it('warn/rozpor #181: senzor attention → warn; vyčerpaná kvóta v K řešení critical', async () => {
    show('warn');
    await screen.findByTestId('agents-headline');
    expect(screen.getByTestId('agents-hero').getAttribute('data-agents-state')).toBe('warn');
    expect(screen.getByTestId('agents-headline').textContent).toMatch(/^Běží vše · /);
    const todos = screen.getAllByTestId('agents-todo');
    expect(todos.some((t) => t.getAttribute('data-level') === 'critical')).toBe(true);
    expect(screen.getByTestId('agents-todos')).toBeTruthy();
    // Auto-expand agents when waiting/stopped.
    expect(screen.getByTestId('agents-agents-details').hasAttribute('open')).toBe(true);
  });

  it('crit: kritické + auto-rozbalení agentů; služba down viditelná', async () => {
    show('crit');
    expect((await screen.findByTestId('agents-headline')).textContent).toMatch(/^Kritické · /);
    expect(screen.getByTestId('agents-hero').getAttribute('data-agents-state')).toBe('crit');
    expect(screen.getByTestId('agents-agents-details').hasAttribute('open')).toBe(true);
    expect(screen.getByTestId('agents-agents-toggle').textContent).toMatch(
      /^Skrýt agenty a modely/,
    );
    const under = screen.getByTestId('agents-services-under');
    expect(under.textContent).toMatch(/Brána/);
  });

  it('real: provider rows + collapsed marginal + queue blocked amber inline', async () => {
    show('real');
    await screen.findByTestId('agents-headline');
    const rows = screen.getAllByTestId('agents-quota-row');
    expect(rows.length).toBeGreaterThanOrEqual(5);
    expect(rows.map((r) => r.getAttribute('data-provider'))).toEqual(
      expect.arrayContaining(['Claude', 'Codex', 'Antigravity', 'Cursor', 'GitHub Actions']),
    );
    expect(screen.getByTestId('agents-quotas-collapsed').textContent).toMatch(/Vertex|Fable/);
    const line = screen.getByTestId('agents-queue-line');
    expect(line.textContent).toMatch(/běží/);
    expect(line.textContent).toMatch(/blokováno/);
    const blocked = screen.getByTestId('agents-queue-blocked');
    expect(line.contains(blocked)).toBe(true);
    expect(blocked.getAttribute('data-tone')).toBe('warn');
    expect(blocked.textContent).toMatch(/blokováno/);
    // Services over 99 % collapsed.
    expect(screen.getByTestId('agents-services-details').textContent).toMatch(/nad 99/);
  });

  it('ok: fronta bez blokováno při nule', async () => {
    show('ok');
    await screen.findByTestId('agents-headline');
    expect(screen.getByTestId('agents-queue-line').textContent).toMatch(/běží/);
    expect(screen.getByTestId('agents-queue-line').textContent).not.toMatch(/blokováno/);
    expect(screen.queryByTestId('agents-queue-blocked')).toBeNull();
  });

  it('stale: K řešení má data neaktuální; hero subline amber', async () => {
    show('stale');
    const headline = await screen.findByTestId('agents-headline');
    expect(headline.textContent).not.toBe('Vše v pořádku');
    expect(screen.getByTestId('agents-todos').textContent).toMatch(/neaktuální/);
    expect(screen.getByTestId('agents-meta').getAttribute('data-stale')).toBe('true');
  });

  it('nenastaveno: návod pro správce, žádná chyba', async () => {
    show('unconfigured');
    const empty = await screen.findByTestId('agents-unconfigured');
    expect(empty.textContent).toContain('Modul Agenti není nastavený');
    expect(empty.textContent).toContain('_stav');
    expect(screen.queryByTestId('agents-error')).toBeNull();
    expect(screen.queryByTestId('agents-monitor-link')).toBeNull();
  });

  it('nedostupné entity: sekce ukážou „nedostupné“, zbytek funguje', async () => {
    show('unavailable');
    await screen.findByTestId('agents-headline');
    expect(screen.getByTestId('agents-agents-unavailable').textContent).toBe('nedostupné');
    expect(screen.getByTestId('agents-queue-unavailable')).toBeTruthy();
  });

  it('bez URL se odkaz nezobrazí; chyba WS = ErrorState', async () => {
    setAgentsApiFactory(() => ({
      get: () => Promise.reject(new Error('Spojení selhalo')),
    }));
    render(<AgentsView {...({ connection: {} } as unknown as ModuleViewProps)} />);
    expect((await screen.findByTestId('agents-error')).textContent).toContain('Spojení selhalo');
    cleanup();
    setAgentsApiFactory(() => ({
      get: () =>
        createMockAgentsApi({ scenario: 'ok' })
          .get()
          .then((s) => ({ ...s, monitor_url: null })),
    }));
    render(<AgentsView {...({ connection: {} } as unknown as ModuleViewProps)} />);
    await screen.findByTestId('agents-headline');
    expect(screen.queryByTestId('agents-monitor-link')).toBeNull();
  });
});

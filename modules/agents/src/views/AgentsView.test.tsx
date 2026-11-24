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

describe('AgentsView', () => {
  it('vše v pořádku: hero, kvóty, agenti, služby, fronta a odkaz', async () => {
    show('ok');
    expect(screen.getByTestId('agents-loading')).toBeTruthy();
    expect((await screen.findByTestId('agents-headline')).textContent).toBe('V pořádku');
    expect(screen.getAllByTestId('agents-quota')).toHaveLength(6);
    expect(screen.getAllByTestId('agents-agent').map((a) => a.getAttribute('data-state'))).toEqual([
      'waiting',
      'running',
      'running',
      'stopped',
    ]);
    expect(screen.getAllByTestId('agents-service')).toHaveLength(3);
    expect(screen.getByTestId('agents-queue-pending').textContent).toContain('5');
    const link = screen.getByTestId('agents-monitor-link');
    expect(link.getAttribute('href')).toBe('https://monitor.example');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
    expect(screen.getByTestId('agents-data-age').textContent).toMatch(/^Data aktuální/);
    expect(screen.queryByTestId('agents-hero-fix')).toBeNull();
  });

  it('upozornění/rozpor: senzor attention → warn; vyčerpaná kvóta critical; počet = seznam', async () => {
    show('warn');
    await screen.findByTestId('agents-headline');
    expect(screen.getByTestId('agents-hero').getAttribute('data-agents-state')).toBe('warn');
    expect(screen.getByTestId('agents-headline').textContent).toMatch(/^Pozor:/);
    const quotas = screen.getAllByTestId('agents-quota');
    expect(quotas[0]!.getAttribute('data-level')).toBe('critical');
    expect(screen.getByTestId('agents-quota-exhausted')).toBeTruthy();
    expect(screen.getByTestId('agents-quota-forecast')).toBeTruthy();
    expect(quotas.filter((q) => q.getAttribute('data-level') === 'warning')).toHaveLength(3);
    expect(screen.getByTestId('agents-forecast').textContent).toContain('Poskytovatel X');
    expect(screen.getByTestId('agents-more').textContent).toContain('SLA');
    expect(screen.getByTestId('agents-hero-fix')).toBeTruthy();
    expect(screen.getAllByTestId('agents-quota-reset')[0]!.textContent).toMatch(/^reset za /);
    const agents = screen.getAllByTestId('agents-agent');
    expect(agents).toHaveLength(4);
    expect(screen.getByTestId('agents-meta').textContent).toMatch(/2 z 4 agentů běží/);
    expect(screen.getByTestId('agents-agents-count').textContent).toMatch(/2 z 4 běží/);
  });

  it('kritické: výpadek služby a neaktuální data', async () => {
    show('crit');
    expect((await screen.findByTestId('agents-headline')).textContent).toBe(
      'Kritické: Služba Brána: výpadek',
    );
    expect(screen.getByTestId('agents-hero').getAttribute('data-agents-state')).toBe('crit');
    const down = screen.getAllByTestId('agents-service')[0]!;
    expect(down.getAttribute('data-level')).toBe('critical');
    expect(down.textContent).toContain('Výpadek');
    expect(screen.getByTestId('agents-data-age').textContent).toMatch(/^Data neaktuální od /);
    expect(screen.getByTestId('agents-footer').getAttribute('data-current')).toBe('false');
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
    expect(screen.getByTestId('agents-quota-unavailable')).toBeTruthy();
    expect(screen.getAllByTestId('agents-service').at(-1)!.textContent).toContain('nedostupné');
    expect(screen.getAllByTestId('agents-quota').length).toBe(6);
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

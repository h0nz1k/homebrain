import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { setNetworkApiFactory } from '../api.js';
import { createMockNetworkApi, type MockNetworkOptions } from '../mock.js';
import NetworkView from './NetworkView.js';

const mount = (opts: MockNetworkOptions, kiosk = false) => {
  setNetworkApiFactory(() => createMockNetworkApi(opts));
  return render(<NetworkView store={{} as never} bindings={{}} kiosk={kiosk} />);
};

afterEach(cleanup);

describe('NetworkView', () => {
  it('admin sees hero, problems with „Co s tím“ and tips', async () => {
    mount({ role: 'owner' });
    expect(await screen.findByTestId('network-hero')).toBeTruthy();
    expect(screen.getByTestId('network-headline').textContent).toBe('Terasa vypadává');
    expect(screen.getAllByTestId('network-problem')).toHaveLength(3);
    // 3 problem cards + the hero CTA that scrolls to the first one.
    expect(screen.getAllByText('Co s tím')).toHaveLength(4);
    expect(screen.getByTestId('network-hero-fix')).toBeTruthy();
    // The hero names the top problem, so its card does not repeat the title.
    const cards = screen.getAllByTestId('network-problem');
    const titles = cards.map((c) => c.querySelector('h4')?.textContent);
    expect(titles).not.toContain('Terasa vypadává');
    expect(cards[0]!.getAttribute('aria-label')).toBe('Terasa vypadává');
    // „41 min“ once (context), not again as a chip.
    expect(document.body.textContent!.split('41\u00a0min').length - 1).toBe(1);
    expect(screen.getAllByTestId('network-tip')).toHaveLength(2);
  });

  it('admin settings show the UniFi account source (no password)', async () => {
    setNetworkApiFactory(() => createMockNetworkApi({ role: 'owner', unifi: true }));
    render(
      <NetworkView store={{} as never} bindings={{}} route={{ path: '/network/hoste' } as never} />,
    );
    const label = await screen.findByTestId('network-unifi-account');
    expect(label.textContent).toBe('Účet: ha (z integrace UniFi)');
  });

  it('adult gets only the summary and the guest QR', async () => {
    mount({ role: 'adult' });
    expect((await screen.findByTestId('network-summary')).dataset.netState).toBe('problem');
    await waitFor(() =>
      expect(screen.getByTestId('network-guest-ssid').textContent).toBe('Host demo'),
    );
    expect(screen.queryByTestId('network-hero')).toBeNull();
    expect(screen.queryByTestId('network-devices')).toBeNull();
    expect(screen.queryByTestId('network-guest-edit')).toBeNull();
  });

  it('kiosk layout never shows more than the summary, even for an admin', async () => {
    mount({ role: 'owner' }, true);
    expect(await screen.findByTestId('network-summary')).toBeTruthy();
    expect(screen.queryByTestId('network-problem')).toBeNull();
  });

  it('hint instead of QR when guest Wi-Fi is not configured', async () => {
    mount({ role: 'kiosk', guest: false });
    expect(await screen.findByTestId('network-guest-hint')).toBeTruthy();
    expect(document.querySelector('svg.hb-qr')).toBeNull();
  });
});

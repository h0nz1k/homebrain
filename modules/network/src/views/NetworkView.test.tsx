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
    expect(screen.getAllByText('Co s tím')).toHaveLength(3);
    expect(screen.getAllByTestId('network-tip')).toHaveLength(2);
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

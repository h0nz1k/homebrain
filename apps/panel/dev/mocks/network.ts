import {
  createMockNetworkApi,
  setNetworkApiFactory,
  type NetRole,
  type NetworkScenario,
} from '@homebrain/module-network';
import { devQuery } from './shared.js';

/**
 * Síť: synthetic house (7 APs, 3 switches). `?sit=problems|ok|down|empty`, `?role=adult|kiosk`
 * (summary only), `?hoste=0` = guest Wi-Fi not set up yet.
 */
export function registerNetworkMocks(): void {
  const networkApi = createMockNetworkApi({
    scenario: (devQuery.get('sit') as NetworkScenario | null) ?? 'problems',
    role: (devQuery.get('role') as NetRole | null) ?? 'owner',
    guest: devQuery.get('hoste') !== '0',
    // `?unifi=1` = V2: own read-only UniFi account configured (ports, signal, channels).
    unifi: devQuery.get('unifi') === '1',
  });
  setNetworkApiFactory(() => networkApi);
}

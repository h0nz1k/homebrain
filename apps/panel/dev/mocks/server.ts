import {
  createMockServerApi,
  setServerApiFactory,
  type ServerScenario,
} from '@homebrain/module-server';
import { devQuery } from './shared.js';

/** Server: synthetic Proxmox host with 4 VMs. `?server=ok|warn|crit|down|unconfigured|noapi|apidown`. */
export function registerServerMocks(): void {
  const serverApi = createMockServerApi({
    scenario: (devQuery.get('server') as ServerScenario | null) ?? 'ok',
  });
  setServerApiFactory(() => serverApi);
}

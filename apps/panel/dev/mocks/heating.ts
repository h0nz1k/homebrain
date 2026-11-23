import {
  createMockHeatingApi,
  setHeatingApiFactory,
  type HeatingScenario,
} from '@homebrain/module-heating';
import { mockHeatingAdvisor } from './heating/advisor.js';
import { devQuery } from './shared.js';

/**
 * Topení: synthetic ground-source heat pump. `?topeni=heating|idle|dhw|fault|solar|solar-nogain|…`,
 * `&rooms=0|4` (bound room sensors/TRVs; default 0 like the current backend),
 * `&extras=none` = side circuits unmapped (null payloads), `&ventil=porucha` = mixing-valve fault.
 */
export function registerHeatingMocks(): void {
  const heatingApi = createMockHeatingApi({
    scenario: (devQuery.get('topeni') as HeatingScenario | null) ?? 'heating',
    rooms: devQuery.get('rooms') === '4' ? 4 : 0,
    extrasMode: devQuery.get('extras') === 'none' ? 'none' : 'default',
    mixerFault: devQuery.get('ventil') === 'porucha',
    advisor: mockHeatingAdvisor(devQuery.get('doporuceni'), new Date().toISOString()),
  });
  setHeatingApiFactory(() => heatingApi);
}

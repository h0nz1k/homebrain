import {
  createMockFamilyApi,
  setFamilyApiFactory,
  type FamilyRole,
} from '@homebrain/module-family';
import { devQuery } from './shared.js';

/** Rodina: synthetic household („Ema“, „Kuba“). `?role=adult|child|kiosk`, `?rodina=empty|busy`. */
export function registerFamilyMocks(): void {
  const reassignDemo = devQuery.get('reassign');
  const familyScenario = devQuery.get('rodina');
  const familyApi = createMockFamilyApi({
    role: (devQuery.get('role') as FamilyRole | null) ?? 'owner',
    scenario:
      familyScenario === 'empty' || familyScenario === 'busy' || familyScenario === 'evening'
        ? familyScenario
        : 'full',
    reassignDemo:
      reassignDemo === 'overdue' || reassignDemo === 'error' || reassignDemo === 'needs-repair'
        ? reassignDemo
        : undefined,
  });
  (window as unknown as { __hbFamilyLog?: unknown[] }).__hbFamilyLog = familyApi.log;
  setFamilyApiFactory(() => familyApi);
}

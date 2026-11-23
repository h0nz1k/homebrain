import {
  createMockFamilyApi,
  setFamilyApiFactory,
  type FamilyRole,
  type SchoolScenario,
  type TimetableScenario,
} from '@homebrain/module-family';
import { devQuery } from './shared.js';

const schoolQuery = devQuery.get('skola');
export const schoolScenario: SchoolScenario =
  schoolQuery === 'full' ||
  schoolQuery === 'holiday' ||
  schoolQuery === 'empty' ||
  schoolQuery === 'stale'
    ? schoolQuery
    : 'off';

/** Školní rozvrh (Ema, Kuba): `?rozvrh=full|holiday` (holiday = free days from tomorrow). */
const timetableQuery = devQuery.get('rozvrh');
export const timetableScenario: TimetableScenario =
  timetableQuery === 'full' || timetableQuery === 'holiday' ? timetableQuery : 'off';

/** Rodina: synthetic household („Ema“, „Kuba“). `?role=adult|child|kiosk`, `?rodina=empty|busy`. */
export function registerFamilyMocks(): void {
  const reassignDemo = devQuery.get('reassign');
  const familyScenario = devQuery.get('rodina');
  const familyApi = createMockFamilyApi({
    role: (devQuery.get('role') as FamilyRole | null) ?? 'owner',
    school: schoolScenario,
    timetable: timetableScenario,
    scenario:
      familyScenario === 'empty' || familyScenario === 'busy' || familyScenario === 'evening'
        ? familyScenario
        : 'full',
    reassignDemo:
      reassignDemo === 'overdue' ||
      reassignDemo === 'error' ||
      reassignDemo === 'needs-repair' ||
      reassignDemo === 'needs-repair-multi'
        ? reassignDemo
        : undefined,
  });
  (window as unknown as { __hbFamilyLog?: unknown[] }).__hbFamilyLog = familyApi.log;
  setFamilyApiFactory(() => familyApi);
}

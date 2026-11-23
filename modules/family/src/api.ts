import {
  getSchool,
  getTimetable,
  type ConnectionLike,
  type SchoolSnapshot,
  type TimetableSnapshot,
} from '@homebrain/ha-client';
import type {
  CreateChoreInput,
  DeleteChoreInput,
  SkipChoreInput,
  FamilySnapshot,
  PersonHistoryEntry,
  PersonSettings,
  PersonsSettings,
  SchoolSettings,
  TimetableSettings,
  PointsHistory,
  PointsSummary,
  SwapRequestInput,
} from './types.js';

export interface FamilyApi {
  now?: () => Date;
  get(): Promise<FamilySnapshot>;
  personHistory(member: string): Promise<{ entries: PersonHistoryEntry[] }>;
  personsSettings(): Promise<PersonsSettings>;
  savePersons(
    persons: PersonSettings[],
    school?: SchoolSettings,
    timetable?: TimetableSettings,
  ): Promise<PersonsSettings>;
  school?(): Promise<SchoolSnapshot>;
  timetable?(): Promise<TimetableSnapshot>;
  claim(kid: string, chore: string): Promise<void>;
  approve(kid: string, chore: string): Promise<void>;
  addItem(summary: string): Promise<void>;
  setItemDone(uid: string, done: boolean): Promise<void>;
  swapOptions(
    direction: 'give' | 'take',
    chore?: string,
  ): Promise<{
    occurrences: Array<{
      opaque_id: string;
      owner_kid_uuid: string;
      local_date: string;
    }>;
    partners: Array<{ id: string; name: string }>;
  }>;
  swapRequest(
    input: SwapRequestInput,
  ): Promise<{ request: Record<string, unknown>; revision: number }>;
  swapDecide(
    request_id: string,
    decision: 'approve' | 'reject',
    expected_revision?: number,
  ): Promise<Record<string, unknown>>;
  swapReassign(input: SwapRequestInput): Promise<Record<string, unknown>>;
  swapCancel(request_id: string, expected_revision?: number): Promise<Record<string, unknown>>;
  swapCancelOperation(operation_id: string): Promise<Record<string, unknown>>;
  skipChoreToday(input: SkipChoreInput): Promise<{ ok: boolean; can_undo?: boolean }>;
  deleteChore(input: DeleteChoreInput): Promise<{ deleted: number }>;
  createChore(input: CreateChoreInput): Promise<Record<string, unknown>>;
  pointsGet(kid: string): Promise<PointsSummary>;
  pointsHistory(kid: string, days?: 7 | 30, limit?: number): Promise<PointsHistory>;
}

export function createWsFamilyApi(connection: ConnectionLike): FamilyApi {
  const call = <T>(type: string, extra: Record<string, unknown> = {}) =>
    connection.sendMessagePromise<T>({ type, ...extra } as { type: string });
  return {
    get: () => call<FamilySnapshot>('homebrain/family/get'),
    school: () => getSchool(connection),
    timetable: () => getTimetable(connection),
    personHistory: (member) => call('homebrain/family/person/history', { member }),
    personsSettings: () => call('homebrain/family/settings/get'),
    savePersons: (persons, school, timetable) =>
      call('homebrain/family/settings/set', {
        persons,
        school,
        ...(timetable ? { timetable: timetableInput(timetable) } : {}),
      }),
    claim: async (kid, chore) => void (await call('homebrain/family/chore/claim', { kid, chore })),
    approve: async (kid, chore) =>
      void (await call('homebrain/family/chore/approve', { kid, chore })),
    addItem: async (summary) => void (await call('homebrain/family/shopping/add', { summary })),
    setItemDone: async (uid, done) =>
      void (await call('homebrain/family/shopping/update', { uid, done })),
    swapOptions: (direction, chore) =>
      call('homebrain/family/swap/options', { direction, ...(chore ? { chore } : {}) }),
    swapRequest: (input) =>
      call('homebrain/family/swap/request', { ...input } as Record<string, unknown>),
    swapDecide: (request_id, decision, expected_revision = 0) =>
      call('homebrain/family/swap/decide', { request_id, decision, expected_revision }),
    swapReassign: (input) =>
      call('homebrain/family/swap/reassign', { ...input } as Record<string, unknown>),
    swapCancel: (request_id, expected_revision = 0) =>
      call('homebrain/family/swap/cancel', { request_id, expected_revision }),
    swapCancelOperation: (operation_id) => call('homebrain/family/swap/cancel', { operation_id }),
    skipChoreToday: (input) => call('homebrain/family/chore/skip_today', { ...input }),
    deleteChore: (input) => call('homebrain/family/chore/delete', { ...input }),
    createChore: (input) =>
      call('homebrain/family/chore/create', { ...input } as Record<string, unknown>),
    pointsGet: (kid) => call('homebrain/family/points/get', { kid }),
    pointsHistory: (kid, days = 7, limit = 30) =>
      call('homebrain/family/points/history', { kid, days, limit }),
  };
}

/** Drop the read-only fields of the settings payload before saving. */
export function timetableInput(settings: TimetableSettings): TimetableSettings {
  const input = { ...settings };
  delete input.imported;
  delete input.auto_holiday_calendar;
  return input;
}

export type FamilyApiFactory = (connection: ConnectionLike | undefined) => FamilyApi | null;
let factory: FamilyApiFactory = (connection) => (connection ? createWsFamilyApi(connection) : null);

/** Dev/tests replace the WS client with the synthetic household (`createMockFamilyApi`). */
export function setFamilyApiFactory(next: FamilyApiFactory): void {
  factory = next;
}

export function getFamilyApi(connection: ConnectionLike | undefined): FamilyApi | null {
  return factory(connection);
}

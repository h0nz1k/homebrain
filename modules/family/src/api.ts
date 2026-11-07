import type { ConnectionLike } from '@homebrain/ha-client';
import type { FamilySnapshot } from './types.js';

export interface FamilyApi {
  get(): Promise<FamilySnapshot>;
  claim(kid: string, chore: string): Promise<void>;
  approve(kid: string, chore: string): Promise<void>;
  addItem(summary: string): Promise<void>;
  setItemDone(uid: string, done: boolean): Promise<void>;
}

export function createWsFamilyApi(connection: ConnectionLike): FamilyApi {
  const call = <T>(type: string, extra: Record<string, unknown> = {}) =>
    connection.sendMessagePromise<T>({ type, ...extra } as { type: string });
  return {
    get: () => call<FamilySnapshot>('homebrain/family/get'),
    claim: async (kid, chore) => void (await call('homebrain/family/chore/claim', { kid, chore })),
    approve: async (kid, chore) =>
      void (await call('homebrain/family/chore/approve', { kid, chore })),
    addItem: async (summary) => void (await call('homebrain/family/shopping/add', { summary })),
    setItemDone: async (uid, done) =>
      void (await call('homebrain/family/shopping/update', { uid, done })),
  };
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

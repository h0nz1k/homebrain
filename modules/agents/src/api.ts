import type { ConnectionLike } from '@homebrain/ha-client';
import type { AgentsSnapshot } from './types.js';

export interface AgentsApi {
  get(): Promise<AgentsSnapshot>;
}

export function createWsAgentsApi(connection: ConnectionLike): AgentsApi {
  return {
    get: () => connection.sendMessagePromise<AgentsSnapshot>({ type: 'homebrain/agents/get' }),
  };
}

export type AgentsApiFactory = (connection: ConnectionLike | undefined) => AgentsApi | null;
let factory: AgentsApiFactory = (connection) => (connection ? createWsAgentsApi(connection) : null);

/** Dev/tests replace the WS client with the synthetic monitoring (`createMockAgentsApi`). */
export function setAgentsApiFactory(next: AgentsApiFactory): void {
  factory = next;
}

export function getAgentsApi(connection: ConnectionLike | undefined): AgentsApi | null {
  return factory(connection);
}

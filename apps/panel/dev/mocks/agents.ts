import {
  createMockAgentsApi,
  setAgentsApiFactory,
  type AgentsScenario,
} from '@homebrain/module-agents';
import { devQuery } from './shared.js';

/** Agenti: synthetic monitoring. `?agents=ok|warn|crit|real|stale|unconfigured|unavailable`. */
export function registerAgentsMocks(): void {
  const agentsApi = createMockAgentsApi({
    scenario: (devQuery.get('agents') as AgentsScenario | null) ?? 'ok',
  });
  setAgentsApiFactory(() => agentsApi);
}

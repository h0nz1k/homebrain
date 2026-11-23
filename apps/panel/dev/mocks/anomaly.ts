import {
  ANOMALY_SCENARIOS,
  createMockAnomalyApi,
  setAnomalyApiFactory,
  type AnomalyScenario,
} from '@homebrain/module-anomaly';
import { fixtureNow, stateFromUrl } from '@homebrain/module-today';
import { devQuery, live } from './shared.js';

/**
 * Hlídání domu: synthetic house. `?anomaly=ok|observations|suspicion|confirmed|learning`; the
 * detail page defaults to `confirmed`, Dnes shows the card only with an explicit `?anomaly=`.
 */
export function registerAnomalyMocks(): void {
  // One clock for the page: the mock's „now“ is the Dnes fixture clock (real time with `?live=1`).
  const anomalyParam = devQuery.get('anomaly') as AnomalyScenario | null;
  const anomalyNow = live ? new Date().toISOString() : fixtureNow(stateFromUrl(location.search));
  const anomalyApi =
    anomalyParam && ANOMALY_SCENARIOS.includes(anomalyParam)
      ? createMockAnomalyApi({ scenario: anomalyParam, now: anomalyNow })
      : null;
  const anomalyDetailApi =
    anomalyApi ?? createMockAnomalyApi({ scenario: 'confirmed', now: anomalyNow });
  setAnomalyApiFactory(() =>
    location.pathname.startsWith('/homebrain-hlidani') ? anomalyDetailApi : anomalyApi,
  );
}

import { createHealthDemo, type HealthScenario } from '@homebrain/module-health';
import type { DevHass } from './shared.js';

/** Zdraví: synthetic states + recorder/history. `?health=week|risk|missing|empty|…`. */
export function addHealthDemo({ hass, now }: DevHass) {
  const healthDemo = createHealthDemo(
    now.getTime(),
    (new URLSearchParams(location.search).get('health') as HealthScenario | null) ?? 'week',
  );
  Object.assign(hass.states, healthDemo.states);
  const healthDemoIds = new Set(Object.values(healthDemo.bindings));
  return {
    demo: healthDemo,
    bindings: healthDemo.bindings,
    /** Recorder/history requests for these entity ids belong to Zdraví (else Energie). */
    owns: (ids: string[] | undefined) => (ids ?? []).some((id) => healthDemoIds.has(id)),
  };
}

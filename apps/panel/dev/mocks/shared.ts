import type { createFakeHass } from '@homebrain/testing';

/**
 * Dev server only (loaded by src/dev.tsx, never by the production entry src/index.ts).
 * Shared state of the per-module dev mocks in this folder.
 */

/** One query object for the whole page: the kitchen timers add `timers=1` for `?cooking=active`. */
export const devQuery = new URLSearchParams(location.search);

// `?live=1`: keep the production live Dnes adapter (modules.ts) on top of the fake HA connection
// below, instead of the Dnes fixtures.
export const live = new URLSearchParams(location.search).get('live') === '1';

export type DemoHass = ReturnType<typeof createFakeHass>;
export type DemoState = DemoHass['states'][string];
/** WS command type → response (or handler) for `createMockConnection`. */
export type WsHandlers = Record<string, unknown>;

/** Second phase (after the panel element exists): the fake `hass` and the page-load clock. */
export interface DevHass {
  hass: DemoHass;
  now: Date;
  /** Hand the panel a fresh `hass` object after a mock changed `hass.states`. */
  refresh(): void;
}

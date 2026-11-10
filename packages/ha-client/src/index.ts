import { useCallback, useSyncExternalStore } from 'react';
import type { HassEntity, Connection } from 'home-assistant-js-websocket';
import type { DataQuality } from '@homebrain/contracts';

export type EntityStateLike = Pick<
  HassEntity,
  'entity_id' | 'state' | 'attributes' | 'last_updated'
>;
export interface ConnectionLike {
  sendMessagePromise<T>(message: { type: string }): Promise<T>;
  /** Read-only WS subscription (e.g. `calendar/event/subscribe`). */
  subscribeMessage?<T>(
    callback: (message: T) => void,
    message: { type: string },
    options?: { resubscribe?: boolean },
  ): Promise<() => Promise<void> | void>;
  connected?: boolean;
  /** home-assistant-js-websocket `Connection.reconnect(force)` – used by the kiosk overlay. */
  reconnect?: (force?: boolean) => void;
  addEventListener?: (event: 'ready' | 'disconnected', listener: () => void) => void;
  removeEventListener?: (event: 'ready' | 'disconnected', listener: () => void) => void;
}
/** The host supplies its authenticated HA connection; no separate authentication. */
export interface HassLike {
  connection: ConnectionLike | Connection;
  states: Record<string, EntityStateLike>;
  user: { id: string; name?: string; is_admin?: boolean } | null;
  language: string;
  themes?: { darkMode?: boolean };
  /** HA frontend helper: `fetch` with the user's bearer token (uploads to integration views). */
  fetchWithAuth?: (path: string, init?: RequestInit) => Promise<Response>;
}
export function createEntityStore() {
  let states: Record<string, EntityStateLike> = {};
  let lastUpdate: number | null = null;
  const listeners = new Map<string, Set<() => void>>();
  const anyListeners = new Set<() => void>();
  return {
    update(next: Record<string, EntityStateLike>) {
      const previous = states;
      states = { ...next };
      lastUpdate = Date.now();
      for (const [id, callbacks] of listeners) {
        if (previous[id] !== states[id]) for (const callback of callbacks) callback();
      }
      for (const callback of anyListeners) callback();
    },
    /** Called after every host update (HA pushes `hass` on each entity change). */
    subscribeAll(listener: () => void) {
      anyListeners.add(listener);
      return () => {
        anyListeners.delete(listener);
      };
    },
    /** Epoch ms of the last host update, null before the first one. */
    lastUpdatedAt() {
      return lastUpdate;
    },
    subscribe(entityId: string, listener: () => void) {
      let callbacks = listeners.get(entityId);
      if (!callbacks) listeners.set(entityId, (callbacks = new Set()));
      callbacks.add(listener);
      return () => {
        callbacks.delete(listener);
        if (!callbacks.size) listeners.delete(entityId);
      };
    },
    getSnapshot(entityId: string) {
      return states[entityId];
    },
    /** Every entity id of the last host update (suffix-based autodetection, e.g. airfryer). */
    entityIds(): string[] {
      return Object.keys(states);
    },
  };
}
export type EntityStore = ReturnType<typeof createEntityStore>;
export interface ModuleViewProps {
  store: EntityStore;
  bindings: Record<string, string>;
  /** HA panel sub-route, excluding the panel URL prefix. */
  route?: { path: string };
  kiosk?: boolean;
  /** Optional HA connection for module WS commands (e.g. homebrain/wine/list, homebrain/weather/get, statistics, calendar events). */
  connection?: ConnectionLike;
  /** Authenticated `fetch` for HomeBrain HTTP views (file uploads); absent in tests. */
  fetchWithAuth?: (path: string, init?: RequestInit) => Promise<Response>;
}
export function useEntity(store: EntityStore, entityId: string) {
  const subscribe = useCallback(
    (listener: () => void) => store.subscribe(entityId, listener),
    [store, entityId],
  );
  const snapshot = useCallback(() => store.getSnapshot(entityId), [store, entityId]);
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
export function deriveQuality(
  state: EntityStateLike | undefined,
  options: {
    maxAgeMs: number;
    expectedUnit?: string;
    now: number;
  },
): DataQuality {
  if (!state || state.state === 'unavailable' || state.state === 'unknown') return 'unavailable';
  const updatedAt = Date.parse(state.last_updated);
  if (!Number.isFinite(updatedAt) || options.now - updatedAt > options.maxAgeMs) return 'stale';
  if (
    options.expectedUnit !== undefined &&
    state.attributes.unit_of_measurement !== options.expectedUnit
  )
    return 'invalid_unit';
  return 'ok';
}
export class ServiceNotAllowedError extends Error {
  constructor(service: string) {
    super(`Služba ${service} není povolena.`);
    this.name = 'ServiceNotAllowedError';
  }
}
export interface ServiceConnection {
  callService(domain: string, service: string, data?: Record<string, unknown>): Promise<unknown>;
}
export function createServiceClient(
  connection: ServiceConnection,
  allowlist: Array<`${string}.${string}`> = [],
) {
  const allowed = new Set(allowlist);
  return {
    callService(domain: string, service: string, data?: Record<string, unknown>) {
      if (!allowed.has(`${domain}.${service}`))
        throw new ServiceNotAllowedError(`${domain}.${service}`);
      return connection.callService(domain, service, data);
    },
  };
}
export type BindingsByModule = Record<string, Record<string, string>>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Fetch logical entity bindings grouped by module (Refs #5). */
export async function getBindings(connection: ConnectionLike): Promise<BindingsByModule> {
  const response = await connection.sendMessagePromise<unknown>({ type: 'homebrain/bindings/get' });
  if (!isRecord(response)) return {};
  return Object.fromEntries(
    Object.entries(response)
      .filter(([, bindings]) => isRecord(bindings))
      .map(([module, bindings]) => [
        module,
        Object.fromEntries(
          Object.entries(bindings as Record<string, unknown>).filter(
            (entry): entry is [string, string] => typeof entry[1] === 'string',
          ),
        ),
      ]),
  );
}

export type HomeBrainRole = 'owner' | 'adult' | 'child' | 'guest' | 'kiosk';
export type HomeBrainSession = {
  role: HomeBrainRole;
  visibleModules: string[];
  isAdmin: boolean;
  kiosk: boolean;
  /** Modules whose backend failed to start (#28): the panel shows "Modul nedostupný". */
  unavailableModules: string[];
};
const SESSION_ROLES: HomeBrainRole[] = ['owner', 'adult', 'child', 'guest', 'kiosk'];

/**
 * Effective HomeBrain role of the signed-in HA user (ADR-0002, `homebrain/session/get`).
 * Readable by every signed-in user; returns null when the integration does not answer
 * (older backend, no connection) so callers keep their restrictive defaults.
 */
export async function getSession(connection: ConnectionLike): Promise<HomeBrainSession | null> {
  try {
    const response = await connection.sendMessagePromise<unknown>({
      type: 'homebrain/session/get',
    });
    if (!isRecord(response) || !SESSION_ROLES.includes(response.role as HomeBrainRole)) return null;
    return {
      role: response.role as HomeBrainRole,
      visibleModules: Array.isArray(response.visible_modules)
        ? response.visible_modules.filter((m): m is string => typeof m === 'string')
        : [],
      isAdmin: response.is_admin === true,
      kiosk: response.kiosk === true,
      unavailableModules: Array.isArray(response.unavailable_modules)
        ? response.unavailable_modules.filter((m): m is string => typeof m === 'string')
        : [],
    };
  } catch {
    return null;
  }
}

export {
  MODULE_PANEL_PATHS,
  hostWindow,
  navigatePanel,
  navigateTab,
  navigateUp,
  panelUrl,
  useBackClosable,
  type HbHistoryState,
} from './backNavigation.js';
export {
  KIOSK_PANEL_PATH,
  LEGACY_PANEL_PATH,
  PANEL_PATHS_BY_MODULE,
  SETTINGS_PANEL_PATH,
} from './panels.generated.js';
export * from './people.js';

export * from './kitchen.js';

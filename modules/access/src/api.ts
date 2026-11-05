import type { ConnectionLike } from '@homebrain/ha-client';
import { modalityOf } from './domain.js';
import type { Modality } from './types.js';
import type {
  AccessAction,
  AccessMeta,
  AccessEvent,
  AccessState,
  Hand,
  HistoryItem,
  Labels,
  SensorUser,
} from './types.js';

export class AccessApiError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'AccessApiError';
  }
}

export interface AccessApi {
  state(): Promise<AccessState>;
  /** Live events (users list, enrolment results, recognitions, label changes). */
  subscribe(callback: (event: AccessEvent) => void): Promise<() => void>;
  command(action: AccessAction, data?: Record<string, unknown>): Promise<void>;
  label(userId: number, label: { hand?: Hand | null; person?: string | null }): Promise<Labels>;
  person(person: string, child: boolean): Promise<void>;
  settings(settings: { notify_reenroll: boolean }): Promise<void>;
}

export function createWsAccessApi(connection: ConnectionLike): AccessApi {
  const call = <T>(type: string, payload: Record<string, unknown> = {}) =>
    connection
      .sendMessagePromise<T>({ type: `homebrain/access/${type}`, ...payload })
      .catch((err: { code?: string }) => {
        throw new AccessApiError(err?.code ?? 'UNKNOWN');
      });
  return {
    state: () => call<AccessState>('state'),
    async subscribe(callback) {
      if (!connection.subscribeMessage) return () => undefined;
      const unsub = await connection.subscribeMessage<AccessEvent>(callback, {
        type: 'homebrain/access/subscribe',
      });
      return () => void unsub();
    },
    async command(action, data = {}) {
      await call('command', { action, data });
    },
    async label(userId, label) {
      return (await call<{ labels: Labels }>('label', { user_id: userId, ...label })).labels;
    },
    async person(person, child) {
      await call('person', { person, child });
    },
    async settings(settings) {
      await call('settings', settings);
    },
  };
}

/** Synthetic people only (never real names): Jan, Petra, Tomáš. */
export function createSyntheticUsers(): SensorUser[] {
  return [
    { id: 1, type: 'face', name: 'Jan', allowed: true },
    { id: 2, type: 'face', name: 'Petra', allowed: true },
    { id: 3, type: 'face', name: 'Tomáš', allowed: false },
    { id: 1001, type: 'palm', name: 'Jan', allowed: true },
    { id: 1002, type: 'palm', name: 'Jan', allowed: true },
    { id: 1003, type: 'palm', name: 'Petra', allowed: true },
  ];
}

export interface MockAccessOptions {
  users?: SensorUser[];
  labels?: Labels;
  history?: HistoryItem[];
  /** Meta beyond labels (child flags, health, advice) – static fixture, the rule lives in the integration. */
  meta?: Partial<Omit<AccessMeta, 'labels'>>;
  latencyMs?: number;
  /** Delay before a simulated enrolment result. */
  enrollMs?: number;
  /** Reasons for the next enrolments to fail with (consumed one by one). */
  failNext?: string[];
  /** Switch/select commands are forwarded here (dev: updates the fake HA states). */
  onEntity?: (action: AccessAction, data: Record<string, unknown>) => void;
  /** Read the current service mode (enrolment needs it, like the firmware). */
  serviceMode?: () => boolean;
  log?: Array<{ action: string; data: unknown }>;
}
export interface MockAccessApi extends AccessApi {
  /** Tests/e2e: push an event as if the device fired it. */
  emit(event: AccessEvent): void;
}

/** Dev server / tests: in-memory device. Nothing is sent anywhere. */
export function createMockAccessApi(options: MockAccessOptions = {}): MockAccessApi {
  let users = (options.users ?? createSyntheticUsers()).map((u) => ({ ...u }));
  let labels: Labels = structuredClone(
    options.labels ?? {
      '1': { enrolled_at: '2026-03-02' },
      '2': { enrolled_at: '2026-03-02' },
      '3': { enrolled_at: '2025-09-20' },
      '1001': { hand: 'right', enrolled_at: '2026-03-02' },
      '1003': { hand: 'right', enrolled_at: '2026-03-03' },
    },
  );
  const history = [...(options.history ?? [])];
  let meta: Omit<AccessMeta, 'labels'> = {
    people: {},
    settings: { notify_reenroll: true },
    health: {},
    advice: {},
    ...structuredClone(
      options.meta ??
        (options.labels ? {} : { people: { tomáš: { child: true } }, advice: { '3': ['age'] } }),
    ),
  };
  const pushMeta = () =>
    emit({ event: 'meta', labels: structuredClone(labels), ...structuredClone(meta) });
  const listeners = new Set<(e: AccessEvent) => void>();
  const failNext = [...(options.failNext ?? [])];
  const log = options.log ?? [];
  const wait = (ms = options.latencyMs ?? 120) => new Promise((r) => setTimeout(r, ms));
  let listedAt = new Date().toISOString();
  const emit = (event: AccessEvent) => {
    if (event.event === 'recognized' || event.event === 'rejected')
      history.unshift({ kind: event.event, time: event.time, ...event.data });
    for (const l of listeners) l(event);
  };
  const pushUsers = () => {
    listedAt = new Date().toISOString();
    emit({ event: 'users', users: structuredClone(users), listed_at: listedAt, incomplete: false });
  };
  const nextId = (type: 'face' | 'palm') => {
    const base = type === 'face' ? 1 : 1001;
    let id = base;
    while (users.some((u) => u.id === id)) id += 1;
    return id;
  };
  return {
    emit,
    async state() {
      await wait();
      return {
        users: structuredClone(users),
        listed_at: listedAt,
        incomplete: false,
        labels: structuredClone(labels),
        ...structuredClone(meta),
        history: structuredClone(history.slice(0, 50)),
      };
    },
    async subscribe(callback) {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
    async command(action, data = {}) {
      log.push({ action, data });
      await wait();
      const service = options.serviceMode?.() ?? true;
      switch (action) {
        case 'biometric':
        case 'service_mode':
        case 'recognition_action':
          options.onEntity?.(action, data);
          return;
        case 'list_users':
          setTimeout(pushUsers, 50);
          return;
        case 'enroll_face':
        case 'enroll_palm': {
          const type: Modality = action === 'enroll_face' ? 'face' : 'palm';
          const name = String(data.name ?? '');
          setTimeout(() => {
            const reason = !service ? 'service_mode_required' : failNext.shift();
            if (reason) {
              emit({
                event: 'enrolled',
                time: new Date().toISOString(),
                data: { ok: false, user_id: 0, type, name, reason },
              });
              return;
            }
            const id = nextId(type);
            users = [...users, { id, type, name, allowed: true }].sort((a, b) => a.id - b.id);
            labels = {
              ...labels,
              [String(id)]: {
                ...labels[String(id)],
                enrolled_at: new Date().toISOString().slice(0, 10),
              },
            };
            emit({
              event: 'enrolled',
              time: new Date().toISOString(),
              data: { ok: true, user_id: id, type, name, reason: '' },
            });
          }, options.enrollMs ?? 900);
          return;
        }
        case 'cancel_enroll':
          return;
        case 'set_user_allowed': {
          const id = Number(data.user_id);
          if (data.allowed && !service) throw new AccessApiError('service_mode_required');
          users = users.map((u) => (u.id === id ? { ...u, allowed: Boolean(data.allowed) } : u));
          return;
        }
        case 'delete_user': {
          const id = Number(data.user_id);
          if (!service) throw new AccessApiError('service_mode_required');
          users = users.filter((u) => u.id !== id);
          const { [String(id)]: _gone, ...rest } = labels;
          void _gone;
          labels = rest;
          const { [String(id)]: _advice, ...advice } = meta.advice;
          void _advice;
          meta = { ...meta, advice };
          emit({
            event: 'deleted',
            time: new Date().toISOString(),
            data: { user_id: id, ok: true, type: modalityOf(id) ?? undefined },
          });
          pushMeta();
          return;
        }
        case 'reset_lockout':
          options.onEntity?.(action, data);
          return;
      }
    },
    async label(userId, label) {
      log.push({ action: 'label', data: { user_id: userId, ...label } });
      await wait();
      const entry: Labels[string] = {
        ...(labels[String(userId)]?.enrolled_at
          ? { enrolled_at: labels[String(userId)]!.enrolled_at }
          : {}),
      };
      if (label.hand) entry.hand = label.hand;
      if (label.person?.trim()) entry.person = label.person.trim();
      labels = { ...labels };
      if (Object.keys(entry).length) labels[String(userId)] = entry;
      else delete labels[String(userId)];
      pushMeta();
      return structuredClone(labels);
    },
    async person(person, child) {
      await wait();
      const key = person.split(/\s+/).filter(Boolean).join(' ').toLocaleLowerCase('cs');
      const people = { ...meta.people };
      if (child) people[key] = { child: true };
      else delete people[key];
      meta = { ...meta, people };
      pushMeta();
    },
    async settings(settings) {
      log.push({ action: 'settings', data: settings });
      await wait();
      meta = { ...meta, settings: { ...settings } };
      pushMeta();
    },
  };
}

export type AccessApiFactory = (connection: ConnectionLike | undefined) => AccessApi | null;
let factory: AccessApiFactory = (connection) => (connection ? createWsAccessApi(connection) : null);
export function setAccessApiFactory(next: AccessApiFactory) {
  factory = next;
}
export function getAccessApi(connection: ConnectionLike | undefined) {
  return factory(connection);
}

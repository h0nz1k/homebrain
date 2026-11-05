import type { ConnectionLike } from '@homebrain/ha-client';
import { modalityOf } from './domain.js';
import type { Modality } from './types.js';
import type { LockAction, LogbookEntry } from './log.js';
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
  /** Structured BioLock history kept by HomeBrain (newest first, paged by `before`). */
  history(opts?: {
    before?: string;
    limit?: number;
  }): Promise<{ items: HistoryItem[]; more: boolean }>;
  /** HA logbook entries of the given entities (read-only core API). */
  logbook(start: string, end: string, entityIds: string[]): Promise<LogbookEntry[]>;
  /** Live logbook entries from `start` on (HA `logbook/event_stream`). */
  subscribeLogbook(
    start: string,
    entityIds: string[],
    callback: (entries: LogbookEntry[]) => void,
  ): Promise<() => void>;
  /** Nuki lock actions (HA event entity history: event_type + trigger/auth_id/code_id). */
  lockActions(start: string, end: string, entityId: string): Promise<LockAction[]>;
}

interface CompressedState {
  s: string;
  a?: Record<string, unknown>;
  lu?: number;
  lc?: number;
}
/** HA `history/history_during_period` rows of an event entity → lock actions. */
export function lockActionsFromHistory(rows: CompressedState[] | undefined): LockAction[] {
  const out: LockAction[] = [];
  for (const row of rows ?? []) {
    const a = row.a ?? {};
    if (typeof a.event_type !== 'string') continue;
    const t = Number.isNaN(Date.parse(row.s))
      ? new Date((row.lu ?? 0) * 1000).toISOString()
      : new Date(row.s).toISOString();
    out.push({
      time: t,
      action: a.event_type,
      trigger: Number(a.trigger ?? -1),
      auth_id: Number(a.auth_id ?? 0),
      code_id: Number(a.code_id ?? 0),
    });
  }
  return out;
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
    history: (opts = {}) => call<{ items: HistoryItem[]; more: boolean }>('history', opts),
    async logbook(start, end, entityIds) {
      if (!entityIds.length) return [];
      return connection.sendMessagePromise<LogbookEntry[]>({
        type: 'logbook/get_events',
        start_time: start,
        end_time: end,
        entity_ids: entityIds,
      } as { type: string });
    },
    async subscribeLogbook(start, entityIds, callback) {
      if (!connection.subscribeMessage || !entityIds.length) return () => undefined;
      const unsub = await connection.subscribeMessage<{ events?: LogbookEntry[] }>(
        (msg: { events?: LogbookEntry[] }) => {
          if (msg.events?.length) callback(msg.events);
        },
        { type: 'logbook/event_stream', start_time: start, entity_ids: entityIds } as {
          type: string;
        },
      );
      return () => void unsub();
    },
    async lockActions(start, end, entityId) {
      const res = await connection.sendMessagePromise<Record<string, CompressedState[]>>({
        type: 'history/history_during_period',
        start_time: start,
        end_time: end,
        entity_ids: [entityId],
        include_start_time_state: false,
        significant_changes_only: false,
        minimal_response: false,
        no_attributes: false,
      } as { type: string });
      return lockActionsFromHistory(res?.[entityId]);
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
  /** Emit biolock-firmware#9 live progress (`enroll_progress`) during simulated enrolments. */
  progress?: boolean;
  /** Reasons for the next enrolments to fail with (consumed one by one). */
  failNext?: string[];
  /** Switch/select commands are forwarded here (dev: updates the fake HA states). */
  onEntity?: (action: AccessAction, data: Record<string, unknown>) => void;
  /** Synthetic HA logbook entries (lock / BioLock entities) and Nuki lock actions. */
  logbook?: LogbookEntry[];
  lockActions?: LockAction[];
  /** Read the current service mode (enrolment needs it, like the firmware). */
  serviceMode?: () => boolean;
  log?: Array<{ action: string; data: unknown }>;
}
export interface MockAccessApi extends AccessApi {
  /** Tests/e2e: push an event as if the device fired it. */
  emit(event: AccessEvent): void;
  /** Tests/e2e: an enrolment started outside the panel (HA script) – retry, then the result. */
  externalEnrol(spec: { type: Modality; name: string; ok: boolean; reason?: string }): void;
  /** Tests/e2e: a live HA logbook entry. */
  pushLogbook(entry: LogbookEntry): void;
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
  let requestNo = 0;
  const failNext = [...(options.failNext ?? [])];
  const log = options.log ?? [];
  const wait = (ms = options.latencyMs ?? 120) => new Promise((r) => setTimeout(r, ms));
  let listedAt = new Date().toISOString();
  const emit = (event: AccessEvent) => {
    if (
      event.event === 'recognized' ||
      event.event === 'rejected' ||
      event.event === 'enrolled' ||
      event.event === 'deleted' ||
      event.event === 'lockout'
    )
      history.unshift({ kind: event.event, time: event.time, ...event.data });
    for (const l of listeners) l(event);
  };
  const logbook = [...(options.logbook ?? [])];
  const logListeners = new Set<(entries: LogbookEntry[]) => void>();
  const whenMs = (w: number | string) => (typeof w === 'number' ? w * 1000 : Date.parse(w));
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
    externalEnrol({ type, name, ok, reason }) {
      const now = () => new Date().toISOString();
      emit({
        event: 'enroll_retry',
        time: now(),
        data: {
          type_requested: type,
          name,
          reason: 'face_instead_of_palm',
          attempt: 1,
          remaining_s: 20,
        },
      });
      setTimeout(() => {
        if (!ok) {
          emit({
            event: 'enrolled',
            time: now(),
            data: {
              ok: false,
              user_id: 0,
              type_requested: type,
              name,
              reason: reason ?? 'timeout',
            },
          });
          return;
        }
        const id = nextId(type);
        users = [...users, { id, type, name, allowed: true }].sort((a, b) => a.id - b.id);
        emit({
          event: 'enrolled',
          time: now(),
          data: { ok: true, user_id: id, type, type_requested: type, name, attempts: 2 },
        });
        pushUsers();
      }, options.enrollMs ?? 600);
    },
    pushLogbook(entry) {
      logbook.push(entry);
      for (const l of logListeners) l([entry]);
    },
    async history({ before, limit = 100 } = {}) {
      await wait();
      const items = history.filter((h) => !before || h.time < before).slice(0, limit);
      return { items: structuredClone(items), more: items.length === limit };
    },
    async logbook(start, end, entityIds) {
      await wait();
      return structuredClone(
        logbook.filter(
          (e) =>
            (!e.entity_id || entityIds.includes(e.entity_id)) &&
            whenMs(e.when) >= Date.parse(start) &&
            whenMs(e.when) < Date.parse(end),
        ),
      );
    },
    async subscribeLogbook(_start, _ids, callback) {
      logListeners.add(callback);
      return () => void logListeners.delete(callback);
    },
    async lockActions(start, end) {
      await wait();
      return (options.lockActions ?? []).filter((a) => a.time >= start && a.time < end);
    },
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
          const ms = options.enrollMs ?? 900;
          const reason = !service
            ? options.progress
              ? 'service_mode_off'
              : 'service_mode_required'
            : failNext.shift();
          if (options.progress) {
            const rid = `a1b2-${++requestNo}`;
            const window = Number(data.timeout_s ?? 30);
            const seq: Array<[number, string, string?]> = reason
              ? [
                  [0, 'armed'],
                  [0.6, 'failed', reason],
                ]
              : [
                  [0, 'armed'],
                  [0.15, 'waiting_presence'],
                  [0.35, 'detected', type === 'face' ? 'too_far' : 'show_palm'],
                  [0.6, 'capturing', 'hold_still'],
                  [0.85, 'saving'],
                  [1, 'done'],
                ];
            for (const [f, state, hint] of seq)
              setTimeout(
                () =>
                  emit({
                    event: 'enroll_progress',
                    time: new Date().toISOString(),
                    data: {
                      request_id: rid,
                      modality: type,
                      state,
                      name,
                      remaining_s:
                        state === 'failed' || state === 'done'
                          ? 0
                          : Math.round(window * (1 - f / 4)),
                      ...(hint ? { hint } : {}),
                      ...(state === 'failed' ? { reason } : {}),
                    },
                  }),
                Math.round(ms * f),
              );
          }
          setTimeout(() => {
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
          }, ms);
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

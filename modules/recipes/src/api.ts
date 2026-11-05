import type { ConnectionLike } from '@homebrain/ha-client';
import type { ImportPreview, Recipe, RecipeDraft, RecipeSummary, RecipesConfig } from './types.js';
import { createSyntheticRecipes, syntheticPreview } from './mock.js';
import type { Timer, TimerBackend, TimerSnapshot } from './domain/timers.js';
import type { FryerControl } from './domain/fryerLive.js';

export class RecipesApiError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'RecipesApiError';
  }
}
export type MusicCommand = 'play' | 'pause' | 'next' | 'previous';
export interface AirfryerRequest {
  temperature: number;
  minutes: number;
  method?: string | null;
  confirmed: boolean;
}
export interface RecipesSettings {
  musicNotifyService: string | null;
  availableNotifyServices: string[];
  timerNotifyTargets?: string[];
  availableTimerNotifyTargets?: string[];
}
export interface RecipesApi {
  list(query?: { search?: string; tag?: string; favourite?: boolean }): Promise<RecipeSummary[]>;
  get(id: string): Promise<Recipe>;
  tags(): Promise<Array<{ tag: string; count: number }>>;
  create(recipe: RecipeDraft, photoUrl?: string | null): Promise<Recipe>;
  update(id: string, recipe: RecipeDraft): Promise<Recipe>;
  remove(id: string): Promise<Recipe>;
  setFavourite(id: string, favourite: boolean): Promise<Recipe>;
  setRating(id: string, rating: number | null): Promise<Recipe>;
  cooked(id: string): Promise<Recipe>;
  importUrl(url: string): Promise<ImportPreview>;
  config(): Promise<RecipesConfig>;
  settings(): Promise<RecipesSettings>;
  setSettings(musicNotifyService: string | null): Promise<void>;
  /** notify.<target> services that get „⏰ Minutka: … – hotovo“ (default none). */
  setTimerNotifyTargets(targets: string[]): Promise<void>;
  /** Server-side timers (recipes.db): shared by every device, survive HA restarts. */
  timers: TimerBackend;
  music(command: MusicCommand | 'volume', level?: number): Promise<void>;
  airfryer(request: AirfryerRequest): Promise<{ started: boolean; minutes: number }>;
  /** Live card: pause / stop (needs `confirmed`) / keep warm a running fryer. Never starts it. */
  airfryerControl(action: FryerControl, confirmed?: boolean): Promise<void>;
  /** AutoCook program name from the fryer integration; null when unknown. */
  airfryerProgram?(program: number): Promise<string | null>;
}

function wsCall<T>(
  connection: ConnectionLike,
  type: string,
  payload: Record<string, unknown> = {},
) {
  return connection
    .sendMessagePromise<T>({ type: `homebrain/recipes/${type}`, ...payload })
    .catch((err: { code?: string }) => {
      throw new RecipesApiError(err?.code ?? 'UNKNOWN');
    });
}

export function createWsRecipesApi(connection: ConnectionLike): RecipesApi {
  return {
    list: async (query = {}) =>
      (await wsCall<{ recipes: RecipeSummary[] }>(connection, 'list', query)).recipes,
    get: async (id) =>
      (await wsCall<{ recipe: Recipe }>(connection, 'get', { recipe_id: id })).recipe,
    tags: async () =>
      (await wsCall<{ tags: Array<{ tag: string; count: number }> }>(connection, 'tags')).tags,
    create: async (recipe, photoUrl) =>
      (
        await wsCall<{ recipe: Recipe }>(connection, 'create', {
          recipe,
          ...(photoUrl ? { photo_url: photoUrl } : {}),
        })
      ).recipe,
    update: async (id, recipe) =>
      (await wsCall<{ recipe: Recipe }>(connection, 'update', { recipe_id: id, recipe })).recipe,
    remove: async (id) =>
      (await wsCall<{ recipe: Recipe }>(connection, 'delete', { recipe_id: id })).recipe,
    setFavourite: async (id, favourite) =>
      (await wsCall<{ recipe: Recipe }>(connection, 'set_favourite', { recipe_id: id, favourite }))
        .recipe,
    setRating: async (id, rating) =>
      (await wsCall<{ recipe: Recipe }>(connection, 'set_rating', { recipe_id: id, rating }))
        .recipe,
    cooked: async (id) =>
      (await wsCall<{ recipe: Recipe }>(connection, 'cooked', { recipe_id: id })).recipe,
    importUrl: async (url) => wsCall<ImportPreview>(connection, 'import_url', { url, save: false }),
    config: () => wsCall<RecipesConfig>(connection, 'config'),
    settings: () => wsCall(connection, 'settings_get'),
    setSettings: async (value) => {
      await wsCall(connection, 'settings_set', { music_notify_service: value });
    },
    setTimerNotifyTargets: async (targets) => {
      await wsCall(connection, 'settings_set', { timer_notify_targets: targets });
    },
    timers: {
      subscribe: async (callback) => {
        if (!connection.subscribeMessage) throw new RecipesApiError('NOT_SUPPORTED');
        const unsubscribe = await connection.subscribeMessage<TimerSnapshot>(callback, {
          type: 'homebrain/recipes/timers/subscribe',
        });
        return () => void unsubscribe();
      },
      start: ({ label, seconds, recipeId, stepIndex }) =>
        wsCall(connection, 'timers/start', {
          label,
          seconds: Math.max(1, Math.round(seconds)),
          ...(recipeId ? { recipe_id: recipeId } : {}),
          ...(stepIndex === null || stepIndex === undefined ? {} : { step_index: stepIndex }),
        }),
      update: (id, op, seconds) =>
        wsCall(connection, 'timers/update', {
          timer_id: id,
          op,
          ...(seconds === undefined ? {} : { seconds }),
        }),
      cancel: (id) => wsCall(connection, 'timers/cancel', { timer_id: id }),
    },
    music: async (command, level) => {
      await wsCall(connection, 'music', { command, ...(level === undefined ? {} : { level }) });
    },
    airfryer: (request) => wsCall(connection, 'airfryer', { ...request }),
    airfryerControl: async (action, confirmed = false) => {
      await wsCall(connection, 'airfryer_control', { action, confirmed });
    },
    airfryerProgram: async (program) =>
      (await wsCall<{ name: string | null }>(connection, 'airfryer_program', { program })).name ??
      null,
  };
}

export interface MockRecipesOptions {
  music?: boolean;
  airfryer?: boolean;
  /** Records device commands instead of sending them anywhere. */
  log?: Array<{ kind: string; payload: unknown }>;
  /**
   * Dev server: keep the mock "server" timers in localStorage and follow `storage` events,
   * so two tabs behave like two devices sharing the integration's timers.
   */
  timerStorage?: Storage | null;
}

/** In-memory stand-in for the integration's timer WS API (same semantics). */
export function createMockTimerBackend(storage: Storage | null = null): TimerBackend {
  const key = 'hb-recipes-mock-server-timers';
  const listeners = new Set<(snap: TimerSnapshot) => void>();
  const load = (): Timer[] => {
    try {
      return JSON.parse(storage?.getItem(key) ?? '[]') as Timer[];
    } catch {
      return [];
    }
  };
  let timers: Timer[] = load();
  const publish = () => {
    const snap = { timers: structuredClone(timers), serverNow: Date.now() };
    listeners.forEach((l) => l(snap));
  };
  const save = () => {
    storage?.setItem(key, JSON.stringify(timers));
    publish();
  };
  if (storage && typeof window !== 'undefined')
    window.addEventListener('storage', (e) => {
      if (e.key !== key) return;
      timers = load();
      publish();
    });
  let seq = 0;
  return {
    async subscribe(callback) {
      listeners.add(callback);
      callback({ timers: structuredClone(timers), serverNow: Date.now() });
      return () => void listeners.delete(callback);
    },
    async start({ label, seconds, recipeId, stepIndex }) {
      const same = timers.find(
        (t) => recipeId && t.recipeId === recipeId && t.stepIndex === (stepIndex ?? null),
      );
      if (same) {
        publish(); // the caller drops its optimistic duplicate
        return same;
      }
      seq += 1;
      const durationMs = Math.max(1, Math.round(seconds)) * 1000;
      const timer: Timer = {
        id: `s${Date.now().toString(36)}${seq}`,
        label,
        stepIndex: stepIndex ?? null,
        recipeId,
        durationMs,
        endsAt: Date.now() + durationMs,
        pausedRemainingMs: null,
        acknowledged: false,
      };
      timers = [...timers, timer];
      save();
      return timer;
    },
    async update(id, op, seconds = 60) {
      const now = Date.now();
      timers = timers.map((t) => {
        if (t.id !== id) return t;
        if (op === 'pause' && t.endsAt !== null && t.endsAt > now)
          return { ...t, pausedRemainingMs: t.endsAt - now, endsAt: null };
        if (op === 'resume' && t.endsAt === null)
          return { ...t, endsAt: now + (t.pausedRemainingMs ?? 0), pausedRemainingMs: null };
        if (op === 'add_time')
          return t.endsAt !== null
            ? {
                ...t,
                endsAt: Math.max(t.endsAt, now) + seconds * 1000,
                durationMs: t.durationMs + seconds * 1000,
                acknowledged: false,
              }
            : {
                ...t,
                pausedRemainingMs: (t.pausedRemainingMs ?? 0) + seconds * 1000,
                durationMs: t.durationMs + seconds * 1000,
                acknowledged: false,
              };
        if (op === 'ack') return { ...t, acknowledged: true };
        return t;
      });
      save();
    },
    async cancel(id) {
      timers = timers.filter((t) => t.id !== id);
      save();
    },
  };
}

/** Dev server / tests only: in-memory synthetic recipes, device calls are logged, never sent. */
export function createMockRecipesApi(
  recipes: Recipe[] = createSyntheticRecipes(),
  options: MockRecipesOptions = {},
): RecipesApi {
  let items = recipes.map((r) => structuredClone(r));
  let notify: string | null = options.music ? 'mobile_app_demo_tablet' : null;
  let timerTargets: string[] = [];
  const timers = createMockTimerBackend(options.timerStorage ?? null);
  const log = options.log ?? [];
  const find = (id: string) => {
    const recipe = items.find((r) => r.id === id);
    if (!recipe) throw new RecipesApiError('TARGET_NOT_FOUND');
    return recipe;
  };
  const save = (recipe: Recipe) => {
    items = items.map((r) => (r.id === recipe.id ? recipe : r));
    return structuredClone(recipe);
  };
  const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  return {
    async list(query = {}) {
      const q = fold(query.search ?? '');
      return items
        .filter((r) => !query.favourite || r.favourite)
        .filter((r) => !query.tag || r.tags.includes(query.tag))
        .filter(
          (r) =>
            !q ||
            fold(r.title).includes(q) ||
            r.ingredients.some((i) => fold(i.name).includes(q)) ||
            r.tags.some((t) => fold(t).includes(q)),
        )
        .sort(
          (a, b) =>
            Number(b.favourite) - Number(a.favourite) ||
            (b.lastCookedAt ?? '').localeCompare(a.lastCookedAt ?? ''),
        )
        .map((r) => ({ ...structuredClone(r), ingredientCount: r.ingredients.length }));
    },
    async get(id) {
      return structuredClone(find(id));
    },
    async tags() {
      const counts = new Map<string, number>();
      items.forEach((r) => r.tags.forEach((t) => counts.set(t, (counts.get(t) ?? 0) + 1)));
      return [...counts].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count);
    },
    async create(draft, photoUrl) {
      if (!draft.title.trim()) throw new RecipesApiError('INVALID_FIELD');
      const id = Math.random().toString(16).slice(2).padEnd(32, '0').slice(0, 32);
      const recipe: Recipe = {
        ...structuredClone(draft),
        id,
        photo: photoUrl ? { fullUrl: photoUrl, thumbUrl: photoUrl } : null,
        favourite: false,
        rating: null,
        lastCookedAt: null,
      };
      items = [recipe, ...items];
      return structuredClone(recipe);
    },
    async update(id, draft) {
      return save({ ...find(id), ...structuredClone(draft) });
    },
    async remove(id) {
      const recipe = find(id);
      items = items.filter((r) => r.id !== id);
      return recipe;
    },
    async setFavourite(id, favourite) {
      return save({ ...find(id), favourite });
    },
    async setRating(id, rating) {
      return save({ ...find(id), rating });
    },
    async cooked(id) {
      return save({ ...find(id), lastCookedAt: new Date().toISOString() });
    },
    async importUrl(url) {
      if (!/^https:\/\//.test(url)) throw new RecipesApiError('IMPORT_URL_NOT_ALLOWED');
      return { preview: syntheticPreview(url), duplicateOf: null };
    },
    async config() {
      return {
        music: {
          configured: notify !== null,
          mediaSessionEntity: options.music ? 'sensor.demo_tablet_media_session' : null,
        },
        airfryer: {
          configured: Boolean(options.airfryer),
          allowed: true,
          entities: options.airfryer
            ? {
                drawer: 'binary_sensor.demo_fryer_drawer',
                remaining: 'sensor.demo_fryer_remaining',
              }
            : {},
          methods: options.airfryer ? ['Ruční', 'Hranolky', 'Maso', 'Ryba'] : [],
        },
        canEdit: true,
      };
    },
    async settings() {
      return {
        musicNotifyService: notify,
        availableNotifyServices: ['mobile_app_demo_tablet'],
        timerNotifyTargets: [...timerTargets],
        availableTimerNotifyTargets: ['mobile_app_demo_phone', 'mobile_app_demo_tablet'],
      };
    },
    async setSettings(value) {
      notify = value;
    },
    async setTimerNotifyTargets(targets) {
      timerTargets = [...targets];
    },
    timers,
    async music(command, level) {
      if (!notify) throw new RecipesApiError('NOT_CONFIGURED');
      log.push({ kind: 'music', payload: { command, level } });
    },
    async airfryer(request) {
      if (!options.airfryer) throw new RecipesApiError('NOT_CONFIGURED');
      if (!request.confirmed) throw new RecipesApiError('CONFIRMATION_REQUIRED');
      log.push({ kind: 'airfryer', payload: request });
      return { started: true, minutes: request.minutes };
    },
    async airfryerControl(action, confirmed = false) {
      if (action === 'stop' && !confirmed) throw new RecipesApiError('CONFIRMATION_REQUIRED');
      log.push({ kind: 'airfryer_control', payload: { action } });
    },
    async airfryerProgram(program) {
      // Synthetic dev names only – the vendor catalogue is never part of the repo.
      return program === 14 ? 'Demo hranolky' : null;
    },
  };
}

export type RecipesApiFactory = (connection: ConnectionLike | undefined) => RecipesApi | null;
let factory: RecipesApiFactory = (connection) =>
  connection ? createWsRecipesApi(connection) : null;
export function setRecipesApiFactory(next: RecipesApiFactory) {
  factory = next;
}
export function getRecipesApi(connection: ConnectionLike | undefined) {
  return factory(connection);
}

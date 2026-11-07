import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  navigatePanel,
  navigateUp,
  useBackClosable,
  useEntity,
  type ConnectionLike,
  type EntityStore,
  type ModuleViewProps,
} from '@homebrain/ha-client';
import { ConfirmDialog, EmptyState, runMutation, Skeleton, toast } from '@homebrain/ui';
import { getRecipesApi, RecipesApiError, type RecipesApi } from '../api.js';
import { createTimerStore, type TimerStore } from '../domain/timers.js';
import { formatDuration, krokyWord, porce, scaleIngredients } from '../domain/scale.js';
import type { Recipe, RecipeSummary, RecipesConfig } from '../types.js';
import { AddRecipe } from './AddRecipe.js';
import { KitchenTimers, KitchenTimersButton } from './KitchenTimers.js';
import {
  AirfryerStep,
  Icon,
  MusicBar,
  TimerCard,
  VideoPip,
  playChime,
  useWakeLock,
} from './parts.js';
import { FryerLiveCard } from './FryerLive.js';
import { recipesStyles } from './styles.js';

const BASE = '/recipes';
type Route =
  | { view: 'list' }
  | { view: 'add' }
  | { view: 'timers' }
  | { view: 'detail'; id: string }
  | { view: 'cook'; id: string; step: number }
  | { view: 'edit'; id: string };

export function parseRoute(path = ''): Route {
  const [a, b, c] = path.replace(/^\/+/, '').split('/').filter(Boolean);
  if (!a) return { view: 'list' };
  if (a === 'pridat') return { view: 'add' };
  if (a === 'minutky') return { view: 'timers' };
  if (b === 'varit') return { view: 'cook', id: a, step: Math.max(0, Number(c ?? 1) - 1) || 0 };
  if (b === 'upravit') return { view: 'edit', id: a };
  return { view: 'detail', id: a };
}

/** One store per API instance: the integration owns the timers (shared by all devices). */
const sharedTimers = new WeakMap<RecipesApi, TimerStore>();
function timerStore(api: RecipesApi): TimerStore {
  let store = sharedTimers.get(api);
  if (!store) {
    store = createTimerStore({
      backend: api.timers ?? null,
      storage: typeof localStorage === 'undefined' ? null : localStorage,
      onAlarm: (t) => {
        playChime();
        toast.info(`⏰ Minutka: ${t.label} – hotovo`, { id: `timer-${t.id}` });
      },
    });
    sharedTimers.set(api, store);
  }
  return store;
}
export function useTimers(store: TimerStore) {
  const timers = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const active = timers.length > 0;
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => store.tick(), 250);
    return () => clearInterval(id);
  }, [active, store]);
  return timers;
}

function useConfig(api: RecipesApi | null) {
  const [config, setConfig] = useState<RecipesConfig | null>(null);
  useEffect(() => {
    let alive = true;
    api
      ?.config()
      .then((c) => alive && setConfig(c))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [api]);
  return config;
}

const EMPTY_ENTITY = '';
function useOptionalEntity(store: EntityStore, entityId: string | null | undefined) {
  const state = useEntity(store, entityId ?? EMPTY_ENTITY);
  return entityId ? state : undefined;
}

export default function RecipesView({ store, route, connection }: ModuleViewProps) {
  const api = useMemo(() => getRecipesApi(connection), [connection]);
  const config = useConfig(api);
  const parsed = parseRoute(route?.path);
  if (!api) {
    return (
      <div className="rc">
        <style>{recipesStyles}</style>
        <EmptyState title="Recepty nejsou dostupné">Chybí spojení s Home Assistantem.</EmptyState>
      </div>
    );
  }
  return (
    <div className="rc" data-testid="recipes-view">
      <style>{recipesStyles}</style>
      {parsed.view === 'list' ? <RecipeList api={api} config={config} store={store} /> : null}
      {parsed.view === 'add' ? <AddRecipe api={api} config={config} /> : null}
      {parsed.view === 'timers' ? <TimersRoute api={api} connection={connection} /> : null}
      {parsed.view === 'edit' ? <AddRecipe api={api} config={config} editId={parsed.id} /> : null}
      {parsed.view === 'detail' || parsed.view === 'cook' ? (
        <RecipeLoader api={api} id={parsed.id}>
          {(recipe, setRecipe) =>
            parsed.view === 'cook' ? (
              <CookingMode
                api={api}
                config={config}
                recipe={recipe}
                step={parsed.step}
                store={store}
              />
            ) : (
              <RecipeDetail api={api} config={config} recipe={recipe} onChange={setRecipe} />
            )
          }
        </RecipeLoader>
      ) : null}
    </div>
  );
}

function TimersRoute({ api, connection }: { api: RecipesApi; connection?: ConnectionLike }) {
  const timers = timerStore(api);
  const views = useTimers(timers);
  return <KitchenTimers store={timers} views={views} connection={connection} />;
}

function RecipeLoader({
  api,
  id,
  children,
}: {
  api: RecipesApi;
  id: string;
  children: (recipe: Recipe, set: (r: Recipe) => void) => React.ReactNode;
}) {
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [errorId, setErrorId] = useState<string | null>(null);
  const error = errorId === id;
  useEffect(() => {
    let alive = true;
    api
      .get(id)
      .then((r) => alive && setRecipe(r))
      .catch(() => alive && setErrorId(id));
    return () => {
      alive = false;
    };
  }, [api, id]);
  if (error)
    return (
      <EmptyState title="Recept nenalezen">
        <p>Mohl být smazán.</p>
        <button type="button" className="rc-btn rc-sec" onClick={() => navigateUp(BASE)}>
          Zpět na recepty
        </button>
      </EmptyState>
    );
  if (!recipe || recipe.id !== id)
    return (
      <Skeleton variant="card" lines={4} label="Načítám recept…" data-testid="recipes-loading" />
    );
  return <>{children(recipe, setRecipe)}</>;
}

/* ---------------- list ---------------- */
/** Header entry to Minutky; shows how many kitchen timers run (shared by all devices). */
function KitchenTimersLink({ api }: { api: RecipesApi }) {
  const views = useTimers(timerStore(api));
  const running = views.filter((v) => v.status !== 'done').length;
  return <KitchenTimersButton running={running} onOpen={() => navigatePanel(`${BASE}/minutky`)} />;
}

function RecipeList({
  api,
  config,
  store,
}: {
  api: RecipesApi;
  config: RecipesConfig | null;
  store: EntityStore;
}) {
  const [search, setSearch] = useState('');
  const [tag, setTag] = useState<string | null>(null);
  const [favOnly, setFavOnly] = useState(false);
  const [items, setItems] = useState<RecipeSummary[] | null>(null);
  const [tags, setTags] = useState<Array<{ tag: string; count: number }>>([]);
  const load = useCallback(() => {
    api
      .list({
        search: search.trim() || undefined,
        tag: tag ?? undefined,
        favourite: favOnly || undefined,
      })
      .then(setItems)
      .catch(() => {
        setItems([]);
        toast.error('Recepty se nepodařilo načíst');
      });
  }, [api, search, tag, favOnly]);
  useEffect(() => {
    const id = setTimeout(load, search ? 200 : 0);
    return () => clearTimeout(id);
  }, [load, search]);
  useEffect(() => {
    api
      .tags()
      .then(setTags)
      .catch(() => undefined);
  }, [api]);
  const toggleFav = (r: RecipeSummary) => {
    setItems(
      (list) => list?.map((x) => (x.id === r.id ? { ...x, favourite: !r.favourite } : x)) ?? null,
    );
    api.setFavourite(r.id, !r.favourite).catch(() => {
      toast.error('Oblíbené se nepodařilo uložit');
      load();
    });
  };
  return (
    <>
      <header className="rc-top">
        <div className="rc-ttl">
          <h1>Recepty</h1>
          <p>
            {items
              ? `${items.length} ${items.length === 1 ? 'recept' : items.length < 5 && items.length > 1 ? 'recepty' : 'receptů'}`
              : ' '}
          </p>
        </div>
        <label className="rc-search">
          <Icon name="search" />
          <input
            type="search"
            value={search}
            placeholder="Hledat recept nebo surovinu"
            aria-label="Hledat recept nebo surovinu"
            data-testid="recipes-search"
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <KitchenTimersLink api={api} />
        {config?.canEdit ? (
          <button
            type="button"
            className="rc-btn rc-pri"
            data-testid="recipes-add"
            onClick={() => navigatePanel(`${BASE}/pridat`)}
          >
            <Icon name="plus" /> Přidat recept
          </button>
        ) : null}
      </header>
      <FryerLiveCard
        api={api}
        store={store}
        statusEntity={config?.airfryer.entities.status}
        allowed={config ? config.airfryer.allowed : false}
      />
      <div className="rc-chips" role="toolbar" aria-label="Filtry">
        <button
          type="button"
          className="rc-chip"
          aria-pressed={!tag && !favOnly}
          onClick={() => (setTag(null), setFavOnly(false))}
        >
          Vše
        </button>
        <button
          type="button"
          className="rc-chip fav"
          aria-pressed={favOnly}
          onClick={() => setFavOnly((v) => !v)}
        >
          <Icon name="heart" /> Oblíbené
        </button>
        {tags.map((t) => (
          <button
            key={t.tag}
            type="button"
            className="rc-chip"
            aria-pressed={tag === t.tag}
            onClick={() => setTag(tag === t.tag ? null : t.tag)}
          >
            {t.tag} <span className="ct">{t.count}</span>
          </button>
        ))}
      </div>
      {items && items.length === 0 ? (
        <div className="rc-empty">
          {search || tag || favOnly
            ? 'Nic nenalezeno.'
            : 'Zatím žádné recepty – přidejte první z odkazu.'}
        </div>
      ) : null}
      <div className="rc-grid" data-testid="recipes-grid">
        {items?.map((r) => (
          <article className="rc-card" key={r.id} data-testid="recipes-card">
            <button type="button" className="open" onClick={() => navigatePanel(`${BASE}/${r.id}`)}>
              <div className="rc-ph">
                {r.photo?.thumbUrl ? <img src={r.photo.thumbUrl} alt="" loading="lazy" /> : null}
                {r.totalSeconds ? (
                  <span className="rc-badge">
                    <Icon name="clock" /> {formatDuration(r.totalSeconds)}
                  </span>
                ) : null}
              </div>
              <h3>{r.title}</h3>
              <div className="rc-meta">
                {r.servings ? <span>{porce(r.servings)}</span> : null}
                {r.servings && r.tags[0] ? <i className="dot" /> : null}
                {r.tags[0] ? <span>{r.tags[0]}</span> : null}
              </div>
            </button>
            <button
              type="button"
              className="rc-heart"
              aria-pressed={r.favourite}
              aria-label={r.favourite ? 'Odebrat z oblíbených' : 'Přidat do oblíbených'}
              onClick={() => toggleFav(r)}
            >
              <Icon name="heart" />
            </button>
          </article>
        ))}
      </div>
    </>
  );
}

/* ---------------- detail ---------------- */
function useServings(recipe: Recipe) {
  const key = `hb-recipes-servings-${recipe.id}`;
  const [servings, setServings] = useState<number>(
    () => Number(sessionStorage.getItem(key)) || recipe.servings || 4,
  );
  useEffect(() => {
    sessionStorage.setItem(key, String(servings));
  }, [key, servings]);
  return [servings, setServings] as const;
}

function RecipeDetail({
  api,
  config,
  recipe,
  onChange,
}: {
  api: RecipesApi;
  config: RecipesConfig | null;
  recipe: Recipe;
  onChange: (r: Recipe) => void;
}) {
  const [servings, setServings] = useServings(recipe);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const scaled = scaleIngredients(recipe.ingredients, recipe.servings, servings);
  const fav = () => {
    onChange({ ...recipe, favourite: !recipe.favourite });
    api
      .setFavourite(recipe.id, !recipe.favourite)
      .catch(() => toast.error('Oblíbené se nepodařilo uložit'));
  };
  const [confirmRemove, setConfirmRemove] = useState(false);
  const remove = () =>
    runMutation(() => api.remove(recipe.id), {
      key: `recipes/remove/${recipe.id}`,
      success: 'Recept smazán',
      error: 'Recept se nepodařilo smazat',
      onSuccess: () => navigateUp(BASE),
    });
  return (
    <div className="rc-detail" data-testid="recipes-detail">
      <section className="rc-col rc-c1">
        <div className="rc-hero">
          {recipe.photo?.fullUrl ? <img src={recipe.photo.fullUrl} alt="" /> : null}
          <button
            type="button"
            className="rc-glass l"
            aria-label="Zpět"
            onClick={() => navigateUp(BASE)}
          >
            <Icon name="back" />
          </button>
          <div className="r">
            <button
              type="button"
              className="rc-glass"
              aria-pressed={recipe.favourite}
              aria-label="Oblíbené"
              onClick={fav}
            >
              <Icon name="heart" />
            </button>
            {config?.canEdit ? (
              <>
                <button
                  type="button"
                  className="rc-glass"
                  aria-label="Upravit"
                  onClick={() => navigatePanel(`${BASE}/${recipe.id}/upravit`)}
                >
                  <Icon name="edit" />
                </button>
              </>
            ) : null}
          </div>
        </div>
        <h1>{recipe.title}</h1>
        {recipe.description ? <p className="rc-lead">{recipe.description}</p> : null}
        <div className="rc-stats">
          <div>
            <b>{formatDuration(recipe.totalSeconds) || '–'}</b>
            <span>celkem</span>
          </div>
          <div>
            <b>{formatDuration(recipe.prepSeconds) || '–'}</b>
            <span>příprava</span>
          </div>
          <div>
            <b>{recipe.steps.length}</b>
            <span>{krokyWord(recipe.steps.length)}</span>
          </div>
        </div>
        <div className="rc-cta">
          <button
            type="button"
            className="rc-btn rc-pri"
            data-testid="recipes-start"
            onClick={() => navigatePanel(`${BASE}/${recipe.id}/varit`)}
          >
            <Icon name="play" /> Začít vařit
          </button>
        </div>
      </section>
      <section className="rc-col">
        <div className="rc-panel">
          <div className="rc-sec-h">
            <h2>Suroviny</h2>
            <div className="rc-stepper" role="group" aria-label="Počet porcí">
              <button
                type="button"
                aria-label="Méně porcí"
                onClick={() => setServings((s) => Math.max(1, s - 1))}
              >
                <Icon name="minus" />
              </button>
              <span className="v" data-testid="recipes-servings" aria-live="polite">
                {porce(servings)}
              </span>
              <button
                type="button"
                aria-label="Více porcí"
                onClick={() => setServings((s) => Math.min(40, s + 1))}
              >
                <Icon name="plus" />
              </button>
            </div>
          </div>
          {scaled.length ? (
            <div className="rc-progress">
              <span>
                {checked.size} z {scaled.length} připraveno
              </span>
              <span className="tr">
                <i style={{ width: `${(checked.size / scaled.length) * 100}%` }} />
              </span>
            </div>
          ) : null}
          <ul className="rc-ing">
            {scaled.map((item, i) => {
              const head = item.group && item.group !== scaled[i - 1]?.group ? item.group : null;
              const on = checked.has(i);
              return (
                <li key={i}>
                  {head ? <div className="grp">{head}</div> : null}
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    data-testid="recipes-ingredient"
                    onClick={() =>
                      setChecked((s) => {
                        const n = new Set(s);
                        if (on) n.delete(i);
                        else n.add(i);
                        return n;
                      })
                    }
                  >
                    <span className="rc-ck">{on ? <Icon name="check" /> : null}</span>
                    <span className="n">
                      {item.name}
                      {item.note ? <small>{item.note}</small> : null}
                    </span>
                    {item.qtyText ? (
                      <span className={`q${item.changed ? ' chg' : ''}`}>{item.qtyText}</span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </section>
      <section className="rc-col">
        <div className="rc-panel">
          {recipe.youtubeId ? (
            <button
              type="button"
              className="rc-video"
              onClick={() => navigatePanel(`${BASE}/${recipe.id}/varit`)}
            >
              {recipe.photo?.thumbUrl ? <img src={recipe.photo.thumbUrl} alt="" /> : null}
              <span className="ov">
                <span className="rc-play">
                  <Icon name="play" />
                </span>
                <span>
                  <b>Video postupu</b>
                  <span>přehraje se u každého kroku od správného místa</span>
                </span>
              </span>
            </button>
          ) : null}
          <div className="rc-sec-h">
            <h2>Postup</h2>
            {recipe.sourceName ? <small>{recipe.sourceName}</small> : null}
          </div>
          <ol className="rc-steps">
            {recipe.steps.map((s, i) => (
              <li key={i}>
                <span className="no">{i + 1}</span>
                <div>
                  <p>
                    {s.text}
                    {s.timerSeconds ? (
                      <>
                        {' '}
                        <span className="rc-tm">
                          <Icon name="timer" /> {formatDuration(s.timerSeconds)}
                        </span>
                      </>
                    ) : null}
                    {s.airfryer ? (
                      <span className="rc-fry">
                        <Icon name="fryer" /> {s.airfryer.temperature} °C · {s.airfryer.minutes} min
                      </span>
                    ) : null}
                  </p>
                </div>
              </li>
            ))}
          </ol>
          {config?.canEdit ? (
            <button
              type="button"
              className="rc-remove"
              data-testid="recipes-remove"
              onClick={() => setConfirmRemove(true)}
            >
              <Icon name="trash" /> Smazat recept
            </button>
          ) : null}
          {confirmRemove ? (
            <RemoveConfirm
              title={recipe.title}
              onConfirm={remove}
              onClose={() => setConfirmRemove(false)}
            />
          ) : null}
        </div>
      </section>
    </div>
  );
}

/* ---------------- cooking mode ---------------- */
function CookingMode({
  api,
  config,
  recipe,
  step,
  store,
}: {
  api: RecipesApi;
  config: RecipesConfig | null;
  recipe: Recipe;
  step: number;
  store: EntityStore;
}) {
  const timers = timerStore(api);
  const views = useTimers(timers);
  const total = recipe.steps.length;
  const index = Math.min(step, Math.max(0, total - 1));
  const current = recipe.steps[index];
  const next = recipe.steps[index + 1];
  const [servings] = useServings(recipe);
  const scaled = scaleIngredients(recipe.ingredients, recipe.servings, servings);
  const wake = useWakeLock(true);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const session = useOptionalEntity(store, config?.music.mediaSessionEntity);
  const drawer = useOptionalEntity(store, config?.airfryer.entities.drawer);
  const remaining = useOptionalEntity(store, config?.airfryer.entities.remaining);
  const musicPlaying =
    String(session?.attributes?.playback_state ?? session?.state ?? '').toLowerCase() === 'playing';

  const go = useCallback(
    (to: number) => {
      if (to < 0) return;
      if (to >= total) {
        api.cooked(recipe.id).catch(() => undefined);
        toast.success('Dobrou chuť!');
        navigateUp(`${BASE}/${recipe.id}`);
        return;
      }
      navigatePanel(`${BASE}/${recipe.id}/varit/${to + 1}`, true);
    },
    [api, recipe.id, total],
  );
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.closest('input, textarea, select')) return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') {
        e.preventDefault();
        go(index + 1);
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        go(index - 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, index]);
  const touch = useRef<{ x: number; y: number } | null>(null);

  const stepTimer = views.find(
    (t) => t.recipeId === recipe.id && t.stepIndex === index && t.status !== 'done',
  );
  const startStepTimer = () => {
    if (!current?.timerSeconds) return;
    if (stepTimer) return;
    timers.add(`${recipe.title} · krok ${index + 1}`, current.timerSeconds, index, recipe.id);
  };
  const mentioned = scaled.filter((ing) =>
    current?.text.toLowerCase().includes(ing.name.toLowerCase().split(' ')[0]!.slice(0, 5)),
  );
  const stepIngredients = mentioned.length ? mentioned : scaled;
  if (!current) return <div className="rc-empty">Recept nemá žádné kroky.</div>;
  return (
    <div
      className="rc-cook"
      data-testid="recipes-cooking"
      onTouchStart={(e) => (touch.current = { x: e.touches[0]!.clientX, y: e.touches[0]!.clientY })}
      onTouchEnd={(e) => {
        const start = touch.current;
        touch.current = null;
        if (!start) return;
        const dx = e.changedTouches[0]!.clientX - start.x;
        const dy = e.changedTouches[0]!.clientY - start.y;
        if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5) go(index + (dx < 0 ? 1 : -1));
      }}
    >
      <div className="rc-ctop">
        <button
          type="button"
          className="rc-ibtn"
          aria-label="Ukončit vaření"
          onClick={() => navigateUp(`${BASE}/${recipe.id}`)}
        >
          <Icon name="close" />
        </button>
        <span className="rt">{recipe.title}</span>
        <div className="rc-segs" aria-hidden="true">
          {recipe.steps.map((_, i) => (
            <i key={i} className={i < index ? 'd' : i === index ? 'c' : ''} />
          ))}
        </div>
        <span className="stp" data-testid="recipes-step-no">
          Krok {index + 1} / {total}
        </span>
        {wake ? (
          <span className="rc-wake" title="Obrazovka nezhasne">
            <Icon name="sun" />
            <span>Displej nezhasne</span>
          </span>
        ) : null}
      </div>
      <div className="rc-cmain">
        <section className="rc-cstep" aria-live="polite">
          {current.group ? <div className="lbl">{current.group}</div> : null}
          <p className="rc-big" data-testid="recipes-step-text">
            {current.text}
            {current.timerSeconds && !stepTimer ? (
              <>
                {' '}
                <button
                  type="button"
                  className="rc-tm"
                  data-testid="recipes-step-timer"
                  data-state="idle"
                  onClick={startStepTimer}
                >
                  <Icon name="timer" />
                  {formatDuration(current.timerSeconds)}
                </button>
              </>
            ) : null}
          </p>
          {current.airfryer ? (
            <AirfryerStep
              api={api}
              config={config}
              action={current.airfryer}
              drawer={drawer}
              remaining={remaining}
              onStarted={(minutes) => {
                if (!stepTimer)
                  timers.add(
                    `Fritéza · ${recipe.title} · krok ${index + 1}`,
                    minutes * 60,
                    index,
                    recipe.id,
                  );
              }}
            />
          ) : null}
          {stepIngredients.length ? (
            <>
              <span className="rc-lab4">
                {mentioned.length ? 'V tomto kroku' : 'Suroviny po ruce'}
              </span>
              <div className="rc-ing4">
                {stepIngredients.slice(0, 4).map((m, i) => (
                  <div className="u" key={i}>
                    <b>{m.qtyText ?? '–'}</b>
                    {m.name}
                  </div>
                ))}
              </div>
            </>
          ) : null}
          {views.length ? (
            <div className="rc-tstrip" data-testid="recipes-timers">
              {views.map((t) => (
                <TimerCard key={t.id} timer={t} store={timers} soon={t.remainingMs < 60_000} />
              ))}
            </div>
          ) : null}
        </section>
        <aside className="rc-side">
          {recipe.youtubeId ? (
            <VideoPip
              youtubeId={recipe.youtubeId}
              startAt={current.videoTs}
              poster={recipe.photo?.thumbUrl}
              api={api}
              musicPlaying={musicPlaying}
              onPlayingChange={setVideoPlaying}
            />
          ) : null}
          {next ? (
            <button type="button" className="rc-next" onClick={() => go(index + 1)}>
              <span className="lab">Další krok</span>
              <p>{next.text}</p>
            </button>
          ) : (
            <div className="rc-next">
              <span className="lab">Poslední krok</span>
              <p>Pak už jen dobrou chuť.</p>
            </div>
          )}
        </aside>
      </div>
      <nav className="rc-cnav" aria-label="Kroky">
        <button
          type="button"
          className="rc-navbtn"
          disabled={index === 0}
          onClick={() => go(index - 1)}
        >
          <Icon name="left" /> Zpět
        </button>
        {api ? (
          <MusicBar api={api} config={config} session={session} videoPlaying={videoPlaying} />
        ) : null}
        <button
          type="button"
          className="rc-navbtn go"
          data-testid="recipes-next"
          onClick={() => go(index + 1)}
        >
          {index + 1 >= total ? 'Hotovo' : 'Další krok'}{' '}
          <Icon name={index + 1 >= total ? 'check' : 'right'} />
        </button>
      </nav>
    </div>
  );
}

function RemoveConfirm({
  title,
  onConfirm,
  onClose,
}: {
  title: string;
  onConfirm: () => unknown;
  onClose: () => void;
}) {
  useBackClosable(onClose);
  return (
    <ConfirmDialog
      title={`Smazat recept „${title}“?`}
      confirmLabel="Smazat"
      danger
      onConfirm={onConfirm}
      onClose={onClose}
      data-testid="recipes-remove-dialog"
      confirmTestId="recipes-remove-confirm"
    >
      Recept zmizí ze sbírky i z oblíbených. Vrátit to nejde.
    </ConfirmDialog>
  );
}

export { RecipesApiError };

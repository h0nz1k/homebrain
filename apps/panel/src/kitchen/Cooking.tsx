import { KitchenSheet } from './Sheet';
import { useEffect, useMemo, useState } from 'react';
import {
  navigatePanel,
  useBackClosable,
  useEntity,
  type ModuleViewProps,
} from '@homebrain/ha-client';
import { Button } from '@homebrain/ui';
import { useCooking, cookStateLabel, formatTemp, remainingLabel } from '@homebrain/module-today';
import {
  FryerControl,
  FryerLiveCard,
  KitchenTimers,
  QuickTimer,
  TimerCard,
  getRecipesApi,
  timerStore,
  useTimers,
  detectFryerEntities,
  fryerPhase,
  fryerVisible,
  readFryerStates,
  recipesStyles,
  kitchenTimersStyles,
  type RecipeSummary,
} from '@homebrain/module-recipes';
import { cookingOrder, reachedTarget } from './state';
import { openApp } from './api';
import type { KitchenConfig } from './types';

function CookingSheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useBackClosable(onClose);
  return (
    <KitchenSheet title={title} onClose={onClose}>
      <div className="rc kn-reuse">{children}</div>
    </KitchenSheet>
  );
}
export function Cooking(props: ModuleViewProps & { config: KitchenConfig }) {
  const api = useMemo(() => getRecipesApi(props.connection), [props.connection]);
  const probes = useCooking(props.connection);
  const [sheet, setSheet] = useState<'fryer' | 'timers' | 'quick' | null>(null);
  const [query, setQuery] = useState('');
  const [favourites, setFavourites] = useState(true);
  const [recipes, setRecipes] = useState<RecipeSummary[]>([]);
  const [failed, setFailed] = useState(false);
  const timers = useMemo(() => (api ? timerStore(api) : null), [api]);
  // The shared timer store stays subscribed while this tab is mounted; HA owns persistence.
  useEffect(() => {
    let alive = true;
    const timer = setTimeout(() => {
      if (api)
        void api
          .list({ search: query, favourite: favourites })
          .then((r) => {
            if (alive) {
              setRecipes(r);
              setFailed(false);
            }
          })
          .catch(() => {
            if (alive) setFailed(true);
          });
    }, 250);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [api, query, favourites]);
  if (!api || !timers)
    return <p role="status">Vaření není dostupné. Zkontrolujte spojení s Home Assistantem.</p>;
  return (
    <CookingContent
      {...props}
      api={api}
      timers={timers}
      probes={probes}
      sheet={sheet}
      setSheet={setSheet}
      query={query}
      setQuery={setQuery}
      favourites={favourites}
      setFavourites={setFavourites}
      recipes={recipes}
      failed={failed}
    />
  );
}
function CookingContent({
  api,
  timers,
  probes,
  sheet,
  setSheet,
  query,
  setQuery,
  favourites,
  setFavourites,
  recipes,
  failed,
  ...props
}: ModuleViewProps & {
  config: KitchenConfig;
  api: NonNullable<ReturnType<typeof getRecipesApi>>;
  timers: ReturnType<typeof timerStore>;
  probes: ReturnType<typeof useCooking>;
  sheet: 'fryer' | 'timers' | 'quick' | null;
  setSheet: (v: 'fryer' | 'timers' | 'quick' | null) => void;
  query: string;
  setQuery: (v: string) => void;
  favourites: boolean;
  setFavourites: (v: boolean) => void;
  recipes: RecipeSummary[];
  failed: boolean;
}) {
  const views = useTimers(timers);
  const ids = detectFryerEntities(props.store.entityIds(), props.bindings);
  // FryerLiveCard subscribes to its own bindings; refresh ordering only for the status entity.
  const status = useEntity(props.store, ids?.status ?? '');
  const fryerActive = Boolean(
    status && ids && fryerVisible(fryerPhase(readFryerStates(props.store, ids))),
  );
  const activeTimers = views.filter((t) => t.status !== 'done');
  const active = {
    fryer: fryerActive,
    meater: probes.some((p) => p.state !== 'ready' && p.state !== 'done'),
    timers: activeTimers.length > 0,
  };
  const order = cookingOrder(active);
  const cards: Record<string, React.ReactNode> = {
    recipes: (
      <section className="kn-recipes kn-card" data-testid="kitchen-recipes">
        <div className="kn-section-head">
          <h2>Recepty</h2>
          <Button onClick={() => navigatePanel('/recipes')}>Vše ›</Button>
        </div>
        <div className="kn-search">
          <label>
            Najít recept nebo surovinu
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Co budete vařit?"
            />
          </label>
          <Button aria-pressed={favourites} onClick={() => setFavourites(!favourites)}>
            ♥ Oblíbené
          </Button>
        </div>
        {failed ? <p role="alert">Recepty nejsou dostupné.</p> : null}
        {!recipes.length && !failed ? (
          <p>Žádné recepty. Zkuste jiné hledání nebo vypněte filtr oblíbených.</p>
        ) : null}
        <div className="kn-recipe-grid">
          {recipes.slice(0, 4).map((r) => (
            <button
              type="button"
              key={r.id}
              onClick={() => navigatePanel(`/recipes/${encodeURIComponent(r.id)}`)}
            >
              {r.photo?.thumbUrl ? (
                <img src={r.photo.thumbUrl} alt="" />
              ) : (
                <span className="kn-dish" aria-hidden="true">
                  ◉
                </span>
              )}
              <b>{r.title}</b>
              <span>
                {r.totalSeconds ? `${Math.round(r.totalSeconds / 60)} min` : 'Otevřít recept'}
              </span>
            </button>
          ))}
        </div>
      </section>
    ),
    fryer: (
      <section className="kn-card kn-fryer" data-active={active.fryer} data-testid="kitchen-fryer">
        <h2>Horkovzdušná fritéza</h2>
        {fryerActive ? (
          <div className="rc kn-reuse">
            <FryerLiveCard api={api} store={props.store} statusEntity={ids?.status} allowed />
          </div>
        ) : (
          <div className="kn-idle">
            <span aria-hidden="true">♨</span>
            <p>
              {status && !['unknown', 'unavailable'].includes(status.state)
                ? 'Nic nepeče'
                : 'Stav fritézy není dostupný'}
              <span>Teplotu a čas zvolíte před spuštěním.</span>
            </p>
          </div>
        )}
        <Button onClick={() => setSheet('fryer')}>Otevřít fritézu</Button>
      </section>
    ),
    meater: (
      <section className="kn-card" data-active={active.meater} data-testid="kitchen-meater">
        <div className="kn-section-head">
          <h2>MEATER</h2>
          <span>Pouze náhled</span>
        </div>
        {probes.length ? (
          probes.map((p) => (
            <div className="kn-probe" key={p.id}>
              <b>
                {p.name} · {cookStateLabel(p.state)}
              </b>
              <div className="kn-temps">
                <span>
                  <strong>{formatTemp(p.internal)}</strong>Maso
                </span>
                <span>
                  <b>{formatTemp(p.target)}</b>Cíl
                </span>
                <span>
                  <b>{formatTemp(p.ambient)}</b>Okolí
                </span>
              </div>
              <p>{remainingLabel(p)}</p>
              {reachedTarget(p) ? (
                <Button
                  disabled={activeTimers.some(
                    (t) => t.label === `Odpočinek masa · ${p.name.slice(0, 40)}`,
                  )}
                  onClick={() =>
                    timers.add(
                      `Odpočinek masa · ${p.name.slice(0, 40)}`,
                      props.config.rest_minutes * 60,
                    )
                  }
                >
                  Spustit odpočinek masa
                </Button>
              ) : null}
            </div>
          ))
        ) : (
          <p className="kn-calm">Žádná sonda právě nevaří.</p>
        )}
        <Button onClick={() => openApp(props.config.meater_url)}>
          Nastavit v aplikaci MEATER ↗
        </Button>
      </section>
    ),
    timers: (
      <section
        className="kn-card kn-timers"
        data-active={active.timers}
        data-testid="kitchen-timers-card"
      >
        <div className="kn-section-head">
          <h2>Minutky</h2>
          <Button onClick={() => setSheet('quick')}>+ Minutka</Button>
        </div>
        <div className="rc kn-reuse">
          {activeTimers.length ? (
            activeTimers.map((t) => (
              <TimerCard
                key={t.id}
                timer={t}
                store={timers}
                soon={t.remainingMs < 60_000}
                addMinute
              />
            ))
          ) : (
            <p className="kn-calm">Žádná minutka neběží.</p>
          )}
        </div>
        <Button onClick={() => setSheet('timers')}>Všechny minutky ›</Button>
      </section>
    ),
  };
  return (
    <div className="kn-cooking">
      <style>{recipesStyles + kitchenTimersStyles}</style>
      {order.map((id) => (
        <div key={id} className={`kn-cook-slot kn-slot-${id}`}>
          {cards[id]}
        </div>
      ))}
      {sheet ? (
        <CookingSheet
          title={sheet === 'fryer' ? 'Fritéza' : sheet === 'quick' ? 'Nová minutka' : 'Minutky'}
          onClose={() => setSheet(null)}
        >
          {sheet === 'fryer' ? (
            <FryerControl api={api} store={props.store} />
          ) : sheet === 'quick' ? (
            <QuickTimer store={timers} />
          ) : (
            <KitchenTimers store={timers} views={views} connection={props.connection} />
          )}
        </CookingSheet>
      ) : null}
    </div>
  );
}

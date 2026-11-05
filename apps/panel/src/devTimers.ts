import { registerTodaySignalSource } from '@homebrain/module-today';
import { recipesTimersTodaySignalSource, type RecipesApi } from '@homebrain/module-recipes';

/**
 * Dev server only. `?timers=1` adds the kitchen-timer feed to the Dnes fixtures;
 * `?timers=demo` also seeds three synthetic timers into the mock „server“ (shared by tabs);
 * `?timers=done` seeds one that finishes after 2 s (ringing state on Dnes).
 */
export function installDevKitchenTimers(api: RecipesApi, query: URLSearchParams): void {
  const mode = query.get('timers');
  if (!mode) return;
  registerTodaySignalSource('recipes.timers', recipesTimersTodaySignalSource);
  if (mode !== 'demo' && mode !== 'done') return;
  const seeded = 'hb-dev-timers-seeded';
  if (sessionStorage.getItem(seeded)) return;
  sessionStorage.setItem(seeded, '1');
  void (async () => {
    await api.timers.start({ label: 'Vejce M naměkko (2 ks)', seconds: mode === 'done' ? 2 : 200 });
    await api.timers.start({ label: 'Těstoviny', seconds: 460 });
    await api.timers.start({ label: 'Rýže', seconds: 905 });
  })();
}

import {
  clearTodaySignalSources,
  createMockAdapter,
  createMockCookingSource,
  createMockHomeApi,
  installCoffeeFixtures,
  setCookingSourceFactory,
  setTodayAdapterFactory,
  setTodayHomeApiFactory,
  stateFromUrl,
  type CookingScenario,
  type HomeRole,
} from '@homebrain/module-today';
import { devQuery, live, type DevHass } from './shared.js';

/**
 * Dnes: fixtures, meals and MEATER probes. Runs first: it clears the Dnes signal sources that
 * modules.ts registered, the other mocks may then register their own.
 */
export function registerTodayMocks(): void {
  installCoffeeFixtures(location.search);
  const haAge = new URLSearchParams(location.search).get('ha_age');
  if (!live)
    setTodayAdapterFactory(() =>
      createMockAdapter(stateFromUrl(location.search), {
        haAgeS: haAge === null ? undefined : Number(haAge),
      }),
    );
  // Dnes „Co se dnes vaří“ + kids' chores: `?jidlo=empty` = nothing planned, no kids;
  // `?jidlo=none` = Mealie not installed (no meals tile at all).
  const jidlo = devQuery.get('jidlo');
  // Dnes „Maso v troubě“ (MEATER): `?maso=1|2|4` active probes (2 = one „Sundat z tepla“).
  const maso = devQuery.get('maso') ?? (devQuery.get('cooking') === 'active' ? '2' : null);
  setCookingSourceFactory(() =>
    createMockCookingSource(
      maso === '1' || maso === '2' || maso === '4' ? (maso as CookingScenario) : 'none',
    ),
  );
  const homeApi = createMockHomeApi(
    jidlo === 'empty' || jidlo === 'none' ? jidlo : 'full',
    (devQuery.get('role') as HomeRole | null) ?? 'owner',
  );
  setTodayHomeApiFactory(() => homeApi);
  // Dnes fixtures stay deterministic; `?weather=<scenario>` overlays the weather feed.
  if (!live && !new URLSearchParams(location.search).has('weather')) clearTodaySignalSources();
}

/** Synthetic `sun.sun` (built-in HA entity): next rising/setting around fixed local times. */
export function addTodayStates({ hass, now }: DevHass): void {
  function nextAt(hour: number, minute: number) {
    const at = new Date(now);
    at.setHours(hour, minute, 0, 0);
    if (at.getTime() <= now.getTime()) at.setDate(at.getDate() + 1);
    return at.toISOString();
  }
  hass.states['sun.sun'] = {
    entity_id: 'sun.sun',
    state: 'above_horizon',
    last_updated: now.toISOString(),
    attributes: { next_rising: nextAt(6, 56), next_setting: nextAt(16, 47) },
  };
}

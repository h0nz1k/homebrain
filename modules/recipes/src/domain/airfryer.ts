/** Airfryer step action: availability + guarded send (server also enforces all rules). */
import type { AirfryerAction, RecipesConfig } from '../types.js';

export type AirfryerBlock =
  'not_configured' | 'not_allowed' | 'drawer_open' | 'drawer_unknown' | null;

export function airfryerBlock(
  config: RecipesConfig | null,
  drawerState: string | undefined,
): AirfryerBlock {
  if (!config?.airfryer.configured) return 'not_configured';
  if (!config.airfryer.allowed) return 'not_allowed';
  if (drawerState === 'on') return 'drawer_open';
  if (drawerState !== 'off') return 'drawer_unknown';
  return null;
}

export const BLOCK_TEXT: Record<Exclude<AirfryerBlock, null>, string> = {
  not_configured: 'Fritéza není nastavená',
  not_allowed: 'Fritézu může spustit jen dospělý',
  drawer_open: 'Zavřete zásuvku fritézy',
  drawer_unknown: 'Stav fritézy není známý',
};

/** Remaining minutes from the optional remaining-time sensor (min or s by unit). */
export function remainingMinutes(
  state: { state: string; attributes: Record<string, unknown> } | undefined,
): number | null {
  if (!state) return null;
  const value = Number(state.state);
  if (!Number.isFinite(value) || value <= 0) return null;
  const unit = String(state.attributes.unit_of_measurement ?? 'min');
  return unit === 's'
    ? Math.ceil(value / 60)
    : unit === 'h'
      ? Math.round(value * 60)
      : Math.round(value);
}

export function describeAction(action: AirfryerAction): string {
  return [`${action.temperature} °C`, `${action.minutes} min`, action.method]
    .filter(Boolean)
    .join(' · ');
}

import type { MediaItem } from './types';

export function batteryLabel(level: string | null, state: string | null): string {
  const chip = batteryChip(level, state);
  if (chip.pct === null) return 'Tablet · baterie nedostupná';
  return `Tablet ${chip.pct} %${chip.hint ? ` · ${chip.hint}` : ''}`;
}

export function batteryChip(
  level: string | null,
  state: string | null,
): { pct: number | null; hint: string; charging: boolean } {
  const n = level === null ? NaN : Number(level);
  if (!Number.isFinite(n) || n < 0 || n > 100)
    return { pct: null, hint: 'nedostupná', charging: false };
  const stopped = ['not_charging', 'not charging', 'discharging', 'full'].includes(
    (state ?? '').toLowerCase(),
  );
  const charging = (state ?? '').toLowerCase() === 'charging';
  const hint =
    stopped && n >= 80 ? 'nabíjení omezeno' : charging ? 'nabíjí se' : '';
  return { pct: Math.round(n), hint, charging };
}
export function filterPlaylists(items: MediaItem[], provider: string, query: string): MediaItem[] {
  const q = query.toLocaleLowerCase('cs-CZ').trim();
  return items.filter(
    (i) =>
      (!provider || !i.providers.length || i.providers.includes(provider)) &&
      i.name.toLocaleLowerCase('cs-CZ').includes(q),
  );
}
export function cookingOrder(active: {
  fryer: boolean;
  meater: boolean;
  timers: boolean;
}): string[] {
  const devices = ['fryer', 'meater', 'timers'] as const;
  return devices.some((k) => active[k])
    ? [...devices.filter((k) => active[k]), ...devices.filter((k) => !active[k]), 'recipes']
    : ['recipes', ...devices];
}
export function reachedTarget(probe: {
  state: string;
  internal: number | null;
  target: number | null;
}): boolean {
  return (
    probe.state === 'remove' ||
    (probe.internal !== null &&
      probe.target !== null &&
      probe.internal >= probe.target &&
      probe.state !== 'resting')
  );
}

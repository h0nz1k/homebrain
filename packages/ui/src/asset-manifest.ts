import { useEffect, useState } from 'react';

/**
 * Owner-supplied device pictures („photo cards“): a folder in Home Assistant
 * `/config/www/homebrain/<module>/…` (served as `/local/…`) with a `manifest.json` that names the
 * images. Nothing of it is bundled; without a manifest the card keeps its built-in illustration.
 * Shared by Roboti and the Recepty airfryer card – each module brings its own manifest parser.
 */
export type AssetManifestParser<T> = (data: unknown) => T | null;

/** „Bobík“ → „bobik“ (folder name derived from a device name). */
export function assetSlug(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Plain file name inside the asset folder (optionally one sub-folder deep, never `..`). */
export function isAssetFile(name: unknown, nested = false): name is string {
  if (typeof name !== 'string' || name.length < 1 || name.length > 120) return false;
  return nested ? /^(?:[\w-]+\/)?[\w-][\w.-]*$/.test(name) : /^[\w.-]+$/.test(name);
}

// One cache per parser: the same folder could in theory be read by two modules.
const caches = new Map<AssetManifestParser<unknown>, Map<string, Promise<unknown>>>();

/** Fetch + validate `<base>manifest.json` once per folder; `null` when missing or invalid. */
export function loadAssetManifest<T>(
  base: string,
  parse: AssetManifestParser<T>,
): Promise<T | null> {
  let cache = caches.get(parse as AssetManifestParser<unknown>);
  if (!cache) caches.set(parse as AssetManifestParser<unknown>, (cache = new Map()));
  let hit = cache.get(base) as Promise<T | null> | undefined;
  if (!hit) {
    hit =
      typeof fetch === 'function' && /^(\/|https?:)/.test(base)
        ? fetch(`${base}manifest.json`, { credentials: 'same-origin' })
            .then((res) => (res.ok ? res.json() : null))
            .then((data: unknown) => (data == null ? null : parse(data)))
            .catch(() => null)
        : Promise.resolve(null);
    cache.set(base, hit);
  }
  return hit;
}

export function clearAssetManifestCache() {
  caches.clear();
}

/** Manifest of a photo folder; `undefined` while loading, `null` = no photo set (use fallback). */
export function useAssetManifest<T>(
  base: string | null,
  parse: AssetManifestParser<T>,
): T | null | undefined {
  const [state, setState] = useState<{ base: string; manifest: T | null }>();
  useEffect(() => {
    if (!base) return undefined;
    let live = true;
    void loadAssetManifest(base, parse).then((manifest) => {
      if (live) setState({ base, manifest });
    });
    return () => {
      live = false;
    };
  }, [base, parse]);
  if (!base) return null;
  return state?.base === base ? state.manifest : undefined;
}

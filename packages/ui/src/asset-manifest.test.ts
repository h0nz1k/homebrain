import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  assetSlug,
  clearAssetManifestCache,
  isAssetFile,
  loadAssetManifest,
} from './asset-manifest.js';

afterEach(() => {
  clearAssetManifestCache();
  vi.unstubAllGlobals();
});

describe('asset manifest helper', () => {
  it('slugs device names and validates file names', () => {
    expect(assetSlug('Bobík')).toBe('bobik');
    expect(isAssetFile('front.webp')).toBe(true);
    expect(isAssetFile('m/front.webp')).toBe(false);
    expect(isAssetFile('m/front.webp', true)).toBe(true);
    expect(isAssetFile('../front.webp', true)).toBe(false);
    expect(isAssetFile('a/b/c.webp', true)).toBe(false);
  });

  it('fetches each folder once per parser and falls back to null', async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.startsWith('/ok/')
        ? new Response(JSON.stringify({ v: 1 }), { status: 200 })
        : new Response('', { status: 404 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const parse = (d: unknown) => ((d as { v?: number }).v === 1 ? 'parsed' : null);
    expect(await loadAssetManifest('/ok/', parse)).toBe('parsed');
    expect(await loadAssetManifest('/ok/', parse)).toBe('parsed');
    expect(await loadAssetManifest('/missing/', parse)).toBeNull();
    expect(await loadAssetManifest('relative/', parse)).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/ok/manifest.json');
  });
});

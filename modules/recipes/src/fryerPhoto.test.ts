import { describe, expect, it } from 'vitest';
import { fryerPhotoView, parseFryerPhotoManifest } from './fryerPhoto.js';

const valid = {
  schema: 1,
  model: 'Synthetic fryer',
  images: { front: 'demo/front.webp', drawerOpen: 'demo/open.webp', display: 'display.webp' },
  hotspots: { display: [40, 10, 58, 26], drawer: [2, 38, 98, 96] },
};

describe('fryer photo manifest', () => {
  it('accepts a manifest with optional sub-folder file names', () => {
    const m = parseFryerPhotoManifest(valid);
    expect(m?.images.front).toBe('demo/front.webp');
    expect(m?.hotspots.display).toEqual([40, 10, 58, 26]);
    expect(m?.hotspots.panel).toBeUndefined();
  });

  it('reads the body finish and ignores unknown values', () => {
    expect(parseFryerPhotoManifest({ ...valid, finish: 'light' })?.finish).toBe('light');
    expect(parseFryerPhotoManifest({ ...valid, finish: 'chrome' })?.finish).toBeUndefined();
    expect(parseFryerPhotoManifest(valid)?.finish).toBeUndefined();
  });

  it('rejects path tricks, missing front image and other schemas', () => {
    expect(parseFryerPhotoManifest({ ...valid, images: { front: '../x.webp' } })).toBeNull();
    expect(parseFryerPhotoManifest({ ...valid, images: { front: 'a/b/c.webp' } })).toBeNull();
    expect(parseFryerPhotoManifest({ ...valid, images: {} })).toBeNull();
    expect(parseFryerPhotoManifest({ ...valid, schema: 2 })).toBeNull();
    expect(parseFryerPhotoManifest(null)).toBeNull();
  });

  it('drops invalid hotspots and unsafe optional images instead of failing', () => {
    const m = parseFryerPhotoManifest({
      ...valid,
      images: { front: 'front.webp', drawerOpen: 'https://x/y.webp' },
      hotspots: { display: [50, 10, 40, 20], drawer: [1, 2, 3] },
    });
    expect(m?.images.drawerOpen).toBeUndefined();
    expect(m?.hotspots).toEqual({ display: undefined, drawer: undefined, panel: undefined });
  });

  it('shows the drawer-out photo only while the food waits to be shaken', () => {
    const m = parseFryerPhotoManifest(valid)!;
    expect(fryerPhotoView(m, 'cooking')).toEqual({
      image: 'demo/front.webp',
      drawerOut: false,
      nudge: false,
    });
    expect(fryerPhotoView(m, 'action').image).toBe('demo/open.webp');
    expect(fryerPhotoView(m, 'drawer').drawerOut).toBe(true);
    const noOpen = parseFryerPhotoManifest({ ...valid, images: { front: 'f.webp' } })!;
    expect(fryerPhotoView(noOpen, 'action')).toEqual({
      image: 'f.webp',
      drawerOut: false,
      nudge: true,
    });
  });
});

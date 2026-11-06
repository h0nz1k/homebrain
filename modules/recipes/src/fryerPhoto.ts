import { isAssetFile } from '@homebrain/ui';
import type { FryerPhase } from './domain/fryerLive.js';

/**
 * Optional airfryer photo set for the live card (same idea as the Roboti photo cards): the owner
 * puts product pictures + `manifest.json` into Home Assistant `/config/www/homebrain/airfryer/`
 * (served as `/local/homebrain/airfryer/`). Nothing is bundled – without a manifest the card keeps
 * the generic SVG illustration. Image names may sit one folder deeper (`<model>/front.webp`).
 *
 * Hotspots are percent rectangles [left, top, right, bottom] of the FRONT image. `finish` tells
 * the card whether the appliance body is light (white) or dark, so it can pick the display glass
 * colour and the contrast backdrop.
 */
export const FRYER_PHOTO_ROOT = '/local/homebrain/airfryer/';

export type PhotoRect = [number, number, number, number];
export interface FryerPhotoManifest {
  schema: 1;
  model?: string;
  finish?: 'light' | 'dark';
  images: { front: string; drawerOpen?: string; display?: string };
  hotspots: { display?: PhotoRect; drawer?: PhotoRect; panel?: PhotoRect };
}

function rect(value: unknown): PhotoRect | undefined {
  if (!Array.isArray(value) || value.length !== 4) return undefined;
  if (!value.every((n) => typeof n === 'number' && Number.isFinite(n) && n >= -50 && n <= 150))
    return undefined;
  const [x0, y0, x1, y1] = value as PhotoRect;
  return x1 > x0 && y1 > y0 ? [x0, y0, x1, y1] : undefined;
}

export function parseFryerPhotoManifest(data: unknown): FryerPhotoManifest | null {
  if (!data || typeof data !== 'object') return null;
  const raw = data as Record<string, unknown>;
  if (raw.schema !== 1) return null;
  const images = (raw.images ?? {}) as Record<string, unknown>;
  if (!isAssetFile(images.front, true)) return null;
  const optional = (name: unknown) => (isAssetFile(name, true) ? name : undefined);
  const spots = (raw.hotspots ?? {}) as Record<string, unknown>;
  const model = typeof raw.model === 'string' ? raw.model.slice(0, 80) : undefined;
  const finish = raw.finish === 'light' || raw.finish === 'dark' ? raw.finish : undefined;
  return {
    schema: 1,
    ...(model ? { model } : {}),
    ...(finish ? { finish } : {}),
    images: {
      front: images.front,
      drawerOpen: optional(images.drawerOpen),
      display: optional(images.display),
    },
    hotspots: {
      display: rect(spots.display),
      drawer: rect(spots.drawer),
      panel: rect(spots.panel),
    },
  };
}

/** Which picture a phase shows: the drawer-out photo while the food waits to be shaken. */
export function fryerPhotoView(
  manifest: FryerPhotoManifest,
  phase: FryerPhase,
): { image: string; drawerOut: boolean; nudge: boolean } {
  const out = phase === 'action' || phase === 'drawer';
  if (out && manifest.images.drawerOpen)
    return { image: manifest.images.drawerOpen, drawerOut: true, nudge: false };
  // No drawer-out picture: front photo with a gentle drawer nudge instead.
  return { image: manifest.images.front, drawerOut: false, nudge: out };
}

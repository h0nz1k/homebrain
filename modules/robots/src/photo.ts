import { z } from 'zod';
import { assetSlug, clearAssetManifestCache, loadAssetManifest } from '@homebrain/ui';
import type { ConsumableInfo } from './consumables.js';
import type { ErrorAdvice } from './errors.js';
import type { RobotTone } from './status.js';

/**
 * Optional per-robot photo set („2.5D“ card): owner-supplied pictures + a manifest that lives in
 * Home Assistant `/config/www/homebrain/robots/<robot>/` (served as `/local/…`). Nothing of it is
 * bundled – without a manifest the hero keeps the neutral illustration.
 *
 * All coordinates are percent (0–100) of the bottom image (square, robot front = top edge).
 */
export const PHOTO_ROOT = '/local/homebrain/robots/';

const pct = z.number().min(-50).max(150);
const point = z.tuple([pct, pct]);
const rect = z.tuple([pct, pct, pct, pct]);
const file = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[\w.-]+$/, 'plain file name inside the robot folder');

export const photoManifestSchema = z.object({
  schema: z.literal(1),
  model: z.string().max(80).optional(),
  images: z.object({ dock: file, bottom: file, sideBrush: file.optional() }),
  bottom: z
    .object({
      roller: rect.optional(),
      caster: rect.optional(),
      wheels: z.array(rect).max(4).optional(),
      /** Round mops: [centre x, centre y, radius]; neighbours counter-rotate. */
      mops: z
        .array(z.tuple([pct, pct, pct]))
        .max(2)
        .optional(),
      /** Vibrating mop plate (VibraRise): rectangle that buzzes while cleaning. */
      plate: rect.optional(),
      /** Side-brush sprite: square box [left, top, size]; rotates around the box centre. */
      sideBrush: z
        .object({
          box: z.tuple([pct, pct, pct]),
          centre: point.optional(),
          dir: z.union([z.literal(1), z.literal(-1)]),
        })
        .optional(),
    })
    .default({}),
  hotspots: z
    .object({
      bottom: z.record(z.string(), point).default({}),
      dock: z.record(z.string(), point).default({}),
    })
    .default({ bottom: {}, dock: {} }),
});
export type PhotoManifest = z.infer<typeof photoManifestSchema>;

/** „Bobík“ → „bobik“ (folder name of the default photo path); shared with other photo cards. */
export const photoSlug = assetSlug;

/**
 * Folder of the photo set. The robot option „Obrázek robota“ may point to a folder (`…/`) or its
 * `manifest.json`; a single picture keeps the old behaviour (no photo set). Default:
 * `/local/homebrain/robots/<slug of the robot name>/`.
 */
export function photoBase(robot: { name: string; image: string }): string | null {
  const image = robot.image.trim();
  if (image.endsWith('/')) return image;
  if (image.endsWith('/manifest.json')) return image.slice(0, -'manifest.json'.length);
  if (image) return null;
  const slug = photoSlug(robot.name);
  return slug ? `${PHOTO_ROOT}${slug}/` : null;
}

export function parsePhotoManifest(data: unknown): PhotoManifest | null {
  const parsed = photoManifestSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

export function loadPhotoManifest(base: string): Promise<PhotoManifest | null> {
  return loadAssetManifest(base, parsePhotoManifest);
}
export function clearPhotoCache() {
  clearAssetManifestCache();
}

export type PhotoView = 'dock' | 'cleaning' | 'error' | 'maintenance' | 'parked';
const IN_DOCK: RobotTone[] = ['docked', 'charging', 'emptying', 'washing', 'idle', 'offline'];

/** Which photo the card shows: dock photo at rest, animated bottom view while it works. */
export function photoView(
  tone: RobotTone,
  error: ErrorAdvice | null,
  maintenance: boolean,
): PhotoView {
  if (maintenance) return 'maintenance';
  if (error && error.severity === 'error') return 'error';
  if (tone === 'cleaning' || tone === 'returning') return 'cleaning';
  return IN_DOCK.includes(tone) ? 'dock' : 'parked';
}

/** Error part → hotspot on the bottom photo or the dock photo (null = badge only). */
export function errorHotspot(
  manifest: PhotoManifest,
  error: ErrorAdvice,
): { layer: 'bottom' | 'dock'; at: [number, number] } | null {
  if (error.source === 'dock' || error.part === 'dock' || error.part === 'water_tank') {
    const dock = manifest.hotspots.dock;
    const at =
      error.part === 'water_tank'
        ? (dock.clean_tank ?? dock.dirty_tank)
        : (dock.dirty_tank ?? dock.dust_bag);
    return at ? { layer: 'dock', at } : null;
  }
  const at = manifest.hotspots.bottom[error.part];
  return at ? { layer: 'bottom', at } : null;
}

/** Below this the part is due soon (amber dot and amber „Údržba“ badge). */
export const LOW_PART_PERCENT = 25;

export function maintenanceDots(manifest: PhotoManifest, parts: ConsumableInfo[]) {
  return parts
    .filter((part) => manifest.hotspots.bottom[part.kind])
    .map((part) => ({
      kind: part.kind,
      label: part.label,
      percent: part.percent,
      low: part.percent < LOW_PART_PERCENT,
      at: manifest.hotspots.bottom[part.kind]!,
    }));
}

export function anyPartLow(parts: ConsumableInfo[]): boolean {
  return parts.some((part) => part.percent < LOW_PART_PERCENT);
}

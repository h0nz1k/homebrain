import { z } from 'zod';
import { loadAssetManifest, useAssetManifest } from '@homebrain/ui';

/**
 * Optional owner logo on the heat-pump schematic: files + `manifest.json` in Home Assistant
 * `/config/www/homebrain/heating/` (served as `/local/homebrain/heating/`). Never bundled.
 */
export const HEATING_LOGO_ROOT = '/local/homebrain/heating/';

const file = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[\w.-]+$/, 'plain file name inside the heating folder');

export const heatingLogoManifestSchema = z.object({
  schema: z.literal(1),
  logo: file,
  logoDark: file.optional(),
});

export type HeatingLogoManifest = z.infer<typeof heatingLogoManifestSchema>;

export function parseHeatingLogoManifest(data: unknown): HeatingLogoManifest | null {
  const parsed = heatingLogoManifestSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

export function loadHeatingLogoManifest(): Promise<HeatingLogoManifest | null> {
  return loadAssetManifest(HEATING_LOGO_ROOT, parseHeatingLogoManifest);
}

export function useHeatingLogoManifest(): HeatingLogoManifest | null | undefined {
  return useAssetManifest(HEATING_LOGO_ROOT, parseHeatingLogoManifest);
}

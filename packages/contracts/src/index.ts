import { z } from 'zod';

export const DataQuality = z.enum([
  'ok',
  'stale',
  'unavailable',
  'invalid_unit',
  'unverified_polarity',
]);
export type DataQuality = z.infer<typeof DataQuality>;

export const EntityValue = z.object({
  entityId: z.string().min(1),
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  unit: z.string().optional(),
  updatedAt: z.iso.datetime(),
  quality: DataQuality,
  source: z.string().min(1),
});
export type EntityValue = z.infer<typeof EntityValue>;

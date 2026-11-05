import { z } from 'zod';
import type { DataQuality } from '@homebrain/contracts';

export const WasteType = z.enum([
  'plastic',
  'paper',
  'glass',
  'mixed',
  'bio',
  'electro',
  'hazardous',
  'bulky',
  'other',
]);
export type WasteType = z.infer<typeof WasteType>;
export const CollectionAvailability = z.enum([
  'confirmed',
  'tentative',
  'cancelled',
  'unavailable',
]);
export type CollectionAvailability = z.infer<typeof CollectionAvailability>;
export const SourceStatus = z.enum(['available', 'stale', 'unavailable', 'error']);
export type SourceStatus = z.infer<typeof SourceStatus>;

export const WasteCollectionEvent = z.strictObject({
  id: z.string().min(1),
  waste_type: WasteType,
  display_name: z.string().min(1),
  collection_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  availability: CollectionAvailability,
  /** Optional last collection date; fill is an estimate, never a measured level. */
  last_collection_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  visual_token: z.enum([
    'waste.plastic',
    'waste.paper',
    'waste.glass',
    'waste.mixed',
    'waste.bio',
    'waste.electro',
    'waste.hazardous',
    'waste.bulky',
    'waste.other',
  ]),
  source_updated_at: z.string().nullable(),
});
export type WasteCollectionEvent = z.infer<typeof WasteCollectionEvent>;

export const WasteDashboardDataset = z.strictObject({
  schema_version: z.literal(1),
  generated_at: z.string().min(1),
  source_status: SourceStatus,
  source_updated_at: z.string().nullable(),
  events: z.array(WasteCollectionEvent),
  notices: z.array(z.string()),
});
export type WasteDashboardDataset = z.infer<typeof WasteDashboardDataset>;

export interface WasteSchedule {
  referenceDate: string;
  quality: Extract<DataQuality, 'ok' | 'stale' | 'unavailable'>;
  sourceStatus: SourceStatus;
  sourceUpdatedAt: string | null;
  upcoming: WasteCollectionEvent[];
  /** Collections before `referenceDate` (history), oldest first; never cancelled ones. */
  past: WasteCollectionEvent[];
  today: WasteCollectionEvent[];
  tomorrow: WasteCollectionEvent[];
  next: WasteCollectionEvent | null;
  cancelled: WasteCollectionEvent[];
  rejectedCount: number;
  notices: string[];
}

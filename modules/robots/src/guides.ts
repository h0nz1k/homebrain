import { z } from 'zod';
import type { ConsumableKind } from './consumables.js';

/**
 * Maintenance guides („Roboti → Údržba“): per robot an optional private `guides/guides.json` next
 * to the photo manifest in Home Assistant (`/local/homebrain/robots/<robot>/guides/`). Model
 * specific steps, step pictures and vendor videos live only there (never bundled); without it the
 * guide falls back to the generic text below.
 */
export type GuidePart =
  ConsumableKind | 'mop' | 'wheel' | 'clean_water' | 'dirty_water' | 'cleaning_fluid' | 'dust_bag';

/** Guide-only parts (no counter / tank entity): shown as „Údržba“ tiles when a private guide exists. */
export const EXTRA_GUIDE_PARTS: readonly GuidePart[] = [
  'filter',
  'mop',
  'wheel',
  'dust_bag',
  'clean_water',
  'dirty_water',
  'cleaning_fluid',
  'dock_strainer',
  'dock_brush',
];

/** Tank tiles of the dock card → guide part. */
export const TANK_GUIDE: Record<string, GuidePart | undefined> = {
  clean_water: 'clean_water',
  water_shortage: 'clean_water',
  dirty_water: 'dirty_water',
  cleaning_fluid: 'cleaning_fluid',
};

const file = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[\w.-]+$/, 'plain file name inside the guides folder');
const pct = z.number().min(-50).max(150);

const guideSchema = z.object({
  title: z.string().min(1).max(60),
  interval: z.string().max(120).optional(),
  /** Highlight on the owner's photo: a manifest view (bottom/dock) or a file in the robot folder. */
  photo: z
    .object({
      view: z.enum(['bottom', 'dock']).optional(),
      image: file.optional(),
      spot: z.tuple([pct, pct]).optional(),
      /** Highlight radius in % of the image width. */
      r: z.number().min(2).max(50).optional(),
    })
    .optional(),
  steps: z
    .array(z.object({ text: z.string().min(1).max(240), image: file.optional() }))
    .min(1)
    .max(12),
  video: z.object({ src: file, poster: file.optional() }).optional(),
  source: z
    .object({ label: z.string().max(80), url: z.string().url().startsWith('https://') })
    .optional(),
  /** Counter reset entity (HA Roborock `button.*_reset_*`). Shown only when HA has it. */
  reset: z
    .string()
    .regex(/^button\.[a-z0-9_]+$/)
    .optional(),
});
export type Guide = z.infer<typeof guideSchema>;

export const guidesSchema = z.object({
  schema: z.literal(1),
  model: z.string().max(80).optional(),
  parts: z.record(z.string(), z.unknown()).default({}),
});
export interface GuideSet {
  model?: string;
  parts: Partial<Record<GuidePart, Guide>>;
}

export const guidesBase = (photoBase: string) => `${photoBase}guides/`;

/** Parse guides.json; invalid parts are dropped one by one (one typo never hides the rest). */
export function parseGuides(raw: unknown): GuideSet | null {
  const top = guidesSchema.safeParse(raw);
  if (!top.success) return null;
  const parts: GuideSet['parts'] = {};
  for (const [id, value] of Object.entries(top.data.parts)) {
    const guide = guideSchema.safeParse(value);
    if (guide.success) parts[id as GuidePart] = guide.data;
  }
  return { model: top.data.model, parts };
}

export async function loadGuides(photoBase: string): Promise<GuideSet | null> {
  try {
    const response = await fetch(`${guidesBase(photoBase)}guides.json`, { cache: 'no-cache' });
    if (!response.ok) return null;
    return parseGuides(await response.json());
  } catch {
    return null;
  }
}

const GENERIC: Record<GuidePart, { title: string; interval: string; steps: string[] }> = {
  main_brush: {
    title: 'Hlavní kartáč',
    interval: 'Čistit zhruba 1× týdně',
    steps: [
      'Robota vypněte a otočte vzhůru nohama na měkkou podložku.',
      'Sundejte kryt hlavního kartáče a kartáč vytáhněte.',
      'Odstraňte namotané vlasy a nečistoty, kartáč otřete.',
      'Kartáč vraťte a kryt zacvakněte.',
    ],
  },
  side_brush: {
    title: 'Boční kartáč',
    interval: 'Čistit zhruba 1× měsíčně',
    steps: [
      'Boční kartáček sundejte z hřídele.',
      'Odstraňte vlasy z ramének i z hřídele.',
      'Kartáček nasaďte zpět.',
    ],
  },
  filter: {
    title: 'Prachový koš a filtr',
    interval: 'Vyklepat zhruba 1× týdně',
    steps: [
      'Vytáhněte prachový koš z robota.',
      'Koš vysypte a filtr opatrně vyklepejte.',
      'Pokud návod robota dovoluje praní, nechte filtr úplně proschnout.',
      'Filtr a koš vraťte zpět.',
    ],
  },
  sensors: {
    title: 'Senzory',
    interval: 'Otřít zhruba 1× měsíčně',
    steps: [
      'Suchým měkkým hadříkem otřete senzory na spodku robota.',
      'Otřete přední okénko a horní senzor navigace.',
      'Otřete nabíjecí kontakty robota i doku.',
    ],
  },
  dock_strainer: {
    title: 'Čisticí vanička a sítko',
    interval: 'Vyčistit zhruba 1× týdně',
    steps: [
      'Vytáhněte čisticí vaničku z doku.',
      'Vyjměte sítko a obojí opláchněte.',
      'Vše vraťte zpět, až zacvakne.',
    ],
  },
  dock_brush: {
    title: 'Kartáček doku',
    interval: 'Vyčistit zhruba každé 2 týdny',
    steps: ['Vyjměte čisticí kartáček z vaničky doku.', 'Opláchněte ho a vraťte zpět.'],
  },
  mop: {
    title: 'Mopy',
    interval: 'Vyměnit podle opotřebení',
    steps: [
      'Mop sundejte z držáku pod robotem.',
      'Vyperte ho nebo vyměňte za nový.',
      'Mop nasaďte zpět.',
    ],
  },
  wheel: {
    title: 'Kolečka',
    interval: 'Čistit zhruba 1× měsíčně',
    steps: [
      'Přední kolečko vyjměte a odstraňte namotané vlasy.',
      'Hnací kola otřete hadříkem.',
      'Kolečko vraťte zpět.',
    ],
  },
  clean_water: {
    title: 'Nádrž na čistou vodu',
    interval: 'Doplnit, když dok hlásí prázdnou nádrž',
    steps: ['Vytáhněte nádrž z doku.', 'Naplňte ji studenou vodou.', 'Nádrž vraťte zpět.'],
  },
  dirty_water: {
    title: 'Nádrž na špinavou vodu',
    interval: 'Vylít po mopování',
    steps: ['Vytáhněte nádrž z doku.', 'Vylijte ji a vypláchněte.', 'Nádrž vraťte zpět.'],
  },
  cleaning_fluid: {
    title: 'Saponát',
    interval: 'Doplnit, když dok hlásí, že došel',
    steps: [
      'Otevřete zásobník saponátu v doku.',
      'Doplňte čisticí prostředek určený pro robota.',
      'Zásobník zavřete.',
    ],
  },
  dust_bag: {
    title: 'Sáček na prach',
    interval: 'Vyměnit, když je plný',
    steps: [
      'Otevřete prachovou komoru doku.',
      'Sáček vytáhněte za úchyt.',
      'Vložte nový sáček a komoru zavřete.',
    ],
  },
};

/** Guide for a part: the private one, else generic text (no pictures, no video). */
export function guideFor(
  set: GuideSet | null | undefined,
  part: GuidePart,
): Guide & { generic: boolean } {
  const own = set?.parts[part];
  if (own) return { ...own, generic: false };
  const g = GENERIC[part];
  return {
    title: g.title,
    interval: g.interval,
    steps: g.steps.map((text) => ({ text })),
    generic: true,
  };
}

/** Guide-only „Údržba“ tiles: private guides for parts without a counter/tank tile (no duplicates). */
export function extraGuideParts(
  set: GuideSet | null | undefined,
  tiles: readonly string[],
): GuidePart[] {
  if (!set) return [];
  const shown = new Set(tiles);
  return EXTRA_GUIDE_PARTS.filter((part) => set.parts[part] && !shown.has(part));
}

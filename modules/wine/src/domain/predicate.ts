/**
 * Přívlastek of a quality wine – zákon č. 321/2004 Sb., § 19 odst. 5–11. It states the
 * minimum must sugar of the grapes at harvest (°NM), NOT the sweetness of the bottle: a
 * "výběr z hroznů" can be fermented completely dry. Sweetness lives in `sugar.ts`.
 */
export const PREDICATES = [
  'kabinetni',
  'pozdni_sber',
  'vyber_z_hroznu',
  'vyber_z_bobuli',
  'vyber_z_cibeb',
  'ledove',
  'slamove',
] as const;
export type Predicate = (typeof PREDICATES)[number];
/** 'none' = jakostní / zemské víno / VOC or nothing recorded (no přívlastek on the label). */
export type PredicateKey = Predicate | 'none';

export const PREDICATE_CS: Record<PredicateKey, string> = {
  kabinetni: 'Kabinetní víno',
  pozdni_sber: 'Pozdní sběr',
  vyber_z_hroznu: 'Výběr z hroznů',
  vyber_z_bobuli: 'Výběr z bobulí',
  vyber_z_cibeb: 'Výběr z cibéb',
  ledove: 'Ledové víno',
  slamove: 'Slámové víno',
  none: 'Bez přívlastku',
};

/** Minimum must sugar in °NM (§ 19 odst. 5–11). */
export const PREDICATE_MIN_NM: Record<Predicate, number> = {
  kabinetni: 19,
  pozdni_sber: 21,
  vyber_z_hroznu: 24,
  vyber_z_bobuli: 27,
  vyber_z_cibeb: 32,
  ledove: 27,
  slamove: 27,
};

const PATTERNS: Array<[RegExp, Predicate]> = [
  [/\bkabinet/, 'kabinetni'],
  [/\bpozdni sber/, 'pozdni_sber'],
  [/\bvyber z hroznu/, 'vyber_z_hroznu'],
  [/\bvyber z bobuli/, 'vyber_z_bobuli'],
  [/\bvyber z cibeb/, 'vyber_z_cibeb'],
  [/\bledov/, 'ledove'],
  [/\bslamov/, 'slamove'],
];

export function predicateKey(text: string | null | undefined): PredicateKey {
  const k = (text ?? '')
    .toLocaleLowerCase('cs')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, ' ');
  for (const [re, value] of PATTERNS) if (re.test(k)) return value;
  return 'none';
}

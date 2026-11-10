/** Decorative room glyph from a Czech room name (synthetic fixtures, no real household data). */
export type RoomIconKind =
  | 'sofa'
  | 'pot'
  | 'dining'
  | 'door'
  | 'toilet'
  | 'bath'
  | 'laundry'
  | 'closet'
  | 'bed'
  | 'kids'
  | 'desk'
  | 'pantry'
  | 'garage'
  | 'plant'
  | 'stairs'
  | 'generic';

function norm(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function has(hay: string, ...needles: string[]): boolean {
  return needles.some((n) => hay.includes(n));
}

export function roomIconKind(name: string): RoomIconKind {
  const n = norm(name);
  if (!n) return 'generic';
  if (has(n, 'wc', 'zachod', 'toaleta')) return 'toilet';
  if (has(n, 'koupel')) return 'bath';
  if (has(n, 'pradel')) return 'laundry';
  if (has(n, 'satn')) return 'closet';
  if (has(n, 'obyvak', 'obyvaci pokoj')) return 'sofa';
  if (has(n, 'kuchyn', 'kuchy')) return 'pot';
  if (has(n, 'jidel')) return 'dining';
  if (has(n, 'chodba', 'predsin', 'hala', 'průchod')) return 'door';
  if (has(n, 'lozn', 'spaln')) return 'bed';
  if (has(n, 'detsk', 'deti', 'dite')) return 'kids';
  if (has(n, 'pracov', 'kancel')) return 'desk';
  if (has(n, 'spiz')) return 'pantry';
  if (has(n, 'garaz')) return 'garage';
  if (has(n, 'terasa', 'balkon', 'lodzie')) return 'plant';
  if (has(n, 'schod')) return 'stairs';
  if (has(n, 'pokoj') && !has(n, 'obyvaci', 'detsk', 'host')) return 'generic';
  return 'generic';
}

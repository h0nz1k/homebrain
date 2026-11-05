import type { WineListQuery, WineRecord } from './types.js';

/** Mirror of persistence sort so local replaceWine keeps catalog order truthful. */
export function compareWineRecords(
  left: WineRecord,
  right: WineRecord,
  sort: WineListQuery['sort'],
): number {
  if (sort === 'rating') {
    return (
      (right.personalRating ?? 0) - (left.personalRating ?? 0) || left.id.localeCompare(right.id)
    );
  }
  if (sort === 'vintage') {
    return (right.vintage ?? 0) - (left.vintage ?? 0) || left.id.localeCompare(right.id);
  }
  if (sort === 'id') {
    return left.id.localeCompare(right.id);
  }
  return left.name.localeCompare(right.name, 'cs') || left.id.localeCompare(right.id);
}

export function sortWines(
  wines: readonly WineRecord[],
  sort: WineListQuery['sort'] = 'name',
): WineRecord[] {
  return [...wines].sort((left, right) => compareWineRecords(left, right, sort));
}

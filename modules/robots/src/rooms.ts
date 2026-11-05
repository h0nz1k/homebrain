/** Room selection with cleaning order (badges 1, 2, 3 …) and map choice. */
export interface Room {
  id: number;
  name: string;
}
export interface RobotMap {
  flag: number;
  name: string;
  rooms: Room[];
}

/** Click on a room chip: append to the order, or remove it and close the gap. */
export function toggleRoom(order: number[], id: number): number[] {
  return order.includes(id) ? order.filter((value) => value !== id) : [...order, id];
}

/** 1-based badge number, or null when not selected. */
export function orderBadge(order: number[], id: number): number | null {
  const index = order.indexOf(id);
  return index < 0 ? null : index + 1;
}

/** Keep only ids that still exist on the active map (after a map reload). */
export function pruneOrder(order: number[], rooms: Room[]): number[] {
  const ids = new Set(rooms.map((room) => room.id));
  return order.filter((id) => ids.has(id));
}

/**
 * Active map: the one named by the `selected_map` select (HA shows unnamed maps as
 * „Map <flag>“), else the only/first map.
 */
export function activeMap(maps: RobotMap[], selected: string | null | undefined): RobotMap | null {
  if (!maps.length) return null;
  const wanted = (selected ?? '').trim();
  return (
    maps.find((map) => map.name && map.name === wanted) ??
    maps.find((map) => `Map ${map.flag}` === wanted) ??
    maps[0]!
  );
}

export function orderedNames(order: number[], rooms: Room[]): string[] {
  const byId = new Map(rooms.map((room) => [room.id, room.name]));
  return order.map((id) => byId.get(id) ?? `#${id}`);
}

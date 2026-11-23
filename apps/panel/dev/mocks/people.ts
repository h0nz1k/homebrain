import { setPeopleSourceFactory, type PersonPresence } from '@homebrain/ha-client';
import { devQuery } from './shared.js';

/**
 * Kdo je doma: synthetic household (dev mock only). `?lide=none|home` (default mixed);
 * `window.__hbPeople.set(id, status)` flips one person live (e2e: push without reload).
 */
export function registerPeopleMocks(): void {
  const lide = devQuery.get('lide');
  const peopleNow: PersonPresence[] =
    lide === 'none'
      ? []
      : (
          [
            ['marek', 'Marek', 'blue', 'home'],
            ['lucie', 'Lucie', 'pink', 'home'],
            ['syn', 'Kuba', 'teal', 'away'],
            ['dcera', 'Ema', 'purple', 'home'],
            ['babi', 'Babi', 'amber', 'away'],
            ['deda', 'Děda', 'slate', 'unknown'],
          ] as const
        ).map(([id, name, color, status]) => ({
          id: `person.${id}`,
          name,
          color,
          status: lide === 'home' ? 'home' : status,
        }));
  const peopleListeners = new Set<(people: PersonPresence[]) => void>();
  let peopleState = peopleNow;
  (window as unknown as { __hbPeople?: unknown }).__hbPeople = {
    set(id: string, status: PersonPresence['status']) {
      peopleState = peopleState.map((p) => (p.id === id ? { ...p, status } : p));
      peopleListeners.forEach((fn) => fn(peopleState));
    },
  };
  setPeopleSourceFactory(() => ({
    subscribe(onPeople) {
      peopleListeners.add(onPeople);
      onPeople(peopleState);
      return () => peopleListeners.delete(onPeople);
    },
  }));
}

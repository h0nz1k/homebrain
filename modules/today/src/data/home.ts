import type { ConnectionLike } from '@homebrain/ha-client';

/** One row of „Co se dnes vaří“ (server `homebrain/today/meals`). */
export interface Meal {
  id: string;
  /** Mealie meal type (breakfast/lunch/snack/dinner/side/dessert/drink) or `other`. */
  type: string;
  /** Czech label of the meal type („Oběd“). */
  label: string;
  title: string;
  slug: string | null;
  /** Recepty recipe id when the Mealie recipe exists in HomeBrain Recepty. */
  recipe_id: string | null;
}

export interface MealsSnapshot {
  date: string;
  /** A loaded Mealie integration exists. */
  configured: boolean;
  /**
   * Show „Co se dnes vaří“ at all: Mealie is loaded and the `meals_display` option is not
   * `off`. False = Dnes renders no meals tile (no empty state, no Mealie hint).
   */
  available: boolean;
  /** HA admin: may see the „naplánujte v Mealie“ hint. */
  can_plan: boolean;
  meals: Meal[];
  errors: string[];
}

/** The part of `homebrain/family/get` the Dnes summary needs (server filters per role). */
export interface FamilyLike {
  kids: Array<{ id: string; name: string; chores: Array<{ state: string }> }>;
}

export interface KidChores {
  id: string;
  name: string;
  /** Done or waiting for a parent's approval. */
  done: number;
  total: number;
  overdue: number;
}

export function summarizeChores(family: FamilyLike | null | undefined): KidChores[] {
  return (family?.kids ?? []).map((kid) => ({
    id: kid.id,
    name: kid.name,
    done: kid.chores.filter((c) => c.state === 'done' || c.state === 'claimed').length,
    total: kid.chores.length,
    overdue: kid.chores.filter((c) => c.state === 'overdue').length,
  }));
}

export interface HomeApi {
  meals(): Promise<MealsSnapshot>;
  /** `null` when Rodina is unavailable (module off, no access). */
  family(): Promise<FamilyLike | null>;
}

export function createWsHomeApi(connection: ConnectionLike): HomeApi {
  return {
    meals: () => connection.sendMessagePromise<MealsSnapshot>({ type: 'homebrain/today/meals' }),
    family: () =>
      connection.sendMessagePromise<FamilyLike>({ type: 'homebrain/family/get' }).catch(() => null),
  };
}

export type HomeRole = 'owner' | 'adult' | 'child' | 'kiosk';
/** `none` = Mealie not installed (no meals tile), kids' chores as in `full`. */
export type HomeScenario = 'full' | 'empty' | 'none';

/**
 * Synthetic kitchen for dev/e2e: `?jidlo=empty|none`, `?role=…` (child sees only its own
 * chores).
 */
export function createMockHomeApi(scenario: HomeScenario, role: HomeRole): HomeApi {
  const meals: Meal[] =
    scenario !== 'full'
      ? []
      : [
          {
            id: 'm1',
            type: 'breakfast',
            label: 'Snídaně',
            title: 'Ovesná kaše s jablky',
            slug: 'ovesna-kase',
            recipe_id: null,
          },
          // Linked to the synthetic Recepty recipe „Svíčková na smetaně“.
          {
            id: 'm2',
            type: 'lunch',
            label: 'Oběd',
            title: 'Svíčková na smetaně',
            slug: 'svickova',
            recipe_id: 'a1'.padEnd(32, '0'),
          },
          {
            id: 'm3',
            type: 'snack',
            label: 'Svačina',
            title: 'Tvarohový koláč',
            slug: 'tvarohovy-kolac',
            recipe_id: null,
          },
          {
            id: 'm4',
            type: 'dinner',
            label: 'Večeře',
            title: 'Rizoto s houbami',
            slug: 'rizoto',
            recipe_id: null,
          },
        ];
  const kids: FamilyLike['kids'] =
    scenario === 'empty'
      ? []
      : [
          {
            id: 'dcera',
            name: 'Dcera',
            chores: [{ state: 'done' }, { state: 'claimed' }, { state: 'todo' }],
          },
          { id: 'syn', name: 'Syn', chores: [{ state: 'overdue' }, { state: 'todo' }] },
        ];
  return {
    meals: async () => ({
      date: new Date().toISOString().slice(0, 10),
      configured: scenario !== 'none',
      available: scenario !== 'none',
      can_plan: role === 'owner',
      meals,
      errors: [],
    }),
    family: async () => ({ kids: role === 'child' ? kids.slice(0, 1) : kids }),
  };
}

export type HomeApiFactory = (connection: ConnectionLike | undefined) => HomeApi | null;
let factory: HomeApiFactory = (connection) => (connection ? createWsHomeApi(connection) : null);

/** Dev/tests replace the WS client with the synthetic kitchen (`createMockHomeApi`). */
export function setTodayHomeApiFactory(next: HomeApiFactory): void {
  factory = next;
}

export function getTodayHomeApi(connection: ConnectionLike | undefined): HomeApi | null {
  return factory(connection);
}

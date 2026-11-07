import type { FamilyApi } from './api.js';
import type { FamilyChore, FamilyEvent, FamilyKid, FamilyRole, FamilySnapshot } from './types.js';

/** Synthetic household for dev/e2e: generic names only („Dcera“, „Syn“). */
export interface FamilyMockOptions {
  role?: FamilyRole;
  /** `empty` = nothing configured (no calendars, no ChoreOps, no shopping list). */
  scenario?: 'full' | 'empty';
  now?: () => Date;
}

const at = (base: Date, dayOffset: number, h: number, m = 0) =>
  new Date(base.getFullYear(), base.getMonth(), base.getDate() + dayOffset, h, m).toISOString();
const dateOnly = (base: Date, dayOffset: number) => {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + dayOffset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function events(now: Date): FamilyEvent[] {
  const fam = { calendar: 'calendar.demo_rodina', source: 'Rodina', kind: 'family' as const };
  const sch = { calendar: 'calendar.demo_skola', source: 'Škola', kind: 'school' as const };
  const e = (
    id: string,
    src: typeof fam | typeof sch,
    summary: string,
    start: string,
    end: string,
    extra = {},
  ) => ({ id, ...src, summary, start, end, all_day: start.length === 10, ...extra }) as FamilyEvent;
  return [
    e('1', fam, 'Odvoz do školy', at(now, 0, 7, 45), at(now, 0, 8, 15)),
    e('2', sch, 'Kroužek robotiky', at(now, 0, 14), at(now, 0, 15, 30)),
    e('3', fam, 'Trénink florbalu', at(now, 0, 16, 30), at(now, 0, 18), {
      location: 'Sportovní hala',
      description: 'Vzít dres',
    }),
    e('4', fam, 'Rodinná večeře', at(now, 0, 19), at(now, 0, 20, 30)),
    e('5', fam, 'Výlet na hrad', dateOnly(now, 1), dateOnly(now, 2)),
    e('6', sch, 'Písemka z matematiky', at(now, 2, 8), at(now, 2, 8, 45)),
    e('7', fam, 'Zubař', at(now, 2, 17), at(now, 2, 17, 30)),
    e('8', fam, 'Trénink florbalu', at(now, 3, 16, 30), at(now, 3, 18)),
    e('9', sch, 'Třídní schůzky', at(now, 5, 17, 30), at(now, 5, 19)),
    e('10', sch, 'Ředitelské volno', dateOnly(now, 6), dateOnly(now, 7)),
    e('11', fam, 'Narozeninová oslava', at(now, 7, 10), at(now, 7, 13)),
  ];
}

function kids(now: Date): FamilyKid[] {
  const c = (
    id: string,
    name: string,
    state: FamilyChore['state'],
    points: number,
    h: number,
  ): FamilyChore => ({
    id: `sensor.demo_${id}`,
    name,
    state,
    points,
    due: at(now, 0, h),
    can_claim: false,
    can_approve: false,
  });
  return [
    {
      id: 'dcera',
      name: 'Dcera',
      points: 128,
      points_today: 6,
      chores: [
        c('kos', 'Vynést koš', 'done', 2, 18),
        c('luxovat', 'Vyluxovat pokoj', 'claimed', 4, 18),
        c('kytky', 'Zalít květiny', 'todo', 1, 18),
      ],
    },
    {
      id: 'syn',
      name: 'Syn',
      points: 74,
      points_today: 3,
      chores: [
        c('postel', 'Ustlat postel', 'done', 1, 9),
        c('kocka', 'Nakrmit kočku', 'done', 2, 12),
        c('boty', 'Uklidit boty', 'overdue', 1, 8),
      ],
    },
  ];
}

export function createMockFamilyApi(opts: FamilyMockOptions = {}): FamilyApi & { log: unknown[] } {
  const role = opts.role ?? 'owner';
  const now = opts.now ?? (() => new Date());
  const empty = opts.scenario === 'empty';
  const state = {
    kids: empty ? [] : kids(now()),
    items: empty
      ? []
      : ['Mléko 2×', 'Rohlíky', 'Jablka', 'Prací gel', 'Máslo', 'Vejce'].map((summary, i) => ({
          uid: `i${i}`,
          summary,
          done: i >= 4,
        })),
    seq: 10,
  };
  const log: unknown[] = [];
  const own = 'syn'; // the mock child account belongs to „Syn“
  const snapshot = (): FamilySnapshot => {
    const detail = role === 'owner' || role === 'adult';
    return {
      role,
      calendars: empty
        ? []
        : [
            { entity_id: 'calendar.demo_rodina', name: 'Rodina', kind: 'family' },
            { entity_id: 'calendar.demo_skola', name: 'Škola', kind: 'school' },
          ],
      events: empty
        ? []
        : events(now()).map((e) => {
            if (detail) return e;
            const rest = { ...e };
            delete rest.location;
            delete rest.description;
            return rest;
          }),
      kids: state.kids
        .filter((k) => role !== 'child' || k.id === own)
        .map((k) => ({
          ...k,
          chores: k.chores.map((c) => ({
            ...c,
            can_claim:
              (role !== 'child' || k.id === own) && (c.state === 'todo' || c.state === 'overdue'),
            can_approve: detail && c.state === 'claimed',
          })),
        })),
      shopping: empty
        ? null
        : {
            entity_id: 'todo.demo_nakup',
            name: 'Nákupní seznam',
            items: state.items.map((i) => ({ ...i })),
          },
      errors: [],
      generated_at: now().toISOString(),
    };
  };
  const chore = (kid: string, id: string) =>
    state.kids.find((k) => k.id === kid)?.chores.find((c) => c.id === id);
  return {
    log,
    get: async () => snapshot(),
    claim: async (kid, id) => {
      log.push({ kind: 'claim', kid, id });
      const c = chore(kid, id);
      if (c) c.state = 'claimed';
    },
    approve: async (kid, id) => {
      log.push({ kind: 'approve', kid, id });
      const c = chore(kid, id);
      if (c) c.state = 'done';
    },
    addItem: async (summary) => {
      log.push({ kind: 'add', summary });
      state.items.unshift({ uid: `i${state.seq++}`, summary, done: false });
    },
    setItemDone: async (uid, done) => {
      log.push({ kind: 'update', uid, done });
      const item = state.items.find((i) => i.uid === uid);
      if (item) item.done = done;
    },
  };
}

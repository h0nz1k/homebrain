import type { FamilyApi } from './api.js';
import type {
  FamilyChore,
  FamilyEvent,
  FamilyKid,
  FamilyRole,
  FamilySnapshot,
  PointsHistory,
  PointsSummary,
} from './types.js';

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

const schoolDay = (base: Date, dayOffset: number) => {
  const dow = new Date(base.getFullYear(), base.getMonth(), base.getDate() + dayOffset).getDay();
  const shifted = dayOffset - (dow === 6 ? 1 : dow === 0 ? 2 : 0);
  return shifted >= 1 ? shifted : dayOffset + (dow === 6 ? 2 : 1);
};
const isWeekend = (base: Date) => base.getDay() === 0 || base.getDay() === 6;

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
    isWeekend(now)
      ? e('1', fam, 'Snídaně u babičky', at(now, 0, 8, 30), at(now, 0, 9, 30))
      : e('1', fam, 'Odvoz do školy', at(now, 0, 7, 45), at(now, 0, 8, 15)),
    e('2', fam, 'Dcera: Kroužek robotiky', at(now, 0, 14), at(now, 0, 15, 30)),
    e('3', fam, 'Syn: Trénink florbalu', at(now, 0, 16, 30), at(now, 0, 18), {
      location: 'Sportovní hala',
      description: 'Vzít dres',
    }),
    e('4', fam, 'Rodinná večeře', at(now, 0, 19), at(now, 0, 20, 30)),
    e('5', fam, 'Výlet na hrad', dateOnly(now, 1), dateOnly(now, 2)),
    e(
      '6',
      sch,
      'Dcera: Písemka z matematiky',
      at(now, schoolDay(now, 2), 8),
      at(now, schoolDay(now, 2), 8, 45),
    ),
    e('7', fam, 'Syn: Zubař', at(now, 2, 17), at(now, 2, 17, 30), {
      description: 'Kartička pojišťovny',
    }),
    e('8', fam, 'Syn: Trénink florbalu', at(now, 3, 16, 30), at(now, 3, 18)),
    e(
      '9',
      sch,
      'Třídní schůzky',
      at(now, schoolDay(now, 5), 17, 30),
      at(now, schoolDay(now, 5), 19),
    ),
    e(
      '10',
      sch,
      'Ředitelské volno',
      dateOnly(now, schoolDay(now, 6)),
      dateOnly(now, schoolDay(now, 6) + 1),
    ),
    e('11', fam, 'Narozeninová oslava', at(now, 7, 10), at(now, 7, 13)),
  ];
}

function pointsSummary(name: string, balance: number): PointsSummary {
  return {
    kid_name: name,
    balance,
    earned_today: name === 'Dcera' ? 6 : 4,
    earned_week: name === 'Dcera' ? 42 : 24,
    earned_month: name === 'Dcera' ? 156 : 68,
    spent_month: name === 'Dcera' ? 40 : 20,
    net_month: name === 'Dcera' ? 116 : 48,
    earned_all_time: name === 'Dcera' ? 248 : 114,
    spent_all_time: name === 'Dcera' ? 120 : 40,
    longest_streak: name === 'Dcera' ? 8 : 5,
    top_chore_month: name === 'Dcera' ? 'Ustlat postel' : 'Nakrmit kočku',
    sources_month: {
      Úkoly: name === 'Dcera' ? 144 : 64,
      Bonusy: name === 'Dcera' ? 12 : 4,
      Odměny: name === 'Dcera' ? 40 : 20,
      Sankce: 0,
      Ostatní: 0,
    },
  };
}

function kids(now: Date): FamilyKid[] {
  const c = (
    id: string,
    name: string,
    state: FamilyChore['state'],
    points: number,
    h: number,
    extra: Partial<FamilyChore> = {},
  ): FamilyChore => ({
    id: `sensor.demo_${id}`,
    name,
    state,
    points,
    due: at(now, 0, h),
    can_claim: false,
    can_approve: false,
    can_request_swap: state === 'todo',
    ...extra,
  });
  return [
    {
      id: 'dcera',
      kid_uuid: 'dcera',
      name: 'Dcera',
      points: 128,
      points_today: 6,
      points_summary: pointsSummary('Dcera', 128),
      chores: [
        c('postel', 'Ustlat postel', 'done', 2, 9),
        c('kytky', 'Zalít květiny', 'done', 4, 17),
        c('kos', 'Vynést koš', 'todo', 3, 19, {
          swap_today: {
            kind: 'transferred_out',
            label: 'Předáno Synovi · jen dnes',
            partner_name: 'Syn',
            muted: true,
          },
          counts_today: false,
          can_request_swap: false,
        }),
        c('luxovat', 'Vyluxovat pokoj', 'todo', 4, 20, {
          swap_today: {
            kind: 'pending_give',
            label: 'Předání čeká na schválení',
            partner_name: 'Syn',
          },
        }),
      ],
    },
    {
      id: 'syn',
      kid_uuid: 'syn',
      name: 'Syn',
      points: 74,
      points_today: 4,
      points_summary: pointsSummary('Syn', 74),
      chores: [
        c('kocka', 'Nakrmit kočku', 'done', 4, 12),
        c('kos-in', 'Vynést koš', 'todo', 3, 19, {
          swap_today: {
            kind: 'transferred_in',
            label: 'Převzato od Dcery · jen dnes',
            partner_name: 'Dcera',
          },
        }),
        c('boty', 'Uklidit boty', 'claimed', 2, 18),
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
    swapPending: 'swap-req-1',
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
  const own = 'syn';
  const snapshot = (): FamilySnapshot => {
    const detail = role === 'owner' || role === 'adult';
    const visibleKids = state.kids
      .filter((k) => role !== 'child' || k.id === own)
      .map((k) => ({
        ...k,
        chores: k.chores.map((c) => ({
          ...c,
          can_claim:
            (role !== 'child' || k.id === own) &&
            (c.state === 'todo' || c.state === 'overdue') &&
            !c.swap_today?.muted,
          can_approve: detail && c.state === 'claimed',
        })),
      }));
    return {
      role,
      revision: 3,
      capabilities: {
        can_create_chore: detail,
        can_swap: role !== 'kiosk' && role !== 'guest',
        can_view_points: role !== 'kiosk' && role !== 'guest',
      },
      calendars: empty
        ? []
        : [
            { entity_id: 'calendar.demo_rodina', name: 'Rodina', kind: 'family' },
            { entity_id: 'calendar.demo_skola', name: 'Škola', kind: 'school' },
          ],
      events: empty
        ? []
        : events(now())
            .sort(
              (a, b) =>
                a.start.slice(0, 10).localeCompare(b.start.slice(0, 10)) ||
                Number(b.all_day) - Number(a.all_day) ||
                a.start.localeCompare(b.start),
            )
            .map((e) => {
              if (detail) return e;
              const rest = { ...e };
              delete rest.location;
              delete rest.description;
              return rest;
            }),
      kids: visibleKids,
      pending_approvals: detail
        ? [
            ...(state.swapPending
              ? [
                  {
                    kind: 'swap' as const,
                    type_label: 'Předání na dnes',
                    request_id: state.swapPending,
                    requester_name: 'Dcera',
                    from_kid_id: 'dcera',
                    to_kid_id: 'syn',
                    chore_id: 'sensor.demo_luxovat',
                    chore_name: 'Vyluxovat pokoj',
                    points: 4,
                    revision: 1,
                  },
                ]
              : []),
            ...(state.kids
              .find((k) => k.id === 'syn')
              ?.chores.find((c) => c.id === 'sensor.demo_boty')?.state === 'claimed'
              ? [
                  {
                    kind: 'completion' as const,
                    type_label: 'Splnění ke kontrole',
                    kid_id: 'syn',
                    kid_name: 'Syn',
                    chore_id: 'sensor.demo_boty',
                    chore_name: 'Uklidit boty',
                    points: 2,
                  },
                ]
              : []),
          ]
        : [],
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

  const chart = (days: number, kid: string): PointsHistory['chart'] => {
    const earned =
      days === 7
        ? kid === 'syn'
          ? [2, 4, 1, 6, 3, 4, 4]
          : [4, 6, 3, 8, 5, 10, 6]
        : Array.from({ length: 30 }, (_, i) => (i % 5) + 2);
    const d = now();
    const keys = Array.from({ length: days }, (_, i) => {
      const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() - (days - 1 - i));
      return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
    });
    return { days: keys, earned, max: Math.max(...earned), coverage_complete: days === 7 };
  };

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
    swapOptions: async () => ({
      occurrences: [],
      partners: state.kids.map((k) => ({ id: k.kid_uuid ?? k.id, name: k.name })),
    }),
    swapRequest: async (input) => {
      log.push({ kind: 'swapRequest', input });
      state.swapPending = input.client_request_id;
      return { request: { id: input.client_request_id, status: 'pending' }, revision: 4 };
    },
    swapDecide: async (request_id, decision) => {
      log.push({ kind: 'swapDecide', request_id, decision });
      const original = chore('dcera', 'sensor.demo_luxovat');
      if (original) {
        if (decision === 'approve') {
          original.swap_today = {
            kind: 'transferred_out',
            label: 'Předáno Synovi · jen dnes',
            partner_name: 'Syn',
            muted: true,
          };
          original.counts_today = false;
          state.kids[1]!.chores.push({
            ...original,
            id: 'sensor.demo_luxovat-in',
            counts_today: true,
            swap_today: {
              kind: 'transferred_in',
              label: 'Převzato od Dcery · jen dnes',
              partner_name: 'Dcera',
            },
          });
        } else original.swap_today = null;
      }
      state.swapPending = '';
      return { ok: true };
    },
    swapReassign: async (input) => {
      log.push({ kind: 'swapReassign', input });
      return { operation: { status: 'active' } };
    },
    swapCancel: async (request_id) => {
      log.push({ kind: 'swapCancel', request_id });
      return { ok: true };
    },
    createChore: async (input) => {
      log.push({ kind: 'createChore', input });
      return { status: 'created', chore_id: 'demo-new' };
    },
    pointsGet: async (kid) => {
      const k = state.kids.find((x) => x.id === kid || x.kid_uuid === kid);
      return k?.points_summary ?? pointsSummary('Dcera', 0);
    },
    pointsHistory: async (kid, days = 7) => ({
      entries: [],
      chart: chart(days, kid),
      truncated: days === 30,
      generated_at: now().toISOString(),
    }),
  };
}

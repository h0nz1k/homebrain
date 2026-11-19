import type { FamilyApi } from './api.js';
import type {
  CreateChoreInput,
  FamilyChore,
  FamilyEvent,
  FamilyKid,
  FamilyMember,
  PersonsSettings,
  FamilyRole,
  FamilySnapshot,
  PointsHistory,
  PointsSummary,
  FamilyUpcomingChore,
} from './types.js';
import { choreTally } from './format.js';

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

/** ChoreOps `primary_group` of a later due date: before next Monday 7:00 = `this_week`. */
function groupOf(due: Date, now: Date): FamilyUpcomingChore['group'] {
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 7);
  monday.setDate(monday.getDate() + ((8 - monday.getDay()) % 7 || 7));
  return due < monday ? 'this_week' : 'other';
}

function upcoming(now: Date, id: string, name: string, points: number, day: number, h: number) {
  const due = at(now, day, h);
  return { id: `sensor.demo_${id}`, name, points, due, group: groupOf(new Date(due), now) };
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
      upcoming: [
        upcoming(now, 'mycka', 'Vyndat myčku', 3, 1, 18),
        upcoming(now, 'prach', 'Utřít prach', 2, 3, 17),
        upcoming(now, 'okna', 'Umýt okna', 5, 10, 16),
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
      upcoming: [upcoming(now, 'trideni', 'Vynést tříděný odpad', 2, 1, 19)],
    },
  ];
}

/** Mirrors backend `plan_create_chores`: „Vícekrát denně“ = one daily chore per time. */
function slotsOf(input: CreateChoreInput): { name: string; date: string; due: string }[] {
  const iso = (date: string, time: string) => new Date(`${date}T${time}:00`).toISOString();
  if (input.recurrence !== 'daily_multi' || !input.times?.length)
    return [
      { name: input.name, date: input.first_date, due: iso(input.first_date, input.due_time) },
    ];
  return input.times.map((t) => {
    const past = new Date(`${input.first_date}T${t}:00`).getTime() <= Date.now();
    const d = new Date(`${input.first_date}T12:00:00`);
    if (past) d.setDate(d.getDate() + 1);
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return { name: `${input.name} (${t})`, date, due: iso(date, t) };
  });
}

export function createMockFamilyApi(opts: FamilyMockOptions = {}): FamilyApi & { log: unknown[] } {
  const role = opts.role ?? 'owner';
  const now = opts.now ?? (() => new Date());
  const empty = opts.scenario === 'empty';
  const today = now();
  const adults: FamilyKid[] = empty
    ? []
    : [
        {
          id: 'tata',
          name: 'Táta',
          points: 18,
          points_today: 5,
          chores: [
            {
              id: 'demo-breakfast',
              name: 'Připravit snídani',
              state: 'done',
              due: at(today, 0, 8),
              points: 5,
              can_claim: false,
              can_approve: false,
            },
            {
              id: 'demo-recycling',
              name: 'Odvézt papír',
              state: 'overdue',
              due: at(today, -1, 16),
              points: 4,
              can_claim: false,
              can_approve: false,
            },
            {
              id: 'demo-shelf',
              name: 'Uklidit polici',
              state: 'overdue',
              due: at(today, -4, 16),
              points: 3,
              can_claim: false,
              can_approve: false,
            },
            {
              id: 'demo-table',
              name: 'Prostřít stůl',
              state: 'todo',
              due: at(today, 0, 19),
              points: 3,
              can_claim: false,
              can_approve: false,
            },
          ],
          upcoming: [upcoming(today, 'kvetiny', 'Přesadit květiny', 4, 2, 10)],
        },
        {
          id: 'mama',
          name: 'Máma',
          points: 16,
          points_today: 4,
          chores: [
            {
              id: 'demo-laundry',
              name: 'Pověsit prádlo',
              state: 'done',
              due: at(today, 0, 10),
              points: 4,
              can_claim: false,
              can_approve: false,
            },
            {
              id: 'demo-plants',
              name: 'Zalít bylinky',
              state: 'todo',
              due: at(today, 0, 16),
              points: 4,
              can_claim: false,
              can_approve: false,
            },
          ],
        },
      ];
  const state = {
    kids: empty ? [] : kids(now()),
    swapPending: empty ? '' : 'swap-req-1',
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
  const all = [...state.kids, ...adults];
  const freeName = 'Vyskládat myčku';
  let free = !empty;
  let profiles: PersonsSettings['persons'] = all.map((k, i) => ({
    choreops_user_id: k.id,
    name: k.name,
    role: i < 2 ? 'child' : 'adult',
    color: [3, 4, 1, 2][i]!,
    person: `person.demo_${k.id}`,
    tracker: `device_tracker.demo_wifi_${k.id}`,
    configured: false,
  }));
  const settings = (): PersonsSettings => ({
    persons: profiles,
    candidates: {
      people: all.map((k) => ({ id: `person.demo_${k.id}`, name: k.name })),
      trackers: all.map((k) => ({
        id: `device_tracker.demo_wifi_${k.id}`,
        name: `Wi-Fi · ${k.name}`,
      })),
    },
  });
  const snapshot = (): FamilySnapshot => {
    const detail = role === 'owner' || role === 'adult';
    const members: FamilyMember[] = all.map((k, i) => {
      const profile = profiles.find((p) => p.choreops_user_id === k.id)!;
      const chores: FamilyChore[] = [];
      const missed: FamilyMember['missed'] = [];
      for (const c of k.chores) {
        const day = c.due ? new Date(c.due) : null;
        const age = day
          ? Math.round(
              (new Date(dateOnly(now(), 0)).getTime() - new Date(dateOnly(day, 0)).getTime()) /
                86_400_000,
            )
          : 0;
        if (c.state === 'overdue' && age > 3) {
          missed.push({ id: c.id, name: c.name, date: c.due });
          continue;
        }
        chores.push({
          ...c,
          carried_days: c.state === 'overdue' && age > 0 ? age : undefined,
          can_claim:
            (role !== 'child' || k.id === own) &&
            (c.state === 'todo' || c.state === 'overdue') &&
            !c.swap_today?.muted,
          can_approve: detail && c.state === 'claimed',
        });
      }
      const { total, done, pending, open } = choreTally(
        chores.filter((c) => c.counts_today !== false),
      );
      return {
        ...k,
        points_summary: detail ? k.points_summary : undefined,
        role: profile.role,
        color: profile.color,
        own: k.id === own,
        presence: profile.tracker ? { kind: i % 2 ? 'home' : 'away' } : null,
        chores,
        missed,
        counts: { total, done, pending, open },
        points_week: k.points_summary?.earned_week ?? k.points,
        upcoming: k.upcoming?.map((u) => ({ ...u })),
      };
    });
    const visibleKids = members.filter((k) => k.role === 'child' && (role !== 'child' || k.own));
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
      members,
      free_chores: free
        ? [
            {
              name: freeName,
              points: 3,
              due: at(today, 0, 19),
              assignees: state.kids.map((k) => ({
                member: k.id,
                chore: `free-${k.id}`,
                can_claim: role !== 'child' || k.id === own,
              })),
            },
          ]
        : [],
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
            ...members.flatMap((member) =>
              member.chores
                .filter(
                  (chore) => chore.state === 'claimed' && chore.swap_today?.kind !== 'pending_give',
                )
                .map((chore) => ({
                  kind: 'completion' as const,
                  type_label: 'Splnění ke kontrole',
                  kid_id: member.id,
                  kid_name: member.name,
                  chore_id: chore.id,
                  chore_name: chore.name,
                  points: chore.points,
                })),
            ),
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
    all.find((k) => k.id === kid)?.chores.find((c) => c.id === id);

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
    personHistory: async (member) => ({
      entries: [
        ...(all.find((k) => k.id === member)?.chores ?? [])
          .filter((c) => c.state === 'done')
          .map((c) => ({ date: c.due ?? now().toISOString(), name: c.name, points: c.points })),
        ...(member === 'tata'
          ? [
              { date: at(today, -2, 17), name: 'Vyčistit filtr', points: 6 },
              { date: at(today, -3, 8), name: 'Připravit snídani', points: 5 },
            ]
          : []),
      ],
    }),
    personsSettings: async () => settings(),
    savePersons: async (input) => {
      profiles = profiles.map((p) => ({
        ...p,
        ...input.find((row) => row.choreops_user_id === p.choreops_user_id),
        configured: true,
      }));
      return settings();
    },
    claim: async (kid, id) => {
      log.push({ kind: 'claim', kid, id });
      if (id === `free-${kid}`) {
        const taker = state.kids.find((k) => k.id === kid);
        if (!free || !taker || (role === 'child' && kid !== own))
          throw new Error('Úkol už nelze převzít.');
        free = false;
        taker.chores.push({
          id,
          name: freeName,
          points: 3,
          due: at(today, 0, 19),
          state: 'claimed',
          can_claim: false,
          can_approve: false,
        });
        return;
      }
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
      const taken = new Set(
        all.flatMap((k) => [...k.chores, ...(k.upcoming ?? [])].map((c) => c.name)),
      );
      const slots = slotsOf(input);
      // ChoreOps: names are unique across the whole install (case-sensitive).
      if (slots.some((s) => taken.has(s.name)))
        throw Object.assign(new Error('Úkol s tímto názvem už existuje.'), {
          code: 'duplicate_name',
        });
      const today = dateOnly(now(), 0);
      for (const kid of all.filter((k) => input.assignees.includes(k.kid_uuid ?? k.id)))
        for (const slot of slots) {
          const id = `sensor.demo_new_${state.seq++}`;
          if (slot.date === today)
            kid.chores.push({
              id,
              name: slot.name,
              state: 'todo',
              points: input.points,
              due: slot.due,
              can_claim: false,
              can_approve: false,
              can_request_swap: true,
            });
          else
            (kid.upcoming ??= []).push({
              id,
              name: slot.name,
              points: input.points,
              due: slot.due,
              group: groupOf(new Date(slot.due), now()),
            });
          kid.upcoming?.sort((a, b) => (a.due ?? '').localeCompare(b.due ?? ''));
        }
      return { status: 'created', chore_id: 'demo-new', names: slots.map((s) => s.name) };
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

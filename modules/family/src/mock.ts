import type { FamilyApi } from './api.js';
import { handedToLabel, takenFromLabel } from './czech.js';
import type {
  ChoreManagement,
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
  PersonHistoryEntry,
} from './types.js';
import { choreTally, localKey } from './format.js';
import { personActivity } from './personActivity.js';

/** Synthetic household for dev/e2e: generic names only („Ema“, „Kuba“). */
export interface FamilyMockOptions {
  role?: FamilyRole;
  /** `empty` = nothing configured (no calendars, no ChoreOps, no shopping list). */
  scenario?: 'full' | 'empty';
  /** Synthetic overdue occurrence for the reassign success and failure flows. */
  reassignDemo?: 'overdue' | 'error';
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
    e('2', fam, 'Ema: Kroužek robotiky', at(now, 0, 14), at(now, 0, 16, 10)),
    e('3', fam, 'Kuba: Trénink florbalu', at(now, 0, 16, 30), at(now, 0, 18), {
      location: 'Sportovní hala',
      description: 'Vzít dres',
    }),
    e('4', fam, 'Rodinná večeře', at(now, 0, 19), at(now, 0, 20, 30)),
    e('5', fam, 'Výlet na hrad', dateOnly(now, 1), dateOnly(now, 2)),
    e(
      '6',
      sch,
      'Ema: Písemka z matematiky',
      at(now, schoolDay(now, 2), 8),
      at(now, schoolDay(now, 2), 8, 45),
    ),
    e('7', fam, 'Kuba: Zubař', at(now, 2, 17), at(now, 2, 17, 30), {
      description: 'Kartička pojišťovny',
    }),
    e('8', fam, 'Kuba: Trénink florbalu', at(now, 3, 16, 30), at(now, 3, 18)),
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
    earned_today: name === 'Ema' ? 6 : 4,
    earned_week: name === 'Ema' ? 42 : 24,
    earned_month: name === 'Ema' ? 156 : 68,
    spent_month: name === 'Ema' ? 40 : 20,
    net_month: name === 'Ema' ? 116 : 48,
    earned_all_time: name === 'Ema' ? 248 : 114,
    spent_all_time: name === 'Ema' ? 120 : 40,
    longest_streak: name === 'Ema' ? 8 : 5,
    top_chore_month: name === 'Ema' ? 'Ustlat postel' : 'Nakrmit kočku',
    sources_month: {
      Úkoly: name === 'Ema' ? 144 : 64,
      Bonusy: name === 'Ema' ? 12 : 4,
      Odměny: name === 'Ema' ? 40 : 20,
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
      name: 'Ema',
      points: 128,
      points_today: 6,
      points_summary: pointsSummary('Ema', 128),
      chores: [
        c('postel', 'Ustlat postel', 'done', 2, 9),
        c('kytky', 'Zalít květiny', 'done', 4, 17),
        c('kos', 'Vynést koš', 'todo', 3, 19, {
          swap_today: {
            kind: 'transferred_out',
            label: 'Předáno Kubovi · jen dnes',
            partner_name: 'Kuba',
            muted: true,
          },
          counts_today: false,
          can_request_swap: false,
        }),
        c('luxovat', 'Vyluxovat pokoj', 'todo', 4, 20, {
          swap_today: {
            kind: 'pending_give',
            label: 'Předání čeká na schválení',
            partner_name: 'Kuba',
          },
        }),
      ],
      upcoming: [
        upcoming(now, 'mycka', 'Vyskládat myčku', 3, 1, 18),
        upcoming(now, 'prach', 'Utřít prach', 2, 3, 17),
        upcoming(now, 'okna', 'Umýt okna', 5, 10, 16),
      ],
    },
    {
      id: 'syn',
      kid_uuid: 'syn',
      name: 'Kuba',
      points: 74,
      points_today: 4,
      points_summary: pointsSummary('Kuba', 74),
      chores: [
        c('kocka', 'Nakrmit kočku', 'done', 4, 12),
        c('kos-in', 'Vynést koš', 'todo', 3, 19, {
          swap_today: {
            kind: 'transferred_in',
            label: 'Převzato od Emy · jen dnes',
            partner_name: 'Ema',
          },
        }),
        c('boty', 'Uklidit boty', 'claimed', 2, 18),
      ],
      upcoming: [upcoming(now, 'trideni', 'Vynést tříděný odpad', 2, 1, 19)],
    },
  ];
}

/** Mirrors backend `plan_create_chores`: „Vícekrát denně“ = one daily chore per time. */
function slotsOf(
  input: CreateChoreInput,
  now: Date,
): { name: string; date: string; due: string }[] {
  const iso = (date: string, time: string) => new Date(`${date}T${time}:00`).toISOString();
  if (input.recurrence !== 'daily_multi' || !input.times?.length)
    return [
      { name: input.name, date: input.first_date, due: iso(input.first_date, input.due_time) },
    ];
  return input.times.map((t) => {
    const past = new Date(`${input.first_date}T${t}:00`).getTime() <= now.getTime();
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
              id: 'demo-letter',
              name: 'Vybrat schránku',
              state: 'todo',
              due: at(today, 0, 16, 45),
              points: 2,
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
  if (opts.reassignDemo && !empty) {
    const [ema] = state.kids as [FamilyKid];
    ema.chores.push({
      id: 'sensor.demo_overdue',
      name: 'Utřít stůl',
      state: 'overdue',
      points: 3,
      due: at(now(), -1, 18),
      can_claim: true,
      can_approve: false,
      can_request_swap: true,
    });
  }
  const skipped = new Map<string, { kid: FamilyKid; row: FamilyChore }>();
  const manage = (
    kid: FamilyKid,
    row: FamilyChore | FamilyUpcomingChore,
    today: boolean,
  ): ChoreManagement => ({
    id: row.id,
    one_off: false,
    times_per_day: 1,
    assignees: [kid.name],
    series_name: row.name,
    slots: [{ id: row.id, name: row.name, time: null, assignees: [kid.name] }],
    time: null,
    ...row.management,
    can_skip: today && row.due != null && !row.management?.one_off,
  });
  const all = [...state.kids, ...adults];
  const freeName = 'Vyskládat myčku';
  const credits = new Map<string, PersonHistoryEntry[]>(
    all.map((member) => [
      member.id,
      member.chores
        .filter((chore) => chore.state === 'done')
        .map((chore) => ({
          date: chore.due ?? today.toISOString(),
          name: chore.name,
          points: chore.points,
        })),
    ]),
  );
  credits
    .get('tata')
    ?.push(
      { date: at(today, -2, 17), name: 'Vyčistit filtr', points: 8 },
      { date: at(today, -3, 8), name: 'Připravit snídani', points: 5 },
    );
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
          management: detail ? manage(k, c, true) : undefined,
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
      const entries = credits.get(k.id) ?? [];
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
        points_week: personActivity({ missed }, entries, now()).points,
        points_today: entries
          .filter((row) => localKey(new Date(row.date)) === localKey(now()))
          .reduce((points, row) => points + (row.points ?? 0), 0),
        upcoming: k.upcoming?.map((u) => ({
          ...u,
          management: detail ? manage(k, u, false) : undefined,
        })),
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
                    requester_name: 'Ema',
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
      entries: [...(credits.get(member) ?? [])],
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
      if (c && c.state !== 'done') {
        c.state = 'done';
        credits.get(kid)?.push({ name: c.name, date: now().toISOString(), points: c.points });
      }
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
            label: 'Předáno Kubovi · jen dnes',
            partner_name: 'Kuba',
            muted: true,
          };
          original.counts_today = false;
          state.kids[1]!.chores.push({
            ...original,
            id: 'sensor.demo_luxovat-in',
            counts_today: true,
            swap_today: {
              kind: 'transferred_in',
              label: 'Převzato od Emy · jen dnes',
              partner_name: 'Ema',
            },
          });
        } else original.swap_today = null;
      }
      state.swapPending = '';
      return { ok: true };
    },
    swapReassign: async (input) => {
      log.push({ kind: 'swapReassign', input });
      if (opts.reassignDemo === 'error') throw { code: 'service_failed' };
      const from = state.kids.find((kid) => (kid.kid_uuid ?? kid.id) === input.from_kid);
      const to = state.kids.find((kid) => (kid.kid_uuid ?? kid.id) === input.to_kid);
      const original = from?.chores.find((row) => row.id === input.chore);
      if (!from || !to || !original) throw { code: 'not_found' };
      original.swap_today = {
        kind: 'transferred_out',
        label: handedToLabel(to.name),
        partner_name: to.name,
        muted: true,
      };
      original.counts_today = false;
      original.can_request_swap = false;
      const current = now();
      const due =
        original.due && Date.parse(original.due) > current.getTime() + 15 * 60_000
          ? original.due
          : at(current, 0, 23, 59);
      to.chores.push({
        ...original,
        id: `${original.id}-reassigned`,
        state: 'todo',
        due,
        counts_today: true,
        swap_today: {
          kind: 'transferred_in',
          label: takenFromLabel(from.name),
          partner_name: from.name,
        },
      });
      return { operation: { status: 'active' } };
    },
    swapCancel: async (request_id) => {
      log.push({ kind: 'swapCancel', request_id });
      return { ok: true };
    },
    skipChoreToday: async (input) => {
      log.push({ kind: 'skipChoreToday', input });
      if (role !== 'owner' && role !== 'adult') throw { code: 'unauthorized' };
      if ('undo_request_id' in input) {
        const entry = skipped.get(input.undo_request_id);
        if (!entry) throw { code: 'restore_failed' };
        entry.kid.upcoming = entry.kid.upcoming?.filter((row) => row.id !== entry.row.id);
        entry.kid.chores.push(entry.row);
        skipped.delete(input.undo_request_id);
        return { ok: true };
      }
      const kid = all.find((k) => k.id === input.kid);
      const row = kid?.chores.find((c) => c.id === input.chore);
      if (!kid || !row) throw { code: 'not_found' };
      if (row.due !== input.expected_due) throw { code: 'conflict' };
      if (row.management?.one_off) throw { code: 'unsupported_chore' };
      const canUndo = row.state === 'todo' && new Date(input.expected_due) > now();
      if (canUndo) skipped.set(input.client_request_id, { kid, row });
      kid.chores = kid.chores.filter((c) => c.id !== row.id);
      const next = new Date(input.expected_due);
      next.setDate(next.getDate() + 1);
      (kid.upcoming ??= []).push({ ...row, due: next.toISOString(), group: groupOf(next, now()) });
      return { ok: true, can_undo: canUndo };
    },
    deleteChore: async (input) => {
      log.push({ kind: 'deleteChore', input });
      if (role !== 'owner' && role !== 'adult') throw { code: 'unauthorized' };
      const owner = all.find((kid) => kid.id === input.kid);
      const original = [...(owner?.chores ?? []), ...(owner?.upcoming ?? [])].find(
        (row) => row.id === input.chore,
      );
      if (!original) throw { code: 'not_found' };
      const ids = new Set(input.series_ids ?? [input.slot_id ?? input.chore]);
      if (input.slot_id && !original.management?.slots.some((slot) => slot.id === input.slot_id))
        throw { code: 'conflict' };
      for (const kid of all) {
        kid.chores = kid.chores.filter((row) => !ids.has(row.id));
        kid.upcoming = kid.upcoming?.filter((row) => !ids.has(row.id));
        for (const row of [...kid.chores, ...(kid.upcoming ?? [])]) {
          if (row.management) {
            const slots = row.management.slots.filter((slot) => !ids.has(slot.id));
            row.management = {
              ...row.management,
              slots,
              times_per_day: row.management.times_per_day == null ? null : slots.length,
            };
          }
        }
      }
      return { deleted: ids.size };
    },
    createChore: async (input) => {
      log.push({ kind: 'createChore', input });
      const taken = new Set(
        all.flatMap((k) => [...k.chores, ...(k.upcoming ?? [])].map((c) => c.name)),
      );
      const slots = slotsOf(input, now());
      // ChoreOps: names are unique across the whole install (case-sensitive).
      if (slots.some((s) => taken.has(s.name)))
        throw Object.assign(new Error('Úkol s tímto názvem už existuje.'), {
          code: 'duplicate_name',
        });
      const today = dateOnly(now(), 0);
      const assigned = all.filter((k) => input.assignees.includes(k.kid_uuid ?? k.id));
      const assignees = assigned.map((kid) => kid.name);
      const created = slots.map((slot, i) => ({
        ...slot,
        id: `sensor.demo_new_${state.seq++}`,
        time: input.times?.[i] ?? null,
        assignees,
      }));
      for (const kid of assigned) {
        for (const slot of created) {
          const management: ChoreManagement = {
            id: slot.id,
            one_off: input.recurrence === 'once',
            times_per_day: input.recurrence.startsWith('daily') ? created.length : null,
            can_skip: false,
            assignees,
            series_name: input.name,
            time: slot.time,
            slots: created,
          };
          const row = {
            id: slot.id,
            name: slot.name,
            points: input.points,
            due: slot.due,
            management,
          };
          if (slot.date === today)
            kid.chores.push({
              ...row,
              state: 'todo',
              can_claim: false,
              can_approve: false,
              can_request_swap: !management.one_off,
            });
          else
            (kid.upcoming ??= []).push({
              ...row,
              group: groupOf(new Date(slot.due), now()),
            });
        }
        kid.upcoming?.sort((a, b) => (a.due ?? '').localeCompare(b.due ?? ''));
      }
      return { status: 'created', chore_id: 'demo-new', names: slots.map((s) => s.name) };
    },
    pointsGet: async (kid) => {
      const k = state.kids.find((x) => x.id === kid || x.kid_uuid === kid);
      return k?.points_summary ?? pointsSummary('Ema', 0);
    },
    pointsHistory: async (kid, days = 7) => ({
      entries: [],
      chart: chart(days, kid),
      truncated: days === 30,
      generated_at: now().toISOString(),
    }),
  };
}

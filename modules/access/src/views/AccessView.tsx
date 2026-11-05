import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  navigateTab,
  useBackClosable,
  useEntity,
  type EntityStore,
  type ModuleViewProps,
} from '@homebrain/ha-client';
import {
  Button,
  Card,
  Chip,
  EmptyState,
  LiveStatus,
  Pill,
  SegmentedControl,
  Sheet,
  SignalCard,
  Stat,
  StatusRow,
  Stepper,
  Switch,
  Tile,
  czCount,
  toast,
  type StepState,
  type Tone,
} from '@homebrain/ui';
import { AccessApiError, getAccessApi, type AccessApi } from '../api.js';
import {
  enrolledShortCs,
  enrolReducer,
  findDuplicates,
  freeHands,
  groupPeople,
  handSlots,
  type EnrolStatus,
  REENROLL_CS,
  HAND_CS,
  mmss,
  reasonCs,
  serviceRemaining,
  topIssue,
  whenCs,
  wifiQuality,
} from '../domain.js';
import {
  buildAccessLog,
  filterLog,
  groupByDay,
  lockSource,
  type LockAction,
  type LogbookEntry,
  type LogEntityIds,
  type LogFilter,
  type LogItem,
} from '../log.js';
import type {
  AccessEvent,
  AccessState,
  Hand,
  HistoryItem,
  Labels,
  Person,
  SensorUser,
} from '../types.js';
import { accessLayout } from './styles.js';

import { ENTITY_DEFAULTS } from '../entities.js';
export { ENTITY_DEFAULTS };
type EntityKey = keyof typeof ENTITY_DEFAULTS;
const OPEN_LATCH = 'Otevřít západku';

/** Sent only when the firmware declares it (HomeBrain drops it for older BioLock builds). */
const ENROLL_TIMEOUT_S = 30;
const TABS = [
  ['osoby', 'Osoby'],
  ['test', 'Test ruky'],
  ['zarizeni', 'Zařízení'],
  ['historie', 'Historie'],
] as const;
type TabId = (typeof TABS)[number][0];
export function parseTab(path = ''): TabId {
  const slug = path.replace(/^\/+/, '').split('/')[0] ?? '';
  return TABS.find((t) => t[0] === slug)?.[0] ?? 'osoby';
}

const P: Record<string, ReactNode> = {
  face: (
    <>
      <path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" />
      <path d="M9 9.5v1.2M15 9.5v1.2M12 9.5v3.5h-1" />
      <path d="M9.3 15.2a3.8 3.8 0 0 0 5.4 0" />
    </>
  ),
  palm: (
    <path d="M8 12V5.6a1.3 1.3 0 0 1 2.6 0V11M10.6 11V4.2a1.3 1.3 0 0 1 2.6 0V11M13.2 11V5.2a1.3 1.3 0 0 1 2.6 0V12M15.8 12V7.8a1.3 1.3 0 0 1 2.6 0V14a7 7 0 0 1-7 7h-.7a6 6 0 0 1-4.6-2.2l-2.6-3.3a1.4 1.4 0 0 1 2.1-1.8L8 15.6V12" />
  ),
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  /* Slot status glyphs (circle + mark) – no text glyphs in the rows. */
  ok: (
    <>
      <circle cx="12" cy="12" r="10" fill="currentColor" stroke="none" />
      <path d="m7.9 12.4 2.8 2.8 5.4-5.8" stroke="var(--hb-s1)" strokeWidth={2.2} />
    </>
  ),
  none: (
    <>
      <circle cx="12" cy="12" r="9" strokeDasharray="2.4 3" />
      <path d="M9 12h6" />
    </>
  ),
  unk: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.8 9.6a2.3 2.3 0 0 1 4.4.9c0 1.5-2.2 1.9-2.2 3.3" />
      <path d="M12 16.6v.1" />
    </>
  ),
  warnc: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.6v5.2M12 16.2v.1" />
    </>
  ),
  x: <path d="M6 6l12 12M18 6 6 18" />,
  plus: <path d="M12 5v14M5 12h14" />,
  q: (
    <>
      <path d="M9.2 9a3 3 0 0 1 5.8 1c0 2-3 2.6-3 4.5" />
      <path d="M12 18.2v.1" />
    </>
  ),
  more: (
    <>
      <circle cx="5.5" cy="12" r="1.2" fill="currentColor" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" />
      <circle cx="18.5" cy="12" r="1.2" fill="currentColor" />
    </>
  ),
  trash: <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />,
  wifi: (
    <>
      <path d="M2.5 9a14 14 0 0 1 19 0M5.5 12.5a9.5 9.5 0 0 1 13 0M8.6 15.8a5 5 0 0 1 6.8 0" />
      <path d="M12 19.2v.1" />
    </>
  ),
  chip: (
    <>
      <rect x="6" y="6" width="12" height="12" rx="2.5" />
      <path d="M9 2.5V6M15 2.5V6M9 18v3.5M15 18v3.5M2.5 9H6M2.5 15H6M18 9h3.5M18 15h3.5" />
    </>
  ),
  unlock: (
    <>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 7.5-1.9" />
    </>
  ),
  lock: (
    <>
      <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
    </>
  ),
  bat: (
    <>
      <rect x="2.5" y="7" width="17" height="10" rx="2.5" />
      <path d="M22 10.5v3M6 10v4M9.5 10v4" />
    </>
  ),
  shield: (
    <>
      <path d="M12 21s-7.5-3.2-7.5-9.5V5.8L12 3l7.5 2.8v5.7C19.5 17.8 12 21 12 21Z" />
      <path d="m8.8 12 2.2 2.2 4.2-4.4" />
    </>
  ),
  wrench: (
    <>
      <path d="M12.5 4.5a4 4 0 0 0 5 5L19 11l-8 8-5-5 8-8Z" />
      <path d="M4 20l5.5-5.5" />
    </>
  ),
  alert: (
    <>
      <path d="M12 3.5 21.5 20h-19Z" />
      <path d="M12 10v4.5M12 17.4v.1" />
    </>
  ),
  door: (
    <>
      <path d="M6 21V4.5A1.5 1.5 0 0 1 7.5 3h9A1.5 1.5 0 0 1 18 4.5V21M3.5 21h17" />
      <path d="M14.5 12.5v.1" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 11a8 8 0 0 0-14.3-4.6L4 8.5M4 13a8 8 0 0 0 14.3 4.6l1.7-2.1" />
      <path d="M4 4v4.5h4.5M20 20v-4.5h-4.5" />
    </>
  ),
};

function Icon({ name, mirror }: { name: keyof typeof P; mirror?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={mirror ? { transform: 'scaleX(-1)' } : undefined}
    >
      {P[name]}
    </svg>
  );
}

function useNow(ms: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

function useEntities(
  store: EntityStore,
  bindings: Record<string, string>,
  resolved: Record<string, string> | undefined,
) {
  // explicit binding > device resolved by the integration > neutral default
  const id = (key: EntityKey) => bindings[key] ?? resolved?.[key] ?? ENTITY_DEFAULTS[key];
  return {
    ids: Object.fromEntries(
      (Object.keys(ENTITY_DEFAULTS) as EntityKey[]).map((k) => [k, id(k)]),
    ) as Record<EntityKey, string>,
    biometric: useEntity(store, id('biometric')),
    service: useEntity(store, id('service')),
    action: useEntity(store, id('action')),
    sensorState: useEntity(store, id('sensorState')),
    sensorOnline: useEntity(store, id('sensorOnline')),
    wifi: useEntity(store, id('wifi')),
    connected: useEntity(store, id('connected')),
    nukiConnected: useEntity(store, id('nukiConnected')),
    nukiPaired: useEntity(store, id('nukiPaired')),
    nukiBattery: useEntity(store, id('nukiBattery')),
    lock: useEntity(store, id('lock')),
    lockout: useEntity(store, id('lockout')),
    lockBattery: useEntity(store, id('lockBattery')),
    lockBatteryCritical: useEntity(store, id('lockBatteryCritical')),
    lockAction: useEntity(store, id('lockAction')),
    lastError: useEntity(store, id('lastError')),
  };
}
type Entities = ReturnType<typeof useEntities>;
type Listener = (event: AccessEvent) => void;
interface ConfirmSpec {
  title: string;
  body: ReactNode;
  confirm: string;
  danger?: boolean;
  run: () => Promise<void> | void;
}
interface WizardSpec {
  name?: string;
  startAt?: StepKey;
  /** Re-enrol: only this one step; the old ID is deleted after the new enrolment succeeded. */
  replaceId?: number;
}
interface LiveItem {
  key: string;
  time: string;
  data: HistoryItem;
}

const errorText = (err: unknown) => {
  const code = err instanceof AccessApiError ? err.code : '';
  if (code === 'device_unavailable') return 'BioLock je nedostupný (vypnutý nebo offline).';
  return reasonCs(code || 'unknown').text;
};

export default function AccessView({ store, bindings, route, connection }: ModuleViewProps) {
  const api = useMemo(() => getAccessApi(connection), [connection]);
  const [state, setState] = useState<AccessState | null>(null);
  const ent = useEntities(store, bindings ?? {}, state?.entities);
  const now = useNow(1000);
  const [enrolEvents, setEnrol] = useState<EnrolStatus>(null);
  // Sensor state 'enrolling' (an HA script started it) shows as pending before any event arrives.
  const enrol = enrolReducer(enrolEvents, {
    sensorState: ent.sensorState?.state,
    time: new Date(now).toISOString(),
  });
  const [live, setLive] = useState<LiveItem[]>([]);
  const [tabState, setTab] = useState<TabId>(() => parseTab(route?.path));
  // Inside a panel the url owns the tab (`/homebrain-pristup/<tab>`), so back/forward and
  // reload show the tab the address names; local state only serves embeds without a route.
  const tab = route ? parseTab(route.path) : tabState;
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null);
  const [wizard, setWizard] = useState<WizardSpec | null>(null);
  const listeners = useRef(new Set<Listener>());
  const serviceOn = ent.service?.state === 'on';

  useEffect(() => {
    if (!api) return;
    let alive = true;
    let unsub: (() => void) | null = null;
    const onEvent = (event: AccessEvent) => {
      for (const l of listeners.current) l(event);
      if (event.event === 'enrolled' || event.event === 'enroll_retry')
        setEnrol((prev) => enrolReducer(prev, { event }));
      setState((prev) => {
        if (!prev) return prev;
        if (event.event === 'users')
          return {
            ...prev,
            users: event.users,
            listed_at: event.listed_at,
            incomplete: event.incomplete,
          };
        if (event.event === 'meta') {
          const { event: _kind, ...meta } = event;
          void _kind;
          return { ...prev, ...meta };
        }
        if (
          event.event === 'recognized' ||
          event.event === 'rejected' ||
          event.event === 'enrolled' ||
          event.event === 'deleted' ||
          event.event === 'lockout'
        )
          return {
            ...prev,
            users:
              event.event === 'deleted' && event.data.ok && prev.users
                ? prev.users.filter((u) => u.id !== event.data.user_id)
                : prev.users,
            history: [
              { kind: event.event, time: event.time, ...event.data },
              ...prev.history,
            ].slice(0, 50),
          };
        return prev;
      });
      if (event.event === 'recognized' || event.event === 'rejected') {
        const item = { kind: event.event, time: event.time, ...event.data };
        setLive((prev) =>
          [{ key: `${event.time}-${prev.length}`, time: event.time, data: item }, ...prev].slice(
            0,
            20,
          ),
        );
      }
    };
    void api.subscribe(onEvent).then((u) => {
      if (alive) unsub = u;
      else u();
    });
    api
      .state()
      .then((s) => {
        if (!alive) return;
        setState(s);
        if (s.users === null) void api.command('list_users').catch(() => undefined);
      })
      .catch(
        () =>
          alive &&
          setState({
            users: null,
            listed_at: null,
            incomplete: false,
            labels: {},
            people: {},
            settings: { notify_reenroll: true },
            health: {},
            advice: {},
            history: [],
          }),
      );
    return () => {
      alive = false;
      unsub?.();
    };
  }, [api]);

  const people = useMemo(
    () => (state?.users ? groupPeople(state.users, state.labels, state.people) : []),
    [state],
  );
  const onBus = useCallback((l: Listener) => {
    listeners.current.add(l);
    return () => void listeners.current.delete(l);
  }, []);

  if (!api)
    return (
      <div className="ac">
        <EmptyState title="Přístup není k dispozici">
          Potřebuje připojení k Home Assistantu.
        </EmptyState>
      </div>
    );

  const selectTab = (next: TabId) => {
    setTab(next);
    try {
      navigateTab(next === 'osoby' ? '/access' : `/access/${next}`, next === 'osoby');
    } catch {
      /* outside HA */
    }
  };
  const run = async (fn: () => Promise<void>, ok?: string) => {
    try {
      await fn();
      if (ok) toast.success(ok);
    } catch (err) {
      toast.error(errorText(err));
    }
  };
  const ensureService = async () => {
    if (!serviceOn) await api.command('service_mode', { on: true });
  };
  const refresh = () => void run(() => api.command('list_users'));
  const remaining = serviceOn
    ? serviceRemaining(
        (ent.service as { last_changed?: string; last_updated?: string } | undefined)
          ?.last_changed ?? (ent.service as { last_updated?: string } | undefined)?.last_updated,
        now,
      )
    : null;
  const ctx: Ctx = {
    api,
    ent,
    people,
    state,
    serviceOn,
    remaining,
    now,
    run,
    ensureService,
    setConfirm,
    setWizard,
    selectTab,
    refresh,
    enrol: wizard ? null : enrol,
    dismissEnrol: () => setEnrol(null),
  };

  return (
    <div className="ac" data-testid="access">
      <style>{accessLayout}</style>
      <header className="ac-head">
        <div>
          <h1 className="ac-sr">Přístup</h1>
          <p>
            BioLock · {czCount(people.length, 'osoba', 'osoby', 'osob')} ·{' '}
            {czCount(state?.users?.length ?? 0, 'záznam', 'záznamy', 'záznamů')} ve snímači
          </p>
        </div>
        <StatusPills ent={ent} serviceOn={serviceOn} remaining={remaining} />
      </header>
      <div className="ac-bar">
        <SegmentedControl
          label="Sekce Přístupu"
          hideLabel
          value={tab}
          options={TABS}
          onChange={selectTab}
          className="ac-tabs"
        />
        <Button
          variant="primary"
          icon={<Icon name="plus" />}
          data-testid="access-add"
          onClick={() => setWizard({})}
        >
          Přidat osobu
        </Button>
      </div>
      {tab === 'osoby' && <PeopleTab ctx={ctx} />}
      {tab === 'test' && <TestTab ctx={ctx} live={live} />}
      {tab === 'zarizeni' && <DeviceTab ctx={ctx} />}
      {tab === 'historie' && <AccessLog ctx={ctx} />}
      {wizard && (
        <Wizard
          api={api}
          spec={wizard}
          people={people}
          serviceOn={serviceOn}
          remaining={remaining}
          sensorState={ent.sensorState?.state}
          onBus={onBus}
          onClose={() => {
            setWizard(null);
            void api.command('list_users').catch(() => undefined);
          }}
        />
      )}
      {confirm && <Confirm spec={confirm} onClose={() => setConfirm(null)} />}
    </div>
  );
}

interface Ctx {
  api: AccessApi;
  ent: Entities;
  people: Person[];
  state: AccessState | null;
  serviceOn: boolean;
  remaining: number | null;
  now: number;
  run: (fn: () => Promise<void>, ok?: string) => Promise<void>;
  ensureService: () => Promise<void>;
  setConfirm: (c: ConfirmSpec | null) => void;
  setWizard: (w: WizardSpec | null) => void;
  selectTab: (t: TabId) => void;
  refresh: () => void;
  enrol: EnrolStatus;
  dismissEnrol: () => void;
}

function StatusPills({
  ent,
  serviceOn,
  remaining,
}: {
  ent: Entities;
  serviceOn: boolean;
  remaining: number | null;
}) {
  const online = ent.sensorOnline?.state === 'on';
  const bio = ent.biometric?.state === 'on';
  return (
    <div className="ac-pills">
      <Pill dot tone={online ? 'ok' : 'crit'}>
        {online ? 'Snímač online' : ent.sensorOnline ? 'Snímač offline' : 'BioLock nedostupný'}
      </Pill>
      {!serviceOn && (
        <Pill dot tone={bio ? 'ok' : 'crit'}>
          {bio ? 'Odemykání zapnuto' : 'Odemykání vypnuto'}
        </Pill>
      )}
      {serviceOn ? (
        <Pill dot tone="warn" data-testid="access-service-pill">
          Servisní režim{remaining !== null && ` · zbývá ${mmss(remaining)}`} · neodemyká
        </Pill>
      ) : (
        <Pill dot tone="neutral">
          Servisní režim vypnutý
        </Pill>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- Osoby */

type SlotState = 'ok' | 'missing' | 'unknown' | 'dup';
const SLOT_TONE: Record<SlotState, Tone> = {
  ok: 'ok',
  missing: 'neutral',
  unknown: 'warn',
  dup: 'crit',
};
const SLOT_ARIA: Record<SlotState, string> = {
  ok: 'zapsáno',
  missing: 'chybí',
  unknown: 'neznámá ruka',
  dup: 'zapsáno dvakrát',
};
const SLOT_STATUS: Record<SlotState, string> = {
  ok: '✓ zapsáno',
  missing: '+ Přidat',
  unknown: 'Která ruka?',
  dup: '2× zapsáno',
};
/** One credential slot of the person matrix (Obličej · Pravá · Levá). The whole tile is the action. */
function Slot({
  kind,
  label,
  users,
  state,
  onAction,
  mirror,
  ctx,
  replaceStep,
  personName,
}: {
  kind: 'face' | 'palm';
  label: string;
  users: SensorUser[];
  state: SlotState;
  onAction?: () => void;
  mirror?: boolean;
  ctx: Ctx;
  replaceStep: Exclude<StepKey, 'name'>;
  personName: string;
}) {
  const first = users[0];
  const advice = first ? (ctx.state?.advice[String(first.id)] ?? []) : [];
  const ago = first
    ? enrolledShortCs(ctx.state?.labels[String(first.id)]?.enrolled_at, ctx.now)
    : '';
  const ids = users.map((u) => u.id).join(', ');
  const reasons = advice.map((r) => REENROLL_CS[r]).join(', ');
  const reenroll = advice.length > 0 && first;
  const tone: Tone = reenroll ? 'warn' : SLOT_TONE[state];
  const what =
    kind === 'face' ? 'obličej' : `${label.replace('?', '').toLocaleLowerCase('cs')} dlaň`;
  const press = reenroll
    ? () => ctx.setWizard({ name: personName, startAt: replaceStep, replaceId: first.id })
    : state === 'ok'
      ? undefined
      : onAction;
  return (
    <Tile
      data-testid={reenroll ? 'access-reenroll' : 'access-slot'}
      data-state={reenroll ? 'reenroll' : state}
      tone={tone}
      empty={state === 'missing'}
      icon={<Icon name={kind} mirror={mirror} />}
      label={label}
      title={ids ? `ID ve snímači: ${ids}${reasons ? ` · ${reasons}` : ''}` : undefined}
      aria-label={
        reenroll
          ? `Přezapsat ${what} – doporučeno (${reasons})`
          : `${kind === 'face' ? label : state === 'unknown' ? 'Dlaň' : `${label} dlaň`}: ${SLOT_ARIA[state]}${ago ? `, ${ago}` : ''}`
      }
      status={
        reenroll ? (
          <span data-testid="access-reenroll-chip">Přezapsat</span>
        ) : state === 'ok' ? (
          `✓ ${ago.replace(/^před /, '')}`
        ) : (
          SLOT_STATUS[state]
        )
      }
      detail={reenroll ? 'doporučeno' : undefined}
      onPress={press}
    />
  );
}

/** Stable avatar tint per name (0–4) – synthetic, no photo. */
function hueOf(name: string): number {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 997;
  return h % 5;
}

function PersonCard({ person, ctx }: { person: Person; ctx: Ctx }) {
  const { api, run, ensureService, setConfirm, setWizard, selectTab } = ctx;
  const [menu, setMenu] = useState(false);
  // Back (gesture/browser) closes the person sheet instead of leaving the panel.
  useBackClosable(() => setMenu(false), menu);
  const dupHands = new Set(findDuplicates([person]).map((d) => d.hand));
  // Unlabelled palms fill the empty hand slots (two palms from an HA script = both "Dlaň?").
  const slots = handSlots(person);
  const hand = (h: Hand) => {
    const isUnknown = slots[h].unknown;
    const users = slots[h].users;
    const state: SlotState = dupHands.has(h)
      ? 'dup'
      : isUnknown
        ? 'unknown'
        : users.length
          ? 'ok'
          : 'missing';
    return (
      <Slot
        key={h}
        kind="palm"
        label={isUnknown ? 'Dlaň?' : h === 'right' ? 'Pravá' : 'Levá'}
        users={users}
        state={state}
        mirror={h === 'left'}
        ctx={ctx}
        replaceStep={h}
        personName={person.name}
        onAction={
          state === 'missing'
            ? () => setWizard({ name: person.name, startAt: h })
            : () => selectTab('test')
        }
      />
    );
  };
  const toggle = () =>
    setConfirm({
      title: person.allowed ? `Zakázat ${person.name}?` : `Povolit ${person.name}?`,
      body: person.allowed
        ? `Snímač ${person.name} pozná, ale dveře neodemkne. Záznamy ve snímači zůstanou.`
        : 'Povolit jde jen v servisním režimu – zapneme ho.',
      confirm: person.allowed ? 'Zakázat' : 'Povolit',
      danger: person.allowed,
      run: () =>
        run(
          async () => {
            if (!person.allowed) await ensureService();
            for (const id of person.ids)
              await api.command('set_user_allowed', { user_id: id, allowed: !person.allowed });
            await api.command('list_users');
          },
          person.allowed ? `${person.name}: zakázáno` : `${person.name}: povoleno`,
        ),
    });
  const remove = () =>
    setConfirm({
      title: `Smazat ${person.name}?`,
      body: `Ze snímače se smaže obličej i dlaně (ID ${person.ids.join(', ')}). Vrátit to nejde, osobu byste museli zapsat znovu.`,
      confirm: 'Smazat',
      danger: true,
      run: () =>
        run(async () => {
          await ensureService();
          for (const id of person.ids) await api.command('delete_user', { user_id: id });
          await api.command('list_users');
        }, `${person.name}: smazáno ze snímače`),
    });
  return (
    <Card
      className="ac-person"
      data-testid="access-person"
      data-name={person.name}
      data-allowed={person.allowed}
    >
      <div className="ac-person-head">
        <span className="ac-avatar" aria-hidden="true" data-hue={hueOf(person.name)}>
          {person.name.slice(0, 1).toLocaleUpperCase('cs')}
        </span>
        <div className="ac-person-title">
          <h3>{person.name}</h3>
          <small data-testid="access-person-age">
            {person.child ? 'dítě' : 'dospělý'} ·{' '}
            {person.allowed ? (
              'odemyká'
            ) : (
              <b className="ac-off">{person.mixed ? 'částečně zakázáno' : 'neodemyká'}</b>
            )}
          </small>
        </div>
        <Switch
          checked={person.allowed}
          onChange={toggle}
          label={`Povolit odemykání: ${person.name}`}
          data-testid="access-person-toggle"
        />
        <Button
          variant="ghost"
          size="sm"
          icon={<Icon name="more" />}
          className="ac-person-menu"
          aria-label={`Další volby: ${person.name}`}
          aria-haspopup="dialog"
          data-testid="access-person-menu"
          onClick={() => setMenu(true)}
        />
      </div>
      {menu && (
        <Sheet
          variant="alert"
          title={person.name}
          onClose={() => setMenu(false)}
          data-testid="access-person-sheet"
          footer={
            <Button variant="ghost" onClick={() => setMenu(false)}>
              Hotovo
            </Button>
          }
        >
          <div className="ac-rows">
            <StatusRow
              label="Dítě"
              detail="Přezápis hlídáme už po 9 měsících"
              icon={<Icon name="face" />}
              value=""
              action={
                <Switch
                  checked={person.child}
                  label={`${person.name} je dítě (přezápis už po 9 měsících)`}
                  data-testid="access-person-child"
                  onChange={(child) =>
                    void ctx.run(
                      () => api.person(person.name, child),
                      child
                        ? `${person.name}: dítě – hlídáme přezápis po 9 měsících`
                        : `${person.name}: dospělý`,
                    )
                  }
                />
              }
            />
            <StatusRow
              label="Smazat ze snímače"
              detail="Obličej i obě dlaně, nejde vrátit"
              tone="crit"
              icon={<Icon name="trash" />}
              value=""
              action={
                <Button
                  size="sm"
                  variant="danger"
                  data-testid="access-person-delete"
                  onClick={() => {
                    setMenu(false);
                    remove();
                  }}
                >
                  Smazat
                </Button>
              }
            />
          </div>
        </Sheet>
      )}
      <div className="ac-creds" role="group" aria-label={`${person.name}: obličej a dlaně`}>
        <Slot
          kind="face"
          label="Obličej"
          users={person.face}
          state={person.face.length ? 'ok' : 'missing'}
          ctx={ctx}
          replaceStep="face"
          personName={person.name}
          onAction={() => setWizard({ name: person.name, startAt: 'face' })}
        />
        {hand('right')}
        {hand('left')}
      </div>
    </Card>
  );
}

const KIND_CS: Record<'face' | 'palm', string> = { face: 'obličej', palm: 'dlaň' };
/** Enrolment started anywhere (panel, HA script): pending → retry → result, with hand labelling. */
function EnrolBanner({ ctx }: { ctx: Ctx }) {
  const { enrol, now, api, run, state, people, dismissEnrol } = ctx;
  if (!enrol) return null;
  const at = enrol.phase === 'pending' ? enrol.since : enrol.time;
  if (enrol.phase !== 'pending' && now - Date.parse(at) > 15 * 60_000) return null;
  const who = 'name' in enrol && enrol.name ? enrol.name : 'bez jména';
  const kind = enrol.type ? KIND_CS[enrol.type] : 'obličej nebo dlaň';
  const needsHand =
    enrol.phase === 'ok' && enrol.type === 'palm' && !state?.labels[String(enrol.id)]?.hand;
  const hands = enrol.phase === 'ok' ? freeHands(people, enrol.id, enrol.name) : [];
  const title =
    enrol.phase === 'pending'
      ? `Probíhá zápis: ${kind}${'name' in enrol && enrol.name ? ` – ${enrol.name}` : ''}`
      : enrol.phase === 'ok'
        ? `Zapsáno: ${who} – ${kind} (ID ${enrol.id})`
        : `Zápis se nepovedl: ${who} – ${kind}`;
  const actions =
    enrol.phase === 'pending' ? undefined : (
      <>
        {needsHand &&
          enrol.phase === 'ok' &&
          hands.map((h) => (
            <Button
              key={h}
              size="sm"
              variant={hands.length === 1 ? 'primary' : 'secondary'}
              data-testid={`access-enrol-hand-${h}`}
              onClick={() =>
                run(async () => {
                  await api.label(enrol.id, { hand: h });
                  dismissEnrol();
                }, `ID ${enrol.id}: ${HAND_CS[h]} dlaň`)
              }
            >
              {h === 'right' ? 'Pravá dlaň' : 'Levá dlaň'}
            </Button>
          ))}
        <Button size="sm" variant="ghost" data-testid="access-enrol-dismiss" onClick={dismissEnrol}>
          Zavřít
        </Button>
      </>
    );
  return (
    <div className="ac-enrol" data-testid="access-enrol-status" data-phase={enrol.phase}>
      <LiveStatus
        state={enrol.phase === 'pending' ? 'busy' : enrol.phase === 'ok' ? 'ok' : 'error'}
        title={title}
        icon={<Icon name={enrol.type === 'palm' ? 'palm' : 'face'} />}
        actions={actions}
      >
        {enrol.phase === 'pending' &&
          (enrol.note
            ? `${enrol.attempt ?? 1}. pokus: ${enrol.note}. Zkouším znovu${enrol.remaining_s ? `, zbývá ${enrol.remaining_s} s` : ''}.`
            : 'Snímač čeká na obličej nebo dlaň – výsledek se tu ukáže hned.')}
        {enrol.phase === 'failed' && (
          <>
            {enrol.text}. {reasonCs(enrol.reason).tip ?? ''}
          </>
        )}
        {enrol.phase === 'ok' &&
          (needsHand
            ? hands.length === 1
              ? `${who} už má zapsanou ${hands[0] === 'left' ? 'pravou' : 'levou'} dlaň – tahle bude nejspíš ${HAND_CS[hands[0]!]}. Potvrďte to.`
              : 'Která ruka to byla? Bez označení nepoznáme, jestli chybí pravá, nebo levá.'
            : 'Osoba je v seznamu níže.')}
      </LiveStatus>
    </div>
  );
}

function PeopleTab({ ctx }: { ctx: Ctx }) {
  const { state, people, selectTab, setWizard, refresh, now } = ctx;
  if (!state) return <EmptyState title="Načítám…" />;
  if (state.users === null)
    return (
      <div data-testid="access-no-list">
        <EmptyState title="Seznam osob ze snímače zatím nedorazil">
          BioLock může být vypnutý.
        </EmptyState>
        <div className="ac-center">
          <Button icon={<Icon name="refresh" />} onClick={refresh}>
            Načíst znovu
          </Button>
        </div>
      </div>
    );
  if (!people.length)
    return (
      <>
        <EmptyState title="Ve snímači zatím nikdo není" />
        <div className="ac-center">
          <Button variant="primary" onClick={() => setWizard({})}>
            Přidat první osobu
          </Button>
        </div>
      </>
    );
  const issue = topIssue(people);
  const recent = state.history
    .filter((h) => h.kind === 'recognized' || h.kind === 'rejected')
    .slice(0, 3);
  return (
    <>
      <EnrolBanner ctx={ctx} />
      {issue.tone !== 'ok' && (
        <div className="ac-attn" data-testid="access-hero">
          <SignalCard
            compact
            id="access-issue"
            severity="warning"
            icon={<Icon name="palm" />}
            title={issue.title}
            context={issue.detail}
            actionLabel={issue.person ? 'Určit ruku' : undefined}
            onAction={issue.person ? () => selectTab('test') : undefined}
          />
        </div>
      )}
      {state.incomplete && <Pill tone="warn">Seznam ze snímače může být neúplný</Pill>}
      <div className="ac-grid">
        {people.map((p) => (
          <PersonCard key={p.key} person={p} ctx={ctx} />
        ))}
      </div>
      {recent.length > 0 && (
        <Card className="ac-section">
          <h3 className="ac-h">Poslední průchody</h3>
          {recent.map((h, i) => (
            <HistoryRow key={`${h.time}-${i}`} item={h} now={now} />
          ))}
        </Card>
      )}
    </>
  );
}

/* ---------------------------------------------------------------- Historie */

function HistoryRow({ item, now }: { item: HistoryItem; now: number }) {
  const granted = item.kind === 'recognized' && item.decision === 'granted';
  const what = item.type === 'palm' ? 'dlaň' : item.type === 'face' ? 'obličej' : '';
  const title =
    item.kind === 'rejected'
      ? `Nepoznal ${what || 'nikoho'}`
      : `${item.name || `ID ${item.user_id ?? '?'}`}${what ? ` · ${what}` : ''}`;
  const why = reasonCs(item.reason || (item.kind === 'rejected' ? 'not_recognized' : ''));
  const detail = granted
    ? 'odemčeno'
    : item.kind === 'rejected'
      ? `neodemčeno · ${why.tip ?? why.text}`
      : `neodemčeno · ${why.text}`;
  return (
    <StatusRow
      data-testid="access-history-item"
      tone={granted ? 'ok' : item.kind === 'rejected' ? 'crit' : 'warn'}
      icon={<Icon name={item.kind === 'rejected' ? 'x' : item.type === 'palm' ? 'palm' : 'face'} />}
      label={title}
      detail={detail}
      value=""
      time={whenCs(item.time, now)}
    />
  );
}
const LOG_FILTERS: Array<[LogFilter, string]> = [
  ['all', 'Vše'],
  ['biolock', 'BioLock'],
  ['nuki', 'Nuki'],
  ['problems', 'Problémy'],
];
const LOG_DAYS = 3; // like the original logbook card (72 h); "Načíst starší" adds 3 more days
const LOG_TONE: Record<LogItem['tone'], Tone> = {
  ok: 'ok',
  info: 'neutral',
  warn: 'warn',
  crit: 'crit',
};

/** Historie: one access log – BioLock (HomeBrain history) + lock/BioLock HA logbook + Nuki actions. */
function AccessLog({ ctx }: { ctx: Ctx }) {
  const { api, ent, state, now } = ctx;
  const [filter, setFilter] = useState<LogFilter>('all');
  const [days, setDays] = useState(LOG_DAYS);
  const [book, setBook] = useState<LogbookEntry[]>([]);
  const [loaded, setActions] = useState<LockAction[]>([]);
  const [older, setOlder] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const idsKey = Object.values(ent.ids).join('|');
  const ids: LogEntityIds = useMemo(
    () => ({
      lock: ent.ids.lock,
      lockAction: ent.ids.lockAction,
      lockBatteryCritical: ent.ids.lockBatteryCritical,
      connected: ent.ids.connected,
      sensorOnline: ent.ids.sensorOnline,
      lockout: ent.ids.lockout,
      service: ent.ids.service,
      biometric: ent.ids.biometric,
      lastError: ent.ids.lastError,
      lastUser: ent.ids.lastUser,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ids are strings, keyed by idsKey
    [idsKey],
  );
  const entityIds = useMemo(
    () => [...new Set(Object.values(ids).filter((x): x is string => Boolean(x)))],
    [ids],
  );
  useEffect(() => {
    let alive = true;
    const end = new Date();
    const start = new Date(end.getTime() - days * 86_400_000).toISOString();
    let unsub: (() => void) | null = null;
    Promise.all([
      api.logbook(start, end.toISOString(), entityIds).catch(() => []),
      api.lockActions(start, end.toISOString(), ids.lockAction ?? '').catch(() => []),
      api.history({ limit: 200 }).catch(() => ({ items: [], more: false })),
    ]).then(([b, a, h]) => {
      if (!alive) return;
      setBook(b);
      setActions(a);
      setOlder(h.items);
      setLoading(false);
    });
    void api
      .subscribeLogbook(end.toISOString(), entityIds, (entries) => {
        if (alive) setBook((prev) => [...prev, ...entries]);
      })
      .then((u) => {
        if (alive) unsub = u;
        else u();
      });
    return () => {
      alive = false;
      unsub?.();
    };
  }, [api, days, entityIds, ids.lockAction]);
  // live Nuki action: the event entity changes state on every action
  const lastAction = ent.lockAction as
    { state?: string; attributes?: Record<string, unknown> } | undefined;
  const actions = useMemo(() => {
    const a = lastAction?.attributes;
    const t = lastAction?.state ?? '';
    if (typeof a?.event_type !== 'string' || Number.isNaN(Date.parse(t))) return loaded;
    const time = new Date(t).toISOString();
    if (loaded.some((x) => x.time === time)) return loaded;
    return [
      ...loaded,
      {
        time,
        action: a.event_type,
        trigger: Number(a.trigger ?? -1),
        auth_id: Number(a.auth_id ?? 0),
        code_id: Number(a.code_id ?? 0),
      },
    ];
  }, [loaded, lastAction?.state, lastAction?.attributes]);
  const history = useMemo(() => {
    const seen = new Set<string>();
    return [...(state?.history ?? []), ...older].filter((h) => {
      const k = `${h.kind}|${h.time}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }, [state?.history, older]);
  const since = now - days * 86_400_000;
  const items = useMemo(
    () =>
      buildAccessLog({ history, logbook: book, actions, ids, labels: state?.labels ?? {} }).filter(
        (i) => Date.parse(i.time) >= since,
      ),
    [history, book, actions, ids, state?.labels, since],
  );
  const shown = filterLog(items, filter);
  const groups = groupByDay(shown, now);
  const problems = items.filter((i) => i.problem).length;
  return (
    <div className="ac-log" data-testid="access-log">
      <div className="ac-log-bar">
        <div data-testid="access-log-filter">
          <SegmentedControl
            label="Filtr historie"
            hideLabel
            size="sm"
            value={filter}
            onChange={setFilter}
            options={LOG_FILTERS.map(([k, l]) => [
              k,
              k === 'problems' && problems ? `${l} (${problems})` : l,
            ])}
          />
        </div>
        <small className="ac-log-range">
          {days === LOG_DAYS ? 'Posledních 72 hodin' : `Posledních ${days} dní`} ·{' '}
          {czCount(shown.length, 'záznam', 'záznamy', 'záznamů')}
        </small>
      </div>
      {loading ? (
        <EmptyState title="Načítám historii…" />
      ) : !groups.length ? (
        <EmptyState title={filter === 'problems' ? 'Žádné problémy' : 'Žádné záznamy'}>
          {filter === 'problems'
            ? 'Za zvolené období nic nehlásí zámek ani BioLock.'
            : 'Za zvolené období tu nic není.'}
        </EmptyState>
      ) : (
        groups.map((g) => (
          <Card key={g.key} className="ac-section ac-log-day" data-testid="access-log-day">
            <h3 className="ac-h">{g.label}</h3>
            {g.items.map((i) => (
              <div
                key={i.key}
                data-testid="access-log-item"
                data-source={i.source}
                data-problem={i.problem}
              >
                <StatusRow
                  tone={LOG_TONE[i.tone]}
                  icon={<Icon name={i.icon} />}
                  label={i.title}
                  detail={
                    <>
                      <span className="ac-log-src">{i.source === 'nuki' ? 'Nuki' : 'BioLock'}</span>
                      {i.detail ? ` · ${i.detail}` : ''}
                    </>
                  }
                  value=""
                  time={new Date(i.time).toLocaleTimeString('cs-CZ', {
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                />
              </div>
            ))}
          </Card>
        ))
      )}
      {!loading && (
        <div className="ac-center">
          <Button
            size="sm"
            data-testid="access-log-more"
            onClick={() => setDays((d) => d + LOG_DAYS)}
          >
            Načíst starší
          </Button>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- Test ruky */

function TestTab({ ctx, live }: { ctx: Ctx; live: LiveItem[] }) {
  const { api, state, people, serviceOn, run, ensureService, setConfirm, now } = ctx;
  const labels: Labels = state?.labels ?? {};
  const dups = findDuplicates(people);
  const lastPalm = live.find(
    (e) => e.data.kind === 'recognized' && e.data.type === 'palm' && e.data.user_id,
  );
  const focusName = lastPalm
    ? (labels[String(lastPalm.data.user_id)]?.person ?? lastPalm.data.name)
    : people.find((p) => p.unknown.length)?.name;
  const focus = people.find((p) => p.name === focusName);
  const setHand = (id: number, hand: Hand) =>
    run(async () => {
      await api.label(id, { hand, person: labels[String(id)]?.person ?? null });
    }, `ID ${id}: ${HAND_CS[hand]} ruka`);
  const del = (id: number) =>
    setConfirm({
      title: `Smazat ID ${id}?`,
      body: 'Nadbytečný záznam stejné ruky se ze snímače smaže. Druhou ruku pak zapíšete v průvodci.',
      confirm: 'Smazat',
      danger: true,
      run: () =>
        run(async () => {
          await ensureService();
          await api.command('delete_user', { user_id: id });
          await api.command('list_users');
        }, `ID ${id} smazáno`),
    });
  return (
    <div className="ac-split">
      <Card className="ac-section">
        <h3 className="ac-h">Živě ze snímače</h3>
        {serviceOn ? (
          <LiveStatus state="busy" title="Čekám na ruku…" icon={<Icon name="palm" />}>
            Servisní režim – dveře se neodemknou. Přiložte jednu dlaň 10–15 cm před snímač.
          </LiveStatus>
        ) : (
          <LiveStatus
            state="idle"
            title="Nejdřív zapněte servisní režim"
            icon={<Icon name="wrench" />}
          >
            Jinak by se při zkoušce odemkly dveře.
            <div className="ac-mt">
              <Button
                size="sm"
                variant="primary"
                data-testid="access-test-service"
                onClick={() => run(ensureService)}
              >
                Zapnout servisní režim a začít
              </Button>
            </div>
          </LiveStatus>
        )}
        <div data-testid="access-feed">
          {live.map((e, i) => {
            const d = e.data;
            const id = d.user_id ?? 0;
            const hand = labels[String(id)]?.hand;
            const name = labels[String(id)]?.person ?? d.name ?? '';
            const recognized = d.kind === 'recognized' && id > 0;
            const choose = recognized && d.type === 'palm' && !hand;
            return (
              <StatusRow
                key={e.key}
                data-testid="access-feed-item"
                tone={choose && i === 0 ? 'accent' : recognized ? 'ok' : 'crit'}
                icon={
                  <Icon
                    name={!recognized ? 'x' : d.type === 'palm' ? 'palm' : 'face'}
                    mirror={hand === 'left'}
                  />
                }
                label={
                  recognized
                    ? `Poznal: ${name} – ${d.type === 'palm' ? (hand ? `${HAND_CS[hand]} dlaň` : 'dlaň') : 'obličej'} ID ${id}`
                    : `Nepoznal ${d.type === 'face' ? 'obličej' : 'dlaň'}`
                }
                detail={
                  choose
                    ? 'Kterou ruku jste přiložili?'
                    : recognized
                      ? 'rozpoznání v pořádku'
                      : (reasonCs(d.reason).tip ?? reasonCs(d.reason).text)
                }
                value=""
                time={whenCs(e.time, now)}
                action={
                  choose ? (
                    <>
                      <Button
                        size="sm"
                        data-testid="access-hand-right"
                        onClick={() => setHand(id, 'right')}
                      >
                        → pravá
                      </Button>
                      <Button
                        size="sm"
                        data-testid="access-hand-left"
                        onClick={() => setHand(id, 'left')}
                      >
                        → levá
                      </Button>
                    </>
                  ) : undefined
                }
              />
            );
          })}
        </div>
      </Card>
      <Card className="ac-section" data-testid="access-test-summary">
        <h3 className="ac-h">{focus ? `${focus.name} · dlaně` : 'Dlaně'}</h3>
        {focus ? (
          <div className="ac-creds" data-cols="2">
            {(['right', 'left'] as const).map((h) => {
              const ids = focus[h].map((u) => u.id);
              const guess = !ids.length ? focus.unknown.map((u) => u.id) : [];
              return (
                <Tile
                  key={h}
                  tone={ids.length ? 'ok' : guess.length ? 'warn' : 'neutral'}
                  empty={!ids.length && !guess.length}
                  icon={<Icon name="palm" mirror={h === 'left'} />}
                  label={h === 'right' ? 'Pravá dlaň' : 'Levá dlaň'}
                  status={
                    ids.length
                      ? `✓ ID ${ids.join(', ')}`
                      : guess.length
                        ? `Neurčená · ID ${guess.join(', ')}`
                        : 'chybí'
                  }
                />
              );
            })}
          </div>
        ) : (
          <p className="ac-muted">Přiložte dlaň – ukážeme, komu patří a jestli má obě ruce.</p>
        )}
        {dups.map((d) => (
          <Card
            key={`${d.person}-${d.hand}`}
            tone="critical"
            data-testid="access-duplicate"
            className="ac-hero"
          >
            <div>
              <h2>
                {d.person}: {HAND_CS[d.hand]} ruka je zapsaná dvakrát
              </h2>
              <p>
                ID {d.ids.join(' a ')} jsou stejná ruka. Nadbytečné ID {d.extra} smažte a zapište
                druhou ruku.
              </p>
            </div>
            <Button
              variant="danger"
              size="sm"
              icon={<Icon name="trash" />}
              onClick={() => del(d.extra)}
            >
              Smazat ID {d.extra}
            </Button>
          </Card>
        ))}
        {!dups.length && (
          <p className="ac-muted">
            Duplicity hlídáme: stejná ruka zapsaná dvakrát se tu objeví s nabídkou smazání.
          </p>
        )}
      </Card>
    </div>
  );
}

/* ---------------------------------------------------------------- Zařízení */

const SENSOR_CS: Record<string, string> = {
  idle: 'Připraven',
  verifying: 'Rozpoznává',
  enrolling: 'Zapisuje',
  deleting: 'Maže',
  listing: 'Čte seznam',
  boot: 'Startuje',
  resetting: 'Restartuje',
};
const LOCK_CS: Record<string, string> = {
  locked: 'Zamčeno',
  unlocked: 'Odemčeno',
  open: 'Otevřeno',
  locking: 'Zamyká',
  unlocking: 'Odemyká',
  jammed: 'Zaseknuto',
};
const ACTION_CS: Record<string, string> = {
  unlock: 'odemčení',
  lock: 'zamčení',
  unlatch: 'otevření západky',
  lock_n_go: "Lock 'n' Go",
  lock_n_go_unlatch: "Lock 'n' Go se západkou",
  full_lock: 'dvojité zamčení',
};
/** Smart lock status – parity with the original Přístup dashboard tiles. */
function NukiCard({ ctx }: { ctx: Ctx }) {
  const { ent, now } = ctx;
  const lock = ent.lock as { state?: string; last_changed?: string } | undefined;
  const st = lock?.state;
  const available = Boolean(lock) && st !== 'unavailable' && st !== 'unknown';
  // One source of truth: the lock's own battery sensor. The BioLock-reported value (BLE) is only a
  // fallback and a diagnostic when the two disagree.
  const numOf = (v: string | undefined) =>
    v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v);
  const own = numOf(ent.lockBattery?.state);
  const viaBio = numOf(ent.nukiBattery?.state);
  const pct = own ?? viaBio;
  const critical = ent.lockBatteryCritical?.state === 'on';
  const low = critical || (pct !== null && pct < 20);
  const batteryNote =
    own === null && viaBio !== null
      ? 'údaj přes BioLock'
      : own !== null && viaBio !== null && Math.abs(own - viaBio) >= 5
        ? `BioLock hlásí ${Math.round(viaBio)} % (diagnostika)`
        : null;
  const act = ent.lockAction as
    { state?: string; attributes?: Record<string, unknown> } | undefined;
  const a = act?.attributes;
  const last =
    typeof a?.event_type === 'string' && act?.state && !Number.isNaN(Date.parse(act.state))
      ? `${ACTION_CS[a.event_type] ?? 'akce'} ${lockSource({ time: act.state, action: a.event_type, trigger: Number(a.trigger ?? -1), auth_id: Number(a.auth_id ?? 0), code_id: Number(a.code_id ?? 0) })} · ${whenCs(act.state, now)}`
      : null;
  return (
    <Card className="ac-section" data-testid="access-nuki">
      <h3 className="ac-h">Zámek Nuki</h3>
      <StatusRow
        tone={!available ? 'warn' : st === 'jammed' ? 'crit' : st === 'locked' ? 'ok' : 'accent'}
        icon={<Icon name={st === 'locked' ? 'lock' : st === 'jammed' ? 'alert' : 'unlock'} />}
        label={available ? (LOCK_CS[st ?? ''] ?? '—') : 'Zámek není dostupný'}
        detail={
          lock?.last_changed
            ? `od ${whenCs(lock.last_changed, now)}${last ? ` · poslední ${last}` : ''}`
            : (last ?? undefined)
        }
        value=""
        data-testid="access-nuki-state"
      />
      <StatusRow
        tone={critical ? 'crit' : pct === null ? 'neutral' : low ? 'warn' : 'ok'}
        icon={<Icon name="bat" />}
        label="Baterie"
        detail={[
          critical
            ? 'Kritická – vyměňte nebo nabijte baterii'
            : pct === null
              ? 'Zámek stav baterie nehlásí'
              : low
                ? 'Brzy vyměnit'
                : 'V pořádku',
          batteryNote,
        ]
          .filter(Boolean)
          .join(' · ')}
        value={pct === null ? '—' : `${Math.round(pct)} %`}
        data-testid="access-nuki-battery"
      />
      <StatusRow
        tone={available ? 'ok' : 'warn'}
        icon={<Icon name="wifi" />}
        label="Připojení"
        detail={
          available
            ? 'Zámek hlásí stav do Home Assistantu'
            : 'Zámek se neozývá – Wi-Fi nebo baterie?'
        }
        value={available ? 'online' : 'offline'}
      />
      <StatusRow
        tone={st === 'jammed' ? 'crit' : 'ok'}
        icon={<Icon name={st === 'jammed' ? 'alert' : 'check'} />}
        label="Zaseknutí"
        detail={st === 'jammed' ? 'Motor se zablokoval – zkontrolujte dveře' : 'Bez zaseknutí'}
        value=""
      />
      <StatusRow
        tone={ent.nukiPaired?.state === 'on' && ent.nukiConnected?.state === 'on' ? 'ok' : 'warn'}
        icon={<Icon name="chip" />}
        label="BioLock ↔ zámek (Bluetooth)"
        detail={`${ent.nukiPaired?.state === 'on' ? 'spárováno' : 'nespárováno'} · ${ent.nukiConnected?.state === 'on' ? 'připojeno' : 'nepřipojeno'}`}
        value=""
      />
    </Card>
  );
}

function DeviceTab({ ctx }: { ctx: Ctx }) {
  const { api, ent, serviceOn, remaining, run, setConfirm, refresh, state, now } = ctx;
  const num = (s: string | undefined) =>
    s === undefined || s === '' || Number.isNaN(Number(s)) ? null : Number(s);
  const dbm = num(ent.wifi?.state);
  const wifi = wifiQuality(dbm);
  const sensorOnline = ent.sensorOnline?.state === 'on';
  const lockout = ent.lockout?.state === 'on';
  const option = ent.action?.state;
  const setOption = (next: string) => {
    const apply = () =>
      run(
        () => api.command('recognition_action', { option: next }),
        `Akce při rozpoznání: ${next}`,
      );
    if (next === OPEN_LATCH)
      setConfirm({
        title: 'Přepnout na „Otevřít západku“?',
        body: 'Po rozpoznání zámek odemkne a stáhne střelku – dveře půjdou rovnou otevřít. Zapněte v aplikaci Nuki automatické zamčení, ať se dveře po průchodu zase zamknou.',
        confirm: 'Přepnout',
        danger: true,
        run: apply,
      });
    else void apply();
  };
  return (
    <>
      <div className="ac-tiles ac-tiles-2" data-testid="access-device">
        <Card>
          <Stat
            label="Snímač"
            value={sensorOnline ? (SENSOR_CS[ent.sensorState?.state ?? ''] ?? '—') : 'Offline'}
          />
          <Pill dot tone={sensorOnline ? 'ok' : 'crit'}>
            {sensorOnline
              ? 'online'
              : ent.connected?.state === 'on'
                ? 'BioLock běží, snímač neodpovídá'
                : 'BioLock nepřipojený'}
          </Pill>
        </Card>
        <Card data-testid="access-wifi">
          <Stat
            label="Wi-Fi"
            value={dbm === null ? '—' : String(Math.round(dbm)).replace('-', '−')}
            unit="dBm"
          />
          <Pill dot tone={wifi.tone}>
            {wifi.label}
          </Pill>
        </Card>
      </div>
      <NukiCard ctx={ctx} />
      <Card className="ac-section">
        <h3 className="ac-h">Zabezpečení</h3>
        <StatusRow
          tone={ent.biometric?.state === 'on' ? 'ok' : 'crit'}
          icon={<Icon name="shield" />}
          label="Biometrické odemykání"
          detail={
            serviceOn
              ? 'Pozastaveno servisním režimem.'
              : 'Snímač smí odemknout dveře. Vypnutím zastavíte odemykání, záznamy zůstanou.'
          }
          value=""
          action={
            <Switch
              checked={ent.biometric?.state === 'on'}
              disabled={!ent.biometric}
              label="Biometrické odemykání"
              tone="ok"
              data-testid="access-biometric"
              onChange={(on) => run(() => api.command('biometric', { on }))}
            />
          }
        />
        <StatusRow
          tone={serviceOn ? 'warn' : 'neutral'}
          icon={<Icon name="wrench" />}
          label="Servisní režim"
          detail={
            <>
              Zápis a mazání osob, dveře se neodemykají.
              {remaining !== null && (
                <span data-testid="access-countdown"> Vypne se za {mmss(remaining)}.</span>
              )}
            </>
          }
          value=""
          action={
            <Switch
              checked={serviceOn}
              disabled={!ent.service}
              label="Servisní režim"
              tone="warn"
              data-testid="access-service"
              onChange={(on) => run(() => api.command('service_mode', { on }))}
            />
          }
        />
        <StatusRow
          tone={option === OPEN_LATCH ? 'warn' : 'accent'}
          icon={<Icon name="door" />}
          label="Akce při rozpoznání"
          detail={`„Otevřít západku“ odemkne a stáhne střelku – dveře jdou rovnou otevřít, proto v aplikaci Nuki zapněte automatické zamčení.${serviceOn ? '' : ' Měnit jde jen v servisním režimu.'}`}
          value=""
          action={
            <SegmentedControl
              label="Akce při rozpoznání"
              hideLabel
              size="sm"
              value={option ?? null}
              disabled={!serviceOn}
              onChange={setOption}
              options={[
                ['Odemknout', 'Odemknout'],
                [OPEN_LATCH, OPEN_LATCH],
              ]}
            />
          }
        />
      </Card>
      <Card className="ac-section">
        <h3 className="ac-h">Ochrana a údržba</h3>
        <StatusRow
          tone={lockout ? 'crit' : 'ok'}
          icon={<Icon name="lock" />}
          label="Blokace po neúspěších"
          detail={
            lockout
              ? 'Zablokováno po 5 nepoznaných pokusech (na 5 minut).'
              : 'Žádná blokace. Po 5 nepovedených pokusech za minutu se snímač na 5 minut zablokuje.'
          }
          value=""
          action={
            lockout ? (
              <Button
                size="sm"
                onClick={() => run(() => api.command('reset_lockout'), 'Blokace zrušena')}
              >
                Zrušit blokaci
              </Button>
            ) : undefined
          }
        />
        <StatusRow
          icon={<Icon name="refresh" />}
          label="Seznam osob ze snímače"
          detail={`${state?.listed_at ? `načteno ${whenCs(state.listed_at, now)}` : 'zatím nenačteno'} · ${czCount(state?.users?.length ?? 0, 'záznam', 'záznamy', 'záznamů')}`}
          value=""
          action={
            <Button size="sm" data-testid="access-refresh" onClick={refresh}>
              Načíst znovu
            </Button>
          }
        />
      </Card>
      <Card className="ac-section">
        <h3 className="ac-h">Upozornění</h3>
        <StatusRow
          tone={state?.settings.notify_reenroll ? 'accent' : 'neutral'}
          icon={<Icon name="alert" />}
          label="Upozornit na přezápis"
          detail="Jednou za záznam pošle oznámení do Home Assistantu, když doporučíme přezapsat (děti 9 měsíců, dospělí 24 měsíců, opakované pokusy)."
          value=""
          action={
            <Switch
              checked={state?.settings.notify_reenroll ?? true}
              label="Upozornit na přezápis"
              data-testid="access-notify"
              onChange={(on) =>
                run(
                  () => api.settings({ notify_reenroll: on }),
                  on ? 'Upozornění zapnuto' : 'Upozornění vypnuto',
                )
              }
            />
          }
        />
      </Card>
    </>
  );
}

/* ---------------------------------------------------------------- Confirm */

function Confirm({ spec, onClose }: { spec: ConfirmSpec; onClose: () => void }) {
  useBackClosable(onClose);
  const [busy, setBusy] = useState(false);
  return (
    <Sheet
      variant="alert"
      title={spec.title}
      onClose={onClose}
      data-testid="access-confirm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Zpět
          </Button>
          <Button
            variant={spec.danger ? 'danger' : 'primary'}
            data-testid="access-confirm-ok"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await spec.run();
              onClose();
            }}
          >
            {spec.confirm}
          </Button>
        </>
      }
    >
      {spec.body}
    </Sheet>
  );
}

/* ---------------------------------------------------------------- Wizard */

function FaceIllu() {
  return (
    <div className="ac-illu">
      <svg viewBox="0 0 420 320" aria-hidden="true">
        <rect
          x="46"
          y="70"
          width="74"
          height="170"
          rx="22"
          fill="var(--hb-s3)"
          stroke="var(--hb-edge-strong)"
        />
        <circle cx="83" cy="122" r="17" fill="#0b0f16" stroke="var(--hb-ac)" strokeWidth="2.5" />
        <circle cx="83" cy="122" r="6" fill="var(--hb-ac)" opacity=".8" />
        <path d="M100 122 L330 70 L330 190 Z" fill="var(--hb-ac)" opacity=".14" />
        <circle
          cx="330"
          cy="118"
          r="44"
          fill="var(--hb-s1)"
          stroke="var(--hb-t1)"
          strokeWidth="3"
        />
        <path
          d="M262 250c6-40 34-62 68-62s62 22 68 62"
          fill="var(--hb-s1)"
          stroke="var(--hb-t1)"
          strokeWidth="3"
        />
        <path d="M120 282 H330" stroke="var(--hb-t2)" strokeWidth="1.6" strokeDasharray="4 5" />
        <path d="M120 274v16M330 274v16" stroke="var(--hb-t2)" strokeWidth="1.6" />
      </svg>
      <span className="ac-illu-lbl">50–80 cm</span>
    </div>
  );
}
function PalmIllu({ mirror }: { mirror: boolean }) {
  return (
    <div className="ac-illu">
      <svg viewBox="0 0 420 320" aria-hidden="true">
        <rect
          x="46"
          y="70"
          width="74"
          height="170"
          rx="22"
          fill="var(--hb-s3)"
          stroke="var(--hb-edge-strong)"
        />
        <circle cx="83" cy="122" r="17" fill="#0b0f16" stroke="var(--hb-ac)" strokeWidth="2.5" />
        <circle cx="83" cy="122" r="6" fill="var(--hb-ac)" opacity=".8" />
        <path d="M100 122 L250 52 L250 232 Z" fill="var(--hb-ac)" opacity=".16" />
        <g
          transform={mirror ? 'translate(408 40) scale(-8.2 8.2)' : 'translate(212 40) scale(8.2)'}
          fill="var(--hb-s1)"
          stroke="var(--hb-t1)"
          strokeWidth=".42"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {P.palm}
        </g>
        <path d="M120 282 H312" stroke="var(--hb-t2)" strokeWidth="1.6" strokeDasharray="4 5" />
        <path d="M120 274v16M312 274v16" stroke="var(--hb-t2)" strokeWidth="1.6" />
      </svg>
      <span className="ac-scan" />
      <span className="ac-illu-lbl">10–15 cm</span>
    </div>
  );
}

const TIPS: Record<'face' | 'palm', Array<[string, string]>> = {
  face: [
    ['50–80 cm před snímačem', 'dívejte se přímo do kamery'],
    ['Bez brýlí proti slunci a kapuce', 'obličej celý vidět, ruce pryč od obličeje'],
    ['Vydržte v klidu 5–10 s', 'až se ozve potvrzení'],
  ],
  palm: [
    ['Otevřená dlaň', 'prsty u sebe, palec mírně od dlaně'],
    ['10–15 cm před snímačem', 'střed dlaně proti modrému kroužku, obličej mimo záběr'],
    ['Vydržte v klidu 5–10 s', 'až se ozve potvrzení, ruku oddalte'],
  ],
};

export type StepKey = 'name' | 'face' | 'right' | 'left';
const STEPS: Array<{ key: StepKey; title: string }> = [
  { key: 'name', title: 'Jméno' },
  { key: 'face', title: 'Obličej' },
  { key: 'right', title: 'Pravá dlaň' },
  { key: 'left', title: 'Levá dlaň' },
];
type StepStatus = 'todo' | 'ready' | 'waiting' | 'ok' | 'error' | 'skipped';
interface WizStep {
  status: StepStatus;
  id?: number;
  reason?: string;
}
const STEP_LABEL: Record<Exclude<StepKey, 'name'>, string> = {
  face: 'obličej',
  right: 'pravou dlaň',
  left: 'levou dlaň',
};

function Wizard({
  api,
  spec,
  people,
  serviceOn,
  remaining,
  sensorState,
  onBus,
  onClose,
}: {
  api: AccessApi;
  spec: WizardSpec;
  people: Person[];
  serviceOn: boolean;
  remaining: number | null;
  sensorState: string | undefined;
  onBus: (l: Listener) => () => void;
  onClose: () => void;
}) {
  const startIndex = spec.startAt ? STEPS.findIndex((s) => s.key === spec.startAt) : 0;
  const single = spec.replaceId !== undefined;
  const replaceRef = useRef(spec.replaceId);
  const [name, setName] = useState(spec.name ?? '');
  const [index, setIndex] = useState(spec.name && startIndex > 0 ? startIndex : 0);
  const [steps, setSteps] = useState<Record<StepKey, WizStep>>(() => {
    const init = {} as Record<StepKey, WizStep>;
    STEPS.forEach((s, i) => {
      init[s.key] = {
        status: spec.name && i < startIndex ? (i === 0 ? 'ok' : 'skipped') : 'ready',
      };
    });
    return init;
  });
  const current: StepKey | 'done' = STEPS[index]?.key ?? 'done';
  const pendingRef = useRef<StepKey | null>(null);
  const cancel = () => {
    if (pendingRef.current) void api.command('cancel_enroll').catch(() => undefined);
    onClose();
  };
  useBackClosable(cancel);

  // Enrolment needs service mode (the firmware rejects it otherwise): switch it on when the wizard opens.
  useEffect(() => {
    if (!serviceOn)
      void api
        .command('service_mode', { on: true })
        .catch(() => toast.error('Servisní režim se nepodařilo zapnout'));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on open
  }, []);

  const advance = useCallback(() => setIndex((i) => Math.min(i + 1, STEPS.length)), []);
  useEffect(
    () =>
      onBus((event) => {
        const step = pendingRef.current;
        if (!step || event.event !== 'enrolled') return;
        pendingRef.current = null;
        if (event.data.ok && event.data.user_id) {
          const id = event.data.user_id;
          setSteps((s) => ({ ...s, [step]: { status: 'ok', id } }));
          const old = replaceRef.current;
          void (async () => {
            try {
              if (step === 'right' || step === 'left') await api.label(id, { hand: step });
              // Rollback-safe re-enrol: the old ID goes only after the new one is stored.
              if (old !== undefined) {
                replaceRef.current = undefined;
                await api.command('delete_user', { user_id: old });
                toast.success(`Přezapsáno: nové ID ${id}, staré ID ${old} smazáno`);
              }
            } catch {
              toast.error(
                old !== undefined
                  ? `Nové ID ${id} je uložené, staré ID ${old} se nepodařilo smazat`
                  : 'Označení ruky se nepodařilo uložit',
              );
            }
          })();
          setTimeout(() => (single ? setIndex(STEPS.length) : advance()), 1200);
        } else {
          setSteps((s) => ({
            ...s,
            [step]: { status: 'error', reason: event.data.reason || 'unknown' },
          }));
        }
      }),
    [onBus, api, advance, single],
  );

  const start = (step: Exclude<StepKey, 'name'>) => {
    pendingRef.current = step;
    setSteps((s) => ({ ...s, [step]: { status: 'waiting' } }));
    const trimmed = name.trim().slice(0, 20);
    const call =
      step === 'face'
        ? api.command('enroll_face', { name: trimmed, admin: false, timeout_s: ENROLL_TIMEOUT_S })
        : api.command('enroll_palm', { name: trimmed, timeout_s: ENROLL_TIMEOUT_S });
    call.catch((err: unknown) => {
      pendingRef.current = null;
      setSteps((s) => ({
        ...s,
        [step]: { status: 'error', reason: err instanceof AccessApiError ? err.code : 'unknown' },
      }));
    });
  };
  const skip = (step: StepKey) => {
    if (steps[step].status === 'waiting') void api.command('cancel_enroll').catch(() => undefined);
    pendingRef.current = null;
    setSteps((s) => ({ ...s, [step]: { status: 'skipped' } }));
    if (single) setIndex(STEPS.length);
    else advance();
  };
  const confirmName = () => {
    if (!name.trim()) return;
    setSteps((s) => ({ ...s, name: { status: 'ok' } }));
    advance();
  };

  const visible = single ? STEPS.filter((s) => s.key === spec.startAt) : STEPS;
  const stepperSteps = visible.map((s) => {
    const i = STEPS.indexOf(s);
    const v = steps[s.key];
    const state: StepState =
      i === index
        ? 'active'
        : v.status === 'ok'
          ? 'done'
          : v.status === 'skipped'
            ? 'skipped'
            : v.status === 'error'
              ? 'error'
              : 'todo';
    const detail =
      s.key === 'name'
        ? name.trim() || 'povinné'
        : v.status === 'ok'
          ? `uloženo · ID ${v.id}`
          : v.status === 'skipped'
            ? 'přeskočeno'
            : v.status === 'waiting'
              ? sensorState === 'enrolling'
                ? 'snímám…'
                : `čeká na ${s.key === 'face' ? 'obličej' : 'dlaň'}…`
              : v.status === 'error'
                ? 'nepovedlo se'
                : 'volitelné';
    return { key: s.key, title: s.title, detail, state };
  });
  const st = current !== 'done' ? steps[current] : null;
  const kind = current === 'face' ? 'face' : 'palm';
  const reason = st?.status === 'error' ? reasonCs(st.reason) : null;

  const replaceNote = single ? ` Staré ID ${spec.replaceId} se smaže až po úspěšném zápisu.` : '';
  let body: ReactNode = null;
  let footer: ReactNode = null;
  if (current === 'name') {
    body = (
      <>
        <label className="ac-field">
          Jméno nebo přezdívka (max. 20 znaků, uloží se do snímače)
          <input
            data-testid="access-name"
            value={name}
            maxLength={20}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && confirmName()}
          />
        </label>
        {people.length > 0 && (
          <div className="ac-chips">
            <span className="ac-muted">Doplnit existující:</span>
            {people.map((p) => (
              <button
                key={p.key}
                type="button"
                className="ac-chip-btn"
                onClick={() => setName(p.name)}
              >
                <Chip>{p.name}</Chip>
              </button>
            ))}
          </div>
        )}
      </>
    );
    footer = (
      <>
        <Button variant="ghost" onClick={cancel}>
          Zrušit
        </Button>
        <Button
          variant="primary"
          data-testid="access-name-next"
          disabled={!name.trim()}
          onClick={confirmName}
        >
          Pokračovat
        </Button>
      </>
    );
  } else if (current !== 'done' && st) {
    const label = STEP_LABEL[current];
    const scanning = st.status === 'waiting' && sensorState === 'enrolling';
    const nextKey = visible.map((x) => x.key).find((k, i, all) => all[i - 1] === current);
    const nextHint = nextKey
      ? `Po uložení přejdeme na ${STEP_LABEL[nextKey as Exclude<StepKey, 'name'>]}`
      : 'Po uložení ukážeme shrnutí';
    body = (
      <div className="ac-wiz">
        {kind === 'face' ? <FaceIllu /> : <PalmIllu mirror={current === 'left'} />}
        <div className="ac-wiz-copy">
          <h3>Přiložte {label}</h3>
          <ol className="ac-tips">
            {TIPS[kind].map(([a, b]) => (
              <li key={a}>
                <strong>{a}</strong>
                <span>{b}</span>
              </li>
            ))}
          </ol>
          <LiveStatus
            data-testid="access-step-status"
            state={
              st.status === 'ok'
                ? 'ok'
                : st.status === 'error'
                  ? 'error'
                  : st.status === 'waiting'
                    ? 'busy'
                    : 'idle'
            }
            icon={
              st.status === 'ok' || st.status === 'error' ? undefined : (
                <Icon name={kind} mirror={current === 'left'} />
              )
            }
            title={
              st.status === 'ok'
                ? `Uloženo · ID ${st.id}`
                : reason
                  ? reason.text
                  : st.status === 'waiting'
                    ? scanning
                      ? `Snímám ${label}…`
                      : `Čekám na ${kind === 'face' ? 'obličej' : 'dlaň'}…`
                    : 'Připraveno'
            }
          >
            {st.status === 'ok'
              ? 'Pokračujeme dalším krokem…'
              : reason
                ? reason.tip
                : st.status === 'waiting'
                  ? scanning
                    ? 'Držte v klidu, dokud se neozve potvrzení.'
                    : `Přiložte ${label} – snímač chvíli počká.`
                  : serviceOn
                    ? `Postavte se ke snímači a klepněte na „Začít snímat“.${replaceNote}`
                    : 'Čekám na servisní režim…'}
          </LiveStatus>
        </div>
      </div>
    );
    footer = (
      <>
        <Button variant="danger" onClick={cancel}>
          Zrušit zápis
        </Button>
        <Button variant="ghost" data-testid="access-skip" onClick={() => skip(current)}>
          Přeskočit {label}
        </Button>
        <span className="ac-grow" />
        {st.status === 'waiting' && <small className="ac-next">{nextHint}</small>}
        {st.status === 'ready' && (
          <Button
            variant="primary"
            data-testid="access-start"
            disabled={!serviceOn}
            onClick={() => start(current)}
          >
            Začít snímat
          </Button>
        )}
        {st.status === 'error' && (
          <Button variant="primary" data-testid="access-retry" onClick={() => start(current)}>
            Zkusit znovu
          </Button>
        )}
      </>
    );
  } else {
    body = (
      <div data-testid="access-wizard-done">
        {visible
          .filter((s) => s.key !== 'name')
          .map((s) => {
            const v = steps[s.key];
            return (
              <StatusRow
                key={s.key}
                tone={v.status === 'ok' ? 'ok' : 'neutral'}
                icon={<Icon name={v.status === 'ok' ? 'check' : 'x'} />}
                label={s.title}
                detail={
                  v.status === 'ok'
                    ? `uloženo · ID ${v.id}`
                    : v.status === 'skipped'
                      ? 'přeskočeno – doplníte později'
                      : 'nezapsáno'
                }
                value=""
              />
            );
          })}
        <p className="ac-muted">Servisní režim se sám vypne; dřív ho vypnete v Zařízení.</p>
      </div>
    );
    footer = (
      <Button variant="primary" data-testid="access-wizard-finish" onClick={onClose}>
        Hotovo
      </Button>
    );
  }

  return (
    <Sheet
      title={
        single
          ? `Přezapsat · ${name.trim()} · ID ${spec.replaceId}`
          : name.trim()
            ? `Přidat osobu · ${name.trim()}`
            : 'Přidat osobu'
      }
      width="lg"
      onClose={cancel}
      data-testid="access-wizard"
      aside={
        <Pill dot tone="warn" variant={serviceOn ? 'solid' : 'soft'}>
          {serviceOn
            ? `Servisní režim${remaining !== null ? ` · zbývá ${mmss(remaining)}` : ''}`
            : 'Zapínám servisní režim…'}
        </Pill>
      }
      footer={footer}
    >
      <Stepper steps={stepperSteps} label="Kroky přidání osoby" />
      <div className="ac-mt">{body}</div>
    </Sheet>
  );
}

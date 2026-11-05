/**
 * Unified access log (Historie): BioLock structured events from HomeBrain + HA logbook entries of
 * the lock / BioLock entities + Nuki lock-action events (who or what moved the lock). Pure – tested
 * in log.test.ts with synthetic data.
 */
import { HAND_CS, reasonCs } from './domain.js';
import type { HistoryItem, Labels } from './types.js';

export type LogSource = 'biolock' | 'nuki';
export type LogTone = 'ok' | 'info' | 'warn' | 'crit';
export type LogIcon =
  | 'face'
  | 'palm'
  | 'x'
  | 'lock'
  | 'unlock'
  | 'door'
  | 'bat'
  | 'alert'
  | 'wrench'
  | 'shield'
  | 'chip'
  | 'plus'
  | 'trash';
export interface LogItem {
  key: string;
  time: string;
  source: LogSource;
  tone: LogTone;
  problem: boolean;
  icon: LogIcon;
  title: string;
  detail?: string;
}
/** `logbook/get_events` / `logbook/event_stream` entry (subset). `when` = epoch seconds. */
export interface LogbookEntry {
  when: number | string;
  entity_id?: string;
  state?: string;
  name?: string;
  message?: string;
  context_event_type?: string;
  context_domain?: string;
  context_service?: string;
}
/** Nuki `lockActionEvent` as an HA event entity (`event_type` + trigger/auth_id/code_id). */
export interface LockAction {
  time: string;
  action: string;
  trigger: number;
  auth_id: number;
  code_id: number;
}
export interface LogEntityIds {
  lock?: string;
  lockAction?: string;
  lockBatteryCritical?: string;
  connected?: string;
  sensorOnline?: string;
  lockout?: string;
  service?: string;
  biometric?: string;
  lastError?: string;
  lastUser?: string;
}
export type LogFilter = 'all' | 'biolock' | 'nuki' | 'problems';

const iso = (when: number | string) =>
  typeof when === 'number' ? new Date(when * 1000).toISOString() : new Date(when).toISOString();
const ms = (t: string) => new Date(t).getTime();
const what = (type: string | undefined, id: number | undefined, labels: Labels) => {
  if (type === 'face') return 'obličej';
  if (type !== 'palm') return '';
  const hand = id !== undefined ? labels[String(id)]?.hand : undefined;
  return hand ? `${HAND_CS[hand]} dlaň` : 'dlaň';
};
/** Denials that are a setting, not a problem (service mode, biometric unlocking off). */
const BENIGN = new Set(['service_mode', 'disabled', 'biometric_off']);

function biolockItem(h: HistoryItem, labels: Labels, i: number): LogItem {
  const base = { key: `b-${h.time}-${i}`, time: iso(h.time), source: 'biolock' as const };
  const name = h.name || (h.user_id ? `ID ${h.user_id}` : '');
  const kind = what(h.type, h.user_id, labels);
  switch (h.kind) {
    case 'recognized': {
      if (h.decision === 'granted')
        return {
          ...base,
          tone: 'ok',
          problem: false,
          icon: h.type === 'palm' ? 'palm' : 'face',
          title: `${name} – odemčeno`,
          detail: kind || undefined,
        };
      const why = reasonCs(h.reason);
      return {
        ...base,
        tone: 'warn',
        problem: !BENIGN.has(h.reason ?? ''),
        icon: h.type === 'palm' ? 'palm' : 'face',
        title: `${name} – poznán(a), neodemčeno`,
        detail: [kind, why.text].filter(Boolean).join(' · '),
      };
    }
    case 'rejected': {
      const why = reasonCs(h.reason || 'not_recognized');
      return {
        ...base,
        tone: 'warn',
        problem: true,
        icon: 'x',
        title: 'Nepoznaný pokus',
        detail: [kind, why.text].filter(Boolean).join(' · '),
      };
    }
    case 'enrolled': {
      const type = h.type && h.type !== 'unknown' ? h.type : h.type_requested;
      const k = what(type, h.user_id, labels) || 'obličej nebo dlaň';
      if (h.ok)
        return {
          ...base,
          tone: 'ok',
          problem: false,
          icon: 'plus',
          title: `Zapsáno: ${h.name || 'bez jména'} – ${k}`,
          detail: [`ID ${h.user_id}`, h.attempts && h.attempts > 1 ? `${h.attempts}. pokus` : '']
            .filter(Boolean)
            .join(' · '),
        };
      const why = reasonCs(h.reason);
      return {
        ...base,
        tone: 'warn',
        problem: true,
        icon: 'alert',
        title: `Zápis se nepovedl: ${h.name || 'bez jména'} – ${k}`,
        detail: h.reason_text || why.text,
      };
    }
    case 'deleted':
      return {
        ...base,
        tone: 'info',
        problem: !h.ok,
        icon: 'trash',
        title: h.ok ? `Smazáno ID ${h.user_id}` : `Mazání ID ${h.user_id} selhalo`,
        detail: h.rollback
          ? 'automaticky vráceno po špatném zápisu'
          : h.ok
            ? undefined
            : reasonCs(h.reason).text,
      };
    case 'lockout':
    default:
      return {
        ...base,
        tone: 'crit',
        problem: true,
        icon: 'shield',
        title: 'BioLock zablokoval odemykání',
        detail: 'po 5 neúspěšných pokusech, na 5 minut',
      };
  }
}

/** Legacy lines written by the HA automation (`logbook.log`, name BioLock) before HomeBrain kept history. */
function legacyItem(e: LogbookEntry): HistoryItem | null {
  const m = e.message ?? '';
  const t = (w: string) => (w === 'dlaň' ? 'palm' : 'face');
  let r = /^Odemkl\(a\) (.+) \((obličej|dlaň)\)/.exec(m);
  if (r)
    return {
      kind: 'recognized',
      time: iso(e.when),
      name: r[1],
      type: t(r[2]!),
      decision: 'granted',
    };
  r = /^Rozpoznán\(a\) (.+) \((obličej|dlaň)\), odemčení zamítnuto: (\S+)/.exec(m);
  if (r)
    return {
      kind: 'recognized',
      time: iso(e.when),
      name: r[1],
      type: t(r[2]!),
      decision: 'denied',
      reason: r[3],
    };
  r = /^Neúspěšný pokus: (\S+)/.exec(m);
  if (r) return { kind: 'rejected', time: iso(e.when), reason: r[1] };
  return null;
}

export function lockSource(a: LockAction): string {
  if (a.code_id > 0) return 'klávesnicí';
  switch (a.trigger) {
    case 172:
      return 'Home Assistant';
    case 171:
      return 'HomeKit / Matter';
    case 2:
      return 'tlačítkem na zámku';
    case 3:
      return 'časovým plánem';
    case 6:
      return 'automatické zamčení';
    case 0:
      return 'aplikací / Bluetooth';
    default:
      return 'jiný zdroj';
  }
}

const LOCK_STATE: Record<
  string,
  { title: string; tone: LogTone; icon: LogIcon; problem?: boolean }
> = {
  locked: { title: 'Zamčeno', tone: 'ok', icon: 'lock' },
  unlocked: { title: 'Odemčeno', tone: 'info', icon: 'unlock' },
  open: { title: 'Otevřeno (západka)', tone: 'info', icon: 'door' },
  jammed: { title: 'Zámek se zasekl', tone: 'crit', icon: 'alert', problem: true },
  unavailable: { title: 'Zámek není dostupný', tone: 'warn', icon: 'alert', problem: true },
};
const ERROR_IDLE = new Set(['', 'no_reply', 'unknown', 'unavailable', 'none', 'ok']);

export function buildAccessLog(input: {
  history: HistoryItem[];
  logbook: LogbookEntry[];
  actions: LockAction[];
  ids: LogEntityIds;
  labels: Labels;
}): LogItem[] {
  const { history, logbook, actions, ids, labels } = input;
  const out: LogItem[] = [];
  const structured = history.map((h, i) => biolockItem(h, labels, i));
  out.push(...structured);
  const near = <T extends { time: string }>(t: string, list: T[], before: number, after: number) =>
    list.find((x) => ms(x.time) >= ms(t) - before && ms(x.time) <= ms(t) + after);
  const granted = history
    .concat(logbook.map(legacyItem).filter((x): x is HistoryItem => x !== null))
    .filter((h) => h.kind === 'recognized' && h.decision === 'granted');
  logbook.forEach((e, i) => {
    const time = iso(e.when);
    const key = `l-${time}-${i}`;
    const id = e.entity_id;
    if (e.message !== undefined) {
      const legacy = legacyItem(e);
      if (!legacy) return;
      const twin = history.some(
        (h) => h.kind === legacy.kind && Math.abs(ms(h.time) - ms(time)) < 5000,
      );
      if (!twin) out.push({ ...biolockItem(legacy, labels, i), key });
      return;
    }
    const st = e.state ?? '';
    if (id && id === ids.lock) {
      const spec = LOCK_STATE[st];
      if (!spec) return;
      let source: string | undefined;
      if (st === 'locked' || st === 'unlocked' || st === 'open') {
        const bio = near(time, granted, 30_000, 0);
        const act = actions.find(
          (a) => ms(a.time) >= ms(time) - 30_000 && ms(a.time) <= ms(time) + 2000,
        );
        if (bio && (!act || act.trigger === 0))
          source = `BioLock – ${[bio.name, what(bio.type, bio.user_id, labels)].filter(Boolean).join(', ')}`;
        else if (act) source = lockSource(act);
        else if (e.context_event_type === 'call_service' && e.context_domain === 'lock')
          source = 'Home Assistant';
      }
      out.push({
        key,
        time,
        source: 'nuki',
        tone: spec.tone,
        problem: Boolean(spec.problem),
        icon: spec.icon,
        title: spec.title,
        detail: source,
      });
      return;
    }
    const push = (
      source: LogSource,
      tone: LogTone,
      problem: boolean,
      icon: LogIcon,
      title: string,
      detail?: string,
    ) => out.push({ key, time, source, tone, problem, icon, title, detail });
    if (id === ids.lockBatteryCritical) {
      if (st === 'on')
        push('nuki', 'crit', true, 'bat', 'Kritická baterie zámku', 'vyměňte nebo nabijte baterii');
      else if (st === 'off') push('nuki', 'ok', false, 'bat', 'Baterie zámku v pořádku');
    } else if (id === ids.connected) {
      if (st === 'on') push('biolock', 'info', false, 'chip', 'BioLock připojen');
      else
        push(
          'biolock',
          'warn',
          true,
          'chip',
          'BioLock odpojen',
          'odemykání funguje dál, HA nedostává události',
        );
    } else if (id === ids.sensorOnline) {
      if (st === 'off') push('biolock', 'warn', true, 'chip', 'Snímač neodpovídá');
    } else if (id === ids.lockout) {
      if (st === 'on') {
        if (
          !near(
            time,
            history.filter((h) => h.kind === 'lockout'),
            10_000,
            10_000,
          )
        )
          push(
            'biolock',
            'crit',
            true,
            'shield',
            'BioLock zablokoval odemykání',
            'po 5 neúspěšných pokusech, na 5 minut',
          );
      } else if (st === 'off') push('biolock', 'info', false, 'shield', 'Blokace skončila');
    } else if (id === ids.service) {
      if (st === 'on' || st === 'off')
        push(
          'biolock',
          'info',
          false,
          'wrench',
          st === 'on' ? 'Servisní režim zapnut' : 'Servisní režim vypnut',
        );
    } else if (id === ids.biometric) {
      if (st === 'on') push('biolock', 'ok', false, 'shield', 'Biometrické odemykání zapnuto');
      else if (st === 'off')
        push('biolock', 'warn', false, 'shield', 'Biometrické odemykání vypnuto');
    } else if (id === ids.lastError) {
      if (ERROR_IDLE.has(st.toLowerCase()) || st.startsWith('enroll:')) return; // enrolments have their own rows
      push(
        'biolock',
        'warn',
        true,
        'alert',
        'Chyba snímače',
        reasonCs(st.replace(/^\w+: /, '')).text,
      );
    }
  });
  return out.sort((a, b) => (a.time < b.time ? 1 : a.time > b.time ? -1 : 0));
}

export function filterLog(items: LogItem[], filter: LogFilter): LogItem[] {
  if (filter === 'all') return items;
  if (filter === 'problems') return items.filter((i) => i.problem);
  return items.filter((i) => i.source === filter);
}

export function groupByDay(
  items: LogItem[],
  now: number,
): Array<{ key: string; label: string; items: LogItem[] }> {
  const dayKey = (t: number) => {
    const d = new Date(t);
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  };
  const today = dayKey(now);
  const yesterday = dayKey(now - 86_400_000);
  const groups: Array<{ key: string; label: string; items: LogItem[] }> = [];
  for (const item of items) {
    const t = ms(item.time);
    const key = dayKey(t);
    let g = groups[groups.length - 1];
    if (!g || g.key !== key) {
      const label =
        key === today
          ? 'Dnes'
          : key === yesterday
            ? 'Včera'
            : new Date(t).toLocaleDateString('cs-CZ', {
                weekday: 'long',
                day: 'numeric',
                month: 'numeric',
              });
      g = { key, label: label.charAt(0).toLocaleUpperCase('cs') + label.slice(1), items: [] };
      groups.push(g);
    }
    g.items.push(item);
  }
  return groups;
}

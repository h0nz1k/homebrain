import { czPlural } from '@homebrain/ui';
import type {
  AccessMeta,
  Hand,
  Labels,
  Modality,
  Person,
  ReenrollReason,
  SensorUser,
} from './types.js';

export const SERVICE_MODE_MINUTES = 30; // firmware: service mode switches itself off after 30 min
export const HAND_CS: Record<Hand, string> = { right: 'pravá', left: 'levá' };

export function modalityOf(id: number): Modality | null {
  if (id >= 1 && id <= 1000) return 'face';
  if (id >= 1001 && id <= 2000) return 'palm';
  return null;
}

/** Same folding as the integration (`store.fold`): collapse spaces, casefold. */
export const fold = (s: string) => s.split(/\s+/).filter(Boolean).join(' ').toLocaleLowerCase('cs');

/** Group sensor IDs into people (label `person` wins over the name stored in the sensor). */
export function groupPeople(
  users: SensorUser[],
  labels: Labels,
  flags: AccessMeta['people'] = {},
): Person[] {
  const map = new Map<string, Person>();
  for (const user of users) {
    const label = labels[String(user.id)] ?? {};
    const name = (label.person ?? user.name).trim() || 'Bez jména';
    const key = fold(name);
    let person = map.get(key);
    if (!person) {
      person = {
        key,
        name,
        ids: [],
        allowed: true,
        mixed: false,
        face: [],
        right: [],
        left: [],
        unknown: [],
        child: Boolean(flags[key]?.child),
      };
      map.set(key, person);
    }
    person.ids.push(user.id);
    if (user.type === 'face') person.face.push(user);
    else if (label.hand === 'right') person.right.push(user);
    else if (label.hand === 'left') person.left.push(user);
    else person.unknown.push(user);
  }
  const people = [...map.values()];
  for (const person of people) {
    const flags = person.ids.map((id) => users.find((u) => u.id === id)?.allowed ?? false);
    person.allowed = flags.every(Boolean);
    person.mixed = flags.some(Boolean) && !person.allowed;
  }
  return people.sort((a, b) => a.name.localeCompare(b.name, 'cs'));
}

export interface Duplicate {
  person: string;
  hand: Hand;
  ids: number[];
  /** The newer ID (higher number) – the one we offer to delete. */
  extra: number;
}
/** Same hand labelled twice = the owner enrolled one hand twice; offer to delete the newer ID. */
export function findDuplicates(people: Person[]): Duplicate[] {
  const out: Duplicate[] = [];
  for (const person of people) {
    for (const hand of ['right', 'left'] as const) {
      const ids = person[hand].map((u) => u.id).sort((a, b) => a - b);
      if (ids.length > 1) out.push({ person: person.name, hand, ids, extra: ids[ids.length - 1]! });
    }
  }
  return out;
}

export interface Issue {
  tone: 'warn' | 'ok';
  title: string;
  detail: string;
  person?: string;
}
/** The one sentence the Osoby hero shows (answers "has everybody both palms?"). */
export function topIssue(people: Person[]): Issue {
  const dup = findDuplicates(people)[0];
  if (dup)
    return {
      tone: 'warn',
      title: `${dup.person} má ${HAND_CS[dup.hand]}ou dlaň zapsanou dvakrát`,
      detail: `ID ${dup.ids.join(' a ')} – nadbytečné ID ${dup.extra} můžete smazat.`,
      person: dup.person,
    };
  const unknown = people.find((p) => p.unknown.length > 0);
  if (unknown)
    return {
      tone: 'warn',
      title: `${unknown.name}: neurčená dlaň`,
      detail: 'Přiložte dlaň ve zkoušce ruky a označte ji – pak bude jasné, jestli má obě dlaně.',
      person: unknown.name,
    };
  const missing = people.filter((p) => p.allowed && (!p.right.length || !p.left.length));
  if (missing.length)
    return {
      tone: 'warn',
      title: `${missing.map((p) => p.name).join(', ')}: chybí ${missing.length === 1 && missing[0]!.right.length ? 'levá' : missing.length === 1 && missing[0]!.left.length ? 'pravá' : 'některá'} dlaň`,
      detail:
        'Dlaň pomůže, když obličej nejde poznat (čepice, tma). Doplníte ji klepnutím na dlaždici.',
    };
  return {
    tone: 'ok',
    title: 'Všichni mají obličej i obě dlaně',
    detail: 'Žádná neurčená ruka ani duplicita.',
  };
}

/** Czech reason + advice for enrolment failures and recognition denials (firmware codes). */
export function reasonCs(reason: string | undefined): { text: string; tip?: string } {
  switch ((reason ?? '').replace(/^enroll: /, '')) {
    case 'timeout':
      return {
        text: 'Snímač nic nezachytil včas',
        tip: 'Přistupte blíž a vydržte v klidu, dokud se neozve potvrzení.',
      };
    case 'face_instead_of_palm':
      return {
        text: 'Zachycen obličej místo dlaně',
        tip: 'Zakryjte dlaní obličej a držte ji 10–15 cm před snímačem.',
      };
    case 'no_reply':
      return {
        text: 'Snímač neodpověděl',
        tip: 'Zkuste to za chvíli znovu; když to trvá, restartujte BioLock.',
      };
    case 'already_enrolled':
      return { text: 'Tohle už snímač zná', tip: 'Obličej nebo dlaň je zapsaná pod jiným ID.' };
    case 'modality_mismatch':
      return {
        text: 'Snímač uviděl něco jiného',
        tip: 'Při zápisu dlaně zakryjte obličej dlaní, při zápisu obličeje dejte ruce pryč.',
      };
    case 'liveness_failed':
    case 'live_check_failed':
      return {
        text: 'Kontrola živosti neprošla',
        tip: 'Žádná fotka ani odlesk – zkuste to znovu.',
      };
    case 'full':
    case 'max_users':
    case 'max_user':
    case 'no_memory':
      return { text: 'Snímač je plný', tip: 'Smažte nepoužívané záznamy.' };
    case 'camera':
    case 'camera_failed':
    case 'module_error':
      return {
        text: 'Chyba kamery snímače',
        tip: 'Zkuste to znovu; když to trvá, restartujte BioLock.',
      };
    case 'busy':
      return { text: 'Snímač právě dělá něco jiného', tip: 'Počkejte pár sekund.' };
    case 'sensor_offline':
      return { text: 'Snímač je offline', tip: 'Zkontrolujte napájení a připojení BioLocku.' };
    case 'service_mode':
      return { text: 'Servisní režim – neodemyká se' };
    case 'service_mode_required':
      return { text: 'Chce to servisní režim', tip: 'Zapněte ho a zkuste to znovu.' };
    case 'disabled':
      return { text: 'Biometrické odemykání je vypnuté' };
    case 'lockout':
      return { text: 'Blokace po neúspěšných pokusech' };
    case 'cooldown':
      return { text: 'Krátce po předchozím odemčení' };
    case 'not_recognized':
    case 'unknown_user':
      return { text: 'Nepoznal', tip: 'Obličej nebo dlaň není zapsaná.' };
    case 'not_allowed':
      return { text: 'odemykání vypnuto' };
    case 'aborted':
      return { text: 'Zápis byl zrušen' };
    case 'invalid_name':
      return { text: 'Neplatné jméno', tip: 'Nejvýš 20 znaků.' };
    case '':
    case 'none':
      return { text: 'v pořádku' };
    default:
      // Old firmware sent free text; never show it raw.
      return {
        text: 'Nepodařilo se',
        tip: 'Zkuste to znovu. Když se to opakuje, restartujte BioLock.',
      };
  }
}

export function wifiQuality(dbm: number | null): {
  label: string;
  bars: number;
  tone: 'ok' | 'warn' | 'crit';
} {
  if (dbm === null || !Number.isFinite(dbm)) return { label: 'neznámý', bars: 0, tone: 'warn' };
  if (dbm >= -55) return { label: 'Výborný signál', bars: 4, tone: 'ok' };
  if (dbm >= -67) return { label: 'Dobrý signál', bars: 3, tone: 'ok' };
  if (dbm >= -75) return { label: 'Slabý signál', bars: 2, tone: 'warn' };
  return { label: 'Velmi slabý signál', bars: 1, tone: 'crit' };
}

/** Seconds left before the firmware switches service mode off (null when off/unknown). */
export function serviceRemaining(lastChanged: string | undefined, now: number): number | null {
  const since = lastChanged ? Date.parse(lastChanged) : NaN;
  if (!Number.isFinite(since)) return null;
  return Math.max(0, Math.round((since + SERVICE_MODE_MINUTES * 60_000 - now) / 1000));
}

export function mmss(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function whenCs(iso: string, now: number): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const diff = (now - d.getTime()) / 1000;
  if (diff < 45) return 'teď';
  if (diff < 3600) return `před ${Math.max(1, Math.round(diff / 60))} min`;
  const time = d.toLocaleTimeString('cs-CZ', { hour: 'numeric', minute: '2-digit' });
  const day = new Date(now);
  const start = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
  if (d.getTime() >= start) return `dnes ${time}`;
  if (d.getTime() >= start - 86_400_000) return `včera ${time}`;
  return `${d.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric' })} ${time}`;
}

/** Whole months since YYYY-MM-DD (same rule as the integration's `months_between`). */
export function monthsSince(isoDate: string, now: number): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!m) return null;
  const d = new Date(now);
  let months = (d.getFullYear() - Number(m[1])) * 12 + (d.getMonth() + 1 - Number(m[2]));
  if (d.getDate() < Number(m[3])) months -= 1;
  return Math.max(0, months);
}

/** 'zapsáno před 3 měsíci' / 'zapsáno tento měsíc' / 'zapsáno před rokem a 2 měsíci'. */
export function enrolledAgoCs(isoDate: string | undefined, now: number): string {
  const months = isoDate ? monthsSince(isoDate, now) : null;
  if (months === null) return 'datum zápisu neznámé';
  if (months === 0) return 'zapsáno tento měsíc';
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const m = (n: number) => `${n === 1 ? '' : `${n} `}${czPlural(n, 'měsícem', 'měsíci', 'měsíci')}`;
  const y = (n: number) => `${n === 1 ? '' : `${n} `}${czPlural(n, 'rokem', 'roky', 'lety')}`;
  if (!years) return `zapsáno před ${m(rest)}`;
  return `zapsáno před ${y(years)}${rest ? ` a ${m(rest)}` : ''}`;
}

/** Short age for a credential tile (fits one line at ~120 px): „před 8 měs.“, „před 3 lety“. */
export function enrolledShortCs(isoDate: string | undefined, now: number): string {
  const months = isoDate ? monthsSince(isoDate, now) : null;
  if (months === null) return 'bez data';
  if (months === 0) return 'tento měsíc';
  if (months < 24) return `před ${months} měs.`;
  return `před ${Math.floor(months / 12)} lety`;
}

export const REENROLL_CS: Record<ReenrollReason, string> = {
  age: 'zápis je starý',
  retries: 'často pozná až na další pokus',
  success_rate: 'nízká úspěšnost',
};

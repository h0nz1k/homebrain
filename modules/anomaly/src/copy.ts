/**
 * Czech copy of Hlídání domu. The backend only sends structure; every sentence is built here so
 * the wording rules are in one tested place:
 *
 * - a headline never contradicts the detail: when the same device still reports another value,
 *   the headline names only what is missing, and says data stopped coming („Čidlo ve sklepě
 *   přestalo posílat vlhkost“ – not „nehlásí vlhkost“, which reads as „it is not damp“);
 * - „hlášení“ is only a report of a sensor („od posledního hlášení“, „Chybí 16 hlášení“); an alert
 *   of this app is always „upozornění“ (copy.test.ts scans the sources for it);
 * - every outage time is anchored to the **last report** and reads the same everywhere
 *   („2 h 45 min od posledního hlášení (7:55)“): card, kiosk, suspicion rows, detail – once per
 *   card (the meta line), the timeline only counts the missing reports;
 * - durations are computed from the caller's `now` (on Dnes the clock shown on screen);
 * - one impersonal voice (no „hlídám / ukážu / naměřil“), rooms in the locative where known
 *   („V obýváku je neobvykle teplo“);
 * - non-breaking spaces between a number and its unit and after one-letter prepositions.
 */
import type { Detector, Finding, Report, TierKey } from './types.js';

export const TIME_ZONE = 'Europe/Prague';
const NB = ' ';

export const TIER_LABEL: Record<TierKey, string> = {
  observation: 'Pozorování',
  suspicion: 'Podezření',
  confirmed: 'Porucha',
};
export const TIER_TONE = { observation: 'accent', suspicion: 'warn', confirmed: 'crit' } as const;
export const TIERS: TierKey[] = ['observation', 'suspicion', 'confirmed'];
export const TIER_RANK: Record<TierKey | 'ok', number> = {
  ok: 0,
  observation: 1,
  suspicion: 2,
  confirmed: 3,
};

const clock = new Intl.DateTimeFormat('cs-CZ', {
  hour: 'numeric',
  minute: '2-digit',
  timeZone: TIME_ZONE,
});
/** „9:29“ in Prague time. */
export const hm = (value: Date | string | number) => clock.format(new Date(value));

export const num = (v: number) => v.toLocaleString('cs-CZ', { maximumFractionDigits: 1 });

/** „2 h 21 min“, „45 min“, „3 h“. */
export function dur(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (hours >= 48) return `${Math.floor(hours / 24)}${NB}dní`;
  return [hours && `${hours}${NB}h`, (rest || !hours) && `${rest}${NB}min`]
    .filter(Boolean)
    .join(' ');
}

/** „v 9:55“, „ve 13:55“ – Czech uses „ve“ before hours read with a consonant cluster. */
export function atTime(value: Date | string | number): string {
  const text = hm(value);
  const hour = Number(text.split(':')[0]);
  return `${[2, 3, 4, 12, 13, 14, 20, 21, 22, 23].includes(hour) ? 've' : 'v'}${NB}${text}`;
}

/** The one outage phrase: „2 h 21 min od posledního hlášení (9:29)“. */
export function sinceLast(last: string, now: Date | string): string {
  return `${dur((new Date(now).getTime() - Date.parse(last)) / 60_000)} od${NB}posledního hlášení (${hm(last)})`;
}

function plural(n: number, one: string, few: string, many: string) {
  return n === 1 ? one : n >= 2 && n <= 4 ? few : many;
}
/** „1 hodnota“, „3 hodnoty“, „0 hodnot“, „17 hodnot“. */
export const values = (n: number) => `${n}${NB}${plural(n, 'hodnota', 'hodnoty', 'hodnot')}`;
export const devicesCount = (n: number) => `${n}${NB}zařízení`;

/** What a sensor measures: accusative („nehlásí vlhkost“), nominative and grammatical gender. */
interface Quantity {
  acc: string;
  nom: string;
  g: 'm' | 'f' | 'n';
}
const QUANTITY: Record<string, Quantity> = {
  temperature: { acc: 'teplotu', nom: 'teplota', g: 'f' },
  humidity: { acc: 'vlhkost', nom: 'vlhkost', g: 'f' },
  moisture: { acc: 'vlhkost', nom: 'vlhkost', g: 'f' },
  power: { acc: 'příkon', nom: 'příkon', g: 'm' },
  energy: { acc: 'spotřebu', nom: 'spotřeba', g: 'f' },
  battery: { acc: 'stav baterie', nom: 'stav baterie', g: 'm' },
  illuminance: { acc: 'osvětlení', nom: 'osvětlení', g: 'n' },
  carbon_dioxide: { acc: 'koncentraci CO₂', nom: 'koncentrace CO₂', g: 'f' },
  pressure: { acc: 'tlak', nom: 'tlak', g: 'm' },
  atmospheric_pressure: { acc: 'tlak', nom: 'tlak', g: 'm' },
  voltage: { acc: 'napětí', nom: 'napětí', g: 'n' },
  current: { acc: 'proud', nom: 'proud', g: 'm' },
  pm25: { acc: 'prachové částice', nom: 'prachové částice', g: 'f' },
};
const HIGH = { m: 'vysoký', f: 'vysokou', n: 'vysoké' } as const;
const LOW = { m: 'nízký', f: 'nízkou', n: 'nízké' } as const;
/** Positive/negative baseline words that read better than „vysoká teplota“. */
const WARM_COLD: Record<string, [string, string]> = {
  temperature: ['neobvykle teplo', 'neobvykle chladno'],
  humidity: ['neobvykle vlhko', 'neobvykle sucho'],
};

/**
 * Room names in the locative („v obýváku“). Area names come from the owner's HA, so only common
 * Czech rooms are known; any other room falls back to a sentence with the device name.
 */
const ROOM_LOCATIVE: Record<string, string> = {
  obývák: 'v obýváku',
  'obývací pokoj': 'v obývacím pokoji',
  ložnice: 'v ložnici',
  koupelna: 'v koupelně',
  kuchyně: 'v kuchyni',
  kuchyň: 'v kuchyni',
  sklep: 've sklepě',
  pracovna: 'v pracovně',
  'dětský pokoj': 'v dětském pokoji',
  pokoj: 'v pokoji',
  chodba: 'na chodbě',
  předsíň: 'v předsíni',
  garáž: 'v garáži',
  půda: 'na půdě',
  kotelna: 'v kotelně',
  'technická místnost': 'v technické místnosti',
  spíž: 've spíži',
  šatna: 'v šatně',
  toaleta: 'na toaletě',
  wc: 'na toaletě',
  dílna: 'v dílně',
  zahrada: 'na zahradě',
  terasa: 'na terase',
};
export function roomLocative(area: string | null | undefined): string | null {
  return (area && ROOM_LOCATIVE[area.trim().toLocaleLowerCase('cs-CZ')]) || null;
}

const cap = (s: string) => s.charAt(0).toLocaleUpperCase('cs-CZ') + s.slice(1);

function quantity(f: Pick<Finding, 'device_class' | 'name'>): Quantity | null {
  return (f.device_class && QUANTITY[f.device_class]) || null;
}
/** „vlhkost“ for known classes, otherwise the entity's own name in quotes. */
function what(f: Pick<Finding, 'device_class' | 'name'>, form: 'acc' | 'nom' = 'acc') {
  const q = quantity(f);
  return q ? q[form] : `${form === 'acc' ? 'hodnotu' : 'hodnota'} „${f.name}“`;
}

const SILENT = new Set<Detector>(['silent', 'unavailable']);
const deviceName = (r: Report) => r.devices[0]?.name ?? 'Zařízení';

/** Newest last report among the silent findings: the one instant every outage time uses. */
export function lastReport(r: Report): string | null {
  const times = r.findings
    .filter((f) => SILENT.has(f.detector))
    .map((f) => f.detail.last ?? f.detail.since)
    .filter((t): t is string => !!t);
  if (!times.length) return null;
  return times.reduce((a, b) => (Date.parse(a) >= Date.parse(b) ? a : b));
}

/** Minutes since the last report (the outage duration shown everywhere). */
export function outageMinutes(r: Report, now: Date | string): number | null {
  const last = lastReport(r);
  return last ? (new Date(now).getTime() - Date.parse(last)) / 60_000 : null;
}

/** Every watched value of the device is silent (not just some of them). */
export function wholeDevice(r: Report): boolean {
  if (r.scope !== 'device') return false;
  const top = r.findings[0];
  return !!top && SILENT.has(top.detector) && r.entity_count >= 2 && r.reporting.length === 0;
}

function silentFindings(r: Report) {
  return r.findings.filter((f) => SILENT.has(f.detector));
}

export function headline(r: Report): string {
  if (r.scope === 'system') return 'Většina zařízení přestala odpovídat';
  if (r.scope === 'integration') return 'Několik zařízení přestalo odpovídat';
  const top = r.findings[0];
  const device = deviceName(r);
  if (!top) return device;
  if (SILENT.has(top.detector)) {
    if (wholeDevice(r)) return `${device} neodpovídá`;
    const silent = silentFindings(r);
    return stoppedSending(device, silent.length > 1 ? values(r.entity_count) : what(top));
  }
  if (top.detector === 'baseline') {
    const up = (top.detail.z ?? 0) > 0;
    const pair = top.device_class ? WARM_COLD[top.device_class] : undefined;
    const room = roomLocative(r.devices[0]?.area);
    if (pair && room) return `${cap(room)} je ${up ? pair[0] : pair[1]}`;
    const q = quantity(top);
    if (q) return `${device} hlásí neobvykle ${up ? HIGH[q.g] : LOW[q.g]} ${q.acc}`;
    return `${device}: neobvyklá hodnota „${top.name}“`;
  }
  if (top.detector === 'flapping') {
    return top.detail.what === 'availability'
      ? `Hodnota „${top.name}“ opakovaně vypadává`
      : `${top.name} se neobvykle často přepíná`;
  }
  // dwell
  return `${top.name}: ${dwellVerb(top)} déle než obvykle`;
}

/**
 * Grammatical gender of a device name from its first word („Čidlo ve sklepě“ → neuter). Names are
 * the owner's own, so only clear endings count; `null` when unsure.
 */
export function nameGender(name: string): 'm' | 'f' | 'n' | null {
  const head = name.trim().split(/\s+/)[0]?.toLocaleLowerCase('cs-CZ') ?? '';
  if (!/^\p{L}{2,}$/u.test(head)) return null;
  if (['klima', 'kakao'].includes(head)) return 'n';
  if (/[oí]$/.test(head)) return 'n';
  if (/[aeě]$/.test(head)) return 'f';
  if (/[bcčdďfghjklmnňpqrřsštťvwxzž]$/.test(head)) return 'm';
  return null;
}

/**
 * „Čidlo ve sklepě přestalo posílat vlhkost“: says that data stopped coming (unambiguous, unlike
 * „nehlásí vlhkost“). With a name of unclear gender: „Senzor XY-1: přestala chodit vlhkost“.
 */
function stoppedSending(device: string, what: string): string {
  const g = nameGender(device);
  if (g) return `${device} ${{ m: 'přestal', f: 'přestala', n: 'přestalo' }[g]} posílat ${what}`;
  return `${device}: přestaly chodit údaje (${what})`;
}

function dwellVerb(f: Finding): string {
  if (f.domain === 'light') return 'svítí';
  if (['door', 'garage_door', 'window', 'opening'].includes(f.device_class ?? ''))
    return 'otevřeno';
  return 'zapnuto';
}

/** One line under the headline: what, since when (last report), how long. */
export function meta(r: Report, now: Date | string): string {
  if (r.scope === 'integration') {
    const last = lastReport(r);
    const tail = last ? ` · ${sinceLast(last, now)}` : '';
    return `Společná integrace${r.integration ? ` ${r.integration}` : ''} · ${devicesCount(r.devices.length)}${tail}`;
  }
  if (r.scope === 'system') return `Od${NB}${hm(r.since)}`;
  const top = r.findings[0];
  if (!top) return '';
  if (SILENT.has(top.detector)) {
    const since = sinceLast(lastReport(r)!, now);
    // The headline already says what is missing; the count of values is only in the detail.
    if (wholeDevice(r)) return `Neposílá žádné údaje · ${since}`;
    const silent = silentFindings(r);
    if (top.detector === 'unavailable' && silent.length === 1) {
      const adj = { m: 'nedostupný', f: 'nedostupná', n: 'nedostupné' }[quantity(top)?.g ?? 'f'];
      return `${cap(what(top, 'nom'))} je ${adj} · ${since}`;
    }
    return cap(since);
  }
  if (top.detector === 'baseline') {
    const unit = top.unit ? `${NB}${top.unit}` : '';
    const { value, usual } = top.detail;
    return `${num(value ?? 0)}${unit} · obvykle ${num(usual ?? 0)}${unit} · od${NB}${hm(top.since)}`;
  }
  if (top.detector === 'flapping') {
    return top.detail.what === 'availability'
      ? `${top.detail.count ?? 0}× vypadlo za poslední hodinu · od${NB}${hm(top.since)}`
      : `${top.detail.count ?? 0} přepnutí za 15${NB}min · od${NB}${hm(top.since)}`;
  }
  const started = top.detail.since ?? top.since;
  return `Od${NB}${hm(started)} · ${dur(top.detail.minutes ?? 0)} · obvykle nejvýš ${dur(top.detail.usual_minutes ?? 0)}`;
}

/** Short second line of a row in „Další podezření“ (single line on the kiosk). */
export function rowDetail(r: Report, now: Date | string): string {
  const last = lastReport(r);
  if (last) return sinceLast(last, now);
  const top = r.findings[0];
  if (top?.detector === 'baseline') {
    const unit = top.unit ? `${NB}${top.unit}` : '';
    return `${num(top.detail.value ?? 0)}${unit}, obvykle ${num(top.detail.usual ?? 0)}${unit}`;
  }
  return `od${NB}${hm(top?.since ?? r.since)}`;
}

/** „Chybí všech 17 hodnot zařízení“ / „obě hodnoty“ / „všechny 3 hodnoty“. */
function allValues(n: number): string {
  if (n === 2) return 'obě hodnoty';
  return `${n >= 5 ? 'všech' : 'všechny'} ${values(n)}`;
}

/** What happened and why it matters (no instruction – see `nextStep`); durations count to `now`. */
export function why(r: Report, now: Date | string): string {
  if (r.scope === 'integration') return 'Zařízení mají společnou bránu nebo integraci.';
  if (r.scope === 'system') return 'Výpadek se týká většiny zařízení najednou.';
  const top = r.findings[0];
  if (!top) return '';
  if (SILENT.has(top.detector)) {
    if (wholeDevice(r)) return `Chybí ${allValues(r.entity_count)} zařízení.`;
    const still = r.reporting[0];
    if (still) {
      const other = still.device_class && QUANTITY[still.device_class];
      const lead = other ? cap(other.nom) : `Hodnota „${still.name}“`;
      return `${lead} ze stejného zařízení přichází dál, chybí jen ${what(top)}.`;
    }
    return top.detector === 'unavailable'
      ? 'Home Assistant ji hlásí jako nedostupnou.'
      : 'Ze zařízení nepřichází žádná hodnota.';
  }
  if (top.detector === 'baseline') {
    if (top.tier === 'observation' && top.detail.seen_before === true)
      return 'Hodnota je na tuto denní dobu neobvyklá, v minulosti se už objevila.';
    if (top.tier === 'observation')
      return 'Hodnota vybočila z obvyklého rozmezí pro tuto denní dobu.';
    const lasting = `Odchylka trvá ${dur((new Date(now).getTime() - Date.parse(top.since)) / 60_000)}.`;
    if (top.detail.seen_before !== false)
      return `${lasting} Takové hodnoty tu v posledních týdnech už byly, proto to zatím není porucha.`;
    const up = (top.detail.z ?? 0) > 0;
    return `${lasting} Tak ${up ? 'vysoká' : 'nízká'} hodnota se tu za poslední tři týdny nevyskytla.`;
  }
  if (top.detector === 'flapping')
    return top.detail.what === 'availability'
      ? 'Home Assistant tuto hodnotu opakovaně hlásí jako nedostupnou.'
      : 'Stav se mění mnohem častěji než obvykle.';
  return 'Stav trvá déle, než bývá zvykem.';
}

/** Baseline steps by quantity and direction: [too high, too low]. */
const BASELINE_STEP: Record<string, [string, string]> = {
  temperature: [
    'Zkontrolujte topení, okno nebo přímé slunce.',
    'Zkontrolujte topení, okno nebo dveře.',
  ],
  humidity: ['Zkontrolujte větrání nebo únik vody.', 'Zkontrolujte zvlhčovač nebo topení.'],
  moisture: ['Zkontrolujte, jestli někde neteče voda.', 'Zkontrolujte zálivku nebo čidlo.'],
  power: [
    'Zkontrolujte, co je zapnuté a nemá být.',
    'Zkontrolujte, jestli spotřebič běží, jak má.',
  ],
  carbon_dioxide: ['Vyvětrejte nebo zkontrolujte větrání.', 'Zkontrolujte čidlo.'],
};

/**
 * One concrete next step per card, derived from the kind of anomaly (detector, what is missing,
 * quantity and direction) – never written per device.
 */
export function nextStep(r: Report): string {
  if (r.scope === 'integration')
    return 'Zkontrolujte společnou bránu nebo připojení integrace v Home Assistantu.';
  if (r.scope === 'system') return 'Zkontrolujte připojení sítě a stav Home Assistantu.';
  const top = r.findings[0];
  if (!top) return '';
  if (SILENT.has(top.detector)) {
    if (wholeDevice(r)) return 'Zkontrolujte napájení a připojení zařízení.';
    if (top.detector === 'unavailable') return 'Zkontrolujte zařízení a jeho integraci.';
    // the device still sends something: power and the network work, the sensor part does not
    if (r.reporting.length) return 'Zkontrolujte baterii nebo dosah čidla.';
    return 'Zkontrolujte baterii, napájení nebo dosah signálu.';
  }
  if (top.detector === 'baseline') {
    const up = (top.detail.z ?? 0) > 0;
    const pair = top.device_class ? BASELINE_STEP[top.device_class] : undefined;
    if (pair) return up ? pair[0] : pair[1];
    return 'Zkontrolujte, co se u zařízení změnilo.';
  }
  if (top.detector === 'flapping')
    return top.detail.what === 'availability'
      ? 'Ověřte, za jakých podmínek je hodnota dostupná.'
      : 'Zkontrolujte kontakt čidla nebo automatizace, které ho přepínají.';
  return dwellVerb(top) === 'otevřeno'
    ? 'Zkontrolujte, jestli se nezapomnělo zavřít.'
    : 'Zkontrolujte, jestli se nezapomnělo vypnout.';
}

/** Longest device name that still fits the button („Otevřít Klima obývák“). */
const OPEN_NAME_MAX = 18;
/**
 * The name in the accusative after „Otevřít“: masculine inanimate and neuter names stay
 * („Klima obývák“, „Čidlo ve sklepě“), a feminine head noun in -a takes -u („Myčku“,
 * „Zásuvku akvária“); anything else is `null` (no guessing).
 */
export function accusativeName(name: string): string | null {
  const trimmed = name.trim();
  const [head = '', ...rest] = trimmed.split(/\s+/);
  const g = nameGender(trimmed);
  if (g === 'm' || g === 'n') return trimmed;
  if (g === 'f' && /a$/.test(head)) return [head.slice(0, -1) + 'u', ...rest].join(' ');
  return null;
}

/** Diagnostic action names its target („Otevřít Myčku“); a long or unclear name → „zařízení“. */
export function openDeviceLabel(name: string): { text: string; aria?: string } {
  const acc = accusativeName(name);
  if (acc && acc.length <= OPEN_NAME_MAX) return { text: `Otevřít ${acc}` };
  // the visible text is generic: the accessible name still says which device
  return { text: 'Otevřít zařízení', aria: `Otevřít zařízení ${name.trim()}` };
}

/** When Porucha can come at the earliest (ms); a fault already reached sorts first. */
function escalationAt(r: Report): number {
  if (r.tier === 'confirmed') return Date.parse(r.reached.confirmed ?? r.since) - 1e15;
  const at = r.earliest.confirmed;
  return at ? Date.parse(at) : Number.POSITIVE_INFINITY;
}

/** Urgency order: soonest escalation to Porucha first, then the higher tier, then the older one. */
export function byUrgency(a: Report, b: Report): number {
  const ea = escalationAt(a);
  const eb = escalationAt(b);
  if (ea !== eb) return ea < eb ? -1 : 1;
  return TIER_RANK[b.tier] - TIER_RANK[a.tier] || Date.parse(a.since) - Date.parse(b.since);
}

/** Affected device names for the summary: „Myčka, Čidlo ve sklepě a Klima obývák“ / „…a 2 další“. */
export function affectedNames(reports: Report[]): string {
  const names: string[] = [];
  for (const r of reports.slice().sort(byUrgency))
    for (const d of r.devices) if (!names.includes(d.name)) names.push(d.name);
  if (!names.length) return '';
  if (names.length <= 3)
    return names.length === 1 ? names[0]! : `${names.slice(0, -1).join(', ')} a ${names.at(-1)}`;
  const more = names.length - 3;
  return `${names.slice(0, 3).join(', ')} a ${more}${NB}${plural(more, 'další', 'další', 'dalších')}`;
}

/** Devices of the open reports (distinct): „3 z 12 zařízení s upozorněním“. */
export function affectedInventory(reports: Report[], watched: { devices: number }): string {
  const ids = new Set(reports.flatMap((r) => r.devices.map((d) => d.id ?? d.name)));
  return `${ids.size} z ${devicesCount(watched.devices)} s${NB}upozorněním`;
}

/** Stepper detail per tier: when it was reached, the earliest time it can come, or why not. */
export function stepDetail(r: Report, tier: TierKey): string {
  const reached = r.reached[tier];
  if (reached) return hm(reached);
  const earliest = r.earliest[tier];
  if (earliest) return `nejdříve ${atTime(earliest)}`;
  return r.findings[0]?.detector === 'baseline'
    ? 'až při extrémní hodnotě'
    : 'podle dalšího vývoje';
}

export type Glyph =
  | 'dishwasher'
  | 'thermo'
  | 'drop'
  | 'sensorOff'
  | 'snow'
  | 'bolt'
  | 'washer'
  | 'door'
  | 'window'
  | 'bulb'
  | 'plug'
  | 'shield'
  | 'pulse'
  | 'phone'
  | 'wifi'
  | 'arrow'
  | 'home';

const CLASS_GLYPH: Record<string, Glyph> = {
  temperature: 'thermo',
  humidity: 'drop',
  moisture: 'drop',
  power: 'bolt',
  energy: 'bolt',
  current: 'bolt',
  voltage: 'bolt',
  door: 'door',
  garage_door: 'door',
  opening: 'door',
  window: 'window',
};
const DOMAIN_GLYPH: Record<string, Glyph> = {
  light: 'bulb',
  switch: 'plug',
  climate: 'thermo',
  lock: 'door',
  cover: 'window',
};

export function glyphFor(deviceClass: string | null | undefined, domain?: string): Glyph {
  return (deviceClass && CLASS_GLYPH[deviceClass]) || (domain && DOMAIN_GLYPH[domain]) || 'pulse';
}

export function reportGlyph(r: Report): Glyph {
  if (r.scope !== 'device') return 'wifi';
  const top = r.findings[0];
  if (!top) return 'pulse';
  if (SILENT.has(top.detector) && !wholeDevice(r)) return 'sensorOff';
  if (SILENT.has(top.detector)) return 'pulse';
  return glyphFor(top.device_class, top.domain);
}

/** Headline of the whole page / Dnes card state. */
export function overview(counts: Record<TierKey, number>): {
  title: string;
  sub: string;
  tone: TierKey | 'ok';
} {
  const { confirmed, suspicion, observation } = counts;
  if (confirmed)
    return {
      title: `${confirmed}${NB}${plural(confirmed, 'porucha', 'poruchy', 'poruch')}`,
      sub: [
        suspicion && `${suspicion}${NB}podezření`,
        observation && `${observation}${NB}pozorování`,
      ]
        .filter(Boolean)
        .join(' · '),
      tone: 'confirmed',
    };
  if (suspicion)
    return {
      title: `${suspicion}${NB}podezření`,
      sub: 'Další vývoj se sleduje',
      tone: 'suspicion',
    };
  if (observation)
    return {
      title: `${observation}${NB}pozorování`,
      sub: 'Změny se zatím vyhodnocují',
      tone: 'observation',
    };
  return { title: 'Vše v pořádku', sub: 'Nic neobvyklého za posledních 24 h', tone: 'ok' };
}

/** „1 porucha“, „3 podezření“, „2 pozorování“: count of one tier (kiosk pill). */
export function tierCount(counts: Record<TierKey, number>, tier: TierKey): string {
  const n = counts[tier];
  if (tier === 'confirmed') return `${n}${NB}${plural(n, 'porucha', 'poruchy', 'poruch')}`;
  return `${n}${NB}${tier === 'suspicion' ? 'podezření' : 'pozorování'}`;
}

export function inventory(watched: { devices: number }): string {
  return `Hlídáno ${devicesCount(watched.devices)}`;
}

/** What „Vyřešeno“ does, as a caption under that button (owner: say it in the UI). */
export const RESOLVED_HINT = `Když potíž po označení „Vyřešeno“ trvá, za 2${NB}h se upozornění vrátí.`;
/** The same after it was pressed (hidden list). */
export const RESOLVED_DONE = `Vyřešeno. Pokud potíž trvá, za 2${NB}h se upozornění vrátí.`;

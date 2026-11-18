/**
 * Czech copy of Hlídání domu. The backend only sends structure; every sentence is built here so
 * the wording rules are in one tested place:
 *
 * - a headline never contradicts the detail: when the same device still reports another value,
 *   the headline names only what is missing („Čidlo ve sklepě nehlásí vlhkost“);
 * - every outage time is anchored to the **last report** („mlčí od 7:55 · 2 h 45 min“), the same
 *   instant on the card, the Dnes tile and the timeline;
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
    return silent.length > 1
      ? `${device} nehlásí ${values(r.entity_count)}`
      : `${device} nehlásí ${what(top)}`;
  }
  if (top.detector === 'baseline') {
    const up = (top.detail.z ?? 0) > 0;
    const pair = top.device_class ? WARM_COLD[top.device_class] : undefined;
    if (pair) return `${device}: ${up ? pair[0] : pair[1]}`;
    const q = quantity(top);
    if (q) return `${device} hlásí neobvykle ${up ? HIGH[q.g] : LOW[q.g]} ${q.acc}`;
    return `${device}: neobvyklá hodnota „${top.name}“`;
  }
  if (top.detector === 'flapping') {
    return top.detail.what === 'availability'
      ? `${device} opakovaně vypadává`
      : `${top.name} se neobvykle často přepíná`;
  }
  // dwell
  return `${top.name}: ${dwellVerb(top)} déle než obvykle`;
}

function dwellVerb(f: Finding): string {
  if (f.domain === 'light') return 'svítí';
  if (['door', 'garage_door', 'window', 'opening'].includes(f.device_class ?? ''))
    return 'otevřeno';
  return 'zapnuto';
}

/** One line under the headline: what, since when (last report), how long. */
export function meta(r: Report, now: Date | string): string {
  const nowMs = new Date(now).getTime();
  if (r.scope === 'integration') {
    const last = lastReport(r);
    const tail = last
      ? ` · mlčí od${NB}${hm(last)} · ${dur((nowMs - Date.parse(last)) / 60_000)}`
      : '';
    return `Společná integrace${r.integration ? ` ${r.integration}` : ''} · ${devicesCount(r.devices.length)}${tail}`;
  }
  if (r.scope === 'system') return `Od${NB}${hm(r.since)}`;
  const top = r.findings[0];
  if (!top) return '';
  if (SILENT.has(top.detector)) {
    const last = lastReport(r)!;
    const since = `od${NB}${hm(last)} · ${dur((nowMs - Date.parse(last)) / 60_000)}`;
    if (wholeDevice(r)) {
      const n = r.entity_count;
      return `${n >= 5 ? 'Všech' : 'Všechny'} ${values(n)} mlčí ${since}`;
    }
    const silent = silentFindings(r);
    if (top.detector === 'unavailable' && silent.length === 1) {
      const adj = { m: 'nedostupný', f: 'nedostupná', n: 'nedostupné' }[quantity(top)?.g ?? 'f'];
      return `${cap(what(top, 'nom'))} je ${adj} ${since}`;
    }
    return silent.length > 1
      ? `${cap(values(r.entity_count))} mlčí ${since}`
      : `${cap(what(top, 'nom'))} mlčí ${since}`;
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

/** Why it matters / what to check (one or two sentences). */
export function why(r: Report): string {
  if (r.scope === 'integration')
    return 'Zkontrolujte společnou bránu nebo připojení integrace v Home Assistantu.';
  if (r.scope === 'system') return 'Zkontrolujte připojení sítě a stav Home Assistantu.';
  const top = r.findings[0];
  if (!top) return '';
  if (SILENT.has(top.detector)) {
    if (wholeDevice(r)) return 'Zkontrolujte napájení a připojení zařízení.';
    const still = r.reporting[0];
    if (still) {
      const other = still.device_class && QUANTITY[still.device_class];
      const lead = other ? cap(other.nom) : `Hodnota „${still.name}“`;
      return `${lead} ze stejného zařízení přichází dál, chybí jen ${what(top)}.`;
    }
    return top.detector === 'unavailable'
      ? 'Home Assistant ji hlásí jako nedostupnou. Zkontrolujte zařízení a jeho integraci.'
      : 'Zkontrolujte baterii, napájení nebo dosah signálu.';
  }
  if (top.detector === 'baseline') {
    if (top.tier === 'observation')
      return 'Hodnota vybočila z obvyklého rozmezí pro tuto denní dobu.';
    if (top.detail.seen_before !== false) {
      const q = quantity(top);
      const like = q
        ? `${q.g === 'f' ? 'Takovou' : q.g === 'm' ? 'Takový' : 'Takové'} ${q.acc}`
        : 'Takovou hodnotu';
      return `Odchylka trvá déle než 30${NB}minut. ${like} už jsem tu v posledních týdnech naměřil, proto to zatím není porucha.`;
    }
    return 'Hodnota je mimo vše, co jsem tu za poslední tři týdny naměřil.';
  }
  if (top.detector === 'flapping')
    return top.detail.what === 'availability'
      ? 'Zařízení se opakovaně odpojuje. Zkontrolujte signál nebo napájení.'
      : 'Stav se mění mnohem častěji než obvykle. Může jít o vadný kontakt nebo opakující se automatizaci.';
  return dwellVerb(top) === 'otevřeno'
    ? 'Zkontrolujte, jestli se nezapomnělo zavřít.'
    : 'Zkontrolujte, jestli se nezapomnělo vypnout.';
}

/** Stepper detail per tier: when it was reached, the earliest time it can come, or why not. */
export function stepDetail(r: Report, tier: TierKey): string {
  const reached = r.reached[tier];
  if (reached) return hm(reached);
  const earliest = r.earliest[tier];
  if (earliest) return `nejdřív ${hm(earliest)}`;
  return r.findings[0]?.detector === 'baseline' ? 'jen při extrému' : 'podle vývoje';
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
    return { title: `${suspicion}${NB}podezření`, sub: 'Sleduji další vývoj', tone: 'suspicion' };
  if (observation)
    return {
      title: `${observation}${NB}pozorování`,
      sub: 'Změny zatím vyhodnocuji',
      tone: 'observation',
    };
  return { title: 'Vše v pořádku', sub: 'Nic neobvyklého za posledních 24 h', tone: 'ok' };
}

export function inventory(watched: { devices: number; entities: number }): string {
  return `Hlídám ${devicesCount(watched.devices)} (${values(watched.entities)})`;
}

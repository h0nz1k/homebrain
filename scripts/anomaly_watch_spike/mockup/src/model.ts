import demo from '../anomaly-demo.json';

export type TierKey = 'observation' | 'suspicion' | 'confirmed';
export type StateKey = 'ok' | 'observations' | 'suspicion' | 'confirmed';
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
  | 'moon'
  | 'wifi'
  | 'chart'
  | 'home';

export const TIER_LABEL = {
  observation: 'Pozorování',
  suspicion: 'Podezření',
  confirmed: 'Porucha',
} as const;
export const TIER_TONE = { observation: 'accent', suspicion: 'warn', confirmed: 'crit' } as const;
export const TIERS = Object.keys(TIER_LABEL) as TierKey[];
export const TIER_RANK = { ok: 0, observation: 1, suspicion: 2, confirmed: 3 } as const;

const GLYPHS: Record<string, Glyph> = {
  dev_dishwasher: 'dishwasher',
  dev_freezer: 'snow',
  dev_living_climate: 'thermo',
  dev_bedroom_climate: 'thermo',
  dev_bathroom_climate: 'thermo',
  dev_cellar_climate: 'sensorOff',
  dev_meter: 'bolt',
  dev_washer: 'washer',
  dev_front_door: 'door',
  dev_bedroom_window: 'window',
  dev_kitchen_light: 'bulb',
  dev_aquarium_plug: 'plug',
};

interface Gap {
  last: string;
  since: string;
  interval: number;
}
interface RawReport {
  key: string;
  scope: 'device' | 'integration' | 'system';
  title: string;
  tier: TierKey;
  device_ids: string[];
  entities: string[];
  reached: Partial<Record<TierKey, string>>;
  earliest: Partial<Record<TierKey, string>>;
  gap?: Gap;
  value?: { now: number; usual: number; unit: string };
  phone_at?: string | null;
}
type Health = TierKey | 'ok';
interface RawSnapshot {
  now: string;
  reports: RawReport[];
  health: Health[];
  temperature: { minute: number; value: number }[];
}

export const DEVICES = demo.devices.map((d) => ({ ...d, glyph: GLYPHS[d.id] ?? 'plug' }));
export const USUAL = demo.usual;
export const hm = (value: Date | string) =>
  new Date(value).toLocaleTimeString('cs-CZ', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Europe/Prague',
  });
export const num = (v: number) => v.toLocaleString('cs-CZ', { maximumFractionDigits: 1 });
export function dur(minutes: number) {
  const total = Math.max(0, Math.round(minutes));
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  return [hours && `${hours}\u00a0h`, (rest || !hours) && `${rest}\u00a0min`]
    .filter(Boolean)
    .join(' ');
}
export const values = (n: number) =>
  `${n}\u00a0${n === 1 ? 'hodnota' : n <= 4 ? 'hodnoty' : 'hodnot'}`;

export interface Issue extends RawReport {
  headline: string;
  glyph: Glyph;
  why?: string;
  meta: string;
  /** Absolute start of the anomaly ('od 9:29'), shown next to every duration. */
  from: string;
}

function issue(r: RawReport, now: Date): Issue {
  // Every duration is anchored to the last value the device sent (not the start of the gap).
  const age = r.gap ? (+now - +new Date(r.gap.last)) / 60_000 : 0;
  const first = r.reached.observation ?? r.gap?.last;
  const base: Issue = {
    ...r,
    headline: r.title,
    meta: '',
    glyph: 'wifi',
    from: first ? hm(first) : hm(now),
  };
  if (r.scope === 'integration') {
    return {
      ...base,
      headline: 'Několik zařízení přestalo odpovídat',
      meta: `Společná integrace · ${r.device_ids.length}\u00a0zařízení`,
      why: 'Zkontrolujte společnou bránu nebo připojení integrace v Home Assistantu.',
    };
  }
  if (r.scope === 'system') {
    return {
      ...base,
      headline: 'Většina zařízení přestala odpovídat',
      why: 'Zkontrolujte připojení sítě a stav Home Assistantu.',
    };
  }
  const device = DEVICES.find((d) => d.id === r.device_ids[0]);
  base.glyph = device?.glyph ?? 'pulse';
  if (r.gap) {
    const allSilent = device?.count === r.entities.length && r.entities.length > 1;
    return {
      ...base,
      from: hm(r.gap.last),
      headline:
        r.key === 'device:dev_cellar_climate'
          ? 'Čidlo vlhkosti ve sklepě nejspíš nevysílá'
          : `${device?.name ?? 'Zařízení'} neodpovídá`,
      meta: `${allSilent ? `Všech ${values(r.entities.length)} mlčí` : `${r.entities[0].split(' ')[0]} mlčí`} od\u00a0${hm(r.gap.last)} · ${dur(age)}`,
      why: allSilent
        ? 'Zkontrolujte napájení a připojení zařízení.'
        : 'Teplota ze stejného čidla přichází dál, takže nejspíš vypadla jen tahle hodnota.',
    };
  }
  if (r.value) {
    const { now: current, usual, unit } = r.value;
    return {
      ...base,
      headline: 'V obýváku je neobvykle teplo',
      meta: `${num(current)}\u00a0${unit} · obvykle ${num(usual)}\u00a0${unit} · od\u00a0${base.from}`,
      why:
        r.tier === 'observation'
          ? 'Teplota vybočila z obvyklého rozmezí pro tuto dobu.'
          : 'Vyšší teplota trvá déle. Podobně teplo už v obýváku bývalo.',
    };
  }
  return base;
}

export interface Snapshot {
  now: Date;
  time: string;
  issues: Issue[];
  counts: Record<TierKey, number>;
  watched: number;
  inventory: string;
  health: Health[];
  temperature: RawSnapshot['temperature'];
}

export function snapshot(state: StateKey): Snapshot {
  const raw = demo.states[state] as RawSnapshot;
  const now = new Date(raw.now);
  const issues = raw.reports.map((r) => issue(r, now));
  const counts = { observation: 0, suspicion: 0, confirmed: 0 };
  issues.forEach((i) => counts[i.tier]++);
  const watched = DEVICES.reduce((sum, d) => sum + d.count, 0);
  return {
    now,
    time: hm(now),
    issues,
    counts,
    watched,
    health: raw.health,
    temperature: raw.temperature,
    inventory: `Hlídám ${DEVICES.length}\u00a0zařízení (${values(watched)})`,
  };
}

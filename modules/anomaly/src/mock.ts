/**
 * Synthetic demo house for dev, Vitest and Playwright (no real entity ids, names or places).
 * Mirrors the approved r3 mockup states: `ok`, `observations`, `suspicion`, `confirmed`, plus
 * `learning` (first days after installation). `?anomaly=<scenario>` in the dev server.
 */
import type { AckKind, AnomalyApi } from './api.js';
import type { AnomalySnapshot, Band, Finding, Health, Report, TierKey } from './types.js';

export type AnomalyScenario = 'ok' | 'observations' | 'suspicion' | 'confirmed' | 'learning';
export const ANOMALY_SCENARIOS: AnomalyScenario[] = [
  'ok',
  'observations',
  'suspicion',
  'confirmed',
  'learning',
];

/**
 * One injected clock for the whole page: every time in a scenario is an offset from `now`, so the
 * Dnes clock, „Aktualizováno“ and every duration agree. The default is the Dnes fixture clock
 * (`modules/today` state `a`, 10:40); dev passes the same instant it gives Dnes.
 */
export const MOCK_NOW = '2026-10-31T10:40:00+01:00';
const rel = (now: string, minutes: number) =>
  new Date(Date.parse(now) + minutes * 60_000).toISOString();
/** Minute of the local (Prague) day. */
const minuteOfDay = (iso: string) => {
  const [h, m] = new Intl.DateTimeFormat('cs-CZ', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Europe/Prague',
  })
    .format(new Date(iso))
    .split(':')
    .map(Number);
  return h! * 60 + m!;
};

/** Per scenario: minutes before `now` of the cellar's last report, the dishwasher's last report and
 * the start of the living-room warmth (`null` = report not in the scenario). */
const STORY: Record<
  AnomalyScenario,
  { cellar: number; dishwasher: number; living: number } | null
> = {
  ok: null,
  learning: null,
  observations: { cellar: 100, dishwasher: 0, living: 5 },
  suspicion: { cellar: 165, dishwasher: 71, living: 70 },
  confirmed: { cellar: 235, dishwasher: 141, living: 140 },
};

export const DEMO_DEVICES = [
  { id: 'demo_dev_dishwasher', name: 'Myčka', count: 17, classes: ['power', 'sensor'] },
  { id: 'demo_dev_living', name: 'Klima obývák', count: 2, classes: ['temperature', 'humidity'] },
  { id: 'demo_dev_bedroom', name: 'Klima ložnice', count: 2, classes: ['temperature', 'humidity'] },
  { id: 'demo_dev_bath', name: 'Klima koupelna', count: 2, classes: ['temperature', 'humidity'] },
  {
    id: 'demo_dev_cellar',
    name: 'Čidlo ve sklepě',
    count: 2,
    classes: ['temperature', 'humidity'],
  },
  { id: 'demo_dev_freezer', name: 'Mrazák', count: 1, classes: ['temperature'] },
  { id: 'demo_dev_meter', name: 'Elektroměr', count: 1, classes: ['power'] },
  { id: 'demo_dev_washer', name: 'Pračka', count: 1, classes: ['power'] },
  { id: 'demo_dev_door', name: 'Vstupní dveře', count: 1, classes: ['door'] },
  { id: 'demo_dev_window', name: 'Okno v ložnici', count: 1, classes: ['window'] },
  { id: 'demo_dev_light', name: 'Světlo v kuchyni', count: 1, classes: ['light'] },
  { id: 'demo_dev_plug', name: 'Zásuvka akvária', count: 1, classes: ['switch'] },
];
const WATCHED = { devices: 12, entities: 32, learning: 0, known: 32 };

const DISHWASHER_VALUES = [
  'Příkon',
  'Stav',
  'Program',
  'Fáze programu',
  'Zbývající čas',
  'Konec programu',
  'Dvířka',
  'Sůl',
  'Leštidlo',
  'Dálkové spuštění',
  'Signál Wi-Fi',
  'Spotřeba vody',
  'Spotřeba energie',
  'Teplota vody',
  'Počet cyklů',
  'Odložený start',
  'Chyba',
];

function finding(
  detector: Finding['detector'],
  tier: TierKey,
  since: string,
  name: string,
  deviceClass: string | null,
  detail: Finding['detail'],
  unit: string | null = null,
  slug = name,
): Finding {
  return {
    detector,
    tier,
    since,
    name,
    device_class: deviceClass,
    domain: 'sensor',
    unit,
    detail,
    entity_id: `sensor.demo_${slug.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
  };
}

function reached(r: Partial<Record<TierKey, string>>): Partial<Record<TierKey, string>> {
  return r;
}

function cellar(tier: TierKey, now: string, ago: number): Report {
  const last = rel(now, -ago);
  const at = (minutes: number) => rel(last, minutes);
  const minutes = ago;
  return {
    key: 'device:demo_dev_cellar',
    scope: 'device',
    tier,
    since: at(35),
    reached:
      tier === 'observation'
        ? reached({ observation: at(35) })
        : reached({ observation: at(35), suspicion: at(125) }),
    earliest:
      tier === 'observation' ? { suspicion: at(120), confirmed: at(360) } : { confirmed: at(360) },
    integration: 'demo_zigbee',
    devices: [{ id: 'demo_dev_cellar', name: 'Čidlo ve sklepě', area: 'Sklep', monitored: 2 }],
    entities: [
      { name: 'Vlhkost', device_class: 'humidity', entity_id: 'sensor.demo_cellar_humidity' },
    ],
    entity_count: 1,
    findings: [
      {
        ...finding(
          'silent',
          tier,
          at(35),
          'Vlhkost',
          'humidity',
          { last, interval_s: 600, minutes: Math.round(minutes) },
          '%',
        ),
        entity_id: 'sensor.demo_cellar_humidity',
      },
    ],
    reporting: [{ name: 'Teplota', device_class: 'temperature', domain: 'sensor' }],
    hidden: null,
    ack: null,
    muted_until: null,
  };
}

function usualBand(): ([number, number] | null)[] {
  return Array.from({ length: 24 }, (_, h) => {
    const mid = 20.6 + 1.2 * Math.sin(((h - 9) / 24) * 2 * Math.PI);
    return [Math.round((mid - 1.5) * 100) / 100, Math.round((mid + 1.5) * 100) / 100];
  });
}

function today(now: string, since: string): [number, number][] {
  const end = minuteOfDay(now);
  const rise = minuteOfDay(since) - 30;
  const out: [number, number][] = [];
  for (let m = 2.5; m <= end; m += 5) {
    const base = 20.6 + 1.2 * Math.sin(((m / 60 - 9) / 24) * 2 * Math.PI);
    const warm = m >= rise ? Math.min(7, ((m - rise) / 30) * 7) : 0;
    out.push([m, Math.round((base + warm) * 100) / 100]);
  }
  return out;
}

function living(tier: TierKey, now: string, ago: number): Report {
  const since = rel(now, -ago);
  const at = (minutes: number) => rel(since, minutes);
  const band: Band = { unit: '°C', usual: usualBand(), today: today(now, since) };
  const value = band.today.at(-1)?.[1] ?? 27;
  return {
    key: 'device:demo_dev_living',
    scope: 'device',
    tier,
    since: at(0),
    reached:
      tier === 'observation' ? { observation: at(0) } : { observation: at(0), suspicion: at(30) },
    earliest: tier === 'observation' ? { suspicion: at(30) } : {},
    integration: 'demo_zigbee',
    devices: [{ id: 'demo_dev_living', name: 'Klima obývák', area: 'Obývák', monitored: 2 }],
    entities: [
      { name: 'Teplota', device_class: 'temperature', entity_id: 'sensor.demo_living_temperature' },
    ],
    entity_count: 1,
    findings: [
      {
        ...finding(
          'baseline',
          tier,
          at(0),
          'Teplota',
          'temperature',
          { value, usual: 20.5, z: 4.6, seen_before: true },
          '°C',
        ),
        entity_id: 'sensor.demo_living_temperature',
      },
    ],
    reporting: [{ name: 'Vlhkost', device_class: 'humidity', domain: 'sensor' }],
    hidden: null,
    ack: null,
    muted_until: null,
    band,
  };
}

function dishwasher(tier: TierKey, now: string, ago: number): Report {
  const last = rel(now, -ago);
  const at = (minutes: number) => rel(last, minutes);
  return {
    key: 'device:demo_dev_dishwasher',
    scope: 'device',
    tier,
    since: at(26),
    reached:
      tier === 'confirmed'
        ? { observation: at(26), suspicion: at(56), confirmed: at(111) }
        : { observation: at(26), suspicion: at(56) },
    earliest: tier === 'confirmed' ? {} : { confirmed: at(111) },
    integration: 'demo_appliance',
    devices: [{ id: 'demo_dev_dishwasher', name: 'Myčka', area: 'Kuchyně', monitored: 17 }],
    entities: DISHWASHER_VALUES.map((name, i) => ({
      name,
      device_class: i === 0 ? 'power' : null,
      entity_id: `sensor.demo_dishwasher_${i + 1}`,
    })),
    entity_count: 17,
    findings: DISHWASHER_VALUES.map((name, i) => ({
      ...finding('silent', tier, at(26), name, i === 0 ? 'power' : null, {
        last,
        interval_s: 600,
      }),
      entity_id: `sensor.demo_dishwasher_${i + 1}`,
    })),
    reporting: [],
    hidden: null,
    ack: null,
    muted_until: null,
  };
}

function health(scenario: AnomalyScenario): Health[] {
  const strip: Health[] = Array.from({ length: 24 }, () => 'ok');
  const tail: Record<AnomalyScenario, Health[]> = {
    ok: [],
    learning: [],
    observations: ['observation', 'observation'],
    suspicion: ['observation', 'observation', 'suspicion'],
    confirmed: ['observation', 'observation', 'suspicion', 'confirmed'],
  };
  strip.splice(24 - tail[scenario].length, tail[scenario].length, ...tail[scenario]);
  return strip;
}

/** Full (`list`) snapshot of a scenario. */
export function mockAnomalySnapshot(
  scenario: AnomalyScenario = 'confirmed',
  now: string = MOCK_NOW,
): AnomalySnapshot {
  const story = STORY[scenario];
  const reports: Report[] = !story
    ? []
    : scenario === 'observations'
      ? [cellar('observation', now, story.cellar), living('observation', now, story.living)]
      : scenario === 'suspicion'
        ? [
            cellar('suspicion', now, story.cellar),
            living('suspicion', now, story.living),
            dishwasher('suspicion', now, story.dishwasher),
          ]
        : [
            dishwasher('confirmed', now, story.dishwasher),
            cellar('suspicion', now, story.cellar),
            living('suspicion', now, story.living),
          ];
  const counts = { observation: 0, suspicion: 0, confirmed: 0 };
  for (const r of reports) counts[r.tier] += 1;
  const learning = scenario === 'learning';
  return {
    now,
    ready: !learning,
    learning,
    learned_at: learning ? null : rel(now, -minuteOfDay(now) + 210),
    watched: learning ? { devices: 0, entities: 0, learning: 32, known: 32 } : WATCHED,
    counts,
    reports,
    health: health(scenario),
    devices: learning ? [] : DEMO_DEVICES,
    resolved_7d: scenario === 'ok' ? 2 : 0,
  };
}

/** Kiosk (`summary`) view: no entity or device ids, hidden reports dropped. */
export function toSummary(full: AnomalySnapshot): AnomalySnapshot {
  return {
    now: full.now,
    ready: full.ready,
    learning: full.learning,
    learned_at: full.learned_at,
    watched: full.watched,
    counts: full.counts,
    reports: full.reports
      .filter((r) => r.hidden === null)
      .map((r, i) => ({
        ...r,
        key: `${r.scope}:${i}`,
        devices: r.devices.map(({ name, area, monitored }) => ({ name, area, monitored })),
        entities: r.entities.map(({ name, device_class }) => ({ name, device_class })),
        findings: r.findings.map((f) => {
          const copy = { ...f };
          delete copy.entity_id;
          return copy;
        }),
        ack: undefined,
        muted_until: undefined,
        band: undefined,
      })),
  };
}

/** In-memory API: acknowledgements and mutes hide reports like the integration does. */
export function createMockAnomalyApi(
  opts: { scenario?: AnomalyScenario; now?: string; delayMs?: number; fail?: boolean } = {},
): AnomalyApi & { calls: string[] } {
  const snap = mockAnomalySnapshot(opts.scenario ?? 'confirmed', opts.now);
  const calls: string[] = [];
  const wait = <T>(v: T) =>
    new Promise<T>((resolve, reject) =>
      setTimeout(
        () => (opts.fail ? reject(new Error('Hlídání domu neodpovídá')) : resolve(v)),
        opts.delayMs ?? 0,
      ),
    );
  const recount = () => {
    const counts = { observation: 0, suspicion: 0, confirmed: 0 };
    for (const r of snap.reports) if (r.hidden === null) counts[r.tier] += 1;
    snap.counts = counts;
  };
  const find = (key: string) => snap.reports.find((r) => r.key === key);
  return {
    calls,
    list: () => wait(structuredClone(snap)),
    summary: () => wait(toSummary(structuredClone(snap))),
    async ack(key: string, kind: AckKind) {
      calls.push(`ack:${kind}:${key}`);
      const r = find(key);
      if (r) Object.assign(r, { hidden: 'acked', ack: kind });
      recount();
      await wait(undefined);
    },
    async mute(key: string, days = 7) {
      calls.push(`mute:${days}:${key}`);
      const r = find(key);
      if (r) {
        const until = new Date(Date.parse(snap.now) + days * 86_400_000).toISOString();
        Object.assign(r, { hidden: 'muted', muted_until: until });
      }
      recount();
      await wait(undefined);
    },
    async unmute(key: string) {
      calls.push(`unmute:${key}`);
      const r = find(key);
      if (r) Object.assign(r, { hidden: null, muted_until: null });
      recount();
      await wait(undefined);
    },
  };
}

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  RESOLVED_DONE,
  RESOLVED_HINT,
  accusativeName,
  affectedInventory,
  affectedNames,
  atTime,
  byUrgency,
  nameGender,
  nextStep,
  openDeviceLabel,
  tierCount,
  dur,
  inventory,
  roomLocative,
  rowDetail,
  sinceLast,
  headline,
  hm,
  lastReport,
  meta,
  outageMinutes,
  overview,
  stepDetail,
  values,
  why,
  wholeDevice,
} from './copy.js';
import { MOCK_NOW, mockAnomalySnapshot } from './mock.js';
import type { Report } from './types.js';

const plain = (s: string) => s.replace(/\u00a0/g, ' ');
const report = (scenario: Parameters<typeof mockAnomalySnapshot>[0], key: string): Report => {
  const r = mockAnomalySnapshot(scenario).reports.find((x) => x.key === key);
  if (!r) throw new Error(key);
  return r;
};

describe('copy – headlines never contradict the detail', () => {
  it('a sensor that still sends temperature „přestalo posílat vlhkost“ (not „nehlásí vlhkost“)', () => {
    const r = report('suspicion', 'device:demo_dev_cellar');
    expect(r.reporting.map((x) => x.device_class)).toEqual(['temperature']);
    expect(wholeDevice(r)).toBe(false);
    // „nehlásí vlhkost“ can be read as „it is not damp“: say that data stopped coming
    expect(headline(r)).toBe('Čidlo ve sklepě přestalo posílat vlhkost');
    expect(headline(r)).not.toMatch(/nevysílá|neodpovídá|nehlásí/);
    expect(plain(why(r, MOCK_NOW))).toBe(
      'Teplota ze stejného zařízení přichází dál, chybí jen vlhkost.',
    );
  });

  it('a whole silent device „neodpovídá“, „Neposílá žádné údaje“, the count only in the detail', () => {
    const r = report('confirmed', 'device:demo_dev_dishwasher');
    expect(wholeDevice(r)).toBe(true);
    expect(headline(r)).toBe('Myčka neodpovídá');
    expect(plain(meta(r, MOCK_NOW))).toBe(
      'Neposílá žádné údaje · 2 h 21 min od posledního hlášení (8:19)',
    );
    expect(plain(meta(r, MOCK_NOW))).not.toMatch(/17|mlčí/);
    expect(plain(why(r, MOCK_NOW))).toBe('Chybí všech 17 hodnot zařízení.');
  });

  it('baseline: the room in the locative, the real duration (not „déle než 30 minut“)', () => {
    const r = report('suspicion', 'device:demo_dev_living');
    expect(headline(r)).toBe('V obýváku je neobvykle teplo');
    const text = plain(why(r, MOCK_NOW));
    expect(text).not.toMatch(/Podobně teplo|bývalo|déle než 30|jsem|naměřil/);
    expect(text).toBe(
      'Odchylka trvá 1 h 10 min. Takové hodnoty tu v posledních týdnech už byly, proto to zatím není porucha.',
    );
    expect(plain(why(report('confirmed', 'device:demo_dev_living'), MOCK_NOW))).toMatch(
      /^Odchylka trvá 2 h 20 min\. /,
    );
    const obs = report('observations', 'device:demo_dev_living');
    expect(why(obs, MOCK_NOW)).toBe('Hodnota vybočila z obvyklého rozmezí pro tuto denní dobu.');
    // unknown room: a sentence with the device name instead of a broken locative
    const noRoom = { ...r, devices: [{ ...r.devices[0]!, area: 'Zimní zahrada' }] };
    expect(headline(noRoom)).toBe('Klima obývák hlásí neobvykle vysokou teplotu');
  });

  it('room locatives', () => {
    expect(roomLocative('Obývák')).toBe('v obýváku');
    expect(roomLocative('sklep')).toBe('ve sklepě');
    expect(roomLocative('Chodba')).toBe('na chodbě');
    expect(roomLocative(null)).toBeNull();
  });

  it('impersonal voice everywhere (no „hlídám, ukážu, naměřil, přidám“)', () => {
    const first = /\b(hlídám|ukážu|naměřil|přidám|sleduji|vyhodnocuji|učím|posílám|jsem)\b/i;
    for (const scenario of ['observations', 'suspicion', 'confirmed'] as const) {
      const snap = mockAnomalySnapshot(scenario);
      for (const r of snap.reports)
        for (const text of [
          headline(r),
          meta(r, snap.now),
          why(r, snap.now),
          rowDetail(r, snap.now),
        ])
          expect(text).not.toMatch(first);
      expect(overview(snap.counts).sub).not.toMatch(first);
    }
    expect(plain(inventory({ devices: 12 }))).toBe('Hlídáno 12 zařízení');
  });

  it('other detectors and scopes read as sentences', () => {
    const base = report('suspicion', 'device:demo_dev_cellar');
    const top = base.findings[0]!;
    const variant = (detector: Report['findings'][0]['detector'], extra = {}): Report => ({
      ...base,
      findings: [{ ...top, ...extra, detector }],
    });
    expect(headline(variant('flapping', { detail: { what: 'availability', count: 5 } }))).toBe(
      'Čidlo ve sklepě opakovaně vypadává',
    );
    expect(
      headline(
        variant('dwell', { name: 'Vstupní dveře', device_class: 'door', domain: 'binary_sensor' }),
      ),
    ).toBe('Vstupní dveře: otevřeno déle než obvykle');
    expect(headline(variant('baseline', { device_class: 'power', detail: { z: 7 } }))).toBe(
      'Čidlo ve sklepě hlásí neobvykle vysoký příkon',
    );
    expect(headline({ ...base, scope: 'integration', devices: [] })).toBe(
      'Několik zařízení přestalo odpovídat',
    );
    expect(headline({ ...base, scope: 'system' })).toBe('Většina zařízení přestala odpovídat');
  });

  it('„přestal/a/o posílat“ agrees with the device name; unclear names get a neutral form', () => {
    expect(nameGender('Čidlo ve sklepě')).toBe('n');
    expect(nameGender('Klima obývák')).toBe('n');
    expect(nameGender('Myčka')).toBe('f');
    expect(nameGender('Teploměr na balkoně')).toBe('m');
    expect(nameGender('ESP32 sklep')).toBeNull();
    const base = report('suspicion', 'device:demo_dev_cellar');
    const named = (name: string): Report => ({
      ...base,
      devices: [{ ...base.devices[0]!, name }],
    });
    expect(headline(named('Teploměr na balkoně'))).toBe(
      'Teploměr na balkoně přestal posílat vlhkost',
    );
    expect(headline(named('Lednice'))).toBe('Lednice přestala posílat vlhkost');
    expect(headline(named('ESP32 sklep'))).toBe('ESP32 sklep: přestaly chodit údaje (vlhkost)');
  });
});

describe('copy – r3: one concrete next step per card, from the kind of anomaly', () => {
  it('missing humidity while temperature still arrives → battery or range of the sensor', () => {
    expect(nextStep(report('suspicion', 'device:demo_dev_cellar'))).toBe(
      'Zkontrolujte baterii nebo dosah čidla.',
    );
  });
  it('unusually warm → heating, window or sun; cold and other quantities differ', () => {
    const warm = report('suspicion', 'device:demo_dev_living');
    expect(nextStep(warm)).toBe('Zkontrolujte topení, okno nebo přímé slunce.');
    const top = warm.findings[0]!;
    const cold = { ...warm, findings: [{ ...top, detail: { ...top.detail, z: -4 } }] };
    expect(nextStep(cold)).toBe('Zkontrolujte topení, okno nebo dveře.');
    const damp = { ...warm, findings: [{ ...top, device_class: 'humidity' }] };
    expect(nextStep(damp)).toBe('Zkontrolujte větrání nebo únik vody.');
  });
  it('a silent device keeps its step (power and connection)', () => {
    expect(nextStep(report('confirmed', 'device:demo_dev_dishwasher'))).toBe(
      'Zkontrolujte napájení a připojení zařízení.',
    );
  });
  it('the step comes from the kind, not the device: renaming changes nothing', () => {
    const r = report('suspicion', 'device:demo_dev_cellar');
    const renamed = { ...r, devices: [{ ...r.devices[0]!, name: 'Cokoliv', area: null }] };
    expect(nextStep(renamed)).toBe(nextStep(r));
  });
  it('every card of every scenario has exactly one step, and „why“ has no instruction', () => {
    for (const scenario of ['observations', 'suspicion', 'confirmed'] as const) {
      const snap = mockAnomalySnapshot(scenario);
      for (const r of snap.reports) {
        expect(nextStep(r)).toMatch(/^(Zkontrolujte|Vyvětrejte) .+\.$/);
        expect(why(r, snap.now)).not.toMatch(/Zkontrolujte/);
      }
    }
  });
});

describe('copy – r3: the diagnostic button names its target', () => {
  it('„Otevřít Klima obývák“, „Otevřít Myčku“ (accusative)', () => {
    expect(openDeviceLabel('Klima obývák')).toEqual({ text: 'Otevřít Klima obývák' });
    expect(openDeviceLabel('Myčka')).toEqual({ text: 'Otevřít Myčku' });
    expect(accusativeName('Zásuvka akvária')).toBe('Zásuvku akvária');
  });
  it('a long or unclear name → „Otevřít zařízení“, the name stays in the accessible name', () => {
    expect(openDeviceLabel('Čidlo teploty a vlhkosti v garáži')).toEqual({
      text: 'Otevřít zařízení',
      aria: 'Otevřít zařízení Čidlo teploty a vlhkosti v garáži',
    });
    expect(openDeviceLabel('Chytrá zásuvka').text).toBe('Otevřít zařízení');
  });
});

describe('copy – r3: urgency order and the summary', () => {
  it('soonest escalation to Porucha first, then the tier', () => {
    const order = (s: Parameters<typeof mockAnomalySnapshot>[0]) =>
      mockAnomalySnapshot(s)
        .reports.slice()
        .sort(byUrgency)
        .map((r) => r.devices[0]!.name);
    // suspicion: dishwasher can become Porucha at 11:20, the cellar at 13:55, the warmth only
    // at an extreme value (never by time)
    expect(order('suspicion')).toEqual(['Myčka', 'Čidlo ve sklepě', 'Klima obývák']);
    // a fault already reached comes first
    expect(order('confirmed')[0]).toBe('Myčka');
  });
  it('affected device names: up to 3, then „a N dalších“', () => {
    const reports = mockAnomalySnapshot('suspicion').reports;
    expect(affectedNames(reports)).toBe('Myčka, Čidlo ve sklepě a Klima obývák');
    const extra = (name: string, i: number): Report => ({
      ...reports[0]!,
      key: `x${i}`,
      tier: 'observation',
      earliest: {},
      devices: [{ name, monitored: 1, id: `x${i}` }],
    });
    const many = [...reports, ...['A', 'B', 'C', 'D', 'E'].map(extra)];
    expect(plain(affectedNames(many))).toBe('Myčka, Čidlo ve sklepě, Klima obývák a 5 dalších');
    expect(plain(affectedNames([...reports, extra('A', 1)]))).toBe(
      'Myčka, Čidlo ve sklepě, Klima obývák a 1 další',
    );
    expect(plain(affectedInventory(reports, { devices: 12 }))).toBe(
      '3 z 12 zařízení s upozorněním',
    );
    expect(plain(tierCount({ observation: 0, suspicion: 3, confirmed: 0 }, 'suspicion'))).toBe(
      '3 podezření',
    );
    expect(plain(tierCount({ observation: 0, suspicion: 2, confirmed: 1 }, 'confirmed'))).toBe(
      '1 porucha',
    );
  });
});

/**
 * r3: „hlášení“ only for a report of a sensor („od posledního hlášení“, „Chybí 16 hlášení“);
 * every alert of this app is „upozornění“. Scans the module sources and the strings they build.
 */
describe('copy – r3: „hlášení“ only for sensor reports, alerts are „upozornění“', () => {
  const SENSOR = [
    /od(\s|\$\{NB\}|&nbsp;)+posledního\s+hlášení/,
    /Chybí\s+(\{missing\}|\d+)(&nbsp;|\s)hlášení/,
  ];
  const allowed = (line: string, at: number) =>
    SENSOR.some((re) => {
      for (const m of line.matchAll(new RegExp(re, 'g')))
        if (at >= m.index && at < m.index + m[0].length) return true;
      return false;
    });
  const files = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory()
        ? files(join(dir, e.name))
        : /\.tsx?$/.test(e.name) && !/\.test\./.test(e.name)
          ? [join(dir, e.name)]
          : [],
    );
  it('module sources (UI strings and comments)', () => {
    const bad: string[] = [];
    for (const file of files(__dirname))
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          // comments may name the rule itself („hlášení“ in quotes)
          const code = line.replace(/„hlášení“|\/\/.*$|^\s*\*.*$/g, '');
          for (const m of code.matchAll(/hlášení/g))
            if (!allowed(code, m.index)) bad.push(`${file}:${i + 1}: ${line.trim()}`);
        });
    expect(bad).toEqual([]);
  });
  it('built strings', () => {
    expect(plain(RESOLVED_HINT)).toBe(
      'Když potíž po označení „Vyřešeno“ trvá, za 2 h se upozornění vrátí.',
    );
    expect(plain(RESOLVED_DONE)).toBe('Vyřešeno. Pokud potíž trvá, za 2 h se upozornění vrátí.');
    for (const scenario of ['observations', 'suspicion', 'confirmed'] as const) {
      const snap = mockAnomalySnapshot(scenario);
      for (const r of snap.reports)
        for (const text of [headline(r), meta(r, snap.now), why(r, snap.now), nextStep(r)])
          for (const m of plain(text).matchAll(/hlášení/g))
            expect(allowed(plain(text), m.index), text).toBe(true);
    }
  });
});

describe('copy – outage times: „… od posledního hlášení (h:mm)“ everywhere', () => {
  const OUTAGE = /^(.* · )?\d+ (h|min)( \d+ min)? od posledního hlášení \(\d{1,2}:\d{2}\)$/;
  for (const [scenario, key, expected] of [
    ['observations', 'device:demo_dev_cellar', '1 h 40 min od posledního hlášení (9:00)'],
    ['suspicion', 'device:demo_dev_cellar', '2 h 45 min od posledního hlášení (7:55)'],
    [
      'suspicion',
      'device:demo_dev_dishwasher',
      'Neposílá žádné údaje · 1 h 11 min od posledního hlášení (9:29)',
    ],
    [
      'confirmed',
      'device:demo_dev_dishwasher',
      'Neposílá žádné údaje · 2 h 21 min od posledního hlášení (8:19)',
    ],
  ] as const) {
    it(`${scenario} ${key}`, () => {
      const snap = mockAnomalySnapshot(scenario);
      const r = report(scenario, key);
      const last = lastReport(r)!;
      expect(last).toBe(r.findings[0]!.detail.last);
      const line = plain(meta(r, snap.now));
      expect(line).toBe(expected);
      expect(line).toMatch(OUTAGE);
      // the clock time is the last report, never the first observation or tier change
      expect(line).toContain(`(${hm(last)})`);
      expect(line).not.toContain(hm(r.since));
      // the duration is now − last report
      expect(line).toContain(plain(dur(outageMinutes(r, snap.now)!)));
      // the suspicion row on Dnes says the same
      expect(plain(rowDetail(r, snap.now))).toBe(plain(sinceLast(last, snap.now)));
    });
  }
  it('the duration follows the caller’s clock (Dnes passes its own „now“)', () => {
    const r = report('suspicion', 'device:demo_dev_cellar');
    const later = new Date(Date.parse(MOCK_NOW) + 15 * 60_000).toISOString();
    expect(plain(meta(r, later))).toBe('3 h od posledního hlášení (7:55)');
  });
});

describe('copy – helpers', () => {
  it('Czech plurals incl. zero', () => {
    expect(plain(values(0))).toBe('0 hodnot');
    expect(plain(values(1))).toBe('1 hodnota');
    expect(plain(values(3))).toBe('3 hodnoty');
    expect(plain(values(17))).toBe('17 hodnot');
  });
  it('durations', () => {
    expect(plain(dur(45))).toBe('45 min');
    expect(plain(dur(141))).toBe('2 h 21 min');
    expect(plain(dur(180))).toBe('3 h');
  });
  it('stepper explains future tiers („Porucha nejdříve ve 13:55“)', () => {
    const r = report('suspicion', 'device:demo_dev_cellar');
    expect(stepDetail(r, 'observation')).toBe('8:30');
    expect(plain(stepDetail(r, 'confirmed'))).toBe('nejdříve ve 13:55');
    const warm = report('suspicion', 'device:demo_dev_living');
    expect(stepDetail(warm, 'confirmed')).toBe('až při extrémní hodnotě');
  });
  it('v / ve before a time', () => {
    expect(plain(atTime('2026-10-31T09:55:00+01:00'))).toBe('v 9:55');
    expect(plain(atTime('2026-10-31T13:55:00+01:00'))).toBe('ve 13:55');
    expect(plain(atTime('2026-10-31T21:00:00+01:00'))).toBe('ve 21:00');
    expect(plain(atTime('2026-10-31T11:00:00+01:00'))).toBe('v 11:00');
  });
  it('page headline', () => {
    expect(plain(overview({ observation: 0, suspicion: 2, confirmed: 1 }).title)).toBe('1 porucha');
    expect(plain(overview({ observation: 0, suspicion: 2, confirmed: 1 }).sub)).toBe('2 podezření');
    expect(overview({ observation: 0, suspicion: 0, confirmed: 0 }).title).toBe('Vše v pořádku');
  });
});

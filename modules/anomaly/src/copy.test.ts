import { describe, expect, it } from 'vitest';
import {
  dur,
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
import { mockAnomalySnapshot } from './mock.js';
import type { Report } from './types.js';

const plain = (s: string) => s.replace(/\u00a0/g, ' ');
const report = (scenario: Parameters<typeof mockAnomalySnapshot>[0], key: string): Report => {
  const r = mockAnomalySnapshot(scenario).reports.find((x) => x.key === key);
  if (!r) throw new Error(key);
  return r;
};

describe('copy – headlines never contradict the detail', () => {
  it('a sensor that still sends temperature „nehlásí vlhkost“ (not „nevysílá“)', () => {
    const r = report('suspicion', 'device:demo_dev_cellar');
    expect(r.reporting.map((x) => x.device_class)).toEqual(['temperature']);
    expect(wholeDevice(r)).toBe(false);
    expect(headline(r)).toBe('Čidlo ve sklepě nehlásí vlhkost');
    expect(headline(r)).not.toMatch(/nevysílá|neodpovídá/);
    expect(plain(why(r))).toBe('Teplota ze stejného zařízení přichází dál, chybí jen vlhkost.');
  });

  it('a whole silent device „neodpovídá“ and counts all its values', () => {
    const r = report('confirmed', 'device:demo_dev_dishwasher');
    expect(wholeDevice(r)).toBe(true);
    expect(headline(r)).toBe('Myčka neodpovídá');
    expect(plain(meta(r, mockAnomalySnapshot('confirmed').now))).toBe(
      'Všech 17 hodnot mlčí od 9:29 · 2 h 21 min',
    );
    expect(why(r)).toBe('Zkontrolujte napájení a připojení zařízení.');
  });

  it('baseline: natural Czech, no „Podobně teplo už bývalo“', () => {
    const r = report('suspicion', 'device:demo_dev_living');
    expect(headline(r)).toBe('Klima obývák: neobvykle teplo');
    const text = plain(why(r));
    expect(text).not.toMatch(/Podobně teplo|bývalo/);
    expect(text).toBe(
      'Odchylka trvá déle než 30 minut. Takovou teplotu už jsem tu v posledních týdnech naměřil, proto to zatím není porucha.',
    );
    const obs = report('observations', 'device:demo_dev_living');
    expect(why(obs)).toBe('Hodnota vybočila z obvyklého rozmezí pro tuto denní dobu.');
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
});

describe('copy – outage times are anchored to the last report (od posledního hlášení)', () => {
  for (const [scenario, key] of [
    ['observations', 'device:demo_dev_cellar'],
    ['suspicion', 'device:demo_dev_cellar'],
    ['suspicion', 'device:demo_dev_dishwasher'],
    ['confirmed', 'device:demo_dev_dishwasher'],
  ] as const) {
    it(`${scenario} ${key}`, () => {
      const snap = mockAnomalySnapshot(scenario);
      const r = report(scenario, key);
      const last = lastReport(r)!;
      expect(last).toBe(r.findings[0]!.detail.last);
      const line = plain(meta(r, snap.now));
      // the clock time is the last report, never the first observation or tier change
      expect(line).toContain(`od ${hm(last)}`);
      expect(line).not.toContain(`od ${hm(r.since)}`);
      // the duration is now − last report
      expect(line.endsWith(plain(dur(outageMinutes(r, snap.now)!)))).toBe(true);
    });
  }
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
  it('stepper explains future tiers', () => {
    const r = report('suspicion', 'device:demo_dev_cellar');
    expect(stepDetail(r, 'observation')).toBe('8:30');
    expect(stepDetail(r, 'confirmed')).toBe('nejdřív 13:55');
    const warm = report('suspicion', 'device:demo_dev_living');
    expect(stepDetail(warm, 'confirmed')).toBe('jen při extrému');
  });
  it('page headline', () => {
    expect(plain(overview({ observation: 0, suspicion: 2, confirmed: 1 }).title)).toBe('1 porucha');
    expect(plain(overview({ observation: 0, suspicion: 2, confirmed: 1 }).sub)).toBe('2 podezření');
    expect(overview({ observation: 0, suspicion: 0, confirmed: 0 }).title).toBe('Vše v pořádku');
  });
});

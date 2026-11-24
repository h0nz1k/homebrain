import { describe, expect, it } from 'vitest';
import {
  dataAgeLabel,
  durationLabel,
  fmtPct,
  fmtSla,
  heroMeta,
  heroModel,
  reasonText,
  resetLabel,
  sortAgents,
  whenLabel,
} from './format.js';
import { createMockSnapshot } from './mock.js';

const NB = ' ';
// Tuesday 24 Nov 2026, 9:45 in Prague (UTC+1).
const NOW = Date.parse('2026-11-24T08:45:00Z');

describe('reset countdown (Europe/Prague)', () => {
  it('„reset za 3 h 12 min · út 12:57“', () => {
    expect(resetLabel('2026-11-24T11:57:00Z', NOW)).toBe(`reset za 3${NB}h 12${NB}min · út 12:57`);
  });
  it('days and minutes', () => {
    expect(resetLabel('2026-11-26T09:15:00Z', NOW)).toBe(`reset za 2${NB}dny · čt 10:15`);
    expect(resetLabel('2026-11-24T09:00:00Z', NOW)).toBe(`reset za 15${NB}min · út 10:00`);
  });
  it('a week away adds the date; summer time is respected', () => {
    expect(resetLabel('2026-12-01T12:00:00Z', NOW)).toBe(
      `reset za 7${NB}dní 3${NB}h · út 1. 12. 13:00`,
    );
    // July: UTC+2.
    expect(resetLabel('2027-07-01T10:00:00Z', Date.parse('2027-07-01T09:00:00Z'))).toBe(
      `reset za 1${NB}h · čt 12:00`,
    );
  });
  it('missing, invalid or past reset', () => {
    expect(resetLabel(null, NOW)).toBeNull();
    expect(resetLabel('nonsense', NOW)).toBeNull();
    expect(resetLabel('2026-11-24T08:00:00Z', NOW)).toBe('reset právě probíhá');
  });
  it('durations round up to whole minutes', () => {
    expect(durationLabel(30_000)).toBe(`1${NB}min`);
    expect(durationLabel(3_600_000)).toBe(`1${NB}h`);
    expect(durationLabel(86_400_000 * 5)).toBe(`5${NB}dní`);
  });
});

describe('numbers and data age', () => {
  it('percent and SLA', () => {
    expect(fmtPct(62.4)).toBe(`62${NB}%`);
    expect(fmtPct(5.5)).toBe(`5,5${NB}%`);
    expect(fmtPct(0)).toBe(`0${NB}%`);
    expect(fmtPct(null)).toBe('–');
    expect(fmtSla(99.96)).toBe(`99,9${NB}%`);
    expect(fmtSla(100)).toBe(`100${NB}%`);
    expect(fmtSla(93)).toBe(`93${NB}%`);
    expect(fmtSla(94.95)).toBe(`94,9${NB}%`);
  });
  it('data age in Prague time', () => {
    expect(dataAgeLabel({ current: false, since: '2026-11-24T07:15:00Z' }, NOW)).toBe(
      'Data neaktuální od 8:15',
    );
    expect(dataAgeLabel({ current: true, since: '2026-11-24T08:43:00Z' }, NOW)).toBe(
      'Data aktuální · 9:43',
    );
    expect(dataAgeLabel({ current: true, since: null }, NOW)).toBe('Data aktuální');
    expect(dataAgeLabel({ current: null, since: null }, NOW)).toBe('Stáří dat neznámé');
    expect(whenLabel('2026-11-23T20:05:00Z', NOW)).toBe('23. 11. 21:05');
  });
});

describe('hero', () => {
  it('ok', () => {
    const snap = createMockSnapshot('ok', NOW);
    expect(heroModel(snap)).toMatchObject({ tone: 'ok', badge: 'Živě', headline: 'V pořádku' });
    expect(heroMeta(snap)).toEqual(['3 z 4 agentů běží', '1 čeká', '6 kvót', '3 služby']);
  });
  it('warn scenario: exhausted quota leads, the rest follows', () => {
    const hero = heroModel(createMockSnapshot('warn', NOW));
    expect(hero.tone).toBe('crit');
    expect(hero.headline).toBe('Kritické: Poskytovatel Y · 5 h: vyčerpáno');
    expect(hero.more).toContain(`Služba Wiki: SLA 93${NB}%`);
    expect(hero.more).toContain('Poskytovatel X · Plán A · týden: dojde před resetem');
    expect(hero.more).toContain(`Poskytovatel Y · 7 dní: zbývá 12${NB}%`);
    expect(hero.target).toBe('agents-quotas');
  });
  it('crit scenario: service down, stale data', () => {
    const snap = createMockSnapshot('crit', NOW);
    const hero = heroModel(snap);
    expect(hero.headline).toBe('Kritické: Služba Brána: výpadek');
    expect(hero.badge).toBe('Neaktuální');
    expect(hero.more).toContain('Data nejsou aktuální');
    expect(hero.target).toBe('agents-services');
  });
  it('unknown without reasons', () => {
    expect(heroModel(createMockSnapshot('unconfigured', NOW)).headline).toBe(
      'Stav agentů není známý',
    );
  });
  it('status reason text', () => {
    expect(
      reasonText({ kind: 'status', label: 'x', level: 'critical', value: null, detail: null }),
    ).toBe('Monitoring hlásí kritický stav');
  });
});

it('agents: waiting first, stopped last', () => {
  const sorted = sortAgents(createMockSnapshot('ok', NOW).agents.items).map((a) => a.name);
  expect(sorted).toEqual(['Agent B', 'Agent A', 'Agent C', 'Agent D']);
});

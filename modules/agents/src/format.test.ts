import { describe, expect, it } from 'vitest';
import {
  dataAgeLabel,
  dataAgeShort,
  durationLabel,
  formatRelTime,
  fmtPct,
  fmtSla,
  heroMeta,
  heroModel,
  reasonText,
  renewalLabel,
  resetLabel,
  serviceUnderIdeal,
  sortAgents,
  whenLabel,
} from './format.js';
import { buildTodoItems } from './todoItems.js';
import { createMockSnapshot } from './mock.js';

const NB = ' ';
// Tuesday 24 Nov 2026, 9:45 in Prague (UTC+1).
const NOW = Date.parse('2026-11-24T08:45:00Z');

describe('renewal labels (Europe/Prague)', () => {
  it('dnes / zítra / weekday+date / date-only', () => {
    expect(renewalLabel('2026-11-24T19:59:00Z', NOW)).toBe('dnes 20:59');
    expect(renewalLabel('2026-11-25T05:09:00Z', NOW)).toBe('zítra 6:09');
    expect(renewalLabel('2026-11-26T16:03:00Z', NOW)).toBe('čt 26. 11. 17:03');
    expect(renewalLabel('2026-12-01T00:00:00+01:00', NOW)).toBe('1. 12.');
  });
});

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
    expect(dataAgeShort('2026-11-24T08:44:00Z', NOW)).toBe(`data před 1${NB}min`);
    expect(whenLabel('2026-11-23T20:05:00Z', NOW)).toBe('23. 11. 21:05');
    expect(formatRelTime('2026-11-24T08:40:00Z', NOW)).toBe(`před 5${NB}min`);
    expect(formatRelTime('2026-11-24T07:15:00Z', NOW)).toBe('dnes 8:15');
    expect(formatRelTime('2026-11-23T20:05:00Z', NOW)).toBe('23. 11. 21:05');
  });
});

describe('hero (sensor state + todo count)', () => {
  it('ok → Vše v pořádku; no todos', () => {
    const snap = createMockSnapshot('ok', NOW);
    const todos = buildTodoItems(snap, NOW);
    expect(todos).toHaveLength(0);
    const hero = heroModel(snap, NOW, todos.length);
    expect(hero).toMatchObject({ tone: 'ok', headline: 'Vše v pořádku', stale: false });
    expect(hero.subline).toMatch(/4 agent/);
  });
  it('stale + sensor ok → amber „Data nejsou aktuální“, never green „Vše v pořádku“', () => {
    const snap = createMockSnapshot('stale', NOW);
    const todos = buildTodoItems(snap, NOW);
    const hero = heroModel(snap, NOW, todos.length);
    expect(hero).toMatchObject({ tone: 'warn', headline: 'Data nejsou aktuální', stale: true });
  });
  it('warn/mismatch: sensor attention → warn tone; items do not raise verdict', () => {
    const snap = createMockSnapshot('warn', NOW);
    expect(snap.verdict.level).toBe('warning');
    expect(snap.verdict.reasons[0]).toMatchObject({
      kind: 'quota',
      level: 'critical',
      detail: 'exhausted',
    });
    const todos = buildTodoItems(snap, NOW);
    const hero = heroModel(snap, NOW, todos.length);
    expect(hero.tone).toBe('warn');
    expect(hero.headline).toMatch(/^Běží vše · \d+ věc/);
  });
  it('crit: Kritické · N věcí', () => {
    const snap = createMockSnapshot('crit', NOW);
    const todos = buildTodoItems(snap, NOW);
    const hero = heroModel(snap, NOW, todos.length);
    expect(hero.tone).toBe('crit');
    expect(hero.headline).toMatch(/^Kritické · /);
  });
  it('unknown without reasons', () => {
    expect(heroModel(createMockSnapshot('unconfigured', NOW), NOW, 0).headline).toBe(
      'Stav agentů není známý',
    );
  });
  it('status reason text', () => {
    expect(
      reasonText({ kind: 'status', label: 'x', level: 'critical', value: null, detail: null }),
    ).toBe('Monitoring hlásí kritický stav');
  });
  it('heroMeta still reports ze N (vision r1)', () => {
    const snap = createMockSnapshot('warn', NOW);
    expect(heroMeta(snap)).toEqual(
      expect.arrayContaining([expect.stringMatching(/2 z 4 agentů běží/)]),
    );
  });
});

describe('services under ideal', () => {
  it('SLA < 99 or non-operational', () => {
    const snap = createMockSnapshot('real', NOW);
    const under = snap.services.filter(serviceUnderIdeal);
    expect(under.map((s) => s.name).sort()).toEqual(['Systém agentů', 'Wiki']);
  });
});

it('agents: waiting first, stopped last', () => {
  const sorted = sortAgents(createMockSnapshot('warn', NOW).agents.items).map((a) => a.name);
  expect(sorted).toEqual(['Agent B', 'Agent A', 'Agent C', 'Agent D']);
});

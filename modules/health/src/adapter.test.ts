import { describe, expect, it } from 'vitest';
import type { EntityStateLike } from '@homebrain/ha-client';
import { createMockConnection } from '@homebrain/testing';
import {
  adaptHealthEntities,
  daysLeftInPeriod,
  deriveNextStep,
  fetchWeightHistory,
  fetchWorkoutDays,
  hasNoHistory,
  healthSummary,
  localDate,
  selectHealthEntityIds,
  weekDates,
  weightChange,
} from './adapter';
import { HEALTH_BINDING_KEYS } from './contract';
import { createHealthDemo, type HealthScenario } from './fixtures';

/** Saturday 31 Oct 2026, 10:00 CET – two days (Sat, Sun) left in the ISO week. */
const SAT = Date.parse('2026-10-31T10:00:00+01:00');
const WED = Date.parse('2026-10-28T10:00:00+01:00');

function modelFor(scenario: HealthScenario, now = SAT, staleAfterDays?: number) {
  const demo = createHealthDemo(now, scenario);
  return adaptHealthEntities({
    bindings: demo.bindings,
    getState: (id) => demo.states[id],
    now,
    staleAfterDays,
  });
}

describe('adaptHealthEntities – stavy z donor fixtures', () => {
  it('HEA-001: bez vazeb nebo bez entit je integrace „missing“', () => {
    expect(modelFor('missing').status).toBe('missing');
    const demo = createHealthDemo(SAT, 'week');
    const model = adaptHealthEntities({
      bindings: demo.bindings,
      getState: () => undefined,
      now: SAT,
    });
    expect(model.status).toBe('missing');
    expect(deriveNextStep(model).kind).toBe('missing');
    expect(healthSummary(model)).toBeNull();
  });

  it('F-001 prázdná instalace: žádná nula jako historie', () => {
    const model = modelFor('empty');
    expect(model.status).toBe('empty');
    expect(hasNoHistory(model)).toBe(true);
    expect(deriveNextStep(model)).toMatchObject({ kind: 'empty' });
    expect(model.lastWorkoutAt).toMatchObject({ value: null, state: 'unavailable' });
    expect(model.weight.state).toBe('not_bound');
  });

  it('F-002 rozpracovaný týden: 2 / 3 a deterministický hero', () => {
    const model = modelFor('week');
    expect(model.status).toBe('ok');
    expect(model.week.completed.value).toBe(2);
    expect(model.week.target.value).toBe(3);
    expect(model.week.goalMet.value).toBe(false);
    expect(model.week.daysLeft).toBe(2);
    expect(model.trainedToday).toBe(false);
    expect(deriveNextStep(model)).toEqual({
      kind: 'train',
      title: 'Dnes silový trénink',
      detail: 'Do minima zbývá 1 trénink, do konce týdne 2 dny.',
    });
    expect(healthSummary(model)).toBe('Dnes silový trénink · 2 / 3');
    expect(model.streakWeeks.value).toBe(2);
    expect(model.xpTotal.value).toBe(1350);
    expect(model.sleepMinutes).toMatchObject({ value: 445, verified: true });
    expect(model.flexMealAvailable.value).toBe(true);
    expect(model.milestones.map((m) => m.achieved.value)).toEqual([
      true,
      false,
      false,
      false,
      false,
    ]);
  });

  it('F-002 uprostřed týdne po včerejším tréninku doporučí odpočinek', () => {
    const model = modelFor('week', WED);
    expect(model.week.daysLeft).toBe(5);
    expect(deriveNextStep(model)).toMatchObject({ kind: 'rest', title: 'Dnes klidně odpočinek' });
  });

  it('F-003 splněný týden: regenerace', () => {
    const model = modelFor('met');
    expect(model.week.goalMet.value).toBe(true);
    expect(model.trainedToday).toBe(true);
    expect(deriveNextStep(model)).toMatchObject({ kind: 'met', title: 'Týdenní minimum splněno' });
  });

  it('F-004 délka tréninku respektuje jednotku a nesčítá nesmyslné metriky', () => {
    const demo = createHealthDemo(SAT, 'week');
    const id = demo.bindings.health_last_workout_duration!;
    const read = (state: string, unit: string) =>
      adaptHealthEntities({
        bindings: demo.bindings,
        getState: (e) =>
          e === id
            ? { ...demo.states[id]!, state, attributes: { unit_of_measurement: unit } }
            : demo.states[e],
        now: SAT,
      }).lastWorkoutSeconds;
    expect(read('1920', 's').value).toBe(1920);
    expect(read('32', 'min').value).toBe(1920);
    expect(read('64', 'reps')).toMatchObject({ value: null, state: 'invalid' });
    expect(read('-5', 's')).toMatchObject({ value: null, state: 'invalid' });
  });

  it('F-007 částečně nepodporovaná pole: partial, UI zůstává funkční', () => {
    const demo = createHealthDemo(SAT, 'week');
    const id = demo.bindings.health_source_status!;
    const model = adaptHealthEntities({
      bindings: demo.bindings,
      getState: (e) => (e === id ? { ...demo.states[id]!, state: 'partial' } : demo.states[e]),
      now: SAT,
    });
    expect(model.status).toBe('partial');
    expect(model.week.completed.value).toBe(2);
  });

  it('F-008 chyba importu: poslední známé hodnoty zůstávají', () => {
    const model = modelFor('error');
    expect(model.status).toBe('error');
    expect(model.week.completed.value).toBe(2);
    expect(model.xpTotal.value).toBe(1350);
  });

  it('F-009 spánek nepřipojen: partial a hero bez spánku', () => {
    const model = modelFor('partial');
    expect(model.status).toBe('partial');
    expect(model.sleepMinutes.state).toBe('not_bound');
    expect(deriveNextStep(model).kind).toBe('train');
  });

  it('F-010 zastaralá data ze zdroje i podle prahu HomeBrainu', () => {
    const stale = modelFor('stale');
    expect(stale.status).toBe('stale');
    expect(stale.stale).toBe(true);
    // Source still says ok, but the last success is older than the configured threshold.
    const demo = createHealthDemo(SAT, 'week');
    const id = demo.bindings.health_last_success!;
    const model = adaptHealthEntities({
      bindings: demo.bindings,
      getState: (e) =>
        e === id ? { ...demo.states[id]!, state: '2026-10-20T08:00:00+00:00' } : demo.states[e],
      now: SAT,
      staleAfterDays: 7,
    });
    expect(model.status).toBe('stale');
  });

  it('F-011 DST: týden z atributů integrace, lokální den podle Europe/Prague', () => {
    const now = Date.parse('2026-10-25T23:30:00+01:00');
    expect(daysLeftInPeriod('2026-10-26T00:00:00+01:00', now, 'Europe/Prague')).toBe(1);
    expect(localDate(Date.parse('2026-10-25T00:30:00+02:00'), 'Europe/Prague')).toBe('2026-10-25');
    expect(localDate(Date.parse('2026-10-24T23:30:00Z'), 'Europe/Prague')).toBe('2026-10-25');
    expect(daysLeftInPeriod('2026-11-02T00:00:00+01:00', SAT, 'Europe/Prague')).toBe(2);
    expect(daysLeftInPeriod('2026-10-26T00:00:00+01:00', SAT, 'Europe/Prague')).toBeNull();
  });

  it('nedostupný zdroj: nic se nedopočítává', () => {
    const model = modelFor('unavailable');
    expect(model.status).toBe('unavailable');
    expect(model.week.completed).toMatchObject({ value: null, state: 'unavailable' });
    expect(model.week.target.value).toBeNull();
    expect(model.week.goalMet.value).toBeNull();
    expect(model.xpTotal.value).toBeNull();
    expect(model.milestones.every((m) => m.achieved.value === null)).toBe(true);
    expect(deriveNextStep(model).kind).toBe('unavailable');
  });

  it('HEA-010: neověřený spánek nemění doporučení', () => {
    const unverified = modelFor('unverified');
    expect(unverified.sleepMinutes.verified).toBe(false);
    expect(deriveNextStep(unverified)).toEqual(deriveNextStep(modelFor('week')));
  });

  it('neplatné hodnoty jsou „invalid“, ne nula', () => {
    const demo = createHealthDemo(SAT, 'week');
    const id = demo.bindings.health_weekly_strength_progress!;
    const model = adaptHealthEntities({
      bindings: demo.bindings,
      getState: (e) => (e === id ? { ...demo.states[id]!, state: '2.5' } : demo.states[e]),
      now: SAT,
    });
    expect(model.week.completed).toMatchObject({ value: null, state: 'invalid' });
    expect(deriveNextStep(model).kind).toBe('unknown');
  });

  it('text dalšího kroku z integrace se zobrazí doslova', () => {
    const demo = createHealthDemo(SAT, 'week');
    const states: Record<string, EntityStateLike> = {
      ...demo.states,
      'sensor.demo_next': {
        entity_id: 'sensor.demo_next',
        state: 'Lehká procházka',
        attributes: {},
        last_updated: '2026-10-31T08:00:00Z',
      },
    };
    const model = adaptHealthEntities({
      bindings: { ...demo.bindings, health_next_step: 'sensor.demo_next' },
      getState: (e) => states[e],
      now: SAT,
    });
    expect(deriveNextStep(model)).toMatchObject({ kind: 'source', title: 'Lehká procházka' });
  });

  it('pozdní týden bez šance na minimum', () => {
    const sunday = Date.parse('2026-11-01T09:00:00+01:00');
    const model = modelFor('risk', sunday);
    expect(deriveNextStep(model)).toMatchObject({
      kind: 'missed',
      title: 'Minimum tento týden nevyjde',
    });
  });

  it('selectHealthEntityIds bere jen namapované klíče', () => {
    const ids = selectHealthEntityIds(createHealthDemo(SAT, 'week').bindings);
    expect(ids).toHaveLength(HEALTH_BINDING_KEYS.length - 1); // next_step is not bound in the demo
    expect(selectHealthEntityIds({ health_xp_total: '  ', other: 'sensor.x' })).toEqual([]);
  });
});

describe('fetchWeightHistory – recorder statistiky', () => {
  it('načte denní průměry a spočítá změnu', async () => {
    const demo = createHealthDemo(SAT, 'week');
    const connection = createMockConnection({
      'recorder/statistics_during_period': (message: { statistic_ids?: string[] }) =>
        demo.statistics(message),
    });
    const history = await fetchWeightHistory(connection, demo.bindings, SAT);
    expect(history.status).toBe('ready');
    expect(history.points).toHaveLength(30);
    const change = weightChange(history)!;
    expect(change.days).toBe(29);
    expect(change.delta).toBeLessThan(0);
  });

  it('bez spojení nebo vazby = unsupported, chyba WS = error', async () => {
    const demo = createHealthDemo(SAT, 'week');
    expect((await fetchWeightHistory(undefined, demo.bindings, SAT)).status).toBe('unsupported');
    expect((await fetchWeightHistory(createMockConnection({}), {}, SAT)).status).toBe(
      'unsupported',
    );
    expect((await fetchWeightHistory(createMockConnection({}), demo.bindings, SAT)).status).toBe(
      'error',
    );
    expect(weightChange({ status: 'ready', points: [{ t: 0, v: 90 }] })).toBeNull();
  });
});

describe('fetchWorkoutDays', () => {
  const demo = createHealthDemo(SAT, 'week');
  const model = adaptHealthEntities({
    bindings: demo.bindings,
    getState: (id) => demo.states[id],
    now: SAT,
  });

  it('vrací lokální dny tréninků aktuálního týdne z historie recorderu', async () => {
    const connection = createMockConnection({
      'history/history_during_period': (m: { entity_ids?: string[] }) => demo.history(m),
    });
    const days = await fetchWorkoutDays(connection, demo.bindings, model);
    expect(days).toEqual({ status: 'ready', days: ['2026-10-28', '2026-10-30'] });
  });

  it('bez spojení nebo vazby nic nehádá', async () => {
    expect(await fetchWorkoutDays(undefined, demo.bindings, model)).toEqual({
      status: 'unsupported',
      days: [],
    });
    const connection = createMockConnection({});
    expect((await fetchWorkoutDays(connection, {}, model)).status).toBe('unsupported');
  });

  it('weekDates dává 7 lokálních dnů i přes konec letního času', () => {
    expect(weekDates('2026-10-26T00:00:00+01:00', 'Europe/Prague')).toEqual([
      '2026-10-26',
      '2026-10-27',
      '2026-10-28',
      '2026-10-29',
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
    ]);
    expect(weekDates('2026-10-19T00:00:00+02:00', 'Europe/Prague').at(-1)).toBe('2026-10-25');
  });
});

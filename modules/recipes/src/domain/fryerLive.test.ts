import { describe, expect, it } from 'vitest';
import {
  detectFryerEntities,
  formatCountdown,
  fryerControls,
  fryerModel,
  fryerNeedsAction,
  fryerPhase,
  fryerProgramLine,
  fryerRemaining,
  fryerSeen,
  fryerTimeline,
  fryerVisible,
  type FryerStates,
} from './fryerLive.js';
import { fryerSignals, recipesFryerTodaySignalSource } from '../fryerSignal.js';
import { createEntityStore } from '@homebrain/ha-client';

const st = (state: string, last_updated?: string) => ({ state, last_updated });

describe('fryer entity autodetection', () => {
  const ids = [
    'sensor.demo_fryer_cooking_status',
    'sensor.demo_fryer_time_remaining',
    'sensor.demo_fryer_total_cook_time',
    'binary_sensor.demo_fryer_drawer',
    'button.demo_fryer_pause',
    'button.demo_fryer_stop',
    'button.demo_fryer_keep_warm',
    'switch.demo_fryer_power',
    'sensor.other_thing',
  ];
  it('finds siblings of the *_cooking_status sensor by suffix', () => {
    expect(detectFryerEntities(ids)).toEqual({
      status: 'sensor.demo_fryer_cooking_status',
      remaining: 'sensor.demo_fryer_time_remaining',
      total: 'sensor.demo_fryer_total_cook_time',
      drawer: 'binary_sensor.demo_fryer_drawer',
      pause: 'button.demo_fryer_pause',
      stop: 'button.demo_fryer_stop',
      keepWarm: 'button.demo_fryer_keep_warm',
      power: 'switch.demo_fryer_power',
    });
  });
  it('returns null without a fryer and lets bindings win', () => {
    expect(detectFryerEntities(['sensor.other_thing'])).toBeNull();
    const out = detectFryerEntities(ids, {
      recipes_airfryer_drawer: 'binary_sensor.custom_drawer',
    });
    expect(out?.drawer).toBe('binary_sensor.custom_drawer');
  });
});

describe('fryer phase (real HD9876 sequence)', () => {
  it('maps the observed status + drawer combinations', () => {
    expect(fryerPhase({ status: st('standby'), power: st('off') })).toBe('off');
    expect(fryerPhase({ status: st('unavailable') })).toBe('off');
    expect(fryerPhase({ status: st('mainmenu'), power: st('on') })).toBe('idle');
    expect(fryerPhase({ status: st('cooking'), drawer: st('off') })).toBe('cooking');
    expect(fryerPhase({ status: st('cooking'), preheat: st('True') })).toBe('preheat');
    // device asks to shake, drawer still in
    expect(fryerPhase({ status: st('user_action'), drawer: st('off') })).toBe('action');
    // drawer pulled out: user_action + drawer on (observed together)
    expect(fryerPhase({ status: st('user_action'), drawer: st('on') })).toBe('drawer');
    expect(fryerPhase({ status: st('cooking'), drawer: st('on') })).toBe('drawer');
    expect(fryerPhase({ status: st('pause'), drawer: st('off') })).toBe('paused');
    expect(fryerPhase({ status: st('finish') })).toBe('done');
    expect(fryerPhase({ status: st('maintain') })).toBe('warm');
  });
  it('treats only a non-zero error_code as an error', () => {
    expect(fryerPhase({ status: st('cooking'), error: st('0') })).toBe('cooking');
    expect(fryerPhase({ status: st('cooking'), error: st('unknown') })).toBe('cooking');
    expect(fryerPhase({ status: st('cooking'), error: st('7') })).toBe('error');
  });
  it('visibility, attention and controls', () => {
    expect(fryerVisible('off')).toBe(false);
    expect(fryerVisible('idle')).toBe(false);
    expect(fryerVisible('cooking')).toBe(true);
    expect(fryerNeedsAction('action')).toBe(true);
    expect(fryerNeedsAction('cooking')).toBe(false);
    expect(fryerControls('cooking')).toEqual(['pause', 'stop']);
    expect(fryerControls('done')).toEqual(['keep_warm', 'stop']);
    expect(fryerControls('idle')).toEqual([]);
  });
});

describe('fryer countdown', () => {
  const t0 = Date.parse('2026-06-02T17:07:00Z');
  const rem = st('600', new Date(t0).toISOString());
  it('counts down locally between HA updates while cooking', () => {
    expect(fryerRemaining(rem, 'cooking', t0 + 7_400)).toBe(593);
    expect(fryerRemaining(rem, 'cooking', t0 + 10 * 60_000)).toBe(540); // capped drift 60 s
  });
  it('freezes while the drawer is out or paused', () => {
    expect(fryerRemaining(rem, 'drawer', t0 + 30_000)).toBe(600);
    expect(fryerRemaining(rem, 'paused', t0 + 30_000)).toBe(600);
  });
  it('formats m:ss and h:mm:ss', () => {
    expect(formatCountdown(522)).toBe('8:42');
    expect(formatCountdown(3725)).toBe('1:02:05');
    expect(formatCountdown(-3)).toBe('0:00');
  });
  it('builds the model with progress, temperatures and program line', () => {
    const states: FryerStates = {
      status: st('cooking'),
      remaining: st('570', new Date(t0).toISOString()),
      total: st('19'),
      currentTemp: st('189'),
      targetTemp: st('200'),
      stage: st('2'),
      program: st('14'),
      method: st('auto_cook'),
      error: st('0'),
    };
    const m = fryerModel(states, t0);
    expect(m).toMatchObject({ phase: 'cooking', label: 'Peče', remainingS: 570 });
    expect(m.progress).toBeCloseTo(0.5, 5);
    expect(fryerProgramLine(m)).toBe('AutoCook 14');
    expect(fryerModel({ ...states, status: st('finish') }, t0).progress).toBe(1);
    expect(fryerModel({ ...states, error: st('3') }, t0)).toMatchObject({
      label: 'Fritéza hlásí chybu',
      errorCode: 3,
    });
  });
});

describe('fryer Dnes signal', () => {
  const now = Date.parse('2026-06-02T17:07:00Z');
  it('is empty when the fryer is off and urgent when it needs a hand', () => {
    expect(fryerSignals(fryerModel({ status: st('standby'), power: st('off') }, now), now)).toEqual(
      [],
    );
    const [action] = fryerSignals(
      fryerModel({ status: st('user_action'), drawer: st('off') }, now),
      now,
    );
    expect(action).toMatchObject({ module: 'recipes', severity: 'warning', immediate: true });
    expect(action!.title).toBe('Fritéza · Protřepejte jídlo');
    const [cook] = fryerSignals(
      fryerModel({ status: st('cooking'), remaining: st('125', new Date(now).toISOString()) }, now),
      now,
    );
    expect(cook).toMatchObject({ severity: 'notice', value: { v: '2:05', label: 'do konce' } });
    expect(cook!.action).toMatchObject({ label: 'Detail fritézy' });
    expect(cook!.immediate).toBeUndefined();
  });
  it('feeds Dnes from the entity store and follows updates', () => {
    const store = createEntityStore();
    const seen: string[][] = [];
    const feed = recipesFryerTodaySignalSource({ store }, { clock: () => now })!;
    const off = feed.subscribe((signals) => seen.push(signals.map((s) => s.title)));
    store.update({
      'sensor.demo_fryer_cooking_status': {
        entity_id: 'sensor.demo_fryer_cooking_status',
        state: 'finish',
        attributes: {},
      },
    } as never);
    off();
    expect(seen).toEqual([[], ['Fritéza · Hotovo']]);
    expect(recipesFryerTodaySignalSource({})).toBeNull();
  });
});

describe('fryer timeline', () => {
  it('shows only phases that happened and tracks the shake', () => {
    const titles = (steps: Array<{ title: string; state: string }>) =>
      steps.map((s) => `${s.title}:${s.state}`);
    expect(titles(fryerTimeline('cooking', []))).toEqual(['Pečení:active', 'Hotovo:todo']);
    let seen = fryerSeen([], 'preheat');
    expect(titles(fryerTimeline('preheat', seen))).toEqual([
      'Předehřátí:active',
      'Pečení:todo',
      'Hotovo:todo',
    ]);
    seen = fryerSeen(fryerSeen(seen, 'cooking'), 'action');
    expect(titles(fryerTimeline('action', seen))).toEqual([
      'Předehřátí:done',
      'Pečení:done',
      'Protřepat:active',
      'Hotovo:todo',
    ]);
    expect(titles(fryerTimeline('cooking', seen))).toEqual([
      'Předehřátí:done',
      'Pečení:done',
      'Protřepat:done',
      'Dopékání:active',
      'Hotovo:todo',
    ]);
    expect(fryerTimeline('done', seen).every((s) => s.state === 'done')).toBe(true);
    expect(fryerSeen(seen, 'off')).toEqual([]);
  });
  it('keeps a stopped countdown secondary on Dnes and names the program', () => {
    const now = Date.parse('2026-06-02T17:07:00Z');
    const states = {
      status: st('user_action'),
      drawer: st('off'),
      remaining: st('522'),
      total: st('19'),
      program: st('14'),
      method: st('auto_cook'),
    };
    const [held] = fryerSignals(fryerModel(states, now), now);
    expect(held!.value).toMatchObject({ v: '8:42', label: 'stojí', held: true });
    const cooking = fryerModel({ ...states, status: st('cooking') }, now);
    expect(fryerProgramLine(cooking)).toBe('AutoCook 14');
    expect(fryerProgramLine(cooking, 'Demo hranolky')).toBe('Demo hranolky');
    expect(fryerModel({ ...states, amount: st('3') }, now).amount).toBe(3);
    expect(fryerModel({ ...states, method: st('manual'), amount: st('3') }, now).amount).toBeNull();
    expect(fryerControls('error')).toEqual(['stop']);
    const [cook] = fryerSignals(cooking, now, 'Demo hranolky');
    expect(cook!.context).toContain('Demo hranolky');
    expect(cook!.value?.progress).toBeCloseTo(1 - 522 / (19 * 60), 3);
  });
});

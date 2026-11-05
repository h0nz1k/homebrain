import { describe, expect, it } from 'vitest';
import {
  type EnrollProgressData,
  type ProgressTrack,
  isActive,
  needsServiceMode,
  progressCopy,
  progressReducer,
  progressSteps,
  remainingAt,
  sameEnrolment,
  trackFromEntities,
} from './progress';

const T0 = Date.parse('2026-11-05T16:10:00Z');
const at = (s: number) => new Date(T0 + s * 1000).toISOString();
const ev = (s: number, data: EnrollProgressData) => ({ time: at(s), data });
const base = { request_id: '3fa1-2', modality: 'face', name: 'Jan' } as const;

function run(events: Array<ReturnType<typeof ev>>, expect?: Parameters<typeof progressReducer>[2]) {
  return events.reduce<ProgressTrack | null>((t, e) => progressReducer(t, e, expect), null);
}

describe('progressReducer', () => {
  it('follows one request through all states and remembers the window length', () => {
    const t = run([
      ev(0, { ...base, state: 'armed', remaining_s: 30, text: 'Připravuji snímač…' }),
      ev(2, { ...base, state: 'waiting_presence', remaining_s: 28 }),
      ev(4, { ...base, state: 'detected', hint: 'too_far', remaining_s: 26, text: 'Přibliž se' }),
      ev(6, { ...base, state: 'capturing', hint: 'hold_still', remaining_s: 24 }),
    ]);
    expect(t).toMatchObject({ requestId: '3fa1-2', state: 'capturing', modality: 'face' });
    expect(t!.total).toBe(30);
    expect(t!.reached).toBe(2);
    expect(isActive(t)).toBe(true);
  });

  it('ignores idle, unknown states and late non-terminal events after the result', () => {
    let t = run([
      ev(0, { ...base, state: 'saving', remaining_s: 10 }),
      ev(1, { ...base, state: 'done', remaining_s: 0, text: 'Hotovo – zapsáno' }),
    ]);
    t = progressReducer(t, ev(2, { ...base, state: 'capturing', remaining_s: 9 }));
    t = progressReducer(t, ev(3, { ...base, state: 'idle' }));
    t = progressReducer(t, ev(4, { ...base, state: 'bogus' }));
    expect(t!.state).toBe('done');
    expect(isActive(t)).toBe(false);
  });

  it('a new request replaces the old track; panel enrolment is correlated by name + modality', () => {
    const expectOwn = { name: 'jan', modality: 'palm' as const, at: T0 + 9000 };
    let t = run([ev(0, { ...base, state: 'failed', reason: 'timeout' })]);
    t = progressReducer(
      t,
      ev(10, { request_id: '3fa1-3', modality: 'palm', name: 'Jan', state: 'armed' }),
      expectOwn,
    );
    expect(t).toMatchObject({ requestId: '3fa1-3', state: 'armed', own: T0 + 9000 });
    // the same request keeps the correlation even when the expectation is gone
    t = progressReducer(t, ev(11, { request_id: '3fa1-3', state: 'waiting_presence' }), null);
    expect(t).toMatchObject({ modality: 'palm', own: T0 + 9000 });
  });

  it('an enrolment from an HA script (other name or modality) is not claimed by the panel', () => {
    const t = run([ev(0, { ...base, state: 'armed' })], {
      name: 'Petra',
      modality: 'face',
      at: T0 - 1000,
    });
    expect(t!.own).toBeUndefined();
    const stale = run([ev(0, { ...base, state: 'armed' })], {
      name: 'Jan',
      modality: 'face',
      at: T0 - 120_000,
    });
    expect(stale!.own).toBeUndefined();
  });

  it('adopts a request seen mid-way (panel opened during enrolment)', () => {
    const t = run([ev(0, { ...base, state: 'detected', hint: 'turn_head', remaining_s: 12 })]);
    expect(t).toMatchObject({ state: 'detected', reached: 1, total: 12 });
  });
});

describe('remainingAt', () => {
  it('ticks locally between ~1/s events and stops at zero / at the result', () => {
    const t = run([ev(0, { ...base, state: 'waiting_presence', remaining_s: 20 })])!;
    expect(remainingAt(t, T0 + 2500)).toBeCloseTo(17.5);
    expect(remainingAt(t, T0 + 60_000)).toBe(0);
    const done = progressReducer(t, ev(3, { ...base, state: 'done', remaining_s: 0 }))!;
    expect(remainingAt(done, T0 + 4000)).toBeNull();
  });
});

describe('progressCopy', () => {
  it('prefers the firmware text, with own Czech fallback per state and modality', () => {
    const fw = run([ev(0, { ...base, state: 'detected', hint: 'too_far', text: 'Přibliž se' })])!;
    expect(progressCopy(fw).title).toBe('Přibliž se');
    const palm = run([ev(0, { ...base, modality: 'palm', state: 'waiting_presence' })])!;
    expect(progressCopy(palm).title).toBe('Ukaž dlaň snímači');
    const face = run([ev(0, { ...base, state: 'capturing' })])!;
    expect(progressCopy(face).title).toBe('Vidím obličej – nehýbej se');
    const hint = run([ev(0, { ...base, state: 'detected', hint: 'occluded' })])!;
    expect(progressCopy(hint).title).toBe('Odkryj obličej (vlasy, brýle, rouška)');
  });

  it('left/right hints are unverified on hardware: always the generic centre hint', () => {
    for (const h of ['move_left', 'move_right']) {
      const t = run([
        ev(0, { ...base, state: 'detected', hint: h, text: 'Posuň obličej doleva' }),
      ])!;
      expect(progressCopy(t).title).toBe('Posuň obličej doprostřed před snímač');
    }
  });

  it('failed shows the reason with advice; retrying is a warning, not an error', () => {
    const f = run([
      ev(0, {
        ...base,
        state: 'failed',
        hint: 'palm_instead_of_face',
        reason: 'palm_instead_of_face',
      }),
    ])!;
    const c = progressCopy(f);
    expect(c.tone).toBe('warn'); // coachable → amber, try again
    expect(c.title).toBe('Zachycena dlaň místo obličeje');
    expect(c.detail).toMatch(/snímače/);
    const fault = run([ev(0, { ...base, state: 'failed', reason: 'camera' })])!;
    expect(progressCopy(fault).tone).toBe('error');
    const done = run([ev(0, { ...base, state: 'done' })])!;
    expect(progressCopy(done).detail).toBe('Jan teď může odemykat obličejem.');
    const r = run([ev(0, { ...base, modality: 'palm', state: 'retrying' })])!;
    expect(progressCopy(r)).toMatchObject({
      tone: 'busy',
      title: 'Zachycen obličej místo dlaně – zkouším znovu',
    });
  });
});

describe('progressSteps', () => {
  it('maps states onto Připraveno → Vidím → Snímám → Ukládám → Hotovo', () => {
    const states = (t: ProgressTrack) => progressSteps(t).map((s) => s.state);
    const seq: EnrollProgressData[] = [
      { ...base, state: 'waiting_presence' },
      { ...base, state: 'detected' },
      { ...base, state: 'capturing' },
      { ...base, state: 'saving' },
      { ...base, state: 'done' },
    ];
    let t: ProgressTrack | null = null;
    const seen = seq.map((d, i) => states((t = progressReducer(t, ev(i, d)))!));
    expect(progressSteps(t!).map((s) => s.title)).toEqual([
      'Připraveno',
      'Vidím',
      'Snímám',
      'Ukládám',
      'Hotovo',
    ]);
    expect(seen[0]).toEqual(['active', 'todo', 'todo', 'todo', 'todo']);
    expect(seen[2]).toEqual(['done', 'done', 'active', 'todo', 'todo']);
    expect(seen[4]).toEqual(['done', 'done', 'done', 'done', 'done']);
    const failed = progressReducer(t, ev(9, { ...base, request_id: 'x-1', state: 'capturing' }));
    expect(
      states(progressReducer(failed, ev(10, { ...base, request_id: 'x-1', state: 'failed' }))!),
    ).toEqual(['done', 'done', 'error', 'todo', 'todo']);
  });
});

describe('compatibility helpers', () => {
  it('seeds a track from the entities only while an enrolment runs', () => {
    expect(trackFromEntities({ progress: 'idle' }, T0)).toBeNull();
    expect(trackFromEntities({ progress: 'done', hint: 'Hotovo – zapsáno' }, T0)).toBeNull();
    expect(trackFromEntities({}, T0)).toBeNull();
    const t = trackFromEntities({ progress: 'detected', hint: 'Přibliž se', remaining: '14' }, T0)!;
    expect(t).toMatchObject({ state: 'detected', text: 'Přibliž se', remaining: 14 });
    expect(progressCopy(t).title).toBe('Přibliž se');
  });

  it('service mode off is offered to switch on; result belongs to the same enrolment', () => {
    expect(needsServiceMode('service_mode_off')).toBe(true);
    expect(needsServiceMode('service_mode_required')).toBe(true);
    expect(needsServiceMode('timeout')).toBe(false);
    const t = run([ev(0, { ...base, state: 'armed' })])!;
    expect(sameEnrolment(t, at(20))).toBe(true);
    expect(sameEnrolment(t, at(-30))).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { buildAccessLog, filterLog, groupByDay, lockSource, type LogEntityIds } from './log.js';
import { enrolReducer, handSlots, groupPeople } from './domain.js';
import type { HistoryItem } from './types.js';

// Synthetic entity ids and people only.
const ids: LogEntityIds = {
  lock: 'lock.front_door',
  lockAction: 'event.front_door_action',
  lockBatteryCritical: 'binary_sensor.front_door_battery_critical',
  connected: 'binary_sensor.biolock_stav_pripojeni',
  sensorOnline: 'binary_sensor.biolock_snimac_online',
  lockout: 'binary_sensor.biolock_blokace_po_neuspesich',
  service: 'switch.biolock_servisni_rezim',
  biometric: 'switch.biolock_biometricke_odemykani',
  lastError: 'sensor.biolock_posledni_chyba',
  lastUser: 'sensor.biolock_posledni_uzivatel',
};
const T = (hhmmss: string, day = '2026-06-02') => new Date(`${day}T${hhmmss}Z`).toISOString();
const sec = (iso: string) => new Date(iso).getTime() / 1000;

describe('access log', () => {
  const history: HistoryItem[] = [
    {
      kind: 'recognized',
      time: T('10:00:00'),
      user_id: 1001,
      type: 'palm',
      name: 'Jan',
      decision: 'granted',
    },
    { kind: 'rejected', time: T('09:00:00'), type: 'face', reason: 'not_recognized' },
    {
      kind: 'enrolled',
      time: T('08:00:00'),
      ok: true,
      user_id: 1002,
      type: 'palm',
      name: 'Petra',
      attempts: 2,
    },
    {
      kind: 'enrolled',
      time: T('07:59:00'),
      ok: false,
      type_requested: 'palm',
      name: 'Petra',
      reason: 'face_instead_of_palm',
    },
    { kind: 'deleted', time: T('07:58:00'), ok: true, user_id: 3, rollback: true },
    { kind: 'lockout', time: T('07:00:00'), action: 'lockout' },
  ];
  const logbook = [
    { when: sec(T('10:00:04')), entity_id: ids.lock, state: 'unlocked' },
    { when: sec(T('10:00:02')), entity_id: ids.lock, state: 'unlocking' },
    {
      when: sec(T('11:00:01')),
      entity_id: ids.lock,
      state: 'locked',
      context_event_type: 'call_service',
      context_domain: 'lock',
    },
    { when: sec(T('12:00:03')), entity_id: ids.lock, state: 'locked' },
    { when: sec(T('12:30:00')), entity_id: ids.lock, state: 'jammed' },
    { when: sec(T('13:00:00')), entity_id: ids.lockBatteryCritical, state: 'on' },
    { when: sec(T('13:30:00')), entity_id: ids.lock, state: 'unavailable' },
    { when: sec(T('07:00:01')), entity_id: ids.lockout, state: 'on' },
    { when: sec(T('06:00:00')), entity_id: ids.lastError, state: 'verify: unknown_result' },
    { when: sec(T('06:00:05')), entity_id: ids.lastError, state: 'no_reply' },
    { when: sec(T('05:00:00')), entity_id: ids.connected, state: 'off' },
    { when: sec(T('05:30:00')), entity_id: ids.service, state: 'on' },
    { when: sec(T('05:31:00')), entity_id: ids.lastUser, state: 'Jan' },
    // legacy automation logbook.log line from before the structured history
    {
      when: sec(T('20:00:00', '2026-06-01')),
      entity_id: ids.lastUser,
      name: 'BioLock',
      message: 'Odemkl(a) Jan (obličej)',
    },
    {
      when: sec(T('20:05:00', '2026-06-01')),
      entity_id: ids.lastUser,
      name: 'BioLock',
      message: 'Neúspěšný pokus: liveness_failed (živost failed)',
    },
    // duplicate of the structured recognition at 10:00:00 → dropped
    {
      when: sec(T('10:00:00')),
      entity_id: ids.lastUser,
      name: 'BioLock',
      message: 'Odemkl(a) Jan (dlaň)',
    },
  ];
  const actions = [
    { time: T('12:00:01'), action: 'lock', trigger: 6, auth_id: 0, code_id: 0 },
    { time: T('10:00:01'), action: 'unlock', trigger: 0, auth_id: 9, code_id: 0 },
  ];
  const items = buildAccessLog({
    history,
    logbook,
    actions,
    ids,
    labels: { '1001': { hand: 'left' } },
  });
  const byTitle = (re: RegExp) => items.filter((i) => re.test(`${i.title} ${i.detail ?? ''}`));

  it('merges BioLock and Nuki newest first with sources', () => {
    for (let i = 1; i < items.length; i += 1)
      expect(items[i - 1]!.time >= items[i]!.time).toBe(true);
    const unlock = items.find((i) => i.time === T('10:00:04'))!;
    expect(unlock.title).toBe('Odemčeno');
    expect(unlock.detail).toContain('BioLock – Jan, levá dlaň');
    expect(items.find((i) => i.time === T('11:00:01'))!.detail).toContain('Home Assistant');
    expect(items.find((i) => i.time === T('12:00:03'))!.detail).toContain('automatické zamčení');
    expect(items.some((i) => i.title === 'Odemyká se')).toBe(false); // transitional states hidden
  });

  it('describes enrolments, deletions, lockouts and problems in Czech', () => {
    expect(byTitle(/Zapsáno: Petra – dlaň/)).toHaveLength(1);
    expect(byTitle(/Zápis se nepovedl: Petra/)[0]!.detail).toContain('obličej místo dlaně');
    expect(byTitle(/Smazáno ID 3/)[0]!.detail).toContain('automaticky vráceno');
    expect(byTitle(/zablokoval/)).toHaveLength(1); // structured + logbook lockout merged
    expect(byTitle(/Zámek se zasekl/)[0]!.problem).toBe(true);
    expect(byTitle(/Kritická baterie/)[0]!.problem).toBe(true);
    expect(byTitle(/Zámek není dostupný/)[0]!.problem).toBe(true);
    expect(byTitle(/Chyba snímače/)).toHaveLength(1); // no_reply idle state is not an error row
    expect(byTitle(/BioLock odpojen/)[0]!.problem).toBe(true);
    expect(byTitle(/Servisní režim zapnut/)[0]!.problem).toBe(false);
  });

  it('keeps legacy logbook lines but drops duplicates of structured events', () => {
    expect(byTitle(/Jan – odemčeno/).map((i) => i.time)).toEqual([
      T('10:00:00'),
      T('20:00:00', '2026-06-01'),
    ]);
    expect(byTitle(/Nepoznaný pokus/)).toHaveLength(2);
  });

  it('filters and groups by day', () => {
    expect(filterLog(items, 'nuki').every((i) => i.source === 'nuki')).toBe(true);
    expect(filterLog(items, 'biolock').every((i) => i.source === 'biolock')).toBe(true);
    expect(filterLog(items, 'problems').every((i) => i.problem)).toBe(true);
    const groups = groupByDay(items, new Date('2026-06-02T18:00:00Z').getTime());
    expect(groups[0]!.label).toBe('Dnes');
    expect(groups[1]!.label).toBe('Včera');
  });

  it('maps Nuki triggers to sources', () => {
    expect(lockSource({ time: '', action: 'unlock', trigger: 172, auth_id: 0, code_id: 0 })).toBe(
      'Home Assistant',
    );
    expect(lockSource({ time: '', action: 'unlock', trigger: 2, auth_id: 0, code_id: 0 })).toBe(
      'tlačítkem na zámku',
    );
    expect(lockSource({ time: '', action: 'unlock', trigger: 0, auth_id: 0, code_id: 4 })).toBe(
      'klávesnicí',
    );
    expect(lockSource({ time: '', action: 'unlock', trigger: 0, auth_id: 5, code_id: 0 })).toBe(
      'aplikací / Bluetooth',
    );
  });
});

describe('enrolment outside the wizard', () => {
  it('two unlabelled palms fill both hand slots instead of hiding one', () => {
    const [jan] = groupPeople(
      [
        { id: 1, type: 'face', name: 'Jan', allowed: true },
        { id: 1001, type: 'palm', name: 'Jan', allowed: true },
        { id: 1002, type: 'palm', name: 'Jan', allowed: true },
      ],
      {},
    );
    const slots = handSlots(jan!);
    expect(slots.right).toEqual({ users: [jan!.unknown[0]], unknown: true });
    expect(slots.left).toEqual({ users: [jan!.unknown[1]], unknown: true });
  });

  it('tracks pending → retry → result', () => {
    let s = enrolReducer(null, { sensorState: 'enrolling', time: T('10:00:00') });
    expect(s?.phase).toBe('pending');
    s = enrolReducer(s, {
      event: {
        event: 'enroll_retry',
        time: T('10:00:10'),
        data: {
          type_requested: 'palm',
          name: 'Jan',
          reason: 'face_instead_of_palm',
          attempt: 1,
          remaining_s: 18,
        },
      },
    });
    expect(s).toMatchObject({ phase: 'pending', type: 'palm', attempt: 1, remaining_s: 18 });
    s = enrolReducer(s, {
      event: {
        event: 'enrolled',
        time: T('10:00:20'),
        data: { ok: false, type_requested: 'palm', name: 'Jan', reason: 'timeout' },
      },
    });
    expect(s).toMatchObject({ phase: 'failed', reason: 'timeout', name: 'Jan', type: 'palm' });
    s = enrolReducer(s, {
      event: {
        event: 'enrolled',
        time: T('10:01:00'),
        data: { ok: true, user_id: 1002, type: 'palm', name: 'Jan' },
      },
    });
    expect(s).toMatchObject({ phase: 'ok', id: 1002, type: 'palm' });
    // the sensor leaving "enrolling" does not erase the result
    expect(enrolReducer(s, { sensorState: 'service', time: T('10:01:01') })).toBe(s);
  });
});

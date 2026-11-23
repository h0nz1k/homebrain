import {
  createMockAccessApi,
  ENTITY_DEFAULTS_ACCESS,
  setAccessApiFactory,
} from '@homebrain/module-access';
import type { DemoState, DevHass } from './shared.js';

const agoIsoDev = (min: number) => new Date(Date.now() - min * 60_000).toISOString();

/**
 * Přístup (BioLock): synthetic people Marek/Lucie/Kuba, fake device entities; nothing is sent
 * anywhere. `?biolock=off` = device offline, `?service=1` = service mode on. e2e drives events
 * through `window.__hbAccess.emit(...)`.
 */
export function addAccessDemo({ hass, refresh }: DevHass): void {
  const q = new URLSearchParams(location.search);
  const set = (entity_id: string, state: string, attributes: Record<string, unknown> = {}) => {
    hass.states[entity_id] = {
      entity_id,
      state,
      last_changed: new Date().toISOString(),
      last_updated: new Date().toISOString(),
      attributes,
    } as DemoState;
  };
  const E = ENTITY_DEFAULTS_ACCESS;
  if (q.get('biolock') !== 'off') {
    set(E.biometric, 'on');
    set(E.service, q.get('service') === '1' ? 'on' : 'off');
    set(E.action, 'Odemknout', { options: ['Odemknout', 'Otevřít západku'] });
    set(E.sensorState, 'idle');
    set(E.sensorOnline, 'on');
    set(E.wifi, '-61');
    set(E.connected, 'on');
    set(E.nukiConnected, 'on');
    set(E.nukiPaired, 'on');
    set(E.nukiBattery, '82');
    set(E.lock, 'locked');
    set(E.lockout, 'off');
    set(E.lockBattery, '76');
    set(E.lockBatteryCritical, 'off');
    set(E.lastError, 'no_reply');
    if (q.get('enroll_progress') === '1') {
      set(E.enrollProgress, 'idle');
      set(E.enrollHint, 'Nic neprobíhá');
      set(E.enrollRemaining, '0');
    }
    set(E.lockAction, agoIsoDev(14 - 2 / 60), {
      event_type: 'unlock',
      trigger: 0,
      auth_id: 7,
      code_id: 0,
    });
  }
  const log: Array<{ action: string; data: unknown }> = [];
  const agoIso = agoIsoDev;
  const sec = (min: number) => (Date.now() - min * 60_000) / 1000;
  // Synthetic HA logbook of the lock + BioLock entities (last 3 days) and Nuki lock actions.
  const logbook = [
    { when: sec(14 - 0.05), entity_id: E.lock, state: 'unlocked' },
    { when: sec(12), entity_id: E.lock, state: 'locked' },
    {
      when: sec(180),
      entity_id: E.lock,
      state: 'unlocked',
      context_event_type: 'call_service',
      context_domain: 'lock',
    },
    { when: sec(178), entity_id: E.lock, state: 'locked' },
    { when: sec(26 * 60 + 2), entity_id: E.lockout, state: 'on' },
    { when: sec(26 * 60 - 3), entity_id: E.lockout, state: 'off' },
    { when: sec(27 * 60 - 0.05), entity_id: E.lock, state: 'open' },
    { when: sec(27 * 60 - 2), entity_id: E.lock, state: 'locked' },
    { when: sec(30 * 60), entity_id: E.lock, state: 'jammed' },
    { when: sec(31 * 60), entity_id: E.lockBatteryCritical, state: 'on' },
    { when: sec(32 * 60), entity_id: E.connected, state: 'off' },
    { when: sec(32 * 60 - 4), entity_id: E.connected, state: 'on' },
    { when: sec(50 * 60), entity_id: E.lastError, state: 'verify: unknown_result' },
    { when: sec(51 * 60), entity_id: E.service, state: 'on' },
    { when: sec(51 * 60 - 9), entity_id: E.service, state: 'off' },
    {
      when: sec(52 * 60),
      entity_id: E.lastUser,
      name: 'BioLock',
      message: 'Odemkl(a) Lucie (dlaň)',
    },
    { when: sec(52 * 60 - 0.1), entity_id: E.lock, state: 'unlocked' },
  ];
  const lockActions = [
    { time: agoIso(12 + 1 / 60), action: 'lock', trigger: 6, auth_id: 0, code_id: 0 },
    { time: agoIso(178 + 1 / 60), action: 'lock', trigger: 2, auth_id: 0, code_id: 0 },
    { time: agoIso(180 + 1 / 60), action: 'unlock', trigger: 172, auth_id: 0, code_id: 0 },
    { time: agoIso(27 * 60 - 2 + 1 / 60), action: 'lock', trigger: 0, auth_id: 0, code_id: 3 },
  ];
  const accessApi = createMockAccessApi({
    latencyMs: 80,
    enrollMs: Number(q.get('enroll_ms') ?? 1500),
    // e2e/dev: ?enroll_progress=1 = firmware with live enrolment progress (biolock-firmware#9)
    progress: q.get('enroll_progress') === '1',
    // e2e/dev: ?access_fail=face_instead_of_palm,timeout fails the next enrolments with these codes
    failNext: q.get('access_fail')?.split(',').filter(Boolean),
    // dev: recent passages incl. the reason a door stayed shut (synthetic names only)
    history: [
      {
        kind: 'recognized',
        time: agoIso(14),
        name: 'Marek',
        type: 'face',
        user_id: 1,
        decision: 'granted',
      },
      {
        kind: 'recognized',
        time: agoIso(95),
        name: 'Kuba',
        type: 'face',
        user_id: 3,
        decision: 'denied',
        reason: 'not_allowed',
      },
      { kind: 'rejected', time: agoIso(26 * 60), type: 'face', reason: 'not_recognized' },
      { kind: 'lockout', time: agoIso(26 * 60 + 2), action: 'lockout' },
      {
        kind: 'enrolled',
        time: agoIso(40 * 60),
        ok: true,
        user_id: 1003,
        type: 'palm',
        type_requested: 'palm',
        name: 'Lucie',
        attempts: 2,
      },
      {
        kind: 'enrolled',
        time: agoIso(40 * 60 + 1),
        ok: false,
        type_requested: 'palm',
        name: 'Lucie',
        reason: 'face_instead_of_palm',
      },
      {
        kind: 'recognized',
        time: agoIso(27 * 60),
        name: 'Lucie',
        type: 'palm',
        user_id: 1003,
        decision: 'granted',
      },
    ],
    log,
    logbook: q.get('access_log') === 'empty' ? [] : logbook,
    lockActions,
    serviceMode: () => hass.states[E.service]?.state === 'on',
    onEntity: (action, data) => {
      if (action === 'service_mode' || action === 'biometric')
        set(action === 'service_mode' ? E.service : E.biometric, data.on ? 'on' : 'off');
      if (action === 'recognition_action')
        set(E.action, String(data.option), { options: ['Odemknout', 'Otevřít západku'] });
      if (action === 'reset_lockout') set(E.lockout, 'off');
      refresh();
    },
  });
  if (q.get('enroll_progress') === '1')
    // the firmware mirrors every progress event into its three entities
    void accessApi.subscribe((e) => {
      if (e.event !== 'enroll_progress') return;
      set(E.enrollProgress, e.data.state ?? 'idle');
      set(E.enrollHint, e.data.text ?? '');
      set(E.enrollRemaining, String(e.data.remaining_s ?? 0));
      refresh();
    });
  Object.assign(window, { __hbAccess: accessApi, __hbAccessLog: log });
  setAccessApiFactory(() => accessApi);
}

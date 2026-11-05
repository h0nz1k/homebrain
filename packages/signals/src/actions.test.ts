import { expect, it } from 'vitest';
import { resolveAction, resolveActionState } from './actions.js';
import { NOW, signal } from './__fixtures__/helpers.js';
import { rank } from './rank.js';

const s = signal({
  action: {
    type: 'service',
    label: 'Spustit',
    service: 'script.turn_on',
    target: 'energy.washer_start',
    confirm: false,
  },
});
const allowlist = [{ service: 'script.turn_on', target: 'energy.washer_start', confirm: true }];
it('rejects services absent from an exact service and target allowlist', () => {
  for (const list of [
    undefined,
    [],
    [{ ...allowlist[0]!, target: 'energy.other' }],
    [{ ...allowlist[0]!, service: 'script.other' }],
    [{ service: 'script.turn_on', confirm: false }],
  ]) {
    expect(resolveActionState(s, { allowlist: list, haConnected: true, stale: false })).toEqual({
      enabled: false,
      reason: 'Akce není povolena',
    });
  }
});
it('reports denial, disconnection and stale data in priority order', () => {
  expect(resolveActionState(s, { haConnected: false, stale: true })?.reason).toBe(
    'Akce není povolena',
  );
  expect(resolveActionState(s, { allowlist, haConnected: false, stale: true })?.reason).toBe(
    'HA nedostupný',
  );
  expect(resolveActionState(s, { allowlist, haConnected: true, stale: true })?.reason).toBe(
    'Data jsou zastaralá',
  );
  expect(resolveActionState(s, { allowlist, haConnected: true, stale: false })).toEqual({
    enabled: true,
  });
});
it.each([
  { type: 'ack', label: 'Hotovo' },
  { type: 'navigate', label: 'Detail', href: '/system' },
] as const)('never disables $type', (action) => {
  expect(resolveActionState(signal({ action }), { haConnected: false, stale: true })).toEqual({
    enabled: true,
  });
});
it('returns undefined when no action exists', () => {
  expect(resolveActionState(signal(), { haConnected: false, stale: true })).toBeUndefined();
});
it('enforces allowlist confirmation in effective actions without mutation', () => {
  const snapshot = structuredClone(s);
  expect(resolveAction(s, allowlist)).toMatchObject({ confirm: true });
  expect(rank([s], NOW, { allowlist }).hero?.action).toMatchObject({ confirm: true });
  expect(rank([s], NOW).hero?.actionState?.enabled).toBe(false);
  expect(s).toEqual(snapshot);
  expect(
    resolveAction(
      signal({
        action: {
          ...s.action!,
          type: 'service',
          service: 'script.turn_on',
          target: 'energy.washer_start',
          confirm: true,
        },
      }),
      [{ ...allowlist[0]!, confirm: false }],
    ),
  ).toMatchObject({ confirm: true });
});

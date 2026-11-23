import { describe, expect, it } from 'vitest';
import {
  PENDING_TIMEOUT_MS,
  actionOfPlan,
  pendingPhase,
  type PendingCommand,
  type RobotSnapshot,
} from './pending.js';

const docked: RobotSnapshot = { tone: 'docked', code: 'charging_complete', stamp: 'a' };
const sent = (action: PendingCommand['action'], from: RobotSnapshot = docked): PendingCommand => ({
  action,
  sentAt: 1000,
  from,
});

describe('pending command', () => {
  it('waits until the vacuum state confirms, then done', () => {
    const p = sent('start');
    expect(pendingPhase(p, docked, 2000)).toBe('waiting');
    expect(
      pendingPhase(p, { tone: 'cleaning', code: 'segment_cleaning', stamp: 'b' }, 30_000),
    ).toBe('done');
  });
  it('turns late after 60 s without a reaction (no auto retry)', () => {
    expect(
      pendingPhase(
        sent('pause', { ...docked, tone: 'cleaning', code: 'cleaning' }),
        { ...docked, tone: 'cleaning', code: 'cleaning' },
        1000 + PENDING_TIMEOUT_MS,
      ),
    ).toBe('late');
  });
  it('an error or a dock return counts as a reaction', () => {
    const cleaning = { tone: 'cleaning' as const, code: 'cleaning', stamp: 'a' };
    expect(pendingPhase(sent('home', cleaning), { ...cleaning, tone: 'returning' }, 5000)).toBe(
      'done',
    );
    expect(pendingPhase(sent('start'), { ...docked, tone: 'error' }, 5000)).toBe('done');
  });
  it('start while already cleaning confirms by a fresh state', () => {
    const cleaning = { tone: 'cleaning' as const, code: 'segment_cleaning', stamp: 'a' };
    expect(pendingPhase(sent('start', cleaning), cleaning, 5000)).toBe('waiting');
    expect(pendingPhase(sent('start', cleaning), { ...cleaning, stamp: 'b' }, 5000)).toBe('done');
  });
  it('maps plans to actions', () => {
    expect(actionOfPlan(['vacuum.pause'], false)).toBe('pause');
    expect(actionOfPlan(['vacuum.return_to_base'], false)).toBe('home');
    expect(actionOfPlan(['vacuum.start'], false)).toBe('resume');
    expect(actionOfPlan(['select.select_option', 'vacuum.send_command'], true)).toBe('start');
    expect(actionOfPlan(['button.press'], false)).toBeNull();
    expect(actionOfPlan(['vacuum.send_command'], false)).toBeNull();
  });
});

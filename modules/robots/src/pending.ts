import type { RobotTone } from './status.js';

/**
 * „Příkaz odeslán“: Roborock reports a new state only 20–40 s after a command (cloud poll),
 * so the panel shows an optimistic „Odesláno, čekám na robota…“ until the vacuum state
 * confirms it, and after `PENDING_TIMEOUT_MS` „Robot zatím nereagoval“ with a manual retry
 * (never an automatic one).
 */
export type PendingAction = 'start' | 'pause' | 'resume' | 'home';

export interface PendingCommand {
  action: PendingAction;
  /** Epoch ms when the command was sent. */
  sentAt: number;
  /** Robot state when it was sent: a robot already in the wanted state confirms by a change. */
  from: RobotSnapshot;
}

export interface RobotSnapshot {
  tone: RobotTone;
  code: string;
  /** Newest `last_updated` of the robot's state entities. */
  stamp: string | null;
}

export type PendingPhase = 'waiting' | 'late' | 'done';

export const PENDING_TIMEOUT_MS = 60_000;

const WANTED: Record<PendingAction, readonly RobotTone[]> = {
  start: ['cleaning'],
  resume: ['cleaning'],
  pause: ['paused', 'docked', 'charging', 'washing', 'emptying'],
  home: ['returning', 'docked', 'charging', 'washing', 'emptying'],
};

export function pendingPhase(
  pending: PendingCommand | null,
  robot: RobotSnapshot,
  now: number,
): PendingPhase {
  if (!pending) return 'done';
  // An error is a reaction too: the problem card takes over.
  if (robot.tone === 'error') return 'done';
  const { from } = pending;
  const changed =
    robot.tone !== from.tone ||
    robot.code !== from.code ||
    (!!robot.stamp && robot.stamp !== from.stamp);
  if (WANTED[pending.action].includes(robot.tone) && changed) return 'done';
  return now - pending.sentAt >= PENDING_TIMEOUT_MS ? 'late' : 'waiting';
}

export const PENDING_TEXT: Record<Exclude<PendingPhase, 'done'>, string> = {
  waiting: 'Odesláno, čekám na robota…',
  late: 'Robot zatím nereagoval',
};

/** „Start úklidu zatím bez odezvy“: the late notice names the command that got no reply. */
export const PENDING_ACTION_LABEL: Record<PendingAction, string> = {
  start: 'Start úklidu',
  resume: 'Pokračování v úklidu',
  pause: 'Pauza',
  home: 'Návrat do doku',
};

export function lateTitle(action: PendingAction): string {
  return `${PENDING_ACTION_LABEL[action]} zatím bez odezvy`;
}

/** Which pending action a confirmed plan stands for (null = not a robot command). */
export function actionOfPlan(services: readonly string[], start: boolean): PendingAction | null {
  if (start) return 'start';
  if (services.includes('vacuum.pause')) return 'pause';
  if (services.includes('vacuum.return_to_base')) return 'home';
  if (services.includes('vacuum.start')) return 'resume';
  return null;
}

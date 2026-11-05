import { describe, expect, it } from 'vitest';
import type { ConnectionLike } from '@homebrain/ha-client';
import { activeMap, orderBadge, orderedNames, pruneOrder, toggleRoom } from './rooms.js';
import {
  fanChoices,
  modeFromOption,
  planCleanRooms,
  planResumeAfterFix,
  planSimple,
  ROBOT_SERVICE_ALLOWLIST,
  runPlan,
  type ServiceCallPlan,
} from './commands.js';

const rooms = [
  { id: 1, name: 'Obývací pokoj' },
  { id: 2, name: 'Kuchyně' },
  { id: 3, name: 'Jídelna' },
];

describe('cleaning order', () => {
  it('appends in click order and closes gaps on removal', () => {
    let order: number[] = [];
    order = toggleRoom(order, 3);
    order = toggleRoom(order, 1);
    order = toggleRoom(order, 2);
    expect(order).toEqual([3, 1, 2]);
    expect(orderBadge(order, 2)).toBe(3);
    order = toggleRoom(order, 3);
    expect(order).toEqual([1, 2]);
    expect(orderBadge(order, 2)).toBe(2);
    expect(orderBadge(order, 3)).toBeNull();
    expect(orderedNames(order, rooms)).toEqual(['Obývací pokoj', 'Kuchyně']);
  });
  it('drops rooms missing from a reloaded map', () => {
    expect(pruneOrder([9, 2, 1], rooms)).toEqual([2, 1]);
  });
  it('picks the active map by name or HA "Map <flag>" label', () => {
    const maps = [
      { flag: 0, name: 'Dole', rooms },
      { flag: 1, name: '', rooms: [] },
    ];
    expect(activeMap(maps, 'Map 1')?.flag).toBe(1);
    expect(activeMap(maps, 'Dole')?.flag).toBe(0);
    expect(activeMap(maps, null)?.flag).toBe(0);
    expect(activeMap([], 'x')).toBeNull();
  });
});

describe('command plans', () => {
  it('cleans rooms in order with app_segment_clean after mode and suction changes', () => {
    const plan = planCleanRooms({
      vacuum: 'vacuum.robot',
      rooms: [rooms[2]!, rooms[0]!],
      mode: 'mop',
      currentMode: 'both',
      modeSelect: 'select.robot_mode',
      fan: 'turbo',
      currentFan: 'balanced',
    });
    expect(plan.map((step) => step.service)).toEqual([
      'select.select_option',
      'vacuum.set_fan_speed',
      'vacuum.send_command',
    ]);
    expect(plan[0]!.data).toEqual({ option: 'mop' });
    expect(plan[2]!.data).toEqual({
      command: 'app_segment_clean',
      params: [{ segments: [3, 1], repeat: 1 }],
    });
    expect(plan[2]!.summary).toBe('Uklidit: 1. Jídelna → 2. Obývací pokoj');
  });
  it('skips unchanged mode/suction', () => {
    const plan = planCleanRooms({
      vacuum: 'vacuum.robot',
      rooms: [rooms[0]!],
      mode: 'both',
      currentMode: 'both',
      modeSelect: 'select.robot_mode',
      fan: 'balanced',
      currentFan: 'balanced',
    });
    expect(plan).toHaveLength(1);
  });
  it('maps select options and fan speeds', () => {
    expect(modeFromOption('vac_and_mop')).toBe('both');
    expect(modeFromOption('custom')).toBeNull();
    expect(fanChoices(['off', 'max', 'quiet', 'custom', 'balanced', 'max_plus'])).toEqual([
      'quiet',
      'balanced',
      'max',
    ]);
    expect(fanChoices(['quiet', 'max', 'smart_mode'], 'smart_mode')).toEqual([
      'quiet',
      'max',
      'smart_mode',
    ]);
  });
  it('sends through call_service and refuses services off the allowlist', async () => {
    const sent: Record<string, unknown>[] = [];
    const connection: ConnectionLike = {
      async sendMessagePromise<T>(message: { type: string }) {
        sent.push(message as Record<string, unknown>);
        return undefined as T;
      },
    };
    await runPlan(connection, planSimple('home', 'vacuum.robot'));
    expect(sent).toEqual([
      {
        type: 'call_service',
        domain: 'vacuum',
        service: 'return_to_base',
        service_data: {},
        target: { entity_id: 'vacuum.robot' },
      },
    ]);
    const evil = [
      { service: 'lock.unlock', entityId: 'lock.door', summary: '' },
    ] as unknown as ServiceCallPlan[];
    await expect(runPlan(connection, evil)).rejects.toThrow('není povolena');
    expect(sent).toHaveLength(1);
    expect(ROBOT_SERVICE_ALLOWLIST).not.toContain('vacuum.clean_spot');
  });
  it('resumes after a fixed error with one allowlisted vacuum.start', () => {
    const plan = planResumeAfterFix('vacuum.robot', 'Zamotaný hlavní kartáč');
    expect(plan).toEqual([
      {
        service: 'vacuum.start',
        entityId: 'vacuum.robot',
        summary: 'Závada „Zamotaný hlavní kartáč“ je odstraněná – pokračovat v úklidu',
      },
    ]);
    expect(ROBOT_SERVICE_ALLOWLIST).toContain(plan[0]!.service);
  });
});

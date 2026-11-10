import { useEffect, useRef, useState } from 'react';
import type { ConnectionLike } from '@homebrain/ha-client';
import type { CleanMode } from './commands.js';
import type { RobotModel } from './model.js';
import {
  loadRobotsUi,
  mergeSlotMemory,
  saveRobotsUi,
  slotMemoryForRobot,
  type RobotsUiStore,
  type SlotUiMemory,
} from './uiMemory.js';

const DEBOUNCE_MS = 400;

export interface RobotsUiMemoryState {
  advanced: boolean;
  modePick: CleanMode | null;
  fanPick: string | null;
  waterPick: string | null;
  routePick: string | null;
  passesPick: number | null;
  presetIdPick: string | null;
}

export function useRobotsUiMemory(
  connection: ConnectionLike | null | undefined,
  robot: RobotModel,
  presetIds: readonly string[],
  memory: RobotsUiMemoryState,
  apply: (patch: SlotUiMemory) => void,
): { rememberPreset: (preset: SlotUiMemory) => void } {
  const storeRef = useRef<RobotsUiStore | null>(null);
  const [hydratedSlot, setHydratedSlot] = useState<number | null>(null);
  const skipSave = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const ready = hydratedSlot === robot.slot;

  useEffect(() => {
    let cancelled = false;
    skipSave.current = true;
    const slot = robot.slot;
    void loadRobotsUi(connection).then((store) => {
      if (cancelled) return;
      storeRef.current = store;
      const slotMem = slotMemoryForRobot(robot, presetIds, store.slots[String(slot)]);
      if (slotMem) apply(slotMem);
      setHydratedSlot(slot);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload per robot slot
  }, [robot.slot]);

  useEffect(() => {
    if (!ready) return;
    if (skipSave.current) {
      skipSave.current = false;
      return;
    }
    const patch: SlotUiMemory = {
      advanced: memory.advanced,
    };
    if (memory.modePick !== null) patch.mode = memory.modePick;
    if (memory.fanPick !== null) patch.fan = memory.fanPick;
    if (memory.waterPick !== null) patch.water = memory.waterPick;
    if (memory.routePick !== null) patch.route = memory.routePick;
    if (memory.passesPick !== null) patch.passes = memory.passesPick;
    if (memory.presetIdPick) patch.presetId = memory.presetIdPick;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const base = storeRef.current ?? { v: 1 as const, slots: {} };
      const next = mergeSlotMemory(base, robot.slot, patch);
      storeRef.current = next;
      void saveRobotsUi(connection, next);
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer.current);
  }, [
    ready,
    connection,
    robot.slot,
    memory.advanced,
    memory.modePick,
    memory.fanPick,
    memory.waterPick,
    memory.routePick,
    memory.passesPick,
    memory.presetIdPick,
  ]);

  return {
    rememberPreset(patch: SlotUiMemory) {
      if (!ready) return;
      const base = storeRef.current ?? { v: 1 as const, slots: {} };
      const next = mergeSlotMemory(base, robot.slot, patch);
      storeRef.current = next;
      void saveRobotsUi(connection, next);
    },
  };
}

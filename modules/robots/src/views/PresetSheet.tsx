import { useState } from 'react';
import { useBackClosable } from '@homebrain/ha-client';
import { Button, Chip, SegmentedControl, Sheet } from '@homebrain/ui';
import {
  CLEAN_MODE_LABELS,
  FAN_LABELS,
  MOP_ROUTE_LABELS,
  WATER_LABELS,
  modeMops,
  type CleanMode,
} from '../commands.js';
import type { RobotModel } from '../model.js';
import {
  MAX_PASSES,
  PRESET_NAME_MAX,
  fitSettings,
  robotCapabilities,
  validateDraft,
  type CleanSettings,
  type PresetDraft,
  type RobotPreset,
} from '../presets.js';
import { orderBadge, toggleRoom } from '../rooms.js';

export type PresetEditorTarget =
  { kind: 'defaults' } | { kind: 'preset'; preset: RobotPreset | null };

export interface PresetSheetProps {
  robot: RobotModel;
  target: PresetEditorTarget;
  defaults: CleanSettings | null;
  presets: RobotPreset[];
  busy: boolean;
  onClose: () => void;
  onSave: (draft: PresetDraft) => void;
  onDelete?: (preset: RobotPreset) => void;
}

const KEEP = '__keep';

/**
 * Editor for the robot's default cleaning setup or a named preset. Only the fields the robot
 * exposes are shown (mode/suction/water/route differ per model); „Ponechat“ keeps the robot's
 * current value. Presets may add rooms in order (none = whole home).
 */
export function PresetSheet({
  robot,
  target,
  defaults,
  presets,
  busy,
  onClose,
  onSave,
  onDelete,
}: PresetSheetProps) {
  useBackClosable(onClose);
  const caps = robotCapabilities(robot);
  const source = target.kind === 'preset' ? target.preset : null;
  const [draft, setDraft] = useState<PresetDraft>(() => ({
    ...fitSettings(source ?? defaults ?? { ...robotNow(robot), passes: 1 }, caps),
    name: source?.name ?? '',
    rooms: source?.rooms ?? [],
    ...(source ? { id: source.id } : {}),
  }));
  const [error, setError] = useState<string | null>(null);
  const isPreset = target.kind === 'preset';
  const set = (patch: Partial<PresetDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const submit = () => {
    const problem = isPreset ? validateDraft(draft, presets) : null;
    if (problem) return setError(problem);
    onSave(draft);
  };
  return (
    <Sheet
      title={
        isPreset ? (source ? 'Upravit předvolbu' : 'Nová předvolba') : 'Výchozí nastavení úklidu'
      }
      onClose={onClose}
      stickyFooter
      data-testid="robots-preset-editor"
      footer={
        <div className="rb-sheet-actions">
          {isPreset && source && onDelete && (
            <Button
              variant="ghost"
              data-testid="robots-preset-delete"
              disabled={busy}
              onClick={() => onDelete(source)}
            >
              Smazat
            </Button>
          )}
          <Button onClick={onClose} disabled={busy}>
            Zrušit
          </Button>
          <Button
            variant="primary"
            data-testid="robots-preset-save"
            loading={busy}
            disabled={busy}
            onClick={submit}
          >
            Uložit
          </Button>
        </div>
      }
    >
      <p className="rb-sub">
        {isPreset
          ? `${robot.name} · spustíte jedním klepnutím`
          : `${robot.name} · použije se při každém spuštění z HomeBrainu bez předvolby`}
      </p>
      <div className="rb-editor">
        {isPreset && (
          <label className="rb-field">
            <span className="rb-micro">Název</span>
            <input
              data-testid="robots-preset-name"
              value={draft.name}
              maxLength={PRESET_NAME_MAX}
              placeholder="např. Rychlé vysátí"
              onChange={(event) => {
                set({ name: event.target.value });
                setError(null);
              }}
            />
          </label>
        )}
        <CleanSettingsFields robot={robot} value={draft} onChange={set} />
        {isPreset && (
          <RoomOrderChips
            robot={robot}
            rooms={draft.rooms}
            onChange={(rooms) => set({ rooms })}
            label="Místnosti předvolby"
            testIdPrefix="robots-preset-room"
          />
        )}
        {error && (
          <p className="rb-form-error" role="alert" data-testid="robots-preset-error">
            {error}
          </p>
        )}
      </div>
    </Sheet>
  );
}

/** Mode / suction / water / route / passes – only what the robot exposes („Ponechat“ = keep). */
export function CleanSettingsFields({
  robot,
  value,
  onChange,
}: {
  robot: RobotModel;
  value: CleanSettings;
  onChange: (patch: Partial<CleanSettings>) => void;
}) {
  const caps = robotCapabilities(robot);
  const mops = modeMops(value.mode ?? robot.mode);
  const pick = (option: string) => (option === KEEP ? null : option);
  const withKeep = (options: [string, string][]) => [
    [KEEP, 'Ponechat'] as [string, string],
    ...options,
  ];
  return (
    <>
      {caps.modes.length > 1 && (
        <SegmentedControl
          label="Režim"
          tone="accent"
          value={value.mode ?? KEEP}
          options={withKeep(caps.modes.map((m) => [m, CLEAN_MODE_LABELS[m]]))}
          onChange={(v) => onChange({ mode: pick(v) as CleanMode | null })}
        />
      )}
      {caps.fans.length > 1 && value.mode !== 'mop' && (
        <SegmentedControl
          label="Sání"
          tone="accent"
          value={value.fan ?? KEEP}
          options={withKeep(caps.fans.map((f) => [f, FAN_LABELS[f] ?? f]))}
          onChange={(v) => onChange({ fan: pick(v) })}
        />
      )}
      {mops && caps.water.length > 1 && (
        <SegmentedControl
          label="Voda"
          tone="accent"
          value={value.water ?? KEEP}
          options={withKeep(caps.water.map((w) => [w, WATER_LABELS[w] ?? w]))}
          onChange={(v) => onChange({ water: pick(v) })}
        />
      )}
      {mops && caps.routes.length > 1 && (
        <SegmentedControl
          label="Mopování"
          tone="accent"
          value={value.route ?? KEEP}
          options={withKeep(caps.routes.map((r) => [r, MOP_ROUTE_LABELS[r] ?? r]))}
          onChange={(v) => onChange({ route: pick(v) })}
        />
      )}
      <SegmentedControl
        label="Průchody"
        tone="accent"
        value={String(value.passes)}
        options={Array.from({ length: MAX_PASSES }, (_, i) => [String(i + 1), `${i + 1}×`])}
        onChange={(v) => onChange({ passes: Number(v) })}
      />
    </>
  );
}

/** Room chips with order badges (none selected = whole home). */
export function RoomOrderChips({
  robot,
  rooms,
  onChange,
  label,
  testIdPrefix,
}: {
  robot: RobotModel;
  rooms: number[];
  onChange: (rooms: number[]) => void;
  label: string;
  testIdPrefix: string;
}) {
  if (!robot.rooms.length) return null;
  return (
    <div className="rb-editor-rooms">
      <p className="rb-micro">
        Místnosti v pořadí · {rooms.length ? 'jen vybrané' : 'žádná = celý byt'}
      </p>
      <div className="rb-chips rb-chips-wrap" role="group" aria-label={label}>
        {robot.rooms.map((room) => {
          const badge = orderBadge(rooms, room.id);
          return (
            <Chip
              key={room.id}
              className="rb-chip"
              look="soft"
              pressed={badge !== null}
              badge={badge}
              badgeLabel={badge !== null ? `pořadí ${badge}` : undefined}
              data-testid={`${testIdPrefix}-${room.id}`}
              onPress={() => onChange(toggleRoom(rooms, room.id))}
            >
              <span className="rb-chip-name">{room.name}</span>
            </Chip>
          );
        })}
      </div>
    </div>
  );
}

export function robotNow(robot: RobotModel): CleanSettings {
  return {
    mode: robot.mode,
    fan: robot.fan,
    water: robot.water?.value ?? null,
    route: robot.mopRoute?.value ?? null,
    passes: 1,
  };
}

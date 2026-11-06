import { useCallback, useEffect, useState } from 'react';
import { useBackClosable, type ConnectionLike } from '@homebrain/ha-client';
import { Button, Card, Chip, Pill, Sheet, Switch, useToast } from '@homebrain/ui';
import type { RobotModel } from '../model.js';
import { EMPTY_SETTINGS, type PresetsBySlot, type RobotPreset } from '../presets.js';
import {
  DAY_LABELS,
  DEFAULT_QUIET,
  SCHEDULE_NAME_MAX,
  REASON_LABELS,
  deleteSchedule,
  describeDays,
  fetchSchedules,
  formatWhen,
  pauseSchedules,
  runBadge,
  saveSchedule,
  saveScheduleSettings,
  scheduleWhat,
  validateSchedule,
  type ScheduleDraft,
  type ScheduleSettings,
  type ScheduleView,
  type SchedulesOverview,
} from '../schedules.js';
import { CleanSettingsFields, RoomOrderChips } from './PresetSheet.js';

const CUSTOM = '__custom';
const errorText = (error: unknown) =>
  error instanceof Error && error.message ? `: ${error.message}` : '.';

/**
 * Plány úklidu of the selected robot: list (next run, last result), editor sheet and the
 * global pause / quiet hours. The integration runs them; nothing starts from the panel here.
 */
export function SchedulesCard({
  robot,
  connection,
  presets,
}: {
  robot: RobotModel;
  connection: ConnectionLike;
  presets: PresetsBySlot;
}) {
  const [data, setData] = useState<SchedulesOverview | null>(null);
  const [editing, setEditing] = useState<ScheduleView | 'new' | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const notify = useToast();
  const load = useCallback(() => {
    fetchSchedules(connection)
      .then(setData)
      .catch(() => setData(null));
  }, [connection]);
  useEffect(() => {
    load();
  }, [load]);
  if (!data) return null;
  const settings = data.settings ?? DEFAULT_QUIET;
  const mine = data.schedules.filter((s) => s.slot === robot.slot);
  const paused = settings.paused_until;
  const act = async (work: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await work();
      notify.success(ok);
      load();
      return true;
    } catch (error) {
      notify.error(`Nepodařilo se uložit${errorText(error)}`);
      return false;
    } finally {
      setBusy(false);
    }
  };
  const toggle = (schedule: ScheduleView, enabled: boolean) =>
    void act(
      () => saveSchedule(connection, { ...schedule, enabled }),
      enabled ? `Plán „${schedule.name}“ zapnut.` : `Plán „${schedule.name}“ vypnut.`,
    );
  return (
    <Card as="article" className="rb-card rb-sched" data-testid="robots-schedules">
      <div className="rb-card-head">
        <h3>Plány úklidu</h3>
        <div className="rb-card-head-side">
          <Button
            size="sm"
            variant="ghost"
            data-testid="robots-schedules-settings"
            onClick={() => setSettingsOpen(true)}
          >
            {paused ? 'Pozastaveno' : 'Pozastavit plány'}
          </Button>
          <Button size="sm" data-testid="robots-schedule-add" onClick={() => setEditing('new')}>
            + Plán
          </Button>
        </div>
      </div>
      {paused && (
        <p className="rb-sched-paused" role="status" data-testid="robots-schedules-paused">
          Plány jsou pozastavené do {new Date(`${paused}T12:00:00`).toLocaleDateString('cs-CZ')}{' '}
          (včetně).
        </p>
      )}
      {mine.length === 0 ? (
        <p className="rb-sub rb-sched-empty">
          Žádný plán. Např. „každý den vysát chodbu na tichý výkon“ nebo „každou středu vytřít“.
        </p>
      ) : (
        <ul className="rb-sched-list">
          {mine.map((schedule) => {
            const badge = runBadge(schedule.last_run);
            return (
              <li
                key={schedule.id}
                className="rb-sched-item"
                data-enabled={schedule.enabled || undefined}
                data-testid={`robots-schedule-${schedule.id}`}
              >
                <button
                  type="button"
                  className="rb-sched-main"
                  aria-label={`Upravit plán ${schedule.name}`}
                  onClick={() => setEditing(schedule)}
                >
                  <span className="rb-sched-time">{schedule.time}</span>
                  <span className="rb-sched-text">
                    <span className="rb-sched-name">{schedule.name}</span>
                    <span className="rb-sched-meta">
                      {describeDays(schedule.days)} · {scheduleWhat(schedule, presets)}
                    </span>
                    <span className="rb-sched-meta" data-testid="robots-schedule-next">
                      {schedule.pending
                        ? `Další pokus ${formatWhen(schedule.pending.next_try)} · ${
                            REASON_LABELS[schedule.pending.reason ?? ''] ?? 'čeká'
                          }`
                        : schedule.next_run
                          ? `Příště ${formatWhen(schedule.next_run)}`
                          : schedule.enabled
                            ? 'Neplánováno'
                            : 'Vypnuto'}
                    </span>
                  </span>
                </button>
                <span className="rb-sched-side">
                  {badge && (
                    <Pill
                      size="sm"
                      tone={badge.tone}
                      data-testid="robots-schedule-result"
                      title={schedule.last_run ? formatWhen(schedule.last_run.at) : undefined}
                    >
                      {badge.label}
                    </Pill>
                  )}
                  <Switch
                    checked={schedule.enabled}
                    label={`Plán ${schedule.name} zapnutý`}
                    disabled={busy}
                    data-testid="robots-schedule-toggle"
                    onChange={(next) => toggle(schedule, next)}
                  />
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <p className="rb-micro rb-sched-foot">
        Noční klid {settings.quiet_start}–{settings.quiet_end} · robot musí být v doku s baterií
        aspoň {data.min_battery} %, jinak to zkusí znovu každých {data.retry_minutes} min ·
        upozornění jen při chybě
      </p>
      {editing && (
        <ScheduleSheet
          robot={robot}
          schedule={editing === 'new' ? null : editing}
          presets={presets[String(robot.slot)]?.presets ?? []}
          settings={settings}
          busy={busy}
          onClose={() => !busy && setEditing(null)}
          onSave={async (draft) => {
            if (
              await act(
                () => saveSchedule(connection, draft),
                `Plán „${draft.name.trim()}“ uložen.`,
              )
            )
              setEditing(null);
          }}
          onDelete={async (schedule) => {
            if (await act(() => deleteSchedule(connection, schedule.id), 'Plán smazán.'))
              setEditing(null);
          }}
        />
      )}
      {settingsOpen && (
        <ScheduleSettingsSheet
          overview={data}
          busy={busy}
          onClose={() => !busy && setSettingsOpen(false)}
          onSave={async (patch, pause) => {
            const ok = await act(async () => {
              await saveScheduleSettings(connection, patch);
              await pauseSchedules(connection, pause);
            }, 'Nastavení plánů uloženo.');
            if (ok) setSettingsOpen(false);
          }}
        />
      )}
    </Card>
  );
}

export function ScheduleSheet({
  robot,
  schedule,
  presets,
  settings,
  busy,
  onClose,
  onSave,
  onDelete,
}: {
  robot: RobotModel;
  schedule: ScheduleView | null;
  presets: RobotPreset[];
  settings: ScheduleSettings;
  busy: boolean;
  onClose: () => void;
  onSave: (draft: ScheduleDraft) => void;
  onDelete: (schedule: ScheduleView) => void;
}) {
  useBackClosable(onClose);
  const [draft, setDraft] = useState<ScheduleDraft>(() => ({
    ...(schedule ? { id: schedule.id } : {}),
    name: schedule?.name ?? '',
    slot: robot.slot,
    preset_id: schedule ? schedule.preset_id : (presets[0]?.id ?? null),
    settings: schedule?.settings ?? (schedule ? null : { ...EMPTY_SETTINGS }),
    rooms: schedule?.rooms ?? [],
    days: schedule?.days ?? [0, 1, 2, 3, 4, 5, 6],
    time: schedule?.time ?? '10:00',
    enabled: schedule?.enabled ?? true,
  }));
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<ScheduleDraft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setError(null);
  };
  const custom = draft.preset_id === null;
  const submit = () => {
    const problem = validateSchedule(draft, settings);
    if (problem) return setError(problem);
    onSave(draft);
  };
  return (
    <Sheet
      title={schedule ? 'Upravit plán' : 'Nový plán úklidu'}
      onClose={onClose}
      stickyFooter
      data-testid="robots-schedule-editor"
      footer={
        <div className="rb-sheet-actions">
          {schedule && (
            <Button
              variant="ghost"
              data-testid="robots-schedule-delete"
              disabled={busy}
              onClick={() => onDelete(schedule)}
            >
              Smazat
            </Button>
          )}
          <Button onClick={onClose} disabled={busy}>
            Zrušit
          </Button>
          <Button
            variant="primary"
            data-testid="robots-schedule-save"
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
        {robot.name} · spouští Home Assistant i bez otevřeného panelu, mimo noční klid{' '}
        {settings.quiet_start}–{settings.quiet_end}
      </p>
      <div className="rb-editor">
        <label className="rb-field">
          <span className="rb-micro">Název</span>
          <input
            data-testid="robots-schedule-name"
            value={draft.name}
            maxLength={SCHEDULE_NAME_MAX}
            placeholder="např. Chodba potichu"
            onChange={(event) => set({ name: event.target.value })}
          />
        </label>
        <div className="rb-field">
          <span className="rb-micro">Dny</span>
          <div className="rb-chips rb-sched-days" role="group" aria-label="Dny v týdnu">
            {DAY_LABELS.map((label, day) => (
              <Chip
                key={label}
                className="rb-chip"
                look="soft"
                pressed={draft.days.includes(day)}
                data-testid={`robots-schedule-day-${day}`}
                onPress={() =>
                  set({
                    days: draft.days.includes(day)
                      ? draft.days.filter((d) => d !== day)
                      : [...draft.days, day].sort((a, b) => a - b),
                  })
                }
              >
                {label}
              </Chip>
            ))}
          </div>
        </div>
        <div className="rb-sched-row">
          <label className="rb-field">
            <span className="rb-micro">Čas</span>
            <input
              type="time"
              data-testid="robots-schedule-time"
              value={draft.time}
              onChange={(event) => set({ time: event.target.value })}
            />
          </label>
          <div className="rb-field rb-sched-enabled">
            <span className="rb-micro">Zapnutý</span>
            <Switch
              checked={draft.enabled}
              label="Plán zapnutý"
              onChange={(enabled) => set({ enabled })}
            />
          </div>
        </div>
        <div className="rb-field">
          <span className="rb-micro">Co uklidit</span>
          <div className="rb-chips rb-chips-wrap" role="radiogroup" aria-label="Předvolba">
            {[...presets.map((p) => [p.id, p.name] as const), [CUSTOM, 'Vlastní'] as const].map(
              ([id, name]) => {
                const checked = (draft.preset_id ?? CUSTOM) === id;
                return (
                  <Chip
                    key={id}
                    className="rb-chip"
                    look="soft"
                    pressed={checked}
                    data-testid={`robots-schedule-preset-${id === CUSTOM ? 'custom' : id}`}
                    onPress={() =>
                      set(
                        id === CUSTOM
                          ? { preset_id: null, settings: draft.settings ?? { ...EMPTY_SETTINGS } }
                          : { preset_id: id },
                      )
                    }
                  >
                    {name}
                  </Chip>
                );
              },
            )}
          </div>
        </div>
        {custom && (
          <>
            <CleanSettingsFields
              robot={robot}
              value={draft.settings ?? EMPTY_SETTINGS}
              onChange={(patch) =>
                set({ settings: { ...(draft.settings ?? EMPTY_SETTINGS), ...patch } })
              }
            />
            <RoomOrderChips
              robot={robot}
              rooms={draft.rooms}
              onChange={(rooms) => set({ rooms })}
              label="Místnosti plánu"
              testIdPrefix="robots-schedule-room"
            />
          </>
        )}
        {error && (
          <p className="rb-form-error" role="alert" data-testid="robots-schedule-error">
            {error}
          </p>
        )}
      </div>
    </Sheet>
  );
}

function ScheduleSettingsSheet({
  overview,
  busy,
  onClose,
  onSave,
}: {
  overview: SchedulesOverview;
  busy: boolean;
  onClose: () => void;
  onSave: (
    patch: { quiet_start: string; quiet_end: string; notify_service: string | null },
    pause: string | null,
  ) => void;
}) {
  useBackClosable(onClose);
  const [quietStart, setQuietStart] = useState(overview.settings.quiet_start);
  const [quietEnd, setQuietEnd] = useState(overview.settings.quiet_end);
  const [pause, setPause] = useState(overview.settings.paused_until ?? '');
  const [service, setService] = useState(overview.notify_service ?? '');
  return (
    <Sheet
      title="Pozastavení a noční klid"
      onClose={onClose}
      stickyFooter
      data-testid="robots-schedules-settings-sheet"
      footer={
        <div className="rb-sheet-actions">
          {overview.settings.paused_until && (
            <Button
              variant="ghost"
              data-testid="robots-schedules-resume"
              disabled={busy}
              onClick={() =>
                onSave(
                  { quiet_start: quietStart, quiet_end: quietEnd, notify_service: service || null },
                  null,
                )
              }
            >
              Obnovit plány
            </Button>
          )}
          <Button onClick={onClose} disabled={busy}>
            Zrušit
          </Button>
          <Button
            variant="primary"
            data-testid="robots-schedules-settings-save"
            loading={busy}
            disabled={busy}
            onClick={() =>
              onSave(
                { quiet_start: quietStart, quiet_end: quietEnd, notify_service: service || null },
                pause || null,
              )
            }
          >
            Uložit
          </Button>
        </div>
      }
    >
      <div className="rb-editor">
        <label className="rb-field">
          <span className="rb-micro">Pozastavit všechny plány do (včetně) · např. dovolená</span>
          <input
            type="date"
            data-testid="robots-schedules-pause-until"
            value={pause}
            onChange={(event) => setPause(event.target.value)}
          />
        </label>
        <div className="rb-sched-row">
          <label className="rb-field">
            <span className="rb-micro">Noční klid od</span>
            <input
              type="time"
              data-testid="robots-quiet-start"
              value={quietStart}
              onChange={(event) => setQuietStart(event.target.value)}
            />
          </label>
          <label className="rb-field">
            <span className="rb-micro">do</span>
            <input
              type="time"
              data-testid="robots-quiet-end"
              value={quietEnd}
              onChange={(event) => setQuietEnd(event.target.value)}
            />
          </label>
        </div>
        <div className="rb-field">
          <span className="rb-micro">Upozornění na chyby navíc do telefonu</span>
          <div className="rb-chips rb-chips-wrap" role="radiogroup" aria-label="Telefon">
            {['', ...overview.available_notify_services].map((name) => (
              <Chip
                key={name || 'none'}
                className="rb-chip"
                look="soft"
                pressed={service === name}
                data-testid={`robots-notify-${name || 'none'}`}
                onPress={() => setService(name)}
              >
                {name ? name.replace(/^mobile_app_/, '') : 'Jen v Home Assistantu'}
              </Chip>
            ))}
          </div>
        </div>
      </div>
    </Sheet>
  );
}

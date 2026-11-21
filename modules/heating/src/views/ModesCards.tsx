import { Card, Callout } from '@homebrain/ui';
import {
  fishWaterRows,
  manualSeasonNote,
  poolRows,
  settingsRows,
  type InfoRow,
} from '../insights.js';
import {
  clockNotes,
  isSetbackSchedule,
  isoWeekday,
  sameEveryDay,
  setbackHint,
  weekRows,
  type WeekRow,
} from '../programs.js';
import type { HeatingSchedule, HeatingSnapshot } from '../types.js';

const pct = (v: number) => `${Math.max(0, Math.min(100, v)).toFixed(3)}%`;

export function InfoList({ rows, testid }: { rows: InfoRow[]; testid?: string }) {
  return (
    <ul className="ht-kv ht-info" data-testid={testid}>
      {rows.map((r) => (
        <li key={r.id} data-testid={`heating-row-${r.id}`} data-idle={r.idle ? '' : undefined}>
          <span className="ht-info-k">
            {r.label}
            {r.note && <small>{r.note}</small>}
          </span>
          <b>{r.value}</b>
        </li>
      ))}
    </ul>
  );
}

/* ---------- Nastavení regulace ---------- */

export function SettingsCard({ snap }: { snap: HeatingSnapshot }) {
  const rows = settingsRows(snap);
  const manual = manualSeasonNote(snap);
  if (!rows.length && !manual) return null;
  return (
    <Card className="ht-card" data-testid="heating-settings-card">
      <header className="ht-ch">
        <h3>Nastavení regulace</h3>
        <span className="ht-muted">jak regulace volí teplotu vody a sezónu</span>
      </header>
      {manual && (
        <div data-testid="heating-manual-season">
          <Callout tone="info" title="Sezóna je přepnutá ručně">
            {manual}
          </Callout>
        </div>
      )}
      {rows.length > 0 && <InfoList rows={rows} />}
    </Card>
  );
}

/* ---------- Týdenní programy ---------- */

function Ribbon({ row, nowMin }: { row: WeekRow; nowMin: number | null }) {
  return (
    <span className="ht-sched-bar">
      {row.segments.map((s) => (
        <i
          key={`${s.from}-${s.carried}`}
          data-carried={s.carried ? '' : undefined}
          style={{ left: pct((s.from / 1440) * 100), width: pct(((s.to - s.from) / 1440) * 100) }}
        />
      ))}
      {nowMin !== null && <em style={{ left: pct((nowMin / 1440) * 100) }} />}
    </span>
  );
}

function Axis() {
  return (
    <li className="ht-week-axis" aria-hidden="true">
      <span />
      <span className="ht-sched-bar">
        {[0, 6, 12, 18, 24].map((h) => (
          <b key={h} style={{ left: pct((h / 24) * 100) }}>
            {h}
          </b>
        ))}
      </span>
      <span />
    </li>
  );
}

export function WeekProgram({
  schedule,
  now,
  hint,
}: {
  schedule: HeatingSchedule;
  now: Date;
  hint?: string | null;
}) {
  const today = isoWeekday(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const rows = weekRows(schedule, today);
  if (!rows) return null;
  const empty = rows.every((r) => !r.segments.length);
  const same = !empty && sameEveryDay(rows);
  const shown: WeekRow[] = same
    ? [{ ...rows[0]!, short: 'Denně', long: 'Každý den', today: true }]
    : rows;
  return (
    <section
      className="ht-week"
      data-testid="heating-week-program"
      data-key={schedule.key}
      data-format={schedule.format ?? 'start_end'}
    >
      <h4>{schedule.label}</h4>
      {empty ? (
        <p className="ht-muted">Celý týden bez časů – program je vypnutý.</p>
      ) : (
        <ul className="ht-week-rows">
          {shown.map((r) => (
            <li
              key={r.day}
              data-today={r.today ? '' : undefined}
              data-testid="heating-week-row"
              aria-label={`${r.long}: ${r.texts.join(', ') || 'nic'}`}
            >
              <span className="ht-week-day">{r.short}</span>
              <Ribbon row={r} nowMin={r.today ? nowMin : null} />
              <span className="ht-sched-slots">{r.texts.join(', ') || '—'}</span>
            </li>
          ))}
          <Axis />
        </ul>
      )}
      {hint && (
        <p className="ht-insight ht-week-hint" data-testid="heating-setback-hint">
          {hint}
        </p>
      )}
    </section>
  );
}

export const isPoolSchedule = (s: HeatingSchedule) => s.key.startsWith('pool');

export function WeekProgramsCard({ snap, now }: { snap: HeatingSnapshot; now: Date }) {
  const schedules = snap.schedules.filter((s) => !isPoolSchedule(s));
  const withWeek = schedules.filter((s) => s.week?.length === 7);
  const notes = clockNotes(snap.clock);
  const setback = setbackHint(snap);
  const hasSetbackSchedule = schedules.some(isSetbackSchedule);
  return (
    <Card className="ht-card" data-testid="heating-programs-card">
      <header className="ht-ch">
        <h3>Týdenní programy</h3>
        <span className="ht-muted">celý týden ve skutečném čase</span>
      </header>
      {withWeek.length ? (
        withWeek.map((s) => (
          <WeekProgram
            key={s.key}
            schedule={s}
            now={now}
            hint={isSetbackSchedule(s) ? setback : null}
          />
        ))
      ) : (
        <p className="ht-muted">Regulace nehlásí žádné časové programy.</p>
      )}
      {setback && !hasSetbackSchedule && (
        <p className="ht-insight" data-testid="heating-setback-hint">
          {setback}
        </p>
      )}
      {(notes.shift || notes.drift) && withWeek.length > 0 && (
        <div className="ht-clock-notes" data-testid="heating-clock-notes">
          {notes.shift && <p className="ht-muted">{notes.shift}</p>}
          {notes.drift && (
            <p className="ht-week-drift" data-testid="heating-clock-drift">
              {notes.drift}
            </p>
          )}
        </div>
      )}
    </Card>
  );
}

/* ---------- Bazén a rybárna ---------- */

export function PoolFishCard({ snap, now }: { snap: HeatingSnapshot; now: Date }) {
  const pool = poolRows(snap);
  const fish = fishWaterRows(snap);
  const programs = snap.schedules.filter((s) => isPoolSchedule(s) && s.week?.length === 7);
  if (!pool.length && !fish.length && !programs.length) return null;
  return (
    <Card className="ht-card" data-testid="heating-pool-fish-card">
      <header className="ht-ch">
        <h3>
          {pool.length || programs.length ? (fish.length ? 'Bazén a rybárna' : 'Bazén') : 'Rybárna'}
        </h3>
      </header>
      <div className="ht-pool-grid">
        {(pool.length > 0 || programs.length > 0) && (
          <div className="ht-pool-col" data-testid="heating-pool-settings">
            {pool.length > 0 && <InfoList rows={pool} />}
            {programs.map((s) => (
              <WeekProgram key={s.key} schedule={s} now={now} />
            ))}
            {programs.some((s) => s.format === 'start_duration') && (
              <p className="ht-muted">
                Filtrace se v regulaci zadává jako čas spuštění a doba běhu; konec dopočítáváme.
              </p>
            )}
          </div>
        )}
        {fish.length > 0 && (
          <div className="ht-pool-col" data-testid="heating-fish-water">
            {(pool.length > 0 || programs.length > 0) && <h4>Rybárna – voda</h4>}
            <InfoList rows={fish} />
          </div>
        )}
      </div>
    </Card>
  );
}

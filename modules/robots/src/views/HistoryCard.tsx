import { Card, Pill } from '@homebrain/ui';
import {
  durationLabel,
  recentRuns,
  runWhen,
  type CleanRun,
  type HistoryBySlot,
} from '../history.js';

const SOURCE_LABEL = { homebrain: 'HomeBrain', aplikace: 'Aplikace' } as const;

/**
 * „Historie úklidů“: the last runs of all robots, incl. runs started from the Roborock app
 * or its schedules (recorded by the integration from HA states).
 */
export function HistoryCard({
  history,
  robotName,
  now,
  limit = 10,
}: {
  history: HistoryBySlot | null;
  robotName: (slot: number) => string;
  now: Date;
  limit?: number;
}) {
  if (history === null) return null;
  const runs = recentRuns(history, limit);
  return (
    <Card as="article" className="rb-card rb-history" data-testid="robots-history">
      <div className="rb-card-head">
        <h3>Historie úklidů</h3>
        {runs.length > 0 && <p className="rb-micro">Posledních {runs.length}</p>}
      </div>
      {runs.length ? (
        <ul className="rb-history-list">
          {runs.map((run) => (
            <HistoryRow key={run.id} run={run} robot={robotName(run.slot)} now={now} />
          ))}
        </ul>
      ) : (
        <p className="rb-note" data-testid="robots-history-empty">
          Zatím tu není žádný úklid. Objeví se po prvním dokončeném úklidu – i když ho spustíte z
          aplikace Roborock.
        </p>
      )}
    </Card>
  );
}

function HistoryRow({ run, robot, now }: { run: CleanRun; robot: string; now: Date }) {
  const meta = [
    robot,
    durationLabel(run.duration_s),
    run.area_m2 !== null ? `${Math.round(run.area_m2)}\u00a0m²` : null,
  ].filter(Boolean);
  const rooms = run.rooms.map((room) => room.name);
  return (
    <li
      className="rb-history-item"
      data-testid="robots-history-run"
      data-source={run.source ?? undefined}
    >
      <span className="rb-history-when">{runWhen(run.start, now)}</span>
      <span className="rb-history-text">
        <span className="rb-history-rooms">
          {rooms.length ? rooms.join(', ') : run.partial ? 'Místnosti neznámé' : 'Bez místností'}
        </span>
        <span className="rb-history-meta">{meta.join(' · ')}</span>
      </span>
      {run.source && (
        <Pill
          size="sm"
          className="rb-history-source"
          tone={run.source === 'homebrain' ? 'accent' : 'neutral'}
          data-testid="robots-history-source"
        >
          {SOURCE_LABEL[run.source]}
        </Pill>
      )}
    </li>
  );
}

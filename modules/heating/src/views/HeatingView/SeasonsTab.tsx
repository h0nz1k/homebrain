import { useEffect, useState } from 'react';
import { Card, EmptyState, Pill, Skeleton } from '@homebrain/ui';
import type { HeatingApi } from '../../api.js';
import { fmtNum, fmtPctChange, fmtSeasonEnergy, fmtT, seasonsModel } from '../../model.js';
import type { HeatingSeason } from '../../types.js';
import { SeasonBars } from '../charts.js';

export function SeasonsTab({ api }: { api: HeatingApi }) {
  const [rows, setRows] = useState<HeatingSeason[] | null>(null);
  useEffect(() => {
    api.seasons().then(setRows, () => setRows([]));
  }, [api]);
  if (!rows) return <Skeleton variant="block" height="320px" />;
  if (!rows.length)
    return (
      <Card className="ht-card">
        <EmptyState title="Historie sezón zatím není">
          Po importu archivu regulace se tu objeví 10 let topení.
        </EmptyState>
      </Card>
    );
  const { cards } = seasonsModel(rows);
  const noted = cards.filter((c) => c.note);
  return (
    <>
      <Card className="ht-card" data-testid="heating-seasons-chart">
        <header className="ht-ch ht-ch-wrap">
          <h3>Hodiny běhu kompresoru za sezónu</h3>
          <span className="ht-muted">sezóna = červenec–červen</span>
        </header>
        <SeasonBars cards={cards} />
        {noted.map((c) => (
          <p key={c.season} className="ht-insight" data-testid="heating-season-note">
            <b>
              {c.season}: {c.note?.charAt(0).toLowerCase()}
              {c.note?.slice(1)}.
            </b>{' '}
            Od té doby běží kompresor na 100 denostupňů zhruba {fmtNum(c.h_per_100dd, 0)}&nbsp;h
            místo dřívějších {fmtNum(cards[cards.indexOf(c) + 1]?.h_per_100dd ?? null, 0)}&nbsp;h.
          </p>
        ))}
      </Card>
      <div className="ht-seasons">
        {cards.map((c) => (
          <Card
            key={c.season}
            className="ht-season"
            data-testid="heating-season"
            data-partial={c.partial ? '' : undefined}
          >
            <header>
              <b>{c.season}</b>
              {c.partial ? (
                <Pill tone="accent" size="sm">
                  probíhá
                </Pill>
              ) : c.note ? (
                <Pill size="sm">zlom</Pill>
              ) : null}
            </header>
            {c.compressor_unavailable ? (
              <p className="ht-v" data-testid="heating-season-unavailable">
                Nedostupné
                <small> – {c.compressor_unavailable}</small>
              </p>
            ) : (
              <p className="ht-v">
                {fmtNum(c.compressor_h, 0)}
                <small>&nbsp;h běhu</small>
              </p>
            )}
            <span className="ht-share" aria-hidden="true">
              <i style={{ transform: `scaleX(${c.share})` }} />
            </span>
            <dl>
              <dt>Elektřina</dt>
              <dd>{fmtSeasonEnergy(c)}</dd>
              <dt>Starty</dt>
              <dd>{c.starts === null ? '–' : fmtNum(c.starts, 0)}</dd>
              <dt>Medián délky běhu (hodinová data, orientační)</dt>
              <dd>{c.median_run_min === null ? '–' : `${c.median_run_min}\u00a0min`}</dd>
              <dt>Na 100 denostupňů</dt>
              <dd>
                {fmtNum(c.h_per_100dd, 0)}&nbsp;h
                {c.vsPrev !== null && Math.abs(c.vsPrev) >= 0.05 && (
                  <em data-tone={c.vsPrev > 0 ? 'up' : 'down'}> {fmtPctChange(c.vsPrev)}</em>
                )}
              </dd>
              <dt>Venku ⌀</dt>
              <dd>{fmtT(c.outdoor_mean)}</dd>
              <dt>Data</dt>
              <dd>{fmtNum(c.coverage * 100, 1)}&nbsp;%</dd>
            </dl>
            {c.counter_reset && !c.compressor_unavailable && (
              <p className="ht-season-note" data-testid="heating-season-reset">
                Počítadlo v historii bylo vynulováno – součet zahrnuje jen platné denní přírůstky.
              </p>
            )}
            {c.note && <p className="ht-season-note">{c.note}</p>}
          </Card>
        ))}
      </div>
    </>
  );
}

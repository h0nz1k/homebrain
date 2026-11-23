import { useMemo, useState } from 'react';
import { Button, Card, Chip, SegmentedControl, Skeleton, czCount } from '@homebrain/ui';
import type { HeatingApi } from '../../api.js';
import { HEATING_BREAK_TS, RANGE_LABELS, efficiencyModel, fmtDuration } from '../../model.js';
import type { HeatingSnapshot, HistoryKey, HistoryRange } from '../../types.js';
import { Scatter, TimeChart, type ChartSeries } from '../charts.js';
import { DailyCards } from '../DailyCards.js';
import { EFF_KEYS, OVERLAYS, SERIES } from './series.js';
import { nowMs } from './time.js';
import { useHistory } from './useHeating.js';

export function TrendsTab({ api, snap }: { api: HeatingApi; snap: HeatingSnapshot }) {
  const [range, setRange] = useState<HistoryRange>('week');
  const [on, setOn] = useState<HistoryKey[]>(['tank_bottom', 'dhw_temp', 'outdoor_temp']);
  const [zoom, setZoom] = useState<[number, number] | null>(null);
  const h = useHistory(api, range, OVERLAYS);
  const all = useHistory(api, 'all', EFF_KEYS);
  const pts = h?.series.find((s) => s.points.length)?.points;
  const full: [number, number] | null = pts ? [pts[0]![0], pts.at(-1)![0]] : null;
  const domain = zoom ?? full;
  const series: ChartSeries[] = (h?.series ?? [])
    .filter((s) => on.includes(s.key))
    .map((s) => ({
      ...SERIES[s.key],
      key: s.key,
      points: s.points,
      band: s.key === 'tank_bottom',
    }));
  const runs = h?.runs ?? [];
  const inDomain = domain ? runs.filter(([a, b]) => b > domain[0] && a < domain[1]) : [];
  const runMin = inDomain.map(([a, b]) => (b - a) / 60_000).sort((a, b) => a - b);
  const eff = useMemo(() => {
    if (!all) return null;
    const out = all.series.find((s) => s.key === 'outdoor_temp')?.points ?? [];
    const rt = all.series.find((s) => s.key === 'compressor_runtime_h')?.points ?? [];
    return efficiencyModel(out, rt, nowMs(), HEATING_BREAK_TS);
  }, [all]);
  return (
    <>
      <DailyCards snap={snap} />
      <Card className="ht-card" data-testid="heating-trend" data-range={range}>
        <header className="ht-ch ht-ch-wrap">
          <h3>Teploty a běh kompresoru</h3>
          <SegmentedControl
            label="Období"
            hideLabel
            size="sm"
            value={range}
            options={RANGE_LABELS}
            onChange={(r) => {
              setRange(r);
              setZoom(null);
            }}
            className="ht-range"
          />
        </header>
        <div className="ht-chips" role="group" aria-label="Křivky v grafu">
          {OVERLAYS.map((k) => (
            <Chip
              key={k}
              size="sm"
              pressed={on.includes(k)}
              look="soft"
              icon={<i className="ht-chip-dot" style={{ background: SERIES[k].color }} />}
              onPressedChange={(p) =>
                setOn((cur) => (p ? [...cur, k] : cur.filter((x) => x !== k)))
              }
            >
              {SERIES[k].label}
            </Chip>
          ))}
          {zoom && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setZoom(null)}
              data-testid="heating-zoom-reset"
            >
              Zrušit přiblížení
            </Button>
          )}
        </div>
        {h === undefined || !domain ? (
          <Skeleton variant="block" height="260px" />
        ) : (
          <>
            <TimeChart
              range={range}
              domain={domain}
              series={series}
              height={260}
              onZoom={(a, b) => setZoom([a, b])}
              testid="heating-trend-chart"
              runs={runs.length > 0 ? runs : undefined}
            />
            {runs.length > 0 ? (
              <>
                <p className="ht-muted ht-runs-note" data-testid="heating-runs-summary">
                  {czCount(inDomain.length, 'běh', 'běhy', 'běhů')} kompresoru
                  {runMin.length
                    ? ` · medián ${fmtDuration(runMin[Math.floor(runMin.length / 2)]!)}`
                    : ''}{' '}
                  · přibližte tažením v grafu
                </p>
              </>
            ) : (
              <p className="ht-muted ht-runs-note">
                {range === 'month' ? 'Hodinové' : 'Denní'} průměry · jednotlivé běhy kompresoru jsou
                vidět za poslední týden.
              </p>
            )}
          </>
        )}
      </Card>
      <Card className="ht-card" data-testid="heating-efficiency">
        <header className="ht-ch ht-ch-wrap">
          <h3>Běh kompresoru podle venkovní teploty</h3>
          <span className="ht-legend" data-testid="heating-scatter-legend">
            {eff?.legend.map((l) => (
              <span key={l.group} data-group={l.group}>
                <i className="ht-dot-l" data-group={l.group} />
                {l.label}
              </span>
            ))}
            <span className="ht-muted">1 tečka = 1 den · čára = trend</span>
          </span>
        </header>
        {!eff ? (
          <Skeleton variant="block" height="220px" />
        ) : eff.points.length ? (
          <Scatter points={eff.points} fits={eff.fits} />
        ) : (
          <p className="ht-muted">Zatím málo dní s topením.</p>
        )}
        {eff?.insight && (
          <p className="ht-insight" data-testid="heating-efficiency-insight">
            {eff.insight}
          </p>
        )}
      </Card>
    </>
  );
}

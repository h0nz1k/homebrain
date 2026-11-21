import { Card, Pill } from '@homebrain/ui';
import { SOLAR_NO_ENERGY_NOTE, cyclingModel, solarDayModel } from '../insights.js';
import type { HeatingSnapshot } from '../types.js';
import { InfoList } from './ModesCards.js';

export function CyclingCard({ snap }: { snap: HeatingSnapshot }) {
  const m = cyclingModel(snap);
  if (!m) return null;
  return (
    <Card className="ht-card" data-testid="heating-cycling-card" data-tone={m.tone}>
      <header className="ht-ch">
        <h3>Spínání kompresoru</h3>
        <Pill tone={m.tone === 'warn' ? 'warn' : 'ok'} dot data-testid="heating-cycling-pill">
          {m.tone === 'warn' ? 'Často spíná' : 'V pořádku'}
        </Pill>
      </header>
      <InfoList rows={m.rows} />
      <p
        className={m.tone === 'warn' ? 'ht-insight' : 'ht-muted'}
        data-testid="heating-cycling-verdict"
      >
        {m.verdict}
      </p>
    </Card>
  );
}

export function SolarDayCard({ snap }: { snap: HeatingSnapshot }) {
  const m = solarDayModel(snap);
  if (!m) return null;
  return (
    <Card className="ht-card" data-testid="heating-solar-day-card">
      <header className="ht-ch">
        <h3>Solár – denní souhrn</h3>
      </header>
      <div className="ht-solar-days">
        <div>
          <h4>Dnes</h4>
          <InfoList rows={m.today} />
        </div>
        {m.yesterday.length > 0 && (
          <div>
            <h4>Včera</h4>
            <InfoList rows={m.yesterday} />
          </div>
        )}
      </div>
      <p className="ht-muted" data-testid="heating-solar-no-kwh">
        {SOLAR_NO_ENERGY_NOTE}
      </p>
    </Card>
  );
}

export function DailyCards({ snap }: { snap: HeatingSnapshot }) {
  const cycling = cyclingModel(snap) !== null;
  const solar = solarDayModel(snap) !== null;
  if (!cycling && !solar) return null;
  return (
    <div
      className={cycling && solar ? 'ht-daily ht-daily-2' : 'ht-daily'}
      data-testid="heating-daily"
    >
      <CyclingCard snap={snap} />
      <SolarDayCard snap={snap} />
    </div>
  );
}

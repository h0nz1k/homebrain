import type { ReactNode } from 'react';
import { Callout, Card } from '@homebrain/ui';
import { bannerAlert, fmtHpPower, fmtNum, hpElectricityVisible } from '../../model.js';
import type { HeatingSnapshot, HistoryKey } from '../../types.js';
import { SERIES } from './series.js';

export function AlertBanner({ snap, onDetail }: { snap: HeatingSnapshot; onDetail: () => void }) {
  const alert = bannerAlert(snap);
  if (!alert) return null;
  const tone = alert.severity === 'critical' ? 'critical' : 'warn';
  return (
    <div
      className="ht-alert-banner"
      data-testid="heating-alert-banner"
      data-severity={alert.severity}
    >
      <Callout
        tone={tone}
        title={alert.title}
        action={
          <button type="button" className="ht-link" onClick={onDetail}>
            Detail
          </button>
        }
      >
        {alert.body}
      </Callout>
    </div>
  );
}

export function HpElectricityBar({
  snap,
  className,
}: {
  snap: HeatingSnapshot;
  className?: string;
}) {
  if (!hpElectricityVisible(snap)) return null;
  const hp = snap.heat_pump;
  return (
    <Card
      className={`ht-hp-electricity${className ? ` ${className}` : ''}`}
      data-testid="heating-hp-electricity"
    >
      <span className="ht-k">Elektřina TČ</span>
      <b className="ht-v">{fmtHpPower(hp.power_w)}</b>
      {hp.energy_today_kwh !== null && (
        <span className="ht-sub">
          dnes {fmtNum(hp.energy_today_kwh)}
          {'\u00a0'}kWh
        </span>
      )}
    </Card>
  );
}

export function Stat({
  id,
  label,
  value,
  sub,
  tone,
  children,
}: {
  id: string;
  label: string;
  value: ReactNode;
  sub: ReactNode;
  tone?: 'ok' | 'warn' | 'crit';
  children?: ReactNode;
}) {
  return (
    <Card className="ht-stat" data-testid={`heating-stat-${id}`} data-tone={tone}>
      <span className="ht-k">{label}</span>
      <b className="ht-v">{value}</b>
      <span className="ht-sub">{sub}</span>
      {children}
    </Card>
  );
}

export function Legend({ keys, runs }: { keys: HistoryKey[]; runs?: boolean }) {
  return (
    <span className="ht-legend">
      {keys.map((k) => (
        <span key={k}>
          <i style={{ background: SERIES[k].color }} />
          {SERIES[k].label}
        </span>
      ))}
      {runs && (
        <span>
          <i className="ht-legend-run" />
          Kompresor
        </span>
      )}
    </span>
  );
}

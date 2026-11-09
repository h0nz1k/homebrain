import type { ReactNode } from 'react';
import { Card, Chip, Pill } from '@homebrain/ui';
import {
  fishHeatChip,
  fishHoldLine,
  fishPanelVisible,
  poolPanelVisible,
  solarPanelVisible,
} from '../sideCircuits.js';
import { fmtNum, fmtT } from '../model.js';
import type { HeatingSnapshot } from '../types.js';

function Panel({
  id,
  title,
  sub,
  children,
  aside,
}: {
  id: string;
  title: string;
  sub?: string;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <Card className="ht-land-panel ht-side-circuit" data-testid={`heating-side-${id}`}>
      <header className="ht-ch">
        <div>
          <h3>{title}</h3>
          {sub && <span className="ht-muted ht-side-sub">{sub}</span>}
        </div>
        {aside}
      </header>
      {children}
    </Card>
  );
}

function FishBand({
  temp,
  target,
  hysteresis,
}: {
  temp: number;
  target: number;
  hysteresis: number;
}) {
  const h = Math.max(hysteresis, 0.05);
  const span = 4;
  const lo = target - span / 2;
  const hi = target + span / 2;
  const frac = (v: number) => Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
  const bandL = frac(target - h);
  const bandR = frac(target + h);
  return (
    <div className="ht-fish-band" aria-hidden="true">
      <i
        className="ht-fish-band-zone"
        style={{ left: `${bandL * 100}%`, width: `${(bandR - bandL) * 100}%` }}
      />
      <span className="ht-fish-band-cursor" style={{ left: `${frac(temp) * 100}%` }} />
    </div>
  );
}

export function FishCircuitPanel({ snap }: { snap: HeatingSnapshot }) {
  const fish = snap.extras.fish;
  if (!fishPanelVisible(fish)) return null;
  const chip = fishHeatChip(fish);
  const hold = fishHoldLine(fish.target, fish.hysteresis);
  return (
    <Panel
      id="fish"
      title="Rybárna"
      sub="teplota vzduchu"
      aside={
        <Pill tone={chip.tone === 'warn' ? 'warn' : chip.tone === 'ok' ? 'ok' : 'neutral'} dot>
          {chip.label}
        </Pill>
      }
    >
      <div className="ht-side-hero">
        <b className="ht-side-temp">{fmtNum(fish.temp)}</b>
        <small>°C · vzduch</small>
      </div>
      {hold && <p className="ht-muted ht-side-hold">{hold}</p>}
      {fish.target !== null && fish.hysteresis !== null && (
        <FishBand temp={fish.temp} target={fish.target} hysteresis={fish.hysteresis} />
      )}
      {chip.belowTarget && (
        <p className="ht-side-warn" data-testid="heating-fish-below">
          Pod žádanou teplotou vzduchu
        </p>
      )}
    </Panel>
  );
}

export function SolarCircuitPanel({ snap }: { snap: HeatingSnapshot }) {
  const solar = snap.extras.solar;
  if (!solarPanelVisible(solar)) return null;
  return (
    <Panel id="solar" title="Solár" sub="kolektor">
      <div className="ht-side-hero">
        <b className="ht-side-temp">{fmtT(solar.temp)}</b>
      </div>
      {solar.pump !== null && (
        <Chip size="sm" look="soft">
          čerpadlo · {solar.pump ? 'běží' : 'stojí'}
        </Chip>
      )}
    </Panel>
  );
}

export function PoolCircuitPanel({ snap }: { snap: HeatingSnapshot }) {
  const pool = snap.extras.pool;
  if (!poolPanelVisible(pool)) return null;
  return (
    <Panel id="pool" title="Bazén" sub="zpátečka bazénu">
      {pool!.temp !== null && (
        <div className="ht-side-hero">
          <b className="ht-side-temp">{fmtT(pool!.temp)}</b>
        </div>
      )}
      <div className="ht-chips">
        {pool!.heating_pump !== null && (
          <Chip size="sm" look="soft">
            natápění · {pool!.heating_pump ? 'běží' : 'stojí'}
          </Chip>
        )}
        {pool!.filter_pump !== null && (
          <Chip size="sm" look="soft">
            filtrace · {pool!.filter_pump ? 'běží' : 'stojí'}
          </Chip>
        )}
      </div>
    </Panel>
  );
}

export function SideCircuitsLandscape({ snap }: { snap: HeatingSnapshot }) {
  return (
  <>
      <FishCircuitPanel snap={snap} />
      <SolarCircuitPanel snap={snap} />
      <PoolCircuitPanel snap={snap} />
    </>
  );
}

/** Portrait: one compact line per visible circuit. */
export function SideCircuitsPortrait({ snap }: { snap: HeatingSnapshot }) {
  const rows: ReactNode[] = [];
  const fish = snap.extras.fish;
  if (fishPanelVisible(fish)) {
    const chip = fishHeatChip(fish);
    rows.push(
      <li key="fish" data-testid="heating-extras-fish">
        <span>Rybárna · vzduch</span>
        <b>{fmtT(fish.temp)}</b>
        <em>{chip.label}</em>
      </li>,
    );
  }
  const solar = snap.extras.solar;
  if (solarPanelVisible(solar)) {
    rows.push(
      <li key="solar" data-testid="heating-extras-solar">
        <span>Solár</span>
        <b>{fmtT(solar.temp)}</b>
        <em>{solar.pump === null ? '—' : solar.pump ? 'čerpadlo běží' : 'čerpadlo stojí'}</em>
      </li>,
    );
  }
  const pool = snap.extras.pool;
  if (poolPanelVisible(pool)) {
    const parts: string[] = [];
    if (pool!.heating_pump !== null) parts.push(pool!.heating_pump ? 'natápění běží' : 'natápění stojí');
    if (pool!.filter_pump !== null) parts.push(pool!.filter_pump ? 'filtrace běží' : 'filtrace stojí');
    rows.push(
      <li key="pool" data-testid="heating-extras-pool">
        <span>Bazén · zpátečka</span>
        <b>{pool!.temp !== null ? fmtT(pool!.temp) : '—'}</b>
        <em>{parts.join(' · ') || '—'}</em>
      </li>,
    );
  }
  if (!rows.length) return null;
  return (
    <Card className="ht-extras-compact ht-portrait-only" data-testid="heating-extras">
      <header className="ht-ch">
        <h3>Další okruhy</h3>
      </header>
      <ul className="ht-extras-lines">{rows}</ul>
    </Card>
  );
}

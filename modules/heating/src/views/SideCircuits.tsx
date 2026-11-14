import type { ReactNode } from 'react';
import { Card, Chip, Pill } from '@homebrain/ui';
import {
  fishHeatChip,
  fishHoldLine,
  fishPanelVisible,
  poolPanelVisible,
  solarPanelVisible,
} from '../sideCircuits.js';
import { solarStateOf } from '../solar.js';
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
    <Card
      className="ht-land-panel ht-side-circuit"
      data-testid={`heating-side-${id}`}
      data-land-area={id === 'fish' ? 'fish' : undefined}
    >
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
      <SolarCircuitChips solar={solar} />
    </Panel>
  );
}

function SolarCircuitChips({ solar }: { solar: NonNullable<HeatingSnapshot['extras']['solar']> }) {
  const state = solar.state;
  return (
    <div className="ht-chips">
      {state === 'heating' && (
        <Pill tone="ok" dot>
          natápí nádrž
        </Pill>
      )}
      {state === 'no_gain' && (
        <Pill tone="warn" dot>
          bez účinku
        </Pill>
      )}
      {state === 'stagnation' && (
        <Pill tone="warn" dot>
          stagnace
        </Pill>
      )}
      {solar.pump !== null && (
        <Chip size="sm" look="soft">
          čerpadlo · {solar.pump ? 'běží' : 'stojí'}
          {solar.pump_pct !== null ? ` · ${fmtNum(solar.pump_pct, 0)}\u00a0%` : ''}
        </Chip>
      )}
      {solar.enabled !== null && (
        <Chip size="sm" look="soft">
          {solar.enabled ? 'solár zapnut' : 'solár vypnut'}
        </Chip>
      )}
    </div>
  );
}

/** Portrait: solar status near the top (above rooms / „Další okruhy“). */
export function SolarPortraitBanner({ snap }: { snap: HeatingSnapshot }) {
  const solar = snap.extras.solar;
  if (!solarPanelVisible(solar)) return null;
  const state = solarStateOf(snap);
  return (
    <Card className="ht-solar-compact ht-portrait-only" data-testid="heating-solar-compact">
      <span className="ht-k">Solár · kolektor</span>
      <b>{fmtT(solar.temp)}</b>
      <div className="ht-solar-compact-meta">
        {state === 'heating' && (
          <Pill tone="ok" dot data-testid="heating-solar-pill">
            natápí nádrž
          </Pill>
        )}
        {state === 'no_gain' && (
          <Pill tone="warn" dot>
            bez účinku
          </Pill>
        )}
        {state === 'stagnation' && (
          <Pill tone="warn" dot>
            stagnace
          </Pill>
        )}
        {solar.pump !== null && (
          <Chip size="sm" look="soft">
            čerpadlo {solar.pump ? 'běží' : 'stojí'}
            {solar.pump_pct !== null ? ` · ${fmtNum(solar.pump_pct, 0)}\u00a0%` : ''}
          </Chip>
        )}
      </div>
    </Card>
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

function ExtrasCompactLandscape({ snap }: { snap: HeatingSnapshot }) {
  const solar = snap.extras.solar;
  const pool = snap.extras.pool;
  const showSolar = solarPanelVisible(solar);
  const showPool = poolPanelVisible(pool);
  if (!showSolar && !showPool) return null;
  return (
    <Card
      className="ht-land-panel ht-side-circuit ht-side-extras-merge"
      data-testid="heating-side-extras"
      data-land-area="extras"
    >
      <header className="ht-ch">
        <h3>Další okruhy</h3>
      </header>
      <div className="ht-extras-land">
        {showSolar && (
          <div className="ht-extras-land-row" data-testid="heating-side-solar">
            <span className="ht-extras-land-k">Solár · kolektor</span>
            <b className="ht-side-temp">{fmtT(solar!.temp)}</b>
            {solar!.state === 'heating' && (
              <Pill tone="ok" dot>
                natápí nádrž
              </Pill>
            )}
            {solar!.pump !== null && (
              <Chip size="sm" look="soft">
                čerpadlo · {solar!.pump ? 'běží' : 'stojí'}
                {solar!.pump_pct !== null ? ` · ${fmtNum(solar!.pump_pct, 0)}\u00a0%` : ''}
              </Chip>
            )}
          </div>
        )}
        {showPool && (
          <div className="ht-extras-land-row" data-testid="heating-side-pool">
            <span className="ht-extras-land-k">Bazén · zpátečka</span>
            <b className="ht-side-temp">{pool!.temp !== null ? fmtT(pool!.temp) : '—'}</b>
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
          </div>
        )}
      </div>
    </Card>
  );
}

export function SideCircuitsLandscape({ snap }: { snap: HeatingSnapshot }) {
  return (
    <>
      <FishCircuitPanel snap={snap} />
      <ExtrasCompactLandscape snap={snap} />
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
  // Solar has a dedicated compact banner higher on the portrait page.
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

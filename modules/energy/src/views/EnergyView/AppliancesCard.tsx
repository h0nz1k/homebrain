import { localParts } from '../../adapter.js';
import type { ApplianceReading, ApplianceState } from '../../appliances.js';
import type { EnergyModel } from '../../contract.js';
import { fmt } from './format.js';

const APPLIANCE_CHIP: Record<ApplianceState, { label: string; tone: string }> = {
  running: { label: 'Běží', tone: 'ok' },
  standby: { label: 'Pohotovost', tone: 'idle' },
  off: { label: 'Vypnuto', tone: 'off' },
  finished: { label: 'Dokončeno', tone: 'ac' },
  unknown: { label: 'Bez dat', tone: 'warn' },
};
function watts(w: number | null): [string, string] {
  return [w === null ? '–' : fmt(w / 1000, 2), 'kW'];
}
const clock = (ms: number, tz: string) => {
  const p = localParts(ms, tz);
  return `${p.hour}:${String(p.minute).padStart(2, '0')}`;
};

export function AppliancesCard({
  items,
  model,
}: {
  items: ApplianceReading[];
  model: EnergyModel;
}) {
  return (
    <section className="en-card en-appl" aria-label="Spotřebiče" data-testid="energy-appliances">
      <h2 className="en-ct">
        Spotřebiče <small>výkon teď · dnes od půlnoci · podíl na spotřebě domu</small>
      </h2>
      <ul className="en-appl-list">
        {items.map((a) => {
          const chip = APPLIANCE_CHIP[a.state];
          const [v, unit] = watts(a.power.value);
          return (
            <li
              key={a.slot}
              className="en-appl-item"
              data-testid={`energy-appliance-${a.slot}`}
              data-state={a.state}
            >
              <div className="en-appl-top">
                <span className="en-appl-name">{a.label}</span>
                <span
                  className={
                    a.state === 'running' ? 'en-appl-running' : `en-chip en-chip--${chip.tone}`
                  }
                  aria-label={chip.label}
                  title={`Běží nad ${fmt(a.runningW, 0)} W`}
                >
                  {a.state === 'running' ? <i className="en-dot" aria-hidden="true" /> : chip.label}
                  {a.state === 'off' && a.switchOn === false ? ' · spínač' : ''}
                </span>
              </div>
              <div className="en-appl-mid">
                <div
                  className={`en-appl-v${a.state === 'running' ? '' : ' en-appl-v--idle'}`}
                  aria-label={`Výkon teď ${v} ${unit}`}
                >
                  {v}&nbsp;<small>{unit}</small>
                  {a.power.quality === 'stale' && <span className="en-appl-stale">neaktuální</span>}
                </div>
                <div className="en-appl-today">
                  <span>
                    dnes <b>{fmt(a.todayKwh)}</b>&nbsp;kWh
                  </span>
                  {a.sharePercent !== null && (
                    <span>
                      <b>{fmt(a.sharePercent, 0)}&nbsp;%</b> dne
                    </span>
                  )}
                </div>
              </div>
              <div className="en-track" aria-hidden="true">
                <span
                  style={{
                    width: `${a.sharePercent ?? 0}%`,
                    minWidth: a.sharePercent ? 4 : 0,
                  }}
                />
              </div>
              {a.state === 'finished' && a.cycle && (
                <span className="en-appl-note">
                  Program doběhl v {clock(a.cycle.endedAt, model.timeZone)}
                  {a.cycle.energyKwh !== null ? ` · cyklus ${fmt(a.cycle.energyKwh)} kWh` : ''}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

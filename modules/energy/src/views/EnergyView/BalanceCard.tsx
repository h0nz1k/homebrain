import type { EnergyModel } from '../../contract.js';
import { fmt } from './format.js';

function Stack({
  parts,
  scale,
}: {
  parts: Array<{ label: string; value: number | null; color: string }>;
  scale: number;
}) {
  const valid = parts.filter((p) => (p.value ?? 0) > 0);
  const gap = Math.max(0, scale - valid.reduce((sum, p) => sum + p.value!, 0));
  return (
    <>
      <div className="en-stack">
        {valid.map((p) => (
          <span key={p.label} style={{ flexGrow: p.value!, background: p.color }} />
        ))}
        {gap > 0 && (
          <span
            className="en-stack-gap"
            style={{ flexGrow: gap }}
            data-testid="energy-balance-hatched"
          />
        )}
        {!valid.length && !gap && <span style={{ flexGrow: 1, background: 'var(--hb-s3)' }} />}
      </div>
      <div className="en-legend">
        {parts.map((p) => (
          <span key={p.label}>
            <i style={{ background: p.color }} />
            {p.label} <b>{fmt(p.value)}</b>
          </span>
        ))}
      </div>
    </>
  );
}

export function BalanceCard({ model }: { model: EnergyModel }) {
  const t = model.today;
  const sum = (v: Array<number | null>) => v.reduce<number>((s, x) => s + (x ?? 0), 0);
  const sources = sum([t.pv.value, t.gridImport.value, t.batteryDischarge.value]);
  const uses = sum([t.house.value, t.gridExport.value, t.batteryCharge.value]);
  return (
    <section className="en-card en-balance" aria-label="Bilance dne" data-testid="energy-balance">
      <h2 className="en-ct">
        Bilance dne <small>kWh od půlnoci</small>
      </h2>
      <span className="en-lbl">
        Zdroje · {fmt(sources)} <span className="en-unit">kWh</span>
      </span>
      <Stack
        scale={Math.max(sources, uses)}
        parts={[
          { label: 'FVE', value: t.pv.value, color: 'var(--hb-energy-pv)' },
          { label: '↓ Nákup', value: t.gridImport.value, color: 'var(--hb-energy-grid)' },
          { label: 'Baterie', value: t.batteryDischarge.value, color: 'var(--hb-energy-battery)' },
        ]}
      />
      <span className="en-lbl">
        Užití · {fmt(uses)} <span className="en-unit">kWh</span>
      </span>
      <Stack
        scale={Math.max(sources, uses)}
        parts={[
          { label: 'Dům', value: t.house.value, color: 'var(--hb-energy-home)' },
          { label: '↑ Prodej', value: t.gridExport.value, color: 'var(--hb-energy-grid-export)' },
          {
            label: 'Do baterie',
            value: t.batteryCharge.value,
            color: 'var(--hb-energy-battery-charge)',
          },
        ]}
      />
      {Math.abs(sources - uses) >= 0.5 && (
        <p className="en-note" data-testid="energy-balance-gap">
          Šrafovaná část: rozdíl {fmt(Math.abs(sources - uses))} kWh – ztráty střídače nebo měřidla,
          která se nesčítají (počítadla jsou z různých senzorů).
        </p>
      )}
    </section>
  );
}

import { ProgressRing } from '@homebrain/ui';
import {
  cookStateLabel,
  cookTone,
  formatTemp,
  remainingLabel,
  type CookingProbe,
} from '../data/cooking.js';

const pct = new Intl.NumberFormat('cs-CZ', { style: 'percent', maximumFractionDigits: 0 });

/** Ring centre: progress while cooking, a state glyph once the target was reached. */
function ringCentre(probe: CookingProbe): string {
  if (probe.state === 'remove' || probe.state === 'overdone' || probe.state === 'overcooked')
    return '!';
  if (probe.state === 'resting' || probe.state === 'done') return '✓';
  return probe.progress === null ? '—' : pct.format(probe.progress);
}

/**
 * Dnes „Maso v troubě“: one tile per active MEATER probe (1–4). Read only for every role.
 * Big tip temperature → target, progress ring, oven temperature, remaining time and the state;
 * „Sundat z tepla“ is accented (the pulse stops under prefers-reduced-motion).
 */
export function CookingCard({ probes, kiosk }: { probes: CookingProbe[]; kiosk: boolean }) {
  if (!probes.length) return null;
  // „Sundat z tepla“ first: it is the only state that asks for action now (stable otherwise).
  const ordered = [...probes].sort(
    (a, b) => Number(b.state === 'remove') - Number(a.state === 'remove'),
  );
  const ring = kiosk ? (probes.length > 2 ? 60 : 96) : 64;
  return (
    <section
      className="today-cooking"
      data-testid="today-cooking"
      data-count={probes.length}
      aria-label="Maso v troubě"
    >
      <h3 className="today-cooking-title">Maso v troubě</h3>
      <ul className="today-cooking-list">
        {ordered.map((probe) => {
          const remaining = remainingLabel(probe);
          const tone = cookTone(probe.state);
          const progress = probe.progress ?? 0;
          return (
            <li
              key={probe.id}
              className="today-cooking-probe"
              data-testid="cooking-probe"
              data-state={probe.state}
              data-tone={tone}
              data-alert={probe.state === 'remove' ? 'true' : undefined}
            >
              <ProgressRing
                className="today-cooking-ring"
                value={progress}
                size={ring}
                tone={tone}
                label={
                  probe.progress === null
                    ? 'Propečení neznámé'
                    : `Propečení ${pct.format(probe.progress)}`
                }
              >
                {ringCentre(probe)}
              </ProgressRing>
              <div className="today-cooking-body">
                <div className="today-cooking-name" title={probe.name}>
                  {probe.name}
                </div>
                <div className="today-cooking-temps">
                  <strong className="today-cooking-internal" data-testid="cooking-internal">
                    {probe.internal === null ? '—' : Math.round(probe.internal)}
                    <span aria-hidden="true">°</span>
                    <span className="hb-sr-only"> °C uvnitř</span>
                  </strong>
                  <span className="today-cooking-target">cíl {formatTemp(probe.target)}</span>
                </div>
                <div className="today-cooking-meta">
                  <span
                    className="today-cooking-state"
                    data-testid="cooking-state"
                    aria-live="polite"
                  >
                    {cookStateLabel(probe.state)}
                  </span>
                  {remaining && (
                    <span className="today-cooking-remaining" data-testid="cooking-remaining">
                      {remaining}
                    </span>
                  )}
                  <span className="today-cooking-ambient">Trouba {formatTemp(probe.ambient)}</span>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

import { useId, type CSSProperties } from 'react';
import { Icon } from './icons.js';
import { formatQuantity } from './units.js';

/** Sliders only make sense for a handful of positions; prices with 0,01 steps get − / + only. */
const MAX_SLIDER_STEPS = 400;

export interface RangeStepperProps {
  /** Accessible name of the value („Rezerva v síti“). */
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step: number;
  unit?: string;
  /** Recommended band drawn on the track, with its caption („běžně“). */
  band?: [number, number];
  bandLabel?: string;
  /** Saved value, marked on the slider („teď 20 %“) so the change is visible. */
  current?: number;
  currentLabel?: string;
  disabled?: boolean;
}

const decimals = (step: number) => (String(step).split('.')[1] ?? '').length;

/**
 * Large numeric value with − / + (44 px) and, for short ranges, a slider showing the recommended
 * band. Keyboard: the number field (spinbutton) and the slider both follow the native keys.
 */
export function RangeStepper({
  label,
  value,
  onChange,
  min,
  max,
  step,
  unit = '',
  band,
  bandLabel = 'doporučeno',
  current,
  currentLabel = 'teď',
  disabled,
}: RangeStepperProps) {
  const id = useId();
  const clamp = (next: number) => {
    const snapped = min + Math.round((next - min) / step) * step;
    return Number(Math.min(max, Math.max(min, snapped)).toFixed(decimals(step)));
  };
  const span = max - min;
  const frac = (v: number) => (span > 0 ? Math.min(1, Math.max(0, (v - min) / span)) : 0);
  const pct = (v: number) => frac(v) * 100;
  const slider = span > 0 && span / step <= MAX_SLIDER_STEPS;
  const marked = slider && current !== undefined && Number.isFinite(current);
  // Fractions place the fill, band and tick on the thumb centre (12 px inset at both ends).
  const style = {
    '--hb-range-f': frac(value),
    '--hb-band-a': band ? frac(band[0]) : undefined,
    '--hb-band-b': band ? frac(band[1]) : undefined,
    '--hb-band-from': band ? `${pct(band[0])}%` : undefined,
    '--hb-band-to': band ? `${pct(band[1])}%` : undefined,
    '--hb-now-f': marked ? frac(current) : undefined,
  } as CSSProperties;
  return (
    <div className="hb-range" style={style}>
      <div className="hb-range-row">
        <button
          type="button"
          className="hb-range-step"
          aria-label={`Snížit: ${label}`}
          disabled={disabled || value <= min}
          onClick={() => onChange(clamp(value - step))}
        >
          <Icon name="minus" size={20} />
        </button>
        <label className="hb-range-value" htmlFor={id}>
          <input
            id={id}
            type="number"
            inputMode="decimal"
            aria-label={label}
            min={min}
            max={max}
            step={step}
            value={Number.isFinite(value) ? value : ''}
            disabled={disabled}
            onChange={(e) => e.target.value !== '' && onChange(Number(e.target.value))}
            onBlur={() => onChange(clamp(value))}
            style={{ width: `${Math.max(2, String(value).length) + 0.5}ch` }}
          />
          {unit && <span className="hb-range-unit">{unit}</span>}
        </label>
        <button
          type="button"
          className="hb-range-step"
          aria-label={`Zvýšit: ${label}`}
          disabled={disabled || value >= max}
          onClick={() => onChange(clamp(value + step))}
        >
          <Icon name="plus" size={20} />
        </button>
      </div>
      {marked && (
        <div className="hb-range-now" aria-hidden="true">
          <span>
            {currentLabel} {formatQuantity(current, unit)}
          </span>
        </div>
      )}
      {slider && (
        <div className="hb-range-track" data-band={band ? '' : undefined}>
          {band && <span className="hb-range-band" aria-hidden="true" />}
          {marked && <span className="hb-range-tick" aria-hidden="true" />}
          <input
            type="range"
            aria-label={`${label}: posuvník`}
            min={min}
            max={max}
            step={step}
            value={value}
            disabled={disabled}
            onChange={(e) => onChange(Number(e.target.value))}
          />
        </div>
      )}
      <div className="hb-range-scale">
        <span>{formatQuantity(min, unit)}</span>
        {band && (
          <span className="hb-range-band-label">
            {bandLabel} {formatQuantity(band[0])}–{formatQuantity(band[1], unit)}
          </span>
        )}
        <span>{formatQuantity(max, unit)}</span>
      </div>
    </div>
  );
}

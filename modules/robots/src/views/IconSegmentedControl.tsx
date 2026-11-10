import { type CleaningIconKind, cleaningOptionIcon } from './cleaningIcons.js';

export interface IconSegmentedControlProps<T extends string = string> {
  label: string;
  value: T | null;
  options: ReadonlyArray<readonly [T, string]>;
  onChange: (value: T) => void;
  className?: string;
  iconKind: CleaningIconKind;
}

/** Equal-width segments (hb-seg) with a decorative icon stacked above the Czech label. */
export function IconSegmentedControl<T extends string = string>({
  label,
  value,
  options,
  onChange,
  className = '',
  iconKind,
}: IconSegmentedControlProps<T>) {
  return (
    <div className={`hb-seg-wrap ${className}`.trim()} data-tone="accent">
      <span className="hb-seg-label">{label}</span>
      <div className="hb-seg" role="radiogroup" aria-label={label}>
        {options.map(([key, text]) => (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={value === key}
            onClick={() => key !== value && onChange(key)}
          >
            <span className="rb-seg-stack">
              {cleaningOptionIcon(iconKind, key)}
              <span className="rb-seg-opt-label">{text}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

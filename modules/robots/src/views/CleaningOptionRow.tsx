import { Chip, SegmentedControl } from '@homebrain/ui';

const SEGMENTED_MAX = 4;

export interface CleaningOptionRowProps {
  label: string;
  value: string | null;
  options: ReadonlyArray<readonly [string, string]>;
  onChange: (value: string) => void;
  className?: string;
}

/** Few short labels → segments; many Roborock options → wrapping chip grid (≥ 44 px targets). */
export function CleaningOptionRow({
  label,
  value,
  options,
  onChange,
  className = '',
}: CleaningOptionRowProps) {
  if (options.length <= SEGMENTED_MAX) {
    return (
      <SegmentedControl
        label={label}
        tone="accent"
        className={className}
        value={value}
        options={options}
        onChange={onChange}
      />
    );
  }
  return (
    <div className={`rb-opt-wrap ${className}`.trim()}>
      <span className="hb-seg-label" id={`rb-opt-${label}`}>
        {label}
      </span>
      <div className="rb-opt-grid" role="radiogroup" aria-labelledby={`rb-opt-${label}`}>
        {options.map(([key, text]) => (
          <Chip
            key={key}
            className="rb-opt-chip"
            look="soft"
            pressed={value === key}
            aria-checked={value === key}
            role="radio"
            onPress={() => key !== value && onChange(key)}
          >
            {text}
          </Chip>
        ))}
      </div>
    </div>
  );
}

import { Chip, SegmentedControl } from '@homebrain/ui';
import { type CleaningIconKind, cleaningOptionIcon } from './cleaningIcons.js';
import { IconSegmentedControl } from './IconSegmentedControl.js';

const SEGMENTED_MAX = 4;

export interface CleaningOptionRowProps {
  label: string;
  value: string | null;
  options: ReadonlyArray<readonly [string, string]>;
  onChange: (value: string) => void;
  className?: string;
  iconKind?: CleaningIconKind;
}

function OptionTile({
  keyId,
  text,
  selected,
  iconKind,
  onChange,
}: {
  keyId: string;
  text: string;
  selected: boolean;
  iconKind?: CleaningIconKind;
  onChange: (value: string) => void;
}) {
  const icon = iconKind ? cleaningOptionIcon(iconKind, keyId) : null;
  const tile = Boolean(iconKind && icon);
  return (
    <Chip
      key={keyId}
      className={`rb-opt-chip${tile ? ' rb-opt-tile' : ''}`}
      look="soft"
      pressed={selected}
      aria-checked={selected}
      role="radio"
      onPress={() => !selected && onChange(keyId)}
    >
      {icon}
      <span className={tile ? 'rb-opt-label' : undefined}>{text}</span>
    </Chip>
  );
}

/** Few short labels → segments; many Roborock options → wrapping chip grid (≥ 44 px targets). */
export function CleaningOptionRow({
  label,
  value,
  options,
  onChange,
  className = '',
  iconKind,
}: CleaningOptionRowProps) {
  if (iconKind === 'mode' || iconKind === 'passes') {
    return (
      <IconSegmentedControl
        label={label}
        value={value as string}
        options={options}
        onChange={onChange}
        className={className}
        iconKind={iconKind}
      />
    );
  }
  if (iconKind) {
    return (
      <div className={`rb-opt-wrap ${className}`.trim()}>
        <span className="hb-seg-label" id={`rb-opt-${label}`}>
          {label}
        </span>
        <div className="rb-opt-grid" role="radiogroup" aria-labelledby={`rb-opt-${label}`}>
          {options.map(([key, text]) => (
            <OptionTile
              key={key}
              keyId={key}
              text={text}
              selected={value === key}
              iconKind={iconKind}
              onChange={onChange}
            />
          ))}
        </div>
      </div>
    );
  }
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

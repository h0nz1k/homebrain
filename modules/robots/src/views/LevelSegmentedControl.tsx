import { type LevelIconKey, levelIcon } from './levelIcons.js';

export interface LevelSegmentedControlProps {
  label: string;
  value: LevelIconKey;
  onChange: (value: LevelIconKey) => void;
  className?: string;
}

const OPTIONS: ReadonlyArray<readonly [LevelIconKey, string]> = [
  ['basic', 'Základní'],
  ['advanced', 'Pokročilé'],
];

/** „Základní / Pokročilé“ with decorative icons (same stack as cleaning option rows). */
export function LevelSegmentedControl({
  label,
  value,
  onChange,
  className = '',
}: LevelSegmentedControlProps) {
  return (
    <div
      className={`hb-seg-wrap ${className}`.trim()}
      data-tone="accent"
      data-testid="robots-level-toggle"
    >
      <span className="hb-seg-label">{label}</span>
      <div className="hb-seg" role="radiogroup" aria-label={label}>
        {OPTIONS.map(([key, text]) => (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={value === key}
            onClick={() => key !== value && onChange(key)}
          >
            <span className="rb-seg-stack">
              {levelIcon(key)}
              <span className="rb-seg-opt-label">{text}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

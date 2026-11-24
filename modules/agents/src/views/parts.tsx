import type { BarTone } from '../format.js';

export function Bar({ value, tone, label }: { value: number; tone: BarTone; label?: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <span
      className="agt-bar"
      data-tone={tone}
      role={label ? 'meter' : undefined}
      aria-label={label}
      aria-valuenow={label ? Math.round(pct) : undefined}
      aria-valuemin={label ? 0 : undefined}
      aria-valuemax={label ? 100 : undefined}
    >
      <i style={{ width: `${pct}%` }} />
    </span>
  );
}

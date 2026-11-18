import { Pill } from '@homebrain/ui';
import { TIER_LABEL, TIER_TONE } from '../copy.js';
import type { TierKey } from '../types.js';

export function TierPill({ tier, size }: { tier: TierKey; size?: 'sm' | 'md' }) {
  return (
    <Pill
      tone={TIER_TONE[tier]}
      dot={tier !== 'confirmed'}
      variant={tier === 'confirmed' ? 'solid' : 'soft'}
      size={size}
      data-testid="aw-tier"
      data-tier={tier}
    >
      {TIER_LABEL[tier]}
    </Pill>
  );
}

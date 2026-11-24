import { describe, expect, it } from 'vitest';
import {
  collapsedSummary,
  groupQuotas,
  isQuotaUrgent,
  slotLabel,
  splitProvider,
  windowKind,
} from './quotaGroups.js';
import { createMockSnapshot } from './mock.js';
import type { Quota } from './types.js';

const NOW = Date.parse('2026-11-24T08:45:00Z');

function q(
  partial: Partial<Quota> &
    Pick<Quota, 'id' | 'provider' | 'window' | 'window_label' | 'remaining_pct'>,
): Quota {
  const base: Quota = {
    available: true,
    used_pct: partial.remaining_pct == null ? null : 100 - partial.remaining_pct,
    reset_at: null,
    exhausted: false,
    exhaust_before_reset: false,
    level: 'ok',
    ...partial,
  };
  if (base.exhausted || (base.remaining_pct != null && base.remaining_pct < 10))
    base.level = 'critical';
  else if (base.exhaust_before_reset || (base.remaining_pct != null && base.remaining_pct < 25))
    base.level = 'warning';
  return base;
}

describe('splitProvider / windowKind / slotLabel', () => {
  it('splits name · subtitle', () => {
    expect(splitProvider('Claude · Max 5x')).toEqual({ name: 'Claude', subtitle: 'Max 5x' });
    expect(splitProvider('Codex')).toEqual({ name: 'Codex', subtitle: null });
  });
  it('classifies windows', () => {
    expect(
      windowKind(
        q({ id: 'a', provider: 'X', window: '5h', window_label: '5 h', remaining_pct: 50 }),
      ),
    ).toBe('short');
    expect(
      windowKind(
        q({ id: 'a', provider: 'X', window: 'week', window_label: 'týden', remaining_pct: 50 }),
      ),
    ).toBe('long');
    expect(
      windowKind(
        q({ id: 'a', provider: 'X', window: 'Bonus', window_label: 'kredit', remaining_pct: 50 }),
      ),
    ).toBe('credit');
  });
  it('keeps family prefix in slot label', () => {
    expect(
      slotLabel(
        q({
          id: 'a',
          provider: 'Antigravity',
          window: 'Claude/GPT week',
          window_label: 'týden',
          remaining_pct: 0,
        }),
      ),
    ).toBe('Claude/GPT týden');
    expect(
      slotLabel(
        q({
          id: 'a',
          provider: 'Cursor',
          window: 'Included',
          window_label: 'měsíc',
          remaining_pct: 96,
        }),
      ),
    ).toBe('Included');
    expect(
      slotLabel(
        q({
          id: 'a',
          provider: 'GHA',
          window: 'actions min',
          window_label: 'měsíc',
          remaining_pct: 11,
        }),
      ),
    ).toBe('minuty');
  });
});

describe('groupQuotas – structure from proposal (synthetic real)', () => {
  it('≈5 provider rows; marginal Vertex + Claude Fable collapsed; low never hidden', () => {
    const snap = createMockSnapshot('real', NOW);
    const layout = groupQuotas(snap.quotas);
    const names = layout.rows.map((r) => r.name);
    expect(names).toContain('Claude');
    expect(names).toContain('Codex');
    expect(names).toContain('Antigravity');
    expect(names).toContain('Cursor');
    expect(names).toContain('GitHub Actions');
    expect(names).not.toContain('Vertex AI');
    expect(names).not.toContain('Claude Fable');
    expect(layout.rows.length).toBeGreaterThanOrEqual(5);
    expect(layout.rows.length).toBeLessThanOrEqual(6);

    const claude = layout.rows.find((r) => r.name === 'Claude')!;
    expect(claude.slots[0]?.label).toMatch(/5 h/);
    expect(claude.slots[1]?.label).toMatch(/týden/);
    expect(claude.slots[1]?.quota.remaining_pct).toBe(13);

    const agy = layout.rows.find((r) => r.name === 'Antigravity')!;
    expect(agy.slots[0]?.label).toMatch(/Claude\/GPT/);
    expect(agy.slots[1]?.label).toMatch(/Gemini/);
    expect(agy.slots.some((s) => s && s.quota.exhausted)).toBe(true);

    const gha = layout.rows.find((r) => r.name === 'GitHub Actions')!;
    expect(gha.slots[0]?.label).toBe('minuty');
    expect(gha.slots[1]).toBeNull();

    const summary = collapsedSummary(layout.collapsed);
    expect(summary).toMatch(/Vertex/);
    expect(summary).toMatch(/Claude Fable/);
    expect(summary).toMatch(/63\s*%/);
    // Low/exhausted never only in collapsed.
    for (const c of layout.collapsed) {
      expect(isQuotaUrgent(c.quota)).toBe(false);
    }
  });

  it('promotes urgent credit into a visible slot', () => {
    const layout = groupQuotas([
      q({
        id: 'v',
        provider: 'Vertex AI · cloud',
        window: 'Bonus',
        window_label: 'kredit',
        remaining_pct: 8,
        exhausted: false,
      }),
    ]);
    expect(layout.rows).toHaveLength(1);
    expect(layout.rows[0]!.slots[0]?.quota.remaining_pct).toBe(8);
    expect(layout.collapsed).toHaveLength(0);
  });

  it('ok scenario: Z credit collapsed when Included is visible', () => {
    const layout = groupQuotas(createMockSnapshot('ok', NOW).quotas);
    const z = layout.rows.find((r) => r.name === 'Poskytovatel Z');
    expect(z).toBeTruthy();
    expect(collapsedSummary(layout.collapsed)).toMatch(/kredit|41/);
  });
});

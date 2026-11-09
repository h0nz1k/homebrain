import { describe, expect, it } from 'vitest';
import {
  avgRunLengthMin,
  fmtMotohours,
  heatPumpDeltaT,
  showAtticTemp,
  showDhwReheatHint,
  tankGaugeModel,
} from './landscape.js';
import { buildMockSnapshot } from './mock.js';

describe('landscape helpers', () => {
  it('avg run length divides runtime by starts', () => {
    expect(avgRunLengthMin(3.4, 5)).toBeCloseTo(40.8, 5);
    expect(avgRunLengthMin(3.4, 0)).toBeNull();
    expect(avgRunLengthMin(null, 5)).toBeNull();
  });

  it('fmtMotohours uses NBSP grouping', () => {
    expect(fmtMotohours(10_216.2)).toBe('10\u00a0216\u00a0h');
    expect(fmtMotohours(null)).toBe('–');
  });

  it('tank gauge maps temps into 0…1 band', () => {
    const snap = buildMockSnapshot('heating', 0);
    const g = tankGaugeModel(snap)!;
    expect(g.bottomFrac).toBeGreaterThan(0.3);
    expect(g.bandBottomFrac).toBeGreaterThan(0.2);
    expect(g.bandTopFrac! > g.bandBottomFrac!).toBe(true);
  });

  it('ΔT only when both HP temps present', () => {
    const snap = buildMockSnapshot('heating', 0);
    expect(heatPumpDeltaT(snap)).toBeCloseTo(4.2, 1);
    snap.heat_pump.condenser_out = null;
    expect(heatPumpDeltaT(snap)).toBeNull();
  });

  it('hiding rules for optional rows', () => {
    expect(showAtticTemp(19.6)).toBe(true);
    expect(showAtticTemp(null)).toBe(false);
    const snap = buildMockSnapshot('idle', 0);
    expect(showDhwReheatHint(snap.dhw)).toBe(true);
    snap.dhw.reheat_below = null;
    expect(showDhwReheatHint(snap.dhw)).toBe(false);
  });
});

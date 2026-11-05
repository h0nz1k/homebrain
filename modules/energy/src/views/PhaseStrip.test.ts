import { describe, expect, it } from 'vitest';
import { analyzePhases } from '../phases.js';
import { phaseHint } from './PhaseStrip.js';

describe('phaseHint – headroom amps', () => {
  it('keeps one decimal below 10 A, like the phase bars (1,6 A, not „2“)', () => {
    const a = analyzePhases({
      powersKw: [0.3, 0.18, 0.37],
      currentsA: [1.3, 0.8, 1.6],
      breakerA: 32,
    });
    expect(phaseHint(a, [], [null, null, null]).text).toContain('L3 1,6 z 32 A');
  });
  it('shows whole amps from 10 A up', () => {
    const a = analyzePhases({
      powersKw: [5.8, 0.4, 0.4],
      currentsA: [25.2, 1.7, 1.7],
      breakerA: 32,
    });
    expect(phaseHint(a, [], [null, null, null]).text).toContain('L1 25 z 32 A');
  });
});

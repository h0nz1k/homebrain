import { describe, expect, it } from 'vitest';
import { adaptEnergyEntities } from './adapter.js';
import {
  applyFlowScenario,
  createEnergyDemo,
  demoGridPhaseKw,
  type FlowScenario,
} from './fixtures.js';
import {
  analyzePhases,
  breakerAmps,
  guessAppliancePhase,
  imbalanceStats,
  phaseAmps,
  phaseSaldo,
} from './phases.js';

describe('phaseAmps', () => {
  it('estimates the current from power at 230 V and keeps the direction', () => {
    expect(phaseAmps(2.3)).toEqual({ amps: 10, estimated: true });
    expect(phaseAmps(-1.15).amps).toBeCloseTo(-5);
  });
  it('prefers a measured magnitude, direction from the power', () => {
    expect(phaseAmps(-0.2, 3.1)).toEqual({ amps: -3.1, estimated: false });
    expect(phaseAmps(0.5, -2)).toEqual({ amps: 2, estimated: false });
  });
});

describe('breakerAmps', () => {
  it('defaults to 25 A for missing or absurd values', () => {
    expect(breakerAmps(null)).toBe(25);
    expect(breakerAmps(0)).toBe(25);
    expect(breakerAmps(Number.NaN)).toBe(25);
    expect(breakerAmps(32)).toBe(32);
  });
});

describe('analyzePhases', () => {
  it('balanced import is ok without a saldo', () => {
    const a = analyzePhases({ powersKw: [0.9, 1.0, 0.95] });
    expect(a.state).toBe('ok');
    expect(a.spreadA).toBeCloseTo(0.43, 2);
    expect(a.imbalancePercent).toBe(5);
    expect(a.saldo).toBeNull();
    expect(a.reasons).toEqual([]);
  });

  it('heat pump on L1 → warn (≥ 16 A spread, 80 % of the breaker)', () => {
    const a = analyzePhases({ powersKw: [4.6, 0.46, 0.35] });
    expect(a.heaviest).toBe(0);
    expect(a.phases[0].amps).toBeCloseTo(20, 5);
    expect(a.phases[0].load).toBeCloseTo(0.8, 5);
    expect(a.state).toBe('warn');
    expect(a.reasons).toEqual(['L1 na 80 % jističe', 'rozdíl fází 18 A']);
    expect(a.imbalancePercent).toBeGreaterThan(100);
  });

  it('a bigger breaker relaxes the load rule but not the spread rule', () => {
    const a = analyzePhases({ powersKw: [3.0, 0.9, 0.9], breakerA: 32 });
    expect(a.phases[0].load).toBeCloseTo(13.04 / 32, 2);
    expect(a.state).toBe('notice');
    expect(a.reasons).toEqual(['rozdíl fází 9 A']);
  });

  it('uses measured currents for load (reactive power counts against the breaker)', () => {
    const a = analyzePhases({ powersKw: [2.0, 0.2, 0.2], currentsA: [16, 1, 1] });
    expect(a.phases[0].estimated).toBe(false);
    expect(a.phases[0].load).toBeCloseTo(0.64);
    expect(a.state).toBe('notice');
  });

  it('small loads give no relative imbalance (noise)', () => {
    expect(analyzePhases({ powersKw: [0.06, 0.3, 0.1] }).imbalancePercent).toBeNull();
  });

  it('mixed directions → saldo of a summing meter', () => {
    const a = analyzePhases({ powersKw: [0.8, -1.05, -1.05] });
    expect(a.saldo?.text).toBe(
      'L1 odebírá 0,8 kW, L2 + L3 dodávají 2,1 kW → elektroměr počítá dodávku 1,3 kW',
    );
    expect(a.spreadA).toBeCloseTo(8.04, 2);
    expect(a.state).toBe('notice');
  });
});

describe('phaseSaldo', () => {
  it('handles net import and a zero net', () => {
    expect(phaseSaldo([1.5, 1.2, -0.4])?.text).toBe(
      'L1 + L2 odebírají 2,7 kW, L3 dodává 0,4 kW → elektroměr počítá odběr 2,3 kW',
    );
    expect(phaseSaldo([1, -0.5, -0.5])?.text).toMatch(/sečte na nulu$/);
  });
  it('ignores tiny opposite flows below 50 W', () => {
    expect(phaseSaldo([1, 0.5, -0.02])).toBeNull();
  });
});

describe('imbalanceStats', () => {
  it('summarises spread and breaker load over the window', () => {
    const s = imbalanceStats(
      [
        [0.5, 0.5, 0.5],
        [4.6, 0.46, 0.46], // 18 A spread, 20 A on L1
        [1.84, 0.46, 0.46], // 6 A spread
        [0.5, 0.5, 0.5],
      ],
      25,
    )!;
    expect(s.samples).toBe(4);
    expect(s.maxSpreadA).toBeCloseTo(18, 5);
    expect(s.noticePercent).toBe(50);
    expect(s.warnPercent).toBe(25);
    expect(s.overloadPercent).toBe(25);
    expect(s.heaviest).toBe(0);
    expect(s.avgSpreadA).toBeCloseTo(6, 5);
  });
  it('null for an empty window', () => {
    expect(imbalanceStats([])).toBeNull();
  });
});

describe('guessAppliancePhase', () => {
  it('finds the phase a big single-phase appliance dominates', () => {
    expect(guessAppliancePhase(2.6, [3.0, 0.3, 0.25])).toBe(0);
    expect(guessAppliancePhase(2.0, [0.2, 0.3, 2.4])).toBe(2);
  });
  it('is unsure for small, three-phase or overlapping loads', () => {
    expect(guessAppliancePhase(0.4, [0.6, 0.1, 0.1])).toBeNull();
    expect(guessAppliancePhase(3, [1.1, 1.0, 1.0])).toBeNull();
    expect(guessAppliancePhase(2, [2.2, 1.9, 0.2])).toBeNull();
    expect(guessAppliancePhase(2, [2.2, null, 0.2])).toBeNull();
  });
});

describe('phase analysis on the dev scenarios', () => {
  const run = (sc: FlowScenario) => {
    const now = Date.parse('2026-06-02T18:30:00+02:00');
    const demo = createEnergyDemo(now);
    const states = applyFlowScenario(Object.values(demo.states), sc);
    const model = adaptEnergyEntities({
      bindings: demo.bindings,
      getState: (id) => states.find((s) => s.entity_id === id),
      now,
    });
    return {
      model,
      a: analyzePhases({
        powersKw: model.power.gridFlow.phasesKw!,
        breakerA: model.power.breaker.value,
      }),
    };
  };
  it('balanced: ok, breaker from the binding', () => {
    const { a, model } = run('balanced');
    expect(model.power.breaker.value).toBe(25);
    expect(a.state).toBe('ok');
    expect(a.saldo).toBeNull();
  });
  it('asym: heat pump on L1 → warn, L1 heaviest', () => {
    const { a } = run('asym');
    expect(a.state).toBe('warn');
    expect(a.heaviest).toBe(0);
    expect(a.spreadA).toBeGreaterThanOrEqual(16);
  });
  it('mixed: saldo line', () => {
    expect(run('mixed').a.saldo?.text).toBe(
      'L1 odebírá 0,8 kW, L2 + L3 dodávají 2,1 kW → elektroměr počítá dodávku 1,3 kW',
    );
  });
  it('demo history has a realistic asymmetry (heat pump L1, oven L2)', () => {
    const rows = Array.from({ length: 288 }, (_, i) =>
      [0, 1, 2].map((p) => demoGridPhaseKw(i / 12, p)),
    );
    const s = imbalanceStats(rows)!;
    expect(s.maxSpreadA).toBeGreaterThan(10);
    expect(s.noticePercent).toBeGreaterThan(5);
    expect(s.heaviest).toBe(0);
  });
});

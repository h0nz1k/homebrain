import type {
  HeatingAdvisor,
  HeatingCurveStatus,
} from '../../../../../modules/heating/src/types.js';

const scenarios = {
  suggest_lower: {
    circuit_duty_pct: 18,
    ref_mean: 21.1,
    point: [{ id: 'p3', outdoor_c: 5 }],
    step_c: 1,
    text: 'Zkuste snížit teplotu vody v bodě p3 (+5 °C) o 1 °C. Pár dní sledujte referenční místnost a podkroví.',
  },
  suggest_higher: {
    circuit_duty_pct: 83,
    ref_mean: 20.4,
    point: [{ id: 'p2', outdoor_c: -3 }],
    step_c: 1,
    text: 'Zkuste zvýšit teplotu vody v bodě p2 (−3 °C) o 1 °C. Pár dní sledujte referenční místnost a podkroví.',
  },
  ok: { text: 'Topnou křivku teď doporučuji ponechat.' },
  insufficient_data: {
    days_used: 2,
    days_missing: 3,
    text: 'Málo dat. Chybí ještě 3 dny s úplnými údaji.',
  },
  recent_change: {
    days_missing: 4,
    text: 'Čerstvá změna křivky. Vyhodnotím ji za 4 dny s úplnými údaji.',
  },
} satisfies Record<HeatingCurveStatus, Partial<HeatingAdvisor['curve']>>;

export function mockHeatingAdvisor(status: string | null, computedAt: string): HeatingAdvisor {
  const key = status && Object.hasOwn(scenarios, status) ? (status as HeatingCurveStatus) : 'ok';
  return {
    computed_at: computedAt,
    model: {
      slope_h_per_k: 0.41,
      balance_temp: 16,
      r2: 0.67,
      days: 143,
      days_incomplete: 6,
      confidence: 'high',
      thermal_kw: 7.2,
      design_temp: -12,
      heat_loss_wk_low: 114,
      heat_loss_wk_high: 132,
      design_loss_kw_low: 3.2,
      design_loss_kw_high: 3.7,
      seasons: [
        { season: '2025/26', slope_h_per_k: 0.41, days: 87 },
        { season: '2024/25', slope_h_per_k: 0.38, days: 56 },
      ],
    },
    curve: {
      status: key,
      days_used: 7,
      days_missing: 0,
      circuit_duty_pct: 37,
      ref_mean: 20.9,
      ref_target: 21,
      attic_min: 20.3,
      point: [],
      step_c: null,
      ...scenarios[key],
    },
  };
}

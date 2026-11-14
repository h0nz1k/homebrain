import { describe, expect, it } from 'vitest';
import { buildMockSnapshot } from './mock.js';
import { activityModel, fmtHpPower } from './model.js';
import { deriveSolarState, type SolarSample } from './solar.js';

const now = Date.UTC(2026, 0, 15, 12, 0, 0);

describe('deriveSolarState', () => {
  it('heating when pump on and collector sufficiently warmer than tank bottom', () => {
    expect(deriveSolarState(48, 38, true, [], now)).toBe('heating');
  });

  it('no_gain after 30 min pumping without tank rise', () => {
    const samples: SolarSample[] = [];
    for (let i = 62; i >= 0; i--) {
      samples.push({ ts: now - i * 30_000, collector: 62, tankBottom: 38.0, pump: true });
    }
    expect(deriveSolarState(62, 38.0, true, samples, now)).toBe('no_gain');
  });

  it('stagnation when pump off and collector overheated', () => {
    expect(deriveSolarState(118, 40, false, [], now)).toBe('stagnation');
  });
});

describe('fmtHpPower', () => {
  it('uses watts below 1 kW and kW otherwise', () => {
    expect(fmtHpPower(52)).toBe('52\u00a0W');
    expect(fmtHpPower(4200)).toBe('4,20\u00a0kW');
  });
});

describe('solar mock scenarios', () => {
  it('solar scenario shows heating hero copy without compressor', () => {
    const snap = buildMockSnapshot('solar', 0, now);
    expect(snap.extras.solar?.state).toBe('heating');
    expect(snap.heat_pump.compressor_on).toBe(false);
    const act = activityModel(snap, now);
    expect(act.pill).toContain('Solár natápí nádrž');
  });

  it('solar-nogain exposes Czech warning', () => {
    const snap = buildMockSnapshot('solar-nogain', 0, now);
    expect(snap.extras.solar?.state).toBe('no_gain');
    const act = activityModel(snap, now);
    expect(act.solarWarn).toContain('odvzdušnění');
  });
});
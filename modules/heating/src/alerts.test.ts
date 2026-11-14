import { describe, expect, it } from 'vitest';
import { activityModel, bannerAlert, formatChangeLine } from './model.js';
import { heatingSignals } from './signal.js';
import { buildMockSnapshot } from './mock.js';

const NOW = Date.parse('2026-11-14T12:00:00.000Z');

describe('bannerAlert', () => {
  it('picks critical over warning', () => {
    const snap = buildMockSnapshot('solar-off-hot', 0, NOW);
    const a = bannerAlert(snap);
    expect(a?.severity).toBe('critical');
    expect(a?.title).toMatch(/Solár je vypnutý/);
  });
});

describe('activityModel off', () => {
  it('shows Vypnuto, not Klidový režim', () => {
    const snap = buildMockSnapshot('off', 0, NOW);
    const m = activityModel(snap, NOW);
    expect(m.pill).toBe('Vypnuto');
    expect(m.pill).not.toMatch(/Klidový|Odpočívá/i);
  });
});

describe('heatingSignals', () => {
  it('maps critical alert to warning severity for Dnes', () => {
    const snap = buildMockSnapshot('solar-off-hot', 0, NOW);
    const sig = heatingSignals(snap, NOW);
    expect(sig).toHaveLength(1);
    expect(sig[0]?.severity).toBe('warning');
    expect(sig[0]?.title).toMatch(/^Topení ·/);
  });
  it('returns empty for info-only', () => {
    const snap = buildMockSnapshot('idle', 0, NOW);
    snap.alerts = [
      {
        id: 'hdo_long',
        severity: 'info',
        title: 'Nízký tarif',
        body: '…',
        since: new Date(NOW).toISOString(),
      },
    ];
    expect(heatingSignals(snap, NOW)).toEqual([]);
  });
});

describe('formatChangeLine', () => {
  it('formats bools as zapnuto/vypnuto', () => {
    const line = formatChangeLine(
      {
        ts: '2026-11-14T08:51:00.000Z',
        key: 'extras.solar_enabled',
        label: 'Solár zapnut',
        old: true,
        new: false,
        late: false,
      },
      NOW,
    );
    expect(line).toMatch(/Solár zapnut: zapnuto → vypnuto/);
  });
});
import { describe, expect, it } from 'vitest';
import { buildDetailSchematicModel, DETAIL_SCHEMATIC_MODEL } from './buildDetailModel.js';
import { auditSchematicGeometry, mutateModel } from './schematicGeometry.js';

describe('detail schematic geometry', () => {
  it('production model passes wiring checks', () => {
    const fails = auditSchematicGeometry(DETAIL_SCHEMATIC_MODEL);
    expect(fails, fails.map((f) => `${f.code}:${f.id}`).join(', ')).toEqual([]);
  });

  it('moves the hall and its branch without disconnecting any ports', () => {
    const m = buildDetailSchematicModel({
      poolHallAttached: false,
      poolHallX: 840,
      floorBranchY: 800,
    });
    expect(m.ports['floor.in']).toMatchObject({ x: 1210, y: 800 });
    expect(
      auditSchematicGeometry(m).filter((f) =>
        ['endpoint', 'device-off-pipe', 'non-orthogonal'].includes(f.code),
      ),
    ).toEqual([]);
  });

  it('flags tight parallel spacing on synthetic pipes', () => {
    const synthetic = structuredClone(DETAIL_SCHEMATIC_MODEL);
    synthetic.ports['probe.a0'] = { x: 50, y: 200, owner: 'probe-a' };
    synthetic.ports['probe.a1'] = { x: 200, y: 200, owner: 'probe-a' };
    synthetic.ports['probe.b0'] = { x: 50, y: 206, owner: 'probe-b' };
    synthetic.ports['probe.b1'] = { x: 200, y: 206, owner: 'probe-b' };
    synthetic.pipes.push({
      id: 'spacing-probe-a',
      start: 'probe.a0',
      end: 'probe.a1',
      points: [
        [50, 200],
        [200, 200],
      ],
      kind: 'hot',
      states: [3],
      d: 'M50 200L200 200',
    });
    synthetic.pipes.push({
      id: 'spacing-probe-b',
      start: 'probe.b0',
      end: 'probe.b1',
      points: [
        [50, 206],
        [200, 206],
      ],
      kind: 'cold',
      states: [3],
      d: 'M50 206L200 206',
    });
    const fails = auditSchematicGeometry(synthetic);
    expect(fails.some((f) => f.code === 'parallel-spacing')).toBe(true);
  });

  const cases = [
    ['pipe-body', 'pipe-body'],
    ['undeclared-bridge', 'undeclared-bridge'],
    ['endpoint', 'endpoint'],
    ['device-off-pipe', 'device-off-pipe'],
    ['non-orthogonal', 'non-orthogonal'],
    ['parallel-spacing', 'parallel-spacing'],
    ['label-label', 'label-label'],
  ] as const;

  it.each(cases)('mutation %s is detected', (kind, code) => {
    const broken = mutateModel(DETAIL_SCHEMATIC_MODEL, kind);
    const fails = auditSchematicGeometry(broken);
    expect(
      fails.some(
        (f) =>
          f.code === code ||
          (kind === 'endpoint' && f.code === 'endpoint') ||
          (kind === 'non-orthogonal' && f.code === 'non-orthogonal') ||
          (kind === 'label-label' && f.code === 'label-label'),
      ),
    ).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { DETAIL_SCHEMATIC_MODEL } from './buildDetailModel.js';
import { auditSchematicGeometry, mutateModel } from './schematicGeometry.js';

describe('detail schematic geometry', () => {
  it('production model passes wiring checks', () => {
    const fails = auditSchematicGeometry(DETAIL_SCHEMATIC_MODEL);
    const critical = fails.filter((f) =>
      ['endpoint', 'device-off-pipe', 'non-orthogonal'].includes(f.code),
    );
    expect(critical, fails.map((f) => `${f.code}:${f.id}`).join(', ')).toEqual([]);
  });

  it('flags tight parallel spacing on synthetic pipes', () => {
    const synthetic = structuredClone(DETAIL_SCHEMATIC_MODEL);
    synthetic.pipes.push({
      id: 'spacing-probe-a',
      start: 'hp.hot',
      end: 'hp.cold',
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
      start: 'hp.hot',
      end: 'hp.cold',
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
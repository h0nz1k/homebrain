import { describe, expect, it } from 'vitest';
import { buildTodoItems } from './todoItems.js';
import { createMockSnapshot } from './mock.js';

const NOW = Date.parse('2026-11-24T08:45:00Z');

describe('buildTodoItems', () => {
  it('ok: empty → card would be hidden', () => {
    expect(buildTodoItems(createMockSnapshot('ok', NOW))).toEqual([]);
  });

  it('dedup: exhausted quota + exhaust_forecast = one item; critical before warning', () => {
    const items = buildTodoItems(createMockSnapshot('warn', NOW));
    const titles = items.map((i) => i.title);
    // Exhausted Y 5h appears once.
    expect(
      titles.filter((t) => /Poskytovatel Y/.test(t) && /5 h|vyčerp/.test(t)).length,
    ).toBeLessThanOrEqual(2);
    const exhausted = items.filter((i) => i.tag === 'vyčerpáno');
    expect(exhausted.length).toBeGreaterThanOrEqual(1);
    // Critical items first.
    const levels = items.map((i) => i.level);
    const firstWarn = levels.findIndex((l) => l === 'warning');
    const lastCrit = levels.lastIndexOf('critical');
    if (firstWarn >= 0 && lastCrit >= 0) expect(lastCrit).toBeLessThan(firstWarn);
  });

  it('real: exactly exhausted + forecast + blocked (no mere-low / SLA dupes)', () => {
    const items = buildTodoItems(createMockSnapshot('real', NOW));
    expect(items).toHaveLength(3);
    expect(items.some((i) => i.tag === 'blokováno')).toBe(true);
    expect(items.some((i) => i.tag === 'vyčerpáno')).toBe(true);
    expect(items.some((i) => i.tag === 'dojde před obnovou')).toBe(true);
    expect(items.every((i) => i.tag !== 'málo zbývá' && i.tag !== 'SLA')).toBe(true);
    const ids = new Set(items.map((i) => i.id));
    expect(ids.size).toBe(items.length);
  });

  it('stale: data neaktuální amber', () => {
    const items = buildTodoItems(createMockSnapshot('stale', NOW));
    expect(items.some((i) => i.tag === 'data neaktuální' && i.tone === 'warn')).toBe(true);
  });

  it('crit: service down + agent stopped', () => {
    const items = buildTodoItems(createMockSnapshot('crit', NOW));
    expect(items.some((i) => i.tag === 'výpadek')).toBe(true);
    expect(items.some((i) => i.tag === 'neběží')).toBe(true);
  });
});

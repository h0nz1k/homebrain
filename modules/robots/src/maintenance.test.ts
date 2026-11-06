import { describe, expect, it } from 'vitest';
import { consumableInfo } from './consumables.js';
import { parseGuides } from './guides.js';
import { maintenanceGroups, maintenanceItems, maintenanceSummary } from './maintenance.js';

const robot = {
  consumables: [
    consumableInfo('main_brush', 264),
    consumableInfo('sensors', -5.9),
    consumableInfo('dock_strainer', 42),
    consumableInfo('dock_brush', 41),
  ],
  tanks: [
    { key: 'clean_water' as const, label: 'Čistá voda', ok: true, text: 'V pořádku' },
    { key: 'dirty_water' as const, label: 'Špinavá voda', ok: false, text: 'Vylít' },
  ],
  dockError: null,
};
const step = { steps: [{ text: 'Krok.' }] };

describe('Údržba model', () => {
  it('puts every item into Robot / Dok, most urgent first', () => {
    const items = maintenanceItems(robot, null);
    const groups = maintenanceGroups(items, null);
    expect(groups.map((g) => [g.id, g.items.map((i) => `${i.id}:${i.tone}`)])).toEqual([
      ['robot', ['sensors:crit', 'main_brush:ok']],
      ['dock', ['dirty_water:crit', 'dock_brush:warn', 'dock_strainer:ok', 'clean_water:ok']],
    ]);
    expect(items.find((i) => i.id === 'dirty_water')).toMatchObject({
      kind: 'tank',
      status: 'Vylít',
      part: 'dirty_water',
    });
  });

  it('adds guide-only parts once, never duplicating a counter or tank', () => {
    const guides = parseGuides({
      schema: 1,
      parts: {
        mop: { title: 'Mopy', ...step },
        dust_bag: { title: 'Sáček', ...step },
        dock_brush: { title: 'Kartáček', ...step },
        clean_water: { title: 'Nádrž', ...step },
      },
    });
    const items = maintenanceItems(robot, guides);
    const guideOnly = items.filter((i) => i.kind === 'guide');
    expect(guideOnly.map((i) => [i.id, i.group, i.status])).toEqual([
      ['mop', 'robot', 'Pravidelně – návod'],
      ['dust_bag', 'dock', 'Pravidelně – návod'],
    ]);
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
    // Guide-only tiles sort after everything with a state.
    expect(items.at(-1)?.kind).toBe('guide');
  });

  it('summary: all fine / red waits, amber is only „brzy“ / dock error not counted twice', () => {
    expect(
      maintenanceSummary(maintenanceItems({ ...robot, consumables: [], tanks: [] }, null), null),
    ).toEqual({ tone: 'ok', count: 0, soon: 0, text: 'Vše v pořádku' });
    const items = maintenanceItems(robot, null);
    // sensors + dirty water red, dock brush amber
    expect(maintenanceSummary(items, null)).toEqual({
      tone: 'crit',
      count: 2,
      soon: 1,
      text: '2 věci čekají · 1 brzy',
    });
    expect(maintenanceSummary(items, { title: 'Plná nádrž' }).count).toBe(2);
    const soonOnly = maintenanceItems(
      { ...robot, tanks: [], consumables: [consumableInfo('filter', 30)] },
      null,
    );
    expect(maintenanceSummary(soonOnly, null)).toEqual({
      tone: 'warn',
      count: 0,
      soon: 1,
      text: '1 brzy',
    });
    expect(maintenanceSummary(soonOnly, { title: 'Chyba doku' })).toEqual({
      tone: 'crit',
      count: 1,
      soon: 1,
      text: '1 věc čeká · 1 brzy',
    });
    expect(maintenanceGroups([], { title: 'Chyba doku' })).toEqual([
      { id: 'dock', label: 'Dok', items: [], note: 'Chyba doku' },
    ]);
  });

  it('summary: Czech plural of waiting items (1 věc čeká, 2–4 věci čekají, 5+ věcí čeká)', () => {
    const red = (n: number) =>
      maintenanceItems(
        {
          consumables: [],
          tanks: Array.from({ length: n }, (_, i) => ({
            key: (['clean_water', 'dirty_water', 'cleaning_fluid', 'water_shortage'] as const)[
              i % 4
            ]!,
            label: `T${i}`,
            ok: false,
            text: 'Doplnit',
          })),
          dockError: null,
        },
        null,
      ).map((item, i) => ({ ...item, id: `t${i}` }));
    expect([1, 2, 4, 5].map((n) => maintenanceSummary(red(n), null).text)).toEqual([
      '1 věc čeká',
      '2 věci čekají',
      '4 věci čekají',
      '5 věcí čeká',
    ]);
  });
});

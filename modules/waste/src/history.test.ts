import { describe, expect, it } from 'vitest';
import type { EntityStateLike } from '@homebrain/ha-client';
import { adaptWasteEntities, wasteDisplayName, wasteTypeFromLabel } from './adapter.js';
import { parseWasteHistory } from './history.js';
import { lastCollectedLabel, monthBounds, shiftMonth } from './views/WasteView.js';

// Pondělí 2. 11. 2026 10:30 v Praze – den, kdy se ptal majitel („Nebyl vyvezen plast dnes?“).
const now = Date.parse('2026-11-02T09:30:00Z');
const bindings = { waste_next: 'sensor.odpady', waste_calendar: 'calendar.svoz_odpadu' };
/** Produkční tvar WCS senzoru: stav = nejbližší typ, termíny až od zítřka v atributech. */
const sensor: EntityStateLike = {
  entity_id: 'sensor.odpady',
  state: 'Papir',
  last_updated: new Date(now).toISOString(),
  attributes: {
    friendly_name: 'Odpady svoz',
    '2026-11-03': 'Papir',
    '2026-11-04': 'Komunalni odpad',
    '2026-11-12': 'Barevne sklo',
    '2026-11-16': 'Plasty',
  },
};
const calendar: EntityStateLike = {
  entity_id: 'calendar.svoz_odpadu',
  state: 'on',
  last_updated: new Date(now).toISOString(),
  attributes: {},
};
function adapt(options: Partial<Parameters<typeof adaptWasteEntities>[0]> = {}) {
  const states = new Map([sensor, calendar].map((state) => [state.entity_id, state]));
  return adaptWasteEntities({
    bindings,
    getState: (id) => states.get(id),
    now,
    calendarEvents: [{ start: '2026-11-02', summary: 'Plasty', uid: 'today' }],
    ...options,
  });
}

describe('štítky zdroje → typ odpadu', () => {
  it.each([
    ['Barevne sklo', 'glass'],
    ['Barevné sklo', 'glass'],
    ['Bílé sklo', 'glass'],
    ['Sklo', 'glass'],
    ['Plasty a nápojové kartony', 'plastic'],
    ['Sběr papíru', 'paper'],
    ['Papir', 'paper'],
    ['Bioodpad', 'bio'],
    ['Nebezpečný odpad', 'hazardous'],
    ['Elektro odpad', 'electro'],
    ['Objemný odpad', 'bulky'],
    ['Komunalni odpad', 'mixed'],
    ['Směsný komunální odpad', 'mixed'],
    ['Kovy', 'other'],
  ] as const)('%s → %s', (label, type) => {
    expect(wasteTypeFromLabel(label)).toBe(type);
  });
  it('zachová variantu skla a komunálu v češtině s diakritikou', () => {
    expect(wasteDisplayName('glass', 'Barevne sklo')).toBe('Barevné sklo');
    expect(wasteDisplayName('glass', 'Bile sklo')).toBe('Bílé sklo');
    expect(wasteDisplayName('glass', 'Sklo')).toBe('Sklo');
    expect(wasteDisplayName('mixed', 'Komunalni odpad')).toBe('Komunální odpad');
    expect(wasteDisplayName('other', ' Kovy ')).toBe('Kovy');
  });
  it('sklo ze senzoru už není „Ostatní“', () => {
    const glass = adapt().upcoming.find((event) => event.collection_date === '2026-11-12');
    expect(glass?.waste_type).toBe('glass');
    expect(glass?.display_name).toBe('Barevné sklo');
    expect(adapt().upcoming.some((event) => event.waste_type === 'other')).toBe(false);
  });
});

describe('dnešní svoz a historie', () => {
  it('dnešní termín z kalendáře je dnes i když senzor začíná až zítřkem', () => {
    const schedule = adapt();
    expect(schedule.today.map((event) => event.waste_type)).toEqual(['plastic']);
    expect(schedule.next?.waste_type).toBe('plastic');
    expect(schedule.tomorrow.map((event) => event.waste_type)).toEqual(['paper']);
  });
  it('last_collection_date doplní z historie integrace a minulé svozy dá do past', () => {
    const schedule = adapt({
      history: [
        { date: '2026-10-05', label: 'Plasty' },
        { date: '2026-10-19', label: 'Plasty' },
        { date: '2026-10-20', label: 'Papir' },
        { date: '2026-10-08', label: 'Barevne sklo' },
      ],
    });
    expect(schedule.next?.last_collection_date).toBe('2026-10-19');
    const paper = schedule.upcoming.find((event) => event.waste_type === 'paper');
    expect(paper?.last_collection_date).toBe('2026-10-20');
    const glass = schedule.upcoming.find((event) => event.waste_type === 'glass');
    expect(glass?.last_collection_date).toBe('2026-10-08');
    // Další plast má jako minulý svoz dnešek (plán), ne historii.
    const nextPlastic = schedule.upcoming.find((event) => event.collection_date === '2026-11-16');
    expect(nextPlastic?.last_collection_date).toBe('2026-11-02');
    expect(schedule.past.map((event) => event.collection_date)).toEqual([
      '2026-10-05',
      '2026-10-08',
      '2026-10-19',
      '2026-10-20',
    ]);
    expect(schedule.past.find((event) => event.waste_type === 'glass')?.display_name).toBe(
      'Barevné sklo',
    );
  });
  it('historie neduplikuje termín, který zná i kalendář', () => {
    const schedule = adapt({ history: [{ date: '2026-11-02', label: 'Plasty' }] });
    expect(schedule.today).toHaveLength(1);
  });
  it('chyba historie (starší backend) panel nerozbije', () => {
    const schedule = adapt({ history: 'error' });
    expect(schedule.past).toEqual([]);
    expect(schedule.next?.last_collection_date).toBeUndefined();
    expect(schedule.quality).toBe('ok');
  });
});

describe('WS homebrain/waste/history', () => {
  it('tolerantně vynechá vadné položky', () => {
    expect(
      parseWasteHistory({
        events: [
          { date: '2026-10-19', label: 'Plasty' },
          { date: '2026-02-30', label: 'Papir' },
          { date: '2026-10-20', label: ' ' },
          { date: 20261020, label: 'Papir' },
          null,
        ],
      }),
    ).toEqual([{ date: '2026-10-19', label: 'Plasty' }]);
    expect(parseWasteHistory(null)).toEqual([]);
    expect(parseWasteHistory({ events: 'x' })).toEqual([]);
  });
});

describe('kalendář a „Naposledy“', () => {
  it('posouvá měsíce přes přelom roku', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-11', -13)).toBe('2025-10');
  });
  it('rozsah listování je od nejstaršího záznamu po poslední termín', () => {
    const events = adapt({ history: [{ date: '2026-08-10', label: 'Plasty' }] });
    expect(monthBounds([...events.past, ...events.upcoming], '2026-11-02')).toEqual({
      min: '2026-08',
      max: '2026-11',
    });
    expect(monthBounds([], '2026-11-02')).toEqual({ min: '2026-11', max: '2026-11' });
  });
  it('popisek posledního svozu', () => {
    expect(lastCollectedLabel('2026-11-02', '2026-11-02')).toBe('dnes');
    expect(lastCollectedLabel('2026-11-01', '2026-11-02')).toBe('včera');
    expect(lastCollectedLabel('2026-10-19', '2026-11-02')).toBe('před 14 dny (19.\u00a010.)');
    expect(lastCollectedLabel('2026-10-19', '2026-11-02', true)).toBe('před 14 dny');
  });
});

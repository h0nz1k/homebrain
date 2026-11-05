import { describe, expect, it } from 'vitest';
import type { EntityStateLike } from '@homebrain/ha-client';
import { adaptWasteEntities, selectWasteEntityIds, WASTE_BINDING_KEYS } from './adapter.js';
import type { WasteDashboardDataset } from './contract.js';

const now = Date.parse('2030-07-18T08:00:00Z');
const dataset: WasteDashboardDataset = {
  schema_version: 1,
  generated_at: '2030-07-18T08:00:00Z',
  source_status: 'available',
  source_updated_at: '2030-07-18T07:00:00Z',
  notices: [],
  events: [
    {
      id: 'demo-paper',
      waste_type: 'paper',
      display_name: 'Papír',
      collection_date: '2030-07-21',
      availability: 'confirmed',
      visual_token: 'waste.paper',
      source_updated_at: null,
    },
  ],
};
function entity(overrides: Partial<EntityStateLike> = {}): EntityStateLike {
  return {
    entity_id: 'sensor.demo_waste_next',
    state: '2030-07-21',
    attributes: { waste_type: 'Papír' },
    last_updated: new Date(now).toISOString(),
    ...overrides,
  };
}
function adapt(
  bindings: Record<string, string>,
  states: EntityStateLike[],
  options: { timeZone?: string; maxAgeMs?: number; now?: number } = {},
) {
  const stateMap = new Map(states.map((state) => [state.entity_id, state]));
  return adaptWasteEntities({ bindings, getState: (id) => stateMap.get(id), now, ...options });
}
const datasetBindings = { waste_dataset: 'sensor.demo_waste_dataset' };
const nextBindings = { waste_next: 'sensor.demo_waste_next' };
function datasetEntity(raw: unknown = dataset) {
  return entity({
    entity_id: datasetBindings.waste_dataset,
    state: 'ready',
    attributes: { waste_dashboard: raw },
  });
}

describe('Adaptér entit odpadů', () => {
  it('vybírá jen podporované vazby a vrací unikátní ID', () => {
    expect(WASTE_BINDING_KEYS).toEqual(['waste_dataset', 'waste_next', 'waste_calendar']);
    expect(
      selectWasteEntityIds({
        ...datasetBindings,
        ...nextBindings,
        waste_next_paper: nextBindings.waste_next,
        waste_next_glass: 'sensor.demo_waste_glass',
        waste_next_empty: '',
        waste_next_: 'sensor.demo_waste_ignored',
        weather: 'sensor.demo_weather',
      }),
    ).toEqual(['sensor.demo_waste_dataset', 'sensor.demo_waste_next', 'sensor.demo_waste_glass']);
  });
  it.each([dataset, JSON.stringify(dataset)])('načítá dataset z objektu i JSON řetězce', (raw) => {
    const result = adapt(datasetBindings, [datasetEntity(raw)]);
    expect(result).toMatchObject({
      quality: 'ok',
      referenceDate: '2030-07-18',
      sourceStatus: 'available',
      sourceUpdatedAt: dataset.source_updated_at,
      next: dataset.events[0],
    });
  });
  it.each(['{broken', '', null, {}, '[]', JSON.stringify({ ...dataset, schema_version: 2 })])(
    'vadný atribut vrací nedostupnost a české oznámení',
    (raw) => {
      const result = adapt(datasetBindings, [datasetEntity(raw)]);
      expect(result.quality).toBe('unavailable');
      expect(result.notices).toContain('Data svozu nejsou momentálně dostupná');
    },
  );
  it('mapuje jednoduchý senzor Papír na jeden potvrzený svoz', () => {
    const result = adapt(nextBindings, [entity()]);
    expect(result.quality).toBe('ok');
    expect(result.upcoming).toHaveLength(1);
    expect(result.next).toMatchObject({
      id: 'sensor.demo_waste_next',
      waste_type: 'paper',
      display_name: 'Papír',
      collection_date: '2030-07-21',
      availability: 'confirmed',
      visual_token: 'waste.paper',
    });
  });
  it.each([
    [' PAPÍR ', 'paper'],
    ['Plasty', 'plastic'],
    ['Sklo', 'glass'],
    ['Bio', 'bio'],
    ['Směsný', 'mixed'],
    ['paper', 'paper'],
    ['Neznámý druh', 'other'],
    ['constructor', 'other'],
    ['NEBEZPECNY ODPAD', 'hazardous'],
  ])('normalizuje označení %s', (label, type) => {
    expect(
      adapt(nextBindings, [entity({ attributes: { waste_type: label } })]).next?.waste_type,
    ).toBe(type);
  });
  it('pro rozpoznaný typ používá české označení místo friendly_name', () => {
    expect(
      adapt(nextBindings, [
        entity({
          attributes: {
            waste_type: 'Papír',
            friendly_name: 'Papír a lepenka – modrá nádoba',
          },
        }),
      ]).next?.display_name,
    ).toBe('Papír');
  });
  it('pro neznámý typ zachová friendly_name', () => {
    expect(
      adapt(nextBindings, [
        entity({ attributes: { waste_type: 'neznámý', friendly_name: 'Speciální svoz' } }),
      ]).next?.display_name,
    ).toBe('Speciální svoz');
  });
  it('slučuje přípony a dává datasetu přednost při shodě data a typu', () => {
    const result = adapt(
      { ...datasetBindings, ...nextBindings, waste_next_glass: 'sensor.demo_waste_glass' },
      [
        datasetEntity(),
        entity(),
        entity({ entity_id: 'sensor.demo_waste_glass', attributes: { waste_type: 'Sklo' } }),
      ],
    );
    expect(result.upcoming).toHaveLength(2);
    expect(result.upcoming.find((item) => item.waste_type === 'paper')?.id).toBe('demo-paper');
    expect(result.upcoming.map((item) => item.waste_type)).toEqual(['glass', 'paper']);
  });
  it('potvrzený senzor nepřepíše zrušený termín v datasetu', () => {
    const result = adapt({ ...datasetBindings, ...nextBindings }, [
      entity(),
      datasetEntity({
        ...dataset,
        events: dataset.events.map((item) => ({ ...item, availability: 'cancelled' })),
      }),
    ]);
    expect(result.next).toBeNull();
    expect(result.cancelled).toHaveLength(1);
  });
  it.each(['unavailable', 'unknown'])('stav %s znamená nedostupný zdroj', (state) => {
    expect(adapt(nextBindings, [entity({ state })]).quality).toBe('unavailable');
  });
  it('chybějící entita znamená nedostupný zdroj', () => {
    expect(adapt(nextBindings, []).quality).toBe('unavailable');
    expect(adapt(datasetBindings, []).quality).toBe('unavailable');
  });
  it('staré last_updated překročí výchozích 36 hodin', () => {
    const old = entity({ last_updated: new Date(now - 36 * 3600000 - 1).toISOString() });
    expect(adapt(nextBindings, [old]).quality).toBe('stale');
    expect(adapt(nextBindings, [old], { maxAgeMs: 48 * 3600000 }).quality).toBe('ok');
  });
  it('používá nejhorší kvalitu ze všech zdrojů', () => {
    const bindings = { ...datasetBindings, ...nextBindings };
    expect(adapt(bindings, [datasetEntity()]).quality).toBe('unavailable');
    expect(
      adapt(bindings, [datasetEntity(), entity({ last_updated: '2030-07-15T00:00:00Z' })]).quality,
    ).toBe('stale');
    expect(
      adapt(bindings, [datasetEntity({ ...dataset, source_status: 'stale' }), entity()]).quality,
    ).toBe('stale');
  });
  it.each(['unavailable', 'error'])(
    'status datasetu %s má přednost před čerstvostí entity',
    (source_status) => {
      expect(adapt(datasetBindings, [datasetEntity({ ...dataset, source_status })]).quality).toBe(
        'unavailable',
      );
    },
  );
  it('prázdné vazby mají konkrétní české oznámení', () => {
    expect(adapt({}, [])).toMatchObject({
      quality: 'unavailable',
      notices: ['Není nastavena vazba na entitu odpadů'],
    });
  });
  it('ISO čas i dnešní datum přepočítá v časovém pásmu', () => {
    const states = [entity({ state: '2030-12-31T23:30:00Z' })];
    const instant = Date.parse('2030-12-31T23:00:00Z');
    expect(adapt(nextBindings, states, { now: instant })).toMatchObject({
      referenceDate: '2031-01-01',
      next: { collection_date: '2031-01-01' },
    });
    expect(adapt(nextBindings, states, { now: instant, timeZone: 'UTC' })).toMatchObject({
      referenceDate: '2030-12-31',
      next: { collection_date: '2030-12-31' },
    });
  });
  it.each(['2030-02-30', 'není datum', '2030-02-30T08:00:00Z'])(
    'vadné datum %s je nedostupné',
    (state) => {
      const result = adapt(nextBindings, [entity({ state })]);
      expect(result.quality).toBe('unavailable');
      expect(result.next).toBeNull();
      expect(result.notices).toContain('Neplatné datum svozu');
    },
  );
  it('počet odmítnutých záznamů přenese i z HA datasetu', () => {
    const result = adapt(datasetBindings, [
      datasetEntity({ ...dataset, events: [...dataset.events, null] }),
    ]);
    expect(result.rejectedCount).toBe(1);
    expect(result.upcoming).toHaveLength(1);
    expect(result.quality).toBe('ok');
  });
});

import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { WasteCollectionEvent, WasteDashboardDataset } from './contract.js';
import { buildSchedule, normalizeDataset, toLocalDateKey, wasteLabel } from './normalize.js';

const fixtureDirectory = new URL('./__fixtures__/legacy/', import.meta.url);
const fixtureNames = readdirSync(fixtureDirectory).filter((name) => name.endsWith('.json'));
function fixture(name: string): unknown {
  return JSON.parse(readFileSync(new URL(`${name}.json`, fixtureDirectory), 'utf8')) as unknown;
}
function schedule(name: string, referenceDate?: string) {
  const result = normalizeDataset(fixture(name));
  return buildSchedule(result, referenceDate ?? result.dataset.generated_at.slice(0, 10));
}

const event = WasteCollectionEvent.parse({
  id: 'demo-event',
  waste_type: 'paper',
  display_name: 'Papír',
  collection_date: '2030-07-31',
  availability: 'confirmed',
  visual_token: 'waste.paper',
  source_updated_at: null,
});
const dataset = WasteDashboardDataset.parse({
  schema_version: 1,
  generated_at: '2030-07-18',
  source_status: 'available',
  source_updated_at: null,
  events: [event],
  notices: [],
});

describe('Kontrakt a převzaté scénáře', () => {
  it('obsahuje všech 12 scénářů', () => expect(fixtureNames).toHaveLength(12));
  it.each(fixtureNames)('%s odpovídá kontraktu nebo deklarovanému raw vstupu', (file) => {
    const name = file.replace(/\.json$/, '');
    const raw = fixture(name);
    const isRaw = name === 'unknown-type' || name === 'invalid-records';
    expect(WasteDashboardDataset.safeParse(raw).success).toBe(!isRaw);
    const result = normalizeDataset(raw);
    expect(WasteDashboardDataset.safeParse(result.dataset).success).toBe(true);
    expect(result.rejectedCount).toBe(name === 'invalid-records' ? 3 : 0);
  });
  it('odmítá další pole i nesprávnou verzi', () => {
    expect(WasteDashboardDataset.safeParse({ ...dataset, extra: true }).success).toBe(false);
    expect(WasteCollectionEvent.safeParse({ ...event, extra: true }).success).toBe(false);
    expect(WasteDashboardDataset.safeParse({ ...dataset, schema_version: 2 }).success).toBe(false);
  });
  it.each([
    ['standard', 'ok', '2030-07-21', 6],
    ['multiple-same-day', 'ok', '2030-07-22', 5],
    ['long-czech-names', 'ok', '2030-07-23', 4],
    ['empty', 'ok', null, 0],
    ['unavailable', 'unavailable', null, 0],
    ['stale', 'stale', '2030-07-25', 2],
    ['unknown-type', 'ok', '2030-07-23', 2],
    ['cancelled', 'ok', '2030-07-27', 2],
    ['year-boundary', 'ok', '2030-12-30', 3],
    ['invalid-records', 'ok', '2030-07-26', 2],
    ['visual-standard', 'ok', '2026-07-21', 6],
    ['visual-pack-v3-executable', 'ok', '2026-07-21', 6],
  ] as const)('%s sestaví očekávaný harmonogram', (name, quality, nextDate, count) => {
    const result = schedule(name);
    expect(result.quality).toBe(quality);
    expect(result.next?.collection_date ?? null).toBe(nextDate);
    expect(result.upcoming).toHaveLength(count);
  });
  it('zachová název Plasty a referenční den standardního scénáře', () => {
    expect(schedule('standard')).toMatchObject({
      referenceDate: '2030-07-18',
      next: { display_name: 'Plasty', collection_date: '2030-07-21' },
    });
  });
  it('seskupí svozy téhož dne a seřadí je podle typu', () => {
    const result = schedule('multiple-same-day', '2030-07-22');
    expect(result.today.map((item) => item.waste_type)).toEqual(['glass', 'paper', 'plastic']);
    expect(result.upcoming.slice(0, 3)).toEqual(result.today);
  });
  it('zrušený svoz není další termín ani dnešní svoz', () => {
    const result = schedule('cancelled', '2030-07-20');
    expect(result.cancelled).toHaveLength(1);
    expect(result.today).toEqual([]);
    expect(result.next?.waste_type).toBe('paper');
  });
  it('řadí termíny přes hranici roku', () => {
    expect(schedule('year-boundary').upcoming.map((item) => item.collection_date)).toEqual([
      '2030-12-30',
      '2031-01-03',
      '2031-01-10',
    ]);
  });
  it('zachová dlouhé české názvy beze změn', () => {
    const original = WasteDashboardDataset.parse(fixture('long-czech-names'));
    expect(schedule('long-czech-names').upcoming.map((item) => item.display_name)).toEqual(
      original.events.map((item) => item.display_name),
    );
  });
  it('opraví neznámý typ i vizuální token', () => {
    expect(schedule('unknown-type').next).toMatchObject({
      waste_type: 'other',
      visual_token: 'waste.other',
      display_name: 'Ostatní odpad',
    });
  });
});

describe('Normalizace a kalendář', () => {
  it.each([null, [], {}, { ...dataset, events: null }, { ...dataset, source_status: 'invalid' }])(
    'neplatný vstup nahradí nedostupným datasetem',
    (raw) => {
      const result = normalizeDataset(raw);
      expect(result.ok).toBe(false);
      expect(buildSchedule(result, '2030-07-18').quality).toBe('unavailable');
      expect(result.dataset.notices).toContain('Data svozu nejsou momentálně dostupná');
    },
  );
  it('počítá vadné záznamy jednotlivě a neztratí platné', () => {
    const result = normalizeDataset({
      ...dataset,
      events: [null, { ...event, collection_date: '2030-02-30' }, event],
    });
    expect(result.rejectedCount).toBe(2);
    expect(result.dataset.events).toEqual([event]);
    expect(buildSchedule(result, '2030-07-18').rejectedCount).toBe(2);
  });
  it('sloučí legacy duplicity: nejnovější popis a zrušení mají přednost', () => {
    const result = normalizeDataset({
      ...dataset,
      events: [
        { ...event, availability: 'cancelled', source_updated_at: '2030-07-18T10:00:00Z' },
        { ...event, display_name: 'Nový název', source_updated_at: '2030-07-19T10:00:00Z' },
        { ...event, source_updated_at: '2030-07-17T10:00:00Z' },
      ],
    });
    expect(result.dataset.events).toEqual([
      expect.objectContaining({
        availability: 'cancelled',
        display_name: 'Nový název',
      }),
    ]);
    expect(result.rejectedCount).toBe(0);
  });
  it('nedostupné události nejsou dalšími termíny podle legacy selektoru', () => {
    const result = buildSchedule(
      { ...dataset, events: [{ ...event, availability: 'unavailable' }] },
      '2030-07-18',
    );
    expect(result.next).toBeNull();
  });
  it.each([
    ['2030-07-31', '2030-08-01'],
    ['2030-12-31', '2031-01-01'],
    ['2032-02-28', '2032-02-29'],
    ['2032-02-29', '2032-03-01'],
    ['2030-03-31', '2030-04-01'],
  ])('dnes a zítra při přechodu %s → %s', (today, tomorrow) => {
    const todayEvent = { ...event, collection_date: today };
    const tomorrowEvent = { ...event, id: 'demo-tomorrow', collection_date: tomorrow };
    const result = buildSchedule(
      {
        ...dataset,
        events: [
          tomorrowEvent,
          todayEvent,
          { ...event, id: 'demo-past', collection_date: '2029-01-01' },
        ],
      },
      today,
    );
    // Minulý svoz stejného typu se doplní z ostatních termínů (historie i plán).
    const today_ = { ...todayEvent, last_collection_date: '2029-01-01' };
    const tomorrow_ = { ...tomorrowEvent, last_collection_date: today };
    expect(result.today).toEqual([today_]);
    expect(result.tomorrow).toEqual([tomorrow_]);
    expect(result.next).toEqual(today_);
    expect(result.upcoming).toEqual([today_, tomorrow_]);
    expect(result.past.map((item) => item.id)).toEqual(['demo-past']);
  });
  it('převádí okamžik podle zadaného časového pásma', () => {
    const date = new Date('2030-12-31T23:30:00Z');
    expect(toLocalDateKey(date)).toBe('2031-01-01');
    expect(toLocalDateKey(date, 'UTC')).toBe('2030-12-31');
    expect(toLocalDateKey(new Date('2030-07-18T22:30:00Z'))).toBe('2030-07-19');
  });
  it('odmítá neplatné referenční datum', () => {
    expect(() => buildSchedule(dataset, '2030-02-30')).toThrow('Neplatné referenční datum');
  });
});

it('zachová pouze platné datum posledního svozu před dalším termínem', () => {
  const normalize = (last: string) =>
    normalizeDataset({ ...dataset, events: [{ ...event, last_collection_date: last }] }).dataset
      .events[0];
  expect(normalize('2030-07-17')?.last_collection_date).toBe('2030-07-17');
  for (const invalid of ['2030-02-30', '2030-07-31', '2030-08-01']) {
    expect(normalize(invalid)?.last_collection_date).toBeUndefined();
  }
});

describe('wasteLabel', () => {
  it('rozdělí název obce na krátký popisek a detail (– i -)', () => {
    expect(
      wasteLabel({
        waste_type: 'bulky',
        display_name:
          'Objemný odpad – mimořádný svoz rozměrného vybavení domácností a starého zahradního nábytku',
      }),
    ).toEqual({
      short: 'Objemný odpad',
      detail: 'mimořádný svoz rozměrného vybavení domácností a starého zahradního nábytku',
      full: 'Objemný odpad – mimořádný svoz rozměrného vybavení domácností a starého zahradního nábytku',
    });
    expect(
      wasteLabel({ waste_type: 'bio', display_name: 'Bioodpad - hnědá nádoba' }),
    ).toMatchObject({ short: 'Bioodpad', detail: 'hnědá nádoba' });
  });
  it('dlouhý název bez oddělovače dostane kanonický název typu, krátký zůstane', () => {
    const full = 'Mimořádný svoz rozměrného vybavení domácností a nábytku';
    expect(wasteLabel({ waste_type: 'bulky', display_name: full })).toEqual({
      short: 'Objemný odpad',
      detail: full,
      full,
    });
    expect(wasteLabel({ waste_type: 'paper', display_name: 'Papír' })).toEqual({
      short: 'Papír',
      detail: null,
      full: 'Papír',
    });
    // Pomlčka uvnitř slova není oddělovač.
    expect(wasteLabel({ waste_type: 'electro', display_name: 'Elektro-odpad' }).short).toBe(
      'Elektro-odpad',
    );
  });
});

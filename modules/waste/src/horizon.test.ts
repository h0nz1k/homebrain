import { describe, expect, it } from 'vitest';
import { horizonNotice, parseWasteHorizon, typesWithoutNext } from './horizon.js';
import type { WasteCollectionEvent } from './contract.js';

const ending = {
  status: 'ending',
  last_date: '2026-12-30',
  days_left: 20,
  warn_days: 30,
  warning: true,
  types: [{ label: 'Plasty', last_date: '2026-12-16', days_left: 6 }],
};

describe('parseWasteHorizon', () => {
  it('přečte odpověď backendu a vadnou odmítne', () => {
    expect(parseWasteHorizon({ horizon: ending })).toEqual(ending);
    expect(parseWasteHorizon({ events: [] })).toBeNull();
    expect(parseWasteHorizon({ horizon: { status: 'nonsense' } })).toBeNull();
    expect(parseWasteHorizon(null)).toBeNull();
    expect(parseWasteHorizon({ horizon: { ...ending, last_date: '30. 12.' } })).toBeNull();
  });
});

describe('horizonNotice', () => {
  it('klidné upozornění s datem konce a rokem k doplnění', () => {
    const notice = horizonNotice(ending)!;
    expect(notice.title).toBe('Svozový kalendář končí 30. 12. – doplňte rozpis na 2027');
    expect(notice.help.length).toBeGreaterThanOrEqual(2);
    expect(notice.help.join(' ')).toContain('2027');
  });
  it('po konci dat mluví v minulém čase', () => {
    expect(horizonNotice({ ...ending, status: 'ended', days_left: -3 })!.title).toBe(
      'Svozový kalendář skončil 30. 12. – doplňte rozpis na 2027',
    );
  });
  it('dost dat, žádná data nebo chybějící backend = nic', () => {
    expect(horizonNotice({ ...ending, status: 'ok', warning: false })).toBeNull();
    expect(
      horizonNotice({ ...ending, status: 'empty', last_date: null, days_left: null, types: [] }),
    ).toBeNull();
    expect(horizonNotice(null)).toBeNull();
    expect(horizonNotice(undefined)).toBeNull();
  });
});

function ev(type: WasteCollectionEvent['waste_type'], date: string): WasteCollectionEvent {
  return {
    id: `${type}-${date}`,
    waste_type: type,
    display_name: type,
    collection_date: date,
    availability: 'confirmed',
    visual_token: `waste.${type}`,
    source_updated_at: null,
  };
}

describe('typesWithoutNext', () => {
  it('typy z historie bez dalšího známého termínu', () => {
    const past = [
      ev('plastic', '2026-12-02'),
      ev('paper', '2026-12-03'),
      ev('glass', '2026-11-01'),
    ];
    const upcoming = [ev('paper', '2026-12-30'), ev('glass', '2026-12-29')];
    upcoming[1]!.availability = 'cancelled';
    expect([...typesWithoutNext(past, upcoming)].sort()).toEqual(['glass', 'plastic']);
    expect(typesWithoutNext([], []).size).toBe(0);
  });
});

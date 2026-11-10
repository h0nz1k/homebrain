import { describe, expect, it } from 'vitest';
import { batteryLabel, cookingOrder, filterPlaylists, reachedTarget } from './state';

describe('kitchen state', () => {
  it('offers a charging limit hint only for a known stopped charging state at 80% or more', () => {
    expect(batteryLabel('80', 'not_charging')).toContain('nabíjení omezeno');
    expect(batteryLabel('80', 'charging')).not.toContain('omezeno');
    expect(batteryLabel('79', 'not_charging')).not.toContain('omezeno');
    expect(batteryLabel('90', null)).not.toContain('omezeno');
    expect(batteryLabel(null, 'not_charging')).toContain('nedostupná');
    expect(batteryLabel('unavailable', 'not_charging')).toContain('nedostupná');
  });
  it('promotes active cooking cards, recipes lead only when idle', () => {
    expect(cookingOrder({ fryer: false, meater: false, timers: false })[0]).toBe('recipes');
    expect(cookingOrder({ fryer: false, meater: true, timers: true })).toEqual([
      'meater',
      'timers',
      'fryer',
      'recipes',
    ]);
    expect(cookingOrder({ fryer: true, meater: false, timers: false })).toEqual([
      'fryer',
      'meater',
      'timers',
      'recipes',
    ]);
  });
  it('filters playlists by account instance and Czech title', () => {
    const items = [
      { uri: 'demo://playlist/1', name: 'Večerní KLID', providers: ['a'], image: null },
      { uri: 'demo://playlist/2', name: 'Večerní klid', providers: ['b'], image: null },
    ];
    expect(filterPlaylists(items, 'a', 'klid')).toEqual([items[0]]);
    expect(filterPlaylists(items, '', ' nic ')).toEqual([]);
  });
  it('offers a rest timer at target and avoids an already resting probe', () => {
    expect(reachedTarget({ state: 'remove', internal: null, target: null })).toBe(true);
    expect(reachedTarget({ state: 'cooking', internal: 64, target: 63 })).toBe(true);
    expect(reachedTarget({ state: 'resting', internal: 64, target: 63 })).toBe(false);
    expect(reachedTarget({ state: 'cooking', internal: null, target: 63 })).toBe(false);
  });
});

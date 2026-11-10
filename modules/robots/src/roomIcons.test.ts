import { describe, expect, it } from 'vitest';
import { roomIconKind } from './roomIcons.js';

describe('roomIconKind', () => {
  it.each([
    ['Obývací pokoj', 'sofa'],
    ['Kuchyně', 'pot'],
    ['Jídelna', 'dining'],
    ['Chodba', 'door'],
    ['WC', 'toilet'],
    ['Koupelna', 'bath'],
    ['Prádelna', 'laundry'],
    ['Šatna', 'closet'],
    ['Neznámý sál', 'generic'],
  ] as const)('maps %s → %s', (name, kind) => {
    expect(roomIconKind(name)).toBe(kind);
  });
});

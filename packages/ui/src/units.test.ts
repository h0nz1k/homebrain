import { expect, it } from 'vitest';
import { NBSP, formatQuantity, nbspUnits } from './units.js';

it('joins numbers and units with a non-breaking space', () => {
  expect(formatQuantity(8.5, 'kWp')).toBe(`8,5${NBSP}kWp`);
  expect(formatQuantity(12)).toBe('12');
  expect(nbspUnits('Obvykle 10–50 %, jistič 3 × 25 A, střídač 8 kW.')).toBe(
    `Obvykle 10–50${NBSP}%, jistič 3×25${NBSP}A, střídač 8${NBSP}kW.`,
  );
  expect(formatQuantity(35, '°')).toBe('35°');
  expect(nbspUnits('0 ° je jih, 21 °C, cena 6 Kč/kWh')).toBe(
    `0° je jih, 21${NBSP}°C, cena 6${NBSP}Kč/kWh`,
  );
  // A word that merely starts like a unit stays breakable.
  expect(nbspUnits('2 Auta, 5 se')).toBe('2 Auta, 5 se');
});

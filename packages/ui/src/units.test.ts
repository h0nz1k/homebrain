import { expect, it } from 'vitest';
import { NBSP, formatPower, formatQuantity, nbspUnits } from './units.js';

const WJ = '\u2060';

it('joins numbers and units with a non-breaking space', () => {
  expect(formatQuantity(8.5, 'kWp')).toBe(`8,5${NBSP}kWp`);
  expect(formatQuantity(12)).toBe('12');
  expect(nbspUnits('Obvykle 10–50 %, jistič 3 × 25 A, střídač 8 kW.')).toBe(
    `Obvykle 10${WJ}–${WJ}50${NBSP}%, jistič 3×25${NBSP}A, střídač 8${NBSP}kW.`,
  );
  expect(formatQuantity(35, '°')).toBe('35°');
  expect(nbspUnits('0 ° je jih, 21 °C, cena 6 Kč/kWh')).toBe(
    `0°${NBSP}je jih, 21${NBSP}°C, cena 6${NBSP}Kč/kWh`,
  );
  expect(nbspUnits('šetrnější k baterii a v mrazu')).toBe(
    `šetrnější k${NBSP}baterii a${NBSP}v${NBSP}mrazu`,
  );
  // A word that merely starts like a unit stays breakable.
  expect(nbspUnits('2 Auta, 5 se')).toBe('2 Auta, 5 se');
});

it('keeps an angle with its direction', () => {
  expect(nbspUnits('0 ° jih, −90 ° východ, 90 ° západ')).toBe(
    `0°${NBSP}jih, −90°${NBSP}východ, 90°${NBSP}západ`,
  );
});

it('formats power in W under 1 kW, otherwise in kW', () => {
  expect(formatPower(80)).toBe(`80${NBSP}W`);
  expect(formatPower(0.08, 'kW')).toBe(`80${NBSP}W`);
  expect(formatPower(5, 'kW')).toBe(`5${NBSP}kW`);
  expect(formatPower(2560)).toBe(`2,56${NBSP}kW`);
});

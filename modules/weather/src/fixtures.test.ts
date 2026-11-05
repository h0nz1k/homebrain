import { describe, expect, it } from 'vitest';
import { encodePng, mockDbz, mockRadarImage } from './fixtures.js';

describe('dev mock radaru', () => {
  it('kóduje skutečné PNG (signatura, IHDR)', () => {
    const png = encodePng(new Uint8Array(2 * 2 * 4).fill(255), 2, 2);
    expect([...png.slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(String.fromCharCode(...png.slice(12, 16))).toBe('IHDR');
    expect(mockRadarImage('/x/obs-0').startsWith('data:image/png;base64,')).toBe(true);
  });
  it('pole je nepravidelné (fBm), ne soustředné kruhy, a posouvá se s prouděním', () => {
    // around a shower centre the dBZ must vary with angle (not a disc)
    const ring = Array.from({ length: 16 }, (_, k) =>
      mockDbz(
        540 + 14 * Math.cos((k / 16) * 2 * Math.PI),
        270 + 11 * Math.sin((k / 16) * 2 * Math.PI),
        0,
        false,
      ),
    );
    expect(Math.max(...ring) - Math.min(...ring)).toBeGreaterThan(4);
    // advection: the pattern at +10 min is the one 8 px upstream now
    expect(mockDbz(300, 200, 10, false)).toBeCloseTo(mockDbz(292, 202.2, 0, false), 5);
    // storm scenario rains at home now (Praha mock home)
    expect(mockDbz(256.6, 189.8, 0, true)).toBeGreaterThan(20);
  });
});

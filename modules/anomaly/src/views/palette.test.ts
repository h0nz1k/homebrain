import { describe, expect, it } from 'vitest';
import { AW_PALETTE } from './styles.js';

// Surfaces the module's text sits on (packages/ui tokens.css + the darker kiosk surfaces).
const SURFACES = {
  dark: { bg: '#0b0d10', s1: '#111418', s2: '#161a20', kiosk: '#111923' },
  light: { bg: '#f6f7f9', s1: '#ffffff', s2: '#f3f4f6' },
} as const;
// Secondary text (`--hb-t2`, the kiosk override) – owner: ≥ 4.5:1.
const SECONDARY = { dark: ['#a3acb9', '#b8c1ce'], light: ['#4a5361'] } as const;

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r!) + 0.7152 * lin(g!) + 0.0722 * lin(b!);
}
function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

describe('Hlídání domu palette contrast', () => {
  for (const theme of ['dark', 'light'] as const) {
    it(`${theme}: tier inks and secondary text ≥ 4.5:1 on every surface`, () => {
      const p = AW_PALETTE[theme];
      for (const surface of Object.values(SURFACES[theme])) {
        for (const ink of [p.observe, p.suspect, p.fault, ...SECONDARY[theme]])
          expect(contrast(ink, surface), `${ink} on ${surface}`).toBeGreaterThanOrEqual(4.5);
      }
    });
    it(`${theme}: the solid suspicion button label ≥ 4.5:1`, () => {
      const p = AW_PALETTE[theme];
      expect(contrast(p.onSuspect, p.barSuspect)).toBeGreaterThanOrEqual(4.5);
    });
  }
  it('fault button and pill: white on the fault fill ≥ 4.5:1', () => {
    expect(contrast('#ffffff', '#b5243d')).toBeGreaterThanOrEqual(4.5);
  });
});

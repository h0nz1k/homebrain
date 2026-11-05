import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const css = readFileSync(join(import.meta.dirname, 'tokens.css'), 'utf8');
function luminance(hex: string) {
  const channels = hex.match(/[\da-f]{2}/gi)!.map((value) => {
    const channel = parseInt(value, 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
}
function contrast(a: string, b: string) {
  const [lo, hi] = [luminance(a), luminance(b)].sort((x, y) => x - y);
  return (hi! + 0.05) / (lo! + 0.05);
}
it('keeps micro-label contrast at least 4.5 against both surfaces in every palette', () => {
  const palettes = [...css.matchAll(/\{([^{}]*--hb-bg:[^{}]*)\}/g)];
  expect(palettes).toHaveLength(3); // default dark, light/system, system dark
  for (const [, block] of palettes) {
    const tokens = Object.fromEntries(
      [...block!.matchAll(/--hb-([\w-]+):\s*(#[\da-f]{6})/gi)].map(([, key, value]) => [
        key,
        value,
      ]),
    );
    for (const surface of ['s1', 'bg'])
      expect(contrast(tokens.t3!, tokens[surface]!)).toBeGreaterThanOrEqual(4.5);
  }
});
it('preserves the requested motion and accessibility overrides', () => {
  for (const [name, value] of Object.entries({
    'drift-far': '240s',
    'drift-near': '180s',
    glow: '90s',
    rain: '60s',
    xfade: '3s',
    enter: '900ms',
    stagger: '120ms',
    pulse: '2.4s',
    night: '20s',
  })) {
    expect(css).toContain(`--hb-m-${name}: ${value};`);
  }
  expect(css).toMatch(
    /prefers-reduced-motion: reduce[^}]*--hb-m-xfade: 0?\.2s;\s*--hb-m-enter: 0s;/,
  );
});
it('bundles both Inter subsets for every supported weight', () => {
  const fonts = readFileSync(join(import.meta.dirname, 'fonts.css'), 'utf8');
  expect(fonts.match(/@font-face/g)).toHaveLength(10);
  for (const weight of [200, 400, 500, 600, 700]) {
    const source = readFileSync(
      join(import.meta.dirname, `../node_modules/@fontsource/inter/${weight}.css`),
      'utf8',
    );
    for (const subset of ['latin', 'latin-ext']) {
      expect(fonts).toContain(`@fontsource/inter/files/inter-${subset}-${weight}-normal.woff2`);
      const block = source.split(`/* inter-${subset}-${weight}-normal */`)[1]!.split('}')[0]!;
      expect(fonts.replace(/\s/g, '')).toContain(
        block.match(/unicode-range: [^;]+;/)![0].replace(/\s/g, ''),
      );
    }
  }
});

it('defines the Dnes display tokens from the signals spec', () => {
  for (const token of ['--hb-display-w', '--hb-r-lg', '--hb-glow', '--hb-space-page'])
    expect(css).toContain(`${token}:`);
  expect(css).toMatch(/--hb-r-lg:\s*18px/);
});

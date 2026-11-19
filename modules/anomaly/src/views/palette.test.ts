import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AW_PALETTE } from './styles.js';

/**
 * Contrast is measured on the real design tokens (packages/ui tokens.css and the darker Dnes
 * kiosk surfaces in modules/today), not on copies of them, so a token change that breaks the
 * owner's rule (secondary text ≥ 4.5:1, icon tiles ≥ 3:1) fails here.
 */
const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const TOKENS = read('../../../../packages/ui/src/tokens.css');
const TODAY = read('../../../today/src/views/todayStyles.ts');

/** `--name: #hex` pairs of the first rule whose selector starts with `selector`. */
function block(css: string, selector: string): Record<string, string> {
  const start = css.indexOf(selector);
  if (start < 0) throw new Error(`no ${selector}`);
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
  return Object.fromEntries(
    Array.from(body.matchAll(/--([\w-]+)\s*:\s*(#[0-9a-fA-F]{6})\b/g), (m) => [
      m[1]!,
      m[2]!.toLowerCase(),
    ]),
  );
}

const DARK = block(TOKENS, ":root,\n[data-theme='dark']");
const LIGHT = block(
  TOKENS,
  "[data-theme='light'],\n[data-theme='system'] {\n  color-scheme: light",
);
const KIOSK = block(TODAY, '.today-kiosk{--hb-s1');

type Rgb = [number, number, number];
const rgb = (hex: string): Rgb => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;
function luminance(c: Rgb) {
  const lin = (v: number) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
}
function contrast(a: Rgb | string, b: Rgb | string) {
  const [x, y] = [a, b].map((c) => luminance(typeof c === 'string' ? rgb(c) : c));
  const [hi, lo] = [x!, y!].sort((p, q) => q - p);
  return (hi! + 0.05) / (lo! + 0.05);
}
/** `color-mix(in srgb, tint 14%, transparent)` painted over `surface`. */
const tint = (hue: string, surface: string, share = 0.14): Rgb => {
  const [h, s] = [rgb(hue), rgb(surface)];
  return h.map((v, i) => v * share + s[i]! * (1 - share)) as Rgb;
};

const THEMES = {
  dark: {
    t: DARK,
    surfaces: [DARK['hb-bg']!, DARK['hb-s1']!, DARK['hb-s2']!],
    aw: AW_PALETTE.dark,
  },
  light: {
    t: LIGHT,
    surfaces: [LIGHT['hb-bg']!, LIGHT['hb-s1']!, LIGHT['hb-s2']!],
    aw: AW_PALETTE.light,
  },
  kiosk: {
    t: { ...DARK, ...KIOSK },
    surfaces: [KIOSK['hb-s1']!, KIOSK['hb-s2']!, KIOSK['hb-s3']!],
    aw: AW_PALETTE.dark,
  },
} as const;

describe('Hlídání domu – measured token contrast', () => {
  it('reads the real tokens', () => {
    expect(DARK['hb-t2']).toMatch(/^#/);
    expect(LIGHT['hb-t2']).toMatch(/^#/);
    expect(KIOSK['hb-t2']).toMatch(/^#/);
    expect(LIGHT['hb-t2']).not.toBe(DARK['hb-t2']);
  });

  for (const [name, theme] of Object.entries(THEMES)) {
    it(`${name}: secondary greys (t2, t3) and tier inks ≥ 4.5:1 on every surface`, () => {
      const inks = [theme.t['hb-t2']!, theme.t['hb-t3']!, theme.aw.observe, theme.aw.suspect];
      inks.push(theme.aw.fault);
      for (const surface of theme.surfaces)
        for (const ink of inks)
          expect(contrast(ink, surface), `${ink} on ${surface}`).toBeGreaterThanOrEqual(4.5);
    });

    it(`${name}: icon tiles – glyph ≥ 3:1 against its tinted tile`, () => {
      const t = theme.t;
      // [tile hue, glyph ink] as in styles.ts (.aw-orb, .hb-status-row-icon inside .aw)
      const tiles: [string, string][] = [
        [t['hb-ok']!, t['hb-ok']!],
        [t['hb-warn']!, theme.aw.suspect],
        [t['hb-crit']!, theme.aw.fault],
        [theme.aw.observe, theme.aw.observe],
      ];
      for (const surface of theme.surfaces)
        for (const [hue, ink] of tiles)
          expect(
            contrast(rgb(ink), tint(hue, surface)),
            `${ink} on ${hue}/${surface}`,
          ).toBeGreaterThanOrEqual(3);
    });

    it(`${name}: 24 h strip bars ≥ 3:1 against the card`, () => {
      // non-text: a bar must stand out from the card it sits on (tier = height + pattern too)
      const { stripObserve, stripSuspect, stripFault } = theme.aw;
      for (const surface of theme.surfaces)
        for (const bar of [stripObserve, stripSuspect, stripFault])
          expect(contrast(bar, surface), `${bar} on ${surface}`).toBeGreaterThanOrEqual(3);
    });
  }

  for (const theme of ['dark', 'light'] as const)
    it(`${theme}: the solid suspicion button label ≥ 4.5:1`, () => {
      const p = AW_PALETTE[theme];
      expect(contrast(p.onSuspect, p.barSuspect)).toBeGreaterThanOrEqual(4.5);
    });
  it('fault button and pill: white on the fault fill ≥ 4.5:1', () => {
    expect(contrast('#ffffff', '#b5243d')).toBeGreaterThanOrEqual(4.5);
  });
});

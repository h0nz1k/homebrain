import { expect, it } from 'vitest';
import { heatingStyles } from '../views/styles.js';

function token(name: string): number[] {
  let value = '';
  for (const rule of heatingStyles.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!rule[1]!.includes('.ht-d1-shell')) continue;
    const match = rule[2]!.match(new RegExp(`--ht-c3-${name}:\\s*(#[0-9a-f]{6})`, 'i'));
    if (match) value = match[1]!;
  }
  expect(value, name).not.toBe('');
  return [1, 3, 5].map((i) => {
    const s = Number.parseInt(value.slice(i, i + 2), 16) / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
}
function lab([r, g, b]: number[]): number[] {
  const f = (v: number) => (v > 216 / 24389 ? Math.cbrt(v) : (v * 841) / 108 + 4 / 29);
  const x = f((0.4124564 * r! + 0.3575761 * g! + 0.1804375 * b!) / 0.95047);
  const y = f(0.2126729 * r! + 0.7151522 * g! + 0.072175 * b!);
  const z = f((0.0193339 * r! + 0.119192 * g! + 0.9503041 * b!) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
function luminance([r, g, b]: number[]): number {
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
it('distinguishes ground from cold water and keeps solar legible on light surfaces', () => {
  const ground = lab(token('ground'));
  const mains = lab(token('mains'));
  const deltaE = Math.hypot(...ground.map((v, i) => v - mains[i]!));
  expect(deltaE).toBeGreaterThan(30);
  for (const surface of ['room', 'soil']) {
    const a = luminance(token('solar')),
      b = luminance(token(surface));
    expect((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toBeGreaterThanOrEqual(3);
  }
});

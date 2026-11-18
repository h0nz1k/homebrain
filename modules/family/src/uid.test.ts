import { afterEach, describe, expect, it } from 'vitest';
import { newRequestId } from './uid.js';

const c = globalThis.crypto as Crypto & { randomUUID?: unknown };
const original = c.randomUUID;
afterEach(() => Object.defineProperty(c, 'randomUUID', { value: original, configurable: true }));

describe('newRequestId', () => {
  it('uses crypto.randomUUID when available', () => {
    expect(newRequestId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
  it('falls back to getRandomValues in insecure contexts (plain http on LAN)', () => {
    Object.defineProperty(c, 'randomUUID', { value: undefined, configurable: true });
    const a = newRequestId();
    const b = newRequestId();
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(a).not.toBe(b);
  });
});

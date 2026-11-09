import { describe, expect, it } from 'vitest';
import { parseHeatingLogoManifest } from './logo.js';

describe('heating logo manifest', () => {
  it('accepts valid file names and rejects broken manifests', () => {
    expect(parseHeatingLogoManifest({ schema: 1, logo: 'hp-logo.svg' })?.logo).toBe('hp-logo.svg');
    expect(parseHeatingLogoManifest({ schema: 1, logo: 'a.svg', logoDark: 'b-dark.svg' })?.logoDark).toBe(
      'b-dark.svg',
    );
    expect(parseHeatingLogoManifest({ schema: 2, logo: 'a.svg' })).toBeNull();
    expect(parseHeatingLogoManifest({ schema: 1, logo: '../evil.svg' })).toBeNull();
    expect(parseHeatingLogoManifest({ schema: 1, logo: 'm/h.svg' })).toBeNull();
    expect(parseHeatingLogoManifest(null)).toBeNull();
  });
});

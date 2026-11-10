import { describe, expect, it } from 'vitest';
import { cleaningOptionIcon, krakenDisplayedOptionKeys } from './cleaningIcons.js';

describe('cleaning option icons', () => {
  it('every Kraken fixture display key has an icon', () => {
    for (const { kind, key } of krakenDisplayedOptionKeys()) {
      expect(cleaningOptionIcon(kind, key), `${kind}:${key}`).not.toBeNull();
    }
  });
});

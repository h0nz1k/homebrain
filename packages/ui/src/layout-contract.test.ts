import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Layout contract for overlays and phone widths (regression: the Přístup person sheet was
// 34 px wider than a 390 px phone because width:100% did not include padding + border).
const css = readFileSync(join(import.meta.dirname, 'components.css'), 'utf8');
const shell = readFileSync(
  join(import.meta.dirname, '../../../apps/panel/src/shell/shell.css'),
  'utf8',
);

/** Declarations of the first top-level rule whose selector list is exactly `selector`. */
function rule(source: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = source.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`));
  if (!match) throw new Error(`rule ${selector} not found`);
  return match[1]!;
}

describe('overlay + phone layout contract', () => {
  it('sheet sizes with border-box and cannot blow out its scrim grid', () => {
    expect(rule(css, '.hb-sheet')).toMatch(/box-sizing:\s*border-box/);
    expect(rule(css, '.hb-sheet')).toMatch(/min-width:\s*0/);
    expect(rule(css, '.hb-scrim')).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)/);
    expect(css).toMatch(
      /\.hb-scrim \*,\s*\.hb-scrim \*::before,\s*\.hb-scrim \*::after\s*\{\s*box-sizing:\s*border-box/,
    );
  });
  it('row and tile text columns may shrink and wrap', () => {
    expect(rule(css, '.hb-status-row > *')).toMatch(/min-width:\s*0/);
    const status = rule(css, '.hb-tile-status');
    expect(status).toMatch(/min-width:\s*0/);
    expect(status).toMatch(/line-clamp:\s*2/);
  });
  it('pills never wrap their text', () => {
    expect(rule(css, '.hb-pill')).toMatch(/white-space:\s*nowrap/);
  });
  it('segmented control has border-box sizing', () => {
    expect(rule(css, '.hb-seg')).toMatch(/box-sizing:\s*border-box/);
  });
  it('sticky top bar paints an opaque surface (no see-through glass)', () => {
    const topbar = rule(shell, '.hb-topbar');
    expect(topbar).toMatch(/position:\s*sticky/);
    expect(topbar).not.toMatch(/transparent/);
    expect(topbar).toMatch(/var\(--hb-color-bg\);/);
  });
});

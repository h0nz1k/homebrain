import { useState } from 'react';
import { Toaster } from '@homebrain/ui';
import { ComponentSection } from './ComponentSection';
import { specs } from './specs';
import { ToastLive } from './ToastLive';
import { TokenSection, tokenGroups } from './tokens';
import type { ThemeMode } from './types';

/**
 * Živý katalog sdílených prvků `@homebrain/ui`. Jen pro vývoj: vlastní vstup `catalog.html`,
 * build `pnpm --filter @homebrain/panel build:catalog` → `dist-catalog/` (do bundlu panelu se
 * nedostane – hlídá to scripts/check-bundle-size.mjs).
 */
export function Catalog() {
  const [mode, setMode] = useState<ThemeMode>('both');
  const toastTheme = mode === 'light' ? 'light' : 'dark';
  return (
    <div className="hb-catalog" data-testid="hb-catalog">
      <aside className="cat-nav" aria-label="Obsah katalogu">
        <p className="cat-brand">
          HomeBrain <span>Katalog</span>
        </p>
        <p className="cat-nav-h">Základy</p>
        {tokenGroups.map((g) => (
          <a key={g.id} href={`#${g.id}`}>
            {g.title}
          </a>
        ))}
        <p className="cat-nav-h">Komponenty ({specs.length})</p>
        {specs.map((s) => (
          <a key={s.id} href={`#${s.id}`}>
            {s.name}
          </a>
        ))}
      </aside>
      <main className="cat-main">
        <header className="cat-head">
          <div>
            <h1>Katalog prvků a komponent</h1>
            <p>
              Sdílené primitivy z <code>@homebrain/ui</code> ve světlém i tmavém tématu. Pravidla
              textů a oznámení: <code>docs/ux/guidelines.md</code>.
            </p>
          </div>
          <div className="cat-seg" role="group" aria-label="Téma náhledů">
            {(['both', 'light', 'dark'] as const).map((m) => (
              <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}>
                {m === 'both' ? 'Obě' : m === 'light' ? 'Světlé' : 'Tmavé'}
              </button>
            ))}
          </div>
        </header>

        <ToastLive />

        {tokenGroups.map((g) => (
          <TokenSection key={g.id} g={g} mode={mode} />
        ))}

        {specs.map((s) => (
          <ComponentSection key={s.id} s={s} mode={mode} />
        ))}
      </main>
      <div className="cat-toaster" data-theme={toastTheme}>
        <Toaster />
      </div>
    </div>
  );
}

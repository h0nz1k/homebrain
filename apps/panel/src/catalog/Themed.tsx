import type { ReactNode } from 'react';
import type { ThemeMode } from './types';

export function Themed({ mode, children }: { mode: ThemeMode; children: ReactNode }) {
  const themes = mode === 'both' ? (['light', 'dark'] as const) : ([mode] as const);
  return (
    <div className="cat-panes" data-count={themes.length}>
      {themes.map((t) => (
        <div key={t} className="cat-pane" data-theme={t}>
          <span className="cat-pane-label">{t === 'light' ? 'Světlý' : 'Tmavý'}</span>
          {children}
        </div>
      ))}
    </div>
  );
}

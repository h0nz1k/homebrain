import { Themed } from './Themed';
import type { Spec, ThemeMode } from './types';

export function ComponentSection({ s, mode }: { s: Spec; mode: ThemeMode }) {
  return (
    <section
      className="cat-section"
      id={s.id}
      aria-labelledby={`${s.id}-h`}
      data-testid="cat-component"
    >
      <h2 id={`${s.id}-h`}>{s.name}</h2>
      <p className="cat-summary">{s.summary}</p>
      <code className="cat-import">{`import { ${s.importName} } from '@homebrain/ui';`}</code>
      <Themed mode={mode}>{s.render()}</Themed>
      <div className="cat-meta">
        <div>
          <h3>Stavy</h3>
          <ul>
            {s.states.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </div>
        <div className="cat-do">
          <h3>Ano</h3>
          <p>{s.doText}</p>
        </div>
        <div className="cat-dont">
          <h3>Ne</h3>
          <p>{s.dontText}</p>
        </div>
        <div>
          <h3>Poznámky</h3>
          <p>{s.notes}</p>
        </div>
      </div>
    </section>
  );
}

import { useState } from 'react';
import type { WineApi } from '../api.js';
import type { VivinoImportResult, VivinoPlanItem } from '../lookup.js';
import { errorText } from './Detail.js';
import { Icon } from './parts.js';
import { lookupErrorText, num1 } from './labels.js';

const MATCH_CS: Record<VivinoPlanItem['match'], string> = {
  exact: 'Přesná shoda',
  fuzzy: 'Nejistá shoda – potvrďte',
  none: 'Ve vinotéce nenalezeno',
  exact_unchanged: 'Beze změny',
  fuzzy_unchanged: 'Beze změny',
};

/**
 * Vivino GDPR export → personal rating/note (#81). Vivino has no public API, so only the
 * owner's own export is read; exact pairs are pre-selected, fuzzy ones need a confirm.
 */
export function VivinoImport({ api, onImported }: { api: WineApi; onImported: () => void }) {
  const [content, setContent] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [plan, setPlan] = useState<VivinoImportResult | null>(null);
  const [choice, setChoice] = useState<Record<number, string | null>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function preview(text: string) {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const res = await api.importVivino({ content: text, dryRun: true });
      setPlan(res);
      setChoice(
        Object.fromEntries(
          (res.plan ?? []).map((i) => [i.row, i.selected ? i.wineId : null] as const),
        ),
      );
    } catch (err) {
      setPlan(null);
      setError(lookupErrorText(err, errorText(err)));
    } finally {
      setBusy(false);
    }
  }
  async function apply() {
    if (!content || !plan) return;
    const accept = Object.entries(choice)
      .filter(([, id]) => id)
      .map(([row, id]) => ({ row: Number(row), wineId: id! }));
    setBusy(true);
    try {
      const res = await api.importVivino({ content, dryRun: false, accept });
      setDone(`Uloženo z Vivina: ${res.applied ?? 0} vín (hodnocení a poznámky).`);
      setPlan(null);
      setContent(null);
      onImported();
    } catch (err) {
      setError(lookupErrorText(err, errorText(err)));
    } finally {
      setBusy(false);
    }
  }

  const items = (plan?.plan ?? []).filter((i) => i.match === 'exact' || i.match === 'fuzzy');
  const rest = (plan?.plan ?? []).length - items.length;
  const selectedCount = Object.values(choice).filter(Boolean).length;
  return (
    <section
      className="wine-import wine-vivino-import"
      aria-label="Import z Vivina"
      data-testid="wine-vivino-import"
    >
      <h3 className="wine-h3 wine-h3--brand">
        <span className="wine-vivino-mark" aria-hidden="true">
          V
        </span>
        Import z Vivina
      </h3>
      <p className="wine-sub">
        Vaše hodnocení a poznámky z Vivina. Ve Vivinu si vyžádejte export dat (Nastavení → Soukromí
        → stažení dat podle GDPR) a nahrajte CSV se seznamem vín. Komunitní hodnocení nestahujeme –
        Vivino nemá veřejné API; v detailu vína je odkaz „Otevřít ve Vivinu“.
      </p>
      <div className="wine-import-row">
        <label className="wine-btn wine-file">
          <Icon name="upload" size={18} /> Vybrat CSV z Vivina
          <input
            type="file"
            accept=".csv,text/csv"
            data-testid="wine-vivino-file"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              setFileName(file.name);
              void file.text().then((t) => {
                setContent(t);
                void preview(t);
              });
            }}
          />
        </label>
        {fileName && <span className="wine-muted">{fileName}</span>}
      </div>
      {error && (
        <p className="wine-error" role="alert">
          {error}
        </p>
      )}
      {done && (
        <p className="wine-check" data-ok role="status" data-testid="wine-vivino-done">
          {done}
        </p>
      )}
      {plan && (
        <div className="wine-vivino-plan" data-testid="wine-vivino-plan">
          <p className="wine-sub">
            {plan.rows} vín v exportu · přesné shody {plan.summary.exact ?? 0} · nejisté{' '}
            {plan.summary.fuzzy ?? 0}
            {rest > 0 && ` · ${rest} beze změny nebo nenalezeno`}
          </p>
          <ul className="wine-vivino-rows">
            {items.map((i) => {
              const id = choice[i.row] ?? null;
              return (
                <li key={i.row} data-match={i.match} data-testid="wine-vivino-row">
                  <label className="wine-vivino-check">
                    <input
                      type="checkbox"
                      checked={Boolean(id)}
                      onChange={(e) =>
                        setChoice((c) => ({
                          ...c,
                          [i.row]: e.target.checked
                            ? (i.wineId ?? i.candidates[0]?.wineId ?? null)
                            : null,
                        }))
                      }
                      aria-label={`Použít: ${i.name}`}
                    />
                  </label>
                  <span className="wine-vivino-main">
                    <strong>
                      {i.name} {i.vintage ?? ''}
                    </strong>
                    <span className="wine-muted">
                      {[i.producer, MATCH_CS[i.match]].filter(Boolean).join(' · ')}
                    </span>
                    {i.match === 'fuzzy' && i.candidates.length > 0 && (
                      <select
                        aria-label="Spárovat s vínem"
                        value={id ?? ''}
                        onChange={(e) =>
                          setChoice((c) => ({ ...c, [i.row]: e.target.value || null }))
                        }
                        data-testid="wine-vivino-candidate"
                      >
                        <option value="">Nepárovat</option>
                        {i.candidates.map((c) => (
                          <option key={c.wineId} value={c.wineId}>
                            {c.name} {c.vintage ?? 'NV'} · {c.producer} ({Math.round(c.score * 100)}{' '}
                            %)
                          </option>
                        ))}
                      </select>
                    )}
                    {i.conflict && (
                      <span className="wine-pack-note wine-pack-note--warn">
                        Přepíše vaše současné hodnocení.
                      </span>
                    )}
                  </span>
                  {i.rating !== null && (
                    <span className="wine-stars" aria-label={`Hodnocení ${num1.format(i.rating)}`}>
                      ★ {num1.format(i.rating)}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          {!items.length && <p className="wine-muted">V exportu není nic, co by šlo spárovat.</p>}
          <div className="wine-actions-row wine-actions-row--start">
            <button
              type="button"
              className="wine-btn wine-btn--primary"
              disabled={busy || selectedCount === 0}
              onClick={() => void apply()}
              data-testid="wine-vivino-apply"
            >
              Uložit hodnocení ({selectedCount})
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

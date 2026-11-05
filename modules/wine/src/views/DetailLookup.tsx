import { useEffect, useRef, useState } from 'react';
import type { WineRecord } from '../domain/index.js';
import type { WineApi } from '../api.js';
import { diffProposal } from '../lookup.js';
import type { DiffField, LookupProposal, LookupResult } from '../lookup.js';
import { errorText } from './Detail.js';
import { Icon } from './parts.js';
import { COLOR_CS, TYPE_CS, lookupErrorText, num1 } from './labels.js';

const FIELD_CS: Record<DiffField, string> = {
  name: 'Název',
  labelName: 'Název etikety',
  producer: 'Vinařství',
  vintage: 'Ročník',
  color: 'Barva',
  wineType: 'Typ',
  grapeVarieties: 'Odrůda',
  country: 'Země',
  region: 'Oblast',
  sweetness: 'Obsah cukru',
  residualSugarGl: 'Zbytkový cukr (g/l)',
  alcoholPct: 'Alkohol',
  volumeMl: 'Objem',
  predicate: 'Přívlastek',
  description: 'Popis',
  ean: 'EAN',
};

function show(field: DiffField, v: unknown): string {
  if (v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length)) return '—';
  if (Array.isArray(v)) return v.join(', ');
  if (field === 'color') return COLOR_CS[v as WineRecord['color']] ?? String(v);
  if (field === 'wineType') return TYPE_CS[v as WineRecord['wineType']] ?? String(v);
  if (field === 'alcoholPct') return `${num1.format(Number(v))} %`;
  if (field === 'volumeMl') return `${Number(v)} ml`;
  return String(v);
}

/**
 * Scroll the detail so the lookup panel (incl. the URL field at its end) clears the action
 * bar under the scroller. A panel taller than the viewport keeps its header visible instead.
 */
export function revealInDetail(el: HTMLElement | null, pad = 24): void {
  const box = el?.closest<HTMLElement>('.wine-detail-scroll');
  if (!el || !box || typeof box.scrollTo !== 'function') return;
  const b = box.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  const below = r.bottom + pad - b.bottom;
  if (below <= 0) return;
  const delta = Math.min(below, Math.max(0, r.top - pad - b.top));
  if (delta <= 0) return;
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  box.scrollTo({ top: box.scrollTop + delta, behavior: reduce ? 'auto' : 'smooth' });
}

/**
 * Detail „Dohledat“ (#81): re-lookup across all providers, then a per-field diff the
 * owner accepts row by row. Empty fields are pre-selected, replacements are opt-in.
 */
export function LookupPanel({
  api,
  wine,
  hasPhoto,
  onChanged,
  onClose,
}: {
  api: WineApi;
  wine: WineRecord;
  hasPhoto: boolean;
  onChanged: (wine: WineRecord, message: string) => void;
  onClose: () => void;
}) {
  const [state, setState] = useState<{ busy: boolean; result?: LookupResult; error?: string }>({
    busy: true,
  });
  const [pick, setPick] = useState(0);
  const [selected, setSelected] = useState<Set<string> | null>(null);
  const [url, setUrl] = useState('');
  const panelRef = useRef<HTMLElement>(null);
  const [saving, setSaving] = useState(false);

  const fetchLookup = (withUrl?: string) =>
    api.lookup({ wineId: wine.id, ...(withUrl ? { url: withUrl } : {}) }).then(
      (result) => ({ busy: false, result }),
      (err: unknown) => ({ busy: false, error: lookupErrorText(err, errorText(err)) }),
    );
  // Opening the panel = one lookup across all providers (it never writes).
  useEffect(() => {
    let live = true;
    void fetchLookup().then((next) => live && setState(next));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wine.id]);
  // Once proposals (or an error) land, bring the whole panel above the action bar.
  useEffect(() => {
    if (!state.busy) revealInDetail(panelRef.current);
  }, [state.busy, state.result, state.error]);
  async function run(withUrl: string) {
    setState({ busy: true });
    setSelected(null);
    setPick(0);
    setState(await fetchLookup(withUrl));
  }

  const proposals: LookupProposal[] = (state.result?.proposals ?? []).filter(
    (p) => p.provider !== 'local',
  );
  const current = proposals[Math.min(pick, proposals.length - 1)];
  const diffs = current ? diffProposal(wine, current) : [];
  const photoOffer = Boolean(current?.imageUrl && !hasPhoto);
  const defaults = new Set([
    ...diffs.filter((d) => d.fill).map((d) => d.field as string),
    ...(photoOffer ? ['photo'] : []),
  ]);
  const chosen = selected ?? defaults;
  const toggle = (key: string) => {
    const next = new Set(chosen);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSelected(next);
  };

  async function apply() {
    if (!current) return;
    setSaving(true);
    try {
      const changes: Partial<WineRecord> = {};
      for (const d of diffs)
        if (chosen.has(d.field)) (changes as Record<string, unknown>)[d.field] = d.proposed;
      let updated = wine;
      const n = Object.keys(changes).length;
      if (n) updated = await api.update(wine.id, changes);
      if (chosen.has('photo') && current.imageUrl)
        updated = await api.setImage(wine.id, { imageUrl: current.imageUrl });
      const parts = [
        n ? `${n} ${n === 1 ? 'údaj' : n < 5 ? 'údaje' : 'údajů'}` : null,
        chosen.has('photo') ? 'fotka' : null,
      ]
        .filter(Boolean)
        .join(' + ');
      onChanged(updated, `Doplněno (${parts}) ze zdroje ${current.providerLabel}.`);
    } catch (err) {
      setState((s) => ({ ...s, error: errorText(err) }));
    } finally {
      setSaving(false);
    }
  }

  const count = chosen.size;
  return (
    <section
      ref={panelRef}
      className="wine-lookup"
      aria-label="Dohledání údajů"
      data-testid="wine-lookup-panel"
    >
      <header className="wine-lookup-head">
        <span className="wine-lookup-ico" aria-hidden="true">
          <Icon name="sparkle" size={18} />
        </span>
        <strong>Dohledání údajů</strong>
        <button
          type="button"
          className="wine-iconbtn"
          aria-label="Zavřít dohledání"
          onClick={onClose}
        >
          <Icon name="close" size={18} />
        </button>
      </header>
      {state.busy && (
        <p className="wine-muted" role="status" data-testid="wine-lookup-busy">
          Hledám ve Znovínu, Open Food Facts a na stránkách výrobců…
        </p>
      )}
      {state.error && (
        <p className="wine-error" role="alert">
          {state.error}
        </p>
      )}
      {!state.busy && state.result && !current && (
        <p className="wine-muted" data-testid="wine-lookup-empty">
          Nic nového jsme nenašli. Zkuste vložit odkaz na stránku vína.
        </p>
      )}
      {!state.busy && current && (
        <>
          {proposals.length > 1 && (
            <div className="wine-seg wine-seg--sm" role="tablist" aria-label="Zdroj návrhu">
              {proposals.map((p, n) => (
                <button
                  key={`${p.provider}-${n}`}
                  type="button"
                  role="tab"
                  aria-pressed={n === pick}
                  aria-selected={n === pick}
                  onClick={() => {
                    setPick(n);
                    setSelected(null);
                  }}
                >
                  {p.providerLabel}
                </button>
              ))}
            </div>
          )}
          <p className="wine-lookup-src" data-testid="wine-lookup-source">
            <span
              className="wine-chip"
              data-tone={current.confidence === 'inferred' ? 'soft' : 'ok'}
            >
              {current.confidence === 'inferred' ? 'Odhad' : 'Shoda'}
            </span>
            {current.providerLabel}
            {current.sourceUrl && (
              <a href={current.sourceUrl} target="_blank" rel="noopener noreferrer">
                zdroj <Icon name="external" size={13} />
              </a>
            )}
          </p>
          {diffs.length === 0 && !photoOffer ? (
            <p className="wine-muted" data-testid="wine-lookup-same">
              Zdroj nepřinesl nic nového – údaje už máte.
            </p>
          ) : (
            <ul className="wine-diff" data-testid="wine-lookup-diff">
              {photoOffer && current.imageUrl && (
                <li>
                  <label>
                    <input
                      type="checkbox"
                      checked={chosen.has('photo')}
                      onChange={() => toggle('photo')}
                      data-testid="wine-lookup-photo"
                    />
                    <span className="wine-diff-k">Fotka lahve</span>
                    <span className="wine-diff-v">
                      <img src={current.imageUrl} alt="" className="wine-diff-img" />
                      <span className="wine-muted">uloží se lokálně</span>
                    </span>
                  </label>
                </li>
              )}
              {diffs.map((d) => (
                <li key={d.field} data-fill={d.fill || undefined}>
                  <label>
                    <input
                      type="checkbox"
                      checked={chosen.has(d.field)}
                      onChange={() => toggle(d.field)}
                      data-testid={`wine-lookup-f-${d.field}`}
                    />
                    <span className="wine-diff-k">
                      {FIELD_CS[d.field]}
                      {current.inferred.includes(d.field) && (
                        <span className="wine-ff-tag">odhad</span>
                      )}
                    </span>
                    <span className="wine-diff-v">
                      {!d.fill && <s className="wine-diff-old">{show(d.field, d.current)}</s>}
                      <span className="wine-diff-new">{show(d.field, d.proposed)}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          <div className="wine-actions-row wine-actions-row--start">
            <button
              type="button"
              className="wine-btn wine-btn--primary"
              disabled={saving || count === 0}
              onClick={() => void apply()}
              data-testid="wine-lookup-apply"
            >
              <Icon name="check" size={18} />
              Použít vybrané{count ? ` (${count})` : ''}
            </button>
            <button type="button" className="wine-btn wine-btn--ghost" onClick={onClose}>
              Zrušit
            </button>
          </div>
        </>
      )}
      <form
        className="wine-enrich-url"
        data-testid="wine-lookup-url-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (url.trim()) void run(url.trim());
        }}
      >
        <label>
          <span className="wine-lbl">Odkaz na stránku vína (volitelné)</span>
          <input
            type="url"
            inputMode="url"
            placeholder="https://…"
            value={url}
            maxLength={500}
            onChange={(e) => setUrl(e.target.value)}
            data-testid="wine-lookup-url"
          />
        </label>
        <button
          type="submit"
          className="wine-btn"
          disabled={state.busy || !url.trim()}
          data-testid="wine-lookup-url-load"
        >
          Načíst
        </button>
        <p className="wine-muted">
          E-shop, vinařství nebo distributor – načteme údaje ze stránky (jen veřejné https).
        </p>
      </form>
    </section>
  );
}

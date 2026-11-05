import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useBackClosable } from '@homebrain/ha-client';
import type {
  PredicateKey,
  SugarCategory,
  WineColorCode,
  WineRecord,
  WineType,
} from '../domain/index.js';
import {
  PREDICATES,
  PREDICATE_CS,
  SPARKLING_SUGAR,
  STILL_SUGAR,
  SUGAR_CS,
} from '../domain/index.js';
import { EMPTY_FILTERS, activeFilterCount, facets, filterWines, toggle } from '../filters.js';
import type { WineFilters } from '../filters.js';
import type { AutoEnrichStatus, EnrichBatchResult, ImportResult, WineApi } from '../api.js';
import { Icon } from './parts.js';
import { COLOR_CS, TYPE_CS, num1 } from './labels.js';
import { errorText } from './Detail.js';
import { VivinoImport } from './VivinoImport.js';

export const COLORS: WineColorCode[] = ['red', 'white', 'rose', 'orange'];
const TYPES: WineType[] = ['still', 'sparkling', 'semi_sparkling'];
const RATINGS = [3, 4, 4.5];
const PREDICATE_KEYS: PredicateKey[] = [...PREDICATES, 'none'];

function Group({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <fieldset className="wine-fgroup" id={`wine-fg-${id}`}>
      <legend className="wine-fgroup-l">{label}</legend>
      <div className="wine-fopts">{children}</div>
    </fieldset>
  );
}
function T({
  on,
  onClick,
  children,
  testId,
}: {
  on: boolean;
  onClick: () => void;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <button
      type="button"
      className="wine-tchip"
      aria-pressed={on}
      onClick={onClick}
      data-testid={testId}
    >
      {children}
    </button>
  );
}

/** Still-scale chips: all four legal terms when there is a non-sparkling wine, plus Neuvedeno. */
function stillSugar(counts: Map<SugarCategory, number>, wines: WineRecord[]): SugarCategory[] {
  const list: SugarCategory[] = wines.some((w) => w.wineType !== 'sparkling')
    ? [...STILL_SUGAR]
    : [];
  return counts.has('unknown') ? [...list, 'unknown'] : list;
}

/** Desktop/tablet right drawer, mobile bottom sheet (WIN-024). Filters apply live. */
export function FilterPanel({
  wines,
  filters,
  set,
  onClose,
  focus,
}: {
  wines: WineRecord[];
  filters: WineFilters;
  set: (f: WineFilters) => void;
  onClose: () => void;
  focus: string | null;
}) {
  const f = useMemo(() => facets(wines), [wines]);
  const count = useMemo(() => filterWines(wines, filters).length, [wines, filters]);
  // Faceted counts: how many wines a chip would show given the OTHER active filters.
  const sugarN = useMemo(
    () => facets(filterWines(wines, { ...filters, sugar: [] })).sugar,
    [wines, filters],
  );
  const predicateN = useMemo(
    () => facets(filterWines(wines, { ...filters, predicates: [] })).predicates,
    [wines, filters],
  );
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  useBackClosable(onClose);
  useEffect(() => {
    const body = ref.current;
    const target = focus ? body?.querySelector<HTMLElement>(`#wine-fg-${focus}`) : null;
    if (body && target) body.scrollTop = target.offsetTop - body.offsetTop - 8;
    body?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeRef.current();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focus]);
  const num = (v: string) => (v === '' ? null : Number(v));
  const price = filters.priceMax ?? f.priceMax;
  return (
    <div className="wine-drawer-backdrop" onClick={onClose}>
      <div
        className="wine-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wine-drawer-title"
        data-testid="wine-filters"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="wine-grabber" aria-hidden="true" />
        <header className="wine-drawer-head">
          <h2 id="wine-drawer-title">Filtry</h2>
          {activeFilterCount(filters) > 0 && (
            <button
              type="button"
              className="wine-link"
              data-testid="wine-filter-reset"
              onClick={() => set({ ...EMPTY_FILTERS, query: filters.query, sort: filters.sort })}
            >
              Zrušit filtry
            </button>
          )}
          <button
            type="button"
            className="wine-iconbtn"
            aria-label="Skrýt filtry"
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </header>
        <div className="wine-drawer-body" ref={ref} tabIndex={-1}>
          <Group id="color" label="Barva">
            {COLORS.map((c) => (
              <T
                key={c}
                on={filters.colors.includes(c)}
                onClick={() => set({ ...filters, colors: toggle(filters.colors, c) })}
                testId={`wine-filter-color-${c}`}
              >
                <span className={`wine-swatch wine-swatch--${c}`} aria-hidden="true" />
                {COLOR_CS[c]}
              </T>
            ))}
          </Group>
          <Group id="type" label="Typ">
            {TYPES.map((t) => (
              <T
                key={t}
                on={filters.wineTypes.includes(t)}
                onClick={() => set({ ...filters, wineTypes: toggle(filters.wineTypes, t) })}
              >
                {TYPE_CS[t]}
              </T>
            ))}
          </Group>
          <Group id="sugar" label="Obsah cukru">
            {stillSugar(f.sugar, wines).map((s) => (
              <T
                key={s}
                on={filters.sugar.includes(s)}
                onClick={() => set({ ...filters, sugar: toggle(filters.sugar, s) })}
                testId={`wine-filter-sugar-${s}`}
              >
                {SUGAR_CS[s]}
                <span className="wine-tchip-n">{sugarN.get(s) ?? 0}</span>
              </T>
            ))}
            {SPARKLING_SUGAR.some((s) => f.sugar.has(s)) && (
              <span className="wine-fsub" id="wine-fg-sugar-sparkling">
                Šumivá vína
              </span>
            )}
            {SPARKLING_SUGAR.filter((s) => f.sugar.has(s)).map((s) => (
              <T
                key={s}
                on={filters.sugar.includes(s)}
                onClick={() => set({ ...filters, sugar: toggle(filters.sugar, s) })}
                testId={`wine-filter-sugar-${s}`}
              >
                {SUGAR_CS[s]}
                <span className="wine-tchip-n">{sugarN.get(s) ?? 0}</span>
              </T>
            ))}
            <p className="wine-fhint" data-testid="wine-filter-sugar-hint">
              Jak je víno označené na etiketě podle zbytkového cukru. Přívlastek (pozdní sběr…) o
              sladkosti neříká nic – jen jak zralé byly hrozny při sběru.
            </p>
          </Group>
          {PREDICATE_KEYS.some((p) => f.predicates.has(p) && p !== 'none') && (
            <Group id="predicate" label="Přívlastek">
              {PREDICATE_KEYS.filter((p) => f.predicates.has(p)).map((p) => (
                <T
                  key={p}
                  on={filters.predicates.includes(p)}
                  onClick={() => set({ ...filters, predicates: toggle(filters.predicates, p) })}
                  testId={`wine-filter-predicate-${p}`}
                >
                  {PREDICATE_CS[p]}
                  <span className="wine-tchip-n">{predicateN.get(p) ?? 0}</span>
                </T>
              ))}
            </Group>
          )}
          {f.countries.length > 1 && (
            <Group id="country" label="Země">
              {f.countries.map((c) => (
                <T
                  key={c}
                  on={filters.countries.includes(c)}
                  onClick={() => set({ ...filters, countries: toggle(filters.countries, c) })}
                >
                  {c}
                </T>
              ))}
            </Group>
          )}
          <Group id="region" label="Oblast">
            {f.regions.map((r) => (
              <T
                key={r}
                on={filters.regions.includes(r)}
                onClick={() => set({ ...filters, regions: toggle(filters.regions, r) })}
                testId={`wine-filter-region-${r}`}
              >
                {r}
              </T>
            ))}
          </Group>
          <Group id="variety" label="Odrůda">
            {f.varieties.map((v) => (
              <T
                key={v}
                on={filters.varieties.includes(v)}
                onClick={() => set({ ...filters, varieties: toggle(filters.varieties, v) })}
              >
                {v}
              </T>
            ))}
          </Group>
          <Group id="vintage" label="Ročník">
            <div className="wine-range">
              <select
                aria-label="Ročník od"
                value={filters.vintageFrom ?? ''}
                onChange={(e) => set({ ...filters, vintageFrom: num(e.target.value) })}
              >
                <option value="">od</option>
                {[...f.vintages].reverse().map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
              <span aria-hidden="true">–</span>
              <select
                aria-label="Ročník do"
                value={filters.vintageTo ?? ''}
                onChange={(e) => set({ ...filters, vintageTo: num(e.target.value) })}
              >
                <option value="">do</option>
                {f.vintages.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          </Group>
          {f.priceMax > 0 && (
            <Group id="price" label="Cena za lahev">
              <label className="wine-slider">
                <span>
                  {filters.priceMax === null ? (
                    <strong>Bez omezení</strong>
                  ) : (
                    <>
                      do <strong>{kc.format(price)}</strong>
                    </>
                  )}
                  <span className="wine-muted"> · rozsah 0–{kc.format(f.priceMax)}</span>
                </span>
                <input
                  type="range"
                  min={0}
                  max={f.priceMax}
                  step={50}
                  value={price}
                  aria-label="Maximální cena"
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    set({ ...filters, priceMax: v >= f.priceMax ? null : v });
                  }}
                />
              </label>
            </Group>
          )}
          <Group id="rating" label="Moje hodnocení">
            {RATINGS.map((r) => (
              <T
                key={r}
                on={filters.ratingMin === r}
                onClick={() => set({ ...filters, ratingMin: filters.ratingMin === r ? null : r })}
                testId={`wine-filter-rating-${r}`}
              >
                ★ {num1.format(r)}+
              </T>
            ))}
          </Group>
          <Group id="zone" label="Zóna a dostupnost">
            <select
              aria-label="Zóna"
              data-testid="wine-filter-zone"
              value={filters.zones[0] ?? ''}
              onChange={(e) => set({ ...filters, zones: e.target.value ? [e.target.value] : [] })}
            >
              <option value="">Všechny zóny</option>
              {f.zones.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </select>
            <label className="wine-check">
              <input
                type="checkbox"
                checked={filters.inStockOnly}
                onChange={(e) => set({ ...filters, inStockOnly: e.target.checked })}
              />
              Jen skladem
            </label>
          </Group>
        </div>
        <footer className="wine-drawer-foot">
          <button type="button" className="wine-btn" onClick={onClose}>
            Skrýt filtry
          </button>
          <button
            type="button"
            className="wine-btn wine-btn--primary"
            onClick={onClose}
            data-testid="wine-filter-apply"
          >
            {count === 0
              ? 'Žádné výsledky'
              : `Zobrazit ${count} ${count === 1 ? 'výsledek' : count < 5 ? 'výsledky' : 'výsledků'}`}
          </button>
        </footer>
      </div>
    </div>
  );
}

const ACTION_CS: Record<string, string> = {
  create: 'Nové víno',
  stock_in: 'Naskladnění',
  skip: 'Beze změny',
  already_imported: 'Už importováno',
};

/** CSV/JSON import (WIN-013): always dry-run preview first. */
function FileImport({ api, onImported }: { api: WineApi; onImported: () => void }) {
  const [format, setFormat] = useState<'csv' | 'json'>('csv');
  const [content, setContent] = useState('');
  const [plan, setPlan] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function run(dryRun: boolean) {
    setBusy(true);
    setError(null);
    try {
      const result = await api.importFile({ format, content, dryRun });
      setPlan(result);
      if (!dryRun) onImported();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="wine-import" aria-label="Import CSV / JSON">
      <h3 className="wine-h3">Soubor CSV / JSON</h3>
      <p className="wine-sub">
        Nahrajte CSV nebo JSON (např. export objednávky). Nejdřív se zobrazí náhled – nic se
        nezapíše, dokud import nepotvrdíte. Opakovaný import stejného souboru se nezapočítá dvakrát.
      </p>
      <div className="wine-import-row">
        <label className="wine-field">
          Formát
          <select value={format} onChange={(e) => setFormat(e.target.value as 'csv' | 'json')}>
            <option value="csv">CSV</option>
            <option value="json">JSON</option>
          </select>
        </label>
        <label className="wine-btn wine-file">
          <Icon name="upload" size={18} /> Vybrat soubor
          <input
            type="file"
            accept=".csv,.json,text/csv,application/json"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              if (file.name.endsWith('.json')) setFormat('json');
              void file.text().then((t) => {
                setContent(t);
                setPlan(null);
              });
            }}
          />
        </label>
      </div>
      <label className="wine-field">
        Obsah
        <textarea
          rows={6}
          value={content}
          placeholder={
            'name;producer;vintage;color;quantity\nRyzlink rýnský kabinet;Vinařství Ukázka;2022;white;6'
          }
          onChange={(e) => {
            setContent(e.target.value);
            setPlan(null);
          }}
          data-testid="wine-import-content"
        />
      </label>
      <div className="wine-actions-row wine-actions-row--start">
        <button
          type="button"
          className="wine-btn"
          disabled={busy || !content.trim()}
          onClick={() => void run(true)}
          data-testid="wine-import-preview"
        >
          Náhled importu
        </button>
        <button
          type="button"
          className="wine-btn wine-btn--primary"
          disabled={busy || !plan || !plan.dryRun || plan.plan.length === 0}
          onClick={() => void run(false)}
        >
          Potvrdit import
        </button>
      </div>
      {error && (
        <p className="wine-error" role="alert">
          {error}
        </p>
      )}
      {plan && (
        <div className="wine-import-plan" data-testid="wine-import-plan">
          <p>
            <strong>{plan.dryRun ? 'Náhled' : 'Import dokončen'}:</strong> {plan.rows} řádků ·{' '}
            {Object.entries(plan.summary)
              .map(([k, v]) => `${ACTION_CS[k] ?? k} ${v}`)
              .join(' · ') || 'nic k importu'}
            {plan.errors.length > 0 && ` · chyby ${plan.errors.length}`}
          </p>
          <div className="wine-table-wrap">
            <table className="wine-table">
              <thead>
                <tr>
                  <th>Řádek</th>
                  <th>Víno</th>
                  <th>Ročník</th>
                  <th className="num">Lahví</th>
                  <th>Akce</th>
                </tr>
              </thead>
              <tbody>
                {plan.plan.map((p) => (
                  <tr key={p.row}>
                    <td>{p.row}</td>
                    <td>{p.name}</td>
                    <td>{p.vintage ?? 'NV'}</td>
                    <td className="num">{p.quantity}</td>
                    <td>{ACTION_CS[p.action] ?? p.action}</td>
                  </tr>
                ))}
                {plan.errors.map((e) => (
                  <tr key={`e${e.row}`} data-error>
                    <td>{e.row}</td>
                    <td colSpan={4}>
                      Chyba {e.code}
                      {e.field ? ` (pole ${e.field})` : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

const kc = new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 2 });
const ORDER_ERRORS: Record<string, string> = {
  IMPORT_UNRECOGNISED: 'Text nevypadá jako potvrzení objednávky Znovín – nic se nehádá.',
  IMPORT_CHECK_FAILED: 'Součet položek nesedí s cenou celkem – import nelze potvrdit.',
  IMPORT_TOO_LARGE: 'Soubor je příliš velký (max. 2,5 MB).',
  IMPORT_PARSE_ERROR: 'PDF se nepodařilo přečíst.',
  ENRICH_NOT_FOUND: 'Produkt se v e-shopu Znovín nenašel.',
  ENRICH_CODE_MISMATCH: 'Stránka patří jinému objednacímu číslu.',
  ENRICH_NO_CODE: 'Víno nemá objednací číslo Znovín.',
  ENRICH_FETCH_FAILED: 'E-shop Znovín teď neodpovídá.',
};
export function orderErrorText(err: unknown): string {
  const code = (err as { code?: string } | null)?.code ?? '';
  return ORDER_ERRORS[code] ?? errorText(err);
}

/** Order import (WIN-013/#51): PDF print or pasted text → preview with checks → confirm. */
/** Status line of the automatic post-import enrichment ('… 7/15' while running). */
export function autoEnrichText(s: AutoEnrichStatus): string {
  if (s.running) return `Doplňuji fotky a popisy ze Znovínu… ${s.done}/${s.total}`;
  const photos = s.items.filter((i) => i.photo).length;
  const skipped = s.items.filter((i) => i.skipped).length;
  let text = `Fotky a popisy ze Znovínu doplněny: ${photos} z ${s.total}`;
  if (skipped) text += ` (${skipped} už fotku mělo)`;
  if (s.failed)
    text += ` · ${s.failed} bez shody – doplňte ručně v detailu vína (lze vložit odkaz na e-shop)`;
  return text;
}

type ImportProps = { api: WineApi; onImported: () => void; pollMs?: number };

function OrderImport({ api, onImported, pollMs = 1500 }: ImportProps) {
  const [source, setSource] = useState<{
    format: 'pdf' | 'text';
    content: string;
    label: string;
  } | null>(null);
  const [text, setText] = useState('');
  const [result, setResult] = useState<ImportResult | null>(null);
  const [batch, setBatch] = useState<EnrichBatchResult | null>(null);
  const [auto, setAuto] = useState<AutoEnrichStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const running = !!auto?.running;
  const importedRef = useRef(onImported);
  useEffect(() => {
    importedRef.current = onImported;
  }, [onImported]);
  useEffect(() => {
    if (!running) return;
    let alive = true;
    const timer = setTimeout(() => {
      api.enrichStatus().then(
        (s) => {
          if (!alive) return;
          setAuto(s);
          if (!s.running) importedRef.current();
        },
        () => alive && setAuto((a) => (a ? { ...a, running: false } : a)),
      );
    }, pollMs);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [api, auto, running, pollMs]);
  async function run(dryRun: boolean) {
    const input = source ?? { format: 'text' as const, content: text, label: '' };
    setBusy(true);
    setError(null);
    try {
      const res = await api.importFile({ format: input.format, content: input.content, dryRun });
      setResult(res);
      setBatch(null);
      if (!dryRun && res.autoEnrich) setAuto(res.autoEnrich);
      if (res.errors.some((e) => e.code === 'IMPORT_UNRECOGNISED'))
        setError(ORDER_ERRORS.IMPORT_UNRECOGNISED ?? null);
      if (!dryRun) onImported();
    } catch (err) {
      setError(orderErrorText(err));
    } finally {
      setBusy(false);
    }
  }
  async function enrichAll(confirm: boolean) {
    const ids = (result?.plan ?? []).flatMap((p) => (p.wineId ? [p.wineId] : []));
    if (!ids.length) return;
    setBusy(true);
    setError(null);
    try {
      setBatch(await api.enrichBatch(ids, confirm));
      if (confirm) onImported();
    } catch (err) {
      setError(orderErrorText(err));
    } finally {
      setBusy(false);
    }
  }
  const order = result?.order;
  const check = order?.check;
  const canApply =
    !!result?.dryRun && !!check?.ok && (result?.plan.length ?? 0) > 0 && !order?.alreadyImported;
  return (
    <section className="wine-import" aria-label="Import objednávky" data-testid="wine-import-order">
      <h3 className="wine-h3" data-testid="wine-import-pdf">
        Nahrát PDF objednávky
      </h3>
      <p className="wine-sub">
        Potvrzení objednávky ze Znovínu: nahrajte PDF (tisk e-mailu) nebo vložte jeho text. Načtou
        se jen položky a ceny – jméno, adresa ani kontakty se nikam neukládají. Nejdřív náhled s
        kontrolou součtu, zápis až po potvrzení; stejnou objednávku nelze naskladnit dvakrát.
      </p>
      <div className="wine-import-row">
        <label className="wine-btn wine-file">
          <Icon name="upload" size={18} /> Vybrat PDF
          <input
            type="file"
            accept=".pdf,application/pdf"
            data-testid="wine-import-pdf-file"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              if (file.size > 2_500_000) {
                setError(ORDER_ERRORS.IMPORT_TOO_LARGE ?? null);
                return;
              }
              const reader = new FileReader();
              reader.onload = () => {
                setSource({ format: 'pdf', content: String(reader.result), label: file.name });
                setResult(null);
              };
              reader.readAsDataURL(file);
            }}
          />
        </label>
        {source && (
          <span className="wine-muted" data-testid="wine-import-pdf-name">
            {source.label}{' '}
            <button type="button" className="wine-btn" onClick={() => setSource(null)}>
              Zrušit
            </button>
          </span>
        )}
      </div>
      {!source && (
        <label className="wine-field">
          nebo vložte text potvrzení
          <textarea
            rows={5}
            value={text}
            placeholder="Zkopírujte celé potvrzení objednávky z e-mailu…"
            onChange={(e) => {
              setText(e.target.value);
              setResult(null);
            }}
            data-testid="wine-import-order-text"
          />
        </label>
      )}
      <div className="wine-actions-row wine-actions-row--start">
        <button
          type="button"
          className="wine-btn"
          disabled={busy || (!source && !text.trim())}
          onClick={() => void run(true)}
          data-testid="wine-import-order-preview"
        >
          Náhled objednávky
        </button>
        <button
          type="button"
          className="wine-btn wine-btn--primary"
          disabled={busy || !canApply}
          onClick={() => void run(false)}
          data-testid="wine-import-order-apply"
        >
          Potvrdit naskladnění
        </button>
      </div>
      {error && (
        <p className="wine-error" role="alert">
          {error}
        </p>
      )}
      {order?.recognized && check && result && (
        <div className="wine-import-plan" data-testid="wine-import-order-plan">
          <p>
            <strong>{result.dryRun ? 'Náhled' : 'Naskladněno'}:</strong> {order.itemCount} položek ·{' '}
            {order.bottles} lahví
            {order.alreadyImported && ' · tato objednávka už byla importována'}
          </p>
          <p className="wine-check" data-ok={check.ok || undefined} data-testid="wine-import-check">
            Kontrola součtu: položky {kc.format(check.itemsTotal)} Kč
            {check.discounts > 0 && ` − sleva ${kc.format(check.discounts)} Kč`}
            {check.fees > 0 && ` + poplatky ${kc.format(check.fees)} Kč`} ={' '}
            {kc.format(check.expectedTotal)} Kč ·{' '}
            {check.ok
              ? `souhlasí s cenou celkem ${kc.format(check.orderTotal ?? 0)} Kč ✓`
              : check.orderTotal === null
                ? 'cena celkem nenalezena ✗'
                : `NESOUHLASÍ s cenou celkem ${kc.format(check.orderTotal)} Kč ✗`}
          </p>
          <div className="wine-table-wrap">
            <table className="wine-table">
              <thead>
                <tr>
                  <th>Obj. číslo</th>
                  <th>Víno</th>
                  <th>Ročník</th>
                  <th className="num">Lahví</th>
                  <th className="num">Cena/ks</th>
                  <th>Akce</th>
                </tr>
              </thead>
              <tbody>
                {result.plan.map((p) => (
                  <tr key={p.row}>
                    <td>{p.catalogueCode}</td>
                    <td>{p.name}</td>
                    <td>{p.vintage ?? 'NV'}</td>
                    <td className="num">
                      {p.quantity}
                      {(p.packSize ?? 1) > 1 && (
                        <span className="wine-pack-note">
                          {' '}
                          ({p.orderUnits ?? 1}× balení {p.packLabel ?? p.packSize})
                        </span>
                      )}
                      {p.issues?.includes('pack_size_unknown') && (
                        <span className="wine-pack-note wine-pack-note--warn" role="note">
                          {' '}
                          ⚠ karton – ověř počet lahví
                        </span>
                      )}
                    </td>
                    <td className="num">
                      {p.unitPrice == null ? '–' : `${kc.format(p.unitPrice)} Kč`}
                    </td>
                    <td>{ACTION_CS[p.action] ?? p.action}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!result.dryRun && (
            <div className="wine-actions-row wine-actions-row--start">
              <button
                type="button"
                className="wine-btn"
                disabled={busy || running}
                onClick={() => void enrichAll(false)}
                data-testid="wine-enrich-all"
              >
                Doplnit ze Znovínu vše z importu
              </button>
              {batch && !batch.confirm && (
                <button
                  type="button"
                  className="wine-btn wine-btn--primary"
                  disabled={busy}
                  onClick={() => void enrichAll(true)}
                  data-testid="wine-enrich-all-confirm"
                >
                  Potvrdit doplnění ({batch.items.filter((x) => x.ok).length})
                </button>
              )}
            </div>
          )}
          {auto && auto.total > 0 && (
            <p className="wine-muted" role="status" data-testid="wine-auto-enrich">
              {autoEnrichText(auto)}
            </p>
          )}
          {batch && (
            <p className="wine-muted" data-testid="wine-enrich-all-result">
              {batch.confirm ? 'Doplněno' : 'Nalezeno v e-shopu'}:{' '}
              {batch.items.filter((x) => x.ok).length} z {batch.items.length}
              {batch.items.some((x) => !x.ok) &&
                ' (zbytek bez shody – lze doplnit ručně v detailu)'}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

/** Importer: Znovín order (PDF/text) + Vivino export + generic CSV/JSON. */
export function ImportView({ api, onImported, pollMs }: ImportProps) {
  return (
    <div className="wine-import-wrap" data-testid="wine-import">
      <OrderImport api={api} onImported={onImported} pollMs={pollMs} />
      <VivinoImport api={api} onImported={onImported} />
      <FileImport api={api} onImported={onImported} />
    </div>
  );
}

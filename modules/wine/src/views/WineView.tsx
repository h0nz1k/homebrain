import { useCallback, useEffect, useMemo, useState } from 'react';
import { navigatePanel, navigateUp, type ModuleViewProps } from '@homebrain/ha-client';
import { EmptyState, toast } from '@homebrain/ui';
import type { WineRecord } from '../domain/index.js';
import { PREDICATE_CS, SUGAR_CS } from '../domain/index.js';
import { EMPTY_FILTERS, activeFilterCount, filterWines } from '../filters.js';
import type { WineFilters, WineSort } from '../filters.js';
import { getWineApi, mergeWineRecord } from '../api.js';
import type { WineDetailData } from '../api.js';
import { deriveWineSignals } from '../signals.js';
import { WineBottle } from './BottleArt.js';
import { Detail, errorText, locationText } from './Detail.js';
import { CardStars, CoolerCard, Icon, MetricsRow, Stars, useCooler } from './parts.js';
import { FilterPanel, ImportView } from './panels.js';
import { AddWineSheet } from './AddWine.js';
import { COLOR_CS, bottles, czk, metaLine, num1 } from './labels.js';
import { wineStyles } from './wineStyles.js';

export type Section = 'overview' | 'catalog' | 'mine' | 'ratings' | 'orders' | 'import';
const SECTIONS: Array<[Section, string]> = [
  ['overview', 'Přehled'],
  ['catalog', 'Katalog vín'],
  ['mine', 'Moje vína'],
  ['ratings', 'Hodnocení'],
  ['orders', 'Objednávky'],
  ['import', 'Importer'],
];
const SORT_CS: Record<WineSort, string> = {
  name: 'Název A–Z',
  rating: 'Hodnocení',
  vintage: 'Ročník',
  id: 'Pořadí přidání',
};
const SECTION_KEY = 'homebrain.wine.section';
const FAV_KEY = 'homebrain.wine.favorites';

function readStore<T>(key: string, fallback: T): T {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeStore(key: string, value: unknown) {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode – preference just isn't remembered */
  }
}
const isDesktop = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(min-width: 901px)').matches;

function WineCard({
  wine,
  selected,
  favorite,
  onSelect,
  onFavorite,
}: {
  wine: WineRecord;
  selected: boolean;
  favorite: boolean;
  onSelect: () => void;
  onFavorite: () => void;
}) {
  return (
    <li
      className="wine-cardwrap"
      aria-current={selected || undefined}
      data-empty={wine.quantity === 0 || undefined}
    >
      <button type="button" className="wine-card" onClick={onSelect} data-testid="wine-card">
        <span className="wine-card-art">
          <WineBottle wine={wine} height={256} decorative />
          <span
            className="wine-qty"
            data-testid="wine-card-qty"
            aria-label={`Skladem ${wine.quantity} ks`}
          >
            {wine.quantity} ks
          </span>
        </span>
        <span className="wine-card-body">
          <span className="wine-card-titles">
            <strong className="wine-name">{wine.name}</strong>
            {wine.labelName && (
              <span className="wine-label" data-testid="wine-card-label">
                {wine.labelName}
              </span>
            )}
          </span>
          <span className="wine-meta">{metaLine(wine)}</span>
          <span className="wine-meta wine-meta--prod">{wine.producer}</span>
          {wine.personalRating !== null && (
            <span className="wine-card-foot">
              <CardStars value={wine.personalRating} />
            </span>
          )}
        </span>
      </button>
      <button
        type="button"
        className="wine-heart"
        aria-pressed={favorite}
        aria-label={
          favorite ? `Odebrat z Mých vín: ${wine.name}` : `Přidat do Mých vín: ${wine.name}`
        }
        onClick={onFavorite}
        data-testid="wine-fav"
      >
        <Icon name="heart" size={20} />
      </button>
    </li>
  );
}

function WineTable({
  wines,
  selectedId,
  onSelect,
}: {
  wines: WineRecord[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="wine-table-wrap">
      <table className="wine-table" data-testid="wine-table">
        <thead>
          <tr>
            <th>Víno</th>
            <th>Ročník</th>
            <th>Odrůda</th>
            <th>Barva</th>
            <th>Umístění</th>
            <th>Hodnocení</th>
            <th className="num">Ks</th>
          </tr>
        </thead>
        <tbody>
          {wines.map((w) => (
            <tr
              key={w.id}
              aria-selected={w.id === selectedId}
              data-empty={w.quantity === 0 || undefined}
            >
              <td>
                <button type="button" className="wine-rowbtn" onClick={() => onSelect(w.id)}>
                  <strong>{w.name}</strong>
                  <span className="wine-sub">
                    {w.labelName ? `${w.labelName} · ${w.producer}` : w.producer}
                  </span>
                </button>
              </td>
              <td>{w.vintage ?? 'NV'}</td>
              <td>{w.grapeVarieties.join(', ')}</td>
              <td>
                <span className={`wine-swatch wine-swatch--${w.color}`} aria-hidden="true" />{' '}
                {COLOR_CS[w.color]}
              </td>
              <td>{locationText(w) ?? 'bez umístění'}</td>
              <td>
                <Stars value={w.personalRating} />
              </td>
              <td className="num">{w.quantity}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Chip row summarising each filter group; every chip opens the drawer at its group. */
function chipLabels(f: WineFilters): Array<[string, string, boolean]> {
  const list = (label: string, values: string[]) =>
    values.length ? `${label}: ${values.length === 1 ? values[0] : values.length}` : label;
  return [
    [
      'color',
      list(
        'Barva',
        f.colors.map((c) => COLOR_CS[c]),
      ),
      f.colors.length > 0,
    ],
    [
      'sugar',
      list(
        'Obsah cukru',
        f.sugar.map((s) => SUGAR_CS[s]),
      ),
      f.sugar.length > 0,
    ],
    [
      'predicate',
      list(
        'Přívlastek',
        f.predicates.map((p) => PREDICATE_CS[p]),
      ),
      f.predicates.length > 0,
    ],
    ['region', list('Oblast', f.regions), f.regions.length > 0],
    ['variety', list('Odrůda', f.varieties), f.varieties.length > 0],
    [
      'vintage',
      f.vintageFrom || f.vintageTo
        ? `Ročník: ${f.vintageFrom ?? '…'}–${f.vintageTo ?? '…'}`
        : 'Ročník',
      Boolean(f.vintageFrom || f.vintageTo),
    ],
    [
      'price',
      f.priceMax !== null ? `Cena: do ${czk.format(f.priceMax)}` : 'Cena',
      f.priceMax !== null,
    ],
    ['zone', list('Zóna', f.zones), f.zones.length > 0 || f.inStockOnly],
  ];
}

export default function WineView(
  props: Partial<ModuleViewProps> & Pick<ModuleViewProps, 'store' | 'bindings'>,
) {
  const { connection } = props;
  const api = useMemo(() => getWineApi({ connection }), [connection]);
  const cooler = useCooler(props);
  const [wines, setWines] = useState<WineRecord[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filters, setFilters] = useState<WineFilters>(EMPTY_FILTERS);
  const [storedSection, setSectionState] = useState<Section>(() =>
    readStore(SECTION_KEY, 'overview'),
  );
  const [table, setTable] = useState(false);
  const [drawer, setDrawer] = useState<{ focus: string | null } | null>(null);
  const [favorites, setFavorites] = useState<string[]>(() => readStore(FAV_KEY, []));
  const [selectedState, setSelected] = useState<WineDetailData | null>(null);
  const detailId = useMemo(() => {
    const segment = props.route?.path.split('/').filter(Boolean)[0];
    try {
      return segment ? decodeURIComponent(segment) : undefined;
    } catch {
      return undefined;
    }
  }, [props.route?.path]);
  // A deep link must remain visible even after the importer was the last open section.
  const section =
    detailId && (storedSection === 'import' || storedSection === 'orders')
      ? 'catalog'
      : storedSection;
  const selected = props.route
    ? detailId
      ? selectedState?.wine.id === detailId
        ? selectedState
        : null
      : isDesktop()
        ? selectedState
        : null
    : selectedState;
  const [adding, setAdding] = useState(false);

  const setSection = (s: Section) => {
    if (detailId && (s === 'import' || s === 'orders')) navigatePanel('/wine');
    setSectionState(s);
    writeStore(SECTION_KEY, s);
    if (s !== 'overview' && !isDesktop()) setSelected(null);
  };
  const reload = useCallback(() => {
    if (!api) return;
    api.list().then(setWines, (err) => setLoadError(errorText(err)));
  }, [api]);
  useEffect(() => {
    if (!api) return;
    let live = true;
    api.list().then(
      (list) => live && setWines(list),
      (err) => live && setLoadError(errorText(err)),
    );
    return () => {
      live = false;
    };
  }, [api]);
  const select = useCallback(
    async (id: string) => {
      if (!api) return;
      try {
        setSelected(await api.get(id));
      } catch (err) {
        toast.error(errorText(err), { id: 'wine-error' });
      }
    },
    [api],
  );
  // A detail deep link is supplied by HA, never read from iframe history.
  useEffect(() => {
    if (!api || !detailId) return;
    let active = true;
    void api.get(detailId).then(
      (detail) => {
        if (active) setSelected(detail);
      },
      (err) => {
        if (active) toast.error(errorText(err), { id: 'wine-error' });
      },
    );
    return () => {
      active = false;
    };
  }, [detailId, api]);
  const openDetail = (id: string) => {
    if (props.route) navigatePanel(`/wine/${encodeURIComponent(id)}`);
    else void select(id);
  };
  const toggleFavorite = (id: string) =>
    setFavorites((list) => {
      const next = list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
      writeStore(FAV_KEY, next);
      return next;
    });

  const scoped = useMemo(() => {
    const list = wines ?? [];
    if (section === 'mine') return list.filter((w) => favorites.includes(w.id));
    if (section === 'ratings') return list.filter((w) => w.personalRating !== null);
    return list;
  }, [wines, section, favorites]);
  const effective = useMemo(
    () =>
      section === 'ratings' && filters.sort === 'name'
        ? { ...filters, sort: 'rating' as const }
        : filters,
    [section, filters],
  );
  const visible = useMemo(() => filterWines(scoped, effective), [scoped, effective]);
  const firstId = visible[0]?.id ?? null;
  const gridSection =
    section === 'overview' || section === 'catalog' || section === 'mine' || section === 'ratings';

  // Persistent detail (WIN-021): desktop overview always shows the first match.
  useEffect(() => {
    if (detailId || section !== 'overview' || selected || !firstId || !isDesktop()) return;
    const timer = setTimeout(() => void select(firstId), 0);
    return () => clearTimeout(timer);
  }, [detailId, section, selected, firstId, select]);

  const tValue = cooler.temperature?.value ?? null;
  const tAt = cooler.temperature?.updatedAt ?? null;
  const hValue = cooler.humidity?.value ?? null;
  const hAt = cooler.humidity?.updatedAt ?? null;
  const signals = useMemo(
    () =>
      deriveWineSignals({
        wines: wines ?? [],
        temperature: { value: tValue, updatedAt: tAt },
        humidity: { value: hValue, updatedAt: hAt },
        now: new Date(),
      }),
    [wines, tValue, tAt, hValue, hAt],
  );

  if (!api)
    return (
      <div className="wine-root">
        <style>{wineStyles}</style>
        <h1 className="wine-h1">Vinotéka</h1>
        <EmptyState title="Vinotéka není dostupná">
          Chybí spojení s Home Assistantem (integrace HomeBrain).
        </EmptyState>
      </div>
    );
  const count = activeFilterCount(filters);
  const showDetail = Boolean(selected) && gridSection;
  const title = SECTIONS.find(([s]) => s === section)![1];
  const bottlesVisible = visible.reduce((s, w) => s + w.quantity, 0);
  const clearAll = () => setFilters({ ...EMPTY_FILTERS, sort: filters.sort });

  return (
    <div className="wine-root" data-section={section} data-detail={showDetail ? 'open' : undefined}>
      <style>{wineStyles}</style>
      <h1 className="wine-sr">Vinotéka</h1>
      <div className="wine-layout">
        <div className="wine-maincol">
          <nav className="wine-subnav" aria-label="Sekce vinotéky">
            {SECTIONS.map(([id, label]) => (
              <button
                key={id}
                type="button"
                className="wine-subnav-i"
                aria-current={section === id ? 'page' : undefined}
                onClick={() => setSection(id)}
                data-testid={`wine-nav-${id}`}
              >
                {label}
              </button>
            ))}
          </nav>
          {gridSection && (
            <div className="wine-toolbar">
              <label className="wine-search">
                <Icon name="search" />
                <span className="wine-sr">Hledat víno</span>
                <input
                  type="search"
                  placeholder="Hledat víno nebo vinařství…"
                  value={filters.query}
                  onChange={(e) => setFilters({ ...filters, query: e.target.value })}
                  data-testid="wine-search"
                />
              </label>
              <button
                type="button"
                className="wine-iconbtn wine-iconbtn--box"
                aria-label={`Filtry${count ? ` (${count} aktivní)` : ''}`}
                aria-expanded={Boolean(drawer)}
                onClick={() => setDrawer({ focus: null })}
                data-testid="wine-filters-open"
              >
                <Icon name="filter" />
                {count > 0 && <span className="wine-badge">{count}</span>}
              </button>
              <button
                type="button"
                className="wine-iconbtn wine-iconbtn--box"
                aria-pressed={table}
                aria-label={table ? 'Zobrazit karty' : 'Zobrazit tabulku'}
                onClick={() => setTable((t) => !t)}
                data-testid="wine-mode-list"
              >
                <Icon name={table ? 'bottle' : 'box'} />
              </button>
              <button
                type="button"
                className="wine-btn wine-btn--primary wine-addbtn"
                onClick={() => setAdding(true)}
                aria-label="Přidat víno"
                data-testid="wine-add-open"
              >
                <Icon name="plus" />
                <span>Přidat víno</span>
              </button>
            </div>
          )}
          {section === 'overview' && wines && (
            <section className="wine-overview" aria-labelledby="wine-ov-title">
              <h2 className="wine-h2" id="wine-ov-title">
                Přehled
              </h2>
              <div className="wine-ov-grid">
                <MetricsRow wines={wines} />
                <CoolerCard cooler={cooler} signals={signals} />
              </div>
            </section>
          )}
          {gridSection && (
            <section className="wine-catalog" aria-labelledby="wine-cat-title">
              <div className="wine-cat-head">
                <h2 className="wine-h2" id="wine-cat-title">
                  {section === 'overview' ? 'Katalog vín' : title}
                </h2>
                <p className="wine-count" data-testid="wine-result-count" aria-live="polite">
                  {wines
                    ? `${visible.length} z ${scoped.length} vín · ${bottles(bottlesVisible)}`
                    : 'Načítám…'}
                </p>
              </div>
              <div className="wine-chiprow">
                {chipLabels(filters).map(([id, label, on]) => (
                  <button
                    key={id}
                    type="button"
                    className="wine-fchip"
                    aria-pressed={on}
                    onClick={() => setDrawer({ focus: id })}
                  >
                    {label}
                    <span aria-hidden="true">›</span>
                  </button>
                ))}
                <button
                  type="button"
                  className="wine-fchip"
                  onClick={() => setDrawer({ focus: null })}
                  data-testid="wine-more-filters"
                >
                  <Icon name="filter" size={16} /> Více filtrů{count ? ` (${count})` : ''}
                </button>
                <label className="wine-sort">
                  <span>Seřadit:</span>
                  <select
                    value={effective.sort}
                    onChange={(e) => setFilters({ ...filters, sort: e.target.value as WineSort })}
                    aria-label="Řadit podle"
                  >
                    {(['name', 'rating', 'vintage'] as WineSort[]).map((s) => (
                      <option key={s} value={s}>
                        {SORT_CS[s]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {section === 'ratings' && wines && (
                <p className="wine-sub" data-testid="wine-ratings-summary">
                  Ohodnoceno {scoped.length} z {wines.length} vín
                  {scoped.length > 0 &&
                    ` · průměr ${num1.format(scoped.reduce((s, w) => s + (w.personalRating ?? 0), 0) / scoped.length)} ★`}
                  . Hodnocení přidáte v detailu vína.
                </p>
              )}
              {loadError && (
                <p className="wine-error" role="alert">
                  {loadError}
                </p>
              )}
              {wines && !visible.length && (
                <div className="wine-empty" data-testid="wine-empty">
                  {section === 'mine' && !scoped.length ? (
                    <EmptyState title="Zatím žádná oblíbená vína">
                      Označte víno srdíčkem na kartě a najdete ho tady.
                    </EmptyState>
                  ) : section === 'ratings' && !scoped.length ? (
                    <EmptyState title="Zatím nic ohodnoceno">
                      Otevřete detail vína a přidejte své hodnocení.
                    </EmptyState>
                  ) : (
                    <>
                      <span className="wine-empty-ico" aria-hidden="true">
                        <Icon name="search" size={26} />
                      </span>
                      <EmptyState
                        title={
                          filters.query
                            ? 'Žádné víno neodpovídá hledání'
                            : 'Žádné víno neodpovídá filtrům'
                        }
                      >
                        {filters.query
                          ? `Pro „${filters.query}“ nic nemáme. Zkuste jiný název nebo vinařství.`
                          : 'Zkuste některý filtr uvolnit.'}
                      </EmptyState>
                      <div className="wine-actions-row wine-actions-row--center">
                        {filters.query && (
                          <button
                            type="button"
                            className="wine-btn"
                            onClick={() => setFilters({ ...filters, query: '' })}
                            data-testid="wine-clear-search"
                          >
                            Vymazat hledání
                          </button>
                        )}
                        {count > 0 && (
                          <button type="button" className="wine-btn" onClick={clearAll}>
                            Zrušit filtry
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
              {table ? (
                visible.length > 0 && (
                  <WineTable
                    wines={visible}
                    selectedId={selected?.wine.id ?? null}
                    onSelect={openDetail}
                  />
                )
              ) : (
                <ul className="wine-grid" data-testid="wine-grid">
                  {visible.map((w) => (
                    <WineCard
                      key={w.id}
                      wine={w}
                      selected={selected?.wine.id === w.id}
                      favorite={favorites.includes(w.id)}
                      onSelect={() => openDetail(w.id)}
                      onFavorite={() => toggleFavorite(w.id)}
                    />
                  ))}
                </ul>
              )}
            </section>
          )}
          {section === 'orders' && (
            <section className="wine-placeholder" data-testid="wine-orders">
              <h2 className="wine-h2">Objednávky</h2>
              <EmptyState title="Objednávky připravujeme">
                Sledování objednávek z e-shopů přijde s dalším krokem (WIN-013). Do té doby
                naskladníte víno přes Importer.
              </EmptyState>
              <div className="wine-actions-row wine-actions-row--center">
                <button type="button" className="wine-btn" onClick={() => setSection('import')}>
                  Otevřít Importer
                </button>
              </div>
            </section>
          )}
          {section === 'import' && (
            <>
              <div className="wine-cat-head">
                <h2 className="wine-h2">Importer</h2>
                <button
                  type="button"
                  className="wine-btn wine-addbtn-inline"
                  onClick={() => setAdding(true)}
                  data-testid="wine-add-open-import"
                >
                  <Icon name="plus" size={18} /> Přidat víno ručně
                </button>
              </div>
              <ImportView
                api={api}
                onImported={() => {
                  reload();
                  toast.success('Import dokončen', { id: 'wine' });
                }}
              />
            </>
          )}
        </div>
        {showDetail && selected && (
          <Detail
            key={`${selected.wine.id}:${selected.wine.quantity}:${selected.wine.personalRating}`}
            api={api}
            wine={selected.wine}
            events={selected.events}
            priceHistory={selected.priceHistory}
            closable={section !== 'overview'}
            onClose={() => {
              setSelected(null);
              // Back to the list entry instead of pushing '/wine' again (back would reopen it).
              if (props.route) navigateUp('/wine');
            }}
            onChanged={(wine, message) => {
              setWines(
                (list) =>
                  list?.map((w) => (w.id === wine.id ? mergeWineRecord(w, wine) : w)) ?? null,
              );
              toast.success(message, { id: 'wine' });
              void select(wine.id);
            }}
          />
        )}
      </div>
      {drawer && wines && (
        <FilterPanel
          wines={scoped}
          filters={filters}
          set={setFilters}
          focus={drawer.focus}
          onClose={() => setDrawer(null)}
        />
      )}
      {adding && wines && (
        <AddWineSheet
          api={api}
          wines={wines}
          onClose={() => setAdding(false)}
          onOpenWine={(id) => {
            setAdding(false);
            if (section === 'import' || section === 'orders') setSection('catalog');
            openDetail(id);
          }}
          onCreated={(wine, message) => {
            setAdding(false);
            setWines((list) => {
              const all = list ?? [];
              return all.some((w) => w.id === wine.id)
                ? all.map((w) => (w.id === wine.id ? mergeWineRecord(w, wine) : w))
                : [wine, ...all];
            });
            toast.success(message, { id: 'wine' });
            if (section === 'import' || section === 'orders') setSection('catalog');
            openDetail(wine.id);
          }}
        />
      )}
    </div>
  );
}

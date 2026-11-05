import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { SaveState, useSaveState } from '@homebrain/ui';
import type { InventoryEvent, PriceHistory, WineRecord } from '../domain/index.js';
import {
  PREDICATE_CS,
  evaluateConsume,
  isNonNegativeInteger,
  predicateKey,
  sugarLabel,
} from '../domain/index.js';
import { WineApiError, newOperationId } from '../api.js';
import type { WineApi } from '../api.js';
import { vivinoSearchUrl } from '../lookup.js';
import { LookupPanel } from './DetailLookup.js';
import { WineBottle, photoUrl } from './BottleArt.js';
import { Icon, RatingControl } from './parts.js';
import { PriceHistoryCard } from './PriceHistory.js';
import type { IconName } from './parts.js';
import {
  COLOR_CS,
  ERROR_CS,
  OPERATION_CS,
  TYPE_CS,
  bottles,
  czk,
  dateOnly,
  dateTime,
  metaLine,
  num1,
} from './labels.js';

const REASONS = ['Inventura', 'Rozbitá lahev', 'Chyba v evidenci', 'Darováno'];
type Tab = 'props' | 'about' | 'history';

export function errorText(error: unknown) {
  const code = error instanceof WineApiError ? error.code : 'UNKNOWN';
  return ERROR_CS[code] ?? ERROR_CS.UNKNOWN;
}
export function locationText(w: WineRecord) {
  if (!w.location) return null;
  return [
    w.location.zone,
    w.location.shelf && `police ${w.location.shelf}`,
    w.location.position && `pozice ${w.location.position}`,
  ]
    .filter(Boolean)
    .join(' · ');
}
/** Generic serving temperature by style – a hint, not wine-specific data. */
function servingTemp(w: WineRecord) {
  if (w.wineType === 'sparkling' || w.wineType === 'semi_sparkling') return '6–8 °C';
  if (w.color === 'red') return '16–18 °C';
  if (w.color === 'orange') return '12–14 °C';
  return '8–11 °C';
}

interface Pending {
  quantity: number;
  lastBottle: boolean;
}

export function Detail({
  api,
  wine,
  events,
  priceHistory,
  onChanged,
  onClose,
  closable,
}: {
  api: WineApi;
  wine: WineRecord;
  events: InventoryEvent[];
  priceHistory?: PriceHistory;
  onChanged: (wine: WineRecord, message: string) => void;
  onClose: () => void;
  /** Desktop overview keeps the panel persistent (no close button). */
  closable: boolean;
}) {
  const [tab, setTab] = useState<Tab>('props');
  const [lookupOpen, setLookupOpen] = useState(false);
  const [qty, setQty] = useState(1);
  const [pending, setPending] = useState<Pending | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [correcting, setCorrecting] = useState(false);
  const [newQty, setNewQty] = useState(String(wine.quantity));
  const [reason, setReason] = useState(REASONS[0]!);
  // Parent remounts Detail (key) whenever wine id/quantity changes, resetting local state.
  const opId = useRef<string | null>(null);
  const rateRef = useRef<HTMLDivElement>(null);

  async function consume(confirmed: boolean) {
    setError(null);
    const gate = evaluateConsume({
      matchCount: 1,
      stockQuantity: wine.quantity,
      quantity: qty,
      confirmed,
    });
    if (!gate.ok && gate.code === 'CONFIRMATION_REQUIRED') {
      setPending({ quantity: qty, lastBottle: wine.quantity === qty });
      return;
    }
    if (!gate.ok) return setError(ERROR_CS[gate.code]);
    opId.current ??= newOperationId();
    setBusy(true);
    try {
      const result = await api.consume({
        wineId: wine.id,
        quantity: qty,
        confirmed,
        sourceOperationId: opId.current,
      });
      opId.current = null;
      setPending(null);
      onChanged(
        result.wine,
        `Otevřeno ${bottles(qty)}: ${wine.name}. Zbývá ${result.wine.quantity} ks.`,
      );
    } catch (err) {
      setPending(null);
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }
  async function correct() {
    setError(null);
    const value = Number(newQty);
    if (newQty.trim() === '' || !isNonNegativeInteger(value))
      return setError(ERROR_CS.INVALID_QUANTITY);
    setBusy(true);
    try {
      const result = await api.correct({
        wineId: wine.id,
        quantity: value,
        reason,
        sourceOperationId: newOperationId(),
      });
      setCorrecting(false);
      onChanged(result.wine, `Stav opraven na ${result.wine.quantity} ks (${reason})`);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }
  async function rate(next: number | null) {
    setError(null);
    setBusy(true);
    try {
      const updated = await api.update(wine.id, { personalRating: next });
      onChanged(
        updated,
        next === null ? 'Hodnocení smazáno' : `Hodnocení uloženo: ${num1.format(next)} z 5`,
      );
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  const origin = [wine.region, wine.country].filter(Boolean).join(', ') || null;
  const props: Array<[IconName, string, string | null]> = [
    ['glass', 'Typ', `${COLOR_CS[wine.color]} · ${TYPE_CS[wine.wineType].toLowerCase()}`],
    ['grape', 'Odrůda', wine.grapeVarieties.join(', ') || null],
    ['calendar', 'Ročník', wine.vintage ? String(wine.vintage) : 'bez ročníku'],
    ['pin', 'Oblast', origin],
    ['house', 'Vinařství', wine.producer || null],
    ['percent', 'Alkohol', wine.alcoholPct !== null ? `${num1.format(wine.alcoholPct)} %` : null],
    ['drop', 'Obsah cukru', sugarLabel(wine)],
    // Přívlastek = must sugar at harvest (zákon 321/2004 Sb. § 19), shown apart from sweetness.
    [
      'grape',
      'Přívlastek',
      predicateKey(wine.predicate) === 'none' ? null : PREDICATE_CS[predicateKey(wine.predicate)],
    ],
    [
      'bottle',
      'Objem',
      `${(wine.volumeMl / 1000).toLocaleString('cs-CZ', { maximumFractionDigits: 3 })} l`,
    ],
    ['box', 'Umístění', locationText(wine)],
  ];
  const tiles: Array<[IconName, string, string | null]> = [
    ['thermo', 'Teplota podávání', servingTemp(wine)],
    [
      'clock',
      'Okno pití',
      wine.drinkWindow ? `${wine.drinkWindow.from ?? '?'}–${wine.drinkWindow.to ?? '?'}` : null,
    ],
    [
      'calendar',
      'Pořízeno',
      wine.acquiredOn ? dateOnly.format(new Date(`${wine.acquiredOn}T00:00:00Z`)) : null,
    ],
    ['box', 'Umístění', wine.location?.zone ?? null],
  ];
  const empty = wine.quantity === 0;
  return (
    <aside className="wine-detail" aria-label={`Detail: ${wine.name}`} data-testid="wine-detail">
      <div className="wine-detail-bar">
        <button
          type="button"
          className="wine-iconbtn wine-detail-back"
          aria-label="Zpět na katalog"
          onClick={onClose}
        >
          <Icon name="back" />
        </button>
        <span className="wine-detail-bar-title">{wine.name}</span>
        {closable && (
          <button
            type="button"
            className="wine-iconbtn wine-detail-x"
            aria-label="Zavřít detail"
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        )}
      </div>
      <div className="wine-detail-scroll">
        <header className="wine-hero">
          <div className="wine-hero-bottle">
            <WineBottle wine={wine} height={160} />
          </div>
          <div className="wine-hero-text">
            <div className="wine-hero-titles">
              <h2>{wine.name}</h2>
              {wine.labelName && (
                <p className="wine-hero-label" data-testid="wine-detail-label">
                  {wine.labelName}
                </p>
              )}
            </div>
            <p className="wine-hero-sub" data-testid="wine-detail-meta">
              {metaLine(wine, 'bez ročníku')}
            </p>
            <p className="wine-hero-prod">{wine.producer}</p>
          </div>
          <div className="wine-hero-meta">
            <div className="wine-stockbox" data-empty={empty || undefined}>
              <span className="wine-lbl">Zbývá</span>
              <span>
                <strong data-testid="wine-detail-qty">{wine.quantity}</strong>{' '}
                {empty ? 'lahví – vypito' : bottles(wine.quantity).replace(/^\d+ /, '')}
              </span>
            </div>
            <div className="wine-hero-acts">
              <button
                type="button"
                className="wine-photo-find wine-lookup-btn"
                aria-expanded={lookupOpen}
                title="Znovín, Open Food Facts (EAN), stránky výrobců a AI v Home Assistantu – nejdřív náhled změn"
                onClick={() => setLookupOpen(true)}
                data-testid="wine-lookup"
              >
                <Icon name="sparkle" size={16} />
                Dohledat
                <span>{photoUrl(wine) ? 'údaje' : 'fotka a údaje'}</span>
              </button>
              <a
                className="wine-vivino"
                href={vivinoSearchUrl(wine)}
                target="_blank"
                rel="noopener noreferrer"
                title="Komunitní hodnocení na Vivino (otevře se nová karta)"
                data-testid="wine-vivino"
              >
                <span className="wine-vivino-mark" aria-hidden="true">
                  V
                </span>
                Otevřít ve Vivinu
                <Icon name="external" size={14} />
              </a>
            </div>
          </div>
        </header>
        {lookupOpen && (
          <LookupPanel
            api={api}
            wine={wine}
            hasPhoto={Boolean(photoUrl(wine))}
            onClose={() => setLookupOpen(false)}
            onChanged={(next, message) => {
              setLookupOpen(false);
              onChanged(next, message);
            }}
          />
        )}
        {wine.description && (
          <p className="wine-desc" data-testid="wine-description">
            {wine.description}
          </p>
        )}
        <section className="wine-myrating" ref={rateRef} aria-label="Moje hodnocení">
          <span className="wine-sec-title">
            Moje hodnocení
            {wine.personalRating !== null && (
              <strong className="wine-stars"> {num1.format(wine.personalRating)} z 5</strong>
            )}
          </span>
          <RatingControl
            value={wine.personalRating}
            disabled={busy}
            onChange={(v) => void rate(v)}
          />
        </section>
        <PriceHistoryCard wine={wine} data={priceHistory} />
        <div className="wine-tabs" role="tablist" aria-label="Detail vína">
          {(
            [
              ['props', 'Vlastnosti'],
              ['about', 'Popis'],
              ['history', `Historie (${events.length})`],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className="wine-tab"
              onClick={() => setTab(id)}
              data-testid={`wine-tab-${id}`}
            >
              {label}
            </button>
          ))}
        </div>
        {tab === 'props' && (
          <dl className="wine-props" role="tabpanel">
            {props
              .filter(([, , v]) => v)
              .map(([icon, k, v]) => (
                <div key={k}>
                  <dt>
                    <Icon name={icon} size={18} />
                    {k}
                  </dt>
                  <dd>{v}</dd>
                </div>
              ))}
            <PriceEditor wine={wine} api={api} onChanged={onChanged} />
          </dl>
        )}
        {tab === 'about' && (
          <div role="tabpanel" className="wine-about">
            <p className={wine.personalNote ? undefined : 'wine-muted'}>
              {wine.personalNote ?? 'K tomuto vínu zatím nemáte poznámku.'}
            </p>
            <ul className="wine-tiles">
              {tiles
                .filter(([, , v]) => v)
                .map(([icon, k, v]) => (
                  <li key={k}>
                    <Icon name={icon} />
                    <span>
                      <span className="wine-lbl">{k}</span>
                      <strong>{v}</strong>
                    </span>
                  </li>
                ))}
            </ul>
            <p className="wine-muted wine-fine">
              Teplota podávání je obecné doporučení podle typu vína.
            </p>
          </div>
        )}
        {tab === 'history' && (
          <section className="wine-history" role="tabpanel" aria-label="Historie">
            <ol data-testid="wine-history">
              {events.map((e) => (
                <li key={e.eventId}>
                  <span className="wine-ev-op" data-op={e.operation}>
                    {OPERATION_CS[e.operation]}
                  </span>
                  <span className="wine-ev-delta">
                    {e.quantityDelta > 0 ? `+${e.quantityDelta}` : e.quantityDelta}
                  </span>
                  {e.reason && e.reason !== OPERATION_CS[e.operation] && (
                    <span className="wine-ev-reason">{e.reason}</span>
                  )}
                  <time dateTime={e.occurredAt}>{dateTime.format(new Date(e.occurredAt))}</time>
                </li>
              ))}
              {!events.length && <li className="wine-muted">Zatím bez pohybů.</li>}
            </ol>
            {correcting ? (
              <form
                className="wine-correct"
                onSubmit={(e) => {
                  e.preventDefault();
                  void correct();
                }}
                data-testid="wine-correct-form"
              >
                <span className="wine-lbl">Oprava stavu (auditováno)</span>
                <label className="wine-field">
                  Skutečný počet lahví
                  <input
                    type="number"
                    min={0}
                    step={1}
                    inputMode="numeric"
                    value={newQty}
                    onChange={(e) => setNewQty(e.target.value)}
                  />
                </label>
                <label className="wine-field">
                  Důvod
                  <select value={reason} onChange={(e) => setReason(e.target.value)}>
                    {REASONS.map((r) => (
                      <option key={r}>{r}</option>
                    ))}
                  </select>
                </label>
                <div className="wine-actions-row">
                  <button type="button" className="wine-btn" onClick={() => setCorrecting(false)}>
                    Zrušit
                  </button>
                  <button type="submit" className="wine-btn wine-btn--primary" disabled={busy}>
                    Uložit opravu
                  </button>
                </div>
              </form>
            ) : (
              <button
                type="button"
                className="wine-btn wine-btn--ghost"
                onClick={() => setCorrecting(true)}
                data-testid="wine-correct"
              >
                Opravit stav
              </button>
            )}
          </section>
        )}
      </div>
      {error && (
        <p className="wine-error" role="alert">
          {error}
        </p>
      )}
      <div className="wine-actions" data-testid="wine-actions">
        <div className="wine-actions-main">
          {wine.quantity > 1 && (
            <div className="wine-stepper" role="group" aria-label="Počet lahví">
              <button
                type="button"
                aria-label="Méně"
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                disabled={qty <= 1}
              >
                −
              </button>
              <output aria-live="polite" data-testid="wine-consume-qty">
                {qty}
              </output>
              <button
                type="button"
                aria-label="Více"
                onClick={() => setQty((q) => Math.min(wine.quantity, q + 1))}
                disabled={qty >= wine.quantity}
              >
                +
              </button>
            </div>
          )}
          <button
            type="button"
            className="wine-btn wine-btn--primary"
            disabled={busy || empty}
            onClick={() => void consume(false)}
            data-testid="wine-consume"
          >
            <Icon name="minus" size={18} />
            {empty ? 'Není skladem' : qty > 1 ? `Otevřít ${bottles(qty)}` : 'Otevřít láhev'}
          </button>
        </div>
        <button
          type="button"
          className="wine-btn"
          onClick={() => {
            rateRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
            rateRef.current?.querySelector('button')?.focus();
          }}
          data-testid="wine-add-rating"
        >
          <Icon name="star" size={18} />
          {wine.personalRating === null ? 'Přidat hodnocení' : 'Upravit hodnocení'}
        </button>
      </div>
      {pending && (
        <div className="wine-dialog-backdrop">
          <div
            className="wine-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="wine-confirm-title"
            aria-describedby="wine-confirm-text"
            data-testid="wine-confirm"
          >
            <span className="wine-dialog-ico" aria-hidden="true">
              <WineBottle wine={wine} height={72} decorative />
            </span>
            <h3 id="wine-confirm-title">
              {pending.lastBottle
                ? pending.quantity === 1
                  ? 'Otevřít poslední láhev?'
                  : `Otevřít všech ${bottles(pending.quantity)}?`
                : `Otevřít ${bottles(pending.quantity)}?`}
            </h3>
            <p id="wine-confirm-text">
              {pending.lastBottle
                ? `${wine.name} ${wine.vintage ?? ''} – je to poslední láhev, víno pak nebude skladem. Změna se zapíše do historie.`
                : `${wine.name} ${wine.vintage ?? ''} – zbude ${bottles(wine.quantity - pending.quantity)}.`}
            </p>
            <div className="wine-actions-row">
              <button type="button" className="wine-btn" onClick={() => setPending(null)} autoFocus>
                Zrušit
              </button>
              <button
                type="button"
                className="wine-btn wine-btn--primary"
                disabled={busy}
                onClick={() => void consume(true)}
                data-testid="wine-confirm-ok"
              >
                Ano, otevřít
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}

/** Optional purchase price per bottle (owner wants it stored; written via WS update). */
function PriceEditor({
  wine,
  api,
  onChanged,
}: {
  wine: WineRecord;
  api: WineApi;
  onChanged: (wine: WineRecord, message: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const saving = useSaveState();
  const formRef = useRef<HTMLFormElement>(null);
  const start = () => {
    setValue(wine.purchasePrice !== null ? String(wine.purchasePrice) : '');
    setError(null);
    saving.reset();
    setEditing(true);
  };
  const save = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim().replace(',', '.');
    const next = trimmed === '' ? null : Number(trimmed);
    if (next !== null && (!Number.isFinite(next) || next < 0)) {
      setError('Neplatná cena');
      return;
    }
    setError(null);
    try {
      const updated = await saving.run(() => api.update(wine.id, { purchasePrice: next }));
      setEditing(false);
      onChanged(
        updated,
        next === null ? 'Nákupní cena smazána' : `Nákupní cena uložena: ${czk.format(next)}`,
      );
    } catch {
      /* SaveState ukáže „Nepodařilo se uložit – zkusit znovu“. */
    }
  };
  return (
    <div data-testid="wine-price">
      <dt>
        <Icon name="tag" size={18} />
        Nákupní cena
      </dt>
      <dd>
        {editing ? (
          <form
            ref={formRef}
            className="wine-price-form"
            onSubmit={(e) => void save(e)}
            data-testid="wine-price-form"
          >
            <input
              type="text"
              inputMode="decimal"
              aria-label="Nákupní cena za lahev v Kč"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              autoFocus
            />
            <button type="submit" className="wine-btn" disabled={saving.status === 'saving'}>
              Uložit
            </button>
            <button type="button" className="wine-link" onClick={() => setEditing(false)}>
              Zrušit
            </button>
            {error && <span role="alert">{error}</span>}
            <SaveState status={saving.status} onRetry={() => formRef.current?.requestSubmit()} />
          </form>
        ) : (
          <button type="button" className="wine-link" onClick={start} data-testid="wine-price-edit">
            {wine.purchasePrice !== null ? czk.format(wine.purchasePrice) : 'Doplnit (volitelné)'}
          </button>
        )}
      </dd>
    </div>
  );
}

import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import type { ConnectionLike } from '@homebrain/ha-client';
import { Button, ConfirmDialog, SegmentedControl, Sheet, toast } from '@homebrain/ui';
import {
  ASSUMPTION_TEXT,
  REGULATED_FIELDS,
  deleteOffer,
  emptyForm,
  fetchOffers,
  fetchOffersComparison,
  barValue,
  diffWords,
  roundToTotal,
  formFromOffer,
  formatKc,
  heroWords,
  monthLabel,
  offerPayload,
  offerPrices,
  offersHeadline,
  offersHero,
  parseNum,
  periodText,
  rankedPlans,
  regulatedSourceText,
  saveOffer,
  saveRegulated,
  spotStatusText,
  type ExportMode,
  type OfferForm,
  type OfferKind,
  type OffersComparison,
  type OffersState,
  type Plan,
  type Regulated,
} from '../offers.js';

const KIND_LABEL: Record<Plan['kind'], string> = {
  current: 'Aktuální',
  fixed: 'Pevná cena',
  spot: 'Spot',
};
const SPOT_POLL_MS = 15_000;
const ABBR: Record<string, string> = { VT: 'vysoký tarif', NT: 'nízký tarif (HDO)' };

/** Price part with VT/NT as an explained abbreviation. */
function PricePart({ text }: { text: string }) {
  const m = /^(VT|NT) (.*)$/.exec(text);
  return (
    <span className="en-off-part">
      {m ? (
        <>
          <abbr title={ABBR[m[1]!]}>{m[1]}</abbr> {m[2]}
        </>
      ) : (
        text
      )}
    </span>
  );
}

/* ---------- editors ---------- */

function NumField(props: {
  name: string;
  label: string;
  unit: string;
  value: string;
  onChange: (v: string) => void;
  invalid?: boolean;
  testId: string;
}) {
  return (
    <label className="en-inv-field" data-missing={props.invalid ? '' : undefined}>
      <span>
        {props.label} <small>({props.unit})</small>
      </span>
      <input
        name={props.name}
        inputMode="decimal"
        autoComplete="off"
        value={props.value}
        aria-invalid={props.invalid || undefined}
        data-testid={props.testId}
        onChange={(e) => props.onChange(e.target.value)}
      />
    </label>
  );
}

function OfferSheet({
  initial,
  onClose,
  onSave,
  onDelete,
}: {
  initial: OfferForm;
  onClose: () => void;
  onSave: (form: OfferForm) => Promise<void>;
  onDelete?: () => void;
}) {
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  const set = (key: keyof OfferForm) => (value: string) => setForm((f) => ({ ...f, [key]: value }));
  const bad = (key: keyof OfferForm, required = true) =>
    tried && (form[key] === '' ? required : parseNum(form[key]) === null);
  const invalid =
    !form.name.trim() ||
    (form.kind === 'fixed'
      ? parseNum(form.price_vt) === null || parseNum(form.price_nt) === null
      : parseNum(form.margin) === null) ||
    (form.monthly_fee !== '' && parseNum(form.monthly_fee) === null) ||
    (form.export_mode === 'fixed' && parseNum(form.export_price) === null);
  const exportOptions: Array<readonly [ExportMode, string]> = [
    ['none', 'Bez výkupu'],
    ['fixed', 'Pevná cena'],
    ...(form.kind === 'spot' ? [['spot', 'Spot − poplatek'] as const] : []),
  ];
  return (
    <Sheet
      title={initial.id ? 'Upravit nabídku' : 'Nová nabídka'}
      onClose={onClose}
      width="md"
      stickyFooter
      data-testid="energy-offer-edit"
      footer={
        <>
          {onDelete && (
            <Button variant="danger" onClick={onDelete} data-testid="energy-offer-delete">
              Smazat
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Zavřít
          </Button>
          <Button
            variant="primary"
            loading={busy}
            data-testid="energy-offer-save"
            onClick={async () => {
              setTried(true);
              if (invalid) return;
              setBusy(true);
              try {
                await onSave(form);
              } finally {
                setBusy(false);
              }
            }}
          >
            Uložit nabídku
          </Button>
        </>
      }
    >
      <p className="en-inv-note">
        Ceny silové elektřiny zadávejte bez DPH, jak je dodavatel uvádí v ceníku. Distribuci a
        regulované platby přidáme ze sdíleného nastavení.
      </p>
      <div className="en-off-form">
        <label
          className="en-inv-field en-off-wide"
          data-missing={tried && !form.name.trim() ? '' : undefined}
        >
          <span>Název nabídky</span>
          <input
            name="name"
            maxLength={60}
            value={form.name}
            data-testid="energy-offer-field-name"
            onChange={(e) => set('name')(e.target.value)}
          />
        </label>
        <div className="en-off-wide">
          <SegmentedControl<OfferKind>
            label="Typ ceny"
            value={form.kind}
            options={[
              ['fixed', 'Pevná cena'],
              ['spot', 'Spot (OTE)'],
            ]}
            onChange={(kind) =>
              setForm((f) => ({
                ...f,
                kind,
                export_mode: kind === 'fixed' && f.export_mode === 'spot' ? 'none' : f.export_mode,
              }))
            }
          />
        </div>
        {form.kind === 'fixed' ? (
          <>
            <NumField
              name="price_vt"
              label="Silová elektřina VT"
              unit="Kč/MWh bez DPH"
              value={form.price_vt}
              onChange={set('price_vt')}
              invalid={bad('price_vt')}
              testId="energy-offer-field-price_vt"
            />
            <NumField
              name="price_nt"
              label="Silová elektřina NT"
              unit="Kč/MWh bez DPH"
              value={form.price_nt}
              onChange={set('price_nt')}
              invalid={bad('price_nt')}
              testId="energy-offer-field-price_nt"
            />
          </>
        ) : (
          <NumField
            name="margin"
            label="Přirážka ke spotu"
            unit="Kč/MWh bez DPH"
            value={form.margin}
            onChange={set('margin')}
            invalid={bad('margin')}
            testId="energy-offer-field-margin"
          />
        )}
        <NumField
          name="monthly_fee"
          label="Stálá platba obchodníka"
          unit="Kč/měs. bez DPH"
          value={form.monthly_fee}
          onChange={set('monthly_fee')}
          invalid={bad('monthly_fee', false)}
          testId="energy-offer-field-monthly_fee"
        />
        <div className="en-off-wide">
          <SegmentedControl<ExportMode>
            label="Výkup přetoků z FVE"
            value={form.export_mode}
            options={exportOptions}
            onChange={(mode) => setForm((f) => ({ ...f, export_mode: mode }))}
          />
        </div>
        {form.export_mode === 'fixed' && (
          <NumField
            name="export_price"
            label="Výkupní cena"
            unit="Kč/MWh"
            value={form.export_price}
            onChange={set('export_price')}
            invalid={bad('export_price')}
            testId="energy-offer-field-export_price"
          />
        )}
        {form.export_mode === 'spot' && (
          <NumField
            name="export_fee"
            label="Poplatek za výkup (spot − poplatek)"
            unit="Kč/MWh"
            value={form.export_fee}
            onChange={set('export_fee')}
            invalid={bad('export_fee', false)}
            testId="energy-offer-field-export_fee"
          />
        )}
      </div>
      {tried && invalid && (
        <p className="en-off-error" role="alert">
          Doplňte název a ceny jako čísla (např. 2 490 nebo 2490,5).
        </p>
      )}
    </Sheet>
  );
}

function RegulatedSheet({
  regulated,
  onClose,
  onSave,
}: {
  regulated: Regulated;
  onClose: () => void;
  onSave: (values: Record<string, number>) => Promise<void>;
}) {
  const [form, setForm] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      REGULATED_FIELDS.map(([k]) => [k, String(regulated[k] ?? '').replace('.', ',')]),
    ),
  );
  const [busy, setBusy] = useState(false);
  const invalid = REGULATED_FIELDS.some(([k]) => form[k] !== '' && parseNum(form[k]!) === null);
  return (
    <Sheet
      title={`Regulované ceny ${regulated.year}`}
      onClose={onClose}
      width="md"
      stickyFooter
      data-testid="energy-offer-regulated-edit"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Zavřít
          </Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={invalid}
            data-testid="energy-offer-regulated-save"
            onClick={async () => {
              setBusy(true);
              try {
                await onSave(
                  Object.fromEntries(REGULATED_FIELDS.map(([k]) => [k, parseNum(form[k]!) ?? 0])),
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            Uložit
          </Button>
        </>
      }
    >
      <p className="en-inv-note">
        Stejné pro všechny nabídky. Zadejte ceny {regulated.year} bez DPH podle ceníku distributora
        pro vaši sazbu (např. z poslední faktury).
        {regulated.source === 'invoice' && ` Teď předvyplněno ${regulatedSourceText(regulated)}.`}
      </p>
      <div className="en-off-form">
        {REGULATED_FIELDS.map(([key, label, unit]) => (
          <NumField
            key={key}
            name={key}
            label={label}
            unit={unit === '%' ? '%' : `${unit} bez DPH`}
            value={form[key] ?? ''}
            onChange={(v) => setForm((f) => ({ ...f, [key]: v }))}
            invalid={form[key] !== '' && parseNum(form[key]!) === null}
            testId={`energy-offer-reg-${key}`}
          />
        ))}
      </div>
    </Sheet>
  );
}

/* ---------- chart ---------- */

/** Monthly difference of the chosen offer vs the current contract (up = cheaper with the offer). */
function MonthDiff({
  cmp,
  current,
  other,
}: {
  cmp: OffersComparison;
  current: Plan | undefined;
  other: Plan | undefined;
}) {
  const months = cmp.months ?? [];
  const [active, setActive] = useState<number | null>(null);
  if (!months.length || !current || !other) return null;
  const diffs = months.map((_, i) => {
    const a = current.months[i]?.total ?? null;
    const b = other.months[i]?.total ?? null;
    return a === null || b === null ? null : a - b; // + = cheaper with the offer
  });
  const labels = roundToTotal(diffs);
  const up = Math.max(0, ...diffs.map((d) => d ?? 0));
  const down = Math.max(0, ...diffs.map((d) => -(d ?? 0)));
  const span = Math.max(1, up + down);
  // rows proportional to the largest saving / extra cost -> one shared scale, zero line between
  const upFr = Math.max(up, span * 0.14);
  const downFr = Math.max(down, span * 0.14);
  const hUp = (v: number) => `${(v / upFr) * 100}%`;
  const hDown = (v: number) => `${(v / downFr) * 100}%`;
  // months where the offer loses because the current contract pays more for exported power
  const exportLoss = months
    .map((m, i) => {
      const d = diffs[i] ?? null;
      const gap = (current.months[i]?.export ?? 0) - (other.months[i]?.export ?? 0);
      return d !== null && d < 0 && gap > 0 && gap >= -d * 0.5 ? Number(m.month.slice(5)) : null;
    })
    .filter((m): m is number => m !== null);
  const summer = exportLoss.filter((m) => m >= 4 && m <= 9).length * 2 > exportLoss.length;
  const lossMonths = months.filter((m) => exportLoss.includes(Number(m.month.slice(5))));
  const lossRange =
    lossMonths.length > 1
      ? `${monthLabel(lossMonths[0]!.month, true).split(' ')[0]!.toLowerCase()} – ${monthLabel(
          lossMonths[lossMonths.length - 1]!.month,
          true,
        )
          .split(' ')[0]!
          .toLowerCase()}`
      : lossMonths.length
        ? monthLabel(lossMonths[0]!.month, true).split(' ')[0]!.toLowerCase()
        : '';
  const words = (d: number | null) => diffWords(d === null ? null : -d);
  const total = diffWords(other.diff);
  const readout =
    active === null ? (
      <>
        <b>Celkem za období</b>
        <span data-tone={total.tone}>{total.text}</span>
      </>
    ) : (
      <>
        <b>{monthLabel(months[active]!.month, true)}</b>
        <span>současná {formatKc(current.months[active]?.total)}</span>
        <span>
          {other.name} {formatKc(other.months[active]?.total)}
        </span>
        {diffs[active] !== null && (
          <span data-tone={words(diffs[active]!).tone}>{words(diffs[active]!).text}</span>
        )}
      </>
    );
  return (
    <div className="en-off-chart">
      <h3 className="en-off-chart-title">
        Rozdíl po měsících v Kč: „{other.name}“ oproti současné smlouvě
      </h3>
      <p className="en-off-readout" aria-live="polite" data-testid="energy-offer-readout">
        {readout}
      </p>
      <div
        className="en-off-bars"
        role="group"
        aria-label="Rozdíl po měsících"
        style={
          {
            '--en-off-up': `${(upFr / span).toFixed(3)}fr`,
            '--en-off-down': `${(downFr / span).toFixed(3)}fr`,
          } as CSSProperties
        }
        onMouseLeave={() => setActive(null)}
      >
        {months.map((m, idx) => {
          const d = diffs[idx] ?? null;
          return (
            <button
              key={m.month}
              type="button"
              className="en-off-month"
              aria-pressed={idx === active}
              data-partial={m.partial ? '' : undefined}
              data-testid="energy-offer-bar-month"
              aria-label={`${monthLabel(m.month, true)}: ${
                d === null ? 'bez srovnání' : words(d).text.toLowerCase()
              }`}
              onClick={() => setActive(idx === active ? null : idx)}
              onMouseEnter={() => setActive(idx)}
              onFocus={() => setActive(idx)}
            >
              <span className="en-off-up">
                {d !== null && d > 0 && (
                  <i data-k="save" style={{ height: hUp(d) }}>
                    <small className="en-off-val" data-testid="energy-offer-bar-value">
                      {barValue(labels[idx] ?? d)}
                    </small>
                  </i>
                )}
              </span>
              <span className="en-off-down">
                {d !== null && d < 0 && (
                  <i data-k="extra" style={{ height: hDown(-d) }}>
                    <small className="en-off-val" data-testid="energy-offer-bar-value">
                      {barValue(labels[idx] ?? d)}
                    </small>
                  </i>
                )}
                {d === null && <i data-missing="" />}
              </span>
              <span className="en-off-mlabel">{monthLabel(m.month)}</span>
            </button>
          );
        })}
      </div>
      <div className="en-off-legend" aria-hidden="true">
        <span data-k="save">nabídka levnější</span>
        <span data-k="extra">nabídka dražší</span>
        <span className="en-off-legend-unit">hodnoty v Kč s DPH</span>
      </div>
      {exportLoss.length > 0 && (
        <p className="en-off-hint" data-testid="energy-offer-export-hint">
          Oranžové sloupce ({lossRange}):{' '}
          {summer
            ? 'v létě vyhrává vyšší výkup přetoků u současné smlouvy.'
            : 'při velkých přetocích vyhrává vyšší výkup u současné smlouvy.'}
        </p>
      )}
      <div className="hb-sr-only">
        <table>
          <caption>Rozdíl po měsících: „{other.name}“ oproti současné smlouvě (Kč s DPH)</caption>
          <thead>
            <tr>
              <th scope="col">Měsíc</th>
              <th scope="col">Současná smlouva</th>
              <th scope="col">{other.name}</th>
              <th scope="col">Rozdíl</th>
            </tr>
          </thead>
          <tbody>
            {months.map((m, i) => (
              <tr key={m.month}>
                <th scope="row">{monthLabel(m.month, true)}</th>
                <td>{formatKc(current.months[i]?.total)}</td>
                <td>{formatKc(other.months[i]?.total)}</td>
                <td>{diffs[i] === null ? 'bez srovnání' : words(diffs[i]!).text}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------- card ---------- */

export function OffersCard({
  connection,
  kiosk = false,
}: {
  connection?: ConnectionLike;
  kiosk?: boolean;
}) {
  const [state, setState] = useState<OffersState | null>(null);
  const [cmp, setCmp] = useState<OffersComparison | null>(null);
  const [version, setVersion] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<OfferForm | null>(null);
  const [editReg, setEditReg] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  useEffect(() => {
    if (kiosk) return;
    let alive = true;
    void fetchOffers(connection).then((next) => alive && setState(next));
    return () => {
      alive = false;
    };
  }, [connection, kiosk]);
  const ready = !!state;
  useEffect(() => {
    if (!connection || !ready) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    void fetchOffersComparison(connection).then((next) => {
      if (!alive) return;
      setCmp(next);
      if (next?.spot?.running) timer = setTimeout(() => setVersion((v) => v + 1), SPOT_POLL_MS);
    });
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [connection, ready, version]);

  const apply = useCallback((next: OffersState) => {
    setState(next);
    setVersion((v) => v + 1);
  }, []);

  if (kiosk || !state || !connection) return null;
  const canEdit = state.can_edit;
  const ranked = rankedPlans(cmp);
  const current = ranked.find((p) => p.kind === 'current');
  const bestOffer = ranked.find((p) => p.kind !== 'current' && p.total !== null);
  const chosen = ranked.find((p) => p.id === selected && p.kind !== 'current') ?? bestOffer;
  const headline = offersHeadline(cmp);
  const hero = offersHero(cmp);
  const heroText = hero ? heroWords(hero) : null;
  const spotText = spotStatusText(cmp?.spot);
  const reg = state.regulated;
  const offerById = (id: string) => state.offers.find((o) => o.id === id);

  return (
    <section
      className="en-card en-offers"
      data-testid="energy-offers"
      aria-labelledby="en-off-title"
    >
      <header className="en-cost-head">
        <div>
          <h2 className="en-ct" id="en-off-title">
            Srovnání nabídek
          </h2>
          <p className="en-inv-muted">
            Kolik byste zaplatili u jiné nabídky – podle skutečně naměřeného odběru a přetoků.
          </p>
        </div>
        {canEdit && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setEditing(emptyForm())}
            data-testid="energy-offer-add"
          >
            Přidat nabídku
          </Button>
        )}
      </header>

      {cmp?.status === 'unconfigured' && (
        <p className="en-inv-muted" data-testid="energy-offers-status">
          Chybí vazba na odběr ze sítě se statistikami (nastavení integrace HomeBrain).
        </p>
      )}
      {cmp?.status === 'nodata' && (
        <p className="en-inv-muted" data-testid="energy-offers-status">
          Zatím nemáme žádný celý měsíc naměřeného odběru ze sítě.
        </p>
      )}
      {spotText && (
        <p className="en-inv-notice" role="status" data-testid="energy-offers-spot">
          {spotText}
        </p>
      )}
      {state.offers.length === 0 && (
        <p className="en-inv-muted" data-testid="energy-offers-empty">
          {canEdit
            ? 'Přidejte nabídku, kterou chcete porovnat – s pevnou cenou nebo spotovou.'
            : 'Správce zatím nezadal žádné nabídky k porovnání.'}
        </p>
      )}

      {cmp?.status === 'ok' && ranked.length > 0 && (
        <>
          <div
            className="en-off-hero"
            data-testid="energy-offers-hero"
            data-tone={hero?.diff == null ? undefined : hero.diff < 0 ? 'ok' : 'warn'}
          >
            {heroText && (
              <p className="en-off-big" data-testid="energy-offers-big">
                <b>{heroText.big}</b>
                <span className="en-off-facts">
                  <span>za období</span>
                  {heroText.percent && <span data-tone="strong">{heroText.percent}</span>}
                  {heroText.perMonth && <span>{heroText.perMonth}</span>}
                </span>
              </p>
            )}
            {headline && (
              <p className="en-off-headline" data-testid="energy-offers-headline">
                {headline}
              </p>
            )}
            <p className="en-inv-muted" data-testid="energy-offers-period">
              {periodText(cmp)} · všechny částky s DPH
            </p>
          </div>
          <div className="en-off-body">
            <ol className="en-off-list" aria-label="Pořadí od nejlevnější">
              {ranked.map((plan, i) => {
                const offer = offerById(plan.id);
                const tone =
                  plan.diff === null
                    ? undefined
                    : plan.diff < 0
                      ? 'ok'
                      : plan.diff > 0
                        ? 'warn'
                        : undefined;
                const isChosen = plan.kind !== 'current' && plan.id === chosen?.id;
                return (
                  <li
                    key={plan.id}
                    className="en-off-item"
                    data-current={plan.kind === 'current' ? '' : undefined}
                    data-chosen={isChosen ? '' : undefined}
                    data-testid="energy-offer-rank"
                    data-total={plan.total ?? ''}
                  >
                    <button
                      type="button"
                      className="en-off-pick"
                      aria-pressed={plan.kind === 'current' ? undefined : isChosen}
                      disabled={plan.kind === 'current'}
                      onClick={() => setSelected(plan.id)}
                    >
                      <span className="en-off-rank" aria-label={`${i + 1}. místo`}>
                        {i + 1}
                      </span>
                      <span className="en-off-name">
                        <b>{plan.name}</b>
                        <span>
                          <em className="en-off-kind" data-kind={plan.kind}>
                            {KIND_LABEL[plan.kind]}
                          </em>
                        </span>
                        <span className="en-off-prices">
                          {(offer
                            ? offerPrices(offer)
                            : [{ label: 'Ceny', parts: ['z tarifu v HomeBrainu'] }]
                          ).map((row) => (
                            <span key={row.label} className="en-off-prow">
                              <span className="en-off-plabel">{row.label}:</span>{' '}
                              <span className="en-off-pval">
                                {row.parts.map((part) => (
                                  <PricePart key={part} text={part} />
                                ))}
                              </span>
                            </span>
                          ))}
                        </span>
                        {plan.missing_spot_hours > 0 && (
                          <span className="en-off-warn">
                            Chybí spotové ceny pro {plan.missing_spot_hours} h – tyto měsíce
                            nepočítáme.
                          </span>
                        )}
                      </span>
                      <span className="en-off-total">
                        <b>{formatKc(plan.total)}</b>
                        {plan.kind === 'current' ? (
                          <span>za období</span>
                        ) : (
                          <span data-tone={tone} data-testid="energy-offer-diff">
                            {diffWords(plan.diff).text}
                          </span>
                        )}
                      </span>
                    </button>
                    {canEdit && !offer && <span className="en-off-edit-slot" aria-hidden="true" />}
                    {canEdit && offer && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="en-off-edit"
                        aria-label={`Upravit nabídku ${plan.name}`}
                        data-testid="energy-offer-edit-open"
                        onClick={() => setEditing(formFromOffer(offer))}
                      >
                        Upravit
                      </Button>
                    )}
                  </li>
                );
              })}
            </ol>
            <MonthDiff cmp={cmp} current={current} other={chosen} />
          </div>
        </>
      )}

      <details className="en-off-details" data-testid="energy-offers-assumptions">
        <summary>Jak počítáme a předpoklady</summary>
        <ul>
          {(cmp?.assumptions ?? Object.keys(ASSUMPTION_TEXT)).map((key) => (
            <li key={key}>{ASSUMPTION_TEXT[key] ?? key}</li>
          ))}
          <li>
            Spotové ceny: denní trh OTE (EUR/MWh) přepočtené kurzem ČNB. Jde o odhad, ne o nabídku
            dodavatele.
          </li>
        </ul>
        <div className="en-off-reg">
          <h3 className="en-ct">
            Regulované ceny {reg.year} bez DPH
            <small data-testid="energy-offers-reg-source">{regulatedSourceText(reg)}</small>
          </h3>
          <dl>
            {REGULATED_FIELDS.map(([key, label, unit]) => (
              <div key={key}>
                <dt>{label}</dt>
                <dd>
                  {new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 2 })
                    .format(Number(reg[key]) || 0)
                    .replace(/\s/g, '\u00a0')}
                  &nbsp;{unit}
                  {key === 'poze' && reg.poze_waived && (
                    <small data-testid="energy-offers-poze-note">
                      v roce {reg.year} hradí stát (podle faktury)
                    </small>
                  )}
                </dd>
              </div>
            ))}
          </dl>
          {canEdit && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setEditReg(true)}
              data-testid="energy-offer-regulated-open"
            >
              Upravit regulované ceny
            </Button>
          )}
        </div>
      </details>

      {editing && (
        <OfferSheet
          initial={editing}
          onClose={() => setEditing(null)}
          onDelete={editing.id ? () => setConfirmDelete(editing.id) : undefined}
          onSave={async (form) => {
            try {
              apply(await saveOffer(connection, offerPayload(form)));
              setEditing(null);
              toast.success('Nabídka uložena.');
            } catch {
              toast.error('Nabídku se nepodařilo uložit – zkontrolujte čísla.');
            }
          }}
        />
      )}
      {editReg && (
        <RegulatedSheet
          regulated={reg}
          onClose={() => setEditReg(false)}
          onSave={async (values) => {
            try {
              apply(await saveRegulated(connection, values));
              setEditReg(false);
              toast.success('Regulované ceny uloženy.');
            } catch {
              toast.error('Regulované ceny se nepodařilo uložit.');
            }
          }}
        />
      )}
      {confirmDelete && (
        <ConfirmDialog
          title="Smazat nabídku?"
          confirmLabel="Smazat"
          danger
          onClose={() => setConfirmDelete(null)}
          onConfirm={async () => {
            apply(await deleteOffer(connection, confirmDelete));
            setEditing(null);
          }}
        >
          Nabídka zmizí ze srovnání. Naměřená data zůstanou.
        </ConfirmDialog>
      )}
    </section>
  );
}

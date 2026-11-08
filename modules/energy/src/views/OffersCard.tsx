import { useCallback, useEffect, useState } from 'react';
import type { ConnectionLike } from '@homebrain/ha-client';
import { Button, ConfirmDialog, SegmentedControl, Sheet, toast } from '@homebrain/ui';
import {
  ASSUMPTION_TEXT,
  REGULATED_FIELDS,
  deleteOffer,
  emptyForm,
  fetchOffers,
  fetchOffersComparison,
  formFromOffer,
  formatDiff,
  formatKc,
  monthLabel,
  offerPayload,
  offerSummary,
  offersHeadline,
  parseNum,
  periodText,
  rankedPlans,
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
  current: 'Teď',
  fixed: 'Pevná cena',
  spot: 'Spot',
};
const SPOT_POLL_MS = 15_000;

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

function MonthBars({
  cmp,
  current,
  other,
}: {
  cmp: OffersComparison;
  current: Plan | undefined;
  other: Plan | undefined;
}) {
  const months = cmp.months ?? [];
  const [active, setActive] = useState(months.length - 1);
  if (!months.length || (!current && !other)) return null;
  const values = (p: Plan | undefined, i: number) => p?.months[i]?.total ?? null;
  const max = Math.max(
    1,
    ...months.flatMap((_, i) => [values(current, i) ?? 0, values(other, i) ?? 0]),
  );
  const pct = (v: number | null) => `${Math.max(0, ((v ?? 0) / max) * 100)}%`;
  const i = Math.min(active, months.length - 1);
  const a = values(current, i);
  const b = values(other, i);
  return (
    <div className="en-off-chart">
      <div className="en-off-legend" aria-hidden="true">
        {current && <span data-k="current">Současná smlouva</span>}
        {other && <span data-k="offer">{other.name}</span>}
      </div>
      <p className="en-off-readout" aria-live="polite" data-testid="energy-offer-readout">
        <b>{monthLabel(months[i]!.month, true)}</b>
        {current && <span>teď {formatKc(a)}</span>}
        {other && (
          <span>
            {other.name} {formatKc(b)}
          </span>
        )}
        {a !== null && b !== null && current && other && (
          <span data-tone={b - a < 0 ? 'ok' : b - a > 0 ? 'warn' : undefined}>
            {formatDiff(b - a)}
          </span>
        )}
      </p>
      <div className="en-off-bars" role="group" aria-label="Náklady po měsících">
        {months.map((m, idx) => (
          <button
            key={m.month}
            type="button"
            className="en-off-month"
            aria-pressed={idx === i}
            data-partial={m.partial ? '' : undefined}
            data-testid="energy-offer-bar-month"
            aria-label={`${monthLabel(m.month, true)}: současná ${formatKc(values(current, idx))}${other ? `, ${other.name} ${formatKc(values(other, idx))}` : ''}`}
            onClick={() => setActive(idx)}
            onMouseEnter={() => setActive(idx)}
            onFocus={() => setActive(idx)}
          >
            <span className="en-off-pair">
              {current && <i data-k="current" style={{ height: pct(values(current, idx)) }} />}
              {other && (
                <i
                  data-k="offer"
                  data-missing={values(other, idx) === null ? '' : undefined}
                  style={{ height: pct(values(other, idx)) }}
                />
              )}
            </span>
            <span className="en-off-mlabel">{monthLabel(m.month)}</span>
          </button>
        ))}
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
          <div className="en-off-hero">
            {headline && (
              <p className="en-off-headline" data-testid="energy-offers-headline">
                {headline}
              </p>
            )}
            <p className="en-inv-muted" data-testid="energy-offers-period">
              {periodText(cmp)}
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
                          {offer ? offerSummary(offer) : 'ceny z tarifu v HomeBrainu (s DPH)'}
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
                            {plan.diff === null
                              ? 'bez srovnání'
                              : `${formatDiff(plan.diff)} oproti teď`}
                          </span>
                        )}
                      </span>
                    </button>
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
            <MonthBars cmp={cmp} current={current} other={chosen} />
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
            <small>
              {reg.source === 'saved'
                ? 'zadané v nastavení'
                : reg.source === 'bindings'
                  ? 'předvyplněno z pomocníků Energie – zkontrolujte'
                  : 'zatím nezadané'}
            </small>
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

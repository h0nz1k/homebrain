import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { ConnectionLike } from '@homebrain/ha-client';
import { Button, ConfirmDialog, Sheet, toast } from '@homebrain/ui';
import {
  TARIFF_LABELS,
  contractNotice,
  deleteInvoice,
  fetchInvoiceComparison,
  fetchInvoices,
  formatDateCs,
  formatKc,
  formatKwh,
  formatPct,
  latestContractEnd,
  periodLabel,
  saveInvoice,
  tariffUpdateCalls,
  uploadInvoice,
  type FetchWithAuth,
  type Invoice,
  type InvoiceComparison,
  type InvoiceFields,
  type InvoiceList,
  type TariffKey,
} from '../invoices.js';

/* ---------- edit form ---------- */

type FieldDef = { path: string; label: string; kind: 'date' | 'number' | 'text'; unit?: string };
const MAIN_FIELDS: FieldDef[] = [
  { path: 'period.0', label: 'Období od', kind: 'date' },
  { path: 'period.1', label: 'Období do', kind: 'date' },
  { path: 'kwh.vt', label: 'Spotřeba VT', kind: 'number', unit: 'kWh' },
  { path: 'kwh.nt', label: 'Spotřeba NT', kind: 'number', unit: 'kWh' },
  { path: 'kwh.total', label: 'Spotřeba celkem', kind: 'number', unit: 'kWh' },
  { path: 'total_incl_vat', label: 'Celkem s DPH', kind: 'number', unit: 'Kč' },
  { path: 'total_excl_vat', label: 'Celkem bez DPH', kind: 'number', unit: 'Kč' },
  { path: 'vat', label: 'DPH', kind: 'number', unit: 'Kč' },
  { path: 'avg_incl_vat.vt', label: 'Průměrná cena VT s DPH', kind: 'number', unit: 'Kč/kWh' },
  { path: 'avg_incl_vat.nt', label: 'Průměrná cena NT s DPH', kind: 'number', unit: 'Kč/kWh' },
  { path: 'fixed_monthly_incl_vat', label: 'Stálé platby s DPH', kind: 'number', unit: 'Kč/měs.' },
  { path: 'contract_end', label: 'Pevná cena do', kind: 'date' },
];
const DETAIL_FIELDS: FieldDef[] = [
  { path: 'supplier', label: 'Dodavatel', kind: 'text' },
  { path: 'distributor', label: 'Distributor', kind: 'text' },
  { path: 'product', label: 'Produkt', kind: 'text' },
  { path: 'rate', label: 'Distribuční sazba', kind: 'text' },
  { path: 'breaker', label: 'Jistič', kind: 'text' },
  { path: 'issued', label: 'Vystaveno', kind: 'date' },
  { path: 'due', label: 'Splatnost', kind: 'date' },
  { path: 'meter.vt.0', label: 'Elektroměr VT počátek', kind: 'number', unit: 'kWh' },
  { path: 'meter.vt.1', label: 'Elektroměr VT konec', kind: 'number', unit: 'kWh' },
  { path: 'meter.nt.0', label: 'Elektroměr NT počátek', kind: 'number', unit: 'kWh' },
  { path: 'meter.nt.1', label: 'Elektroměr NT konec', kind: 'number', unit: 'kWh' },
  { path: 'commodity_czk_per_mwh_excl_vat.vt', label: 'Silová VT', kind: 'number', unit: 'Kč/MWh' },
  { path: 'commodity_czk_per_mwh_excl_vat.nt', label: 'Silová NT', kind: 'number', unit: 'Kč/MWh' },
  {
    path: 'fixed_monthly_excl_vat.stala_platba',
    label: 'Stálá platba',
    kind: 'number',
    unit: 'Kč/měs.',
  },
  {
    path: 'fixed_monthly_excl_vat.jistic',
    label: 'Platba za jistič',
    kind: 'number',
    unit: 'Kč/měs.',
  },
  {
    path: 'fixed_monthly_excl_vat.nesitova_infrastruktura',
    label: 'Nesíťová infrastruktura',
    kind: 'number',
    unit: 'Kč/měs.',
  },
  {
    path: 'distribution_czk_per_mwh_excl_vat.vt',
    label: 'Distribuce VT',
    kind: 'number',
    unit: 'Kč/MWh',
  },
  {
    path: 'distribution_czk_per_mwh_excl_vat.nt',
    label: 'Distribuce NT',
    kind: 'number',
    unit: 'Kč/MWh',
  },
  {
    path: 'distribution_czk_per_mwh_excl_vat.systemove_sluzby',
    label: 'Systémové služby',
    kind: 'number',
    unit: 'Kč/MWh',
  },
  {
    path: 'distribution_czk_per_mwh_excl_vat.dan',
    label: 'Daň z elektřiny',
    kind: 'number',
    unit: 'Kč/MWh',
  },
  { path: 'poze_waived_czk', label: 'POZE odpuštěno', kind: 'number', unit: 'Kč' },
];

function getPath(obj: unknown, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>(
      (o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined),
      obj,
    );
}

function setPath<T>(obj: T, path: string, value: unknown): T {
  const keys = path.split('.');
  const root: Record<string, unknown> = structuredClone(obj ?? {}) as Record<string, unknown>;
  let cur: Record<string, unknown> = root;
  keys.slice(0, -1).forEach((k, i) => {
    const next = cur[k];
    if (!next || typeof next !== 'object') cur[k] = /^\d+$/.test(keys[i + 1]!) ? [null, null] : {};
    cur = cur[k] as Record<string, unknown>;
  });
  cur[keys[keys.length - 1]!] = value;
  return root as T;
}

function FieldInput({
  def,
  fields,
  missing,
  onChange,
}: {
  def: FieldDef;
  fields: InvoiceFields;
  missing: boolean;
  onChange: (path: string, value: unknown) => void;
}) {
  const raw = getPath(fields, def.path);
  const value = raw === null || raw === undefined ? '' : String(raw);
  return (
    <label className="en-inv-field" data-missing={missing || undefined}>
      <span>
        {def.label}
        {def.unit && <small> ({def.unit})</small>}
      </span>
      <input
        type={def.kind === 'date' ? 'date' : 'text'}
        inputMode={def.kind === 'number' ? 'decimal' : undefined}
        value={value}
        data-testid={`energy-invoice-field-${def.path}`}
        onChange={(e) => {
          const v = e.target.value;
          if (def.kind !== 'number') return onChange(def.path, v || null);
          const n = Number(v.replace(/\s/g, '').replace(',', '.'));
          onChange(def.path, v === '' ? null : Number.isFinite(n) ? n : v);
        }}
      />
    </label>
  );
}

function EditSheet({
  invoice,
  onClose,
  onSave,
}: {
  invoice: Invoice;
  onClose: () => void;
  onSave: (fields: InvoiceFields) => Promise<void>;
}) {
  const [fields, setFields] = useState<InvoiceFields>(invoice.fields);
  const [busy, setBusy] = useState(false);
  const missing = new Set(invoice.missing);
  const isMissing = (path: string) =>
    missing.has(path.split('.')[0]!) && getPath(fields, path) == null;
  const change = (path: string, value: unknown) => setFields((f) => setPath(f, path, value));
  const note =
    invoice.kind === 'image'
      ? 'Fotku jsme uložili. Text z fotek zatím nečteme – vyplňte hlavní údaje ručně.'
      : invoice.warnings.includes('no_text_layer')
        ? 'PDF nemá textovou vrstvu (sken). Vyplňte hlavní údaje ručně.'
        : invoice.parser === 'generic'
          ? 'Dodavatele neznáme – načetli jsme jen základní údaje. Zkontrolujte je.'
          : 'Údaje jsme načetli z faktury. Zkontrolujte je a uložte.';
  return (
    <Sheet
      title="Kontrola faktury"
      onClose={onClose}
      width="lg"
      stickyFooter
      data-testid="energy-invoice-edit"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Zavřít
          </Button>
          <Button
            variant="primary"
            loading={busy}
            data-testid="energy-invoice-save"
            onClick={async () => {
              setBusy(true);
              try {
                await onSave(fields);
              } finally {
                setBusy(false);
              }
            }}
          >
            Uložit fakturu
          </Button>
        </>
      }
    >
      <p className="en-inv-note" data-testid="energy-invoice-edit-note">
        {note}
      </p>
      <div className="en-inv-form">
        {MAIN_FIELDS.map((def) => (
          <FieldInput
            key={def.path}
            def={def}
            fields={fields}
            missing={isMissing(def.path)}
            onChange={change}
          />
        ))}
      </div>
      <details className="en-inv-more">
        <summary>Podrobné položky faktury</summary>
        <div className="en-inv-form">
          {DETAIL_FIELDS.map((def) => (
            <FieldInput
              key={def.path}
              def={def}
              fields={fields}
              missing={false}
              onChange={change}
            />
          ))}
        </div>
      </details>
    </Sheet>
  );
}

/* ---------- comparison ---------- */

function Row({
  label,
  invoice,
  measured,
  note,
  tone,
  testId,
}: {
  label: string;
  invoice: ReactNode;
  measured: ReactNode;
  note?: ReactNode;
  tone?: 'ok' | 'warn' | 'muted';
  testId: string;
}) {
  return (
    <div className="en-inv-row" data-testid={testId} data-tone={tone}>
      <span className="en-inv-row-l">{label}</span>
      <span className="en-inv-row-v">{invoice}</span>
      <span className="en-inv-row-v">{measured}</span>
      {note && <span className="en-inv-row-n">{note}</span>}
    </div>
  );
}

function ComparisonView({ cmp, invoice }: { cmp: InvoiceComparison | null; invoice: Invoice }) {
  if (!cmp) return <p className="en-inv-muted">Načítám srovnání…</p>;
  if (cmp.status !== 'ok' || !cmp.grid) {
    const why =
      cmp.status === 'no_period'
        ? 'Doplňte období faktury, pak ji porovnáme s měřením.'
        : 'Měření z Home Assistantu není k dispozici (chybí vazby nebo recorder).';
    return <p className="en-inv-muted">{why}</p>;
  }
  const g = cmp.grid;
  const gridNote =
    g.status === 'missing'
      ? g.measured_since
        ? `HA měří nákup od ${formatDateCs(g.measured_since)}`
        : 'HA za toto období nákup neměřil'
      : g.status === 'ok'
        ? `Sedí (${formatPct(g.pct)})`
        : `Rozdíl ${formatPct(g.pct)} – zkontrolujte odečty`;
  const self = cmp.self_consumption;
  const cost = cmp.cost;
  return (
    <div className="en-inv-cmp" data-testid="energy-invoice-compare">
      <div className="en-inv-row en-inv-row--head" aria-hidden="true">
        <span />
        <span>Faktura</span>
        <span>Home Assistant</span>
      </div>
      <Row
        label="Nákup ze sítě"
        invoice={formatKwh(g.invoice)}
        measured={g.measured === null ? '–' : formatKwh(g.measured)}
        note={gridNote}
        tone={g.status === 'ok' ? 'ok' : g.status === 'diff' ? 'warn' : 'muted'}
        testId="energy-invoice-grid"
      />
      <Row
        label="Náklady"
        invoice={formatKc(cost?.invoice ?? null)}
        measured={cost?.estimate == null ? '–' : `≈ ${formatKc(cost.estimate)}`}
        note={
          cost?.estimate == null
            ? 'Odhad HomeBrainu potřebuje měřený nákup.'
            : `Odhad podle dnešního tarifu ${formatPct(cost.pct)}`
        }
        tone={cost?.estimate == null ? 'muted' : undefined}
        testId="energy-invoice-cost"
      />
      <Row
        label="Spotřeba domu"
        invoice=""
        measured={formatKwh(cmp.house)}
        testId="energy-invoice-house"
      />
      <Row label="Výroba FVE" invoice="–" measured={formatKwh(cmp.pv)} testId="energy-invoice-pv" />
      {self && (
        <p className="en-inv-explain" data-testid="energy-invoice-self">
          Z FVE a baterie dům pokryl přibližně <b>{formatKwh(self.kwh)}</b>
          {self.basis === 'house_minus_invoice'
            ? ' (spotřeba domu − nákup podle faktury; prodej do sítě neznáme).'
            : ' (spotřeba domu − měřený nákup).'}
        </p>
      )}
      {invoice.fields.poze_waived_czk ? (
        <p className="en-inv-explain">
          Stát odpustil POZE {formatKc(invoice.fields.poze_waived_czk, 2)} – už je v ceně.
        </p>
      ) : null}
    </div>
  );
}

function TariffView({
  cmp,
  canEdit,
  onApply,
}: {
  cmp: InvoiceComparison | null;
  canEdit: boolean;
  onApply: () => void;
}) {
  const check = cmp?.tariff;
  if (!check || !Object.keys(check.items).length) return null;
  const updatable = tariffUpdateCalls(check).length > 0;
  return (
    <div
      className="en-inv-tariff"
      data-testid="energy-invoice-tariff"
      data-mismatch={check.mismatch || undefined}
    >
      <h3 className="en-lbl">Tarif v HomeBrainu</h3>
      {(['vt', 'nt', 'fixed_monthly'] as TariffKey[]).map((key) => {
        const item = check.items[key];
        if (!item) return null;
        const unit = TARIFF_LABELS[key].unit;
        const fmt = (v: number) => `${formatKc(v, 2).replace(/Kč$/, unit)}`;
        return (
          <div className="en-inv-trow" key={key} data-differs={item.differs || undefined}>
            <span>{TARIFF_LABELS[key].label}</span>
            <span>
              faktura <b>{fmt(item.invoice)}</b>
            </span>
            <span>
              HomeBrain <b>{item.current === null ? '–' : fmt(item.current)}</b>
            </span>
          </div>
        );
      })}
      <p className="en-inv-explain">
        {check.mismatch
          ? 'Ceny v HomeBrainu se liší od faktury (ceny s DPH vč. distribuce, bez stálých plateb).'
          : 'Ceny v HomeBrainu odpovídají faktuře.'}
      </p>
      {check.mismatch && canEdit && updatable && (
        <Button
          variant="secondary"
          size="sm"
          onClick={onApply}
          data-testid="energy-invoice-apply-tariff"
        >
          Přepsat ceny podle faktury
        </Button>
      )}
    </div>
  );
}

/* ---------- card ---------- */

export function InvoicesCard({
  connection,
  fetchWithAuth,
  kiosk = false,
  now,
}: {
  connection?: ConnectionLike;
  fetchWithAuth?: FetchWithAuth;
  kiosk?: boolean;
  now: number;
}) {
  const [list, setList] = useState<InvoiceList | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [cmpState, setCmp] = useState<{ key: string; value: InvoiceComparison } | null>(null);
  const [editing, setEditing] = useState<Invoice | null>(null);
  const [confirm, setConfirm] = useState<'tariff' | 'delete' | null>(null);
  const [uploading, setUploading] = useState(false);
  const [version, setVersion] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    const next = await fetchInvoices(connection);
    setList(next);
    setVersion((v) => v + 1);
    return next;
  }, [connection]);
  useEffect(() => {
    if (kiosk) return;
    let alive = true;
    void fetchInvoices(connection).then((next) => alive && setList(next));
    return () => {
      alive = false;
    };
  }, [connection, kiosk]);
  const current = list?.invoices.find((i) => i.id === selected) ?? list?.invoices[0] ?? null;
  const currentId = current?.id ?? null;
  const currentStatus = current?.status;
  const cmpKey = `${currentId}:${currentStatus}:${version}`;
  useEffect(() => {
    if (!connection || !currentId) return;
    let alive = true;
    fetchInvoiceComparison(connection, currentId).then(
      (value) => alive && setCmp({ key: cmpKey, value }),
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, [connection, currentId, cmpKey]);
  const cmp = cmpState?.key === cmpKey ? cmpState.value : null;

  if (kiosk || !list || !connection) return null;
  const canEdit = list.can_edit && !!fetchWithAuth;
  const notice = canEdit ? contractNotice(latestContractEnd(list.invoices), now) : null;

  const onFile = async (file: File | undefined) => {
    if (!file || !fetchWithAuth) return;
    setUploading(true);
    try {
      const invoice = await uploadInvoice(fetchWithAuth, file);
      await reload();
      setSelected(invoice.id);
      setEditing(invoice);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <section
      className="en-card en-invoices"
      data-testid="energy-invoices"
      aria-labelledby="en-inv-title"
    >
      <header className="en-cost-head">
        <div>
          <h2 className="en-ct" id="en-inv-title">
            Faktury za elektřinu
          </h2>
          <p className="en-inv-muted">Kontrola vyúčtování proti měření Home Assistantu.</p>
        </div>
        {canEdit && (
          <>
            <input
              ref={fileRef}
              type="file"
              hidden
              accept="application/pdf,image/jpeg,image/png,image/heic,image/webp"
              data-testid="energy-invoice-file"
              onChange={(e) => void onFile(e.target.files?.[0])}
            />
            <Button
              variant="secondary"
              size="sm"
              loading={uploading}
              onClick={() => fileRef.current?.click()}
              data-testid="energy-invoice-upload"
            >
              Nahrát fakturu
            </Button>
          </>
        )}
      </header>
      {notice && (
        <p className="en-inv-notice" role="status" data-testid="energy-invoice-contract">
          {notice}
        </p>
      )}
      {list.invoices.length === 0 ? (
        <p className="en-inv-muted" data-testid="energy-invoices-empty">
          {canEdit
            ? 'Nahrajte PDF vyúčtování (do 5 MB). Fotku uložíme a údaje doplníte ručně.'
            : 'Zatím žádné faktury.'}
        </p>
      ) : (
        <>
          <div className="en-inv-list" role="tablist" aria-label="Faktury">
            {list.invoices.map((inv) => (
              <button
                key={inv.id}
                type="button"
                role="tab"
                className="en-inv-chip"
                aria-selected={inv.id === currentId}
                data-testid="energy-invoice-item"
                onClick={() => setSelected(inv.id)}
              >
                <b>{periodLabel(inv.fields.period)}</b>
                <span>
                  {formatKc(inv.fields.total_incl_vat)}
                  {inv.status === 'draft' && <em className="en-inv-draft"> · ke kontrole</em>}
                </span>
              </button>
            ))}
          </div>
          {current && (
            <div className="en-inv-body">
              <div className="en-inv-main">
                <p className="en-inv-sum" data-testid="energy-invoice-summary">
                  <b>{formatKc(current.fields.total_incl_vat, 2)}</b>
                  <span>
                    {formatKwh(current.fields.kwh?.total)} ·{' '}
                    {current.fields.supplier ?? 'dodavatel neznámý'}
                    {current.fields.rate ? ` · ${current.fields.rate}` : ''}
                  </span>
                </p>
                <ComparisonView cmp={cmp} invoice={current} />
              </div>
              <div className="en-inv-side">
                <TariffView cmp={cmp} canEdit={canEdit} onApply={() => setConfirm('tariff')} />
                {canEdit && (
                  <div className="en-inv-actions">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditing(current)}
                      data-testid="energy-invoice-edit-open"
                    >
                      Upravit údaje
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => setConfirm('delete')}>
                      Smazat
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
      {editing && (
        <EditSheet
          invoice={editing}
          onClose={() => setEditing(null)}
          onSave={async (fields) => {
            try {
              await saveInvoice(connection, editing.id, fields);
              setEditing(null);
              await reload();
              toast.success('Faktura uložena.');
            } catch {
              toast.error('Fakturu se nepodařilo uložit – zkontrolujte čísla a data.');
            }
          }}
        />
      )}
      {confirm === 'tariff' && cmp && (
        <ConfirmDialog
          title="Přepsat ceny podle faktury?"
          confirmLabel="Přepsat ceny"
          confirmTestId="energy-invoice-tariff-confirm-ok"
          data-testid="energy-invoice-tariff-confirm"
          errorText="Ceny se nepodařilo přepsat. Zkuste to znovu."
          onClose={() => setConfirm(null)}
          onConfirm={async () => {
            for (const call of tariffUpdateCalls(cmp.tariff))
              await connection.sendMessagePromise(call);
            toast.success('Ceny v HomeBrainu odpovídají faktuře.');
            await reload();
          }}
        >
          Nastavíme pomocníky tarifu v Home Assistantu na průměrné ceny z faktury (s DPH). Odhady
          nákladů v Energii se pak počítají podle nich.
        </ConfirmDialog>
      )}
      {confirm === 'delete' && current && (
        <ConfirmDialog
          title="Smazat fakturu?"
          confirmLabel="Smazat"
          danger
          onClose={() => setConfirm(null)}
          onConfirm={async () => {
            await deleteInvoice(connection, current.id);
            setSelected(null);
            await reload();
          }}
        >
          Smažeme uložený soubor i načtené údaje za {periodLabel(current.fields.period)}.
        </ConfirmDialog>
      )}
    </section>
  );
}

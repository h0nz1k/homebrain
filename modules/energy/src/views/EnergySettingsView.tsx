import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import type { ConnectionLike } from '@homebrain/ha-client';
import {
  Button,
  Callout,
  ErrorState,
  Icon,
  ListCell,
  Pill,
  Quantity,
  RangeStepper,
  Sheet,
  Skeleton,
  formatQuantity,
  nbspUnits,
  toast,
  type IconName,
} from '@homebrain/ui';
import {
  getEnergySettings,
  setEnergySetting,
  type EnergySetting,
  type EnergySettings,
} from '../settings.js';
import { inverterStatusChip } from '../adapter.js';
import { fetchPvForecast, type PvForecast } from '../pvForecast.js';
import { CompassGlyph, ExportLimitBars, PvForecastHero, TiltGlyph } from './settingsVisuals.js';

/** Section, icon and tint (energy palette, so the tile matches the overview's colours). */
const sections: [string, IconName, string][] = [
  ['Fotovoltaika', 'sun', 'var(--hb-energy-pv)'],
  ['Baterie', 'battery', 'var(--hb-energy-battery)'],
  ['Síť', 'grid', 'var(--hb-energy-grid)'],
  ['Tarif a ceny', 'tariff', 'var(--hb-ok)'],
  ['Střídač', 'inverter', 'var(--hb-energy-home)'],
];
/** Recommended band drawn on the slider in the edit sheet. */
const BANDS: Record<string, [number, number, string]> = {
  energy_battery_dod_ongrid: [10, 30, 'běžně'],
  pv_tilt: [25, 45, 'šikmá střecha'],
  pv_azimuth: [-45, 45, 'nejvíc výroby'],
  energy_main_breaker: [16, 32, 'běžně'],
};
/** Rows whose write goes to the inverter: one extra confirm step inside the sheet. */
const INVERTER_WRITES = new Set(['energy_battery_dod_ongrid']);
const MODES: Record<string, string> = {
  general: 'Obecný',
  normal: 'Normální',
  eco: 'Ekonomický',
  backup: 'Záložní',
  off_grid: 'Ostrovní',
  peak_shaving: 'Omezení špiček',
  auto: 'Automatický',
  charge: 'Nabíjení',
  discharge: 'Vybíjení',
  standby: 'Pohotovost',
};
const DIRECTIONS = [
  'jih',
  'jihozápad',
  'západ',
  'severozápad',
  'sever',
  'severovýchod',
  'východ',
  'jihovýchod',
];
/** Read-only rows: where the value is changed instead. */
const whereText = (row: EnergySetting) =>
  row.source === 'Správce'
    ? 'Mění jen správce v HomeBrainu.'
    : row.location
      ? `Mění se ${row.location}.`
      : undefined;
const direction = (az: number) => DIRECTIONS[((Math.round(az / 45) % 8) + 8) % 8]!;

/** Plain-text value (aria labels, confirm titles). */
function displayText(row: EnergySetting): string {
  if (row.value === null) return row.binding ? 'nepřipojeno' : 'nenastaveno';
  if (row.key === 'energy_inverter_status') return inverterStatusChip(String(row.value)).label;
  if (row.key === 'energy_inverter_mode' || row.key === 'energy_ems_mode')
    return MODES[String(row.value).toLowerCase()] ?? String(row.value);
  if (row.key === 'energy_tariff_next_change') {
    const time = Date.parse(String(row.value));
    return Number.isFinite(time)
      ? new Intl.DateTimeFormat('cs-CZ', {
          dateStyle: 'short',
          timeStyle: 'short',
          timeZone: 'Europe/Prague',
        }).format(time)
      : String(row.value);
  }
  if (row.key === 'pv_azimuth')
    return `${direction(Number(row.value))} (${formatQuantity(Number(row.value), '°')})`;
  if (row.value === 'on') return row.key === 'energy_tariff_hdo' ? 'Nízký tarif' : 'Zapnuto';
  if (row.value === 'off') return row.key === 'energy_tariff_hdo' ? 'Vysoký tarif' : 'Vypnuto';
  const numeric = Number(row.value);
  return Number.isFinite(numeric)
    ? formatQuantity(numeric, row.unit)
    : nbspUnits(`${row.value} ${row.unit}`.trim());
}
/** Rich value: number in tabular figures with a lighter unit. */
function DisplayValue({ row }: { row: EnergySetting }) {
  const numeric = Number(row.value);
  if (row.key === 'pv_azimuth' && Number.isFinite(numeric))
    return (
      <span>
        {direction(numeric)}{' '}
        <small className="en-value-aside">{formatQuantity(numeric, '°')}</small>
      </span>
    );
  if (
    row.value !== null &&
    row.value !== '' &&
    Number.isFinite(numeric) &&
    typeof row.value !== 'boolean'
  )
    return <Quantity value={numeric} unit={row.unit} />;
  return <>{displayText(row)}</>;
}
function visualFor(row: EnergySetting): ReactNode {
  const v = Number(row.value);
  if (row.value === null || !Number.isFinite(v)) return null;
  if (row.key === 'pv_tilt') return <TiltGlyph deg={v} />;
  if (row.key === 'pv_azimuth') return <CompassGlyph azimuth={v} />;
  return null;
}
/** Watts the inverter really lets out vs. the forecast model limit; null when comparable. */
function exportMismatch(rows: EnergySetting[]) {
  const inverter = Number(rows.find((r) => r.key === 'energy_export_limit')?.value);
  const forecastKw = Number(rows.find((r) => r.key === 'export_limit_kw')?.value);
  if (!Number.isFinite(inverter) || !(forecastKw > 0)) return null;
  const model = forecastKw * 1000;
  if (inverter >= model / 10 && inverter <= model * 10) return null;
  return { inverterW: inverter, forecastKw };
}

type Pending = { row: EnergySetting; draft: number; step: 'edit' | 'confirm' };

function SettingSheet({
  pending,
  capacity,
  onDraft,
  onStep,
  onClose,
  onSave,
}: {
  pending: Pending;
  capacity: number;
  onDraft: (value: number) => void;
  onStep: (step: Pending['step']) => void;
  onClose: () => void;
  onSave: () => Promise<void>;
}) {
  const { row, draft, step } = pending;
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const band = BANDS[row.key];
  const editable = row.editable && row.min != null && row.max != null && row.step != null;
  const valid =
    Number.isFinite(draft) &&
    row.min != null &&
    row.max != null &&
    draft >= row.min &&
    draft <= row.max;
  const changed = draft !== Number(row.value);
  const save = async () => {
    setBusy(true);
    setFailed(false);
    try {
      await onSave();
    } catch {
      setFailed(true);
      setBusy(false);
    }
  };
  const next = formatQuantity(draft, row.unit);
  // The inverter's own parameter name gets its own line under the explanation.
  const [text = row.explanation, inverter] = row.explanation.split(/ (?=Ve střídači odpovídá)/);
  const delta = draft - Number(row.value);
  const reserve = row.key === 'energy_battery_dod_ongrid';
  const confirmTitle = reserve
    ? `Změnit rezervu baterie z ${displayText(row)} na ${next}?`
    : row.key === 'export_limit_kw'
      ? `Použít ${next} i pro předpověď?`
      : `Změnit ${row.label.toLowerCase()} z ${displayText(row)} na ${next}?`;
  const error = failed && (
    <p className="en-sheet-error" role="alert">
      Nepodařilo se uložit – zkuste to znovu
    </p>
  );
  if (step === 'confirm')
    return (
      <Sheet
        title={nbspUnits(confirmTitle)}
        appearance="raised"
        placement="center"
        closeLabel="Zavřít"
        onClose={onClose}
        footer={
          <>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => (INVERTER_WRITES.has(row.key) ? onStep('edit') : onClose())}
            >
              Zpět
            </Button>
            <Button variant="primary" loading={busy} onClick={() => void save()}>
              Potvrdit změnu
            </Button>
          </>
        }
      >
        <div className="en-sheet-change" aria-hidden="true">
          <span>{displayText(row)}</span>
          <Icon name="arrow" size={26} />
          <strong>{next}</strong>
        </div>
        {reserve ? (
          <>
            <p>
              {capacity > 0
                ? `V noci se z baterie odebere přibližně o ${formatQuantity((Math.abs(delta) * capacity) / 100, 'kWh')} ${delta > 0 ? 'míň' : 'víc'}.`
                : 'Kapacita baterie není nastavena, změnu v kWh nelze určit.'}
            </p>
            <Callout icon="inverter" title="Zápis do střídače">
              {nbspUnits(
                `Nová hodnota se uloží do střídače jako „Maximum vybití“ ${formatQuantity(100 - draft, '%')}.`,
              )}
            </Callout>
          </>
        ) : (
          <p>
            {nbspUnits(
              `Předpověď výroby a prodeje přestane počítat s přetokem nad ${next}. Nastavení střídače se nemění.`,
            )}
          </p>
        )}
        {error}
      </Sheet>
    );
  return (
    <Sheet
      title={row.label}
      appearance="raised"
      placement="center"
      closeLabel="Zavřít"
      onClose={onClose}
      footer={
        editable ? (
          <>
            <Button variant="ghost" onClick={onClose} disabled={busy}>
              Zrušit
            </Button>
            <Button
              variant="primary"
              loading={busy}
              disabled={!valid || !changed}
              onClick={() => (INVERTER_WRITES.has(row.key) ? onStep('confirm') : void save())}
            >
              {INVERTER_WRITES.has(row.key) ? 'Pokračovat' : 'Uložit'}
            </Button>
          </>
        ) : (
          <Button variant="secondary" onClick={onClose}>
            Zavřít
          </Button>
        )
      }
    >
      <p className="en-sheet-lead">{nbspUnits(row.summary)}</p>
      <div className="en-sheet-now">
        <span>{editable ? 'Teď' : 'Hodnota'}</span>
        <strong>
          <DisplayValue row={row} />
        </strong>
      </div>
      {editable && (
        <RangeStepper
          label={`${row.label}: nová hodnota`}
          value={draft}
          onChange={onDraft}
          min={row.min!}
          max={row.max!}
          step={row.step!}
          unit={row.unit}
          band={band ? [band[0], band[1]] : undefined}
          bandLabel={band?.[2]}
        />
      )}
      <p className="en-sheet-text">{nbspUnits(text)}</p>
      {inverter && (
        <p className="en-sheet-where">
          <Icon name="inverter" size={18} />
          {nbspUnits(inverter)}
        </p>
      )}
      {!row.editable && whereText(row) && (
        <p className="en-sheet-where">
          <Icon name="lock" size={18} />
          {whereText(row)}
        </p>
      )}
      {row.value === null && row.binding && (
        <p className="en-sheet-where">
          <Icon name="info" size={18} />
          <span>
            Nastavte vazbu <code>{row.binding}</code> v integraci HomeBrain.
          </span>
        </p>
      )}
      {error}
    </Sheet>
  );
}

export function EnergySettingsView({ connection }: { connection?: ConnectionLike }) {
  const [data, setData] = useState<EnergySettings | null>(null);
  const [failed, setFailed] = useState(false);
  const [pv, setPv] = useState<PvForecast | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  useEffect(() => {
    let active = true;
    if (!connection) return;
    void getEnergySettings(connection)
      .then((next) => {
        if (active) setData(next);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    void fetchPvForecast(connection).then((next) => {
      if (active) setPv(next);
    });
    return () => {
      active = false;
    };
  }, [connection]);
  const capacity = Number(data?.rows.find((r) => r.key === 'battery_capacity_kwh')?.value);
  const mismatch = data ? exportMismatch(data.rows) : null;
  const forecastLimit = data?.rows.find((r) => r.key === 'export_limit_kw');
  const open = (row: EnergySetting) =>
    setPending({ row, draft: Number(row.value ?? row.min ?? 0), step: 'edit' });
  const anyLocked = data?.rows.some((r) => !r.editable);
  if (failed || !connection)
    return (
      <div className="en-root en-settings">
        <ErrorState title="Nastavení se nepodařilo načíst" />
      </div>
    );
  if (!data)
    return (
      <div className="en-root en-settings">
        <Skeleton />
      </div>
    );
  const applyLimit =
    mismatch && forecastLimit?.editable && forecastLimit.min != null && forecastLimit.step
      ? Math.max(
          forecastLimit.min,
          Math.round(mismatch.inverterW / 1000 / forecastLimit.step) * forecastLimit.step,
        )
      : null;
  return (
    <div className="en-root en-settings">
      <div className="en-settings-grid">
        {sections.map(([section, icon, tint]) => {
          const rows = data.rows.filter((row) => row.section === section);
          if (!rows.length) return null;
          return (
            <section
              className="en-settings-section"
              key={section}
              aria-labelledby={`en-sec-${icon}`}
              style={{ '--en-tint': tint } as CSSProperties}
            >
              <header>
                <span className="en-section-icon">
                  <Icon name={icon} size={20} />
                </span>
                <h2 id={`en-sec-${icon}`}>{section}</h2>
              </header>
              {section === 'Fotovoltaika' && <PvForecastHero pv={pv} />}
              {section === 'Síť' && mismatch && (
                <Callout
                  tone="warn"
                  title="Limity přetoku se neshodují"
                  action={
                    applyLimit !== null && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          setPending({
                            row: forecastLimit!,
                            draft: Number(applyLimit.toFixed(2)),
                            step: 'confirm',
                          })
                        }
                      >
                        {nbspUnits(`Použít ${formatQuantity(applyLimit, 'kW')} i pro předpověď`)}
                      </Button>
                    )
                  }
                >
                  {nbspUnits(
                    `Střídač pustí do sítě nejvýš ${formatQuantity(mismatch.inverterW, 'W')}, předpověď ale počítá s ${formatQuantity(mismatch.forecastKw, 'kW')}.`,
                  )}
                </Callout>
              )}
              <div className="en-cells">
                {rows.map((row) => (
                  <ListCell
                    key={row.key}
                    data-key={row.key}
                    label={row.label}
                    badge={
                      row.assumed && (
                        <Pill tone="warn" size="sm" className="en-estimate">
                          odhad
                        </Pill>
                      )
                    }
                    description={nbspUnits(row.summary)}
                    value={<DisplayValue row={row} />}
                    visual={visualFor(row)}
                    muted={row.value === null}
                    trailing={row.editable ? 'chevron' : 'lock'}
                    lockLabel={whereText(row)}
                    aria-label={`${row.label}: ${displayText(row)}${row.editable ? '' : ', jen pro čtení'}`}
                    onClick={() => open(row)}
                  >
                    {row.key === 'energy_export_limit' && mismatch && (
                      <ExportLimitBars
                        inverterW={mismatch.inverterW}
                        forecastKw={mismatch.forecastKw}
                      />
                    )}
                  </ListCell>
                ))}
              </div>
            </section>
          );
        })}
      </div>
      {anyLocked && (
        <p className="en-settings-foot">
          <Icon name="lock" size={14} />
          Upravovat může jen správce. Hodnoty se zámkem se mění v aplikaci SolarGo nebo v Home
          Assistantu.
        </p>
      )}
      {pending && (
        <SettingSheet
          key={`${pending.row.key}:${pending.step}`}
          pending={pending}
          capacity={capacity}
          onDraft={(draft) => setPending((p) => p && { ...p, draft })}
          onStep={(step) => setPending((p) => p && { ...p, step })}
          onClose={() => setPending(null)}
          onSave={async () => {
            setData(await setEnergySetting(connection, pending.row.key, pending.draft));
            setPending(null);
            toast.success('Uloženo', { id: 'energy-settings' });
          }}
        />
      )}
    </div>
  );
}

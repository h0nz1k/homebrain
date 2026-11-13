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
  formatPower,
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
import { CompassGlyph, PvForecastStrip, TiltGlyph } from './settingsVisuals.js';

/** Section, icon and tint (energy palette, so the tile matches the overview's colours). */
const sections: [string, IconName, string][] = [
  ['Fotovoltaika', 'sun', 'var(--hb-energy-pv)'],
  ['Baterie', 'battery', 'var(--hb-energy-battery)'],
  ['Síť', 'grid', 'var(--hb-energy-grid)'],
  ['Tarif a ceny', 'tariff', 'var(--hb-ok)'],
  ['Střídač', 'inverter', 'var(--hb-energy-home)'],
];
/** Wide screens: two columns that start with the same header block (forecast strip / warning). */
const COLUMNS = [
  ['Fotovoltaika', 'Baterie'],
  ['Síť', 'Tarif a ceny', 'Střídač'],
];
/** Recommended band drawn on the slider in the edit sheet. */
const BANDS: Record<string, [number, number, string]> = {
  energy_battery_dod_ongrid: [10, 30, 'běžně'],
  pv_tilt: [25, 45, 'šikmá střecha'],
  pv_azimuth: [-45, 45, 'nejvíc výroby'],
  energy_main_breaker: [16, 32, 'běžně'],
};
/** Reserves are shown as 100 − inverter DoD; the sheet repeats the inverter value. */
const reserveKeys = new Set(['energy_battery_dod_ongrid', 'energy_battery_dod_backup']);
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
  'Jih',
  'Jihozápad',
  'Západ',
  'Severozápad',
  'Sever',
  'Severovýchod',
  'Východ',
  'Jihovýchod',
];
/** Síť: the two export limits first (right under the mismatch warning), then export control. */
const ORDER: Record<string, number> = {
  energy_export_limit: -3,
  export_limit_kw: -2,
  energy_export_limit_enabled: -1,
};
/** Assumed values: the sheet asks to check them. */
const VERIFY: Record<string, string> = { pv_tilt: 'Ověřit sklon', pv_azimuth: 'Ověřit orientaci' };
/** Short visible source of a read-only value, next to the row label. */
const SOURCE: Record<string, string> = {
  SolarGo: 'ze střídače',
  'Home Assistant': 'z HA',
  Správce: 'jen správce',
};
/** Read-only rows: where the value is changed instead. */
const whereText = (row: EnergySetting) =>
  row.source === 'Správce'
    ? 'Mění jen správce v HomeBrainu.'
    : row.location
      ? `Mění se ${row.location}.`
      : undefined;
const direction = (az: number) => DIRECTIONS[((Math.round(az / 45) % 8) + 8) % 8]!;
/** One number style everywhere: power as W under 1 kW, otherwise the row's own unit. */
const format = (value: number, unit: string) =>
  unit === 'W' || unit === 'kW' ? formatPower(value, unit) : formatQuantity(value, unit);

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
  if (row.key === 'pv_azimuth') return direction(Number(row.value));
  if (row.value === 'on') return row.key === 'energy_tariff_hdo' ? 'Nízký tarif' : 'Zapnuto';
  if (row.value === 'off') return row.key === 'energy_tariff_hdo' ? 'Vysoký tarif' : 'Vypnuto';
  const numeric = Number(row.value);
  return Number.isFinite(numeric)
    ? format(numeric, row.unit)
    : nbspUnits(`${row.value} ${row.unit}`.trim());
}
/** Rich value: number in tabular figures with a lighter unit; the sheet adds the azimuth angle. */
function DisplayValue({ row, detail }: { row: EnergySetting; detail?: boolean }) {
  const numeric = Number(row.value);
  if (row.key === 'pv_azimuth' && Number.isFinite(numeric))
    return detail ? (
      <span>
        {direction(numeric)} <Quantity value={numeric} unit="°" />
      </span>
    ) : (
      <>{direction(numeric)}</>
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
/** Read-only rows: the row's accessible name says so and where it is changed. */
const ariaName = (row: EnergySetting) =>
  `${row.label}: ${displayText(row)}${row.editable ? '' : `, jen pro čtení${row.source && SOURCE[row.source] ? ` (${SOURCE[row.source]})` : ''}`}`;
/** Callout sentence: both limits in the same units and how far apart they are. */
function mismatchText({ inverterW, forecastKw }: { inverterW: number; forecastKw: number }) {
  const forecast = formatPower(forecastKw, 'kW');
  if (inverterW <= 0) return `Střídač do sítě nepustí nic, předpověď počítá s ${forecast}.`;
  const ratio = (forecastKw * 1000) / inverterW;
  const times = ratio >= 1 ? `${Math.floor(ratio)}× víc` : `${Math.floor(1 / ratio)}× míň`;
  return `Střídač pustí do sítě nejvýše ${formatPower(inverterW)}, předpověď počítá s ${forecast} (${times}).`;
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
  const next = format(draft, row.unit);
  // The inverter's own parameter name gets its own line under the explanation.
  const [text = row.explanation, mapping] = row.explanation.split(/ (?=Ve střídači odpovídá)/);
  // The inverter value follows the draft live: „(teď 90 %, po změně 80 %)“.
  const inverter =
    mapping && changed && reserveKeys.has(row.key) && Number.isFinite(draft)
      ? mapping.replace(/\)\.$/, `, po změně ${formatQuantity(100 - draft, '%')}).`)
      : mapping;
  const delta = draft - Number(row.value);
  const reserve = row.key === 'energy_battery_dod_ongrid';
  // The values are shown big right under the title, so the title names only the change.
  const confirmTitle = reserve
    ? 'Změnit rezervu baterie?'
    : row.key === 'export_limit_kw'
      ? 'Použít limit střídače i pro předpověď?'
      : `Změnit ${row.label.toLowerCase()}?`;
  const verify = row.assumed ? VERIFY[row.key] : undefined;
  const glyph = visualFor(row);
  const error = failed && (
    <p className="en-sheet-error" role="alert">
      Nepodařilo se uložit – zkuste to znovu
    </p>
  );
  if (step === 'confirm')
    return (
      <Sheet
        title={confirmTitle}
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
              disabled={!valid || (!changed && !verify)}
              onClick={() => (INVERTER_WRITES.has(row.key) ? onStep('confirm') : void save())}
            >
              {INVERTER_WRITES.has(row.key)
                ? 'Pokračovat'
                : !changed && verify
                  ? 'Potvrdit'
                  : 'Uložit'}
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
      <div className="en-sheet-now" data-readonly={editable ? undefined : ''}>
        <span>{editable ? 'Teď' : 'Hodnota'}</span>
        {glyph && (
          <span className="en-sheet-glyph" aria-hidden="true">
            {glyph}
          </span>
        )}
        <strong>
          <DisplayValue row={row} detail />
        </strong>
      </div>
      {verify && (
        <Callout title={verify}>
          {editable
            ? 'Hodnota je zatím odhad. Zkontrolujte ji podle projektu elektrárny a uložte, předpověď pak bude přesnější.'
            : 'Hodnota je zatím odhad. Správce ji může zkontrolovat podle projektu elektrárny.'}
        </Callout>
      )}
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
  const order = (row: EnergySetting) => ORDER[row.key] ?? 0;
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
        {COLUMNS.map((names) => (
          <div className="en-settings-col" key={names[0]}>
            {sections
              .filter(([name]) => names.includes(name))
              .map(([section, icon, tint]) => {
                const rows = data.rows
                  .filter((row) => row.section === section)
                  .sort((a, b) => order(a) - order(b));
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
                    {section === 'Fotovoltaika' && <PvForecastStrip pv={pv} />}
                    {section === 'Síť' && mismatch && (
                      <Callout
                        tone="warn"
                        title="Limity přetoku se neshodují"
                        action={
                          applyLimit !== null && (
                            <Button
                              variant="secondary"
                              onClick={() =>
                                setPending({
                                  row: forecastLimit!,
                                  draft: Number(applyLimit.toFixed(2)),
                                  step: 'confirm',
                                })
                              }
                            >
                              {nbspUnits(`Použít ${formatPower(applyLimit, 'kW')} i pro předpověď`)}
                            </Button>
                          )
                        }
                      >
                        {nbspUnits(mismatchText(mismatch))}{' '}
                        {nbspUnits(
                          'Platí limit střídače: HomeBrain ho čte přímo ze střídače a tady ho změnit nejde.',
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
                              <Pill tone="accent" size="sm" className="en-estimate">
                                odhad
                              </Pill>
                            )
                          }
                          value={<DisplayValue row={row} />}
                          muted={row.value === null}
                          trailing={row.editable ? 'chevron' : 'lock'}
                          lockLabel={whereText(row) ?? 'Jen pro čtení'}
                          lockText={row.editable ? undefined : SOURCE[row.source ?? '']}
                          aria-label={ariaName(row)}
                          onClick={() => open(row)}
                        />
                      ))}
                    </div>
                  </section>
                );
              })}
          </div>
        ))}
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

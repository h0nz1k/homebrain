import { useEffect, useState } from 'react';
import type { ConnectionLike } from '@homebrain/ha-client';
import {
  Button,
  ConfirmDialog,
  ErrorState,
  Icon,
  InfoTip,
  Pill,
  Skeleton,
  Stat,
  formatQuantity,
  nbspUnits,
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

const sections: [string, IconName][] = [
  ['Fotovoltaika', 'sun'],
  ['Baterie', 'battery'],
  ['Síť', 'grid'],
  ['Tarif a ceny', 'tariff'],
  ['Střídač', 'inverter'],
];
function display(row: EnergySetting) {
  if (row.value === null) return row.binding ? 'nepřipojeno' : 'nenastaveno';
  if (row.key === 'energy_inverter_status') return inverterStatusChip(String(row.value)).label;
  if (row.key === 'energy_inverter_mode' || row.key === 'energy_ems_mode') {
    const names: Record<string, string> = {
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
    return names[String(row.value).toLowerCase()] ?? String(row.value);
  }
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
  if (row.key === 'pv_azimuth') {
    const v = Number(row.value);
    const direction = [
      'jih',
      'jihozápad',
      'západ',
      'severozápad',
      'sever',
      'severovýchod',
      'východ',
      'jihovýchod',
    ][((Math.round(v / 45) % 8) + 8) % 8];
    return `${formatQuantity(v, '°')} · ${direction}`;
  }
  if (row.value === 'on') return row.key === 'energy_tariff_hdo' ? 'Nízký tarif' : 'Zapnuto';
  if (row.value === 'off') return row.key === 'energy_tariff_hdo' ? 'Vysoký tarif' : 'Vypnuto';
  const numeric = Number(row.value);
  return Number.isFinite(numeric)
    ? formatQuantity(numeric, row.unit)
    : nbspUnits(`${row.value} ${row.unit}`.trim());
}
/** Watts the inverter really lets out vs. the forecast model limit; null when comparable. */
function exportLimitHint(rows: EnergySetting[]) {
  const inverter = Number(rows.find((r) => r.key === 'energy_export_limit')?.value);
  const model = Number(rows.find((r) => r.key === 'export_limit_kw')?.value) * 1000;
  if (!Number.isFinite(inverter) || !(model > 0)) return null;
  if (inverter >= model / 10 && inverter <= model * 10) return null;
  return nbspUnits(
    `Střídač pustí do sítě nejvýš ${formatQuantity(inverter, 'W')}, předpověď počítá ` +
      `s ${formatQuantity(model / 1000, 'kW')}. Velmi nízký limit ve střídači bývá záměrný ` +
      '(dodávka do sítě není sjednaná). Pokud ano, nastavte stejný limit i pro předpověď.',
  );
}
function SettingRow({
  row,
  hint,
  onEdit,
}: {
  row: EnergySetting;
  hint?: string | null;
  onEdit: (row: EnergySetting, value: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(row.value ?? ''));
  const where = !row.editable && row.location ? `Mění se ${row.location}.` : null;
  return (
    <div className="en-setting" data-muted={row.value === null || undefined}>
      <div className="en-setting-copy">
        <h3>
          {row.label}
          {row.assumed && (
            <Pill tone="warn" size="sm" className="en-estimate">
              odhad
            </Pill>
          )}
        </h3>
        <p>{nbspUnits(row.summary)}</p>
        {row.value === null && row.binding && (
          <small>
            Nastavte vazbu <code>{row.binding}</code> v integraci HomeBrain.
          </small>
        )}
      </div>
      <strong className="en-setting-value">{display(row)}</strong>
      <InfoTip label={row.label}>
        {nbspUnits(row.explanation)}
        {where && <span className="en-tip-where">{where}</span>}
      </InfoTip>
      <div className="en-setting-action">
        {row.editable
          ? !editing && (
              <Button
                variant="ghost"
                size="sm"
                className="en-edit"
                aria-label={`Upravit: ${row.label}`}
                onClick={() => setEditing(true)}
              >
                Upravit
                <Icon name="chevron" size={16} />
              </Button>
            )
          : row.source && (
              <Pill
                size="sm"
                icon={<Icon name="lock" size={14} />}
                className="en-source"
                title={where ?? undefined}
                aria-label={where ?? undefined}
              >
                {row.source}
              </Pill>
            )}
      </div>
      {hint && <p className="en-setting-hint">{hint}</p>}
      {row.editable && editing && (
        <form
          className="en-setting-editor"
          onSubmit={(e) => {
            e.preventDefault();
            onEdit(row, Number(draft));
          }}
        >
          <label>
            <span className="hb-visually-hidden">{row.label}: nová hodnota</span>
            <input
              aria-label={`${row.label}: nová hodnota`}
              type="number"
              required
              min={row.min ?? undefined}
              max={row.max ?? undefined}
              step={row.step ?? undefined}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              autoFocus
            />
          </label>
          <span>{row.unit}</span>
          {row.min != null && row.max != null && (
            <span className="en-setting-range">
              {formatQuantity(row.min)}–{formatQuantity(row.max, row.unit)}
            </span>
          )}
          <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
            Zrušit
          </Button>
          <Button
            type="submit"
            size="sm"
            variant="primary"
            disabled={draft === '' || Number(draft) === Number(row.value)}
          >
            Pokračovat
          </Button>
        </form>
      )}
    </div>
  );
}
export function EnergySettingsView({ connection }: { connection?: ConnectionLike }) {
  const [data, setData] = useState<EnergySettings | null>(null);
  const [failed, setFailed] = useState(false);
  const [pv, setPv] = useState<PvForecast | null>(null);
  const [pending, setPending] = useState<{ row: EnergySetting; value: number } | null>(null);
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
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowKey = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Prague' }).format(
    tomorrow,
  );
  const tomorrowKwh = pv?.days[tomorrowKey];
  const capacity = Number(data?.rows.find((r) => r.key === 'battery_capacity_kwh')?.value);
  const exportHint = data ? exportLimitHint(data.rows) : null;
  const delta = pending ? pending.value - Number(pending.row.value) : 0;
  return (
    <div className="en-root en-settings">
      <header className="en-settings-heading">
        <span className="en-settings-eyebrow">ENERGIE · KONFIGURACE</span>
        <h1>Nastavení energie</h1>
        <p>Vše podstatné o vaší elektrárně. Srozumitelně, na jednom místě.</p>
      </header>
      {failed || !connection ? (
        <ErrorState title="Nastavení se nepodařilo načíst" />
      ) : !data ? (
        <Skeleton />
      ) : (
        <>
          <div className="en-settings-note">
            Změny předpovědi upravují výpočty. Parametry střídače a baterie mění pouze správce v
            povoleném rozsahu.
          </div>
          <div className="en-settings-grid">
            {sections.map(([section, icon]) => (
              <section className="en-card en-settings-section" key={section}>
                <header>
                  <span className="en-section-icon">
                    <Icon name={icon} size={20} />
                  </span>
                  <h2>{section}</h2>
                </header>
                {section === 'Fotovoltaika' && tomorrowKwh !== undefined && (
                  <div className="en-forecast">
                    <Stat
                      label="Zítřejší předpověď výroby"
                      value={formatQuantity(tomorrowKwh, 'kWh')}
                    />
                    <p>
                      Když se výrazně liší od skutečnosti, zkontrolujte výkon a orientaci panelů.
                    </p>
                  </div>
                )}
                {data.rows
                  .filter((row) => row.section === section)
                  .map((row) => (
                    <SettingRow
                      key={`${row.key}:${row.value}`}
                      row={row}
                      hint={row.key === 'energy_export_limit' ? exportHint : null}
                      onEdit={(r, value) => setPending({ row: r, value })}
                    />
                  ))}
              </section>
            ))}
          </div>
        </>
      )}
      {pending && connection && (
        <ConfirmDialog
          title={`Změnit: ${pending.row.label}?`}
          confirmLabel="Potvrdit změnu"
          onClose={() => setPending(null)}
          onConfirm={async () => {
            setData(await setEnergySetting(connection, pending.row.key, pending.value));
          }}
        >
          <p className="en-confirm-change">
            <span>{display(pending.row)}</span>
            <Icon name="chevron" size={18} />
            <strong>{formatQuantity(pending.value, pending.row.unit)}</strong>
          </p>
          {pending.row.key === 'energy_battery_dod_ongrid' ? (
            <p>
              {capacity > 0
                ? `V noci se z baterie odebere přibližně o ${formatQuantity((Math.abs(delta) * capacity) / 100, 'kWh')} ${delta > 0 ? 'míň' : 'víc'}.`
                : 'Kapacita není nastavena; změnu dostupné energie v kWh nelze určit.'}{' '}
              Vyšší rezerva ponechá více energie pro výpadek.
            </p>
          ) : (
            <p>{nbspUnits(pending.row.explanation)}</p>
          )}
        </ConfirmDialog>
      )}
    </div>
  );
}

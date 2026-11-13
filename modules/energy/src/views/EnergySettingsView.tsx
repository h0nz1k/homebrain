import { useEffect, useState } from 'react';
import type { ConnectionLike } from '@homebrain/ha-client';
import { Button, ConfirmDialog, ErrorState, InfoTip, Skeleton } from '@homebrain/ui';
import {
  getEnergySettings,
  setEnergySetting,
  type EnergySetting,
  type EnergySettings,
} from '../settings.js';
import { inverterStatusChip } from '../adapter.js';
import { fetchPvForecast, type PvForecast } from '../pvForecast.js';

const sections = ['Fotovoltaika', 'Baterie', 'Síť', 'Tarif a ceny', 'Střídač'];
const number = (v: number) =>
  new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 2 }).format(v);
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
    return `${number(v)} ° · ${direction}`;
  }
  if (row.value === 'on') return row.key === 'energy_tariff_hdo' ? 'Nízký tarif' : 'Zapnuto';
  if (row.value === 'off') return row.key === 'energy_tariff_hdo' ? 'Vysoký tarif' : 'Vypnuto';
  const numeric = Number(row.value);
  return `${Number.isFinite(numeric) ? number(numeric) : row.value} ${row.unit}`;
}
function SettingRow({
  row,
  onEdit,
}: {
  row: EnergySetting;
  onEdit: (row: EnergySetting, value: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(row.value ?? ''));
  return (
    <div className="en-setting" data-muted={row.value === null || undefined}>
      <div className="en-setting-copy">
        <h3>
          {row.label} {row.assumed && <span className="en-estimate">odhad</span>}
        </h3>
        <p>{row.explanation.split('. ')[0]}.</p>
        {row.value === null && row.binding && (
          <small>
            Nastavte vazbu <code>{row.binding}</code> v integraci HomeBrain.
          </small>
        )}
        {!row.editable && <small>Mění se {row.location}.</small>}
      </div>
      <div className="en-setting-value">
        <strong>{display(row)}</strong>
        <InfoTip label={row.label}>
          {row.explanation}{' '}
          {row.min != null && row.max != null && (
            <>
              {' '}
              Povolený rozsah {row.min}–{row.max} {row.unit}, krok {row.step}.
            </>
          )}{' '}
          Mění se {row.location}.
        </InfoTip>
      </div>
      {row.editable && !editing && (
        <div className="en-setting-action">
          <Button onClick={() => setEditing(true)}>Upravit</Button>
        </div>
      )}
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
            />
          </label>
          <span>{row.unit}</span>
          <Button type="submit" disabled={draft === '' || Number(draft) === Number(row.value)}>
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
            {sections.map((section, index) => (
              <section className="en-card en-settings-section" key={section}>
                <header>
                  <span className="en-section-number">0{index + 1}</span>
                  <h2>{section}</h2>
                </header>
                {section === 'Fotovoltaika' && tomorrowKwh !== undefined && (
                  <p className="en-forecast-hint">
                    Zítra přibližně {number(tomorrowKwh)} kWh · kontrola nastavení podle předpovědi
                  </p>
                )}
                {data.rows
                  .filter((row) => row.section === section)
                  .map((row) => (
                    <SettingRow
                      key={`${row.key}:${row.value}`}
                      row={row}
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
          <p>
            {display(pending.row)} → {number(pending.value)} {pending.row.unit}
          </p>
          {pending.row.key === 'energy_battery_dod_ongrid' ? (
            <p>
              {capacity > 0
                ? `V noci se z baterie odebere přibližně o ${number((Math.abs(delta) * capacity) / 100)} kWh ${delta > 0 ? 'míň' : 'víc'}.`
                : 'Kapacita není nastavena; změnu dostupné energie v kWh nelze určit.'}{' '}
              Vyšší rezerva ponechá více energie pro výpadek.
            </p>
          ) : (
            <p>{pending.row.explanation}</p>
          )}
        </ConfirmDialog>
      )}
    </div>
  );
}

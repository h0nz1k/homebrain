# Topení (heat pump on a Tecomat Foxtrot PLC) – backend, phase 0 (read-only)

HomeBrain reads the PLC's WebMaker web pages (the same XML the PLC's own web UI uses) and
publishes them as entities and `homebrain/heating/*` WebSocket commands. **Nothing is ever
written to the PLC**: the login form is the only POST the client knows.

## Setup

1. Put your private variable map at `/config/homebrain/heating_map.yaml` (start from
   [`heating-map.example.yaml`](heating-map.example.yaml); its addresses are synthetic).
2. Settings → Devices & services → HomeBrain → Configure → **Heating – Tecomat PLC**:
   URL of the PLC web server, user, password, map path, poll interval (15–300 s, default 30).
   The password is never shown back; an empty field keeps the stored one. Clearing the URL
   switches the module off. Saving reloads HomeBrain.
3. Optional bindings (module `heating`): `heating_energy` (energy total in kWh/Wh of a meter
   on the heat pump, e.g. a Shelly) and `heating_power` (W/kW).

## Protocol (generic WebMaker)

- `GET /syswww/login.xml` → `SoftPLC` cookie; `POST /syswww/LOGIN.XML` with
  `USER` + `PASS = sha1(cookie + password)` (lower-case hex; no clear-text password on HTTP).
- `GET /PAGE<n>.XML` with header `x-tecomat: data` → windows-1250 XML with
  `<INPUT NAME="__<area><addr>[.<bit>]_<TYPE>_<fmt>" VALUE="…"/>` (parsed by name) and
  `<ACCESS … UCID="…"/>` (page compile id). A redirect to the login form = session expired →
  one re-login.
- Logout: `GET /logout.xml` and then `/syswww/logout.xml` with the same cookie.
- One session, requests strictly one after another with ≥ 1 s spacing. Pages with a longer
  interval in the map (`pages:`) are read less often.
- Errors: login rejected → `source: "auth"` + repair issue `heating_auth`; network problems
  → `source: "unreachable"`; both back off 2× up to 10 min. A page whose UCID differs from
  the map's `ucid:` is ignored and raises repair issue `heating_project_changed`.

## Entities

One entity per **mapped** key, entity id `sensor|binary_sensor.heating_<section>_<field>`
(e.g. `sensor.heating_tank_bottom`, `binary_sensor.heating_heat_pump_compressor_on`).
Temperatures/pressures are `measurement`; `heat_pump.motohours` is `total_increasing`.
Always present when the module is configured:

| Entity | Meaning |
|---|---|
| `sensor.heating_activity` | enum: idle, heating_tank, heating_dhw, house_circuit, cooling, fault, blocked_hdo |
| `sensor.heating_compressor_runtime_h` | compressor hours today (`total_increasing`, resets at local midnight) |
| `sensor.heating_compressor_starts` | compressor starts today (`total_increasing`) |
| `sensor.heating_energy_kwh` | heat pump energy today from the bound `heating_energy` meter |

Runtime and starts come from compressor on/off transitions between polls; they are stored
(`.storage/homebrain.heating_counters`), so a restart neither resets the day nor counts a
new start. Gaps longer than 20 min (HA or PLC down) are not credited.

## Map keys

`mode.{winter, auto_season, setback_active, main_switch, cooling, hdo_low_tariff}`,
`house.{ref_temp, ref_target, ref_target_effective, hysteresis, attic_temp, circuit_on, supply_temp, mixing_valve_pct}`,
`heat_pump.{compressor_on, condenser_out, return_temp, brine_in, brine_out, primary_prerun,
discharge_temp, discharge_bar, suction_temp, suction_bar, motohours, motominutes}`,
`tank.{top, bottom, target, hysteresis, curve_target}`, `dhw.{temp, target, hysteresis, valve_to_dhw}`,
`outdoor.temp`, `pumps.{heating, secondary, circulation}`, `backup_heater.on`,
`faults.{fatal, compressor_block}`, `curve.p1_outdoor … curve.p4_water`,
`extras.{solar_temp, solar_pump, pool_temp, pool_heating_pump, pool_filter_pump, fish_temp,
fish_target, fish_hysteresis, fish_heating_on, fish_valve_open}`; plus the lists `faults:` (single fault lamps
with a label) and `schedules:` (time programs). See the example file for the syntax.

`house.mixing_valve_pct` is numeric percent (no device class), rounded to an integer in the payload; unmapped or unavailable → `null`. The private mapping is configured outside this repository.

Derived payload values: `dhw.reheat_below = dhw.target − dhw.hysteresis`;
`heat_pump.motohours = motohours + motominutes / 60`; `outdoor.min_today/max_today` from
polls; `heat_pump.running_since` from the last off → on transition; `power_w` from the
`heating_power` binding; `backup_heater.available` = `backup_heater.on` is mapped.

Payload groups (any unmapped field → `null`; entire group → `null` when no key in the group is mapped):
`extras.fish = {temp, target, hysteresis, heating_on, valve_open}` (air temperature);
`extras.solar = {temp, pump}`; `extras.pool = {temp, heating_pump, filter_pump}` (pool sensor on the
return pipe, not in the water). Legacy payloads with only `extras.fish_temp` / `extras.solar_temp` /
`extras.pool_temp` mapped still work.

## WebSocket

| Command | Roles | Notes |
|---|---|---|
| `homebrain/heating/get` | owner, adult; kiosk (subset) | contract payload; kiosk: `updated_at, stale, source, activity` + `house.{ref_temp, ref_target_effective}`, `heat_pump.{compressor_on, running_since}`, `dhw.{temp, target, reheat_below}`, `outdoor.temp`, `faults.{active, fatal, compressor_block}` |
| `homebrain/heating/subscribe` | owner, adult | event with the `get` payload now and on every change |
| `homebrain/heating/history` | owner, adult | `{range: day\|week\|month\|season\|all, keys?}`; resolution 5min/hour/hour/day/day from recorder long-term statistics; `keys` are `<section>_<field>` (default: outdoor_temp, tank_top, tank_bottom, house_ref_temp, heat_pump_condenser_out); counters return `[ts, change, null, null]`; `runs` (day/week) from the compressor binary sensor history |
| `homebrain/heating/seasons` | owner, adult | per season (1 July – 30 June), newest first, from daily statistics |
| `homebrain/heating/import_history` | HA admin | hourly rows → `async_import_statistics` |

`seasons`: `compressor_h`/`starts` = sum of daily changes of the counter sensors,
`degree_days` = Σ max(0, 20 °C − daily mean outdoor) (daily mean = mean of hourly means),
`h_per_100dd`, `median_run_min` = median over days of runtime / starts (an approximation;
single runs are not in the statistics), `coverage` = days with outdoor data / elapsed days,
`energy_kwh` = bound meter (`energy_measured: true`) or `compressor_h × kwh_per_run_hour`
from the map (`false`) or null, `backup_heater_h` = null (no source yet).

`import_history` rows: `{key, start, mean, min?, max?}` for measurements and
`{key, start, sum}` for `compressor_runtime_h`, `compressor_starts`, `energy_kwh` (`sum` =
amount within that hour). `start` = epoch ms or ISO with offset, aligned to a full hour.
Max 20 000 rows per call. Rows for keys without an entity or unaligned hours are reported in
`rejected`. Re-importing a batch overwrites the same hours (idempotent); counter totals
continue from the last stored row's cumulative sum strictly before the batch. Send batches
oldest-first and before live data for that period exists. The command waits for recorder
writes before reading that seed and before acknowledging the import, so batches are safe
back-to-back after each response, without sleeps or extra recorder flushes.

## Vlastní logo TČ

Na schématu v záložce **Teď** lze na přední panel jednotky TČ zobrazit logo výrobce (nikdy se
neskládá do panelu ani do integrace).

1. V Home Assistantu vytvořte složku `www/homebrain/heating/` (v konfiguraci typicky
   `/config/www/homebrain/heating/`).
2. Nahrajte soubory loga (SVG, PNG nebo WebP) – pouze **prosté názvy souborů** bez cest.
3. Přidejte `manifest.json`:

```json
{
  "schema": 1,
  "logo": "hp-logo.svg",
  "logoDark": "hp-logo-dark.svg"
}
```

- `logo` – výchozí logo (světlý motiv nebo univerzální).
- `logoDark` – volitelné logo pro tmavý motiv panelu; chybí-li, použije se `logo`.

Panel načte manifest z URL `/local/homebrain/heating/manifest.json` (stejný mechanismus jako
fotky robotů). Logo je vycentrované na přední straně TČ, max. cca 72 % šířky jednotky.
Bez manifestu nebo při neplatném souboru zůstane popisek **TČ**. Stav kompresoru je jen
malá LED na panelu (zelená pulzující při běhu, šedá při klidu).

## Not in phase 0

Writes of any kind, rooms (`rooms: []` until room bindings exist), annotations (`[]`),
the backup heater runtime (`backup_heater_h: null`).

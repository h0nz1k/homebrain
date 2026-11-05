# Počasí – požadavky

Stav: sklizeno 2026-10-31 (issue #13). Zdroje: `donor/weather@a36cbdf`, `HA revize 2026-10-31`, `ADR-0001 §5.2`.

## Rozsah

Modul zobrazuje lokální měření (meteostanice Ecowitt přes HA), předpověď (met.no `weather` entita a služba `weather.get_forecasts`), denní fázi slunce (`sun.sun`) a freshness. HomeBrain mapuje surové entity stanice na vendor-neutrální logické klíče; staré template duplicity se neportují. Viz `ADR-0001 §5.2`.

## Datové vstupy (logické klíče)

| klíč | doména/typ | jednotka | povinný (MVP) | poznámka |
| --- | --- | --- | --- | --- |
| `weather_station_temperature` | sensor | °C | ano | venkovní teplota |
| `weather_station_feels_like` | sensor | °C | ano | pocitová teplota |
| `weather_station_humidity` | sensor | % | ano | venkovní vlhkost |
| `weather_station_dew_point` | sensor | °C | ne | |
| `weather_station_pressure_relative` | sensor | hPa | ne | |
| `weather_station_pressure_absolute` | sensor | hPa | ne | |
| `weather_station_wind_speed` | sensor | m/s nebo km/h | ano | jednotka v adaptéru |
| `weather_station_wind_gust` | sensor | stejná jako speed | ne | |
| `weather_station_wind_direction` | sensor | ° nebo compass | ne | |
| `weather_station_rain_rate` | sensor | mm/h | ne | piezo |
| `weather_station_rain_daily` | sensor | mm | ne | |
| `weather_station_uv_index` | sensor | index | ne | |
| `weather_station_solar_radiation` | sensor | W/m² | ne | |
| `weather_station_lux` | sensor | lx | ne | |
| `weather_station_indoor_temperature` | sensor | °C | ne | |
| `weather_station_indoor_humidity` | sensor | % | ne | |
| `weather_station_battery_*` | binary_sensor | — | ne | stav baterií senzorů |
| `weather_forecast` | weather | — | ano | právě jedna met.no entita |
| `weather_sun` | sun | — | ano | typicky `sun.sun` |

## Požadavky

### WEA-001 – Oddělení měření a předpovědi

- **Popis:** Lokální observation a forecast jsou dva streamy; UI je nesmí zaměnit.
- **Zdroj:** `donor/weather@a36cbdf:docs/acceptance.md`; `docs/data-contract.md`
- **Priorita:** MVP
- **Akceptace:** Given mock s rozdílnou teplotou stanice vs. forecast, When zobrazeno Počasí, Then obě hodnoty jsou viditelně označené zdrojem/provenance.

### WEA-002 – Normalizované condition enum

- **Popis:** Provider stavy se mapují na `clear|partly_cloudy|…|unknown`; UI si nedomýšlí jemnější stav.
- **Zdroj:** `donor/weather@a36cbdf:docs/data-contract.md`
- **Priorita:** MVP
- **Akceptace:** Neznámý raw stav → `unknown` v kontraktu; snapshot test fixture.

### WEA-003 – Freshness a stale snapshot

- **Popis:** Status `fresh|loading|stale|unavailable`; stale zachová poslední konzistentní snapshot.
- **Zdroj:** `donor/weather@a36cbdf:docs/data-contract.md`
- **Priorita:** MVP
- **Akceptace:** When entita starší než práh, Then badge „stale“ a žádné vymyšlené číslo při `unavailable`.

### WEA-004 – Hodinový výhled MVP

- **Popis:** Hourly předpověď z `weather.get_forecasts` (hourly + daily where supported).
- **Zdroj:** `ADR-0001 §5.2`; `HA revize 2026-10-31`
- **Priorita:** MVP
- **Akceptace:** Given forecast služba vrátí seřazené hourly, When modul načten, Then lista je chronologická s teplotou a pravděpodobností srážek dle kontraktu.

### WEA-005 – Jediná forecast entita

- **Popis:** Pokud existují dvě met.no entity s různými souřadnicemi, bindings musí vybrat právě jednu.
- **Zdroj:** `HA revize 2026-10-31`
- **Priorita:** MVP
- **Akceptace:** Config validace odmítne dvojici klíčů `weather_forecast`; dokumentace options popisuje výběr.

### WEA-006 – Mapování stanice bez template duplicit

- **Popis:** HomeBrain mapuje ~40 entit Ecowitt přímo; odstraněné template „weather“ senzory se neobnovují v Gitu.
- **Zdroj:** `HA revize 2026-10-31`; `ADR-0001 §5.2`
- **Priorita:** MVP
- **Akceptace:** Adapter pokrývá logické klíče v tabulce; unit test bez reference na konkrétní entity_id.

### WEA-007 – Light/dark a A1 Calm

- **Popis:** Vizuální systém light/dark parity dle schváleného A1 Premium Calm.
- **Zdroj:** `donor/weather@a36cbdf:docs/product-brief.md`; `docs/design-system.md`
- **Priorita:** MVP
- **Akceptace:** Oba theme projdou visual gate 360×800 / 800×1280 / 1440×900 se stejnou informační strukturou.

### WEA-008 – Clean-room architektura

- **Popis:** Vrstvy adapters → domain → UI; žádné GPL donory; selektivní subscription entit.
- **Zdroj:** `donor/weather@a36cbdf:docs/adr/ADR-030-architecture-v2-clean-room-frontend.md`
- **Priorita:** MVP
- **Akceptace:** Modul weather nemá import z V1 runtime; lint pravidlo zákazu čtení celého `hass.states`.

### WEA-009 – Profil lokality v options

- **Popis:** Jeden profil lokality (název/region pro UI) v options integrace, ne v YAML panelu.
- **Zdroj:** `ADR-0001 §5.2`; `donor/weather@a36cbdf:deployment/home-assistant/LOCATION_PROFILES_INSTALL_ROLLBACK.md`
- **Priorita:** MVP
- **Akceptace:** Given admin nastaví profil, When reload panelu, Then `location.name` v kontraktu odpovídá bez commitu do Gitu.

### WEA-010 – Provider failure isolation

- **Popis:** Výpadek forecastu nesmí shodit zobrazení lokální stanice.
- **Zdroj:** `donor/weather@a36cbdf:docs/acceptance.md`
- **Priorita:** MVP
- **Akceptace:** When forecast unavailable, Then current block stále `ok` při živé stanici.

### WEA-011 – Summary widget pro Dnes

- **Popis:** Export `summary()` s teplotou, stavem a freshness pro modul Dnes.
- **Zdroj:** `ADR-0001 §5.1`
- **Priorita:** MVP
- **Akceptace:** Contract test: summary JSON splní zod schema modulu today.

### WEA-012 – Install/rollback vzor

- **Popis:** Runbook instalace a rollback panelu podle weather V2 preview vzoru.
- **Zdroj:** `donor/weather@a36cbdf:deployment/home-assistant/V2_PREVIEW_INSTALL_ROLLBACK.md`; `ADR-0001 §6.2`
- **Priorita:** MVP
- **Akceptace:** `docs/runbooks/install-rollback.md` existuje a popisuje HACS redownload bez přepsání V1 panelů do cut-overu.

### WEA-013 – Bez entity_id v kontraktu

- **Popis:** `WeatherDashboardData` neobsahuje HA identifikátory.
- **Zdroj:** `donor/weather@a36cbdf:docs/integration-boundaries.md`
- **Priorita:** MVP
- **Akceptace:** JSON schema / zod validace fixture bez polí `entity_id`.

### WEA-014 – Radar ČHMÚ

- **Popis:** Radarová vrstva s časovou osou; adapter na ČHMÚ až se obnoví zdroj.
- **Zdroj:** `ADR-0001 §5.2`; `HA revize 2026-10-31`
- **Priorita:** later
- **Akceptace:** Given funkční radar feed, When uživatel přehrává offset, Then mapa respektuje `availableOffsets` z kontraktu.
- **Stav (#28):** zdroj `opendata.chmi.cz/meteorology/weather/radar/composite/maxz/png` (MAX_Z, 5 min, EPSG:3857) + `fct_maxz` (extrapolace ČHMÚ 10–60 min), CC BY 4.0. Integrace drží 24 snímků výřezu ~140 km kolem domova, obrázky jen přes autentizovaný view `/api/homebrain/weather/radar/{id}` (UI používá `auth/sign_path`). Nowcast: primárně extrapolace ČHMÚ, kontrola vlastní advekcí (fázová korelace posledních 3 snímků); r = 3 km, prahy 12/18 dBZ (`options.weather.radar_*`). Stanice má přednost.

### WEA-015 – Meteo varování

- **Popis:** Varování nejsou brána z invertoru ani falešných senzorů; vyžadují dedikovaný zdroj.
- **Zdroj:** `HA revize 2026-10-31`; `donor/weather@a36cbdf:docs/acceptance.md` (alerts capability)
- **Priorita:** later
- **Akceptace:** UI nezobrazuje „warning“ bez provideru `alerts`; binding validace odmítne domény mimo weather.
- **Stav (#27):** primární zdroj je dokumentovaný CAP (`opendata.chmi.cz/meteorology/weather/alerts/cap/alert_cap_50_*.xml`, CC BY 4.0), filtr na ORP domova podle geokódu `CISORP`. ORP se určí lokálně z domovských souřadnic HA přes přibalené zjednodušené polygony ORP (ČÚZK, 2026 – RÚIAN + číselník ČSÚ 65, CC BY 4.0 dle [podmínek ČÚZK](https://www.cuzk.gov.cz/Predpisy/Podminky-poskytovani-prostor-dat-a-sitovych-sluzeb/Podminky-poskytovani-prostorovych-dat-CUZK.aspx); popis úprav v `custom_components/homebrain/weather/data/README.md`) – poloha neopouští HA; přepsat jde `options.weather.chmi_orp`. Nedokumentovaný `alerts.json` jen jako záloha při výpadku CAP. Mapování: žlutá → notice, oranžová → warning, červená/fialová → critical. WS `homebrain/weather/alerts`.

### WEA-016 – Přesnost předpovědi (MAE/trust)

- **Popis:** Metriky přesnosti jen se srovnatelnými veličinami (ne relativní tlak stanice vs. MSL met.no).
- **Zdroj:** `HA revize 2026-10-31`; `donor/weather@a36cbdf:docs/acceptance.md`
- **Priorita:** later
- **Akceptace:** Dokumentovaný vzorec like-for-like před zapnutím UI „důvěry“.

### WEA-017 – Doporučovací engine

- **Popis:** Recommendation položky z kontraktu nejsou v MVP implementovány.
- **Zdroj:** `donor/weather@a36cbdf:docs/acceptance.md` (NOT_IMPLEMENTED)
- **Priorita:** later
- **Akceptace:** Pole `recommendations` může být prázdné; žádné hardcoded rady bez pravidla.

## Portovat vs. zahodit

| položka | rozhodnutí | důvod |
| --- | --- | --- |
| V2 domain/infra/intelligence (MIT) | portovat | `ADR-0001 §11` |
| V1 runtime, GPL donory | zahodit | ADR-030 |
| YAML bindings v panel_custom | inspirace | → homebrain options |
| Forecast archive IndexedDB | inspirace | volitelně později |
| Staré template senzory | zahodit | `HA revize 2026-10-31` |

## Mimo rozsah

Verification scoring bez historie; primární cut-over V1/V2 panelů až po soak HomeBrain (`acceptance.md`).

## Otevřené otázky

- Která met.no entita je kanonická při dvou souřadnicích?
- Obnovení radar runneru a zdroje varování.

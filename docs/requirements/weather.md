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
| `weather_station_pressure_absolute` | sensor | hPa | ne | v integraci klíč `weather_pressure_absolute` (#131): zdroj MSL tlaku |
| `weather_station_wind_speed` | sensor | m/s nebo km/h | ano | jednotka v adaptéru |
| `weather_station_wind_gust` | sensor | stejná jako speed | ne | |
| `weather_station_wind_direction` | sensor | ° nebo compass | ne | |
| `weather_station_rain_rate` | sensor | mm/h | ne | piezo |
| `weather_station_rain_daily` | sensor | mm | ne | `state_class: total_increasing`; jeho statistiky (`change`) = historie a ověřování srážek (#131) |
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

### WEA-018 – Výška lokality z options

- **Popis:** Když HA `core.config.elevation` je 0 nebo chybí, použije se `options.weather.elevation_m`. Efektivní výška se ukáže v řádku lokality (s vysvětlením zdroje) a posílá se do všech Open-Meteo dotazů jako `elevation`; neznámá výška se neposílá.
- **Zdroj:** issue #131 A
- **Priorita:** MVP
- **Akceptace:** Given HA elevation 0 a option 480 m, When snapshot, Then `location.elevation_m = 480`, `elevation_source = "option"` a URL obsahuje `elevation=480`; bez option `elevation_m = null` (pytest `test_weather_history.py`).

### WEA-019 – MSL tlak z absolutního tlaku

- **Popis:** Zobrazovaný a porovnávaný tlak je MSL odvozený hypsometricky z absolutního tlaku, výšky a teploty (spec §4.2). Relativní tlak stanice rovný absolutnímu (offset nenastaven) se ignoruje a označí ve snapshotu.
- **Zdroj:** issue #131 A; WEA-016
- **Priorita:** MVP
- **Akceptace:** Vzorec dává 1013,25 hPa pro ICAO standardní atmosféru (500 m, 1000 m) ± 0,15 hPa; REL = ABS → `station.pressure.relative_ignored = true`; bez výšky se nic nevymýšlí.

### WEA-020 – WS historie stanice

- **Popis:** `homebrain/weather/history` (den/hodina, ≤ 400 dní, hodiny ≤ 31 dní) jen z HA long-term statistics přes veřejné `statistics_during_period` v recorder executoru: teplota min/max/průměr, srážky (`change`), max intenzita, max náraz, vlhkost, MSL, solární energie, pokrytí hodin a mezery.
- **Zdroj:** issue #131 A
- **Priorita:** MVP
- **Akceptace:** Den s chybějícími hodinami má `gaps` a hodnoty jen z dostupných hodin; den bez dat má `null`, ne 0; DST den má 25/23 očekávaných hodin; záporný `change` se zahodí (pytest).

### WEA-021 – Karta „Včera a dnes“

- **Popis:** Včerejší naměřené hodnoty vs. dnešek zatím (dnešek doplněný živou stanicí) a počet dní bez deště; mezera v datech počítání zastaví („nejméně N dní“). Zvýraznění ⚠ + tučně (ne jen barvou): náraz ≥ 15 m/s, změna průměrného tlaku ≥ 10 hPa za den (`MSL_JUMP_HPA`). Jednotky v pevném slotu (zarovnané desetinné čárky), „Dnes zatím“ s datem a časem („so 31. 10. do 10:39“, bez čárky; na telefonu zalomí jen mezi datem a časem); výzva jen s novou informací: ⚠ změna průměrného tlaku / silný náraz (`alertCallout`, věta na každý fakt: „Průměrný tlak je dnes zatím o 26 hPa nižší než včera. Nárazy větru zatím až 16,2 m/s.“, visící odsazení za ⚠) má přednost před srážkami (`streakCallout`); žádné „zatím“ v buňkách Δ (říká ho záhlaví); „– = chybí data“ jen při zobrazené pomlčce.
- **Zdroj:** issue #131 A
- **Priorita:** MVP
- **Akceptace:** vitest `HistoryCards.test.tsx`, `history.test.ts`; screenshoty 360×800 / 800×1280 / 1440×900, dark + light.

### WEA-022 – Pohled Historie 7 / 30 / 365 dní

- **Popis:** Sloupce srážek, pás min–max teploty, výběr dne, rekordy měsíce a roku. Jen data vlastní stanice, chybějící dny se vyznačí šrafou shodnou s legendou (přes oba panely), nedopočítávají. Popisky osy x jen na skutečných dnech dat (poslední = poslední úplný den; dnešek zatím má plnou výplň (≥ 3 : 1) s tmavým neutrálním obrysem, v legendě „tmavý obrys = dnes (zatím)“; vybraný den = rámeček s položkou legendy, čip na ose x je vybraný den se stejným rámečkem). Nad dlaždicemi rozsah okna s daty. Stopová srážka (zobrazená ≥ 0,1 mm) má sloupec aspoň 2 px, 0,0 mm žádný; rekord z dnešního neúplného dne je zatímní („dnes (zatím)“, „rekord: zatím …“); zvýraznění vybraného dne je oříznuté na plochu grafu. Dlaždice Srážky / Deštivé dny (≥ 1 mm) / Prům. teplota / Nejdelší sucho (`longestDry`).
- **Zdroj:** issue #131 A
- **Priorita:** MVP
- **Akceptace:** Přepnutí období mění počet dní v grafu; mezera má vlastní značku a počet v legendě (vitest + e2e `weather.spec.ts`).

### WEA-023 – Ověřování srážek proti stanici

- **Popis:** Hodinové páry srážkoměr vs. archiv předpovědí (`fc_archive`) a Open-Meteo Previous Runs po modelech a lead bucketech; POD/FAR/CSI/ETS pro ≥ 0,2 a ≥ 1 mm/h a denní ≥ 1 / ≥ 5 mm, bias množství, Brier PoP. Noční job 1× za noc s backoffem v rozpočtu volání (spec §3.2).
- **Zdroj:** issue #131 B; spec §4.6
- **Priorita:** later → implementováno
- **Akceptace:** Ručně spočítané kontingenční tabulky v `test_weather_verify.py`; noční job při druhém spuštění téže noci nevolá API.

### WEA-024 – Váhy blendu po veličinách

- **Popis:** Srážky a PoP mají váhy z Brier/ETS (priory + shrinkage, minimální počet párů a deštivých hodin); teplota beze změny podle MAE.
- **Zdroj:** issue #131 B; spec §4.4
- **Priorita:** later → implementováno
- **Akceptace:** Skóre srážek nemění teplotu ani `contributors`; jediný ověřený zdroj nepřebere váhu neověřených (pytest).

### WEA-025 – Kalibrované PoP

- **Popis:** PoP = vážený hlas (vlastní PoP modelu, jinak práh 0,2 mm/h) → reliability binning na stanici od 500 párů; do té doby nekalibrované. Ve snapshotu `pop_raw` a `pop_calibrated`.
- **Zdroj:** issue #131 B
- **Priorita:** later → implementováno
- **Akceptace:** Mrholení 0,15 mm/h ve všech modelech → PoP 0; kalibrační křivka je monotónní (pytest).

### WEA-026 – Ensemble pravděpodobnosti (volitelné)

- **Popis:** ICON-D2-EPS 0–48 h jako podíl členů ≥ 0,2 mm/h, smíchaný 50 : 50 s hlasem modelů. Za konstantou `ENSEMBLE_ENABLED` (výchozí vypnuto) – viz rozpočet a důvody ve spec §3.2.
- **Zdroj:** issue #131 B
- **Priorita:** later
- **Akceptace:** S vypnutým flagem žádné volání Ensemble API; parser a míchání mají unit test.

### WEA-027 – „Kdo se trefuje“: záložka Déšť

- **Popis:** Pořadí modelů podle ETS (≥ 0,2 mm/h) laicky („zachytil x z 10 hodin s deštěm“, „planý poplach y z 10“), zkratky a Brier jen v rozbalení; rozdíly pod 95% prahem šumu (delta metoda na kontingenční tabulce; jeden práh pro tabulku = největší z dvojic) = prosté pořadí bez sdílení a „≈“ mezi každými dvěma sousedy s rozdílem pod prahem; „málo dat“ s konkrétní překážkou v číslech; bez dost párů prázdný stav s vysvětlením.
- **Zdroj:** issue #131 B
- **Priorita:** later → implementováno
- **Akceptace:** vitest `rainScore.test.ts` (ETS, SE vs. bootstrap, práh šumu, shody, texty „málo dat“) a `HistoryCards.test.tsx` (pořadí se shodami, vzorek v hlavičce, prázdný stav).

## Portovat vs. zahodit

| položka | rozhodnutí | důvod |
| --- | --- | --- |
| V2 domain/infra/intelligence (MIT) | portovat | `ADR-0001 §11` |
| V1 runtime, GPL donory | zahodit | ADR-030 |
| YAML bindings v panel_custom | inspirace | → homebrain options |
| Forecast archive IndexedDB | inspirace | volitelně později |
| Staré template senzory | zahodit | `HA revize 2026-10-31` |

## Mimo rozsah

Verification scoring bez historie (od #131 se srážky ověřují proti HA statistikám stanice, WEA-023); primární cut-over V1/V2 panelů až po soak HomeBrain (`acceptance.md`).

## Otevřené otázky

- Která met.no entita je kanonická při dvou souřadnicích?
- Obnovení radar runneru a zdroje varování.
- (#131) Fáze B2 – 0–2 h blend nowcastu a QC srážkoměru proti ČHMÚ – jen návrh ve spec §4.9.
- (#131) Odchylka od „normálu stanice“ (průměr stejného data z předchozích let) v kartě Včera a dnes zatím chybí – potřebuje víc než rok historie.

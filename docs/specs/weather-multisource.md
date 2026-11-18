# HomeBrain Počasí — vícezdrojová specifikace (lokální stanice + modely)

- Stav: **návrh k review vlastníka** · Datum: 2026-10-31 · Autor: LANA (subagent research)
- Navazuje na: `docs/adr/0001-frontend-architecture.md` §5.2, `docs/requirements/weather.md` (WEA-001…017, větev `docs/requirements-harvest`)
- Lokalita: domácnost v ČR (souřadnice bere integrace z HA `zone.home`; v dokumentech ani v Gitu se neuvádí).
- Ověřovací sondy (HTTP GET na veřejná API) jsou uvedené v textu jako „sonda 2026-10-31“. Návrhy issues z §6 jsou založené v GitHubu.

## 0. Výchozí stav (ověřeno read-only; konkrétní `entity_id` záměrně neuvádíme – vazby jsou v integraci)

- Stanice: Ecowitt gateway s all-in-one senzorem (superkapacitor, piezo srážky), desítky entit: venkovní T/RH/rosný bod/pocitová/wind-chill, rel. + abs. tlak, vítr (rychlost, náraz, max denní náraz, směr + 10min průměr směru), piezo srážky (rate, event, hourly, daily, weekly, monthly, yearly, 24h, `rain_state`), UV, solar W/m², lux, VPD, indoor T/RH/Td, přídavné kanály T/RH 1, 7, 8, půdní teplota 1 (+ baterie).
  - Pozor: entity typu `…_daily_rain_rate_piezo` atd. jsou podle názvu „rate“, ale jde o akumulace (mm) — adapter musí brát jednotku z `unit_of_measurement`, ne z názvu.
- Předpověď: jediná weather entita z core integrace `met` (met.no).

## 1. Katalog zdrojů

Legenda: **Y** = doporučeno, **L** = později, **N** = nedoporučeno. „Free“ = zdarma pro osobní nekomerční použití.

| Zdroj | Data | Rozlišení / aktualizace | Licence / ToS | Cena | Limit | Poznámka CZ | Dop. |
|---|---|---|---|---|---|---|---|
| **Ecowitt gateway + all-in-one senzor** (HA core `ecowitt`, push webhook) | aktuální měření stanice | push z gatewaye (interval dle nastavení gatewaye) | lokální data | 0 | — | Core integrace přijímá „Customized“ upload z gatewaye přes webhook.[27] Existuje i oficiální Ecowitt integrace (MIT) s lokálním HTTP pollingem, řada GW podporována.[28] | **Y** (primární pozorování) |
| **Open-Meteo Forecast API** (multi-model `models=`) | hodinové + 15min (ICON-D2/AROME) předpovědi, T, Td, RH, srážky, PoP, vítr, nárazy, tlak, oblačnost, radiace, weather code | ALADIN ČHMÚ 1–2,3 km / 3 dny / à 6 h; AROME GeoSphere 2,5 km / 2,5 dne / à 3 h; ECMWF IFS & AIFS 9–25 km / 15 dní / à 6 h; UKMO 2–10 km / 7 dní / à 1 h; HARMONIE KNMI 2 km / 2,5 dne / à 1 h; ICON (DWD), ARPEGE/AROME (MF) aj.[2] | CC BY 4.0, jen nekomerčně, právo blokovat zneužití.[1] | 0 | 600/min, 5 000/h, 10 000/den, 300 000/měs.[1] Dotaz s >10 proměnnými nebo >2 týdny se počítá frakčně jako víc volání.[36] | `chmi_aladin_cz_1km` vracel v létě 2026 samé `null`; issue uzavřeno 2026-07-20.[3] Sonda 2026-10-31 (bod v ČR, 3 dny): ALADIN 72/72 hodnot, ICON-D2 61/72, AROME-AT 70/72, IFS/AIFS/GFS/UKMO/KNMI/DMI/ICON-EU 72/72; `meteofrance_arome_france_hd` 0/72 (doména ČR nepokrývá). | **Y** (páteř předpovědi) |
| **Open-Meteo Ensemble API** | členy ensemble → spread, P10/P50/P90, pravděpodobnosti | ICON-D2-EPS 2 km, 20 členů, 2 dny, à 3 h; ICON-EU-EPS 40 členů, 5 dní; ECMWF IFS 0.25° 51 členů / 15 dní; AIFS 51 členů; IFS Europe nativní 9 km.[4] | jako Open-Meteo | 0 | jako Open-Meteo (pozor na frakční počítání u 51 členů) | Sonda: ICON-D2-EPS vrací 20 členů pro bod v ČR. | **L** (fáze 2) |
| **Open-Meteo Previous Runs API** | předpovědi stejných modelů s lead time 1–7 dní (`*_previous_dayN`) | většina modelů archivována od 01/2024[5] | jen nekomerčně, <10 000 volání/den[5] | 0 | — | Umožňuje verifikaci/bias bez vlastního archivu všech běhů — klíčové zjednodušení. | **Y** (verifikace) |
| **Open-Meteo Historical Forecast API** | archiv „seamless“ předpovědí | od ~2022[37] | jako Open-Meteo | 0 | — | Bootstrap bias korekce (zpětně, jakmile je historie stanice). | **L** |
| **Open-Meteo Air Quality** | PM2.5/PM10/O₃/NO₂, European AQI, pyl (olše, bříza, trávy, pelyněk, ambrozie…), UV | CAMS Europe 11 km + CAMS global 45 km[6] | jako Open-Meteo | 0 | jako Open-Meteo | Pyl jen pro Evropu z CAMS.[6] | **Y** |
| **MET Norway Locationforecast** (už v HA) | hodinová předpověď ~9 dní | — | CC BY 4.0, povinná identifikace v `User-Agent`, respektovat `Expires`, cache + `If-Modified-Since`.[7] | 0 | >20 req/s na aplikaci jen se smlouvou.[7][8] | Mimo Skandinávii v podstatě post-processovaný ECMWF [unverified] → silně koreluje s IFS, v blendu nedávat dvojí váhu. | **Y** (přes HA entitu) |
| **ECMWF open data** (GRIB přímo) | IFS/AIFS | à 6 h | CC BY 4.0, lze i komerčně s atribucí[9] | 0 | — | GRIB parsování v HA zbytečně těžké; stejná data dostaneme přes Open-Meteo. | **N** (přímo) |
| **ČHMÚ opendata — ALADIN GRIB** (`nwp_aladin/CZ_1km`, `Lambert_2.3km`) | NWP pole | běhy 00/06/12/18 UTC, ~3 dny rolling[3] | CC BY 4.0[10] | 0 | — | Desítky MB na parametr → v HA nestahovat; použít přes Open-Meteo. | **N** (přímo) |
| **ČHMÚ meteogram** (`data-provider.chmi.cz/api/graphs/graf.meteogram`) | JSON 73 h pro bod/POI (ALADIN) | dle běhu ALADIN | veřejné bez autentizace, ale nedokumentované API[13] | 0 | neuvedeno | Fallback, kdyby Open-Meteo ALADIN znovu vypadl. | **L** |
| **ČHMÚ výstrahy** — CAP XML (`opendata…/alerts/cap/`) + `vystrahy-cr.chmi.cz/data/alerts.json` | oficiální výstrahy, texty, doporučení, platnost, ORP/kraj | průběžně | CC BY 4.0[10] | 0 | — | `alerts.json` má strukturované texty po krajích/ORP; `data-provider…/api/cap/data/*` texty nevrací.[13] | **Y** |
| **ČHMÚ radar** — kompozit `maxz` / `pseudocappi2km` PNG + `fct_maxz` (extrapolace) | odrazivost dBZ, 5 min; předpověď ft60s10 (60 min po 10 min)[13] | 5 min | CC BY 4.0[10] | 0 | — | Sonda: poslední snímek `maxz/png` 14:00 UTC, adresáře `fct_maxz`, `fct_pseudocappi2km`, `merge1h`, `echotop` existují.[11] Starý weather repo už měl `chmiRadarProvider` (pseudocappi2km). | **Y** |
| **ČHMÚ staniční měření** (`meteorology/climate/now/data/` 10min + 1h JSON) | T, RH, tlak, srážky, vítr profesionálních stanic | 10 min / 1 h | CC BY 4.0[10] | 0 | — | Sonda: ~1 300 souborů 10m a ~1 200 1h aktuálně. Sousední stanice = kontrola driftu a tlaku. | **L** (fáze 2) |
| **ČHMÚ slovní předpověď** (`weather/forecast/now/*.json` po krajích) | text + min/max | 1–2× denně | CC BY 4.0[10] | 0 | — | Strojově čitelná čísla pro 10denní výhled ČHMÚ veřejně nejsou.[13] | **L** (textová karta) |
| **ČHMÚ kvalita ovzduší** (`air_quality/now`) | měření ISKO | hodinově | CC BY 4.0[10] | 0 | — | Doplněk k CAMS (měření vs. model). | **L** |
| **CHMI Data Parser** (neoficiální statický JSON nad opendata ČHMÚ) | výstrahy CAP, staniční měření, radar | ~5 min | data CC BY 4.0, služba třetí strany[34] | 0 | neuvedeno | Užitečné jako reference parsování; závislost na hobby službě nechceme. | **N** |
| **MeteoAlarm** Atom/CAP feed | evropské výstrahy (pro ČR = ČHMÚ) | průběžně, WebSub[16] | CC BY 4.0-ekvivalent + podmínky: jméno NMHS, čas vydání, odkaz na meteoalarm.org, real-time zpoždění <10 min.[15] | 0 | — | Sonda: feed pro Czechia HTTP 200. Duplicitní k ČHMÚ, přísnější podmínky redistribuce. | **N** (jen fallback) |
| **Blitzortung** (přes HACS `homeassistant-blitzortung`, MIT) | blesky: vzdálenost, azimut, počet | real-time, zpoždění sekundy | komunitní data; integrace používá vlastní veřejný MQTT server, protože politika Blitzortung vyžaduje, aby aplikace třetích stran měly vlastní servery.[25] | 0 | — | Výchozí okruh 100 km.[25] | **L** (fáze 2) |
| **RainViewer** | minulé radarové dlaždice | 10min krok, 2 h historie | jen osobní/edukační použití, odkaz na RainViewer.[18] | 0 | 100 req/IP/min, max zoom 7, nowcast zrušen 1. 1. 2026.[17] | ČHMÚ je pro ČR lepší a má extrapolaci. | **N** |
| **OpenWeatherMap** | One Call (current/minutely/hourly/daily) | — | proprietární | 1 000 volání/den zdarma, pak 0,0012 GBP/volání; free plán jen 3h/5 dní.[22] | 60/min | Black-box blend, malá přidaná hodnota. | **N** |
| **Pirate Weather** | Dark-Sky kompatibilní API | — | vlastní ToS | free 1 000 volání/měsíc (RapidAPI Basic)[23] | 10/s (RapidAPI) | Mimo Severní Ameriku bere DWD MOSMIX a pak ECMWF IFS[24] → redundantní s Open-Meteo. | **N** |
| **meteoblue** | API vlastních modelů (multimodel) | — | free API na 1 rok po registraci[21]; nekomerční užití vyžaduje mj. popis použití a u „porovnání dat z různých zdrojů“ zprávu s výsledky do 12 měsíců.[20] | 0 / placené | — | Administrativní zátěž, časově omezené. | **N** (případně jednorázový experiment) |
| **Windy Point Forecast API** | bodová předpověď (AROME, ICON-EU, GFS…) | — | Testing klíč vrací *náhodně zamíchaná a mírně upravená data*, jen pro vývoj; Professional 990 €/rok bez ECMWF.[19] | 990 €/rok | 500/den test | Nepoužitelné pro verifikaci. Upload PWS na Windy (sdílení stanice) je jiná věc. | **N** |
| **Satelit** (ČHMÚ `weather/satellite/`, EUMETSAT) | snímky | 5–15 min | ČHMÚ CC BY 4.0[10] | 0 | — | Nezkoumáno do hloubky; nice-to-have vrstva. | **L** |

### 1.1 HA integrace vs. fetch v `homebrain`

| Potřeba | Existující HA integrace | Doporučení |
|---|---|---|
| Stanice | core `ecowitt` (push)[27]; oficiální `ha-ecowitt-iot` (lokální polling, MIT)[28] | **Ponechat core `ecowitt`** (běží). HomeBrain čte stavy přes bindings (WEA-006). |
| met.no | core `met` | **Ponechat**; server-side `weather.get_forecasts` z integrace. |
| Open-Meteo | core `open_meteo`: jedna weather entita, model si vybírá sama („best available“).[26] | **Nestačí** pro srovnání modelů → **fetch v `homebrain`** (jeden multi-model dotaz). |
| ČHMÚ výstrahy / ALADIN / radar | `nijel/hass-chmi-alerts`[14], `hruskin/ha-chmu-meteogram` (Apache-2.0; ALADIN meteogram, výstrahy pro ORP, radar „prší/bude pršet“ s prahy v dBZ)[12] | **Vlastní tenké fetchery v `homebrain`** (CAP/alerts.json + radar PNG). Cizí repa jen jako reference endpointů (clean-room, ADR-030 povoluje kód jen MIT). Volitelně lze `ha-chmu-meteogram` nainstalovat jako nezávislý zdroj pro automatizace. |
| Blesky | `homeassistant-blitzortung` (MIT)[25] | **Použít HACS integraci**, HomeBrain jen čte její entity/eventy. |
| Pyl/AQ | — (core Open-Meteo AQ nemá) | Fetch v `homebrain` (Open-Meteo AQ). |

## 2. Doporučená sada zdrojů

**MVP (fáze 1)**
1. Ecowitt stanice (pozorování, „teď“) — HA entity.
2. Open-Meteo multi-model: `chmi_aladin_cz_1km`, `icon_d2`, `geosphere_claef_austria` (C-LAEF 1 km; do 2026-11-04 `geosphere_arome_austria`), `icon_eu`, `ecmwf_ifs` (9 km), `ecmwf_aifs025_single`, `gfs_seamless`, `ukmo_seamless` (+ `best_match` jako referenční „Open-Meteo“). Hodinově 0–72 h; denně 10 dní z IFS/AIFS/GFS/ICON.
3. met.no z HA (weather entita core `met`, přes binding).
4. ČHMÚ výstrahy (CAP + alerts.json pro ORP).
5. ČHMÚ radar `maxz` (historie 2 h) + `fct_maxz` (nowcast 60 min).
6. Open-Meteo AQ + pyl + UV.
7. Slunce/měsíc lokálně (výpočet, `sun.sun`).

**Fáze 2**: ensemble (ICON-D2-EPS 0–48 h, ECMWF IFS ENS 0–15 d), bias korekce + verifikace (Previous Runs API + vlastní archiv met.no/blendu), QC vůči ČHMÚ stanicím, Blitzortung, 15min srážky ICON-D2/AROME pro 1–6 h.

**Fáze 3 / volitelné**: ČHMÚ slovní předpověď, ČHMÚ ISKO, satelit, sdílení stanice na WU/WOW/Windy (konfiguruje se v gatewayi, ne v HomeBrain), ČHMÚ meteogram jako fallback ALADIN.

**Atribuce v UI (povinná)**: „Data: Open-Meteo.com (CC BY 4.0), modely DWD/ČHMÚ/ECMWF/…“, „MET Norway“, „ČHMÚ (CC BY 4.0)“, u CAMS „Copernicus Atmosphere Monitoring Service“.[1][7][10]

## 3. Datová architektura

```
Ecowitt gateway ──push──► HA core ecowitt ──states──┐
met.no (HA core met) ──weather.get_forecasts────────┤
                                                     ▼
custom_components/homebrain/weather/
  providers/  openmeteo.py  openmeteo_ens.py  openmeteo_aq.py  chmi_alerts.py
              chmi_radar.py  chmi_stations.py  ha_metno.py  ha_station.py
  coordinator.py   (1 DataUpdateCoordinator na zdroj, vlastní interval + backoff)
  normalize.py     (→ kontrakt, SI jednotky, condition enum WEA-002)
  qc.py            (kontroly stanice)
  derive.py        (rosný bod, pocitová, tendence tlaku, frost…)
  blend.py         (váhy, bias, spread)
  verify.py        (denní job: skóre per zdroj/veličina/lead)
  store.py         (SQLite /config/homebrain/weather.db, migrace)
  ws.py            homebrain/weather/{snapshot(sub), models, ensemble, verification, alerts, radar_frames}
  http.py          HomeAssistantView (requires_auth) proxy+cache radarových PNG
  sensor.py        několik výstupních entit pro automatizace
                                                     ▼
React panel (modul weather) — jen kontrakt, žádné entity_id (WEA-013)
```

### 3.1 Kde se fetchuje a proč
- **Vše server-side v integraci** (aiohttp ze `async_get_clientsession`): jeden fetch pro všechny klienty (mobil, tablet, desktop), cache přežije reload panelu, žádné CORS, funguje přes Nabu Casa, v prohlížeči nejsou žádné klíče ani IP uživatele u třetích stran.
- `User-Agent: homebrain/<verze> github.com/h0nz1k/homebrain` (met.no to vyžaduje[7]; slušnost i jinde).
- Radarové snímky: integrace stahuje PNG (5 min), drží posledních 24 snímků + nowcast, servíruje přes autentizovaný `HomeAssistantView` (ne `/local`).

### 3.2 Intervaly a rozpočet volání (Open-Meteo limit 10 000/den[1])

| Fetcher | Interval | Odhad volání/den (frakčně[36]) |
|---|---|---|
| OM forecast hourly 0–72 h, 8 modelů, ~12 proměnných | 60 min (+ okamžitě po startu) | ~24 × ~10 = ~240 [odhad; zda se modely počítají jako proměnné, není dokumentováno] |
| OM forecast daily 10 dní, 4 globální modely | 3 h | ~8 × ~3 = ~24 |
| OM minutely_15 srážky (ICON-D2/AROME) 0–6 h | 15 min | ~96 |
| OM ensemble (ICON-D2-EPS, IFS ENS) | 3 h / 6 h | ~50–150 |
| OM AQ + pyl | 3 h | ~8 |
| OM Previous Runs (verifikace) | 1× denně 03:30 | ~5 |
| ČHMÚ radar PNG (`maxz` + `fct_maxz`) | 5 min | ~576 souborů (ne Open-Meteo) |
| ČHMÚ výstrahy | 10 min (met.no doporučuje pro výstrahy max 1 poll/10 min[7]; přebíráme jako slušné pravidlo) | 144 |
| ČHMÚ stanice 10m | 10 min (jen nejbližší 3–5 stanic) | 144 |

Celkem Open-Meteo řádově **< 600 / den** → bezpečně pod limitem i s rezervou na restarty. Při chybě exponenciální backoff (1, 2, 5, 15, 60 min), při HTTP 429 pauza do další hodiny.

**Rozpočet ověřování srážek (#131 B, ověřeno v oficiální dokumentaci 2026-11-18).** Limit zdarma: 10 000 volání/den, 5 000/h, 600/min, 300 000/měsíc ([terms](https://open-meteo.com/en/terms)). Podle FAQ [pricing](https://open-meteo.com/en/pricing) se požadavek s > 10 proměnnými nebo > 2 týdny počítá jako víc volání, *frakčně* (15 proměnných × 2 týdny = 1,5; 4 týdny = 2,0). Jestli se modely násobí s proměnnými, dokumentace neříká, proto počítáme konzervativně: váha = max(1, proměnné × modely / 10) × max(1, dny / 14) (`openmeteo.call_weight`).

| Volání | Proměnné × modely | Dny | Váha | Kdy |
|---|---|---|---|---|
| Previous Runs `precipitation_previous_day1..3` | 3 × 8 = 24 | 3 | 2,4 | každou noc (poslední 3 dny se čtou znovu) |
| Previous Runs bootstrap | 3 × 8 | 28 (chunk) | 4,8 | jen chybějící dny okna 90 dní: 28+28+28+6 → **16,8** jednou |
| Strop na noc | | | `PREV_RUNS_MAX_WEIGHT` = 50 | |
| Ensemble ICON-D2-EPS (volitelné) | 1 × 20 členů | 2 | stránka API uvádí u příkladu „equivalent to 4.0 calls“; na člen to není rozepsané. Konzervativně ~4 × 8 běhů = **~32/den** | `ENSEMBLE_ENABLED = False` |

Ensemble se vejde i do rozpočtu, přesto je **vypnutý**: id modelu (`icon_d2_eps`) ani jména sloupců členů (`precipitation_memberNN`) v dokumentaci výslovně nejsou a FAQ pricing uvádí ensemble API mezi API vyžadujícími placený plán. Zapnout až po ověření podmínek (otázka pro vlastníka).

### 3.3 Normalizační kontrakt (zkráceně)

```ts
type SourceId = 'station' | 'om:chmi_aladin_cz_1km' | 'om:icon_d2' | 'om:ecmwf_ifs' | 'metno' | 'blend' | ...
interface SourceMeta { id; label; provider; license: 'CC-BY-4.0'|...; attribution; url;
  status: 'fresh'|'stale'|'partial'|'unavailable'; fetchedAt; runAt?: string; ageSec; horizonH; }
interface ForecastPoint { t: ISO; t2m?; td2m?; rh?; precipMmH?; pop?; windMs?; gustMs?; windDir?;
  mslHpa?; cloudPct?; condition: ConditionEnum; isDay?; }
interface ForecastSeries { source: SourceMeta; step: '15m'|'1h'|'1d'; points: ForecastPoint[];
  corrected?: boolean /* po bias korekci */ }
interface BlendPoint extends ForecastPoint { p10?; p90?; spread?; confidence: 'high'|'medium'|'low';
  contributors: { source: SourceId; weight: number }[] }
interface StationObs { t: ISO; values: Record<ObsKey, { v: number|null; unit; qc: QcFlag[] }> }
type QcFlag = 'ok'|'range'|'spike'|'stale'|'flatline'|'neighbour_mismatch'|'radiation_bias'|'low_power'
```
- Jednotky interně SI (°C, m/s, hPa, mm, mm/h, %); převod v adapteru (stanice může posílat km/h).
- Každá hodnota nese provenance (WEA-001); `unavailable` nikdy nevymýšlí číslo (WEA-003).
- Výpadek libovolného provideru izoluje jen jeho widget (WEA-010).

### 3.4 Úložiště — SQLite `/config/homebrain/weather.db`
Proč ne HA long-term statistics: LTS je stavěné na minulé hodnoty entit (hodinové mean/min/max); budoucí hodnoty s více lead time a desítkami zdrojů do něj přirozeně nepatří a recorder by zbytečně nafukoval. HA LTS **ale použijeme pro čtení** hodinových průměrů stanice (už existují pro `state_class: measurement`), takže nemusíme ukládat surová pozorování.

Tabulky:
- `obs_hourly(valid_at, var, value, qc)` — hodinové průměry/sumy stanice (z LTS, po QC), retention 2 roky.
- `fc_archive(source, issued_at, valid_at, lead_h, var, value)` — **jen** pro zdroje, které nemají Previous Runs API (met.no, blend, ensemble percentily). Ukládat 1 snapshot za 6 h, leady 1–120 h; retention 60 dní (~0,5 M řádků).
- `bias_state(source, var, lead_bucket, hod_bucket, b, n, updated_at)`.
- `score_daily(date, source, var, lead_bucket, n, me, mae, rmse, brier, hits, misses, fa)` — retention 2 roky.
- `meta(schema_version)` — migrace dopředně (ADR-0001: verzované migrace). Od #131 i `precip_scores`, `pop_calibration`, `precip_verify_info` (JSON).
- **Implementováno (#131 B):** `fc_archive` ukládá kromě `t2m` i `precip` (mm za hodinu *končící* v `valid_at`) a `pop` 0..1; blend ukládá `pop_raw` (PoP **před** kalibrací, aby se kalibrace neučila sama ze sebe). Migrace v2: `fc_prev(source, valid_at, day, var, value)` = Open-Meteo Previous Runs (lead = den × 24 h), retence 120 dní. `obs_hourly` má `precip` z HA statistik (viz §4.8).
Zálohuje se s HA (leží v `/config`).

### 3.5 Výstupní entity pro automatizace (malá sada)
`sensor.homebrain_rain_eta_min`, `binary_sensor.homebrain_rain_soon`, `sensor.homebrain_warning_level`, `sensor.homebrain_frost_risk`, `sensor.homebrain_pressure_tendency`, `weather.homebrain_blend` (volitelně, aby blend šel použít i v nativních kartách).

## 4. Algoritmy

### 4.1 QC stanice (inspirace WeeWX StdQC = min/max meze[33] + rozšíření)
- **Range**: T −40…+45 °C, RH 1…100 %, p_abs 850…1 050 hPa (podle nadmořské výšky), vítr 0…60 m/s, srážky 0…200 mm/h.
- **Spike**: |x_t − medián(x_{t−3..t−1})| > Δmax (T 3 °C/10 min, RH 20 %/10 min, p 2 hPa/10 min) → hodnota označena, nepoužije se do verifikace.
- **Stale**: `last_reported` starší než 10 min → `stale`; **flatline**: T/RH beze změny 2 h při slunci > 50 W/m² → podezřelé.
- **Low power** (senzor má superkapacitor): při nízkém napětí superkapacitoru flag `low_power` na vítr/srážky.
- **Radiační chyba**: solar > 600 W/m² a vítr < 1 m/s → flag `radiation_bias` (T může být nadhodnocená); do bias statistiky jen s nižší váhou.
- **Soused (fáze 2)**: medián 3–5 nejbližších stanic ČHMÚ přepočtený na výšku stanice (−0,65 °C/100 m); `neighbour_mismatch`, když |T − T_soused| > 3σ (σ z klouzavých 14 dní) po > 3 h. Stejně pro tlak (MSL) — odhalí drift barometru.
- **Kalibrace větru**: stanice obvykle neměří v 10 m; komunita v HA řeší korekci škálovacím faktorem/offsetem vůči spolehlivým okolním stanicím.[30] My: poměr k_v(sektor) = medián(v_ref / v_stanice) po 8 sektorech směru, aplikovat jen na srovnání s modely, ne na zobrazovanou „naměřenou“ hodnotu.

### 4.2 Odvozené veličiny
- **Rosný bod (Magnus)**: γ = ln(RH/100) + 17,62·T/(243,12+T); Td = 243,12·γ/(17,62−γ).
- **Pocitová teplota**: BoM/Steadman AT = T + 0,33·e − 0,70·v − 4,00, e = RH/100·6,105·exp(17,27·T/(237,7+T)) (v m/s)[unverified — vzorec uveden zpaměti; BoM stránka potvrzuje jen, že AT podle Steadmana vyjadřuje vnímání průměrného člověka][35]. Wind chill (T ≤ 10 °C, v > 4,8 km/h): 13,12 + 0,6215T − 11,37v^0,16 + 0,3965T·v^0,16 (v v km/h) [unverified]. Stanice už `feels_like` a `windchill` posílá — UI je zobrazí, derive.py je potřeba hlavně pro **předpovědní** body, aby byly konzistentní.
- **Tlak**: MSL z absolutního tlaku a výšky stanice (hypsometricky, s T) — srovnávat jen like-for-like (WEA-016). **Implementováno (#131 A, `derive.msl_pressure`)**: p₀ = p · exp(g·h / (R_d · T̄)), T̄ = T + 273,15 + 0,0065·h/2 (střední teplota fiktivního sloupce se standardním gradientem), g = 9,80665, R_d = 287,05; suchý vzduch (chyba bez virtuální teploty < 0,3 hPa ve výšce ~400 m). Bez teploty se použije ISA sloupec. Test: ICAO standardní atmosféra (954,61 hPa / 500 m / 11,75 °C → 1013,25 hPa; 898,75 hPa / 1000 m / 8,5 °C → 1013,25). Výběr zdroje (`resolve_pressure`): ABS + výška → odvozený MSL (i když stanice posílá REL; konstantní offset Ecowitt neznáme teplotu). REL rovný ABS (± 0,5 hPa) = offset nenastaven → REL se ignoruje, flag `station.pressure.relative_ignored`. Bez ABS: REL < 955 hPa u stanice ≥ 100 m n. m. je fyzikálně nemožný MSL → bere se jako absolutní (`relative_as_absolute`). Bez výšky se nic nepřepočítává a REL = ABS se nezobrazí (nevymýšlíme).
- **Výška** (#131 A): HA `core.config.elevation` = 0 / None znamená „nenastaveno“; doplní ji `options.weather.elevation_m`. Efektivní výška jde do snapshotu (`location.elevation_m`, `location.elevation_source` = `ha` | `option`) a do všech Open-Meteo dotazů jako `elevation` (statistický downscaling; bez parametru Open-Meteo použije 90m DEM — [docs](https://open-meteo.com/en/docs)). Neznámá výška → parametr se neposílá. **Tendence 3 h** Δp3 = p(t) − p(t−3h): ustálený |Δ| < 0,1; pomalu 0,1–1,5; 1,6–3,5; rychle 3,6–6,0; velmi rychle > 6 hPa [unverified, běžné synoptické třídy]. Šipky ↑↗→↘↓.
- **Trendové šipky pro T/RH/vítr**: sklon lineární regrese za 60 min; práh T ±0,5 °C/h.
- **Intenzita deště** (mm/h): slabý < 2,5; mírný 2,5–7,6; silný 7,6–50; přívalový > 50 [unverified, AMS-like třídy].
- **Riziko mrazu** (noc): high, když (bias-korigované Tmin_2m ≤ 1 °C) nebo (Tmin ≤ 3 °C ∧ oblačnost < 30 % ∧ vítr < 2 m/s ∧ Td ≤ 0 °C); validace půdním půdním čidlem a kanály T u země.
- **Komfort**: kategorie z Td (suché < 10, příjemné 10–16, dusno > 18 °C) [unverified].
- **Slunce/měsíc**: východ/západ/zlatá hodina/fáze Měsíce lokálně (astral / astronomické vzorce), denní délka a změna vs. včera.

### 4.3 Bias korekce („MOS-lite“)
Klouzavý průměr s exponenciálním zapomínáním jako NOAA NAEFS: b = f − o; B_t = (1−w)·B_{t−1} + w·b_t; korigovaná předpověď F = f − B; NAEFS používá w = 0,02 (≈ 50–60 dní paměti).[31]
- Klíč: (zdroj, veličina, lead bucket {0–6, 6–12, 12–24, 24–48, 48–72, 72–120, 120+ h}, hodina dne v 3h binech). Pro dům doporučeno **w = 0,07** (≈ 2 týdny, sleduje sezónu rychleji) — laditelné.
- Shrinkage, dokud je málo dat: B_applied = B · n/(n + 10); korekce až od n ≥ 7; clamp |B| ≤ 4 °C (T, Td).
- T, Td: aditivní. Vítr: multiplikativní poměr (expozice stanice). Srážky: **bez korekce** v MVP (piezo + konvektivní šum), jen verifikace. Tlak: aditivní na MSL (opraví i kalibraci barometru).
- Učí se jen z hodin s `qc = ok`. Inspirace: Tempest Nearcast koriguje chyby a biasy NWP pomocí reálných pozorování ze stanic.[29]

### 4.4 Blend (multi-model)
- Váhy z verifikace: w_m(v,L) ∝ 1 / (MAE_m(v,L)² + ε), normalizace na Σ = 1, podlaha 0,05, strop 0,5 (žádný model nedominuje).
- Před dostatkem dat (n < 14 dní) priorové váhy: 0–48 h ALADIN 0,25, ICON-D2 0,25, C-LAEF 0,15, ICON-EU 0,1, IFS 0,15, UKMO 0,1; 48–240 h IFS 0,35, AIFS 0,2, ICON 0,15, GFS 0,1, UKMO 0,1, met.no 0,1 (met.no a IFS jsou korelované → součet jejich vah ≤ 0,45).
- Konec horizontu modelu: lineární útlum váhy v posledních 6 h jeho horizontu (ALADIN 72 h, ICON-D2 48 h, C-LAEF 60 h) → žádné skoky v grafu. Open-Meteo dělá podobné „sešívání“ nejvyšších rozlišení v `best_match`/seamless.[2] Pirate Weather volí zdroj podle veličiny a priority modelů — dobrý vzor pro per-variable výběr.[24]
- Srážky: **PoP_blend** = Σ w_m · 1[precip_m ≥ 0,1 mm/h] (+ ensemble členy, mají-li data); množství = vážený medián. Condition: odvodit z blendovaných veličin (oblačnost, srážky, T pro sníh), ne hlasováním ikon.
- **Váhy po veličinách (implementováno #131 B).** Teplota (a vítr, oblačnost, tlak) dál podle MAE teploty. Srážky a PoP mají vlastní váhy `blend.precip_weights`:
  - skill_m = průměr(max(0, ETS_{≥0,2 mm/h}), max(0, BSS)) pro (zdroj, lead bucket `0-24 | 24-48 | 48-72 | 72+`), jen když má zdroj ≥ `PRECIP_MIN_PAIRS` = 240 hodinových párů a ≥ 12 deštivých hodin;
  - λ_m = n / (n + 480); w_m = (1 − λ)·prior_m + λ · M · skill_m / Σ skill, kde M je součet priorových podílů ověřených zdrojů — ověřené zdroje si přerozdělují jen **svou** priorovou hmotu (jeden šťastný model nepřebere celý mix);
  - stejný útlum na konci horizontu, podlaha 0,05 a strop 0,5 jako u teploty. Výstup `precip_contributors` + `precip_weights: prior | verified`.
- **PoP (implementováno #131 B):** hlas zdroje = vlastní PoP modelu, jinak 1[precip ≥ **0,2 mm/h**] (`POP_THRESHOLD_MM_H`, dřív 0,1 → méně „mrholivého“ nadhodnocení vůči piezo srážkoměru); vážené srážkovými vahami → `pop_raw`; volitelně (flag) 50 : 50 s pravděpodobností z ICON-D2-EPS do 48 h; pak kalibrace na stanici: reliability binning `pop_raw` blendu (10 košů, shrinkage k středu koše s váhou 20 párů, vážená izotonická regrese), aktivní od 500 párů, lineární interpolace mezi středy košů.
- Výstup vždy s `contributors` (kdo a jakou vahou) — transparentnost pro UI.

### 4.5 Nejistota
- Multi-model: σ_mm = √(Σ w_m (F_m − F_blend)²).
- Ensemble: P10/P50/P90 z členů (ICON-D2-EPS 0–48 h, IFS ENS 2–15 d)[4]; po bias korekci posunout celé rozdělení o B.
- Confidence: high, pokud (P90 − P10) < 2 °C (T) a PoP ∉ (0,3; 0,7); low, pokud > 5 °C nebo PoP ∈ (0,4; 0,6). UI: pás ± a textový štítek „jistota“.

### 4.6 Verifikace („který model se trefuje“)
- Denní job: Open-Meteo Previous Runs (`*_previous_day1..3`)[5] pro všechny modely + vlastní `fc_archive` pro met.no/blend → spárovat s `obs_hourly`.
- Metriky: ME (bias), MAE, RMSE pro T, Td, vítr, MSL; srážky: Brier score PoP (událost ≥ 0,2 mm/h), denní kontingence ≥ 1 mm → POD, FAR, CSI; skill vs. persistence: SS = 1 − MAE_m/MAE_persist.
- Okna 7 / 30 / 90 dní; zobrazit jen s n ≥ 48 párů; pořadí s intervalem (bootstrap 200×) — rozdíly pod šumem označit „nerozhodně“.
- Previous Runs má archiv od 01/2024 → lze i zpětný bootstrap, jakmile je historie stanice v LTS.[5]
- **Srážky – implementováno (#131 B, `verify.py`, noční job v `coordinator._verify_precip`):**
  - Pozorování: hodinový `change` statistiky denního srážkoměru (`weather_rain_daily`, `state_class: total_increasing`, HA řeší půlnoční nulování) přes veřejné `statistics_during_period` v recorder executoru. Řádek statistiky se `start` S pokrývá [S, S+1 h) → páruje se s předpovědí platnou v S+1 h (Open-Meteo: „součet předchozí hodiny“). met.no z HA dává srážky za [t, t+1 h) → při načtení posunuto o hodinu (`metno_ha.to_interval_end`).
  - Předpovědi: vlastní archiv (`fc_archive`, všechna vydání, lead 1–72 h, i met.no a blend) + Open-Meteo Previous Runs (`https://previous-runs-api.open-meteo.com/v1/forecast`, `precipitation_previous_day1..3`; „_previous_day1 is the value that was predicted 24 hours before valid time“ — [docs](https://open-meteo.com/en/docs/previous-runs-api)) → lead 24/48/72 h. Neověřeno v dokumentaci: parametry `models`, `start_date`/`end_date` (stránka říká jen „supports the same models as the Weather Forecast API“) – převzato z Forecast API.
  - Job: jednou za noc po 03:00 místního času, backoff `BACKOFF_S`, po vyčerpání čeká na další noc. Bootstrap = okno 90 dní (starší páry se stejně nehodnotí), v chuncích po 28 dnech, strop 50 vážených volání (§3.2).
  - Metriky (per zdroj × lead bucket, okno 90 dní): kontingence a POD, FAR, CSI, ETS, frekvenční bias pro ≥ 0,2 a ≥ 1 mm/h; denní součty (jen úplné místní dny, DST 23/25 h) pro ≥ 1 a ≥ 5 mm; bias množství (mm/h) a poměr Σ předpověď / Σ měření; Brier skóre PoP (událost ≥ 0,2 mm/h; deterministický model bez PoP = 0/1) a BSS proti klimatologii vzorku. Nedefinované skóre (dělení nulou) = `null`, nikdy 0. Vzorce v hlavičce `verify.py`.
  - UI „Kdo se trefuje“: záložka **Déšť** – pořadí podle ETS ≥ 0,2 mm/h na pevné stupnici 0–1 se slovním hodnocením (≥ 0,4 „dobrá“, 0,2–0,4 „průměrná“, < 0,2 „slabá“; `rainScore.ts`), pod tím „zachytí X % hodin s deštěm“ (POD), „z předpovězených dešťových hodin nepršelo Y %“ (FAR) a velikost vzorku „z N deštivých hodin za D dní“ (`wet_hours` / `days` = různé hodiny a dny; `n` počítá páry, jedna hodina má víc vydání). Zdroje bez `enough` jsou v seznamu jako „málo dat“ bez pořadí; pod 40 deštivými hodinami u nejlepšího zdroje ukáže karta upozornění „Zatím málo dat“. Brier jen v rozbalení „chyba pravděpodobnosti, nižší = lepší“. Ukazuje bucket `0-24` (vlastní archiv), dokud nemá ověřené řádky, pak `24-48` (Previous Runs).
  - **Mix se hodnotí mimo vzorek (rolling origin):** jen z vlastního archivu blendu. Předpověď vydaná v čase T použila váhy z poslední noční verifikace N ≤ T, která znala jen hodiny s koncem ≤ N; páry té předpovědi platí po T (předstih > 0), takže nikdy nejsou ve vzorku, z něhož její váhy vznikly. `verify.blend_out_of_sample` zahodí blend pár s předstihem ≤ 0, řádek blendu nese `out_of_sample: true` (test `test_blend_is_scored_out_of_sample_rolling_origin`). Pozor: Mix má kratší vzorek (jen vlastní archiv) než modely s Previous Runs – proto je u každého řádku velikost vzorku.

### 4.8 Naměřená historie stanice (implementováno #131 A)
- WS `homebrain/weather/history` `{period: day|hour, days: 1–400}` (hodiny max 31 dní). Jen veřejné recorder API: `statistics_during_period(..., "hour", units, types)` v `get_instance(hass).async_add_executor_job` (stejně jako Energie/Topení). HomeBrain nic neukládá.
- Agregace v Pythonu po místních dnech (`history.aggregate_days`): teplota min/max/průměr (z hodinových min/max/mean), srážky = Σ hodinových `change` (záporné = výměna čítače → zahozeno), max intenzita (`weather_rain_rate` max), max náraz, průměrná vlhkost, MSL průměr (hodinově přes `resolve_pressure`), solární energie = Σ hodinových průměrů W/m² / 1000 (kWh/m²).
- **Mezery:** každý den nese `hours` (pokrytí po veličinách), `expected_hours` (23/24/25; dnes jen zkompilované hodiny, prodleva 15 min) a `gaps`. Hodnoty se počítají jen z dostupných hodin, nic se neinterpoluje; dny bez dat uvnitř období zůstanou s `null`, úvodní dny před vznikem stanice se vynechají.
- Cache 15 min v rámci hodiny. Role: jako `weather/get` (mapovaní uživatelé, ne host).
- UI: karta **„Včera a dnes“** – mřížka veličina | včera | dnes zatím (do HH:MM) | Δ; Δ = dnes zatím proti celému včerejšku, pod prahem `DELTA_NEUTRAL` (0,5 °C, 0,2 mm, 1 m/s, 1 hPa) „≈ stejně“; chybějící hodnota „–“ s titulkem „chybí data“ (nikdy 0,0); náraz ≥ 15 m/s (`GUST_STRONG_MS`) barvou výstrahy; tučně dnešní novinka (dnešní srážky), dny bez deště od včerejška — mezera počítání zastaví, „aspoň N dní“. Karta **„Historie“** 7 / 30 / 365 dní: teplota min–max nahoře (2–3 kulaté značky °C, mřížka, čára 0 °C), srážky ve vlastním dolním panelu (0 a zaokrouhlené maximum ≥ nejvlhčí den okna), mezery šrafou (neutrální, kontrast ≥ 3 : 1), vybraný den obrys + kurzor; výběr tažením po celé ploše grafu nebo šipkami; „Dny s deštěm ≥ 1 mm N z M“ (M = dny se známým úhrnem); rekordy za zvolené okno + měsíc (7 dní) / rok (30, 365 dní), s „data od …“ pokud data nezačínají začátkem měsíce/roku; štítek „rekord“ u vybraného dne.

### 4.9 Fáze B2 – jen návrh (neimplementováno)
**0–2 h nowcast blending.** Dnes: stanice > radar ČHMÚ (`fct_maxz`, 0–60 min) > ICON-D2 `minutely_15`. Návrh: pro hodiny +1 a +2 v hodinovém blendu nahradit modelové srážky váženou směsí w_nc(L)·R_nowcast + (1 − w_nc(L))·R_blend s w_nc lineárně 1 → 0 mezi 0 a 120 min (STEPS-like „blending“ bez optického toku v HA). R_nowcast = max(intenzita z dBZ v kruhu r (Marshall–Palmer), ICON-D2 15 min) po korekci na stanici. Ověřovat stejnými metrikami (POD/FAR pro „začne do 30 min“), w_nc ladit z kontingence. Riziko: ČHMÚ extrapolace jen 60 min → 60–120 min jen `minutely_15`.
**QC srážkoměru (piezo WS90) proti ČHMÚ.** Nejbližší automatická stanice ČHMÚ z opendata (`/meteorology/weather/now/data/1h-<WSI>-<YYYYMMDD>.json`, prvek `SRA1H`; metadata stanic z opendata; výběr podle vzdálenosti a výšky, max. ~10 km) → denní páry stanice vs. ČHMÚ za deštivé dny (≥ 1 mm u ČHMÚ). Odhad gainu g = Σ ČHMÚ / Σ WS90 s bootstrap intervalem; doporučení (ne zápis!) „zvyš rain gain v aplikaci Ecowitt o X %“ až když interval nepřekrývá 1 po ≥ 15 deštivých dnech; zvlášť pro slabé (< 2 mm/h) a silné srážky (WS90 má 5 pásem gainu). Konvektivní dny (rozdíl > 3× a > 5 mm) vyřadit jako prostorový nesoulad. Licence CC BY 4.0, atribuce ČHMÚ už v UI je. URL a prvky ověřit proti dokumentaci opendata před implementací.

### 4.7 Nowcast „prší / začne za X min“
1. **Teď**: `rain_state_piezo` = true nebo rate > 0,2 mm/h → „prší“ (stanice má přednost před radarem).
2. **0–60 min**: ČHMÚ `fct_maxz` (extrapolace ČHMÚ, 10min kroky do 60 min[13]) — maximum dBZ v kruhu r kolem domu; „začne za X“ = první krok s max ≥ prah. Výchozí r = 3 km, prahy 12 dBZ „prší“ a 18 dBZ „bude pršet“ převzaty jako ověřené výchozí hodnoty z `ha-chmu-meteogram` (12 dBZ ≈ mrholení, 28 ≈ vydatné, 40 ≈ liják).[12] Intenzita: Marshall–Palmer Z = 200·R^1,6 → R = (10^(dBZ/10)/200)^(1/1,6) [unverified].
3. **1–6 h**: 15min srážky ICON-D2/AROME z Open-Meteo (`minutely_15`)[2], v blendu.
4. Blesky: nejbližší úder + trend vzdálenosti (Blitzortung) → „bouřka se blíží/vzdaluje“.
- Vlastní optical-flow (pySTEPS, BSD-3[32]) **nedoporučeno** v HA integraci (těžké závislosti); ČHMÚ extrapolaci už počítá za nás.
- Verifikace nowcastu: hit/miss „rain in 30 min“ vs. stanice → ladění prahů a r.

## 5. UI — widgety obrazovky Počasí (information-dense web app)

| # | Widget | Data | Fáze |
|---|---|---|---|
| 1 | **Teď ze stanice (hero)**: T, pocitová, RH, Td, vítr + nárazy + kompas, tlak + tendence 3 h, déšť dnes; trendové šipky, QC/stale badge | stanice, derive | MVP |
| 2 | **Nowcast pruh**: „Začne pršet za ~25 min (slabý)“ + 0–120 min sloupcový graf intenzity | stanice, ČHMÚ fct_maxz, ICON-D2 15 min | MVP |
| 3 | **Výstrahy ČHMÚ**: banner dle závažnosti, rozbalitelný text + doporučení + platnost | ČHMÚ CAP/alerts.json | MVP |
| 4 | **Hodinový výhled 48 h**: T (blend) + pás P10–P90, sloupce srážek + PoP, vítr šipky, ikony | blend, ensemble | MVP (pás fáze 2) |
| 5 | **10 dní**: min/max + rozptyl, PoP, srážky, vítr, „jistota“ | blend (IFS/AIFS/…) | MVP |
| 6 | **Srovnání modelů**: multi-line graf T a srážek po modelech, přepínač veličin, zvýraznění blendu a stanice (minulost) | Open-Meteo multi-model, met.no | MVP |
| 7 | **Ensemble „špagety“/fan chart** | ICON-D2-EPS, IFS ENS | fáze 2 |
| 8 | **Radar**: mapa s timeline −2 h … +60 min, play/pause, kruh r, legenda dBZ | ČHMÚ radar | MVP |
| 9 | **Blesky**: vzdálenost, počet za 15 min, azimut | Blitzortung | fáze 2 |
| 10 | **AQ / pyl / UV**: European AQI, hlavní polutant, pyl dle druhu (sezónně skrytý), UV max dnes + čas | Open-Meteo AQ, stanice UV | MVP |
| 11 | **Slunce & Měsíc**: východ/západ, délka dne ±, zlatá hodina, fáze Měsíce; solar W/m² teď vs. teoretické jasno | astro, stanice | MVP |
| 12 | **Scoreboard „Který model se trefuje“**: tabulka MAE/bias T 24 h, Brier srážek, 7/30/90 d, vítěz s n | verifikace | fáze 2 |
| 13 | **Stanice vs. předpověď posledních 24 h**: naměřeno vs. co předpovídaly modely včera | obs + previous runs | fáze 2 |
| 14 | **Mráz/komfort/doporučení**: riziko mrazu v noci, dusno, vítr na sušení prádla… (jen pravidla, WEA-017) | derive, blend | fáze 2 |
| 15 | **Mikroklima**: kanály T/RH 1/7/8, půda, indoor | stanice | MVP |
| 16 | **Zdroje a čerstvost**: seznam zdrojů, stáří, run time, atribuce/licence | SourceMeta | MVP |
| 17 | **Summary pro „Dnes“** (WEA-011): T teď, max/min, déšť za X min, výstraha | blend | MVP |

Layout: desktop 12-col grid (hero + nowcast + výstrahy nahoře, hodinový graf přes celou šířku, pod tím srovnání modelů | radar, spodní řada AQ/slunce/scoreboard); mobil = stack v pořadí 3 (jen při výstraze) → 1 → 2 → 4 → 8 → 5 → ostatní. Barvy modelů konzistentní napříč grafy; blend vždy výrazný, modely tenké.

## 6. GitHub issues (`h0nz1k/homebrain`)

1. **weather: normalizační kontrakt multi-source + fixtures** — Akceptace: zod/JSON schema `ForecastSeries`, `BlendPoint`, `StationObs`, `SourceMeta`; ≥ 8 fixtures (výpadek zdroje, stale, partial horizon, neznámý condition); žádné `entity_id` (WEA-013).
2. **weather: Open-Meteo multi-model fetcher v integraci** — Akceptace: jeden dotaz pro 8 modelů, coordinator 60 min + backoff, `User-Agent`, `SourceMeta.status` per model (null série → `unavailable`, ne 0); pytest s nahraným JSON; odhad volání/den logován a < 1 000.
3. **weather: met.no z HA přes `weather.get_forecasts` server-side** — Akceptace: normalizace do kontraktu, výpadek nesnáší stanici (WEA-010).
4. **weather: station adapter + QC** — Akceptace: bindings na logické klíče, převod jednotek z `unit_of_measurement` (pozor „*_rain_rate_piezo“ akumulace), flagy range/spike/stale/low_power/radiation_bias; unit testy na syntetických řadách.
5. **weather: derived values (Td, pocitová, wind chill, tendence tlaku, frost, intenzita deště)** — Akceptace: čisté funkce + testy proti referenčním tabulkám; tendence 3 h s třídami a šipkou.
6. **weather: ČHMÚ výstrahy (CAP + alerts.json pro ORP)** — Akceptace: filtr na ORP domova, mapování závažnosti na barvu, text/doporučení/platnost; poll 10 min; WS `homebrain/weather/alerts`; `sensor.homebrain_warning_level`; atribuce ČHMÚ (WEA-015).
7. **weather: ČHMÚ radar proxy + nowcast „rain ETA“** — Akceptace: authenticated view s cache 24 snímků + `fct_maxz`; `availableOffsets` v kontraktu (WEA-014); `sensor.homebrain_rain_eta_min` s nastavitelným r/prahy (výchozí 3 km/12/18 dBZ); stanice má přednost; test na uložených PNG.
8. **weather: SQLite store `/config/homebrain/weather.db` + migrace** — Akceptace: tabulky z §3.4, schema_version, retention job, test migrace v1→v2.
9. **weather: verifikační job (Previous Runs API) + scoreboard WS** — Akceptace: denní MAE/ME/RMSE/Brier per zdroj×veličina×lead; minimum n; WS `homebrain/weather/verification`; dokumentovaný like-for-like vzorec pro tlak (WEA-016).
10. **weather: bias korekce (decaying average) + blend s vahami** — Akceptace: B_t s w konfigurovatelným, shrinkage, clamp; blend s `contributors`; regresní test: syntetický model s biasem +2 °C je po 14 dnech korigován na |bias| < 0,5 °C.
11. **weather: ensemble spread (ICON-D2-EPS, IFS ENS)** — Akceptace: P10/P50/P90 + confidence v `BlendPoint`; respektuje rozpočet volání.
12. **weather: Open-Meteo AQ/pyl/UV** — Akceptace: European AQI, pyl dle druhu, UV max; sezónní skrytí pylu; atribuce CAMS.
13. **weather-ui: obrazovka Počasí v2 (widgety 1–6, 8, 10, 11, 15–17)** — Akceptace: visual gate 360×800 / 800×1280 / 1440×900 light/dark (WEA-007), stavy loading/stale/unavailable pro každý widget, provenance u každého čísla (WEA-001).
14. **weather-ui: srovnání modelů + scoreboard + ensemble pás** — Akceptace: graf ≥ 6 sérií čitelný na mobilu (přepínání), barvy konzistentní, scoreboard skryt dokud n < minimum.
15. **weather: neighbour QC z ČHMÚ stanic (fáze 2)** — Akceptace: výběr 3–5 nejbližších stanic, výškový přepočet, flag `neighbour_mismatch`, kontrola tlaku.
16. **docs: atribuce a licence zdrojů počasí** — Akceptace: `docs/requirements/weather-sources.md` s licencemi, limity a povinnou atribucí; obrazovka „Zdroje“ ji zobrazuje.

## 7. Lekce z existujících projektů (shrnutí)
- **Open-Meteo**: modely se „sešívají“ podle rozlišení do souvislé řady; pro CZ je nativní ČHMÚ ALADIN až 1 km.[2] Previous Runs API výslovně cílí na měření skillu dle lead time a trénink bias korekce.[5]
- **Pirate Weather**: per-veličina prioritní řetězec zdrojů (v Evropě MOSMIX → IFS).[24]
- **Tempest Nearcast**: síť stanic validuje data, kalibruje přístroje a koriguje biasy NWP.[29]
- **NOAA NAEFS**: jednoduchý decaying-average bias (w = 0,02) je osvědčený první krok před EMOS.[31]
- **WeeWX**: QC začíná jednoduchými min/max mezemi v pipeline před uložením.[33]
- **HA komunita**: domácí stanice mají systematické chyby umístění (vítr), řeší se kalibrací vůči okolním stanicím.[30]
- **ha-chmu-meteogram**: pro ČR je „prší/bude pršet“ z radaru ČHMÚ s laditelnými prahy dBZ praktičtější než globální radarové API.[12] RainViewer svůj nowcast k 1. 1. 2026 zrušil.[17]

## Otevřené otázky pro vlastníka
0. (#131) **Vyřešeno 2026-11-18:** `geosphere_arome_austria` od 2026-11-04 vrací pro budoucí hodiny jen `null` (ověřeno dotazem na Forecast API), nahrazen `geosphere_claef_austria` (C-LAEF AlpeAdria 1 km, 60 h, stejný horizont i prior). `icon_d2`/`icon_eu` názvy zůstávají; Open-Meteo je po 2026-11-30 přepne na nativní mřížky beze změny názvu. Previous Runs API ověřeno živě s `models=`, `start_date`, `end_date` a `precipitation_previous_dayN`. Otevřené: smí HomeBrain v bezplatném režimu používat Ensemble API (FAQ pricing je nejednoznačné)?
1. Výška senzoru stanice nad zemí a okolní překážky (pro korekci větru)?
2. Má HomeBrain zakládat výstupní entity (§3.5) pro automatizace, nebo jen panel?
3. Sdílet stanici na WU/WOW/Windy (nastavuje se v gatewayi)?
4. Je přijatelné použít nedokumentované ČHMÚ endpointy (`alerts.json`, meteogram), nebo jen čisté opendata (CAP)?
5. Instalovat `homeassistant-blitzortung` (HACS) ve fázi 2?

## Sources

[1] https://open-meteo.com/en/terms — Open-Meteo Terms
[2] https://open-meteo.com/en/docs — Open-Meteo Forecast API docs (model list)
[3] https://github.com/open-meteo/open-meteo/issues/1998 — Open-Meteo issue #1998 chmi_aladin_cz_1km nulls (closed 2026-07-20)
[4] https://open-meteo.com/en/docs/ensemble-api — Open-Meteo Ensemble API
[5] https://open-meteo.com/en/docs/previous-runs-api — Open-Meteo Previous Runs API
[6] https://open-meteo.com/en/docs/air-quality-api — Open-Meteo Air Quality API
[7] https://docs.api.met.no/doc/TermsOfService — MET Norway API Terms of Service
[8] https://docs.api.met.no/doc/FAQ.html — MET Norway API FAQ
[9] https://www.ecmwf.int/en/forecasts/datasets/open-data-0 — ECMWF Open data
[10] https://www.chmi.cz/-/jak-mohu-pou%C5%BE%C3%ADvat-otev%C5%99en%C3%A1-data-%C4%8Dhm%C3%BA- — ČHMÚ: Jak mohu používat otevřená data
[11] https://opendata.chmi.cz/meteorology/weather — ČHMÚ opendata – meteorology/weather index
[12] https://github.com/hruskin/ha-chmu-meteogram — hruskin/ha-chmu-meteogram README
[13] https://github.com/hruskin/ha-chmu-meteogram/blob/refs/heads/main/docs/TECHNICAL.md — ha-chmu-meteogram TECHNICAL.md
[14] https://github.com/nijel/hass-chmi-alerts — nijel/hass-chmi-alerts
[15] https://meteoalarm.org/en/live/page/terms-and-conditions — MeteoAlarm Terms and Conditions
[16] https://meteoalarm.org/en/live/page/redistribution-hub — MeteoAlarm Redistribution Hub
[17] https://www.rainviewer.com/api/transition-faq.html — RainViewer API Transition Summary
[18] https://www.rainviewer.com/api.html — RainViewer API
[19] https://api.windy.com/point-forecast/pricing — Windy Point Forecast pricing
[20] https://content.meteoblue.com/en/about-us/legal/commercial-non-commercial-use — meteoblue commercial/non-commercial use
[21] https://www.meteoblue.com/en/weather-api — meteoblue Weather API
[22] https://openweathermap.org/full-price.md — OpenWeatherMap pricing and limits
[23] https://rapidapi.com/alexander0042/api/pirateweather/pricing — Pirate Weather pricing (RapidAPI)
[24] https://docs.pirateweather.net/en/latest/DataSources — Pirate Weather Data Sources
[25] https://github.com/mrk-its/homeassistant-blitzortung — homeassistant-blitzortung
[26] https://www.home-assistant.io/integrations/open_meteo — HA Open-Meteo integration
[27] https://www.home-assistant.io/integrations/ecowitt — HA Ecowitt integration
[28] https://github.com/Ecowitt/ha-ecowitt-iot — Ecowitt official ha-ecowitt-iot
[29] https://business.tempest.earth/nearcast-technology — Tempest Nearcast AI
[30] https://community.home-assistant.io/t/using-ha-to-improve-the-output-of-my-tempest-weather-station/821550 — HA community: improving Tempest station output
[31] https://emc.ncep.noaa.gov/gmb/ens/WkShopOct13/program/pdf/S3-04-Guan_NAEFS_SPP-3.pdf — NOAA NAEFS SPP decaying average bias correction
[32] https://github.com/pySTEPS/pysteps — pySTEPS
[33] https://weewx.com/docs/latest/reference/weewx-options/stdqc — WeeWX StdQC
[34] https://chmi.skerik.me — CHMI Data Parser (unofficial JSON over ČHMÚ opendata)
[35] https://bom.gov.au/climate/maps/averages/apparent-temperature — BoM apparent temperature
[36] https://open-meteo.com/en/pricing — Open-Meteo pricing – API call definition
[37] https://open-meteo.com/en/docs/historical-forecast-api — Open-Meteo Historical Forecast API

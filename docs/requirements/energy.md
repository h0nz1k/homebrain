# Energie – požadavky

Stav: sklizeno 2026-10-31 (issue #13). Zdroje: `donor/energy@fc4419a`, `donor/energy#5@4ba7ad2`, `HA revize 2026-10-31`, `ADR-0001 §5.3`.

## Rozsah

Přehled s omezenou konfigurací (ENE-017) hybridní FVE (GoodWe), třífázové spotřeby (Shelly 3EM), baterie, volitelně EV, predikce `forecast.solar` a spotové ceny elektřiny a plynu (HACS CZ spot integrace). Dlouhá historie jen odkaz na InfluxDB/Grafana, ne embed v MVP (`ADR-0001 §4.1`).

## Datové vstupy (logické klíče)

| klíč | doména/typ | jednotka | povinný (MVP) | poznámka |
| --- | --- | --- | --- | --- |
| `energy_pv_power` | sensor | kW | ano | GoodWe PV |
| `energy_pv1_power`, `energy_pv2_power` | sensor | kW | ne | výkon stringů PV1/PV2 (detail uzlu Slunce) |
| `energy_grid_power` | sensor | kW | ano | import+/export− konvence v adaptéru |
| `energy_battery_soc` | sensor | % | ano | |
| `energy_battery_power` | sensor | kW | ne | nabíjení/vybíjení |
| `energy_inverter_status` | sensor | enum/text | ne | pracovní režim (GoodWe `work_mode`) → Normální / Offgrid / Porucha / Standby |
| `energy_inverter_power` | sensor | kW | ne | AC výstup střídače (+ do rozvaděče, − nabíjení baterie ze sítě); bez něj se dopočte z toků |
| `energy_inverter_l1_power` … `energy_inverter_l3_power` | sensor | kW | ne | AC výstup střídače po fázích (detail střídače) |
| `energy_inverter_error` | sensor | text / kód | ne | chyba střídače (text GoodWe `errors` nebo číselný kód); v UI česky, prázdné/0 = bez chyby |
| `energy_pv1_voltage`, `energy_pv2_voltage` | sensor | V | ne | napětí stringů (detail střídače) |
| `energy_battery_voltage`, `energy_battery_current` | sensor | V / A | ne | DC strana baterie (detail střídače) |
| `energy_inverter_temp_radiator` | sensor | °C | ne | teplota chladiče (Radiator) – chip na uzlu střídače; nikdy `Inverter Temperature (Module)` (stále 0) |
| `energy_inverter_temp_air` | sensor | °C | ne | vnitřní vzduch střídače (detail) |
| `energy_battery_temp` | sensor | °C | ne | teplota baterie (BMS) |
| `energy_battery_cell_temp_max` | sensor | °C | ne | chip na uzlu baterie |
| `energy_battery_cell_temp_min` | sensor | °C | ne | rozptyl teplot článků |
| `energy_battery_cell_voltage_max` | sensor | V | ne | rozptyl napětí článků (vyvážení, mV) |
| `energy_battery_cell_voltage_min` | sensor | V | ne |  |
| `energy_battery_soh` | sensor | % | ne |  |
| `energy_tariff_price_vt` | input_number | Kč/kWh | ne | Cena odběru VT s DPH (vše za kWh) |
| `energy_tariff_price_nt` | input_number | Kč/kWh | ne | Cena odběru NT s DPH |
| `energy_tariff_fixed_monthly` | input_number | Kč/měs. | ne | Stálé měsíční platby s DPH (jistič, stálá platba, OTE) – rozpočítají se poměrně |
| `energy_tariff_hdo` | binary_sensor | on = NT | ne | Stav HDO; atributy s rozvrhem NT a next_change |
| `energy_tariff_next_change` | sensor | timestamp | ne | Čas další změny tarifu, když ho HDO senzor nemá v atributech |
| `energy_meter_correction` | input_number | × | ne | Korekce měření střídače na fakturační elektroměr (výchozí 1) |
| `energy_spot_distribution_vt` | input_number | Kč/kWh | ne | Srovnání se spotem: distribuce VT + systémové služby + daň s DPH |
| `energy_spot_distribution_nt` | input_number | Kč/kWh | ne | Totéž pro NT |
| `energy_spot_markup` | input_number | Kč/kWh | ne | Přirážka obchodníka ke spotu bez DPH (výchozí 0) |
| `energy_spot_fixed_monthly` | input_number | Kč/měs. | ne | Stálé platby spotového produktu s DPH (výchozí = stálé platby tarifu) |
| `energy_phase_l1_power` | sensor | kW | ano | Shelly L1 |
| `energy_phase_l2_power` | sensor | kW | ano | L2 |
| `energy_phase_l3_power` | sensor | kW | ano | L3 |
| `energy_grid_l1_power` … `energy_grid_l3_power` | sensor | kW | ne | výkon sítě po fázích na elektroměru (odběr +, dodávka −; GoodWe meter s opačnou konvencí se otočí podle salda) |
| `energy_grid_l1_current` … `energy_grid_l3_current` | sensor | A | ne | proud sítě po fázích (velikost; směr z výkonu). Bez nich odhad I ≈ P / 230 V (u nízkého účiníku podhodnocuje) |
| `energy_main_breaker` | input_number / sensor | A | ne | hlavní jistič na fázi (např. 3×25 A → 25); výchozí 25 A |
| `energy_pv_forecast_today` | sensor | kWh | ne | forecast.solar dnes |
| `energy_pv_forecast_tomorrow` | sensor | kWh | ne | zítřek |
| `energy_spot_price_electricity` | sensor | CZK/kWh | ano | aktuální spot |
| `energy_spot_prices_electricity_today` | sensor/attr | series | ano | hodinové/15min dne |
| `energy_spot_prices_electricity_tomorrow` | sensor/attr | series | ne | když publikováno |
| `energy_spot_price_gas` | sensor | CZK/MWh nebo kWh | ne | paralelní integrace |
| `energy_house_power` | sensor | kW | ne | odvozené nebo binding |
| `energy_ev_charge_power` | sensor | kW | ne | Enyaq — pokud entita existuje |
| `energy_ev_soc` | sensor | % | ne | |

**Odběr a dodávka současně (diagram toků):** Na třífázové přípojce může jedna fáze odebírat, zatímco jiné dodávají (hybridní střídač s nesymetrickou spotřebou). Diagram proto kreslí obě čáry sítě zároveň (síť → dům/baterie a FV/baterie → síť), každou s vlastní hodnotou, pokud jsou známé nezávisle: (1) `energy_grid_l1..l3_power` – odběr = součet kladných fází, dodávka = součet záporných; použije se jen když součet fází sedí se saldem (`energy_grid_power`, ± max(0,2 kW; 10 %)), (2) samostatné `energy_grid_import_power` + `energy_grid_export_power`, (3) jinak jen saldo `energy_grid_power` → jedna čára. Pozor: pokud jsou import/export jen šablony odvozené ze salda, nikdy nejsou nenulové zároveň. Bilance toků: FV + vybíjení + odběr = dům + nabíjení + dodávka (tolerance max(150 W; 5 %)). Detail uzlu Síť ukazuje odběr, dodávku, režim zdroje dat a fáze L1–L3; souhrn „Dnes“ vždy ukazuje odběr i dodávku (kWh za den mohou být obě nenulové).

**Podíl vlastních zdrojů (odznak „X % z vlastních zdrojů“):** počítá se z celé spotřeby, ne jen z domu: 1 − odběr ze sítě / (dům + nabíjení baterie). Odběr ze sítě zahrnuje síť → dům i síť → baterie, dodávka do sítě není spotřeba. Hodnoty jsou z téhož rozdělení toků jako čáry (po zaokrouhlení zobrazených čísel). Dokud se ze sítě cokoli odebírá, odznak nikdy neukáže 100 %. Příklad: slunce 4,7 kW, dům 1,6 kW, baterie se nabíjí 9,4 kW (slunce 3,1 + síť 6,3) → 1 − 6,3 / 11,0 = 43 % a nadpis „Slunce pokrývá dům, baterie se nabíjí i ze sítě“.

**Topologie diagramu (střídač jako uzel):** Hybridní střídač je středový uzel. FV stringy (DC) → střídač; baterie ↔ střídač (DC); střídač ↔ AC rozvaděč (AC výstup, záporný při nabíjení baterie ze sítě); síť ↔ rozvaděč (elektroměr na přípojce); rozvaděč → dům. Každá dvojice zdroj → cíl (`allocateFlows`) má vlastní pruh a vede přes střídač, kde to fyzicky platí (FV → dům/baterie/síť, baterie → dům/síť, síť → baterie přes AC stranu střídače); jen síť → dům střídač obchází po AC sběrnici. Pruhy se na společných úsecích řadí bez křížení (`LANE_ORDER`), hodnota toku sedí na posledním úseku k cíli. Uzel střídače ukazuje AC výkon a stav; detail: stringy FV (výkon/napětí), baterie (SoC/napětí/proud/teplota), AC po fázích, režim, výroba dnes a chyba česky.

Klíče `pv_power`, `phase_l1_power` atd. z donor kontraktu mapují na prefix `energy_*` v HomeBrain bindings.

### Konfigurace střídače (ENE-017)

| klíč | doména | jednotka | poznámka |
| --- | --- | --- | --- |
| `energy_battery_dod_ongrid`, `energy_battery_dod_backup` | number | % | Maximum vybití; UI zobrazuje rezervu = 100 − DoD |
| `energy_battery_keep_dod` | switch | on/off | udržování DOD |
| `energy_fast_charge` | switch | on/off | rychlé nabíjení; bezpečnostní automatizace vypíná ve VT |
| `energy_fast_charge_power`, `energy_fast_charge_soc` | number | % | výkon a cílové nabití |
| `energy_eco_power`, `energy_eco_soc` | number | % | ekonomický režim |
| `energy_export_limit_enabled` | switch | on/off | řízení dodávky |
| `energy_export_limit` | number | W | skutečný limit střídače, pouze čtení |
| `energy_inverter_mode`, `energy_ems_mode` | select | text | provozní a EMS režim, pouze čtení |

## Spotřebiče (issue #56)

Pevné volitelné sloty: `heat_pump` (tepelné čerpadlo, třífázový elektroměr), `dishwasher` (myčka, chytrá zásuvka), `coffee_maker` (kávovar, chytrá zásuvka), `dehumidifier` (odvlhčovač, venkovní chytrá zásuvka). Fáze L1–L3 modulu zůstávají spotřebou domu po fázích (střídač), nejsou to fáze elektroměru čerpadla.

| klíč | doména | jednotka | poznámka |
| --- | --- | --- | --- |
| `energy_appliance_<slot>_power` | sensor | W/kW | okamžitý výkon |
| `energy_appliance_<slot>_energy` | sensor | kWh, `total_increasing` | celkové počítadlo (statistiky recorderu) |
| `energy_appliance_<slot>_switch` | switch | on/off | volitelné, **jen pro čtení** – HomeBrain spínače nikdy neovládá |

- **Bez vazby** (ani výkon, ani energie) je spotřebič v kartě skrytý – žádné nuly.
- **Dnes kWh:** WS `recorder/statistic_during_period` s `fixed_period` od místní půlnoci do teď, `types: ['change']`. HA spojuje dlouhodobé (hodinové) a krátkodobé (5min) statistiky, takže hodnota je nejvýš ~5 min stará a přežije reset počítadla (výměna elektroměru, restart zásuvky). Rozdíl „stav teď − stav o půlnoci“ v panelu jsme odmítli: při resetu počítadla dává záporná/nesmyslná čísla a vyžaduje historii stavu. Selhání dotazu = `–`, ne 0.
- **Podíl na spotřebě domu:** dnes kWh spotřebiče / `energy_house_energy_today` × 100 (bez vazby domu se podíl neukazuje).
- **Stav:** `Běží` nad prahem slotu (čerpadlo 100 W, myčka 10 W, kávovar 15 W, odvlhčovač 30 W), `Pohotovost` 1 W až práh, `Vypnuto` pod 1 W nebo vypnutý spínač, `Dokončeno` (myčka), `Bez dat` při nedostupném/neplatném výkonu. Výkon zásuvky se mění jen při změně, proto je limit stáří 48 h.
- **Myčka dokončila (Dnes, notice):** WS `history/history_during_period` výkonu myčky za 6 h. Cyklus = výkon nad prahem alespoň 10 min (pauzy kratší než 5 min patří do cyklu); dokončení = 5 min pod prahem. Signál platí do 2 h od konce programu, zmizí dřív, když začne další cyklus (výkon nad prahem) nebo je výkon neznámý. Obsahuje jen domácí informaci bez osobních údajů → vhodný i pro kiosk. Akce jen navigace na Energie. Feed se obnovuje každou minutu; chyba = žádný signál.

## Požadavky

### ENE-001 – Okamžité KPI read-only

- **Popis:** Výroba, spotřeba domu, síť, baterie a EV v jednom pohledu bez ovládacích prvků.
- **Zdroj:** `donor/energy@fc4419a:docs/acceptance.md`; `docs/product-brief.md`
- **Priorita:** MVP
- **Akceptace:** Given načtený dashboard, When uživatel hledá tlačítko zápisu, Then žádné `callService` pro řízení nabíjení.

### ENE-002 – Tři fáze viditelné

- **Popis:** L1–L3 současně včetně trendu a rozdílu (phase spread).
- **Zdroj:** `donor/energy@fc4419a:docs/data-contract.md`; `docs/acceptance.md`
- **Priorita:** MVP
- **Akceptace:** When všechny tři fáze `ok`, Then UI zobrazí hodnoty a `phase_spread_kw` dle kontraktu.

### ENE-003 – Kvalita dat na každém klíči

- **Popis:** Metadata `quality ∈ {ok, stale, unavailable, invalid_unit, unverified_polarity}`.
- **Zdroj:** `donor/energy@fc4419a:docs/data-contract.md`; `ADR-0001 §4.3`
- **Priorita:** MVP
- **Akceptace:** Fixture s `invalid_unit` zobrazí StatusBadge; nepřepočítá se na tichou nulu.

### ENE-004 – Polarita sítě a baterie

- **Popis:** Import/export a charge/discharge jsou nezáporné kanály dle kontraktu; adaptér dokumentuje znaménko.
- **Zdroj:** `donor/energy@fc4419a:docs/data-contract.md`
- **Priorita:** MVP
- **Akceptace:** Unit test polarity pro mock GoodWe/Shelly; `unverified_polarity` until verified.

### ENE-005 – Denní energie vs. okamžitý výkon

- **Popis:** `*_energy_today` nesmí být zaměněno za kW senzory ani za cumulative counter bez `state_class`.
- **Zdroj:** `donor/energy@fc4419a:docs/data-contract.md`
- **Priorita:** MVP
- **Akceptace:** Validace bindings kontroluje `device_class`/`state_class` where applicable.

### ENE-006 – Spot cena teď a graf dne

- **Popis:** Aktuální CZ spot elektřiny a graf cen dne (15min/hodin dle integrace).
- **Zdroj:** `ADR-0001 §5.3`; `HA revize 2026-10-31`
- **Priorita:** MVP
- **Akceptace:** Given dnešní price array, When modul Energie, Then graf bez horizontálního overflow na 360×800.

### ENE-007 – Nejlevnější hodiny

- **Popis:** Zvýraznění nejlevnějších intervalů dne pro rozhodování (read-only).
- **Zdroj:** `ADR-0001 §5.3`; `docs/product-brief.md`
- **Priorita:** MVP
- **Akceptace:** Algoritmus najde minima v dnešním series; výsledek shodný s unit test fixture.

### ENE-008 – PV forecast solar

- **Popis:** Predikce výroby dnes/zítra z forecast.solar bindings.
- **Zdroj:** `HA revize 2026-10-31`; `donor/energy@fc4419a:docs/data-contract.md`
- **Priorita:** MVP
- **Akceptace:** When `energy_pv_forecast_today` unavailable, Then sekce skryta nebo empty state, ne nula.

### ENE-009 – Odvozené metriky a dělení nulou

- **Popis:** `self_sufficiency_percent` / `self_consumption_percent` jen se zdokumentovaným vzorcem a ochranou dělení nulou.
- **Zdroj:** `donor/energy@fc4419a:docs/data-contract.md`
- **Priorita:** MVP
- **Akceptace:** When `house_power=0`, Then percent ukáže `unknown`, ne `Infinity`.

### ENE-010 – Design system barvy toků

- **Popis:** Sémantické barvy FVE, spotřeba, síť, baterie dle design-system; EV ikona se zásuvkou.
- **Zdroj:** `donor/energy@fc4419a:docs/design-system.md`; `#5@4ba7ad2` asset briefs (inspirace)
- **Priorita:** MVP
- **Akceptace:** Visual review potvrdí barvy a flow diagram na 3 viewportech.

### ENE-011 – Summary pro Dnes

- **Popis:** Kompaktní export výkonů a spot ceny pro modul Dnes.
- **Zdroj:** `ADR-0001 §5.1`
- **Priorita:** MVP
- **Akceptace:** `energy.summary()` projde contract testem.

### ENE-012 – Odkaz na Grafana/Influx

- **Popis:** Tlačítko/odkaz na dlouhou historii mimo panel, ne iframe embed.
- **Zdroj:** `ADR-0001 §4.1`; `HA revize 2026-10-31`
- **Priorita:** MVP
- **Akceptace:** UI obsahuje externí odkaz konfigurovatelný v options (URL generic v docs, ne v Gitu).

### ENE-013 – Řízení EV/baterie dle spotu

- **Popis:** Automatické spínání nabíjení podle ceny — zápisy do HA.
- **Zdroj:** `ADR-0001 §5.3`
- **Priorita:** later
- **Akceptace:** Samostatné issue s `writes-to-ha` a allowlistem; mimo MVP build.

### ENE-014 – Spot plynu v UI

- **Popis:** Paralelní zobrazení plynových spot cen z HACS integrace.
- **Zdroj:** `HA revize 2026-10-31`
- **Priorita:** later
- **Akceptace:** Given binding `energy_spot_price_gas`, When enabled in options, Then sekce plynu viditelná.

### ENE-015 – Náklady a tarifní entita

- **Popis:** Cena používá lokální tarif entitu; žádný hardcoded tarif v UI.
- **Zdroj:** `donor/energy@fc4419a:docs/data-contract.md`
- **Priorita:** later
- **Akceptace:** Kalkulace nákladů dne použije binding tarifu; chybí-li, sekce náklady hidden.

### ENE-016 – Architektura views

- **Popis:** Struktura overview / production / consumption dle architecture.md pro budoucí rozšíření.
- **Zdroj:** `donor/energy@fc4419a:docs/architecture.md`
- **Priorita:** later
- **Akceptace:** MVP implementuje minimálně `overview`; ostatní routes lazy-loaded stub.

## Portovat vs. zahodit

| položka | rozhodnutí | důvod |
| --- | --- | --- |
| data-contract klíče a quality | portovat | donor SHA fc4419a |
| PR #1–#3 implementace | zahodit | superseded ADR-0001 §11 |
| PR #5 assety/flow UI | inspirace | triage design |
| Open PR kód energie | zahodit | jen docs v donoru |

## Mimo rozsah

Embed Grafana; zápisy do GoodWe/Shelly bez schválení; použití inverter warning jako weather alert.

## Otevřené otázky

- MVP zahrnuje EV entity pokud jsou v HA nasazeny?
- Jednotka a granularita plynových cen v UI.

## Fáze (tři fáze, nesymetrie, saldování)

Kompaktní prvek „Fáze“ pod diagramem toků: pro L1–L3 obousměrný pruh od nulové čáry (vpravo odběr,
vlevo dodávka; bez dodávky se nula posune doleva), měřítko = hlavní jistič (`energy_main_breaker`,
výchozí 25 A), tečkovaná značka na 80 %. Zdroj: `energy_grid_l1…l3_power` (elektroměr), jinak
`energy_phase_l*` (spotřeba domu). Proud z `energy_grid_l*_current`, jinak odhad I ≈ P / 230 V.

- **Nesymetrie** = max − min proudů fází se znaménkem (A); v detailu i odchylka nejvzdálenější fáze
  od průměru vztažená k průměrné velikosti proudu (%, jen od průměru 2 A).
- **Stavy:** `ok` (vyrovnané); `notice` při rozdílu ≥ 6 A (≈ 1,4 kW) nebo fázi ≥ 60 % jističe;
  `warn` při rozdílu ≥ 16 A nebo fázi ≥ 80 % jističe. 16 A ≈ 3,7 kVA při 230 V odpovídá limitu
  nesymetrie pro FVE v PPDS, příloha 4 („nesymetrie u fázových vodičů nesmí za normálního provozního
  stavu překročit 3,7 kVA“; jednofázové připojení max. 3,7 kVA/fázi). Pro odběr je to orientační mez.
- **Saldování fází:** když některá fáze odebírá a jiná dodává (≥ 50 W), prvek vysvětlí, co počítá
  elektroměr se součtovým měřením: „L1 odebírá 0,8 kW, L2 + L3 dodávají 2,1 kW → elektroměr počítá
  dodávku 1,3 kW“.
- **Detail:** 24h průběh po fázích z 5min průměrů dlouhodobých statistik
  (`recorder/statistics_during_period`, `period: 5minute`), souhrn (průměrný/největší rozdíl, % času
  nad 6 A a 16 A), odhad fáze velkých spotřebičů z rozložení spotřeby domu (`guessAppliancePhase`).
- Čisté funkce: `modules/energy/src/phases.ts` (`analyzePhases`, `phaseSaldo`, `imbalanceStats`,
  `guessAppliancePhase`), testy `phases.test.ts`; e2e scénáře `?flow=balanced|asym|mixed`.

## Náklady (od rc.19)

- Karta **Náklady na elektřinu** (Dnes / Měsíc / Rok): odběr ze sítě po hodinách (statistiky recorderu) × cena VT/NT podle rozvrhu HDO + stálé měsíční platby rozpočítané poměrně podle uplynulého času v každém měsíci (DST: den má 23/25 h). Jde o odhad podle měření střídače; volitelná korekce `energy_meter_correction` (výchozí 1).
- **Úspora FVE + baterie** = Σ (spotřeba domu − odběr) × cena VT/NT dané hodiny. Bez příjmu za přetoky.
- **Srovnání se spotem** je jen informativní: Σ odběr × ((spot + přirážka) × DPH + distribuce VT/NT) + stálé platby spotového produktu. Nikdy se nezobrazuje jako doporučení.
- Doporučení „kdy pustit spotřebiče“ a signál „Levný proud“ jsou odstraněné.

### ENE-017 – Konfigurační záložka

- **Popis:** Přehled | Nastavení zachovává původní přehled. Pět sekcí: Fotovoltaika
  (výkon, sklon, orientace, účinnost systému, AC limit, zítřejší předpověď), Baterie
  (kapacita, rezervy, hlídání rezervy, rychlé nabíjení a ekonomický režim), Síť
  (řízení a fyzický limit přetoku, modelový limit, jistič), Tarif a ceny (VT/NT,
  stálé platby, HDO a další změna, spotové přirážky/distribuce/platby), Střídač (režim, EMS, stav).
- **Nápověda a úpravy:** Každý řádek je celý klepatelný (`ListCell`): popisek, jednořádkové
  shrnutí (`summary`), hodnota s jednotkou a pevný koncový slot – šipka u upravitelných řádků,
  zámek u řádků jen pro čtení. Klepnutí otevře detail (`Sheet` raised: telefon spodní panel s
  úchytem, tablet/desktop dialog) s velkou současnou hodnotou, `RangeStepper` s doporučeným
  pásmem (rezerva 10–30 %, sklon 25–45 °, orientace ±45 °, jistič 16–32 A) a vysvětlením
  (`explanation`, 2–3 věty: význam, praktický důsledek, doporučení; neopakuje shrnutí).
  Řádky jen pro čtení otevřou stejný detail bez úprav s místem změny (`source`/`location`:
  SolarGo, Home Assistant, Správce) – to mají jen řádky, které zde aktuální uživatel měnit
  nemůže. Zápis do střídače (rezerva v síti) má v detailu krok potvrzení „Změnit rezervu
  baterie z A na B?“ s dopadem v kWh a poznámkou o zápisu do střídače; ostatní hodnoty se
  uloží tlačítkem Uložit. Výrazně odlišný limit přetoku střídače a předpovědi (≥ 10×) ukáže
  v kartě Síť varování; správce může jedním tlačítkem (s potvrzením) nastavit limit střídače
  i pro předpověď (`export_limit_kw`). Fotovoltaika má jako hlavní údaj zítřejší předpověď
  v kWh s hodinovým průběhem. Escape i tlačítko Zavřít (44 px) detail zavírají.
  Chybějící vazba = „nepřipojeno“ a logický klíč. Výchozí sklon 35 ° a azimut 0 °
  mají odznak „odhad“. Azimut 0 = jih, −90 = východ, 90 = západ.
- **Role:** `settings/get` čte owner/admin a adult, ostatní role nemají detailní přístup.
  `settings/set` vyžaduje HA admina; ostatní vidí pouze čtení. Server vynucuje allowlist.
- **Zápisy:** `energy_pv` options: `pv_kwp` 0,01–100, `pv_tilt` 0–90,
  `pv_azimuth` −180–180, `inverter_ac_limit_kw`, `battery_capacity_kwh`, `export_limit_kw`
  0,01–1000. Systémové hodnoty mají krok 0,01, úhly 1 °. Jde pouze o model předpovědi.
  Rezerva v síti 10–50 %, krok 5 %, se zapisuje jako DoD = 100 − rezerva přes
  `number.set_value`, navíc respektuje min/max/step entity. Potvrzení ukazuje starou a novou
  hodnotu a dopad do noční energie podle kapacity baterie.
  Pouze pomocníci `input_number` pro VT/NT cenu, stálé platby, spot přirážku/distribuci/platby
  a hlavní jistič používají `input_number.set_value` v mezích min/max/step entity.
- **Pouze čtení:** backup DoD, udržování DOD, rychlé nabíjení, eco, fyzický export limit,
  režimy i pracovní stav. Nikdy `goodwe.set_parameter`, zápisy select ani switch.
- **Audit:** každý úspěšný zápis loguje uživatele, logický klíč, původní a novou hodnotu;
  služba nese HA kontext uživatele. Neplatné/nepřipojené entity nelze zapisovat.
- **Evidence:** issue #112; testy WS oprávnění, hranic, převodu a options, komponentové testy,
  Playwright na desktopu, tabletu a mobilu ve světlém a tmavém motivu.

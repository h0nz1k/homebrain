# Dnes – požadavky

Stav: sklizeno 2026-10-31 (issue #13). Zdroje: `ADR-0001 §5.1`, `donor/weather@a36cbdf`, `donor/waste@e3a3c34`, `donor/energy@fc4419a`, `donor/health@f642b91`, `HA revize 2026-10-31`.

## Rozsah

Modul „Dnes“ je agregovaný přehled na jedné obrazovce: rychlý stav domácnosti bez otevírání jednotlivých modulů. Každý doménový modul exportuje `summary()` widget; Dnes je skládá z adapterů ostatních modulů (`ADR-0001 §5.1`). Neobsahuje nádražní tabuli, řazení vozů ani síťový monitoring.

## Datové vstupy (logické klíče)

| klíč | doména/typ | jednotka | povinný (MVP) | poznámka |
| --- | --- | --- | --- | --- |
| *(žádné vlastní)* | — | — | — | Pouze odvozené view modely z modulů weather, waste, energy, health, family |

## Požadavky

### TOD-001 – Počasí teď a dnešek

- **Popis:** Shrnutí aktuální teploty/stavu z lokální stanice a dnešního vývoje z předpovědi.
- **Zdroj:** `ADR-0001 §5.1`; `donor/weather@a36cbdf:docs/product-brief.md`
- **Priorita:** MVP
- **Akceptace:** Given načtený modul Počasí, When uživatel otevře Dnes, Then vidí alespoň teplotu, condition a freshness badge bez scrollu na mobilu 360×800.

### TOD-002 – Nejbližší svoz odpadu

- **Popis:** Hero řádek s typem, datem a relativním časem nejbližšího svozu.
- **Zdroj:** `ADR-0001 §5.1`; `donor/waste@e3a3c34:docs/product-brief.md`
- **Priorita:** MVP
- **Akceptace:** Given fixture „next collection“, When zobrazeno Dnes, Then typ odpadu a „za N dní“ odpovídá doménovému selektoru odpadů.

### TOD-003 – Energie teď (FVE, síť, baterie)

- **Popis:** Okamžité výkony FVE, odběr/dodávka ze sítě a stav baterie v kompaktní formě.
- **Zdroj:** `ADR-0001 §5.1`; `donor/energy@fc4419a:docs/product-brief.md`; `HA revize 2026-10-31`
- **Priorita:** MVP
- **Akceptace:** Given bindings `energy_pv_power`, `energy_grid_power`, `energy_battery_soc`, When data quality `ok`, Then KPI zobrazí hodnoty se správnými jednotkami kW/%.

### TOD-004 – Spotová cena teď a nejlevnější okno

- **Popis:** Aktuální spotová cena elektřiny a stručná indikace nejlevnějšího intervalu dne.
- **Zdroj:** `ADR-0001 §5.1`; `HA revize 2026-10-31`
- **Priorita:** MVP
- **Akceptace:** Given publikované hodinové ceny dne, When uživatel otevře Dnes, Then vidí aktuální cenu a označení nejlevnějšího okna (bez grafu celého dne).

### TOD-005 – Dnešní události z kalendářů

- **Popis:** Seznam dnešních událostí z navázaných HA kalendářů (rodina / škola).
- **Zdroj:** `ADR-0001 §5.1`; `HA revize 2026-10-31`
- **Priorita:** MVP
- **Akceptace:** Given kalendář s událostí dnes, When načtení přes `calendar.get_events`, Then Dnes zobrazí název a čas bez PII mimo konfiguraci HA.
- **Implementace:** vazby `family_calendar_family` / `family_calendar_school` (krok „Rodina“ v nastavení integrace); živý adaptér je čte přes `calendar/event/subscribe` (záloha `calendar.get_events`) jen pro role, které vidí Rodinu, nikdy na kiosku. Na časovou osu jdou nejvýše 4 dnešní nadcházející události jako `9:30 Název` (celodenní od rána), bez popisu a místa.

### TOD-006 – Zdraví „další krok“

- **Popis:** Jednovětné doporučení z modulu Zdraví (hero next step).
- **Zdroj:** `ADR-0001 §5.1`; `donor/health@f642b91:docs/product-brief.md`
- **Priorita:** MVP
- **Akceptace:** Given nasazená integrace `health_fitness` a fixture F-002, When Dnes načteno, Then zobrazí stejný text hero jako modul Zdraví.

### TOD-007 – Agregace bez duplicitní logiky

- **Popis:** Dnes neimplementuje vlastní parsování entit; volá exportované summary jednotlivých modulů.
- **Zdroj:** `ADR-0001 §5.1`
- **Priorita:** MVP
- **Akceptace:** Unit test mockuje `weather.summary()` atd.; změna adapteru Počasí automaticky projde do Dnes bez úpravy TOD kódu parsování.

### TOD-008 – Stav spojení a kvalita dat

- **Popis:** Banner odpojení a per-widget stale/unavailable z modulů.
- **Zdroj:** `ADR-0001 §4.5`; `donor/energy@fc4419a:docs/data-contract.md`
- **Priorita:** MVP
- **Akceptace:** When WS odpojeno, Then banner „odpojeno“ a widgety ukazují poslední snapshot s časem; akce zakázány.

### TOD-009 – Kiosk režim

- **Popis:** Route `?kiosk=1` zvětší typografii, skryje nastavení a po nečinnosti vrátí na Dnes.
- **Zdroj:** `ADR-0001 §4.4`
- **Priorita:** later
- **Akceptace:** Given role kiosk, When `?kiosk=1`, Then navigace na Nastavení není dostupná a idle timeout vrátí na `/today`.

### TOD-010 – Vinotéka v přehledu

- **Popis:** Volitelný řádek počtu lahví nebo poslední změny zásob.
- **Zdroj:** `ADR-0001 §5.6`
- **Priorita:** later
- **Akceptace:** When modul Vinotéka zapnut, Then Dnes zobrazí souhrn z `wine.summary()` bez otevření katalogu.

### TOD-011 – Responzivní layout přehledu

- **Popis:** Stejná informační priorita na mobilu, tabletu a desktopu bez horizontálního scrollu.
- **Zdroj:** `donor/energy@fc4419a:docs/acceptance.md`; `AGENTS.md` §10
- **Priorita:** MVP
- **Akceptace:** Playwright snapshoty 360×800, 800×1280, 1440×900 bez overflow; label `needs-owner-visual-check` u první verze.

### TOD-012 – Explicitní vyloučení mimo scope

- **Popis:** Obrazovka Dnes neobsahuje vlaky, řazení vozů ani UniFi.
- **Zdroj:** `HA revize 2026-10-31`; `docs/requirements/README.md`
- **Priorita:** MVP
- **Akceptace:** E2E navigace Dnes neobsahuje odkazy ani widgety pro tyto domény; dokumentace README „Mimo rozsah“.

## Portovat vs. zahodit

| položka | rozhodnutí | důvod |
| --- | --- | --- |
| Agregace z modulů | portovat | `ADR-0001 §5.1` |
| ~250 UI helperů jako stav | zahodit | prefs do `homebrain/prefs` |
| Samostatný „dashboard YAML“ | zahodit | jeden React shell |

## Mimo rozsah

Nádražní tabule, řazení vozů, síťový monitoring; plné detaily modulů (graf spotu celý den, měsíční kalendář odpadů, vinotékový katalog).

## Otevřené otázky

- Pořadí a počet widgetů na jedné obrazovce (vlastník).
- Zda zobrazit plyn spotovou cenu v MVP Dnes (`HA revize 2026-10-31` — data existují).

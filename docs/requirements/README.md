# Požadavky HomeBrain (sklizeň)

Účel tohoto adresáře je jednotný, veřejně sdílitelný katalog produktových požadavků pro moduly HomeBrain. Každý modul má vlastní soubor s logickými datovými klíči (anglicky, `snake_case` s prefixem modulu), požadavky s traceabilitou ke zdrojům a seznamem portovat / zahodit. Implementace navazuje na [ADR-0001](../adr/0001-frontend-architecture.md).

**Stav:** sklizeno 2026-10-31 (issue #13).

> Zdroje `donor/*` jsou soukromé podkladové repozitáře vlastníka (nejsou veřejné); SHA slouží jen k interní dohledatelnosti. `HA revize` = anonymizované výchozí předpoklady, ne inventura konkrétní domácnosti.

## Schéma ID a pole požadavku

| Prefix | Modul | Soubor |
| --- | --- | --- |
| `TOD` | Dnes (přehled) | [today.md](./today.md) |
| `WEA` | Počasí | [weather.md](./weather.md) |
| `ENE` | Energie | [energy.md](./energy.md) |
| `WST` | Odpady | [waste.md](./waste.md) |
| `HEA` | Zdraví | [health.md](./health.md) |
| `WIN` | Vinotéka | [wine.md](./wine.md) |
| `FAM` | Rodina | [family.md](./family.md) |
| `X` | Průřezové | tento README |

Každý požadavek (`XXX-NNN`) musí obsahovat: **Popis**, **Zdroj** (repo@SHA, PR diff, `HA revize 2026-10-31`, nebo `ADR-0001 §…`), **Priorita** (`MVP` | `later`; podmíněné požadavky se počítají jako `later`; vyřazené (zamítnuté vlastníkem) se nepočítají), **Akceptace** (měřitelné nebo Given/When/Then).

Logické klíče v tabulkách nejsou `entity_id`. Vazba klíč → entita se nastavuje v integraci HomeBrain v Home Assistantu (options / UI), nikdy v Gitu (viz AGENTS.md §7).

## Přehled modulů

| Modul | Soubor | Prefix | MVP | later | Celkem |
| --- | --- | --- | ---: | ---: | ---: |
| Dnes | [today.md](./today.md) | TOD | 10 | 2 | 12 |
| Počasí | [weather.md](./weather.md) | WEA | 13 | 4 | 17 |
| Energie | [energy.md](./energy.md) | ENE | 12 | 4 | 16 |
| Odpady | [waste.md](./waste.md) | WST | 13 | 3 | 16 |
| Zdraví | [health.md](./health.md) | HEA | 11 | 4 | 15 |
| Vinotéka | [wine.md](./wine.md) | WIN | 12 | 3 | 15 |
| Rodina | [family.md](./family.md) | FAM | 10 | 4 | 14 |

## Zdroje (harvest)

| Repozitář | SHA | Použito |
| --- | --- | --- |
| `donor/weather` | `a36cbdf` | product-brief, acceptance, data-contract, ADR-030, integration-boundaries, design-system, architecture-v2-proposal, donor-audit, V2/LOCATION install rollback runbooky |
| `donor/energy` | `fc4419a` | product-brief, data-contract, acceptance, design-system, architecture |
| `donor/energy#1`, `#2`, `#3` | `662c547`, `07140a2`, `4f67f5e` | PR diffy prověřeny — implementace prototypů, superseded (ADR-0001 §11), nic nepřevzato |
| `donor/energy#5` | `4ba7ad2` | PR diff — vizuální assety a flow redesign (inspirace, ne kód) |
| `donor/waste` | `e3a3c34` | product-brief, acceptance, data-contract, design-system, `contracts/waste-dashboard.schema.json`, `contracts/README.md` |
| `donor/waste#6` | `f012025` | PR diff — HA dataset adapter (`ha-adapter.ts`) |
| `donor/wine` | `8ed8ee7` | product-brief, acceptance, data-contract, privacy-and-data-handling, task-006/009 reference, `packages/wine-domain`, approvals |
| `donor/health` | `f642b91` | product-brief, acceptance, data-contract, reward/milestone/calistree/exercise/flex-meal kontrakty, fixtures-and-error-states, manifest 0.7.0 |
| `donor/project-factory` | `b228510` | README, visual-review-workflow, governance (deploy gate, integrita textu) |
| — | — | `HA revize 2026-10-31` (anonymizované zjištění z produkčního HA) |
| — | — | [ADR-0001 §5–§11](../adr/0001-frontend-architecture.md) |

## Průřezové požadavky

### X-001 – Žádná soukromá data v Gitu

- **Popis:** Repozitář nesmí obsahovat tokeny, entity_id domácnosti, GPS, e-maily, hostnames, skutečná jména ani provozní identifikátory zařízení; fixtures jsou syntetické.
- **Zdroj:** `AGENTS.md` §7; `donor/project-factory@b228510:README.md`
- **Priorita:** MVP
- **Akceptace:** `gitleaks git -c .gitleaks.toml .` projde před push; `docs/requirements` obsahuje jen logické klíče, žádná reálná `entity_id`.

### X-002 – Deploy gate u vlastníka

- **Popis:** Agent neprovádí automatický merge ani nasazení do produkčního HA; update spouští vlastník v HA (HACS/Marketplace).
- **Zdroj:** `AGENTS.md` §5; `ADR-0001 §6.1`; `donor/project-factory@b228510:README.md`
- **Priorita:** MVP
- **Akceptace:** CI a release pipeline nemají krok „deploy to production“; dokumentace runbooku popisuje ruční update a rollback.

### X-003 – Vizuální review tří viewportů

- **Popis:** Nové obrazovky vyžadují checkpoint vlastníka se screenshoty 360×800, 800×1280 a 1440×900 (light/dark dle modulu).
- **Zdroj:** `AGENTS.md` §10; `donor/project-factory@b228510:docs/visual-review-workflow.md`
- **Priorita:** MVP
- **Akceptace:** Issue/PR s labelem `needs-owner-visual-check` obsahuje anonymizované snímky pro všechny tři rozměry.

### X-004 – Textová integrita

- **Popis:** Textové soubory používají UTF-8 bez BOM, LF a koncový newline.
- **Zdroj:** `donor/project-factory@b228510:README.md`
- **Priorita:** MVP
- **Akceptace:** `.editorconfig` v repu a CI kontrola whitespace/encoding na PR.

### X-005 – Selektivní entity store

- **Popis:** Widgety nečtou celé `hass.states`; pouze bindings přes `@homebrain/ha-client`.
- **Zdroj:** `AGENTS.md` §9; `donor/weather@a36cbdf:docs/adr/ADR-030-architecture-v2-clean-room-frontend.md`; `ADR-0001 §4.3`
- **Priorita:** MVP
- **Akceptace:** Unit test s 1000 entitami prokáže re-render pouze při změně bound entit.

### X-006 – UI česky, kód anglicky

- **Popis:** Uživatelské texty v `cs-CZ`; identifikátory v kódu anglicky.
- **Zdroj:** `AGENTS.md` §6
- **Priorita:** MVP
- **Akceptace:** Shell i moduly používají i18n klíče s českými defaulty; PR review nenachází hardcoded anglické user-facing stringy mimo dev nástroje.

### X-007 – Zápisy jen přes allowlist

- **Popis:** Volání služeb HA mimo read-only vyžaduje label `writes-to-ha` a schválení vlastníka; implementace jen v `@homebrain/ha-client` allowlistu.
- **Zdroj:** `AGENTS.md` §4; `ADR-0001 §4.3`
- **Priorita:** MVP
- **Akceptace:** Test odmítne `callService` pro nepovolenou doménu/službu; modul deklaruje povolené akce v manifestu integrace.

### X-008 – Auth bez LLAT ve frontendu

- **Popis:** Panel používá HA session (`hass.connection`); žádný long-lived access token v prohlížeči.
- **Zdroj:** `donor/weather@a36cbdf:docs/adr/ADR-030-architecture-v2-clean-room-frontend.md`; `ADR-0001 §3`
- **Priorita:** MVP
- **Akceptace:** Statická analýza bundlu a code review neukazují ukládání LLAT; E2E běží proti test HA s tokenem jen v `.env.local`.

## Mimo rozsah HomeBrain

- **Nádražní tabule** (řádky odjezdů, rotace jazyků, TTS, parser kalendáře) — zůstává v HA nebo se odstraňuje; HomeBrain neimplementuje.
- **Řazení vozů** (SVG, roster, overrides, historie) — stejně mimo scope HomeBrain.
- **Síť / router (UniFi)** — monitoring mimo scope prozatím.
- Obecné ovládání všech entit HA (světla po místnostech) — nativní Home/Areas dashboard (`ADR-0001 §3`).

## Soukromí a vazby

Logické klíče v požadavcích (např. `weather_station_temperature`, `waste_dataset`) popisují *co* modul potřebuje, ne *která* entita v konkrétní instalaci. Mapování se konfiguruje v integraci `homebrain` v HA (admin UI / WebSocket), nikdy v tomto repozitáři.

## Konsolidované otevřené otázky

1. **Odpady 2027+:** Parser obce selhává od dubna; kdo dodá ICS/kalendář po 2026-12-30? (viz [waste.md](./waste.md))
2. **Počasí:** Dvě met.no entity s různými souřadnicemi — pravidlo výběru jedné v bindings. (viz [weather.md](./weather.md))
3. **Počasí:** Radar ČHMÚ a meteo varování — chybí spolehlivý zdroj/runner. (viz [weather.md](./weather.md))
4. **Zdraví:** Nasazení integrace `health_fitness` v produkčním HA před MVP modulu. (viz [health.md](./health.md))
5. **Rodina:** Rozhodnuto 2026-10-31 — rodinné a školní kalendáře z externích kalendářů připojených do HA, povinnosti z HA todo, domácnost s dětmi (role `owner`, `adult`, `child`) jako `person` (Companion app, kde je k dispozici; bez ní stav „neznámo“). Směny zamítnuty (FAM-008/011/012 vyřazeny, mimo počty). Zbývá: zápis z kiosku (issue #14, viz [family.md](./family.md))
6. **Energie:** Řízení EV/baterie dle spotu — read-only v MVP nebo zápisy v samostatném issue? (`ADR-0001 §5.3`, otázka vlastníka §12)
7. **Viditelnost pro ne-admin členy rodiny** od Fáze 1 vs. po cut-overu (`ADR-0001 §12`) — model rolí `owner/adult/child/guest/kiosk` a postup P1 → P2 přijaty 2026-10-31 v [ADR-0002](../adr/0002-roles-and-users.md) (issue #11); tablet zůstává na kiosk prohlížeči, zbývá termín přepnutí P2 a detaily matice. Licence je rozhodnutá (MIT).

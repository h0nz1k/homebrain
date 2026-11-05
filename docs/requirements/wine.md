# Vinotéka – požadavky

Stav: sklizeno 2026-10-31 (issue #13); doplněno rozhodnutími vlastníka 2026-10-31 (issues #44, #50, #51, #52). Zdroje: `donor/wine@8ed8ee7`, `ADR-0001 §5.6`.

## Rozsah

Katalog vín, filtry, detail, množství a umístění, odepsání s auditní historií. Data nejsou v HA — persistence přes integraci `homebrain` (Store/SQLite) a WebSocket `homebrain/wine/*`. Node backend donoru se neportuje.

## Datové vstupy (logické klíče)

| klíč | doména/typ | jednotka | povinný (MVP) | poznámka |
| --- | --- | --- | --- | --- |
| *(WS API)* | homebrain/wine | WineRecord[] | ano | ne entity store |
| `wine_cellar_temperature` | sensor | °C | ne | volitelné HA provozní údaje |
| `wine_cellar_humidity` | sensor | % | ne | read-only z HA |
| `wine_zone_<n>_temperature` (n = 1, 2) | sensor | °C | ne | teplota zóny chladničky (WIN-018) |
| `wine_zone_<n>_target` | sensor | °C | ne | cílová teplota zóny |
| `wine_zone_<n>_humidity` | sensor | % | ne | vlhkost zóny, pokud ji spotřebič hlásí |
| `wine_light` | light | – | ne | osvětlení chladničky, jen zobrazení stavu (read-only, WIN-018) |
| `wine_error` | sensor | – | ne | chybový stav spotřebiče (read-only, WIN-018) |

Zóna 1 = horní zóna, zóna 2 = spodní. Všechny klíče chladničky jsou **jen pro čtení** – HomeBrain do spotřebiče nic nezapisuje.

## Design autorita

Kompozice a funkce modulu vycházejí z vlastníkem schváleného návrhu donoru:
`donor/wine@8ed8ee7:docs/approvals/wine-cellar-approved-design--2026-07-25.md`
a koláže `prototype/docs/reference/approved-design-sanitized.png` (schváleno 2026-07-25).
**Rozhodnutí vlastníka (2026-10-31):** vizuální styl je HomeBrain (round-2 vzhled, tokeny `--hb-*`,
HomeBrain akcent, stejné radiusy/typografie/karty jako Počasí/Energie/Dnes) – z donoru se přebírá
jen **kompozice a funkce**. Zlatá výhradně pro hvězdy hodnocení.

## Požadavky

### WIN-001 – Katalog a vyhledávání

- **Popis:** Procházení vlastněných vín s hledáním v názvu/výrobci.
- **Zdroj:** `donor/wine@8ed8ee7:docs/product-brief.md`
- **Priorita:** MVP
- **Akceptace:** Given 50 mock wines, When query „synthetic“, Then výsledky < 300 ms v dev mock.

### WIN-002 – Filtry typ/barva/země/oblast/odrůda/ročník/cena/hodnocení/zóna

- **Popis:** Filtry skládací; katalog použitelný i bez rozbalených filtrů. Navíc Země, Oblast, Cena (max.) a „Jen skladem“. Prezentace viz WIN-024.
- **Zdroj:** `donor/wine@8ed8ee7:docs/product-brief.md`
- **Priorita:** MVP
- **Akceptace:** Kombinace filtrů je deterministická dle wine-domain pravidel řazení.

### WIN-003 – Detail vína

- **Popis:** Parametry, popis, foto, historie, vlastní hodnocení a poznámka. Rozložení viz WIN-019/WIN-021. Volitelná **nákupní cena** (`purchasePrice`, Kč za lahev) – ukládá se do store, zobrazuje se v detailu; prázdná hodnota je platná. Detaily vína (popis, odrůda, oblast, alkohol…) lze ručně doplnit akcí **„Doplnit ze Znovínu“** (viz WIN-012, issue #51).
- **Zdroj:** `donor/wine@8ed8ee7:docs/data-contract.md`
- **Priorita:** MVP
- **Akceptace:** WineRecord fields zobrazeny dle kontraktu; nákupní cena nepovinná, záporná hodnota odmítnuta serverem; chybějící foto → licenčně čistá SVG ilustrace (WIN-019). Komunitní hodnocení jen pokud existuje zdroj dat (externí hodnocení jsou mimo baseline) – jinak se sekce nezobrazuje.

### WIN-004 – Množství a umístění

- **Popis:** Nezáporné celé počty lahví; zóna/police v `location` objektu.
- **Zdroj:** `donor/wine@8ed8ee7:docs/data-contract.md`; `packages/wine-domain/src/rules.ts`
- **Priorita:** MVP
- **Akceptace:** Quantity < 0 odmítnuto na serveru i v domain testech.

### WIN-005 – Odepsání s evaluateConsume

- **Popis:** Pure gate: ambiguous/not found/zero stock/confirmation required dle domain rules.
- **Zdroj:** `donor/wine@8ed8ee7:packages/wine-domain/src/rules.ts`; `docs/reference/task-006-domain-boundary.md`
- **Priorita:** MVP
- **Akceptace:** Unit testy pro všechny `DomainErrorCode` z consume; úspěšný consume vytvoří `InventoryEvent`.

### WIN-006 – Auditní historie a oprava

- **Popis:** Neměnné inventory events; oprava přes correction operaci s auditem.
- **Zdroj:** `donor/wine@8ed8ee7:docs/data-contract.md`
- **Priorita:** MVP
- **Akceptace:** WS write vytvoří event; pytest ověří append-only a idempotenci `sourceOperationId`.

### WIN-007 – Port wine-domain do monorepa

- **Popis:** Pravidla a typy z `packages/wine-domain` do `modules/wine/domain` beze změn logiky.
- **Zdroj:** `ADR-0001 §5.6`; `donor/wine@8ed8ee7:packages/wine-domain`
- **Priorita:** MVP
- **Akceptace:** Donor unit testy green po copy/adapt import paths.

### WIN-008 – Python Store místo SQLite Node

- **Popis:** Schéma SQLite donoru port 1:1 do Python store v `/config/homebrain/`.
- **Zdroj:** `ADR-0001 §5.6`; `donor/wine@8ed8ee7:docs/reference/task-009-sqlite-adapter.md`
- **Priorita:** MVP
- **Akceptace:** Migrace verze 1; pytest store migrace forward compatible one version.

### WIN-009 – Mobilní UX

- **Popis:** Bottom nav (HomeBrain shell), 2 vertikální karty na řádek s celou lahví, full-screen detail se šipkou zpět a sticky akční lištou (safe-area), filtry jako bottom sheet; ne zmenšený desktop.
- **Zdroj:** `donor/wine@8ed8ee7:docs/product-brief.md`; approval 2026-07-25 (`wine-mobile-*`)
- **Priorita:** MVP
- **Akceptace:** 430×932 a 360×800: 2 karty/řádek, žádný horizontální overflow, interaktivní text ≥ 15 px, touch targets ≥ 44 px.

### WIN-010 – Privacy a citlivá data

- **Popis:** Žádné e-maily/objednávky v Git; import order jen normalizovaný fingerprint.
- **Zdroj:** `donor/wine@8ed8ee7:docs/privacy-and-data-handling.md`
- **Priorita:** MVP
- **Akceptace:** gitleaks a privacy scan PASS; fixtures bez PII.

### WIN-011 – Role a WS validace

- **Popis:** Zápisy vinotéky kontrolují roli server-side; audit log administrátora.
- **Zdroj:** `ADR-0001 §4.4`; `§8`
- **Priorita:** MVP
- **Akceptace:** pytest: child role nemůže consume; owner může.

### WIN-012 – Fotky v /config/homebrain/media

- **Popis:** Autentizované servírování fotek lahví, ne `/local`. Fotka **i detaily vína** se doplňují z produktové stránky hlavního e-shopu výrobce akcí **„Doplnit ze Znovínu“**: spouští ji vždy uživatel ručně (žádné automatické stahování na pozadí), nejdřív se zobrazí **náhled** nalezené fotky a hodnot vedle současných, zápis až po potvrzení. Fotka se uloží **jen lokálně** do `/config/homebrain/media`, do Gitu ani do cloudu nic nejde. V této verzi je akce jen placeholder (připravujeme). Donor PNG lahve a `cellar-texture.webp` se **nepřebírají** (bez licence, D-005).
- **Zdroj:** `ADR-0001 §5.6`; donor `docs/decisions.md` D-005; rozhodnutí vlastníka 2026-10-31; issue #51
- **Priorita:** MVP (servírování, placeholder akce) / later (doplnění ze Znovínu)
- **Akceptace:** URL fotek vyžaduje HA session; cesta mimo statický public bundle; v Gitu žádné assety s neznámou licencí. Doplnění: bez potvrzení se nic nezapíše; zrušení náhledu nechá záznam beze změny; při nedostupném e-shopu chyba bez změny dat.

### WIN-013 – Import objednávek

- **Popis:** Anonymizovaný import s potvrzením naskladnění. Sekce „Importer“ = UI nad WS `homebrain/wine/import` (CSV/JSON, vždy nejdřív náhled `dry_run`, pak potvrzení). Objednávky se importují **výhradně ručně**: nahráním PDF objednávky nebo vložením textu objednávky – **nikdy** přes IMAP ani jiný automatický přístup do schránky (rozhodnutí vlastníka 2026-10-31). V UI karta „PDF / text objednávky (připravujeme)“; sekce „Objednávky“ je do té doby prázdný stav „připravujeme“. Případná nákupní cena z objednávky se předvyplní do `purchasePrice` (WIN-003).
- **Zdroj:** `donor/wine@8ed8ee7:docs/product-brief.md`; rozhodnutí vlastníka 2026-10-31; issue #50
- **Priorita:** MVP (soubor + náhled) / later (PDF/text objednávky)
- **Akceptace:** Žádný IMAP kód ani přihlašovací údaje ke schránce; raw PDF/text se po zpracování neukládá (jen normalizovaný fingerprint); náhled nic nezapíše; opakovaný import stejné objednávky je idempotentní.

### WIN-014 – Assist hlasové odepsání

- **Popis:** Vyhledání/odepsání přes HA Assist.
- **Zdroj:** `ADR-0001 §9` (později); donor product brief
- **Priorita:** later
- **Akceptace:** Samostatné issue; intent mapuje na stejný consume gate.

### WIN-015 – Tessvine / label OCR

- **Popis:** Výzkum licence PR #13 — bez implementace v MVP.
- **Zdroj:** `ADR-0001 §11`
- **Priorita:** later
- **Akceptace:** Pouze dokumentační poznámka v issue, ne kód.

### WIN-016 – Schválená kompozice modulu

- **Popis:** Interiér modulu odpovídá schválené kompozici (sub-nav Přehled · Katalog vín · Moje vína · Hodnocení · Objednávky · Importer; metriky; zóny chladničky; hero karty; trvalý detail; drawer/sheet; stavy). Shell, globální navigace a vizuální styl zůstávají HomeBrain (rozhodnutí vlastníka 2026-10-31).
- **Zdroj:** donor `docs/approvals/wine-cellar-approved-design--2026-07-25.md`; `prototype/docs/reference/approved-design-sanitized.png`
- **Priorita:** MVP
- **Akceptace:** Screenshoty desktop 1600×1000 (light+dark) a mobil 430×932 pro dashboard, detail, filtry, prázdné hledání a poslední láhev porovnány vedle reference; odchylky zapsané v PR.

### WIN-017 – Řada metrik

- **Popis:** Lahve celkem / červená / bílá / růžová (+ počet oranžových a jiných v popisku, pokud > 0) / průměr mého hodnocení. Počítá se z fyzických lahví.
- **Zdroj:** approval 2026-07-25 (`wine-dashboard-catalog`)
- **Priorita:** MVP
- **Akceptace:** Součet metrik = součet `quantity`; žádný překryv labelu a čísla; žádné natvrdo zapsané hodnoty.

### WIN-018 – Chladnička a zóny

- **Popis:** Karta dvouzónové chladničky (zóna 1 = horní, zóna 2 = spodní): teplota, cílová teplota, vlhkost z volitelných bindingů `wine_zone_<n>_temperature/_target/_humidity`, dále stav osvětlení `wine_light` a chybový stav `wine_error`; fallback `wine_cellar_temperature`. Data přicházejí z komunitní HA integrace hOn (`hon` revived), žádné přímé cloud API výrobce. Bez bindingu stav „Nenakonfigurováno“ s nápovědou, žádná falešná čísla.
- **Read-only (záměrně):** HomeBrain nenabízí přepínač světla ani změnu cílové teploty. Integrace má známou chybu: přepnutí světla resetuje cílovou teplotu **obou zón na 5 °C**, což by vínu škodilo. Ovládání zůstává v aplikaci výrobce; `wine_light` se jen zobrazuje.
- **Zdroj:** approval 2026-07-25; GAP analýza §4; rozhodnutí vlastníka 2026-10-31; issue #52
- **Priorita:** MVP (UI) / data volitelná
- **Akceptace:** Unit test: zóna s cílem → „cíl 12 °C“ a stav; bez bindingů → „Nenakonfigurováno“; `wine_error` aktivní → varování na kartě; v UI ani v WS API žádná zapisovací akce na chladničku.

### WIN-019 – Hero karta s celou lahví

- **Popis:** Vertikální karta: celá neoříznutá lahev (≥ 236 px desktop / ≥ 188 px mobil), srdíčko, název, ročník · barva, vinařství, hodnocení (zlatá), cena (pokud známá), zásoba jako badge. Foto z WIN-012, jinak vlastní SVG ilustrace (bordeaux, burgundy, flétna, šumivé, rosé) tónovaná barvou vína.
- **Zdroj:** approval 2026-07-25; `docs/reference/approved-design-measurements.md`
- **Priorita:** MVP
- **Akceptace:** Lahev nikdy oříznutá; žádný donor asset; vybraná karta zvýrazněná akcentem HomeBrain.

### WIN-020 – Režim Přehled vs. Katalog

- **Popis:** Přehled = metriky + zóny + katalog + trvalý detail; Katalog vín = jen katalog s většími kartami, detail až po výběru. Volba sekce se pamatuje (localStorage).
- **Priorita:** MVP
- **Akceptace:** Po reloadu se otevře naposledy zvolená sekce.

### WIN-021 – Trvalý detail (desktop) / full-screen detail (mobil)

- **Popis:** Desktop: panel vpravo, v Přehledu vždy s výběrem (výchozí první položka). Velká lahev, hodnocení, Moje hodnocení, záložky Vlastnosti (ikony) / Popis (info dlaždice) / Historie (audit + oprava stavu); CTA „Otevřít láhev“ (= odepsání přes consume gate) a „Přidat hodnocení“. Mobil: full-screen vrstva se šipkou zpět a sticky lištou se safe-area.
- **Priorita:** MVP
- **Akceptace:** e2e: výběr karty → detail → Otevřít láhev → potvrzení → historie.

### WIN-022 – Zápis vlastního hodnocení

- **Popis:** `RatingControl` (5 hvězd po 44 px, opakovaný klik na aktuální hodnotu = −0,5, „Smazat“); zápis přes WS `homebrain/wine/update` (`personalRating`). Sekce „Hodnocení“ = ohodnocená vína seřazená podle hodnocení s průměrem.
- **Priorita:** MVP
- **Akceptace:** Unit test zápisu celé i půl hvězdy; mimo 0–5 → `RATING_OUT_OF_RANGE`.

### WIN-023 – Moje vína (oblíbené)

- **Popis:** Srdíčko na kartě; sekce Moje vína. MVP-light: uloženo lokálně v prohlížeči; serverové pole `favorite` (sync mezi zařízeními) jako navazující krok.
- **Priorita:** MVP-light
- **Akceptace:** Srdíčko přidá/odebere víno ze sekce Moje vína.

### WIN-024 – Filter drawer a bottom sheet

- **Popis:** Řádek filtr-chipů (Barva, Oblast, Odrůda, Ročník, Cena, Zóna) + „Více filtrů“ → drawer vpravo (desktop/tablet) / bottom sheet (mobil, safe-area). Živý počet „Zobrazit N výsledků“, „Zrušit filtry“, „Skrýt filtry“, Esc zavře.
- **Priorita:** MVP
- **Akceptace:** Počet v CTA odpovídá skutečnému výsledku (žádné natvrdo zapsané číslo).

### WIN-025 – Prázdné hledání a safe-failure stavy

- **Popis:** „Žádné víno neodpovídá hledání“ + Vymazat hledání / Zrušit filtry; poslední láhev = alertdialog „Otevřít poslední láhev?“ (Zrušit / Ano, otevřít); odečet z nuly = chyba bez změny.
- **Priorita:** MVP
- **Akceptace:** e2e prázdné hledání a potvrzení poslední lahve.

### WIN-026 – Vizuální tokeny modulu

- **Popis:** Pouze `--hb-*` tokeny a akcent HomeBrain; modulové proměnné jen pro barvy vín (swatche, ikony metrik) a zlatou hodnocení (`--wine-gold`, light varianta s kontrastem ≥ 4,5 : 1). Min. písmo 14 px desktop / 15 px mobil u interaktivních prvků; `prefers-reduced-motion` respektováno.
- **Priorita:** MVP
- **Akceptace:** Kontrast textu ≥ 4,5 : 1 a UI ≥ 3 : 1 v light i dark.

## Portovat vs. zahodit

| položka | rozhodnutí | důvod |
| --- | --- | --- |
| wine-domain, SQLite schema | portovat | ADR-0001 |
| Node backend, wine-inventory-client | zahodit | WS API |
| Donor React prototyp UI | kompozice, IA a stavy ano; vizuální styl, assety (PNG, webp) a mock data s reálnými jmény ne | approval 2026-07-25; rozhodnutí vlastníka 2026-10-31; D-005 |
| Přímé cloud API chladničky | zahodit | data jen read-only přes HA integraci (WIN-018) |
| Znovín API / automatický scraping | zahodit | jen ruční „Doplnit ze Znovínu“ s náhledem (WIN-012) |
| IMAP import objednávek | zahodit | jen ruční PDF/text (WIN-013) |

## Mimo rozsah

Cloud jako jediný zdroj pravdy; obousměrná sync s výrobcem; automatický deploy.

## Otevřené otázky

- Pilot inventury: tolerance odchylky vs. fyzický stav.
- Opraví integrace hOn reset cílových teplot při přepnutí světla? Do té doby zůstává chladnička read-only.
- Komunitní hodnocení – existuje zdroj dat? Do té doby skryto.
- Cena na kartě – zobrazovat i na sdíleném panelu (soukromí)?
- Oblíbená vína – kdy přesunout do store (`favorite`) kvůli sync mezi zařízeními?

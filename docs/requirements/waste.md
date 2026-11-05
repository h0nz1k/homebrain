# Odpady – požadavky

Stav: sklizeno 2026-10-31 (issue #13). Zdroje: `donor/waste@e3a3c34`, `donor/waste#6@f012025`, `HA revize 2026-10-31`, `ADR-0001 §5.4`.

## Rozsah

Pilotní modul Fáze 0: nejbližší svoz, měsíční kalendář, legenda, stav dat. Data z integrace `waste_collection_schedule` (dataset sensor) a volitelně kalendář WCS (`calendar.get_events`). Připomínky zůstávají v HA automatizacích, ne v HomeBrain.

## Datové vstupy (logické klíče)

| klíč | doména/typ | jednotka | povinný (MVP) | poznámka |
| --- | --- | --- | --- | --- |
| `waste_dataset` | sensor | JSON dataset | ano | atribut `waste_dashboard` nebo konfigurovatelné jméno |
| `waste_next` | sensor | text/state | ano | nejbližší typ(y) |
| `waste_next_<type>` | sensor | text/date | ne | dynamické klíče per typ |
| `waste_calendar` | calendar | events | ne | ICS kalendář WCS |

## Požadavky

### WST-001 – Normalizovaný kontrakt v1

- **Popis:** UI konzumuje `WasteDashboardDataset` dle schema verze 1, ne raw entity.
- **Zdroj:** `donor/waste@e3a3c34:docs/data-contract.md`; `contracts/waste-dashboard.schema.json`
- **Priorita:** MVP
- **Akceptace:** Všech 13 donor fixtures projde `normalizeDataset` a JSON schema validací.

### WST-002 – Hero nejbližšího svozu

- **Popis:** Dominantní typ, datum a relativní čas; velká ikona typu, ne dekorativní popelnice.
- **Zdroj:** `donor/waste@e3a3c34:docs/product-brief.md`
- **Priorita:** MVP
- **Akceptace:** Visual snapshot hero odpovídá prioritám informací 1–2 z product brief.

### WST-003 – Relativní dny z kalendářních dnů

- **Popis:** `relative_days` z lokálního data, ne 24h intervalů.
- **Zdroj:** `donor/waste@e3a3c34:docs/data-contract.md`
- **Priorita:** MVP
- **Akceptace:** Unit test: svoz zítra v 01:00 stále „zítra“, ne „0 dní“.

### WST-004 – Měsíční kalendář 7 sloupců

- **Popis:** Sedm stabilních sloupců bez horizontálního scrollu; více typů v jednom dni.
- **Zdroj:** `donor/waste@e3a3c34:docs/product-brief.md`; `docs/acceptance.md`
- **Priorita:** MVP
- **Akceptace:** Fixture multi-type same day čitelná; Playwright overflow check PASS.

### WST-005 – Stavy zdroje a událostí

- **Popis:** `source_status` a `availability` včetně empty, stale, unavailable, error.
- **Zdroj:** `donor/waste@e3a3c34:docs/data-contract.md`
- **Priorita:** MVP
- **Akceptace:** Empty `events` zobrazí empty state, ne falešný svoz.

### WST-006 – HA dataset adapter

- **Popis:** Adaptér načte JSON z atributu entity (object nebo string), normalizuje, nepropouští entity_id do datasetu.
- **Zdroj:** `donor/waste#6@f012025:src/adapters/ha-adapter.ts`
- **Priorita:** MVP
- **Akceptace:** Given invalid JSON attribute, When refresh, Then `source_status=error` a bezpečná notice v češtině.

### WST-007 – waste_collection_schedule mapování

- **Popis:** State = typ(y) nejbližšího svozu; atributy `YYYY-MM-DD: type` pro ~20 termínů.
- **Zdroj:** `HA revize 2026-10-31`
- **Priorita:** MVP (implementováno, #41)
- **Akceptace:** Adapter fixture simuluje WCS atributy → stejný kontrakt jako kalendář.
- **Formáty senzoru** (`waste_next`, automatická detekce `detectWasteSensorFormat`):
  - `date-state` – stav = datum `YYYY-MM-DD` (případně ISO datetime, převede se na den v `Europe/Prague`),
    typ v atributu `waste_type`.
  - `type-state` – stav = typ(y) nejbližšího svozu (waste_collection_schedule), termíny jako atributy
    `YYYY-MM-DD: typ`; štítek může nést více typů oddělených `,` `;` `+` („Sklo; Papír“).
  - jinak `invalid` → bezpečná česká notice, žádné vymyšlené termíny.
  - Neznámý typ → `other` s původním štítkem.

### WST-008 – Konec dat / chybějící rok

- **Popis:** Když dataset prázdný nebo poslední datum blízko konce (data končí 2026-12-30), UI ukáže jasný stav „data končí / chybí data“.
- **Zdroj:** `HA revize 2026-10-31`
- **Priorita:** MVP
- **Akceptace:** Fixture „last date near horizon“ zobrazí notice z `notices[]` bez vymyšlených termínů 2027.

### WST-009 – Legenda s a11y

- **Popis:** Legenda typů s tooltipem; myš, dotyk i klávesnice.
- **Zdroj:** `donor/waste@e3a3c34:docs/product-brief.md`
- **Priorita:** MVP
- **Akceptace:** axe/a11y test: legenda focusable a čitelný kontrast AA.

### WST-010 – Dlouhé české názvy

- **Popis:** `display_name` se nezkracuje na úkor významu; layout se přizpůsobí.
- **Zdroj:** `donor/waste@e3a3c34:docs/acceptance.md`
- **Priorita:** MVP
- **Akceptace:** Fixture long name bez ellipsis, které by změnilo typ odpadu.

### WST-011 – Summary widget pro Dnes

- **Popis:** Export nejbližšího svozu pro modul Dnes.
- **Zdroj:** `ADR-0001 §5.4`
- **Priorita:** MVP
- **Akceptace:** `waste.summary()` shodný s hero selektorem modulu Odpady.

### WST-012 – Read-only a notifikace v HA

- **Popis:** HomeBrain neposílá push; automatizace 18:00/07:00 zůstává v HA.
- **Zdroj:** `HA revize 2026-10-31`; `donor/waste@e3a3c34:docs/product-brief.md` (mimo scope)
- **Priorita:** MVP
- **Akceptace:** Modul nemá `callService` pro notify; dokumentace to explicitně uvádí.

### WST-013 – Light/dark parity

- **Popis:** Stejná informační struktura v obou theme.
- **Zdroj:** `donor/waste@e3a3c34:docs/design-system.md`
- **Priorita:** MVP
- **Akceptace:** Screenshoty light/dark 360×800 strukturálně shodné.

### WST-014 – Kalendář WCS jako sekundární zdroj

- **Popis:** Plný seznam událostí kalendáře (`calendar.*`) pro cross-check nebo merge.
- **Zdroj:** `HA revize 2026-10-31`
- **Priorita:** MVP (implementováno, #41)
- **Akceptace:** Given binding `waste_calendar`, When adaptér merge policy enabled, Then duplicity sloučeny dle normalizačních pravidel.
- **Zdroj dat:** binding `waste_calendar` (doména `calendar`, ověřeno v config flow).
  - Primárně read-only WS `calendar/event/subscribe` (`entity_id`, `start`, `end`; okno 120 dní od
    začátku dne) – živé změny přes zprávy `event.events`.
  - Fallback (odběr nedostupný): WS `call_service` `calendar.get_events` s `return_response: true`,
    odpověď `response[entity_id].events`. Služba nic nezapisuje.
  - Tvar události v HA 2026.10.4 (ověřeno na lokálním harnessu s `local_calendar`): `start`/`end` jako
    řetězec `YYYY-MM-DD` (celodenní) nebo ISO datetime, `summary`; odběr navíc `uid` a `all_day`.
    Objekt `{date|dateTime}` (REST API) adaptér toleruje.
  - `summary` se mapuje stejně jako štítek senzoru (více typů, `other`); prázdné/neplatné události se vynechají.
  - Merge: duplicity `typ|datum` se senzorem se sloučí; chyba kalendáře → notice „Kalendář svozů není dostupný“.

### WST-015 – Produkční parser obce

- **Popis:** Obnovení dat po selhání parseru od dubna — mimo UI, provozní issue.
- **Zdroj:** `HA revize 2026-10-31`
- **Priorita:** later
- **Akceptace:** N/A pro HomeBrain kód; tracked v otevřených otázkách README.

### WST-016 – Lovelace card režim

- **Popis:** Donor podporoval card host; HomeBrain je panel modul.
- **Zdroj:** `donor/waste#6@f012025`
- **Priorita:** later
- **Akceptace:** Volitelná Lovelace glance karta Fáze 4+ mimo MVP panel.

## Portovat vs. zahodit

| položka | rozhodnutí | důvod |
| --- | --- | --- |
| schema + 13 fixtures | portovat | pilot ADR-0001 |
| PR #6 adapter | portovat | do modules/waste |
| per-type template senzory | zahodit | `HA revize 2026-10-31` |
| HA automatizace připomínek | zahodit (v HB) | zůstávají v HA |

## Mimo rozsah

Produkční deploy donor card; redesign mimo schválený směr; generování ICS v HomeBrain.

## Otevřené otázky

- Kdo produkuje ICS/WCS data pro 2027+?
- Sloučit dataset sensor a kalendář v jednom adaptéru nebo dual source?

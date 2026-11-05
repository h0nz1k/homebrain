# Rodina – požadavky

Stav: zpřesněno 2026-10-31 (discovery issue #14); **rozhodnutí vlastníka 2026-10-31** zapracována (viz níže), včetně modelu domácnosti (D6) a vyřazení směn (D7). Předchozí sklizeň: issue #13. Zdroje: `ADR-0001 §4.4, §5.7`, [ADR-0002](../adr/0002-roles-and-users.md), `HA revize 2026-10-31` (anonymizované výchozí předpoklady).

## Rozsah

Modul Rodina odpovídá na otázky: **co nás tento týden čeká** (rodinný kalendář), **kdo je teď doma**, **co je ve škole** a **co je potřeba zařídit** (sdílený seznam a domácí povinnosti). Směny nejsou v rozsahu (D7). Škola a domácí povinnosti jsou v rozsahu MVP, pokud jsou data v HA kalendáři / todo seznamu (rozhodnutí 2026-10-31); vyzvedávání dětí a predikce přítomnosti zůstávají `later`. Repozitář `donor/family` je prázdný; požadavky vycházejí z ADR a z toho, co v HA skutečně existuje.

## Rozhodnutí vlastníka (2026-10-31, issue #14)

| # | otázka | rozhodnutí | dopad |
| --- | --- | --- | --- |
| D1 | Zdroj kalendářů | rodinné a školní kalendáře jsou **externí kalendáře** (Google / Outlook / ICS) připojené do HA integrací → entity `calendar.*`; HomeBrain jen čte | FAM-001, FAM-002, FAM-013; žádné vlastní úložiště událostí |
| D2 | Přítomnost dalších členů | další členové se založí jako HA `person` s **Companion app** (`device_tracker` z `mobile_app`) | FAM-003; **žádné** odvozování ze síťových trackerů routeru |
| D3 | Škola a domácí povinnosti | **v rozsahu modulu**; škola z externího kalendáře v HA, povinnosti z HA todo seznamu | FAM-013, FAM-014 → MVP; klíče `family_calendar_school`, `family_todo_chores` |
| D4 | Nástěnný tablet | zůstává **stávající kiosk prohlížeč**, bez dedikovaného HA uživatele v MVP | FAM-009, [ADR-0002](../adr/0002-roles-and-users.md) §3 bod 7 |
| D5 | Model rolí | schválen `owner \| adult \| child \| guest \| kiosk` | FAM-007, FAM-017, ADR-0002 |
| D6 | Model domácnosti | **domácnost s dětmi:** 1× `owner` (admin), další `adult` a `child`; v repu jen role, žádná jména ani počty | FAM-003, FAM-007; další `person` k založení; ne každý dospělý musí nosit chytrý telefon s Companion app |
| D7 | Směny | **zamítnuto** — směny nejsou v rozsahu | FAM-008, FAM-011, FAM-012 vyřazeny (sekce *Vyřazeno*); směny se z ostatních požadavků odstraňují |

## Výchozí předpoklady o HA (anonymizováno)

| oblast | předpoklad | dopad na modul |
| --- | --- | --- |
| Kalendáře | rodinný ani školní kalendář v HA zpravidla zatím není | připojí se externí kalendáře přes HA integraci (D1, D3); odpadový kalendář patří modulu Odpady |
| Osoby | `person` typicky existuje jen pro správce; další členové domácnosti se doplní | doplní se jako `person`, s Companion app tam, kde ji člen používá (D2) |
| Trackery | síťové `device_tracker` z routeru bez vazby na osoby | **nepoužívá se** (D2) — citlivé a nespolehlivé |
| Seznamy | HA `todo` (např. nákupní seznam); termín (due) nemusí být podporován | MVP = čtení seznamu; due date jen pokud entita podporuje |
| Tablet | nástěnný tablet s kiosk prohlížečem | kiosk scénář (FAM-009, ADR-0002) |
| Uživatelé | další členové domácnosti a tablet zatím nemusí mít vlastní HA účet | role a kiosk uživatele řeší ADR-0002 |

## Datové vstupy (logické klíče)

| klíč | doména/typ | povinný (MVP) | stav v HA 2026-10-31 | poznámka |
| --- | --- | --- | --- | --- |
| `family_calendar_family` | calendar | ne (MVP sekce)* | chybí (připojí vlastník) | společné rodinné události — hlavní zdroj mřížky FAM-001 |
| `family_calendar_school` | calendar (seznam, 1..n) | ne (MVP sekce) | chybí (připojí vlastník) | externí školní kalendář přes HA integraci: rozvrh, akce, prázdniny (FAM-013) |
| `family_persons` | person (seznam) | ano | částečně | přítomnost doma; osoby s Companion app (`mobile_app`) i bez ní (stav „neznámo“, FAM-003); pořadí = pořadí v UI |
| `family_todo_shared` | todo | ne | existuje (nákupní seznam) | sdílený seznam |
| `family_todo_chores` | todo (seznam, 1..n) | ne (MVP sekce) | chybí (založí vlastník) | domácí povinnosti v HA todo seznamu, např. Local To-do (FAM-014) |
| `family_pickup_assignee` | WS prefs | ne | — | kdo vyzvedává (later) |

\* Hlavní hodnota MVP = rodinný kalendář, škola, povinnosti a kdo je doma. Modul musí plně fungovat i bez bindingů (FAM-016).

Logické klíče nejsou `entity_id`; vazba klíč → entita se nastavuje v integraci `homebrain` (admin, WS `homebrain/bindings/set`).

## Požadavky

### FAM-001 – Týdenní kalendářní mřížka

- **Popis:** Přehled 7 dní (dnes + 6) událostí ze všech navázaných kalendářů `family_calendar_*` (rodina, škola), seskupený po dnech; zdroje jsou vizuálně odlišené štítkem.
- **Zdroj:** `ADR-0001 §5.7`; `HA revize 2026-10-31`
- **Priorita:** MVP
- **Akceptace:** Given syntetický rodinný + školní kalendář v `ha-test`, When otevřu modul Rodina na 800×1280, Then vidím 7 dnů bez horizontálního scrollu, události mají štítek zdroje (Rodina / Škola); na 360×800 se mřížka zobrazí jako seznam dnů.

### FAM-002 – Načtení událostí přes HA API

- **Popis:** Události číst službou `calendar.get_events` (s response) pro rozsah týdne; žádné ICS v Gitu ani přímé čtení `.storage`.
- **Zdroj:** `ADR-0001 §4.3`; `HA revize 2026-10-31`
- **Priorita:** MVP
- **Akceptace:** Adapter volá jen allowlistovanou read službu; unit test mockuje odpověď bez sítě; chyba jednoho kalendáře nezablokuje ostatní (stav „kalendář nedostupný“).

### FAM-003 – Přítomnost osob

- **Popis:** Stav entit `person` z `family_persons` jako „doma / pryč / neznámo“ s časem poslední změny.
- **Zdroj:** `ADR-0001 §5.7`; `HA revize 2026-10-31`; rozhodnutí D2
- **Pozn.:** Zdroj polohy = `device_tracker` z Companion app přiřazený k `person` v HA; síťové trackery routeru se nepoužívají.
- **Priorita:** MVP
- **Pozn. (D6):** Ne všichni dospělí musí nosit chytrý telefon s Companion app. Osoba bez trackeru nebo s neaktivním trackerem se zobrazí jako „neznámo“, nikdy jako „pryč“; UI to nesmí prezentovat jako chybu.
- **Akceptace:** Given `person` ve stavu `home` → badge „doma“; `not_home` nebo jiná zóna → „pryč“ (název zóny jen pro `owner`/`adult`, FAM-017); `unknown`/`unavailable` nebo `person` bez přiřazeného `device_tracker` → „neznámo“, nikdy „pryč“. Syntetická fixture s osobami všech rolí (`owner`, `adult`, `child`), z toho alespoň 1 bez trackeru. Texty v cs-CZ.

### FAM-004 – Sdílený seznam (čtení)

- **Popis:** Read-only seznam otevřených položek z `family_todo_shared` (typicky nákupní seznam).
- **Zdroj:** `ADR-0001 §5.7`; `HA revize 2026-10-31`
- **Priorita:** MVP
- **Akceptace:** Položky přes `todo.get_items`; termín (due) se zobrazí jen když ho entita podporuje (`supported_features`); prázdný seznam → text „Nic k nákupu“.

### FAM-005 – Kdo vyzvedává

- **Popis:** Pro dnešní vyzvednutí dětí zobrazit odpovědnou osobu z kalendáře nebo prefs.
- **Zdroj:** `ADR-0001 §5.7`
- **Priorita:** later (v HA neexistuje žádný zdroj; závisí na FAM-013)
- **Akceptace:** Given událost s konvencí v názvu nebo `family_pickup_assignee`, When dnes vyzvednutí, Then panel ukáže friendly name osoby z HA (jména nejsou v Gitu).

### FAM-006 – Summary pro Dnes

- **Popis:** Export dnešních a zítřejších rodinných a školních událostí + přítomnosti pro modul Dnes.
- **Zdroj:** `ADR-0001 §5.1`
- **Priorita:** MVP
- **Akceptace:** `family.summary()` vrací max N událostí seřazených časem a seznam osob se stavem; contract test proti fixture; respektuje roli volajícího (FAM-017).

### FAM-007 – Role a viditelnost

- **Popis:** Viditelnost modulu a detailů dle rolí z [ADR-0002](../adr/0002-roles-and-users.md); data z HomeBrain store filtrovaná serverově.
- **Zdroj:** `ADR-0001 §4.4`; ADR-0002
- **Priorita:** MVP
- **Akceptace:** pytest WS: `guest` dostane `unauthorized` na `homebrain/family/*`; `kiosk` čte summary, ne prefs ani bindings; bindings mění jen HA admin.

### FAM-009 – Kiosk tablet rodinný režim

- **Popis:** Zjednodušený pohled „dnes + zítra“ (události, kdo je doma, nákupní seznam) na nástěnném tabletu.
- **Zdroj:** `ADR-0001 §4.4`, Fáze 4; `HA revize 2026-10-31` (tablet s kiosk prohlížečem existuje); rozhodnutí D4
- **Pozn.:** Tablet zůstává na stávajícím kiosk prohlížeči; role `kiosk` se mapuje na HA uživatele, pod kterým je prohlížeč přihlášen. Je-li to admin, HomeBrain ho bere jako `owner` — viz riziko v ADR-0002 §3 bod 7.
- **Priorita:** later (Fáze 4)
- **Akceptace:** Uživatel s rolí `kiosk` vidí velké písmo, bez Nastavení, auto-návrat na „Dnes“; `?kiosk=1` mění jen layout, neuděluje práva (ADR-0002, hrozba T4).

### FAM-010 – Schválení scénářů vlastníkem

- **Popis:** Vlastník potvrdí rozsah MVP a odpovědi na otevřené otázky (issue #14). Otázky zdroje kalendářů, přítomnosti, školy/povinností, tabletu, rolí, složení domácnosti a směn rozhodnuty 2026-10-31 (D1–D7); zbývá otázka níže.
- **Zdroj:** `ADR-0001 §10.3` issue 14; `needs-owner-decision`
- **Priorita:** later (neblokuje MVP)
- **Akceptace:** Komentář vlastníka v #14 se zbývající odpovědí (zápis z kiosku, FAM-015). Složení domácnosti dle rolí je rozhodnuto (D6).

### FAM-013 – Děti a škola

- **Popis:** Školní rozvrh, prázdniny a akce školy z `family_calendar_school` — externí kalendář (např. Google / Outlook / ICS školy) připojený do HA integrací; jen čtení přes `calendar.get_events`.
- **Zdroj:** issue #14; rozhodnutí D3
- **Priorita:** MVP
- **Akceptace:** Given syntetický školní kalendář v `ha-test`, Then události školy jsou v mřížce FAM-001 s vlastním štítkem „Škola“ a celodenní události (prázdniny) jako pruh dne; bez bindingu se sekce nezobrazuje (FAM-016); `child` vidí školní události.

### FAM-014 – Domácí povinnosti

- **Popis:** Seznam otevřených povinností z `family_todo_chores` (HA todo seznam, např. Local To-do; 1 seznam společný nebo 1 na osobu).
- **Zdroj:** issue #14; rozhodnutí D3
- **Priorita:** MVP (čtení; odškrtnutí viz FAM-015)
- **Akceptace:** Položky přes `todo.get_items`; termín (due) jen pokud ho entita podporuje, po termínu zvýrazněno; přiřazení osobě konvencí v názvu položky nebo seznamu (1 seznam na osobu); bez bindingu se sekce nezobrazuje; `guest` nic.

### FAM-015 – Přidání a odškrtnutí položky seznamu

- **Popis:** Zápis do `family_todo_shared` a `family_todo_chores` (`todo.add_item`, `todo.update_item`) z panelu; z kiosku jen po rozhodnutí vlastníka.
- **Zdroj:** `README X-007`; `HA revize 2026-10-31` (entita zápisy podporuje)
- **Priorita:** later (`writes-to-ha`)
- **Akceptace:** Služby jsou v allowlistu `@homebrain/ha-client`; role `guest` zápis nemá; zápis nese HA kontext uživatele (audit).

### FAM-016 – Prázdný a nenavázaný stav

- **Popis:** Modul je použitelný bez jakýchkoli bindingů: sekce bez dat se skryjí, admin vidí výzvu k nastavení, ostatní role neutrální text.
- **Zdroj:** `HA revize 2026-10-31` (většina zdrojů chybí)
- **Priorita:** MVP
- **Akceptace:** Given žádné bindingy, Then modul nehlásí chybu; admin vidí odkaz do Nastavení, `adult`/`kiosk` text „Rodinný přehled zatím není nastaven“.

### FAM-017 – Soukromí událostí a polohy

- **Popis:** Detaily událostí (popis, místo) a název zóny vidí jen `owner`/`adult`; `child`/`kiosk` vidí jen název/typ události a doma/pryč/neznámo; `guest` nic.
- **Zdroj:** ADR-0002; `README X-001`
- **Priorita:** MVP
- **Akceptace:** pytest pro `homebrain/family/summary` per role: pole `location`/`description` v odpovědi pro `kiosk` a `child` chybí. Pozn.: chrání jen data servírovaná přes HomeBrain WS — viz ADR-0002 T1.

## Portovat vs. zahodit

| položka | rozhodnutí | důvod |
| --- | --- | --- |
| donor/family repo | zahodit (prázdné) | ADR-0001 §11 |
| Školní kalendář, povinnosti | externí kalendář přes HA / HA todo seznam (D3) | v HA dnes chybí; založí vlastník |
| Odpadový kalendář | ne v Rodině | patří modulu Odpady; skládá je modul Dnes |
| Síťové trackery z routeru jako přítomnost | zahodit (D2) | citlivé, nespolehlivé (spící telefon ≠ pryč); místo nich Companion app |

## Vyřazeno

Zamítnuto vlastníkem 2026-10-31 (směny mimo rozsah, D7). ID ponechána kvůli dohledatelnosti; nezapočítávají se do MVP ani `later`.

| ID | název | stav |
| --- | --- | --- |
| FAM-008 | WS family store pro vlastní směny | Zamítnuto vlastníkem 2026-10-31 (mimo rozsah) |
| FAM-011 | Kalendář směn: zdroj a konvence | Zamítnuto vlastníkem 2026-10-31 (mimo rozsah) |
| FAM-012 | Kdo bude doma (predikce ze směn) | Zamítnuto vlastníkem 2026-10-31 (mimo rozsah) |

Vyřazeny také logické klíče `family_calendar_shifts`, `family_shift_person_map`, `family_shift_types`.

## Mimo rozsah

Směny (D7); zápisy do externích kalendářů z UI; náhrada HA todo vlastní aplikací; odvozování přítomnosti ze síťových trackerů; sledování polohy mimo HA zóny; nádražní tabule.

## Otevřené otázky (pro vlastníka, #14)

Rozhodnuté otázky (zdroj kalendářů, přítomnost, škola/povinnosti, tablet, role, složení domácnosti, směny) jsou v sekci *Rozhodnutí vlastníka*. Zbývá:

1. **Zápis do seznamů z kiosku** (FAM-015) — chceme?

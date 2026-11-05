# Zdraví – požadavky

Stav: sklizeno 2026-10-31 (issue #13). Zdroje: `donor/health@f642b91`, `HA revize 2026-10-31`, `ADR-0001 §5.5`.

## Rozsah

Read-only dashboard nad entitami a službami samostatné integrace `health_fitness` (verze 0.7.0). Data v produkčním HA zatím nejsou — MVP vyžaduje nasazení integrace. Calistree import přes Tasker/webhook zůstává v integraci, ne v HomeBrain frontendu.

## Datové vstupy (logické klíče)

| klíč | doména/typ | jednotka | povinný (MVP) | poznámka |
| --- | --- | --- | --- | --- |
| `health_next_step` | sensor/text | — | ano | hero doporučení |
| `health_weekly_strength_progress` | sensor | count | ano | completed/target |
| `health_xp_total` | sensor | XP | ano | z reward ledger |
| `health_xp_level` | sensor | level | ne | |
| `health_streak_weeks` | sensor | weeks | ne | |
| `health_last_workout` | sensor | — | ne | poslední trénink summary |
| `health_weight_trend` | sensor | kg | ne | vyhlazený trend |
| `health_sleep_last` | sensor | — | ne | denní souhrn |
| `health_milestone_*` | binary_sensor | — | ne | threshold milníky |
| `health_flex_meal_token` | sensor | enum | ne | available/consumed |

Konkrétní mapování na entity integrace `health_fitness` v options HomeBrain (bez jmen entit v Gitu).

## Požadavky

### HEA-001 – Předpoklad nasazení integrace

- **Popis:** Modul Zdraví vyžaduje aktivní `custom_components/health_fitness` v HA.
- **Zdroj:** `HA revize 2026-10-31`; `ADR-0001 §5.5`
- **Priorita:** MVP
- **Akceptace:** Given integrace chybí, When modul otevřen, Then empty state vysvětlí nutnost instalace HACS release v0.7.0.

### HEA-002 – Hero „další správný krok“

- **Popis:** Na první pohled doporučení bez scrollu na tabletu.
- **Zdroj:** `donor/health@f642b91:docs/product-brief.md`; `docs/acceptance.md`
- **Priorita:** MVP
- **Akceptace:** Fixture F-002 hero text deterministický; shoda s integrační logikou (read-only).

### HEA-003 – Týdenní minimum silových tréninků

- **Popis:** Progress `completed / target` pro ISO týden.
- **Zdroj:** `donor/health@f642b91:docs/data-contract.md` (goal_state)
- **Priorita:** MVP
- **Akceptace:** When `strength_sessions_completed=2` a target 3, Then UI „2 / 3“.

### HEA-004 – XP, streak bez fabrikace

- **Popis:** XP a streak z entit integrace; prázdná instalace neukazuje nulu jako historii.
- **Zdroj:** `donor/health@f642b91:docs/fixtures-and-error-states.md` (F-001)
- **Priorita:** MVP
- **Akceptace:** Fixture F-001: XP/streak absent nebo explicitní empty, ne „0“ jako falešná historie.

### HEA-005 – Poslední trénink a trend hmotnosti

- **Popis:** Shrnutí poslední session a vyhlazený trend váhy (ne diagnostika).
- **Zdroj:** `donor/health@f642b91:docs/product-brief.md`; `docs/data-contract.md`
- **Priorita:** MVP
- **Akceptace:** Given synthetic workout + body_measurement fixtures, When detail otevřen, Then duration a trend bez raw exportu.

### HEA-006 – Odměny a milníky read-only

- **Popis:** Zobrazení XP milníků dle katalogu; bez mutace Reward/Milestone store z UI MVP.
- **Zdroj:** `donor/health@f642b91:docs/milestone-catalog-contract.md`; `docs/reward-ledger-contract.md`
- **Priorita:** MVP
- **Akceptace:** Milník binary senzory reflektují Store; UI nevolá reconcile.

### HEA-007 – Flex meal token zobrazení

- **Popis:** Stav flex režimu týdně; consume akce mimo MVP nebo jen přes allowlist později.
- **Zdroj:** `donor/health@f642b91:docs/flex-meal-token-contract.md`
- **Priorita:** later
- **Akceptace:** MVP zobrazí `available|consumed`; tlačítko consume vyžaduje `writes-to-ha` issue.

### HEA-008 – Calistree import zůstává v integraci

- **Popis:** HomeBrain neimplementuje webhook; import idempotence dle envelope kontraktu.
- **Zdroj:** `donor/health@f642b91:docs/calistree-import-contract.md`; `docs/data-contract.md`
- **Priorita:** MVP
- **Akceptace:** Dokumentace modulu odkazuje na integraci; žádný LLAT/webhook secret v panelu.

### HEA-009 – Chybové stavy UI

- **Popis:** loading, stale, unavailable, empty dle fixtures F-001–F-004.
- **Zdroj:** `donor/health@f642b91:docs/fixtures-and-error-states.md`
- **Priorita:** MVP
- **Akceptace:** Každý fixture scénář má Vitest snapshot EmptyState/StatusBadge.

### HEA-010 – Spánek a doporučení

- **Popis:** Sleep-dependent doporučení blokována pokud `source_verified=false`.
- **Zdroj:** `donor/health@f642b91:docs/data-contract.md` (sleep_daily)
- **Priorita:** MVP
- **Akceptace:** Fixture unverified sleep nezobrazí sleep-based hero radu.

### HEA-011 – Summary pro Dnes

- **Popis:** Export hero next step pro modul Dnes.
- **Zdroj:** `ADR-0001 §5.1`
- **Priorita:** MVP
- **Akceptace:** `health.summary()` contract test PASS.

### HEA-012 – Žádná lékařská diagnostika

- **Popis:** UI není léčebné doporučení; trend je informativní.
- **Zdroj:** `donor/health@f642b91:docs/product-brief.md` (mimo scope)
- **Priorita:** MVP
- **Akceptace:** Copy review nenachází diagnostické formulace.

### HEA-013 – Exercise progress kontrakt

- **Popis:** Pro vybrané cviky zobrazit progress summary dle exercise-progress kontraktu.
- **Zdroj:** `donor/health@f642b91:docs/exercise-progress-contract.md`
- **Priorita:** later
- **Akceptace:** Given configured exercise_id, When data ok, Then trend_direction label dle pravidla.

### HEA-014 – Integrace release a CI

- **Popis:** Donor doplní hacs.json, LICENSE, release v0.7.0 na main integrace (paralelní track).
- **Zdroj:** `ADR-0001 §11`; `manifest.json` version 0.7.0
- **Priorita:** later
- **Akceptace:** Sledováno v repo `donor/health`, ne v homebrain kódu.

### HEA-015 – Calm Coach UI z prototypu

- **Popis:** Kompozice, informační hierarchie, funkce a tón obrazovky přebírá vlastníkem schválený prototyp Calm Coach; barvy, typografie a karty zůstávají HomeBrain (`--hb-*`, round-2 jako Počasí/Energie/Dnes). Prototyp byl schválen už 2026-07-24 – nejde o „later“.
- **Zdroj:** `donor/health@f642b91:docs/prototype-handoff.md` (přijato 2026-07-24, commit `c7adbdc`); `docs/tasks/003-ui-create-canonical-calm-coach-prototype--2026-07-23.md`; `docs/tasks/006-governance-align-prototype-visual-review--2026-07-25.md`; `docs/design-system.md`; `prototype/` (F-001…F-011); `ADR-0001 §5.5`
- **Priorita:** MVP
- **Akceptace:** Dnes = hero 2/3 (stavová pill, „Nejbližší správný krok“, titulek, popis, skok do Progresu, kruh týdenního cíle) + spánek 1/3; poslední trénink 1/3 + „Tento týden“ 2/3 (pás Po–Ne, 3 čísla); trend hmotnosti „Trend, ne denní výkyv“. Mobil ve stejném pořadí jako prototyp. Light/dark se stejnou strukturou. Label `needs-owner-visual-check`. Donor repo nemá licenci → žádné kopírování CSS/assetů.

### HEA-016 – Čtyři části: Dnes / Progres / Odměny / Data

- **Popis:** IA prototypu: Odměny (úroveň „Klidná konzistence“, týdenní série, flexibilní jídlo, milníky) a Data (stav zdroje, poslední import, stav polí, limit zastarání, soukromí) jsou samostatné části, ne přeplněný Dnes. V HomeBrain jako záložky modulu (`?zalozka=dnes|progres|odmeny|data`); tlačítka jsou jen navigace.
- **Zdroj:** `donor/health@f642b91:docs/design-system.md` (Informační architektura); `docs/prototype-handoff.md` (Views, Acceptance 1–3)
- **Priorita:** MVP
- **Akceptace:** e2e: XP/milníky až na záložce Odměny; žádné `button` mimo navigaci; stavy F-001/F-009/F-010 mají calm copy a explicitní textový stav.

### HEA-017 – Data, která prototyp ukazuje a integrace v0.7.0 neposílá

- **Popis:** Název tréninku, série/opakování a chipy cviků, 7 nocí spánku, průměrný spánek, aktivní minuty, progres vybraných cviků, týdenní srovnání („+1 proti minulému týdnu“) a počty posledního importu (imported/updated/duplicate/rejected). HomeBrain je nedopočítává; pás dní týdne bere jen z historie recorderu senzoru posledního tréninku.
- **Zdroj:** `donor/health@f642b91:prototype/data/F-002.json`, `F-005.json`, `F-007.json`; `docs/design-system.md` (Data diagnostics)
- **Priorita:** later (vyžaduje nové senzory v integraci)
- **Akceptace:** Až integrace hodnoty vystaví, doplní se do karet Poslední trénink / Tento týden / Progres / Data bez změny kompozice.

## Portovat vs. zahodit

| položka | rozhodnutí | důvod |
| --- | --- | --- |
| Celá integrace Python | ponechat aktivní | samostatné repo |
| UI koncepty Calm Coach | portovat (inspirace) | ADR-0001 |
| Raw Calistree v UI | zahodit | envelope only |
| Webhook v panelu | zahodit | integrace only |

## Mimo rozsah

Kalorický příjem z fotek; náhrada Calistree; ukládání raw exportů v Gitu.

## Otevřené otázky

- Pořadí nasazení: integrace vs. HomeBrain modul ve Fázi 3.
- Které sleep/activity zdroje budou v produkci kromě Calistree.

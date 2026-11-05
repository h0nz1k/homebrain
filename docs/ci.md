# CI: pravidla a rozpočet minut

Repo je zatím soukromé → GitHub účtuje každý job **zaokrouhleně nahoru na celé minuty**. Cílem je
nespouštět nic dvakrát a nic, co změna nemůže ovlivnit. Bezpečnost má přednost: kdykoli si gate
není jistý, spustí víc, ne míň.

## Workflowy

| Workflow | Kdy | Co |
|---|---|---|
| `ci.yml` | PR (ne draft), push na `main` | `js` (gate + gitleaks + lint/typecheck/vitest/build) → `python`, `e2e` |
| `nightly.yml` | týdně (po 03:23 UTC) + ručně | gitleaks celé historie, **celé** e2e na všech projektech (vč. `tablet`), python s nejnovějšími HA deps |
| `release.yml` | tag `v*` | build + balíček; testy jen když CI daný commit neověřilo |

## Gate (`scripts/ci/gate.sh`, první krok jobu `js`)

Dřívější samostatný job `secrets` je složený do `js` (−1 účtovaná minuta na běh). `python` a `e2e`
čekají na `js` jen kvůli jeho výstupům; `python` běží i když `js` selže.

1. **Draft PR** → jen gitleaks (1 min). Plná sada se pustí událostí `ready_for_review`.
   Stav draftu gate čte živě z API (payload může být zastaralý).
   **Pořadí: nejdřív `gh pr ready`, potom push.** Push těsně následovaný `gh pr ready` závodí:
   concurrency zruší jeden z běhů a druhý mohl vidět `draft=true` (ověřeno na #118). Živé čtení
   draftu to zmírňuje, ale spoléhat se na to nedoporučujeme; když už se to stane, pomůže
   `gh run rerun <id>` nejnovějšího běhu (ne nový push).
2. **Pull request** → mapování změněných souborů (merge commit vs. base) přes `scripts/ci/changes.sh`.
   Do logu zapíše `HB_TESTED tree=<strom merge commitu> base=<base>` — z toho čte push na `main`.
3. **Push na `main`** → *reuse ověřeného výsledku*: sada se přeskočí, právě když
   - commit je `merge_commit_sha` mergnutého PR z tohoto repa (ne fork),
   - merge nemění `.github/` ani `scripts/ci/`,
   - existuje **zelený** PR běh pro finální head PR, jehož `js` log obsahuje
     `HB_TESTED` se **stejným stromem** (tree SHA) a **stejnou base** (`github.event.before`).
   Stejný strom na stejné base = bit po bitu stejný kód, který už prošel. Jinak (base se mezitím
   pohnula, API selže, log chybí…) se spustí normální sada podle změněných cest.
4. Push bez použitelného `before` nebo jiná událost → všechno.

Proč ne jednodušší „na main jen secrets + build“: nechytí sémantický konflikt dvou PR testovaných
proti staré base. Reuse s kontrolou base je stejně levný (1 min) a v tom případě sadu spustí.
Běhy na `main` se proto už navzájem neruší (`cancel-in-progress` jen pro PR).

## Mapování cest (`scripts/ci/changes.sh`)

| Změna | js | python | e2e |
|---|---|---|---|
| `*.md`, `docs/**`, `LICENSE`, `renovate.json`, issue šablony | – | – | – |
| obrázky mimo `apps/ modules/ packages/ custom_components/ tests/ scripts/ ha-test/` | – | – | – |
| `nightly.yml`, `release.yml` | – | – | – |
| `ci.yml`, `scripts/ci/**` | ✓ | ✓ | vše |
| `*.py`, `custom_components/**`, `tests/python/**`, `requirements-test.txt`, `pyproject.toml` | – | ✓ | – |
| `*.test.ts(x)`, `__tests__/`, `vitest*.ts` | ✓ | – | – |
| `tests/e2e/<x>.spec.ts` | ✓ | – | ten spec |
| `modules/<x>/**` | ✓ | – | `<x>*.spec.ts` + `shell` (+ viz níže) |
| `scripts/waste/**` | ✓ | – | `waste*.spec.ts` |
| `apps/**`, `packages/**`, ostatní `tests/e2e/**`, `playwright.config.ts`, `package.json`, lockfile, `pnpm-workspace.yaml`, `tsconfig*.json`, `.nvmrc` | ✓ | – | vše |
| cokoli jiného | ✓ | – | – |

Moduly navíc: producenti signálů (`energy health weather wine waste today`) → `today*.spec.ts`;
`energy health wine today` → `back-navigation.spec.ts`; `waste` → `toast.spec.ts`.
Nový modul bez vlastního specu dostane aspoň `shell.spec.ts`. **Přidáváte-li spec, který testuje
jiný modul než jeho prefix, doplňte mapování v `changes.sh` i zde.**

Ověření lokálně: `printf 'modules/wine/src/x.ts\n' | bash scripts/ci/changes.sh`.

## E2E

- PR/main: projekty `desktop` + `mobile-s21`, `--workers=$(nproc)` (2 vCPU soukromé, 4 veřejné repo).
  `tablet` a celá sada běží v nightly.
- Cache: pnpm store (`setup-node cache: pnpm`), prohlížeče Playwright (`~/.cache/ms-playwright`,
  klíč = verze Playwright); při zásahu se instalují jen systémové závislosti.

## Secret scan

- PR: commity `base..head` PR; push: `before..after`; nightly + push bez `before`: celá historie (`--all`).

## Release

`scripts/ci/ci-passed.sh` najde CI push běh pro tagovaný commit (čeká max. 3 min, pokud ještě běží).
Testy (lint, typecheck, vitest, pytest) se přeskočí jen když běh skončil `success` a buď proběhly
kroky `Unit tests (vitest)` i `Python tests (pytest)`, nebo krok `Reuse verified PR result`.
Jinak je release spustí sám. Build, kontrola velikosti bundlu a balíček běží vždy.

## Názvy, na které se kód odkazuje

Job `js`, kroky `Unit tests (vitest)`, `Python tests (pytest)`, `Reuse verified PR result` a řádek
`HB_TESTED` čtou `gate.sh` / `ci-passed.sh` přes API. Při přejmenování upravte oba skripty.

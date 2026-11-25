# Přispívání / Contributing

Díky za zájem. Krátká pravidla:

1. **Jen syntetická testovací data.** Fixtures, screenshoty a příklady nesmí pocházet ze skutečné domácnosti:
   žádné IP adresy, hostnames, e-maily, tokeny, GPS souřadnice domova, skutečná `entity_id`, názvy zařízení,
   jména osob, adresy ani mapy bytu. Používejte neutrální příklady (`lock.front_door`, `sensor.demo_power`,
   `example.org`, souřadnice centra velkého města). Privátní IPv4 v testech skládejte za běhu.
2. **Commity pod `noreply` e-mailem** (`<id>+<login>@users.noreply.github.com`), ne pod osobním.
3. Před pushem: `gitleaks git -c .gitleaks.toml .` musí být bez nálezu.
4. Kvalita: `pnpm lint && pnpm typecheck && pnpm test && pnpm build` a `pytest tests/python` zelené. Plnou sadu
   (vč. e2e) spouští CI na každém PR, i na draftu (`docs/ci.md`); lokálně stačí rychlé kontroly dotčeného modulu.
5. UI texty česky (`cs-CZ`), identifikátory v kódu anglicky. Nové obrazovky se screenshoty 360×800, 800×1280, 1440×900
   (jen z dev mocku se syntetickými daty).
6. PR nejdřív jako draft; merge schvaluje vlastník. Změny zapisující do HA nesou label `writes-to-ha`.

## Git hooky a codemap

- **Instalace jednou po klonu:** `bash scripts/install-hooks.sh` (nastaví `core.hooksPath=.githooks`,
  idempotentní; platí pro všechny worktree daného klonu).
- **`pre-commit`** (jen připravené/staged změny, typicky pár sekund): `gitleaks` nad staged diffem,
  `.py` → `ruff check` + `ruff format --check`, `prettier --check` (respektuje `.prettierignore`),
  `.ts/.tsx/.js/.mjs` → `eslint`. Oprava: `ruff format <soubor>`, `pnpm exec prettier --write <soubor>`, pak `git add`.
- **`pre-push`** (změny proti `origin/main`, typicky do 3 min): o sadě rozhoduje `scripts/ci/changes.sh`
  jako v CI; build závislostí + typecheck + vitest dotčených balíčků, `ruff` + pytest dotčených testů,
  gitleaks nad pushovanými commity, smoke `codemap`. E2E zůstává v CI. Těžké kroky jdou přes `heavy`, je-li k dispozici.
- Chybějící nástroj (`gitleaks`, `ruff`, `node_modules`) = chyba s návodem, nic se tiše nepřeskakuje.
- **`git commit --no-verify` / `git push --no-verify` jen v nouzi** – CI totéž zkontroluje znovu.
- **Codemap:** `pnpm codemap <cesta>`, `--rdeps <soubor>`, `--missing-docs` – viz [`docs/codemap.md`](docs/codemap.md).

_English: synthetic test data only, commit with a GitHub noreply e-mail, keep gitleaks/CI green, open PRs as drafts.
Install the git hooks once: `bash scripts/install-hooks.sh`; `--no-verify` is for emergencies only._

# AGENTS.md – pravidla pro agenty (Codex, Claude, Cursor, LANA)

1. **GitHub Issues jsou autoritativní.** Každá změna odkazuje issue (`Refs #N` / `Closes #N`). Evidence (CI, screenshoty) patří do komentáře issue/PR, ne do souborů v Gitu.
2. **Nikdy nenasazuj do produkčního Home Assistantu** a nepřipojuj se k němu. Žádné tokeny produkce, žádné LLAT v repu ani v bundlu.
3. **Vyvíjej proti mockům** (`pnpm dev`, `packages/testing`) nebo **testovacímu HA kontejneru** (`ha-test/`). Lokální token testovacího HA jen v `.env.local` (gitignored).
4. **Label `writes-to-ha`** = změna, která zapisuje do HA. Vyžaduje **schválení vlastníka** před merge; služby jen přes allowlist v `@homebrain/ha-client`.
5. **Merge a deploy schvaluje vlastník.** Agent otevírá PR (nejdřív jako draft), nemerguje.
6. **UI je česky** (`cs-CZ`). Identifikátory v kódu anglicky.
7. **Nic soukromého v repu (licence MIT, repo může být veřejné).** Zakázáno: IP adresy a hostnames domácnosti, `*.ts.net` / Nabu Casa URL, e-maily, tokeny, GPS, skutečná `entity_id` a názvy zařízení z vlastníkova HA, jména osob, adresy, ulice a obce. Vazby logický klíč → `entity_id` se nastavují v integraci v HA, nikdy v Gitu. Fixtures jsou syntetické nebo anonymizované. Před každým push spusť `gitleaks git -c .gitleaks.toml .` – nález = nepushovat.
8. **Kvalita**: `pnpm lint typecheck test build` a `pytest tests/python` zelené – ověřuje je **CI**, i na draft PR. Python async, bez blokujícího I/O.
9. **Widgety nečtou celé `hass.states`** – jen své bindings přes entity store `ha-client`.
10. Nové obrazovky: label `needs-owner-visual-check` + screenshoty 360×800, 800×1280, 1440×900.
11. **Ověřování: lokálně rychle, plně v CI.** Sdílený stroj má málo CPU/RAM a běží na něm víc agentů.
    - Lokálně jen rychlé kontroly dotčeného modulu, vždy přes frontu `heavy`: např.
      `heavy pnpm exec vitest run modules/<modul>`, `heavy pnpm --filter <balíček> typecheck`,
      `heavy pnpm exec eslint <soubory>`, u Pythonu `heavy pytest tests/python/test_<x>.py`.
    - Pak push a čekání na CI: `gh pr checks <n> --watch --fail-fast` (nebo `gh run watch <id>`).
      CI (`.github/workflows/ci.yml`, pravidla v `docs/ci.md`) běží na každém PR včetně draftu:
      js + python + e2e (sharded) podle změněných cest. Při selhání e2e stáhni report:
      `gh run download <id> -n playwright-report-<k>`.
    - Celé lokální e2e (`pnpm test:e2e`) jen když CI není k dispozici nebo pro screenshoty do PR.

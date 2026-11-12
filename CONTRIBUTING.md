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

*English: synthetic test data only, commit with a GitHub noreply e-mail, keep gitleaks/CI green, open PRs as drafts.*

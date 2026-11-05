# Runbook vydání HomeBrain

Runbook pro jednoho maintainéra (vlastníka repozitáře). Evidence testů rollbacku a screenshotů patří do komentáře issue/PR na GitHubu, ne do tohoto souboru.

## Přehled

- **Verze integrace** je jediný zdroj pravdy v `custom_components/homebrain/manifest.json` → pole `version` (SemVer bez prefixu `v`, např. `0.1.0`).
- **Git tag** musí odpovídat: `vX.Y.Z` (např. `v0.1.0`).
- **Pre-release** tagy: `vX.Y.Z-rc.N`, `vX.Y.Z-beta.N`, `vX.Y.Z-alpha.N` → GitHub Release se vytvoří jako **pre-release**; v HACS se pre-release zobrazí jen při zapnutém „Show beta versions“ u daného custom repozitáře.
- **Distribuce**: GitHub Release obsahuje `homebrain.zip` a `homebrain.zip.sha256`; `hacs.json` deklaruje `zip_release: true` a `filename: "homebrain.zip"`.
- **Build frontendu** se do zipu kopíruje z `apps/panel/dist/` skriptem `pnpm build:integration` do `custom_components/homebrain/frontend/` (artefakt není v Gitu).

## Příprava vydání

1. Připrav PR, které obsahuje:
   - bump `version` v `custom_components/homebrain/manifest.json` na cílovou verzi;
   - poznámky k vydání (changelog) v popisu PR nebo v issue milníku.
2. Ověř, že CI na PR je **zelené** (lint, typecheck, testy, build, pytest, gitleaks atd.).
3. **Merge schvaluje vlastník** — agent nebo contributor PR nemerguje sám.
4. **release-please / changesets** zatím nejsou zapnuté — verze se bumpuje **ručně** v manifestu (viz Otevřené otázky).

## Vydání

1. Po merge do `main` lokálně (nebo na spolehlivém stroji maintainéra):
   ```bash
   git checkout main
   git pull origin main
   git tag -a vX.Y.Z -m "HomeBrain vX.Y.Z"
   git push origin vX.Y.Z
   ```
   Pro pre-release použij odpovídající tag, např. `v0.1.0-rc.1`.

2. Push tagu spustí workflow **Release** (`.github/workflows/release.yml`). Kroky workflow:
   - checkout repozitáře na tagu;
   - instalace Node (`.nvmrc`) a Python 3.14;
   - `pnpm install --frozen-lockfile`;
   - build workspace závislostí panelu, `pnpm lint`, `pnpm typecheck`, `pnpm test`;
   - `pip install -r requirements-test.txt` a `pytest tests/python`;
   - `pnpm build`, `pnpm build:integration`, kontrola velikosti bundlu;
   - `scripts/package-release.sh` s názvem tagu — ověří shodu manifestu a tagu, sestaví zip;
   - `gh release create` s assety `homebrain.zip` a `homebrain.zip.sha256`, `--generate-notes`, u tagů s `-` navíc `--prerelease`.

3. **Kontrola na GitHubu** (vlastník):
   - Release existuje pro tag, titul `HomeBrain vX.Y.Z`;
   - asset `homebrain.zip` a soubor `homebrain.zip.sha256`;
   - u pre-release je označení Pre-release;
   - volitelně: stáhnout zip, ověřit hash (`sha256sum -c homebrain.zip.sha256`), obsah (`python3 -m zipfile -l homebrain.zip` — `manifest.json` v kořeni, `frontend/homebrain-panel.js`).

## Lokální suchý běh

Před tagem nebo pro debug balíčku:

```bash
pnpm install --frozen-lockfile
pnpm --filter '@homebrain/panel^...' build
pnpm build
pnpm build:integration
pnpm package:release vX.Y.Z
```

(`vX.Y.Z` musí odpovídat `manifest.json` → `version`.)

Ověření obsahu:

```bash
python3 -m zipfile -l dist-release/homebrain.zip
```

Očekává se `manifest.json` v kořeni zipu a `frontend/homebrain-panel.js`.

Negativní test (nesoulad verze):

```bash
bash scripts/package-release.sh v9.9.9
# → manifest.json version 0.0.0 != tag 9.9.9
```

## Instalace přes HACS (custom repository)

Provádí **vlastník** na své instanci Home Assistant (ne produkční automatizace z agentního prostředí).

1. HACS → ⋮ (menu) → **Custom repositories** → URL GitHub repozitáře, typ **Integration**.
2. HACS → Integrations → vyhledat **HomeBrain** → **Download** (volba verze / pre-release dle nastavení beta).
3. **Restart Home Assistant**.
4. **Nastavení** → **Zařízení a služby** → **Přidat integraci** → **HomeBrain** (config flow).
5. Panel **HomeBrain** se objeví v postranním panelu HA.

**Poznámka:** HACS pracuje s **veřejnými** GitHub repozitáři; GitHub token v HACS slouží k API limitům, ne k přístupu do soukromých rep (ověřit při prvním vydání). Dokud je repo soukromé, je záložní cesta **ruční instalace**: stáhnout `homebrain.zip` z Release (přihlášený vlastník), ověřit hash, rozbalit obsah do `/config/custom_components/homebrain/` (přepsat celý adresář) a restartovat HA. Rollback pak = stejný postup se zipem předchozí verze. Viz Otevřené otázky.

## Aktualizace

1. **Nejdřív záloha** (viz Rollback).
2. **Nastavení** → **Updates** (nebo HACS u custom integrací) → HomeBrain → přečíst release notes → aktualizovat.
3. Restart HA dle výzvy.
4. Ověřit verzi integrace a načtení panelu.

## Rollback

1. **Před každým updatem** vytvoř zálohu HA: **Nastavení** → **Systém** → **Zálohy** → **Vytvořit zálohu** (zahrnout konfiguraci).
2. **HACS** → HomeBrain → ⋮ → **Redownload** → vybrat **předchozí verzi** → **Download** → restart HA.
3. **Ověření:** verze integrace v info, panel se načte, vazby v options integrace zůstaly.
4. **Když rollback nestačí:** obnova zálohy z kroku 1 (částečná obnova konfigurace Home Assistant dle dokumentace HA).
5. **Datové migrace** úložiště (Store) jsou navrženy dopředně kompatibilní **jednu verzi** zpět; breaking změny musí být **nahoře v release notes**.

**Povinný jednorázový test:** rollback `v0.1.0-rc.N` → `v0.1.0-rc.(N-1)` musí být skutečně vyzkoušen a výsledek zapsán do komentáře issue **#10** (ne do Gitu).

## Kontrolní seznam vydání

- [ ] Verze v `manifest.json` odpovídá plánovanému tagu.
- [ ] PR merged do `main`, CI zelené.
- [ ] Release notes / breaking changes v popisu release nebo PR.
- [ ] Tag `vX.Y.Z` pushnut na `origin`.
- [ ] Workflow Release dokončen bez chyby.
- [ ] Assety `homebrain.zip` + `.sha256` na GitHub Release.
- [ ] (Pre-release) označení Pre-release na GitHubu.
- [ ] (Volitelně) lokální `pnpm package:release` se stejnou verzí pro kontrolu zipu.
- [ ] Po instalaci v testovacím HA: panel funguje, verze sedí.
- [ ] Záloha před nasazením do produkce vlastníka.

## Otevřené otázky

| Téma | Stav |
|------|------|
| **release-please / changesets** vs. ruční bump `manifest.json` | Zatím ruční bump; automatizace až po rozhodnutí vlastníka. |
| **Veřejné vs. soukromé repo** pro HACS | HACS potřebuje veřejné repo; do zveřejnění jen ruční instalace zipu — rozhodnutí vlastníka. |
| **Home Assistant Marketplace** (od 2026.11) | Stejný `hacs.json`; migrace z custom HACS repo na Marketplace až po vyhlášení — sledovat release notes HA. |

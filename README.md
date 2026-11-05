# HomeBrain

Vlastní frontend nad Home Assistantem: jedna React 19 + TypeScript + Vite aplikace (shell + doménové moduly),
doručená jako `panel_custom` (`embed_iframe: true`), kterou registruje a servíruje tenká Python custom integration
`custom_components/homebrain`. Architektura viz [ADR-0001](docs/adr/0001-frontend-architecture.md).

> Stav: **pre-release (`0.1.0-rc`)**. Moduly Dnes, Počasí, Energie, Odpady, Zdraví, Vinotéka, Recepty a Rodina; distribuce jako GitHub Release (`homebrain.zip`) pro HACS.

**English summary:** HomeBrain is a Czech-language custom frontend for Home Assistant – one React 19 + TypeScript + Vite
app (shell + domain modules: today, weather, energy, waste, health, wine cellar, recipes, family) served as a `panel_custom`
by a thin Python custom integration (`custom_components/homebrain`). Entity bindings are configured inside Home Assistant,
never in Git; all test data is synthetic. UI copy is Czech; code identifiers are English. Licensed under MIT.

## Struktura

```
apps/panel/                 # Vite app → custom element <homebrain-panel>
packages/ui/                # design tokens + základní komponenty
packages/ha-client/         # datová vrstva nad home-assistant-js-websocket (entity store, allowlist služeb)
packages/contracts/         # zod schémata + JSON Schema
packages/testing/           # fake hass, fixture buildery
modules/{today,weather,energy,waste,health,wine,recipes,family}/
packages/signals/           # sdílený model signálů pro Dnes
custom_components/homebrain/  # HA integrace (panel + statické soubory + config flow)
tests/python/               # pytest + pytest-homeassistant-custom-component
tests/e2e/                  # Playwright (proti dev hostu s mock hass / ha-test kontejneru)
ha-test/                    # testovací HA kontejner (nikdy produkce)
docs/adr/                   # architektonická rozhodnutí
```

## Vývoj

Požadavky: Node 24+, pnpm 10, Python 3.14 (dle aktuálního HA).

```bash
pnpm install
pnpm lint && pnpm typecheck && pnpm test && pnpm build
pnpm dev            # panel s mock hass z fixtures, bez HA

python -m venv .venv && . .venv/bin/activate
pip install -r requirements-test.txt
pytest tests/python
```

Vývoj probíhá **jen proti mockům nebo testovacímu HA kontejneru** (`ha-test/`). Pravidla pro agenty jsou v [`AGENTS.md`](AGENTS.md).

## Instalace

HACS → *Custom repositories* → URL tohoto repozitáře, typ **Integration** → **HomeBrain** → Download → restart HA →
*Nastavení → Zařízení a služby → Přidat integraci → HomeBrain*. Podrobnosti, ruční instalace ze zipu a rollback: [docs/release.md](docs/release.md).

## Přispívání a bezpečnost

- Jak přispívat: [CONTRIBUTING.md](CONTRIBUTING.md) – **jen syntetická testovací data**.
- Hlášení zranitelností: [SECURITY.md](SECURITY.md).
- Práce se plánuje v **GitHub Issues**.

## Licence

MIT – viz [LICENSE](LICENSE).

**Soukromí:** repo nesmí obsahovat nic z konkrétní domácnosti – IP adresy, hostnames, e-maily, tokeny, GPS, skutečná `entity_id`, jména osob a místností. Konkrétní vazby (logický klíč → entity_id) se nastavují v integraci v HA, nikdy v Gitu. Testovací data jsou syntetická. Hlídá to gitleaks s vlastními pravidly (`.gitleaks.toml`) v CI i před každým pushem.

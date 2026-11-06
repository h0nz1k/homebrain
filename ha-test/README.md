# Testovací Home Assistant

Harness používá pouze lokální testovací HA a syntetické entity
(`sensor.demo_waste_next`). NIKDY nepoužívejte produkční HA, jeho konfiguraci,
zálohy ani tokeny. Frontendové vazby řeší issue #5, lokální e2e issue #8.

## Lokálně bez Dockeru

Z kořene repozitáře:

```sh
pnpm install --frozen-lockfile
pnpm build && pnpm build:integration
ha-test/local/start.sh
pnpm ha:onboard
pnpm test:e2e:ha
ha-test/local/stop.sh
```

Skripty lze spustit také přes `pnpm ha:local:start` a `pnpm ha:local:stop`.
`start.sh --reset` smaže konfiguraci testovací instance před spuštěním.
Běžící instanci nejprve zastavte.

`HB_HA_VENV` určuje venv s HA Core 2026.10.4 (výchozí `$HB_HA_DIR/venv`).
Pokud chybí, skript jej vytvoří přes `uv venv --python 3.14` + `uv pip install`
(`uv` z PATH nebo `HB_UV`), jinak přes `python3 -m venv` a pip.
Docker ani sudo nejsou potřeba. Minimální konfigurace (`ha-test/local/configuration.yaml`)
obsahuje `frontend`, `config` a syntetický template senzor, bez `default_config`.

Nativní balíčky `pymicro-vad` a `pyspeex-noise` (požadavky `assist_pipeline`) nemají
wheely pro Python 3.14. Bez nich selže WS `get_services` a frontend HA zůstane na
„Načítání…“. Skript je proto doinstaluje; když na hostu chybí kompilátor C++,
použije `zig c++` z PyPI balíčku `ziglang` (instaluje se do `$HB_HA_DIR/zig`).

Runtime je mimo repozitář: `HB_HA_DIR` (výchozí `${TMPDIR:-/tmp}/homebrain-ha`),
konfigurace v `config/`, log v `hass.log` a PID v `hass.pid`.
Integrace je připojena symlinkem z repozitáře. Port určuje `HB_HA_PORT`
(výchozí 8123); při změně portu použijte `--reset` a odpovídající
`HB_HA_URL=http://127.0.0.1:8123` pro onboarding a Playwright.
HA naslouchá pouze na loopbacku. Skript před prvním startem založí
`.storage/http` se stabilní konfigurací a bez pending změny. V HA 2026.10
by YAML blok `http:` spustil pětiminutový zkušební režim s automatickým
návratem a restartem, proto jej lokální konfigurace neobsahuje.

Onboarding vytvoří testovacího správce, přidá HomeBrain a přes admin WebSocket
nastaví `waste.waste_next` na `sensor.demo_waste_next`. Volitelné
`HB_HA_BINDINGS` přijímá JSON `{modul:{logickyKlic:entity_id}}`, například:

```sh
HB_HA_BINDINGS='{"waste":{"waste_next":"sensor.demo_waste_next"}}' pnpm ha:onboard
```

Přístupové údaje jsou pouze testovací; lze je změnit přes `HB_HA_USERNAME`
a `HB_HA_PASSWORD`. Onboarding ukládá dočasné testovací tokeny do
`ha-test/.auth/admin.json` (gitignored) pro Playwright. Ručně spravovaný
lokální token patří do `.env.local`; žádný token nesmí do Gitu, bundlu ani
screenshotu. `playwright-report-ha/` a `test-results/` jsou také ignorované.

## Docker Compose pro CI

Compose zachovává `default_config` a syntetické senzory v
`ha-test/config/configuration.yaml`:

```sh
pnpm build && pnpm build:integration
docker compose -f ha-test/docker-compose.yml up -d
pnpm ha:onboard
pnpm test:e2e:ha
docker compose -f ha-test/docker-compose.yml down
```

Verzi image určuje `HA_VERSION` (výchozí připnutá 2026.10.4), např.
`HA_VERSION=beta docker compose -f ha-test/docker-compose.yml up -d --wait`.
Konfigurace zapíná i integraci `demo` (syntetická světla, vysavače, senzory).

Port http://127.0.0.1:8123 je publikovaný pouze na loopbacku. Integrace je
připojená pouze pro čtení. YAML `homebrain:` není potřeba, onboarding používá
config flow. Runtime kontejneru je v ignorovaném `ha-test/config/`; verzovaný
je jen `configuration.yaml`. Neukládejte sem skutečné entity ani osobní údaje.

## Kompatibilita se stable a beta (issue #26)

Job `ha-compat` v `.github/workflows/nightly.yml` běží týdně a ručně
(`gh workflow run nightly.yml --ref <větev> -f scope=ha-compat`) v matici
minimální verze z `hacs.json`, `stable` a `beta`. Po onboardingu spustí
`node ha-test/compat-check.mjs`, který ověří:

- config entry HomeBrain je ve stavu `loaded`,
- `get_panels` vrací přesně panely z `panels.json` (12) a každý panel i bundle odpovídá HTTP 200,
- WS `homebrain/bindings/get` (včetně demo vazby), `robots/get`, `recipes/timers/subscribe`
  (výsledek + úvodní snapshot), `access/state` a `session/get` odpovídají úspěchem,
- `system_log` neobsahuje ERROR/CRITICAL z HomeBrain ani „blocking call“ v HomeBrain
  (ostatní varování HA jen vypíše jako anotace).

Následuje `pnpm test:e2e:ha` (desktop) a znovu kontrola logu
(`HB_COMPAT_LOGS_ONLY=1`). Když selže beta, workflow založí nebo doplní issue
„HA beta: HomeBrain compatibility check fails“.

## Prohlížeč a mock e2e

```sh
pnpm exec playwright install chromium
pnpm test:e2e
```

`pnpm test:e2e` spouští mock dev host bez HA a tokenů. Existující Chromium lze
předat přes `PLAYWRIGHT_CHROMIUM`; případné lokální knihovny přes
`LD_LIBRARY_PATH`. `pnpm test:e2e:ha` testuje skutečný testovací HA včetně
zobrazení syntetického svozu Papíru v panelu Odpady.

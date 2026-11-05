# ADR-001 — Vlastní frontend „HomeBrain“ nad Home Assistantem

- Stav: **přijato** (schváleno vlastníkem 2026-10-31, včetně jména `homebrain`) · Datum: 2026-10-31 · Autor: LANA
- Vstupy: analýza 9 původních HA repozitářů vlastníka, webový research (zdroje na konci, číslované).
- Repo, labely, milníky a úvodní issues dle kapitoly 10 byly založeny v `h0nz1k/homebrain`. Licence: MIT.

---

## 1. Kontext

### 1.1 Co vlastník chce
- „Obalit“ Home Assistant vlastním frontendem (React nebo co dává větší smysl), primárně mobil (Android, Companion app), dále desktop a pravděpodobně nástěnný tablet.
- Vzdálený přístup později přes Home Assistant Cloud (Nabu Casa); hlas přes Google Assistant (zůstává nativně v HA).
- Implementovat budou agenti (LANA/Cursor/Codex/Claude); GitHub Issues jsou autoritativní záznam práce.
- Žádné stávající HA repo se nepovažuje za hotové → slouží jako inspirace a zdroj požadavků.

### 1.2 Výchozí stav HA
- HA OS, řádově stovky entit a desítky zařízení.
- Apps (dříve add-ony) a HACS integrace (např. CZ spotové ceny).
- ~250 helperů slouží jako „state“ starších dashboardů (UI stav v HA entitách).

### 1.3 Relevantní změny v HA ekosystému 2026
- Add-ony se od 2026.2 jmenují **Apps**.[17] Ve stejném vydání se stal výchozím nový nativní **Home Dashboard**.[17]
- HACS nahrazuje od 2026.11 integrace `marketplace` v core („HACS brought into Home Assistant“), čte stejný `hacs.json`.[22] Verze = publikovaný GitHub Release, update entity v Settings > Updates, podpora pre-release.[23]
- Starý `home-assistant/builder` pro buildy apps byl vyřazen; build přes Docker BuildKit a nové composite actions.[15]
- Od 2026.11 lze registrovat vlastní *section strategies* do editoru dashboardů.[19] Strategie generují konfiguraci dashboardu z kódu.[18]

### 1.4 Co říkají existující repa (technicky)
- **donor/weather V2** už běží jako `panel_custom` s `embed_iframe: true`, `require_admin: true`, React/TS frontend, používá `hass.connection` předané HA frontendem, bez LLAT; ADR-030 zakazuje LLAT, hardcoded URL a čtení celého `hass.states` každým widgetem (repo `docs/architecture-v2-proposal.md`). Entity bindings jsou ale v YAML `panel_custom.config` → nepohodlné a mimo UI.
- **donor/waste**: React 19 + Vite, JSON schema kontrakt `contracts/waste-dashboard.schema.json` + 13 fixtures (edge cases), chybějící HA adapter v PR #6.
- **donor/energy**: jen docs; kvalitní logický datový kontrakt (`pv_power`, `phase_l1..3_power`, `ev_*`, `battery_*`, quality stavy `ok|stale|unavailable|invalid_unit|unverified_polarity`).
- **donor/wine**: React app + Node backend + SQLite, čisté TS balíčky `wine-domain`, `wine-application`, `wine-persistence-sqlite`; bez HA vazby.
- **donor/health**: Python custom integration `health_fitness` 0.7.0 (config flow, webhook, Store, XP ledger, rewards, milestones), nejlepší kvalita; Calistree import přes Tasker → webhook.
- **donor/family**: prázdné. **firmware zámku**: mimo scope.
- Napříč: 4 různé verze TS, žádný sdílený UI kit, CI přišpendlené na task větve, žádné releases.

### 1.5 Rozhodovací kritéria (váhy)
1. Bezpečnost a auth (žádné dlouhodobé tokeny v prohlížeči) — vysoká
2. Funguje stejně v prohlížeči, Companion app a přes Nabu Casa — vysoká
3. Rychlost vývoje agenty + testovatelnost bez živého HA — vysoká
4. Údržba při upgradech HA, jednoduchý deploy + rollback pro 1 člověka — vysoká
5. Realtime, výkon na tabletu, theming, multi-user/role — střední
6. Náklad migrace stávajících nápadů — střední
7. Offline/PWA — nízká (HA/Companion je primární host)

---

## 2. Zvažované varianty

### A) React/TS SPA jako **HA App (add-on) s Ingress**
- Jak: kontejner (nginx/Node) na portu 8099, `ingress: true`; HA ověří session a Supervisor přeposílá požadavky; app má přijímat jen z `172.30.32.2` a nemá vlastní login.[1] Identita uživatele v hlavičkách `X-Remote-User-Id/-Name/-Display-Name`.[1] `panel_admin: false` zpřístupní i ne-adminům.[1]
- Přístup k HA z backendu: `SUPERVISOR_TOKEN` + `homeassistant_api: true`, proxy `http://supervisor/core/api` a `/core/websocket`.[13][14]
- Nabu Casa: apps s Ingress jsou dostupné přes Home Assistant Cloud se stejnou E2E šifrou a lokální autentizací.[11]
- (+) Izolovaný proces, libovolný jazyk backendu (lze nechat Node backend vinotéky), vlastní DB v `/data`.
- (−) Prohlížečová SPA nedostane HA token „zadarmo“: buď (i) sahá na spojení rodičovského HA frontendu (same-origin iframe, nedokumentovaná vazba na interní API frontendu) [neověřeno], nebo (ii) backend proxuje vše přes `SUPERVISOR_TOKEN` → akce běží jako app, ne jako konkrétní člen rodiny (ztráta auditu/oprávnění).
- (−) Docker multi-arch build, GHCR, verze v `config.yaml` je jediný zdroj pravdy a nesmí se přepsat tag; pipeline se v 2026 měnila.[15][16]
- (−) Hlášený problém mizení Ingress položek v sidebaru po restartu.[27]
- Příklad: HAKIT add-on jen servíruje hotový `index.html` z `config/www` přes Ingress.[7]

### B) React/TS SPA jako **`panel_custom`** registrovaný **tenkou custom integration** (Python) — *vybráno*
- Panel = custom element na celou stránku, dostává `hass`, `narrow`, `route`, `panel`; `hass` se nastavuje znovu při každé změně.[2] Volby `require_admin`, `embed_iframe`, `handle_safe_area`; integrace registruje panel z Pythonu přes `async_register_panel()`.[2]
- HA dokumentace: `embed_iframe` je nutný, pokud panel používá React.[3]
- Integrace navíc: statické soubory panelu, config flow/options (zapnuté moduly, entity bindings), vlastní WebSocket příkazy (jednorázové i subscription) pro ne-HA data.[20][21] `@websocket_api.require_admin` pro adminské příkazy.[20]
- Distribuce: GitHub Release + `hacs.json` → HACS dnes, Marketplace od 2026.11; update entity, release notes, pre-release kanál, minimální verze HA (`homeassistant`), `zip_release` pro integrace.[22][23][24]
- (+) Auth = HA session uživatele, nulová práce s tokeny; stejná cesta v prohlížeči, Companion app i přes Nabu Casa (panel je součást HA frontendu) [odvozeno z 2, 11].
- (+) Ověřeno přímo v HA vlastníka (weather V2).
- (+) Data v `/config` → v HA zálohách; konzistentní s `health_fitness` (Python + Store).
- (−) Python běží v procesu HA core → chyba může blokovat event loop; nutná disciplína (async, žádné blokující I/O) a testy.[20][26]
- (−) Upgrady HA mohou rozbít Python API → CI matice proti stable + beta, `homeassistant` minimum v `hacs.json`.[24]
- (−) Iframe: HA nativní dialogy (more-info) nejsou automaticky k dispozici → vlastní detail sheety [neověřeno, ověřit spike].

### C) **Lovelace custom cards** (Lit) + Sections dashboardy + strategie
- Lit je standard HA frontendu; komunitní boilerplate (Lit 3, TS) existuje. Strategie umí generovat celé dashboardy/views/sekce z kódu.[18][19]
- (+) Nejnativnější vzhled, editor dashboardů, nulová vlastní navigace, minimální údržba.
- (−) Omezení na grid karet; aplikace typu vinotéka (katalog, filtry, odepsání s auditem) nebo energie s vlastním layoutem se do karet nevejde dobře; každá karta = samostatný resource; React v kartách naráží na stejné konflikty web components.[3]
- Role: **doplněk** (malé „glance“ karty pro nativní Home dashboard), ne hlavní frontend.

### D) **Samostatná aplikace mimo HA** (Next.js apod.)
- Auth přes OAuth2/IndieAuth (client_id = URL aplikace, PKCE S256) nebo LLAT.[9] Refresh tokeny nepoužité 90 dní HA maže; pro „permanentní“ přístup HA doporučuje LLAT.[10]
- (−) LLAT na serveru = trvalý klíč s plnými právy uživatele; při úniku kompromitace domu.
- (−) Nabu Casa tuneluje jen HA instanci (SNI routing na lokální HA) → externí app potřebuje vlastní exponování (Cloudflare Tunnel/Tailscale/VPN), vlastní TLS, vlastní login.[11]
- (−) Mimo Companion app (žádná integrace s nativní aplikací), další server k provozu.
- Zamítnuto.

### E) **Hotové frameworky**
- **ha-component-kit (@hakit/core + @hakit/components)**: React balíčky, `@hakit/core` obaluje oficiální HA WebSocket API (auth, stav, akce), lze hostovat kdekoli nebo přes HAKIT add-on v sidebaru.[4] Poslední release 6.0.2 (opravy reconnect logiky HassConnect).[6] npm: 6.0.2, publikováno „8 months ago“.[5] Prakticky jeden maintainer (511 příspěvků autora, další ≤10).[4]
  - Verdikt: **nepoužít jako základ**. Jeho hlavní hodnota (HassConnect/auth) je v panelu zbytečná, protože `hass.connection` dostaneme od HA; bus-factor 1; vlastní komponenty by se stejně musely přestylovat na schválený design (weather A1 Premium Calm, waste). Lze z něj čerpat inspiraci (typy služeb, hooks).
- **home-assistant-js-websocket**: oficiální knihovna HA, 0 závislostí, používá ji i HA frontend; poslední commit 21. 10. 2026 (oprava hangů při reconnectu).[8][9] → **základ datové vrstvy**.
- **Mushroom / Bubble Card / Dwains**: Lovelace ekosystém (varianta C); Bubble Card má pop-upy a module store.[—, bez detailního ověření] Vhodné pro nativní dashboardy, ne pro vlastní aplikaci.

### Srovnání (souhrn)

| Kritérium | A Ingress app | **B panel + integrace** | C Lovelace karty | D Standalone | E @hakit |
|---|---|---|---|---|---|
| Auth/bezpečnost | dobrá (HA session), backend jako app | **nejlepší (session uživatele)** | nejlepší | slabá (LLAT/vlastní login) | dle hostingu |
| Nabu Casa | ano[11] | ano | ano | ne (vlastní tunel) | dle hostingu |
| Companion app | ano | ano | ano | ne | dle hostingu |
| Realtime | WS přes parent/proxy | WS `hass.connection` | `hass` | WS s LLAT | WS |
| Offline/PWA | ne | ne (HA/Companion) | ne | ano (ale auth) | dle hostingu |
| Vývoj s agenty | dobrý | **dobrý (mock `hass`)** | střední (Lit, karty) | dobrý | dobrý |
| Testovatelnost | dobrá | dobrá (Vitest + pytest-HA + Playwright) | střední | dobrá | dobrá |
| Údržba při upgradech HA | Supervisor/builder změny | Python API integrace | frontend API karet | HA API + vlastní infra | závislost na 3. straně |
| Deploy/rollback | image tag | **HACS/Marketplace release, redownload verze** | resource | vlastní | – |
| Theming | vlastní | HA CSS proměnné + vlastní tokeny | HA téma | vlastní | vlastní |
| Tablet výkon | dobrý | dobrý (selektivní render) | dobrý | dobrý | dobrý |
| Multi-user/role | hlavičky X-Remote-User | `hass.user` + server-side role ve WS | omezeně | vlastní | – |
| Migrace nápadů | vysoká (wine Node zůstane) | **střední (wine persist. → Python)** | vysoká (re-impl. v Lit) | vysoká | střední |

---

## 3. Rozhodnutí

**HomeBrain = jedna React 19 + TypeScript + Vite aplikace (shell + moduly), doručená jako `panel_custom` s `embed_iframe: true`, kterou registruje a servíruje tenká Python custom integration `homebrain`, distribuovaná jako GitHub Release přes HACS → Marketplace.**

- Datová vrstva: vlastní tenký balíček `@homebrain/ha-client` nad **oficiálním `home-assistant-js-websocket`** a `hass.connection` z panelu; žádné LLAT v produkci.
- Ne-HA data (vinotéka, rodina, uživatelské preference HomeBrain) drží integrace `homebrain` (HA `Store`/SQLite v `/config/homebrain/`) a vystavuje je přes WebSocket příkazy `homebrain/<modul>/<akce>` s validací a role-checkem.[20]
- `health_fitness` zůstává **samostatná** custom integration (vlastní repo); HomeBrain modul Zdraví čte její entity/služby.
- Ingress App (varianta A) je **odložená záloha** pro případ, že modul bude potřebovat těžký nebo ne-Python backend (např. rozpoznávání etiket vín, Tessvine). Lovelace karty (C) jsou **doplněk** pro nativní Home dashboard (Fáze 4+).
- Nepřepisujeme generické ovládání stovek entit: pro světla/spínače po místnostech zůstává nativní Home/Areas dashboard HA;[17] HomeBrain dělá doménové moduly + přehled „Dnes“.

### Proč ne A jako primární
- U B auth řeší HA zcela (panel dostává `hass`), u A je to buď nedokumentovaná vazba na rodičovský frontend, nebo ztráta identity uživatele přes `SUPERVISOR_TOKEN`.[13][14]
- B nevyžaduje Docker/GHCR pipeline (jen zip v Release) a má vestavěný rollback přes výběr verze v HACS/Marketplace.[23][28]
- B je vzor, který už v HA vlastníka funguje (weather V2).

### Proč ne @hakit jako základ
- Nadbytečné pro panel (auth už máme), bus-factor 1, poslední release ~březen 2026.[4][5][6]

---

## 4. Cílová architektura

### 4.1 Runtime

```
 Android Companion / prohlížeč / tablet (kiosk)  ──(lokálně nebo Nabu Casa)──►  HA frontend
                                                                                 │ sidebar „HomeBrain“
                                                                                 ▼
                                    panel_custom (embed_iframe) ─ <homebrain-panel> React app
                                                                                 │ hass.connection (WS, session uživatele)
                     ┌───────────────────────────────────────────────────────────┼──────────────────────────┐
                     ▼                                                           ▼                          ▼
           HA core: entity, služby,                         custom_components/homebrain (Python)     custom_components/health_fitness
           recorder/statistiky, kalendáře, todo             - registrace panelu + statické soubory    (samostatné repo)
           (Z2M/MQTT, spot ceny HACS, GoodWe…)              - config flow: moduly, bindings, role
                                                            - WS API homebrain/* (wine, family, prefs)
                                                            - Store/SQLite v /config/homebrain/
           InfluxDB/Grafana: dlouhá historie (odkaz, ne embed v MVP)
```

### 4.2 Monorepo (`homebrain`)

```
homebrain/
├─ apps/panel/                  # Vite app → build do custom elementu <homebrain-panel>
│  ├─ src/shell/                # navigace (bottom nav mobil / rail tablet+desktop), routing přes panel.route, theming, i18n cs
│  ├─ src/host/                 # adapter HA host: hass→store, narrow, safe-area; dev host s mock hass
│  └─ src/modules.ts            # registr modulů (lazy import)
├─ packages/
│  ├─ ui/                       # design tokens (mapované na HA CSS proměnné), komponenty: Card, Stat, Sheet, Tabs,
│  │                            #   Calendar, Sparkline, StatusBadge(stale/unavailable), EmptyState; light/dark/system
│  ├─ ha-client/                # entity store (selektivní subscription), bindings, service allowlist,
│  │                            #   statistics/history, calendar/todo, freshness/quality metadata
│  ├─ contracts/                # zod schémata + JSON Schema (sdílené s Python testy), fixture loader
│  └─ testing/                  # fake hass, fixture builders, Playwright helpers
├─ modules/
│  ├─ today/  weather/  energy/  waste/  health/  wine/  family/
│  │   └─ {domain/, adapters/, views/, fixtures/, *.test.ts, README.md (MVP scope + AC)}
├─ custom_components/homebrain/ # __init__.py (panel + static), config_flow.py, websocket/, store/, wine/, family/,
│                               #   diagnostics.py, manifest.json (version = tag), frontend/ (build artefakt, ne v Gitu)
├─ tests/
│  ├─ python/                   # pytest + pytest-homeassistant-custom-component
│  └─ e2e/                      # Playwright proti HA test kontejneru
├─ ha-test/                     # docker compose: HA (pinned), seed config (.storage: uživatelé, onboarding hotový),
│                               #   template/demo entity simulující bindings všech modulů
├─ docs/{adr/, requirements/<puvodni-repo>.md, modules/}
├─ hacs.json                    # name, homeassistant minimum, zip_release
├─ AGENTS.md                    # 1 stránka pravidel pro agenty (nahrazuje factory copy-paste)
└─ .github/{workflows/, ISSUE_TEMPLATE/, CODEOWNERS}
```

- Toolchain jednotně: pnpm workspaces, TS 5.9 (jedna verze, ne 5.8/6.0/7.0), React 19, Vite 8, Vitest, Playwright, ESLint/Biome; Python 3.13/3.14 dle aktuálního HA, ruff, mypy.
- Bundle: jeden ES module + lazy chunky modulů; servírováno integrací s hashem verze v URL (cache-busting) — ne přes `/local` (soubory v `/config/www` HA neautentizuje [neověřeno, obecně známé]; v bundlu proto nikdy nic soukromého).

### 4.3 Datová vrstva
- **Zdroj pravdy o stavu**: `hass.connection` (WS). `hass` se nastavuje při každé změně kterékoli entity,[2] proto: externí store per entita (`useSyncExternalStore`), komponenty se re-renderují jen pro své bindings; žádné čtení celého `hass.states` ve widgetech (pravidlo převzato z weather ADR-030).
- **Bindings** (logický klíč → entity_id) v options integrace `homebrain` (UI v HomeBrain „Nastavení“, admin-only WS příkaz), ne v Gitu a ne v YAML. Formát klíčů převzat z `donor/energy/docs/data-contract.md` a weather profilu.
- **Kvalita dat**: každá hodnota nese `source`, `updatedAt`, `quality ∈ {ok, stale, unavailable, invalid_unit, unverified_polarity}` (energy kontrakt + weather provenance).
- **Historie**: recorder statistiky přes WS; InfluxDB/Grafana jen jako odkaz v MVP.
- **Zápisy**: jen přes `ha-client.callService` s allowlistem (modul deklaruje povolené domény/služby); default read-only.
- **Ne-HA data**: WS `homebrain/wine/*`, `homebrain/family/*`, `homebrain/prefs/*` (subscriptions pro live aktualizace).[20]
- **UI stav místo helperů**: preference a UI stav (vybraný profil počasí, filtry vinotéky…) do `homebrain/prefs` per uživatel → postupné rušení ~250 UI helperů (ty, které používají automatizace, zůstávají).

### 4.4 Uživatelé a role
- HA permission systém je omezený na entity a vlastník (owner) ho obchází;[12] nespoléhat na něj jako na jedinou ochranu.
- HomeBrain role: `owner`, `adult`, `child`, `guest`, `kiosk` — mapování HA user_id → role v options integrace.
- Vynucení **na serveru** (WS příkazy kontrolují `connection.user`), UI jen skrývá. Konfigurace = `require_admin`.[20]
- Tablet: dedikovaný HA uživatel pro kiosk (role `kiosk`, read-mostly), Companion app jako launcher, „keep screen on“, lokální push.[25] HomeBrain route `?kiosk=1` → velké písmo, bez nastavení, auto-návrat na „Dnes“.

### 4.5 Offline / PWA
- Host je HA frontend/Companion; HomeBrain nebude samostatná PWA (vyžadovala by vlastní auth → varianta D).
- Při výpadku spojení: banner „odpojeno“, poslední snapshot (IndexedDB, read-only, bez citlivých dat) s časem; akce zakázány.

---

## 5. Moduly (požadavky sklizené z repozitářů)

### 5.1 Dnes (přehled) — nový
- MVP: počasí teď + dnešek, další svoz odpadu, energie teď (FVE/síť/baterie), spot cena teď + nejlevnější okno, dnešní události z kalendářů, zdraví „další krok“.
- Reuse: datové adaptery ostatních modulů (každý modul exportuje `summary()` widget).

### 5.2 Počasí — z `donor/weather` (V2)
- MVP: lokální měření (Ecowitt) odděleně od předpovědi (Met.no), hodinový výhled, freshness, light/dark, 1 profil lokality; radar ČHMÚ jako Fáze 2b.
- Reuse: `frontend/src/{domain,infrastructure/home-assistant,presentation,intelligence}` (clean-room V2), fixtures, A1 Premium Calm design tokens → `packages/ui`; profily lokalit z `panel_custom.config` → options integrace.
- Neportovat: V1 runtime JS, duplicitní `metNoConfigFlowBridge*.js`, GPL donory (Kanfei, Me.teo) — jen MIT dle ADR-030.
- Cut-over: V1/V2 panely zůstávají do soak PASS HomeBrain počasí, pak odstranit.

### 5.3 Energie + spotové ceny — z `donor/energy`
- MVP (read-only): okamžitý tok FVE → dům/baterie/síť/EV, L1–L3 bez rozkliknutí, SoC baterie a EV, dnešní kWh, spot cena teď + graf dne (HACS CZ spot integrace), nejlevnější hodiny; quality stavy a jednotky/polarita dle kontraktu.
- Reuse: `docs/data-contract.md` (klíče, odvozené metriky, ochrana dělení nulou), `product-brief.md` (priority), design z PR #5 po triage (jen assety/ideje).
- Mimo MVP: řízení nabíjení EV/baterie podle ceny (zápisy → samostatné issue s allowlistem a potvrzením).

### 5.4 Odpady — z `donor/waste` (**pilotní modul Fáze 0**)
- MVP: nejbližší svoz (hero), relativní čas, měsíční kalendář 7 sloupců, více svozů v jednom dni, legenda, stav dat (stale/unknown), dlouhé české názvy.
- Reuse: `contracts/waste-dashboard.schema.json`, 13 fixtures, adapter z PR #6 (kalendář/entity → kontrakt), UX principy z `product-brief.md`.
- Proč pilot: nejmenší, má kontrakt + fixtures, read-only → prověří celou pipeline (build, release, install, e2e).

### 5.5 Zdraví & fitness — z `donor/health`
- MVP: „Dnes“ (další správný krok), týdenní minimum, streak/XP, poslední trénink, trend hmotnosti, odměny/milníky; read-only nad entitami `health_fitness`.
- Reuse: celá integrace `health_fitness` 0.7.0 (zůstává ve vlastním repu, doplnit `hacs.json`, LICENSE, release `v0.7.0`, sjednotit pyproject verzi); UI koncepty Calm Coach z `prototype/`; kontrakty (`reward-ledger`, `milestone-catalog`, `workout-goal`).
- Předpoklad: nasadit integraci do produkčního HA (dnes jen dev compose).

### 5.6 Vinotéka — z `donor/wine`
- MVP: katalog + hledání + filtry (typ, barva, odrůda, ročník, hodnocení, zóna/police), detail, počet kusů a umístění, odepsání lahve s auditní historií a opravou; mobil: bottom nav, sheet, sticky akce.
- Reuse: `packages/wine-domain` (pravidla, typy) → `modules/wine/domain` beze změn; schéma SQLite (`wine-persistence-sqlite/schema.ts`, migrace) → Python store v integraci (port 1:1, stejné invarianty, testy portovat); UI z přijatého designu (task 004).
- Retire: Node `backend/`, `wine-inventory-client` (nahrazeno WS příkazy).
- Mimo MVP: import objednávek, Assist hlasové odepsání, Tessvine (PR #13 = výzkum licence → `docs/requirements`). Fotky lahví: úložiště v `/config/homebrain/media` servírované autentizovaně (ne `/local`).

### 5.7 Rodina — `donor/family` je prázdné
- Fáze 0 discovery issue: sepsat požadavky s vlastníkem.
- Pracovní MVP: týdenní přehled ze HA kalendářů (rodina, škola, svoz), přítomnost osob (`person.*`), sdílené todo (HA todo entity), „kdo vyzvedává“. Data primárně v HA (kalendáře/todo); vlastní data jen pokud HA entity nestačí (`homebrain/family/*`).

### 5.8 Nastavení (admin)
- Zapnutí modulů, bindings (výběr entit s validací jednotek/domén), role uživatelů, kiosk profily, diagnostika (verze, stav bindings, žádná PII).

---

## 6. Deployment a CI/CD

### 6.1 Pipeline
- **PR**: lint + typecheck + Vitest + build + pytest (+ pytest-homeassistant-custom-component)[26] + Playwright e2e proti HA kontejneru + gitleaks + bundle size budget. Required checks, chráněný `main`.
- **Nightly**: e2e matice HA `stable` + `beta` (včasné odhalení breaking změn).
- **Release** (release-please / changesets): tag `vX.Y.Z` → build panelu → kopie do `custom_components/homebrain/frontend/` → `manifest.json.version` = tag → zip asset → GitHub Release (nejdřív **pre-release**).[23][24]
- **Instalace**: HACS custom repository (dnes) → Marketplace (od 2026.11, stejný `hacs.json`).[22] Update se objeví v Settings > Updates s release notes.[23]
- **Deploy gate**: vlastník klikne na update v HA (zachovává pravidlo „merge+deploy schvaluje uživatel“). Žádný auto-deploy agentem.
- **Preview kanál**: pre-release přepínač u repozitáře [23] nebo option „preview panel“ → druhý panel `homebrain-preview` s `require_admin: true` (vzor weather V1/V2).[2]

### 6.2 Rollback
- Před updatem HA záloha (ruční nebo automatizace).
- Rollback = v HACS/Marketplace „Redownload“ s výběrem předchozí verze + restart HA.[28] (výběr konkrétní verze [neověřeno v načteném textu], ověřit ve spike #12)
- Datové migrace Store verzované (`version`/`minor_version`), vždy dopředně kompatibilní 1 verzi; breaking změny uvedené nahoře v release notes.[23]
- Runbook `docs/runbooks/install-rollback.md` (převzít strukturu z weather `V2_PREVIEW_INSTALL_ROLLBACK.md`).

### 6.3 Varianta A (pokud by někdy byla potřeba)
- App image přes nové builder actions (BuildKit, multi-arch manifest, cosign), `image: ghcr.io/<owner>/<app>` bez tagu, verze v `config.yaml`, nikdy nepřepisovat tag, `breaking_versions`.[15][16]

---

## 7. Testovací strategie
- **Unit (Vitest)**: domény a adaptery modulů nad fixtures (převzít waste 13 fixtures, weather fixtures, wine testy); quality/freshness logika; derivované metriky energie (dělení nulou).
- **Komponenty (Vitest + Testing Library)**; volitelně Ladle/Storybook pro vizuální katalog UI kitu.
- **Kontrakty**: zod + JSON Schema; stejná schémata validovaná v pytest (wine/family WS payloady).
- **Python (pytest + pytest-homeassistant-custom-component)**: config flow, options, WS příkazy (oprávnění, validace), Store migrace, registrace panelu.[26]
- **E2E (Playwright)**: `ha-test/` compose s pinned HA image, seed `.storage` (onboarding hotový, uživatelé admin/adult/kiosk), template entity simulující bindings; scénáře: login → panel → modul → snapshot; viewporty 360×800 (telefon), 800×1280 (tablet), 1440×900 (desktop); light/dark; role (kiosk nevidí Nastavení).
- **Vizuální regrese**: `toHaveScreenshot` s tolerancí; vizuální checkpoint vlastníka jen u nových obrazovek (label `needs-owner-visual-check`), ne u každé změny.
- **Dev smyčka pro agenty**: `pnpm dev` s mock `hass` z fixtures (bez HA); `pnpm dev:live` proti **testovacímu** HA kontejneru s LLAT v `.env.local` (gitignored, nikdy produkce).
- **Výkon**: Lighthouse/TTI budget na tablet profilu, test „1000 entit, 50 změn/s“ nad entity store.

---

## 8. Bezpečnostní model
- Produkce: žádné LLAT ve frontendu ani v repu; panel používá session uživatele.[2] Vzdáleně stejná auth cesta přes Nabu Casa;[11] doporučit MFA pro všechny ne-kiosk účty.[10]
- Bundle neobsahuje entity_id, souřadnice, jména; bindings a profily jen v options integrace (doručené autentizovaným WS).
- WS příkazy: schema validace, role-check na serveru, `require_admin` pro konfiguraci, audit log zápisů (vinotéka).[20]
- Zápisy do HA přes allowlist služeb per modul; nové zápisy = samostatné issue + review.
- Preview/experimentální panely `require_admin: true`.[2]
- Agenti: vývoj a e2e jen proti testovacímu HA; LANA read-only adapter (interní konfigurace agentů) s dedikovaným ne-admin uživatelem pro inventuru a drift (verze HomeBrain v HA vs. poslední release).
- Supply chain: lockfile, Renovate (grouped), gitleaks (allowlist syntetických `ghp_` fixtures), pinned GitHub Actions, Dependabot security alerts.
- Soukromá data (zdraví, vinotéka, rodina) jen v `/config` HA (a v jeho zálohách); fixtures syntetické.

---

## 9. Fázovaný roadmap

### Fáze 0 — Kostra + auth + pilot (cca 1–2 týdny agentní práce, orientačně)
- Repo, toolchain, CI, HA test kontejner, integrace `homebrain` (panel + static + config flow), shell (navigace, theming, cs i18n, stav spojení, uživatel/role), `ha-client`, základ `ui`, modul **Odpady**, release `v0.1.0` pre-release nainstalovaný jako admin-only panel.
- Exit: panel funguje v prohlížeči, Companion app (telefon) a (jakmile je aktivní) přes Nabu Casa; e2e zelené; rollback vyzkoušen 1×.

### Fáze 1 — Dnes + Počasí
- Port weather V2 domény, bindings v UI, soak 7 dní, pak plán odstranění V1/V2 panelů.

### Fáze 2 — Energie + spotové ceny
- Read-only MVP, statistiky z recorderu; rozhodnutí o zápisech (EV/baterie) až po MVP.

### Fáze 3 — Zdraví + Vinotéka
- Nasazení `health_fitness` v0.7.0 do produkce; modul Zdraví. Vinotéka: Python store + WS API + UI; pilot inventury (shoda s fyzickým stavem).

### Fáze 4 — Rodina, kiosk, cut-over
- Modul Rodina dle discovery; kiosk profil pro tablet; panel pro ne-adminy (`require_admin: false` u stabilních modulů); úklid UI helperů; volitelně Lovelace „glance“ karty/section strategy pro nativní Home dashboard;[19] archivace starých rep.

### Později
- Assist intenty (vyhledání/odepsání vína), Grafana/Influx embed, Ingress App jen pokud bude potřeba těžký backend.

---

## 10. GitHub struktura

### 10.1 Repo
- **Nové monorepo `h0nz1k/homebrain`** (doporučeno). Navazuje na existující záměr „HomeBrain“ v HAW (dosud bez repa); původní záměr „zpracování provozních dat HA“ se stane pozdějším modulem/oddílem, ne samostatným repem. Alternativní jméno, pokud se má HomeBrain vyhradit pro data: `homebrain-ui` / `domov`.
- **Ne** `donor/project-factory`: je to governance repo s 366 MD soubory; míchat ho s produktem by zhoršilo poměr docs:kód a CI.
- `donor/health` zůstává samostatné (integrace s vlastním lifecycle).
- Licence (MIT nebo privátní repo bez licence — rozhodnout), chráněný `main`, CODEOWNERS = vlastník.

### 10.2 Labely, milníky, šablony
- Labely: `phase:0..4`, `area:shell|ui|ha-client|integration|ci|docs`, `module:today|weather|energy|waste|health|wine|family`, `type:feature|bug|chore|spike`, `agent:cursor|codex|claude|lana`, `needs-owner-visual-check`, `needs-owner-decision`, `writes-to-ha`.
- Milníky: `Fáze 0 – kostra`, `Fáze 1 – počasí`, `Fáze 2 – energie`, `Fáze 3 – zdraví+víno`, `Fáze 4 – rodina+kiosk`.
- Issue šablona: Cíl · Scope/Non-scope · Acceptance criteria (checklist) · Evidence (CI odkaz, screenshoty 3 viewporty) · Rizika. Žádné task-run evidence soubory v Gitu – evidence v komentáři issue/PR.

### 10.3 Úvodní issues (Fáze 0 + start Fáze 1)
1. **[ADR] Schválit ADR-001 frontend architektura** — AC: vlastník potvrdí variantu B, jméno repa, licenci; ADR uložen v `docs/adr/0001-frontend-architecture.md`.
2. **[ci] Monorepo skeleton + toolchain** — AC: pnpm workspaces (`apps/panel`, `packages/{ui,ha-client,contracts,testing}`, `modules/*`, `custom_components/homebrain`); jedna verze TS/React/Vite; `pnpm lint typecheck test build` zelené; ruff + pytest běží; `AGENTS.md` ≤ 1 stránka.
3. **[ci] PR pipeline + ochrana main** — AC: workflow na `pull_request` a push `main` (lint, typecheck, vitest, pytest, build, gitleaks); required checks; Renovate grouped; běží < 10 min.
4. **[integration] `homebrain` integrace: registrace panelu + statické soubory** — AC: config flow (single instance); panel `homebrain` v sidebaru, `embed_iframe: true`, `require_admin: true` (Fáze 0); soubory servírované integrací s verzí v URL; pytest-HA testy setup/unload; žádné I/O v event loopu.
5. **[ha-client] Entity store + bindings + service allowlist** — AC: selektivní subscription (komponenta re-renderuje jen při změně svých entit, ověřeno testem s 1000 entitami); bindings načtené přes WS `homebrain/bindings/get`; `callService` odmítne službu mimo allowlist modulu; quality stavy `ok|stale|unavailable|invalid_unit`.
6. **[shell] App shell, navigace, theming, cs i18n, stav spojení** — AC: bottom nav ≤ 600 px, rail ≥ 600 px; light/dark/system navázané na HA téma; banner odpojení; safe-area na telefonu; screenshoty 360×800, 800×1280, 1440×900.
7. **[ui] UI kit v0 + design tokens** — AC: tokeny (barvy, typografie, spacing, radius) z weather A1 Premium Calm + waste; komponenty Card, Stat, Sheet, Tabs, StatusBadge, EmptyState; a11y kontrast AA ověřen; katalog (Ladle/Storybook) v CI buildu.
8. **[ci] HA test kontejner + Playwright e2e** — AC: `ha-test/` compose s pinned HA, seed uživatelé (admin, adult, kiosk) bez ručního onboardingu; e2e: login → panel → modul Odpady; nightly matice stable+beta.
9. **[module:waste] Pilotní modul Odpady** — AC: kontrakt a 13 fixtures převzaty z `donor/waste`; adapter z PR #6 portován; všechny fixtures zelené; hero/kalendář/legenda/stav dat dle product brief; widget pro „Dnes“; vizuální checkpoint vlastníka.
10. **[ci] Release + install/rollback runbook** — AC: release-please; `manifest.json.version` = tag; zip asset; `hacs.json` (`homeassistant` minimum, `zip_release`); v0.1.0 jako pre-release; instalace přes HACS custom repo na produkční HA (vlastník); rollback na předchozí verzi vyzkoušen a zapsán v runbooku.
11. **[integration] Role a uživatelé** — AC: mapování HA user → role v options; WS příkazy kontrolují roli serverově (test pro každou roli); kiosk role nevidí Nastavení.
12. **[spike] Ověřit panel v Companion app a přes Nabu Casa** — AC: panel načten v Companion app na telefonu lokálně i vzdáleně; zdokumentováno chování back tlačítka, safe-area, more-info (iframe) a reconnect po uspání; rozhodnutí o vlastních detail sheetech.
13. **[docs] Sklizeň požadavků ze starých rep** — AC: `docs/requirements/{weather,energy,waste,health,wine,family}.md` s odkazem na zdrojový soubor @ SHA; seznam věcí k portu vs. zahodit; žádné osobní identifikátory.
14. **[discovery] Rodina – požadavky** (`needs-owner-decision`) — AC: 1 stránka scénářů, zdroje dat (kalendáře/todo/person), MVP scope odsouhlasen.
15. **[module:weather] Port Počasí V2 (Fáze 1)** — AC: domain/adapters z `donor/weather/frontend/src` (jen MIT donory); profil lokality v options; freshness; soak 7 dní bez chyb v HA logu; plán odstranění V1/V2 `panel_custom`.
16. **[ha] Inventura helperů** — AC: seznam ~250 helperů klasifikovaný (automatizace vs. UI stav vs. mrtvé) přes LANA RO adapter; nic nemazat; návrh migrace UI stavu do `homebrain/prefs`.

---

## 11. Co se starými repozitáři

| Repo | Akce | Co převzít |
|---|---|---|
| donor/weather | zmrazit → po soak HomeBrain počasí archivovat; V1/V2 panely v HA ponechat do cut-overu | V2 `frontend/src` domain/infra/intelligence, fixtures, design A1, install/rollback runbook vzor, ADR-030 pravidla |
| donor/waste | dokončit jen jako zdroj (PR #6 nemergovat, portovat) → archivovat | kontrakt, 13 fixtures, adapter, UX principy |
| donor/energy | zavřít PR #1/#2/#3 jako superseded, z #5 vytáhnout assety/ideje → archivovat | data-contract, product-brief, design-system |
| donor/wine | archivovat po portu | wine-domain, SQLite schéma + migrace, testy pravidel, přijatý UI design, PR #13 jako poznámka |
| donor/health | **ponechat aktivní** (samostatná integrace) | doplnit hacs.json, LICENSE, release v0.7.0, sjednotit verze, CI na main |
| donor/family | archivovat (prázdné) | – (požadavky v issue #14) |
| donor/project-factory | zmrazit; nevyžadovat pro homebrain; archivovat po Fázi 1, pokud nic nespotřebovává | 1-stránková destilace pravidel do `AGENTS.md` (deploy gate, žádné secrets/PII) |
| donor/factory-runtime | zmrazit/archivovat (žádná vazba) | nic povinně; případně dispatch agentů později |
| firmware zámku | mimo scope tohoto ADR | – |

Postup archivace (akce vlastníka): README banner „Nahrazeno `homebrain`, požadavky v `homebrain/docs/requirements/<repo>.md` @ SHA“ → zavřít otevřené PR s odkazem → `gh repo archive`.

---

## 12. Důsledky

### Pozitivní
- Jeden kód, jeden UI kit, jedna pipeline místo 6 rozjetých stacků; agenti pracují nad mock `hass` bez živého HA.
- Bezpečnost: žádné tokeny v prohlížeči; identita uživatele zachována až do HA (audit akcí).
- Funguje v Companion app, v prohlížeči i přes Nabu Casa bez další infrastruktury.
- Deploy/rollback přes standardní update mechanismus HA (HACS → Marketplace).

### Negativní / rizika
- Python kód v procesu HA core (vinotéka, rodina) → riziko výkonu/stability; mitigace: async, testy, malé datové objemy, žádné těžké výpočty (ty případně do Ingress App).
- Upgrady HA mohou rozbít integraci/panel API → nightly beta matice, minimální verze v `hacs.json`.
- Iframe panel nemá zdarma nativní HA dialogy → vlastní detailní sheety (spike #12).
- Přechod HACS → Marketplace (2026.11) je čerstvý; ověřit chování custom repozitářů a pre-release v praxi.[22][23]
- Vinotéka: port persistence z TS/SQLite do Pythonu = práce navíc oproti variantě A.

### Otevřené otázky pro vlastníka
1. Jméno repa (`homebrain` vs. jiné) a soukromé/veřejné + licence.
2. Má být HomeBrain v sidebaru i pro ostatní členy rodiny už od Fáze 1, nebo až po cut-overu?
3. Rodina: zdroje dat — rozhodnuto 2026-10-31: externí kalendáře připojené do HA + HA todo; směny zamítnuty (viz `docs/requirements/family.md`).
4. Nástěnný tablet: konkrétní zařízení a jestli Companion launcher nebo Fully Kiosk.
5. Energie: chce v MVP i řízení (EV/baterie dle spotu), nebo striktně read-only?

---

## Sources

[1] https://contributors.home-assistant.io/apps/guides/ingress — HA: Add a web interface with ingress
[2] https://contributors.home-assistant.io/frontend/custom-ui/panel — HA: Custom panels
[3] https://www.home-assistant.io/integrations/panel_custom — HA: Custom panel integration
[4] https://github.com/shannonhochkins/ha-component-kit — ha-component-kit repo
[5] https://www.npmjs.com/package/@hakit/core — @hakit/core npm
[6] https://github.com/shannonhochkins/ha-component-kit/releases — ha-component-kit releases
[7] https://github.com/shannonhochkins/ha-component-kit/blob/master/hakit/README.md — HAKIT add-on README
[8] https://github.com/home-assistant/home-assistant-js-websocket/blob/master/README.md — home-assistant-js-websocket README
[9] https://contributors.home-assistant.io/core/internals/auth-api — HA Authentication API
[10] https://www.home-assistant.io/docs/authentication — HA Authentication (users)
[11] https://support.nabucasa.com/hc/en-us/articles/25619268678557-Remote-access-Deep-dive — Nabu Casa remote access deep dive
[12] https://developers.home-assistant.io/docs/auth_permissions — HA Permissions
[13] https://developers.home-assistant.io/docs/apps/communication — HA apps communication
[14] https://contributors.home-assistant.io/apps/supervisor-api/core — Supervisor API core proxy
[15] https://developers.home-assistant.io/blog/2026/04/02/builder-migration — Builder migration 2026
[16] https://contributors.home-assistant.io/apps/guides/publishing — Publish your app
[17] https://www.home-assistant.io/blog/2026/02/04/release-20262 — HA 2026.2 release
[18] https://contributors.home-assistant.io/frontend/custom-ui/strategy — Custom strategies
[19] https://contributors.home-assistant.io/blog/2026/10/28/custom-section-strategies-in-the-dashboard-editor — Custom section strategies 2026.11
[20] https://developers.home-assistant.io/docs/frontend/extending/websocket-api — Extending the WebSocket API
[21] https://community.home-assistant.io/t/how-to-add-a-sidebar-panel-to-a-home-assistant-integration/981585 — Sidebar panel in integration guide
[22] https://contributors.home-assistant.io/glossary/marketplace — Marketplace glossary
[23] https://contributors.home-assistant.io/marketplace/guides/releases — Marketplace releases
[24] https://contributors.home-assistant.io/marketplace/reference/hacs-json — hacs.json reference
[25] https://companion.home-assistant.io/docs/integrations/android-home-app-launcher — Companion Android home app launcher
[26] https://github.com/MatthewFlamm/pytest-homeassistant-custom-component — pytest-homeassistant-custom-component
[27] https://github.com/home-assistant/supervisor/issues/7015 — Ingress sidebar entries disappear issue
[28] https://www.hacs.xyz/docs/use/repositories/dashboard — HACS dashboard docs

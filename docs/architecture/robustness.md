# Robustnost integrace v procesu Home Assistantu

- Stav: platné od 0.1.0-rc.23 · Refs #27, #28
- Rozsah: `custom_components/homebrain` (backend). Frontend jen zobrazuje stav modulu.

HomeBrain běží uvnitř procesu HA. Pravidla níže zajišťují, že (1) upgrade HA nerozbije
integraci kvůli neveřejnému API, (2) chyba jednoho modulu neshodí HA ani ostatní moduly
a (3) žádný modul nezdržuje event loop.

## 1. Jen veřejné API Home Assistantu (#27)

| Místo                       | Dříve (neveřejné)                                   | Nyní (veřejné)                                                                                                                                                                       |
| --------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `__init__.py` panely        | `hass.data["frontend_panels"]` (je panel už v HA?)  | `panel_custom.async_register_panel` + `frontend.async_remove_panel`; vlastní evidence `hass.data["homebrain"]["panels"]`. Unload odebere přesně evidované panely, reload je znovu přidá. |
| `wine/lookup.py` AI Task    | `ai_task.const.DATA_PREFERENCES` (preferovaná entita) | služba `ai_task.generate_data` **bez** `entity_id` (HA použije preferovanou entitu). Když preferovaná chybí nebo neumí přílohy (`HomeAssistantError`), druhý pokus s první schopnou entitou ze stavu `ai_task.*`. Bez `ai_task` → provider „nedostupný“. |
| `robots/map_source.py` PNG  | `entity.async_image()` přes `hass.data["image"]`    | `image.async_get_image(hass, entity_id, timeout=10)` + limit 8 MB.                                                                                                                  |
| `media_source.py`           | `media_player.const.MediaClass`                     | `media_player.MediaClass`                                                                                                                                                            |

**Zdokumentovaná výjimka – mapa Roborock.** Vektorová mapa potřebuje surová data mapy
(`ImageEntity._map_content.raw_api_response`) a objekt entity, který HA veřejně nevydá.
Přístup je v jediné funkci `_roborock_image_entity()`; drží ho `version_guard` (HA
2025.12–2026.12, python-roborock 7.x) a každé selhání (chybí komponenta `image`,
přejmenovaný/ chybějící `_map_content`, výjimka z property) degraduje na důvod
`no_map_entity` / `no_map_data` → panel použije PNG mapu integrace. Pokryto
`tests/python/test_robot_map.py::test_private_map_api_missing_degrades_gracefully`.
Návrh upstream: veřejný atribut/endpoint s mapovými daty v integraci Roborock (pak
výjimku zrušit).

**CI kontrola.** `scripts/ci/check_private_ha_api.py` (job `python` v `ci.yml`) zakáže
v `custom_components/homebrain`:

- `hass.data[...]`, `.get/.setdefault/.pop(...)` a `... in hass.data` s cizím klíčem
  (řetězec ≠ `"homebrain"` nebo konstanta importovaná z `homeassistant.*`),
- importy `homeassistant.components.<x>.const`.

Výjimky jen přes `scripts/ci/private_ha_api_allowlist.txt` (`cesta:pravidlo:detail`) s
důvodem a testem.

## 2. Izolace modulů (#28)

Moduly: `weather`, `energy`, `waste`, `robots`, `wine`, `recipes`, `access`
(`modules.MODULES`). Jádro (vazby, session, role, Nastavení, Dnes, kiosk) je vždy zapnuté.

- **Registrace** (`async_setup`) i **setup záznamu** (`async_setup_entry`) běží pro každý
  modul ve vlastním `try/except`. Selhání ⇒ stav `failed`, log s tracebackem, oprava
  (repair issue) `module_failed_<modul>` s chybou; ostatní moduly běží dál, záznam je
  `LOADED`. Úspěšný reload opravu smaže.
- **Panel** selhaného modulu zůstává, `homebrain/session/get` vrací
  `unavailable_modules` a panel zobrazí „Modul nedostupný“ místo obsahu.
- **WS příkazy** modulů jsou registrované přes `modules.gated()`: pokud modul není `ok`,
  odpoví chybou `module_unavailable` (ostatní kontroly rolí zůstávají).
- **Vypínač v options flow** (krok „Moduly“, cs/en): volba `disabled_modules` (seznam).
  Vypnutý modul **neregistruje WS příkazy ani panel** (při startu HA). Přepnutí za běhu
  znovu načte záznam: panel zmizí hned; WS příkazy zaregistrované dřív HA neumí
  odregistrovat, takže do restartu odpovídají `module_unavailable`.
  `session/get` vrací `disabled_modules` a `visible_modules` bez nich.
- **Zpětná kompatibilita:** chybějící `disabled_modules` = vše zapnuto = chování jako
  dřív. Uložení kroku se vším zapnutým klíč odstraní (options zůstanou beze změny).
  Test `test_existing_production_options_upgrade_unchanged` s realistickými options
  (61 vazeb energie, 48 robotů, rotace 180°, FVE, role; syntetická ID).

## 3. Hygiena event loopu (#28)

- **Fixture `fail_on_blocking_calls`** (`tests/python/conftest.py`, autouse): po dobu
  testu obalí `open`, `io.open`, `time.sleep`, `os.listdir/scandir/walk/remove/unlink/
  mkdir/makedirs/replace`, `urllib.request.urlopen`. Volání na vlákně event loopu z kódu
  HomeBrainu, který spustil sám loop (WS handlery, HTTP view, listenery, tasky), test
  shodí. Volání přímo z testu se ignorují (test smí volat synchronní helper). Vlastní
  detektor, protože blokovací detekce HA (`block_async_io`) je v testech vypnutá a `open`
  přeskakuje. Výjimka: marker `@pytest.mark.allow_blocking_calls`.
- **Audit CPU/IO míst (PIL/numpy/síť):**

| Místo                                   | Executor | Limit vstupu                                     | Timeout                       |
| --------------------------------------- | -------- | ------------------------------------------------ | ----------------------------- |
| Roboti – raw mapa → vektor/raster       | ano      | `_build` v `PARSE_TIMEOUT` 20 s                  | 20 s                          |
| Roboti – PNG integrace (`integration_image`) | ano | **nově** 8 MB a 16 Mpx (jinak fallback na raw raster) | **nově** 10 s (`async_get_image`) |
| Počasí – radar ČHMÚ (`radar.decode_png`) | ano     | stahování 8 MB; **nově** IHDR ≤ 4096 px a omezený inflate (ochrana proti zip bombě) | 30 s/soubor |
| Recepty – fotky (`media.to_webp_pair`)  | ano      | 8 MB, `MAX_PIXELS`, jen JPEG/PNG/WebP            | `safe_fetch` celkový timeout  |
| Vinotéka – obohacení Znovín (`enrich`)  | ano      | HTML 1,5 MB, sitemap 3 MB, obrázek 4 MB / 20 Mpx | `ClientTimeout`, ≤ 1 req/s    |
| Vinotéka – AI Task                      | –        | fotka ≤ ~3 MB (WS schéma)                        | `AI_TIMEOUT_S`                |

## Upgrade produkce

Bez migrace dat. Nové chování: repair issue při pádu modulu, nový krok „Moduly“
v options. Rizika viz popis PR.

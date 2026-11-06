# @homebrain/module-roboti (`robots`)

Robotické vysavače Roborock (až 3 roboti, každý na svém patře). Refs #94.

**Fáze A**
- přepínač pater;
- hero karta robota (stav, baterie, místnost);
- české návody k chybám robota i doku (`src/errors.ts`);
- spotřební díly v % a „vyměnit za X dní“ (`src/consumables.ts`) a nádrže doku;
- místnosti s pořadím úklidu (`src/rooms.ts`) a rychlé akce s potvrzením (`src/commands.ts`, allowlist služeb);
- mapa jako obrázek `image.*` entity integrace.

**Nastavení:** v integraci HomeBrain → Možnosti → Robot 1–3 se nastavuje jméno, patro, obrázek robota (`/local/…` nebo https) a entity robota.
Integrace sama volá jen `roborock.get_maps`, a to read-only s cache přes WS `homebrain/robots/get`. Příkazy (úklid, pauza, dok, režim, sání) posílá panel přes HA `call_service` a jen ze seznamu `ROBOT_SERVICE_ALLOWLIST`.

**Obrázek robota:** výchozí je neutrální SVG ilustrace. Fotky výrobce do repa nepatří, každý si nahraje vlastní.

**Dev:** `/homebrain-roboti?robot=2&robots=default|calm|error&theme=light`, 3 syntetičtí roboti (`src/demo.ts`). Volání služeb se v dev jen zaznamenají do `window.__hbRobotCalls`.

## Fotky robota (volitelné, jen lokálně)

Karta robota může místo neutrální ilustrace ukázat vlastní fotky (dok, spodek robota, sprite bočního
kartáče) s animovanými díly při úklidu, „!“ na vadném dílu a tečkami spotřebních dílů v režimu Údržba.

- Fotky **nejsou součástí repozitáře ani balíčku** – patří do Home Assistantu:
  `/config/www/homebrain/robots/<robot>/` (prohlížeč je načte jako `/local/homebrain/robots/<robot>/`).
  Pozor: `/local/` HA servíruje bez přihlášení (v rámci LAN).
- `<robot>` = jméno robota bez diakritiky malými písmeny (`Bobík` → `bobik`). Jinou složku nastavíte
  volbou „Obrázek robota“ zakončenou `/` (nebo cestou k `manifest.json`).
- Ve složce musí být `manifest.json` podle `photo-manifest.schema.json`; vzor se syntetickými čísly je
  `photo-manifest.example.json`. Souřadnice jsou v % spodní fotky (čtverec, předek robota nahoře).
- Bez manifestu nebo když se fotka nenačte, zůstane neutrální ilustrace.
- Dev server: `HB_ROBOT_PHOTOS_DIR=<lokální složka> vite` + `?photos=<robot1>,<robot2>,…`.

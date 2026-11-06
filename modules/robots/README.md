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

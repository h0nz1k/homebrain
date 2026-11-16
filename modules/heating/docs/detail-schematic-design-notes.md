# Plné schéma topení – implementační poznámky

Offline prototyp r3 + rozhodnutí vlastníka 2026-11-15.

## Podlahové vytápění a bazén

- V **domě** jsou jen **radiátory** (zvětšená geometrie oproti r2), žádná podlahovka v obytné části.
- **Podlahovka** je pouze v **bazénové hale** (označení „Bazén“): serpentina v podlaze pod bazénem, vlastní větev z topného okruhu (`pool-floor-supply` / `pool-floor-return` v modelu).
- Předpoklady k potvrzení vlastníkem (parametry `layout` v `buildDetailModel.ts`):
  - `poolHallAttached: false` – hala je samostatná a vždy pod hlavním domem i rybárnou (požadavek vlastníka 2026-11-16).
  - `floorBranchY` – světová Y souřadnice odbočky za směšováním; serpentina zůstává v hale a návrat se spojuje se zpátečkou topení.

## Bazén

- Bazén je v hale v **řezu**: voda s gradientem, lino/hrana, schody/žebřík, výměník desky, čerpadla natápění a filtrace na evidovaných větvích.
- Teplota vody = existující `extras.pool.temp` (bez vymyšlených čidel podlahovky).

## QA

Geometrické kontroly jsou ve Vitestu (`schematicGeometry.test.ts`) nad TS modelem; pan/zoom v `panZoomMath.test.ts`.

## Responzivní uspořádání (finální kolo)

Stejný hydraulický graf má portrétní a krajinné uspořádání. Rybárna stojí mimo obvod domu a bazénová hala je nejníže. Polohu haly a výšku serpentiny lze změnit parametry; přesná stavební návaznost a odbočka zůstávají předpoklady k potvrzení vlastníkem. Solár vede od střešního panelu vnitřkem domu k dolní spirále; čerpadlo je vedle nádrže. Teplá užitková voda a studený přívod mají samostatné barvy, odlišné od topné vody a zpátečky. Neaktivní potrubí zachovává barvu a používá čárkování.

Čipy mají minimální velikost textu 11/13 CSS px při libovolném přiblížení. TČ používá dvě řádky pro stav/výkon a teplotní pár; ostatní sekundární údaje se zobrazí po přiblížení. Pro ovládání je vyhrazen spodní bezpečný pás; jednorázová nápověda je nad plátnem.

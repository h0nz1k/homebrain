# Plné schéma topení – implementační poznámky

Offline prototyp r3 + rozhodnutí vlastníka 2026-11-15.

## Podlahové vytápění a bazén

- V **domě** jsou jen **radiátory** (zvětšená geometrie oproti r2), žádná podlahovka v obytné části.
- **Podlahovka** je pouze v **bazénové hale** (označení „Bazén“): serpentina ve stropech podlahy kolem bazénu, vlastní větev z topného okruhu (`pool-floor-supply` / `pool-floor-return` v modelu).
- Předpoklady k potvrzení vlastníkem (parametry `layout` v `buildDetailModel.ts`):
  - `poolHallAttached: true` – hala sdílí obvod s hlavním domem (přístavek).
  - `floorBranchY` – světová Y souřadnice odbočky podlahovky od hlavního stoupacího potrubí.

## Bazén

- Bazén je v hale v **řezu**: voda s gradientem, lino/hrana, schody/žebřík, výměník desky, čerpadla natápění a filtrace na evidovaných větvích.
- Teplota vody = existující `extras.pool.temp` (bez vymyšlených čidel podlahovky).

## QA

Geometrické kontroly jsou ve Vitestu (`schematicGeometry.test.ts`) nad TS modelem; pan/zoom v `panZoomMath.test.ts`.
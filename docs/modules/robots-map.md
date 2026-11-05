# Roboti – vektorová mapa místností

Backend: `custom_components/homebrain/robots/` · Frontend: `modules/robots/src/map/`, `modules/robots/src/views/VectorMap.tsx`.

Mapa robota (Roborock) se kreslí jako vektor: místnosti, stěny a předěly pocházejí z **jedné planární mozaiky** (sdílené oblouky), takže výplně, stěny i výběr do sebe vždy přesně zapadají. Rastr (`?mapa=rastr`) zůstává jen jako srovnání/záloha.

Všechny fixtures v repu jsou **vymyšlené půdorysy** (testy, dev mock, screenshoty). Skutečná mapa domácnosti do repa ani do PR nepatří.

## Pipeline (backend, čistý Python)

`vector_map.build_vector_map()` → `topology.build_topology()`:

| # | Krok | Funkce | Co dělá | Test |
|---|---|---|---|---|
| 1 | Dekódování | `vector_map.parse_raw_map`, `label_grid` | raw blob → mřížka štítků (1 px ≈ 5 cm, 0 = mimo místnost) | `test_robot_map.py` |
| 2 | Podlaha | `partition_floor` | pixely stěn/spár připadnou nejbližší místnosti → sousedé se potkají uprostřed stěny; closing/opening desky | `test_robot_topology_stages.py::test_partition_…` |
| 3 | Úklid štítků | `absorb_small_regions`, `smooth_labels` | ostrůvky < `MIN_REGION_PX` a uzavřené kapsy < `MIN_POCKET_PX` se připojí k okolí; 3×3 majoritní filtr jen na hranicích | `…::test_small_islands_…`, `…::test_majority_filter_…` |
| 4 | Oblouky | `components`, `trace_arcs` | každá hranice mezi dvěma štítky je přesně jeden oblouk mezi uzly (rohy, kde se potkají 3 štítky) | `…::test_each_shared_boundary_…` |
| 5 | Zjednodušení | `simplify_arc` | rohové body → Douglas–Peucker, konce oblouku pevné; předěly (`DIVIDER_PX`) rovnají tvrději než obrys | `…::test_simplify_…` |
| 6 | Natočení | `grid_angle` | úhel mapy z gradientů rozmazané masky (4φ kruhový průměr); < `AXIS_DEG` = osová mapa | `…::test_grid_angle_…` |
| 7 | Přichycení | `orthogonalize`, `regularize`, `regularize_junctions` | přichycení k osám přes union-find po osách; zkosení → roh, schody ≤ `JOG_PX` → rovná čára, posun celých kolineárních přímek přes uzly (bez překlopení/složení) | `test_robot_topology.py` (schod v uzlu, diagonální předěl) + `…::test_snapped_plan_…` |
| 8 | Sestavení | `assemble` | místnosti, obrys podlahy (`walls`) a předěly (`dividers`) ze stejných oblouků; Σ ploch místností = plocha obrysu | `…::test_rooms_tile_…` |

**Pojistka:** krok 7 je stupňovitý – s uzly → bez uzlů → syrové schody. Když by krok překlopil nebo zrušil prstenec, použije se předchozí stupeň.

**Cache:** statická geometrie se cachuje podle `image_digest` a `TOPOLOGY_VERSION`; při změně geometrie zvyšte verzi.

**Výkon:** cíl ≤ 1 s CPU na plnou mapu. Syntetický byt 460 × 390 px běží ~0,6 s (dev host). Hlídá to `test_vectorisation_stays_within_one_second_on_the_synthetic_flat` (v CI s rezervou `HB_PERF_FACTOR`, výchozí 3×). Zrychlení, která zachovala identické výstupy: bitové řádky v morfologii, union-find nad řádkovými běhy, majoritní filtr jen na hranicích, box-sumy přes `accumulate`.

### Ladění konstant (`topology.py`)

- Zbytky schodů → nejdřív `SIMPLIFY_PX` / `DIVIDER_PX`, potom `JOG_PX`.
- Ztracené skutečné výstupky stěn → snížit `JOG_MAX_PX` / `JOG_LINE_PX`.
- Falešné diagonály → `DIAG_MAX_PX`; skutečné 45° stěny drží `DIAG_TOL_DEG`.
- Každou změnu pokryjte syntetickým testem v `test_robot_topology*.py` a zvyšte `TOPOLOGY_VERSION`.

## Vykreslení (frontend, `VectorMap.tsx`)

Vrstvy odspodu:

1. **Podklad pod místnostmi** (`rv-rooms-under`): každá místnost rozšířená ve vlastním tónu a oříznutá obrysem podlahy. Výplně se tak potkají i ve dveřích a v pásu stěny. Vybrané místnosti jdou první, aby dveře nepřebíraly akcent souseda.
2. **Místnosti** (`rv-room`): nízko-chromatické tóny z `ROOM_HUES` + `ROOM_STEPS` (jedna studená rodina, malé kroky světlosti). Výběr = plochý akcentový tón (`--rv-sel-mix`). Pořadí ukazuje odznak, ne barva.
3. **Předěly** (`rv-seam`, užší a tišší) a **obrys** (`rv-wall-line`, jedna skořepina).
4. **Zákazové zóny** a virtuální zdi, potom **trasa**: jen nedávný úsek s mizejícím ocasem (gradient od nejstaršího bodu k robotovi), přepínač „Trasa“ ukáže celou trasu + pokrytí. Maska drží tahy uvnitř místností a mimo stěny.
5. **Dok** posunutý kousek do místnosti (nikdy na čáře stěny) a **robot**. Robot plynule klouže po nahlášené trase (`motion.ts`: `planGlide`, nikdy přes stěnu).
6. **Popisky** (HTML nad SVG, `LabelCollisions`, reálné DOM recty). Postupně:
   - popisek se vejde do své místnosti v plné velikosti, jinak kompaktně (odznak nad jménem), jinak u vybrané místnosti zůstane jen odznak;
   - popisek uhne z cílové pozice robota (`data-rv-bot-spot`), když se pak vejde;
   - kolize popisků s překážkami (`data-rv-obstacle`) se skryjí, vybrané vyhrávají;
   - halo v tónu místnosti drží trasu mimo písmena.

Barvy a tloušťky jsou CSS proměnné v `robotsStyles.ts` (`.rv`, `[data-theme='light'] .rv`), ne literály v TSX.

## Testy a kontrola

- `pytest tests/python/test_robot_topology*.py tests/python/test_robot_map.py` – kroky pipeline, dlaždicování, výkon.
- `vitest modules/robots` – geometrie (`geometry.test.ts`), pohyb (`motion.test.ts`), komponenta (`VectorMap.test.tsx`).
- `tests/e2e/robots-map.spec.ts` – na cestě panelu `/homebrain-roboti`:
  - popisky uvnitř místností a mimo robota,
  - výběr synchronní s čipy + souhrn (počet, m²),
  - ocas trasy,
  - záloha na obrázek.
- Vizuální kontrola: rendery ze syntetického mocku (telefon i desktop, světlý i tmavý motiv) a vision rubrika A–E (mapa, popisky, robot/trasa, karta, celkem).

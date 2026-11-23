# Roboti – historie úklidů, právě uklízená místnost, „Odesláno“ (#165)

Backend: `custom_components/homebrain/robots/history.py` · Frontend: `modules/robots/src/history.ts`,
`pending.ts`, `views/HistoryCard.tsx`, `views/LiveRoomLayer.tsx`.

**Žádná nová volání cloudu Roborock.** Cloud omezuje/blokuje účty, proto historie vzniká jen ze
stavů HA, které integrace Roborock už publikuje, a z dat, která HomeBrain už má (cache `get_maps`,
vektorová mapa). Žádné dotazování `get_vacuum_current_position` / `get_maps`, žádné reloady.

## Záznam úklidů (backend)

| Zdroj (HA Roborock, `translation_key`) | Použití |
|---|---|
| `binary_sensor.*` `in_cleaning` | běh probíhá (i při pauze / mytí mopu); bez něj rozhoduje stav vysavače (`cleaning`/`paused`) |
| `sensor.*` `current_room` | název místnosti; integrace ho bere z `map_data.vacuum_room` (segment) a jmen aktuální mapy (`home.current_map_data.rooms`), mimo místnost `None` |
| stav `vacuum.*` | doba v místnosti se počítá jen ve stavu `cleaning` |
| `last_clean_start` / `last_clean_end` | oficiální časy běhu; běh, který HA neviděl živě, přibude jako `partial` (bez místností) |
| `cleaning_area` / `cleaning_time` | plocha a doba na konci běhu |

Entity mimo vazby (`in_cleaning`, `last_clean_*`, `cleaning_area/time`) se hledají za běhu
v registru entit na zařízení robota – stávající instalace nepotřebují nové vazby.

* Místnost je **uklizená**, když v ní robot během jednoho běhu strávil ≥ 60 s (průjezd chodbou ne).
* **Zdroj**: `homebrain`, pokud HomeBrain (panel nebo plán) poslal start ≤ 2 min před začátkem
  běhu (`robots/start` → `mark`, přímé příkazy panelu → `homebrain/robots/history/mark`); jinak
  `aplikace` (aplikace Roborock, její plány, hlas). Doplněné běhy z recorderu mají zdroj `null`.
* Jméno místnosti → id segmentu přes `RoomCache.peek` (jen cache, nikdy fetch); jméno z jiného
  patra / neznámé zůstane `id: null` a panel ho páruje podle jména.
* **Robot nedostupný** uprostřed běhu: běh trvá dál, doba se během výpadku nepočítá.
* **Restart HA** uprostřed běhu: rozběhnutý běh je v `Store` (`active`); když robot po startu HA
  pořád uklízí, běh pokračuje (doba výpadku se nepočítá), jinak se uzavře k `last_clean_end`.
* `Store` `homebrain.robot_history` (verze 1): 90 dní / 200 běhů na robota. Prázdné úložiště se
  při prvním startu doplní z recorderu (executor recorderu, max 30 dní).

WS: `homebrain/robots/history` → `{robots: {"1": {last_cleaned, runs, active}}}`,
`homebrain/robots/history/subscribe` (událost `{slot}` po dokončení běhu),
`homebrain/robots/history/mark` `{slot}`. Testy: `tests/python/test_robot_history.py`.

## Panel

* Dlaždice místností: „Uklizeno dnes 9:40“ / „Uklizeno včera 18:05“ / „Uklizeno před 3 dny“ /
  „Zatím neuklizeno“ (Europe/Prague). Karta **Historie úklidů**: posledních 10 běhů všech robotů.
* **Právě uklízená místnost** (jen ve stavu uklízí): `current_room`, záloha poloha robota v polygonu
  mapy → jemná výplň + čárkovaný obrys na mapě (jiný než výběr), čip „Teď: Kuchyně“, dlaždice
  „Teď uklízí“. `prefers-reduced-motion` vypne pulz.
* **„Odesláno, čekám na robota…“** po start/pauza/pokračovat/dok/úklid místností, dokud stav robota
  nepotvrdí; po 60 s „Robot zatím nereagoval“ + „Zkusit znovu“ (nikdy automaticky).
* **Stáří dat** (jen když robot pracuje): „Mapa před 4 min“ (> 2 min), „Stav před 2 min“ (> 90 s).

Dev mock: `?historie=demo|prazdna`, `?stari=1`, `?scena=kuchyne` (pevná poloha).

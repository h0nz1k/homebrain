# Minutky a Vajíčka (kitchen timers + egg timer)

## Minutky
- Route `/homebrain-recepty/minutky` (button *Minutky* in the Recepty header shows the number of
  running timers). Any number of named timers run in parallel; quick presets 1–30 min, own time,
  *+1 min*, pause/resume, cancel.
- The integration owns the timers (`recipes.db`, table `timers`, WS `homebrain/recipes/timers/*`).
  Phone, kitchen tablet, desktop and Dnes subscribe to the same list; end timestamps are persisted,
  so timers survive a panel reload and an HA restart (a timer that ended while HA was down fires
  right after the start, once).
- When a timer ends the integration
  - fires `homebrain_timer_finished` with `{name, timer_id, recipe_id}` (every timer) and the older
    `homebrain_recipe_timer_done` (kept for existing automations),
  - creates a persistent notification *Minutka doběhla* (`notification_id`
    `homebrain_timer_<id>`), dismissed again when the timer is silenced, extended or cancelled,
  - optionally calls the notify targets chosen in Recepty settings.
- Dnes: one card *Minutka · <name>* (notice) with the big countdown of the soonest timer as the
  shared signal value (`zbývá 3:17`) and the others in the context line (`Těstoviny za 7:37`).
  Same escalation as the live airfryer signal: the last minute and a finished timer
  (*Minutka doběhla · <name>*, value *Hotovo*) are `warning`, i.e. the Dnes hero with the value
  in the warning tone. Signal module `recipes`, feed key `recipes.timers` (the airfryer feed uses
  `recipes`); visible for owner/adult/child and on the kiosk tablet.
- Example automation (phone notification + kitchen tablet TTS placeholder):
  [`docs/examples/kitchen-timer-finished.yaml`](../examples/kitchen-timer-finished.yaml).

## Vajíčka (egg timer)
Inputs as in common egg-timer apps: *Typ vejce* Slepičí S/M/L/XL | Křepelčí (size disabled),
*Chlazený* ano/ne, *Počet vajec*, *Stupeň* NAMĚKKO / NAHNILIČKO / NATVRDO. The time counts from
putting the eggs into boiling water. *Spustit* starts a timer named e.g. `Vejce M naměkko (2 ks)`.

### Model (published physics, no third-party code)
C. D. H. Williams, University of Exeter, *The Science of Boiling an Egg*
(<https://www.exeter.ac.uk/research-centres/theoretical-physics/boiling-an-egg>, derivation
<http://newton.ex.ac.uk/teaching/CDHW/egg/CW061201-1.pdf>):

    t[min] = 0.451 · M^(2/3) · ln(0.76 · (T_egg − T_water) / (T_yolk − T_water))

plus an empirical **+20 s for every egg beyond the first** (more eggs cool the water more).

| Constant (`EGG_MODEL` in `modules/recipes/src/domain/eggs.ts`) | Default | Status |
|---|---|---|
| Mass M / L | 58 / 70.9 g | fitted |
| Mass S / XL | 48.1 / 76.9 g | fitted (S, XL chilled NAHNILIČKO 3 ks) |
| T_egg chilled / room | 5 / 20 °C | |
| T_water = min(99 °C, boiling point at the HA elevation) | 99 °C | fitted |
| T_yolk NAMĚKKO / NAHNILIČKO / NATVRDO | 63.2 / 68.1 / 81.9 °C | fitted |
| `perExtraEggS` | 20 s | fitted (1 vs 3 eggs) |
| Quail NAMĚKKO / NAHNILIČKO / NATVRDO (size + count ignored) | 2:20 / 3:00 / 4:00 | chilled fitted; NATVRDO and room temp *nekalibrováno* |
| Rounding of the final time | 10 s | as the reference app |

- Boiling point: ISA barometric pressure + Clausius–Clapeyron (≈ 100 − h/300 °C). HA elevation
  comes from `get_config`; elevation 0 or unset keeps 99 °C.
- The 9 chicken reference times are reproduced within ±1 s (tests assert ±5 s).
- Quail eggs (~10 g) would take ~1.7 min by the formula; the reference shows fixed times per
  doneness (size and count disabled), so quail uses a table, not Williams.

Default times, **1 egg**, 99 °C (each extra egg +0:20, rounded to 10 s):

| Velikost | Chlazený | NAMĚKKO | NAHNILIČKO | NATVRDO |
|---|---|---|---|---|
| S (48.1 g) | ano | 4:10 | 5:00 | 8:30 |
| S (48.1 g) | ne | 3:10 | 4:00 | 7:30 |
| M (58 g) | ano | 4:40 | 5:40 | 9:40 |
| M (58 g) | ne | 3:30 | 4:30 | 8:30 |
| L (70.9 g) | ano | 5:20 | 6:30 | 11:00 |
| L (70.9 g) | ne | 4:00 | 5:10 | 9:40 |
| XL (76.9 g) | ano | 5:40 | 6:50 | 11:40 |
| XL (76.9 g) | ne | 4:10 | 5:30 | 10:10 |

### Calibration
1. Add reference times (seconds) to `tests/fixtures/egg-timer/observations.json`
   (`kind`, `size`, `chilled`, `count`, `doneness`, `seconds`).
2. `python3 scripts/fit_egg_timer.py tests/fixtures/egg-timer/observations.json` → residual
   table + JSON (`yolkC` per doneness by least squares; `perExtraEggS` once the samples have two
   or more egg counts; quail times).
3. Copy the values into `EGG_MODEL`, set `calibrated: true`, update the tests
   (`eggs.test.ts` asserts every chicken reference within ±5 s,
   `tests/python/test_fit_egg_timer.py` checks the script and the shipped constants).

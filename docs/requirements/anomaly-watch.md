# Hlídání neobvyklých stavů v domě – požadavky (spike)

Stav: **spike k posouzení vlastníkem** (issue #128, 17. 11. 2026). Bez kódu v integraci, bez zápisů do HA,
bez nasazení. Prototyp algoritmu: `scripts/anomaly_watch_spike/` + `tests/python/test_anomaly_watch_spike.py`
(jen syntetická data). Inspirace: [Vatra](https://github.com/RazvanR1/Vatra) (MIT) – převzaty principy
a několik výchozích prahů, ne kód (viz `THIRD_PARTY_NOTICES.md`).

---

## Část A – pro vlastníka (stručně)

**Co to dělá.** HomeBrain se jednou za noc podívá do historie Home Assistantu, naučí se, jak se
každé zařízení obvykle chová (jak často posílá data, jaké hodnoty mívá v kterou hodinu, jak dlouho
bývají otevřené dveře nebo rozsvícené světlo), a během dne si všímá, když se něco výrazně liší.

**Jak to hlásí.** HomeBrain sdruží související hodnoty do jednoho hlášení, například „Myčka neodpovídá.
Všech 17 hodnot mlčí.“ Při společném výpadku více zařízení upozorní na jejich integraci nebo bránu.
Každé hlášení má jednu ze tří úrovní.

| Úroveň | Kdy | Kde je vidět |
| --- | --- | --- |
| **Pozorování** | něco je jinak než obvykle, ale krátce nebo málo | jen na stránce *Hlídání domu*; často zmizí samo |
| **Podezření** | trvá to déle (typicky 30 min – 2 h) nebo se to opakuje | i na obrazovce *Dnes* |
| **Porucha** (potvrzená) | dlouhé nebo jednoznačné (např. celé zařízení mlčí 2 h, mrazák +20 °C) | i **na telefon** – jako jediná |

**Na co si dává pozor, aby neplašil.**

- Po **restartu HA** se 15 minut nic nového nehlásí a hodiny „jak dlouho to mlčí“ se po dobu výpadku
  zastaví. Když najednou zmlkne většina domu, ukáže jedno „Většina senzorů mlčí – nejspíš restart nebo
  výpadek sítě“, ne 30 poruch.
- **Změna času** (letní/zimní) – vše se počítá v místním čase, sousední hodiny se slučují.
- **Dovolená** – nízká spotřeba, zhasnuto a snížené topení nikdy nejdou na telefon. S nápovědou
  „nikdo není doma“ (volitelná vazba na přítomnost) zůstanou jen tichá pozorování.
- **Vyměněný senzor** – nový kus se znovu „učí“ (7 dní) a mezitím o něm nic nehlásí.
- Zařízení, které **běžně** vypadává (např. pračka v noci bez cloudu), se porovnává se svými vlastními
  výpadky, ne s ideálem.
- Spotřeba (konvice, návštěva) potřebuje mnohem silnější odchylku než teplota nebo vlhkost.

**Soukromí.** Vše se počítá v Home Assistantu z jeho vlastní historie (recorder). Nic se neposílá
ven, žádná AI, žádná cloudová služba.

**Ovládání.** U hlášení „To je v pořádku“ (zavřít a přizpůsobit prah) a „Ztlumit na 7 dní“. Obojí je
jen lokální stav HomeBrainu, do HA se nic nezapisuje.

---

## Část B – technický návrh

### B.1 Zdroje dat (jen čtení)

| Co | Odkud | Kdy |
| --- | --- | --- |
| hodinové průměry číselných senzorů | `recorder.statistics.statistics_during_period(..., "hour", types={"mean"})` | noční učení |
| změny stavů (binární, výpadky, kmitání, trvání) | `recorder.history.state_changes_during_period` | noční učení |
| živé hodnoty a `last_reported` | listener `state_changed` / `state_reported` **jen pro hlídané entity** | průběžně |
| restart / mezery recorderu | eventy `homeassistant_start` / `homeassistant_stop` + díry v tabulce states | noční učení i živě |
| zařízení, integrace, odstranění | entity a device registry (`device_id`, `config_entry`, `disabled_by`) | při změně registru |

Recorder dotazy běží přes `get_instance(hass).async_add_executor_job` po dávkách ~50 entit (stejně jako
`energy/ws.py`, `heating/ws.py`). Hlídá se allowlist domén `sensor`, `binary_sensor`, `light`, `switch`,
`climate`, `lock`, `cover`, `fan`; `media_player` se vynechává (TV běžně „unavailable“). Číselný baseline
jen pro `state_class: measurement` (mají dlouhodobé statistiky).

> **Pozor – recorder a `last_reported`:** HA neukládá nový řádek, když senzor pošle stejnou hodnotu.
> Intervaly naučené z historie jsou proto horní odhad (méně falešných „ztichlých“), živé měření
> používá `last_reported`, které se aktualizuje i bez změny hodnoty.

### B.2 Detektory

Všechny prahy jsou v `Config` (`scripts/anomaly_watch_spike/model.py`) a vztahují se k **vlastní
historii entity**, s absolutní spodní hranicí.

| Detektor | Učení (21 dní) | Pozorování | Podezření | Porucha |
| --- | --- | --- | --- | --- |
| **Hodinový baseline** (číselné) | na každou místní hodinu medián + MAD hodinových průměrů, sloučeno s hodinou před a po; rozptyl = max(1,4826·MAD, minimum třídy, 5 % mediánu); obálka min/max | klouzavý 1h průměr má \|z\| ≥ 4 **a** leží mimo obálku ± 1 rozptyl (spotřeba/CO₂/světlo: \|z\| ≥ 6) | trvá ≥ 30 min | trvá ≥ 2 h **a** \|z\| ≥ 6 **a** mimo obálku ± 3 rozptyly |
| **Ztichlý senzor** (periodické) | p50/p95 intervalu mezi hlášeními; periodický = ≥ 48 hlášení a ≥ 85 % hodin pokrytých | mlčí ≥ max(3·p95, 30 min) | ≥ max(6·p95, 2 h) | ≥ max(12·p95, 6 h) |
| **Nedostupné** (`unavailable`/`unknown`) | p95 délky vlastních výpadků | ≥ max(2·p95, 30 min) | ≥ max(4·p95, 2 h) | ≥ max(8·p95, 6 h) |
| **Kmitání stavu** (diskrétní) | max. počet přepnutí v 15min okně | přepnutí za 15 min ≥ max(10, 2× obvyklé) | trvá ≥ 30 min | trvá ≥ 2 h |
| **Kmitání dostupnosti** | – | ≥ 4 výpadky za hodinu | trvá ≥ 30 min | trvá ≥ 2 h |
| **Neobvyklé trvání** (dveře, okna, světla, zásuvky) | p95 délky epizod „on/open“, ≥ 5 epizod | ≥ max(3·p95, minimum třídy) | 2× tolik | 4× tolik |

Minima tříd (z Vatry): rozptyl teplota 1,5 °C, vlhkost 6 %, výkon 30 W, CO₂ 150 ppm …; trvání dveře
15 min, okno 6 h, světlo 5 h, zásuvka 8 h. Enum-like číselné senzory (MAD = 0 a bez minima třídy) se
baselinem nehlídají.

### B.3 Úrovně, seskupení, oznámení

1. **Úroveň nikdy neklesá**, dokud hlášení trvá (žádné blikání). Hlášení se uzavře, až je podmínka
   15 min nepravdivá; přesune se do „Nedávno vyřešené“ (7 dní).
2. **Seskupení po zařízení** (`device_id`). Mlčí-li ≥ 2 entity a ≥ 50 % hlídaných entit zařízení,
   je titulek „{Zařízení} neodpovídá ({N} entit)“ a úroveň se zvedá o stupeň (podezření → porucha):
   mlčící celé zařízení je porucha zařízení, ne šum. Počet entit v titulku zahrnuje i sourozence,
   kteří ještě nepřekročili práh, a nikdy neklesá (žádné 2 → 7 → 17).
3. **Seskupení po integraci**: pokud mlčí ≥ 3 zařízení jedné integrace, vznikne jedno společné hlášení.
   Stačí i dvě zařízení, pokud mlčí všechny jejich hlídané hodnoty a poslední aktualizace zařízení
   dělí nejvýše 15 minut. Hlášení směřuje kontrolu na integraci nebo její bránu.
4. **Hromadný výpadek**: ≥ 50 % periodických zařízení napříč ≥ 2 integracemi je potichu → jen jedno
   systémové pozorování, žádné poruchy, nic na telefon.
5. **Telefon**: jen úroveň *Porucha*, jednou za 24 h na stejné hlášení; v tichých hodinách (výchozí
   22–7) se odloží na 7:00 a nepošle se vůbec, pokud se mezitím vyřešilo.
6. **Dnes** (kontrakt `docs/specs/dnes-signals.md`): modul `system`, `group = system.anomaly`, jedna
   karta. Podezření → `notice`, porucha → `warning`; pozorování jen jako počet v klidovém čipu.

### B.4 Odolnost vůči restartu a falešným poplachům

| Situace | Opatření | Test |
| --- | --- | --- |
| restart HA (20 min i 3 h) | 15min „grace“ bez nových hlášení; měření trvání vynechá výpadek i grace; přepnutí během grace se nepočítají (rozbouřené zigbee kontakty); obnovený stav ≠ nová epizoda | `test_ha_restart_creates_no_findings` |
| mezera recorderu v historii | intervaly a epizody přes mezeru (+ grace) se z učení vyřadí | `test_recorder_gap_in_history_does_not_skew_learning` |
| změna času (25. 10. / 29. 3.) | místní hodina + slučování sousedních hodin | `test_dst_change_creates_no_findings` |
| dovolená (7 dní) | nízká spotřeba max. podezření; s přítomností jen pozorování; nic na telefon | `test_vacation_week` |
| výměna senzoru (nový `device_id` / nové `entity_id`) | reset baseline → zahřívání 7 dní; odstraněná entita se nehlídá | `test_sensor_replaced_restarts_warm_up` |
| pračka v noci bez cloudu | porovnání s vlastními výpadky (p95) | `test_quiet_day_has_no_findings` |
| konvice / návštěva | behaviorální třídy potřebují \|z\| ≥ 6 | `test_quiet_day_has_no_findings` |

### B.5 Datový model

```text
EntityBaseline (perzistentní, 1 na entitu, ~0,9 kB JSON)
  entity_id, device_id (proti kterému se učilo), days (délka historie)
  hourly[24]: {median, spread, lo, hi, n} | null
  periodic, p50_interval, p95_interval
  outages, outage_p95, flap_usual, dwell_n, dwell_p95

Finding (živé, perzistentní kvůli restartu)
  detector: baseline | silent | unavailable | flapping | dwell
  entity_id, device_id, tier, since, last_true, detail{…}

Report (pro UI a oznámení, odvozené)
  key: device:<id> | integration:<name> | system
  title (česky), tier, since, entities[], findings[], scope

Mute / Ack (perzistentní, lokální)
  key, until | dwell_factor (prah se zvětší za každé „To je v pořádku“; princip z Vatry)
```

Úložiště: HA `Store` `homebrain.anomaly_watch` (baseline + otevřená hlášení + ztlumení + 7 dní
vyřešených). WebSocket: `homebrain/anomaly/list` (read-only, role `owner`/`adult`),
`homebrain/anomaly/ack` a `…/mute` (zápis jen do vlastního Store, ne do HA).

### B.6 Zahřívání a rozpočet na HA boxu

- **Zahřívání**: baseline a trvání až po 7 dnech historie entity (≥ 15 hodinových průměrů v poolu,
  ≥ 5 epizod). Ztichlé/nedostupné funguje hned, jakmile je ≥ 48 hlášení. UI ukazuje „Učí se: N“.
- **Paměť**: živý stav ≈ 5 MB pro 1 280 entit (měřeno `tracemalloc`), baseline ≈ 0,9 kB/entitu
  (1 000 entit ≈ 1 MB ve Store).
- **CPU**: vyhodnocení 1× za 60 s, ~30 ms pro 1 280 entit (prototyp v čistém Pythonu, sdílený stroj);
  cíl < 50 ms. Noční učení 03:30 v executoru po dávkách; 32 entit × 21 dní ≈ 0,7 s, odhad pro
  1 000 entit < 1 min CPU v noci, dotazy recorderu v dávkách po 50 entitách.

### B.7 Fáze 2 (mimo tento spike)

- Učení zvyků a návrhy automatizací s ověřením na historii (samostatné issue, Vatra `habits.py`).
- „Nový normál“: automatické přeučení po trvalé změně (nové topení, nový spotřebič).
- Den v týdnu (pracovní den × víkend) v baseline; sezónnost.
- Korelace mezi zařízeními (např. otevřené okno ↔ pokles teploty ≠ porucha).
- Výjimky pro noční oznámení (mrazák, vstupní dveře) podle odpovědí vlastníka.
- Jakékoli zápisy do HA (vypnutí entity, automatizace) – nikdy bez labelu `writes-to-ha`.

---

## Požadavky

### ANW-001 – Data jen z HA

- **Popis:** Detekce čte výhradně recorder/historii a state machine HA; nic neodesílá mimo HA.
- **Zdroj:** issue #128; `AGENTS.md` §7
- **Priorita:** MVP
- **Akceptace:** modul nemá síťové závislosti; review nenachází HTTP klienta ani cloudové volání.

### ANW-002 – Hodinový baseline číselných senzorů

- **Popis:** Hodnota neobvyklá pro místní hodinu dne podle B.2.
- **Zdroj:** issue #128; Vatra `anomaly.py` (princip)
- **Priorita:** MVP
- **Akceptace:** `test_freezer_warming_is_confirmed_and_notified_once`, `test_warm_afternoon_is_suspicion_at_most`.

### ANW-003 – Ztichlé a nedostupné senzory

- **Popis:** Mlčení nebo nedostupnost delší než vlastní obvyklý interval/výpadek podle B.2.
- **Zdroj:** issue #128; Vatra `anomaly.py`, `guard.py` (princip)
- **Priorita:** MVP
- **Akceptace:** `test_single_silent_sensor_escalates_slowly`; noční výpadek pračky nic nehlásí.

### ANW-004 – Kmitání

- **Popis:** Neobvykle časté přepínání stavu nebo dostupnosti.
- **Zdroj:** issue #128
- **Priorita:** MVP
- **Akceptace:** `test_flapping_plug`, `test_availability_flapping`.

### ANW-005 – Neobvykle dlouhé trvání

- **Popis:** Dveře, okna, světla, zásuvky zapnuté/otevřené výrazně déle než obvykle.
- **Zdroj:** issue #128
- **Priorita:** MVP
- **Akceptace:** `test_door_left_open_at_night_notifies_in_the_morning`.

### ANW-006 – Seskupení po zařízení a integraci

- **Popis:** Jedno hlášení na zařízení („Myčka neodpovídá (17 entit)“), na integraci při ≥ 3 zařízeních nebo při souběžném výpadku dvou celých zařízení.
- **Zdroj:** issue #128
- **Priorita:** MVP
- **Akceptace:** `test_dishwasher_silent_is_one_grouped_report_and_one_notification`, `test_integration_down_rolls_up_devices`,
  `test_two_whole_devices_share_a_report_only_for_simultaneous_silence`.

### ANW-007 – Odolnost vůči restartu, DST, dovolené a výměně senzoru

- **Popis:** Opatření dle B.4; žádná falešná hlášení.
- **Zdroj:** issue #128
- **Priorita:** MVP
- **Akceptace:** testy v tabulce B.4 + `test_mass_outage_is_one_system_note_not_n_alarms`.

### ANW-008 – Tři úrovně, na telefon jen porucha

- **Popis:** Pozorování → podezření → porucha, úroveň neklesá; oznámení jen u poruchy, cooldown 24 h, tiché hodiny.
- **Zdroj:** issue #128
- **Priorita:** MVP
- **Akceptace:** `test_tiers_only_escalate_and_only_confirmed_notifies`, `test_resolved_during_quiet_hours_never_wakes_anyone`.

### ANW-009 – Zahřívání

- **Popis:** Bez dostatečné historie se baseline a trvání nehlásí; UI ukazuje „Učí se“.
- **Zdroj:** issue #128
- **Priorita:** MVP
- **Akceptace:** `test_warm_up_blocks_baseline_findings`.

### ANW-010 – Rozpočet výkonu

- **Popis:** Vyhodnocení < 50 ms / 60 s pro ~1 000 entit, paměť < 20 MB, učení jen v noci v executoru.
- **Zdroj:** spike #128
- **Priorita:** MVP
- **Akceptace:** `test_evaluation_budget_1200_entities` (volná mez 0,5 s kvůli sdílenému CI); měření na HA boxu před nasazením.

### ANW-011 – Karta na Dnes a stránka Hlídání domu

- **Popis:** Karta „Hlídání domu“ na Dnes od úrovně podezření (jinak klidový čip), detail se stavem 24 h, hlášeními po zařízeních, žebříkem úrovní, náhledem oznámení a hlídanými zařízeními.
- **Zdroj:** mockupy spike #128 (mimo repo, synteticky)
- **Priorita:** MVP
- **Akceptace:** screenshoty 360×800, 800×1280, 1440×900 (+ kiosk 1280×800), světlé i tmavé; label `needs-owner-visual-check`.

### ANW-012 – Učení zvyků

- **Popis:** Návrhy automatizací ze zvyků s ověřením na historii.
- **Zdroj:** issue #128 (mimo rozsah fáze 1)
- **Priorita:** later
- **Akceptace:** samostatné issue.

## UI (mockupy)

Mockupy vykreslují syntetická data a hlášení z prototypu. Zdroj a generátor jsou v
`scripts/anomaly_watch_spike/mockup/`. PNG se ukládají do samostatného adresáře mimo Git.

- **Dnes** zobrazuje čip v klidu a při pozorování. Při podezření nebo poruše se zobrazí karta
  *Hlídání domu*. Další podezření jsou ve vlastní skupině. Potvrzená porucha má na kiosku širokou kartu s velkým titulkem.
- **Detail** obsahuje souhrn s vysvětlivkami k pásu posledních 24 hodin, filtr, přehled zařízení
  a náhled oznámení. U výpadku časová osa ukazuje poslední hodnotu, první očekávanou chybějící hodnotu
  a aktuální čas. U teploty končí dnešní křivka v čase snímku. Hlavní akcí u poruchy je „Vyřešeno“.
- **Použité komponenty `@homebrain/ui`:** `Card`, `SignalCard`, `Pill`, `Chip`, `Button`, `StatusRow`,
  `Stepper`, `SegmentedControl`, `Tile`, `ListCell`, `Switch`, `Icon`; tokeny `--hb-*`.
- **Navržené nové:** `TonedIcon` (tónovaný čtverec s ikonou), `HealthStrip` (24 h pás),
  `BaselineBand` (pásmo obvyklých hodnot + dnešní křivka), `SilenceTimeline` (časová osa výpadku),
  `TierPill` (tenký wrapper nad `Pill`),
  ikony `dishwasher`, `thermo`, `drop`, `snow`, `bolt`, `washer`, `door`, `window`, `bulb`, `plug`,
  `shield`, `pulse`, `phone`, `home`.

Pro nové snímky spusťte z kořene repozitáře po instalaci závislostí a Chromia pro Playwright:

```sh
python -m scripts.anomaly_watch_spike.demo > scripts/anomaly_watch_spike/mockup/anomaly-demo.json
pnpm --dir apps/panel exec vite build --configLoader runner --config ../../scripts/anomaly_watch_spike/mockup/vite.config.mjs
python -m http.server 8768 --bind localhost --directory scripts/anomaly_watch_spike/mockup/dist
```

V druhém terminálu spusťte `node scripts/anomaly_watch_spike/mockup/render.mjs http://localhost:8768 /absolutni/cesta/ke/snimkum`.
Všechny interakce jsou lokální v mockupu.

## Otázky pro vlastníka

1. **Co je porucha hodná telefonu?** Návrh: celé zařízení mlčí ≥ 2 h, jedna hodnota ≥ 6 h, mrazák/lednice
   mimo vše dosud viděné, kmitání ≥ 2 h. Mají otevřené dveře/okno vůbec chodit na telefon, nebo jen na Dnes?
2. **Tiché hodiny 22:00–7:00** – sedí? Má něco budit i v noci (mrazák, vstupní dveře otevřené v noci)?
3. **Které skupiny zařízení jsou nejdůležitější** a které úplně vynechat? (spotřebiče, topení, klimatická
   čidla, dveře/okna, síť, osvětlení; např. TV a telefony vynechat)
4. **Komu posílat** – jen vlastníkovi, nebo všem dospělým (Companion app)?
5. **Smí hlídání použít přítomnost osob** (nikdo doma → méně citlivé), nebo stačí ruční „Jsme pryč“?

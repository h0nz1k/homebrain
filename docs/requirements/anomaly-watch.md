# Hlídání neobvyklých stavů v domě – požadavky

Stav: **fáze 1 implementována** (detekce + panel, issue #128, PR navazuje na spike #129; návrh
mockupů r3 schválen vlastníkem 18. 11. 2026). Kód: `custom_components/homebrain/anomaly/`
(engine, učení, Store, WS) a `modules/anomaly/` (stránka *Hlídání domu*, karta na *Dnes*).
Inspirace: [Vatra](https://github.com/RazvanR1/Vatra) (MIT) – převzaty principy a výchozí prahy,
ne kód (viz `THIRD_PARTY_NOTICES.md`).

### Fáze 1 – co platí oproti návrhu níže

- **Žádné zápisy do HA a žádná oznámení.** Nic se neposílá na telefon; karta *Na telefon* to
  říká. Tiché hodiny a cooldown z B.3 jsou až pro fázi 2.
- **Akce (rozhodnutí vlastníka v #129, revize r2 a r3 #136):** na každé úrovni jsou dostupné
  *Otevřít ‹zařízení›* (primární, diagnostický krok, jmenuje cíl: „Otevřít Klima obývák“,
  „Otevřít Myčku“, u dlouhého jména „Otevřít zařízení“; jen HA admin – stránka zařízení v HA),
  *Vyřešeno* (sekundární – nezkontrolovaná potíž není „vyřešená“ jako výchozí volba) a
  *Skrýt na 7 dní* (odkaz; oznámení zatím nejsou, takže jde jen o skrytí upozornění). „Vím
  o tom“ a „To je v pořádku“ v UI nejsou. Vše je lokální stav HomeBrainu
  (`.storage/homebrain.anomaly_watch`).
  - *Vyřešeno*: skryje upozornění; pokud potíž trvá ještě 2 h, ukáže se znovu – popisek přímo
    pod tlačítkem („Po Vyřešeno: pokud potíž trvá, za 2 h se upozornění vrátí.“).
  - API dál zná `ack kind=ok` (rozšíří meze dotčených entit ×1,5, max ×4); panel ho nepoužívá.
  - Zvýšení úrovně nad potvrzenou vždy upozornění znovu ukáže.
  - *Nesledovat* (jen HA admin, v detailu upozornění na jednotlivé zařízení): po potvrzení zavře
    upozornění a trvale vyřadí celé zařízení z vyhodnocování, oznámení, učení, počtu hlídaných
    zařízení i heuristiky hromadného výpadku. V sekci *Nesledované (N)* může admin zvolit
    *Znovu sledovat*. Vyhodnocování může začít až po dalším běhu učení.
- **Texty (r2):** jeden neosobní hlas („Hlídáno 12 zařízení“, ne „Hlídám“); každý výpadek stejně
  – „2 h 21 min od posledního hlášení (9:29)“ – na kartě, kiosku, v řádcích podezření i v detailu;
  místnost v 6. pádě, pokud ji HA zná („V obýváku je neobvykle teplo“); trvání se počítá
  k času, který obrazovka ukazuje (Dnes předá kartě své `now`).
- **Texty (r3):** „hlášení“ jen pro zprávu čidla („od posledního hlášení“, „Chybí 16 hlášení“),
  upozornění aplikace je vždy „upozornění“ (test prochází zdrojáky modulu). Čas výpadku jen
  jednou na kartě (řádek pod nadpisem). Každá karta má jeden konkrétní další krok odvozený
  z druhu anomálie („Zkontrolujte baterii nebo dosah čidla.“, „Zkontrolujte topení, okno nebo
  slunce.“). Karty jsou seřazené podle naléhavosti (nejbližší možná Porucha první, pak úroveň).
- **Mimo fázi 1:** citlivost podle přítomnosti.
- **Role:** `list`, `ack`, `mute`, `unmute` – vlastník (HA admin) a dospělí; `summary` (karta
  na Dnes, bez `entity_id` a id zařízení v upozorněních) – i kuchyňský kiosk. `exclude` a
  `include` smí volat jen HA admin. Seznam nesledovaných je v `list` i v `summary` pro
  vlastníka a dospělé. Děti nic. Na kiosku karta nemá
  tlačítko *Otevřít hlídání* (kiosk detail otevřít nesmí). Kiosk je záměrně vždy tmavý (Dnes
  `.today-kiosk` má vlastní tmavé plochy bez ohledu na téma HA), světlá varianta kiosku není.
- **Hlídané entity:** domény z B.1, povolené, viditelné, bez `entity_category`, patřící zařízení
  (seskupení je po zařízení), max. 1 500; ne vlastní entity HomeBrainu. Přítomnost osob zatím
  nevyužívá (otázka 5).
- **Texty:** nadpis nesmí odporovat obsahu a nesmí jít číst jako „není vlhko“: „Čidlo ve sklepě
  přestalo posílat vlhkost“, když teplota chodí dál (rod slovesa podle jména zařízení). Doba od
  posledního hlášení vychází z jeho skutečného času. Osa ukazuje poslední 4 h. U delších výpadků
  popisek uvádí počet chybějících hlášení v tomto okně i celkový počet. U aktivního tarifu se
  očekávaná hlášení počítají nejdříve od jeho zapnutí. Pravidla a testy:
  `modules/anomaly/src/copy.ts`, `copy.test.ts`, `tests/e2e/anomaly.spec.ts`.

---

## Část A – pro vlastníka (stručně)

**Co to dělá.** HomeBrain se jednou za noc podívá do historie Home Assistantu, naučí se, jak se
každé zařízení obvykle chová (jak často posílá data, jaké hodnoty mívá v kterou hodinu, jak dlouho
bývají otevřené dveře nebo rozsvícené světlo), a během dne si všímá, když se něco výrazně liší.

**Jak to hlásí.** HomeBrain sdruží související hodnoty do jednoho hlášení, například „Myčka neodpovídá.
Neposílá žádné údaje.“ Při společném výpadku více zařízení upozorní na jejich integraci nebo bránu.
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

**Soukromí.** Výpočet běží doma v Home Assistantu z jeho vlastní historie (recorder). Ven jdou
jen oznámení na telefon, žádná AI, žádná cloudová služba.

**Ovládání.** (Původní návrh; ve fázi 1 platí akce výše.) Podezření: hlavní „To je v pořádku“
(zavřít a přizpůsobit prah), vedlejší odkaz „Ztlumit na 7 dní“. Porucha: hlavní „Vyřešeno“, vedle
„Otevřít zařízení“, pak „Vím o tom“ a odkaz „Ztlumit na 7 dní“. Na *Dnes* má při podezření nebo poruše
„Otevřít hlídání“ přednost před běžnými úkoly (např. popelnice). Vše je jen lokální stav
HomeBrainu, do HA se nic nezapisuje.

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

Všechny prahy jsou v `Config` (`custom_components/homebrain/anomaly/model.py`) a vztahují se k **vlastní
historii entity**, s absolutní spodní hranicí.

| Detektor | Učení (21 dní) | Pozorování | Podezření | Porucha |
| --- | --- | --- | --- | --- |
| **Hodinový baseline** (číselné) | medián + MAD hodinových průměrů se sousedními hodinami, hodinová obálka min/max a rozsah hodnot napříč celou historií | klouzavý 1h průměr má \|z\| ≥ 4 **a** leží mimo hodinovou obálku ± 1 rozptyl (spotřeba/CO₂/světlo: \|z\| ≥ 6) | hodnota mimo rozsah z učení trvá ≥ 30 min | dosud nevídaná hodnota trvá ≥ 2 h **a** \|z\| ≥ 6 **a** je mimo hodinovou obálku ± 3 rozptyly |
| **Ztichlý senzor** (periodické) | p50/p95 intervalu mezi hlášeními; periodický = ≥ 48 hlášení a ≥ 85 % hodin pokrytých | mlčí ≥ max(3·p95, 30 min); tarifní měřič pouze v aktivním tarifu | ≥ max(6·p95, 2 h) | ≥ max(12·p95, 6 h) |
| **Nedostupné** (`unavailable`/`unknown`) | p95 délky vlastních výpadků | ≥ max(2·p95, 30 min) | ≥ max(4·p95, 2 h) | ≥ max(8·p95, 6 h) |
| **Kmitání stavu** (diskrétní) | max. počet přepnutí v 15min okně | přepnutí za 15 min ≥ max(10, 2× obvyklé) | trvá ≥ 30 min | trvá ≥ 2 h |
| **Kmitání dostupnosti** | časový podíl dostupnosti mimo mezery recorderu a nejvyšší hodinový počet výpadků dosažený alespoň ve třech dnech | ≥ 4 výpadky za hodinu a více než naučený počet | – | – |
| **Neobvyklé trvání** (dveře, okna, světla, zásuvky) | p95 délky epizod „on/open“, ≥ 5 epizod | ≥ max(3·p95, minimum třídy) | 2× tolik | 4× tolik |

Rozptyl při učení i vyhodnocení má dolní mez podle jednotky a 5 % absolutní hodnoty mediánu.
Odchylka pod touto mezí se nehlásí ani při nulovém rozptylu, včetně starších uložených baseline.
Hodnota v rozsahu z učení kdykoli během dne má nejvýše úroveň Pozorování.

Integrace `utility_meter` určuje tarif z údajů senzoru či registru, případně z přípon `_nt` a `_vt`.
Při aktivním tarifu běží doba mlčení od pozdějšího z posledního hlášení a zapnutí tarifu podle
souvisejícího `select`. Při neaktivním tarifu nebo bez dostupného stavu voliče se hlášení neočekávají.

Minima tříd (z Vatry): rozptyl teplota 1,5 °C, vlhkost 6 %, výkon 30 W, CO₂ 150 ppm …; trvání dveře
15 min, okno 6 h, světlo 5 h, zásuvka 8 h. Enum-like číselné senzory (MAD = 0 a bez minima třídy) se
baselinem nehlídají.

### B.3 Úrovně, seskupení, oznámení

1. **Dosažená úroveň trvá**, dokud je hlášení otevřené. Kmitání dostupnosti a hodnoty v rozsahu
   z učení mají strop Pozorování. Hlášení se běžně uzavře, až je podmínka 15 min nepravdivá,
   a přesune se do „Nedávno vyřešené“ (7 dní). Mlčení při skončení aktivního tarifu se uzavře hned.
2. **Seskupení po zařízení** (`device_id`). Mlčí-li ≥ 2 entity a ≥ 50 % hlídaných entit zařízení,
   je titulek „{Zařízení} neodpovídá ({N} entit)“ a úroveň se zvedá postupně: pozorování trvající
   30 min → podezření, mlčení na prahu podezření (2 h) → porucha. Mlčící celé zařízení je porucha
   zařízení, ne šum; podezření ale vždy předchází poruše (v ukázce 9:55 → 10:25 → 11:20). Počet entit v titulku zahrnuje i sourozence,
   kteří ještě nepřekročili práh, a nikdy neklesá (žádné 2 → 7 → 17).
   Souvislá nedostupnost všech entit dál eskaluje podle stejných prahů.
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
  availability_ratio, availability_flaps_usual, value_range

Finding (živé, perzistentní kvůli restartu)
  detector: baseline | silent | unavailable | flapping | dwell
  entity_id, device_id, tier, since, last_true, detail{…}

Report (pro UI a oznámení, odvozené)
  key: device:<id> | integration:<name> | system
  title (česky), tier, since, entities[], findings[], scope

Mute / Ack (perzistentní, lokální)
  key, until | dwell_factor (prah se zvětší za každé „To je v pořádku“; princip z Vatry)

ExcludedDevice (perzistentní, klíč je ID zařízení)
  id, name, area, excluded_at
```

Úložiště: HA `Store` `homebrain.anomaly_watch` (baseline, otevřená upozornění, ztlumení,
7 dní vyřešených a mapa `excluded_devices`). Starší data bez této mapy se načtou s prázdným
seznamem nesledovaných. WebSocket: `homebrain/anomaly/list`, `…/summary`, `…/ack`, `…/mute`,
`…/unmute`, `…/exclude {device_id}`, `…/include {device_id}`. Změny se ukládají jen do
vlastního Store. Seznam `excluded_devices` v odpovědi obsahuje `id`, `name`, `area` a
`excluded_at` (ISO 8601). Kiosková odpověď tento seznam vynechává.

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

Schválené mockupy r3 (zdroj a generátor) jsou ve spike PR #129 (větev `spike/anomaly-watch`).
Implementace: `modules/anomaly/` (stránka, karta na Dnes, grafy), styly v
`modules/anomaly/src/views/styles.ts`. V dev serveru synteticky přes
`?anomaly=ok|observations|suspicion|confirmed|learning` (stránka `/homebrain-hlidani`, Dnes
`/homebrain-dnes?anomaly=…`, kiosk `/homebrain-dnes?kiosk=1&anomaly=…`).

Testy z tabulek výše jsou v `tests/python/test_anomaly_engine.py` (bez kontrol oznámení – ta
jsou až ve fázi 2), HA vrstva a WS v `tests/python/test_anomaly_ws.py`.

## Otázky pro vlastníka

1. **Co je porucha hodná telefonu?** Návrh: celé zařízení mlčí ≥ 2 h, jedna hodnota ≥ 6 h, mrazák/lednice
   mimo vše dosud viděné, kmitání ≥ 2 h. Mají otevřené dveře/okno vůbec chodit na telefon, nebo jen na Dnes?
2. **Tiché hodiny 22:00–7:00** – sedí? Má něco budit i v noci (mrazák, vstupní dveře otevřené v noci)?
3. **Které skupiny zařízení jsou nejdůležitější** a které úplně vynechat? (spotřebiče, topení, klimatická
   čidla, dveře/okna, síť, osvětlení; např. TV a telefony vynechat)
4. **Komu posílat** – jen vlastníkovi, nebo všem dospělým (Companion app)?
5. **Smí hlídání použít přítomnost osob** (nikdo doma → méně citlivé), nebo stačí ruční „Jsme pryč“?

# HomeBrain – „Dnes“: prioritní model signálů (kolo 3)

Stav: 31. 10. 2026 · data v mockupech jsou **syntetická** · kopie návrhu z kola 3 (bez soukromých údajů).
Cíl: hlavní obrazovka **Dnes** ukazuje jen to podstatné, klidně a prémiově. Co je teď důležité, je nahoře a velké; zbytek se stáhne do tiché řady „Ostatní v pořádku“. Detailní obrazovky (Počasí, Energie, Odpady…) zůstávají hustá bento rozložení z kola 2.

Referenční implementace řazení: `packages/signals` (`rank()`), port referenčního prototypu z kola 3 návrhu; Vitest testy reprodukují pořadí ze stavů b, c, d (kap. 5). Mockupy (mimo repo) se generovaly z prototypu, takže pořadí karet je skutečný výstup algoritmu.

---

## 1. Signál (kontrakt modulu → Dnes)

Každý modul (počasí, energie, odpady, kalendář, zdraví, systém) vystavuje seznam signálů. Dnes nic nepočítá z entit napřímo, jen signály řadí, slučuje a vykresluje.

```ts
type Severity = "critical" | "warning" | "notice" | "info" | "calm";

interface Signal {
  id: string;              // stabilní, např. "weather.chmu.wind.2026-11-01"
  module: "weather" | "energy" | "waste" | "calendar" | "health" | "system";
  group?: string;          // klíč pro slučování, např. "weather.wind"
  severity: Severity;      // určuje modul podle pravidel v kap. 3
  tone?: "risk" | "opportunity" | "neutral";   // příležitost = zelená, ne poplach
  kind: "event" | "deadline" | "window" | "state";
  relevance: number;       // 0–1, osobní relevance (kap. 2.3)
  valid_from: string;      // ISO; začátek jevu / okna / termínu
  valid_to: string;        // ISO; konec jevu / termín
  title: string;           // ≤ 48 znaků, „Déšť za 35 min“
  context: string;         // jedna věta, ≤ 90 znaků
  value?: { v: string; unit?: string; label?: string };   // hlavní číslo
  action?: Action;
  source: { name: string; updated_at: string; stale_after_s: number };
  related?: string[];      // id signálů, které dávají kontext (ne slučují)
}

type Action =
  | { type: "navigate"; label: string; href: string }            // deep link, např. "/pocasi#radar"
  | { type: "service"; label: string; service: string;           // musí být v allowlistu
      target: string; confirm: boolean }
  | { type: "ack"; label: string };                                // „Hotovo – vyvezeno“, jen lokální stav
```

**Allowlist služeb** (konfigurace, ne kód modulu; vše ostatní se odmítne). Cíl je **logický klíč bindingu** – konkrétní `entity_id` se váže v integraci v HA, nikdy v Gitu:

| Služba | Cíl (logický klíč) | Potvrzení | Kdy se nabízí |
|---|---|---|---|
| `cover.close_cover` | `weather.awning` | ano | vítr ≥ 50 km/h, výstraha ČHMÚ vítr |
| `script.turn_on` | `energy.washer_start` | ano | levné okno teď / přebytek FVE |
| `script.turn_on` | `energy.battery_charge` | ano | baterie < 30 % a hrozí výpadek |
| `switch.turn_off` | `energy.water_heater` | ne | velmi drahá hodina teď |

Tlačítka služeb jsou **neaktivní**, když je HA odpojený nebo jsou data zastaralá (viz stav c), s textem důvodu.

## 2. Řazení

Řazení je **lexikografické**: nejdřív závažnost, uvnitř stejné závažnosti skóre `p`.

```
klíč = (SEV[severity], p)          SEV: critical 4, warning 3, notice 2, info 1, calm 0
p    = 0,6 · u (časová naléhavost) + 0,4 · r (osobní relevance)
```

### 2.1 Časová naléhavost `u` (0–1), podle `kind`
| kind | před `valid_from` | během platnosti |
|---|---|---|
| `event` (déšť, mráz, výstraha) | `u = exp(−Δ_start / 60 min)` | `u = 1` na začátku, lineárně klesá k 0,5 u `valid_to` (jev trvá, ale je už známý) |
| `deadline` (vyvézt popelnici, léky) | – | `u = clamp(1 − Δ_to / lead, 0, 1)`, `lead` = 120 min (roste k termínu) |
| `window` (levné/drahé okno, přebytek FVE) | `u = exp(−Δ_start / 30 min)` | `u = 0,9` → klesá k 0,3 s ubývajícím zbytkem okna |
| `state` (HA odpojeno, baterie) | – | `u = clamp(trvání / 30 min, 0,5, 1)` |

### 2.2 Povýšení podle času
Moduly mohou závažnost zvednout s blížícím se časem (pravidla v kap. 3), Dnes **nikdy** sám závažnost nemění – jen řadí.

### 2.3 Osobní relevance `r`
Základ z modulu (systém 1,0 – ovlivňuje důvěryhodnost všech ostatních údajů; odpady 0,9 – vyžadují akci; počasí 0,7; zdraví 0,7; energie 0,6; kalendář 0,6), upravený:
- +0,1 když je někdo doma / poloha „doma“ (synteticky),
- −0,2 když uživatel stejný typ signálu 3× po sobě zavřel bez akce (učení „tohle mě nezajímá“),
- +0,1 když má signál dostupnou akci.

### 2.4 Slučování a souvislosti
1. **Stejná `group` → sloučit** do jedné karty s nejvyšší závažností; ostatní se stanou řádkem „Naměřeno teď / Také“ (např. výstraha ČHMÚ vítr + nárazy ze stanice; nowcast déšť + výstraha ČHMÚ na přívalový déšť).
2. **Příležitosti energie se překrývají → sloučit**: levné okno + přebytek FVE = „Dobrý čas na spotřebu“.
3. **`related` → jen souvislost**, ne sloučení: odpady dnes + déšť za 35 min ⇒ do kontextu karty odpadů „Vyvez ji ještě před deštěm (od 8:00)“.
4. Signál, jehož modul má viditelnou kartu, se do řady čipů nedává (žádné duplicity).

### 2.5 Kolik je vidět
| Viewport | Hero | Karty | Zbytek |
|---|---|---|---|
| Mobil 390 | 1 | 3 | čipy (2 sloupce) |
| Desktop 1440 | 1 | 5 (3 + 2) | čipy v řadě |
| Nástěnný tablet (kiosk) | 1 | 3 | čipy; při `critical` hero zabere ~60 % výšky |

- Do karet jdou jen signály `≥ notice`. `info` se promítne do **jednovětého shrnutí dne** a do časové osy dne; `calm` jen do čipů.
- `critical` je vždy hero; další `critical` jsou karty v kritickém stylu a nikdy se neschovají pod limit.
- Přebytek nad limitem: „+2 další upozornění“ odkaz pod kartami.

### 2.6 Stabilita (aby obrazovka „neskákala“)
- Hystereze: pořadí se změní jen při změně závažnosti nebo rozdílu `p` > 0,10.
- Minimální doba zobrazení karty 5 min (kromě zmizení důvodu, např. déšť skončil).
- Přepočet každých 60 s a při každé změně signálu; animace přeřazení FLIP 240 ms.

### 2.7 Klidný stav
Když nic není nad `info`: **velký klidný hero** – čas (tenké číslice), datum, venkovní teplota ze stanice + jedna věta shrnutí, pod ním tenká časová osa dne (6–24 h) s info signály (levné okno, západ slunce, událost v kalendáři) a řada čipů.
Shrnutí se skládá ze šablony: `{nálada} · {teplota} °C, {obloha odpoledne} · {nejlepší info signál}` → „Klidný den · 12 °C, odpoledne polojasno · levný proud 13–15 h“.
Nálada: calm „Klidný den/večer“, s warning „Rušné ráno“ / „Pozor na …“, s critical vždy název hrozby.

## 3. Pravidla závažnosti (příklady)

> **Rozhodnutí vlastníka (31. 10. 2026):** oranžová výstraha ČHMÚ = `warning`, červená (a fialová) = `critical`; výpadek dat z HA = `critical`. Pomocné funkce `chmuWarningSeverity()` a `haDataSeverity()` v `packages/signals` toto pravidlo implementují. Referenční fixture stavu c (kap. 5) vznikla ještě před rozhodnutím (oranžová = critical); test ji drží jako regresní referenci řazení a vedle ní ověřuje pořadí podle nových pravidel.


| Signál | Modul | kind | Pravidlo závažnosti | Akce |
|---|---|---|---|---|
| Výstraha ČHMÚ | weather | event | žlutá (nízký) → notice · **oranžová (vysoký) → warning** · červená (velmi vysoký) / fialová (extrémní) → critical + kiosk takeover | navigate `/pocasi#vystrahy`; vítr → `cover.close_cover` |
| Déšť začne do 60 min (nowcast) | weather | event | < 1 mm/h → notice · 1–4 mm/h → warning · > 4 mm/h nebo kroupy → warning + povýšení na critical, pokud ČHMÚ | navigate `/pocasi#radar` |
| Mráz v noci | weather | event | od 15:00: min 0 až −1 °C → notice · ≤ −1 °C → warning · ≤ −8 °C → warning, relevance +0,2 | navigate `/pocasi#noc` |
| Silné nárazy větru | weather | event | 50–70 km/h → notice · 70–90 → warning · > 90 → critical | `cover.close_cover` |
| Levné / záporné okno spotu | energy | window | start ≤ 30 min nebo probíhá → notice (tone opportunity) · záporná cena → warning (tone opportunity) · jinak info | `script.turn_on` → `energy.washer_start` |
| Velmi drahá hodina teď | energy | window | ≥ 2× denní průměr → notice · ≥ 3× → warning | `switch.turn_off` → `energy.water_heater` |
| Přebytek FVE teď | energy | state | ≥ 2 kW 30 min a baterie ≥ 90 % → notice · jinak info | `script.turn_on` → `energy.washer_start` |
| Baterie nízko | energy | state | < 30 % → notice · < 15 % nebo hrozí výpadek (výstraha vítr/bouřky) → warning | `script.turn_on` → `energy.battery_charge` |
| Výpadek sítě | energy | state | vždy critical (běží z baterie, zbývá X h) | navigate `/energie` |
| Odpady zítra | waste | deadline | od 17:00 předchozího dne → notice · od 21:00 nepotvrzeno → warning | `ack` „Hotovo – vyvezeno“ |
| Odpady dnes | waste | deadline | ráno do termínu (obvykle 8:00) → warning · po svozu zmizí | `ack` |
| Zastaralá data / HA odpojen | system | state | zdroj starší než `stale_after_s` (HA 120 s) → warning; **výpadek HA (odpojeno) nebo > 60 min bez dat → critical** | navigate `/system` |
| Událost v kalendáři | calendar | event | ≤ 60 min → notice · ≤ 15 min → warning · jinak info | navigate `/kalendar` |
| Připomínka zdraví (léky) | health | deadline | v čase dávky → notice · 60 min po termínu nepotvrzeno → warning | `ack` „Vzato“ |

**Zastaralost je průřezová:** když je zdroj signálu zastaralý, karta i čip ukáže „před 14 min“ ve varovné barvě a hodnoty jsou ztlumené (opacity 0,6); akce závislé na HA jsou neaktivní.

## 4. Vizuální jazyk „Dnes“ (klidný prémiový, tokeny z kola 2)

Stejné tokeny jako kolo 2 (`--hb-bg`, `s1–s3`, `b1–b2`, `t1–t3`, `ac #3D8BFF`, `ok/warn/crit`), stejné písmo Inter s tabulkovými číslicemi → detailní obrazovky působí jako stejná aplikace. Nové jen:

| Token | Hodnota | Použití |
|---|---|---|
| `--hb-display-w` | Inter 200 (čas), 300 (teplota, hodnoty) | velké tenké číslice (vliv A1) |
| `--hb-radius-hero` | 18 px | hero karta (běžné karty 14 px, kolo 2 = 12 px) |
| `--hb-glow` | radiální `ac` 7 % vlevo nahoře, `crit` 9 % při critical | měkká hloubka pozadí místo stínů |
| `--hb-space-page` | 48 px desktop, 56 px kiosk, 16 px mobil | velkorysý okraj |

**Závažnost – tlumeně, kromě critical:**
| Úroveň | Karta | Odznak |
|---|---|---|
| critical | plocha `crit-s` + 1px okraj `crit` 45 %, ikona v plné `crit`, tečka pomalu pulzuje (2,4 s) | „Kritické“ bílý text na `crit` |
| warning | neutrální plocha, 3px proužek vlevo `warn`, ikona `warn` | „Upozornění“ text `warn` |
| notice | neutrální plocha, tečka `ac` (příležitost: `ok`) | „K vědomí“ / „Příležitost“ |
| info | jen ve shrnutí a na časové ose | – |
| calm | čip | – |

Barva nikdy není jediný nositel: každá karta má textový odznak úrovně, ikonu a časový údaj („za 35 min“, „zbývá 6 h 40 min“).

**Pohyb (subtilní):** nová karta fade + 8 px posun 220 ms ease-out; přeřazení FLIP 240 ms; přechod do critical: pozadí glow se během 600 ms zbarví, žádné blikání; tečka critical pulzuje opacity 1 → 0,45; odpočty se mění bez animace číslic; `prefers-reduced-motion` vše vypne. Kiosk v noci (22–6 h) ztlumí na 35 % jasu, critical jas vrátí.

## 5. Stavy v mockupech (synteticky)

| Stav | Čas | Signály (výstup `rank()`) |
|---|---|---|
| a) klidný den | So 31. 10. 10:40 | jen info/calm → klidný hero + časová osa |
| b) rušné ráno | Po 2. 11. 7:25 | hero: Odpady dnes (warning, deadline 8:00) · Déšť za 35 min (warning) · Levný proud teď (notice, příležitost) · Léky (notice) |
| c) kritický | Ne 1. 11. 15:20 | hero: ČHMÚ oranžová – silný vítr (critical, sloučeno s nárazy ze stanice) · HA data 14 min stará (warning) · Baterie 22 % před bouří (warning) |
| d) večer | Čt 5. 11. 20:45 | hero: Mráz v noci −3 °C (warning) · Zítra papír (notice) |

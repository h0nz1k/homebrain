# Hlasové odepsání lahve (vinotéka)

Input-agnostické jádro pro zápis „vypito“ z volného českého textu. Stejná logika obsluhuje WebSocket (panel), službu Home Assistant a později feed z Google Tasks „Vypito“ nebo jiných zdrojů.

## Tok

1. **Normalizace** – lowercase, bez diakritiky, odstranění frází typu „vypil jsem“, „odepiš“, „láhev“, „prosím“ – jen na hranicích slov (obec „Prosiměřice“ zůstane celá); „Pet-Nat“ / „pet nat“ → `petnat`.
2. **Parsování** – volitelný ročník (4 číslice nebo „ročník 21“ → 2021), množství číslem („3x“, „3 láhve“) nebo slovem, ale jen s jednotkou („pět lahví“) nebo jako první slovo („dvě Frankovky“) – „Tramín pět“ zůstane názvem. Výchozí 1.
3. **Fuzzy match** – jen vína **skladem** (`quantity > 0`); skóre z token set ratio (`difflib`), pole `name`, `labelName`, `predicate`, odrůdy, ročník. Kandidát musí pokrýt aspoň **60 %** slov dotazu – jedno společné slovo nestačí.
   - **Skloňování** – Assist slyší i jiné pády než katalog (1. pád). Deterministická normalizace koncovek (`-u`, `-y`, `-ou`, `-e`, `-ce`, `-em`, `-ovi`, `-ého`, `-ým`, `-ii` …) navrhne kandidáty 1. pádu: „Frankovku / Frankovkou / o Frankovce“ → Frankovka, „Pálavu“ → Pálava, „Blauburgeru“ → Blauburger, „Ryzlinku rýnského“ → Ryzlink rýnský, „Veltlínského zeleného“ → Veltlínské zelené, „Sauvignonu“ → Sauvignon, „Tramínu“ → Tramín; „Müller-Thurgau“ zůstává.
   - Kandidát se použije **jen tehdy, když je to doslova slovo daného vína** (název, etiketa, přívlastek, odrůda) – normalizace sama shodu nevymyslí („Merlotu“ bez Merlotu v katalogu = nenalezeno).
   - Přesný tvar má přednost: skóre po lemmatizaci má malou penalizaci (−0,02), takže doslovná shoda je vždy první. Nejednoznačnost funguje stejně („Ryzlinku“ při rýnském i vlašském → doptání).
4. **Rozhodnutí**
   - **Jednoznačné** – nejvyšší skóre ≥ **0,80** a náskok před druhým ≥ **0,15** → odepsání přes stejnou cestu `store.consume` jako UI.
   - **Nejednoznačné** – uložení do fronty `voice_pending`, UI / `voice_resolve` potvrdí nebo zruší.
   - **Nenalezeno** – žádný kandidát nad prahem.
   - **Není skladem** – jednoznačná shoda, ale `quantity == 0`.
5. **Poslední láhev** – povoleno s `confirmed=True`; odpověď obsahuje `lastBottle: true` a Assist varuje „Pozor, to byla poslední láhev.“

Fronta `voice_pending` je ve schématu vinotéky **v6** (navazuje na v5 = EAN z #81).

Idempotence: `source_operation_id` (min. 8 znaků) – stejné ID u consume neodepíše dvakrát (tabulka `consume_idempotency`).

Audit: událost `consume`, `actor.type` = `assist`, `actor.source` = `voice`, důvod „Hlas: …“.

## WebSocket (jen admin)

| Příkaz | Popis |
|--------|--------|
| `homebrain/wine/voice_consume` | `{ text, source_operation_id, dry_run? }` → `{ status, wine?, candidates?, lastBottle?, pendingId?, dryRun? }` |
| `homebrain/wine/voice_pending` | seznam čekajících |
| `homebrain/wine/voice_resolve` | `{ pending_id, wine_id \| null }` – null = zahodit |

Parametry požadavku jsou v `snake_case` (validuje je schéma WS), odpověď používá `camelCase` (`pendingId`, `lastBottle`, `dryRun`).

Stavy `status`: `consumed`, `ambiguous`, `not_found`, `out_of_stock`, `invalid_quantity`.

## Služba HA

`homebrain.wine_consume_text` – parametry `text`, volitelně `source_operation_id`. Vrací stejný objekt jako WS.

## Home Assistant Assist

Věty jsou v balíčku `custom_components/homebrain/custom_sentences/cs/homebrain_wine.yaml`. Výchozí agent HA ale čte vlastní věty **jen** z `<config>/custom_sentences/cs/`, proto je HomeBrain při startu zkopíruje do `<config>/custom_sentences/cs/homebrain_wine.yaml` a zavolá `conversation.reload` (jen při změně). Kdo chce věty upravit ručně, smaže v kopii řádek `# managed-by: homebrain` – HomeBrain ji pak už nepřepíše.

| Intent | Věty (příklady) |
|--------|-----------------|
| `HomebrainWineConsumeText` | „Vypil jsem Frankovku 2021“, „Vypila jsem si dvě láhve Tramínu“, „Odepiš láhev Pet-Nat“, „Otevřeli jsme Ryzlink ročník 22“, „Vypito Pálava“ |
| `HomebrainWineVoiceChoose` | „To první“, „Tu druhou láhev“, „Myslel jsem to třetí“ |
| `HomebrainWineVoiceDismiss` | „Ani jedno“, „Žádné z nich“, „Neodepisuj nic“ |

Odpovědi v češtině (TTS):

- Odepsáno: *Odepsáno: Rulandské šedé 2025, zbývá 1 láhev.* / *… Pozor, to byla poslední láhev.*
- Nejasnost: *Mám víc podobných vín. Myslíš první A, nebo druhé B?* → uživatel znovu zapne mikrofon a řekne „to první“ / „ani jedno“. Doptání se vztahuje na nejnovější čekající žádost mladší **30 minut**; starší zůstávají ve frontě pro potvrzení v panelu (`voice_resolve`).
- Málo lahví: *Od vína X mám jen 2 láhve.* · Vypito: *X už ve vinotéce není.* · Nenalezeno: *Tohle víno ve vinotéce nemám.*

Assist s výchozím agentem po otázce mikrofon sám neotevře (`continue_conversation` jen u LLM agentů), proto je doptání samostatná věta.

### Jak to vyzkoušet (vlastník)

1. Nasadit verzi s tímto PR a restartovat HA; ověřit, že vznikl `<config>/custom_sentences/cs/homebrain_wine.yaml`.
2. Nastavení → Hlasoví asistenti: pipeline s jazykem **čeština** a agentem **Home Assistant** (lokální, bez LLM).
3. Na telefonu v Companion app Assist (widget / dlaždice / ikona mikrofonu) → „Vypil jsem …“ – nebo napsat text v dialogu Assist.
4. Bez mikrofonu: Vývojářské nástroje → Akce → `conversation.process` s `text: "vypil jsem …"`, `language: cs`.

## Později: Google Tasks „Vypito“

Plánovaný adaptér (mimo toto jádro) bude periodicky číst dokončené úkoly, pro každý vygenerovat `source_operation_id` (např. `gtask:<taskId>`) a volat stejnou funkci `apply_voice_consume`. Nejednoznačné záznamy zůstanou ve frontě `voice_pending` pro potvrzení v panelu.

## Testy

```bash
pytest tests/python/test_wine_voice.py tests/python/test_wine_voice_assist.py tests/python/test_wine_voice_inflection.py -q
```

`test_wine_voice_assist.py` rozpoznává věty přes `hassil` a prochází skutečný výchozí agent HA (`conversation.async_converse`, `language="cs"`): odepsání ve 4. pádě („vypil jsem Pálavu“), odepsání poslední láhve, nejednoznačnost → „to druhé“, „ani jedno“, nenalezeno. Jen syntetická vína. `test_wine_voice_inflection.py` ověřuje skloňované tvary nad vymyšleným katalogem běžných moravských odrůd včetně falešných shod.

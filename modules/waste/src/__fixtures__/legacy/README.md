# Převzaté testovací scénáře

Původ: repozitář `donor/waste`, cesta `fixtures/`, commit `e3a3c34`.
Všech 12 JSON souborů je převzato beze změn, bajt po bajtu. Licence a vlastnictví
zůstávají stejné jako ve zdrojovém repozitáři (stejný vlastník).

## Anonymizace (pravidlo vlastníka: nic soukromého v repozitáři)

Před převzetím byly všechny řetězcové hodnoty zkontrolovány (skript nad všemi
klíči JSON). Soubory obsahují pouze obecné české názvy druhů odpadu, syntetická ID
(`fixture-*`, `visual-*`, `exec-pack-v3-*`), fiktivní budoucí data (2026/2030)
a sentinel hodnoty. Neobsahují žádné názvy ulic, obcí, adresy, jména osob,
e-maily, IP adresy, GPS ani `entity_id` z produkčního Home Assistantu, proto
nebylo nutné je upravovat. Nové fixtures musí toto pravidlo dodržet.

Scénáře obsahují anonymizovaná deterministická data. Zde je načítají pouze testy
ze souborů; nejsou součástí sestaveného modulu. Referenční den vychází z data
`generated_at`, pokud test výslovně neurčí jiný den.

| Soubor | Význam |
| --- | --- |
| `standard.json` | Běžné budoucí svozy, referenční den 2030-07-18. |
| `multiple-same-day.json` | Více druhů odpadu se svozem ve stejný den. |
| `long-czech-names.json` | Zachování dlouhých českých názvů. |
| `empty.json` | Dostupný zdroj bez budoucích svozů. |
| `unavailable.json` | Nedostupný zdroj. |
| `stale.json` | Zastaralé, ale poslední známé termíny. |
| `unknown-type.json` | Záměrně nevalidní vstup; neznámý typ se normalizuje na `other`. |
| `cancelled.json` | Zrušená událost není příštím svozem. |
| `year-boundary.json` | Řazení svozů přes hranici měsíce a roku. |
| `invalid-records.json` | Záměrně nevalidní vstup; chybné záznamy se odmítají jednotlivě. |
| `visual-standard.json` | Vizuální scénář s demonstračním datem 2026-07-18. |
| `visual-pack-v3-executable.json` | Rozšířený vizuální scénář s demonstračním datem 2026-07-18. |

Kanonické scénáře odpovídají legacy kontraktu `contracts/waste-dashboard.schema.json`.
Výjimky `unknown-type` a `invalid-records` se kontrolují až po normalizaci; přísná
validace jejich původního vstupu musí selhat. Zástupné hodnoty
`fixture-source-ref`, `example.invalid` a `fixture-private-marker` jsou syntetické.

`normalizeDataset` vrací dataset společně s počtem odmítnutých záznamů. Volání
`buildSchedule(normalizeDataset(vstup), referenčníDatum)` tento počet zachová;
při předání samotného kanonického datasetu je počet odmítnutých záznamů nulový.

Licence: fixtures jsou syntetické; vlastník zdrojového repozitáře je relicencoval pod MIT (viz `LICENSE`).

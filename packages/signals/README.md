# @homebrain/signals

Čisté funkce pro signály obrazovky Dnes, bez Reactu, DOM a běhových závislostí. Refs #37.
Kontrakt a pravidla popisuje [specifikace](../../docs/specs/dnes-signals.md).

- `rank(signals, now, options?)` slučuje skupiny, počítá naléhavost a skóre a vrací `hero`, `cards`, `more`, `info`, `calm`, `all` a `previous` pro další přepočet. Výchozí rozložení je `desktop`; další jsou `mobile` a `kiosk`. `all` zachovává čerstvé pořadí podle skóre, hystereze a minimální doba zobrazení se aplikují na viditelný výběr.
- `urgency` a funkce `eventUrgency`, `deadlineUrgency`, `windowUrgency`, `stateUrgency` počítají naléhavost. `mergeGroups` zachovává první pozici skupiny a vnořené členy `also`.
- `stabilize` drží blízká skóre v předchozím pořadí. Předejte `result.previous` jako `options.previous`; čas prvního zobrazení se neobnovuje při přepočtu. Výchozí minimální zobrazení je 5 minut, kritické signály mají přednost. Závažnost má přednost před původní pozicí.
- `resolveActionState` vrací dostupnost a český důvod zamítnutí. Bez allowlistu jsou služby zakázány; cíl se porovnává přesně s logickým klíčem. `resolveAction` i `rank` vynutí potvrzení požadované allowlistem. Balíček sám žádnou službu nevolá.
- `isStale`, `ageSeconds`, `chmuWarningSeverity`, `haDataSeverity`, `rainNowcastSeverity`, `windGustSeverity` poskytují pravidla pro moduly. Dnes závažnost nemění.
- `buildCalmSummary({ now, tempC, sky, ranked: result.all })` skládá české shrnutí; `isCalm(result.all)` rozpozná klidný stav.

Všechny časy jsou ISO s explicitním časovým pásmem, referenční fixtures používají UTC. Denní nálada shrnutí používá hodinu UTC, nezávisle na časovém pásmu procesu. Vstupní relevance má rozsah 0–1. Funkce vstupy nemění. Referenční stav c zachovává původní závažnosti; pravidla vlastníka ověřují samostatné testy.

# Přibalená data – původ a licence

## `orp.json` – hranice ORP

- **Zdroj:** ČÚZK, 2026 – Registr územní identifikace, adres a nemovitostí (RÚIAN), prvek
  *Obec s rozšířenou působností* (geometrie stažené 2026-11 přes veřejnou mapovou službu ČÚZK);
  kódy a názvy ORP z číselníku ČSÚ č. 65 (CISORP).
- **Licence:** [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/legalcode.cs) –
  [Podmínky poskytování prostorových dat ČÚZK](https://www.cuzk.gov.cz/Predpisy/Podminky-poskytovani-prostor-dat-a-sitovych-sluzeb/Podminky-poskytovani-prostorovych-dat-CUZK.aspx)
  (otevřená data RÚIAN) a otevřená data ČSÚ (CC BY 4.0).
- **Úpravy (dle podmínek ČÚZK nutno uvést):** převod do WGS84, zjednodušení hranic
  Douglas–Peucker s tolerancí 0,008° (≈ 0,5–0,9 km), zaokrouhlení souřadnic na 3 desetinná místa,
  vypuštění všech atributů kromě kódu ORP, názvu a kraje. Data slouží jen k lokálnímu určení ORP
  domova (bod v polygonu) pro filtr výstrah ČHMÚ; nejsou určena k zobrazení ani k měření.
  U bodů blízko hranice ORP může zjednodušení vést k chybnému ORP – proto jde ORP přepsat volbou
  `options.weather.chmi_orp`.
- Data RÚIAN jsou poskytována bez záruky; ČÚZK ani ČSÚ s HomeBrain nijak nesouvisí.

## Data ČHMÚ za běhu (nejsou přibalena)

Výstrahy (CAP XML, `opendata.chmi.cz/meteorology/weather/alerts/cap/`) a radarové kompozity
(`opendata.chmi.cz/meteorology/weather/radar/composite/maxz/png/`, extrapolace `fct_maxz`)
se stahují za běhu z otevřených dat ČHMÚ pod licencí CC BY 4.0; UI je označuje „Zdroj: ČHMÚ,
CC BY 4.0“. Radarový nowcast (čas začátku/konce deště) je vlastní odvozený výpočet HomeBrain,
nikoli produkt ČHMÚ.

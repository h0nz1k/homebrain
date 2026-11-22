# Topení – Doporučení

Karta v přehledu Topení je dostupná vlastníkovi a dospělým. Ukazuje odhad tepelné ztráty a návrh, co zkusit na displeji regulace. Veškeré úpravy křivky provádí vlastník ručně.

## Zdroj dat

HomeBrain čte hodinové dlouhodobé statistiky Recorderu v Home Assistantu. Výpočet běží při startu a v 00:20 místního času, aby Recorder stihl zapsat poslední hodinu předchozího dne. Při chybě čtení následuje jeden další pokus za 15 minut. V paměti zůstává výsledek výpočtu. Pro výpočet se používají ukončené místní dny s alespoň 20 platnými hodinami pro každý potřebný vstup. Pro srovnání teploty referenční místnosti s cílem musí mít oba údaje alespoň 20 společných hodin. Denní přírůstek počítadla mimo rozsah 0–24 h zneplatní daný den.

Senzory `sensor.heating_house_circuit_runtime_h` a `sensor.heating_pumps_heating_runtime_h` sčítají dobu běhu z pravidelných odečtů příslušných výstupů. O půlnoci se vynulují a po restartu obnoví uloženou hodnotu z téhož dne. Dobu bez odečtů nepřičítají. Hodinové souhrny ukládá Recorder jako pro jiné senzory s `total_increasing`. Podíl běhu topného okruhu je denní přírůstek dělený 24 i ve dnech změny času. Přesnost výroku závisí na četnosti a dostupnosti odečtů. Doporučení potřebuje nově nasbírané statistiky topného okruhu.

## Odhad ztráty

Používají se venkovní teplota a přírůstky hodin běhu kompresoru z probíhající a předchozích sezón, nejvýše ze tří. Sezóna začíná v červenci. Přímka se hledá pro dny s průměrnou venkovní teplotou pod odhadovanou hranicí topení. Hranice je teplota, při níž model předpovídá nulový běh kompresoru. Pro srovnání sezón karta ukazuje jejich sklony pro dny pod toutéž hranicí.

Nízká jistota odpovídá méně než 20 dnům nebo R² pod 0,2. Vysoká odpovídá více než 60 dnům a zároveň R² alespoň 0,4. Ostatní odhady mají střední jistotu. Jmenovitý tepelný výkon čerpadla se zadává v nastavení HomeBrain → Topení. Ztráta v W/K je sklon v h/den/K krát zadaný výkon v kW krát 1000 / 24. Rozmezí odpovídá jedné standardní chybě sklonu na každou stranu, se spodní mezí nejméně nula. Ztráta v kW při návrhové venkovní teplotě (výchozí −12 °C) vychází z rozdílu mezi touto teplotou a odhadovanou hranicí topení. Výsledek je orientační. Běh kompresoru ovlivňuje také příprava teplé vody a další nastavení.

## Nastavení křivky

Karta posoudí až sedm nejnovějších úplných dnů s průměrnou venkovní teplotou pod 8 °C z posledních 21 ukončených místních dnů. Pro první vyhodnocení stačí pět takových dnů. Návrh na změnu se zobrazí, když se jeho směr a body shodují ve dvou po sobě jdoucích denních vyhodnoceních.

Referenční teplota se porovnává s aktuální žádanou teplotou, při chybějící hodinové hodnotě s nominální. Ze srovnání teplot se vynechají tři hodiny počínaje zvýšením cíle alespoň o 0,1 °C. Pro srovnání musí zbýt alespoň 17 hodin. Rezerva je průměr denních hodnot hystereze referenční místnosti. Pro den bez platné hystereze se použije 0,2 °C.

- Snížení připadá v úvahu, pokud průměr v referenční místnosti překročí cíl alespoň o rezervu, okruh běžel v průměru méně než 25 % dne a nejnižší teplota v podkroví dosáhla nastaveného minima (výchozí 20 °C). Podmínka pro podkroví se používá, pokud má HomeBrain dostupnou entitu čidla.
- Zvýšení má přednost. Karta ho navrhne, když byl hodinový průměr v referenční místnosti o více než 0,3 °C pod cílem déle než šest hodin za den alespoň ve třech dnech. Zvýšení připadá v úvahu také tehdy, když okruh běžel v průměru více než 80 % dne a průměrná teplota byla pod cílem o více než rezervu.
- Krok je vždy 1 °C na straně teploty vody. Výběr bodů vychází z naměřených denních venkovních průměrů a skutečných venkovních teplot jednotlivých bodů. Mezi body se posuzují oba přilehlé body, za koncem křivky krajní bod.
- Změna venkovní teploty nebo teploty vody v kterémkoli bodě pozastaví návrh až do nasbírání sedmi úplných chladných dnů po změně. Sledují se hodinová minima, maxima a změny mezi dny. Žádaná teplota nádrže se průběžně mění s počasím. Pro zjištění změny nastavení se proto používají přímo body křivky.
- Teplota se měří v referenční místnosti s rozlišením 0,1 °C. Podkroví má vlastní údaj, pokud je čidlo dostupné.

Dev scénáře lze přepnout parametrem `doporuceni=suggest_lower|suggest_higher|ok|insufficient_data|recent_change`. Používají syntetická data.

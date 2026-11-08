# Energie – Srovnání nabídek

Karta **Srovnání nabídek** v modulu Energie odpovídá na otázku „kolik bych zaplatil u jiné
nabídky“. Počítá se ze skutečně naměřeného hodinového odběru ze sítě a přetoků do sítě
(dlouhodobé statistiky recorderu) za posledních až 12 celých kalendářních měsíců.

## Data

| Vstup | Zdroj |
| --- | --- |
| Odběr / přetoky po hodinách | statistiky vazeb `energy_grid_import_energy_today` / `energy_grid_export_energy_today` (`change` za hodinu) |
| Současná smlouva | pomocníci tarifu `energy_tariff_price_vt`/`_nt` (Kč/kWh s DPH), `energy_tariff_fixed_monthly`, rozvrh NT z `energy_tariff_hdo`, korekce `energy_meter_correction` |
| Nabídky | zadává správce v kartě (HA Store `homebrain.energy_offers`) |
| Regulované složky | zadává správce (sdílené pro všechny nabídky); bez uložení se předvyplní z `energy_spot_distribution_vt`/`_nt` a `energy_spot_fixed_monthly` (převod na Kč/MWh bez DPH) |
| Spotové ceny | OTE-CR denní trh + kurz ČNB, cache v HA Store `homebrain.energy_spot` |

### Spotové ceny (OTE + ČNB)

- OTE: `https://www.ote-cr.cz/pw-data/chart-data/01?language=cs&report_date=YYYY-MM-DD`
  (veřejná data grafu denního trhu; stará adresa `…/denni-trh/@@chart-data` sem přesměrovává).
  Od 1. 10. 2025 řada `15min cena (EUR/MWh)` (92/96/100 čtvrthodin), dříve `Cena (EUR/MWh)`
  po hodinách. Čtvrthodiny průměrujeme na hodinu, protože statistiky HA jsou hodinové.
- ČNB: `https://www.cnb.cz/cs/financni-trhy/devizovy-trh/kurzy-devizoveho-trhu/kurzy-devizoveho-trhu/rok.txt?rok=YYYY`
  (sloupec `1 EUR`; o víkendu a svátcích platí poslední vyhlášený kurz).
- Stahování běží na pozadí jen tehdy, když existuje spotová nabídka (nebo výkup za spot):
  jednorázově doplní chybějící dny období (max. 1 požadavek za sekundu, tj. ~6 minut na rok),
  pak už jen nové dny. Neúspěšný den se zkusí znovu nejdřív za 6 hodin. Karta mezitím ukazuje
  průběh a měsíce bez cen do součtů nezapočítá.
- Záloha: pokud je navázán senzor `energy_spot_price_electricity` (např. integrace
  *Czech Energy Spot Prices*) a má dlouhodobé statistiky, chybějící hodiny se doplní z jeho
  hodinového průměru (Kč/kWh → Kč/MWh; hodnoty nad 100 se berou jako Kč/MWh).

## Výpočet (`homebrain/energy/offers/compare`)

Pro každý měsíc a plán:

- **Současná smlouva** = odběr × cena VT/NT s DPH (podíl NT v každé hodině podle rozvrhu HDO)
  + stálé platby s DPH − přetoky × výkupní cena současné smlouvy.
- **Nabídka** = (silová elektřina + distribuce VT/NT + systémové služby + POZE + daň) za MWh
  + stálá platba obchodníka + stálé regulované platby, celé × (1 + DPH) − výkup přetoků.
  - pevná cena: VT/NT Kč/MWh bez DPH;
  - spot: hodinová cena OTE (Kč/MWh) + přirážka;
  - výkup: žádný, pevná cena, nebo (jen spot) spot − poplatek. Výkup je bez DPH.
- Stálé platby se u prvního neúplného měsíce rozpočítají poměrně.
- Součty a pořadí jsou jen za měsíce, ve kterých mají hodnotu všechny plány.

### Předpoklady (ukazuje je i karta)

- stejný hodinový profil spotřeby a přetoků, bez změny chování;
- hodinové statistiky; čtvrthodinové spotové ceny zprůměrované na hodinu;
- VT/NT podle současného rozvrhu HDO (stejné hodiny každý den);
- regulované ceny jsou hodnoty **2026 zadané uživatelem** a pro všechny nabídky stejné;
- výkup bez DPH (domácnost není plátce DPH).

## Role

| Role | Čtení + výpočet | Přidat / upravit / smazat |
| --- | --- | --- |
| správce (HA admin) | ano | ano |
| dospělý | ano | ne |
| kiosk, dítě, host | ne | ne |

WS: `homebrain/energy/offers/get`, `…/save` (`offer` a/nebo `regulated`), `…/delete`
(`offer_id`), `…/compare`.

## Vývoj

Dev panel: `/homebrain-energie?nabidky=empty|loading&role=adult|kiosk` (syntetická data).
Testy: `tests/python/test_energy_offers.py` (syntetické odpovědi OTE/ČNB ve
`tests/python/fixtures/energy_offers/`), `modules/energy/src/views/OffersCard.test.tsx`,
`tests/e2e/energy-offers.spec.ts`.

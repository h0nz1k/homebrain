# Odpady – konec svozových dat (datový horizont)

Obce zveřejňují svozový kalendář po částech, obvykle na kalendářní rok. Když zveřejněný rozpis
dojde, panel by bez varování ukázal prázdno. HomeBrain proto hlídá **datový horizont** (WST-008).

## Jak to funguje

- Integrace si pamatuje každý pozorovaný svoz z navázaných entit (`waste_next`, `waste_calendar`,
  `waste_dataset`, `waste_history`), včetně budoucích termínů (kalendář čte 120 dní dopředu).
- `homebrain/waste/history` (jen admin) vrací vedle historie i `horizon`:
  `status` (`empty` / `ok` / `ending` / `ended`), `last_date`, `days_left`, `warn_days`, `warning`
  a `types[]` = poslední známý svoz každého typu. Dny se počítají v časovém pásmu HA.
- Práh upozornění je 30 dní; dá se změnit parametrem `warn_days` (1–366) ve WS příkazu.
- Pod 30 dní ukáže panel Odpady adminovi klidné upozornění
  „Svozový kalendář končí 30. 12. – doplňte rozpis na 2027“ s rozbalovacím „Co s tím“.
- Pod 14 dní vytvoří integrace hlášení v **Nastavení → Opravy** (`waste_data_horizon`, varování).
  Zmizí samo, jakmile se objeví pozdější termíny.
- Typ, který už se vyvážel, ale další termín nemá, ukazuje v „Naposledy vyvezeno“ text
  „Další termín zatím neznámý“. Když není známý žádný další svoz, hero napíše
  „Další svozy zatím nejsou známé“ – nikdy si nevymýšlí datum.
- Kiosk, děti a ne-admini upozornění nevidí. Dnes ukazuje jen dnešní a zítřejší svoz, takže po
  konci dat prostě nic neukáže.

## Co dělat, když data končí

1. Ověřte na webu obce nebo svozové firmy, že je rozpis na další rok zveřejněný (často až v
   prosinci).
2. Obnovte zdroj kalendáře – vlastní skript/parser, který zapisuje ICS, nebo akci
   `waste_collection_schedule.fetch_data`.
3. Panel i hlášení v Opravách se aktualizují samy (nejpozději do 3 hodin, při otevření panelu hned).

## Migrace waste_collection_schedule z YAML na UI

Konfigurace `waste_collection_schedule:` v `configuration.yaml` (a `sensor: - platform:
waste_collection_schedule`) je v novějších verzích integrace označená jako zastaralá. Postup
přechodu na nastavení v UI (příklad se zdrojem ICS v lokálním souboru):

1. Zálohujte HA a poznamenejte si současná entity_id (`calendar.…`, `sensor.…`) a vazby HomeBrain
   (Nastavení → Zařízení a služby → HomeBrain → Konfigurovat → Odpady).
2. Nastavení → Zařízení a služby → **Přidat integraci** → *Waste Collection Schedule*.
3. Zvolte zdroj **ICS** (Generic) a zadejte stejné argumenty jako v YAML, např.
   `file: www/odpady/svoz.ics` (soubor musí být pod `/config/www`).
4. V nastavení nové položky přidejte senzor se stejnými parametry jako v YAML
   (`details_format: upcoming`, `count`, `value_template`).
5. Z YAML odstraňte blok `waste_collection_schedule:` i senzor s
   `platform: waste_collection_schedule`, zkontrolujte konfiguraci a restartujte HA.
6. Pokud se změnila entity_id, přejmenujte je zpět (Nastavení entity) nebo v HomeBrain přenavažte
   `waste_next` a `waste_calendar`. Historie svozů zůstane – ukládá se podle data a štítku.
7. Ověřte panel Odpady: další svoz, kalendář a „Naposledy vyvezeno“.

Obnova dat (`waste_collection_schedule.fetch_data`) funguje stejně i po migraci.

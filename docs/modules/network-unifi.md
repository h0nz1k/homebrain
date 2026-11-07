# Síť – přímé čtení UniFi (V2): odkud se bere účet

Modul Síť běží z dat Home Assistantu (integrace UniFi Network + ping). Volitelné přímé čtení
řadiče UniFi (jen požadavky `GET` na `self`, `stat/device`, `stat/sta`) doplní porty, rychlosti
linek, sílu signálu a vytížení kanálů.

## Zdroj účtu

Nastavení → Zařízení a služby → HomeBrain → Konfigurovat → **Síť – UniFi**:

| Volba | Co se ukládá do možností HomeBrainu | Odkud jsou přihlašovací údaje |
| --- | --- | --- |
| **Použít účet z integrace UniFi v HA** (výchozí) | `{"source": "ha_integration", "entry_id": "…"}` | z `entry.data` integrace `unifi` při každém připojení |
| Vlastní účet (zadat údaje) | `source: manual`, adresa, site, uživatel, heslo | zadané ručně (doporučeno View Only) |
| Vypnuto (jen data z HA) | `{"source": "off"}` | – |

* **Výchozí chování:** když v HA existuje právě jedna integrace UniFi a nejsou zadané vlastní
  údaje, HomeBrain použije její účet automaticky – žádný druhý účet, žádné zadávání hesla.
  Starší nastavení s vyplněnou adresou (bez `source`) zůstává jako vlastní účet.
* **Více integrací UniFi:** výchozí se nevolí; v kroku Síť – UniFi vyberte konkrétní integraci
  (`entry_id`).
* HomeBrain čte `host`, `port`, `site`, `username`, `password`, `verify_ssl` přes veřejné API
  `hass.config_entries` (`async_entries("unifi")` / `async_get_entry`) až v okamžiku připojení.
  Změnu hesla v integraci UniFi tak převezme při dalším čtení (nová relace).
* Adresa je `https://<host>:<port>`; klasická aplikace (`:8443`) vs. UniFi OS se rozpozná stejně
  jako dosud (`GET /` → 200 = UniFi OS).

## Bezpečnost

* Heslo z integrace UniFi se **nikdy** nekopíruje do možností ani úložiště HomeBrainu, neposílá
  se přes WebSocket a nepíše do logů (`UnifiConfig` má heslo mimo `repr`). Kryjí to testy
  `tests/python/test_network_unifi_reuse.py`.
* WebSocket `homebrain/network/settings/get` (jen admin) vrací `unifi.source` a `unifi.account`
  (uživatelské jméno) – panel z toho ukáže např. **„Účet: ha (z integrace UniFi)“**. Ostatní
  odpovědi nesou jen stav a `source`, nikdy adresu ani heslo.
* Účet integrace UniFi v HA bývá administrátorský; HomeBrain přesto posílá jen čtecí `GET`
  (po přihlášení). Panel upozorní, když účet není View Only.

## Stavy

| `unifi.status` | Význam | Panel |
| --- | --- | --- |
| `ok` | čtení běží | „Zdroj: HA + UniFi“ |
| `unifi_source_missing` | vybraná integrace UniFi je odebraná nebo není načtená | klidná poznámka, zkouší se každých 60 s, bez opravného hlášení |
| `auth_failed` | přihlášení odmítnuto | upozornění + opravné hlášení `network_unifi_auth` |
| `unreachable` | řadič neodpovídá | upozornění, zkouší se s prodlevou |

Když se integrace UniFi přidá až po startu HomeBrainu, načtěte HomeBrain znovu (nebo uložte
krok Síť – UniFi).

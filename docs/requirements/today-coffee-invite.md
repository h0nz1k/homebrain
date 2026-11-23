# Dnes – Pozvat na kávu

Refs #154

Tlačítko **Pozvat na kávu** v Dnes funguje na tabletu i v kuchyňském kiosku. Odesílá
pozvánku na TV prostřednictvím skriptu vybraného správcem v možnostech integrace
HomeBrain pod **Dnes – Pozvat na kávu**.

| Nastavení | Význam | Výchozí hodnota |
| --- | --- | --- |
| `coffee_script` | Entita skriptu pozvánky | Prázdné, tlačítko je skryté |
| `coffee_tv` | Entita TV v obýváku | Prázdné, stav TV se nekontroluje |
| `coffee_mode` | `bublina` pro malé oznámení, `plna` pro celou obrazovku | `bublina` |
| `coffee_household_label` | Společné jméno odesílatele pro účet s rolí kiosk | Prázdné, použije se výchozí hodnota skriptu |

Příkaz `homebrain/today/coffee/invite` je dostupný každému přihlášenému uživateli HA.
Integrace volá výhradně `script.turn_on` pro nastavenou entitu. Předává proměnnou
`rezim` a jako `od` zobrazované jméno osoby z Rodiny, případně jméno účtu HA.
Pro účet s rolí kiosk použije společné jméno. Pokud je prázdné, proměnnou `od` vynechá.
Volitelný `text` a nahrazení zástupného textu `{od}` zajišťuje samotný skript.

Nedostupný nebo chybějící skript zobrazí „Skript pozvánky v HA chybí“.
Pokud je TV nastavená, její stav musí být přesně `on`. Jinak se zobrazí „TV v obýváku
neběží“. Po zahájení odesílání se tlačítko na 30 sekund zablokuje na všech panelech
s důvodem „Pozvánka běží“. Pokud skript stále běží, tlačítko se zpřístupní po jeho skončení.

„Pozvánka odeslána na TV.“ potvrzuje předání požadavku skriptu. Integrace nečeká
na dokončení animace a nemá potvrzení o zobrazení na TV. Pokud stav TV není
nastavený pro kontrolu, skript může přijmout požadavek i při vypnuté TV.

# Role a ne-admin panely (stav po rc.36)

Navazuje na [ADR-0002](../adr/0002-roles-and-users.md) §3.1 a Fázi 4 z [ADR-0001](../adr/0001-frontend-architecture.md) §9.

## Jak přidělit roli

Nastavení → Zařízení a služby → HomeBrain → Konfigurovat → **Uživatelé a role**: vyberte
uživatele Home Assistantu (nabízí se jen aktivní ne-admin účty) a roli `Dospělý`, `Dítě`,
`Kiosk (kuchyňský tablet)` nebo `Host`; „Odebrat roli“ mapování smaže. Správci HA jsou vždy
`owner` a v nabídce nejsou. Kiosk účtu zapněte „Může se přihlásit pouze z místní sítě“.
Totéž umí admin-only WS `homebrain/roles/set` / `homebrain/roles/get`.

## Matice role × panel

`R` = čtení, `W` = povolené zápisy, `–` = panel ukáže klidný stav **„Nemáte přístup“**
a WS příkazy vrací `unauthorized`.

| panel | admin (owner) | adult | child | kiosk | bez role (guest) |
| --- | --- | --- | --- | --- | --- |
| Dnes | R/W | R | R | R (kiosk layout) | – |
| Počasí | R | R | R | R | – |
| Odpady | R + datový horizont | R (bez horizontu) | R | R | – |
| Rodina | R/W + nastavení | R/W (schvalování, nákup) | R, vlastní povinnosti, nákup | R, nákup | – |
| Energie | R/W (faktury: nahrání, úprava, mazání) | R (vč. srovnání a faktur ke čtení) | – | R (souhrn) | – |
| Recepty | R/W | R + vaření | R + vaření (bez fritézy) | R + vaření | – |
| Síť | R/W | souhrn + QR hostů | QR hostů | souhrn + QR hostů | – |
| Nastavení, Vinotéka, Zdraví, Roboti, Přístup | R/W | – (panel jen pro adminy) | – | – | – |

Panely Dnes, Počasí, Odpady, Rodina, Energie, Recepty a Síť mají v `panels.json`
`require_admin: false`; ostatní zůstávají `require_admin: true`. Skrytí panelu je jen UX —
autorizaci dělá každý WS příkaz podle `roles.role_ws_commands(role)` (allowlist).

## Co zůstává jen pro admina

- `homebrain/bindings/set`, `homebrain/roles/get|set`, `homebrain/family/settings/*`
  a všechna nastavení modulů (options flow, panel Nastavení).
- Energie: nahrání/úprava/smazání faktur (`invoices/save|delete`, HTTP upload), tarif a vazby.
- Odpady: datový horizont kalendáře („Co s tím“) — ne-admin dostane `horizon: null`.
- Vinotéka, Zdraví, Roboti, Přístup: celé.

## Testy

- `tests/python/test_nonadmin_panels.py` — příznaky `panels.json` a explicitní matice
  admin/adult/child/kiosk/unmapped × každý WS příkaz otevřených panelů.
- `tests/python/test_kiosk_panel.py` — každý `homebrain/*` příkaz musí být v matici.
- `tests/python/test_config_flow.py` — krok „Uživatelé a role“.
- `apps/panel/src/App.test.tsx`, `tests/e2e/nonadmin.spec.ts` — „Nemáte přístup“ a viditelnost
  (dev mock `?session=adult|child|kiosk|guest`).

## Známá omezení

- Role chrání jen data za WS `homebrain/*`; ne-admin HA uživatel čte stavy entit přímo přes HA
  (ADR-0002 T1). `homebrain/bindings/get` zatím vrací vazby všech modulů každé namapované roli.

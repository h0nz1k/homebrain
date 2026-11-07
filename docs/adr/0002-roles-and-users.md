# ADR-002 — Role a uživatelé v HomeBrainu

- **Stav:** Přijato (Accepted) 2026-10-31 — rozhodnutí vlastníka v issue #11 / PR #45; otevřené body viz §7
- **Datum:** 2026-10-31 (návrh i přijetí)
- **Navazuje na:** [ADR-0001](./0001-frontend-architecture.md) §4.4, §5.8, §8; [requirements/family.md](../requirements/family.md) FAM-007, FAM-009, FAM-017

## 1. Kontext

### 1.1 Výchozí stav (anonymizované předpoklady)

- Typická instalace má jednoho správce (owner, admin) a případně ne-admin servisní účty pro read-only nástroje. Další členové domácnosti ani nástěnný tablet zatím nemusí mít vlastní HA účet.
- Nástěnný tablet běží v kiosk prohlížeči; bez dedikovaného uživatele je přihlášen pod některým stávajícím účtem (v nejhorším případě admin).
- Integrace `homebrain` dnes registruje panel s `require_admin: true`; WS `homebrain/bindings/set` má `@websocket_api.require_admin`, `homebrain/bindings/get` vrací všechny bindingy **každému přihlášenému uživateli**.

### 1.2 Fakta o oprávněních HA, na kterých rozhodnutí stojí

1. HA rozlišuje fakticky jen **admin** a **ne-admin** (skupiny `system-admin` / `system-users`). Ne-admin má přes HA WebSocket plný přístup ke stavům entit a může volat služby; jemnější politiky (např. read-only skupina) nejsou v UI a HomeBrain na jejich vynucování napříč službami nespoléhá.
2. `require_admin` u panelu **jen skrývá panel** v sidebaru a routu ve frontendu. Neomezuje WebSocket příkazy ani statické soubory panelu.
3. Statické soubory panelu (`/homebrain_static/...`) jsou servírované bez autorizace → bundle nesmí obsahovat tajemství ani PII (to platí už dnes, README X-001).
4. Každý WS příkaz integrace dostává `connection.user` (id, `is_admin`, `is_owner`) — to je jediné spolehlivé místo pro vynucení role.
5. HA umí u uživatele volbu „přihlášení jen z lokální sítě“ (`local_only`) — vhodné pro kiosk bez MFA.

**Důsledek:** role HomeBrainu mohou **chránit jen data a akce, které jdou přes WS `homebrain/*`** (HomeBrain store: vinotéka, rodina, prefs, bindings, nastavení). Pro data z běžných HA entit (počasí, energie, přítomnost) je skrytí modulu jen UX, ne bezpečnostní hranice.

## 2. Zvažované varianty

### R1 — Jen HA admin / ne-admin (bez vlastních rolí)

- (+) Nulová konfigurace, žádný kód navíc.
- (−) Nerozliší kiosk, dítě a hosta; tablet by buď viděl vše, nebo by musel být admin (nepřijatelné).

### R2 — Role HomeBrainu mapované v options (ADR-0001 §4.4) — *přijato*

- Enum `owner | adult | child | guest | kiosk`; mapování HA `user_id → role` v options integrace (ne v Gitu); vynucení v každém `homebrain/*` WS příkazu; frontend dostane `role` + `visible_modules` z `homebrain/session/get` a jen skrývá.
- (+) Pokrývá kiosk i děti, zůstává v HA session (žádné vlastní loginy, žádné LLAT).
- (−) Nutná disciplína: každý nový WS příkaz musí deklarovat povolené role (test matrix).

### R3 — Využít HA skupiny/politiky nebo oddělené dashboardy per role

- (−) Politiky entit nejsou v HA veřejně konfigurovatelné ani garantované; oddělené dashboardy duplikují UI a obcházejí HomeBrain. Zamítnuto.

### Varianty registrace panelu

| varianta | popis | + | − |
| --- | --- | --- | --- |
| **P1** | 1 panel, `require_admin: true` (dnešní stav) | bezpečné, jednoduché | ne-admini HomeBrain nevidí |
| **P2** | 1 panel, `require_admin` řízené volbou v options (výchozí `true`); Nastavení uvnitř panelu za WS `require_admin` + rolí | jedna URL pro všechny, role řeší server | chyba v role-checku = únik HomeBrain dat |
| **P3** | 2 panely: `homebrain` (ne-admin) + `homebrain-admin` (`require_admin: true`, jen Nastavení/diagnostika) | i frontend routa Nastavení je admin-only | dvě položky v sidebaru, dva bundly/entry pointy |

## 3. Rozhodnutí (přijato 2026-10-31)

1. **R2 + P1 → P2.** Fáze 0–3: panel zůstává `require_admin: true` (P1). Od Fáze 4 (nebo dřív na pokyn vlastníka) volba `panel_require_admin` v options přepne na P2. Preview panel zůstává vždy `require_admin: true`. P3 je záloha, pokud review ukáže, že Nastavení v ne-admin bundlu je problém.
2. **Odvození role (server, při každém WS volání):**
   - HA `is_admin` ⇒ efektivní role `owner` (admin může options změnit tak jako tak; adminy nelze „snížit“).
   - Ne-admin s mapováním ⇒ namapovaná role (`adult | child | kiosk | guest`).
   - Ne-admin bez mapování nebo neznámý `user_id` ⇒ **`guest` (default deny)**. Sem spadá i dnešní servisní účet agentů.
   - `kiosk` lze přiřadit jen ne-adminovi; options flow upozorní, pokud uživatel nemá `local_only`.
3. **Role-check jako dekorátor** `@require_role(...)` nad každým `homebrain/*` příkazem; chybějící deklarace = test failuje. Konfigurace (bindings, role, moduly, kiosk profily) dál `@websocket_api.require_admin`.
4. **`homebrain/bindings/get` filtrovat** na moduly viditelné pro roli volajícího (dnes vrací vše).
5. **`?kiosk=1` je jen layout.** Kiosk role vynutí kiosk layout; URL parametr nikdy práva nepřidává.
6. **Model rolí `owner | adult | child | guest | kiosk` schválen vlastníkem (2026-10-31).** Implementace v MVP: `owner`, `adult`, `kiosk`, `guest`; `child` je v enumu od začátku a řídí se maticí §3.1 (Rodina bez detailů, školní události a povinnosti viditelné).
7. **Nástěnný tablet (rozhodnutí 2026-10-31):** tablet zůstává na **stávajícím kiosk prohlížeči**; dedikovaný HA uživatel se v MVP nezakládá. Role `kiosk` se v options mapuje na **toho HA uživatele, pod kterým je kiosk prohlížeč přihlášen**.
   - **Riziko, pokud je to účet vlastníka / admin:** podle bodu 2 je admin vždy `owner` a nelze ho snížit na `kiosk` → tablet uvidí vše včetně Nastavení, bindingů a admin částí HA; `?kiosk=1` změní jen layout (T4), nikoli práva. Fyzický přístup k tabletu = admin přístup k HA (T1, T5); session admina nelze omezit `local_only` bez dopadu na vzdálený přístup vlastníka.
   - **Riziko, pokud je to ne-admin servisní účet:** role `kiosk` by se sdílela s agentní inventurou (audit T9 nerozliší tablet od agenta); mapování na `kiosk` by servisnímu účtu přidalo čtení Dnes/Rodina.
   - **Doporučení (later, před přepnutím na P2 nebo nejpozději ve Fázi 4):** dedikovaný ne-admin HA uživatel pro tablet s `local_only`, namapovaný na `kiosk`; options flow do té doby zobrazí varování, pokud je kiosk prohlížeč přihlášen jako admin (zjistitelné z `homebrain/session/get` + kiosk layout).
8. **Plán nasazení tabletu (schváleno vlastníkem 2026-11-01, implementováno v #63):** dedikovaný ne-admin HA uživatel pro tablet + **samostatný panel `/homebrain-kiosk`** (`require_admin: false`, `config.kiosk: true`, vždy jen Dnes v kiosk layoutu). Hlavní panel `/homebrain` zůstává `require_admin: true`.
   - Ne-admin smí volat jen `roles.KIOSK_WS_COMMANDS`: `homebrain/session/get` (každý přihlášený), `homebrain/bindings/get`, `homebrain/weather/get` a `homebrain/energy/pv_forecast` (jen s namapovanou rolí); všechny ostatní `homebrain/*` jsou admin-only. Matici hlídá `tests/python/test_kiosk_panel.py` (nový příkaz bez zařazení = test failuje).
   - Mapování rolí: admin-only WS `homebrain/roles/set` `{user_id, role: kiosk|adult|child|guest|null}` a `homebrain/roles/get`; uloženo v options `roles: {user_id: role}`.

### 3.1 Výchozí matice viditelnosti modulů

`R` = čtení, `W` = zápis přes allowlist, `–` = skryto + WS `unauthorized`. Přepisovatelné v options (`module_visibility`), výchozí hodnoty v kódu.

| modul | owner | adult | child | kiosk | guest |
| --- | --- | --- | --- | --- | --- |
| Dnes | R/W | R/W | R | R | – |
| Počasí | R | R | R | R | – |
| Energie | R/W | R | – | R (souhrn) | – |
| Odpady | R | R | R | R | – |
| Zdraví | R/W (vlastní) | R/W (vlastní) | – | – | – |
| Vinotéka | R/W | R/W | – | – | – |
| Rodina | R/W | R/W | R (bez detailů) | R (bez detailů) | – |
| Nastavení | R/W | – | – | – | – |
| Diagnostika/verze | R | R | – | – | R (jen verze) |

Zdraví je **per osoba** (data vázaná na `user_id`); ani `owner` nevidí cizí zdravotní data bez explicitní volby — potvrdí vlastník.

## 4. Bezpečnostní poznámky (threat notes)

| # | hrozba | dopad | mitigace |
| --- | --- | --- | --- |
| T1 | Ne-admin (včetně kiosku) obejde HomeBrain a čte stavy / volá služby přímo přes HA WS nebo jiné HA panely | role nechrání HA entity | kiosk jen důvěryhodné zařízení; `local_only`; kiosk prohlížeč s uzamčenou URL a skrytým sidebarem; citlivá data jen v HomeBrain store za role-checkem |
| T2 | `require_admin` panelu mylně považováno za autorizaci WS | únik HomeBrain dat ne-adminům | dekorátor rolí u každého příkazu; pytest matice role × příkaz (AC #11) |
| T3 | Veřejné statické soubory panelu | únik obsahu bundlu | žádné PII/konfigurace v bundlu; vše přes WS po přihlášení |
| T4 | Podvržení `?kiosk=1` nebo role v klientu | eskalace v UI | role jen ze serveru (`homebrain/session/get`); klient ji nikdy neposílá |
| T5 | Krádež / fyzický přístup k tabletu | trvalá session účtu kiosk prohlížeče — **při admin účtu plný admin přístup** (§3 bod 7) | `local_only`, žádný vzdálený přístup pro kiosk, postup revokace refresh tokenu v runbooku, žádné zápisy kromě allowlistu |
| T6 | Budoucí Ingress app (ADR-0001 varianta A) věří hlavičkám `X-Remote-User-*` | podvržená identita | přijímat jen ze Supervisor ingress proxy, neexponovat port; stejný role-check na serveru |
| T7 | Agentní / vývojářské add-ony s vlastním API klíčem a admin právy | obchází vše | mimo scope HomeBrainu; HomeBrain na ně nespoléhá, diagnostika bez PII; agent pro inventuru = ne-admin účet s rolí `guest` |
| T8 | Zastaralé mapování (smazaný uživatel, nový člen) | chybná role | neznámý `user_id` ⇒ `guest`; Nastavení ukazuje osiřelá mapování |
| T9 | Audit zápisů | nelze dohledat autora | zápisy nesou HA kontext uživatele; HomeBrain store loguje `user_id` (vinotéka, rodina) |

## 5. Důsledky

- (+) Jedna auth cesta (HA session), role vynucené na serveru, kiosk bez admin práv.
- (+) Default deny chrání před zapomenutými účty (včetně servisního).
- (−) Nutné poctivě komunikovat, že skrytí modulu s HA entitami není bezpečnostní hranice (T1).
- (−) Každý WS příkaz nese deklaraci rolí — drobná režie, kompenzovaná testem.

## 6. Implementační kroky (issue #11)

1. `const.ROLES`, `options.roles: {user_id: role}`, `options.module_visibility` (+ výchozí matice v kódu).
2. `homebrain/session/get` → `{role, visible_modules, is_admin}`; `@require_role` dekorátor.
3. Filtrace `homebrain/bindings/get` per role.
4. Options flow: výběr HA uživatele → role; varování u `kiosk` bez `local_only` a u kiosk layoutu běžícího pod admin účtem (§3 bod 7).
5. Volba `panel_require_admin` (výchozí `true`) — přepnutí až Fáze 4.
6. Testy: matice role × WS příkaz; e2e (seed uživatelé admin/adult/kiosk): kiosk nevidí Nastavení.

## 7. Rozhodnutí vlastníka a otevřené body

**Rozhodnuto 2026-10-31:**

1. R2 (role HomeBrainu v options) a postup P1 → P2 — přijato.
2. Model rolí `owner | adult | child | guest | kiosk` — přijato; `child` je součástí modelu od začátku.
3. Kiosk: tablet zůstává na stávajícím kiosk prohlížeči, bez dedikovaného HA uživatele v MVP (§3 bod 7, včetně rizika admin účtu).
4. Servisní účet agentů bez mapování → `guest` (plyne z default deny).
5. Model domácnosti: domácnost s dětmi — role `owner` (admin), `adult`, `child`; v repu jen role ([family.md](../requirements/family.md) D6). Ne každý člen musí mít HA účet; přítomnost bez Companion app = „neznámo“.

**Zbývá (owner, PR #45 / issue #11):**

1. Kdy přepnout panel pro ne-adminy (P1 → P2) — doporučeno spolu s dedikovaným kiosk uživatelem.
2. Detaily matice §3.1 — Energie pro `child`/`kiosk`, Zdraví per osoba (zatím platí výchozí hodnoty z matice).

## 8. Stav po rc.36 (Fáze 4 — ne-admin panely)

- Místo jednoho přepínače `panel_require_admin` (P2) má každý modul vlastní panel (ADR-0003);
  `require_admin: false` mají Dnes, Počasí, Odpady, Rodina, Energie, Recepty a Síť.
  Nastavení, Vinotéka, Zdraví, Roboti a Přístup zůstávají jen pro adminy.
- `homebrain/waste/history` je pro každou namapovanou roli; datový horizont jen pro admina.
- Panel ukáže ne-adminovi mimo jeho `visible_modules` (a uživateli bez role) klidný stav
  „Nemáte přístup“ a modul vůbec nenačte.
- Options flow má krok **Uživatelé a role** (§6 bod 4); varování u kiosku bez `local_only`
  je zatím jen v popisu kroku.
- Matice a testy: [docs/modules/roles.md](../modules/roles.md).

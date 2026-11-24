# Agenti

Admin panel přehledu AI agentů v domácí síti (kvóty, služby, fronta). Čte jen stavy HA entit;
žádná volání služeb. Vzor: Síť / Server.

## Vazba a nastavení

| Klíč | Kde | Povinné | Doména |
| --- | --- | --- | --- |
| `agents_status` | `bindings.agents` | ano (bez něj EmptyState) | `sensor` |
| `monitor_url` | options `agents.monitor_url` | ne | URL `http(s)://…` |

Z `agents_status` = `sensor.<prefix>_stav` se odvodí `<prefix>`. Ostatní entity jsou sourozenci
se stejnou předponou (objev podle přípony, ne pevný seznam). V Gitu a mocku jen syntetický
prefix `agenti_demo` — skutečný prefix ani `entity_id` domácnosti do repa nepatří.
Bez `monitor_url` panel odkaz do AgentsMonitoringu nezobrazí (v mocku `https://monitor.example`).

Options flow: Nastavení → HomeBrain → Konfigurovat → **Agenti – monitoring**.

## Kontrakt entit (atributy česky)

Syntetický příklad: `sensor.agenti_demo_stav`. Všechny sourozence kromě statusu jsou **volitelné**;
`unavailable` / `unknown` → sekce „nedostupné“, zbytek panelu běží dál.

| Entita | State | Atributy |
| --- | --- | --- |
| `sensor.<p>_stav` | `ok` \| `attention` \| `critical` | `critical_count`, `attention_count`, `overall` (surový, verdikt ignoruje), `stale` (bool, fallback stáří dat) |
| `binary_sensor.<p>_data_aktualni` | `on` / `off` | —; při `off` stáří = `last_changed` |
| `sensor.<p>_kvota_<id>_zbyva` (0..N) | % zbývá | `provider`, `okno`, `used_pct`, `reset_at` (ISO UTC \| null), `exhausted`, `will_exhaust_before_reset` |
| `binary_sensor.<p>_kvota_dojde_pred_resetem` | `on` / `off` | `kvoty` [str] |
| `sensor.<p>_agenti_aktivni` | počet | `celkem`, `agenti` [{`name`, `model_label`, `alive`, `waiting`}] |
| `sensor.<p>_agenti_cekaji` | počet | `kdo` [str] |
| `binary_sensor.<p>_sluzba_<id>` (0..N) | `on` / `off` (connectivity) | `stav` (operational/degraded/down), `sla_24h` (%), `friendly_name` („Agenti – …“ → odřízne společnou předponu) |
| `sensor.<p>_fronta_pending\|running\|blocked\|review` | počet | — |
| `sensor.<p>_posledni_upozorneni` | timestamp | volitelné |

`provider` formát: „Název · podtitulek“ (část před „ · “ = jméno řádku, za ní = šedý podtitulek).
Neplnit plán/účet natvrdo v kódu — bere se z atributu.

## Pravidla (rules.py)

- **Kvóta:** `critical` při `exhausted` nebo zbývá &lt; 10 %; `warning` při &lt; 25 % nebo
  `will_exhaust_before_reset`; jinak `ok`.
- **Služba:** down → `critical`; SLA &lt; 95 % nebo `degraded` → `warning`.
- **Data neaktuální** → položka v „K řešení“ + hero subline amber (ne červená); celkový stav
  nepřebíjí, pokud senzor stav má.
- **Celkový stav (verdikt `level`, hero `data-agents-state`)** =
  stav senzoru monitoringu (`status.level`): `ok` → ok, `attention` → warning,
  `critical` → critical. AgentsMonitoring je zdroj pravdy. Položky (kvóty, služby, data)
  se dál hodnotí a zvýrazňují samostatně, ale **nezvyšují ani nesnižují** celkový stav.
- **Fallback:** když stav senzoru chybí / `unknown` / `unavailable`, verdikt = dosavadní
  výpočet z položek (nejhorší důvod), nebo `ok` při zdravé kvótě, jinak `unknown`.
- **Okno (`okno`):** lokalizace „5 h“, „7 dní“, „týden“, „měsíc“, „kredit“; neznámé → surový text.
- Obnova v UI: lidsky v `Europe/Prague` („dnes 20:59“, „zítra 6:09“, „čt 26. 11. 17:03“, „1. 12.“).

## Layout přehledu (1–6)

Žádné zdvojení: problém textově jen v **K řešení**; hero jen počty; kvóty/služby jen hodnoty.

1. **Stav – jedna věta.** Tečka + titulek ze stavu senzoru
   („Vše v pořádku“ / „Běží vše · N věcí k řešení“ / „Kritické · N věcí k řešení“).
   Pod tím šedý řádek: „N agentů a M služeb v provozu · fronta X běží, Y čeká · data před Z min“.
   Žádné seznamy důvodů ani pilulky v hero.
2. **Karta „K řešení“** = jediné místo výpisu problémů. Každý problém právě jednou
   (dedup: vyčerpaná kvóta + `exhaust_forecast` = jedna položka). Štítek naléhavosti + titulek
   + druhý řádek (čas / další krok). Řazení: critical → warning, v úrovni nejbližší čas dřív.
   Pravá hlavička „seřazeno podle naléhavosti“. **Prázdná karta se nevykresluje.**
   Zdroj: vyčerpané / `will_exhaust_before_reset` kvóty + `exhaust_forecast` + `queue.blocked`
   + data stale + agenti neběžící/čekající + služby down/degraded.
   Mere nízké % kvóty a provozní služby se SLA &lt; 99 % zůstávají jen na kartách Kvóty/Služby
   (hodnoty), do „K řešení“ se neopakují.
3. **Kvóty – jeden řádek na poskytovatele** (seskupení podle `provider` před „ · “).
   Vlevo krátké okno, vpravo dlouhé; max 2 sloty. Barva jen při nízké/vyčerpané hodnotě,
   jinak neutrální. Poskytovatel s jedním oknem: druhý slot „–“.
   **Okrajové kvóty** se sbalí do jednoho `details` („+ …“):
   - okno typu kredit,
   - vedlejší model téhož poskytovatele (delší jméno s prefixem primárního, např. „Claude Fable“ → Claude),
   - nadbytečná krátká okna, když má poskytovatel víc modelových rodin (viditelné dlouhé sloty).
   Nízká/vyčerpaná kvóta se **nikdy** neschová (povýší se do viditelného slotu).
4. **Agenti a Služby** (≥ ~700 px vedle sebe, mobil pod sebou). Při normálu jen hlavička
   s počtem + sbalený `details`. Při problému (agent neběží/čeká, služba down/degraded)
   se detail rozbalí sám. Služby: viditelné jen pod ideálem (SLA 24 h &lt; 99 % nebo stav ≠
   operational); ostatní sbalené „+ N služby nad 99 %“. Label služby neutrální, barvu nese hodnota.
5. **Fronta úloh** – jeden řádek čísel („3 běží · 6 čeká · 1 ke kontrole · 1 blokováno“);
   blokováno &gt; 0 → amber. Žádné velké dlaždice.
6. **Patička** – „Aktualizováno HH:MM“ vlevo, vpravo „Detail v AgentsMonitoringu ↗“
   (`monitor_url`; bez URL tlačítko skryté). Žádný jiný odkaz na monitoring.

## API

WS `homebrain/agents/get` (admin only) → snapshot `{configured, status, data, quotas,
exhaust_forecast, agents, services, queue, monitor_url, last_alert, verdict, updated_at}`.

Frontend: `modules/agents`, mock `?agents=ok|warn|crit|real|stale|unconfigured|unavailable`.
- `ok` – vše v pořádku (K řešení skrytá, agenti/služby sbalené).
- `warn` – senzor `attention` + vyčerpaná kvóta (rozpor: celkový stav upozornění, kvóta critical).
- `crit` – služba down + agent neběží → kritické, auto-rozbalení.
- `real` – syntetická kopie *struktury* schváleného UX návrhu (anonymizované názvy).
- `stale` – data neaktuální.

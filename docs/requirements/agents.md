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

## Pravidla (rules.py)

- **Kvóta:** `critical` při `exhausted` nebo zbývá &lt; 10 %; `warning` při &lt; 25 % nebo
  `will_exhaust_before_reset`; jinak `ok`.
- **Služba:** down → `critical`; SLA &lt; 95 % nebo `degraded` → `warning`.
- **Data neaktuální** → hero upozornění „Data nejsou aktuální“; celkový stav nepřebíjí,
  pokud senzor stav má.
- **Celkový stav (verdikt `level`, hero badge/headline/`data-agents-state`)** =
  stav senzoru monitoringu (`status.level`): `ok` → ok, `attention` → warning,
  `critical` → critical. AgentsMonitoring je zdroj pravdy. Položky (kvóty, služby, data)
  se dál hodnotí a zvýrazňují samostatně a smí být v seznamu důvodů (critical první),
  ale **nezvyšují ani nesnižují** celkový stav.
- **Fallback:** když stav senzoru chybí / `unknown` / `unavailable`, verdikt = dosavadní
  výpočet z položek (nejhorší důvod), nebo `ok` při zdravé kvótě, jinak `unknown`.
- **Okno (`okno`):** lokalizace „5 h“, „7 dní“, „týden“, „měsíc“, „kredit“; neznámé → surový text.
- Reset v UI: odpočet + čas v `Europe/Prague`.

## API

WS `homebrain/agents/get` (admin only) → snapshot `{configured, status, data, quotas,
exhaust_forecast, agents, services, queue, monitor_url, last_alert, verdict, updated_at}`.

Frontend: `modules/agents`, mock `?agents=ok|warn|crit|unconfigured|unavailable`.
Scénář `warn` = senzor `attention` + vyčerpaná kvóta (rozpor: celkový stav upozornění,
kvóta critical).

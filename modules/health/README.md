# Modul Zdraví (`@homebrain/module-health`)

- Fáze: 3 · ADR-0001 §5.5 · požadavky `docs/requirements/health.md`
- **Read-only** přehled nad integrací `health_fitness` v0.7.0 (samostatné repo, HACS). HomeBrain nic
  nezapisuje, nevolá `consume_flex_meal_token` ani reconcile, neimplementuje webhook (HEA-008).

## Vazby (logické klíče → entity v options integrace HomeBrain, nikdy v Gitu)

| klíč | entita integrace `health_fitness` | povinný |
| --- | --- | --- |
| `health_source_status` | sensor `calistree_source_status` | ano* |
| `health_weekly_strength_progress` | sensor `weekly_strength_sessions` (atributy `target`, `period_*`) | ano* |
| `health_xp_total` | sensor `xp_total` | ano* |
| `health_last_success` | sensor `calistree_last_success` | ne |
| `health_weekly_goal_met` | binary_sensor `weekly_strength_goal_met` | ne |
| `health_weekly_workout_duration` | sensor `weekly_workout_duration` | ne |
| `health_streak_weeks` | sensor `strength_streak_weeks` | ne |
| `health_xp_level`, `health_xp_level_progress` | sensor `xp_level`, `xp_level_progress` | ne |
| `health_last_workout`, `health_last_workout_duration` | sensor `last_workout_at`, `last_workout_duration` | ne |
| `health_milestone_0500` … `_10000` | binary_sensor `milestone_xp_total_*_v1` | ne |
| `health_flex_meal_token` | binary_sensor `flex_meal_token_available` | ne |
| `health_next_step` | textový senzor (v0.7.0 zatím nemá) | ne |
| `health_weight_trend` | senzor hmotnosti v kg (recorder statistiky → trend) | ne |
| `health_sleep_last` | senzor délky spánku (s/min/h) | ne |

\* Integrace se považuje za přítomnou, když existuje aspoň jedna z hlavních entit; jinak empty
state s návodem na instalaci (HEA-001).

## Pravidla

- Chybějící / nedostupná / neplatná hodnota = `–` s důvodem, nikdy nula. Prázdná instalace (F-001)
  ukazuje XP a streak jako „Zatím bez historie“.
- Hero „další krok“ je deterministický z týdenních faktů integrace (zbývající tréninky × dny do
  konce týdne); spánek ho nikdy neovlivňuje (HEA-010), formulace nejsou diagnostické (HEA-012).
- Trend hmotnosti: WS `recorder/statistics_during_period` (denní `mean`, 30 dní), jen pro přehled.
- Signály Dnes (`healthSignals`, formát `@homebrain/signals`): silové minimum v ohrožení pozdě
  v týdnu a ohrožený streak. **Jen pro publikum `owner`** – kiosk, host, dítě i jiný dospělý dostanou
  prázdný seznam (ADR-0002: zdraví je per osoba). Zastaralá nebo prázdná data jsou tichá.
- Na kiosku (`?kiosk=1`, `/kiosk/…`) obrazovka místo dat ukáže jen informaci o soukromí.

## Dev / testy

- Mock: `pnpm dev` → `/health?health=<week|met|empty|missing|partial|stale|unavailable|error|risk|unverified>`.
- Vitest: `adapter.test.ts` (F-001–F-011), `signals.test.ts`, `views/HealthView.test.tsx`;
  Playwright `tests/e2e/health.spec.ts`.

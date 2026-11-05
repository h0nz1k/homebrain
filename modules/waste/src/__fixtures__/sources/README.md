# Syntetické zdroje adaptéru (Refs #41)

Anonymizované tvary entit pro `adaptWasteEntities`; žádná skutečná `entity_id`, obce ani adresy.

- `type-state-sensor.json` – senzor waste_collection_schedule: stav = typ, termíny jako atributy `YYYY-MM-DD` → typ.
- `date-state-sensor.json` – původní formát: stav = datum, atribut `waste_type`.
- `calendar-subscribe.json` – událost WS `calendar/event/subscribe` (start řetězec + `all_day`, ověřeno na lokálním HA 2026.10.4 s `local_calendar`).
- `calendar-get-events.json` – odpověď `calendar.get_events` (`return_response`, start jako řetězec).

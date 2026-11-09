"""Topení (Tecomat Foxtrot heat pump), read-only phase 0.

* ``client`` – generic WebMaker XML client (login/poll/relogin/logout, windows-1250).
* ``mapfile`` – the private variable map (``/config/homebrain/heating_map.yaml``).
* ``model`` – pure: raw PLC values → contract payload, activity, day counters, seasons.
* ``poller`` – background polling, backoff, repair issues, persisted day counters.
* ``entities`` – sensor/binary_sensor per mapped key (long-term statistics for free).
* ``ws`` – ``homebrain/heating/*`` WebSocket commands.

Nothing here ever writes to the PLC: the login form is the only POST.
"""

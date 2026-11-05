# ADR 0003: Module Panels Split

## Status
Accepted

## Context
The HomeBrain panel currently operates as a single internal router using iframe `pushState`. This breaks the Android 'Back' button, as HA doesn't know about internal navigation.

## Decision
We split the internal monolithic panel into independent HA sidebar panels for each module.
- Panels: `homebrain-dnes` (Dnes), `homebrain-pocasi` (Počasí), `homebrain-energie` (Energie), `homebrain-odpady` (Odpady), `homebrain-vinoteka` (Vinotéka), `homebrain-zdravi` (Zdraví). All require_admin=true, share the JS module, and pass `config={'module': id}`.
- A hidden admin panel `homebrain-nastaveni` handles settings and family.
- The legacy `homebrain` panel is hidden and acts as a redirect to `/homebrain-dnes`.
- The `/homebrain-kiosk` panel remains unchanged.
- Navigation uses HA (top-window history + `location-changed` event, or plain links), never `pushState` on the iframe window.
- The frontend will rely on `panel.config.module` to render the correct view.

## Consequences
- Android Back button will work as expected (HA tracks the routes).
- Sidebar entries are native to HA.
- Easier deep linking.

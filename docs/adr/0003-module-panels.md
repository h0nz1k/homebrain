# ADR 0003: Module Panels Split

## Status
Accepted

## Context
The HomeBrain panel currently operates as a single internal router using iframe `pushState`. This breaks the Android 'Back' button, as HA doesn't know about internal navigation.

## Decision
We split the internal monolithic panel into independent HA sidebar panels for each module.
- Panels: `homebrain-dnes` (Dnes), `homebrain-pocasi` (Počasí), `homebrain-energie` (Energie), `homebrain-odpady` (Odpady), `homebrain-vinoteka` (Vinotéka), `homebrain-zdravi` (Zdraví). All require_admin=true, share the JS module, and pass `config={'module': id}`.
- A hidden admin panel `homebrain-nastaveni` handles settings and family.
- Later panels: `homebrain-pristup` (Přístup, admin) and `homebrain-recepty` (Recepty, also the kitchen tablet). The url paths have ONE source, `custom_components/homebrain/panels.json`: `const.py` reads it and `scripts/gen-panels.mjs` generates `packages/ha-client/src/panels.generated.ts` (a vitest contract fails when stale or when a frontend module has no panel). A module missing there makes its links unknown to HA's router, which falls back to the default dashboard. The dev harness only knows these panels too and shows `ha-default-dashboard` for any other url.
- The legacy `homebrain` panel is hidden and acts as a redirect to `/homebrain-dnes`.
- The `/homebrain-kiosk` panel remains unchanged.
- Navigation uses HA (top-window history + `location-changed` event, or plain links), never `pushState` on the iframe window.
- The frontend will rely on `panel.config.module` to render the correct view.

## Consequences
- Android Back button will work as expected (HA tracks the routes).
- Sidebar entries are native to HA.
- Easier deep linking.
